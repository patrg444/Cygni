# Security baseline module
# Implements security best practices

# KMS key for encryption
resource "aws_kms_key" "main" {
  description             = "Cygni ${var.environment} encryption key"
  deletion_window_in_days = var.environment == "production" ? 30 : 7
  enable_key_rotation     = true

  tags = {
    Name = "cygni-${var.environment}"
  }
}

# KMS key alias
resource "aws_kms_alias" "main" {
  name          = "alias/cygni-${var.environment}"
  target_key_id = aws_kms_key.main.key_id
}

# Security Hub
resource "aws_securityhub_account" "main" {
  count = var.environment == "production" ? 1 : 0
}

# GuardDuty
resource "aws_guardduty_detector" "main" {
  count = var.environment == "production" ? 1 : 0

  enable = true

  datasources {
    s3_logs {
      enable = true
    }
    kubernetes {
      audit_logs {
        enable = true
      }
    }
  }
}

# Default security group (deny all)
resource "aws_default_security_group" "default" {
  vpc_id = var.vpc_id

  tags = {
    Name = "cygni-${var.environment}-default-deny-all"
  }
}