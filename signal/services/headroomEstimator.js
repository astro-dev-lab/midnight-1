/**
 * Headroom Estimator
 * 
 * Pre-transform headroom margin calculation for audio assets.
 * Calculates available headroom before clipping to inform transformation
 * parameters and prevent over-processing.
 * 
 * Headroom is the difference between the current peak level and 0 dBFS
 * (digital full scale). This information is critical for:
 * - Loudness normalization (knowing how much gain can be applied)
 * - Mastering (preventing clipping during processing)
 * - Compression/limiting decisions
 * - Quality assurance (detecting already-clipped assets)
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Analysis should provide actionable
 * metrics for transformation parameter selection.
 */

const { spawn } = require('child_process');

// ============================================================================
// Configuration
// ============================================================================

const FFMPEG_PATH = 'ffmpeg';
const FFPROBE_PATH = 'ffprobe';

/**
 * Headroom status classifications
 */
const HeadroomStatus = {
  CLIPPED: 'CLIPPED',           // Peak >= 0 dBFS (likely clipping)
  CRITICAL: 'CRITICAL',         // < 0.5 dB headroom
  LIMITED: 'LIMITED',           // 0.5 - 3 dB headroom
  ADEQUATE: 'ADEQUATE',         // 3 - 6 dB headroom
  GENEROUS: 'GENEROUS',         // 6 - 12 dB headroom
  EXCESSIVE: 'EXCESSIVE'        // > 12 dB headroom (may be too quiet)
};

/**
 * Headroom thresholds (in dB)
 */
const THRESHOLDS = {
  CLIPPED: 0,
  CRITICAL: 0.5,
  LIMITED: 3,
  ADEQUATE: 6,
  GENEROUS: 12
};

/**
 * Target headroom recommendations for different use cases
 */
const TARGETS = {
  MASTERING: -1.0,        // True peak ceiling for mastering
  STREAMING: -1.0,        // Streaming platforms (Spotify, Apple Music)
  BROADCAST: -2.0,        // Broadcast standards (EBU R128)
  VINYL: -3.0,            // Vinyl cutting (needs more headroom)
  MIXING: -6.0,           // Safe mixing headroom
  RECORDING: -12.0        // Safe recording headroom
};

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
// Peak Analysis Functions
// ============================================================================

/**
 * Get sample peak level using astats
 * @param {string} filePath - Path to audio file
 * @returns {Promise<{peakDb: number, peakLinear: number}>}
 */
async function getSamplePeak(filePath) {
  const args = [
    '-i', filePath,
    '-af', 'astats=metadata=1:reset=1:measure_overall=Peak_level+RMS_level',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse peak levels per channel and overall
    const peakMatches = stderr.matchAll(/Peak level dB:\s*([-\d.]+)/g);
    const peaks = [];
    
    for (const match of peakMatches) {
      const value = parseFloat(match[1]);
      if (!isNaN(value) && isFinite(value)) {
        peaks.push(value);
      }
    }
    
    // Get the maximum peak across all channels
    const maxPeakDb = peaks.length > 0 ? Math.max(...peaks) : null;
    
    return {
      peakDb: maxPeakDb,
      peakLinear: maxPeakDb !== null ? Math.pow(10, maxPeakDb / 20) : null,
      perChannel: peaks
    };
  } catch (error) {
    console.error('[HeadroomEstimator] Sample peak analysis failed:', error.message);
    return {
      peakDb: null,
      peakLinear: null,
      perChannel: [],
      error: error.message
    };
  }
}

/**
 * Get true peak level using EBU R128 loudnorm filter
 * True peak accounts for inter-sample peaks that can cause clipping
 * in D/A conversion.
 * 
 * @param {string} filePath - Path to audio file
 * @returns {Promise<{truePeakDb: number, truePeakLinear: number}>}
 */
