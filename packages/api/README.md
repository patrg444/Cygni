# Cygni API

The Cygni API server handles authentication, billing, waitlist management, and integration with the runtime orchestrator.

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Set up database
npx prisma generate
npx prisma db push

# Run in development
npm run dev

# API will be available at http://localhost:3000
```

## Available Endpoints

### Public Endpoints

- `GET /api/health` - Health check
- `POST /api/waitlist` - Join waitlist
- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login
- `GET /api/auth/.well-known/jwks.json` - JWT public keys

### Protected Endpoints (Require JWT)

- `GET /api/auth/me` - Current user info
- `POST /api/auth/refresh` - Refresh token
- `GET /api/projects/:projectId/budget` - Budget status
- `GET /api/waitlist/stats` - Waitlist analytics (admin only)

### Webhook Endpoints

- `POST /api/webhooks/stripe` - Stripe payment webhooks

## Testing

```bash
# Test waitlist signup
curl -X POST http://localhost:3000/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'

# Test health check
curl http://localhost:3000/api/health

# Test JWKS endpoint
curl http://localhost:3000/api/auth/.well-known/jwks.json
```

## Environment Variables

See `.env.example` for all required variables. Key ones:

- `DATABASE_URL` - PostgreSQL connection string
- `STRIPE_SECRET_KEY` - Stripe API key
- `JWT_SECRET` - Secret for JWT signing (will auto-generate if using rotation)
- `ADMIN_API_KEY` - Admin access for protected endpoints

## Architecture

```
/api
 /routes         # Express route handlers
 /services       # Business logic
    /auth      # JWT rotation, authentication
    /billing   # Stripe, budget monitoring
    /email     # Email sending
 /jobs          # Background jobs (cron)
 /middleware    # Express middleware
 /prisma        # Database schema
```

## Background Jobs

The API runs several background jobs:

1. **Budget Check** - Every hour, checks all projects for budget limits
2. **JWT Rotation** - Every 24 hours, rotates signing keys
3. **Usage Reporting** - Reports usage to Stripe for billing

## Security

- JWT tokens with 24-hour expiry
- Automatic key rotation with 3-day retention
- Rate limiting on all endpoints
- Input validation with Zod
- CORS configured for production domains

## Deployment

```bash
# Build for production
npm run build

# Run production server
npm start
```

For Kubernetes deployment, use the provided Dockerfile:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```
