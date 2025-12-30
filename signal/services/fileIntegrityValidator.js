/**
 * File Integrity Validator
 * 
 * Pre-processing validation layer for audio assets.
 * Detects corruption, truncated frames, and invalid headers
 * before assets enter the job pipeline.
 * 
 * Integration points:
 * - storageService.validateAssetUpload() - during upload
 * - jobEngine.enqueue() - before job creation
 * 
 * Error Category: Always INGESTION (per STUDIOOS_ERROR_RECOVERY_PLAYBOOK.md)
 */

const fs = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

// ============================================================================
// Constants
// ============================================================================

const FFPROBE_PATH = process.env.FFPROBE_PATH || 'ffprobe';

/**
 * Magic bytes for audio format detection.
 * Used for fast rejection before full FFprobe analysis.
 */
const MAGIC_BYTES = {
  // RIFF....WAVE
  WAV: {
    offset: 0,
    bytes: [0x52, 0x49, 0x46, 0x46], // "RIFF"
    secondary: { offset: 8, bytes: [0x57, 0x41, 0x56, 0x45] } // "WAVE"
  },
  // ID3 tag or frame sync
  MP3: {
    offset: 0,
    bytes: [0x49, 0x44, 0x33], // "ID3"
    alt: [0xFF, 0xFB], // Frame sync (no ID3)
    altMask: [0xFF, 0xE0] // Frame sync mask
  },
  // fLaC
  FLAC: {
    offset: 0,
    bytes: [0x66, 0x4C, 0x61, 0x43] // "fLaC"
  },
  // OggS
  OGG: {
    offset: 0,
    bytes: [0x4F, 0x67, 0x67, 0x53] // "OggS"
  },
  // ftyp (MP4/M4A/AAC container)
  MP4: {
    offset: 4,
    bytes: [0x66, 0x74, 0x79, 0x70] // "ftyp"
  },
  // AIFF
  AIFF: {
    offset: 0,
    bytes: [0x46, 0x4F, 0x52, 0x4D], // "FORM"
    secondary: { offset: 8, bytes: [0x41, 0x49, 0x46, 0x46] } // "AIFF"
  }
};

/**
 * Error codes for file integrity issues.
 * Following StudioOS error categorization.
 */
const IntegrityErrorCode = {
  // Header errors
  INVALID_MAGIC_BYTES: 'INVALID_MAGIC_BYTES',
  CORRUPT_HEADER: 'CORRUPT_HEADER',
  MISSING_AUDIO_STREAM: 'MISSING_AUDIO_STREAM',
  UNSUPPORTED_FORMAT: 'UNSUPPORTED_FORMAT',
  
  // Structure errors
  TRUNCATED_FILE: 'TRUNCATED_FILE',
  INCOMPLETE_FRAMES: 'INCOMPLETE_FRAMES',
  INVALID_FRAME_STRUCTURE: 'INVALID_FRAME_STRUCTURE',
  
  // Metadata errors
  INVALID_SAMPLE_RATE: 'INVALID_SAMPLE_RATE',
  INVALID_CHANNEL_COUNT: 'INVALID_CHANNEL_COUNT',
  ZERO_DURATION: 'ZERO_DURATION',
  
  // Container errors
  CONTAINER_MISMATCH: 'CONTAINER_MISMATCH',
  MISSING_CODEC_DATA: 'MISSING_CODEC_DATA',
  
  // Access errors
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_NOT_READABLE: 'FILE_NOT_READABLE',
  FILE_EMPTY: 'FILE_EMPTY'
};

/**
 * Severity levels for integrity errors.
 */
const Severity = {
  CRITICAL: 'critical', // Cannot process at all
  HIGH: 'high',         // Likely to cause processing failure
  MEDIUM: 'medium'      // May cause quality issues
};

/**
 * Valid sample rates (Hz).
 */
const VALID_SAMPLE_RATES = [
  8000, 11025, 16000, 22050, 32000, 44100, 48000,
  88200, 96000, 176400, 192000, 352800, 384000
];

/**
 * Minimum file sizes (bytes) for basic validity.
 */