async function getTruePeak(filePath) {
  const args = [
    '-i', filePath,
    '-af', 'loudnorm=print_format=json',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse true peak from loudnorm output
    const jsonMatch = stderr.match(/\{[\s\S]*?"input_tp"[\s\S]*?\}/);
    
    if (jsonMatch) {
      const metrics = JSON.parse(jsonMatch[0]);
      const truePeakDb = parseFloat(metrics.input_tp);
      
      return {
        truePeakDb: isNaN(truePeakDb) ? null : truePeakDb,
        truePeakLinear: isNaN(truePeakDb) ? null : Math.pow(10, truePeakDb / 20)
      };
    }
    
    return {
      truePeakDb: null,
      truePeakLinear: null,
      warning: 'Could not parse true peak from loudnorm output'
    };
  } catch (error) {
    console.error('[HeadroomEstimator] True peak analysis failed:', error.message);
    return {
      truePeakDb: null,
      truePeakLinear: null,
      error: error.message
    };
  }
}

/**
 * Get RMS level for average loudness estimation
 * @param {string} filePath - Path to audio file
 * @returns {Promise<{rmsDb: number}>}
 */
async function getRmsLevel(filePath) {
  const args = [
    '-i', filePath,
    '-af', 'astats=metadata=1:reset=1',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse RMS levels
    const rmsMatches = stderr.matchAll(/RMS level dB:\s*([-\d.]+)/g);
    const rmsLevels = [];
    
    for (const match of rmsMatches) {
      const value = parseFloat(match[1]);
      if (!isNaN(value) && isFinite(value)) {
        rmsLevels.push(value);
      }
    }
    
    // Average RMS across channels
    const avgRmsDb = rmsLevels.length > 0 
      ? rmsLevels.reduce((a, b) => a + b, 0) / rmsLevels.length 
      : null;
    
    return {
      rmsDb: avgRmsDb,
      perChannel: rmsLevels
    };
  } catch (error) {
    console.error('[HeadroomEstimator] RMS analysis failed:', error.message);
    return {
      rmsDb: null,
      perChannel: [],
      error: error.message
    };
  }
}

// ============================================================================
// Headroom Calculation
// ============================================================================

/**
 * Calculate headroom from peak level
 * @param {number} peakDb - Peak level in dB
 * @returns {number} - Headroom in dB (positive = available, negative = clipped)
 */
function calculateHeadroom(peakDb) {
  if (peakDb === null || peakDb === undefined || !isFinite(peakDb)) {
    return null;
  }
  // Headroom is the distance from peak to 0 dBFS
  return -peakDb;
}

/**
 * Classify headroom status
 * @param {number} headroomDb - Headroom in dB
 * @returns {string} - HeadroomStatus value
 */
function classifyHeadroom(headroomDb) {
  if (headroomDb === null || headroomDb === undefined) {
    return HeadroomStatus.ADEQUATE; // Default assumption
  }
  
  if (headroomDb <= THRESHOLDS.CLIPPED) {
    return HeadroomStatus.CLIPPED;
  } else if (headroomDb < THRESHOLDS.CRITICAL) {
    return HeadroomStatus.CRITICAL;
  } else if (headroomDb < THRESHOLDS.LIMITED) {
    return HeadroomStatus.LIMITED;
  } else if (headroomDb < THRESHOLDS.ADEQUATE) {
    return HeadroomStatus.ADEQUATE;
  } else if (headroomDb < THRESHOLDS.GENEROUS) {
    return HeadroomStatus.GENEROUS;
  } else {
    return HeadroomStatus.EXCESSIVE;
  }
}

/**
 * Calculate maximum safe gain that can be applied
 * @param {number} truePeakDb - True peak level in dB
 * @param {number} targetCeiling - Target ceiling in dB (default: -1.0 for streaming)
 * @returns {number} - Maximum gain in dB
 */
function calculateMaxGain(truePeakDb, targetCeiling = TARGETS.STREAMING) {
  if (truePeakDb === null || truePeakDb === undefined) {
    return null;
  }
  // Max gain = target ceiling - current true peak
  return targetCeiling - truePeakDb;
}

/**
 * Calculate crest factor (peak to RMS ratio)
 * High crest factor = dynamic, low = compressed
 * @param {number} peakDb - Peak level in dB
 * @param {number} rmsDb - RMS level in dB
 * @returns {number} - Crest factor in dB
 */
