/**
 * DC Offset Detection & Correction
 * 
 * Detects and optionally removes DC offset from audio assets.
 * DC offset is a constant voltage added to audio that shifts the waveform
 * away from the zero-crossing point, causing:
 * - Reduced headroom
 * - Clicks/pops during editing
 * - Asymmetric clipping
 * - Issues with subsequent DSP processing
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Analysis pipeline should flag
 * problematic assets before transformation.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const crypto = require('crypto');

// ============================================================================
// Configuration
// ============================================================================

const FFMPEG_PATH = 'ffmpeg';
const FFPROBE_PATH = 'ffprobe';

/**
 * DC offset severity thresholds
 * DC offset is measured as a percentage of full scale (normalized -1 to +1)
 */
const THRESHOLDS = {
  // Negligible: < 0.1% - no action needed
  NEGLIGIBLE: 0.001,
  
  // Minor: 0.1% - 0.5% - flag for awareness
  MINOR: 0.005,
  
  // Moderate: 0.5% - 2% - recommend correction
  MODERATE: 0.02,
  
  // Severe: > 2% - strongly recommend correction
  SEVERE: 0.02
};

/**
 * Severity levels for DC offset
 */
const Severity = {
  NONE: 'NONE',
  MINOR: 'MINOR',
  MODERATE: 'MODERATE',
  SEVERE: 'SEVERE'
};

/**
 * Temp directory for corrected files
 */
const TEMP_DIR = process.env.DC_OFFSET_TEMP_DIR || path.join(os.tmpdir(), 'midnight-dc-offset');

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

// ============================================================================
// DC Offset Detection
// ============================================================================

/**
 * Detect DC offset in an audio file using FFmpeg's astats filter.
 * 
 * @param {string} filePath - Path to audio file
 * @returns {Promise<DCOffsetResult>}
 * 
 * @typedef {Object} DCOffsetResult
 * @property {boolean} hasOffset - Whether significant DC offset exists
 * @property {string} severity - Severity level (NONE, MINOR, MODERATE, SEVERE)
 * @property {number} overallOffset - Combined DC offset value (normalized)
 * @property {Object} channels - Per-channel DC offset values
 * @property {number} channels.left - Left channel DC offset
 * @property {number} channels.right - Right channel DC offset (if stereo)
 * @property {string} recommendation - Action recommendation
 * @property {number} analysisTimeMs - Time taken to analyze
 */
async function detectDCOffset(filePath) {
  const startTime = Date.now();
  
  // Use astats filter to get DC offset per channel
  const args = [
    '-i', filePath,
    '-af', 'astats=metadata=1:reset=1:measure_perchannel=DC_offset+Mean_difference',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse DC offset values from astats output
    // Format: [Parsed_astats_0 @ ...] Channel: 1\n ... DC offset: 0.000123
    const dcOffsets = parseDCOffsets(stderr);
    
    // Calculate overall offset (max of all channels)
    const overallOffset = Math.max(...Object.values(dcOffsets).map(Math.abs));
    
    // Determine severity
    const severity = classifySeverity(overallOffset);
    const hasOffset = severity !== Severity.NONE;
    
    // Generate recommendation
    const recommendation = getRecommendation(severity, overallOffset);
    
    return {
      hasOffset,
      severity,
      overallOffset,
      overallOffsetPercent: (overallOffset * 100).toFixed(4) + '%',
      channels: dcOffsets,
      recommendation,
      analysisTimeMs: Date.now() - startTime
    };
  } catch (error) {
    console.error('[DCOffsetDetector] Detection failed:', error.message);
    return {
      hasOffset: false,
      severity: Severity.NONE,
      overallOffset: null,
      channels: {},
      recommendation: 'Analysis failed - unable to determine DC offset',
      error: error.message,
      analysisTimeMs: Date.now() - startTime
    };
  }
}

/**
 * Parse DC offset values from astats output
 * @param {string} output - FFmpeg stderr output
 * @returns {Object} - Channel DC offset values
 */
function parseDCOffsets(output) {
  const offsets = {};
  
  // Match DC offset lines: "DC offset: -0.000123" or similar
  // astats outputs per-channel stats
  const dcMatches = output.matchAll(/DC offset:\s*([-\d.e]+)/gi);
  
  let channelIndex = 0;
  for (const match of dcMatches) {
    const value = parseFloat(match[1]);
    if (!isNaN(value)) {
      const channelName = channelIndex === 0 ? 'left' : 
                          channelIndex === 1 ? 'right' : 
                          `channel${channelIndex + 1}`;
      offsets[channelName] = value;
      channelIndex++;
    }
  }
  
  // Fallback: try to parse from Mean_difference if DC offset not found
  if (Object.keys(offsets).length === 0) {
    const meanMatches = output.matchAll(/Mean difference:\s*([-\d.e]+)/gi);
    channelIndex = 0;
    for (const match of meanMatches) {
      const value = parseFloat(match[1]);
      if (!isNaN(value)) {
        const channelName = channelIndex === 0 ? 'left' : 
                            channelIndex === 1 ? 'right' : 
                            `channel${channelIndex + 1}`;
        offsets[channelName] = value;
        channelIndex++;
      }
    }
  }
  
  return offsets;
}

