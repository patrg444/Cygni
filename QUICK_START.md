# 🚀 Cygni Quick Start - Deploy in 5 Minutes

Get your first app deployed to AWS in under 5 minutes. No AWS knowledge required!

## Prerequisites

- Node.js 18+ installed
- Git installed
- AWS account (free tier works!)

## 1️⃣ Install Cygni CLI (30 seconds)

```bash
npm install -g @cygni/cli

# Verify installation
cx --version
```

## 2️⃣ Set Up Your Account (1 minute)

```bash
# Create account and login
cx signup

# Follow the prompts:
# - Enter your email
# - Create a password
# - Name your team

# Configure AWS (we'll help!)
cx setup aws

# This will:
# - Help you create AWS credentials
# - Set up basic infrastructure
# - Configure your first project
```

## 3️⃣ Deploy Your First App (3 minutes)

### Option A: Deploy an Example App

```bash
# Create a new Next.js app
npx create-next-app@latest my-app --typescript --tailwind --app
cd my-app

# Initialize Cygni
cx init

# Deploy to AWS!
cx deploy
```

### Option B: Deploy Your Existing App

```bash
# Navigate to your project
cd your-app

# Let Cygni detect your framework
cx init

# Deploy it!
cx deploy
```

## 4️⃣ See Your App Live! (30 seconds)

```bash
✅ Deployment complete!

🌐 Your app is live at: https://my-app-7x9k2.cx-apps.com
📊 Dashboard: https://dashboard.cygni.dev/projects/my-app
💰 Estimated cost: $0.10/day

Quick actions:
- View logs:     cx logs
- Check status:  cx status
- Open in browser: cx open
```

## 🎯 What Just Happened?

Behind the scenes, Cygni:

1. **Detected your framework** - Next.js, React, Vue, Express, etc.
2. **Built your application** - Optimized for production
3. **Created AWS resources** - ECS, ALB, ECR, CloudWatch
4. **Deployed with zero-downtime** - Blue-green deployment
5. **Set up monitoring** - Logs, metrics, health checks
6. **Configured SSL** - HTTPS by default

All in your AWS account, under your control!

## 🎪 Try These Next

### Add Environment Variables

```bash
cx secrets set DATABASE_URL=postgres://...
cx secrets set STRIPE_KEY=sk_test_...
```

### Deploy to Production

```bash
cx deploy --env production
```

### Set Up Custom Domain

```bash
cx domains add myapp.com
```

### View Real-Time Logs

```bash
cx logs --follow
```

### Instant Rollback

```bash
cx rollback
```

## 🏃‍♂️ Speed Run Challenge

Can you beat our record?

```bash
time (
  git clone https://github.com/vercel/next-learn-starter &&
  cd next-learn-starter &&
  cx deploy --yes
)

# Current record: 47 seconds 🏆
```

## 📚 Common Patterns

### Full-Stack App with Database

```bash
# Create project
mkdir fullstack-app && cd fullstack-app

# Add your code
# ... frontend/ (React/Next.js)
# ... backend/ (Express API)
# ... docker-compose.yml

# Deploy everything
cx deploy

# Cygni handles:
# - Building both services
# - Setting up networking
# - Database connections
# - Load balancing
```

### Monorepo Deployment

```bash
# Cygni detects monorepos automatically
cd my-monorepo
cx deploy --service api
cx deploy --service web
cx deploy --service worker
```

### Preview Environments

```bash
# Auto-deploy PRs
cx github connect

# Every PR gets its own environment:
# - https://pr-123-my-app.cx-preview.com
```

## 🆘 Troubleshooting

### "AWS credentials not found"

```bash
cx setup aws  # We'll walk you through it
```

### "Port 3000 already in use"

```bash
# Cygni handles ports automatically
# Your app can use any port!
```

### "Build failed"

```bash
cx logs --build  # See what went wrong
cx support       # Get help from our team
```

## 🎉 Congratulations!

You've just deployed to AWS without touching the AWS console!

### What's Next?

- **[Production Readiness Guide](PRODUCTION_READINESS.md)** - Prepare for scale
- **[Architecture Overview](docs/ARCHITECTURE_OVERVIEW.md)** - Understand the magic
- **[CLI Reference](packages/cli/docs/COMMAND_REFERENCE.md)** - Master the CLI
- **[Join our Discord](https://discord.gg/cygni)** - Get help and share feedback

### Share Your Success!

```bash
cx share  # Generate a tweet about your deployment
```

---

**Fun Fact**: You just automated what typically takes a DevOps engineer 2-3 days to set up. Time saved: ~16 hours. Cost saved: ~$2,000. Stress saved: Priceless. 😎
