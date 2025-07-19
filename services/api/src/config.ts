import { z } from 'zod';

const configSchema = z.object({
  env: z.enum(['development', 'production', 'test']).default('development'),
  port: z.number().default(3000),
  databaseUrl: z.string(),
  jwt: z.object({
    secret: z.string(),
    expiresIn: z.string().default('7d'),
  }),
  cors: z.object({
    origin: z.union([z.string(), z.array(z.string()), z.boolean()]).default(true),
  }),
  isProduction: z.boolean(),
});

const rawConfig = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/cygni',
  jwt: {
    secret: process.env.JWT_SECRET || 'development-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
  },
  isProduction: process.env.NODE_ENV === 'production',
};

export const config = configSchema.parse(rawConfig);