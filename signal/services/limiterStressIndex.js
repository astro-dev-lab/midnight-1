/**
 * Limiter Stress Index Analyzer
 * 
 * Measures how "hard" a limiter is working over time by combining
 * multiple indicators of limiting activity:
 * - Crest factor reduction (peak-to-RMS compression)
 * - Waveform flatness (squared-off peaks from brickwall limiting)
 * - Clip density (samples at or near digital ceiling)
 * - True peak headroom (proximity to ceiling)
 * - Dynamic range compression (LRA reduction)
 * - High-frequency transient loss (attack blunting)
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Analysis provides actionable
 * metrics for transformation parameter selection.
 * 
 * Use cases:
 * - Detecting over-limited masters before further processing
 * - Identifying headroom for additional loudness
 * - Flagging assets at risk of distortion
 * - Recommending appropriate limiter settings
 */

const { spawn } = require('child_process');

// ============================================================================
// Configuration
// ============================================================================

const FFMPEG_PATH = 'ffmpeg';

/**
 * Limiter stress level classifications
 */
const LimiterStressStatus = {
  NONE: 'NONE',                     // 0-10: No apparent limiting
  LIGHT: 'LIGHT',                   // 10-30: Gentle peak control
  MODERATE: 'MODERATE',             // 30-50: Standard mastering limiting
  HEAVY: 'HEAVY',                   // 50-70: Aggressive limiting
  SEVERE: 'SEVERE',                 // 70-85: Over-limited, may have artifacts
  EXTREME: 'EXTREME'                // 85-100: Brickwall destruction
};

/**
 * Stress index thresholds (0-100 scale)
 */
const STRESS_THRESHOLDS = {
  NONE: 10,
  LIGHT: 30,
  MODERATE: 50,
  HEAVY: 70,
  SEVERE: 85
  // Above 85 = EXTREME
};

/**
 * Component weights for stress index calculation
 */
const COMPONENT_WEIGHTS = {
  crestFactor: 0.30,        // Inverted crest factor (low crest = high stress)
  flatFactor: 0.20,         // Waveform flatness from consecutive peaks
  headroom: 0.15,           // Proximity to digital ceiling
  clipDensity: 0.15,        // Samples at/near maximum
  lraCompression: 0.10,     // Dynamic range compression
  hfTransientLoss: 0.10     // High-frequency attack blunting
};

/**
 * Reference values for normalization
 */
