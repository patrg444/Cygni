# Shared Infrastructure Deployment Test Guide

This test validates the new shared, multi-tenant infrastructure deployment feature that enables sub-minute deployments.

## Prerequisites

1. AWS CLI configured with valid credentials:
   ```bash
   aws configure
   aws sts get-caller-identity
   ```

2. Docker daemon running (for building container images)

3. Node.js and npm installed

4. Build the CLI:
   ```bash
   cd packages/cli
   npm install
   npm run build
   ```

## Running the Test

From the root of the Cygni project:

```bash
cd packages/web-ui
npm run test:e2e:aws:shared
```

## What the Test Does

1. **Deploys Shared Infrastructure** (5-10 minutes)
   - Creates a shared VPC, ECS cluster, ALB, and ECR repository
   - This is a one-time setup that remains running

2. **Deploys Two Applications** (<1 minute each)
   - Deploys `app-one` to the shared infrastructure
   - Deploys `app-two` to the shared infrastructure
   - Both apps share the same ALB with path-based routing

3. **Verifies Applications**
   - Tests that both apps are accessible via HTTP
   - Confirms path-based routing works (`/app-one` and `/app-two`)

4. **Tests Management Commands**
   - `cx projects list` - Shows both deployed applications
   - `cx projects info app-one` - Shows details about app-one
   - `cx projects remove app-one` - Removes app-one from the cluster

5. **Verifies Isolation**
   - Confirms app-one is removed and returns 404
   - Confirms app-two still works after app-one removal

6. **Performance Test**
   - Deploys a new app and verifies it completes in under 60 seconds

7. **Cleanup**
   - Removes all test applications
   - Destroys the shared infrastructure stack

## Expected Results

- Infrastructure deployment: ~5-10 minutes (one-time)
- Application deployments: <1 minute each
- All HTTP requests should succeed
- Management commands should work correctly
- Performance test should pass (<60 second deployment)

## Troubleshooting

If the test fails:

1. Check AWS credentials are valid
2. Ensure Docker is running
3. Check the shared infrastructure outputs file exists after step 1
4. Review CloudFormation console for stack status
5. Check ECS console for service status

## Manual Cleanup

If the test fails to clean up:

```bash
# Remove any remaining projects
cx projects list
cx projects remove <project-id> --force

# Destroy shared infrastructure
cd packages/infra
npm run destroy:shared
```

## Cost Considerations

The shared infrastructure uses:
- 1 VPC with public subnets only (no NAT Gateway)
- 1 ECS Fargate cluster
- 1 Application Load Balancer
- 1 ECR repository
- Minimal CloudWatch logs

Estimated cost: ~$0.05/hour when idle, plus Fargate costs when running containers.