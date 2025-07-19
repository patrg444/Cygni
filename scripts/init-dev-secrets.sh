#!/bin/bash

# Initialize development secrets
# This script generates secure random secrets for local development

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/.env"
ENV_TEMPLATE="$PROJECT_ROOT/.env.development"
CYGNI_DIR="$PROJECT_ROOT/.cygni"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Initializing Cygni development environment...${NC}"

# Create .cygni directory if it doesn't exist
mkdir -p "$CYGNI_DIR"

# Check if .env already exists
if [ -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}Warning: .env file already exists${NC}"
    read -p "Do you want to regenerate secrets? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Keeping existing .env file"
        exit 0
    fi
    # Backup existing .env
    cp "$ENV_FILE" "$ENV_FILE.backup.$(date +%Y%m%d%H%M%S)"
    echo -e "${GREEN}Backed up existing .env file${NC}"
fi

# Copy template
cp "$ENV_TEMPLATE" "$ENV_FILE"

# Generate secure random secrets
echo -e "${GREEN}Generating secure random secrets...${NC}"

# Function to generate random string
generate_secret() {
    openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -d '\n' | tr '+/' '-_' | head -c 64
}

# Generate JWT secret
JWT_SECRET=$(generate_secret)
sed -i.bak "s/dev_jwt_secret_min_32_chars_change_in_production/$JWT_SECRET/" "$ENV_FILE"

# Generate database password
DB_PASSWORD=$(generate_secret | head -c 32)
sed -i.bak "s/dev_password_change_me/$DB_PASSWORD/" "$ENV_FILE"

# Generate Redis password
REDIS_PASSWORD=$(generate_secret | head -c 32)
sed -i.bak "s/dev_redis_password/$REDIS_PASSWORD/" "$ENV_FILE"

# Generate MinIO password
MINIO_PASSWORD=$(generate_secret | head -c 32)
sed -i.bak "s/dev_minio_password/$MINIO_PASSWORD/" "$ENV_FILE"

# Update DATABASE_URL with new password
sed -i.bak "s/DATABASE_URL=postgresql:\/\/\${POSTGRES_USER}:\${POSTGRES_PASSWORD}/DATABASE_URL=postgresql:\/\/postgres:$DB_PASSWORD/" "$ENV_FILE"

# Clean up backup files
rm -f "$ENV_FILE.bak"

# Save generated secrets to .cygni/dev.env for reference
cat > "$CYGNI_DIR/dev.env" << EOF
# Generated development secrets - DO NOT COMMIT
# Generated at: $(date)
JWT_SECRET=$JWT_SECRET
POSTGRES_PASSWORD=$DB_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD
MINIO_ROOT_PASSWORD=$MINIO_PASSWORD
EOF

chmod 600 "$CYGNI_DIR/dev.env"

echo -e "${GREEN}✓ Development secrets initialized successfully!${NC}"
echo -e "${GREEN}✓ Secrets saved to .cygni/dev.env (git-ignored)${NC}"
echo -e "${YELLOW}Note: Never commit .env or .cygni/dev.env to version control${NC}"
echo
echo "To start the development environment, run:"
echo "  docker-compose up"