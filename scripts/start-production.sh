#!/bin/bash
set -e

echo "🚀 Starting Cygni production deployment..."

# Check required environment variables
required_vars=(
  "DATABASE_URL"
  "REDIS_HOST"
  "JWT_SECRET"
  "AWS_REGION"
  "ECR_REPOSITORY_URI"
)

for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    echo "❌ Error: Required environment variable $var is not set"
    exit 1
  fi
done

echo "✅ Environment variables validated"

# Run database migrations
echo "🗄️  Running database migrations..."
cd services/api
pnpm prisma:migrate
echo "✅ Database migrations completed"

# Generate Prisma clients
echo "📦 Generating Prisma clients..."
pnpm prisma:generate
cd ../builder
pnpm prisma:generate
cd ../..

# Start services with docker-compose
echo "🐳 Starting services..."
docker-compose -f docker-compose.production.yml up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
timeout=300
elapsed=0
interval=5

while [ $elapsed -lt $timeout ]; do
  if docker-compose -f docker-compose.production.yml ps | grep -q "unhealthy\|starting"; then
    echo "   Services still starting... ($elapsed/$timeout seconds)"
    sleep $interval
    elapsed=$((elapsed + interval))
  else
    echo "✅ All services healthy!"
    break
  fi
done

if [ $elapsed -ge $timeout ]; then
  echo "❌ Timeout waiting for services to be healthy"
  docker-compose -f docker-compose.production.yml logs
  exit 1
fi

# Run database seed if this is first deployment
if [ "$RUN_SEED" = "true" ]; then
  echo "🌱 Running database seed..."
  cd services/api
  pnpm prisma:seed
  cd ../..
  echo "✅ Database seeding completed"
fi

echo "🎉 Cygni is running!"
echo ""
echo "📊 Service URLs:"
echo "   API: http://localhost:3000"
echo "   Builder: http://localhost:3001"
echo "   Web UI: http://localhost:3002"
echo ""
echo "🔍 View logs with: docker-compose -f docker-compose.production.yml logs -f"
echo "🛑 Stop with: docker-compose -f docker-compose.production.yml down"