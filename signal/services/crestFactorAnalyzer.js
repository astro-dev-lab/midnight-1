/**
 * Crest Factor Analyzer
 * 
 * Analyzes the peak-to-RMS relationship in audio assets, which is critical
 * for making limiter decisions and understanding dynamic range characteristics.
 * 
 * Crest factor = Peak level - RMS level (in dB)
 * 
 * High crest factor (~14-20 dB): Very dynamic, lots of transients
 * Moderate crest factor (~10-14 dB): Healthy dynamics, typical for music
 * Low crest factor (~6-10 dB): Compressed, limited dynamic range
 * Very low crest factor (<6 dB): Heavily limited, "loudness war" territory
 * 
 * This information is essential for:
 * - Limiter threshold decisions (high crest = more headroom needed)
 * - Compression recommendations
 * - Loudness normalization strategy
 * - Transient preservation during processing
 * - Quality assessment (detecting over-processed assets)
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Analysis provides actionable metrics
 * for transformation parameter selection.
 */

const { spawn } = require('child_process');

// ============================================================================
// Configuration
// ============================================================================

const FFMPEG_PATH = 'ffmpeg';

/**
 * Dynamic range classifications based on crest factor
 */
const DynamicRangeStatus = {
  SEVERELY_LIMITED: 'SEVERELY_LIMITED',   // < 4 dB - Extreme limiting, likely clipping
  HEAVILY_COMPRESSED: 'HEAVILY_COMPRESSED', // 4-6 dB - Very aggressive limiting
  COMPRESSED: 'COMPRESSED',                 // 6-10 dB - Noticeable compression
  MODERATE: 'MODERATE',                     // 10-14 dB - Balanced dynamics
  DYNAMIC: 'DYNAMIC',                       // 14-18 dB - Good dynamics
  VERY_DYNAMIC: 'VERY_DYNAMIC'              // > 18 dB - Highly dynamic, classical/acoustic
};

/**
 * Crest factor thresholds (in dB)
 * These boundaries define the dynamic range classifications
 */
const THRESHOLDS = {
  SEVERELY_LIMITED: 4,
  HEAVILY_COMPRESSED: 6,
  COMPRESSED: 10,
  MODERATE: 14,
  DYNAMIC: 18
  // > 18 = VERY_DYNAMIC
};

/**
 * Typical crest factor ranges by genre/use case
 * Used for contextual recommendations
 */
const GENRE_TARGETS = {
  // Heavily processed genres
  EDM: { min: 6, typical: 8, max: 12 },
  POP: { min: 7, typical: 10, max: 14 },
  ROCK: { min: 8, typical: 11, max: 15 },
  HIP_HOP: { min: 6, typical: 9, max: 13 },
  
  // Dynamic genres
  JAZZ: { min: 12, typical: 16, max: 20 },
  CLASSICAL: { min: 14, typical: 18, max: 25 },
  ACOUSTIC: { min: 12, typical: 15, max: 20 },
  
  // Broadcast/spoken
  PODCAST: { min: 8, typical: 12, max: 16 },
  BROADCAST: { min: 8, typical: 12, max: 16 },
  
  // General purpose
  STREAMING: { min: 8, typical: 12, max: 16 },
  MASTERING: { min: 10, typical: 14, max: 18 }
};

/**
 * Limiter behavior recommendations based on crest factor
 */
