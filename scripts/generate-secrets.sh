#!/bin/bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
ENV="development"
OUTPUT=""
INTERACTIVE=true

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --env)
      ENV="$2"
      shift 2
      ;;
    --output)
      OUTPUT="$2"
      INTERACTIVE=false
      shift 2
      ;;
    --emergency)
      EMERGENCY=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [options]"
      echo "Options:"
      echo "  --env <environment>    Environment name (default: development)"
      echo "  --output <file>        Output file (default: stdout)"
      echo "  --emergency            Emergency rotation mode"
      echo "  -h, --help            Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Function to generate secrets
generate_secret() {
  local type=$1
  local length=${2:-32}
  
  case $type in
    "hex")
      openssl rand -hex $((length/2))
      ;;
    "base64")
      openssl rand -base64 $length | tr -d "=+/" | cut -c1-$length
      ;;
    "alnum")
      openssl rand -base64 $((length*2)) | tr -d "=+/" | cut -c1-$length
      ;;
  esac
}

# Generate all secrets
echo -e "${GREEN}Generating secrets for environment: ${ENV}${NC}"

# Database
DB_PASSWORD=$(generate_secret hex 16)
REDIS_PASSWORD=$(generate_secret hex 16)

# Authentication
JWT_SECRET=$(generate_secret hex 32)
SESSION_SECRET=$(generate_secret hex 32)
API_KEY=$(generate_secret hex 16)

# Object Storage
MINIO_ACCESS_KEY=$(generate_secret alnum 20)
MINIO_SECRET_KEY=$(generate_secret alnum 40)

# Encryption
ENCRYPTION_KEY=$(generate_secret hex 32)
DB_ENCRYPTION_KEY=$(generate_secret base64 32)

# Build the output
OUTPUT_CONTENT=$(cat <<EOF
# Generated secrets for ${ENV} environment
# Generated at: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# WARNING: Store these securely and never commit to version control

# Database
DATABASE_URL=postgresql://cygni:${DB_PASSWORD}@postgres:5432/cygni_${ENV}
POSTGRES_USER=cygni
POSTGRES_PASSWORD=${DB_PASSWORD}
POSTGRES_DB=cygni_${ENV}

# Redis
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379
REDIS_PASSWORD=${REDIS_PASSWORD}

# Authentication
JWT_SECRET=${JWT_SECRET}
SESSION_SECRET=${SESSION_SECRET}
ADMIN_API_KEY=${API_KEY}

# Object Storage
MINIO_ROOT_USER=${MINIO_ACCESS_KEY}
MINIO_ROOT_PASSWORD=${MINIO_SECRET_KEY}

# Encryption
ENCRYPTION_KEY=${ENCRYPTION_KEY}
DB_ENCRYPTION_KEY=${DB_ENCRYPTION_KEY}

# Environment
NODE_ENV=${ENV}
EOF
)

# Output the secrets
if [[ -n "$OUTPUT" ]]; then
  echo "$OUTPUT_CONTENT" > "$OUTPUT"
  chmod 600 "$OUTPUT"
  echo -e "${GREEN}Secrets written to: ${OUTPUT}${NC}"
  echo -e "${YELLOW}Remember to:${NC}"
  echo "1. Store this file securely"
  echo "2. Add it to .gitignore"
  echo "3. Set up secret rotation"
else
  echo "$OUTPUT_CONTENT"
fi

# Emergency mode actions
if [[ "${EMERGENCY:-false}" == "true" ]]; then
  echo -e "${RED}EMERGENCY MODE: Additional steps required${NC}"
  echo "1. Update all running services with new secrets"
  echo "2. Revoke all existing database sessions"
  echo "3. Invalidate all JWT tokens"
  echo "4. Notify team of secret rotation"
fi