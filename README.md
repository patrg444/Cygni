# Cygni

[![CI Pipeline](https://github.com/patrg444/Cygni/actions/workflows/ci.yml/badge.svg)](https://github.com/patrg444/Cygni/actions/workflows/ci.yml)
![Status: Alpha](https://img.shields.io/badge/Status-Alpha-yellow)
![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue)

The full-stack developer cloud platform that combines the simplicity of PaaS with the flexibility of AWS. Deploy frontend, backend, databases, and workers - all in one place.

> ⚠️ **Current Status**: Cygni is in early alpha development. Core infrastructure is being built. Not yet ready for production use.

## 🎯 Vision

Cygni aims to be the developer-first cloud platform that makes deploying full-stack applications as simple as `git push`, while giving you the power and flexibility of your own cloud infrastructure.

## ✨ Features (Planned)

- **One-Click Deployments**: Push to deploy with automatic CI/CD
- **Full-Stack Preview Environments**: Complete environments for every PR
- **Integrated Services**: Database, auth, storage, and background jobs built-in
- **Multi-Language Support**: Node.js, Python, Go, Ruby, and more
- **Bring Your Own Cloud**: Deploy to your own AWS/GCP/Azure account
- **Open Source**: Fully transparent and self-hostable

## 🚧 Current Implementation Status

### ✅ Completed

- **Infrastructure as Code**: Terraform modules for AWS (VPC, RDS, EKS, S3)
- **Kubernetes Deployment**: Production-ready Helm charts
- **API Service**: Core REST API with authentication and RBAC
- **CLI Tool**: Framework detection and deployment commands
- **SDK**: TypeScript/JavaScript SDK with full API coverage
- **CI/CD**: GitHub Actions with health checks and security scanning
- **Docker**: Multi-stage builds with security hardening

### 🔄 In Progress

- Runtime orchestrator for container management
- Builder service for source-to-container
- Web dashboard UI
- Billing and metering integration

### 📋 Roadmap

- [ ] Complete runtime orchestrator with Kubernetes CRDs
- [ ] Implement builder service with buildpack support
- [ ] Create web dashboard for project management
- [ ] Add support for multiple cloud providers
- [ ] Implement preview environments
- [ ] Add monitoring and observability stack

## 🛠️ Tech Stack

- **Backend**: Node.js, Fastify, Prisma, PostgreSQL
- **Infrastructure**: Kubernetes, Terraform, Docker
- **Languages**: TypeScript, Go (for K8s controllers)
- **Tools**: pnpm workspaces, Turbo

## 🚀 Quick Start (Development)

```bash
# Clone the repository
git clone https://github.com/patrg444/Cygni.git
cd Cygni

# Install dependencies
pnpm install

# Initialize development environment
./scripts/init-dev-secrets.sh

# Start local development
docker-compose up -d
pnpm dev

# Run tests
pnpm test
```

## 📁 Project Structure

```
cygni/
├── packages/           # Shared packages
│   ├── cli/           # Command-line interface
│   └── sdk/           # JavaScript/TypeScript SDK
├── services/          # Microservices
│   ├── api/           # REST API service
│   ├── auth/          # Authentication service (planned)
│   ├── builder/       # Build service (planned)
│   └── runtime/       # Runtime orchestrator (planned)
├── infrastructure/    # Infrastructure as Code
│   ├── terraform/     # AWS infrastructure
│   └── helm/          # Kubernetes charts
└── docs/             # Documentation
```

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run unit tests
pnpm test:unit

# Run integration tests
pnpm test:integration

# Run linting
pnpm lint

# Type checking
pnpm typecheck
```

## 🚢 Deployment

### Local Development

```bash
docker-compose up
```

### Production (Kubernetes)

```bash
# Install with Helm
helm install cygni ./infrastructure/helm/cygni \
  --namespace cygni \
  --create-namespace \
  -f values.production.yaml
```

### Infrastructure (AWS)

```bash
cd infrastructure/terraform
terraform init
terraform plan -var-file=environments/production.tfvars
terraform apply -var-file=environments/production.tfvars
```

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

### Development Setup

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📚 Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [API Documentation](docs/api/README.md)
- [CLI Reference](packages/cli/README.md)
- [SDK Documentation](packages/sdk/README.md)

## 🔒 Security

- All containers run as non-root users
- Secrets are managed via environment variables
- Network policies restrict pod-to-pod communication
- Regular security scanning with Trivy

For security issues, please email security@cygni.dev

## 📄 License

Cygni is open source under the Apache 2.0 license. See [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

Inspired by platforms like Vercel, Railway, and Render, with the goal of providing similar developer experience while maintaining full control over your infrastructure.
