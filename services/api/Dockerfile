FROM node:20-slim

# Install pnpm
RUN npm install -g pnpm@8

# Set working directory
WORKDIR /app

# Copy package files
COPY pnpm-workspace.yaml .
COPY package.json .
COPY pnpm-lock.yaml .

# Copy API package.json
COPY services/api/package.json services/api/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy API source code
COPY services/api services/api

# Build API
WORKDIR /app/services/api
RUN pnpm prisma generate
RUN pnpm build

# Create non-root user
RUN useradd -m -u 1001 nodejs

# Set ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "dist/index.js"]