# Build stage
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY services/builder/package.json ./services/builder/

# Install dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile --filter @cloudexpress/builder...

# Copy source code
COPY services/builder ./services/builder
COPY packages ./packages

# Generate Prisma client
RUN pnpm --filter @cloudexpress/builder exec prisma generate

# Build the application
RUN pnpm --filter @cloudexpress/builder build

# Runtime stage
FROM node:20-alpine

# Install runtime dependencies
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/services/builder/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/services/builder/package.json ./
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy Prisma schema for migrations
COPY --from=builder --chown=nodejs:nodejs /app/services/builder/prisma ./prisma

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]