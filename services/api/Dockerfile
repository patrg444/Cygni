FROM node:20-slim AS base
WORKDIR /app
RUN npm install -g pnpm@8

# Dependencies stage
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY services/api/package.json services/api/
# Install without frozen lockfile first to see errors
RUN pnpm install --filter ./services/api --prod

# Builder stage
FROM base AS builder
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY services/api/package.json services/api/
RUN pnpm install --filter ./services/api
COPY services/api services/api
RUN cd services/api && pnpm prisma generate && pnpm build

# Runtime stage
FROM node:20-slim AS runner
RUN useradd -u 1001 -r -s /bin/false app
WORKDIR /app

COPY --from=builder /app/services/api/dist ./dist
COPY --from=deps /app/services/api/node_modules ./node_modules
COPY --from=builder /app/services/api/package.json ./
COPY --from=builder /app/services/api/prisma ./prisma

USER 1001
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

CMD ["node", "dist/index.js"]