const REFERENCE_VALUES = {
  crestFactorMinDb: 3,      // Below this = maximum stress
  crestFactorMaxDb: 18,     // Above this = no stress
  flatFactorMax: 1.0,       // Maximum expected flat factor
  headroomSafeDb: 3,        // Headroom below this adds stress
  clipThresholdDb: -0.1,    // Samples above this count as "at ceiling"
  lraMinLu: 4,              // LRA below this = high compression
  lraMaxLu: 16,             // LRA above this = no compression stress
  hfCrestMinDb: 6,          // HF crest below this = blunted transients
  hfCrestMaxDb: 20          // HF crest above this = sharp transients
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
// Component Analysis Functions
// ============================================================================

/**
 * Analyze overall dynamics using astats
 * Returns crest factor, flat factor, and peak info
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} - Dynamics analysis
 */
async function analyzeDynamics(filePath) {
  const args = [
    '-i', filePath,
    '-af', 'astats=metadata=1:measure_overall=all',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse metrics from astats output
    const peakMatch = stderr.match(/Peak level dB:\s*([-\d.]+)/i);
    const rmsMatch = stderr.match(/RMS level dB:\s*([-\d.]+)/i);
    const flatMatch = stderr.match(/Flat factor:\s*([\d.]+)/i);
    const dynamicMatch = stderr.match(/Dynamic range:\s*([\d.]+)/i);
    const crestMatch = stderr.match(/Crest factor:\s*([\d.]+)/i);
    
    const peakDb = peakMatch ? parseFloat(peakMatch[1]) : null;
    const rmsDb = rmsMatch ? parseFloat(rmsMatch[1]) : null;
    
    // Calculate crest factor if not directly available
    let crestFactorDb = null;
    if (crestMatch) {
      // FFmpeg returns linear crest factor, convert to dB
      const linearCrest = parseFloat(crestMatch[1]);
      crestFactorDb = 20 * Math.log10(linearCrest);
    } else if (peakDb !== null && rmsDb !== null) {
      crestFactorDb = peakDb - rmsDb;
    }
    
    return {
      peakDb,
      rmsDb,
      crestFactorDb,
      flatFactor: flatMatch ? parseFloat(flatMatch[1]) : null,
      dynamicRangeDb: dynamicMatch ? parseFloat(dynamicMatch[1]) : null
    };
  } catch (error) {
    console.error('[LimiterStressIndex] Dynamics analysis failed:', error.message);
    return {
      peakDb: null,
      rmsDb: null,
      crestFactorDb: null,
      flatFactor: null,
      dynamicRangeDb: null,
      error: error.message
    };
  }
}

/**
 * Detect clips (samples at or near digital ceiling)
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} - Clip detection results
 */
async function detectClips(filePath) {
  // Use astats to detect clipping via peak count and level
  const args = [
    '-i', filePath,
    '-af', 'astats=metadata=1:measure_overall=all:measure_perchannel=Peak_count',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse peak count and number of samples
    const peakCountMatch = stderr.match(/Peak count:\s*(\d+)/i);
    const samplesMatch = stderr.match(/Number of samples:\s*(\d+)/i);
    const peakMatch = stderr.match(/Peak level dB:\s*([-\d.]+)/i);
    
    const peakCount = peakCountMatch ? parseInt(peakCountMatch[1]) : 0;
    const samples = samplesMatch ? parseInt(samplesMatch[1]) : 1;
    const peakDb = peakMatch ? parseFloat(peakMatch[1]) : -100;
    
    // Detect clipping if peak is at or above -0.1 dB
    const hasClipping = peakDb >= REFERENCE_VALUES.clipThresholdDb;
    
    // Calculate clip density as percentage of samples at peak
    const clipDensity = samples > 0 ? (peakCount / samples) * 100 : 0;
    
    // Get duration for density per second calculation
    const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    let duration = 0;
    if (durationMatch) {
      duration = parseInt(durationMatch[1]) * 3600 + 
                 parseInt(durationMatch[2]) * 60 + 
                 parseFloat(durationMatch[3]);
    }
    
    return {
      peakCount,
      totalSamples: samples,
      clipDensity,
      clipsPerSecond: duration > 0 ? peakCount / duration : 0,
      duration,
      hasClipping
    };
  } catch (error) {
    console.error('[LimiterStressIndex] Clip detection failed:', error.message);
    return {
      peakCount: 0,
      totalSamples: 0,
      clipDensity: 0,
      clipsPerSecond: 0,
      duration: 0,
      hasClipping: false,
      error: error.message
    };
  }
}

/**
 * Analyze loudness range (LRA) using ebur128
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} - LRA analysis
 */
async function analyzeLRA(filePath) {
  const args = [
    '-i', filePath,
    '-af', 'ebur128=peak=true',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse LRA from ebur128 summary
    const lraMatch = stderr.match(/LRA:\s*([\d.]+)\s*LU/i);
    const integratedMatch = stderr.match(/I:\s*([-\d.]+)\s*LUFS/i);
    const truePeakMatch = stderr.match(/Peak:\s*([-\d.]+)\s*dBFS/i);
    
    return {
      lra: lraMatch ? parseFloat(lraMatch[1]) : null,
      integrated: integratedMatch ? parseFloat(integratedMatch[1]) : null,
      truePeak: truePeakMatch ? parseFloat(truePeakMatch[1]) : null
    };
  } catch (error) {
    console.error('[LimiterStressIndex] LRA analysis failed:', error.message);
    return {
      lra: null,
      integrated: null,
      truePeak: null,
      error: error.message
    };
  }
}

/**
 * Analyze high-frequency transient preservation
 * Compares HF crest factor to overall - lower ratio = blunted attacks
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} - HF transient analysis
 */
async function analyzeHFTransients(filePath) {
  // Analyze high frequencies (4kHz+) for transient content
  const args = [
    '-i', filePath,
    '-af', 'highpass=f=4000,astats=metadata=1:measure_overall=all',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    const hfPeakMatch = stderr.match(/Peak level dB:\s*([-\d.]+)/i);
    const hfRmsMatch = stderr.match(/RMS level dB:\s*([-\d.]+)/i);
    const crestMatch = stderr.match(/Crest factor:\s*([\d.]+)/i);
    
    const hfPeakDb = hfPeakMatch ? parseFloat(hfPeakMatch[1]) : null;
    const hfRmsDb = hfRmsMatch ? parseFloat(hfRmsMatch[1]) : null;
    
    let hfCrestFactorDb = null;
    if (crestMatch) {
      const linearCrest = parseFloat(crestMatch[1]);
      hfCrestFactorDb = 20 * Math.log10(linearCrest);
    } else if (hfPeakDb !== null && hfRmsDb !== null) {
      hfCrestFactorDb = hfPeakDb - hfRmsDb;
    }
    
    return {
      hfPeakDb,
      hfRmsDb,
      hfCrestFactorDb
    };
  } catch (error) {
    console.error('[LimiterStressIndex] HF transient analysis failed:', error.message);
    return {
      hfPeakDb: null,
      hfRmsDb: null,
      hfCrestFactorDb: null,
      error: error.message
    };
  }
}

// ============================================================================
// Stress Index Calculation
// ============================================================================

/**
 * Normalize a value to 0-1 range (inverted: high input = low output)
 * @param {number} value - Input value
 * @param {number} min - Minimum expected value (maps to 1.0 stress)
 * @param {number} max - Maximum expected value (maps to 0.0 stress)
 * @returns {number} - Normalized stress contribution (0-1)
 */
function normalizeInverted(value, min, max) {
  if (value === null || isNaN(value)) return 0;
  if (value <= min) return 1;
  if (value >= max) return 0;
  return (max - value) / (max - min);
}

/**
 * Normalize a value to 0-1 range (direct: high input = high output)
 * @param {number} value - Input value
 * @param {number} min - Minimum expected value (maps to 0.0 stress)
 * @param {number} max - Maximum expected value (maps to 1.0 stress)
 * @returns {number} - Normalized stress contribution (0-1)
 */
function normalizeDirect(value, min, max) {
  if (value === null || isNaN(value)) return 0;
  if (value <= min) return 0;
  if (value >= max) return 1;
  return (value - min) / (max - min);
}

/**
 * Calculate the composite Limiter Stress Index
 * @param {Object} components - All analysis components
 * @returns {Object} - Stress index and breakdown
 */
function calculateStressIndex(components) {
  const { dynamics, clips, lra, hfTransients } = components;
  
  // Calculate individual stress contributions (0-1 scale)
  const stressComponents = {
    // Crest factor: lower = more stress
    crestFactor: normalizeInverted(
      dynamics?.crestFactorDb,
      REFERENCE_VALUES.crestFactorMinDb,
      REFERENCE_VALUES.crestFactorMaxDb
    ),
    
    // Flat factor: higher = more stress
    flatFactor: normalizeDirect(
      dynamics?.flatFactor,
      0,
      REFERENCE_VALUES.flatFactorMax
    ),
    
    // Headroom: lower = more stress (use absolute value of peak)
    headroom: normalizeInverted(
      dynamics?.peakDb != null ? Math.abs(dynamics.peakDb) : 20,
      0,
      REFERENCE_VALUES.headroomSafeDb
    ),
    
    // Clip density: higher = more stress (normalize to max 1% density)
    clipDensity: Math.min((clips?.clipDensity || 0) / 1, 1),
    
    // LRA: lower = more stress (compression)
    lraCompression: normalizeInverted(
      lra?.lra,
      REFERENCE_VALUES.lraMinLu,
      REFERENCE_VALUES.lraMaxLu
    ),
    
    // HF crest: lower = more stress (blunted transients)
    hfTransientLoss: normalizeInverted(
      hfTransients?.hfCrestFactorDb,
      REFERENCE_VALUES.hfCrestMinDb,
      REFERENCE_VALUES.hfCrestMaxDb
    )
  };
  
  // Calculate weighted stress index (0-100 scale)
  const stressIndex = (
    stressComponents.crestFactor * COMPONENT_WEIGHTS.crestFactor +
    stressComponents.flatFactor * COMPONENT_WEIGHTS.flatFactor +
    stressComponents.headroom * COMPONENT_WEIGHTS.headroom +
    stressComponents.clipDensity * COMPONENT_WEIGHTS.clipDensity +
    stressComponents.lraCompression * COMPONENT_WEIGHTS.lraCompression +
    stressComponents.hfTransientLoss * COMPONENT_WEIGHTS.hfTransientLoss
  ) * 100;
  
  return {
    stressIndex: parseFloat(stressIndex.toFixed(1)),
    components: {
      crestFactor: parseFloat((stressComponents.crestFactor * 100).toFixed(1)),
      flatFactor: parseFloat((stressComponents.flatFactor * 100).toFixed(1)),
      headroom: parseFloat((stressComponents.headroom * 100).toFixed(1)),
      clipDensity: parseFloat((stressComponents.clipDensity * 100).toFixed(1)),
      lraCompression: parseFloat((stressComponents.lraCompression * 100).toFixed(1)),
      hfTransientLoss: parseFloat((stressComponents.hfTransientLoss * 100).toFixed(1))
    }
  };
}

/**
 * Classify stress index to status
 * @param {number} stressIndex - Stress index (0-100)
 * @returns {string} - LimiterStressStatus value
 */
function classifyStress(stressIndex) {
  if (stressIndex === null || isNaN(stressIndex)) {
    return 'UNKNOWN';
  }
  if (stressIndex < STRESS_THRESHOLDS.NONE) {
    return LimiterStressStatus.NONE;
  }
  if (stressIndex < STRESS_THRESHOLDS.LIGHT) {
    return LimiterStressStatus.LIGHT;
  }
  if (stressIndex < STRESS_THRESHOLDS.MODERATE) {
    return LimiterStressStatus.MODERATE;
  }
  if (stressIndex < STRESS_THRESHOLDS.HEAVY) {
    return LimiterStressStatus.HEAVY;
  }
  if (stressIndex < STRESS_THRESHOLDS.SEVERE) {
    return LimiterStressStatus.SEVERE;
  }
  return LimiterStressStatus.EXTREME;
}

/**
 * Generate recommendation based on analysis
 * @param {Object} analysis - Full analysis results
 * @returns {string} - Human-readable recommendation
 */
function generateRecommendation(analysis) {
  const { status, stressIndex, components, hasClipping } = analysis;
  
  if (status === LimiterStressStatus.NONE) {
    return 'No apparent limiting detected. Asset has full dynamic range available for processing.';
  }
  
  if (status === LimiterStressStatus.LIGHT) {
    return 'Light limiting detected, typical of gentle peak control. Safe for additional processing.';
  }
  
  if (status === LimiterStressStatus.MODERATE) {
    return 'Moderate limiting consistent with standard mastering. Limit additional gain increase to 1-2 dB.';
  }
  
  // Identify primary stress contributors for targeted advice
  const sortedComponents = Object.entries(components || {})
    .sort(([,a], [,b]) => b - a);
  const topContributor = sortedComponents.length > 0 ? sortedComponents[0][0] : null;
  
  const contributorAdvice = {
    crestFactor: 'Crest factor is very low, indicating heavy peak reduction.',
    flatFactor: 'Waveform shows flattened peaks from brickwall limiting.',
    headroom: 'Peaks are at or near digital ceiling.',
    clipDensity: 'Multiple samples at digital maximum detected.',
    lraCompression: 'Dynamic range is heavily compressed.',
    hfTransientLoss: 'High-frequency transients are blunted, indicating aggressive attack times.'
  };
  
  const advice = topContributor ? contributorAdvice[topContributor] : '';
  
  if (status === LimiterStressStatus.HEAVY) {
    return `Heavy limiting detected. ${advice} Avoid additional limiting to prevent artifacts.`;
  }
  
  if (status === LimiterStressStatus.SEVERE) {
    return `SEVERE limiting detected (stress: ${stressIndex}). ${advice} Asset is at risk of audible distortion. Consider using a less processed source.`;
  }
  
  if (status === LimiterStressStatus.EXTREME) {
    const clipWarning = hasClipping ? ' CLIPPING DETECTED.' : '';
    return `EXTREME limiting detected (stress: ${stressIndex}).${clipWarning} Asset is over-processed and likely contains audible artifacts. Do not apply additional limiting. Strongly recommend using original pre-master.`;
  }
  
  return 'Unable to determine recommendation.';
}

// ============================================================================
// Main Analysis Functions
// ============================================================================

/**
 * Comprehensive limiter stress analysis
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} - Complete limiter stress analysis
 */
async function analyzeLimiterStress(filePath) {
  const startTime = Date.now();
  
  // Run all component analyses in parallel
  const [dynamics, clips, lra, hfTransients] = await Promise.all([
    analyzeDynamics(filePath),
    detectClips(filePath),
    analyzeLRA(filePath),
    analyzeHFTransients(filePath)
  ]);
  
  const processingTimeMs = Date.now() - startTime;
  
  // Calculate composite stress index
  const { stressIndex, components } = calculateStressIndex({
    dynamics,
    clips,
    lra,
    hfTransients
  });
  
  const status = classifyStress(stressIndex);
  
  const result = {
    stressIndex,
    status,
    components,
    metrics: {
      crestFactorDb: dynamics.crestFactorDb,
      flatFactor: dynamics.flatFactor,
      peakDb: dynamics.peakDb,
      dynamicRangeDb: dynamics.dynamicRangeDb,
      peakCount: clips.peakCount,
      clipDensity: clips.clipDensity,
      lra: lra.lra,
      truePeak: lra.truePeak,
      hfCrestFactorDb: hfTransients.hfCrestFactorDb
    },
    hasClipping: clips.hasClipping,
    processingTimeMs
  };
  
  result.recommendation = generateRecommendation(result);
  
  return result;
}

/**
 * Quick check for limiter stress
 * Uses only essential metrics for faster analysis
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} - Quick check result
 */
async function quickCheck(filePath) {
  const startTime = Date.now();
  
  // Run essential analyses only
  const [dynamics, lra] = await Promise.all([
    analyzeDynamics(filePath),
    analyzeLRA(filePath)
  ]);
  
  const processingTimeMs = Date.now() - startTime;
  
  // Simplified stress calculation using main indicators
  const crestStress = normalizeInverted(
    dynamics.crestFactorDb,
    REFERENCE_VALUES.crestFactorMinDb,
    REFERENCE_VALUES.crestFactorMaxDb
  );
  
  const lraStress = normalizeInverted(
    lra.lra,
    REFERENCE_VALUES.lraMinLu,
    REFERENCE_VALUES.lraMaxLu
  );
  
  const headroomStress = normalizeInverted(
    dynamics.peakDb !== null ? Math.abs(dynamics.peakDb) : 20,
    0,
    REFERENCE_VALUES.headroomSafeDb
  );
  
  // Weighted quick estimate (crest factor is primary indicator)
  const quickStressIndex = (crestStress * 0.5 + lraStress * 0.3 + headroomStress * 0.2) * 100;
  const status = classifyStress(quickStressIndex);
  
  return {
    stressIndex: parseFloat(quickStressIndex.toFixed(1)),
    status,
    crestFactorDb: dynamics.crestFactorDb,
    lra: lra.lra,
    peakDb: dynamics.peakDb,
    processingTimeMs
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Main analysis functions
  analyzeLimiterStress,
  quickCheck,
  
  // Component analysis functions
  analyzeDynamics,
  detectClips,
  analyzeLRA,
  analyzeHFTransients,
  
  // Calculation functions
  calculateStressIndex,
  classifyStress,
  generateRecommendation,
  normalizeInverted,
  normalizeDirect,
  
  // Constants
  LimiterStressStatus,
  STRESS_THRESHOLDS,
  COMPONENT_WEIGHTS,
  REFERENCE_VALUES
};
