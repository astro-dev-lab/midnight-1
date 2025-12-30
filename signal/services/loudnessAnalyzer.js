/**
 * Loudness Analyzer
 * 
 * Comprehensive EBU R128 loudness analysis providing momentary, short-term,
 * and integrated loudness measurements. This is critical for:
 * 
 * - Streaming compliance (Spotify, Apple Music, YouTube targets)
 * - Broadcast compliance (EBU R128, ATSC A/85)
 * - Dynamic loudness assessment
 * - Limiter and compressor decision-making
 * 
 * Loudness Types:
 * - Momentary (M): 400ms sliding window - catches brief peaks
 * - Short-term (S): 3s sliding window - represents perceived loudness
 * - Integrated (I): Entire program loudness - for compliance
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Analysis provides actionable
 * metrics for transformation parameter selection.
 */

const { spawn } = require('child_process');

// ============================================================================
// Configuration
// ============================================================================

const FFMPEG_PATH = 'ffmpeg';

/**
 * Loudness compliance targets by platform/standard
 */
const LOUDNESS_TARGETS = {
  // Streaming platforms
  SPOTIFY: { integrated: -14, truePeak: -1, lra: { min: 4, max: 16 } },
  APPLE_MUSIC: { integrated: -16, truePeak: -1, lra: { min: 4, max: 16 } },
  YOUTUBE: { integrated: -14, truePeak: -1, lra: { min: 4, max: 16 } },
  TIDAL: { integrated: -14, truePeak: -1, lra: { min: 4, max: 16 } },
  AMAZON_MUSIC: { integrated: -14, truePeak: -2, lra: { min: 4, max: 16 } },
  DEEZER: { integrated: -15, truePeak: -1, lra: { min: 4, max: 16 } },
  
  // Broadcast standards
  EBU_R128: { integrated: -23, truePeak: -1, lra: { min: 4, max: 16 } },
  ATSC_A85: { integrated: -24, truePeak: -2, lra: { min: 4, max: 16 } },
  ARIB_TR_B32: { integrated: -24, truePeak: -1, lra: { min: 4, max: 16 } },
  
  // General targets
  PODCAST: { integrated: -16, truePeak: -1, lra: { min: 4, max: 12 } },
  AUDIOBOOK: { integrated: -18, truePeak: -3, lra: { min: 3, max: 10 } },
  FILM: { integrated: -24, truePeak: -1, lra: { min: 8, max: 20 } },
  MASTERING: { integrated: -14, truePeak: -1, lra: { min: 6, max: 14 } }
};

/**
 * Loudness status classifications
 */
const LoudnessStatus = {
  TOO_QUIET: 'TOO_QUIET',           // Well below target
  SLIGHTLY_QUIET: 'SLIGHTLY_QUIET', // 1-3 dB below target
  COMPLIANT: 'COMPLIANT',           // Within tolerance
  SLIGHTLY_LOUD: 'SLIGHTLY_LOUD',   // 1-3 dB above target
  TOO_LOUD: 'TOO_LOUD'              // Well above target
};

/**
 * LRA (Loudness Range) status
 */
const LRAStatus = {
  TOO_COMPRESSED: 'TOO_COMPRESSED', // LRA < 4
  OPTIMAL: 'OPTIMAL',               // LRA 4-16
  TOO_DYNAMIC: 'TOO_DYNAMIC'        // LRA > 16
};

/**
 * Tolerance for compliance checks (in LU)
 */
const COMPLIANCE_TOLERANCE = 1.0;

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
 * Analyze loudness using the ebur128 filter
 * This provides momentary, short-term, and integrated loudness
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Complete loudness analysis
 */
