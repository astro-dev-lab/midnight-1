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

const { 
  validateFileIntegrity, 
  quickValidate, 
  validateHeader 
} = require('./fileIntegrityValidator');

/**
 * Generate UUID v4 using native crypto
 * @returns {string}
 */
function uuidv4() {
  return crypto.randomUUID();
}

// Configuration
const STORAGE_PROVIDER = process.env.STORAGE_PROVIDER || 'local';
const STORAGE_DIR = process.env.STORAGE_DIR || path.join(__dirname, '..', 'storage', 'assets');
const SIGNED_URL_SECRET = process.env.SIGNED_URL_SECRET || 'dev-secret-change-in-production';
const SIGNED_URL_EXPIRY = parseInt(process.env.SIGNED_URL_EXPIRY || '3600', 10); // 1 hour default

// Optional S3 client (only used when STORAGE_PROVIDER === 's3')
let s3Client = null;
if (STORAGE_PROVIDER === 's3') {
  try {
    s3Client = require('./s3Client');
  } catch (err) {
    console.warn('[storage] STORAGE_PROVIDER=s3 but s3Client failed to load:', err.message);
    s3Client = null;
  }
}

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
  // S3-backed storage
  if (STORAGE_PROVIDER === 's3' && s3Client) {
    const sizeBytes = buffer.length;
    await s3Client.uploadBuffer(fileKey, buffer, { ContentType: 'application/octet-stream' });
    return { fileKey, sizeBytes };
  }

  // Local filesystem
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
  // S3-backed streaming upload to avoid buffering large files
  if (STORAGE_PROVIDER === 's3' && s3Client) {
    // If stream is small, uploadStream still handles it efficiently; it will use multipart when appropriate
    try {
      await s3Client.uploadStream(fileKey, stream, { ContentType: 'application/octet-stream' });
      // We don't know final size without head; return null for size
      return { fileKey, sizeBytes: null };
    } catch (err) {
      throw new Error(`Failed to store file to S3: ${err.message}`);
    }
  }

  // Local filesystem
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
  // S3-backed
  if (STORAGE_PROVIDER === 's3' && s3Client) {
    const stream = await s3Client.getObjectStream(fileKey);
    return new Promise((resolve, reject) => {
      const chunks = [];
      let length = 0;
      stream.on('data', (chunk) => { chunks.push(chunk); length += chunk.length; });
      stream.on('end', () => resolve(Buffer.concat(chunks, length)));
      stream.on('error', (err) => reject(new Error(`Failed to read file from S3: ${err.message}`)));
    });
  }

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
  if (STORAGE_PROVIDER === 's3' && s3Client) {
    // Return the S3 object stream directly
    return s3Client.getObjectStream(fileKey);
  }

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
  if (STORAGE_PROVIDER === 's3' && s3Client) {
    await s3Client.deleteObject(fileKey);
    return;
  }

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
  if (STORAGE_PROVIDER === 's3' && s3Client) {
    const res = await s3Client.headObjectExists(fileKey);
    return Boolean(res && res.exists);
  }
  const filePath = getFilePath(fileKey);
  return fs.existsSync(filePath);
}

/**
 * Get file metadata
 * @param {string} fileKey 
 * @returns {Promise<{ sizeBytes: number, createdAt: Date } | null>}
 */
