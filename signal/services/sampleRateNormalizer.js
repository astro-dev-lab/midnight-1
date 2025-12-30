/**
 * Sample-Rate / Bit-Depth Normalizer (Pre-Analysis)
 * 
 * Temporary internal normalization to avoid analysis skew.
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - assets with varying sample rates/bit depths
 * are normalized to a standard format before analysis to ensure consistent measurements.
 * 
 * This module:
 * - Detects if normalization is needed based on input format
 * - Creates temporary normalized files for internal analysis use only
 * - Automatically cleans up temporary files after analysis
 * - Does NOT modify the original asset
 * 
 * Standard Analysis Format:
 * - Sample Rate: 48000 Hz
 * - Bit Depth: 24-bit (PCM signed little-endian)
 * - Format: WAV (for consistent FFmpeg filter behavior)
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const os = require('os');

// ============================================================================
// Configuration
// ============================================================================

const FFMPEG_PATH = 'ffmpeg';
const FFPROBE_PATH = 'ffprobe';

/**
 * Standard format for analysis - ensures consistent measurements
 */
const ANALYSIS_STANDARD = {
  sampleRate: 48000,
  bitDepth: 24,
  codec: 'pcm_s24le',
  format: 'wav'
};

/**
 * Sample rates that don't require resampling (close enough to standard)
 * Analysis accuracy is maintained for these rates.
 */
const ACCEPTABLE_SAMPLE_RATES = [44100, 48000, 88200, 96000];

/**
 * Bit depths that don't require conversion
 */
const ACCEPTABLE_BIT_DEPTHS = [16, 24, 32];

/**
 * Temp directory for normalized files
 */
const TEMP_DIR = process.env.NORMALIZER_TEMP_DIR || path.join(os.tmpdir(), 'midnight-analysis');

// ============================================================================
// Normalization Decision Logic
// ============================================================================

/**
 * Check if an asset needs pre-analysis normalization.
 * 
 * @param {Object} audioInfo - Audio metadata from ffprobe
 * @param {number} audioInfo.sampleRate - Sample rate in Hz
 * @param {number|null} audioInfo.bitDepth - Bit depth (may be null for compressed formats)
 * @param {string} audioInfo.codec - Codec name (e.g., 'pcm_s16le', 'mp3', 'flac')
 * @returns {{needsNormalization: boolean, reasons: string[]}}
 */
function needsNormalization(audioInfo) {
  const reasons = [];
  
  // Check sample rate
  if (!ACCEPTABLE_SAMPLE_RATES.includes(audioInfo.sampleRate)) {
    reasons.push(`non-standard sample rate (${audioInfo.sampleRate} Hz)`);
  }
  
  // Check bit depth (only for PCM formats)
  if (audioInfo.bitDepth !== null && !ACCEPTABLE_BIT_DEPTHS.includes(audioInfo.bitDepth)) {
    reasons.push(`non-standard bit depth (${audioInfo.bitDepth}-bit)`);
  }
  
  // Compressed formats should be decoded for consistent analysis
  const compressedCodecs = ['mp3', 'aac', 'vorbis', 'opus'];
  if (compressedCodecs.includes(audioInfo.codec?.toLowerCase())) {
    reasons.push(`compressed format (${audioInfo.codec}) requires decoding`);
  }
  
  // Very high sample rates should be downsampled for performance
  if (audioInfo.sampleRate > 96000) {
    reasons.push(`high sample rate (${audioInfo.sampleRate} Hz) impacts analysis performance`);
  }
  
  // DSD and other exotic formats
  if (audioInfo.codec?.toLowerCase().startsWith('dsd')) {
    reasons.push(`DSD format requires conversion`);
  }
  
  return {
    needsNormalization: reasons.length > 0,
    reasons
  };
}

// ============================================================================
// FFmpeg Execution
// ============================================================================

/**
 * Execute a command and return stdout/stderr
 */
function execCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, options);
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} exited with code ${code}: ${stderr}`));
      }
    });
    
    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ${command}: ${err.message}`));
    });
  });
}

/**
 * Get audio info using ffprobe
 */
async function getAudioInfo(filePath) {
  const args = [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath
  ];
  
  const { stdout } = await execCommand(FFPROBE_PATH, args);
  const data = JSON.parse(stdout);
  
  const audioStream = data.streams?.find(s => s.codec_type === 'audio') || {};
  
  return {
    sampleRate: parseInt(audioStream.sample_rate) || 0,
    bitDepth: audioStream.bits_per_raw_sample ? parseInt(audioStream.bits_per_raw_sample) : null,
    codec: audioStream.codec_name || 'unknown',
    channels: audioStream.channels || 0,
    duration: parseFloat(data.format?.duration) || 0
  };
}