async function getEBUR128Stats(filePath) {
  // ebur128 filter with metadata output
  const args = [
    '-i', filePath,
    '-af', 'ebur128=metadata=1:peak=true',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse the summary section
    const summaryMatch = stderr.match(/Integrated loudness:[\s\S]*?Loudness range:/);
    
    // Parse integrated loudness
    const integratedMatch = stderr.match(/I:\s*([-\d.]+)\s*LUFS/);
    const integrated = integratedMatch ? parseFloat(integratedMatch[1]) : null;
    
    // Parse threshold
    const thresholdMatch = stderr.match(/Threshold:\s*([-\d.]+)\s*LUFS/);
    const threshold = thresholdMatch ? parseFloat(thresholdMatch[1]) : null;
    
    // Parse LRA (Loudness Range)
    const lraMatch = stderr.match(/LRA:\s*([-\d.]+)\s*LU/);
    const lra = lraMatch ? parseFloat(lraMatch[1]) : null;
    
    // Parse LRA thresholds
    const lraLowMatch = stderr.match(/LRA low:\s*([-\d.]+)\s*LUFS/);
    const lraLow = lraLowMatch ? parseFloat(lraLowMatch[1]) : null;
    
    const lraHighMatch = stderr.match(/LRA high:\s*([-\d.]+)\s*LUFS/);
    const lraHigh = lraHighMatch ? parseFloat(lraHighMatch[1]) : null;
    
    // Parse sample peak
    const samplePeakMatch = stderr.match(/Sample peak:[\s\S]*?Peak:\s*([-\d.]+)\s*dBFS/);
    const samplePeak = samplePeakMatch ? parseFloat(samplePeakMatch[1]) : null;
    
    // Parse true peak
    const truePeakMatch = stderr.match(/True peak:[\s\S]*?Peak:\s*([-\d.]+)\s*dBTP/);
    const truePeak = truePeakMatch ? parseFloat(truePeakMatch[1]) : null;
    
    // Extract momentary loudness values over time
    const momentaryValues = extractMomentaryValues(stderr);
    
    // Extract short-term loudness values over time
    const shortTermValues = extractShortTermValues(stderr);
    
    // Calculate statistics
    const momentaryStats = calculateStats(momentaryValues);
    const shortTermStats = calculateStats(shortTermValues);
    
    return {
      // Integrated (program) loudness
      integrated,
      threshold,
      
      // Loudness Range
      lra,
      lraLow,
      lraHigh,
      
      // Peak measurements
      samplePeak,
      truePeak,
      
      // Momentary loudness (400ms window)
      momentary: {
        max: momentaryStats.max,
        min: momentaryStats.min,
        mean: momentaryStats.mean,
        values: momentaryValues.length > 100 
          ? sampleValues(momentaryValues, 100) // Limit to 100 samples
          : momentaryValues
      },
      
      // Short-term loudness (3s window)
      shortTerm: {
        max: shortTermStats.max,
        min: shortTermStats.min,
        mean: shortTermStats.mean,
        values: shortTermValues.length > 100 
          ? sampleValues(shortTermValues, 100) 
          : shortTermValues
      }
    };
  } catch (error) {
    console.error('[LoudnessAnalyzer] ebur128 analysis failed:', error.message);
    return {
      integrated: null,
      threshold: null,
      lra: null,
      samplePeak: null,
      truePeak: null,
      momentary: { max: null, min: null, mean: null, values: [] },
      shortTerm: { max: null, min: null, mean: null, values: [] },
      error: error.message
    };
  }
}

/**
 * Extract momentary loudness values from ebur128 output
 * @param {string} output - FFmpeg stderr output
 * @returns {number[]} Array of momentary LUFS values
 */
function extractMomentaryValues(output) {
  const values = [];
  // Match pattern: M: -XX.X S: ... (momentary values in ebur128 output)
  const matches = output.matchAll(/\[Parsed_ebur128.*?\]\s*t:\s*[\d.]+\s*TARGET:\s*[-\d.]+\s*LUFS\s*M:\s*([-\d.]+)/g);
  
  for (const match of matches) {
    const value = parseFloat(match[1]);
    if (!isNaN(value) && isFinite(value)) {
      values.push(value);
    }
  }
  
  // Also try alternative format
  if (values.length === 0) {
    const altMatches = output.matchAll(/M:\s*([-\d.]+)\s*S:/g);
    for (const match of altMatches) {
      const value = parseFloat(match[1]);
      if (!isNaN(value) && isFinite(value)) {
        values.push(value);
      }
    }
  }
  
  return values;
}

/**
 * Extract short-term loudness values from ebur128 output
 * @param {string} output - FFmpeg stderr output
 * @returns {number[]} Array of short-term LUFS values
 */
function extractShortTermValues(output) {
  const values = [];
  // Match pattern: S: -XX.X (short-term values in ebur128 output)
  const matches = output.matchAll(/S:\s*([-\d.]+)\s*I:/g);
  
  for (const match of matches) {
    const value = parseFloat(match[1]);
    if (!isNaN(value) && isFinite(value)) {
      values.push(value);
    }
  }
  
  // Also try alternative format with LUFS suffix
  if (values.length === 0) {
    const altMatches = output.matchAll(/S:\s*([-\d.]+)\s*LUFS/g);
    for (const match of altMatches) {
      const value = parseFloat(match[1]);
      if (!isNaN(value) && isFinite(value)) {
        values.push(value);
      }
    }
  }
  
  return values;
}

