const { z } = require('zod');

/**
 * Environment Configuration Schema
 * 
 * All secrets and configuration are managed via environment variables.
 * In production, use a secrets manager (e.g., AWS Secrets Manager, Vault).
 */
const envSchema = z.object({
  // Required
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  
  // Optional - Server
  NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
  PORT: z.string().optional(),
  HOST: z.string().optional(),
  
  // Optional - CORS
  CORS_ORIGINS: z.string().optional(),
  
  // Optional - SSL/TLS (for production)
  SSL_KEY_PATH: z.string().optional(),
  SSL_CERT_PATH: z.string().optional(),
  
  // Optional - Rate limiting
  RATE_LIMIT_WINDOW_MS: z.string().optional(),
  RATE_LIMIT_MAX_REQUESTS: z.string().optional(),
  
  // Optional - Storage
  STORAGE_PATH: z.string().optional(),
  MAX_UPLOAD_SIZE_MB: z.string().optional(),
  
  // Optional - Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).optional(),
  LOG_FORMAT: z.enum(['json', 'pretty']).optional()
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
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
  // Core settings
  databaseUrl: raw.DATABASE_URL,
  jwtSecret: raw.JWT_SECRET,
  nodeEnv: raw.NODE_ENV || 'development',
  port: Number(raw.PORT || 3000),
  host: raw.HOST || '0.0.0.0',
  
  // CORS
  corsOrigins,
  
  // SSL/TLS (optional - typically handled by reverse proxy)
  ssl: {
    enabled: Boolean(raw.SSL_KEY_PATH && raw.SSL_CERT_PATH),
    keyPath: raw.SSL_KEY_PATH,
    certPath: raw.SSL_CERT_PATH
  },
  
  // Rate limiting
  rateLimit: {
    windowMs: Number(raw.RATE_LIMIT_WINDOW_MS || 900000), // 15 minutes
    maxRequests: Number(raw.RATE_LIMIT_MAX_REQUESTS || 100)
  },
  
  // Storage
  storage: {
    basePath: raw.STORAGE_PATH || './storage',
    maxUploadSizeMB: Number(raw.MAX_UPLOAD_SIZE_MB || 100)
  },
  
  // Logging
  logging: {
    level: raw.LOG_LEVEL || 'info',
    format: raw.LOG_FORMAT || (raw.NODE_ENV === 'production' ? 'json' : 'pretty')
  },
  
  // Computed properties
  isProduction: raw.NODE_ENV === 'production',
  isDevelopment: raw.NODE_ENV !== 'production' && raw.NODE_ENV !== 'test',
  isTest: raw.NODE_ENV === 'test'
};

module.exports = { config };
