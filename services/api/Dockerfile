# Build API service
FROM node:20-slim AS builder

# Install pnpm
RUN npm install -g pnpm@8

# Set working directory
WORKDIR /app

# Copy workspace files
COPY pnpm-workspace.yaml .
COPY package.json .
COPY pnpm-lock.yaml .

# Copy API package.json
COPY services/api/package.json services/api/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy API source
COPY services/api services/api

# Build API
WORKDIR /app/services/api
RUN pnpm prisma generate
RUN pnpm build

# Production image
FROM node:20-slim AS runner

# Create non-root user
RUN useradd -m -u 1001 -s /bin/bash app

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=builder /app/services/api/dist ./dist
COPY --from=builder /app/services/api/node_modules ./node_modules
COPY --from=builder /app/services/api/package.json ./
COPY --from=builder /app/services/api/prisma ./prisma

# Set ownership
RUN chown -R app:app /app

# Switch to non-root user
USER app

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

EXPOSE 3000

CMD ["node", "dist/index.js"]