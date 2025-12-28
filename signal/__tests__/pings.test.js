const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('@prisma/client', () => {
  const pings = [{ id: 1, message: 'ok' }];
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      ping: {
        findMany: jest.fn(async () => pings),
        findUnique: jest.fn(async ({ where: { id } }) => pings.find(p => p.id === id) || null),
        create: jest.fn(async ({ data }) => { const item = { id: pings.length + 1, message: data.message || 'ok' }; pings.push(item); return item; }),
        update: jest.fn(async ({ where: { id }, data }) => { const item = pings.find(p => p.id === id); if (!item) throw { code: 'P2025' }; item.message = data.message; return item; }),
        delete: jest.fn(async ({ where: { id } }) => { const i = pings.findIndex(p => p.id === id); if (i === -1) throw { code: 'P2025' }; pings.splice(i,1); return { id }; }),
      },
      $queryRaw: jest.fn(async () => [[1]]),
      $disconnect: jest.fn()
    }))
  }
});

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const app = require('../index');
const sign = (payload) => jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

describe('Pings', () => {
  test('list requires auth', async () => {
    await request(app).get('/pings').expect(401);
  });

  test('list returns results with token', async () => {
    const token = sign({ sub: 1, email: 'user@example.com', role: 'USER' });
    const res = await request(app).get('/pings').set('Authorization', `Bearer ${token}`).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].message).toBeDefined();
  });

  test('create ping', async () => {
    const token = sign({ sub: 1, email: 'user@example.com', role: 'USER' });
    const res = await request(app).post('/pings').set('Authorization', `Bearer ${token}`).send({ message: 'hello' }).expect(201);
    expect(res.body.message).toBe('hello');
  });

  test('update ping', async () => {
    const token = sign({ sub: 1, email: 'user@example.com', role: 'USER' });
    const res = await request(app).put('/pings/1').set('Authorization', `Bearer ${token}`).send({ message: 'updated' }).expect(200);
    expect(res.body.message).toBe('updated');
  });

  test('delete ping requires admin', async () => {
    const userToken = sign({ sub: 1, email: 'user@example.com', internalRole: 'BASIC' });
    await request(app).delete('/pings/1').set('Authorization', `Bearer ${userToken}`).expect(403);

    const adminToken = sign({ sub: 1, email: 'admin@example.com', internalRole: 'ADVANCED' });
    await request(app).delete('/pings/1').set('Authorization', `Bearer ${adminToken}`).expect(204);
  });
});
