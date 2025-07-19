environment    = "development"
aws_region     = "us-east-1"
vpc_cidr       = "10.0.0.0/16"

# Cost-optimized for development
rds_instance_class     = "db.t3.small"
rds_allocated_storage  = 20
eks_node_instance_type = "t3.small"

# Single NAT gateway to save costs
enable_nat_gateway = true