const request = require('supertest');

// Mock Prisma to avoid DB dependency
jest.mock('@prisma/client', () => {
  const userStore = new Map();
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      user: {
        findUnique: jest.fn(async ({ where: { email } }) => userStore.get(email) || null),
        create: jest.fn(async ({ data }) => {
          userStore.set(data.email, { id: userStore.size + 1, email: data.email, passwordHash: data.passwordHash, role: data.role || 'USER' });
          return userStore.get(data.email);
        }),
      },
      $queryRaw: jest.fn(async () => [[1]]),
      $disconnect: jest.fn()
    }))
  }
});

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const app = require('../index');

describe('Auth', () => {
  test('register → token', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'new@example.com', password: 'password-test' })
      .expect(201);
    expect(res.body.token).toBeDefined();
  });

  test('login → token', async () => {
    // Register first
    await request(app).post('/auth/register').send({ email: 'user@example.com', password: 'password-test' });
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'user@example.com', password: 'password-test' })
      .expect(200);
    expect(res.body.token).toBeDefined();
  });

  test('login invalid credentials', async () => {
    await request(app).post('/auth/register').send({ email: 'bad@example.com', password: 'password-test' });
    await request(app)
      .post('/auth/login')
      .send({ email: 'bad@example.com', password: 'wrong-pass' })
      .expect(401);
  });

  test('validation: missing fields', async () => {
    await request(app).post('/auth/register').send({ email: '' }).expect(400);
  });
});
