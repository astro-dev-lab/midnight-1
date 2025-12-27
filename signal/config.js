const { z } = require('zod');

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  CORS_ORIGINS: z.string().optional(),
  NODE_ENV: z.string().optional(),
  PORT: z.string().optional()
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Only warn in dev to avoid crashing; in production, throw.
  const isProd = process.env.NODE_ENV === 'production';
  const message = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
  if (isProd) {
    throw new Error(`Invalid environment: ${message}`);
  }
  else {
    console.warn(`Warning: invalid environment config: ${message}`);
  }
}

const raw = parsed.success ? parsed.data : process.env;

const corsOrigins = (raw.CORS_ORIGINS || '*')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const config = {
  databaseUrl: raw.DATABASE_URL,
  jwtSecret: raw.JWT_SECRET,
  corsOrigins,
  nodeEnv: raw.NODE_ENV || 'development',
  port: Number(raw.PORT || 3000)
};

module.exports = { config };
