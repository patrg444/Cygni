# Getting Started: Deploy the Fullstack Demo

This guide walks you through deploying a complete fullstack application using the Cygni CLI (`cx`). We'll use the fullstack-demo project which showcases all of Cygni's capabilities.

## Prerequisites

Before you begin, ensure you have:

- Node.js 16+ installed
- npm or yarn package manager
- Git installed
- Docker (optional, for local database)

## Step 1: Clone the Demo Project

First, let's get the fullstack demo project:

```bash
git clone https://github.com/cygni/fullstack-demo.git
cd fullstack-demo
```

This demo includes:

- **Frontend**: Next.js app with TypeScript, Tailwind CSS, and React Query
- **Backend**: Express.js API with TypeScript and PostgreSQL
- **Shared Types**: Common TypeScript interfaces

## Step 2: Install Dependencies

The project uses npm workspaces to manage multiple services:

```bash
npm install
```

This installs dependencies for all services in one command.

## Step 3: Set Up Local Development

Before deploying, let's run the app locally to understand what we're deploying.

### Start a Local Database

If you have Docker:

```bash
docker run -d \
  --name postgres-demo \
  -e POSTGRES_PASSWORD=localpass \
  -e POSTGRES_DB=fullstack_demo \
  -p 5432:5432 \
  postgres:15
```

### Configure Environment Variables

Create `.env` files for local development:

**backend/.env**:

```bash
DATABASE_URL=postgres://postgres:localpass@localhost:5432/fullstack_demo
JWT_SECRET=local-development-secret
PORT=3001
```

**frontend/.env.local**:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Run the Services

In separate terminals:

```bash
# Terminal 1: Start the backend
cd backend
npm run dev

# Terminal 2: Start the frontend
cd frontend
npm run dev
```

Visit http://localhost:3000 to see the app running locally.

## Step 4: Install Cygni CLI

Now let's deploy this to the cloud. First, install the Cygni CLI:

```bash
npm install -g @cygni/cli
```

Verify installation:

```bash
cx --version
```

## Step 5: Initialize for Deployment

### Login to Cygni

```bash
cx login
```

This opens your browser for authentication.

### Initialize the Project

In the project root, run:

```bash
cx init
```

This creates a `cygni.yml` configuration file by analyzing your project structure.

### Configure Services

Edit `cygni.yml` to ensure it matches your project:

```yaml
name: fullstack-demo
version: 1.0

services:
  - name: backend
    type: backend
    path: ./backend
    framework: express
    build:
      command: npm run build
      output: dist
    env:
      - DATABASE_URL
      - JWT_SECRET
    healthcheck:
      path: /health
      interval: 30s

  - name: frontend
    type: frontend
    path: ./frontend
    framework: nextjs
    build:
      command: npm run build
      output: .next
    env:
      - NEXT_PUBLIC_API_URL

dependencies:
  frontend:
    - backend # Frontend depends on backend API
```

## Step 6: Set Production Secrets

Your app needs production database credentials and secrets:

```bash
# Set database URL (Cygni can provision one for you)
cx secrets set DATABASE_URL "postgres://user:pass@host:5432/proddb"

# Set JWT secret for authentication
cx secrets set JWT_SECRET "$(openssl rand -base64 32)"

# Verify secrets are set
cx secrets list
```

## Step 7: Analyze the Project

Let Cygni analyze your codebase:

```bash
cx analyze
```

Output shows:

- Detected services and frameworks
- API endpoints found
- Service dependencies
- Build configurations

## Step 8: Build for Production

Build all services:

```bash
cx build
```

This:

1. Builds backend first (since frontend depends on it)
2. Injects environment variables during build
3. Creates optimized production builds

## Step 9: Deploy to Production

Deploy your application:

```bash
cx deploy --environment production
```

Cygni will:

1. Create cloud resources
2. Deploy the backend service
3. Get the backend URL and inject it into frontend build
4. Deploy the frontend service
5. Set up SSL certificates
6. Configure CDN for frontend assets

## Step 10: Verify Deployment

Once deployed, you'll see:

```
🚀 Deployment Complete!

Frontend: https://fullstack-demo-app.cygni.app
Backend:  https://fullstack-demo-api.cygni.app

View logs: cx logs
Check status: cx status
```

Visit your frontend URL to see the live application!

## Step 11: Set Up Preview Environments

Enable automatic preview deployments for pull requests:

### Configure GitHub Integration

```bash
# Generate webhook secret
WEBHOOK_SECRET=$(openssl rand -base64 32)
echo "Webhook secret: $WEBHOOK_SECRET"

# Start local webhook listener (for testing)
cx git listen --port 3333 --secret "$WEBHOOK_SECRET"
```

### Add GitHub Webhook

In your GitHub repository settings:

1. Go to Settings → Webhooks → Add webhook
2. Payload URL: `https://your-webhook-url.com/webhook`
3. Content type: `application/json`
4. Secret: Use the secret from above
5. Events: Select "Pull requests"

Now every PR gets its own preview environment!

## Step 12: Generate Admin UI

If your backend has REST endpoints, generate an admin interface:

```bash
# First, generate OpenAPI spec from your Express app
cx api analyze --output openapi.json

# Then generate UI components
cx generate ui --spec openapi.json --output ./frontend/src/app/admin
```

This creates:

- CRUD pages for each resource
- Forms with validation
- TypeScript types
- React Query hooks

## Common Tasks

### View Logs

```bash
# All services
cx logs --tail

# Specific service
cx logs --service backend --tail

# Filter by time
cx logs --since 1h
```

### Update Secrets

```bash
# Update a secret
cx secrets set DATABASE_URL "new-connection-string"

# Remove a secret
cx secrets remove OLD_SECRET

# Import from .env file
cx secrets import .env.production
```

### Scale Services

```bash
# Manual scaling
cx scale backend --replicas 3

# Auto-scaling (via cygni.yml)
services:
  - name: backend
    scaling:
      min: 2
      max: 10
      cpu: 70  # Scale at 70% CPU
```

### Rollback Deployment

```bash
# List deployments
cx deployments list

# Rollback to previous
cx rollback

# Rollback to specific version
cx rollback --deployment dep_abc123
```

## Troubleshooting

### Build Failures

1. Check build logs: `cx logs --service backend --build`
2. Verify environment variables are set
3. Test build locally: `npm run build`

### Connection Issues

1. Check backend is running: `cx status`
2. Verify CORS settings in backend
3. Check environment variables in frontend

### Database Issues

1. Verify DATABASE_URL is set correctly
2. Check database logs: `cx logs --service database`
3. Run migrations: `cx run backend -- npm run migrate`

## Next Steps

Now that you have a working deployment:

1. **[Custom Domain](./custom-domains.md)**: Set up yourdomain.com
2. **[CI/CD Pipeline](./github-actions.md)**: Automate deployments
3. **[Monitoring](./monitoring.md)**: Set up alerts and dashboards
4. **[Database Backups](./database-backups.md)**: Configure automatic backups

## Learn More

- **Full Documentation**: [docs.cygni.cloud](https://docs.cygni.cloud)
- **Example Projects**: [github.com/cygni/examples](https://github.com/cygni/examples)
- **Community Discord**: [discord.gg/cygni](https://discord.gg/cygni)

Congratulations! You've deployed a production-ready fullstack application with Cygni! 🎉
