/**
 * Artifact Accumulation Tracker
 * 
 * Measures compounding effects across multiple processing passes.
 * Detects processing fingerprints via crest factor reduction, phase 
 * coherence loss, harmonic buildup, and transient degradation.
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

// ============================================================================
// Constants
// ============================================================================

/**
 * Processing accumulation status levels
 */
const AccumulationStatus = Object.freeze({
  PRISTINE: 'PRISTINE',     // Minimal processing detected
  LIGHT: 'LIGHT',           // 1-2 processing stages evident
  MODERATE: 'MODERATE',     // 3-4 stages, acceptable quality
  HEAVY: 'HEAVY',           // 5+ stages, artifacts accumulating
  SATURATED: 'SATURATED'    // Maximum processing reached, quality degraded
});

/**
 * Types of degradation detected
 */
const DegradationType = Object.freeze({
  DYNAMICS_LOSS: 'DYNAMICS_LOSS',       // Reduced crest factor
  PHASE_SMEAR: 'PHASE_SMEAR',           // Phase coherence loss
  HARMONIC_BUILDUP: 'HARMONIC_BUILDUP', // Added harmonic distortion
  STEREO_COLLAPSE: 'STEREO_COLLAPSE',   // Reduced stereo width
  TRANSIENT_LOSS: 'TRANSIENT_LOSS',     // Blunted transients
  NOISE_FLOOR_RISE: 'NOISE_FLOOR_RISE', // Elevated noise floor
  QUANTIZATION: 'QUANTIZATION'          // Bit depth degradation artifacts
});

/**
 * Status descriptions for UI
 */
const STATUS_DESCRIPTIONS = Object.freeze({
  [AccumulationStatus.PRISTINE]: 'Asset shows minimal processing artifacts. Full headroom for additional transformations.',
  [AccumulationStatus.LIGHT]: 'Light processing detected. Good headroom for 2-3 additional transformation stages.',
  [AccumulationStatus.MODERATE]: 'Moderate processing evident. Use care with additional compression or limiting.',
  [AccumulationStatus.HEAVY]: 'Heavy processing detected. Limit additional transformations to essential operations only.',
  [AccumulationStatus.SATURATED]: 'Processing capacity exhausted. Additional transformations will cause quality degradation.'
});

/**
 * Analysis thresholds for processing indicators
 */
const THRESHOLDS = Object.freeze({
  // Crest factor thresholds (dB)
  CREST_FACTOR: {
    PRISTINE: 14,     // Unprocessed/lightly processed
    LIGHT: 10,        // Light compression
    MODERATE: 7,      // Moderate compression
    HEAVY: 5,         // Heavy compression
    SATURATED: 3      // Severe limiting
  },
  
  // Flat factor thresholds (0-1, higher = more flat tops)
  FLAT_FACTOR: {
    PRISTINE: 0.001,
    LIGHT: 0.01,
    MODERATE: 0.05,
    HEAVY: 0.15,
    SATURATED: 0.3
  },
  
  // Phase correlation thresholds (0-1)
  PHASE_COHERENCE: {
    PRISTINE: 0.95,
    LIGHT: 0.85,
    MODERATE: 0.70,
    HEAVY: 0.50,
    SATURATED: 0.30
  },
  
  // Harmonic distortion thresholds (dB)
  HARMONIC_DISTORTION: {
    PRISTINE: -60,
    LIGHT: -50,
    MODERATE: -40,
    HEAVY: -30,
    SATURATED: -20
  },
  
  // Accumulation score thresholds (0-100)
  ACCUMULATION_SCORE: {
    PRISTINE: 15,
    LIGHT: 30,
    MODERATE: 50,
    HEAVY: 75,
    SATURATED: 100
  },
  
  // Noise floor threshold (dB below peak)
  NOISE_FLOOR: {
    CLEAN: -70,
    ACCEPTABLE: -60,
    NOISY: -50,
    DEGRADED: -40
  }
});

/**
 * Weight factors for composite score calculation
 */