const MIN_FILE_SIZES = {
  WAV: 44,    // Minimum WAV header
  MP3: 128,   // Minimum for ID3 + frames
  FLAC: 42,   // Minimum FLAC header
  OGG: 27,    // Minimum Ogg page
  MP4: 32,    // Minimum ftyp box
  AIFF: 54    // Minimum AIFF header
};

// ============================================================================
// Core Validation Functions
// ============================================================================

/**
 * Validate file integrity.
 * Returns structured result following StudioOS patterns.
 * 
 * @param {string} filePath - Absolute path to audio file
 * @param {Object} options - Validation options
 * @returns {Promise<Object>} - Validation result
 */
async function validateFileIntegrity(filePath, options = {}) {
  const {
    skipMagicBytes = false,
    skipFFprobe = false,
    strictMode = true
  } = options;
  
  const result = {
    valid: true,
    errors: [],
    warnings: [],
    metadata: null,
    checks: {
      fileAccess: false,
      magicBytes: false,
      headerStructure: false,
      audioStream: false,
      frameIntegrity: false,
      metadataValid: false
    }
  };
  
  try {
    // ─────────────────────────────────────────────────────────────────────
    // Check 1: File Access
    // ─────────────────────────────────────────────────────────────────────
    const accessResult = await checkFileAccess(filePath);
    if (!accessResult.valid) {
      result.valid = false;
      result.errors.push(accessResult.error);
      return result;
    }
    result.checks.fileAccess = true;
    
    // ─────────────────────────────────────────────────────────────────────
    // Check 2: Magic Bytes (Fast Rejection)
    // ─────────────────────────────────────────────────────────────────────
    if (!skipMagicBytes) {
      const magicResult = await checkMagicBytes(filePath);
      if (!magicResult.valid) {
        result.valid = false;
        result.errors.push(magicResult.error);
        return result;
      }
      result.checks.magicBytes = true;
      result.detectedFormat = magicResult.format;
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // Check 3: FFprobe Analysis (Detailed Validation)
    // ─────────────────────────────────────────────────────────────────────
    if (!skipFFprobe) {
      const probeResult = await probeFile(filePath);
      
      if (!probeResult.valid) {
        result.valid = false;
        result.errors.push(probeResult.error);
        return result;
      }
      
      result.metadata = probeResult.metadata;
      result.checks.headerStructure = true;
      
      // ───────────────────────────────────────────────────────────────────
      // Check 4: Audio Stream Presence
      // ───────────────────────────────────────────────────────────────────
      const streamResult = validateAudioStream(probeResult.metadata);
      if (!streamResult.valid) {
        result.valid = false;
        result.errors.push(streamResult.error);
        return result;
      }
      result.checks.audioStream = true;
      
      // ───────────────────────────────────────────────────────────────────
      // Check 5: Metadata Validation
      // ───────────────────────────────────────────────────────────────────
      const metaResult = validateMetadata(probeResult.metadata, strictMode);
      if (!metaResult.valid) {
        result.valid = false;
        result.errors.push(...metaResult.errors);
      }
      if (metaResult.warnings.length > 0) {
        result.warnings.push(...metaResult.warnings);
      }
      result.checks.metadataValid = metaResult.valid;
      
      // ───────────────────────────────────────────────────────────────────
      // Check 6: Frame Integrity (Format-Specific)
      // ───────────────────────────────────────────────────────────────────
      const frameResult = await checkFrameIntegrity(filePath, probeResult.metadata);
      if (!frameResult.valid) {
        result.valid = false;
        result.errors.push(frameResult.error);
      }
      if (frameResult.warnings.length > 0) {
        result.warnings.push(...frameResult.warnings);
      }
      result.checks.frameIntegrity = frameResult.valid;
    }
    
  } catch (error) {
    result.valid = false;
    result.errors.push({
      code: 'VALIDATION_ERROR',
      category: 'INGESTION',
      severity: Severity.CRITICAL,
      description: `Asset validation failed unexpectedly.`,
      recommendation: 'Re-upload the source asset or contact support if the issue persists.',
      details: error.message
    });
  }
  
  return result;
}

// ============================================================================
// Individual Check Functions
// ============================================================================

/**
 * Check file accessibility and basic properties.
 */
async function checkFileAccess(filePath) {
  try {
    await fs.access(filePath, fs.constants.R_OK);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        valid: false,
        error: {
          code: IntegrityErrorCode.FILE_NOT_FOUND,
          category: 'INGESTION',
          severity: Severity.CRITICAL,
          description: 'The source asset could not be located.',
          recommendation: 'Verify the asset was uploaded successfully and re-upload if necessary.'
        }
      };
    }
    return {
      valid: false,
      error: {
        code: IntegrityErrorCode.FILE_NOT_READABLE,
        category: 'INGESTION',
        severity: Severity.CRITICAL,
        description: 'The source asset could not be read.',
        recommendation: 'Re-upload the source asset.'
      }
    };
  }
  
  // Check file size
  const stats = await fs.stat(filePath);
  if (stats.size === 0) {
    return {
      valid: false,
      error: {
        code: IntegrityErrorCode.FILE_EMPTY,
        category: 'INGESTION',
        severity: Severity.CRITICAL,
        description: 'The source asset contains no data.',
        recommendation: 'Re-upload the source asset.'
      }
    };
  }
  
  return { valid: true, size: stats.size };
}

