FROM node:20-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

# Set working directory
WORKDIR /app

# Copy workspace files first
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy service package.json
COPY services/api/package.json ./services/api/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy API source
COPY services/api ./services/api

# Build API
WORKDIR /app/services/api
RUN pnpm run prisma generate
RUN pnpm run build

# Create non-root user
RUN adduser -D -u 1001 app

# Change ownership
RUN chown -R app:app /app

# Switch to non-root user
USER app

# Environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/index.js"]