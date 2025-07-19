package controllers

import (
	"context"
	"fmt"
	"time"

	"github.com/go-logr/logr"
	appsv1 "k8s.io/api/apps/v1"
	autoscalingv2 "k8s.io/api/autoscaling/v2"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/intstr"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"

	cloudxv1 "github.com/cygni/runtime-orchestrator/api/v1"
)

// CloudExpressServiceReconciler reconciles a CloudExpressService object
type CloudExpressServiceReconciler struct {
	client.Client
	Log           logr.Logger
	Scheme        *runtime.Scheme
	HealthMonitor *HealthMonitor
}

// +kubebuilder:rbac:groups=cloudx.io,resources=cygniservices,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=cloudx.io,resources=cygniservices/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=cloudx.io,resources=cygniservices/finalizers,verbs=update
// +kubebuilder:rbac:groups=apps,resources=deployments,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=core,resources=services,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=core,resources=secrets,verbs=get;list;watch
// +kubebuilder:rbac:groups=networking.k8s.io,resources=ingresses,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=autoscaling,resources=horizontalpodautoscalers,verbs=get;list;watch;create;update;patch;delete

func (r *CloudExpressServiceReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := r.Log.WithValues("cygniservice", req.NamespacedName)

	// Fetch the CloudExpressService instance
	cxs := &cloudxv1.CloudExpressService{}
	if err := r.Get(ctx, req.NamespacedName, cxs); err != nil {
		if errors.IsNotFound(err) {
			return ctrl.Result{}, nil
		}
		return ctrl.Result{}, err
	}

	// Update status phase
	originalPhase := cxs.Status.Phase
	cxs.Status.Phase = "Reconciling"

	// Save current image as previous if it's changing
	if cxs.Status.CurrentImage != "" && cxs.Status.CurrentImage != cxs.Spec.Image {
		cxs.Status.PreviousImage = cxs.Status.CurrentImage
	}
	cxs.Status.CurrentImage = cxs.Spec.Image
	cxs.Status.LastUpdateTime = metav1.Now()

	// Run database migrations if needed
	if cxs.Spec.ServiceType == "" || cxs.Spec.ServiceType == "web" {
		migrationRunner := &MigrationRunner{
			client: r.Client,
			log:    log.WithName("migration"),
		}
		
		if err := migrationRunner.RunMigrations(ctx, cxs); err != nil {
			log.Error(err, "Failed to run migrations")
			cxs.Status.Phase = "Failed"
			cxs.Status.Message = fmt.Sprintf("Migration failed: %v", err)
			r.updateStatus(ctx, cxs)
			return ctrl.Result{RequeueAfter: 30 * time.Second}, err
		}
	}

	// Create or update Deployment
	deployment := &appsv1.Deployment{}
	deploymentName := types.NamespacedName{
		Name:      cxs.Name,
		Namespace: cxs.Namespace,
	}

	if err := r.Get(ctx, deploymentName, deployment); err != nil {
		if errors.IsNotFound(err) {
			// Create new deployment
			deployment = r.constructDeployment(cxs)
			if err := controllerutil.SetControllerReference(cxs, deployment, r.Scheme); err != nil {
				return ctrl.Result{}, err
			}
			if err := r.Create(ctx, deployment); err != nil {
				log.Error(err, "Failed to create Deployment")
				cxs.Status.Phase = "Failed"
				cxs.Status.Message = fmt.Sprintf("Failed to create deployment: %v", err)
				r.updateStatus(ctx, cxs)
				return ctrl.Result{}, err
			}
			log.Info("Created Deployment", "deployment", deployment.Name)
		} else {
			return ctrl.Result{}, err
		}
	} else {
		// Update existing deployment
		deployment.Spec = r.constructDeploymentSpec(cxs)
		if err := r.Update(ctx, deployment); err != nil {
			log.Error(err, "Failed to update Deployment")
			cxs.Status.Phase = "Failed"
			cxs.Status.Message = fmt.Sprintf("Failed to update deployment: %v", err)
			r.updateStatus(ctx, cxs)
			return ctrl.Result{}, err
		}
		log.Info("Updated Deployment", "deployment", deployment.Name)
		
		// Monitor health during rollout if health gate is enabled
		if cxs.Spec.HealthGate != nil && cxs.Spec.HealthGate.Enabled && r.HealthMonitor != nil {
			go r.monitorDeploymentHealth(ctx, cxs, deployment)
		}
	}

	// Update status from deployment
	cxs.Status.Replicas = deployment.Status.Replicas
	cxs.Status.ReadyReplicas = deployment.Status.ReadyReplicas

	// Create or update Service (for web services)
	if cxs.Spec.ServiceType == "" || cxs.Spec.ServiceType == "web" {
		service := &corev1.Service{}
		serviceName := types.NamespacedName{
			Name:      cxs.Name,
			Namespace: cxs.Namespace,
		}

		if err := r.Get(ctx, serviceName, service); err != nil {
			if errors.IsNotFound(err) {
				service = r.constructService(cxs)
				if err := controllerutil.SetControllerReference(cxs, service, r.Scheme); err != nil {
					return ctrl.Result{}, err
				}
				if err := r.Create(ctx, service); err != nil {
					log.Error(err, "Failed to create Service")
					return ctrl.Result{}, err
				}
				log.Info("Created Service", "service", service.Name)
			} else {
				return ctrl.Result{}, err
			}
		}

		// Create or update Ingress
		if len(cxs.Spec.Ports) > 0 {
			ingress := &networkingv1.Ingress{}
			ingressName := types.NamespacedName{
				Name:      cxs.Name,
				Namespace: cxs.Namespace,
			}

			if err := r.Get(ctx, ingressName, ingress); err != nil {
				if errors.IsNotFound(err) {
					ingress = r.constructIngress(cxs)
					if err := controllerutil.SetControllerReference(cxs, ingress, r.Scheme); err != nil {
						return ctrl.Result{}, err
					}
					if err := r.Create(ctx, ingress); err != nil {
						log.Error(err, "Failed to create Ingress")
						return ctrl.Result{}, err
					}
					log.Info("Created Ingress", "ingress", ingress.Name)

					// Set endpoint in status
					if len(ingress.Spec.Rules) > 0 {
						cxs.Status.Endpoint = fmt.Sprintf("https://%s", ingress.Spec.Rules[0].Host)
					}
				} else {
					return ctrl.Result{}, err
				}
			}
		}
	}

	// Create or update HPA if autoscaling is configured
	if cxs.Spec.Autoscale.Max > 0 {
		hpa := &autoscalingv2.HorizontalPodAutoscaler{}
		hpaName := types.NamespacedName{
			Name:      cxs.Name,
			Namespace: cxs.Namespace,
		}

		if err := r.Get(ctx, hpaName, hpa); err != nil {
			if errors.IsNotFound(err) {
				hpa = r.constructHPA(cxs)
				if err := controllerutil.SetControllerReference(cxs, hpa, r.Scheme); err != nil {
					return ctrl.Result{}, err
				}
				if err := r.Create(ctx, hpa); err != nil {
					log.Error(err, "Failed to create HPA")
					return ctrl.Result{}, err
				}
				log.Info("Created HPA", "hpa", hpa.Name)
			} else {
				return ctrl.Result{}, err
			}
		} else {
			// Update HPA
			hpa.Spec = r.constructHPASpec(cxs)
			if err := r.Update(ctx, hpa); err != nil {
				log.Error(err, "Failed to update HPA")
				return ctrl.Result{}, err
			}
		}
	}

	// Update status phase based on deployment status
	if deployment.Status.ReadyReplicas == deployment.Status.Replicas && deployment.Status.Replicas > 0 {
		cxs.Status.Phase = "Running"
		cxs.Status.Message = ""
		meta.SetStatusCondition(&cxs.Status.Conditions, metav1.Condition{
			Type:    "Ready",
			Status:  metav1.ConditionTrue,
			Reason:  "DeploymentReady",
			Message: "All replicas are ready",
		})
	} else if deployment.Status.Replicas == 0 {
		cxs.Status.Phase = "Pending"
		cxs.Status.Message = "Waiting for replicas to start"
	} else {
		cxs.Status.Phase = "Deploying"
		cxs.Status.Message = fmt.Sprintf("Rolling out: %d/%d replicas ready", 
			deployment.Status.ReadyReplicas, deployment.Status.Replicas)
	}

	// Update status
	if originalPhase != cxs.Status.Phase {
		if err := r.updateStatus(ctx, cxs); err != nil {
			return ctrl.Result{}, err
		}
	}

	// Requeue if still deploying
	if cxs.Status.Phase == "Deploying" {
		return ctrl.Result{RequeueAfter: 5 * time.Second}, nil
	}

	return ctrl.Result{}, nil
}