// ============================================================================
// Temp File Management
// ============================================================================

/**
 * Generate a unique temp file path
 */
function generateTempPath(originalPath) {
  const hash = crypto.randomBytes(8).toString('hex');
  const ext = '.wav';
  const baseName = path.basename(originalPath, path.extname(originalPath));
  return path.join(TEMP_DIR, `${baseName}_normalized_${hash}${ext}`);
}

/**
 * Ensure temp directory exists
 */
async function ensureTempDir() {
  await fs.mkdir(TEMP_DIR, { recursive: true });
}

/**
 * Clean up a temporary normalized file
 * 
 * @param {string} tempPath - Path to temp file to remove
 * @returns {Promise<boolean>} - True if file was removed
 */
async function cleanupTempFile(tempPath) {
  // Safety check: only remove files from our temp directory
  if (!tempPath.startsWith(TEMP_DIR)) {
    console.warn(`[SampleRateNormalizer] Refusing to delete file outside temp dir: ${tempPath}`);
    return false;
  }
  
  try {
    await fs.unlink(tempPath);
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`[SampleRateNormalizer] Failed to cleanup temp file: ${tempPath}`, error.message);
    }
    return false;
  }
}

/**
 * Clean up all old temp files (files older than maxAge)
 * 
 * @param {number} maxAgeMs - Maximum age in milliseconds (default: 1 hour)
 * @returns {Promise<{removed: number, errors: number}>}
 */
async function cleanupOldTempFiles(maxAgeMs = 3600000) {
  let removed = 0;
  let errors = 0;
  
  try {
    await ensureTempDir();
    const files = await fs.readdir(TEMP_DIR);
    const now = Date.now();
    
    for (const file of files) {
      if (!file.includes('_normalized_')) continue;
      
      const filePath = path.join(TEMP_DIR, file);
      try {
        const stats = await fs.stat(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          await fs.unlink(filePath);
          removed++;
        }
      } catch (error) {
        if (error.code !== 'ENOENT') {
          errors++;
        }
      }
    }
  } catch (error) {
    console.warn('[SampleRateNormalizer] Failed to cleanup old temp files:', error.message);
  }
  
  return { removed, errors };
}

// ============================================================================
// Normalization Functions
// ============================================================================

/**
 * Normalize an audio file to the analysis standard format.
 * Creates a temporary file that should be cleaned up after analysis.
 * 
 * @param {string} inputPath - Path to original audio file
 * @param {Object} options - Normalization options
 * @param {number} options.targetSampleRate - Target sample rate (default: 48000)
 * @param {number} options.targetBitDepth - Target bit depth (default: 24)
 * @param {boolean} options.preserveChannels - Keep original channel count (default: true)
 * @returns {Promise<NormalizationResult>}
 * 
 * @typedef {Object} NormalizationResult
 * @property {boolean} success - Whether normalization succeeded
 * @property {string} normalizedPath - Path to normalized temp file
 * @property {boolean} wasNormalized - True if conversion was performed
 * @property {Object} originalInfo - Original audio info
 * @property {Object} normalizedInfo - Normalized audio info (if applicable)
 * @property {string[]} changes - List of changes made
 * @property {number} processingTimeMs - Time taken to normalize
 */
