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
      --filter ./services/api --prod

# ---------- builder ----------
FROM base AS builder
COPY --from=deps /app /app
COPY . .

RUN npm i -g pnpm@8
RUN cd services/api && pnpm install --frozen-lockfile
RUN cd services/api && pnpm prisma generate
RUN cd services/api && pnpm build

# ---------- runner ----------
FROM base AS runner
RUN useradd -u 1001 -r -s /bin/false app
USER 1001
WORKDIR /app

COPY --from=builder /app/services/api/dist            ./dist
COPY --from=builder /app/services/api/node_modules    ./node_modules
COPY --from=builder /app/services/api/package.json    ./
COPY --from=builder /app/services/api/prisma          ./prisma

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

CMD ["node","dist/index.js"]