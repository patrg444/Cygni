import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';

/**
 * Shared multi-tenant infrastructure for fast deployments
 * This stack is deployed once and shared by all projects in the "shared" tier
 */
export class CygniSharedStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. Simple VPC with public subnets only (no NAT Gateway for cost savings)
    const vpc = new ec2.Vpc(this, 'SharedVPC', {
      maxAzs: 2,
      natGateways: 0, // No NAT Gateway - use public subnets
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    // 2. Shared ECS Cluster
    const cluster = new ecs.Cluster(this, 'SharedCluster', {
      vpc,
      clusterName: 'cygni-shared-cluster',
      containerInsights: false, // Disabled for cost savings in shared tier
    });

    // 3. Shared ECR Repository
    const ecrRepository = new ecr.Repository(this, 'SharedRepository', {
      repositoryName: `cygni-shared-apps-${this.stackName}`.toLowerCase(),
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Never delete shared repository
      lifecycleRules: [
        {
          description: 'Keep only last 10 images',
          maxImageCount: 10,
        },
      ],
    });

    // 4. Shared Application Load Balancer
    const alb = new elbv2.ApplicationLoadBalancer(this, 'SharedALB', {
      vpc,
      internetFacing: true,
      loadBalancerName: 'cygni-shared-alb',
    });

    // Default target group (returns 404 for unmatched paths)
    const defaultTargetGroup = new elbv2.ApplicationTargetGroup(this, 'DefaultTargetGroup', {
      vpc,
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        enabled: true,
        path: '/health',
        healthyHttpCodes: '200,404',
      },
    });

    // HTTP Listener
    const httpListener = alb.addListener('HttpListener', {
      port: 80,
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'Project not found',
      }),
    });

    // HTTPS Listener placeholder - to be configured when certificates are available
    // For now, we'll just use HTTP listener ARN for both
    const httpsListener = httpListener; // Temporary: use same listener

    // 5. Shared Task Execution Role
    const taskExecutionRole = new iam.Role(this, 'SharedTaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    // Grant ECR access to execution role
    ecrRepository.grantPull(taskExecutionRole);

    // 6. CloudWatch Log Group for all services
    const logGroup = new logs.LogGroup(this, 'SharedLogGroup', {
      logGroupName: '/ecs/cygni-shared',
      retention: logs.RetentionDays.THREE_DAYS, // Short retention for shared tier
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // 7. Deployment User with necessary permissions
    const deploymentUser = new iam.User(this, 'SharedDeploymentUser', {
      userName: 'cygni-shared-deployment-user',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonEC2ContainerRegistryPowerUser'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonECS_FullAccess'),
      ],
    });

    // Grant additional permissions via managed policy
    const deploymentPolicy = new iam.ManagedPolicy(this, 'SharedDeploymentPolicy', {
      managedPolicyName: 'CygniSharedDeploymentPolicy',
      statements: [
        new iam.PolicyStatement({
          actions: [
            'elasticloadbalancing:CreateRule',
            'elasticloadbalancing:DeleteRule',
            'elasticloadbalancing:ModifyRule',
            'elasticloadbalancing:DescribeRules',
            'elasticloadbalancing:DescribeTargetGroups',
            'elasticloadbalancing:CreateTargetGroup',
            'elasticloadbalancing:DeleteTargetGroup',
            'elasticloadbalancing:ModifyTargetGroup',
            'elasticloadbalancing:RegisterTargets',
            'elasticloadbalancing:DeregisterTargets',
            'elasticloadbalancing:DescribeTargetHealth',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          actions: ['iam:PassRole'],
          resources: [taskExecutionRole.roleArn],
        }),
        new iam.PolicyStatement({
          actions: [
            'logs:CreateLogStream',
            'logs:PutLogEvents',
            'logs:DescribeLogStreams',
          ],
          resources: [logGroup.logGroupArn],
        }),
        new iam.PolicyStatement({
          actions: [
            'ec2:CreateSecurityGroup',
            'ec2:DeleteSecurityGroup',
            'ec2:DescribeSecurityGroups',
            'ec2:AuthorizeSecurityGroupIngress',
            'ec2:RevokeSecurityGroupIngress',
            'ec2:AuthorizeSecurityGroupEgress',
            'ec2:RevokeSecurityGroupEgress',
            'ec2:CreateTags',
            'ec2:DescribeNetworkInterfaces',
            'ec2:DescribeSubnets',
            'ec2:DescribeVpcs',
          ],
          resources: ['*'],
        }),
      ],
    });

    deploymentUser.addManagedPolicy(deploymentPolicy);

    // Outputs
    new cdk.CfnOutput(this, 'VPCId', {
      value: vpc.vpcId,
      description: 'Shared VPC ID',
      exportName: 'CygniSharedVPCId',
    });

    new cdk.CfnOutput(this, 'SubnetIds', {
      value: vpc.publicSubnets.map(subnet => subnet.subnetId).join(','),
      description: 'Public subnet IDs',
      exportName: 'CygniSharedSubnetIds',
    });

    new cdk.CfnOutput(this, 'ClusterName', {
      value: cluster.clusterName,
      description: 'Shared ECS cluster name',
      exportName: 'CygniSharedClusterName',
    });

    new cdk.CfnOutput(this, 'ClusterArn', {
      value: cluster.clusterArn,
      description: 'Shared ECS cluster ARN',
      exportName: 'CygniSharedClusterArn',
    });

    new cdk.CfnOutput(this, 'ECRRepositoryUri', {
      value: ecrRepository.repositoryUri,
      description: 'Shared ECR repository URI',
      exportName: 'CygniSharedECRUri',
    });

    new cdk.CfnOutput(this, 'ALBArn', {
      value: alb.loadBalancerArn,
      description: 'Shared ALB ARN',
      exportName: 'CygniSharedALBArn',
    });

    new cdk.CfnOutput(this, 'ALBDnsName', {
      value: alb.loadBalancerDnsName,
      description: 'Shared ALB DNS name',
      exportName: 'CygniSharedALBDnsName',
    });

    new cdk.CfnOutput(this, 'ALBHostedZoneId', {
      value: alb.loadBalancerCanonicalHostedZoneId,
      description: 'Shared ALB hosted zone ID',
      exportName: 'CygniSharedALBHostedZoneId',
    });

    new cdk.CfnOutput(this, 'HttpListenerArn', {
      value: httpListener.listenerArn,
      description: 'HTTP listener ARN',
      exportName: 'CygniSharedHttpListenerArn',
    });

    new cdk.CfnOutput(this, 'HttpsListenerArn', {
      value: httpsListener.listenerArn,
      description: 'HTTPS listener ARN',
      exportName: 'CygniSharedHttpsListenerArn',
    });

    new cdk.CfnOutput(this, 'TaskExecutionRoleArn', {
      value: taskExecutionRole.roleArn,
      description: 'Shared task execution role ARN',
      exportName: 'CygniSharedTaskExecutionRoleArn',
    });

    new cdk.CfnOutput(this, 'LogGroupName', {
      value: logGroup.logGroupName,
      description: 'Shared CloudWatch log group name',
      exportName: 'CygniSharedLogGroupName',
    });

    new cdk.CfnOutput(this, 'DeploymentUserName', {
      value: deploymentUser.userName,
      description: 'Shared deployment user name',
      exportName: 'CygniSharedDeploymentUserName',
    });

    // Stack description
    cdk.Tags.of(this).add('Purpose', 'Shared multi-tenant infrastructure');
    cdk.Tags.of(this).add('Tier', 'Shared');
    cdk.Tags.of(this).add('ManagedBy', 'Cygni');
  }
}