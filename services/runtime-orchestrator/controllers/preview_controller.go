package controllers

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/go-logr/logr"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"

	cloudxv1 "github.com/cygni/runtime-orchestrator/api/v1"
)

// PreviewEnvironment represents a PR preview environment
type PreviewEnvironment struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   PreviewEnvironmentSpec   `json:"spec,omitempty"`
	Status PreviewEnvironmentStatus `json:"status,omitempty"`
}

type PreviewEnvironmentSpec struct {
	// PR number
	PullRequest int `json:"pullRequest"`
	
	// Branch name
	Branch string `json:"branch"`
	
	// Project ID
	ProjectID string `json:"projectId"`
	
	// Base environment to clone from
	BaseEnvironment string `json:"baseEnvironment"`
	
	// TTL for auto-deletion
	TTL metav1.Duration `json:"ttl,omitempty"`
	
	// Database configuration
	Database *PreviewDatabaseSpec `json:"database,omitempty"`
}

type PreviewDatabaseSpec struct {
	// Clone from production database
	CloneFrom string `json:"cloneFrom,omitempty"`
	
	// Maximum size for cloned data
	MaxSize resource.Quantity `json:"maxSize,omitempty"`
	
	// Anonymize sensitive data
	Anonymize bool `json:"anonymize,omitempty"`
}

type PreviewEnvironmentStatus struct {
	// Current phase
	Phase string `json:"phase,omitempty"`
	
	// Namespace created
	Namespace string `json:"namespace,omitempty"`
	
	// Preview URL
	URL string `json:"url,omitempty"`
	
	// Database connection string (encrypted)
	DatabaseURL string `json:"databaseUrl,omitempty"`
	
	// Creation time
	CreatedAt metav1.Time `json:"createdAt,omitempty"`
	
	// Last activity time
	LastActivity metav1.Time `json:"lastActivity,omitempty"`
	
	// Expiry time
	ExpiresAt metav1.Time `json:"expiresAt,omitempty"`
}

// PreviewEnvironmentReconciler manages preview environments
type PreviewEnvironmentReconciler struct {
	client.Client
	Log    logr.Logger
	Scheme *runtime.Scheme
}

func (r *PreviewEnvironmentReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := r.Log.WithValues("preview", req.NamespacedName)

	// Fetch the PreviewEnvironment
	preview := &PreviewEnvironment{}
	if err := r.Get(ctx, req.NamespacedName, preview); err != nil {
		if errors.IsNotFound(err) {
			return ctrl.Result{}, nil
		}
		return ctrl.Result{}, err
	}

	// Check if marked for deletion
	if !preview.DeletionTimestamp.IsZero() {
		return r.handleDeletion(ctx, preview)
	}

	// Add finalizer
	if !controllerutil.ContainsFinalizer(preview, "preview.cygni.io/finalizer") {
		controllerutil.AddFinalizer(preview, "preview.cygni.io/finalizer")
		if err := r.Update(ctx, preview); err != nil {
			return ctrl.Result{}, err
		}
	}

	// Check TTL expiry
	if r.isExpired(preview) {
		log.Info("Preview environment expired, deleting", "preview", preview.Name)
		if err := r.Delete(ctx, preview); err != nil {
			return ctrl.Result{}, err
		}
		return ctrl.Result{}, nil
	}

	// Create namespace if needed
	if preview.Status.Namespace == "" {
		namespace := r.generateNamespaceName(preview)
		if err := r.createPreviewNamespace(ctx, preview, namespace); err != nil {
			log.Error(err, "Failed to create namespace")
			preview.Status.Phase = "Failed"
			r.Status().Update(ctx, preview)
			return ctrl.Result{}, err
		}
		
		preview.Status.Namespace = namespace
		preview.Status.Phase = "Creating"
		preview.Status.CreatedAt = metav1.Now()
		preview.Status.LastActivity = metav1.Now()
		
		// Set expiry time
		ttl := 72 * time.Hour // Default 72 hours
		if preview.Spec.TTL.Duration > 0 {
			ttl = preview.Spec.TTL.Duration
		}
		preview.Status.ExpiresAt = metav1.NewTime(time.Now().Add(ttl))
		
		if err := r.Status().Update(ctx, preview); err != nil {
			return ctrl.Result{}, err
		}
	}

	// Clone database if needed
	if preview.Spec.Database != nil && preview.Status.DatabaseURL == "" {
		dbURL, err := r.cloneDatabase(ctx, preview)
		if err != nil {
			log.Error(err, "Failed to clone database")
			preview.Status.Phase = "Failed"
			r.Status().Update(ctx, preview)
			return ctrl.Result{RequeueAfter: 30 * time.Second}, err
		}
		
		preview.Status.DatabaseURL = dbURL
		if err := r.Status().Update(ctx, preview); err != nil {
			return ctrl.Result{}, err
		}
	}

	// Copy secrets from base environment
	if err := r.copySecrets(ctx, preview); err != nil {
		log.Error(err, "Failed to copy secrets")
		return ctrl.Result{RequeueAfter: 10 * time.Second}, err
	}

	// Create ingress for preview
	if preview.Status.URL == "" {
		url, err := r.createPreviewIngress(ctx, preview)
		if err != nil {
			log.Error(err, "Failed to create ingress")
			return ctrl.Result{RequeueAfter: 10 * time.Second}, err
		}
		
		preview.Status.URL = url
		preview.Status.Phase = "Ready"
		if err := r.Status().Update(ctx, preview); err != nil {
			return ctrl.Result{}, err
		}
	}

	// Requeue for TTL check
	timeUntilExpiry := preview.Status.ExpiresAt.Time.Sub(time.Now())
	if timeUntilExpiry > 0 {
		return ctrl.Result{RequeueAfter: timeUntilExpiry}, nil
	}

	return ctrl.Result{}, nil
}

