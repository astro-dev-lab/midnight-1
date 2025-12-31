/**
 * Noise Floor Modulation Detector
 * 
 * Detects breathing/pumping artifacts where noise floor varies with signal level.
 * Common artifacts from aggressive compression, gating, or expansion.
 * 
 * Detection methods:
 * - Windowed RMS tracking in quiet sections
 * - Correlation between program level and noise floor
 * - Release time estimation from noise recovery patterns
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
 * Noise modulation status levels
 */
const NoiseModulationStatus = {
  CLEAN: 'CLEAN',           // No detectable modulation
  MINIMAL: 'MINIMAL',       // Slight modulation, acceptable
  NOTICEABLE: 'NOTICEABLE', // Audible on careful listening
  OBVIOUS: 'OBVIOUS',       // Clearly audible
  SEVERE: 'SEVERE'          // Distracting artifacts
};

/**
 * Modulation artifact types
 */
const ModulationType = {
  NONE: 'NONE',
  BREATHING: 'BREATHING',           // Noise rises after transients
  PUMPING: 'PUMPING',               // Level surging (compressor release)
  GATING_ARTIFACTS: 'GATING_ARTIFACTS',  // Abrupt noise cuts
  MIXED: 'MIXED'
};

/**
 * Status descriptions for reporting
 */
const STATUS_DESCRIPTIONS = {
  [NoiseModulationStatus.CLEAN]: 'No noise floor modulation detected - consistent background level',
  [NoiseModulationStatus.MINIMAL]: 'Minimal noise modulation - unlikely to be audible in normal listening',
  [NoiseModulationStatus.NOTICEABLE]: 'Noticeable noise modulation - may be audible during quiet passages',
  [NoiseModulationStatus.OBVIOUS]: 'Obvious breathing/pumping artifacts - clearly audible in quiet sections',
  [NoiseModulationStatus.SEVERE]: 'Severe noise modulation - distracting artifacts throughout'
};

/**
 * Threshold configuration
 */
const THRESHOLDS = {
  // Noise floor detection
  NOISE_FLOOR: {
    QUIET_THRESHOLD_DB: -45,     // Below this = quiet section
    VERY_QUIET_THRESHOLD_DB: -55, // For noise floor measurement
    MIN_QUIET_DURATION_MS: 100    // Minimum quiet duration to analyze
  },
  // Modulation depth thresholds (dB variance in noise floor)
  MODULATION_DEPTH: {
    MINIMAL: 3,      // < 3dB = minimal
    NOTICEABLE: 6,   // 3-6dB = noticeable
    OBVIOUS: 10,     // 6-10dB = obvious
    SEVERE: 15       // > 10dB = severe
  },
  // Correlation thresholds
  CORRELATION: {
    BREATHING_THRESHOLD: 0.5,   // Noise/program correlation for breathing
    PUMPING_THRESHOLD: 0.4,     // Level surge correlation
    SIGNIFICANT: 0.3            // Minimum significant correlation
  },
  // Timing analysis
  TIMING: {
    ATTACK_WINDOW_MS: 50,       // Attack detection window
    RELEASE_WINDOW_MS: 500,     // Release/breathing detection window
    SAMPLE_WINDOW_MS: 100       // RMS sample window
  }
};

/**
 * Reference values
 */
