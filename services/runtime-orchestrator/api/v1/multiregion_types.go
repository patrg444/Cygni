package v1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:resource:scope=Cluster,shortName=mrs

// MultiRegionService manages deployments across multiple regions
type MultiRegionService struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   MultiRegionServiceSpec   `json:"spec,omitempty"`
	Status MultiRegionServiceStatus `json:"status,omitempty"`
}

type MultiRegionServiceSpec struct {
	// Reference to the CloudExpressService
	ServiceRef ServiceReference `json:"serviceRef"`

	// Target regions for deployment
	Regions []RegionConfig `json:"regions"`

	// Traffic management strategy
	TrafficPolicy TrafficPolicy `json:"trafficPolicy,omitempty"`

	// Global load balancer configuration
	LoadBalancer LoadBalancerConfig `json:"loadBalancer,omitempty"`
}

type ServiceReference struct {
	// Name of the CloudExpressService
	Name string `json:"name"`

	// Namespace of the CloudExpressService
	Namespace string `json:"namespace"`
}

type RegionConfig struct {
	// Region identifier (e.g., us-east-1, eu-west-1)
	Name string `json:"name"`

	// Weight for traffic distribution (0-100)
	Weight int32 `json:"weight,omitempty"`

	// Override replicas for this region
	Replicas *int32 `json:"replicas,omitempty"`

	// Region-specific environment variables
	Env map[string]string `json:"env,omitempty"`

	// Enable/disable this region
	Enabled bool `json:"enabled"`
}

type TrafficPolicy struct {
	// Strategy: latency, weighted, geolocation
	Strategy string `json:"strategy,omitempty"`

	// Health check configuration
	HealthCheck *HealthCheckConfig `json:"healthCheck,omitempty"`

	// Failover configuration
	Failover *FailoverConfig `json:"failover,omitempty"`
}

type HealthCheckConfig struct {
	// Path for health checks
	Path string `json:"path,omitempty"`

	// Interval between health checks
	Interval string `json:"interval,omitempty"`

	// Timeout for health checks
	Timeout string `json:"timeout,omitempty"`

	// Number of consecutive failures before marking unhealthy
	FailureThreshold int32 `json:"failureThreshold,omitempty"`
}

type FailoverConfig struct {
	// Enable automatic failover
	Enabled bool `json:"enabled"`

	// Primary region
	PrimaryRegion string `json:"primaryRegion,omitempty"`

	// Failover regions in order of preference
	FailoverRegions []string `json:"failoverRegions,omitempty"`
}

type LoadBalancerConfig struct {
	// DNS configuration
	Domain string `json:"domain"`

	// TLS configuration
	TLS *TLSConfig `json:"tls,omitempty"`

	// CDN integration
	CDN *CDNConfig `json:"cdn,omitempty"`
}

type TLSConfig struct {
	// Enable TLS
	Enabled bool `json:"enabled"`

	// Certificate ARN or reference
	Certificate string `json:"certificate,omitempty"`
}

type CDNConfig struct {
	// Enable CDN
	Enabled bool `json:"enabled"`

	// CDN provider (cloudfront, cloudflare, fastly)
	Provider string `json:"provider,omitempty"`

	// Cache behaviors
	CacheBehaviors []CacheBehavior `json:"cacheBehaviors,omitempty"`
}

type CacheBehavior struct {
	// Path pattern
	PathPattern string `json:"pathPattern"`

	// TTL in seconds
	TTL int32 `json:"ttl"`

	// Allowed methods
	AllowedMethods []string `json:"allowedMethods,omitempty"`
}

type MultiRegionServiceStatus struct {
	// Current phase of the multi-region deployment
	Phase string `json:"phase,omitempty"`

	// Regional deployment status
	RegionStatus []RegionStatus `json:"regionStatus,omitempty"`

	// Global endpoint URL
	Endpoint string `json:"endpoint,omitempty"`

	// Last update time
	LastUpdateTime metav1.Time `json:"lastUpdateTime,omitempty"`

	// Conditions
	Conditions []metav1.Condition `json:"conditions,omitempty"`
}

type RegionStatus struct {
	// Region name
	Region string `json:"region"`

	// Deployment status in this region
	Status string `json:"status"`

	// Regional endpoint
	Endpoint string `json:"endpoint,omitempty"`

	// Number of ready replicas
	ReadyReplicas int32 `json:"readyReplicas"`

	// Health status
	Healthy bool `json:"healthy"`

	// Last health check time
	LastHealthCheck metav1.Time `json:"lastHealthCheck,omitempty"`
}

// +kubebuilder:object:root=true

// MultiRegionServiceList contains a list of MultiRegionService
type MultiRegionServiceList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []MultiRegionService `json:"items"`
}