# Cygni

The full-stack developer cloud platform that combines the simplicity of PaaS with the flexibility of AWS. Deploy frontend, backend, databases, and workers - all in one place.

## Features

- **One-Click Deployments**: Push to deploy with automatic CI/CD
- **Full-Stack Preview Environments**: Complete environments for every PR
- **Integrated Services**: Database, auth, storage, and background jobs built-in
- **Multi-Language Support**: Node.js, Python, Go, Ruby, and more
- **Bring Your Own Cloud**: Deploy to your own AWS/GCP/Azure account
- **Open Source**: Fully transparent and self-hostable

## Quick Start

```bash
# Install the Cygni CLI
npm install -g @cloudexpress/cli

# Initialize a new project
cloudexpress init my-app

# Deploy your application
cloudexpress deploy
```

## Architecture

Cygni is built on a modular, cloud-native architecture:

- **Control Plane**: Manages deployments, scaling, and orchestration
- **Runtime**: Container-based execution environment
- **Services**: Integrated database, auth, storage, and more
- **CLI & SDK**: Developer tools for seamless interaction

## Documentation

- [Getting Started](docs/getting-started.md)
- [Architecture Overview](docs/architecture.md)
- [Deployment Guide](docs/deployment.md)
- [API Reference](docs/api-reference.md)

## Community

- [Discord](https://discord.gg/cloudexpress)
- [GitHub Discussions](https://github.com/cloudexpress/cloudexpress/discussions)
- [Twitter](https://twitter.com/cloudexpress)

## License

Cygni is open source under the Apache 2.0 license. See [LICENSE](LICENSE) for details.