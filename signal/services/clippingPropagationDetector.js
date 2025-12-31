/**
 * Clipping Propagation Detector
 * 
 * Determines whether clipping occurs upstream (source recording) or
 * downstream (processing-induced), and measures severity.
 * 
 * Detection methods:
 * - Consecutive samples at digital ceiling (hard clipping)
 * - Flat factor analysis (waveform flatness)
 * - Temporal distribution of clipping events
 * - Harmonic distortion patterns
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Analysis provides actionable
 * metrics for transformation parameter selection.
 */

const { spawn } = require('child_process');

// ============================================================================
// Configuration
// ============================================================================

const FFMPEG_PATH = 'ffmpeg';
const FFPROBE_PATH = 'ffprobe';

/**
 * Clipping source classification
 */
const ClippingSource = {
  NONE: 'NONE',                 // No clipping detected
  UPSTREAM: 'UPSTREAM',         // Source material clipped (recording)
  DOWNSTREAM: 'DOWNSTREAM',     // Processing-induced clipping
  MIXED: 'MIXED',               // Both sources present
  SOFT_CLIP: 'SOFT_CLIP',       // Soft limiting artifacts (not hard clipping)
  UNDETERMINED: 'UNDETERMINED'  // Cannot determine source
};

/**
 * Clipping severity levels
 */
const ClippingSeverity = {
  NONE: 'NONE',       // No clipping
  MINOR: 'MINOR',     // < 0.01% samples affected
  MODERATE: 'MODERATE', // 0.01% - 0.1%
  SEVERE: 'SEVERE',   // 0.1% - 1%
  EXTREME: 'EXTREME'  // > 1% samples affected
};

/**
 * Status descriptions for reporting
 */
const STATUS_DESCRIPTIONS = {
  [ClippingSource.NONE]: 'No clipping detected - signal stays within digital headroom',
  [ClippingSource.UPSTREAM]: 'Clipping originated in source recording - baked into the asset',
  [ClippingSource.DOWNSTREAM]: 'Clipping introduced by processing - may be correctable upstream',
  [ClippingSource.MIXED]: 'Both source and processing clipping detected',
  [ClippingSource.SOFT_CLIP]: 'Soft limiting detected - controlled saturation, not hard clipping',
  [ClippingSource.UNDETERMINED]: 'Clipping detected but source could not be determined'
};

/**
 * Threshold configuration
 */
const THRESHOLDS = {
  // Clipping detection
  CLIP_DETECTION: {
    CEILING_DB: -0.1,           // Samples above this are at ceiling
    CONSECUTIVE_MIN: 3,         // Minimum consecutive samples for hard clip
    SOFT_CLIP_CONSECUTIVE: 2    // 1-2 samples suggests soft limiting
  },
  // Clip density thresholds (percentage of total samples)
  DENSITY: {
    MINOR: 0.0001,    // 0.01%
    MODERATE: 0.001,  // 0.1%
    SEVERE: 0.01,     // 1%
    EXTREME: 0.01     // > 1%
  },
  // Waveform indicators
  WAVEFORM: {
    FLAT_FACTOR_HARD_CLIP: 0.3,   // High flat factor = hard clipping
    FLAT_FACTOR_SOFT_CLIP: 0.1,   // Moderate = soft limiting
    ASYMMETRY_THRESHOLD: 0.15     // Significant asymmetry
  },
  // Temporal distribution (for upstream vs downstream classification)
  TEMPORAL: {
    CONSISTENT_THRESHOLD: 0.7,    // >70% even distribution = upstream
    ENDPOINT_THRESHOLD: 0.5       // >50% at end = downstream processing
  }
};

/**
 * Reference values
 */
const REFERENCE = {
  DIGITAL_CEILING_LINEAR: 1.0,
  DIGITAL_CEILING_DB: 0.0,
  ANALYSIS_WINDOW_MS: 100,     // Window size for temporal analysis
  MIN_CLIP_DURATION_SAMPLES: 1
};

