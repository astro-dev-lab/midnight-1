const stream = require('stream');

// Mock the lib-storage Upload constructor so we can assert it's called correctly
let lastUploadOpts = null;
jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: jest.fn().mockImplementation((opts) => {
    lastUploadOpts = opts;
    return { done: jest.fn().mockResolvedValue({}) };
  })
}));

describe('S3 multipart streaming (lib-storage)', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.STORAGE_PROVIDER = 's3';
    process.env.S3_BUCKET = 'test-bucket';
  });

  it('uses Upload from @aws-sdk/lib-storage for stream uploads', async () => {
    const storage = require('../services/storage');
    const fileKey = '1/large-stream.wav';

    const readable = new stream.Readable({ read() {} });
    // push a few chunks then end
    readable.push(Buffer.from('chunk1'));
    readable.push(Buffer.from('chunk2'));
    readable.push(null);

    const result = await storage.storeFileStream(fileKey, readable);

    // confirm Upload constructor was invoked with client and params
    const { Upload } = require('@aws-sdk/lib-storage');
    expect(jest.isMockFunction(Upload)).toBe(true);
    expect(lastUploadOpts).not.toBeNull();
    expect(lastUploadOpts.params.Bucket).toBe('test-bucket');
    expect(lastUploadOpts.params.Key).toBe(fileKey);
    expect(result.fileKey).toBe(fileKey);
    expect(result.sizeBytes).toBeNull();
  });

  it('returns sizeBytes after upload when headObject succeeds', async () => {
    // Mock s3Client to simulate uploadStream + headObjectExists
    jest.resetModules();
    process.env.STORAGE_PROVIDER = 's3';
    process.env.S3_BUCKET = 'test-bucket';

    const s3ClientMock = require('../services/s3Client');
    s3ClientMock.uploadStream = jest.fn(async (key, readable) => ({ Bucket: 'test-bucket', Key: key }));
    s3ClientMock.headObjectExists = jest.fn(async (key) => ({ exists: true, contentLength: 4096, lastModified: new Date() }));

    const storage = require('../services/storage');
    const fileKey = '1/stream-with-size.wav';
    const readable = new stream.Readable({ read() {} });
    readable.push(Buffer.from('x')); readable.push(null);

    const result = await storage.storeFileStream(fileKey, readable);

    expect(s3ClientMock.uploadStream).toHaveBeenCalled();
    expect(s3ClientMock.headObjectExists).toHaveBeenCalledWith(fileKey);
    expect(result.fileKey).toBe(fileKey);
    expect(result.sizeBytes).toBe(4096);
  });
});
