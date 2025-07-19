FROM node:20

WORKDIR /app

# Copy everything
COPY . .

# Install pnpm and dependencies
RUN npm install -g pnpm@8 && \
    cd services/api && \
    pnpm install

# Build
RUN cd services/api && \
    pnpm prisma generate && \
    pnpm build

# Set working directory to API
WORKDIR /app/services/api

# Create user
RUN useradd -m -u 1001 app
USER app

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/index.js"]