function calculateCrestFactor(peakDb, rmsDb) {
  if (peakDb === null || rmsDb === null) {
    return null;
  }
  return peakDb - rmsDb;
}

/**
 * Get recommendation based on headroom analysis
 * @param {Object} analysis - Headroom analysis results
 * @returns {string} - Recommendation text
 */
function getRecommendation(analysis) {
  const { status, headroomDb, maxGainForStreaming } = analysis;
  
  switch (status) {
    case HeadroomStatus.CLIPPED:
      return 'Asset appears to be clipping. Consider using a source with more headroom.';
    
    case HeadroomStatus.CRITICAL:
      return `Only ${headroomDb?.toFixed(1)} dB headroom available. Apply limiting carefully to avoid clipping.`;
    
    case HeadroomStatus.LIMITED:
      return `Limited headroom (${headroomDb?.toFixed(1)} dB). Loudness normalization may require limiting.`;
    
    case HeadroomStatus.ADEQUATE:
      return `Adequate headroom (${headroomDb?.toFixed(1)} dB). Safe for most transformations.`;
    
    case HeadroomStatus.GENEROUS:
      return `Generous headroom (${headroomDb?.toFixed(1)} dB). Up to ${maxGainForStreaming?.toFixed(1)} dB gain available for streaming targets.`;
    
    case HeadroomStatus.EXCESSIVE:
      return `Excessive headroom (${headroomDb?.toFixed(1)} dB). Asset may be too quiet - consider normalizing.`;
    
    default:
      return 'Unable to determine headroom status.';
  }
}

// ============================================================================
// Main Estimation Function
// ============================================================================

/**
 * Estimate headroom for an audio file.
 * 
 * @param {string} filePath - Path to audio file
 * @param {Object} options - Estimation options
 * @param {boolean} options.includeTruePeak - Include true peak analysis (slower, default: true)
 * @param {boolean} options.includeRms - Include RMS analysis (default: true)
 * @returns {Promise<HeadroomResult>}
 * 
 * @typedef {Object} HeadroomResult
 * @property {number} headroomDb - Available headroom in dB (from true peak if available)
 * @property {string} status - HeadroomStatus classification
 * @property {number} samplePeakDb - Sample peak level in dB
 * @property {number} truePeakDb - True peak level in dB
 * @property {number} rmsDb - RMS level in dB
 * @property {number} crestFactor - Peak to RMS ratio in dB
 * @property {number} maxGainForStreaming - Max gain before hitting -1 dBTP
 * @property {number} maxGainForBroadcast - Max gain before hitting -2 dBTP
 * @property {string} recommendation - Action recommendation
 * @property {number} analysisTimeMs - Time taken to analyze
 */
async function estimateHeadroom(filePath, options = {}) {
  const { includeTruePeak = true, includeRms = true } = options;
  const startTime = Date.now();
  
  // Build analysis tasks
  const tasks = [getSamplePeak(filePath)];
  
  if (includeTruePeak) {
    tasks.push(getTruePeak(filePath));
  }
  
  if (includeRms) {
    tasks.push(getRmsLevel(filePath));
  }
  
  // Run analyses in parallel
  const results = await Promise.all(tasks);
  
  const samplePeak = results[0];
  const truePeak = includeTruePeak ? results[1] : { truePeakDb: null };
  const rms = includeRms ? results[includeTruePeak ? 2 : 1] : { rmsDb: null };
  
  // Use true peak for headroom calculation if available, otherwise sample peak
  const peakForHeadroom = truePeak.truePeakDb !== null 
    ? truePeak.truePeakDb 
    : samplePeak.peakDb;
  
  const headroomDb = calculateHeadroom(peakForHeadroom);
  const status = classifyHeadroom(headroomDb);
  const crestFactor = calculateCrestFactor(samplePeak.peakDb, rms.rmsDb);
  
  const maxGainForStreaming = calculateMaxGain(peakForHeadroom, TARGETS.STREAMING);
  const maxGainForBroadcast = calculateMaxGain(peakForHeadroom, TARGETS.BROADCAST);
  const maxGainForMastering = calculateMaxGain(peakForHeadroom, TARGETS.MASTERING);
  
  const analysis = {
    headroomDb,
    status,
    samplePeakDb: samplePeak.peakDb,
    truePeakDb: truePeak.truePeakDb,
    rmsDb: rms.rmsDb,
    crestFactor,
    maxGainForStreaming,
    maxGainForBroadcast,
    maxGainForMastering,
    perChannelPeaks: samplePeak.perChannel,
    analysisTimeMs: Date.now() - startTime
  };
  
  analysis.recommendation = getRecommendation(analysis);
  
  return analysis;
}

