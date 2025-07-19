# ---------- base image ----------
FROM node:20-slim AS base          # use Debian slim, avoids Prisma/OpenSSL pain
WORKDIR /app

# ---------- deps layer ----------
FROM base AS deps
# Workspace descriptors first (for cache)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
# API package manifest (namespaced path keeps cache small)
COPY services/api/package.json services/api/

RUN npm i -g pnpm@8
# Install ONLY deps for the API package (no dev deps yet)
RUN pnpm install --frozen-lockfile \
      --filter ./services/api \
      --prod \
      --ignore-scripts

# ---------- builder layer ----------
FROM base AS builder
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY services/api/package.json services/api/

RUN npm i -g pnpm@8
# Install ALL deps including dev deps for building
RUN pnpm install --frozen-lockfile \
      --filter ./services/api

# Copy source code
COPY services/api/ services/api/

# Generate Prisma client *before* tsc build
RUN pnpm --filter ./services/api prisma generate

# Build TS → JS
RUN pnpm --filter ./services/api build

# ---------- runtime layer ----------
FROM base AS runner
RUN useradd -u 1001 -r -s /bin/false app

WORKDIR /app
COPY --from=builder /app/services/api/dist ./dist
COPY --from=deps /app/services/api/node_modules ./node_modules
COPY --from=builder /app/services/api/package.json ./
COPY --from=builder /app/services/api/prisma ./prisma

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Switch to non-root user
USER 1001

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/index.js"]