/**
 * Classify DC offset severity
 * @param {number} offset - Absolute DC offset value (normalized)
 * @returns {string} - Severity level
 */
function classifySeverity(offset) {
  if (offset === null || offset === undefined) {
    return Severity.NONE;
  }
  
  const absOffset = Math.abs(offset);
  
  if (absOffset < THRESHOLDS.NEGLIGIBLE) {
    return Severity.NONE;
  } else if (absOffset < THRESHOLDS.MINOR) {
    return Severity.MINOR;
  } else if (absOffset < THRESHOLDS.MODERATE) {
    return Severity.MODERATE;
  } else {
    return Severity.SEVERE;
  }
}

/**
 * Get recommendation based on severity
 * @param {string} severity - Severity level
 * @param {number} offset - DC offset value
 * @returns {string} - Recommendation text
 */
function getRecommendation(severity, offset) {
  switch (severity) {
    case Severity.NONE:
      return 'No DC offset correction needed';
    case Severity.MINOR:
      return 'Minor DC offset detected - correction optional';
    case Severity.MODERATE:
      return 'Moderate DC offset detected - correction recommended before processing';
    case Severity.SEVERE:
      return 'Severe DC offset detected - correction strongly recommended';
    default:
      return 'Unable to determine DC offset status';
  }
}

// ============================================================================
// DC Offset Correction
// ============================================================================

/**
 * Remove DC offset from an audio file.
 * Creates a temporary corrected file.
 * 
 * @param {string} inputPath - Path to input audio file
 * @param {Object} options - Correction options
 * @param {string} options.outputPath - Custom output path (optional)
 * @param {boolean} options.preserveFormat - Keep original format (default: true)
 * @returns {Promise<CorrectionResult>}
 * 
 * @typedef {Object} CorrectionResult
 * @property {boolean} success - Whether correction succeeded
 * @property {string} correctedPath - Path to corrected file
 * @property {boolean} isTemporary - Whether output is a temp file
 * @property {Object} before - DC offset before correction
 * @property {Object} after - DC offset after correction
 * @property {number} processingTimeMs - Time taken to correct
 */
async function correctDCOffset(inputPath, options = {}) {
  const startTime = Date.now();
  const { outputPath, preserveFormat = true } = options;
  
  // Determine output path
  let correctedPath;
  let isTemporary = false;
  
  if (outputPath) {
    correctedPath = outputPath;
  } else {
    // Create temp file
    await fs.mkdir(TEMP_DIR, { recursive: true });
    const hash = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(inputPath);
    const baseName = path.basename(inputPath, ext);
    correctedPath = path.join(TEMP_DIR, `${baseName}_dc_removed_${hash}${ext}`);
    isTemporary = true;
  }
  
  // Measure before correction
  const before = await detectDCOffset(inputPath);
  
  // Apply DC offset removal using highpass filter at very low frequency
  // A highpass at 1-5 Hz removes DC offset while preserving audio
  const args = [
    '-y',
    '-i', inputPath,
    '-af', 'highpass=f=5,lowpass=f=20000', // Remove DC, preserve audio up to 20kHz
    '-c:a', preserveFormat ? 'copy' : 'pcm_s24le'
  ];
  
  // For lossless removal, we need to decode and re-encode
  // The 'highpass' filter requires decoded audio
  const losslessArgs = [
    '-y',
    '-i', inputPath,
    '-af', 'dcshift=0,highpass=f=3', // dcshift centers, highpass removes remaining DC
    '-ar', '48000',
    '-c:a', 'pcm_s24le',
    correctedPath
  ];
  
  try {
    await execCommand(FFMPEG_PATH, losslessArgs);
    
    // Measure after correction
    const after = await detectDCOffset(correctedPath);
    
    return {
      success: true,
      correctedPath,
      isTemporary,
      before: {
        overallOffset: before.overallOffset,
        severity: before.severity,
        channels: before.channels
      },
      after: {
        overallOffset: after.overallOffset,
        severity: after.severity,
        channels: after.channels
      },
      improvement: before.overallOffset !== null && after.overallOffset !== null
        ? ((before.overallOffset - after.overallOffset) / before.overallOffset * 100).toFixed(2) + '%'
        : 'N/A',
      processingTimeMs: Date.now() - startTime
    };
  } catch (error) {
    console.error('[DCOffsetDetector] Correction failed:', error.message);
    return {
      success: false,
      correctedPath: null,
      isTemporary: false,
      error: error.message,
      processingTimeMs: Date.now() - startTime
    };
  }
}

/**
 * Detect and optionally correct DC offset in one operation.
 * Only corrects if offset exceeds threshold.
 * 
 * @param {string} filePath - Path to audio file
 * @param {Object} options - Options
 * @param {boolean} options.autoCorrect - Automatically correct if needed (default: false)
 * @param {string} options.minSeverity - Minimum severity to trigger correction (default: 'MODERATE')
 * @returns {Promise<{detection: DCOffsetResult, correction?: CorrectionResult}>}
 */