func (r *PreviewEnvironmentReconciler) handleDeletion(ctx context.Context, preview *PreviewEnvironment) (ctrl.Result, error) {
	if controllerutil.ContainsFinalizer(preview, "preview.cygni.io/finalizer") {
		// Clean up namespace
		if preview.Status.Namespace != "" {
			namespace := &corev1.Namespace{}
			if err := r.Get(ctx, types.NamespacedName{Name: preview.Status.Namespace}, namespace); err == nil {
				if err := r.Delete(ctx, namespace); err != nil && !errors.IsNotFound(err) {
					return ctrl.Result{}, err
				}
			}
		}

		// Clean up database
		if preview.Status.DatabaseURL != "" {
			if err := r.deleteDatabase(ctx, preview); err != nil {
				r.Log.Error(err, "Failed to delete database", "preview", preview.Name)
				// Continue with deletion anyway
			}
		}

		// Remove finalizer
		controllerutil.RemoveFinalizer(preview, "preview.cygni.io/finalizer")
		if err := r.Update(ctx, preview); err != nil {
			return ctrl.Result{}, err
		}
	}

	return ctrl.Result{}, nil
}

func (r *PreviewEnvironmentReconciler) createPreviewNamespace(ctx context.Context, preview *PreviewEnvironment, namespaceName string) error {
	namespace := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name: namespaceName,
			Labels: map[string]string{
				"cygni.io/preview":    "true",
				"cygni.io/project-id": preview.Spec.ProjectID,
				"cygni.io/pr":         fmt.Sprintf("%d", preview.Spec.PullRequest),
				"cygni.io/branch":     preview.Spec.Branch,
			},
			Annotations: map[string]string{
				"cygni.io/expires-at": preview.Status.ExpiresAt.Format(time.RFC3339),
			},
		},
	}

	if err := r.Create(ctx, namespace); err != nil {
		return err
	}

	// Create resource quota
	quota := &corev1.ResourceQuota{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "preview-quota",
			Namespace: namespaceName,
		},
		Spec: corev1.ResourceQuotaSpec{
			Hard: corev1.ResourceList{
				corev1.ResourceCPU:              resource.MustParse("4"),
				corev1.ResourceMemory:           resource.MustParse("8Gi"),
				corev1.ResourcePods:             resource.MustParse("10"),
				corev1.ResourcePersistentVolumeClaims: resource.MustParse("5"),
			},
		},
	}

	if err := r.Create(ctx, quota); err != nil {
		return err
	}

	// Create limit range
	limitRange := &corev1.LimitRange{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "preview-limits",
			Namespace: namespaceName,
		},
		Spec: corev1.LimitRangeSpec{
			Limits: []corev1.LimitRangeItem{
				{
					Type: corev1.LimitTypeContainer,
					Default: corev1.ResourceList{
						corev1.ResourceCPU:    resource.MustParse("500m"),
						corev1.ResourceMemory: resource.MustParse("512Mi"),
					},
					DefaultRequest: corev1.ResourceList{
						corev1.ResourceCPU:    resource.MustParse("100m"),
						corev1.ResourceMemory: resource.MustParse("128Mi"),
					},
					Max: corev1.ResourceList{
						corev1.ResourceCPU:    resource.MustParse("2"),
						corev1.ResourceMemory: resource.MustParse("2Gi"),
					},
				},
			},
		},
	}

	return r.Create(ctx, limitRange)
}