const SCORE_WEIGHTS = Object.freeze({
  CREST_FACTOR: 0.30,       // Dynamic range is primary indicator
  FLAT_FACTOR: 0.25,        // Limiting artifacts
  PHASE_COHERENCE: 0.15,    // Stereo processing artifacts
  HARMONIC_CONTENT: 0.15,   // Distortion/saturation artifacts
  NOISE_FLOOR: 0.10,        // Noise accumulation
  TRANSIENT_PRESERVATION: 0.05  // Transient blunting
});

/**
 * Estimated processing passes by score range
 */
const ESTIMATED_PASSES = Object.freeze({
  PRISTINE: { min: 0, max: 1 },
  LIGHT: { min: 1, max: 2 },
  MODERATE: { min: 3, max: 4 },
  HEAVY: { min: 5, max: 7 },
  SATURATED: { min: 8, max: 15 }
});

// ============================================================================
// FFmpeg Helpers
// ============================================================================

/**
 * Execute an ffprobe command and return stdout
 */
function execFfprobe(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFPROBE_PATH, args);
    let stdout = '';
    let stderr = '';
    
    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error('ffprobe timed out'));
    }, 30000);
    
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    
    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
      }
    });
    
    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Execute an ffmpeg command and return stderr (where most output goes)
 */
function execFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_PATH, args);
    let stdout = '';
    let stderr = '';
    
    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error('ffmpeg timed out'));
    }, 60000);
    
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    
    proc.on('close', (code) => {
      clearTimeout(timeout);
      // FFmpeg often exits with 0 even when we just want to analyze
      resolve({ stdout, stderr, code });
    });
    
    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// ============================================================================
// Component Analysis Functions
// ============================================================================

/**
 * Analyze audio statistics via astats filter
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Audio statistics
 */
async function analyzeAudioStats(filePath) {
  try {
    const args = [
      '-i', filePath,
      '-af', 'astats=metadata=1:measure_overall=all:measure_perchannel=all',
      '-f', 'null',
      '-'
    ];
    
    const { stderr } = await execFfmpeg(args);
    
    // Parse key metrics from astats output
    const rmsMatch = stderr.match(/RMS level[^:]*:\s*([-\d.]+)/gi);
    const peakMatch = stderr.match(/Peak level[^:]*:\s*([-\d.]+)/gi);
    const crestMatch = stderr.match(/Crest factor[^:]*:\s*([-\d.]+)/gi);
    const flatMatch = stderr.match(/Flat factor[^:]*:\s*([-\d.]+)/gi);
    const dcMatch = stderr.match(/DC offset[^:]*:\s*([-\d.]+)/gi);
    const dynamicRangeMatch = stderr.match(/Dynamic range[^:]*:\s*([-\d.]+)/gi);
    const noiseFloorMatch = stderr.match(/Noise floor[^:]*:\s*([-\d.]+)/gi);
    
    // Extract overall values (last match is usually overall)
    const extractLast = (matches, defaultVal) => {
      if (!matches || matches.length === 0) return defaultVal;
      const lastMatch = matches[matches.length - 1];
      const numMatch = lastMatch.match(/([-\d.]+)$/);
      return numMatch ? parseFloat(numMatch[1]) : defaultVal;
    };
    
    return {
      rmsDb: extractLast(rmsMatch, -20),
      peakDb: extractLast(peakMatch, -3),
      crestFactorDb: extractLast(crestMatch, 10),
      flatFactor: extractLast(flatMatch, 0),
      dcOffset: extractLast(dcMatch, 0),
      dynamicRangeDb: extractLast(dynamicRangeMatch, 10),
      noiseFloorDb: extractLast(noiseFloorMatch, -60)
    };
  } catch (error) {
    console.error('[ArtifactAccumulation] Audio stats analysis failed:', error.message);
    return {
      rmsDb: -20,
      peakDb: -3,
      crestFactorDb: 10,
      flatFactor: 0,
      dcOffset: 0,
      dynamicRangeDb: 10,
      noiseFloorDb: -60
    };
  }
}

/**
 * Analyze phase correlation between stereo channels
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Phase correlation metrics
 */