async function detectAndCorrect(filePath, options = {}) {
  const { autoCorrect = false, minSeverity = Severity.MODERATE } = options;
  
  // First, detect
  const detection = await detectDCOffset(filePath);
  
  // Check if correction is needed
  const severityOrder = [Severity.NONE, Severity.MINOR, Severity.MODERATE, Severity.SEVERE];
  const detectedLevel = severityOrder.indexOf(detection.severity);
  const minLevel = severityOrder.indexOf(minSeverity);
  
  const needsCorrection = autoCorrect && detectedLevel >= minLevel;
  
  if (needsCorrection) {
    const correction = await correctDCOffset(filePath, options);
    return {
      detection,
      correction,
      correctedPath: correction.success ? correction.correctedPath : null
    };
  }
  
  return {
    detection,
    correction: null,
    correctedPath: null
  };
}

/**
 * Apply DC offset correction as a pre-processing step.
 * Returns the path to use for further processing.
 * 
 * @param {string} filePath - Original file path
 * @param {Function} processingFn - Async function to run on corrected file
 * @param {Object} options - Options
 * @returns {Promise<{result: any, dcOffset: DCOffsetResult}>}
 */
async function withDCCorrection(filePath, processingFn, options = {}) {
  const { minSeverity = Severity.MODERATE } = options;
  
  const { detection, correctedPath } = await detectAndCorrect(filePath, {
    autoCorrect: true,
    minSeverity,
    ...options
  });
  
  const pathToUse = correctedPath || filePath;
  
  try {
    const result = await processingFn(pathToUse);
    return {
      result,
      dcOffset: detection,
      wasCorrected: correctedPath !== null
    };
  } finally {
    // Cleanup temp file if we created one
    if (correctedPath && correctedPath.startsWith(TEMP_DIR)) {
      try {
        await fs.unlink(correctedPath);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }
}

// ============================================================================
// Cleanup Functions
// ============================================================================

/**
 * Clean up a temporary corrected file
 * @param {string} tempPath - Path to temp file
 * @returns {Promise<boolean>}
 */
async function cleanupTempFile(tempPath) {
  if (!tempPath.startsWith(TEMP_DIR)) {
    console.warn('[DCOffsetDetector] Refusing to delete file outside temp dir:', tempPath);
    return false;
  }
  
  try {
    await fs.unlink(tempPath);
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('[DCOffsetDetector] Failed to cleanup temp file:', tempPath);
    }
    return false;
  }
}

/**
 * Clean up old temporary files
 * @param {number} maxAgeMs - Maximum age in milliseconds (default: 1 hour)
 * @returns {Promise<{removed: number, errors: number}>}
 */
async function cleanupOldTempFiles(maxAgeMs = 3600000) {
  let removed = 0;
  let errors = 0;
  
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
    const files = await fs.readdir(TEMP_DIR);
    const now = Date.now();
    
    for (const file of files) {
      if (!file.includes('_dc_removed_')) continue;
      
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
    console.warn('[DCOffsetDetector] Failed to cleanup old temp files:', error.message);
  }
  
  return { removed, errors };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if DC offset needs correction based on severity
 * @param {string} severity - Severity level
 * @param {string} minSeverity - Minimum severity threshold (default: MODERATE)
 * @returns {boolean}
 */
function needsCorrection(severity, minSeverity = Severity.MODERATE) {
  const severityOrder = [Severity.NONE, Severity.MINOR, Severity.MODERATE, Severity.SEVERE];
  return severityOrder.indexOf(severity) >= severityOrder.indexOf(minSeverity);
}

/**
 * Get human-readable description of DC offset
 * @param {number} offset - DC offset value (normalized)
 * @returns {string}
 */
function getOffsetDescription(offset) {
  if (offset === null || offset === undefined) {
    return 'Unknown';
  }
  
  const percent = Math.abs(offset) * 100;
  
  if (percent < 0.1) {
    return `Negligible (${percent.toFixed(4)}%)`;
  } else if (percent < 0.5) {
    return `Minor (${percent.toFixed(3)}%)`;
  } else if (percent < 2) {
    return `Moderate (${percent.toFixed(2)}%)`;
  } else {
    return `Severe (${percent.toFixed(2)}%)`;
  }
}

/**
 * Get the temp directory path
 * @returns {string}
 */
function getTempDir() {
  return TEMP_DIR;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Detection
  detectDCOffset,
  
  // Correction
  correctDCOffset,
  detectAndCorrect,
  withDCCorrection,
  
  // Cleanup
  cleanupTempFile,
  cleanupOldTempFiles,
  
  // Utilities
  needsCorrection,
  getOffsetDescription,
  classifySeverity,
  getRecommendation,
  getTempDir,
  
  // Internal (for testing)
  parseDCOffsets,
  
  // Constants
  Severity,
  THRESHOLDS
};
