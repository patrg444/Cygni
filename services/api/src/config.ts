import { env, isProduction, isDevelopment } from './config/env';

// Export configuration object with proper typing
export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  isProduction,
  isDevelopment,
  
  database: {
    url: env.DATABASE_URL,
  },
  
  redis: {
    url: env.REDIS_URL,
  },
  
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
  },
  
  cors: {
    origin: isProduction 
      ? ['https://cygni.dev', 'https://app.cygni.dev']
      : ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  },
  
  stripe: {
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
  },
  
  aws: {
    region: env.AWS_REGION,
    credentials: env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY ? {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    } : undefined,
    ecrRegistry: env.ECR_REGISTRY,
  },
  
  email: {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    auth: env.SMTP_USER && env.SMTP_PASS ? {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    } : undefined,
    from: env.FROM_EMAIL,
  },
  
  orchestrator: {
    url: env.ORCHESTRATOR_URL,
  },
  
  monitoring: {
    lokiUrl: env.LOKI_URL,
    sentryDsn: env.SENTRY_DSN,
    logLevel: env.LOG_LEVEL,
  },
};