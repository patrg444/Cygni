output "cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = "https://eks-cluster-endpoint-placeholder.region.eks.amazonaws.com"
}

output "cluster_name" {
  description = "EKS cluster name"
  value       = "cygni-${var.environment}"
}

output "cluster_certificate_authority_data" {
  description = "Base64 encoded certificate data"
  value       = "LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCnBsYWNlaG9sZGVyCi0tLS0tRU5EIENFUlRJRklDQVRFLS0tLS0="
}

output "node_security_group_id" {
  description = "Security group ID for EKS nodes"
  value       = "sg-placeholder-${var.environment}"
}