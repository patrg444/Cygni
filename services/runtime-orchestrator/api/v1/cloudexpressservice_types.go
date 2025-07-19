package v1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// CloudExpressServiceSpec defines the desired state of CloudExpressService
type CloudExpressServiceSpec struct {
	// Image is the container image to deploy
	Image string `json:"image"`

	// Ports exposed by the service
	Ports []int32 `json:"ports,omitempty"`

	// Environment variables from secrets
	EnvFrom string `json:"envFrom,omitempty"`

	// Environment variables
	Env map[string]string `json:"env,omitempty"`

	// Autoscaling configuration
	Autoscale AutoscaleSpec `json:"autoscale,omitempty"`

	// Resources for the container
	Resources ResourceRequirements `json:"resources,omitempty"`

	// Health check configuration
	HealthCheck *HealthCheckSpec `json:"healthCheck,omitempty"`

	// Service type (web, worker, cron)
	ServiceType string `json:"serviceType,omitempty"`

	// Command override
	Command []string `json:"command,omitempty"`

	// Args override
	Args []string `json:"args,omitempty"`

	// Health gate configuration
	HealthGate *HealthGateSpec `json:"healthGate,omitempty"`

	// Deployment strategy
	Strategy *DeploymentStrategy `json:"strategy,omitempty"`
}

// AutoscaleSpec defines autoscaling parameters
type AutoscaleSpec struct {
	// Minimum number of replicas
	Min int32 `json:"min,omitempty"`

	// Maximum number of replicas
	Max int32 `json:"max,omitempty"`

	// Target CPU utilization percentage
	CPU int32 `json:"cpu,omitempty"`

	// Target requests per second
	RPS int32 `json:"rps,omitempty"`
}

// ResourceRequirements defines resource requests and limits
type ResourceRequirements struct {
	// CPU request (e.g., "100m", "1")
	CPU string `json:"cpu,omitempty"`

	// Memory request (e.g., "128Mi", "1Gi")
	Memory string `json:"memory,omitempty"`

	// CPU limit
	CPULimit string `json:"cpuLimit,omitempty"`

	// Memory limit
	MemoryLimit string `json:"memoryLimit,omitempty"`
}

// HealthCheckSpec defines health check configuration
type HealthCheckSpec struct {
	// HTTP path for health check
	Path string `json:"path,omitempty"`

	// Port for health check
	Port int32 `json:"port,omitempty"`

	// Initial delay before health check
	InitialDelaySeconds int32 `json:"initialDelaySeconds,omitempty"`

	// Period between health checks
	PeriodSeconds int32 `json:"periodSeconds,omitempty"`
}

// HealthGateSpec defines health gate thresholds for safe rollouts
type HealthGateSpec struct {
	// Maximum error rate (5xx responses) as percentage
	MaxErrorRate float64 `json:"maxErrorRate,omitempty"`

	// Maximum P95 latency in milliseconds
	MaxP95Latency int32 `json:"maxP95Latency,omitempty"`

	// Minimum success rate as percentage
	MinSuccessRate float64 `json:"minSuccessRate,omitempty"`

	// Evaluation window in seconds
	Window int32 `json:"window,omitempty"`

	// Number of consecutive failures before rollback
	FailureThreshold int32 `json:"failureThreshold,omitempty"`

	// Enable/disable health gating
	Enabled bool `json:"enabled,omitempty"`
}

// DeploymentStrategy defines how deployments are rolled out
type DeploymentStrategy struct {
	// Type of deployment (rolling, canary, blue-green)
	Type string `json:"type,omitempty"`

	// Canary configuration
	Canary *CanaryStrategy `json:"canary,omitempty"`
}

// CanaryStrategy defines canary deployment settings
type CanaryStrategy struct {
	// Initial traffic percentage for canary
	InitialWeight int32 `json:"initialWeight,omitempty"`

	// Duration to observe canary before promotion
	ObservationTime string `json:"observationTime,omitempty"`

	// Auto-promote if healthy
	AutoPromote bool `json:"autoPromote,omitempty"`
}

// CloudExpressServiceStatus defines the observed state of CloudExpressService
type CloudExpressServiceStatus struct {
	// Current deployment phase
	Phase string `json:"phase,omitempty"`

	// Number of ready replicas
	ReadyReplicas int32 `json:"readyReplicas,omitempty"`

	// Total number of replicas
	Replicas int32 `json:"replicas,omitempty"`

	// Current image being deployed
	CurrentImage string `json:"currentImage,omitempty"`

	// Previous image for rollback
	PreviousImage string `json:"previousImage,omitempty"`

	// Last update time
	LastUpdateTime metav1.Time `json:"lastUpdateTime,omitempty"`

	// Error message if deployment failed
	Message string `json:"message,omitempty"`

	// Deployment ID for tracking
	DeploymentID string `json:"deploymentId,omitempty"`

	// Service endpoint URL
	Endpoint string `json:"endpoint,omitempty"`

	// Conditions represent the latest available observations
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:resource:shortName=cxs
// +kubebuilder:printcolumn:name="Image",type=string,JSONPath=`.spec.image`
// +kubebuilder:printcolumn:name="Phase",type=string,JSONPath=`.status.phase`
// +kubebuilder:printcolumn:name="Ready",type=string,JSONPath=`.status.readyReplicas`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

// CloudExpressService is the Schema for the cygniservices API
type CloudExpressService struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   CloudExpressServiceSpec   `json:"spec,omitempty"`
	Status CloudExpressServiceStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

// CloudExpressServiceList contains a list of CloudExpressService
type CloudExpressServiceList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []CloudExpressService `json:"items"`
}

func init() {
	SchemeBuilder.Register(&CloudExpressService{}, &CloudExpressServiceList{})
}