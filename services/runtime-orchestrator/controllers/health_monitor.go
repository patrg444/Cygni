package controllers

import (
	"context"
	"fmt"
	"time"

	"github.com/go-logr/logr"
	promv1 "github.com/prometheus/client_golang/api/prometheus/v1"
	"github.com/prometheus/common/model"
	cloudxv1 "github.com/cygni/runtime-orchestrator/api/v1"
)

type HealthMonitor struct {
	promAPI promv1.API
	log     logr.Logger
}

type HealthMetrics struct {
	ErrorRate    float64
	SuccessRate  float64
	P95Latency   float64
	RequestCount int64
}

func NewHealthMonitor(promAPI promv1.API, log logr.Logger) *HealthMonitor {
	return &HealthMonitor{
		promAPI: promAPI,
		log:     log,
	}
}

// EvaluateHealth checks if a service meets health gate criteria
func (h *HealthMonitor) EvaluateHealth(ctx context.Context, cxs *cloudxv1.CloudExpressService) (bool, string, error) {
	if cxs.Spec.HealthGate == nil || !cxs.Spec.HealthGate.Enabled {
		return true, "health gate disabled", nil
	}

	// Default window to 60 seconds if not specified
	window := time.Duration(60) * time.Second
	if cxs.Spec.HealthGate.Window > 0 {
		window = time.Duration(cxs.Spec.HealthGate.Window) * time.Second
	}

	metrics, err := h.getMetrics(ctx, cxs, window)
	if err != nil {
		h.log.Error(err, "Failed to get metrics", "service", cxs.Name)
		// If we can't get metrics, we should be cautious but not block
		return true, "metrics unavailable", nil
	}

	// Check error rate
	if cxs.Spec.HealthGate.MaxErrorRate > 0 && metrics.ErrorRate > cxs.Spec.HealthGate.MaxErrorRate {
		return false, fmt.Sprintf("error rate %.2f%% exceeds threshold %.2f%%", 
			metrics.ErrorRate, cxs.Spec.HealthGate.MaxErrorRate), nil
	}

	// Check success rate
	if cxs.Spec.HealthGate.MinSuccessRate > 0 && metrics.SuccessRate < cxs.Spec.HealthGate.MinSuccessRate {
		return false, fmt.Sprintf("success rate %.2f%% below threshold %.2f%%", 
			metrics.SuccessRate, cxs.Spec.HealthGate.MinSuccessRate), nil
	}

	// Check P95 latency
	if cxs.Spec.HealthGate.MaxP95Latency > 0 && metrics.P95Latency > float64(cxs.Spec.HealthGate.MaxP95Latency) {
		return false, fmt.Sprintf("P95 latency %.0fms exceeds threshold %dms", 
			metrics.P95Latency, cxs.Spec.HealthGate.MaxP95Latency), nil
	}

	return true, fmt.Sprintf("all health checks passed (error: %.2f%%, p95: %.0fms)", 
		metrics.ErrorRate, metrics.P95Latency), nil
}

func (h *HealthMonitor) getMetrics(ctx context.Context, cxs *cloudxv1.CloudExpressService, window time.Duration) (*HealthMetrics, error) {
	namespace := cxs.Namespace
	service := cxs.Name
	
	// Query error rate (5xx responses)
	errorRateQuery := fmt.Sprintf(
		`rate(cygni_http_requests_total{namespace="%s",service="%s",status=~"5.."}[%s]) / rate(cygni_http_requests_total{namespace="%s",service="%s"}[%s]) * 100`,
		namespace, service, window, namespace, service, window,
	)
	
	errorRate, err := h.queryScalar(ctx, errorRateQuery)
	if err != nil {
		return nil, fmt.Errorf("failed to query error rate: %w", err)
	}

	// Query success rate
	successRateQuery := fmt.Sprintf(
		`rate(cygni_http_requests_total{namespace="%s",service="%s",status=~"2.."}[%s]) / rate(cygni_http_requests_total{namespace="%s",service="%s"}[%s]) * 100`,
		namespace, service, window, namespace, service, window,
	)
	
	successRate, err := h.queryScalar(ctx, successRateQuery)
	if err != nil {
		return nil, fmt.Errorf("failed to query success rate: %w", err)
	}

	// Query P95 latency
	p95Query := fmt.Sprintf(
		`histogram_quantile(0.95, rate(cygni_http_duration_seconds_bucket{namespace="%s",service="%s"}[%s])) * 1000`,
		namespace, service, window,
	)
	
	p95Latency, err := h.queryScalar(ctx, p95Query)
	if err != nil {
		return nil, fmt.Errorf("failed to query P95 latency: %w", err)
	}

	// Query request count
	requestCountQuery := fmt.Sprintf(
		`sum(rate(cygni_http_requests_total{namespace="%s",service="%s"}[%s])) * %d`,
		namespace, service, window, int(window.Seconds()),
	)
	
	requestCount, err := h.queryScalar(ctx, requestCountQuery)
	if err != nil {
		return nil, fmt.Errorf("failed to query request count: %w", err)
	}

	return &HealthMetrics{
		ErrorRate:    errorRate,
		SuccessRate:  successRate,
		P95Latency:   p95Latency,
		RequestCount: int64(requestCount),
	}, nil
}

func (h *HealthMonitor) queryScalar(ctx context.Context, query string) (float64, error) {
	result, warnings, err := h.promAPI.Query(ctx, query, time.Now())
	if err != nil {
		return 0, err
	}
	
	if len(warnings) > 0 {
		h.log.Info("Prometheus query warnings", "warnings", warnings)
	}

	switch v := result.(type) {
	case model.Vector:
		if len(v) == 0 {
			return 0, nil
		}
		return float64(v[0].Value), nil
	case *model.Scalar:
		return float64(v.Value), nil
	default:
		return 0, fmt.Errorf("unexpected result type: %T", result)
	}
}

// MonitorRollout continuously monitors a rollout and returns true if it should be aborted
func (h *HealthMonitor) MonitorRollout(ctx context.Context, cxs *cloudxv1.CloudExpressService, stopCh <-chan struct{}) <-chan bool {
	abortCh := make(chan bool, 1)
	
	if cxs.Spec.HealthGate == nil || !cxs.Spec.HealthGate.Enabled {
		close(abortCh)
		return abortCh
	}

	go func() {
		defer close(abortCh)
		
		failureCount := 0
		ticker := time.NewTicker(10 * time.Second) // Check every 10 seconds
		defer ticker.Stop()

		// Wait for initial stabilization
		time.Sleep(30 * time.Second)

		for {
			select {
			case <-ctx.Done():
				return
			case <-stopCh:
				return
			case <-ticker.C:
				healthy, reason, err := h.EvaluateHealth(ctx, cxs)
				if err != nil {
					h.log.Error(err, "Failed to evaluate health")
					continue
				}

				if !healthy {
					failureCount++
					h.log.Info("Health check failed", 
						"service", cxs.Name, 
						"reason", reason, 
						"failures", failureCount)
					
					threshold := int32(3) // Default threshold
					if cxs.Spec.HealthGate.FailureThreshold > 0 {
						threshold = cxs.Spec.HealthGate.FailureThreshold
					}
					
					if failureCount >= int(threshold) {
						h.log.Info("Health gate threshold exceeded, aborting rollout", 
							"service", cxs.Name, 
							"failures", failureCount)
						abortCh <- true
						return
					}
				} else {
					// Reset failure count on success
					if failureCount > 0 {
						h.log.Info("Health check recovered", "service", cxs.Name)
						failureCount = 0
					}
				}
			}
		}
	}()

	return abortCh
}