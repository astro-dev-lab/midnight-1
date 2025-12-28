/**
 * StudioOS Integration Tests
 * 
 * Sequential end-to-end tests for complete workflows.
 * These tests run in order and share state.
 */

const request = require('supertest');
const app = require('../index');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Shared test state
let authToken;
let testUserId;
let testProjectId;
let testAssetId;
let testJobId;

const testEmail = `integration-test-${Date.now()}@example.com`;
const testPassword = 'TestPassword123!';

describe('StudioOS E2E Workflow', () => {
  beforeAll(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  async function cleanupTestData() {
    try {
      // Delete in correct order for foreign keys
      await prisma.approval.deleteMany({
        where: { user: { email: { startsWith: 'integration-test-' } } }
      });
      await prisma.report.deleteMany({
        where: { job: { project: { owner: { email: { startsWith: 'integration-test-' } } } } }
      });
      await prisma.jobInput.deleteMany({
        where: { job: { project: { owner: { email: { startsWith: 'integration-test-' } } } } }
      });
      await prisma.job.deleteMany({
        where: { project: { owner: { email: { startsWith: 'integration-test-' } } } }
      });
      await prisma.asset.deleteMany({
        where: { project: { owner: { email: { startsWith: 'integration-test-' } } } }
      });
      await prisma.projectAccess.deleteMany({
        where: { user: { email: { startsWith: 'integration-test-' } } }
      });
      await prisma.project.deleteMany({
        where: { owner: { email: { startsWith: 'integration-test-' } } }
      });
      await prisma.user.deleteMany({
        where: { email: { startsWith: 'integration-test-' } }
      });
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  // ============================================================================
  // Step 1: Register User
  // ============================================================================

  test('1. Register new user', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        email: testEmail,
        password: testPassword
      });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    
    authToken = res.body.token;
    
    // Decode token to get user info
    const payload = JSON.parse(Buffer.from(authToken.split('.')[1], 'base64').toString());
    testUserId = payload.sub;
    expect(payload.email).toBe(testEmail);
  });

  test('2. Reject duplicate registration', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        email: testEmail,
        password: testPassword
      });

    expect(res.status).toBe(409);
  });

  test('3. Login with valid credentials', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({
        email: testEmail,
        password: testPassword
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    authToken = res.body.token;
  });

  test('4. Reject invalid password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({
        email: testEmail,
        password: 'WrongPassword'
      });

    expect(res.status).toBe(401);
  });

  // ============================================================================
  // Step 2: Create Project
  // ============================================================================

  test('5. Create project', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Integration Test Project'
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Integration Test Project');
    expect(res.body.state).toBe('DRAFT');
    
    testProjectId = res.body.id;
  });

  test('6. List user projects', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.find(p => p.id === testProjectId)).toBeDefined();
  });

  test('7. Get project details', async () => {
    const res = await request(app)
      .get(`/api/projects/${testProjectId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(testProjectId);
  });

  // ============================================================================
  // Step 3: Create Asset
  // ============================================================================

  test('8. Create raw asset', async () => {
    const res = await request(app)
      .post('/api/assets')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        projectId: testProjectId,
        name: 'Test Audio File.wav',
        fileKey: `${testProjectId}/test-uuid/test.wav`,
        mimeType: 'audio/wav',
        sizeBytes: 1024000
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test Audio File.wav');
    expect(res.body.category).toBe('RAW');
    
    testAssetId = res.body.id;
  });

  test('9. List project assets', async () => {
    const res = await request(app)
      .get(`/api/assets?projectId=${testProjectId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('10. Get asset details', async () => {
    const res = await request(app)
      .get(`/api/assets/${testAssetId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(testAssetId);
    expect(res.body.lineage).toBeDefined();
  });

  // ============================================================================
  // Step 4: Create Job
  // ============================================================================

  test('11. List presets', async () => {
    const res = await request(app)
      .get('/api/jobs/presets')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  test('12. Create job', async () => {
    const res = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        projectId: testProjectId,
        preset: 'analyze-full',
        inputAssetIds: [testAssetId]
      });

    expect(res.status).toBe(201);
    expect(res.body.preset).toBe('analyze-full');
    expect(res.body.state).toBe('QUEUED');
    
    testJobId = res.body.id;
  });

  test('13. Get job status', async () => {
    const res = await request(app)
      .get(`/api/jobs/${testJobId}/status`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED']).toContain(res.body.state);
  });

  test('14. List project jobs', async () => {
    const res = await request(app)
      .get(`/api/jobs?projectId=${testProjectId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  // ============================================================================
  // Step 5: Error Handling
  // ============================================================================

  test('15. Require authentication for protected routes', async () => {
    const res = await request(app)
      .get('/api/projects');

    expect(res.status).toBe(401);
  });

  test('16. Return 400 for missing projectId on assets', async () => {
    const res = await request(app)
      .get('/api/assets')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('projectId');
  });

  // ============================================================================
  // Step 6: Access Control
  // ============================================================================

  test('17. Other user cannot access project (denied)', async () => {
    // Register another user
    const otherEmail = `integration-test-other-${Date.now()}@example.com`;
    const regRes = await request(app)
      .post('/auth/register')
      .send({
        email: otherEmail,
        password: 'OtherPassword123!'
      });
    
    const otherToken = regRes.body.token;

    // Try to access the test project - should be denied (not 200)
    const res = await request(app)
      .get(`/api/projects/${testProjectId}`)
      .set('Authorization', `Bearer ${otherToken}`);

    // Other user should not get the project - any non-200 is acceptable
    expect(res.status).not.toBe(200);
  });
});
