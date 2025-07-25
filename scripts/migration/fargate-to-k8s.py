#!/usr/bin/env python3
"""
Convert AWS Fargate task definitions to Kubernetes manifests
Usage: python fargate-to-k8s.py <task-def.json> <service.json>
"""

import json
import yaml
import sys
import os
from pathlib import Path


def convert_memory_to_mi(memory_mb):
    """Convert memory from MB to Mi format"""
    return f"{memory_mb}Mi"


def convert_cpu_to_millicores(cpu_units):
    """Convert CPU units to millicores (1 vCPU = 1024 units = 1000m)"""
    return f"{int(cpu_units * 1000 / 1024)}m"


def create_resource_requirements(container):
    """Create Kubernetes resource requirements from Fargate container definition"""
    resources = {"requests": {}, "limits": {}}
    
    if "memory" in container:
        memory_mi = convert_memory_to_mi(container["memory"])
        resources["limits"]["memory"] = memory_mi
        resources["requests"]["memory"] = convert_memory_to_mi(int(container["memory"] * 0.8))
    
    if "cpu" in container:
        cpu_m = convert_cpu_to_millicores(container["cpu"])
        resources["limits"]["cpu"] = cpu_m
        resources["requests"]["cpu"] = convert_cpu_to_millicores(int(container["cpu"] * 0.8))
    
    return resources


def convert_environment_variables(container, app_name):
    """Convert environment variables and secrets"""
    env_vars = []
    
    # Regular environment variables
    for env_var in container.get("environment", []):
        env_vars.append({
            "name": env_var["name"],
            "value": env_var["value"]
        })
    
    # Secrets
    for secret in container.get("secrets", []):
        env_vars.append({
            "name": secret["name"],
            "valueFrom": {
                "secretKeyRef": {
                    "name": f"{app_name}-secrets",
                    "key": secret["name"]
                }
            }
        })
    
    return env_vars


def create_deployment(task_def, service, app_name):
    """Create Kubernetes Deployment from Fargate task definition"""
    containers = []
    
    for container in task_def["containerDefinitions"]:
        k8s_container = {
            "name": container["name"],
            "image": container["image"],
            "imagePullPolicy": "IfNotPresent"
        }
        
        # Ports
        if "portMappings" in container:
            k8s_container["ports"] = []
            for port_mapping in container["portMappings"]:
                k8s_container["ports"].append({
                    "name": f"port-{port_mapping['containerPort']}",
                    "containerPort": port_mapping["containerPort"],
                    "protocol": port_mapping.get("protocol", "TCP").upper()
                })
        
        # Environment variables
        env_vars = convert_environment_variables(container, app_name)
        if env_vars:
            k8s_container["env"] = env_vars
        
        # Resources
        k8s_container["resources"] = create_resource_requirements(container)
        
        # Health checks
        if "healthCheck" in container:
            health_check = container["healthCheck"]
            k8s_container["livenessProbe"] = {
                "httpGet": {
                    "path": health_check.get("command", ["/health"])[0],
                    "port": container.get("portMappings", [{"containerPort": 80}])[0]["containerPort"]
                },
                "initialDelaySeconds": health_check.get("startPeriod", 30),
                "periodSeconds": health_check.get("interval", 30),
                "timeoutSeconds": health_check.get("timeout", 5),
                "failureThreshold": health_check.get("retries", 3)
            }
        
        # Command and args
        if "command" in container:
            k8s_container["command"] = container["command"]
        if "entryPoint" in container:
            k8s_container["command"] = container["entryPoint"]
        
        containers.append(k8s_container)
    
    deployment = {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {
            "name": app_name,
            "labels": {
                "app": app_name,
                "managed-by": "cygni",
                "migrated-from": "fargate"
            }
        },
        "spec": {
            "replicas": service.get("desiredCount", 2),
            "selector": {
                "matchLabels": {
                    "app": app_name
                }
            },
            "template": {
                "metadata": {
                    "labels": {
                        "app": app_name
                    }
                },
                "spec": {
                    "containers": containers,
                    "restartPolicy": "Always"
                }
            },
            "strategy": {
                "type": "RollingUpdate",
                "rollingUpdate": {
                    "maxSurge": 1,
                    "maxUnavailable": 0
                }
            }
        }
    }
    
    # Add IAM role if specified
    if "taskRoleArn" in task_def:
        deployment["spec"]["template"]["spec"]["serviceAccountName"] = app_name
    
    return deployment


def create_service(task_def, app_name):
    """Create Kubernetes Service from container port mappings"""
    ports = []
    
    for container in task_def["containerDefinitions"]:
        for port_mapping in container.get("portMappings", []):
            ports.append({
                "name": f"port-{port_mapping['containerPort']}",
                "port": port_mapping["containerPort"],
                "targetPort": port_mapping["containerPort"],
                "protocol": port_mapping.get("protocol", "TCP").upper()
            })
    
    if not ports:
        # Default port if none specified
        ports = [{
            "name": "http",
            "port": 80,
            "targetPort": 80,
            "protocol": "TCP"
        }]
    
    service = {
        "apiVersion": "v1",
        "kind": "Service",
        "metadata": {
            "name": app_name,
            "labels": {
                "app": app_name,
                "managed-by": "cygni"
            }
        },
        "spec": {
            "type": "ClusterIP",
            "selector": {
                "app": app_name
            },
            "ports": ports
        }
    }
    
    return service


