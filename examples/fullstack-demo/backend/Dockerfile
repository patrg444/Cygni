FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json ./

# Install production dependencies
RUN npm install --production

# Copy application files
COPY index.js ./

# Expose port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production

# Start the application
CMD ["node", "index.js"]