func (r *PreviewEnvironmentReconciler) copySecrets(ctx context.Context, preview *PreviewEnvironment) error {
	// List secrets from base environment namespace
	baseNamespace := fmt.Sprintf("cygni-%s", preview.Spec.BaseEnvironment)
	secrets := &corev1.SecretList{}
	
	if err := r.List(ctx, secrets, client.InNamespace(baseNamespace)); err != nil {
		return err
	}

	// Copy relevant secrets to preview namespace
	for _, secret := range secrets.Items {
		// Skip system secrets
		if strings.HasPrefix(secret.Name, "default-token-") || 
		   strings.HasSuffix(secret.Name, "-tls") {
			continue
		}

		newSecret := &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{
				Name:      secret.Name,
				Namespace: preview.Status.Namespace,
				Labels: map[string]string{
					"cygni.io/copied-from": baseNamespace,
				},
			},
			Type: secret.Type,
			Data: secret.Data,
		}

		if err := r.Create(ctx, newSecret); err != nil && !errors.IsAlreadyExists(err) {
			return err
		}
	}

	// Add preview-specific environment variables
	envSecret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "preview-env",
			Namespace: preview.Status.Namespace,
		},
		StringData: map[string]string{
			"CLOUDEXPRESS_ENVIRONMENT": "preview",
			"CLOUDEXPRESS_PR":          fmt.Sprintf("%d", preview.Spec.PullRequest),
			"CLOUDEXPRESS_BRANCH":      preview.Spec.Branch,
			"DATABASE_URL":             preview.Status.DatabaseURL,
		},
	}

	return r.Create(ctx, envSecret)
}

func (r *PreviewEnvironmentReconciler) createPreviewIngress(ctx context.Context, preview *PreviewEnvironment) (string, error) {
	// Generate preview URL
	host := fmt.Sprintf("pr-%d--%s.preview.cygni.app", 
		preview.Spec.PullRequest, 
		strings.ReplaceAll(preview.Spec.ProjectID, "_", "-"))

	// Create wildcard ingress for the namespace
	pathType := networkingv1.PathTypePrefix
	ingress := &networkingv1.Ingress{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "preview-ingress",
			Namespace: preview.Status.Namespace,
			Annotations: map[string]string{
				"kubernetes.io/ingress.class":    "nginx",
				"cert-manager.io/cluster-issuer": "letsencrypt-prod",
			},
		},
		Spec: networkingv1.IngressSpec{
			TLS: []networkingv1.IngressTLS{
				{
					Hosts:      []string{host},
					SecretName: "preview-tls",
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
											Name: "app", // Assumes main app service is named "app"
											Port: networkingv1.ServiceBackendPort{
												Number: 80,
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

	if err := r.Create(ctx, ingress); err != nil && !errors.IsAlreadyExists(err) {
		return "", err
	}

	return fmt.Sprintf("https://%s", host), nil
}

func (r *PreviewEnvironmentReconciler) cloneDatabase(ctx context.Context, preview *PreviewEnvironment) (string, error) {
	// In a real implementation, this would:
	// 1. Create a new database branch (e.g., using Neon API)
	// 2. Or create RDS snapshot and restore
	// 3. Apply data anonymization if needed
	// 4. Return connection string

	// For now, return a placeholder
	dbName := fmt.Sprintf("preview_pr_%d", preview.Spec.PullRequest)
	return fmt.Sprintf("postgresql://preview:password@postgres:5432/%s", dbName), nil
}

func (r *PreviewEnvironmentReconciler) deleteDatabase(ctx context.Context, preview *PreviewEnvironment) error {
	// Clean up cloned database
	// This would call the appropriate cloud provider API
	return nil
}

func (r *PreviewEnvironmentReconciler) generateNamespaceName(preview *PreviewEnvironment) string {
	// Generate a unique namespace name
	projectSlug := strings.ReplaceAll(preview.Spec.ProjectID, "_", "-")
	return fmt.Sprintf("pr-%d-%s", preview.Spec.PullRequest, projectSlug)
}

func (r *PreviewEnvironmentReconciler) isExpired(preview *PreviewEnvironment) bool {
	if preview.Status.ExpiresAt.IsZero() {
		return false
	}
	return time.Now().After(preview.Status.ExpiresAt.Time)
}

func (r *PreviewEnvironmentReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&PreviewEnvironment{}).
		Owns(&corev1.Namespace{}).
		Complete(r)
}