/**
 * Check magic bytes for format detection.
 */
async function checkMagicBytes(filePath) {
  const handle = await fs.open(filePath, 'r');
  try {
    // Read first 16 bytes for magic detection
    const buffer = Buffer.alloc(16);
    await handle.read(buffer, 0, 16, 0);
    
    // Check each format
    for (const [format, spec] of Object.entries(MAGIC_BYTES)) {
      if (matchesMagic(buffer, spec)) {
        return { valid: true, format };
      }
    }
    
    // Check MP3 frame sync (no ID3)
    if (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) {
      return { valid: true, format: 'MP3' };
    }
    
    return {
      valid: false,
      error: {
        code: IntegrityErrorCode.INVALID_MAGIC_BYTES,
        category: 'INGESTION',
        severity: Severity.CRITICAL,
        description: 'The asset format could not be recognized.',
        recommendation: 'Ensure the asset is a valid audio file (WAV, MP3, FLAC, AAC, OGG) and re-upload.'
      }
    };
    
  } finally {
    await handle.close();
  }
}

/**
 * Match buffer against magic byte specification.
 */
function matchesMagic(buffer, spec) {
  // Check primary magic bytes
  for (let i = 0; i < spec.bytes.length; i++) {
    if (buffer[spec.offset + i] !== spec.bytes[i]) {
      // Check alt bytes if available
      if (spec.alt) {
        let altMatch = true;
        for (let j = 0; j < spec.alt.length; j++) {
          const mask = spec.altMask ? spec.altMask[j] : 0xFF;
          if ((buffer[j] & mask) !== (spec.alt[j] & mask)) {
            altMatch = false;
            break;
          }
        }
        if (altMatch) return true;
      }
      return false;
    }
  }
  
  // Check secondary magic bytes if specified
  if (spec.secondary) {
    for (let i = 0; i < spec.secondary.bytes.length; i++) {
      if (buffer[spec.secondary.offset + i] !== spec.secondary.bytes[i]) {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Probe file with FFprobe for detailed analysis.
 */
async function probeFile(filePath) {
  try {
    const args = [
      '-v', 'error',
      '-show_error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath
    ];
    
    const { stdout, stderr } = await execFileAsync(FFPROBE_PATH, args, {
      timeout: 30000,
      maxBuffer: 1024 * 1024
    });
    
    // Check for errors in stderr
    if (stderr && stderr.includes('Invalid data found')) {
      return {
        valid: false,
        error: {
          code: IntegrityErrorCode.CORRUPT_HEADER,
          category: 'INGESTION',
          severity: Severity.CRITICAL,
          description: 'The asset header is corrupted or malformed.',
          recommendation: 'Re-upload the source asset from the original source.',
          details: stderr.trim()
        }
      };
    }
    
    const data = JSON.parse(stdout);
    
    // Check for FFprobe error object
    if (data.error) {
      return {
        valid: false,
        error: {
          code: IntegrityErrorCode.CORRUPT_HEADER,
          category: 'INGESTION',
          severity: Severity.CRITICAL,
          description: 'The asset could not be analyzed.',
          recommendation: 'Re-upload the source asset.',
          details: data.error.string
        }
      };
    }
    
    // Extract audio stream
    const audioStream = data.streams?.find(s => s.codec_type === 'audio');
    const format = data.format || {};
    
    return {
      valid: true,
      metadata: {
        format: format.format_name || 'unknown',
        formatLong: format.format_long_name || 'unknown',
        duration: parseFloat(format.duration) || 0,
        size: parseInt(format.size) || 0,
        bitRate: parseInt(format.bit_rate) || 0,
        codec: audioStream?.codec_name || null,
        codecLong: audioStream?.codec_long_name || null,
        sampleRate: parseInt(audioStream?.sample_rate) || 0,
        channels: parseInt(audioStream?.channels) || 0,
        channelLayout: audioStream?.channel_layout || null,
        bitDepth: audioStream?.bits_per_raw_sample 
          ? parseInt(audioStream.bits_per_raw_sample) 
          : (audioStream?.bits_per_sample ? parseInt(audioStream.bits_per_sample) : null),
        sampleFormat: audioStream?.sample_fmt || null,
        streamCount: data.streams?.length || 0,
        hasAudioStream: !!audioStream
      }
    };
    
  } catch (error) {
    // FFprobe execution error
    if (error.killed) {
      return {
        valid: false,
        error: {
          code: IntegrityErrorCode.CORRUPT_HEADER,
          category: 'INGESTION',
          severity: Severity.CRITICAL,
          description: 'Asset analysis timed out, indicating possible corruption.',
          recommendation: 'Re-upload the source asset.'
        }
      };
    }
    
    // Parse error output for specific issues
    const stderr = error.stderr || '';
    
    if (stderr.includes('Invalid data found when processing input')) {
      return {
        valid: false,
        error: {
          code: IntegrityErrorCode.CORRUPT_HEADER,
          category: 'INGESTION',
          severity: Severity.CRITICAL,
          description: 'The asset contains invalid or corrupted data.',
          recommendation: 'Re-upload the source asset from the original source.'
        }
      };
    }
    
    if (stderr.includes('End of file') || stderr.includes('Truncated')) {
      return {
        valid: false,
        error: {
          code: IntegrityErrorCode.TRUNCATED_FILE,
          category: 'INGESTION',
          severity: Severity.CRITICAL,
          description: 'The asset appears to be incomplete or truncated.',
          recommendation: 'Re-upload the complete source asset.'
        }
      };
    }
    
    return {
      valid: false,
      error: {
        code: IntegrityErrorCode.CORRUPT_HEADER,
        category: 'INGESTION',
        severity: Severity.CRITICAL,
        description: 'The asset could not be analyzed.',
        recommendation: 'Re-upload the source asset.',
        details: stderr || error.message
      }
    };
  }
}

/**
 * Validate audio stream presence and basic properties.
 */
function validateAudioStream(metadata) {
  if (!metadata.hasAudioStream || !metadata.codec) {
    return {
      valid: false,
      error: {
        code: IntegrityErrorCode.MISSING_AUDIO_STREAM,
        category: 'INGESTION',
        severity: Severity.CRITICAL,
        description: 'The asset does not contain an audio stream.',
        recommendation: 'Ensure the uploaded file is an audio asset, not a video or data file.'
      }
    };
  }
  
  return { valid: true };
}

/**
 * Validate metadata values.
 */
function validateMetadata(metadata, strictMode = true) {
  const errors = [];
  const warnings = [];
  
  // Duration check
  if (metadata.duration <= 0) {
    errors.push({
      code: IntegrityErrorCode.ZERO_DURATION,
      category: 'INGESTION',
      severity: Severity.CRITICAL,
      description: 'The asset has zero or negative duration.',
      recommendation: 'Re-upload the source asset.'
    });
  }
  
  // Sample rate check
  if (metadata.sampleRate <= 0) {
    errors.push({
      code: IntegrityErrorCode.INVALID_SAMPLE_RATE,
      category: 'INGESTION',
      severity: Severity.CRITICAL,
      description: 'The asset has an invalid sample rate.',
      recommendation: 'Re-upload the source asset.'
    });
  } else if (strictMode && !VALID_SAMPLE_RATES.includes(metadata.sampleRate)) {
    warnings.push({
      code: 'NONSTANDARD_SAMPLE_RATE',
      severity: Severity.MEDIUM,
      description: `Asset uses non-standard sample rate (${metadata.sampleRate} Hz).`,
      recommendation: 'Processing will continue, but quality may be affected.'
    });
  }
  
  // Channel count check
  if (metadata.channels <= 0) {
    errors.push({
      code: IntegrityErrorCode.INVALID_CHANNEL_COUNT,
      category: 'INGESTION',
      severity: Severity.CRITICAL,
      description: 'The asset has an invalid channel count.',
      recommendation: 'Re-upload the source asset.'
    });
  } else if (metadata.channels > 8) {
    warnings.push({
      code: 'HIGH_CHANNEL_COUNT',
      severity: Severity.MEDIUM,
      description: `Asset has ${metadata.channels} channels. Surround formats may have limited processing support.`,
      recommendation: 'Consider providing a stereo or mono version for full processing capabilities.'
    });
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Check frame integrity using FFprobe frame analysis.
 */
async function checkFrameIntegrity(filePath, metadata) {
  const warnings = [];
  
  try {
    // Use FFprobe to count frames and check for errors
    const args = [
      '-v', 'error',
      '-count_frames',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=nb_read_frames',
      '-print_format', 'json',
      filePath
    ];
    
    const { stdout, stderr } = await execFileAsync(FFPROBE_PATH, args, {
      timeout: 60000,
      maxBuffer: 1024 * 1024 * 5
    });
    
    // Check for frame-level errors
    if (stderr) {
      const errorLines = stderr.split('\n').filter(l => l.trim());
      
      // Count different error types
      let truncatedFrames = 0;
      let invalidFrames = 0;
      
      for (const line of errorLines) {
        if (line.includes('Truncated') || line.includes('truncated')) {
          truncatedFrames++;
        }
        if (line.includes('Invalid') || line.includes('Error')) {
          invalidFrames++;
        }
      }
      
      // Determine severity based on error count
      if (truncatedFrames > 0 || invalidFrames > 10) {
        return {
          valid: false,
          warnings: [],
          error: {
            code: IntegrityErrorCode.INCOMPLETE_FRAMES,
            category: 'INGESTION',
            severity: Severity.CRITICAL,
            description: `The asset contains ${truncatedFrames + invalidFrames} corrupted or incomplete frames.`,
            recommendation: 'Re-upload the source asset from the original source.'
          }
        };
      }
      
      if (invalidFrames > 0) {
        warnings.push({
          code: 'FRAME_ERRORS',
          severity: Severity.MEDIUM,
          description: `The asset contains ${invalidFrames} minor frame errors.`,
          recommendation: 'Processing will continue. Output quality may be slightly affected.'
        });
      }
    }
    
    // Check frame count against expected
    const data = JSON.parse(stdout);
    const frameCount = parseInt(data.streams?.[0]?.nb_read_frames) || 0;
    
    if (frameCount === 0) {
      return {
        valid: false,
        warnings: [],
        error: {
          code: IntegrityErrorCode.INVALID_FRAME_STRUCTURE,
          category: 'INGESTION',
          severity: Severity.CRITICAL,
          description: 'The asset contains no readable audio frames.',
          recommendation: 'Re-upload the source asset.'
        }
      };
    }
    
    return { valid: true, warnings, frameCount };
    
  } catch (error) {
    // Frame checking timeout - likely severe corruption
    if (error.killed) {
      return {
        valid: false,
        warnings: [],
        error: {
          code: IntegrityErrorCode.INVALID_FRAME_STRUCTURE,
          category: 'INGESTION',
          severity: Severity.CRITICAL,
          description: 'Frame analysis timed out, indicating possible severe corruption.',
          recommendation: 'Re-upload the source asset.'
        }
      };
    }
    
    // Non-fatal - treat as warning
    warnings.push({
      code: 'FRAME_CHECK_FAILED',
      severity: Severity.MEDIUM,
      description: 'Frame-level integrity check could not complete.',
      recommendation: 'Processing will continue. Monitor output for issues.'
    });
    
    return { valid: true, warnings };
  }
}

// ============================================================================
// Quick Validation Functions
// ============================================================================

/**
 * Quick validation - magic bytes only.
 * Use for fast rejection during upload.
 * 
 * @param {string} filePath - Path to file
 * @returns {Promise<Object>} - Quick validation result
 */
async function quickValidate(filePath) {
  const accessResult = await checkFileAccess(filePath);
  if (!accessResult.valid) {
    return accessResult;
  }
  
  const magicResult = await checkMagicBytes(filePath);
  return {
    valid: magicResult.valid,
    format: magicResult.format,
    error: magicResult.error
  };
}

/**
 * Validate from buffer (for streaming uploads).
 * 
 * @param {Buffer} buffer - File header buffer (at least 16 bytes)
 * @returns {Object} - Validation result
 */
function validateHeader(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) {
    return {
      valid: false,
      error: {
        code: IntegrityErrorCode.CORRUPT_HEADER,
        category: 'INGESTION',
        severity: Severity.CRITICAL,
        description: 'Insufficient data to validate asset header.',
        recommendation: 'Ensure complete asset upload.'
      }
    };
  }
  
  for (const [format, spec] of Object.entries(MAGIC_BYTES)) {
    if (matchesMagic(buffer, spec)) {
      return { valid: true, format };
    }
  }
  
  // Check MP3 frame sync
  if (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) {
    return { valid: true, format: 'MP3' };
  }
  
  return {
    valid: false,
    error: {
      code: IntegrityErrorCode.INVALID_MAGIC_BYTES,
      category: 'INGESTION',
      severity: Severity.CRITICAL,
      description: 'The asset format could not be recognized.',
      recommendation: 'Ensure the asset is a valid audio file.'
    }
  };
}

// ============================================================================
// Format-Specific Validators
// ============================================================================

/**
 * Validate WAV-specific structure.
 */
async function validateWAVStructure(filePath) {
  const handle = await fs.open(filePath, 'r');
  try {
    const header = Buffer.alloc(44);
    await handle.read(header, 0, 44, 0);
    
    // Check RIFF header
    const riff = header.toString('ascii', 0, 4);
    const wave = header.toString('ascii', 8, 12);
    
    if (riff !== 'RIFF' || wave !== 'WAVE') {
      return {
        valid: false,
        error: {
          code: IntegrityErrorCode.CORRUPT_HEADER,
          category: 'INGESTION',
          severity: Severity.CRITICAL,
          description: 'WAV header structure is invalid.',
          recommendation: 'Re-upload the source asset.'
        }
      };
    }
    
    // Check file size matches RIFF size
    const stats = await fs.stat(filePath);
    const riffSize = header.readUInt32LE(4);
    
    if (riffSize + 8 > stats.size) {
      return {
        valid: false,
        error: {
          code: IntegrityErrorCode.TRUNCATED_FILE,
          category: 'INGESTION',
          severity: Severity.CRITICAL,
          description: 'WAV file is truncated. Expected size does not match actual size.',
          recommendation: 'Re-upload the complete source asset.'
        }
      };
    }
    
    return { valid: true };
    
  } finally {
    await handle.close();
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Main validation
  validateFileIntegrity,
  quickValidate,
  validateHeader,
  
  // Individual checks
  checkFileAccess,
  checkMagicBytes,
  probeFile,
  validateAudioStream,
  validateMetadata,
  checkFrameIntegrity,
  
  // Format-specific
  validateWAVStructure,
  
  // Constants
  IntegrityErrorCode,
  Severity,
  MAGIC_BYTES,
  VALID_SAMPLE_RATES,
  MIN_FILE_SIZES
};
