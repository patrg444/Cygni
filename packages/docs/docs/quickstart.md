---
sidebar_position: 2
---

# Quick Start

Get your first app deployed on Cygni in under 5 minutes.

## Prerequisites

- Node.js 16+ installed
- A GitHub account
- A Cygni account ([sign up free](https://app.cygni.dev/signup))

## Install the CLI

First, install the Cygni CLI globally:

```bash
npm install -g @cygni/cli
```

Verify the installation:

```bash
cygni --version
```

## Login to Cygni

Authenticate with your Cygni account:

```bash
cygni login
```

This will open your browser for authentication. Once complete, you'll be logged in.

## Deploy Your First App

### Option 1: Deploy an Existing Project

Navigate to your project directory and deploy:

```bash
cd my-app
cygni deploy
```

Cygni will automatically:
- Detect your framework (Next.js, React, Vue, etc.)
- Build your application
- Deploy it globally
- Provide you with a live URL

### Option 2: Deploy a Template

Use one of our starter templates:

```bash
# Next.js app
cygni init my-app --template nextjs
cd my-app
cygni deploy

# Express API
cygni init my-api --template express
cd my-api
cygni deploy

# Static site
cygni init my-site --template static
cd my-site
cygni deploy
```

## Your App is Live! 🎉

After deployment, you'll see output like:

```
✓ Build complete
✓ Deploying to Cygni...
✓ Deployment successful!

🚀 Your app is live at: https://my-app-abc123.cygni.app

View logs: cygni logs
Manage app: https://app.cygni.dev/projects/my-app
```

## What's Next?

### Add a Custom Domain

```bash
cygni domains add example.com
```

### Set Environment Variables

```bash
cygni env set API_KEY=your-secret-key
cygni env set DATABASE_URL=postgresql://...
```

### View Logs

```bash
# Stream logs in real-time
cygni logs --follow

# View recent logs
cygni logs --lines 100
```

### Monitor Your App

Visit your [Cygni Dashboard](https://app.cygni.dev) to:
- View deployment history
- Monitor performance metrics
- Set up alerts
- Manage team members

## Common Commands

```bash
# List your projects
cygni list

# Get project info
cygni info

# Delete a deployment
cygni delete my-app

# View help
cygni help
```

## Framework Guides

Need framework-specific guidance? Check out our guides:

- [Deploy Next.js Apps](/docs/frameworks/nextjs)
- [Deploy React Apps](/docs/frameworks/react)
- [Deploy Vue Apps](/docs/frameworks/vue)
- [Deploy Express APIs](/docs/frameworks/express)
- [Deploy Static Sites](/docs/frameworks/static)

## Troubleshooting

Having issues? Check our [troubleshooting guide](/docs/troubleshooting) or join our [Discord community](https://discord.gg/cygni) for help.