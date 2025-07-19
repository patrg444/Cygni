package controllers

import (
	"context"
	"fmt"

	kedav1alpha1 "github.com/kedacore/keda/v2/apis/keda/v1alpha1"
	cloudxv1 "github.com/cygni/runtime-orchestrator/api/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
)

// constructKEDAScaledObject creates a KEDA ScaledObject for RPS-based autoscaling
func (r *CloudExpressServiceReconciler) constructKEDAScaledObject(cxs *cloudxv1.CloudExpressService) *kedav1alpha1.ScaledObject {
	// Default RPS threshold
	rpsThreshold := "75"
	if cxs.Spec.Autoscale.RPS > 0 {
		rpsThreshold = fmt.Sprintf("%d", cxs.Spec.Autoscale.RPS)
	}

	// Default CPU threshold
	cpuThreshold := "0.7"
	if cxs.Spec.Autoscale.CPU > 0 {
		cpuThreshold = fmt.Sprintf("%.2f", float64(cxs.Spec.Autoscale.CPU)/100.0)
	}

	minReplicas := int32(1)
	if cxs.Spec.Autoscale.Min > 0 {
		minReplicas = cxs.Spec.Autoscale.Min
	}

	maxReplicas := int32(10)
	if cxs.Spec.Autoscale.Max > 0 {
		maxReplicas = cxs.Spec.Autoscale.Max
	}

	scaledObject := &kedav1alpha1.ScaledObject{
		ObjectMeta: metav1.ObjectMeta{
			Name:      cxs.Name,
			Namespace: cxs.Namespace,
			Labels:    r.labelsForCloudExpressService(cxs),
		},
		Spec: kedav1alpha1.ScaledObjectSpec{
			ScaleTargetRef: &kedav1alpha1.ScaleTarget{
				Name: cxs.Name,
			},
			MinReplicaCount: &minReplicas,
			MaxReplicaCount: &maxReplicas,
			PollingInterval: &[]int32{30}[0], // Poll every 30 seconds
			CooldownPeriod:  &[]int32{300}[0], // 5 minute cooldown
			Triggers:        []kedav1alpha1.ScaleTriggers{},
		},
	}

	// Add RPS trigger for web services
	if cxs.Spec.ServiceType == "" || cxs.Spec.ServiceType == "web" {
		rpsTrigger := kedav1alpha1.ScaleTriggers{
			Type: "prometheus",
			Metadata: map[string]string{
				"serverAddress": getPrometheusURL(),
				"metricName":    "http_requests_per_second",
				"query": fmt.Sprintf(
					`sum(rate(cygni_http_requests_total{namespace="%s",service="%s"}[30s]))`,
					cxs.Namespace, cxs.Name,
				),
				"threshold": rpsThreshold,
			},
		}
		scaledObject.Spec.Triggers = append(scaledObject.Spec.Triggers, rpsTrigger)

		// Add P95 latency trigger
		if cxs.Spec.HealthGate != nil && cxs.Spec.HealthGate.MaxP95Latency > 0 {
			latencyTrigger := kedav1alpha1.ScaleTriggers{
				Type: "prometheus",
				Metadata: map[string]string{
					"serverAddress": getPrometheusURL(),
					"metricName":    "p95_latency",
					"query": fmt.Sprintf(
						`histogram_quantile(0.95, rate(cygni_http_duration_seconds_bucket{namespace="%s",service="%s"}[1m]))`,
						cxs.Namespace, cxs.Name,
					),
					"threshold": fmt.Sprintf("%.3f", float64(cxs.Spec.HealthGate.MaxP95Latency)/1000.0), // Convert ms to seconds
				},
			}
			scaledObject.Spec.Triggers = append(scaledObject.Spec.Triggers, latencyTrigger)
		}
	}

	// Add CPU trigger as fallback
	cpuTrigger := kedav1alpha1.ScaleTriggers{
		Type: "prometheus",
		Metadata: map[string]string{
			"serverAddress": getPrometheusURL(),
			"metricName":    "cpu_utilization",
			"query": fmt.Sprintf(
				`avg(rate(container_cpu_usage_seconds_total{namespace="%s",pod=~"%s-.*"}[1m]))`,
				cxs.Namespace, cxs.Name,
			),
			"threshold": cpuThreshold,
		},
	}
	scaledObject.Spec.Triggers = append(scaledObject.Spec.Triggers, cpuTrigger)

	// Add memory trigger for memory-intensive workloads
	if cxs.Spec.Resources.Memory != "" {
		memoryTrigger := kedav1alpha1.ScaleTriggers{
			Type: "prometheus",
			Metadata: map[string]string{
				"serverAddress": getPrometheusURL(),
				"metricName":    "memory_utilization",
				"query": fmt.Sprintf(
					`avg(container_memory_working_set_bytes{namespace="%s",pod=~"%s-.*"} / container_spec_memory_limit_bytes{namespace="%s",pod=~"%s-.*"})`,
					cxs.Namespace, cxs.Name, cxs.Namespace, cxs.Name,
				),
				"threshold": "0.8", // Scale at 80% memory
			},
		}
		scaledObject.Spec.Triggers = append(scaledObject.Spec.Triggers, memoryTrigger)
	}

	return scaledObject
}

// createOrUpdateKEDAScaledObject manages KEDA ScaledObject lifecycle
func (r *CloudExpressServiceReconciler) createOrUpdateKEDAScaledObject(ctx context.Context, cxs *cloudxv1.CloudExpressService) error {
	scaledObject := r.constructKEDAScaledObject(cxs)

	// Set CloudExpressService as owner
	if err := controllerutil.SetControllerReference(cxs, scaledObject, r.Scheme); err != nil {
		return fmt.Errorf("failed to set controller reference: %w", err)
	}

	// Check if ScaledObject exists
	existing := &kedav1alpha1.ScaledObject{}
	err := r.Get(ctx, client.ObjectKeyFromObject(scaledObject), existing)
	
	if err != nil {
		if errors.IsNotFound(err) {
			// Create new ScaledObject
			if err := r.Create(ctx, scaledObject); err != nil {
				return fmt.Errorf("failed to create ScaledObject: %w", err)
			}
			r.Log.Info("Created KEDA ScaledObject", "name", scaledObject.Name)
			return nil
		}
		return fmt.Errorf("failed to get ScaledObject: %w", err)
	}

	// Update existing ScaledObject
	existing.Spec = scaledObject.Spec
	if err := r.Update(ctx, existing); err != nil {
		return fmt.Errorf("failed to update ScaledObject: %w", err)
	}
	
	r.Log.Info("Updated KEDA ScaledObject", "name", scaledObject.Name)
	return nil
}

func getPrometheusURL() string {
	// This could be configured via environment variable or ConfigMap
	url := os.Getenv("PROMETHEUS_URL")
	if url == "" {
		url = "http://prometheus-kube-prometheus-prometheus.monitoring.svc.cluster.local:9090"
	}
	return url
}