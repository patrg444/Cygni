# Cygni Architecture Overview

## System Architecture

Cygni is built as a modern, microservices-based platform designed for scalability, security, and developer experience.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              User Layer                                  │
├─────────────┬──────────────┬──────────────┬──────────────┬─────────────┤
│     CLI     │   Dashboard  │     API      │   GitHub     │   Webhooks  │
│  (TypeScript)│  (Next.js)   │  (REST v2)   │    OAuth     │   Events    │
└──────┬──────┴──────┬───────┴──────┬───────┴──────┬───────┴──────┬──────┘
       │             │              │              │              │
       └─────────────┴──────────────┴──────────────┴──────────────┘
                                    │
                          ┌─────────▼─────────┐
                          │   API Gateway    │
                          │  (Express.js)    │
                          └─────────┬─────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
┌───────▼────────┐        ┌────────▼────────┐        ┌────────▼────────┐
│ Authentication │        │  Core Services  │        │   Monitoring    │
│    Service     │        │                 │        │    Service      │
├────────────────┤        ├─────────────────┤        ├─────────────────┤
│ • JWT Tokens   │        │ • Projects      │        │ • Metrics       │
│ • OAuth        │        │ • Deployments   │        │ • Logs          │
│ • Permissions  │        │ • Builds        │        │ • Alerts        │
│ • Sessions     │        │ • Domains       │        │ • Analytics     │
└────────────────┘        └─────────────────┘        └─────────────────┘
        │                           │                           │
        └───────────────────────────┼───────────────────────────┘
                                    │
                          ┌─────────▼─────────┐
                          │   Data Layer     │
                          ├─────────────────┤
                          │ • PostgreSQL    │
                          │ • Redis Cache   │
                          │ • S3 Storage    │
                          └─────────────────┘
```

## Core Components

### 1. API Gateway

- **Technology**: Express.js with TypeScript
- **Features**:
  - Request routing and validation
  - Rate limiting (tiered by plan)
  - API versioning (v1, v2)
  - CORS handling
  - Request/response logging

### 2. Authentication Service

- **JWT-based authentication** with refresh tokens
- **OAuth providers**: GitHub, Google
- **RBAC** with custom roles and permissions
- **Multi-tenant isolation** at database level
- **Session management** with Redis

### 3. Core Services

#### Project Service

- Project creation and management
- Framework detection
- Build configuration
- Environment variable management

#### Deployment Service

- Deployment orchestration
- Build pipeline integration
- Zero-downtime deployments
- Rollback capabilities
- Preview deployments for PRs

#### Domain Service

- Custom domain management
- SSL certificate provisioning (Let's Encrypt)
- DNS verification
- CDN integration

### 4. Monitoring Stack

- **Metrics**: Prometheus format
- **Logging**: Structured JSON logs
- **Error Tracking**: Sentry integration
- **Performance Monitoring**: Custom APM
- **Alerting**: Email, Slack, webhooks

### 5. Data Layer

- **PostgreSQL**: Primary database with row-level security
- **Redis**: Session cache, rate limiting, temporary data
- **S3**: Build artifacts, static assets, logs archive

## Security Architecture

### Multi-Layer Security

```
┌─────────────────────────────────────────┐
│         External Requests               │
└──────────────────┬──────────────────────┘
                   │
         ┌─────────▼─────────┐
         │   WAF / DDoS      │
         │   Protection      │
         └─────────┬─────────┘
                   │
         ┌─────────▼─────────┐
         │   Rate Limiting   │
         │   (Per User/IP)   │
         └─────────┬─────────┘
                   │
         ┌─────────▼─────────┐
         │  Authentication   │
         │   JWT + OAuth     │
         └─────────┬─────────┘
                   │
         ┌─────────▼─────────┐
         │  Authorization    │
         │   RBAC + RLS      │
         └─────────┬─────────┘
                   │
         ┌─────────▼─────────┐
         │   Audit Logging   │
         │   All Actions     │
         └─────────┬─────────┘
                   │
         ┌─────────▼─────────┐
         │  Data Encryption  │
         │  At Rest + Transit│
         └───────────────────┘
