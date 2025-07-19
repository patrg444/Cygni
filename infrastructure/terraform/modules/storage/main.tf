# S3 bucket for build artifacts
resource "aws_s3_bucket" "artifacts" {
  bucket = "cygni-${var.environment}-artifacts-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name        = "cygni-${var.environment}-artifacts"
    Environment = var.environment
  }
}

# Block public access
resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enable versioning
resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  versioning_configuration {
    status = var.enable_versioning ? "Enabled" : "Suspended"
  }
}

# Server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Lifecycle rules
resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  dynamic "rule" {
    for_each = var.lifecycle_rules
    
    content {
      id     = rule.value.id
      status = rule.value.enabled ? "Enabled" : "Disabled"

      expiration {
        days = rule.value.expiration_days
      }

      noncurrent_version_expiration {
        noncurrent_days = rule.value.expiration_days
      }
    }
  }
}

# Data source for AWS account ID
data "aws_caller_identity" "current" {}