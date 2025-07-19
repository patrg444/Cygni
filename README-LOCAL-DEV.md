# Cygni Local Development Setup

## Prerequisites

- Node.js 18+
- pnpm 8+
- Docker & Docker Compose
- PostgreSQL (or use Docker)

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/patrg444/Cygni.git
cd Cygni
pnpm install
```

### 2. Set up environment

```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Start infrastructure

```bash
# Start PostgreSQL, Redis, MinIO
docker-compose up -d

# Create databases
./scripts/setup-local-db.sh
```

### 4. Run services

```bash
# Start all services in development mode
pnpm dev

# Or run individual services:
cd services/api && pnpm dev
cd services/auth && pnpm dev
cd packages/web-ui && pnpm dev
```

## Available Scripts

- `pnpm dev` - Start all services
- `pnpm build` - Build all packages
- `pnpm test` - Run tests
- `pnpm lint` - Run linting
- `pnpm typecheck` - TypeScript checking

## Service URLs

- API: http://localhost:3000
- Web UI: http://localhost:3001
- Auth: http://localhost:3002
- PostgreSQL: localhost:5432
- Redis: localhost:6379
- MinIO: localhost:9000 (console: 9001)

## Next Steps

1. Build the landing page (packages/landing)
2. Implement CLI commands (packages/cli)
3. Create dashboard UI (packages/web-ui)
4. Set up Kubernetes cluster for testing
