environment    = "production"
aws_region     = "us-east-1"
vpc_cidr       = "10.0.0.0/16"

# Production-grade resources
rds_instance_class     = "db.r6g.large"
rds_allocated_storage  = 100
eks_node_instance_type = "t3.large"

# High availability
enable_nat_gateway = true