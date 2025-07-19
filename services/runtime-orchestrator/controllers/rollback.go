package controllers

import (
	"context"
	"fmt"

	cloudxv1 "github.com/cygni/runtime-orchestrator/api/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
)

// RollbackService rolls back a CloudExpressService to its previous image
func (r *CloudExpressServiceReconciler) RollbackService(ctx context.Context, namespace, name string) error {
	cxs := &cloudxv1.CloudExpressService{}
	if err := r.Get(ctx, types.NamespacedName{
		Namespace: namespace,
		Name:      name,
	}, cxs); err != nil {
		return fmt.Errorf("failed to get CloudExpressService: %w", err)
	}

	if cxs.Status.PreviousImage == "" {
		return fmt.Errorf("no previous image available for rollback")
	}

	// Store current as next previous
	currentImage := cxs.Spec.Image
	
	// Update spec with previous image
	cxs.Spec.Image = cxs.Status.PreviousImage
	
	if err := r.Update(ctx, cxs); err != nil {
		return fmt.Errorf("failed to update CloudExpressService: %w", err)
	}

	// Update status to reflect rollback
	cxs.Status.PreviousImage = currentImage
	cxs.Status.Phase = "RollingBack"
	cxs.Status.Message = fmt.Sprintf("Rolling back from %s to %s", currentImage, cxs.Spec.Image)
	
	if err := r.Status().Update(ctx, cxs); err != nil {
		return fmt.Errorf("failed to update status: %w", err)
	}

	r.Log.Info("Initiated rollback", 
		"service", name, 
		"namespace", namespace,
		"from", currentImage,
		"to", cxs.Spec.Image)

	return nil
}

// GetDeploymentStatus returns the current status of a CloudExpressService
func (r *CloudExpressServiceReconciler) GetDeploymentStatus(ctx context.Context, namespace, name string) (*DeploymentStatus, error) {
	cxs := &cloudxv1.CloudExpressService{}
	if err := r.Get(ctx, types.NamespacedName{
		Namespace: namespace,
		Name:      name,
	}, cxs); err != nil {
		return nil, err
	}

	return &DeploymentStatus{
		Phase:         cxs.Status.Phase,
		CurrentImage:  cxs.Status.CurrentImage,
		PreviousImage: cxs.Status.PreviousImage,
		Replicas:      cxs.Status.Replicas,
		ReadyReplicas: cxs.Status.ReadyReplicas,
		Message:       cxs.Status.Message,
		Endpoint:      cxs.Status.Endpoint,
		DeploymentID:  cxs.Status.DeploymentID,
	}, nil
}

type DeploymentStatus struct {
	Phase         string
	CurrentImage  string
	PreviousImage string
	Replicas      int32
	ReadyReplicas int32
	Message       string
	Endpoint      string
	DeploymentID  string
}

// PromoteCanaryDeployment promotes a canary deployment to stable
func (r *CloudExpressServiceReconciler) PromoteCanaryDeployment(ctx context.Context, namespace, name string) error {
	// For future implementation of canary deployments
	// This would update the stable track with the canary image
	return fmt.Errorf("canary deployments not yet implemented")
}

// ScaleService scales a CloudExpressService to the specified number of replicas
func (r *CloudExpressServiceReconciler) ScaleService(ctx context.Context, namespace, name string, replicas int32) error {
	cxs := &cloudxv1.CloudExpressService{}
	if err := r.Get(ctx, types.NamespacedName{
		Namespace: namespace,
		Name:      name,
	}, cxs); err != nil {
		return fmt.Errorf("failed to get CloudExpressService: %w", err)
	}

	// Update autoscale min to the specified replicas
	cxs.Spec.Autoscale.Min = replicas
	
	if err := r.Update(ctx, cxs); err != nil {
		return fmt.Errorf("failed to update CloudExpressService: %w", err)
	}

	r.Log.Info("Scaled service", 
		"service", name, 
		"namespace", namespace,
		"replicas", replicas)

	return nil
}