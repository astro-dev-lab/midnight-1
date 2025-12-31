/**
 * Aliasing Risk Estimator
 * 
 * Detects high-frequency content near the Nyquist limit and assesses risk
 * of aliasing artifacts during sample rate conversion or processing.
 * 
 * Key concepts:
 * - Nyquist frequency = sample_rate / 2
 * - Content above ~18kHz can cause aliasing when downsampling
 * - Pre-ringing from aggressive anti-aliasing filters
 * - Ultrasonic content from synthesis/processing
 * 
 * FFmpeg filters used:
 * - showfreqs: Frequency analysis
 * - highpass/lowpass: Band isolation
 * - astats: Energy measurement
 * - aresample: Resampling quality check
 */

const { spawn } = require('child_process');

// ============================================================================
// Constants & Status Enums
// ============================================================================

/**
 * Aliasing risk status levels
 */
const AliasingRiskStatus = Object.freeze({
  SAFE: 'SAFE',                 // No significant HF content near Nyquist
  LOW_RISK: 'LOW_RISK',         // Some HF content, minimal risk
  MODERATE_RISK: 'MODERATE_RISK', // Notable HF content, consider filtering
  HIGH_RISK: 'HIGH_RISK',       // Significant content near Nyquist
  CRITICAL: 'CRITICAL'          // Will definitely cause aliasing issues
});

/**
 * Types of HF content detected
 */
const HFContentType = Object.freeze({
  NONE: 'NONE',                 // No significant HF
  HARMONIC: 'HARMONIC',         // Natural harmonic overtones
  SYNTHESIS: 'SYNTHESIS',       // Synthesizer/digital generation
  NOISE: 'NOISE',               // Noise/hiss in HF
  ULTRASONIC: 'ULTRASONIC',     // Content above 20kHz
  MIXED: 'MIXED'                // Multiple types present
});

/**
 * Processing scenarios that may introduce aliasing
 */
const ProcessingRisk = Object.freeze({
  NONE: 'NONE',
  DOWNSAMPLING: 'DOWNSAMPLING',     // 48k→44.1k, 96k→48k, etc.
  PITCH_SHIFT: 'PITCH_SHIFT',       // Time-stretching with pitch change
  DISTORTION: 'DISTORTION',         // Non-linear processing creates harmonics
  SYNTHESIS: 'SYNTHESIS',           // Oscillators without band-limiting
  FILTERING: 'FILTERING'            // Aggressive EQ/filter slopes
});

/**
 * Status descriptions for UI
 */
const STATUS_DESCRIPTIONS = Object.freeze({
  [AliasingRiskStatus.SAFE]: 'No significant high-frequency content near Nyquist limit. Safe for any processing.',
  [AliasingRiskStatus.LOW_RISK]: 'Minimal high-frequency content detected. Low aliasing risk for most operations.',
  [AliasingRiskStatus.MODERATE_RISK]: 'Notable high-frequency content present. Apply gentle low-pass before downsampling.',
  [AliasingRiskStatus.HIGH_RISK]: 'Significant content near Nyquist. Anti-aliasing filter strongly recommended.',
  [AliasingRiskStatus.CRITICAL]: 'Critical HF content detected. Will cause audible aliasing artifacts without proper filtering.'
});

/**
 * Analysis thresholds
 */
const THRESHOLDS = Object.freeze({
  // HF energy thresholds (dB below peak)
  HF_ENERGY: {
    NEGLIGIBLE: -60,      // HF energy this far below peak is negligible
    LOW: -48,             // Low HF energy
    MODERATE: -36,        // Moderate HF energy
    HIGH: -24,            // High HF energy
    CRITICAL: -12         // Very high HF energy
  },
  
  // Frequency band definitions (as ratio of Nyquist)
  FREQUENCY_BANDS: {
    SAFE_ZONE: 0.8,       // Below 80% of Nyquist is generally safe
    WARNING_ZONE: 0.9,    // 80-90% of Nyquist needs attention
    DANGER_ZONE: 0.95,    // 90-95% of Nyquist is risky
    CRITICAL_ZONE: 0.98   // Above 98% of Nyquist is critical
  },
  
  // Common sample rates
  SAMPLE_RATES: {
    CD: 44100,
    PROFESSIONAL: 48000,
    HIGH_RES: 96000,
    ULTRA_HIGH: 192000
  },
  
  // Minimum analysis requirements
  MIN_DURATION: 0.5       // Minimum seconds for reliable analysis
});

