#!/bin/bash

# Setup local PostgreSQL database for Cygni development

echo "Setting up local PostgreSQL database for Cygni..."

# Check if PostgreSQL is running
if ! pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
    echo "PostgreSQL is not running. Please start it first:"
    echo "  macOS: brew services start postgresql@15"
    echo "  Docker: docker-compose up -d postgres"
    exit 1
fi

# Database names
DATABASES=("cygni_dev" "cygni_test")

for DB in "${DATABASES[@]}"; do
    echo "Creating database: $DB"
    
    # Create database if it doesn't exist
    psql -h localhost -U postgres -c "CREATE DATABASE $DB;" 2>/dev/null || echo "Database $DB already exists"
    
    # Grant privileges
    psql -h localhost -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DB TO postgres;"
done

# Run migrations for development database
echo "Running migrations..."
cd services/api
DATABASE_URL=postgresql://postgres:password@localhost:5432/cygni_dev npx prisma migrate dev

# Seed development data (optional)
echo "Seeding development data..."
DATABASE_URL=postgresql://postgres:password@localhost:5432/cygni_dev npx prisma db seed

echo "Database setup complete!"
echo ""
echo "Connection strings:"
echo "  Development: postgresql://postgres:password@localhost:5432/cygni_dev"
echo "  Testing:     postgresql://postgres:password@localhost:5432/cygni_test"
echo ""
echo "To start all services locally:"
echo "  docker-compose up -d  # Starts PostgreSQL, Redis, MinIO"
echo "  pnpm dev             # Starts all Cygni services"