/**
 * Calculate statistics for an array of values
 * @param {number[]} values - Array of numeric values
 * @returns {Object} Statistics object with max, min, mean
 */
function calculateStats(values) {
  if (!values || values.length === 0) {
    return { max: null, min: null, mean: null };
  }
  
  // Filter out invalid values
  const valid = values.filter(v => v !== null && isFinite(v) && v > -100);
  
  if (valid.length === 0) {
    return { max: null, min: null, mean: null };
  }
  
  return {
    max: Math.max(...valid),
    min: Math.min(...valid),
    mean: valid.reduce((a, b) => a + b, 0) / valid.length
  };
}

/**
 * Sample values to reduce array size while preserving distribution
 * @param {number[]} values - Original values
 * @param {number} targetCount - Target number of samples
 * @returns {number[]} Sampled values
 */
function sampleValues(values, targetCount) {
  if (values.length <= targetCount) return values;
  
  const step = values.length / targetCount;
  const sampled = [];
  
  for (let i = 0; i < targetCount; i++) {
    const index = Math.floor(i * step);
    sampled.push(values[index]);
  }
  
  return sampled;
}

// ============================================================================
// Classification Functions
// ============================================================================

/**
 * Classify integrated loudness against a target
 * @param {number} integrated - Integrated loudness in LUFS
 * @param {number} target - Target loudness in LUFS
 * @returns {string} LoudnessStatus value
 */
function classifyLoudness(integrated, target) {
  if (integrated === null || !isFinite(integrated)) {
    return LoudnessStatus.COMPLIANT; // Default assumption
  }
  
  const difference = integrated - target;
  
  if (difference < -3) {
    return LoudnessStatus.TOO_QUIET;
  } else if (difference < -COMPLIANCE_TOLERANCE) {
    return LoudnessStatus.SLIGHTLY_QUIET;
  } else if (difference <= COMPLIANCE_TOLERANCE) {
    return LoudnessStatus.COMPLIANT;
  } else if (difference <= 3) {
    return LoudnessStatus.SLIGHTLY_LOUD;
  } else {
    return LoudnessStatus.TOO_LOUD;
  }
}

/**
 * Classify LRA (Loudness Range)
 * @param {number} lra - Loudness Range in LU
 * @param {Object} target - Target LRA range { min, max }
 * @returns {string} LRAStatus value
 */
function classifyLRA(lra, target = { min: 4, max: 16 }) {
  if (lra === null || !isFinite(lra)) {
    return LRAStatus.OPTIMAL; // Default assumption
  }
  
  if (lra < target.min) {
    return LRAStatus.TOO_COMPRESSED;
  } else if (lra > target.max) {
    return LRAStatus.TOO_DYNAMIC;
  } else {
    return LRAStatus.OPTIMAL;
  }
}

/**
 * Check compliance against a specific platform/standard
 * @param {Object} analysis - Complete loudness analysis
 * @param {string} platform - Platform name (key in LOUDNESS_TARGETS)
 * @returns {Object} Compliance result
 */
function checkCompliance(analysis, platform) {
  const target = LOUDNESS_TARGETS[platform.toUpperCase()] || LOUDNESS_TARGETS.SPOTIFY;
  
  const { integrated, truePeak, lra } = analysis;
  
  const loudnessStatus = classifyLoudness(integrated, target.integrated);
  const lraStatus = classifyLRA(lra, target.lra);
  const truePeakOk = truePeak === null || truePeak <= target.truePeak;
  
  const isCompliant = 
    loudnessStatus === LoudnessStatus.COMPLIANT && 
    lraStatus === LRAStatus.OPTIMAL && 
    truePeakOk;
  
  const issues = [];
  
  if (loudnessStatus !== LoudnessStatus.COMPLIANT) {
    const diff = integrated - target.integrated;
    issues.push({
      type: 'loudness',
      message: `Integrated loudness ${integrated?.toFixed(1)} LUFS is ${diff > 0 ? 'above' : 'below'} target ${target.integrated} LUFS`,
      adjustment: -diff
    });
  }
  
  if (!truePeakOk) {
    issues.push({
      type: 'truePeak',
      message: `True peak ${truePeak?.toFixed(1)} dBTP exceeds limit of ${target.truePeak} dBTP`,
      adjustment: target.truePeak - truePeak
    });
  }
  
  if (lraStatus !== LRAStatus.OPTIMAL) {
    issues.push({
      type: 'lra',
      message: `LRA ${lra?.toFixed(1)} LU is ${lraStatus === LRAStatus.TOO_COMPRESSED ? 'below' : 'above'} target range`,
      status: lraStatus
    });
  }
  
  return {
    platform,
    target,
    isCompliant,
    loudnessStatus,
    lraStatus,
    truePeakOk,
    issues,
    measured: {
      integrated,
      truePeak,
      lra
    }
  };
}

