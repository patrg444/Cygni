# Cygni Architecture

## Overview

Cygni is a developer-first cloud platform that combines the simplicity of Platform-as-a-Service (PaaS) with the flexibility and power of major cloud providers. It enables developers to deploy full-stack applications with a single command while maintaining control over their infrastructure.

## Core Design Principles

1. **Developer Experience First**: Every decision prioritizes reducing time-to-deployment and cognitive load
2. **Production-Grade by Default**: Built-in monitoring, health checks, and rollback capabilities
3. **Cloud Agnostic**: Support for AWS, GCP, Azure, and self-hosted Kubernetes
4. **GitOps Native**: Git as the source of truth for deployments
5. **Cost Transparent**: Real-time cost tracking and budget enforcement

## System Architecture

### High-Level Components

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   CLI / Web UI  │────▶│   Control Plane │────▶│  Cloud Provider │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │   Data Plane    │
                        │  (Kubernetes)   │
                        └─────────────────┘
```

### Control Plane

The control plane manages the lifecycle of applications and coordinates between different components.

#### Components:

1. **API Service** (`/services/api`)
   - RESTful API built with Fastify (Node.js/TypeScript)
   - Handles authentication, authorization, and request routing
   - Manages projects, deployments, teams, and billing
   - Integrates with Stripe for usage-based billing

2. **Auth Service** (`/services/auth`)
   - JWT-based authentication with automatic rotation
   - OAuth2 integration (GitHub, Google, etc.)
   - Team-based RBAC with roles: Owner, Admin, Developer, Viewer
   - API key management for programmatic access

3. **Builder Service** (`/services/builder`)
   - Container image building using Kaniko
   - Supports multiple languages and frameworks
   - Integrated with container registries (ECR, GCR, Docker Hub)
   - Build caching for improved performance

4. **Database** (PostgreSQL)
   - Primary data store for all platform metadata
   - Prisma ORM for type-safe database access
   - Automatic migrations with rollback support

### Data Plane

The data plane runs the actual workloads and is built on Kubernetes.

#### Components:

1. **Runtime Orchestrator** (`/services/runtime-orchestrator`)
   - Custom Kubernetes controller written in Go
   - Manages CygniService CRDs
   - Implements deployment strategies:
     - Health-gated rollouts
     - Canary deployments with progressive traffic shifting
     - Automatic rollbacks on failure
   - Integrates with monitoring systems

2. **CygniService CRD**

   ```yaml
   apiVersion: cygni.dev/v1
   kind: CygniService
   metadata:
     name: my-app
   spec:
     image: myapp:v1.2.3
     ports: [3000]
     envFrom: secrets://prod/my-app
     autoscale:
       min: 1
       max: 10
       cpu: 70
     healthGates:
       errorRate: 5 # percentage
       latencyP95: 1000 # milliseconds
   ```

3. **Ingress Management**
   - Automatic SSL/TLS certificate provisioning (cert-manager)
   - Custom domain support
   - Preview environment URLs (preview-{branch}.{project}.cygni.app)

4. **Observability Stack**
   - **Metrics**: Prometheus for metrics collection
   - **Logs**: Loki for log aggregation
   - **Traces**: OpenTelemetry integration
   - **Dashboards**: Grafana with pre-built dashboards

### Supporting Infrastructure

1. **Message Queue** (Redis)
   - Job queuing for async operations
   - Pub/sub for real-time updates
   - Session storage

2. **Object Storage** (S3/MinIO)
   - Build artifacts
   - Static asset hosting
   - Backup storage

3. **Container Registry**
   - Multi-region replication
   - Vulnerability scanning
   - Image signing

## Deployment Flow

```
1. Developer pushes code to Git
2. Webhook triggers build in Builder Service
3. Container image is built and pushed to registry
4. Deployment created in Control Plane
5. Runtime Orchestrator creates/updates Kubernetes resources
6. Health gates monitor deployment progress
7. Traffic gradually shifted to new version
8. Automatic rollback if health gates fail
```

## Security Architecture

### Network Security

- All internal communication over TLS
- Network policies for pod-to-pod communication
- WAF integration for public endpoints

### Secrets Management

- Encrypted at rest using cloud KMS
- Automatic rotation for platform secrets
- Least-privilege access control

### Compliance

- SOC2 Type II ready architecture
- GDPR compliance through data residency options
- Audit logging for all operations

## Multi-Tenancy

### Isolation Levels

1. **Namespace Isolation**: Each project gets dedicated Kubernetes namespace
2. **Network Isolation**: Network policies prevent cross-tenant communication
3. **Resource Isolation**: Resource quotas and limits per tenant
4. **Data Isolation**: Separate database schemas with row-level security

### Resource Management

```
Project
├── Environments (prod, staging, preview)
│   ├── Deployments
│   ├── Secrets
│   └── Resources (CPU, Memory, Storage)
└── Team Members (with RBAC)
```

## Scaling Architecture

### Horizontal Scaling

- Control plane services run in HA mode (3+ replicas)
- Database with read replicas
- Multi-region deployment support

### Auto-scaling

- KEDA for advanced auto-scaling scenarios
- Metrics: CPU, Memory, Request rate, Custom metrics
- Scale-to-zero for development environments

## Monitoring & Reliability

### Health Monitoring

- Prometheus metrics for all services
- Custom health gates per deployment
- Automated alerting via PagerDuty/Slack

### Disaster Recovery

- Automated backups every 6 hours
- Point-in-time recovery for databases
- Cross-region backup replication
- RTO: 1 hour, RPO: 6 hours

### Chaos Engineering

- Weekly "Failure Friday" tests
- Automated chaos scenarios:
  - Pod failures
  - Network latency injection
  - Resource exhaustion
  - Region failures

## Cost Management

### Usage Tracking

- Real-time resource usage monitoring
- Per-service cost allocation
- Predictive cost alerts

### Budget Enforcement

- Hard limits with automatic scale-down
- Warning at 80% budget utilization
- Grace period for payment failures

## Development Workflow

### Local Development

```bash
# Start local environment
docker-compose up

