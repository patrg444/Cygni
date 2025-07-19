output "vpc_id" {
  description = "ID of the VPC"
  value       = module.network.vpc_id
}

output "eks_cluster_endpoint" {
  description = "Endpoint for EKS control plane"
  value       = module.compute.cluster_endpoint
}

output "eks_cluster_name" {
  description = "Name of the EKS cluster"
  value       = module.compute.cluster_name
}

output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = module.database.endpoint
  sensitive   = true
}

output "rds_read_replica_endpoints" {
  description = "RDS read replica endpoints"
  value       = module.database.read_replica_endpoints
  sensitive   = true
}

output "s3_bucket_name" {
  description = "Name of the S3 bucket for artifacts"
  value       = module.storage.bucket_name
}

output "s3_bucket_arn" {
  description = "ARN of the S3 bucket"
  value       = module.storage.bucket_arn
}

output "ingress_nginx_lb_hostname" {
  description = "Hostname of the ingress-nginx load balancer"
  value       = data.kubernetes_service.ingress_nginx.status.0.load_balancer.0.ingress.0.hostname
}

# Data source to get ingress service info
data "kubernetes_service" "ingress_nginx" {
  metadata {
    name      = "ingress-nginx-controller"
    namespace = "ingress-nginx"
  }
  
  depends_on = [helm_release.ingress_nginx]
}