func (r *CloudExpressServiceReconciler) constructDeployment(cxs *cloudxv1.CloudExpressService) *appsv1.Deployment {
	return &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      cxs.Name,
			Namespace: cxs.Namespace,
			Labels:    r.labelsForCloudExpressService(cxs),
		},
		Spec: r.constructDeploymentSpec(cxs),
	}
}

func (r *CloudExpressServiceReconciler) constructDeploymentSpec(cxs *cloudxv1.CloudExpressService) appsv1.DeploymentSpec {
	replicas := int32(1)
	if cxs.Spec.Autoscale.Min > 0 {
		replicas = cxs.Spec.Autoscale.Min
	}

	maxUnavailable := intstr.FromInt(0) // Zero-downtime deployments
	maxSurge := intstr.FromString("25%")

	spec := appsv1.DeploymentSpec{
		Replicas: &replicas,
		Strategy: appsv1.DeploymentStrategy{
			Type: appsv1.RollingUpdateDeploymentStrategyType,
			RollingUpdate: &appsv1.RollingUpdateDeployment{
				MaxUnavailable: &maxUnavailable,
				MaxSurge:       &maxSurge,
			},
		},
		Selector: &metav1.LabelSelector{
			MatchLabels: r.labelsForCloudExpressService(cxs),
		},
		Template: corev1.PodTemplateSpec{
			ObjectMeta: metav1.ObjectMeta{
				Labels: r.labelsForCloudExpressService(cxs),
				Annotations: map[string]string{
					"cygni.io/deployment-id": cxs.Status.DeploymentID,
					"cygni.io/image-hash":    hashImage(cxs.Spec.Image),
				},
			},
			Spec: r.constructPodSpec(cxs),
		},
	}

	return spec
}

