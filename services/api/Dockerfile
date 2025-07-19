# Build stage
FROM node:20 AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

# Copy all files
COPY . .

# Install dependencies for the whole workspace
RUN pnpm install --frozen-lockfile

# Build the API service
WORKDIR /app/services/api
RUN pnpm run prisma generate
RUN pnpm run build

# Runtime stage
FROM node:20-slim

# Install dumb-init for proper signal handling
RUN apt-get update && apt-get install -y --no-install-recommends dumb-init && rm -rf /var/lib/apt/lists/*

# Create app user
RUN useradd -m -u 1001 -s /bin/bash app

WORKDIR /app

# Copy built files from builder
COPY --from=builder --chown=app:app /app/services/api/dist ./dist
COPY --from=builder --chown=app:app /app/services/api/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/services/api/package.json ./
COPY --from=builder --chown=app:app /app/services/api/prisma ./prisma

# Switch to app user
USER app

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]