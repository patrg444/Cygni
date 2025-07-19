package controllers

import (
	"context"
	"fmt"
	"time"

	"github.com/go-logr/logr"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/intstr"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/gateway-api/apis/v1beta1"

	cloudxv1 "github.com/cygni/runtime-orchestrator/api/v1"
)

// CanaryController manages canary deployments
type CanaryController struct {
	client        client.Client
	log           logr.Logger
	healthMonitor *HealthMonitor
}

// DeployCanary creates a canary deployment
func (c *CanaryController) DeployCanary(ctx context.Context, cxs *cloudxv1.CloudExpressService) error {
	if cxs.Spec.Strategy == nil || cxs.Spec.Strategy.Type != "canary" {
		return nil // Not a canary deployment
	}

	canaryConfig := cxs.Spec.Strategy.Canary
	if canaryConfig == nil {
		canaryConfig = &cloudxv1.CanaryStrategy{
			InitialWeight:   10,  // Default 10% traffic
			ObservationTime: "5m", // Default 5 minutes
			AutoPromote:     true,
		}
	}

	// Create canary deployment
	canaryDeployment := c.constructCanaryDeployment(cxs)
	if err := c.createOrUpdateDeployment(ctx, canaryDeployment); err != nil {
		return fmt.Errorf("failed to create canary deployment: %w", err)
	}

	// Create stable deployment if it doesn't exist
	stableDeployment := c.constructStableDeployment(cxs)
	if err := c.createOrUpdateDeployment(ctx, stableDeployment); err != nil {
		return fmt.Errorf("failed to create stable deployment: %w", err)
	}

	// Configure traffic splitting using Gateway API
	if err := c.configureTrafficSplitting(ctx, cxs, canaryConfig.InitialWeight); err != nil {
		return fmt.Errorf("failed to configure traffic splitting: %w", err)
	}

	// Start canary monitoring
	if canaryConfig.AutoPromote {
		go c.monitorCanary(ctx, cxs, canaryConfig)
	}

	return nil
}

func (c *CanaryController) constructCanaryDeployment(cxs *cloudxv1.CloudExpressService) *appsv1.Deployment {
	deployment := constructDeploymentFromService(cxs)
	deployment.Name = fmt.Sprintf("%s-canary", cxs.Name)
	deployment.Spec.Selector.MatchLabels["version"] = "canary"
	deployment.Spec.Template.Labels["version"] = "canary"
	
	// Start with minimal replicas for canary
	minReplicas := int32(1)
	deployment.Spec.Replicas = &minReplicas
	
	return deployment
}

func (c *CanaryController) constructStableDeployment(cxs *cloudxv1.CloudExpressService) *appsv1.Deployment {
	deployment := constructDeploymentFromService(cxs)
	deployment.Name = fmt.Sprintf("%s-stable", cxs.Name)
	deployment.Spec.Selector.MatchLabels["version"] = "stable"
	deployment.Spec.Template.Labels["version"] = "stable"
	
	// Use previous image for stable deployment
	if cxs.Status.PreviousImage != "" {
		deployment.Spec.Template.Spec.Containers[0].Image = cxs.Status.PreviousImage
	}
	
	return deployment
}

func (c *CanaryController) configureTrafficSplitting(ctx context.Context, cxs *cloudxv1.CloudExpressService, canaryWeight int32) error {
	// Using Gateway API HTTPRoute for traffic splitting
	httpRoute := &v1beta1.HTTPRoute{
		ObjectMeta: metav1.ObjectMeta{
			Name:      cxs.Name,
			Namespace: cxs.Namespace,
		},
		Spec: v1beta1.HTTPRouteSpec{
			ParentRefs: []v1beta1.ParentReference{
				{
					Name: "cygni-gateway",
					Kind: (*v1beta1.Kind)(stringPtr("Gateway")),
				},
			},
			Hostnames: []v1beta1.Hostname{
				v1beta1.Hostname(fmt.Sprintf("%s.cygni.app", cxs.Name)),
			},
			Rules: []v1beta1.HTTPRouteRule{
				{
					BackendRefs: []v1beta1.HTTPBackendRef{
						{
							BackendRef: v1beta1.BackendRef{
								BackendObjectReference: v1beta1.BackendObjectReference{
									Name: v1beta1.ObjectName(fmt.Sprintf("%s-stable", cxs.Name)),
									Port: (*v1beta1.PortNumber)(int32Ptr(80)),
								},
								Weight: int32Ptr(100 - canaryWeight),
							},
						},
						{
							BackendRef: v1beta1.BackendRef{
								BackendObjectReference: v1beta1.BackendObjectReference{
									Name: v1beta1.ObjectName(fmt.Sprintf("%s-canary", cxs.Name)),
									Port: (*v1beta1.PortNumber)(int32Ptr(80)),
								},
								Weight: int32Ptr(canaryWeight),
							},
						},
					},
				},
			},
		},
	}

	// Check if HTTPRoute exists
	existing := &v1beta1.HTTPRoute{}
	err := c.client.Get(ctx, types.NamespacedName{
		Name:      httpRoute.Name,
		Namespace: httpRoute.Namespace,
	}, existing)

	if err != nil {
		if errors.IsNotFound(err) {
			return c.client.Create(ctx, httpRoute)
		}
		return err
	}

	// Update existing route
	existing.Spec = httpRoute.Spec
	return c.client.Update(ctx, existing)
}

