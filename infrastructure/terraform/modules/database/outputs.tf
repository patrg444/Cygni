output "endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.main.endpoint
}

output "address" {
  description = "RDS instance address"
  value       = aws_db_instance.main.address
}

output "port" {
  description = "RDS instance port"
  value       = aws_db_instance.main.port
}

output "database_name" {
  description = "Database name"
  value       = aws_db_instance.main.db_name
}

output "username" {
  description = "Master username"
  value       = aws_db_instance.main.username
}

output "password_ssm_parameter" {
  description = "SSM parameter name for database password"
  value       = aws_ssm_parameter.rds_password.name
}

output "security_group_id" {
  description = "Security group ID for RDS"
  value       = aws_security_group.rds.id
}

output "read_replica_endpoints" {
  description = "Read replica endpoints"
  value       = aws_db_instance.read_replica[*].endpoint
}