def create_ingress(service_def, app_name, service_ports):
    """Create Ingress if load balancer is configured"""
    if not service_def.get("loadBalancers"):
        return None
    
    ingress = {
        "apiVersion": "networking.k8s.io/v1",
        "kind": "Ingress",
        "metadata": {
            "name": app_name,
            "annotations": {
                "kubernetes.io/ingress.class": "alb",
                "alb.ingress.kubernetes.io/scheme": "internet-facing",
                "alb.ingress.kubernetes.io/target-type": "ip",
                "alb.ingress.kubernetes.io/healthcheck-path": "/health"
            },
            "labels": {
                "app": app_name,
                "managed-by": "cygni"
            }
        },
        "spec": {
            "rules": [{
                "http": {
                    "paths": [{
                        "path": "/",
                        "pathType": "Prefix",
                        "backend": {
                            "service": {
                                "name": app_name,
                                "port": {
                                    "number": service_ports[0]["port"]
                                }
                            }
                        }
                    }]
                }
            }]
        }
    }
    
    # Add SSL if configured
    load_balancer = service_def["loadBalancers"][0]
    if "certificateArn" in load_balancer:
        ingress["metadata"]["annotations"]["alb.ingress.kubernetes.io/certificate-arn"] = load_balancer["certificateArn"]
        ingress["metadata"]["annotations"]["alb.ingress.kubernetes.io/ssl-redirect"] = "443"
    
    return ingress


def create_service_account(task_def, app_name):
    """Create ServiceAccount if IAM role is used"""
    if "taskRoleArn" not in task_def:
        return None
    
    role_arn = task_def["taskRoleArn"]
    
    service_account = {
        "apiVersion": "v1",
        "kind": "ServiceAccount",
        "metadata": {
            "name": app_name,
            "annotations": {
                "eks.amazonaws.com/role-arn": role_arn
            },
            "labels": {
                "app": app_name,
                "managed-by": "cygni"
            }
        }
    }
    
    return service_account


def create_hpa(app_name, min_replicas=2, max_replicas=10):
    """Create HorizontalPodAutoscaler"""
    hpa = {
        "apiVersion": "autoscaling/v2",
        "kind": "HorizontalPodAutoscaler",
        "metadata": {
            "name": app_name,
            "labels": {
                "app": app_name,
                "managed-by": "cygni"
            }
        },
        "spec": {
            "scaleTargetRef": {
                "apiVersion": "apps/v1",
                "kind": "Deployment",
                "name": app_name
            },
            "minReplicas": min_replicas,
            "maxReplicas": max_replicas,
            "metrics": [
                {
                    "type": "Resource",
                    "resource": {
                        "name": "cpu",
                        "target": {
                            "type": "Utilization",
                            "averageUtilization": 70
                        }
                    }
                },
                {
                    "type": "Resource",
                    "resource": {
                        "name": "memory",
                        "target": {
                            "type": "Utilization",
                            "averageUtilization": 80
                        }
                    }
                }
            ]
        }
    }
    
    return hpa


def main():
    if len(sys.argv) != 3:
        print("Usage: fargate-to-k8s.py <task-def.json> <service.json>")
        print("Example: fargate-to-k8s.py task-def-api.json service-api.json")
        sys.exit(1)
    
    task_def_path = sys.argv[1]
    service_path = sys.argv[2]
    
    # Load JSON files
    try:
        with open(task_def_path) as f:
            task_def = json.load(f)
        
        with open(service_path) as f:
            service = json.load(f)
    except Exception as e:
        print(f"Error loading files: {e}")
        sys.exit(1)
    
    app_name = task_def.get("family", "cygni-app")
    
    # Create output directory
    output_dir = Path("k8s-manifests")
    output_dir.mkdir(exist_ok=True)
    
    # Generate manifests
    manifests = []
    
    # Deployment
    deployment = create_deployment(task_def, service, app_name)
    manifests.append(("deployment", deployment))
    
    # Service
    service_manifest = create_service(task_def, app_name)
    manifests.append(("service", service_manifest))
    
    # Ingress (if needed)
    ingress = create_ingress(service, app_name, service_manifest["spec"]["ports"])
    if ingress:
        manifests.append(("ingress", ingress))
    
    # ServiceAccount (if needed)
    service_account = create_service_account(task_def, app_name)
    if service_account:
        manifests.append(("serviceaccount", service_account))
    
    # HPA
    hpa = create_hpa(app_name, 
                     min_replicas=service.get("desiredCount", 2),
                     max_replicas=min(service.get("desiredCount", 2) * 5, 50))
    manifests.append(("hpa", hpa))
    
    # Write manifests
    for kind, manifest in manifests:
        filename = output_dir / f"{app_name}-{kind}.yaml"
        with open(filename, 'w') as f:
            yaml.dump(manifest, f, default_flow_style=False, sort_keys=False)
        print(f"✅ Created {filename}")
    
    # Create combined manifest
    combined_file = output_dir / f"{app_name}-all.yaml"
    with open(combined_file, 'w') as f:
        for i, (kind, manifest) in enumerate(manifests):
            if i > 0:
                f.write("---\n")
            yaml.dump(manifest, f, default_flow_style=False, sort_keys=False)
    
    print(f"\n📦 All manifests combined in: {combined_file}")
    print(f"\n🚀 Deploy with: kubectl apply -f {combined_file}")


if __name__ == "__main__":
    main()