# Multi-stage Dockerfile for API service
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy dependency files
COPY services/api/package.json ./
COPY pnpm-lock.yaml ./
COPY services/api/prisma ./prisma/

# Install pnpm
RUN npm install -g pnpm@8

# Install dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm prisma generate

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy package files first
COPY services/api/package.json ./
COPY pnpm-lock.yaml ./
COPY services/api/tsconfig.json ./

# Install all dependencies including devDependencies
RUN npm install -g pnpm@8
RUN pnpm install --frozen-lockfile

# Copy source files and prisma
COPY services/api/src ./src
COPY services/api/prisma ./prisma

# Generate Prisma client
RUN pnpm prisma generate

# Build the application
RUN pnpm build

# Production image, copy all the files and run
FROM base AS runner
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Copy necessary files
COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

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