const REFERENCE = {
  TYPICAL_NOISE_FLOOR_DB: -60,  // Typical well-recorded noise floor
  VINYL_NOISE_FLOOR_DB: -45,    // Expected vinyl noise floor
  DIGITAL_SILENCE_DB: -96       // 16-bit digital silence
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
 * Get audio duration
 * @param {string} filePath - Path to audio file
 * @returns {Promise<number>} Duration in seconds
 */
async function getAudioDuration(filePath) {
  const args = [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath
  ];
  
  try {
    const { stdout } = await execCommand(FFPROBE_PATH, args);
    return parseFloat(stdout.trim()) || 0;
  } catch (error) {
    console.error('[NoiseFloorModulation] Duration check failed:', error.message);
    return 0;
  }
}

/**
 * Get windowed RMS levels over time
 * @param {string} filePath - Path to audio file
 * @param {number} windowSamples - Samples per window
 * @returns {Promise<Array>} Array of RMS measurements
 */
async function getWindowedRMS(filePath, windowSamples = 4410) {
  const args = [
    '-i', filePath,
    '-af', `asetnsamples=n=${windowSamples},astats=metadata=1:reset=1`,
    '-f', 'null', '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    const windows = [];
    // Parse RMS levels from astats output
    const rmsMatches = stderr.matchAll(/RMS level[^:]*:\s*([-\d.]+)/gi);
    
    for (const match of rmsMatches) {
      const rmsDb = parseFloat(match[1]);
      if (isFinite(rmsDb)) {
        windows.push(rmsDb);
      }
    }
    
    return windows;
  } catch (error) {
    console.error('[NoiseFloorModulation] Windowed RMS failed:', error.message);
    return [];
  }
}

/**
 * Get overall audio statistics
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Audio statistics
 */
async function getAudioStats(filePath) {
  const args = [
    '-i', filePath,
    '-af', 'astats=metadata=1:measure_overall=all',
    '-f', 'null', '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    const rmsMatch = stderr.match(/Overall.*RMS level[^:]*:\s*([-\d.]+)/i);
    const peakMatch = stderr.match(/Overall.*Peak level[^:]*:\s*([-\d.]+)/i);
    const dynMatch = stderr.match(/Overall.*Dynamic range[^:]*:\s*([\d.]+)/i);
    const crestMatch = stderr.match(/Overall.*Crest factor[^:]*:\s*([\d.]+)/i);
    
    return {
      rmsDb: rmsMatch ? parseFloat(rmsMatch[1]) : -40,
      peakDb: peakMatch ? parseFloat(peakMatch[1]) : -6,
      dynamicRangeDb: dynMatch ? parseFloat(dynMatch[1]) : 20,
      crestFactorDb: crestMatch ? parseFloat(crestMatch[1]) : 10,
      isValid: rmsMatch !== null
    };
  } catch (error) {
    console.error('[NoiseFloorModulation] Stats analysis failed:', error.message);
    return { rmsDb: -40, peakDb: -6, dynamicRangeDb: 20, isValid: false };
  }
}

/**
 * Detect silence/quiet sections
 * @param {string} filePath - Path to audio file
 * @param {number} thresholdDb - Silence threshold in dB
 * @returns {Promise<Array>} Array of quiet sections
 */
async function detectQuietSections(filePath, thresholdDb = -45) {
  const args = [
    '-i', filePath,
    '-af', `silencedetect=noise=${thresholdDb}dB:d=0.1`,
    '-f', 'null', '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    const sections = [];
    const startMatches = stderr.matchAll(/silence_start:\s*([\d.]+)/gi);
    const endMatches = stderr.matchAll(/silence_end:\s*([\d.]+)/gi);
    
    const starts = [...startMatches].map(m => parseFloat(m[1]));
    const ends = [...endMatches].map(m => parseFloat(m[1]));
    
    for (let i = 0; i < starts.length; i++) {
      sections.push({
        start: starts[i],
        end: ends[i] || null,
        duration: ends[i] ? ends[i] - starts[i] : null
      });
    }
    
    return sections;
  } catch (error) {
    console.error('[NoiseFloorModulation] Silence detection failed:', error.message);
    return [];
  }
}

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * Analyze noise floor variation
 * @param {Array} rmsWindows - Array of RMS measurements in dB
 * @param {number} quietThreshold - Threshold for quiet sections
 * @returns {Object} Noise floor analysis
 */
function analyzeNoiseFloorVariation(rmsWindows, quietThreshold = -45) {
  if (!rmsWindows || rmsWindows.length < 5) {
    return {
      noiseFloorDb: REFERENCE.TYPICAL_NOISE_FLOOR_DB,
      modulationDepthDb: 0,
      varianceDb: 0,
      quietWindowCount: 0
    };
  }
  
  // Identify quiet windows (likely noise floor)
  const quietWindows = rmsWindows.filter(rms => rms < quietThreshold);
  
  if (quietWindows.length < 3) {
    // Not enough quiet sections - use lowest 10% as noise floor estimate
    const sorted = [...rmsWindows].sort((a, b) => a - b);
    const bottom10 = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.1)));
    
    const avgNoiseFloor = bottom10.reduce((a, b) => a + b, 0) / bottom10.length;
    const minNoise = Math.min(...bottom10);
    const maxNoise = Math.max(...bottom10);
    
    return {
      noiseFloorDb: avgNoiseFloor,
      modulationDepthDb: maxNoise - minNoise,
      varianceDb: calculateVariance(bottom10),
      quietWindowCount: bottom10.length,
      estimatedFromBottom10: true
    };
  }
  
  // Calculate noise floor statistics from quiet sections
  const avgNoiseFloor = quietWindows.reduce((a, b) => a + b, 0) / quietWindows.length;
  const minNoise = Math.min(...quietWindows);
  const maxNoise = Math.max(...quietWindows);
  const modulationDepth = maxNoise - minNoise;
  const variance = calculateVariance(quietWindows);
  
  return {
    noiseFloorDb: avgNoiseFloor,
    modulationDepthDb: modulationDepth,
    varianceDb: variance,
    minNoiseFloorDb: minNoise,
    maxNoiseFloorDb: maxNoise,
    quietWindowCount: quietWindows.length
  };
}

