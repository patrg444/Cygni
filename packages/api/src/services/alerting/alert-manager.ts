import { PrismaClient } from "@prisma/client";
import metricsRegistry, { recordAlertEvaluation } from "../../lib/metrics";
import { AlertService } from "./alert.service";
import { AlertRule, AlertCondition } from "./types";
import { defaultAlertRules } from "./alert-rules";
import logger from "../../lib/logger";

interface MetricValue {
  metric: string;
  value: number;
  labels: Record<string, string>;
  timestamp: Date;
}

export class AlertManager {
  private prisma: PrismaClient;
  private alertService: AlertService;
  private evaluationInterval: NodeJS.Timer | null = null;
  private ruleStates: Map<string, RuleState> = new Map();
  private isRunning = false;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.alertService = new AlertService(prisma);
  }

  start(intervalSeconds = 30): void {
    if (this.isRunning) {
      logger.warn("Alert manager is already running");
      return;
    }

    this.isRunning = true;
    logger.info("Starting alert manager", { intervalSeconds });

    // Run evaluation immediately
    this.evaluateRules();

    // Then run on interval
    this.evaluationInterval = setInterval(() => {
      this.evaluateRules();
    }, intervalSeconds * 1000);
  }

  stop(): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = null;
    }
    this.isRunning = false;
    logger.info("Alert manager stopped");
  }

  private async evaluateRules(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Get all enabled rules
      const rules = defaultAlertRules.filter(rule => rule.enabled);
      
      for (const rule of rules) {
        try {
          await this.evaluateRule(rule);
        } catch (error) {
          logger.error("Failed to evaluate alert rule", {
            ruleId: rule.id,
            error: error instanceof Error ? error.message : error,
          });
        }
      }

      logger.debug("Alert evaluation completed", {
        rulesEvaluated: rules.length,
        duration: Date.now() - startTime,
      });
    } catch (error) {
      logger.error("Alert evaluation failed", {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  private async evaluateRule(rule: AlertRule): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Get metric value from Prometheus metrics
      const metricValues = await this.getMetricValues(rule.metric);
      
      for (const metricValue of metricValues) {
      const isViolation = this.evaluateCondition(
        rule.condition,
        metricValue.value,
        metricValue.metric
      );

      const stateKey = this.getStateKey(rule.id, metricValue.labels);
      const state = this.ruleStates.get(stateKey) || this.createNewState(rule);

      if (isViolation) {
        state.violationCount++;
        state.lastViolation = new Date();
        
        // Check if violation has persisted for the required duration
        if (!state.alertFiring && this.hasViolationPersisted(state, rule.duration)) {
          // Fire alert
          const alert = await this.alertService.createAlert(
            rule,
            metricValue.value,
            metricValue.labels
          );
          state.alertFiring = true;
          state.alertFingerprint = alert.fingerprint;
        }
      } else {
        // Reset violation tracking
        state.violationCount = 0;
        
        // Resolve alert if it was firing
        if (state.alertFiring && state.alertFingerprint) {
          await this.alertService.resolveAlert(state.alertFingerprint);
          state.alertFiring = false;
          state.alertFingerprint = undefined;
        }
      }

      this.ruleStates.set(stateKey, state);
    }
    } finally {
      // Record evaluation duration
      recordAlertEvaluation(rule.id, Date.now() - startTime);
    }
  }

  private evaluateCondition(
    condition: AlertCondition,
    value: number,
    metric: string
  ): boolean {
    switch (condition.type) {
      case "threshold":
        return this.evaluateThreshold(condition, value);
      
      case "range":
        return value < condition.value || value > (condition.value2 || condition.value);
      
      case "rate":
        // For rate conditions, the value should already be a rate
        return this.evaluateThreshold(condition, value);
      
      case "absence":
        // For absence conditions, check if metric exists
        return value === 0 || isNaN(value);
      
      default:
        logger.warn("Unknown condition type", { type: condition.type });
        return false;
    }
  }

  private evaluateThreshold(condition: AlertCondition, value: number): boolean {
    switch (condition.operator) {
      case ">":
        return value > condition.value;
      case "<":
        return value < condition.value;
      case ">=":
        return value >= condition.value;
      case "<=":
        return value <= condition.value;
      case "==":
        return value === condition.value;
      case "!=":
        return value !== condition.value;
      default:
        return false;
    }
  }

  private async getMetricValues(metricName: string): Promise<MetricValue[]> {
    // Get metrics from Prometheus registry
    const metrics = await metricsRegistry.getMetricsAsJSON();
    const values: MetricValue[] = [];

    for (const metric of metrics) {
      if (metric.name === metricName) {
        // Handle different metric types
        if (metric.type === "counter" || metric.type === "gauge") {
          for (const value of metric.values || []) {
            values.push({
              metric: metricName,
              value: value.value,
              labels: value.labels || {},
              timestamp: new Date(value.timestamp || Date.now()),
            });
          }
        } else if (metric.type === "histogram" || metric.type === "summary") {
          // For histograms/summaries, use specific quantiles
          const quantileMetric = metric.values?.find(
            v => v.labels?.quantile === "0.95" || v.metricName?.includes("p95")
          );
          if (quantileMetric) {
            values.push({
              metric: metricName,
              value: quantileMetric.value,
              labels: quantileMetric.labels || {},
              timestamp: new Date(quantileMetric.timestamp || Date.now()),
            });
          }
        }
      }
    }

    // If no values found, add a zero value to trigger absence alerts
    if (values.length === 0) {
      values.push({
        metric: metricName,
        value: 0,
        labels: {},
        timestamp: new Date(),
      });
    }

    return values;
  }

  private hasViolationPersisted(state: RuleState, durationSeconds: number): boolean {
    if (!state.firstViolation) {
      state.firstViolation = new Date();
      return false;
    }

    const elapsed = Date.now() - state.firstViolation.getTime();
    return elapsed >= durationSeconds * 1000;
  }

  private getStateKey(ruleId: string, labels: Record<string, string>): string {
    const sortedLabels = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    return `${ruleId}:${sortedLabels}`;
  }

  private createNewState(rule: AlertRule): RuleState {
    return {
      ruleId: rule.id,
      violationCount: 0,
      alertFiring: false,
    };
  }

  // Public methods for managing alerts
  async getActiveAlerts() {
    return this.alertService.getActiveAlerts();
  }

  async acknowledgeAlert(alertId: string, userId?: string) {
    return this.alertService.acknowledgeAlert(alertId, userId);
  }

  async getAlertHistory(alertId: string) {
    return this.alertService.getAlertHistory(alertId);
  }

  // Test an alert rule without firing notifications
  async testRule(rule: AlertRule): Promise<{
    wouldFire: boolean;
    currentValue: number;
    threshold: number;
  }> {
    const metricValues = await this.getMetricValues(rule.metric);
    
    if (metricValues.length === 0) {
      return {
        wouldFire: rule.condition.type === "absence",
        currentValue: 0,
        threshold: rule.condition.value,
      };
    }

    const latestValue = metricValues[0];
    const wouldFire = this.evaluateCondition(
      rule.condition,
      latestValue.value,
      latestValue.metric
    );

    return {
      wouldFire,
      currentValue: latestValue.value,
      threshold: rule.condition.value,
    };
  }
}

interface RuleState {
  ruleId: string;
  violationCount: number;
  firstViolation?: Date;
  lastViolation?: Date;
  alertFiring: boolean;
  alertFingerprint?: string;
}