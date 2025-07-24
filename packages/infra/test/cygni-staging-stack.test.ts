import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { CygniStagingStack } from '../lib/cygni-staging-stack';

describe('CygniStagingStack', () => {
  let app: cdk.App;
  let stack: CygniStagingStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new CygniStagingStack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    template = Template.fromStack(stack);
  });

  test('VPC is created with correct configuration', () => {
    template.resourceCountIs('AWS::EC2::VPC', 1);
    template.hasResourceProperties('AWS::EC2::VPC', {
      CidrBlock: '10.0.0.0/16',
    });
  });

  test('Aurora Serverless v2 cluster is created', () => {
    template.resourceCountIs('AWS::RDS::DBCluster', 1);
    template.hasResourceProperties('AWS::RDS::DBCluster', {
      Engine: 'aurora-postgresql',
      EngineMode: 'provisioned',
      ServerlessV2ScalingConfiguration: {
        MinCapacity: 0.5,
        MaxCapacity: 1,
      },
    });
  });

  test('ECR repository is created', () => {
    template.resourceCountIs('AWS::ECR::Repository', 1);
    template.hasResourceProperties('AWS::ECR::Repository', {
      RepositoryName: 'cygni-backend',
    });
  });

  test('ECS Fargate service is created', () => {
    template.resourceCountIs('AWS::ECS::Cluster', 1);
    template.resourceCountIs('AWS::ECS::Service', 1);
    template.hasResourceProperties('AWS::ECS::Service', {
      LaunchType: 'FARGATE',
      DesiredCount: 1,
    });
  });

  test('S3 bucket for frontend is created', () => {
    template.resourceCountIs('AWS::S3::Bucket', 1);
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'cygni-frontend-123456789012-us-east-1',
      WebsiteConfiguration: {
        IndexDocument: 'index.html',
        ErrorDocument: 'error.html',
      },
    });
  });

  test('CloudFront distribution is created', () => {
    template.resourceCountIs('AWS::CloudFront::Distribution', 1);
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        DefaultRootObject: 'index.html',
        ViewerCertificate: {
          CloudFrontDefaultCertificate: true,
        },
      },
    });
  });

  test('Deployment user is created with correct permissions', () => {
    template.resourceCountIs('AWS::IAM::User', 1);
    template.hasResourceProperties('AWS::IAM::User', {
      UserName: 'cygni-deployment-user',
    });
  });

  test('Stack has required outputs', () => {
    const outputs = template.findOutputs('*');
    const outputKeys = Object.keys(outputs);
    
    expect(outputKeys).toContain('VPCId');
    expect(outputKeys).toContain('DatabaseEndpoint');
    expect(outputKeys).toContain('ECRRepositoryUri');
    expect(outputKeys).toContain('CloudFrontUrl');
    expect(outputKeys).toContain('FrontendBucketName');
  });
});