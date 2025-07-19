#!/bin/bash
set -euo pipefail

# Safe database migration script with validation and rollback support

ENVIRONMENT=${1:-development}
DATABASE_URL=${DATABASE_URL:-}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "Safe Database Migration Script"
echo "=============================="
echo "Environment: $ENVIRONMENT"
echo ""

# Validate environment
if [[ "$ENVIRONMENT" == "production" ]]; then
    echo -e "${YELLOW}WARNING: Running migrations in PRODUCTION environment${NC}"
    read -p "Are you sure you want to continue? (yes/no): " confirm
    if [[ "$confirm" != "yes" ]]; then
        echo "Migration cancelled"
        exit 0
    fi
fi

# Check database connection
echo "Checking database connection..."
cd services/api
if ! npx prisma db execute --file /dev/stdin <<< "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${RED}Error: Cannot connect to database${NC}"
    exit 1
fi
echo -e "${GREEN}Database connection successful${NC}"

# Check for pending migrations
echo ""
echo "Checking for pending migrations..."
PENDING=$(npx prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --exit-code || true)

if [[ -z "$PENDING" ]]; then
    echo -e "${GREEN}No pending migrations${NC}"
    exit 0
fi

# Show pending changes
echo -e "${YELLOW}Pending schema changes detected:${NC}"
npx prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma

# Generate migration
echo ""
read -p "Enter migration name (e.g., add_webhook_table): " MIGRATION_NAME
if [[ -z "$MIGRATION_NAME" ]]; then
    echo -e "${RED}Migration name is required${NC}"
    exit 1
fi

# Create backup before migration
if [[ "$ENVIRONMENT" == "production" ]]; then
    echo ""
    echo "Creating database backup..."
    BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"
    
    if command -v pg_dump &> /dev/null; then
        pg_dump "$DATABASE_URL" > "$BACKUP_FILE"
        echo -e "${GREEN}Backup created: $BACKUP_FILE${NC}"
    else
        echo -e "${YELLOW}Warning: pg_dump not found. Skipping backup.${NC}"
    fi
fi

# Generate migration SQL for review
echo ""
echo "Generating migration SQL..."
npx prisma migrate dev --create-only --name "$MIGRATION_NAME"

# Find the new migration
MIGRATION_DIR=$(find prisma/migrations -type d -name "*_${MIGRATION_NAME}" | head -1)
if [[ -z "$MIGRATION_DIR" ]]; then
    echo -e "${RED}Error: Migration directory not found${NC}"
    exit 1
fi

# Show migration SQL
echo ""
echo "Migration SQL:"
echo "--------------"
cat "$MIGRATION_DIR/migration.sql"
echo "--------------"

# Analyze migration for potential issues
echo ""
echo "Analyzing migration..."
WARNINGS=0

if grep -E "(DROP TABLE|DROP COLUMN)" "$MIGRATION_DIR/migration.sql" > /dev/null; then
    echo -e "${YELLOW}Warning: Migration contains destructive operations (DROP)${NC}"
    ((WARNINGS++))
fi

if grep -E "ALTER TABLE.*ADD COLUMN.*NOT NULL" "$MIGRATION_DIR/migration.sql" > /dev/null; then
    echo -e "${YELLOW}Warning: Adding NOT NULL columns - ensure defaults are provided${NC}"
    ((WARNINGS++))
fi

if grep -E "CREATE (UNIQUE )?INDEX" "$MIGRATION_DIR/migration.sql" > /dev/null; then
    echo -e "${YELLOW}Info: Migration creates indexes - this may lock tables temporarily${NC}"
fi

if [[ $WARNINGS -gt 0 ]]; then
    echo ""
    read -p "Continue despite warnings? (yes/no): " confirm
    if [[ "$confirm" != "yes" ]]; then
        echo "Migration cancelled"
        # Remove the migration
        rm -rf "$MIGRATION_DIR"
        exit 0
    fi
fi

# Apply migration
echo ""
echo "Applying migration..."
if npx prisma migrate deploy; then
    echo -e "${GREEN}Migration applied successfully${NC}"
    
    # Generate Prisma Client
    echo "Generating Prisma Client..."
    npx prisma generate
    echo -e "${GREEN}Prisma Client generated${NC}"
    
    # Run post-migration validation
    echo ""
    echo "Running post-migration validation..."
    
    # Check if all tables exist
    TABLES=$(npx prisma db execute --file /dev/stdin <<< "SELECT tablename FROM pg_tables WHERE schemaname = 'public';" || true)
    echo "Tables in database:"
    echo "$TABLES"
    
    # Test a simple query
    if npx prisma db execute --file /dev/stdin <<< "SELECT COUNT(*) FROM _prisma_migrations;" > /dev/null 2>&1; then
        echo -e "${GREEN}Database validation passed${NC}"
    else
        echo -e "${RED}Database validation failed${NC}"
        exit 1
    fi
    
else
    echo -e "${RED}Migration failed!${NC}"
    
    if [[ "$ENVIRONMENT" == "production" && -f "$BACKUP_FILE" ]]; then
        echo ""
        echo "To restore from backup, run:"
        echo "  psql \$DATABASE_URL < $BACKUP_FILE"
    fi
    
    exit 1
fi

echo ""
echo -e "${GREEN}Migration completed successfully!${NC}"

# Remind about deployment
if [[ "$ENVIRONMENT" == "production" ]]; then
    echo ""
    echo -e "${YELLOW}Remember to:${NC}"
    echo "1. Deploy the new API version with updated Prisma Client"
    echo "2. Monitor application logs for any issues"
    echo "3. Keep the backup file for at least 7 days"
fi