# Run service in development mode
cd services/api
pnpm dev
```

### Testing Strategy

- Unit tests for business logic
- Integration tests for API endpoints
- E2E tests on staging environment
- Chaos tests in production

### CI/CD Pipeline

- GitHub Actions for CI
- Multi-stage Docker builds
- Automated security scanning
- Progressive deployment to production

## Future Architecture Considerations

### Planned Enhancements

1. **Edge Computing**: Deploy to edge locations for reduced latency
2. **Serverless Functions**: Lambda/Cloud Functions integration
3. **ML Workloads**: GPU support and ML-specific optimizations
4. **Multi-Cloud**: Single control plane managing multiple clouds

### Extensibility

- Plugin system for custom builders
- Webhook integrations for external tools
- API-first design for third-party integrations

## Architecture Decision Records (ADRs)

### ADR-001: Microservices Architecture

**Status**: Accepted  
**Context**: Need to scale different components independently  
**Decision**: Use microservices with clear bounded contexts  
**Consequences**: More operational complexity but better scalability

### ADR-002: Kubernetes as Data Plane

**Status**: Accepted  
**Context**: Need portable, scalable container orchestration  
**Decision**: Use Kubernetes with custom CRDs  
**Consequences**: Steeper learning curve but industry-standard platform

### ADR-003: Go for Runtime Orchestrator

**Status**: Accepted  
**Context**: Need performant, type-safe Kubernetes controller  
**Decision**: Use Go with controller-runtime  
**Consequences**: Better performance, native Kubernetes integration

### ADR-004: Usage-Based Billing

**Status**: Accepted  
**Context**: Fair pricing model that scales with usage  
**Decision**: Integrate Stripe with metered billing  
**Consequences**: More complex tracking but fairer for users

## Conclusion

Cygni's architecture is designed to abstract away infrastructure complexity while maintaining the flexibility developers need. By building on proven technologies like Kubernetes and implementing advanced deployment strategies, we provide a platform that's both powerful and approachable.
