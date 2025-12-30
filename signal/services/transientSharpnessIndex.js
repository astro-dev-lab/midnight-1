/**
 * Transient Sharpness Index
 * 
 * Analyzes transient characteristics to detect overly blunted (over-compressed)
 * or overly spiky (harsh/clicky) transients. This is critical for:
 * 
 * - Detecting over-compression artifacts
 * - Identifying harsh/clicky transients needing softening
 * - Mastering decisions (preserve vs tame transients)
 * - Limiter/compressor attack time selection
 * - Genre-appropriate transient shaping
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
 * Transient sharpness classifications
 */
const TransientSharpness = {
  VERY_BLUNTED: 'VERY_BLUNTED',   // Severely over-compressed, no punch
  BLUNTED: 'BLUNTED',             // Noticeably soft transients
  SOFT: 'SOFT',                   // Slightly soft but acceptable
  NATURAL: 'NATURAL',             // Well-balanced transients
  SHARP: 'SHARP',                 // Slightly sharp but acceptable
  HARSH: 'HARSH',                 // Noticeably harsh/clicky
  VERY_SPIKY: 'VERY_SPIKY'        // Extremely harsh, needs softening
};

/**
 * Transient density classifications
 */
const TransientDensity = {
  SPARSE: 'SPARSE',       // Few transients (ambient, pads)
  LOW: 'LOW',             // Some transients (ballads)
  MODERATE: 'MODERATE',   // Normal density (pop, rock)
  DENSE: 'DENSE',         // Many transients (EDM, metal)
  VERY_DENSE: 'VERY_DENSE' // Extremely dense (drum & bass)
};

/**
 * Sharpness thresholds based on crest factor and attack characteristics
 * Higher crest = sharper transients, lower = more blunted
 */
const SHARPNESS_THRESHOLDS = {
  VERY_BLUNTED: 3,    // Crest factor < 3 dB
  BLUNTED: 6,         // Crest factor 3-6 dB
  SOFT: 9,            // Crest factor 6-9 dB
  NATURAL_LOW: 9,     // Crest factor 9-15 dB (natural range)
  NATURAL_HIGH: 15,
  SHARP: 18,          // Crest factor 15-18 dB
  HARSH: 22,          // Crest factor 18-22 dB
  VERY_SPIKY: 22      // Crest factor > 22 dB
};

/**
 * Attack time classifications (milliseconds)
 */
const ATTACK_TIMES = {
  INSTANT: 0.1,       // < 0.1ms - extremely fast
  VERY_FAST: 1,       // 0.1-1ms
  FAST: 5,            // 1-5ms
  MEDIUM: 20,         // 5-20ms
  SLOW: 50,           // 20-50ms
  VERY_SLOW: 100      // > 50ms
};

/**
 * Genre-specific transient expectations
 */