func (r *CloudExpressServiceReconciler) constructPodSpec(cxs *cloudxv1.CloudExpressService) corev1.PodSpec {
	container := corev1.Container{
		Name:  "app",
		Image: cxs.Spec.Image,
		Env:   r.constructEnvVars(cxs),
	}

	// Set command and args if specified
	if len(cxs.Spec.Command) > 0 {
		container.Command = cxs.Spec.Command
	}
	if len(cxs.Spec.Args) > 0 {
		container.Args = cxs.Spec.Args
	}

	// Set ports
	for _, port := range cxs.Spec.Ports {
		container.Ports = append(container.Ports, corev1.ContainerPort{
			ContainerPort: port,
			Protocol:      corev1.ProtocolTCP,
		})
	}

	// Set resources
	if cxs.Spec.Resources.CPU != "" || cxs.Spec.Resources.Memory != "" {
		container.Resources = corev1.ResourceRequirements{
			Requests: corev1.ResourceList{},
			Limits:   corev1.ResourceList{},
		}

		if cxs.Spec.Resources.CPU != "" {
			container.Resources.Requests[corev1.ResourceCPU] = resource.MustParse(cxs.Spec.Resources.CPU)
		}
		if cxs.Spec.Resources.Memory != "" {
			container.Resources.Requests[corev1.ResourceMemory] = resource.MustParse(cxs.Spec.Resources.Memory)
		}
		if cxs.Spec.Resources.CPULimit != "" {
			container.Resources.Limits[corev1.ResourceCPU] = resource.MustParse(cxs.Spec.Resources.CPULimit)
		}
		if cxs.Spec.Resources.MemoryLimit != "" {
			container.Resources.Limits[corev1.ResourceMemory] = resource.MustParse(cxs.Spec.Resources.MemoryLimit)
		}
	}

	// Set health checks
	if cxs.Spec.HealthCheck != nil {
		probe := &corev1.Probe{
			ProbeHandler: corev1.ProbeHandler{
				HTTPGet: &corev1.HTTPGetAction{
					Path: cxs.Spec.HealthCheck.Path,
					Port: intstr.FromInt(int(cxs.Spec.HealthCheck.Port)),
				},
			},
			InitialDelaySeconds: cxs.Spec.HealthCheck.InitialDelaySeconds,
			PeriodSeconds:       cxs.Spec.HealthCheck.PeriodSeconds,
		}
		container.LivenessProbe = probe
		container.ReadinessProbe = probe
	}

	return corev1.PodSpec{
		Containers: []corev1.Container{container},
	}
}

func (r *CloudExpressServiceReconciler) constructService(cxs *cloudxv1.CloudExpressService) *corev1.Service {
	ports := []corev1.ServicePort{}
	for i, port := range cxs.Spec.Ports {
		ports = append(ports, corev1.ServicePort{
			Name:       fmt.Sprintf("port-%d", i),
			Port:       port,
			TargetPort: intstr.FromInt(int(port)),
			Protocol:   corev1.ProtocolTCP,
		})
	}

	return &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      cxs.Name,
			Namespace: cxs.Namespace,
			Labels:    r.labelsForCloudExpressService(cxs),
		},
		Spec: corev1.ServiceSpec{
			Type:     corev1.ServiceTypeClusterIP,
			Selector: r.labelsForCloudExpressService(cxs),
			Ports:    ports,
		},
	}
}

