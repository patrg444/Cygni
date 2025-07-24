# Getting Started with Cygni

This guide will walk you through deploying your first application on Cygni in under 5 minutes.

## Prerequisites

- Node.js 18+ installed
- A GitHub account (for automatic deployments)
- A project ready to deploy (Next.js, React, Node.js, etc.)

## Installation

### 1. Install the Cygni CLI

```bash
npm install -g @cygni/cli
```

Verify the installation:

```bash
cygni --version
```

### 2. Create a Cygni Account

If you don't have an account yet:

```bash
cygni signup
```

Or login to your existing account:

```bash
cygni login
```

## Deploy Your First App

### Option 1: Deploy from Local Directory

Navigate to your project:

```bash
cd my-awesome-app
```

Deploy with a single command:

```bash
cygni deploy
```

Cygni will:

- Detect your framework automatically
- Build your application
- Deploy it to a global CDN
- Provide you with a live URL

### Option 2: Deploy from GitHub

Import and deploy a GitHub repository:

```bash
cygni deploy --git https://github.com/username/repo
```

Or connect your GitHub account for automatic deployments:

```bash
cygni github connect
cygni github import username/repo
```

## Essential Commands

### View Your Projects

List all your projects:

```bash
cygni projects list
```

### Check Deployment Status

View deployment details:

```bash
cygni status
```

View real-time logs:

```bash
cygni logs --follow
```

### Manage Environment Variables

Add environment variables:

```bash
cygni env add DATABASE_URL "postgres://..." --production
cygni env add API_KEY "sk_test_..." --production --encrypted
```

List variables (values hidden):

```bash
cygni env list
```

### Custom Domains

Add a custom domain:

```bash
cygni domains add app.yourdomain.com
```

Follow the DNS instructions provided to complete setup.

## Framework-Specific Guides

### Next.js

```bash
# Deploy a Next.js app
cd my-nextjs-app
cygni deploy

# Set Next.js specific env vars
cygni env add NEXT_PUBLIC_API_URL "https://api.example.com"
```

### React (Vite)

```bash
# Deploy a React app
cd my-react-app
cygni deploy

# Cygni auto-detects Vite and runs build
```

### Node.js API

```bash
# Deploy an Express/Fastify API
cd my-api
cygni deploy

# Ensure your package.json has a start script
```

### Python

```bash
# Deploy a Python app
cd my-python-app
cygni deploy

# Ensure you have requirements.txt or pyproject.toml
```

## Preview Deployments

Every pull request gets its own preview deployment:

1. Connect your GitHub repository
2. Open a pull request
3. Cygni automatically deploys a preview
4. Preview URL is added as a PR comment

## Monitoring & Analytics

### View Metrics

Access your dashboard:

```bash
cygni dashboard
```

Or check metrics via CLI:

```bash
cygni metrics --period 24h
```

### Set Up Alerts

Configure alerts for your application:

```bash
cygni alerts create --type error-rate --threshold 1% --email you@example.com
```

## Team Collaboration

### Invite Team Members

```bash
cygni team invite colleague@company.com --role developer
```

### Manage Access

```bash
cygni team list
cygni team update colleague@company.com --role admin
```

## Advanced Features

### Webhooks

Set up webhooks for deployment events:

```bash
cygni webhooks create --url https://your-api.com/webhook --events deployment.succeeded,deployment.failed
```

### API Access

Generate an API token:

```bash
cygni tokens create --name "CI/CD Pipeline"
```

Use the API:

```bash
curl https://api.cygni.dev/v2/projects \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Troubleshooting

### Build Failures

Check build logs:

```bash
cygni logs --build
```

Common fixes:

- Ensure all dependencies are in package.json
- Check Node.js version compatibility
- Verify build commands in package.json

### Domain Issues

Verify DNS configuration:

```bash
cygni domains verify app.yourdomain.com
```

### Performance Issues

Check performance metrics:

```bash
cygni performance --last 1h
```

## Next Steps

- [Configure custom domains](./CUSTOM_DOMAINS.md)
- [Set up CI/CD with GitHub Actions](./CI_CD.md)
- [Optimize for production](./PRODUCTION_OPTIMIZATION.md)
- [Security best practices](./SECURITY.md)

## Getting Help

- Documentation: https://docs.cygni.dev
- Discord: https://discord.gg/cygni
- Email: support@cygni.dev
- GitHub Issues: https://github.com/patrg444/Cygni/issues
