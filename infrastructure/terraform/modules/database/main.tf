# DB Subnet Group
resource "aws_db_subnet_group" "main" {
  name       = "cygni-${var.environment}"
  subnet_ids = var.database_subnet_ids

  tags = {
    Name = "cygni-${var.environment}-db-subnet-group"
  }
}

# Security Group for RDS
resource "aws_security_group" "rds" {
  name_prefix = "cygni-${var.environment}-rds-"
  description = "Security group for Cygni RDS instance"
  vpc_id      = var.vpc_id

  tags = {
    Name = "cygni-${var.environment}-rds"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Allow PostgreSQL from allowed security groups
resource "aws_security_group_rule" "rds_ingress" {
  count = length(var.allowed_security_groups)

  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = var.allowed_security_groups[count.index]
  security_group_id        = aws_security_group.rds.id
}

# Egress rule
resource "aws_security_group_rule" "rds_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.rds.id
}

# Random password for RDS
resource "random_password" "rds" {
  length  = 32
  special = true
}

# Store password in SSM Parameter Store
resource "aws_ssm_parameter" "rds_password" {
  name  = "/cygni/${var.environment}/rds/password"
  type  = "SecureString"
  value = random_password.rds.result

  tags = {
    Name = "cygni-${var.environment}-rds-password"
  }
}

# RDS Instance
resource "aws_db_instance" "main" {
  identifier = "cygni-${var.environment}"

  # Engine
  engine               = "postgres"
  engine_version       = "15.4"
  instance_class       = var.instance_class
  allocated_storage    = var.allocated_storage
  max_allocated_storage = var.allocated_storage * 2
  storage_type         = "gp3"
  storage_encrypted    = var.storage_encrypted

  # Database
  db_name  = "cygni"
  username = "cygni_admin"
  password = random_password.rds.result
  port     = 5432

  # Network
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  # Backup
  backup_retention_period = var.backup_retention_period
  backup_window          = var.backup_window
  maintenance_window     = var.maintenance_window
  
  # High Availability
  multi_az = var.multi_az

  # Monitoring
  enabled_cloudwatch_logs_exports = ["postgresql"]
  performance_insights_enabled    = var.environment == "production"
  performance_insights_retention_period = var.environment == "production" ? 7 : 0
  monitoring_interval            = var.environment == "production" ? 60 : 0
  monitoring_role_arn           = var.environment == "production" ? aws_iam_role.rds_monitoring[0].arn : null

  # Other settings
  auto_minor_version_upgrade = true
  deletion_protection       = var.environment == "production"
  skip_final_snapshot      = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "cygni-${var.environment}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}" : null

  tags = {
    Name = "cygni-${var.environment}"
  }
}

# Read Replicas
resource "aws_db_instance" "read_replica" {
  count = var.create_read_replica ? var.read_replica_count : 0

  identifier = "cygni-${var.environment}-read-${count.index + 1}"
  
  # Source database
  replicate_source_db = aws_db_instance.main.identifier
  
  # Instance configuration
  instance_class = var.instance_class
  
  # Network
  publicly_accessible = false
  
  # Monitoring
  performance_insights_enabled = var.environment == "production"
  monitoring_interval         = var.environment == "production" ? 60 : 0
  monitoring_role_arn        = var.environment == "production" ? aws_iam_role.rds_monitoring[0].arn : null

  # Other settings
  auto_minor_version_upgrade = true
  skip_final_snapshot       = true

  tags = {
    Name = "cygni-${var.environment}-read-${count.index + 1}"
  }
}

# IAM role for RDS monitoring (production only)
resource "aws_iam_role" "rds_monitoring" {
  count = var.environment == "production" ? 1 : 0

  name = "cygni-${var.environment}-rds-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })
}

# Attach monitoring policy to role
resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  count = var.environment == "production" ? 1 : 0

  role       = aws_iam_role.rds_monitoring[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# CloudWatch Log Group for RDS logs
resource "aws_cloudwatch_log_group" "rds" {
  name              = "/aws/rds/instance/cygni-${var.environment}/postgresql"
  retention_in_days = var.environment == "production" ? 30 : 7

  tags = {
    Name = "cygni-${var.environment}-rds-logs"
  }
}