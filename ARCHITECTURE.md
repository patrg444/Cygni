# Cygni Architecture

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Project Structure](#project-structure)
4. [Service Architecture](#service-architecture)
5. [Data Flow](#data-flow)
6. [Deployment Architecture](#deployment-architecture)
7. [Technology Stack](#technology-stack)

## Overview

Cygni is a modern Platform-as-a-Service (PaaS) that simplifies cloud deployments while maintaining the flexibility of major cloud providers. It follows a microservices architecture with clear separation of concerns.

## System Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        CLI[CLI Tool]
        WEB[Web Dashboard]
        API_CLIENT[API Client/SDK]
    end

    subgraph "API Gateway"
        NGINX[Nginx/Ingress]
    end

    subgraph "Control Plane"
        API[API Service<br/>Node.js/Fastify]
        AUTH[Auth Service<br/>JWT + OAuth]
        BUILDER[Builder Service<br/>Kaniko]
        WEBHOOK[Webhook Handler]
    end

    subgraph "Data Plane"
        ORCH[Runtime Orchestrator<br/>Go/K8s Controller]
        K8S[Kubernetes API]
        APPS[User Applications]
    end

    subgraph "Data Layer"
        PG[(PostgreSQL<br/>Projects/Users)]
        REDIS[(Redis<br/>Sessions/Cache)]
        S3[(S3/MinIO<br/>Artifacts)]
    end

    subgraph "External Services"
        GIT[GitHub/GitLab]
        STRIPE[Stripe]
        REGISTRY[Container Registry]
        MONITORING[Prometheus/Grafana]
    end

    CLI --> NGINX
    WEB --> NGINX
    API_CLIENT --> NGINX

    NGINX --> API
    NGINX --> AUTH

    API --> AUTH
    API --> BUILDER
    API --> WEBHOOK
    API --> PG
    API --> REDIS
    API --> STRIPE

    BUILDER --> REGISTRY
    BUILDER --> S3

    WEBHOOK --> GIT

    ORCH --> K8S
    ORCH --> APPS
    ORCH --> MONITORING

    API --> ORCH
```

## Project Structure

```
Cygni/
 .github/                    # GitHub Actions workflows
    workflows/
        ci.yml             # Main CI pipeline
        release.yml        # Release automation
        security.yml       # Security scanning

 packages/                   # Shared packages (pnpm workspace)
    api/                   # API client library
    cli/                   # CLI tool
    sdk/                   # JavaScript/TypeScript SDK
    landing/               # Marketing website
    web-ui/                # Dashboard UI (Next.js)

 services/                   # Microservices
    api/                   # Main API service
       src/
          routes/       # API endpoints
          services/     # Business logic
          middleware/   # Auth, rate limiting
          utils/        # Helpers
       prisma/           # Database schema

    auth/                  # Authentication service
       src/
           providers/    # OAuth providers
           jwt/          # JWT management

    builder/               # Build service
       src/
           kaniko/       # Container builder

    runtime-orchestrator/  # Kubernetes controller
        api/              # CRD definitions
        controllers/      # K8s controllers
        config/           # K8s manifests

 infrastructure/             # Infrastructure as Code
    kubernetes/            # K8s manifests
       base/            # Base configurations
       overlays/        # Environment-specific
    terraform/            # Cloud infrastructure
    helm/                # Helm charts

 scripts/                   # Utility scripts
    setup-*.sh           # Setup scripts
    test-suite/          # Test scripts

 docs/                      # Documentation
     api/                  # API docs
     guides/               # User guides
     architecture/         # Architecture docs
```

## Service Architecture

### API Service

```mermaid
graph LR
    subgraph "API Service"
        ROUTES[Routes]
        MW[Middleware]
        SVC[Services]
        DB[Database]

        ROUTES --> MW
        MW --> SVC
        SVC --> DB
    end

    subgraph "Routes"
        AUTH_R[/auth]
        PROJ_R[/projects]
        DEPLOY_R[/deployments]
        BUILD_R[/builds]
    end

    subgraph "Services"
        AUTH_S[AuthService]
        PROJ_S[ProjectService]
        DEPLOY_S[DeploymentService]
        BILLING_S[BillingService]
    end
```

### Runtime Orchestrator

```mermaid
graph TB
    subgraph "Runtime Orchestrator"
        CTRL[Main Controller]
        HEALTH[Health Monitor]
        SCALER[Auto Scaler]
        DEPLOY[Deployment Manager]
    end

    subgraph "Kubernetes Resources"
        CRD[CygniService CRD]
        DEPLOY_K[Deployments]
        SVC_K[Services]
        ING_K[Ingresses]
        HPA[HPA/KEDA]
    end

    CTRL --> CRD
    CTRL --> HEALTH
    CTRL --> SCALER
    CTRL --> DEPLOY

    DEPLOY --> DEPLOY_K
    DEPLOY --> SVC_K
    DEPLOY --> ING_K
    SCALER --> HPA
```

## Data Flow

### Deployment Flow

```mermaid
sequenceDiagram
    participant User
    participant CLI
    participant API
    participant Builder
    participant Registry
    participant Orchestrator
    participant K8s

    User->>CLI: cygni deploy
    CLI->>API: POST /deployments
    API->>Builder: Trigger build
    Builder->>Registry: Push image
    Builder->>API: Build complete
    API->>Orchestrator: Create CygniService
    Orchestrator->>K8s: Apply resources
    K8s->>Orchestrator: Status update
    Orchestrator->>API: Deployment active
    API->>CLI: Deployment URL
    CLI->>User: Success
```

### Request Flow

```mermaid
graph LR
    USER[User Request] --> CDN[CloudFront/CDN]
    CDN --> LB[Load Balancer]
    LB --> INGRESS[K8s Ingress]
    INGRESS --> SVC[K8s Service]
    SVC --> POD1[Pod 1]
    SVC --> POD2[Pod 2]
    SVC --> PODN[Pod N]

    POD1 --> DB[(Database)]
    POD1 --> CACHE[(Redis)]
    POD1 --> STORAGE[(S3)]
```

## Deployment Architecture

### Multi-Region Setup

```mermaid
graph TB
    subgraph "Global"
        ROUTE53[Route53/DNS]
        CF[CloudFront]
    end

    subgraph "Region 1 (Primary)"
        LB1[Load Balancer]
        K8S1[EKS/GKE Cluster]
        RDS1[(RDS Primary)]
        CACHE1[(ElastiCache)]
    end

    subgraph "Region 2 (Secondary)"
        LB2[Load Balancer]
        K8S2[EKS/GKE Cluster]
        RDS2[(RDS Replica)]
        CACHE2[(ElastiCache)]
    end

    ROUTE53 --> CF
    CF --> LB1
    CF --> LB2

    K8S1 --> RDS1
    K8S2 --> RDS2
    RDS1 -.->|Replication| RDS2
```

### Kubernetes Architecture

```mermaid
graph TB
    subgraph "Kubernetes Cluster"
        subgraph "cygni-system"
            CTRL[Cygni Controller]
            API[API Service]
            AUTH[Auth Service]
            BUILDER[Builder Service]
        end

        subgraph "cygni-apps"
            APP1[User App 1]
            APP2[User App 2]
            APPN[User App N]
        end

        subgraph "monitoring"
            PROM[Prometheus]
            GRAF[Grafana]
            LOKI[Loki]
        end

        subgraph "ingress-nginx"
            INGRESS[Nginx Controller]
        end
    end

    INGRESS --> API
    INGRESS --> APP1
    INGRESS --> APP2

    CTRL --> APP1
    CTRL --> APP2
    CTRL --> APPN

    PROM --> APP1
    PROM --> APP2
    PROM --> API
```

## Technology Stack

### Core Technologies

- **Languages**: TypeScript (Node.js), Go
- **Frameworks**: Fastify, Next.js, controller-runtime
- **Database**: PostgreSQL (Prisma ORM)
- **Cache**: Redis
- **Container**: Docker, Kaniko
- **Orchestration**: Kubernetes
- **Cloud**: AWS/GCP/Azure agnostic

### Infrastructure

- **CI/CD**: GitHub Actions
- **Monitoring**: Prometheus + Grafana
- **Logging**: Loki
- **Tracing**: OpenTelemetry
- **Security**: Trivy, OWASP, CodeQL

### Development Tools

- **Package Manager**: pnpm (workspaces)
- **Build Tool**: Turbo
- **Testing**: Jest, Go testing
- **Linting**: ESLint, golangci-lint
- **Type Checking**: TypeScript

## Design Principles

1. **Cloud Native**: Built for Kubernetes from the ground up
2. **Microservices**: Clear service boundaries and responsibilities
3. **API First**: All functionality exposed via REST APIs
4. **Developer Experience**: Simple CLI, clear documentation
5. **Production Ready**: Health checks, monitoring, auto-scaling
6. **Multi-Tenant**: Secure isolation between customers
7. **Extensible**: Plugin architecture for custom builders

## Security Architecture

```mermaid
graph TB
    subgraph "Security Layers"
        WAF[WAF/DDoS Protection]
        TLS[TLS Termination]
        AUTH[Authentication]
        AUTHZ[Authorization]
        SECRETS[Secrets Management]
        SCAN[Security Scanning]
    end

    subgraph "Implementation"
        CF_WAF[CloudFront + WAF]
        CERT[Cert-Manager]
        JWT[JWT + OAuth]
        RBAC[RBAC Policies]
        VAULT[K8s Secrets]
        TRIVY[Trivy Scanner]
    end

    WAF --> CF_WAF
    TLS --> CERT
    AUTH --> JWT
    AUTHZ --> RBAC
    SECRETS --> VAULT
    SCAN --> TRIVY
```

## Scaling Strategy

- **Horizontal Scaling**: KEDA for advanced metrics
- **Vertical Scaling**: Resource recommendations
- **Database Scaling**: Read replicas, connection pooling
- **Caching**: Multi-layer (CDN, Redis, application)
- **Auto-scaling Policies**: CPU, memory, request rate, custom metrics

## Future Architecture Considerations

1. **Edge Computing**: Deploy to edge locations
2. **Serverless Functions**: Lambda/Cloud Functions support
3. **AI/ML Workloads**: GPU support and ML pipelines
4. **Multi-Cloud**: Single control plane for multiple clouds
5. **GitOps**: Flux/ArgoCD integration
