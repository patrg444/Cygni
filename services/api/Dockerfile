# ---------- base ----------
FROM node:20-slim AS base
WORKDIR /app

# ---------- deps ----------
FROM base AS deps
# copy all workspace files
COPY . .

RUN npm i -g pnpm@8
# Install prod deps for API
WORKDIR /app/services/api
RUN pnpm install --prod --frozen-lockfile

# ---------- builder ----------
FROM base AS builder
COPY . .

RUN npm i -g pnpm@8
# Install all deps and build
WORKDIR /app/services/api
RUN pnpm install --frozen-lockfile
RUN pnpm prisma generate
RUN pnpm build

# ---------- runner ----------
FROM base AS runner
RUN useradd -u 1001 -r -s /bin/false app

WORKDIR /app

# Copy built files
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