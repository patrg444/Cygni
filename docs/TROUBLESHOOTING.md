# Cygni Troubleshooting Guide

This guide helps you resolve common issues when using Cygni.

## Table of Contents

1. [Deployment Issues](#deployment-issues)
2. [Build Failures](#build-failures)
3. [Domain Configuration](#domain-configuration)
4. [Performance Problems](#performance-problems)
5. [Authentication Errors](#authentication-errors)
6. [Database Connection Issues](#database-connection-issues)
7. [CLI Problems](#cli-problems)
8. [Billing Issues](#billing-issues)

## Deployment Issues

### Deployment Stuck in "Building" State

**Symptoms:**

- Deployment status shows "building" for over 10 minutes
- No build logs appearing

**Solutions:**

1. Check build logs:

   ```bash
   cygni logs --build --deployment [deployment-id]
   ```

2. Cancel and retry:

   ```bash
   cygni deployments cancel [deployment-id]
   cygni deploy
   ```

3. Clear build cache:
   ```bash
   cygni deploy --no-cache
   ```

### Deployment Fails Immediately

**Common Causes:**

- Missing `package.json` or build configuration
- Incorrect Node.js version
- Missing dependencies

**Solutions:**

1. Verify package.json exists and has required scripts:

   ```json
   {
     "scripts": {
       "build": "next build",
       "start": "next start"
     }
   }
   ```

2. Specify Node.js version in `.nvmrc` or `package.json`:
   ```json
   {
     "engines": {
       "node": ">=18.0.0"
     }
   }
   ```

## Build Failures

### "Module not found" Errors

**Cause:** Dependencies not properly installed

**Solution:**

1. Ensure all dependencies are in `package.json`
2. Don't rely on globally installed packages
3. Check for case sensitivity issues (especially on Windows)

### Out of Memory During Build

**Symptoms:**

- Build fails with "JavaScript heap out of memory"
- Large Next.js or webpack builds

**Solutions:**

1. Add build memory limit:

   ```bash
   cygni env add NODE_OPTIONS "--max-old-space-size=4096"
   ```

2. Optimize build:
   - Use dynamic imports
   - Reduce bundle size
   - Enable SWC compiler for Next.js

### TypeScript Errors

**Solution:**

1. Run type check locally first:

   ```bash
   npm run type-check
   ```

2. Fix errors or adjust `tsconfig.json`:
   ```json
   {
     "compilerOptions": {
       "skipLibCheck": true
     }
   }
   ```

## Domain Configuration

### Domain Not Working After Adding

**Symptoms:**

- "Domain not configured" error
- SSL certificate errors

**Solutions:**

1. Verify DNS configuration:

   ```bash
   cygni domains verify yourdomain.com
   ```

2. Check DNS propagation:

   ```bash
   dig yourdomain.com
   nslookup yourdomain.com
   ```

3. Wait for propagation (can take up to 48 hours)

### SSL Certificate Issues

**Cause:** Let's Encrypt validation failing

**Solutions:**

1. Ensure domain points to Cygni
2. Remove and re-add domain:
   ```bash
   cygni domains remove yourdomain.com
   cygni domains add yourdomain.com
   ```

## Performance Problems

### Slow Response Times

**Diagnosis:**

```bash
cygni performance --last 1h
cygni metrics --metric response-time
```

**Solutions:**

1. **Database queries:**
   - Add indexes
   - Use connection pooling
   - Implement caching

2. **Static assets:**
   - Enable CDN caching
   - Optimize images
   - Use proper cache headers

3. **API optimization:**
   - Implement pagination
   - Add response caching
   - Use compression

### High Memory Usage

**Solutions:**

1. Check for memory leaks:

   ```bash
   cygni metrics --metric memory --period 24h
   ```

2. Optimize application:
   - Fix memory leaks
   - Reduce in-memory caching
   - Use streaming for large responses

## Authentication Errors

### "Invalid token" Errors

**Solutions:**

1. Re-authenticate:

   ```bash
   cygni logout
   cygni login
   ```

2. Check token permissions:
   ```bash
   cygni tokens list
   ```

### GitHub Integration Issues

**Solutions:**

1. Reconnect GitHub:

   ```bash
   cygni github disconnect
   cygni github connect
   ```

2. Check repository permissions in GitHub settings

## Database Connection Issues

### "Connection refused" Errors

**Common Causes:**

- Incorrect connection string
- Database not accepting external connections
- Missing SSL configuration

**Solutions:**

1. Verify connection string format:

   ```
   postgresql://user:password@host:5432/database?sslmode=require
   ```

2. Check firewall rules allow Cygni IPs

3. For local development, use connection pooling:
   ```javascript
   const pool = new Pool({
     connectionString: process.env.DATABASE_URL,
     max: 20,
     idleTimeoutMillis: 30000,
     connectionTimeoutMillis: 2000,
   });
   ```

## CLI Problems

### "Command not found" Error

**Solutions:**

1. Reinstall CLI:

   ```bash
   npm uninstall -g @cygni/cli
   npm install -g @cygni/cli
   ```

2. Check PATH:
   ```bash
   echo $PATH
   which cygni
   ```

### CLI Hanging or Slow

**Solutions:**

1. Update to latest version:

   ```bash
   cygni upgrade
   ```

2. Clear CLI cache:

   ```bash
   rm -rf ~/.cygni/cache
   ```

3. Enable debug mode:
   ```bash
   cygni --debug deploy
   ```

## Billing Issues

### Deployment Quota Exceeded

**Solutions:**

1. Check current usage:

   ```bash
   cygni billing usage
   ```

2. Upgrade plan:
   ```bash
   cygni billing upgrade
   ```

### Payment Failed

**Solutions:**

1. Update payment method:

   ```bash
   cygni dashboard
   # Navigate to Billing > Payment Methods
   ```

2. Contact support: billing@cygni.dev

## Getting Additional Help

If these solutions don't resolve your issue:

1. **Search Documentation:**
   - https://docs.cygni.dev
   - Use the search feature

2. **Community Support:**
   - Discord: https://discord.gg/cygni
   - GitHub Discussions

3. **Direct Support:**
   - Email: support@cygni.dev
   - Include deployment ID and error logs

4. **Debug Information:**
   Collect this information for support:
   ```bash
   cygni --version
   cygni status --debug
   cygni logs --last 1h > debug-logs.txt
   ```

## Common Error Codes

| Code   | Meaning                    | Solution                    |
| ------ | -------------------------- | --------------------------- |
| `E001` | Authentication failed      | Re-login with `cygni login` |
| `E002` | Build failed               | Check build logs            |
| `E003` | Deployment timeout         | Retry deployment            |
| `E004` | Domain verification failed | Check DNS settings          |
| `E005` | Rate limit exceeded        | Wait or upgrade plan        |
| `E006` | Payment required           | Update billing info         |
| `E007` | Resource limit exceeded    | Optimize or upgrade         |
| `E008` | Invalid configuration      | Check deployment settings   |
