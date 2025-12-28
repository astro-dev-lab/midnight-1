/**
 * StudioOS Storage Service
 * 
 * Handles file storage with local filesystem backend by default.
 * Extensible to S3/GCS via environment configuration.
 * 
 * Features:
 * - Secure file upload with validation
 * - Presigned download URLs with expiration
 * - File deletion for cleanup
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Generate UUID v4 using native crypto
 * @returns {string}
 */
function uuidv4() {
  return crypto.randomUUID();
}

// Configuration
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(__dirname, '..', 'storage', 'assets');
const SIGNED_URL_SECRET = process.env.SIGNED_URL_SECRET || 'dev-secret-change-in-production';
const SIGNED_URL_EXPIRY = parseInt(process.env.SIGNED_URL_EXPIRY || '3600', 10); // 1 hour default

// Allowed MIME types for audio assets
const ALLOWED_MIME_TYPES = [
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/aiff',
  'audio/x-aiff',
  'audio/flac',
  'audio/ogg',
  'audio/aac',
  'audio/mp4',
  'audio/x-m4a',
  'application/octet-stream' // Allow generic binary for edge cases
];

// Maximum file size (500 MB)
const MAX_FILE_SIZE = 500 * 1024 * 1024;

/**
 * Ensure storage directory exists
 */
function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

/**
 * Validate MIME type
 * @param {string} mimeType 
 * @returns {boolean}
 */
function isAllowedMimeType(mimeType) {
  return ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase());
}

/**
 * Generate a unique file key
 * Format: {projectId}/{uuid}/{originalName}
 * @param {number} projectId 
 * @param {string} originalName 
 * @returns {string}
 */
