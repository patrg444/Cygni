# Multi-stage Dockerfile for API service
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy workspace files and API package
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY services/api/package.json ./services/api/
COPY services/api/prisma ./services/api/prisma/

# Install pnpm
RUN npm install -g pnpm@8

# Install only production dependencies for the API service
RUN pnpm install --frozen-lockfile --filter @cloudexpress/services-api --prod

# Generate Prisma client
RUN cd services/api && pnpm prisma generate

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY services/api/package.json ./services/api/
COPY services/api/tsconfig.json ./services/api/

# Install all dependencies including devDependencies for building
RUN npm install -g pnpm@8
RUN pnpm install --frozen-lockfile --filter @cloudexpress/services-api

# Copy source files
COPY services/api/src ./services/api/src
COPY services/api/prisma ./services/api/prisma

# Generate Prisma client
RUN cd services/api && pnpm prisma generate

# Build the application
RUN cd services/api && pnpm build

# Production image, copy all the files and run
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Copy necessary files
COPY --from=builder /app/services/api/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/services/api/node_modules ./services/api/node_modules
COPY --from=builder /app/services/api/package.json ./package.json
COPY --from=builder /app/services/api/prisma ./prisma

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Change ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Start the application
CMD ["node", "dist/index.js"]