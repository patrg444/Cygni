# Secrets Generation Guide

This guide provides one-liners for generating secure secrets for all Cygni services.

## Automated Secret Generation

### One-Command Setup

Generate all required secrets for a new environment:

```bash
# Development environment
./scripts/init-dev-secrets.sh

# Production environment (interactive)
./scripts/generate-secrets.sh --env production

# Non-interactive with output to file
./scripts/generate-secrets.sh --env production --output .env.production
```

### CI/CD Integration

For automated deployments:

```yaml
# GitHub Actions example
- name: Generate secrets
  run: |
    echo "DATABASE_PASSWORD=$(openssl rand -hex 16)" >> $GITHUB_ENV
    echo "JWT_SECRET=$(openssl rand -hex 32)" >> $GITHUB_ENV
```

## Quick Reference

### Database Passwords

```bash
# PostgreSQL password (32 chars)
openssl rand -hex 16

# Redis password (32 chars)
openssl rand -hex 16
```

### Authentication Secrets

```bash
# JWT secret (64 chars minimum)
openssl rand -hex 32

# Session secret (64 chars)
openssl rand -hex 32

# API keys (32 chars)
openssl rand -hex 16
```

### Object Storage

```bash
# MinIO access key (20 chars)
openssl rand -base64 15 | tr -d "=+/" | cut -c1-20

# MinIO secret key (40 chars)
openssl rand -base64 30 | tr -d "=+/" | cut -c1-40
```

### Encryption Keys

```bash
# AES-256 encryption key
openssl rand -hex 32

# Database encryption key
openssl rand -base64 32
```

## Environment-Specific Setup

### Development

For local development, use the placeholders in `.env.development`:

```bash
cp .env.development .env
# Then replace all CHANGEME_* values
```

### Production

Generate all secrets at once:

```bash
cat << EOF > .env.production
DATABASE_URL=postgresql://cygni:$(openssl rand -hex 16)@db:5432/cygni_prod
REDIS_PASSWORD=$(openssl rand -hex 16)
JWT_SECRET=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
MINIO_ACCESS_KEY=$(openssl rand -base64 15 | tr -d "=+/" | cut -c1-20)
MINIO_SECRET_KEY=$(openssl rand -base64 30 | tr -d "=+/" | cut -c1-40)
EOF
```

## Kubernetes Secrets

Create secrets for Kubernetes deployment:

```bash
# Create namespace
kubectl create namespace cygni

# Create secret from env file
kubectl create secret generic cygni-api-secrets \
  --from-env-file=.env.production \
  --namespace=cygni

# Or create individual secrets
kubectl create secret generic postgres-secret \
  --from-literal=password=$(openssl rand -hex 16) \
  --namespace=cygni
```

## AWS Secrets Manager

Store secrets in AWS:

```bash
# Store complete env file
aws secretsmanager create-secret \
  --name cygni/production/api \
  --secret-string file://.env.production

# Store individual secret
aws secretsmanager create-secret \
  --name cygni/production/jwt-secret \
  --secret-string $(openssl rand -hex 32)
```

## Best Practices

1. **Never commit secrets** - Use `.gitignore` and secret scanning
2. **Rotate regularly** - Set up rotation policies (90 days recommended)
3. **Use different secrets per environment** - Never share between dev/staging/prod
4. **Minimum lengths**:
   - Passwords: 16+ characters
   - JWT secrets: 32+ characters
   - Encryption keys: 32+ characters
5. **Store securely**:
   - Development: `.env` files (git-ignored)
   - Production: Secret management service (AWS Secrets Manager, Vault, etc.)

## Verification

Test secret strength:

```bash
# Check entropy (should be > 128 bits)
echo -n "your-secret" | wc -c

# Verify randomness
openssl rand -hex 32 | ent
```

## Emergency Rotation

If secrets are compromised:

```bash
# 1. Generate new secrets
./scripts/generate-secrets.sh --emergency

# 2. Update all services
kubectl rollout restart deployment/cygni-api -n cygni

# 3. Revoke old database sessions
psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='cygni_prod';"
```
