# End-to-End Testing Guide

This guide explains how to run the complete E2E test suite for Cygni's backend services.

## Prerequisites

Before running E2E tests, ensure you have the following installed:

1. **Docker Desktop** - For running containers and Kind
2. **Kind** - Kubernetes in Docker
   ```bash
   # macOS
   brew install kind
   
   # Linux
   curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.20.0/kind-linux-amd64
   chmod +x ./kind
   sudo mv ./kind /usr/local/bin/kind
   ```

3. **kubectl** - Kubernetes CLI
   ```bash
   # macOS
   brew install kubectl
   
   # Linux
   curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
   chmod +x kubectl
   sudo mv kubectl /usr/local/bin/
   ```

4. **AWS CLI** - For ECS deployment tests
   ```bash
   # macOS
   brew install awscli
   
   # Linux
   curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
   unzip awscliv2.zip
   sudo ./aws/install
   ```

## Test Categories

### 1. Kaniko Build Tests (Local Kubernetes)

These tests verify the complete container build pipeline using Kaniko in a local Kind cluster.

**Setup:**
```bash
# Create Kind cluster with local registry
./scripts/setup-kind-cluster.sh
```

**Run tests:**
```bash
# Run Kaniko E2E tests
pnpm --filter @cloudexpress/builder test tests/e2e/kaniko-local.test.ts
```

**What's tested:**
- ✅ Kubernetes Job creation for builds
- ✅ Kaniko container image building
- ✅ Registry push to local registry
- ✅ Build failure handling
- ✅ Job cleanup and TTL

### 2. Health & Rollback Tests (ECS Simulation)

These tests simulate ECS deployments and health-based rollbacks.

**Run tests:**
```bash
# Run health and rollback tests
pnpm --filter @cloudexpress/services-api test tests/health-rollback.test.ts
```

**What's tested:**
- ✅ Failed canary auto-rollback within 2 minutes
- ✅ Manual rollback commands
- ✅ Deployment status tracking
- ✅ CloudWatch alarm creation
- ✅ Task definition management

### 3. CLI Deployment Tests

These tests verify the CLI deployment commands work correctly.

**Run tests:**
```bash
# Run CLI deployment tests
pnpm --filter @cygni/cli test tests/deploy-commands.test.ts
```

**What's tested:**
- ✅ `cx deploy --aws --dry-run` generates valid CloudFormation
- ✅ `cx deploy --aws` deployment simulation
- ✅ `cx deploy --rollback` rollback functionality
- ✅ Configuration file loading

## Running All E2E Tests

To run the complete E2E test suite:

```bash
# Run all E2E tests with automatic setup
./scripts/run-e2e-tests.sh

# Run with cleanup after tests
CLEANUP=true ./scripts/run-e2e-tests.sh
```

## Test Environment Configuration

### Environment Variables

```bash
# For Kaniko tests
export REGISTRY_URL=localhost:5000
export K8S_NAMESPACE=cygni-builds

# For API tests  
export API_URL=http://localhost:3000
export BUILDER_URL=http://localhost:3001

# For AWS tests (optional, uses mocks by default)
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=012178036894
```

### Local Services

The E2E tests expect these services to be running:

1. **API Service** - Port 3000
2. **Builder Service** - Port 3001
3. **PostgreSQL** - Port 5432
4. **Redis** - Port 6379
5. **Kind Registry** - Port 5000

## Troubleshooting

### Kind Cluster Issues

```bash
# Check cluster status
kubectl cluster-info --context kind-cygni-test

# View pods in build namespace
kubectl get pods -n cygni-builds

# Check Kaniko job logs
kubectl logs -n cygni-builds job/kaniko-build-test

# Delete and recreate cluster
kind delete cluster --name cygni-test
./scripts/setup-kind-cluster.sh
```

### Registry Issues

```bash
# Test registry connectivity
docker pull alpine:latest
docker tag alpine:latest localhost:5000/test:latest
docker push localhost:5000/test:latest

# Check registry logs
docker logs kind-registry
```

### Service Connection Issues

```bash
# Check service health
curl http://localhost:3000/api/health
curl http://localhost:3001/health

# View service logs
docker compose logs api
docker compose logs builder
```

## CI/CD Integration

### GitHub Actions

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Kind
        uses: helm/kind-action@v1.8.0
        with:
          cluster_name: cygni-test
          config: k8s/kind-config.yaml
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: pnpm install
        
      - name: Run E2E tests
        run: ./scripts/run-e2e-tests.sh
        env:
          CI: true
```

## Test Results

Expected output for successful E2E test run:

```
🚀 Running End-to-End Tests
==========================

✓ Prerequisites satisfied
✓ Kind cluster already exists
✓ Services are running

Running Kaniko E2E tests...
✓ Kaniko E2E tests passed

Running Health & Rollback tests...
✓ Health & Rollback tests passed

E2E Test Summary:
==================
Kaniko Build Tests: PASSED
Health & Rollback Tests: PASSED

✓ All E2E tests passed!
```

## Next Steps

After E2E tests pass:

1. **Deploy to staging** - Use real AWS resources
2. **Load testing** - Verify performance under load
3. **Security scanning** - Run penetration tests
4. **Production deployment** - Deploy with confidence

## Maintenance

- Update Kind cluster version quarterly
- Review and update test timeouts based on CI performance
- Add new E2E tests for each major feature
- Monitor flaky tests and add retries where appropriate