async function getFileMetadata(fileKey) {
  if (STORAGE_PROVIDER === 's3' && s3Client) {
    const res = await s3Client.headObjectExists(fileKey);
    if (!res || !res.exists) return null;
    return {
      sizeBytes: Number(res.contentLength || 0),
      createdAt: res.lastModified || null
    };
  }

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
async function generatePresignedUrl(fileKey, baseUrl, expiresIn = SIGNED_URL_EXPIRY) {
  // If using S3, generate S3 presigned URL directly
  if (STORAGE_PROVIDER === 's3' && s3Client) {
    const url = await s3Client.generatePresignedUrlForGet(fileKey, expiresIn);
    const expiresAt = new Date((Math.floor(Date.now() / 1000) + expiresIn) * 1000);
    return { url, expiresAt };
  }

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

// ============================================================================
// File Integrity Validation
// ============================================================================

/**
 * Validate asset upload - combines MIME type check with file integrity validation.
 * Returns structured error following StudioOS patterns.
 * 
 * @param {Object} file - Uploaded file object from multer
 * @param {Object} options - Validation options
 * @param {boolean} [options.strictMode=true] - Enable strict validation
 * @param {boolean} [options.skipIntegrity=false] - Skip deep integrity check
 * @returns {Promise<Object>} - Validation result
 */
async function validateAssetUpload(file, options = {}) {
  const { strictMode = true, skipIntegrity = false } = options;
  
  const result = {
    valid: true,
    errors: [],
    warnings: [],
    metadata: null
  };
  
  // Check 1: MIME type (fast rejection)
  if (!isAllowedMimeType(file.mimetype)) {
    result.valid = false;
    result.errors.push({
      code: 'UNSUPPORTED_FORMAT',
      category: 'INGESTION',
      severity: 'critical',
      description: `The asset format "${file.mimetype}" is not supported.`,
      recommendation: 'Upload an asset in a supported format: WAV, MP3, FLAC, AAC, OGG, AIFF.'
    });
    return result;
  }
  
  // Check 2: File size
  if (file.size > MAX_FILE_SIZE) {
    result.valid = false;
    result.errors.push({
      code: 'FILE_TOO_LARGE',
      category: 'INGESTION',
      severity: 'critical',
      description: `The asset exceeds the maximum size of ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB.`,
      recommendation: 'Reduce the asset file size or split into smaller segments.'
    });
    return result;
  }
  
  // Check 3: Header validation from buffer (if buffer available)
  if (file.buffer) {
    const headerResult = validateHeader(file.buffer.slice(0, 16));
    if (!headerResult.valid) {
      result.valid = false;
      result.errors.push(headerResult.error);
      return result;
    }
    result.detectedFormat = headerResult.format;
  }
  
  // Check 4: Full integrity validation (if file is on disk and not skipped)
  if (file.path && !skipIntegrity) {
    const integrityResult = await validateFileIntegrity(file.path, { strictMode });
    
    if (!integrityResult.valid) {
      result.valid = false;
      result.errors.push(...integrityResult.errors);
      return result;
    }
    
    result.warnings.push(...integrityResult.warnings);
    result.metadata = integrityResult.metadata;
    result.checks = integrityResult.checks;
  }
  
  return result;
}

/**
 * Validate a stored asset by file key.
 * Use this to validate assets already in storage before processing.
 * 
 * @param {string} fileKey - Storage file key
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} - Validation result
 */
async function validateStoredAsset(fileKey, options = {}) {
  const filePath = getFilePath(fileKey);
  
  // Check file exists
  if (!fs.existsSync(filePath)) {
    return {
      valid: false,
      errors: [{
        code: 'FILE_NOT_FOUND',
        category: 'INGESTION',
        severity: 'critical',
        description: 'The asset could not be located in storage.',
        recommendation: 'Re-upload the source asset.'
      }],
      warnings: [],
      metadata: null
    };
  }
  
  // Run full integrity validation
  return validateFileIntegrity(filePath, options);
}

/**
 * Quick validation for asset header only.
 * Use for fast rejection during streaming uploads.
 * 
 * @param {string} fileKey - Storage file key
 * @returns {Promise<Object>} - Quick validation result
 */
async function quickValidateAsset(fileKey) {
  const filePath = getFilePath(fileKey);
  return quickValidate(filePath);
}

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
  uploadAudio,
  
  // File integrity validation
  validateAssetUpload,
  validateStoredAsset,
  quickValidateAsset
};
