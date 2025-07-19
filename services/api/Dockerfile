# Use multi-stage build for efficiency
FROM node:20-slim AS builder

# Install pnpm
RUN npm install -g pnpm@8

# Set working directory
WORKDIR /app

# Copy all files (filtered by .dockerignore)
COPY . .

# Install all dependencies for the workspace
RUN pnpm install

# Build the API service
WORKDIR /app/services/api
RUN pnpm prisma generate
RUN pnpm build

# Production stage
FROM node:20-slim AS production

# Create app user
RUN useradd -m -u 1001 -s /bin/bash nodejs

# Set working directory
WORKDIR /app

# Copy built application and dependencies
COPY --from=builder /app/services/api/dist ./dist
COPY --from=builder /app/services/api/node_modules ./node_modules
COPY --from=builder /app/services/api/package.json ./package.json
COPY --from=builder /app/services/api/prisma ./prisma

# Change ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Start the application
CMD ["node", "dist/index.js"]