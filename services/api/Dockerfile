FROM node:20

RUN npm install -g pnpm@8

WORKDIR /app

# Copy workspace configuration
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY services/api/package.json services/api/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY services/api services/api

# Build
WORKDIR /app/services/api
RUN pnpm prisma generate
RUN pnpm build

# Runtime configuration
RUN useradd -m -u 1001 nodejs
USER nodejs

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/index.js"]