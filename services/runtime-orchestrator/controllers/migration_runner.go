package controllers

import (
	"context"
	"fmt"
	"path/filepath"
	"time"

	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	cloudxv1 "github.com/cygni/runtime-orchestrator/api/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"
)

// MigrationRunner handles database migrations before deployments
type MigrationRunner struct {
	client client.Client
	log    logr.Logger
}

type MigrationConfig struct {
	Tool        string // flyway, migrate, sql-migrate, etc.
	Directory   string // migrations directory path
	DatabaseURL string // connection string
}

// RunMigrations executes database migrations before deployment
func (m *MigrationRunner) RunMigrations(ctx context.Context, cxs *cloudxv1.CloudExpressService) error {
	// Check if migrations are needed
	migrationConfig, err := m.detectMigrationConfig(ctx, cxs)
	if err != nil {
		return fmt.Errorf("failed to detect migration config: %w", err)
	}

	if migrationConfig == nil {
		m.log.Info("No migrations detected", "service", cxs.Name)
		return nil
	}

	// Create migration job
	job := m.constructMigrationJob(cxs, migrationConfig)
	
	// Check if job already exists
	existingJob := &batchv1.Job{}
	err = m.client.Get(ctx, types.NamespacedName{
		Name:      job.Name,
		Namespace: job.Namespace,
	}, existingJob)

	if err != nil && !errors.IsNotFound(err) {
		return fmt.Errorf("failed to check existing job: %w", err)
	}

	if err == nil {
		// Job already exists, check status
		if existingJob.Status.Succeeded > 0 {
			m.log.Info("Migrations already completed", "job", job.Name)
			return nil
		}
		if existingJob.Status.Failed > 0 {
			return fmt.Errorf("migration job failed")
		}
		// Job is still running
		return m.waitForJob(ctx, existingJob)
	}

	// Create new migration job
	if err := m.client.Create(ctx, job); err != nil {
		return fmt.Errorf("failed to create migration job: %w", err)
	}

	m.log.Info("Created migration job", "job", job.Name)
	
	// Wait for job completion
	return m.waitForJob(ctx, job)
}

func (m *MigrationRunner) detectMigrationConfig(ctx context.Context, cxs *cloudxv1.CloudExpressService) (*MigrationConfig, error) {
	// Check ConfigMap for migration configuration
	configMap := &corev1.ConfigMap{}
	err := m.client.Get(ctx, types.NamespacedName{
		Name:      fmt.Sprintf("%s-config", cxs.Name),
		Namespace: cxs.Namespace,
	}, configMap)

	if err != nil {
		if errors.IsNotFound(err) {
			return nil, nil // No migrations configured
		}
		return nil, err
	}

	// Look for migration tool configuration
	if tool, ok := configMap.Data["migration.tool"]; ok {
		config := &MigrationConfig{
			Tool:      tool,
			Directory: configMap.Data["migration.directory"],
		}

		// Get database URL from secret
		secret := &corev1.Secret{}
		err = m.client.Get(ctx, types.NamespacedName{
			Name:      fmt.Sprintf("%s-db", cxs.Name),
			Namespace: cxs.Namespace,
		}, secret)

		if err != nil {
			return nil, fmt.Errorf("failed to get database secret: %w", err)
		}

		config.DatabaseURL = string(secret.Data["DATABASE_URL"])
		return config, nil
	}

	return nil, nil
}

func (m *MigrationRunner) constructMigrationJob(cxs *cloudxv1.CloudExpressService, config *MigrationConfig) *batchv1.Job {
	jobName := fmt.Sprintf("%s-migrate-%s", cxs.Name, time.Now().Format("20060102-150405"))
	
	// Select migration image based on tool
	migrationImage := m.getMigrationImage(config.Tool)
	
	// Build command based on tool
	command := m.getMigrationCommand(config.Tool, config.Directory)

	job := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:      jobName,
			Namespace: cxs.Namespace,
			Labels: map[string]string{
				"cygni.io/service":  cxs.Name,
				"cygni.io/type":     "migration",
				"cygni.io/image":    cxs.Spec.Image,
			},
		},
		Spec: batchv1.JobSpec{
			BackoffLimit: &[]int32{3}[0],
			TTLSecondsAfterFinished: &[]int32{3600}[0], // Clean up after 1 hour
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{
						"cygni.io/service": cxs.Name,
						"cygni.io/type":    "migration",
					},
				},
				Spec: corev1.PodSpec{
					RestartPolicy: corev1.RestartPolicyNever,
					InitContainers: []corev1.Container{
						{
							Name:  "wait-for-db",
							Image: "busybox:1.35",
							Command: []string{
								"sh",
								"-c",
								"until nc -z $DB_HOST $DB_PORT; do echo waiting for database...; sleep 2; done",
							},
							Env: m.getDatabaseEnvVars(config.DatabaseURL),
						},
					},
					Containers: []corev1.Container{
						{
							Name:    "migrate",
							Image:   migrationImage,
							Command: command,
							Env: append(
								m.getDatabaseEnvVars(config.DatabaseURL),
								corev1.EnvVar{
									Name:  "DATABASE_URL",
									Value: config.DatabaseURL,
								},
							),
							VolumeMounts: []corev1.VolumeMount{
								{
									Name:      "migrations",
									MountPath: "/migrations",
								},
							},
						},
					},
					Volumes: []corev1.Volume{
						{
							Name: "migrations",
							VolumeSource: corev1.VolumeSource{
								ConfigMap: &corev1.ConfigMapVolumeSource{
									LocalObjectReference: corev1.LocalObjectReference{
										Name: fmt.Sprintf("%s-migrations", cxs.Name),
									},
								},
							},
						},
					},
				},
			},
		},
	}

	return job
}