func (c *CanaryController) monitorCanary(ctx context.Context, cxs *cloudxv1.CloudExpressService, config *cloudxv1.CanaryStrategy) {
	// Parse observation time
	duration, err := time.ParseDuration(config.ObservationTime)
	if err != nil {
		duration = 5 * time.Minute
	}

	c.log.Info("Starting canary monitoring", 
		"service", cxs.Name,
		"duration", duration,
		"initialWeight", config.InitialWeight)

	// Create monitoring context
	monitorCtx, cancel := context.WithTimeout(ctx, duration)
	defer cancel()

	// Start health monitoring
	stopCh := make(chan struct{})
	defer close(stopCh)

	abortCh := c.healthMonitor.MonitorRollout(monitorCtx, cxs, stopCh)

	// Progressive traffic shifting
	weights := []int32{10, 25, 50, 75, 100}
	currentIndex := 0
	
	// Find starting index based on initial weight
	for i, w := range weights {
		if w >= config.InitialWeight {
			currentIndex = i
			break
		}
	}

	ticker := time.NewTicker(duration / time.Duration(len(weights)-currentIndex))
	defer ticker.Stop()

	for {
		select {
		case <-monitorCtx.Done():
			// Observation period complete, promote canary
			c.promoteCanary(ctx, cxs)
			return
			
		case abort := <-abortCh:
			if abort {
				c.log.Error(nil, "Canary health check failed, rolling back",
					"service", cxs.Name)
				c.rollbackCanary(ctx, cxs)
				return
			}
			
		case <-ticker.C:
			// Progressive traffic increase
			if currentIndex < len(weights)-1 {
				currentIndex++
				newWeight := weights[currentIndex]
				
				c.log.Info("Increasing canary traffic",
					"service", cxs.Name,
					"weight", newWeight)
					
				if err := c.configureTrafficSplitting(ctx, cxs, newWeight); err != nil {
					c.log.Error(err, "Failed to update traffic split")
					c.rollbackCanary(ctx, cxs)
					return
				}
			}
		}
	}
}

func (c *CanaryController) promoteCanary(ctx context.Context, cxs *cloudxv1.CloudExpressService) error {
	c.log.Info("Promoting canary to stable", "service", cxs.Name)

	// Update stable deployment with canary image
	stableDeployment := &appsv1.Deployment{}
	err := c.client.Get(ctx, types.NamespacedName{
		Name:      fmt.Sprintf("%s-stable", cxs.Name),
		Namespace: cxs.Namespace,
	}, stableDeployment)

	if err != nil {
		return fmt.Errorf("failed to get stable deployment: %w", err)
	}

	// Update image
	stableDeployment.Spec.Template.Spec.Containers[0].Image = cxs.Spec.Image
	if err := c.client.Update(ctx, stableDeployment); err != nil {
		return fmt.Errorf("failed to update stable deployment: %w", err)
	}

	// Wait for stable deployment to be ready
	time.Sleep(30 * time.Second)

	// Remove canary deployment
	canaryDeployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-canary", cxs.Name),
			Namespace: cxs.Namespace,
		},
	}
	
	if err := c.client.Delete(ctx, canaryDeployment); err != nil && !errors.IsNotFound(err) {
		c.log.Error(err, "Failed to delete canary deployment")
	}

	// Reset traffic to 100% stable
	return c.configureTrafficSplitting(ctx, cxs, 0)
}

func (c *CanaryController) rollbackCanary(ctx context.Context, cxs *cloudxv1.CloudExpressService) error {
	c.log.Info("Rolling back canary deployment", "service", cxs.Name)

	// Delete canary deployment
	canaryDeployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-canary", cxs.Name),
			Namespace: cxs.Namespace,
		},
	}
	
	if err := c.client.Delete(ctx, canaryDeployment); err != nil && !errors.IsNotFound(err) {
		return fmt.Errorf("failed to delete canary deployment: %w", err)
	}

	// Reset traffic to 100% stable
	if err := c.configureTrafficSplitting(ctx, cxs, 0); err != nil {
		return fmt.Errorf("failed to reset traffic: %w", err)
	}

	// Update status
	cxs.Status.Phase = "Failed"
	cxs.Status.Message = "Canary deployment failed health checks"
	
	return nil
}

func (c *CanaryController) createOrUpdateDeployment(ctx context.Context, deployment *appsv1.Deployment) error {
	existing := &appsv1.Deployment{}
	err := c.client.Get(ctx, types.NamespacedName{
		Name:      deployment.Name,
		Namespace: deployment.Namespace,
	}, existing)

	if err != nil {
		if errors.IsNotFound(err) {
			return c.client.Create(ctx, deployment)
		}
		return err
	}

	// Update existing deployment
	existing.Spec = deployment.Spec
	return c.client.Update(ctx, existing)
}

// Helper functions
func stringPtr(s string) *string {
	return &s
}

func int32Ptr(i int32) *int32 {
	return &i
}

func constructDeploymentFromService(cxs *cloudxv1.CloudExpressService) *appsv1.Deployment {
	// This would be imported from the main controller
	// For now, create a basic deployment structure
	replicas := int32(1)
	
	return &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      cxs.Name,
			Namespace: cxs.Namespace,
			Labels: map[string]string{
				"app":                     cxs.Name,
				"cygni.io/service": cxs.Name,
			},
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{
					"app": cxs.Name,
				},
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{
						"app": cxs.Name,
					},
				},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:  "app",
							Image: cxs.Spec.Image,
							Ports: []corev1.ContainerPort{
								{
									ContainerPort: 80,
								},
							},
						},
					},
				},
			},
		},
	}
}