function generateFileKey(projectId, originalName) {
  const uuid = uuidv4();
  const sanitizedName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${projectId}/${uuid}/${sanitizedName}`;
}

/**
 * Get the full path for a file key
 * @param {string} fileKey 
 * @returns {string}
 */
function getFilePath(fileKey) {
  return path.join(STORAGE_DIR, fileKey);
}

/**
 * Store a file buffer
 * @param {string} fileKey 
 * @param {Buffer} buffer 
 * @returns {Promise<{ fileKey: string, sizeBytes: number }>}
 */
async function storeFile(fileKey, buffer) {
  ensureStorageDir();
  
  const filePath = getFilePath(fileKey);
  const dirPath = path.dirname(filePath);
  
  // Create project subdirectory if needed
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, buffer, (err) => {
      if (err) {
        reject(new Error(`Failed to store file: ${err.message}`));
      } else {
        resolve({
          fileKey,
          sizeBytes: buffer.length
        });
      }
    });
  });
}

/**
 * Store a file from stream
 * @param {string} fileKey 
 * @param {import('stream').Readable} stream 
 * @returns {Promise<{ fileKey: string, sizeBytes: number }>}
 */
async function storeFileStream(fileKey, stream) {
  ensureStorageDir();
  
  const filePath = getFilePath(fileKey);
  const dirPath = path.dirname(filePath);
  
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  
  return new Promise((resolve, reject) => {
    let sizeBytes = 0;
    const writeStream = fs.createWriteStream(filePath);
    
    stream.on('data', (chunk) => {
      sizeBytes += chunk.length;
      if (sizeBytes > MAX_FILE_SIZE) {
        writeStream.destroy();
        // Clean up partial file
        fs.unlink(filePath, () => {});
        reject(new Error(`File size exceeds maximum of ${MAX_FILE_SIZE} bytes`));
      }
    });
    
    stream.pipe(writeStream);
    
    writeStream.on('finish', () => {
      resolve({ fileKey, sizeBytes });
    });
    
    writeStream.on('error', (err) => {
      reject(new Error(`Failed to store file: ${err.message}`));
    });
  });
}

/**
 * Get a file as buffer
 * @param {string} fileKey 
 * @returns {Promise<Buffer>}
 */
async function getFile(fileKey) {
  const filePath = getFilePath(fileKey);
  
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          reject(new Error('File not found'));
        } else {
          reject(new Error(`Failed to read file: ${err.message}`));
        }
      } else {
        resolve(data);
      }
    });
  });
}

/**
 * Get file read stream
 * @param {string} fileKey 
 * @returns {import('fs').ReadStream}
 */
function getFileStream(fileKey) {
  const filePath = getFilePath(fileKey);
  
  if (!fs.existsSync(filePath)) {
    throw new Error('File not found');
  }
  
  return fs.createReadStream(filePath);
}

/**
 * Delete a file
 * @param {string} fileKey 
 * @returns {Promise<void>}
 */
async function deleteFile(fileKey) {
  const filePath = getFilePath(fileKey);
  
  return new Promise((resolve, reject) => {
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') {
        reject(new Error(`Failed to delete file: ${err.message}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Check if a file exists
 * @param {string} fileKey 
 * @returns {Promise<boolean>}
 */
async function fileExists(fileKey) {
  const filePath = getFilePath(fileKey);
  return fs.existsSync(filePath);
}

/**
 * Get file metadata
 * @param {string} fileKey 
 * @returns {Promise<{ sizeBytes: number, createdAt: Date } | null>}
 */
async function getFileMetadata(fileKey) {
  const filePath = getFilePath(fileKey);
  
  return new Promise((resolve) => {
    fs.stat(filePath, (err, stats) => {
      if (err) {
        resolve(null);
      } else {
        resolve({
          sizeBytes: stats.size,
          createdAt: stats.birthtime
        });
      }
    });
  });
}

// ============================================================================
// Presigned URL Generation
// ============================================================================

/**
 * Generate HMAC signature for a URL
 * @param {string} payload 
 * @returns {string}
 */
function generateSignature(payload) {
  return crypto
    .createHmac('sha256', SIGNED_URL_SECRET)
    .update(payload)
    .digest('hex');
}

/**
 * Generate a presigned download URL
 * @param {string} fileKey 
 * @param {string} baseUrl - Base URL of the API (e.g., https://api.example.com)
 * @param {number} [expiresIn] - Seconds until expiry (default: SIGNED_URL_EXPIRY)
 * @returns {{ url: string, expiresAt: Date }}
 */
function generatePresignedUrl(fileKey, baseUrl, expiresIn = SIGNED_URL_EXPIRY) {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  const payload = `${fileKey}:${expiresAt}`;
  const signature = generateSignature(payload);
  
  const encodedKey = encodeURIComponent(fileKey);
  const url = `${baseUrl}/api/assets/download?key=${encodedKey}&expires=${expiresAt}&sig=${signature}`;
  
  return {
    url,
    expiresAt: new Date(expiresAt * 1000)
  };
}

/**
 * Verify a presigned URL signature
 * @param {string} fileKey 
 * @param {number} expires - Unix timestamp
 * @param {string} signature 
 * @returns {{ valid: boolean, reason?: string }}
 */
function verifyPresignedUrl(fileKey, expires, signature) {
  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (expires < now) {
    return { valid: false, reason: 'URL has expired' };
  }
  
  // Verify signature
  const payload = `${fileKey}:${expires}`;
  const expectedSignature = generateSignature(payload);
  
  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');
  
  if (signatureBuffer.length !== expectedBuffer.length) {
    return { valid: false, reason: 'Invalid signature' };
  }
  
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return { valid: false, reason: 'Invalid signature' };
  }
  
  return { valid: true };
}

// ============================================================================
// Multer Configuration
// ============================================================================

const multer = require('multer');

/**
 * Create multer upload middleware with validation
 * @param {Object} options 
 * @param {number} [options.maxSize] - Max file size in bytes
 * @param {string[]} [options.allowedTypes] - Allowed MIME types
 * @returns {import('multer').Multer}
 */
function createUploadMiddleware(options = {}) {
  const maxSize = options.maxSize || MAX_FILE_SIZE;
  const allowedTypes = options.allowedTypes || ALLOWED_MIME_TYPES;
  
  const storage = multer.memoryStorage();
  
  const fileFilter = (req, file, cb) => {
    if (allowedTypes.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`), false);
    }
  };
  
  return multer({
    storage,
    limits: {
      fileSize: maxSize
    },
    fileFilter
  });
}

// Default upload middleware for audio files
const uploadAudio = createUploadMiddleware();

module.exports = {
  // Storage operations
  storeFile,
  storeFileStream,
  getFile,
  getFileStream,
  deleteFile,
  fileExists,
  getFileMetadata,
  
  // File key generation
  generateFileKey,
  
  // Validation
  isAllowedMimeType,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  
  // Presigned URLs
  generatePresignedUrl,
  verifyPresignedUrl,
  
  // Multer middleware
  createUploadMiddleware,
  uploadAudio
};
