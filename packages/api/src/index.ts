import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { createServer } from './server';
import { jwtService } from './routes/auth';
import { initializeBudgetCheckJob } from './jobs/budget-check.job';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;
const prisma = new PrismaClient();

// Start server
async function startServer() {
  try {
    // Initialize database connection
    await prisma.$connect();
    console.log('✅ Database connected');

    // Create Express app
    const app = createServer();

    // Initialize background jobs
    initializeBudgetCheckJob();
    console.log('✅ Background jobs initialized');

    // Start JWT rotation
    jwtService.startRotationJob();
    console.log('✅ JWT rotation job started');

    // Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 CloudExpress API running on http://localhost:${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
      console.log(`📍 Waitlist signup: POST http://localhost:${PORT}/api/waitlist`);
      console.log(`📍 JWKS: http://localhost:${PORT}/api/auth/.well-known/jwks.json`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

// Start the server
startServer();