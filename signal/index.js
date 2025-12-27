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

const app = express();

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

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.setHeader('x-request-id', _req.id || '');
    res.json({ status: 'ok', db: 'ok' });
  }
  catch (err) {
    console.error('DB healthcheck failed', err);
    res.status(500).json({ status: 'error', db: 'unavailable' });
  }
});

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
    req.user = decoded;
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
  if (req.user.role !== role) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

app.post('/auth/register', authLimiter, validate(RegisterSchema), async (req, res) => {
  const { email, password } = req.body;
  if (!jwtSecret) {
    return res.status(500).json({ error: 'JWT_SECRET not configured' });
  }
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { email, passwordHash, role: 'USER' } });
    const token = signToken({ sub: user.id, email: user.email, role: user.role });
    res.status(201).json({ token });
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
    const token = signToken({ sub: user.id, email: user.email, role: user.role });
    res.json({ token });
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

app.delete('/pings/:id', authenticate, authorizeRole('ADMIN'), async (req, res) => {
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