const LIMITER_RECOMMENDATIONS = {
  [DynamicRangeStatus.SEVERELY_LIMITED]: {
    action: 'avoid_limiting',
    attackMs: null,
    releaseMs: null,
    maxGainReductionDb: 0,
    reason: 'Asset is already severely limited. Additional limiting will cause distortion.'
  },
  [DynamicRangeStatus.HEAVILY_COMPRESSED]: {
    action: 'minimal_limiting',
    attackMs: 5,
    releaseMs: 100,
    maxGainReductionDb: 1,
    reason: 'Limited dynamic range. Use gentle limiting only for peak control.'
  },
  [DynamicRangeStatus.COMPRESSED]: {
    action: 'light_limiting',
    attackMs: 3,
    releaseMs: 80,
    maxGainReductionDb: 2,
    reason: 'Compressed dynamics. Light limiting acceptable for loudness targets.'
  },
  [DynamicRangeStatus.MODERATE]: {
    action: 'standard_limiting',
    attackMs: 1,
    releaseMs: 50,
    maxGainReductionDb: 4,
    reason: 'Healthy dynamics. Standard limiting parameters will work well.'
  },
  [DynamicRangeStatus.DYNAMIC]: {
    action: 'preserve_transients',
    attackMs: 0.5,
    releaseMs: 30,
    maxGainReductionDb: 6,
    reason: 'Good dynamics with transients. Use fast attack to catch peaks while preserving punch.'
  },
  [DynamicRangeStatus.VERY_DYNAMIC]: {
    action: 'multi_stage',
    attackMs: 0.3,
    releaseMs: 20,
    maxGainReductionDb: 8,
    reason: 'Highly dynamic material. Consider multi-stage limiting or upward compression first.'
  }
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
// Core Analysis Functions
// ============================================================================

/**
 * Get comprehensive audio statistics using astats
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Audio statistics
 */
async function getAudioStats(filePath) {
  const args = [
    '-i', filePath,
    '-af', 'astats=metadata=1:reset=1',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse peak levels per channel
    const peakMatches = stderr.matchAll(/Peak level dB:\s*([-\d.]+)/g);
    const peakLevels = [];
    for (const match of peakMatches) {
      const value = parseFloat(match[1]);
      if (!isNaN(value) && isFinite(value)) {
        peakLevels.push(value);
      }
    }
    
    // Parse RMS levels per channel
    const rmsMatches = stderr.matchAll(/RMS level dB:\s*([-\d.]+)/g);
    const rmsLevels = [];
    for (const match of rmsMatches) {
      const value = parseFloat(match[1]);
      if (!isNaN(value) && isFinite(value)) {
        rmsLevels.push(value);
      }
    }
    
    // Parse peak counts (number of samples at peak - indicates clipping)
    const peakCountMatches = stderr.matchAll(/Number of samples:\s*(\d+)/g);
    const sampleCounts = [];
    for (const match of peakCountMatches) {
      sampleCounts.push(parseInt(match[1], 10));
    }
    
    // Parse dynamic range from astats if available
    const dynamicRangeMatch = stderr.match(/Dynamic range:\s*([-\d.]+)/);
    const dynamicRangeDb = dynamicRangeMatch ? parseFloat(dynamicRangeMatch[1]) : null;
    
    // Parse flat factor (measure of dynamic flatness)
    const flatFactorMatch = stderr.match(/Flat factor:\s*([\d.]+)/);
    const flatFactor = flatFactorMatch ? parseFloat(flatFactorMatch[1]) : null;
    
    // Calculate overall values
    const overallPeakDb = peakLevels.length > 0 ? Math.max(...peakLevels) : null;
    const avgRmsDb = rmsLevels.length > 0 
      ? rmsLevels.reduce((a, b) => a + b, 0) / rmsLevels.length 
      : null;
    
    return {
      peakDb: overallPeakDb,
      rmsDb: avgRmsDb,
      perChannel: {
        peaks: peakLevels,
        rms: rmsLevels
      },
      dynamicRangeDb,
      flatFactor,
      channelCount: Math.max(peakLevels.length, rmsLevels.length)
    };
  } catch (error) {
    console.error('[CrestFactorAnalyzer] Audio stats analysis failed:', error.message);
    return {
      peakDb: null,
      rmsDb: null,
      perChannel: { peaks: [], rms: [] },
      dynamicRangeDb: null,
      flatFactor: null,
      channelCount: 0,
      error: error.message
    };
  }
}

/**
 * Calculate crest factor from peak and RMS values
 * @param {number} peakDb - Peak level in dB
 * @param {number} rmsDb - RMS level in dB
 * @returns {number|null} Crest factor in dB
 */
function calculateCrestFactor(peakDb, rmsDb) {
  if (peakDb === null || rmsDb === null || 
      !isFinite(peakDb) || !isFinite(rmsDb)) {
    return null;
  }
  return peakDb - rmsDb;
}

/**
 * Calculate per-channel crest factors
 * @param {number[]} peaks - Peak levels per channel
 * @param {number[]} rmsLevels - RMS levels per channel
 * @returns {number[]} Crest factors per channel
 */
function calculatePerChannelCrestFactors(peaks, rmsLevels) {
  const channelCount = Math.min(peaks.length, rmsLevels.length);
  const crestFactors = [];
  
  for (let i = 0; i < channelCount; i++) {
    const cf = calculateCrestFactor(peaks[i], rmsLevels[i]);
    crestFactors.push(cf);
  }
  
  return crestFactors;
}

/**
 * Classify dynamic range based on crest factor
 * @param {number} crestFactorDb - Crest factor in dB
 * @returns {string} DynamicRangeStatus value
 */
function classifyDynamicRange(crestFactorDb) {
  if (crestFactorDb === null || !isFinite(crestFactorDb)) {
    return DynamicRangeStatus.MODERATE; // Default assumption
  }
  
  if (crestFactorDb < THRESHOLDS.SEVERELY_LIMITED) {
    return DynamicRangeStatus.SEVERELY_LIMITED;
  } else if (crestFactorDb < THRESHOLDS.HEAVILY_COMPRESSED) {
    return DynamicRangeStatus.HEAVILY_COMPRESSED;
  } else if (crestFactorDb < THRESHOLDS.COMPRESSED) {
    return DynamicRangeStatus.COMPRESSED;
  } else if (crestFactorDb < THRESHOLDS.MODERATE) {
    return DynamicRangeStatus.MODERATE;
  } else if (crestFactorDb < THRESHOLDS.DYNAMIC) {
    return DynamicRangeStatus.DYNAMIC;
  } else {
    return DynamicRangeStatus.VERY_DYNAMIC;
  }
}

/**
 * Get limiter recommendation based on dynamic range status
 * @param {string} status - DynamicRangeStatus value
 * @returns {Object} Limiter recommendation
 */
function getLimiterRecommendation(status) {
  return LIMITER_RECOMMENDATIONS[status] || LIMITER_RECOMMENDATIONS[DynamicRangeStatus.MODERATE];
}

/**
 * Get human-readable description of dynamic range status
 * @param {string} status - DynamicRangeStatus value
 * @returns {string} Description
 */
function getStatusDescription(status) {
  const descriptions = {
    [DynamicRangeStatus.SEVERELY_LIMITED]: 'Severely limited dynamic range (<4 dB crest factor). Asset may sound distorted.',
    [DynamicRangeStatus.HEAVILY_COMPRESSED]: 'Heavily compressed (4-6 dB crest factor). Very limited dynamic range.',
    [DynamicRangeStatus.COMPRESSED]: 'Compressed dynamics (6-10 dB crest factor). Noticeable limiting applied.',
    [DynamicRangeStatus.MODERATE]: 'Moderate dynamics (10-14 dB crest factor). Balanced compression.',
    [DynamicRangeStatus.DYNAMIC]: 'Dynamic audio (14-18 dB crest factor). Good transient preservation.',
    [DynamicRangeStatus.VERY_DYNAMIC]: 'Very dynamic (>18 dB crest factor). Full dynamic range, minimal processing.'
  };
  
  return descriptions[status] || 'Unknown dynamic range status';
}

/**
 * Check if crest factor is appropriate for a genre
 * @param {number} crestFactorDb - Crest factor in dB
 * @param {string} genre - Genre name (key in GENRE_TARGETS)
 * @returns {Object} Genre appropriateness assessment
 */
function assessGenreAppropriateness(crestFactorDb, genre) {
  const target = GENRE_TARGETS[genre.toUpperCase()] || GENRE_TARGETS.STREAMING;
  
  if (crestFactorDb === null) {
    return {
      genre,
      appropriate: null,
      reason: 'Unable to assess - crest factor unavailable'
    };
  }
  
  const belowMin = crestFactorDb < target.min;
  const aboveMax = crestFactorDb > target.max;
  const nearTypical = Math.abs(crestFactorDb - target.typical) <= 2;
  
  let appropriateness;
  let reason;
  
  if (belowMin) {
    appropriateness = 'too_compressed';
    reason = `Crest factor (${crestFactorDb.toFixed(1)} dB) is below typical range for ${genre} (${target.min}-${target.max} dB)`;
  } else if (aboveMax) {
    appropriateness = 'too_dynamic';
    reason = `Crest factor (${crestFactorDb.toFixed(1)} dB) is above typical range for ${genre} (${target.min}-${target.max} dB)`;
  } else if (nearTypical) {
    appropriateness = 'ideal';
    reason = `Crest factor (${crestFactorDb.toFixed(1)} dB) is close to typical for ${genre} (${target.typical} dB)`;
  } else {
    appropriateness = 'acceptable';
    reason = `Crest factor (${crestFactorDb.toFixed(1)} dB) is within acceptable range for ${genre}`;
  }
  
  return {
    genre,
    crestFactorDb,
    target,
    appropriate: appropriateness,
    reason,
    suggestedAdjustment: belowMin 
      ? target.typical - crestFactorDb 
      : (aboveMax ? target.typical - crestFactorDb : 0)
  };
}

/**
 * Calculate channel balance based on per-channel crest factors
 * Helps identify stereo imbalance or phase issues
 * @param {number[]} perChannelCrestFactors - Crest factors per channel
 * @returns {Object} Channel balance assessment
 */
function assessChannelBalance(perChannelCrestFactors) {
  if (!perChannelCrestFactors || perChannelCrestFactors.length < 2) {
    return {
      balanced: true,
      differenceDb: 0,
      issue: null
    };
  }
  
  // Filter out null values
  const validFactors = perChannelCrestFactors.filter(cf => cf !== null && isFinite(cf));
  
  if (validFactors.length < 2) {
    return {
      balanced: true,
      differenceDb: 0,
      issue: null
    };
  }
  
  const maxDiff = Math.max(...validFactors) - Math.min(...validFactors);
  
  let issue = null;
  if (maxDiff > 3) {
    issue = 'significant_imbalance';
  } else if (maxDiff > 1.5) {
    issue = 'minor_imbalance';
  }
  
  return {
    balanced: maxDiff <= 1.5,
    differenceDb: maxDiff,
    minCrestFactor: Math.min(...validFactors),
    maxCrestFactor: Math.max(...validFactors),
    issue,
    perChannel: perChannelCrestFactors
  };
}

/**
 * Determine if asset needs dynamic range processing
 * @param {number} crestFactorDb - Crest factor in dB
 * @param {string} targetUse - Target use case
 * @returns {Object} Processing recommendation
 */
function needsProcessing(crestFactorDb, targetUse = 'STREAMING') {
  const target = GENRE_TARGETS[targetUse.toUpperCase()] || GENRE_TARGETS.STREAMING;
  
  if (crestFactorDb === null) {
    return {
      needs: null,
      reason: 'Unable to assess - crest factor unavailable',
      suggestedProcessing: null
    };
  }
  
  // Too compressed - needs upward expansion or is over-processed
  if (crestFactorDb < target.min) {
    return {
      needs: 'expansion',
      reason: `Crest factor too low for ${targetUse}. May sound over-compressed.`,
      suggestedProcessing: 'Consider upward expansion or using a less processed source.',
      targetCrestFactor: target.typical,
      adjustmentNeeded: target.typical - crestFactorDb
    };
  }
  
  // Too dynamic - needs compression/limiting
  if (crestFactorDb > target.max) {
    return {
      needs: 'compression',
      reason: `Crest factor too high for ${targetUse}. May need dynamic control.`,
      suggestedProcessing: 'Apply gentle compression to reduce dynamic range.',
      targetCrestFactor: target.typical,
      adjustmentNeeded: crestFactorDb - target.typical
    };
  }
  
  // Appropriate
  return {
    needs: false,
    reason: `Crest factor appropriate for ${targetUse}.`,
    suggestedProcessing: null,
    targetCrestFactor: target.typical,
    adjustmentNeeded: 0
  };
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Perform comprehensive crest factor analysis
 * @param {string} filePath - Path to audio file
 * @param {Object} options - Analysis options
 * @param {string} options.genre - Target genre for appropriateness check
 * @param {string} options.targetUse - Target use case (STREAMING, BROADCAST, etc.)
 * @returns {Promise<Object>} Complete crest factor analysis
 */
async function analyzeCrestFactor(filePath, options = {}) {
  const startTime = Date.now();
  const { genre, targetUse = 'STREAMING' } = options;
  
  // Get audio statistics
  const stats = await getAudioStats(filePath);
  
  // Calculate overall crest factor
  const crestFactorDb = calculateCrestFactor(stats.peakDb, stats.rmsDb);
  
  // Calculate per-channel crest factors
  const perChannelCrestFactors = calculatePerChannelCrestFactors(
    stats.perChannel.peaks,
    stats.perChannel.rms
  );
  
  // Classify dynamic range
  const status = classifyDynamicRange(crestFactorDb);
  
  // Get limiter recommendation
  const limiterRecommendation = getLimiterRecommendation(status);
  
  // Assess channel balance
  const channelBalance = assessChannelBalance(perChannelCrestFactors);
  
  // Assess processing needs
  const processingNeeds = needsProcessing(crestFactorDb, targetUse);
  
  // Genre appropriateness if specified
  const genreAssessment = genre 
    ? assessGenreAppropriateness(crestFactorDb, genre)
    : null;
  
  const analysis = {
    filePath,
    
    // Core measurements
    crestFactorDb,
    peakDb: stats.peakDb,
    rmsDb: stats.rmsDb,
    dynamicRangeDb: stats.dynamicRangeDb,
    
    // Per-channel data
    perChannel: {
      crestFactors: perChannelCrestFactors,
      peaks: stats.perChannel.peaks,
      rms: stats.perChannel.rms
    },
    channelCount: stats.channelCount,
    
    // Classification
    status,
    statusDescription: getStatusDescription(status),
    
    // Channel balance
    channelBalance,
    
    // Recommendations
    limiterRecommendation,
    processingNeeds,
    
    // Genre assessment (if provided)
    genreAssessment,
    
    // Analysis metadata
    analysisTimeMs: Date.now() - startTime
  };
  
  return analysis;
}

/**
 * Quick crest factor check (faster, less detail)
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Quick crest factor result
 */
async function quickCheck(filePath) {
  const stats = await getAudioStats(filePath);
  const crestFactorDb = calculateCrestFactor(stats.peakDb, stats.rmsDb);
  const status = classifyDynamicRange(crestFactorDb);
  
  return {
    crestFactorDb,
    status,
    peakDb: stats.peakDb,
    rmsDb: stats.rmsDb,
    limiterAction: getLimiterRecommendation(status).action
  };
}

/**
 * Check if crest factor indicates safe limiting
 * @param {string} status - DynamicRangeStatus value
 * @returns {boolean} Whether it's safe to apply limiting
 */
function isSafeForLimiting(status) {
  // Avoid limiting on already heavily processed material
  return status !== DynamicRangeStatus.SEVERELY_LIMITED && 
         status !== DynamicRangeStatus.HEAVILY_COMPRESSED;
}

/**
 * Get available genres for assessment
 * @returns {string[]} List of genre names
 */
function getAvailableGenres() {
  return Object.keys(GENRE_TARGETS);
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Main functions
  analyzeCrestFactor,
  quickCheck,
  
  // Core calculations
  calculateCrestFactor,
  calculatePerChannelCrestFactors,
  classifyDynamicRange,
  
  // Recommendations
  getLimiterRecommendation,
  assessGenreAppropriateness,
  assessChannelBalance,
  needsProcessing,
  
  // Utilities
  getStatusDescription,
  isSafeForLimiting,
  getAvailableGenres,
  getAudioStats,
  
  // Constants
  DynamicRangeStatus,
  THRESHOLDS,
  GENRE_TARGETS,
  LIMITER_RECOMMENDATIONS
};