/**
 * Get normalization recommendation
 * @param {Object} analysis - Complete loudness analysis
 * @param {string} platform - Target platform
 * @returns {Object} Normalization recommendation
 */
function getNormalizationRecommendation(analysis, platform = 'SPOTIFY') {
  const target = LOUDNESS_TARGETS[platform.toUpperCase()] || LOUDNESS_TARGETS.SPOTIFY;
  const { integrated, truePeak, lra, momentary, shortTerm } = analysis;
  
  if (integrated === null) {
    return {
      canNormalize: false,
      reason: 'Unable to measure integrated loudness'
    };
  }
  
  const gainNeeded = target.integrated - integrated;
  const projectedTruePeak = (truePeak || 0) + gainNeeded;
  const willClip = projectedTruePeak > target.truePeak;
  
  // Check if momentary peaks would exceed limit
  const momentaryMax = momentary?.max || integrated;
  const projectedMomentaryMax = momentaryMax + gainNeeded;
  const momentaryRisk = projectedMomentaryMax > -1;
  
  return {
    canNormalize: true,
    gainNeeded,
    willClip,
    needsLimiter: willClip,
    momentaryRisk,
    recommendation: willClip 
      ? `Apply ${gainNeeded.toFixed(1)} dB gain with true peak limiter at ${target.truePeak} dBTP`
      : `Apply ${gainNeeded.toFixed(1)} dB gain to reach ${target.integrated} LUFS`,
    projectedLoudness: target.integrated,
    projectedTruePeak,
    lraNote: lra && lra > target.lra.max 
      ? 'Consider compression to reduce LRA before normalization'
      : null
  };
}

/**
 * Assess dynamic consistency based on momentary/short-term variation
 * @param {Object} analysis - Complete loudness analysis
 * @returns {Object} Dynamic consistency assessment
 */
function assessDynamicConsistency(analysis) {
  const { momentary, shortTerm, integrated } = analysis;
  
  if (!momentary?.max || !shortTerm?.max) {
    return {
      consistent: null,
      reason: 'Insufficient data for dynamic consistency assessment'
    };
  }
  
  // Momentary swing: difference between max and min momentary
  const momentarySwing = momentary.max - momentary.min;
  
  // Short-term swing
  const shortTermSwing = shortTerm.max - shortTerm.min;
  
  // Deviation from integrated
  const momentaryDeviation = momentary.max - integrated;
  const shortTermDeviation = shortTerm.max - integrated;
  
  // Assessment
  let consistency;
  let description;
  
  if (momentarySwing < 10 && shortTermSwing < 6) {
    consistency = 'very_consistent';
    description = 'Very consistent loudness throughout';
  } else if (momentarySwing < 16 && shortTermSwing < 10) {
    consistency = 'consistent';
    description = 'Reasonably consistent loudness';
  } else if (momentarySwing < 24 && shortTermSwing < 14) {
    consistency = 'variable';
    description = 'Variable loudness - consider level automation';
  } else {
    consistency = 'highly_variable';
    description = 'Highly variable loudness - may need section-by-section processing';
  }
  
  return {
    consistency,
    description,
    momentarySwing,
    shortTermSwing,
    momentaryDeviation,
    shortTermDeviation,
    integratedVsMomentaryMax: momentary.max - integrated,
    integratedVsShortTermMax: shortTerm.max - integrated
  };
}

/**
 * Get human-readable status description
 * @param {string} status - LoudnessStatus value
 * @returns {string} Description
 */
function getStatusDescription(status) {
  const descriptions = {
    [LoudnessStatus.TOO_QUIET]: 'Significantly below target loudness (>3 LU)',
    [LoudnessStatus.SLIGHTLY_QUIET]: 'Slightly below target loudness (1-3 LU)',
    [LoudnessStatus.COMPLIANT]: 'Within target loudness tolerance (±1 LU)',
    [LoudnessStatus.SLIGHTLY_LOUD]: 'Slightly above target loudness (1-3 LU)',
    [LoudnessStatus.TOO_LOUD]: 'Significantly above target loudness (>3 LU)'
  };
  
  return descriptions[status] || 'Unknown loudness status';
}

/**
 * Get available platforms for compliance checking
 * @returns {string[]} List of platform names
 */
