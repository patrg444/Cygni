# Cygni

[![CI Pipeline](https://github.com/patrg444/Cygni/actions/workflows/ci.yml/badge.svg)](https://github.com/patrg444/Cygni/actions/workflows/ci.yml)
![Status: Beta](https://img.shields.io/badge/Status-Beta-orange)
![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue)

The full-stack developer cloud platform that combines the simplicity of PaaS with the flexibility of AWS. Deploy frontend, backend, databases, and workers - all in one place.

> **Current Status**: Cygni is in beta. All core features are implemented and the platform is ready for testing. Join our beta program!

## Vision

Cygni aims to be the developer-first cloud platform that makes deploying full-stack applications as simple as `git push`, while giving you the power and flexibility of your own cloud infrastructure.

## Features

### Production Ready

- **One-Click Deployments**: Deploy any framework with `cygni deploy`
- **Preview Environments**: Automatic deployments for every PR
- **Multi-Framework Support**: Next.js, React, Vue, Express, Python, and more
- **Custom Domains**: SSL certificates auto-provisioned
- **Environment Variables**: Secure secret management
- **GitHub Integration**: Auto-deploy on push

### Developer Experience

- **Interactive CLI**: Framework detection and smart defaults
- **Real-time Logs**: Stream logs with `cygni logs --follow`
- **Performance Monitoring**: Built-in metrics and alerts
- **Team Collaboration**: Role-based access control
- **API Access**: Full REST API v2 with webhooks
- **Zero-config Deployments**: Works out of the box

### Enterprise Ready

- **SOC2 Compliant**: Audit logs and security controls
- **Multi-tenant Isolation**: Secure data separation
- **OAuth/SAML**: GitHub and enterprise SSO
- **Rate Limiting**: Tiered by plan
- **99.9% Uptime SLA**: With monitoring
- **24/7 Support**: For enterprise customers

## Quick Start

### 1. Install Cygni CLI

```bash
npm install -g @cygni/cli
```

### 2. Deploy Your First App

#### Deploy a Next.js App

```bash
cd my-nextjs-app
cygni deploy
# Your app is live at https://my-app-abc123.cygni.app
```

#### Deploy from GitHub

```bash
cygni deploy --git https://github.com/username/repo
```

#### Deploy with Custom Domain

```bash
cygni deploy --prod
cygni domains add app.yourdomain.com
```

### 3. Manage Your Deployment

```bash
# View logs
cygni logs --follow

# Add environment variables
cygni env add DATABASE_URL "postgres://..." --production --encrypted

# Check status
cygni status
```

## Examples

Check out our [examples directory](./examples) for complete deployment examples:

- [Next.js App Router](./examples/nextjs-app-router)
- [Express API](./examples/express-api)
- [React SPA](./examples/react-spa)
- [Full-Stack App](./examples/nextjs-prisma)
- [And many more...](./examples)

## Implementation Status

### Phase 1: Observability & Operations ✅

- Structured logging with JSON format
- Prometheus metrics for monitoring
- Alerting system integration
- Comprehensive runbooks

### Phase 2: Billing & User Management ✅

- User accounts with secure authentication
- Stripe integration for payments
- Usage tracking and quotas
- Subscription management

### Phase 3: Security & Compliance ✅

- Rate limiting by tier
- Complete audit logging
- GitHub OAuth integration
- Multi-tenant data isolation
- Role-based access control
- SOC2 Type II preparation

### Phase 4: Production Polish ✅

- Modern dashboard (Next.js 15)
- Documentation site (Docusaurus)
- Interactive onboarding
- Sentry error tracking
- API v2 with versioning
- Webhook system
- Performance monitoring

### Coming Soon (Phase 5)

- SSO/SAML for enterprises
- Advanced deployment strategies
- Private cloud options
- Global edge network

## Development Setup

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

## Project Structure

```
cygni/
 packages/
    api/              # REST API with Express
    cli/              # Command-line interface
    sdk/              # TypeScript SDK
    dashboard/        # Next.js admin dashboard
    docs/             # Docusaurus documentation
 infrastructure/
    docker/           # Docker configurations
    kubernetes/       # K8s manifests
    terraform/        # AWS infrastructure
 scripts/              # Development scripts
 docs/                 # Additional documentation
 examples/             # Example applications
```

## Testing

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

## Deployment

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

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

### Development Setup

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Documentation

- [Getting Started](docs/GETTING_STARTED.md)
- [Architecture Overview](docs/ARCHITECTURE_OVERVIEW.md)
- [CLI Command Reference](packages/cli/docs/COMMAND_REFERENCE.md)
- [API Documentation](docs/api/README.md)
- [SDK Documentation](packages/sdk/README.md)
- [Example Applications](examples/README.md)
- [Video Tutorials](packages/docs/docs/tutorials/video-tutorials.md)

## Security

- All containers run as non-root users
- Secrets are managed via environment variables
- Network policies restrict pod-to-pod communication
- Regular security scanning with Trivy

For security issues, please email security@cygni.dev

## Tech Stack

- **Backend**: Node.js, Express.js, Prisma, PostgreSQL
- **Frontend**: Next.js 15, React 19, TailwindCSS
- **Infrastructure**: Kubernetes, Docker, Terraform
- **Languages**: TypeScript throughout
- **Monitoring**: Prometheus, Sentry, custom APM
- **Security**: JWT auth, OAuth, RBAC, rate limiting

## Support

- **Documentation**: https://docs.cygni.dev
- **Discord Community**: https://discord.gg/cygni
- **Email**: support@cygni.dev
- **GitHub Issues**: https://github.com/patrg444/Cygni/issues

## License

Cygni is open source under the Apache 2.0 license. See [LICENSE](LICENSE) for details.

## Acknowledgments

Inspired by platforms like Vercel, Railway, and Render, with the goal of providing similar developer experience while maintaining full control over your infrastructure.