async function analyzePhaseCorrelation(filePath) {
  try {
    // Check if stereo first
    const probeArgs = [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=channels',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ];
    
    const { stdout: channelOutput } = await execFfprobe(probeArgs);
    const channels = parseInt(channelOutput.trim(), 10);
    
    if (channels < 2) {
      // Mono file - perfect correlation by definition
      return {
        avgCorrelation: 1.0,
        minCorrelation: 1.0,
        isStereo: false,
        phaseCoherence: 1.0
      };
    }
    
    // Measure phase correlation
    const args = [
      '-i', filePath,
      '-af', 'aphasemeter=video=0',
      '-f', 'null',
      '-'
    ];
    
    const { stderr } = await execFfmpeg(args);
    
    // Parse phase values
    const phaseMatches = stderr.match(/phase:\s*([-\d.]+)/gi) || [];
    let phaseValues = phaseMatches.map(m => {
      const numMatch = m.match(/([-\d.]+)$/);
      return numMatch ? parseFloat(numMatch[1]) : 0;
    });
    
    if (phaseValues.length === 0) {
      return {
        avgCorrelation: 0.9,
        minCorrelation: 0.7,
        isStereo: true,
        phaseCoherence: 0.85
      };
    }
    
    const avgCorrelation = phaseValues.reduce((a, b) => a + b, 0) / phaseValues.length;
    const minCorrelation = Math.min(...phaseValues);
    
    return {
      avgCorrelation: Math.max(-1, Math.min(1, avgCorrelation)),
      minCorrelation: Math.max(-1, Math.min(1, minCorrelation)),
      isStereo: true,
      phaseCoherence: Math.max(0, (avgCorrelation + 1) / 2) // Normalize to 0-1
    };
  } catch (error) {
    console.error('[ArtifactAccumulation] Phase correlation analysis failed:', error.message);
    return {
      avgCorrelation: 0.8,
      minCorrelation: 0.5,
      isStereo: false,
      phaseCoherence: 0.85
    };
  }
}

/**
 * Analyze high-frequency harmonics (indicators of processing/distortion)
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Harmonic analysis
 */
async function analyzeHarmonicContent(filePath) {
  try {
    // Analyze HF band relative to full spectrum
    const args = [
      '-i', filePath,
      '-af', 'highpass=f=8000,astats=metadata=1:measure_overall=RMS_level',
      '-f', 'null',
      '-'
    ];
    
    const { stderr } = await execFfmpeg(args);
    
    // Get HF RMS
    const hfRmsMatch = stderr.match(/RMS level[^:]*:\s*([-\d.]+)/i);
    const hfRmsDb = hfRmsMatch ? parseFloat(hfRmsMatch[1]) : -40;
    
    // Get full spectrum RMS for comparison
    const fullArgs = [
      '-i', filePath,
      '-af', 'astats=metadata=1:measure_overall=RMS_level',
      '-f', 'null',
      '-'
    ];
    
    const { stderr: fullStderr } = await execFfmpeg(fullArgs);
    const fullRmsMatch = fullStderr.match(/RMS level[^:]*:\s*([-\d.]+)/i);
    const fullRmsDb = fullRmsMatch ? parseFloat(fullRmsMatch[1]) : -20;
    
    // Calculate harmonic content indicator
    // Higher HF relative to total = more harmonics added
    const harmonicRatioDb = hfRmsDb - fullRmsDb;
    
    return {
      hfEnergyDb: isNaN(hfRmsDb) ? -40 : hfRmsDb,
      fullEnergyDb: isNaN(fullRmsDb) ? -20 : fullRmsDb,
      harmonicRatioDb: isNaN(harmonicRatioDb) ? -20 : harmonicRatioDb,
      hasExcessiveHarmonics: harmonicRatioDb > -15
    };
  } catch (error) {
    console.error('[ArtifactAccumulation] Harmonic content analysis failed:', error.message);
    return {
      hfEnergyDb: -40,
      fullEnergyDb: -20,
      harmonicRatioDb: -20,
      hasExcessiveHarmonics: false
    };
  }
}

/**
 * Analyze transient preservation
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Transient analysis
 */
async function analyzeTransients(filePath) {
  try {
    // Use silence detection to count transients
    const args = [
      '-i', filePath,
      '-af', 'silencedetect=noise=-35dB:d=0.05',
      '-f', 'null',
      '-'
    ];
    
    const { stderr } = await execFfmpeg(args);
    
    // Count silence_end events (transients)
    const silenceEnds = (stderr.match(/silence_end/g) || []).length;
    
    // Get duration for density calculation
    const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
    let duration = 60; // Default
    if (durationMatch) {
      duration = parseInt(durationMatch[1]) * 3600 + 
                 parseInt(durationMatch[2]) * 60 + 
                 parseFloat(durationMatch[3]);
    }
    
    const transientDensity = duration > 0 ? silenceEnds / duration : 0;
    
    // Higher transient density with preserved dynamics = less processing
    // Very low density might indicate over-compression
    return {
      transientCount: silenceEnds,
      transientDensity: Math.round(transientDensity * 10) / 10,
      durationSec: duration,
      transientPreservation: transientDensity > 0.5 ? 'GOOD' : 
                             transientDensity > 0.2 ? 'MODERATE' : 'POOR'
    };
  } catch (error) {
    console.error('[ArtifactAccumulation] Transient analysis failed:', error.message);
    return {
      transientCount: 0,
      transientDensity: 0,
      durationSec: 0,
      transientPreservation: 'UNKNOWN'
    };
  }
}

// ============================================================================
// Classification Functions
// ============================================================================

/**
 * Calculate accumulation score from component metrics
 * @param {Object} stats - Audio statistics
 * @param {Object} phase - Phase correlation analysis
 * @param {Object} harmonics - Harmonic content analysis
 * @param {Object} transients - Transient analysis
 * @returns {number} Accumulation score 0-100
 */
function calculateAccumulationScore(stats, phase, harmonics, transients) {
  let score = 0;
  
  // Crest factor component (lower = more processing)
  const crestFactor = stats?.crestFactorDb || 10;
  let crestScore = 0;
  if (crestFactor <= THRESHOLDS.CREST_FACTOR.SATURATED) {
    crestScore = 100;
  } else if (crestFactor <= THRESHOLDS.CREST_FACTOR.HEAVY) {
    crestScore = 75;
  } else if (crestFactor <= THRESHOLDS.CREST_FACTOR.MODERATE) {
    crestScore = 50;
  } else if (crestFactor <= THRESHOLDS.CREST_FACTOR.LIGHT) {
    crestScore = 25;
  } else {
    crestScore = 0;
  }
  score += crestScore * SCORE_WEIGHTS.CREST_FACTOR;
  
  // Flat factor component (higher = more limiting)
  const flatFactor = stats?.flatFactor || 0;
  let flatScore = 0;
  if (flatFactor >= THRESHOLDS.FLAT_FACTOR.SATURATED) {
    flatScore = 100;
  } else if (flatFactor >= THRESHOLDS.FLAT_FACTOR.HEAVY) {
    flatScore = 75;
  } else if (flatFactor >= THRESHOLDS.FLAT_FACTOR.MODERATE) {
    flatScore = 50;
  } else if (flatFactor >= THRESHOLDS.FLAT_FACTOR.LIGHT) {
    flatScore = 25;
  } else {
    flatScore = 0;
  }
  score += flatScore * SCORE_WEIGHTS.FLAT_FACTOR;
  
  // Phase coherence component (lower = more stereo processing)
  const phaseCoherence = phase?.phaseCoherence || 0.9;
  let phaseScore = 0;
  if (phaseCoherence <= THRESHOLDS.PHASE_COHERENCE.SATURATED) {
    phaseScore = 100;
  } else if (phaseCoherence <= THRESHOLDS.PHASE_COHERENCE.HEAVY) {
    phaseScore = 75;
  } else if (phaseCoherence <= THRESHOLDS.PHASE_COHERENCE.MODERATE) {
    phaseScore = 50;
  } else if (phaseCoherence <= THRESHOLDS.PHASE_COHERENCE.LIGHT) {
    phaseScore = 25;
  } else {
    phaseScore = 0;
  }
  score += phaseScore * SCORE_WEIGHTS.PHASE_COHERENCE;
  
  // Harmonic content component (higher ratio = more added harmonics)
  const harmonicRatio = harmonics?.harmonicRatioDb || -30;
  let harmonicScore = 0;
  if (harmonicRatio >= -15) {
    harmonicScore = 100;
  } else if (harmonicRatio >= -25) {
    harmonicScore = 75;
  } else if (harmonicRatio >= -35) {
    harmonicScore = 50;
  } else if (harmonicRatio >= -45) {
    harmonicScore = 25;
  } else {
    harmonicScore = 0;
  }
  score += harmonicScore * SCORE_WEIGHTS.HARMONIC_CONTENT;
  
  // Noise floor component
  const noiseFloor = stats?.noiseFloorDb || -60;
  let noiseScore = 0;
  if (noiseFloor >= THRESHOLDS.NOISE_FLOOR.DEGRADED) {
    noiseScore = 100;
  } else if (noiseFloor >= THRESHOLDS.NOISE_FLOOR.NOISY) {
    noiseScore = 75;
  } else if (noiseFloor >= THRESHOLDS.NOISE_FLOOR.ACCEPTABLE) {
    noiseScore = 50;
  } else {
    noiseScore = 0;
  }
  score += noiseScore * SCORE_WEIGHTS.NOISE_FLOOR;
  
  // Transient preservation component
  const transientPres = transients?.transientPreservation || 'MODERATE';
  let transientScore = 0;
  if (transientPres === 'POOR') {
    transientScore = 100;
  } else if (transientPres === 'MODERATE') {
    transientScore = 50;
  } else {
    transientScore = 0;
  }
  score += transientScore * SCORE_WEIGHTS.TRANSIENT_PRESERVATION;
  
  return Math.min(100, Math.max(0, Math.round(score)));
}

/**
 * Classify accumulation status from score
 * @param {number} score - Accumulation score 0-100
 * @returns {string} AccumulationStatus value
 */
function classifyAccumulationStatus(score) {
  if (score >= THRESHOLDS.ACCUMULATION_SCORE.HEAVY) {
    return AccumulationStatus.SATURATED;
  }
  if (score >= THRESHOLDS.ACCUMULATION_SCORE.MODERATE) {
    return AccumulationStatus.HEAVY;
  }
  if (score >= THRESHOLDS.ACCUMULATION_SCORE.LIGHT) {
    return AccumulationStatus.MODERATE;
  }
  if (score >= THRESHOLDS.ACCUMULATION_SCORE.PRISTINE) {
    return AccumulationStatus.LIGHT;
  }
  return AccumulationStatus.PRISTINE;
}

/**
 * Detect types of degradation present
 * @param {Object} stats - Audio statistics
 * @param {Object} phase - Phase correlation analysis
 * @param {Object} harmonics - Harmonic content analysis
 * @param {Object} transients - Transient analysis
 * @returns {Array<Object>} Detected degradation types
 */
function detectDegradationTypes(stats, phase, harmonics, transients) {
  const degradations = [];
  
  // Check dynamics loss
  if (stats?.crestFactorDb < THRESHOLDS.CREST_FACTOR.MODERATE) {
    degradations.push({
      type: DegradationType.DYNAMICS_LOSS,
      severity: stats.crestFactorDb < THRESHOLDS.CREST_FACTOR.HEAVY ? 'SEVERE' : 'MODERATE',
      metric: `Crest factor: ${stats.crestFactorDb?.toFixed(1)} dB`
    });
  }
  
  // Check phase smear
  if (phase?.phaseCoherence < THRESHOLDS.PHASE_COHERENCE.MODERATE) {
    degradations.push({
      type: DegradationType.PHASE_SMEAR,
      severity: phase.phaseCoherence < THRESHOLDS.PHASE_COHERENCE.HEAVY ? 'SEVERE' : 'MODERATE',
      metric: `Phase coherence: ${(phase.phaseCoherence * 100).toFixed(0)}%`
    });
  }
  
  // Check harmonic buildup
  if (harmonics?.hasExcessiveHarmonics) {
    degradations.push({
      type: DegradationType.HARMONIC_BUILDUP,
      severity: harmonics.harmonicRatioDb > -10 ? 'SEVERE' : 'MODERATE',
      metric: `HF/Full ratio: ${harmonics.harmonicRatioDb?.toFixed(1)} dB`
    });
  }
  
  // Check stereo collapse
  if (phase?.isStereo && phase?.avgCorrelation > 0.95) {
    degradations.push({
      type: DegradationType.STEREO_COLLAPSE,
      severity: phase.avgCorrelation > 0.99 ? 'SEVERE' : 'MODERATE',
      metric: `Correlation: ${phase.avgCorrelation?.toFixed(2)}`
    });
  }
  
  // Check transient loss
  if (transients?.transientPreservation === 'POOR') {
    degradations.push({
      type: DegradationType.TRANSIENT_LOSS,
      severity: 'MODERATE',
      metric: `Transient density: ${transients.transientDensity}/sec`
    });
  }
  
  // Check noise floor rise
  if (stats?.noiseFloorDb > THRESHOLDS.NOISE_FLOOR.NOISY) {
    degradations.push({
      type: DegradationType.NOISE_FLOOR_RISE,
      severity: stats.noiseFloorDb > THRESHOLDS.NOISE_FLOOR.DEGRADED ? 'SEVERE' : 'MODERATE',
      metric: `Noise floor: ${stats.noiseFloorDb?.toFixed(1)} dB`
    });
  }
  
  // Check limiting artifacts (flat factor)
  if (stats?.flatFactor > THRESHOLDS.FLAT_FACTOR.HEAVY) {
    degradations.push({
      type: DegradationType.DYNAMICS_LOSS,
      severity: stats.flatFactor > THRESHOLDS.FLAT_FACTOR.SATURATED ? 'SEVERE' : 'MODERATE',
      metric: `Flat factor: ${(stats.flatFactor * 100).toFixed(1)}%`
    });
  }
  
  return degradations;
}

/**
 * Estimate number of processing passes
 * @param {string} status - AccumulationStatus value
 * @returns {Object} Estimated pass range
 */
function estimateProcessingPasses(status) {
  const range = ESTIMATED_PASSES[status] || ESTIMATED_PASSES.MODERATE;
  return {
    min: range.min,
    max: range.max,
    estimate: Math.round((range.min + range.max) / 2)
  };
}

/**
 * Calculate remaining processing headroom
 * @param {number} score - Accumulation score
 * @returns {Object} Headroom assessment
 */
function calculateProcessingHeadroom(score) {
  const headroom = 100 - score;
  
  let recommendation;
  if (headroom >= 70) {
    recommendation = 'Full processing flexibility available';
  } else if (headroom >= 50) {
    recommendation = 'Good headroom for 2-3 additional stages';
  } else if (headroom >= 30) {
    recommendation = 'Limited headroom - use conservative settings';
  } else if (headroom >= 15) {
    recommendation = 'Minimal headroom - essential transformations only';
  } else {
    recommendation = 'No processing headroom - quality will degrade';
  }
  
  return {
    headroomPercent: headroom,
    recommendation,
    canAddCompression: headroom >= 30,
    canAddLimiting: headroom >= 50,
    canAddSaturation: headroom >= 40
  };
}

/**
 * Generate recommendations based on analysis
 * @param {Object} analysis - Complete analysis object
 * @returns {Array<string>} Recommendations
 */
function generateRecommendations(analysis) {
  const recommendations = [];
  
  if (!analysis) return recommendations;
  
  const { status, degradationTypes, headroom } = analysis;
  
  // Status-based recommendations
  if (status === AccumulationStatus.SATURATED) {
    recommendations.push('Asset has reached maximum processing capacity. Avoid additional dynamics processing.');
    recommendations.push('If loudness adjustment needed, use gentle gain only - no compression or limiting.');
    recommendations.push('Consider requesting a less processed source file if available.');
  } else if (status === AccumulationStatus.HEAVY) {
    recommendations.push('Heavy processing detected. Limit transformations to essential operations.');
    recommendations.push('Use minimal compression ratios and gentle attack/release settings.');
  } else if (status === AccumulationStatus.MODERATE) {
    recommendations.push('Moderate processing headroom available. Use conservative dynamics settings.');
  }
  
  // Degradation-specific recommendations
  if (degradationTypes) {
    const hasTransientLoss = degradationTypes.some(d => d.type === DegradationType.TRANSIENT_LOSS);
    const hasDynamicsLoss = degradationTypes.some(d => d.type === DegradationType.DYNAMICS_LOSS);
    const hasPhaseSmear = degradationTypes.some(d => d.type === DegradationType.PHASE_SMEAR);
    
    if (hasDynamicsLoss) {
      recommendations.push('Dynamics already reduced - avoid additional compression.');
    }
    
    if (hasTransientLoss) {
      recommendations.push('Transients are already blunted - use transient shaper to restore if needed.');
    }
    
    if (hasPhaseSmear) {
      recommendations.push('Phase coherence degraded - avoid additional stereo widening or M/S processing.');
    }
  }
  
  // Headroom-specific recommendations
  if (headroom && !headroom.canAddLimiting) {
    recommendations.push('Limiting headroom exhausted - do not apply additional limiting.');
  }
  
  return recommendations;
}

// ============================================================================
// Main Analysis Functions
// ============================================================================

/**
 * Full artifact accumulation analysis
 * @param {string} filePath - Path to audio file
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Complete analysis
 */
async function analyze(filePath, options = {}) {
  const startTime = Date.now();
  
  try {
    // Run all component analyses in parallel
    const [stats, phase, harmonics, transients] = await Promise.all([
      analyzeAudioStats(filePath),
      analyzePhaseCorrelation(filePath),
      analyzeHarmonicContent(filePath),
      analyzeTransients(filePath)
    ]);
    
    // Calculate composite score
    const accumulationScore = calculateAccumulationScore(stats, phase, harmonics, transients);
    const status = classifyAccumulationStatus(accumulationScore);
    
    // Detect specific degradation types
    const degradationTypes = detectDegradationTypes(stats, phase, harmonics, transients);
    
    // Estimate processing passes
    const estimatedPasses = estimateProcessingPasses(status);
    
    // Calculate remaining headroom
    const headroom = calculateProcessingHeadroom(accumulationScore);
    
    const analysis = {
      status,
      description: STATUS_DESCRIPTIONS[status],
      accumulationScore,
      estimatedPasses,
      headroom,
      degradationTypes,
      components: {
        crestFactorDb: stats.crestFactorDb,
        flatFactor: stats.flatFactor,
        dynamicRangeDb: stats.dynamicRangeDb,
        noiseFloorDb: stats.noiseFloorDb,
        phaseCoherence: phase.phaseCoherence,
        avgCorrelation: phase.avgCorrelation,
        isStereo: phase.isStereo,
        harmonicRatioDb: harmonics.harmonicRatioDb,
        transientPreservation: transients.transientPreservation,
        transientDensity: transients.transientDensity
      },
      recommendations: [],
      confidence: 0.85,
      analysisTimeMs: Date.now() - startTime
    };
    
    // Generate recommendations
    analysis.recommendations = generateRecommendations(analysis);
    
    return analysis;
  } catch (error) {
    console.error('[ArtifactAccumulation] Analysis failed:', error.message);
    return {
      status: AccumulationStatus.MODERATE,
      description: STATUS_DESCRIPTIONS[AccumulationStatus.MODERATE],
      accumulationScore: 40,
      error: error.message,
      confidence: 0.2,
      analysisTimeMs: Date.now() - startTime
    };
  }
}

/**
 * Quick artifact accumulation check (faster, less detail)
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Quick assessment
 */
async function quickCheck(filePath) {
  const startTime = Date.now();
  
  try {
    // Just analyze audio stats for quick check
    const stats = await analyzeAudioStats(filePath);
    
    // Simplified score based on crest factor and flat factor
    const crestFactor = stats.crestFactorDb || 10;
    const flatFactor = stats.flatFactor || 0;
    
    let quickScore = 0;
    
    // Crest factor component (50% weight)
    if (crestFactor <= THRESHOLDS.CREST_FACTOR.SATURATED) {
      quickScore += 50;
    } else if (crestFactor <= THRESHOLDS.CREST_FACTOR.HEAVY) {
      quickScore += 37;
    } else if (crestFactor <= THRESHOLDS.CREST_FACTOR.MODERATE) {
      quickScore += 25;
    } else if (crestFactor <= THRESHOLDS.CREST_FACTOR.LIGHT) {
      quickScore += 12;
    }
    
    // Flat factor component (50% weight)
    if (flatFactor >= THRESHOLDS.FLAT_FACTOR.SATURATED) {
      quickScore += 50;
    } else if (flatFactor >= THRESHOLDS.FLAT_FACTOR.HEAVY) {
      quickScore += 37;
    } else if (flatFactor >= THRESHOLDS.FLAT_FACTOR.MODERATE) {
      quickScore += 25;
    } else if (flatFactor >= THRESHOLDS.FLAT_FACTOR.LIGHT) {
      quickScore += 12;
    }
    
    const status = classifyAccumulationStatus(quickScore);
    
    return {
      status,
      description: STATUS_DESCRIPTIONS[status],
      accumulationScore: quickScore,
      crestFactorDb: crestFactor,
      flatFactor,
      estimatedPasses: estimateProcessingPasses(status),
      headroomPercent: 100 - quickScore,
      confidence: 0.7,
      analysisTimeMs: Date.now() - startTime
    };
  } catch (error) {
    console.error('[ArtifactAccumulation] Quick check failed:', error.message);
    return {
      status: AccumulationStatus.MODERATE,
      description: STATUS_DESCRIPTIONS[AccumulationStatus.MODERATE],
      accumulationScore: 40,
      error: error.message,
      confidence: 0.2,
      analysisTimeMs: Date.now() - startTime
    };
  }
}

/**
 * Classify from pre-computed metrics
 * @param {Object} metrics - Pre-computed metrics
 * @returns {Object} Classification result
 */
function classify(metrics) {
  const stats = {
    crestFactorDb: metrics?.crestFactorDb,
    flatFactor: metrics?.flatFactor,
    noiseFloorDb: metrics?.noiseFloorDb
  };
  
  const phase = {
    phaseCoherence: metrics?.phaseCoherence,
    avgCorrelation: metrics?.avgCorrelation
  };
  
  const harmonics = {
    harmonicRatioDb: metrics?.harmonicRatioDb
  };
  
  const transients = {
    transientPreservation: metrics?.transientPreservation
  };
  
  const score = calculateAccumulationScore(stats, phase, harmonics, transients);
  const status = classifyAccumulationStatus(score);
  
  return {
    status,
    description: STATUS_DESCRIPTIONS[status],
    accumulationScore: score,
    estimatedPasses: estimateProcessingPasses(status),
    headroom: calculateProcessingHeadroom(score)
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Main API
  analyze,
  quickCheck,
  classify,
  
  // Scoring functions
  calculateAccumulationScore,
  classifyAccumulationStatus,
  detectDegradationTypes,
  estimateProcessingPasses,
  calculateProcessingHeadroom,
  generateRecommendations,
  
  // Component analysis (for testing)
  analyzeAudioStats,
  analyzePhaseCorrelation,
  analyzeHarmonicContent,
  analyzeTransients,
  
  // Constants
  AccumulationStatus,
  DegradationType,
  STATUS_DESCRIPTIONS,
  THRESHOLDS,
  SCORE_WEIGHTS,
  ESTIMATED_PASSES
};
