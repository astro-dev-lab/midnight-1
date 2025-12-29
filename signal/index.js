const express = require('express');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const pino = require('pino');
const pinoHttp = require('pino-http');
const { randomUUID } = require('crypto');
const { config } = require('./config');
const { RegisterSchema, LoginSchema, PingCreateSchema, PingUpdateSchema, validate } = require('./validators');
const errorHandler = require('./middleware/error');
const { createProjectRoutes, createAssetRoutes, createJobRoutes, createDeliveryRoutes } = require('./routes');
const audioRoutes = require('./api/audio');
const jobQueueRoutes = require('./api/jobs');
const searchRoutes = require('./api/search');

// Enable BigInt serialization to JSON (Prisma uses BigInt for large integers)
BigInt.prototype.toJSON = function() {
  return this.toString();
};

const app = express();

// Trust proxy for rate limiting behind reverse proxies (GitHub Codespaces, etc.)
app.set('trust proxy', 1);

// Logging
const logger = process.env.NODE_ENV === 'production'
  ? pino()
  : pino({ transport: { target: 'pino-pretty', options: { colorize: true } } });
app.use(pinoHttp({ 
  logger,
  genReqId: (req) => req.headers['x-request-id'] || randomUUID(),
  customLogLevel: (res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  }
}));

// Global rate limiter: 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Security headers & CORS
app.use(helmet());
const allowAll = config.corsOrigins.includes('*');
const corsOptions = {
  credentials: true,
  origin: allowAll ? true : function(origin, callback) {
    if (!origin) return callback(null, true);
    if (config.corsOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  }
};
app.use(cors(corsOptions));
// Stricter rate limit for auth endpoints: 10 requests per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many auth attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const port = config.port;
const prisma = new PrismaClient();
const jwtSecret = config.jwtSecret;

if (!jwtSecret) {
  console.warn('Warning: JWT_SECRET is not set. Tokens will fail to verify.');
}

app.use(express.json());

// Docs
const swaggerUi = require('swagger-ui-express');
const openapi = require('./docs/openapi.json');
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));
app.get('/openapi.json', (req, res) => res.json(openapi));

// Public root endpoint
app.get('/', (_req, res) => {
  res.json({ 
    name: 'StudioOS API',
    version: '0.1.0',
    status: 'running',
    docs: '/docs',
    health: '/health'
  });
});

// Track startup time for uptime calculation
const startupTime = Date.now();

// Liveness probe - indicates the service is running
app.get('/health', (_req, res) => {
  res.setHeader('x-request-id', _req.id || '');
  res.json({ status: 'ok' });
});

// Readiness probe - indicates the service can accept traffic
app.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.setHeader('x-request-id', _req.id || '');
    res.json({ status: 'ready', db: 'connected' });
  }
  catch (err) {
    logger.error({ err }, 'Readiness check failed: database unavailable');
    res.status(503).json({ status: 'not_ready', db: 'unavailable' });
  }
});

// Detailed metrics endpoint for monitoring
app.get('/health/metrics', async (_req, res) => {
  const memoryUsage = process.memoryUsage();
  const uptimeSeconds = Math.floor((Date.now() - startupTime) / 1000);
  
  let dbStatus = 'connected';
  let dbLatencyMs = null;
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - dbStart;
  }
  catch (err) {
    dbStatus = 'unavailable';
    logger.error({ err }, 'Metrics check: database query failed');
  }
  
  // Get job queue stats
  let jobStats = { queued: 0, running: 0, completed: 0, failed: 0 };
  try {
    const stats = await prisma.$queryRaw`
      SELECT status, COUNT(*)::int as count 
      FROM "Job" 
      GROUP BY status
    `;
    for (const row of stats) {
      const key = row.status.toLowerCase();
      if (key in jobStats) jobStats[key] = row.count;
    }
  }
  catch (err) {
    logger.warn({ err }, 'Could not fetch job stats');
  }
  
  res.setHeader('x-request-id', _req.id || '');
  res.json({
    status: dbStatus === 'connected' ? 'healthy' : 'degraded',
    version: '0.1.0',
    uptime: {
      seconds: uptimeSeconds,
      formatted: formatUptime(uptimeSeconds)
    },
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs
    },
    memory: {
      heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      rssMB: Math.round(memoryUsage.rss / 1024 / 1024)
    },
    jobs: jobStats,
    environment: process.env.NODE_ENV || 'development'
  });
});

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

const parseId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    return null;
  }
  return id;
};

const signToken = (payload) => jwt.sign(payload, jwtSecret, { expiresIn: '1h' });

const authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = header.substring('Bearer '.length);
  try {
    const decoded = jwt.verify(token, jwtSecret);
    // Map JWT payload to req.user with role info
    req.user = {
      sub: decoded.sub,
      email: decoded.email,
      internalRole: decoded.internalRole || null,
      externalRole: decoded.externalRole || null
    };
    next();
  }
  catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const authorizeRole = (role) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Check both internal and external roles
  if (req.user.internalRole !== role && req.user.externalRole !== role) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

app.post('/auth/register', authLimiter, validate(RegisterSchema), async (req, res) => {
  const { email, password, internalRole, externalRole } = req.body;
  if (!jwtSecret) {
    return res.status(500).json({ error: 'JWT_SECRET not configured' });
  }
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    // Default to BASIC internal role if no role specified
    const userData = { 
      email, 
      passwordHash,
      internalRole: internalRole || 'BASIC',
      externalRole: externalRole || null
    };
    const user = await prisma.user.create({ data: userData });
    const token = signToken({ 
      sub: user.id, 
      email: user.email, 
      internalRole: user.internalRole,
      externalRole: user.externalRole
    });
    res.status(201).json({ 
      token,
      user: {
        id: user.id,
        email: user.email,
        internalRole: user.internalRole,
        externalRole: user.externalRole
      }
    });
  }
  catch (err) {
    console.error('Register failed', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/auth/login', authLimiter, validate(LoginSchema), async (req, res) => {
  const { email, password } = req.body;
  if (!jwtSecret) {
    return res.status(500).json({ error: 'JWT_SECRET not configured' });
  }
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = signToken({ 
      sub: user.id, 
      email: user.email, 
      internalRole: user.internalRole,
      externalRole: user.externalRole
    });
    res.json({ 
      token,
      user: {
        id: user.id,
        email: user.email,
        internalRole: user.internalRole,
        externalRole: user.externalRole
      }
    });
  }
  catch (err) {
    console.error('Login failed', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/pings', authenticate, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Number(req.query.offset) || 0;
  try {
    const data = await prisma.ping.findMany({
      skip: offset,
      take: limit,
      orderBy: { id: 'asc' }
    });
    res.json(data);
  }
  catch (err) {
    console.error('Failed to list pings', err);
    res.status(500).json({ error: 'Failed to list pings' });
  }
});

app.get('/pings/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  try {
    const ping = await prisma.ping.findUnique({ where: { id } });
    if (!ping) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json(ping);
  }
  catch (err) {
    console.error('Failed to fetch ping', err);
    res.status(500).json({ error: 'Failed to fetch ping' });
  }
});

app.post('/pings', authenticate, validate(PingCreateSchema), async (req, res) => {
  const { message } = req.body;
  try {
    const ping = await prisma.ping.create({ data: { message: message ?? 'ok' } });
    res.status(201).json(ping);
  }
  catch (err) {
    console.error('Failed to create ping', err);
    res.status(500).json({ error: 'Failed to create ping' });
  }
});

app.put('/pings/:id', authenticate, validate(PingUpdateSchema), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  const { message } = req.body;
  try {
    const ping = await prisma.ping.update({
      where: { id },
      data: { message: message ?? undefined }
    });
    res.json(ping);
  }
  catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Not found' });
    }
    console.error('Failed to update ping', err);
    res.status(500).json({ error: 'Failed to update ping' });
  }
});

app.delete('/pings/:id', authenticate, authorizeRole('ADVANCED'), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'Invalid id' });
  }
  try {
    await prisma.ping.delete({ where: { id } });
    res.status(204).end();
  }
  catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Not found' });
    }
    console.error('Failed to delete ping', err);
    res.status(500).json({ error: 'Failed to delete ping' });
  }
});

// ============================================================================
// StudioOS API Routes
// ============================================================================

// Mount StudioOS routes with authentication middleware
app.use('/api/projects', authenticate, createProjectRoutes(prisma));
app.use('/api/assets', authenticate, createAssetRoutes(prisma));
app.use('/api/jobs', authenticate, createJobRoutes(prisma));
app.use('/api/deliveries', authenticate, createDeliveryRoutes(prisma));

// Mount audio processing routes
app.use('/api', audioRoutes);

// Mount job queue routes
app.use('/api/jobs', jobQueueRoutes);

// Mount search routes
app.use('/api/search', searchRoutes);

// SSE endpoint for real-time job updates
const { createJobEventsRouter } = require('./services/jobEvents');
app.use('/api/events/jobs', authenticate, createJobEventsRouter(prisma));

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Signal server listening on port ${port}`);
  });
}

const shutdown = async (code) => {
  try {
    await prisma.$disconnect();
  }
  finally {
    process.exit(code);
  }
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// 404 and error handling
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});
app.use(errorHandler);

module.exports = app;
