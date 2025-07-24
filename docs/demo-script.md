# Cygni AWS Demo - Run of Show (3 minutes)

## Pre-Recording Checklist

- [ ] Run `./scripts/prepare-demo.sh`
- [ ] Terminal font size: 18pt minimum
- [ ] Browser tab open: CloudWatch Insights
- [ ] Browser bookmarked: https://demo-app.cx-demo.xyz
- [ ] Screen recording software ready
- [ ] Microphone tested

## Script & Timing

### 0:00-0:10 - Introduction

**Say:**
"Let me show you how Cygni deploys your app to AWS in under 3 minutes. No DevOps knowledge required."

**Do:**

```bash
cd examples/express-demo
ls -la
```

### 0:10-0:20 - Show the Code

**Say:**
"Here's a simple Express API with a health endpoint. Nothing special - just like your app."

**Do:**

```bash
cat index.js | head -20
```

### 0:20-0:30 - The Magic Command

**Say:**
"Watch this - one command to deploy to production-ready infrastructure."

**Do:**

```bash
cx deploy --aws --name demo-app
```

### 0:30-1:30 - Build Phase (Voice Over)

**Say while build runs:**
"Cygni automatically:

- Detects this is an Express app
- Creates an optimized Dockerfile
- Builds a production container
- Sets up a private container registry
- Configures auto-scaling on AWS Fargate
- Provisions HTTPS with a real certificate
- All without you writing any infrastructure code."

**Visual:** Build output streaming

### 1:30-2:00 - Infrastructure Creation

**Say:**
"Now it's creating your infrastructure - load balancer, auto-scaling, health checks - everything you need for production."

**Visual:** CloudFormation progress

### 2:00-2:20 - Success & Demo

**Say:**
"And we're live! Let's check it out."

**Do:**

```bash
# Copy the URL from output
open https://demo-app.cx-demo.xyz
```

**Show:** Browser with JSON response

### 2:20-2:40 - Production Features

**Say:**
"This isn't a toy deployment. You get monitoring, logging, and auto-scaling out of the box."

**Do:** Quick flip to CloudWatch tab showing health metrics

### 2:40-2:55 - Rollback Demo

**Say:**
"Made a mistake? Rollback is just as easy."

**Do:**

```bash
cx deploy --aws --name demo-app --rollback
```

**Visual:** Quick rollback message

### 2:55-3:00 - Closing

**Say:**
"That's Cygni - from code to cloud in under 3 minutes. Try it yourself at cygni.dev"

**Visual:** Terminal showing "✅ Deployment complete!"

## Backup Clips to Record Separately

1. **Slow Build Backup** (30s)
   - Record just the Docker build phase
   - Can splice in if live build is slow

2. **Browser Demo** (15s)
   - Pre-record the browser showing the API response
   - Backup if DNS is slow

3. **CloudWatch Metrics** (10s)
   - Pre-record CloudWatch showing healthy metrics
   - More reliable than live AWS console

## Common Issues & Fixes

**Docker daemon not running:**

```bash
# Quick fix (don't show on camera)
open -a Docker && sleep 10
```

**ECR rate limit:**

- Use the pre-recorded build clip
- Mention "using cached layers for speed"

**DNS propagation delay:**

- Have subdomain pre-created
- Use curl instead of browser if needed

**CloudFormation stuck:**

- Have a completed stack ready
- Say "I've sped this up in post"

## Post-Recording Checklist

1. Trim dead air during build
2. Speed up any slow sections 1.5x
3. Add captions for commands
4. Blur any AWS account IDs
5. Export at 1080p minimum
6. Upload with thumbnail showing "3 min → 🚀"
