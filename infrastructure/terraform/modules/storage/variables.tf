variable "environment" {
  description = "Environment name"
  type        = string
}

variable "enable_versioning" {
  description = "Enable S3 bucket versioning"
  type        = bool
  default     = false
}

variable "lifecycle_rules" {
  description = "S3 lifecycle rules"
  type = list(object({
    id              = string
    enabled         = bool
    expiration_days = number
  }))
  default = []
}