function getAvailablePlatforms() {
  return Object.keys(LOUDNESS_TARGETS);
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Perform comprehensive loudness analysis
 * @param {string} filePath - Path to audio file
 * @param {Object} options - Analysis options
 * @param {string} options.platform - Target platform for compliance check
 * @returns {Promise<Object>} Complete loudness analysis
 */
async function analyzeLoudness(filePath, options = {}) {
  const startTime = Date.now();
  const { platform = 'SPOTIFY' } = options;
  
  // Get EBU R128 statistics
  const stats = await getEBUR128Stats(filePath);
  
  // Check compliance
  const compliance = checkCompliance(stats, platform);
  
  // Get normalization recommendation
  const normalization = getNormalizationRecommendation(stats, platform);
  
  // Assess dynamic consistency
  const dynamicConsistency = assessDynamicConsistency(stats);
  
  return {
    filePath,
    
    // Core measurements
    integrated: stats.integrated,
    truePeak: stats.truePeak,
    samplePeak: stats.samplePeak,
    lra: stats.lra,
    threshold: stats.threshold,
    
    // Momentary loudness (400ms)
    momentary: stats.momentary,
    
    // Short-term loudness (3s)
    shortTerm: stats.shortTerm,
    
    // Loudness Range details
    lraRange: {
      low: stats.lraLow,
      high: stats.lraHigh
    },
    
    // Classification
    status: compliance.loudnessStatus,
    statusDescription: getStatusDescription(compliance.loudnessStatus),
    lraStatus: compliance.lraStatus,
    
    // Compliance
    compliance,
    
    // Recommendations
    normalization,
    dynamicConsistency,
    
    // Analysis metadata
    analysisTimeMs: Date.now() - startTime
  };
}

/**
 * Quick loudness check (faster, less detail)
 * Uses loudnorm instead of ebur128 for speed
 * @param {string} filePath - Path to audio file
 * @param {string} platform - Target platform
 * @returns {Promise<Object>} Quick loudness result
 */
async function quickCheck(filePath, platform = 'SPOTIFY') {
  const args = [
    '-i', filePath,
    '-af', 'loudnorm=print_format=json',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    const jsonMatch = stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
    if (jsonMatch) {
      const metrics = JSON.parse(jsonMatch[0]);
      const integrated = parseFloat(metrics.input_i) || null;
      const truePeak = parseFloat(metrics.input_tp) || null;
      const lra = parseFloat(metrics.input_lra) || null;
      
      const target = LOUDNESS_TARGETS[platform.toUpperCase()] || LOUDNESS_TARGETS.SPOTIFY;
      const status = classifyLoudness(integrated, target.integrated);
      
      return {
        integrated,
        truePeak,
        lra,
        status,
        isCompliant: status === LoudnessStatus.COMPLIANT && 
                     (truePeak === null || truePeak <= target.truePeak),
        gainNeeded: integrated !== null ? target.integrated - integrated : null
      };
    }
    
    return {
      integrated: null,
      truePeak: null,
      lra: null,
      status: LoudnessStatus.COMPLIANT,
      isCompliant: null,
      gainNeeded: null,
      warning: 'Could not parse loudness metrics'
    };
  } catch (error) {
    console.error('[LoudnessAnalyzer] Quick check failed:', error.message);
    return {
      integrated: null,
      truePeak: null,
      lra: null,
      status: LoudnessStatus.COMPLIANT,
      isCompliant: null,
      error: error.message
    };
  }
}

/**
 * Check if loudness is safe for a platform
 * @param {number} integrated - Integrated loudness in LUFS
 * @param {string} platform - Target platform
 * @returns {boolean} Whether loudness is within safe range
 */
function isSafeForPlatform(integrated, platform = 'SPOTIFY') {
  const target = LOUDNESS_TARGETS[platform.toUpperCase()] || LOUDNESS_TARGETS.SPOTIFY;
  const status = classifyLoudness(integrated, target.integrated);
  
  return status === LoudnessStatus.COMPLIANT || 
         status === LoudnessStatus.SLIGHTLY_QUIET ||
         status === LoudnessStatus.SLIGHTLY_LOUD;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Main functions
  analyzeLoudness,
  quickCheck,
  
  // Core analysis
  getEBUR128Stats,
  
  // Classification
  classifyLoudness,
  classifyLRA,
  checkCompliance,
  
  // Recommendations
  getNormalizationRecommendation,
  assessDynamicConsistency,
  
  // Utilities
  getStatusDescription,
  getAvailablePlatforms,
  isSafeForPlatform,
  
  // Constants
  LoudnessStatus,
  LRAStatus,
  LOUDNESS_TARGETS,
  COMPLIANCE_TOLERANCE
};