async function normalize(inputPath, options = {}) {
  const {
    targetSampleRate = ANALYSIS_STANDARD.sampleRate,
    targetBitDepth = ANALYSIS_STANDARD.bitDepth,
    preserveChannels = true
  } = options;
  
  const startTime = Date.now();
  
  // Get input file info
  const originalInfo = await getAudioInfo(inputPath);
  
  // Check if normalization is needed
  const { needsNormalization: shouldNormalize, reasons } = needsNormalization(originalInfo);
  
  if (!shouldNormalize) {
    return {
      success: true,
      normalizedPath: inputPath, // Use original file
      wasNormalized: false,
      originalInfo,
      normalizedInfo: null,
      changes: [],
      processingTimeMs: Date.now() - startTime
    };
  }
  
  // Ensure temp directory exists
  await ensureTempDir();
  
  // Generate temp file path
  const tempPath = generateTempPath(inputPath);
  
  // Build FFmpeg args
  const codecArg = targetBitDepth === 16 ? 'pcm_s16le' : 
                   targetBitDepth === 32 ? 'pcm_s32le' : 'pcm_s24le';
  
  const args = [
    '-y',
    '-i', inputPath,
    '-ar', String(targetSampleRate),
    '-c:a', codecArg
  ];
  
  // Add channel handling
  if (!preserveChannels) {
    args.push('-ac', '2'); // Force stereo
  }
  
  // Output format
  args.push('-f', 'wav', tempPath);
  
  try {
    await execCommand(FFMPEG_PATH, args);
  } catch (error) {
    throw new Error(`Normalization failed: ${error.message}`);
  }
  
  // Get normalized file info
  const normalizedInfo = await getAudioInfo(tempPath);
  
  // Build changes list
  const changes = [];
  if (originalInfo.sampleRate !== normalizedInfo.sampleRate) {
    changes.push(`sample rate: ${originalInfo.sampleRate} Hz → ${normalizedInfo.sampleRate} Hz`);
  }
  if (originalInfo.bitDepth !== targetBitDepth) {
    changes.push(`bit depth: ${originalInfo.bitDepth || 'compressed'} → ${targetBitDepth}-bit`);
  }
  if (originalInfo.codec !== 'pcm_s24le' && originalInfo.codec !== 'pcm_s16le') {
    changes.push(`codec: ${originalInfo.codec} → PCM`);
  }
  
  return {
    success: true,
    normalizedPath: tempPath,
    wasNormalized: true,
    originalInfo,
    normalizedInfo,
    changes,
    processingTimeMs: Date.now() - startTime
  };
}

/**
 * Normalize for analysis and automatically cleanup after callback completes.
 * This is the recommended way to use the normalizer with analysis functions.
 * 
 * @param {string} inputPath - Path to original audio file
 * @param {Function} analysisFn - Async function that receives the normalized path
 * @param {Object} options - Normalization options
 * @returns {Promise<{analysisResult: any, normalization: NormalizationResult}>}
 * 
 * @example
 * const { analysisResult, normalization } = await withNormalization(
 *   '/path/to/audio.mp3',
 *   async (normalizedPath) => {
 *     return await audioProcessor.analyzeAudio(normalizedPath);
 *   }
 * );
 */
async function withNormalization(inputPath, analysisFn, options = {}) {
  const normalization = await normalize(inputPath, options);
  
  try {
    const analysisResult = await analysisFn(normalization.normalizedPath);
    
    return {
      analysisResult,
      normalization
    };
  } finally {
    // Always cleanup temp file if we created one
    if (normalization.wasNormalized) {
      await cleanupTempFile(normalization.normalizedPath);
    }
  }
}

/**
 * Batch normalize multiple files.
 * Returns array of normalization results with cleanup function.
 * 
 * @param {string[]} inputPaths - Array of file paths
 * @param {Object} options - Normalization options
 * @returns {Promise<{results: NormalizationResult[], cleanup: Function}>}
 */
async function batchNormalize(inputPaths, options = {}) {
  const results = await Promise.all(
    inputPaths.map(p => normalize(p, options))
  );
  
  const cleanup = async () => {
    for (const result of results) {
      if (result.wasNormalized) {
        await cleanupTempFile(result.normalizedPath);
      }
    }
  };
  
  return { results, cleanup };
}

// ============================================================================
// Configuration Accessors
// ============================================================================

/**
 * Get the current analysis standard configuration.
 */
function getAnalysisStandard() {
  return { ...ANALYSIS_STANDARD };
}

/**
 * Get the acceptable sample rates.
 */
function getAcceptableSampleRates() {
  return [...ACCEPTABLE_SAMPLE_RATES];
}

/**
 * Get the acceptable bit depths.
 */
function getAcceptableBitDepths() {
  return [...ACCEPTABLE_BIT_DEPTHS];
}

/**
 * Get the temp directory path.
 */
function getTempDir() {
  return TEMP_DIR;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Core functions
  normalize,
  withNormalization,
  batchNormalize,
  
  // Decision logic
  needsNormalization,
  
  // Cleanup
  cleanupTempFile,
  cleanupOldTempFiles,
  
  // Info
  getAudioInfo,
  
  // Configuration
  getAnalysisStandard,
  getAcceptableSampleRates,
  getAcceptableBitDepths,
  getTempDir,
  
  // Constants (for testing)
  ANALYSIS_STANDARD,
  ACCEPTABLE_SAMPLE_RATES,
  ACCEPTABLE_BIT_DEPTHS
};