/**
 * Calculate variance of array
 * @param {Array<number>} values - Array of values
 * @returns {number} Variance
 */
function calculateVariance(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Analyze correlation between program level and noise floor
 * @param {Array} rmsWindows - Array of RMS measurements
 * @returns {Object} Correlation analysis
 */
function analyzeModulationCorrelation(rmsWindows) {
  if (!rmsWindows || rmsWindows.length < 10) {
    return {
      programNoiseCorrelation: 0,
      hasBreathing: false,
      hasPumping: false
    };
  }
  
  // Look for patterns where quiet follows loud (breathing)
  // or where level surges occur (pumping)
  
  const deltas = [];
  for (let i = 1; i < rmsWindows.length; i++) {
    deltas.push(rmsWindows[i] - rmsWindows[i - 1]);
  }
  
  // Count significant rises after drops (breathing pattern)
  let breathingEvents = 0;
  let pumpingEvents = 0;
  
  for (let i = 2; i < rmsWindows.length; i++) {
    const prevDelta = rmsWindows[i - 1] - rmsWindows[i - 2];
    const currDelta = rmsWindows[i] - rmsWindows[i - 1];
    
    // Breathing: quiet section noise rises after loud section
    if (prevDelta < -10 && currDelta > 3 && rmsWindows[i - 1] < -40) {
      breathingEvents++;
    }
    
    // Pumping: sudden level surge after compression release
    if (currDelta > 6 && rmsWindows[i] > rmsWindows[i - 2]) {
      pumpingEvents++;
    }
  }
  
  const breathingRatio = breathingEvents / (rmsWindows.length / 10);
  const pumpingRatio = pumpingEvents / (rmsWindows.length / 10);
  
  // Calculate crude program-noise correlation
  // Higher values in loud sections following into quiet sections
  const loudWindows = rmsWindows.filter(r => r > -30);
  const avgLoud = loudWindows.length > 0 ? 
    loudWindows.reduce((a, b) => a + b, 0) / loudWindows.length : -30;
  
  const quietAfterLoud = [];
  for (let i = 1; i < rmsWindows.length; i++) {
    if (rmsWindows[i - 1] > avgLoud && rmsWindows[i] < -40) {
      quietAfterLoud.push(rmsWindows[i]);
    }
  }
  
  // Compare quiet sections after loud vs general quiet sections
  const generalQuiet = rmsWindows.filter(r => r < -40);
  const avgQuietAfterLoud = quietAfterLoud.length > 0 ?
    quietAfterLoud.reduce((a, b) => a + b, 0) / quietAfterLoud.length : -60;
  const avgGeneralQuiet = generalQuiet.length > 0 ?
    generalQuiet.reduce((a, b) => a + b, 0) / generalQuiet.length : -60;
  
  const correlationIndicator = (avgQuietAfterLoud - avgGeneralQuiet) / 10;
  
  return {
    programNoiseCorrelation: Math.max(-1, Math.min(1, correlationIndicator)),
    breathingEventRate: breathingRatio,
    pumpingEventRate: pumpingRatio,
    hasBreathing: breathingRatio > THRESHOLDS.CORRELATION.BREATHING_THRESHOLD,
    hasPumping: pumpingRatio > THRESHOLDS.CORRELATION.PUMPING_THRESHOLD
  };
}

/**
 * Detect modulation type based on analysis
 * @param {Object} noiseAnalysis - Noise floor analysis
 * @param {Object} correlationAnalysis - Correlation analysis
 * @returns {string} Modulation type
 */
function detectModulationType(noiseAnalysis, correlationAnalysis) {
  const { hasBreathing, hasPumping } = correlationAnalysis;
  const { modulationDepthDb } = noiseAnalysis;
  
  // No modulation if depth is minimal
  if (modulationDepthDb < THRESHOLDS.MODULATION_DEPTH.MINIMAL) {
    return ModulationType.NONE;
  }
  
  if (hasBreathing && hasPumping) {
    return ModulationType.MIXED;
  }
  
  if (hasBreathing) {
    return ModulationType.BREATHING;
  }
  
  if (hasPumping) {
    return ModulationType.PUMPING;
  }
  
  // Check for gating artifacts (abrupt changes)
  if (noiseAnalysis.varianceDb > 5 && !hasBreathing && !hasPumping) {
    return ModulationType.GATING_ARTIFACTS;
  }
  
  return ModulationType.NONE;
}

// ============================================================================
// Classification Functions
// ============================================================================

/**
 * Classify noise modulation status
 * @param {number} modulationDepthDb - Modulation depth in dB
 * @param {Object} correlationAnalysis - Correlation analysis results
 * @returns {string} Status classification
 */
function classifyStatus(modulationDepthDb, correlationAnalysis = {}) {
  const { hasBreathing, hasPumping } = correlationAnalysis;
  
  // Boost severity if correlation-based artifacts detected
  const severityBoost = (hasBreathing ? 1 : 0) + (hasPumping ? 1 : 0);
  const effectiveDepth = modulationDepthDb + (severityBoost * 2);
  
  if (effectiveDepth < THRESHOLDS.MODULATION_DEPTH.MINIMAL) {
    return NoiseModulationStatus.CLEAN;
  }
  
  if (effectiveDepth < THRESHOLDS.MODULATION_DEPTH.NOTICEABLE) {
    return NoiseModulationStatus.MINIMAL;
  }
  
  if (effectiveDepth < THRESHOLDS.MODULATION_DEPTH.OBVIOUS) {
    return NoiseModulationStatus.NOTICEABLE;
  }
  
  if (effectiveDepth < THRESHOLDS.MODULATION_DEPTH.SEVERE) {
    return NoiseModulationStatus.OBVIOUS;
  }
  
  return NoiseModulationStatus.SEVERE;
}

/**
 * Calculate modulation score (0-100)
 * @param {Object} noiseAnalysis - Noise floor analysis
 * @param {Object} correlationAnalysis - Correlation analysis
 * @returns {number} Score 0-100
 */
function calculateModulationScore(noiseAnalysis, correlationAnalysis) {
  const { modulationDepthDb = 0, varianceDb = 0 } = noiseAnalysis || {};
  const { 
    programNoiseCorrelation = 0, 
    breathingEventRate = 0, 
    pumpingEventRate = 0 
  } = correlationAnalysis || {};
  
  let score = 0;
  
  // Modulation depth contribution (0-40)
  const depthNorm = Math.min(modulationDepthDb / THRESHOLDS.MODULATION_DEPTH.SEVERE, 1.0);
  score += depthNorm * 40;
  
  // Variance contribution (0-20)
  const varianceNorm = Math.min(varianceDb / 8, 1.0);
  score += varianceNorm * 20;
  
  // Correlation contribution (0-20)
  score += Math.abs(programNoiseCorrelation) * 20;
  
  // Event rate contribution (0-20)
  const eventRate = Math.max(breathingEventRate, pumpingEventRate);
  score += Math.min(eventRate, 1.0) * 20;
  
  return Math.min(100, Math.max(0, Math.round(score)));
}

/**
 * Generate recommendations based on analysis
 * @param {Object} analysis - Complete analysis
 * @returns {Array<string>} Recommendations
 */
function generateRecommendations(analysis) {
  const recommendations = [];
  
  if (!analysis) return recommendations;
  
  const { status, modulationType, modulationDepthDb } = analysis;
  
  if (status === NoiseModulationStatus.CLEAN) {
    recommendations.push('No noise floor modulation detected - audio maintains consistent background');
    return recommendations;
  }
  
  if (modulationType === ModulationType.BREATHING) {
    recommendations.push('Breathing artifacts detected - consider slower compressor release times');
    recommendations.push('Use parallel compression instead of heavy direct compression');
  }
  
  if (modulationType === ModulationType.PUMPING) {
    recommendations.push('Pumping artifacts detected - reduce compression ratio or use multi-band compression');
    recommendations.push('Consider using a limiter with lookahead to prevent sudden level surges');
  }
  
  if (modulationType === ModulationType.GATING_ARTIFACTS) {
    recommendations.push('Gating artifacts detected - use expansion instead of hard gating');
    recommendations.push('Increase gate release time for smoother transitions');
  }
  
  if (modulationDepthDb > THRESHOLDS.MODULATION_DEPTH.OBVIOUS) {
    recommendations.push('Significant noise modulation may benefit from noise reduction processing');
  }
  
  if (status === NoiseModulationStatus.SEVERE) {
    recommendations.push('Severe artifacts present - consider sourcing less processed material');
  }
  
  return recommendations;
}

// ============================================================================
// Main Analysis Functions
// ============================================================================

/**
 * Full noise floor modulation analysis
 * @param {string} filePath - Path to audio file
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Complete analysis
 */
async function analyze(filePath, options = {}) {
  const startTime = Date.now();
  
  try {
    // Run analyses in parallel
    const [duration, rmsWindows, stats, quietSections] = await Promise.all([
      getAudioDuration(filePath),
      getWindowedRMS(filePath),
      getAudioStats(filePath),
      detectQuietSections(filePath)
    ]);
    
    // Analyze noise floor variation
    const noiseAnalysis = analyzeNoiseFloorVariation(rmsWindows);
    
    // Analyze correlation patterns
    const correlationAnalysis = analyzeModulationCorrelation(rmsWindows);
    
    // Determine modulation type
    const modulationType = detectModulationType(noiseAnalysis, correlationAnalysis);
    
    // Classify status
    const status = classifyStatus(noiseAnalysis.modulationDepthDb, correlationAnalysis);
    const modulationScore = calculateModulationScore(noiseAnalysis, correlationAnalysis);
    
    const analysis = {
      status,
      description: STATUS_DESCRIPTIONS[status],
      modulationType,
      modulationScore,
      
      // Noise floor metrics
      noiseFloorDb: noiseAnalysis.noiseFloorDb,
      modulationDepthDb: noiseAnalysis.modulationDepthDb,
      noiseVarianceDb: noiseAnalysis.varianceDb,
      minNoiseFloorDb: noiseAnalysis.minNoiseFloorDb,
      maxNoiseFloorDb: noiseAnalysis.maxNoiseFloorDb,
      
      // Correlation metrics
      programNoiseCorrelation: correlationAnalysis.programNoiseCorrelation,
      hasBreathing: correlationAnalysis.hasBreathing,
      hasPumping: correlationAnalysis.hasPumping,
      breathingEventRate: correlationAnalysis.breathingEventRate,
      pumpingEventRate: correlationAnalysis.pumpingEventRate,
      
      // Audio context
      quietSectionCount: quietSections.length,
      quietWindowCount: noiseAnalysis.quietWindowCount,
      overallRmsDb: stats.rmsDb,
      dynamicRangeDb: stats.dynamicRangeDb,
      
      // Metadata
      duration,
      windowCount: rmsWindows.length,
      analysisTimeMs: Date.now() - startTime,
      confidence: stats.isValid && rmsWindows.length > 10 ? 0.85 : 0.4
    };
    
    analysis.recommendations = generateRecommendations(analysis);
    
    return analysis;
  } catch (error) {
    console.error('[NoiseFloorModulation] Analysis failed:', error.message);
    return {
      status: NoiseModulationStatus.CLEAN,
      description: 'Analysis incomplete',
      modulationType: ModulationType.NONE,
      modulationScore: 0,
      error: error.message,
      analysisTimeMs: Date.now() - startTime,
      confidence: 0
    };
  }
}

/**
 * Quick noise modulation check (faster, essential metrics only)
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Quick analysis
 */
async function quickCheck(filePath) {
  const startTime = Date.now();
  
  try {
    const rmsWindows = await getWindowedRMS(filePath);
    
    const noiseAnalysis = analyzeNoiseFloorVariation(rmsWindows);
    const correlationAnalysis = analyzeModulationCorrelation(rmsWindows);
    
    const status = classifyStatus(noiseAnalysis.modulationDepthDb, correlationAnalysis);
    const modulationType = detectModulationType(noiseAnalysis, correlationAnalysis);
    const modulationScore = calculateModulationScore(noiseAnalysis, correlationAnalysis);
    
    return {
      status,
      modulationType,
      modulationScore,
      noiseFloorDb: noiseAnalysis.noiseFloorDb,
      modulationDepthDb: noiseAnalysis.modulationDepthDb,
      hasBreathing: correlationAnalysis.hasBreathing,
      hasPumping: correlationAnalysis.hasPumping,
      analysisTimeMs: Date.now() - startTime,
      confidence: rmsWindows.length > 10 ? 0.75 : 0.3
    };
  } catch (error) {
    console.error('[NoiseFloorModulation] Quick check failed:', error.message);
    return {
      status: NoiseModulationStatus.CLEAN,
      modulationType: ModulationType.NONE,
      modulationScore: 0,
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
    modulationDepthDb = 0,
    noiseVarianceDb = 0,
    hasBreathing = false,
    hasPumping = false,
    breathingEventRate = 0,
    pumpingEventRate = 0
  } = metrics || {};
  
  const correlationAnalysis = { hasBreathing, hasPumping, breathingEventRate, pumpingEventRate };
  const noiseAnalysis = { modulationDepthDb, varianceDb: noiseVarianceDb };
  
  const status = classifyStatus(modulationDepthDb, correlationAnalysis);
  const modulationType = detectModulationType(noiseAnalysis, correlationAnalysis);
  const modulationScore = calculateModulationScore(noiseAnalysis, correlationAnalysis);
  
  return {
    status,
    description: STATUS_DESCRIPTIONS[status],
    modulationType,
    modulationScore
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
  getAudioDuration,
  getWindowedRMS,
  getAudioStats,
  detectQuietSections,
  
  // Analysis functions
  analyzeNoiseFloorVariation,
  analyzeModulationCorrelation,
  detectModulationType,
  
  // Classification functions
  classifyStatus,
  calculateModulationScore,
  generateRecommendations,
  
  // Utilities
  calculateVariance,
  
  // Constants
  NoiseModulationStatus,
  ModulationType,
  STATUS_DESCRIPTIONS,
  THRESHOLDS,
  REFERENCE
};