/**
 * Quick headroom check using only sample peak (faster)
 * @param {string} filePath - Path to audio file
 * @returns {Promise<{headroomDb: number, status: string}>}
 */
async function quickCheck(filePath) {
  const samplePeak = await getSamplePeak(filePath);
  const headroomDb = calculateHeadroom(samplePeak.peakDb);
  
  return {
    headroomDb,
    status: classifyHeadroom(headroomDb),
    peakDb: samplePeak.peakDb
  };
}

/**
 * Check if an asset has enough headroom for a target gain
 * @param {string} filePath - Path to audio file
 * @param {number} targetGainDb - Desired gain in dB
 * @param {number} ceiling - Target ceiling in dB (default: -1.0)
 * @returns {Promise<{canApply: boolean, headroom: number, required: number}>}
 */
async function canApplyGain(filePath, targetGainDb, ceiling = TARGETS.STREAMING) {
  const { truePeakDb, peakDb } = await Promise.all([
    getTruePeak(filePath),
    getSamplePeak(filePath)
  ]).then(([tp, sp]) => ({
    truePeakDb: tp.truePeakDb,
    peakDb: sp.peakDb
  }));
  
  const currentPeak = truePeakDb !== null ? truePeakDb : peakDb;
  const projectedPeak = currentPeak + targetGainDb;
  const canApply = projectedPeak <= ceiling;
  
  return {
    canApply,
    currentPeakDb: currentPeak,
    projectedPeakDb: projectedPeak,
    ceilingDb: ceiling,
    headroomDb: calculateHeadroom(currentPeak),
    requiredHeadroomDb: -ceiling + targetGainDb,
    excessDb: canApply ? ceiling - projectedPeak : projectedPeak - ceiling
  };
}

/**
 * Get human-readable status description
 * @param {string} status - HeadroomStatus value
 * @returns {string}
 */
function getStatusDescription(status) {
  const descriptions = {
    [HeadroomStatus.CLIPPED]: 'Clipping detected (peak at or above 0 dBFS)',
    [HeadroomStatus.CRITICAL]: 'Critical - less than 0.5 dB headroom',
    [HeadroomStatus.LIMITED]: 'Limited headroom (0.5 - 3 dB)',
    [HeadroomStatus.ADEQUATE]: 'Adequate headroom (3 - 6 dB)',
    [HeadroomStatus.GENEROUS]: 'Generous headroom (6 - 12 dB)',
    [HeadroomStatus.EXCESSIVE]: 'Excessive headroom (> 12 dB, may be too quiet)'
  };
  
  return descriptions[status] || 'Unknown status';
}

/**
 * Check if headroom is sufficient for processing
 * @param {string} status - HeadroomStatus value
 * @returns {boolean}
 */
function isSufficientForProcessing(status) {
  return status !== HeadroomStatus.CLIPPED && status !== HeadroomStatus.CRITICAL;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Main functions
  estimateHeadroom,
  quickCheck,
  canApplyGain,
  
  // Analysis components
  getSamplePeak,
  getTruePeak,
  getRmsLevel,
  
  // Calculation helpers
  calculateHeadroom,
  calculateMaxGain,
  calculateCrestFactor,
  classifyHeadroom,
  
  // Utilities
  getRecommendation,
  getStatusDescription,
  isSufficientForProcessing,
  
  // Constants
  HeadroomStatus,
  THRESHOLDS,
  TARGETS
};