const GENRE_TRANSIENT_PROFILES = {
  EDM: { minSharpness: 10, maxSharpness: 20, description: 'Punchy but controlled' },
  POP: { minSharpness: 8, maxSharpness: 16, description: 'Clean and present' },
  ROCK: { minSharpness: 10, maxSharpness: 18, description: 'Aggressive with impact' },
  METAL: { minSharpness: 12, maxSharpness: 22, description: 'Very aggressive' },
  JAZZ: { minSharpness: 12, maxSharpness: 20, description: 'Natural and dynamic' },
  CLASSICAL: { minSharpness: 14, maxSharpness: 24, description: 'Full dynamic range' },
  HIP_HOP: { minSharpness: 8, maxSharpness: 16, description: 'Punchy 808s, controlled' },
  AMBIENT: { minSharpness: 4, maxSharpness: 12, description: 'Soft and smooth' },
  ACOUSTIC: { minSharpness: 10, maxSharpness: 20, description: 'Natural attack' },
  PODCAST: { minSharpness: 6, maxSharpness: 14, description: 'Controlled, easy listening' },
  BROADCAST: { minSharpness: 6, maxSharpness: 14, description: 'Broadcast-safe dynamics' }
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
 * Get detailed audio statistics for transient analysis
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Audio statistics
 */
async function getTransientStats(filePath) {
  const args = [
    '-i', filePath,
    '-af', 'astats=metadata=1:measure_perchannel=none:measure_overall=all',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse statistics
    const rmsMatch = stderr.match(/RMS level dB:\s*([-\d.]+)/);
    const peakMatch = stderr.match(/Peak level dB:\s*([-\d.]+)/);
    const crestMatch = stderr.match(/Crest factor:\s*([-\d.]+)/);
    const flatMatch = stderr.match(/Flat factor:\s*([-\d.]+)/);
    const dynamicMatch = stderr.match(/Dynamic range:\s*([-\d.]+)/);
    const zcrMatch = stderr.match(/Zero crossings rate:\s*([-\d.]+)/);
    
    const rmsLevel = rmsMatch ? parseFloat(rmsMatch[1]) : null;
    const peakLevel = peakMatch ? parseFloat(peakMatch[1]) : null;
    const crestFactor = crestMatch ? parseFloat(crestMatch[1]) : null;
    const flatFactor = flatMatch ? parseFloat(flatMatch[1]) : null;
    const dynamicRange = dynamicMatch ? parseFloat(dynamicMatch[1]) : null;
    const zeroCrossingsRate = zcrMatch ? parseFloat(zcrMatch[1]) : null;
    
    // Calculate crest factor in dB if not provided
    const crestFactorDb = crestFactor !== null 
      ? crestFactor 
      : (peakLevel !== null && rmsLevel !== null ? peakLevel - rmsLevel : null);
    
    return {
      rmsLevel,
      peakLevel,
      crestFactorDb,
      flatFactor,
      dynamicRange,
      zeroCrossingsRate
    };
  } catch (error) {
    console.error('[TransientSharpnessIndex] Stats extraction failed:', error.message);
    return {
      rmsLevel: null,
      peakLevel: null,
      crestFactorDb: null,
      flatFactor: null,
      dynamicRange: null,
      zeroCrossingsRate: null,
      error: error.message
    };
  }
}

/**
 * Analyze transient density using silence detection
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Transient density analysis
 */
async function analyzeTransientDensity(filePath) {
  // Use a gate-like approach to count transient events
  const args = [
    '-i', filePath,
    '-af', 'silencedetect=noise=-35dB:d=0.05',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Count silence starts (each start after a non-silence period = potential transient)
    const silenceStarts = (stderr.match(/silence_start/g) || []).length;
    const silenceEnds = (stderr.match(/silence_end/g) || []).length;
    
    // Get duration
    const durationMatch = stderr.match(/Duration:\s*([\d:.]+)/);
    let duration = 0;
    if (durationMatch) {
      const parts = durationMatch[1].split(':').map(parseFloat);
      if (parts.length === 3) {
        duration = parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
    }
    
    // Transient events (silence end = sound start = transient)
    const transientCount = Math.max(silenceEnds, 1);
    const transientsPerSecond = duration > 0 ? transientCount / duration : 0;
    
    return {
      transientCount,
      duration,
      transientsPerSecond,
      silenceEvents: silenceStarts
    };
  } catch (error) {
    console.error('[TransientSharpnessIndex] Density analysis failed:', error.message);
    return {
      transientCount: null,
      duration: null,
      transientsPerSecond: null,
      error: error.message
    };
  }
}

/**
 * Analyze high-frequency content as indicator of transient sharpness
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} HF analysis for transient sharpness
 */
async function analyzeHighFrequencyContent(filePath) {
  // Use highpass filter to isolate high frequencies (transient energy)
  const args = [
    '-i', filePath,
    '-af', 'highpass=f=8000,astats=metadata=1:measure_perchannel=none:measure_overall=all',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    const rmsMatch = stderr.match(/RMS level dB:\s*([-\d.]+)/);
    const peakMatch = stderr.match(/Peak level dB:\s*([-\d.]+)/);
    
    const hfRmsLevel = rmsMatch ? parseFloat(rmsMatch[1]) : null;
    const hfPeakLevel = peakMatch ? parseFloat(peakMatch[1]) : null;
    
    return {
      hfRmsLevel,
      hfPeakLevel,
      hfCrestFactor: hfPeakLevel !== null && hfRmsLevel !== null 
        ? hfPeakLevel - hfRmsLevel 
        : null
    };
  } catch (error) {
    console.error('[TransientSharpnessIndex] HF analysis failed:', error.message);
    return {
      hfRmsLevel: null,
      hfPeakLevel: null,
      hfCrestFactor: null,
      error: error.message
    };
  }
}

/**
 * Calculate attack sharpness from peak-to-RMS ratio in short windows
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Attack analysis
 */
async function analyzeAttackCharacteristics(filePath) {
  // Use short-window analysis for attack detection
  const args = [
    '-i', filePath,
    '-af', 'astats=metadata=1:reset=10:measure_perchannel=none:measure_overall=all',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse multiple crest factor readings
    const crestMatches = stderr.matchAll(/Crest factor:\s*([-\d.]+)/g);
    const crestValues = [];
    
    for (const match of crestMatches) {
      const value = parseFloat(match[1]);
      if (!isNaN(value) && isFinite(value) && value > 0) {
        crestValues.push(value);
      }
    }
    
    if (crestValues.length === 0) {
      return {
        attackVariance: null,
        maxAttack: null,
        minAttack: null,
        meanAttack: null
      };
    }
    
    const maxAttack = Math.max(...crestValues);
    const minAttack = Math.min(...crestValues);
    const meanAttack = crestValues.reduce((a, b) => a + b, 0) / crestValues.length;
    const variance = crestValues.reduce((sum, v) => sum + Math.pow(v - meanAttack, 2), 0) / crestValues.length;
    
    return {
      attackVariance: Math.sqrt(variance),
      maxAttack,
      minAttack,
      meanAttack,
      attackRange: maxAttack - minAttack,
      sampleCount: crestValues.length
    };
  } catch (error) {
    console.error('[TransientSharpnessIndex] Attack analysis failed:', error.message);
    return {
      attackVariance: null,
      maxAttack: null,
      minAttack: null,
      meanAttack: null,
      error: error.message
    };
  }
}

// ============================================================================
// Classification Functions
// ============================================================================

/**
 * Classify transient sharpness based on crest factor
 * @param {number} crestFactorDb - Crest factor in dB
 * @returns {string} TransientSharpness value
 */
function classifySharpness(crestFactorDb) {
  if (crestFactorDb === null || !isFinite(crestFactorDb)) {
    return TransientSharpness.NATURAL;
  }
  
  if (crestFactorDb < SHARPNESS_THRESHOLDS.VERY_BLUNTED) {
    return TransientSharpness.VERY_BLUNTED;
  } else if (crestFactorDb < SHARPNESS_THRESHOLDS.BLUNTED) {
    return TransientSharpness.BLUNTED;
  } else if (crestFactorDb < SHARPNESS_THRESHOLDS.SOFT) {
    return TransientSharpness.SOFT;
  } else if (crestFactorDb <= SHARPNESS_THRESHOLDS.NATURAL_HIGH) {
    return TransientSharpness.NATURAL;
  } else if (crestFactorDb <= SHARPNESS_THRESHOLDS.SHARP) {
    return TransientSharpness.SHARP;
  } else if (crestFactorDb <= SHARPNESS_THRESHOLDS.HARSH) {
    return TransientSharpness.HARSH;
  } else {
    return TransientSharpness.VERY_SPIKY;
  }
}

/**
 * Classify transient density
 * @param {number} transientsPerSecond - Transient rate
 * @returns {string} TransientDensity value
 */
function classifyDensity(transientsPerSecond) {
  if (transientsPerSecond === null || !isFinite(transientsPerSecond)) {
    return TransientDensity.MODERATE;
  }
  
  if (transientsPerSecond < 0.5) {
    return TransientDensity.SPARSE;
  } else if (transientsPerSecond < 2) {
    return TransientDensity.LOW;
  } else if (transientsPerSecond < 5) {
    return TransientDensity.MODERATE;
  } else if (transientsPerSecond < 10) {
    return TransientDensity.DENSE;
  } else {
    return TransientDensity.VERY_DENSE;
  }
}

/**
 * Get sharpness description
 * @param {string} sharpness - TransientSharpness value
 * @returns {string} Human-readable description
 */
function getSharpnessDescription(sharpness) {
  const descriptions = {
    [TransientSharpness.VERY_BLUNTED]: 'Severely over-compressed with no punch or attack. Transients are almost completely flattened.',
    [TransientSharpness.BLUNTED]: 'Noticeably soft transients indicating significant compression or limiting. May sound flat or lifeless.',
    [TransientSharpness.SOFT]: 'Slightly soft transients. Acceptable for some genres but may lack impact.',
    [TransientSharpness.NATURAL]: 'Well-balanced transients with appropriate punch and control. Ideal for most content.',
    [TransientSharpness.SHARP]: 'Slightly sharp transients. May add excitement but could be fatiguing in long listening.',
    [TransientSharpness.HARSH]: 'Noticeably harsh or clicky transients. May cause listener fatigue.',
    [TransientSharpness.VERY_SPIKY]: 'Extremely harsh transients with painful clicks or pops. Needs significant softening.'
  };
  
  return descriptions[sharpness] || 'Unknown transient characteristic';
}

/**
 * Get processing recommendation based on sharpness
 * @param {string} sharpness - TransientSharpness value
 * @param {Object} stats - Additional analysis stats
 * @returns {Object} Processing recommendation
 */
function getProcessingRecommendation(sharpness, stats = {}) {
  const recommendations = {
    [TransientSharpness.VERY_BLUNTED]: {
      action: 'RESTORE_TRANSIENTS',
      description: 'Apply transient shaper to restore attack. Consider using a less processed source.',
      transientShaperAttack: 'increase',
      transientShaperAmount: 30, // % increase
      compressorAdvice: 'Avoid additional compression',
      limiterAttack: 'slow',
      priority: 'high'
    },
    [TransientSharpness.BLUNTED]: {
      action: 'ENHANCE_TRANSIENTS',
      description: 'Gently enhance transients to add punch and presence.',
      transientShaperAttack: 'increase',
      transientShaperAmount: 15,
      compressorAdvice: 'Use parallel compression only',
      limiterAttack: 'medium-slow',
      priority: 'medium'
    },
    [TransientSharpness.SOFT]: {
      action: 'CONSIDER_ENHANCEMENT',
      description: 'Transients are acceptable but could be enhanced for more impact.',
      transientShaperAttack: 'slight increase',
      transientShaperAmount: 5,
      compressorAdvice: 'Standard compression is safe',
      limiterAttack: 'medium',
      priority: 'low'
    },
    [TransientSharpness.NATURAL]: {
      action: 'PRESERVE',
      description: 'Transients are well-balanced. Preserve current characteristics.',
      transientShaperAttack: 'none',
      transientShaperAmount: 0,
      compressorAdvice: 'Standard processing is appropriate',
      limiterAttack: 'adaptive',
      priority: 'none'
    },
    [TransientSharpness.SHARP]: {
      action: 'CONSIDER_SOFTENING',
      description: 'Transients are slightly sharp. May benefit from gentle softening for extended listening.',
      transientShaperAttack: 'slight decrease',
      transientShaperAmount: -5,
      compressorAdvice: 'Moderate compression acceptable',
      limiterAttack: 'medium-fast',
      priority: 'low'
    },
    [TransientSharpness.HARSH]: {
      action: 'SOFTEN_TRANSIENTS',
      description: 'Apply transient shaper to reduce harshness and clicking.',
      transientShaperAttack: 'decrease',
      transientShaperAmount: -15,
      compressorAdvice: 'Use soft-knee compression',
      limiterAttack: 'fast',
      priority: 'medium'
    },
    [TransientSharpness.VERY_SPIKY]: {
      action: 'SIGNIFICANT_SOFTENING',
      description: 'Significant transient softening required to prevent listener fatigue.',
      transientShaperAttack: 'significant decrease',
      transientShaperAmount: -30,
      compressorAdvice: 'Apply compression with fast attack',
      limiterAttack: 'very-fast',
      priority: 'high'
    }
  };
  
  return recommendations[sharpness] || recommendations[TransientSharpness.NATURAL];
}

/**
 * Check if transient sharpness is appropriate for a genre
 * @param {number} crestFactorDb - Measured crest factor
 * @param {string} genre - Target genre
 * @returns {Object} Genre appropriateness assessment
 */
function assessGenreAppropriateness(crestFactorDb, genre) {
  const profile = GENRE_TRANSIENT_PROFILES[genre.toUpperCase()] || GENRE_TRANSIENT_PROFILES.POP;
  
  if (crestFactorDb === null) {
    return {
      genre,
      isAppropriate: null,
      reason: 'Unable to assess - crest factor not available'
    };
  }
  
  const isAppropriate = crestFactorDb >= profile.minSharpness && crestFactorDb <= profile.maxSharpness;
  const deviation = crestFactorDb < profile.minSharpness 
    ? profile.minSharpness - crestFactorDb 
    : (crestFactorDb > profile.maxSharpness ? crestFactorDb - profile.maxSharpness : 0);
  
  let reason;
  if (isAppropriate) {
    reason = `Transient sharpness matches ${genre} expectations (${profile.description})`;
  } else if (crestFactorDb < profile.minSharpness) {
    reason = `Transients are ${deviation.toFixed(1)} dB softer than typical for ${genre}`;
  } else {
    reason = `Transients are ${deviation.toFixed(1)} dB sharper than typical for ${genre}`;
  }
  
  return {
    genre,
    profile,
    measured: crestFactorDb,
    isAppropriate,
    deviation,
    reason
  };
}

/**
 * Calculate a normalized sharpness index (0-100)
 * @param {number} crestFactorDb - Crest factor in dB
 * @returns {number} Normalized sharpness index
 */
function calculateSharpnessIndex(crestFactorDb) {
  if (crestFactorDb === null || !isFinite(crestFactorDb)) {
    return 50; // Default to middle
  }
  
  // Map crest factor to 0-100 scale
  // 0 dB = 0 (completely flat), 25 dB+ = 100 (extremely spiky)
  const normalized = Math.min(100, Math.max(0, (crestFactorDb / 25) * 100));
  return Math.round(normalized * 10) / 10;
}

/**
 * Determine if transients need attention
 * @param {string} sharpness - TransientSharpness classification
 * @returns {boolean} Whether transients need processing
 */
function needsAttention(sharpness) {
  const attentionRequired = [
    TransientSharpness.VERY_BLUNTED,
    TransientSharpness.BLUNTED,
    TransientSharpness.HARSH,
    TransientSharpness.VERY_SPIKY
  ];
  
  return attentionRequired.includes(sharpness);
}

/**
 * Get severity level for problem reporting
 * @param {string} sharpness - TransientSharpness classification
 * @returns {string} Severity level
 */
function getSeverity(sharpness) {
  const severityMap = {
    [TransientSharpness.VERY_BLUNTED]: 'high',
    [TransientSharpness.BLUNTED]: 'medium',
    [TransientSharpness.SOFT]: 'low',
    [TransientSharpness.NATURAL]: 'none',
    [TransientSharpness.SHARP]: 'low',
    [TransientSharpness.HARSH]: 'medium',
    [TransientSharpness.VERY_SPIKY]: 'high'
  };
  
  return severityMap[sharpness] || 'none';
}

// ============================================================================
// Main Analysis Functions
// ============================================================================

/**
 * Perform comprehensive transient sharpness analysis
 * @param {string} filePath - Path to audio file
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Complete transient analysis
 */
async function analyzeTransientSharpness(filePath, options = {}) {
  const startTime = Date.now();
  const { genre = null } = options;
  
  // Run all analyses in parallel
  const [stats, density, hfContent, attack] = await Promise.all([
    getTransientStats(filePath),
    analyzeTransientDensity(filePath),
    analyzeHighFrequencyContent(filePath),
    analyzeAttackCharacteristics(filePath)
  ]);
  
  // Calculate sharpness index
  const sharpnessIndex = calculateSharpnessIndex(stats.crestFactorDb);
  
  // Classify sharpness
  const sharpness = classifySharpness(stats.crestFactorDb);
  const densityClass = classifyDensity(density.transientsPerSecond);
  
  // Get recommendations
  const recommendation = getProcessingRecommendation(sharpness, stats);
  
  // Check genre appropriateness if provided
  const genreAssessment = genre 
    ? assessGenreAppropriateness(stats.crestFactorDb, genre)
    : null;
  
  return {
    filePath,
    
    // Core metrics
    crestFactorDb: stats.crestFactorDb,
    sharpnessIndex,
    
    // Classifications
    sharpness,
    sharpnessDescription: getSharpnessDescription(sharpness),
    density: densityClass,
    
    // Detailed stats
    stats: {
      rmsLevel: stats.rmsLevel,
      peakLevel: stats.peakLevel,
      dynamicRange: stats.dynamicRange,
      flatFactor: stats.flatFactor
    },
    
    // Transient density
    transientDensity: {
      count: density.transientCount,
      perSecond: density.transientsPerSecond,
      classification: densityClass
    },
    
    // High frequency analysis (transient energy indicator)
    highFrequency: {
      rmsLevel: hfContent.hfRmsLevel,
      peakLevel: hfContent.hfPeakLevel,
      crestFactor: hfContent.hfCrestFactor
    },
    
    // Attack characteristics
    attack: {
      variance: attack.attackVariance,
      max: attack.maxAttack,
      min: attack.minAttack,
      mean: attack.meanAttack,
      range: attack.attackRange
    },
    
    // Assessment
    needsAttention: needsAttention(sharpness),
    severity: getSeverity(sharpness),
    
    // Recommendations
    recommendation,
    
    // Genre assessment
    genreAssessment,
    
    // Analysis metadata
    analysisTimeMs: Date.now() - startTime
  };
}

/**
 * Quick transient check (faster, less detail)
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Quick transient assessment
 */
async function quickCheck(filePath) {
  const startTime = Date.now();
  
  const stats = await getTransientStats(filePath);
  
  const sharpness = classifySharpness(stats.crestFactorDb);
  const sharpnessIndex = calculateSharpnessIndex(stats.crestFactorDb);
  
  return {
    crestFactorDb: stats.crestFactorDb,
    sharpnessIndex,
    sharpness,
    needsAttention: needsAttention(sharpness),
    severity: getSeverity(sharpness),
    analysisTimeMs: Date.now() - startTime
  };
}

/**
 * Check if transients are safe for limiting
 * @param {string} sharpness - TransientSharpness classification
 * @returns {Object} Limiting safety assessment
 */
function isSafeForLimiting(sharpness) {
  const safeClasses = [
    TransientSharpness.NATURAL,
    TransientSharpness.SHARP,
    TransientSharpness.HARSH // Can handle limiting
  ];
  
  const unsafeClasses = [
    TransientSharpness.VERY_BLUNTED,
    TransientSharpness.BLUNTED,
    TransientSharpness.SOFT
  ];
  
  if (safeClasses.includes(sharpness)) {
    return {
      safe: true,
      reason: 'Transients have sufficient headroom for limiting',
      recommendedAttack: sharpness === TransientSharpness.HARSH ? 'fast' : 'medium'
    };
  }
  
  if (unsafeClasses.includes(sharpness)) {
    return {
      safe: false,
      reason: 'Transients are already blunted - additional limiting may cause artifacts',
      recommendedAttack: 'slow'
    };
  }
  
  return {
    safe: false,
    reason: 'Transients are very spiky - use fast attack to control',
    recommendedAttack: 'very-fast'
  };
}

/**
 * Get available genres for assessment
 * @returns {string[]} List of genre names
 */
function getAvailableGenres() {
  return Object.keys(GENRE_TRANSIENT_PROFILES);
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Main functions
  analyzeTransientSharpness,
  quickCheck,
  
  // Core analysis
  getTransientStats,
  analyzeTransientDensity,
  analyzeHighFrequencyContent,
  analyzeAttackCharacteristics,
  
  // Classification
  classifySharpness,
  classifyDensity,
  calculateSharpnessIndex,
  
  // Assessment
  getSharpnessDescription,
  getProcessingRecommendation,
  assessGenreAppropriateness,
  needsAttention,
  getSeverity,
  isSafeForLimiting,
  
  // Utilities
  getAvailableGenres,
  
  // Constants
  TransientSharpness,
  TransientDensity,
  SHARPNESS_THRESHOLDS,
  ATTACK_TIMES,
  GENRE_TRANSIENT_PROFILES
};