func (m *MigrationRunner) getMigrationImage(tool string) string {
	images := map[string]string{
		"flyway":      "flyway/flyway:9-alpine",
		"migrate":     "migrate/migrate:v4.16.2",
		"sql-migrate": "kevinburke/go-sql-migrate:latest",
		"goose":       "pressly/goose:v3.15.0",
	}

	if image, ok := images[tool]; ok {
		return image
	}

	// Default to flyway
	return images["flyway"]
}

func (m *MigrationRunner) getMigrationCommand(tool, directory string) []string {
	switch tool {
	case "flyway":
		return []string{
			"flyway",
			"-url=${DATABASE_URL}",
			"-locations=filesystem:/migrations",
			"migrate",
		}
	case "migrate":
		return []string{
			"migrate",
			"-path", "/migrations",
			"-database", "${DATABASE_URL}",
			"up",
		}
	case "sql-migrate":
		return []string{
			"sql-migrate",
			"up",
			"-config=/migrations/dbconfig.yml",
		}
	case "goose":
		return []string{
			"goose",
			"-dir", "/migrations",
			"up",
		}
	default:
		return []string{"echo", "Unknown migration tool"}
	}
}

func (m *MigrationRunner) getDatabaseEnvVars(databaseURL string) []corev1.EnvVar {
	// Parse database URL to extract host and port
	// This is a simplified version - in production, use proper URL parsing
	return []corev1.EnvVar{
		{
			Name:  "DB_HOST",
			Value: "postgres", // This should be parsed from URL
		},
		{
			Name:  "DB_PORT",
			Value: "5432",
		},
	}
}

func (m *MigrationRunner) waitForJob(ctx context.Context, job *batchv1.Job) error {
	timeout := time.After(5 * time.Minute)
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-timeout:
			return fmt.Errorf("migration job timed out")
		case <-ticker.C:
			currentJob := &batchv1.Job{}
			err := m.client.Get(ctx, types.NamespacedName{
				Name:      job.Name,
				Namespace: job.Namespace,
			}, currentJob)

			if err != nil {
				return fmt.Errorf("failed to get job status: %w", err)
			}

			if currentJob.Status.Succeeded > 0 {
				m.log.Info("Migration completed successfully", "job", job.Name)
				return nil
			}

			if currentJob.Status.Failed > 0 {
				// Get pod logs for debugging
				pods := &corev1.PodList{}
				err = m.client.List(ctx, pods, 
					client.InNamespace(job.Namespace),
					client.MatchingLabels{
						"job-name": job.Name,
					})

				if err == nil && len(pods.Items) > 0 {
					// Log the pod status for debugging
					for _, pod := range pods.Items {
						m.log.Error(nil, "Migration pod failed", 
							"pod", pod.Name,
							"status", pod.Status.Phase,
							"reason", pod.Status.Reason)
					}
				}

				return fmt.Errorf("migration job failed")
			}
		}
	}
}

// RollbackMigrations runs down migrations in case of deployment failure
func (m *MigrationRunner) RollbackMigrations(ctx context.Context, cxs *cloudxv1.CloudExpressService) error {
	// Similar to RunMigrations but executes down/rollback commands
	migrationConfig, err := m.detectMigrationConfig(ctx, cxs)
	if err != nil || migrationConfig == nil {
		return nil // No migrations to rollback
	}

	// Modify command for rollback
	job := m.constructMigrationJob(cxs, migrationConfig)
	job.Name = fmt.Sprintf("%s-rollback-%s", cxs.Name, time.Now().Format("20060102-150405"))
	
	// Update command for rollback
	switch migrationConfig.Tool {
	case "flyway":
		job.Spec.Template.Spec.Containers[0].Command = []string{
			"flyway",
			"-url=${DATABASE_URL}",
			"-locations=filesystem:/migrations",
			"undo",
		}
	case "migrate":
		job.Spec.Template.Spec.Containers[0].Command = []string{
			"migrate",
			"-path", "/migrations",
			"-database", "${DATABASE_URL}",
			"down", "1", // Rollback one version
		}
	case "goose":
		job.Spec.Template.Spec.Containers[0].Command = []string{
			"goose",
			"-dir", "/migrations",
			"down",
		}
	}

	if err := m.client.Create(ctx, job); err != nil {
		return fmt.Errorf("failed to create rollback job: %w", err)
	}

	return m.waitForJob(ctx, job)
}