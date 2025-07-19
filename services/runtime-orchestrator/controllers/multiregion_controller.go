package controllers

import (
	"context"
	"fmt"
	"time"

	"github.com/go-logr/logr"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"

	cloudxv1 "github.com/cygni/runtime-orchestrator/api/v1"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/route53"
)

// MultiRegionServiceReconciler reconciles a MultiRegionService object
type MultiRegionServiceReconciler struct {
	client.Client
	Log            logr.Logger
	Scheme         *runtime.Scheme
	Route53Client  *route53.Route53
	RegionClusters map[string]*RegionCluster
}

type RegionCluster struct {
	Name     string
	Endpoint string
	Client   client.Client
}

func (r *MultiRegionServiceReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := r.Log.WithValues("multiregionservice", req.NamespacedName)

	// Fetch the MultiRegionService
	mrs := &cloudxv1.MultiRegionService{}
	if err := r.Get(ctx, req.NamespacedName, mrs); err != nil {
		if errors.IsNotFound(err) {
			return ctrl.Result{}, nil
		}
		return ctrl.Result{}, err
	}

	// Get the referenced CloudExpressService
	cxs := &cloudxv1.CloudExpressService{}
	if err := r.Get(ctx, types.NamespacedName{
		Name:      mrs.Spec.ServiceRef.Name,
		Namespace: mrs.Spec.ServiceRef.Namespace,
	}, cxs); err != nil {
		log.Error(err, "Failed to get CloudExpressService")
		return ctrl.Result{}, err
	}

	// Update status
	mrs.Status.Phase = "Reconciling"
	mrs.Status.LastUpdateTime = metav1.Now()

	// Deploy to each region
	regionStatuses := []cloudxv1.RegionStatus{}
	allHealthy := true

	for _, region := range mrs.Spec.Regions {
		if !region.Enabled {
			continue
		}

		status, err := r.deployToRegion(ctx, mrs, cxs, region)
		if err != nil {
			log.Error(err, "Failed to deploy to region", "region", region.Name)
			status = cloudxv1.RegionStatus{
				Region:  region.Name,
				Status:  "Failed",
				Healthy: false,
			}
			allHealthy = false
		}

		regionStatuses = append(regionStatuses, status)
	}

	mrs.Status.RegionStatus = regionStatuses

	// Configure global load balancing
	if allHealthy && mrs.Spec.LoadBalancer.Domain != "" {
		endpoint, err := r.configureGlobalLoadBalancer(ctx, mrs)
		if err != nil {
			log.Error(err, "Failed to configure global load balancer")
			mrs.Status.Phase = "Failed"
		} else {
			mrs.Status.Endpoint = endpoint
			mrs.Status.Phase = "Ready"
		}
	} else if !allHealthy {
		mrs.Status.Phase = "Degraded"
	}

	// Update status
	if err := r.Status().Update(ctx, mrs); err != nil {
		return ctrl.Result{}, err
	}

	// Requeue for health checks
	return ctrl.Result{RequeueAfter: 60 * time.Second}, nil
}

func (r *MultiRegionServiceReconciler) deployToRegion(ctx context.Context, mrs *cloudxv1.MultiRegionService, cxs *cloudxv1.CloudExpressService, region cloudxv1.RegionConfig) (cloudxv1.RegionStatus, error) {
	regionCluster, ok := r.RegionClusters[region.Name]
	if !ok {
		return cloudxv1.RegionStatus{}, fmt.Errorf("region cluster not configured: %s", region.Name)
	}

	// Create a copy of the CloudExpressService for this region
	regionalCXS := cxs.DeepCopy()
	regionalCXS.Name = fmt.Sprintf("%s-%s", cxs.Name, region.Name)
	regionalCXS.Namespace = cxs.Namespace
	
	// Apply region-specific overrides
	if region.Replicas != nil {
		regionalCXS.Spec.Autoscale.Min = *region.Replicas
		regionalCXS.Spec.Autoscale.Max = *region.Replicas * 2
	}

	// Add region-specific environment variables
	if regionalCXS.Spec.Env == nil {
		regionalCXS.Spec.Env = make(map[string]string)
	}
	for k, v := range region.Env {
		regionalCXS.Spec.Env[k] = v
	}
	regionalCXS.Spec.Env["CLOUDEXPRESS_REGION"] = region.Name

	// Deploy to regional cluster
	existingCXS := &cloudxv1.CloudExpressService{}
	err := regionCluster.Client.Get(ctx, types.NamespacedName{
		Name:      regionalCXS.Name,
		Namespace: regionalCXS.Namespace,
	}, existingCXS)

	if err != nil {
		if errors.IsNotFound(err) {
			// Create new deployment
			if err := regionCluster.Client.Create(ctx, regionalCXS); err != nil {
				return cloudxv1.RegionStatus{}, fmt.Errorf("failed to create regional service: %w", err)
			}
		} else {
			return cloudxv1.RegionStatus{}, fmt.Errorf("failed to get regional service: %w", err)
		}
	} else {
		// Update existing deployment
		existingCXS.Spec = regionalCXS.Spec
		if err := regionCluster.Client.Update(ctx, existingCXS); err != nil {
			return cloudxv1.RegionStatus{}, fmt.Errorf("failed to update regional service: %w", err)
		}
	}

	// Get deployment status
	deploymentStatus := &cloudxv1.CloudExpressService{}
	if err := regionCluster.Client.Get(ctx, types.NamespacedName{
		Name:      regionalCXS.Name,
		Namespace: regionalCXS.Namespace,
	}, deploymentStatus); err != nil {
		return cloudxv1.RegionStatus{}, fmt.Errorf("failed to get deployment status: %w", err)
	}

	// Perform health check
	healthy := r.checkRegionHealth(ctx, region, deploymentStatus)

	return cloudxv1.RegionStatus{
		Region:          region.Name,
		Status:          string(deploymentStatus.Status.Phase),
		Endpoint:        fmt.Sprintf("https://%s.%s.cygni.app", cxs.Name, region.Name),
		ReadyReplicas:   deploymentStatus.Status.ReadyReplicas,
		Healthy:         healthy,
		LastHealthCheck: metav1.Now(),
	}, nil
}

