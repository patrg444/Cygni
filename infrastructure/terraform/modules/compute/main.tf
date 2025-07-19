# This is a placeholder module for EKS compute resources
# Full implementation would include:
# - EKS cluster
# - Node groups
# - IAM roles and policies
# - OIDC provider for IRSA
# - Security groups

locals {
  cluster_name = "cygni-${var.environment}"
}

# Placeholder resource to satisfy module requirements
resource "null_resource" "compute_placeholder" {
  triggers = {
    environment = var.environment
  }
}