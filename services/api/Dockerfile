# ---------- base ----------
FROM node:20-slim AS base
WORKDIR /app

# ---------- deps ----------
FROM base AS deps
# copy lock & manifests first (cache!)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY services/api/package.json services/api/

RUN npm i -g pnpm@8
RUN pnpm install --frozen-lockfile \
      --filter ./services/api --prod \
      --ignore-scripts

# ---------- builder ----------
FROM base AS builder
# copy lock & manifests first
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY services/api/package.json services/api/

RUN npm i -g pnpm@8
# Install ALL deps including dev deps
RUN pnpm install --frozen-lockfile \
      --filter ./services/api

# Copy source code
COPY services/api/ services/api/

# Generate Prisma client and build
RUN pnpm --filter ./services/api prisma generate
RUN pnpm --filter ./services/api build

# ---------- runner ----------
FROM base AS runner
RUN useradd -u 1001 -r -s /bin/false app

WORKDIR /app

COPY --from=builder /app/services/api/dist            ./dist
COPY --from=deps /app/services/api/node_modules       ./node_modules
COPY --from=builder /app/services/api/package.json    ./
COPY --from=builder /app/services/api/prisma          ./prisma

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