func (r *MultiRegionServiceReconciler) configureGlobalLoadBalancer(ctx context.Context, mrs *cloudxv1.MultiRegionService) (string, error) {
	// Configure Route53 for global load balancing
	hostedZoneID := r.getHostedZoneID(mrs.Spec.LoadBalancer.Domain)
	
	// Create weighted routing policy records
	changeSet := &route53.ChangeBatch{
		Changes: []*route53.Change{},
	}

	for _, regionStatus := range mrs.Status.RegionStatus {
		if !regionStatus.Healthy {
			continue
		}

		// Find region config
		var regionConfig *cloudxv1.RegionConfig
		for _, rc := range mrs.Spec.Regions {
			if rc.Name == regionStatus.Region {
				regionConfig = &rc
				break
			}
		}

		if regionConfig == nil {
			continue
		}

		weight := int64(100 / len(mrs.Spec.Regions)) // Default equal weight
		if regionConfig.Weight > 0 {
			weight = int64(regionConfig.Weight)
		}

		change := &route53.Change{
			Action: aws.String("UPSERT"),
			ResourceRecordSet: &route53.ResourceRecordSet{
				Name: aws.String(mrs.Spec.LoadBalancer.Domain),
				Type: aws.String("A"),
				SetIdentifier: aws.String(regionStatus.Region),
				Weight: aws.Int64(weight),
				AliasTarget: &route53.AliasTarget{
					HostedZoneId: aws.String(r.getRegionalHostedZoneID(regionStatus.Region)),
					DNSName:      aws.String(regionStatus.Endpoint),
					EvaluateTargetHealth: aws.Bool(true),
				},
			},
		}

		changeSet.Changes = append(changeSet.Changes, change)
	}

	// Apply Route53 changes
	_, err := r.Route53Client.ChangeResourceRecordSets(&route53.ChangeResourceRecordSetsInput{
		HostedZoneId: aws.String(hostedZoneID),
		ChangeBatch:  changeSet,
	})

	if err != nil {
		return "", fmt.Errorf("failed to update Route53: %w", err)
	}

	return fmt.Sprintf("https://%s", mrs.Spec.LoadBalancer.Domain), nil
}

func (r *MultiRegionServiceReconciler) checkRegionHealth(ctx context.Context, region cloudxv1.RegionConfig, deployment *cloudxv1.CloudExpressService) bool {
	// Simple health check - verify deployment is running and has ready replicas
	if deployment.Status.Phase != "Running" {
		return false
	}

	if deployment.Status.ReadyReplicas == 0 {
		return false
	}

	// TODO: Implement actual HTTP health checks
	return true
}

func (r *MultiRegionServiceReconciler) getHostedZoneID(domain string) string {
	// In production, this would look up the hosted zone ID from Route53
	return "Z1234567890ABC"
}

func (r *MultiRegionServiceReconciler) getRegionalHostedZoneID(region string) string {
	// Regional hosted zone IDs for ALB/NLB
	regionalZones := map[string]string{
		"us-east-1": "Z35SXDOTRQ7X7K",
		"us-west-2": "Z1H1FL5HABSF5",
		"eu-west-1": "Z32O12XQLNTSW2",
		"eu-central-1": "Z3F0SRJ5LGBH90",
		"ap-southeast-1": "Z1LMS91P8CMLE5",
	}

	if zoneID, ok := regionalZones[region]; ok {
		return zoneID
	}
	
	return "Z35SXDOTRQ7X7K" // Default to us-east-1
}

func (r *MultiRegionServiceReconciler) SetupWithManager(mgr ctrl.Manager) error {
	// Initialize Route53 client
	sess := session.Must(session.NewSession())
	r.Route53Client = route53.New(sess)

	// Initialize region clusters (would be configured from environment)
	r.RegionClusters = map[string]*RegionCluster{
		"us-east-1": {
			Name:     "us-east-1",
			Endpoint: "https://k8s-us-east-1.cygni.io",
			Client:   mgr.GetClient(), // In production, would create client for remote cluster
		},
		"eu-west-1": {
			Name:     "eu-west-1", 
			Endpoint: "https://k8s-eu-west-1.cygni.io",
			Client:   mgr.GetClient(), // In production, would create client for remote cluster
		},
	}

	return ctrl.NewControllerManagedBy(mgr).
		For(&cloudxv1.MultiRegionService{}).
		Complete(r)
}