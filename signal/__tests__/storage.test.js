/**
 * Storage Service Tests
 */

const fs = require('fs');
const path = require('path');
const {
  generateFileKey,
  storeFile,
  getFile,
  deleteFile,
  fileExists,
  getFileMetadata,
  isAllowedMimeType,
  generatePresignedUrl,
  verifyPresignedUrl,
  ALLOWED_MIME_TYPES
} = require('../services/storage');

// Test storage directory
const TEST_STORAGE_DIR = path.join(__dirname, '..', 'storage', 'test-assets');

describe('Storage Service', () => {
  const testFiles = [];

  afterAll(async () => {
    // Clean up test files
    for (const fileKey of testFiles) {
      try {
        await deleteFile(fileKey);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    // Remove test directory if empty
    try {
      fs.rmdirSync(TEST_STORAGE_DIR, { recursive: true });
    } catch (e) {
      // Ignore
    }
  });

  describe('File Key Generation', () => {
    it('should generate unique file keys', () => {
      const key1 = generateFileKey(1, 'test.wav');
      const key2 = generateFileKey(1, 'test.wav');
      
      expect(key1).not.toBe(key2);
      expect(key1).toMatch(/^1\/[a-f0-9-]+\/test.wav$/);
    });

    it('should sanitize file names', () => {
      const key = generateFileKey(1, 'my file (1).wav');
      expect(key).toMatch(/^1\/[a-f0-9-]+\/my_file__1_.wav$/);
    });

    it('should include project ID in path', () => {
      const key = generateFileKey(123, 'audio.wav');
      expect(key.startsWith('123/')).toBe(true);
    });
  });

  describe('MIME Type Validation', () => {
    it('should allow audio MIME types', () => {
      expect(isAllowedMimeType('audio/wav')).toBe(true);
      expect(isAllowedMimeType('audio/mpeg')).toBe(true);
      expect(isAllowedMimeType('audio/flac')).toBe(true);
      expect(isAllowedMimeType('audio/aiff')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(isAllowedMimeType('AUDIO/WAV')).toBe(true);
      expect(isAllowedMimeType('Audio/Mpeg')).toBe(true);
    });

    it('should reject non-audio MIME types', () => {
      expect(isAllowedMimeType('image/png')).toBe(false);
      expect(isAllowedMimeType('video/mp4')).toBe(false);
      expect(isAllowedMimeType('text/plain')).toBe(false);
    });

    it('should have expected MIME types in allow list', () => {
      expect(ALLOWED_MIME_TYPES).toContain('audio/wav');
      expect(ALLOWED_MIME_TYPES).toContain('audio/mpeg');
      expect(ALLOWED_MIME_TYPES).toContain('audio/flac');
    });
  });

  describe('File Storage Operations', () => {
    it('should store and retrieve a file', async () => {
      const fileKey = generateFileKey(999, 'test-store.txt');
      testFiles.push(fileKey);
      
      const content = Buffer.from('Hello, StudioOS!');
      
      const result = await storeFile(fileKey, content);
      expect(result.fileKey).toBe(fileKey);
      expect(result.sizeBytes).toBe(content.length);
      
      const retrieved = await getFile(fileKey);
      expect(retrieved.toString()).toBe('Hello, StudioOS!');
    });

    it('should check file existence', async () => {
      const fileKey = generateFileKey(999, 'test-exists.txt');
      testFiles.push(fileKey);
      
      expect(await fileExists(fileKey)).toBe(false);
      
      await storeFile(fileKey, Buffer.from('test'));
      
      expect(await fileExists(fileKey)).toBe(true);
    });

    it('should get file metadata', async () => {
      const fileKey = generateFileKey(999, 'test-meta.txt');
      testFiles.push(fileKey);
      
      const content = Buffer.from('Metadata test content');
      await storeFile(fileKey, content);
      
      const metadata = await getFileMetadata(fileKey);
      expect(metadata).not.toBeNull();
      expect(metadata.sizeBytes).toBe(content.length);
      expect(metadata.createdAt).toBeDefined();
      expect(new Date(metadata.createdAt).getTime()).not.toBeNaN();
    });

    it('should delete files', async () => {
      const fileKey = generateFileKey(999, 'test-delete.txt');
      
      await storeFile(fileKey, Buffer.from('to be deleted'));
      expect(await fileExists(fileKey)).toBe(true);
      
      await deleteFile(fileKey);
      expect(await fileExists(fileKey)).toBe(false);
    });

    it('should throw for non-existent file read', async () => {
      const fileKey = generateFileKey(999, 'does-not-exist.txt');
      
      await expect(getFile(fileKey)).rejects.toThrow('File not found');
    });
  });

  describe('Presigned URLs', () => {
    it('should generate valid presigned URLs', async () => {
      const fileKey = '1/abc/test.wav';
      const baseUrl = 'https://api.example.com';
      
      const { url, expiresAt } = await generatePresignedUrl(fileKey, baseUrl);
      
      expect(url).toContain(baseUrl);
      expect(url).toContain('key=');
      expect(url).toContain('expires=');
      expect(url).toContain('sig=');
      expect(expiresAt).toBeInstanceOf(Date);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should verify valid presigned URLs', async () => {
      const fileKey = '1/abc/test.wav';
      const baseUrl = 'https://api.example.com';
      
      const { url } = await generatePresignedUrl(fileKey, baseUrl, 3600);
      
      // Extract params from URL
      const urlObj = new URL(url);
      const key = urlObj.searchParams.get('key');
      const expires = parseInt(urlObj.searchParams.get('expires'));
      const sig = urlObj.searchParams.get('sig');
      
      const result = verifyPresignedUrl(key, expires, sig);
      expect(result.valid).toBe(true);
    });

    it('should reject expired URLs', () => {
      const fileKey = '1/abc/test.wav';
      const expires = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      
      // Generate a signature for expired time
      const payload = `${fileKey}:${expires}`;
      const sig = require('crypto')
        .createHmac('sha256', 'dev-secret-change-in-production')
        .update(payload)
        .digest('hex');
      
      const result = verifyPresignedUrl(fileKey, expires, sig);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('URL has expired');
    });

    it('should reject invalid signatures', () => {
      const fileKey = '1/abc/test.wav';
      const expires = Math.floor(Date.now() / 1000) + 3600;
      
      const result = verifyPresignedUrl(fileKey, expires, 'invalid-signature');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Invalid signature');
    });

    it('should use custom expiration', async () => {
      const fileKey = '1/abc/test.wav';
      const baseUrl = 'https://api.example.com';
      
      const { expiresAt } = await generatePresignedUrl(fileKey, baseUrl, 60); // 60 seconds
      
      const expectedExpiry = Date.now() + 60 * 1000;
      expect(Math.abs(expiresAt.getTime() - expectedExpiry)).toBeLessThan(2000);
    });
  });
});