```

### Security Features

1. **Authentication**: JWT with secure rotation
2. **Authorization**: Role-based with resource policies
3. **Encryption**: TLS 1.3+ and AES-256 at rest
4. **Audit Trail**: Comprehensive logging of all actions
5. **Compliance**: SOC2-ready with retention policies

## Deployment Architecture

### High-Level Deployment Flow

```
Developer → Git Push → GitHub Webhook → Cygni API → Build Queue
                                                          │
                                                          ▼
                                                    Build Service
                                                          │
                                                          ▼
                                                 Container Registry
                                                          │
                                                          ▼
                                                  Deployment Service
                                                          │
                                                          ▼
                                                   CDN + Edge Nodes
```

### Build Pipeline

1. **Source**: Git repository (GitHub, GitLab, Bitbucket)
2. **Detection**: Automatic framework detection
3. **Build**: Containerized builds with caching
4. **Optimization**: Asset optimization, tree shaking
5. **Artifacts**: Stored in S3 with CDN distribution

## Scalability Design

### Horizontal Scaling

- **API Servers**: Auto-scaling based on CPU/memory
- **Database**: Read replicas for query distribution
- **Cache Layer**: Redis cluster with sharding
- **CDN**: Global edge network for static assets

### Performance Optimizations

1. **Database**:
   - Connection pooling
   - Query optimization with indexes
   - Materialized views for analytics

2. **Caching**:
   - Redis for hot data
   - CDN for static assets
   - Browser caching headers

3. **API**:
   - Response compression
   - Pagination with cursors
   - GraphQL for mobile (planned)

## Monitoring and Observability

### Metrics Collection

```
Application → StatsD → Prometheus → Grafana
     │                                  │
     └──────────────────────────────────┘
              Custom Dashboards
```

### Log Aggregation

```
Application → JSON Logs → Log Shipper → Elasticsearch
                                             │
                                         Kibana UI
```

## Technology Stack

### Backend

- **Runtime**: Node.js 20+ LTS
- **Framework**: Express.js
- **Language**: TypeScript
- **ORM**: Prisma
- **Validation**: Zod
- **Testing**: Jest, Supertest

### Frontend

- **Dashboard**: Next.js 15, React 19
- **Styling**: TailwindCSS, Radix UI
- **State**: React Query
- **Forms**: React Hook Form

### Infrastructure

- **Container**: Docker
- **Orchestration**: Kubernetes-ready
- **CI/CD**: GitHub Actions
- **Monitoring**: Prometheus, Grafana
- **Secrets**: Environment variables, HashiCorp Vault (planned)

### Databases

- **Primary**: PostgreSQL 15+
- **Cache**: Redis 7+
- **Search**: Elasticsearch (planned)
- **Analytics**: ClickHouse (planned)

## Development Workflow

### Local Development

1. Docker Compose for services
2. Hot reload for all components
3. Seeded test data
4. Local SSL certificates

### Testing Strategy

- **Unit Tests**: 80%+ coverage
- **Integration Tests**: API endpoints
- **E2E Tests**: Critical user flows
- **Load Tests**: Performance benchmarks

### Deployment Process

1. **Development**: Auto-deploy on push to `dev`
2. **Staging**: Deploy on PR merge
3. **Production**: Manual promotion or tag-based

## Future Architecture Plans

### Phase 5: Enterprise Features

- **SSO/SAML**: Enterprise authentication
- **Private Cloud**: Self-hosted options
- **Advanced Deployments**: Canary, blue-green
- **Global Replication**: Multi-region support

### Phase 6: Platform Expansion

- **Mobile Apps**: iOS/Android deployment
- **Edge Functions**: Serverless at edge
- **Database Hosting**: Managed PostgreSQL/Redis
- **AI Integration**: Code suggestions, optimization

## Architecture Principles

1. **Modularity**: Loosely coupled services
2. **Security First**: Defense in depth
3. **Developer Experience**: Simple yet powerful
4. **Scalability**: Horizontal scaling by design
5. **Observability**: Metrics, logs, and traces
6. **Cost Efficiency**: Resource optimization
7. **Open Standards**: Avoid vendor lock-in
