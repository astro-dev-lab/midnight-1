const stream = require('stream');

// Mock the s3 client module manually to avoid adding external test deps
jest.mock('@aws-sdk/client-s3', () => {
  // Internal mock response registry
  const __responses = {};

  class FakeS3Client {
    constructor() {}
    static __setResponse(name, fn) { __responses[name] = fn; }
    static __reset() { for (const k of Object.keys(__responses)) delete __responses[k]; }
    send(cmd) {
      const name = cmd.constructor.name;
      const handler = __responses[name];
      if (!handler) throw new Error(`Unmocked S3 command: ${name}`);
      return handler(cmd);
    }
  }

  function PutObjectCommand(input) { this.input = input; }
  function GetObjectCommand(input) { this.input = input; }
  function DeleteObjectCommand(input) { this.input = input; }
  function HeadObjectCommand(input) { this.input = input; }

  return { S3Client: FakeS3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(async () => 'https://signed.example.com/download')
}));

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

describe('S3-backed Storage (manual mock)', () => {
  beforeEach(() => {
    // set env and reload modules
    process.env.STORAGE_PROVIDER = 's3';
    process.env.S3_BUCKET = 'test-bucket';
    S3Client.__reset?.();
    jest.resetModules();
  });

  it('uploads a buffer to S3 via storeFile', async () => {
    const storage = require('../services/storage');

    S3Client.__setResponse('PutObjectCommand', async (cmd) => ({ }));

    const fileKey = '1/test-upload.txt';
    const content = Buffer.from('hello s3');

    const res = await storage.storeFile(fileKey, content);

    expect(res.fileKey).toBe(fileKey);
    expect(res.sizeBytes).toBe(content.length);
  });

  it('retrieves a file from S3 via getFile', async () => {
    const storage = require('../services/storage');

    const content = Buffer.from('s3 data');
    const readable = stream.Readable.from([content]);

    S3Client.__setResponse('GetObjectCommand', async (cmd) => ({ Body: readable }));

    const fileKey = '1/test-get.txt';
    const buf = await storage.getFile(fileKey);

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString()).toBe('s3 data');
  });

  it('deletes an object from S3 via deleteFile', async () => {
    const storage = require('../services/storage');

    S3Client.__setResponse('DeleteObjectCommand', async (cmd) => ({}));

    const fileKey = '1/test-delete.txt';
    await expect(storage.deleteFile(fileKey)).resolves.toBeUndefined();
  });

  it('checks existence via headObject', async () => {
    const storage = require('../services/storage');

    // HeadObject resolves when exists
    S3Client.__setResponse('HeadObjectCommand', async (cmd) => ({ ContentLength: 123, LastModified: new Date() }));

    const fileKey = '1/test-head.txt';
    const exists = await storage.fileExists(fileKey);

    expect(exists).toBe(true);

    // Now simulate not found
    S3Client.__setResponse('HeadObjectCommand', async (cmd) => { const err = new Error('NotFound'); err.name = 'NotFound'; err.$metadata = { httpStatusCode: 404 }; throw err; });
    const notExists = await storage.fileExists('1/missing.txt');
    expect(notExists).toBe(false);
  });

  it('generates a presigned URL via S3 presigner', async () => {
    const storage = require('../services/storage');

    const fileKey = '1/test-presign.wav';
    const baseUrl = 'https://api.example.com';

    const { url, expiresAt } = await storage.generatePresignedUrl(fileKey, baseUrl, 3600);

    expect(url).toBe('https://signed.example.com/download');
    expect(expiresAt).toBeInstanceOf(Date);
    expect(getSignedUrl).toHaveBeenCalled();
  });
});