func (r *CloudExpressServiceReconciler) constructIngress(cxs *cloudxv1.CloudExpressService) *networkingv1.Ingress {
	// Generate host based on namespace and service name
	host := fmt.Sprintf("%s-%s.cygni.app", cxs.Name, cxs.Namespace)
	if cxs.Namespace == "preview" || isPreviewNamespace(cxs.Namespace) {
		host = fmt.Sprintf("%s.preview.cygni.app", cxs.Name)
	}

	pathType := networkingv1.PathTypePrefix
	return &networkingv1.Ingress{
		ObjectMeta: metav1.ObjectMeta{
			Name:      cxs.Name,
			Namespace: cxs.Namespace,
			Labels:    r.labelsForCloudExpressService(cxs),
			Annotations: map[string]string{
				"kubernetes.io/ingress.class":                "nginx",
				"cert-manager.io/cluster-issuer":             "letsencrypt-prod",
				"nginx.ingress.kubernetes.io/proxy-body-size": "100m",
			},
		},
		Spec: networkingv1.IngressSpec{
			TLS: []networkingv1.IngressTLS{
				{
					Hosts:      []string{host},
					SecretName: fmt.Sprintf("%s-tls", cxs.Name),
				},
			},
			Rules: []networkingv1.IngressRule{
				{
					Host: host,
					IngressRuleValue: networkingv1.IngressRuleValue{
						HTTP: &networkingv1.HTTPIngressRuleValue{
							Paths: []networkingv1.HTTPIngressPath{
								{
									Path:     "/",
									PathType: &pathType,
									Backend: networkingv1.IngressBackend{
										Service: &networkingv1.IngressServiceBackend{
											Name: cxs.Name,
											Port: networkingv1.ServiceBackendPort{
												Number: cxs.Spec.Ports[0],
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	}
}

func (r *CloudExpressServiceReconciler) constructHPA(cxs *cloudxv1.CloudExpressService) *autoscalingv2.HorizontalPodAutoscaler {
	return &autoscalingv2.HorizontalPodAutoscaler{
		ObjectMeta: metav1.ObjectMeta{
			Name:      cxs.Name,
			Namespace: cxs.Namespace,
			Labels:    r.labelsForCloudExpressService(cxs),
		},
		Spec: r.constructHPASpec(cxs),
	}
}

func (r *CloudExpressServiceReconciler) constructHPASpec(cxs *cloudxv1.CloudExpressService) autoscalingv2.HorizontalPodAutoscalerSpec {
	targetCPU := int32(70)
	if cxs.Spec.Autoscale.CPU > 0 {
		targetCPU = cxs.Spec.Autoscale.CPU
	}

	spec := autoscalingv2.HorizontalPodAutoscalerSpec{
		ScaleTargetRef: autoscalingv2.CrossVersionObjectReference{
			APIVersion: "apps/v1",
			Kind:       "Deployment",
			Name:       cxs.Name,
		},
		MinReplicas: &cxs.Spec.Autoscale.Min,
		MaxReplicas: cxs.Spec.Autoscale.Max,
		Metrics: []autoscalingv2.MetricSpec{
			{
				Type: autoscalingv2.ResourceMetricSourceType,
				Resource: &autoscalingv2.ResourceMetricSource{
					Name: corev1.ResourceCPU,
					Target: autoscalingv2.MetricTarget{
						Type:               autoscalingv2.UtilizationMetricType,
						AverageUtilization: &targetCPU,
					},
				},
			},
		},
	}

	return spec
}

func (r *CloudExpressServiceReconciler) constructEnvVars(cxs *cloudxv1.CloudExpressService) []corev1.EnvVar {
	envVars := []corev1.EnvVar{
		{
			Name:  "CLOUDEXPRESS_SERVICE",
			Value: cxs.Name,
		},
		{
			Name:  "CLOUDEXPRESS_NAMESPACE",
			Value: cxs.Namespace,
		},
		{
			Name:  "CLOUDEXPRESS_DEPLOYMENT_ID",
			Value: cxs.Status.DeploymentID,
		},
	}

	// Add custom env vars
	for key, value := range cxs.Spec.Env {
		envVars = append(envVars, corev1.EnvVar{
			Name:  key,
			Value: value,
		})
	}

	// TODO: Add envFrom for secrets

	return envVars
}

func (r *CloudExpressServiceReconciler) labelsForCloudExpressService(cxs *cloudxv1.CloudExpressService) map[string]string {
	return map[string]string{
		"app":                          cxs.Name,
		"cygni.io/service":      cxs.Name,
		"cygni.io/service-type": cxs.Spec.ServiceType,
		"cygni.io/managed-by":   "runtime-orchestrator",
	}
}

func (r *CloudExpressServiceReconciler) updateStatus(ctx context.Context, cxs *cloudxv1.CloudExpressService) error {
	return r.Status().Update(ctx, cxs)
}

func (r *CloudExpressServiceReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&cloudxv1.CloudExpressService{}).
		Owns(&appsv1.Deployment{}).
		Owns(&corev1.Service{}).
		Owns(&networkingv1.Ingress{}).
		Owns(&autoscalingv2.HorizontalPodAutoscaler{}).
		Complete(r)
}

// Helper functions
func hashImage(image string) string {
	// Simple hash for change detection
	h := 0
	for _, c := range image {
		h = h*31 + int(c)
	}
	return fmt.Sprintf("%x", h)
}

func isPreviewNamespace(namespace string) bool {
	return len(namespace) > 3 && namespace[:3] == "pr-"
}

// monitorDeploymentHealth monitors the health of a deployment during rollout
func (r *CloudExpressServiceReconciler) monitorDeploymentHealth(ctx context.Context, cxs *cloudxv1.CloudExpressService, deployment *appsv1.Deployment) {
	stopCh := make(chan struct{})
	defer close(stopCh)

	// Create a context that cancels when deployment is complete
	monitorCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()

	// Start health monitoring
	abortCh := r.HealthMonitor.MonitorRollout(monitorCtx, cxs, stopCh)

	// Check deployment status periodically
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-monitorCtx.Done():
			return
		case abort := <-abortCh:
			if abort {
				r.Log.Error(nil, "Health gate failed, rolling back deployment", 
					"service", cxs.Name, 
					"namespace", cxs.Namespace)
				r.rollbackDeployment(ctx, cxs, deployment)
				return
			}
		case <-ticker.C:
			// Check if deployment is complete
			currentDeployment := &appsv1.Deployment{}
			if err := r.Get(ctx, types.NamespacedName{
				Name:      deployment.Name,
				Namespace: deployment.Namespace,
			}, currentDeployment); err != nil {
				r.Log.Error(err, "Failed to get deployment status")
				return
			}

			// If deployment is complete and healthy, stop monitoring
			if currentDeployment.Status.Replicas == currentDeployment.Status.ReadyReplicas &&
			   currentDeployment.Status.Replicas > 0 {
				r.Log.Info("Deployment completed successfully", 
					"service", cxs.Name,
					"replicas", currentDeployment.Status.Replicas)
				return
			}

			// If deployment failed, stop monitoring
			for _, condition := range currentDeployment.Status.Conditions {
				if condition.Type == appsv1.DeploymentProgressing && 
				   condition.Status == corev1.ConditionFalse {
					r.Log.Info("Deployment failed, stopping health monitoring", 
						"service", cxs.Name)
					return
				}
			}
		}
	}
}

// rollbackDeployment rolls back a deployment to the previous version
func (r *CloudExpressServiceReconciler) rollbackDeployment(ctx context.Context, cxs *cloudxv1.CloudExpressService, deployment *appsv1.Deployment) {
	if cxs.Status.PreviousImage == "" {
		r.Log.Info("No previous image available for rollback", "service", cxs.Name)
		return
	}

	// Update the CRD to trigger rollback
	cxs.Spec.Image = cxs.Status.PreviousImage
	if err := r.Update(ctx, cxs); err != nil {
		r.Log.Error(err, "Failed to update service for rollback", "service", cxs.Name)
		return
	}

	// Update status
	cxs.Status.Phase = "RollingBack"
	cxs.Status.Message = "Health gate failed, rolling back to previous version"
	if err := r.updateStatus(ctx, cxs); err != nil {
		r.Log.Error(err, "Failed to update status during rollback")
	}

	// Emit event
	r.recordEvent(cxs, corev1.EventTypeWarning, "HealthGateFailed", 
		"Deployment rolled back due to health gate failure")
}

// recordEvent records a Kubernetes event for the CloudExpressService
func (r *CloudExpressServiceReconciler) recordEvent(cxs *cloudxv1.CloudExpressService, eventType, reason, message string) {
	// This would use the Kubernetes event recorder
	// For now, just log it
	r.Log.Info("Event", 
		"type", eventType,
		"reason", reason,
		"message", message,
		"service", cxs.Name,
		"namespace", cxs.Namespace)
}