// ============================================================================
// FFmpeg Execution
// ============================================================================

/**
 * Execute a command and return stdout/stderr
 */
function execCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args);
    let stdout = '';
    let stderr = '';
    
    const timeout = options.timeout || 30000;
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);
    
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} exited with code ${code}: ${stderr}`));
      }
    });
    
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * Get audio duration and sample count
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Duration and sample info
 */
async function getAudioInfo(filePath) {
  const args = [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=duration,sample_rate,channels',
    '-of', 'json',
    filePath
  ];
  
  try {
    const { stdout } = await execCommand(FFPROBE_PATH, args);
    const data = JSON.parse(stdout);
    const stream = data.streams?.[0] || {};
    
    const duration = parseFloat(stream.duration) || 0;
    const sampleRate = parseInt(stream.sample_rate) || 44100;
    const channels = parseInt(stream.channels) || 2;
    const totalSamples = Math.floor(duration * sampleRate * channels);
    
    return { duration, sampleRate, channels, totalSamples };
  } catch (error) {
    console.error('[ClippingPropagation] Audio info failed:', error.message);
    return { duration: 0, sampleRate: 44100, channels: 2, totalSamples: 0 };
  }
}

/**
 * Analyze clipping using astats filter
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Clipping statistics
 */
async function analyzeClipping(filePath) {
  const args = [
    '-i', filePath,
    '-af', 'astats=metadata=1:measure_overall=all:measure_perchannel=all',
    '-f', 'null', '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse overall statistics
    const peakMatch = stderr.match(/Overall.*Peak level[^:]*:\s*([-\d.]+)/i);
    const flatMatch = stderr.match(/Overall.*Flat factor[^:]*:\s*([\d.]+)/i);
    const crestMatch = stderr.match(/Overall.*Crest factor[^:]*:\s*([\d.]+)/i);
    const minMatch = stderr.match(/Overall.*Min level[^:]*:\s*([-\d.]+)/i);
    const maxMatch = stderr.match(/Overall.*Max level[^:]*:\s*([-\d.]+)/i);
    const dcMatch = stderr.match(/Overall.*DC offset[^:]*:\s*([-\d.]+)/i);
    const numSamplesMatch = stderr.match(/Overall.*Number of samples[^:]*:\s*(\d+)/i);
    
    // Peak count indicates samples at maximum
    const peakCountMatch = stderr.match(/Peak count[^:]*:\s*(\d+)/i);
    
    // Parse per-channel data for asymmetry detection
    const channelData = [];
    const channelMatches = stderr.matchAll(/Channel:\s*(\d+)[\s\S]*?Peak level[^:]*:\s*([-\d.]+)[\s\S]*?Flat factor[^:]*:\s*([\d.]+)/gi);
    for (const match of channelMatches) {
      channelData.push({
        channel: parseInt(match[1]),
        peakDb: parseFloat(match[2]),
        flatFactor: parseFloat(match[3])
      });
    }
    
    return {
      peakDb: peakMatch ? parseFloat(peakMatch[1]) : -Infinity,
      flatFactor: flatMatch ? parseFloat(flatMatch[1]) : 0,
      crestFactorDb: crestMatch ? parseFloat(crestMatch[1]) : 20,
      minLevel: minMatch ? parseFloat(minMatch[1]) : -1,
      maxLevel: maxMatch ? parseFloat(maxMatch[1]) : 1,
      dcOffset: dcMatch ? parseFloat(dcMatch[1]) : 0,
      numSamples: numSamplesMatch ? parseInt(numSamplesMatch[1]) : 0,
      peakCount: peakCountMatch ? parseInt(peakCountMatch[1]) : 0,
      channelData,
      isValid: peakMatch !== null
    };
  } catch (error) {
    console.error('[ClippingPropagation] Clipping analysis failed:', error.message);
    return {
      peakDb: -Infinity,
      flatFactor: 0,
      crestFactorDb: 20,
      peakCount: 0,
      channelData: [],
      isValid: false
    };
  }
}

/**
 * Analyze clipping distribution over time using windowed analysis
 * @param {string} filePath - Path to audio file
 * @param {number} windowMs - Analysis window in milliseconds
 * @returns {Promise<Object>} Temporal distribution of clipping
 */
async function analyzeTemporalDistribution(filePath, windowMs = 500) {
  const args = [
    '-i', filePath,
    '-af', `asetnsamples=n=22050,astats=metadata=1:reset=1`,
    '-f', 'null', '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse windowed peak levels
    const windows = [];
    const windowMatches = stderr.matchAll(/Parsed_astats[\s\S]*?Peak level[^:]*:\s*([-\d.]+)/gi);
    
    for (const match of windowMatches) {
      const peakDb = parseFloat(match[1]);
      windows.push({
        peakDb,
        isClipping: peakDb > THRESHOLDS.CLIP_DETECTION.CEILING_DB
      });
    }
    
    if (windows.length === 0) {
      return {
        windowCount: 0,
        clippingWindows: 0,
        distribution: 'UNKNOWN',
        firstClipPosition: null,
        lastClipPosition: null
      };
    }
    
    // Find clipping windows
    const clippingIndices = windows
      .map((w, i) => w.isClipping ? i : -1)
      .filter(i => i >= 0);
    
    // Analyze distribution
    let distribution = 'NONE';
    if (clippingIndices.length > 0) {
      const firstClip = clippingIndices[0];
      const lastClip = clippingIndices[clippingIndices.length - 1];
      const totalWindows = windows.length;
      
      // Check if clipping is concentrated at beginning, end, or spread throughout
      const firstThird = clippingIndices.filter(i => i < totalWindows / 3).length;
      const lastThird = clippingIndices.filter(i => i >= 2 * totalWindows / 3).length;
      const middleThird = clippingIndices.length - firstThird - lastThird;
      
      const maxSection = Math.max(firstThird, middleThird, lastThird);
      const evenness = 1 - (maxSection / clippingIndices.length);
      
      if (evenness > THRESHOLDS.TEMPORAL.CONSISTENT_THRESHOLD) {
        distribution = 'CONSISTENT'; // Spread evenly = likely upstream
      } else if (lastThird > firstThird && lastThird > middleThird) {
        distribution = 'END_HEAVY'; // Concentrated at end = likely downstream
      } else if (firstThird > lastThird && firstThird > middleThird) {
        distribution = 'START_HEAVY';
      } else {
        distribution = 'SCATTERED';
      }
      
      return {
        windowCount: windows.length,
        clippingWindows: clippingIndices.length,
        clippingRatio: clippingIndices.length / windows.length,
        distribution,
        firstClipPosition: firstClip / windows.length,
        lastClipPosition: lastClip / windows.length,
        evenness
      };
    }
    
    return {
      windowCount: windows.length,
      clippingWindows: 0,
      clippingRatio: 0,
      distribution: 'NONE',
      firstClipPosition: null,
      lastClipPosition: null
    };
  } catch (error) {
    console.error('[ClippingPropagation] Temporal analysis failed:', error.message);
    return {
      windowCount: 0,
      clippingWindows: 0,
      distribution: 'UNKNOWN'
    };
  }
}

// ============================================================================
// Classification Functions
// ============================================================================

/**
 * Calculate clip density (percentage of clipped samples)
 * @param {number} clippedSamples - Number of clipped samples
 * @param {number} totalSamples - Total sample count
 * @returns {number} Density as percentage (0-100)
 */
function calculateClipDensity(clippedSamples, totalSamples) {
  if (totalSamples === 0) return 0;
  return (clippedSamples / totalSamples) * 100;
}

/**
 * Classify clipping severity based on density
 * @param {number} densityPercent - Clip density percentage
 * @returns {string} Severity classification
 */
function classifySeverity(densityPercent) {
  if (densityPercent === 0) return ClippingSeverity.NONE;
  if (densityPercent < THRESHOLDS.DENSITY.MINOR * 100) return ClippingSeverity.MINOR;
  if (densityPercent < THRESHOLDS.DENSITY.MODERATE * 100) return ClippingSeverity.MODERATE;
  if (densityPercent < THRESHOLDS.DENSITY.SEVERE * 100) return ClippingSeverity.SEVERE;
  return ClippingSeverity.EXTREME;
}

/**
 * Determine clipping source based on analysis
 * @param {Object} clippingData - Clipping analysis data
 * @param {Object} temporalData - Temporal distribution data
 * @returns {string} Clipping source classification
 */
function determineSource(clippingData, temporalData) {
  const { flatFactor, peakDb, peakCount } = clippingData;
  const { distribution, clippingWindows } = temporalData;
  
  // No clipping if peak is well below ceiling and no flat factor
  if (peakDb < THRESHOLDS.CLIP_DETECTION.CEILING_DB && flatFactor < THRESHOLDS.WAVEFORM.FLAT_FACTOR_SOFT_CLIP) {
    return ClippingSource.NONE;
  }
  
  // Soft clipping if moderate flat factor but not at digital ceiling
  if (flatFactor >= THRESHOLDS.WAVEFORM.FLAT_FACTOR_SOFT_CLIP && 
      flatFactor < THRESHOLDS.WAVEFORM.FLAT_FACTOR_HARD_CLIP &&
      peakDb < -0.01) {
    return ClippingSource.SOFT_CLIP;
  }
  
  // Hard clipping detection
  if (peakDb >= THRESHOLDS.CLIP_DETECTION.CEILING_DB || flatFactor >= THRESHOLDS.WAVEFORM.FLAT_FACTOR_HARD_CLIP) {
    // Use temporal distribution to determine source
    switch (distribution) {
      case 'CONSISTENT':
        // Evenly distributed clipping suggests source material
        return ClippingSource.UPSTREAM;
      case 'END_HEAVY':
        // Clipping concentrated at end suggests processing buildup
        return ClippingSource.DOWNSTREAM;
      case 'START_HEAVY':
        // Could be either - possibly aggressive intro
        return ClippingSource.UNDETERMINED;
      case 'SCATTERED':
        // Mix of sources
        return ClippingSource.MIXED;
      default:
        return ClippingSource.UNDETERMINED;
    }
  }
  
  return ClippingSource.NONE;
}

/**
 * Calculate overall clipping score (0-100)
 * @param {Object} clippingData - Clipping analysis
 * @param {Object} temporalData - Temporal distribution
 * @returns {number} Score 0-100
 */
function calculateClippingScore(clippingData, temporalData) {
  const { flatFactor, peakDb, crestFactorDb } = clippingData;
  const { clippingRatio = 0 } = temporalData;
  
  let score = 0;
  
  // Peak level contribution (0-30)
  if (peakDb >= 0) {
    score += 30;
  } else if (peakDb > THRESHOLDS.CLIP_DETECTION.CEILING_DB) {
    score += 20 + (10 * (peakDb - THRESHOLDS.CLIP_DETECTION.CEILING_DB) / 0.1);
  }
  
  // Flat factor contribution (0-40)
  const flatNorm = Math.min(flatFactor / THRESHOLDS.WAVEFORM.FLAT_FACTOR_HARD_CLIP, 1.0);
  score += flatNorm * 40;
  
  // Clipping ratio contribution (0-20)
  score += Math.min(clippingRatio * 100, 20);
  
  // Low crest factor bonus (0-10) - indicates over-limiting
  if (crestFactorDb < 6) {
    score += 10 * (1 - crestFactorDb / 6);
  }
  
  return Math.min(100, Math.max(0, Math.round(score)));
}

/**
 * Generate recommendations based on clipping analysis
 * @param {Object} analysis - Complete analysis
 * @returns {Array<string>} Recommendations
 */
function generateRecommendations(analysis) {
  const recommendations = [];
  
  if (!analysis) return recommendations;
  
  const { source, severity, flatFactor, peakDb } = analysis;
  
  if (source === ClippingSource.NONE) {
    recommendations.push('No clipping detected - signal integrity is maintained');
    return recommendations;
  }
  
  if (source === ClippingSource.UPSTREAM) {
    recommendations.push('Clipping originated in source - consider requesting unclipped source material');
    if (severity === ClippingSeverity.SEVERE || severity === ClippingSeverity.EXTREME) {
      recommendations.push('Severe source clipping - de-clipping processing may help but cannot fully restore');
    }
  }
  
  if (source === ClippingSource.DOWNSTREAM) {
    recommendations.push('Clipping introduced by processing - review gain staging in transformation chain');
    recommendations.push('Reduce input gain or add limiting before clipping stage');
  }
  
  if (source === ClippingSource.MIXED) {
    recommendations.push('Both source and processing clipping detected - address processing chain first');
    recommendations.push('Consider requesting cleaner source material for best results');
  }
  
  if (source === ClippingSource.SOFT_CLIP) {
    recommendations.push('Soft limiting artifacts detected - generally acceptable but monitor for distortion');
    if (flatFactor > 0.2) {
      recommendations.push('High soft-clip density - reduce limiter drive for cleaner output');
    }
  }
  
  if (severity === ClippingSeverity.EXTREME) {
    recommendations.push('Critical: Extreme clipping will be audible - this asset requires remediation');
  }
  
  return recommendations;
}

// ============================================================================
// Main Analysis Functions
// ============================================================================

/**
 * Full clipping propagation analysis
 * @param {string} filePath - Path to audio file
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Complete analysis
 */
async function analyze(filePath, options = {}) {
  const startTime = Date.now();
  
  try {
    // Run analyses in parallel
    const [audioInfo, clippingData, temporalData] = await Promise.all([
      getAudioInfo(filePath),
      analyzeClipping(filePath),
      analyzeTemporalDistribution(filePath)
    ]);
    
    // Calculate derived metrics
    const clipDensity = calculateClipDensity(clippingData.peakCount, audioInfo.totalSamples);
    const severity = classifySeverity(clipDensity);
    const source = determineSource(clippingData, temporalData);
    const clippingScore = calculateClippingScore(clippingData, temporalData);
    
    const analysis = {
      source,
      severity,
      description: STATUS_DESCRIPTIONS[source],
      clippingScore,
      
      // Clipping metrics
      peakDb: clippingData.peakDb,
      flatFactor: clippingData.flatFactor,
      crestFactorDb: clippingData.crestFactorDb,
      clipDensityPercent: clipDensity,
      
      // Sample counts
      clippedSamples: clippingData.peakCount,
      totalSamples: audioInfo.totalSamples,
      
      // Temporal distribution
      temporalDistribution: temporalData.distribution,
      clippingWindowRatio: temporalData.clippingRatio || 0,
      firstClipPosition: temporalData.firstClipPosition,
      lastClipPosition: temporalData.lastClipPosition,
      
      // Channel asymmetry
      channelData: clippingData.channelData,
      hasAsymmetricClipping: detectAsymmetry(clippingData.channelData),
      
      // Metadata
      duration: audioInfo.duration,
      sampleRate: audioInfo.sampleRate,
      analysisTimeMs: Date.now() - startTime,
      confidence: clippingData.isValid ? 0.9 : 0.4
    };
    
    analysis.recommendations = generateRecommendations(analysis);
    
    return analysis;
  } catch (error) {
    console.error('[ClippingPropagation] Analysis failed:', error.message);
    return {
      source: ClippingSource.UNDETERMINED,
      severity: ClippingSeverity.NONE,
      description: 'Analysis incomplete',
      clippingScore: 0,
      error: error.message,
      analysisTimeMs: Date.now() - startTime,
      confidence: 0
    };
  }
}

/**
 * Detect channel asymmetry in clipping
 * @param {Array} channelData - Per-channel analysis
 * @returns {boolean} True if asymmetric
 */
function detectAsymmetry(channelData) {
  if (!channelData || channelData.length < 2) return false;
  
  const peaks = channelData.map(c => c.peakDb);
  const maxDiff = Math.max(...peaks) - Math.min(...peaks);
  
  return maxDiff > 1.0; // More than 1dB difference
}

/**
 * Quick clipping check (faster, essential metrics only)
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Quick analysis
 */
async function quickCheck(filePath) {
  const startTime = Date.now();
  
  try {
    const clippingData = await analyzeClipping(filePath);
    
    // Quick source determination based on flat factor and peak
    let source = ClippingSource.NONE;
    if (clippingData.peakDb >= THRESHOLDS.CLIP_DETECTION.CEILING_DB) {
      source = ClippingSource.UNDETERMINED;
      if (clippingData.flatFactor >= THRESHOLDS.WAVEFORM.FLAT_FACTOR_HARD_CLIP) {
        source = ClippingSource.UPSTREAM; // High flat factor suggests baked-in
      }
    } else if (clippingData.flatFactor >= THRESHOLDS.WAVEFORM.FLAT_FACTOR_SOFT_CLIP) {
      source = ClippingSource.SOFT_CLIP;
    }
    
    const severity = clippingData.flatFactor >= THRESHOLDS.WAVEFORM.FLAT_FACTOR_HARD_CLIP ? 
      ClippingSeverity.SEVERE : 
      clippingData.flatFactor >= THRESHOLDS.WAVEFORM.FLAT_FACTOR_SOFT_CLIP ?
        ClippingSeverity.MODERATE : ClippingSeverity.NONE;
    
    return {
      source,
      severity,
      peakDb: clippingData.peakDb,
      flatFactor: clippingData.flatFactor,
      crestFactorDb: clippingData.crestFactorDb,
      clippingScore: calculateClippingScore(clippingData, {}),
      analysisTimeMs: Date.now() - startTime,
      confidence: clippingData.isValid ? 0.8 : 0.3
    };
  } catch (error) {
    console.error('[ClippingPropagation] Quick check failed:', error.message);
    return {
      source: ClippingSource.UNDETERMINED,
      severity: ClippingSeverity.NONE,
      peakDb: null,
      flatFactor: null,
      clippingScore: 0,
      analysisTimeMs: Date.now() - startTime,
      confidence: 0
    };
  }
}

/**
 * Classify from pre-computed metrics
 * @param {Object} metrics - Pre-computed metrics
 * @returns {Object} Classification
 */
function classify(metrics) {
  const {
    peakDb = -Infinity,
    flatFactor = 0,
    crestFactorDb = 20,
    clipDensityPercent = 0,
    temporalDistribution = 'UNKNOWN'
  } = metrics || {};
  
  const severity = classifySeverity(clipDensityPercent);
  const source = determineSource(
    { peakDb, flatFactor, crestFactorDb },
    { distribution: temporalDistribution }
  );
  const clippingScore = calculateClippingScore(
    { peakDb, flatFactor, crestFactorDb },
    {}
  );
  
  return {
    source,
    severity,
    description: STATUS_DESCRIPTIONS[source],
    clippingScore
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Main functions
  analyze,
  quickCheck,
  classify,
  
  // Analysis components
  getAudioInfo,
  analyzeClipping,
  analyzeTemporalDistribution,
  
  // Classification functions
  calculateClipDensity,
  classifySeverity,
  determineSource,
  calculateClippingScore,
  detectAsymmetry,
  generateRecommendations,
  
  // Constants
  ClippingSource,
  ClippingSeverity,
  STATUS_DESCRIPTIONS,
  THRESHOLDS,
  REFERENCE
};
