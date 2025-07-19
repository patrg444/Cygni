# Getting Started with Cygni

Welcome to Cygni! This guide will help you deploy your first application in minutes.

## Prerequisites

- Node.js 18+ installed
- Git installed
- A Cygni account (sign up at [cloudexpress.io](https://cloudexpress.io))

## Installation

Install the Cygni CLI globally:

```bash
npm install -g @cloudexpress/cli
```

Or use it directly with npx:

```bash
npx @cloudexpress/cli
```

## Quick Start

### 1. Login to Cygni

```bash
cloudexpress login
```

This will open your browser to authenticate with Cygni.

### 2. Initialize Your Project

Navigate to your project directory and run:

```bash
cloudexpress init
```

The CLI will:

- Detect your framework automatically
- Ask about services you need (database, auth, storage)
- Create a `cloudexpress.yaml` configuration file

### 3. Deploy Your Application

```bash
cloudexpress deploy
```

That's it! Your application will be built and deployed to Cygni.

## Configuration

The `cloudexpress.yaml` file defines your application:

```yaml
name: my-app
framework: nextjs

services:
  web:
    build:
      command: npm run build
    start:
      command: npm start
      port: 3000
    scaling:
      min: 1
      max: 10

  database:
    type: postgres
    version: "15"

  auth:
    enabled: true
    providers:
      - google
      - github
```

## Preview Environments

Cygni automatically creates preview environments for every pull request:

1. Push your branch to GitHub
2. Open a pull request
3. Cygni will comment with your preview URL
4. The preview updates automatically with each push

## Environment Variables

Set environment variables through the CLI:

```bash
cloudexpress env set API_KEY=secret
cloudexpress env list
cloudexpress env remove API_KEY
```

Or manage them in the web dashboard.

## Monitoring & Logs

View real-time logs:

```bash
cloudexpress logs --follow
```

Check deployment status:

```bash
cloudexpress status
```

## Next Steps

- [Deploy a Full-Stack App](./tutorials/fullstack-app.md)
- [Configure Custom Domains](./guides/custom-domains.md)
- [Set Up CI/CD](./guides/cicd.md)
- [Bring Your Own Cloud](./guides/byoc.md)