/**
 * Reference values for calibration
 */
const REFERENCE = Object.freeze({
  AUDIBLE_LIMIT_HZ: 20000,
  CD_NYQUIST: 22050,
  PROFESSIONAL_NYQUIST: 24000,
  TYPICAL_ANTI_ALIAS_ROLLOFF: 0.9  // Most filters start at 90% Nyquist
});

// ============================================================================
// FFmpeg Helpers
// ============================================================================

/**
 * Execute an ffprobe command and return stdout
 */
function execFfprobe(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', args);
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', data => stdout += data.toString());
    proc.stderr.on('data', data => stderr += data.toString());
    
    proc.on('close', code => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
      }
    });
  });
}

/**
 * Execute an ffmpeg command and return stderr (where audio analysis goes)
 */
function execFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', data => stdout += data.toString());
    proc.stderr.on('data', data => stderr += data.toString());
    
    proc.on('close', code => {
      if (code === 0) {
        resolve(stderr);
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
      }
    });
  });
}

// ============================================================================
// Audio Analysis Functions
// ============================================================================

/**
 * Get audio file sample rate
 */
async function getSampleRate(filePath) {
  try {
    const output = await execFfprobe([
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=sample_rate',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ]);
    
    return parseInt(output.trim(), 10) || THRESHOLDS.SAMPLE_RATES.CD;
  } catch (error) {
    console.error('[AliasingRisk] Sample rate detection failed:', error.message);
    return THRESHOLDS.SAMPLE_RATES.CD;
  }
}

/**
 * Get audio file duration
 */
async function getDuration(filePath) {
  try {
    const output = await execFfprobe([
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ]);
    
    return parseFloat(output.trim()) || 0;
  } catch (error) {
    console.error('[AliasingRisk] Duration check failed:', error.message);
    return 0;
  }
}

/**
 * Measure energy in a specific frequency band using highpass/lowpass filters
 */
async function measureBandEnergy(filePath, lowFreq, highFreq) {
  try {
    // Build filter chain to isolate band
    let filterChain = [];
    
    if (lowFreq > 0) {
      filterChain.push(`highpass=f=${lowFreq}`);
    }
    if (highFreq > 0 && highFreq < 100000) {
      filterChain.push(`lowpass=f=${highFreq}`);
    }
    filterChain.push('astats=metadata=1:reset=1');
    
    const output = await execFfmpeg([
      '-i', filePath,
      '-af', filterChain.join(','),
      '-f', 'null',
      '-'
    ]);
    
    // Parse RMS level from astats output
    const rmsMatch = output.match(/RMS level dB:\s*([-\d.]+)/);
    const peakMatch = output.match(/Peak level dB:\s*([-\d.]+)/);
    
    return {
      rmsDb: rmsMatch ? parseFloat(rmsMatch[1]) : -100,
      peakDb: peakMatch ? parseFloat(peakMatch[1]) : -100,
      isValid: !!(rmsMatch || peakMatch)
    };
  } catch (error) {
    console.error('[AliasingRisk] Band energy measurement failed:', error.message);
    return { rmsDb: -100, peakDb: -100, isValid: false };
  }
}

/**
 * Get overall audio stats for reference
 */
async function getOverallStats(filePath) {
  try {
    const output = await execFfmpeg([
      '-i', filePath,
      '-af', 'astats=metadata=1:reset=1',
      '-f', 'null',
      '-'
    ]);
    
    const rmsMatch = output.match(/RMS level dB:\s*([-\d.]+)/);
    const peakMatch = output.match(/Peak level dB:\s*([-\d.]+)/);
    
    return {
      rmsDb: rmsMatch ? parseFloat(rmsMatch[1]) : -30,
      peakDb: peakMatch ? parseFloat(peakMatch[1]) : -6,
      isValid: !!(rmsMatch || peakMatch)
    };
  } catch (error) {
    console.error('[AliasingRisk] Overall stats failed:', error.message);
    return { rmsDb: -30, peakDb: -6, isValid: false };
  }
}

/**
 * Analyze HF content in bands relative to Nyquist
 */
async function analyzeHFBands(filePath, sampleRate) {
  const nyquist = sampleRate / 2;
  
  // Define bands as percentages of Nyquist
  const bands = [
    { name: 'safe', low: nyquist * 0.6, high: nyquist * 0.8 },
    { name: 'warning', low: nyquist * 0.8, high: nyquist * 0.9 },
    { name: 'danger', low: nyquist * 0.9, high: nyquist * 0.95 },
    { name: 'critical', low: nyquist * 0.95, high: nyquist * 0.99 }
  ];
  
  // Measure each band
  const results = {};
  
  for (const band of bands) {
    const energy = await measureBandEnergy(filePath, band.low, band.high);
    results[band.name] = {
      lowFreq: band.low,
      highFreq: band.high,
      ...energy
    };
  }
  
  return results;
}

/**
 * Calculate HF energy relative to overall content
 */
function calculateRelativeHFEnergy(overallStats, hfBandStats) {
  const reference = overallStats.rmsDb || -30;
  
  return {
    safeRelativeDb: hfBandStats.safe.rmsDb - reference,
    warningRelativeDb: hfBandStats.warning.rmsDb - reference,
    dangerRelativeDb: hfBandStats.danger.rmsDb - reference,
    criticalRelativeDb: hfBandStats.critical.rmsDb - reference
  };
}

/**
 * Detect the type of HF content based on spectral characteristics
 */
function detectHFContentType(hfBands, relativeEnergy) {
  // If no significant HF energy, return NONE
  if (relativeEnergy.warningRelativeDb < THRESHOLDS.HF_ENERGY.NEGLIGIBLE &&
      relativeEnergy.dangerRelativeDb < THRESHOLDS.HF_ENERGY.NEGLIGIBLE) {
    return HFContentType.NONE;
  }
  
  // Check for ultrasonic content (content in critical band)
  if (relativeEnergy.criticalRelativeDb > THRESHOLDS.HF_ENERGY.MODERATE) {
    return HFContentType.ULTRASONIC;
  }
  
  // Flat HF spectrum suggests noise
  const bandVariation = Math.abs(
    (relativeEnergy.safeRelativeDb - relativeEnergy.dangerRelativeDb)
  );
  
  if (bandVariation < 6) {
    return HFContentType.NOISE;
  }
  
  // Steep rolloff suggests natural harmonics
  if (relativeEnergy.safeRelativeDb - relativeEnergy.dangerRelativeDb > 18) {
    return HFContentType.HARMONIC;
  }
  
  // Moderate energy across bands suggests synthesis
  if (relativeEnergy.warningRelativeDb > THRESHOLDS.HF_ENERGY.MODERATE &&
      relativeEnergy.dangerRelativeDb > THRESHOLDS.HF_ENERGY.LOW) {
    return HFContentType.SYNTHESIS;
  }
  
  return HFContentType.MIXED;
}

/**
 * Calculate aliasing risk score (0-100)
 */
function calculateAliasingRiskScore(relativeEnergy, hfContentType) {
  if (!relativeEnergy) return 0;
  
  let score = 0;
  
  // Base score from danger/critical zone energy
  // More negative = less energy = lower risk
  const dangerEnergy = relativeEnergy.dangerRelativeDb || -100;
  const criticalEnergy = relativeEnergy.criticalRelativeDb || -100;
  
  // Convert dB to linear-ish score
  // -60dB = negligible = 0 points, -12dB = critical = max points
  const dangerScore = Math.max(0, (dangerEnergy + 60) / 48) * 30;
  const criticalScore = Math.max(0, (criticalEnergy + 60) / 48) * 50;
  
  score += dangerScore + criticalScore;
  
  // Boost for certain content types
  if (hfContentType === HFContentType.SYNTHESIS) {
    score *= 1.2;
  } else if (hfContentType === HFContentType.ULTRASONIC) {
    score *= 1.5;
  }
  
  return Math.min(100, Math.max(0, Math.round(score)));
}

/**
 * Determine risk status from metrics
 */
function classifyAliasingRisk(relativeEnergy) {
  if (!relativeEnergy) {
    return AliasingRiskStatus.SAFE;
  }
  
  const dangerEnergy = relativeEnergy.dangerRelativeDb || -100;
  const criticalEnergy = relativeEnergy.criticalRelativeDb || -100;
  
  // Check critical zone first
  if (criticalEnergy > THRESHOLDS.HF_ENERGY.HIGH) {
    return AliasingRiskStatus.CRITICAL;
  }
  
  if (dangerEnergy > THRESHOLDS.HF_ENERGY.HIGH) {
    return AliasingRiskStatus.HIGH_RISK;
  }
  
  if (dangerEnergy > THRESHOLDS.HF_ENERGY.MODERATE) {
    return AliasingRiskStatus.MODERATE_RISK;
  }
  
  if (dangerEnergy > THRESHOLDS.HF_ENERGY.LOW) {
    return AliasingRiskStatus.LOW_RISK;
  }
  
  return AliasingRiskStatus.SAFE;
}

/**
 * Assess risk for specific processing operations
 */
function assessProcessingRisk(metrics, targetSampleRate = null) {
  const risks = [];
  
  // If downsampling, check if target Nyquist is below current content
  if (targetSampleRate && metrics.sampleRate > targetSampleRate) {
    const targetNyquist = targetSampleRate / 2;
    const currentNyquist = metrics.sampleRate / 2;
    
    // Content that's safe at current rate may be dangerous after downsampling
    const contentAboveTarget = metrics.hfBands?.warning?.rmsDb > -60;
    
    if (contentAboveTarget && targetNyquist < currentNyquist * 0.9) {
      risks.push({
        type: ProcessingRisk.DOWNSAMPLING,
        severity: 'high',
        description: `Downsampling from ${metrics.sampleRate}Hz to ${targetSampleRate}Hz with HF content present`
      });
    }
  }
  
  // General distortion risk
  if (metrics.relativeEnergy?.dangerRelativeDb > THRESHOLDS.HF_ENERGY.MODERATE) {
    risks.push({
      type: ProcessingRisk.DISTORTION,
      severity: 'moderate',
      description: 'Distortion/saturation may create aliasing artifacts'
    });
  }
  
  // Pitch shift risk
  if (metrics.hfContentType === HFContentType.SYNTHESIS ||
      metrics.hfContentType === HFContentType.ULTRASONIC) {
    risks.push({
      type: ProcessingRisk.PITCH_SHIFT,
      severity: 'moderate',
      description: 'Pitch shifting may fold HF content into audible range'
    });
  }
  
  return risks;
}

/**
 * Recommend anti-aliasing filter frequency
 */
function recommendFilterFrequency(sampleRate, status) {
  const nyquist = sampleRate / 2;
  
  switch (status) {
    case AliasingRiskStatus.CRITICAL:
      return Math.round(nyquist * 0.85);  // Aggressive filtering
    case AliasingRiskStatus.HIGH_RISK:
      return Math.round(nyquist * 0.88);
    case AliasingRiskStatus.MODERATE_RISK:
      return Math.round(nyquist * 0.92);
    case AliasingRiskStatus.LOW_RISK:
      return Math.round(nyquist * 0.95);
    default:
      return null;  // No filtering needed
  }
}

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations(metrics) {
  if (!metrics) return [];
  
  const recs = [];
  const { status, hfContentType, sampleRate } = metrics;
  
  if (status === AliasingRiskStatus.SAFE) {
    recs.push('No anti-aliasing concerns. Safe for standard processing.');
    return recs;
  }
  
  // General HF warning
  if (status === AliasingRiskStatus.MODERATE_RISK || 
      status === AliasingRiskStatus.HIGH_RISK ||
      status === AliasingRiskStatus.CRITICAL) {
    const filterFreq = recommendFilterFrequency(sampleRate, status);
    if (filterFreq) {
      recs.push(`Apply low-pass filter at ${filterFreq}Hz before any sample rate conversion.`);
    }
  }
  
  // Content-specific recommendations
  switch (hfContentType) {
    case HFContentType.NOISE:
      recs.push('HF noise detected. Consider gentle high-shelf reduction or noise reduction.');
      break;
    case HFContentType.SYNTHESIS:
      recs.push('Synthesized content with strong HF. Use oversampling during processing.');
      break;
    case HFContentType.ULTRASONIC:
      recs.push('Ultrasonic content present. Apply brick-wall filter above 20kHz for distribution.');
      break;
    case HFContentType.HARMONIC:
      recs.push('Natural harmonics extend into HF. Gentle slope filter recommended to preserve character.');
      break;
  }
  
  // Processing-specific warnings
  if (status === AliasingRiskStatus.CRITICAL) {
    recs.push('CRITICAL: Do not apply distortion, saturation, or pitch shifting without anti-aliasing.');
    recs.push('Consider working at higher sample rate and downsampling as final step.');
  }
  
  return recs;
}

// ============================================================================
// Classification Function (for external use)
// ============================================================================

/**
 * Classify aliasing risk from metrics object
 * @param {Object} metrics - Analysis metrics
 * @returns {Object} Classification result
 */
function classify(metrics) {
  if (!metrics) {
    return {
      status: AliasingRiskStatus.SAFE,
      description: STATUS_DESCRIPTIONS[AliasingRiskStatus.SAFE],
      aliasingRiskScore: 0,
      hfContentType: HFContentType.NONE,
      recommendedFilterHz: null
    };
  }
  
  const relativeEnergy = metrics.relativeEnergy || {
    dangerRelativeDb: -100,
    criticalRelativeDb: -100
  };
  
  const hfContentType = metrics.hfContentType || HFContentType.NONE;
  const status = classifyAliasingRisk(relativeEnergy);
  const score = calculateAliasingRiskScore(relativeEnergy, hfContentType);
  const filterFreq = recommendFilterFrequency(metrics.sampleRate || 44100, status);
  
  return {
    status,
    description: STATUS_DESCRIPTIONS[status],
    aliasingRiskScore: score,
    hfContentType,
    recommendedFilterHz: filterFreq
  };
}

// ============================================================================
// Main API Functions
// ============================================================================

/**
 * Quick check for aliasing risk
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Quick analysis result
 */
async function quickCheck(filePath) {
  try {
    // Get sample rate
    const sampleRate = await getSampleRate(filePath);
    const nyquist = sampleRate / 2;
    
    // Just check the danger zone
    const dangerBand = await measureBandEnergy(
      filePath, 
      nyquist * 0.9, 
      nyquist * 0.98
    );
    
    const overallStats = await getOverallStats(filePath);
    
    const relativeEnergy = {
      dangerRelativeDb: dangerBand.rmsDb - overallStats.rmsDb,
      criticalRelativeDb: -100  // Not checked in quick mode
    };
    
    const status = classifyAliasingRisk(relativeEnergy);
    const score = calculateAliasingRiskScore(relativeEnergy, HFContentType.NONE);
    
    return {
      status,
      description: STATUS_DESCRIPTIONS[status],
      aliasingRiskScore: score,
      sampleRate,
      nyquistHz: nyquist,
      dangerZoneEnergyDb: dangerBand.rmsDb,
      relativeHFEnergyDb: relativeEnergy.dangerRelativeDb,
      confidence: dangerBand.isValid && overallStats.isValid ? 0.75 : 0.3
    };
  } catch (error) {
    console.error('[AliasingRisk] Quick check failed:', error.message);
    return {
      status: AliasingRiskStatus.SAFE,
      description: STATUS_DESCRIPTIONS[AliasingRiskStatus.SAFE],
      aliasingRiskScore: 0,
      sampleRate: 44100,
      nyquistHz: 22050,
      dangerZoneEnergyDb: -100,
      relativeHFEnergyDb: -100,
      confidence: 0
    };
  }
}

/**
 * Full aliasing risk analysis
 * @param {string} filePath - Path to audio file
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Comprehensive analysis result
 */
async function analyze(filePath, options = {}) {
  try {
    const { targetSampleRate = null } = options;
    
    // Gather all metrics in parallel
    const [sampleRate, duration, overallStats] = await Promise.all([
      getSampleRate(filePath),
      getDuration(filePath),
      getOverallStats(filePath)
    ]);
    
    // Check minimum duration
    if (duration < THRESHOLDS.MIN_DURATION) {
      return {
        status: AliasingRiskStatus.SAFE,
        description: 'File too short for reliable analysis',
        aliasingRiskScore: 0,
        sampleRate,
        nyquistHz: sampleRate / 2,
        duration,
        confidence: 0.2
      };
    }
    
    // Analyze HF bands
    const hfBands = await analyzeHFBands(filePath, sampleRate);
    
    // Calculate relative energy
    const relativeEnergy = calculateRelativeHFEnergy(overallStats, hfBands);
    
    // Detect content type
    const hfContentType = detectHFContentType(hfBands, relativeEnergy);
    
    // Calculate classification
    const status = classifyAliasingRisk(relativeEnergy);
    const aliasingRiskScore = calculateAliasingRiskScore(relativeEnergy, hfContentType);
    const recommendedFilterHz = recommendFilterFrequency(sampleRate, status);
    
    // Assess processing risks
    const processingRisks = assessProcessingRisk({
      sampleRate,
      hfBands,
      relativeEnergy,
      hfContentType
    }, targetSampleRate);
    
    // Generate recommendations
    const recommendations = generateRecommendations({
      status,
      hfContentType,
      sampleRate
    });
    
    return {
      status,
      description: STATUS_DESCRIPTIONS[status],
      aliasingRiskScore,
      sampleRate,
      nyquistHz: sampleRate / 2,
      duration,
      
      // HF Analysis
      hfContentType,
      hfBands: {
        safe: {
          rangeHz: `${Math.round(hfBands.safe.lowFreq)}-${Math.round(hfBands.safe.highFreq)}`,
          rmsDb: hfBands.safe.rmsDb
        },
        warning: {
          rangeHz: `${Math.round(hfBands.warning.lowFreq)}-${Math.round(hfBands.warning.highFreq)}`,
          rmsDb: hfBands.warning.rmsDb
        },
        danger: {
          rangeHz: `${Math.round(hfBands.danger.lowFreq)}-${Math.round(hfBands.danger.highFreq)}`,
          rmsDb: hfBands.danger.rmsDb
        },
        critical: {
          rangeHz: `${Math.round(hfBands.critical.lowFreq)}-${Math.round(hfBands.critical.highFreq)}`,
          rmsDb: hfBands.critical.rmsDb
        }
      },
      
      // Relative energy (vs overall content)
      relativeEnergy: {
        safeZoneDb: relativeEnergy.safeRelativeDb,
        warningZoneDb: relativeEnergy.warningRelativeDb,
        dangerZoneDb: relativeEnergy.dangerRelativeDb,
        criticalZoneDb: relativeEnergy.criticalRelativeDb
      },
      
      // Recommendations
      recommendedFilterHz,
      processingRisks,
      recommendations,
      
      // Confidence
      confidence: overallStats.isValid ? 0.9 : 0.5
    };
  } catch (error) {
    console.error('[AliasingRisk] Analysis failed:', error.message);
    return {
      status: AliasingRiskStatus.SAFE,
      description: 'Analysis failed - assuming safe',
      aliasingRiskScore: 0,
      sampleRate: 44100,
      nyquistHz: 22050,
      hfContentType: HFContentType.NONE,
      confidence: 0,
      error: error.message
    };
  }
}

// ============================================================================
// Module Exports
// ============================================================================

module.exports = {
  // Main API
  analyze,
  quickCheck,
  classify,
  
  // Analysis functions
  getSampleRate,
  measureBandEnergy,
  analyzeHFBands,
  calculateRelativeHFEnergy,
  detectHFContentType,
  
  // Classification functions
  classifyAliasingRisk,
  calculateAliasingRiskScore,
  assessProcessingRisk,
  recommendFilterFrequency,
  generateRecommendations,
  
  // Constants
  AliasingRiskStatus,
  HFContentType,
  ProcessingRisk,
  STATUS_DESCRIPTIONS,
  THRESHOLDS,
  REFERENCE
};
