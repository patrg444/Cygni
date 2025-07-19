import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import { config } from './config';
import { logger } from './utils/logger';
import { registerRoutes } from './routes';
import { authenticateUser } from './middleware/auth';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: typeof authenticateUser;
  }
}

async function start() {
  const app = fastify({
    logger: logger,
    trustProxy: true,
  });

  // Register plugins
  await app.register(cors, {
    origin: config.cors.origin,
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: config.isProduction ? undefined : false,
  });

  await app.register(jwt, {
    secret: config.jwt.secret,
  });

  // Register auth decorator
  app.decorate('authenticate', authenticateUser);

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Register application routes
  await registerRoutes(app);

  // Start server
  try {
    await app.listen({
      port: config.port,
      host: '0.0.0.0',
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();