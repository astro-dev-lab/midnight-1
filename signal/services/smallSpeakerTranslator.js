/**
 * Small Speaker Translation Estimator
 * 
 * Predicts bass disappearance on phone/laptop/tablet speakers by analyzing
 * frequency band energy distribution. Small speakers have physical high-pass
 * characteristics that cut frequencies below 150-200Hz.
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Analysis provides actionable
 * metrics for transformation parameter selection.
 * 
 * Critical for:
 * - Phone speaker playback (social media, streaming)
 * - Laptop/tablet speakers
 * - Small Bluetooth speakers
 * - Earbuds (which have limited bass extension)
 */

const { spawn } = require('child_process');

// ============================================================================
// Configuration
// ============================================================================

const FFMPEG_PATH = 'ffmpeg';
const FFPROBE_PATH = 'ffprobe';

/**
 * Frequency bands for small speaker analysis
 * Based on typical phone/laptop speaker response characteristics
 */
const SPEAKER_BANDS = {
  LOST: { low: 20, high: 80, weight: 0.0, label: 'Sub-bass (20-80Hz) - Lost' },
  AT_RISK: { low: 80, high: 150, weight: 0.2, label: 'Low bass (80-150Hz) - At Risk' },
  SURVIVAL: { low: 150, high: 400, weight: 1.0, label: 'Upper bass (150-400Hz) - Survival Zone' },
  PRESERVED: { low: 400, high: 1000, weight: 1.0, label: 'Low mids (400Hz-1kHz) - Preserved' }
};

/**
 * Device-specific frequency response profiles
 */
const DEVICE_PROFILES = {
  PHONE: {
    name: 'Phone Speaker',
    cutoff3dB: 200,
    cutoff12dB: 100,
    cutoff24dB: 60
  },
  LAPTOP: {
    name: 'Laptop Speaker',
    cutoff3dB: 150,
    cutoff12dB: 80,
    cutoff24dB: 50
  },
  TABLET: {
    name: 'Tablet Speaker',
    cutoff3dB: 120,
    cutoff12dB: 80,
    cutoff24dB: 50
  },
  BLUETOOTH_SMALL: {
    name: 'Small Bluetooth Speaker',
    cutoff3dB: 100,
    cutoff12dB: 60,
    cutoff24dB: 40
  }
};

/**
 * Translation quality status classifications
 */
const TranslationStatus = {
  EXCELLENT: 'EXCELLENT',
  GOOD: 'GOOD',
  FAIR: 'FAIR',
  POOR: 'POOR',
  CRITICAL: 'CRITICAL'
};

/**
 * Status descriptions for reports
 */
const STATUS_DESCRIPTIONS = {
  [TranslationStatus.EXCELLENT]: 'Excellent small speaker translation with strong harmonic content',
  [TranslationStatus.GOOD]: 'Good translation with minor bass thinning on phones',
  [TranslationStatus.FAIR]: 'Fair translation with noticeable bass loss on small speakers',
  [TranslationStatus.POOR]: 'Poor translation with significant bass disappearance',
  [TranslationStatus.CRITICAL]: 'Critical translation issues - mix will sound empty/thin'
};

/**
 * Thresholds for classification
 */
const THRESHOLDS = {
  LOST_RATIO: {
    EXCELLENT: 0.15,
    GOOD: 0.25,
    FAIR: 0.35,
    POOR: 0.45
  },
  SURVIVAL_RATIO: {
    EXCELLENT: 0.25,
    GOOD: 0.20,
    FAIR: 0.15,
    POOR: 0.10
  },
  PERCEIVED_LOSS_DB: {
    EXCELLENT: 3,
    GOOD: 6,
    FAIR: 9,
    POOR: 12
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
        reject(new Error(command + ' exited with code ' + code + ': ' + stderr));
      }
    });
    
    proc.on('error', (err) => {
      reject(new Error('Failed to spawn ' + command + ': ' + err.message));
    });
  });
}

/**
 * Get audio duration using ffprobe
 */
async function getAudioDuration(filePath) {
  try {
    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ];
    
    const { stdout } = await execCommand(FFPROBE_PATH, args);
    return parseFloat(stdout.trim()) || 0;
  } catch (error) {
    console.error('[SmallSpeakerTranslator] Duration detection failed:', error.message);
    return 0;
  }
}

// ============================================================================
// Core Analysis Functions
// ============================================================================

/**
 * Measure RMS energy for a specific frequency band
 */
async function measureBandEnergy(filePath, lowFreq, highFreq) {
  try {
    const filterChain = 'highpass=f=' + lowFreq + ',lowpass=f=' + highFreq + ',astats=metadata=1:reset=1';
    
    const args = [
      '-i', filePath,
      '-af', filterChain,
      '-f', 'null', '-'
    ];
    
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse RMS level
    const rmsMatch = stderr.match(/RMS level dB:\s*(-?[\d.]+)/);
    const peakMatch = stderr.match(/Peak level dB:\s*(-?[\d.]+)/);
    
    const rmsDb = rmsMatch ? parseFloat(rmsMatch[1]) : -96;
    const peakDb = peakMatch ? parseFloat(peakMatch[1]) : -96;
    
    // Convert dB to linear for ratio calculations
    const rmsLinear = Math.pow(10, rmsDb / 20);
    
    return {
      rmsDb,
      peakDb,
      rmsLinear,
      energyLinear: rmsLinear * rmsLinear  // Energy is power, proportional to amplitude squared
    };
  } catch (error) {
    console.error('[SmallSpeakerTranslator] Band energy failed (' + lowFreq + '-' + highFreq + 'Hz):', error.message);
    return { rmsDb: -96, peakDb: -96, rmsLinear: 0, energyLinear: 0 };
  }
}

/**
 * Measure total RMS energy across full spectrum
 */
async function measureTotalEnergy(filePath) {
  try {
    const args = [
      '-i', filePath,
      '-af', 'astats=metadata=1:reset=1',
      '-f', 'null', '-'
    ];
    
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    const rmsMatch = stderr.match(/RMS level dB:\s*(-?[\d.]+)/);
    const rmsDb = rmsMatch ? parseFloat(rmsMatch[1]) : -20;
    const rmsLinear = Math.pow(10, rmsDb / 20);
    
    return {
      rmsDb,
      rmsLinear,
      energyLinear: rmsLinear * rmsLinear
    };
  } catch (error) {
    console.error('[SmallSpeakerTranslator] Total energy measurement failed:', error.message);
    return { rmsDb: -20, rmsLinear: 0.1, energyLinear: 0.01 };
  }
}

/**
 * Analyze all frequency bands
 */
async function analyzeBands(filePath) {
  const [total, lost, atRisk, survival, preserved] = await Promise.all([
    measureTotalEnergy(filePath),
    measureBandEnergy(filePath, SPEAKER_BANDS.LOST.low, SPEAKER_BANDS.LOST.high),
    measureBandEnergy(filePath, SPEAKER_BANDS.AT_RISK.low, SPEAKER_BANDS.AT_RISK.high),
    measureBandEnergy(filePath, SPEAKER_BANDS.SURVIVAL.low, SPEAKER_BANDS.SURVIVAL.high),
    measureBandEnergy(filePath, SPEAKER_BANDS.PRESERVED.low, SPEAKER_BANDS.PRESERVED.high)
  ]);
  
  const totalEnergy = total.energyLinear || 1e-10;
  
  return {
    total,
    lost: {
      ...lost,
      ratio: lost.energyLinear / totalEnergy,
      band: SPEAKER_BANDS.LOST
    },
    atRisk: {
      ...atRisk,
      ratio: atRisk.energyLinear / totalEnergy,
      band: SPEAKER_BANDS.AT_RISK
    },
    survival: {
      ...survival,
      ratio: survival.energyLinear / totalEnergy,
      band: SPEAKER_BANDS.SURVIVAL
    },
    preserved: {
      ...preserved,
      ratio: preserved.energyLinear / totalEnergy,
      band: SPEAKER_BANDS.PRESERVED
    }
  };
}

// ============================================================================
// Classification Functions
// ============================================================================

/**
 * Calculate perceived bass loss in dB
 * Based on ratio of survival zone energy to lost zone energy
 */
function calculatePerceivedBassLoss(bandAnalysis) {
  const { lost, atRisk, survival } = bandAnalysis;
  
  // Original bass energy (what would be heard on full-range system)
  const originalBassEnergy = lost.energyLinear + atRisk.energyLinear;
  
  // Translated "bass" energy (upper bass harmonics that suggest the missing bass)
  // The survival zone carries the "punch" and "warmth" that persists on small speakers
  const translatedEnergy = survival.energyLinear * 0.5;  // Harmonics only partially compensate
  
  if (originalBassEnergy < 1e-10) {
    return 0;  // No bass to lose
  }
  
  const lossRatio = translatedEnergy / originalBassEnergy;
  
  // Clamp to reasonable range
  if (lossRatio >= 1) return 0;
  if (lossRatio < 0.001) return 30;  // Cap at 30dB loss
  
  return Math.abs(10 * Math.log10(lossRatio));
}

/**
 * Calculate translation score (0-100)
 */
function calculateTranslationScore(bandAnalysis) {
  const { lost, survival, preserved } = bandAnalysis;
  
  // Penalize high lost ratio
  const lostPenalty = Math.min(50, lost.ratio * 100);
  
  // Reward high survival ratio
  const survivalBonus = Math.min(30, survival.ratio * 100);
  
  // Reward preserved content
  const preservedBonus = Math.min(20, preserved.ratio * 50);
  
  const score = 100 - lostPenalty + survivalBonus + preservedBonus;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Classify translation quality status
 */
function classifyTranslation(bandAnalysis) {
  const { lost, survival } = bandAnalysis;
  const perceivedLoss = calculatePerceivedBassLoss(bandAnalysis);
  
  // Check lost ratio thresholds
  if (lost.ratio < THRESHOLDS.LOST_RATIO.EXCELLENT && 
      survival.ratio > THRESHOLDS.SURVIVAL_RATIO.EXCELLENT &&
      perceivedLoss < THRESHOLDS.PERCEIVED_LOSS_DB.EXCELLENT) {
    return TranslationStatus.EXCELLENT;
  }
  
  if (lost.ratio < THRESHOLDS.LOST_RATIO.GOOD && 
      survival.ratio > THRESHOLDS.SURVIVAL_RATIO.GOOD &&
      perceivedLoss < THRESHOLDS.PERCEIVED_LOSS_DB.GOOD) {
    return TranslationStatus.GOOD;
  }
  
  if (lost.ratio < THRESHOLDS.LOST_RATIO.FAIR && 
      survival.ratio > THRESHOLDS.SURVIVAL_RATIO.FAIR &&
      perceivedLoss < THRESHOLDS.PERCEIVED_LOSS_DB.FAIR) {
    return TranslationStatus.FAIR;
  }
  
  if (lost.ratio < THRESHOLDS.LOST_RATIO.POOR && 
      survival.ratio > THRESHOLDS.SURVIVAL_RATIO.POOR) {
    return TranslationStatus.POOR;
  }
  
  return TranslationStatus.CRITICAL;
}

/**
 * Generate device-specific predictions
 */
function predictDeviceTranslation(bandAnalysis, deviceProfile) {
  const { lost, atRisk, survival, preserved } = bandAnalysis;
  
  // Estimate how much energy is lost at the device's cutoff frequencies
  // Energy below cutoff3dB is reduced by 50%, below cutoff12dB by ~94%, below cutoff24dB by ~99.6%
  
  let effectiveEnergy = preserved.energyLinear;  // Always preserved
  effectiveEnergy += survival.energyLinear;  // Survival zone usually preserved
  
  // At-risk zone: partially attenuated based on device
  if (deviceProfile.cutoff3dB <= SPEAKER_BANDS.AT_RISK.high) {
    effectiveEnergy += atRisk.energyLinear * 0.5;  // Approximate -3dB attenuation
  } else {
    effectiveEnergy += atRisk.energyLinear * 0.1;  // More severe attenuation
  }
  
  // Lost zone: heavily attenuated
  effectiveEnergy += lost.energyLinear * 0.01;  // Essentially gone
  
  const originalEnergy = lost.energyLinear + atRisk.energyLinear + 
                         survival.energyLinear + preserved.energyLinear;
  
  const preservedRatio = effectiveEnergy / (originalEnergy || 1e-10);
  const lossDb = -10 * Math.log10(preservedRatio + 1e-10);
  
  return {
    device: deviceProfile.name,
    preservedRatio,
    estimatedLossDb: Math.max(0, lossDb),
    willSoundThin: lossDb > 6,
    willSoundEmpty: lossDb > 12
  };
}

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations(analysis) {
  const recommendations = [];
  const { status, bandAnalysis, perceivedBassLossDb } = analysis;
  
  if (status === TranslationStatus.EXCELLENT) {
    recommendations.push('Mix translates excellently to small speakers');
    return recommendations;
  }
  
  // Check lost ratio
  if (bandAnalysis.lost.ratio > 0.3) {
    recommendations.push('High sub-bass content (20-80Hz) will disappear on small speakers');
    recommendations.push('Consider adding harmonic saturation to bass elements');
  }
  
  // Check survival ratio
  if (bandAnalysis.survival.ratio < 0.15) {
    recommendations.push('Low upper-bass/low-mid content (150-400Hz) - this is the "translation zone"');
    recommendations.push('Boost 200-400Hz range to improve small speaker presence');
  }
  
  // High perceived loss
  if (perceivedBassLossDb > 9) {
    recommendations.push('Significant perceived bass loss (' + perceivedBassLossDb.toFixed(1) + 'dB) on small speakers');
    recommendations.push('Consider using bass-heavy instruments with more harmonic content');
  }
  
  // Status-specific recommendations
  if (status === TranslationStatus.CRITICAL) {
    recommendations.push('Mix relies heavily on sub-bass - will sound thin/empty on phones');
    recommendations.push('Re-evaluate bass instrument choices or add parallel distortion');
  } else if (status === TranslationStatus.POOR) {
    recommendations.push('Test mix on phone speakers before final delivery');
  } else if (status === TranslationStatus.FAIR) {
    recommendations.push('Minor bass enhancement in 150-300Hz may improve translation');
  }
  
  return recommendations;
}

// ============================================================================
// Main Analysis Functions
// ============================================================================

/**
 * Full small speaker translation analysis
 */
async function analyze(filePath, options = {}) {
  const {
    includeDevicePredictions = true
  } = options;
  
  try {
    const duration = await getAudioDuration(filePath);
    const bandAnalysis = await analyzeBands(filePath);
    
    const status = classifyTranslation(bandAnalysis);
    const perceivedBassLossDb = calculatePerceivedBassLoss(bandAnalysis);
    const translationScore = calculateTranslationScore(bandAnalysis);
    
    // Device predictions
    let devicePredictions = [];
    if (includeDevicePredictions) {
      devicePredictions = Object.values(DEVICE_PROFILES).map(profile => 
        predictDeviceTranslation(bandAnalysis, profile)
      );
    }
    
    const result = {
      status,
      description: STATUS_DESCRIPTIONS[status],
      translationScore,
      perceivedBassLossDb,
      bandAnalysis: {
        lost: {
          label: bandAnalysis.lost.band.label,
          rmsDb: bandAnalysis.lost.rmsDb,
          ratio: bandAnalysis.lost.ratio,
          percentage: (bandAnalysis.lost.ratio * 100).toFixed(1) + '%'
        },
        atRisk: {
          label: bandAnalysis.atRisk.band.label,
          rmsDb: bandAnalysis.atRisk.rmsDb,
          ratio: bandAnalysis.atRisk.ratio,
          percentage: (bandAnalysis.atRisk.ratio * 100).toFixed(1) + '%'
        },
        survival: {
          label: bandAnalysis.survival.band.label,
          rmsDb: bandAnalysis.survival.rmsDb,
          ratio: bandAnalysis.survival.ratio,
          percentage: (bandAnalysis.survival.ratio * 100).toFixed(1) + '%'
        },
        preserved: {
          label: bandAnalysis.preserved.band.label,
          rmsDb: bandAnalysis.preserved.rmsDb,
          ratio: bandAnalysis.preserved.ratio,
          percentage: (bandAnalysis.preserved.ratio * 100).toFixed(1) + '%'
        }
      },
      devicePredictions,
      recommendations: generateRecommendations({
        status,
        bandAnalysis,
        perceivedBassLossDb
      }),
      duration,
      confidence: duration > 0 ? 1.0 : 0
    };
    
    return result;
  } catch (error) {
    console.error('[SmallSpeakerTranslator] Analysis failed:', error.message);
    return {
      status: TranslationStatus.FAIR,
      description: 'Analysis failed',
      translationScore: 50,
      perceivedBassLossDb: 0,
      bandAnalysis: {},
      devicePredictions: [],
      recommendations: [],
      confidence: 0,
      error: error.message
    };
  }
}

/**
 * Quick translation check
 */
async function quickCheck(filePath) {
  try {
    const bandAnalysis = await analyzeBands(filePath);
    const status = classifyTranslation(bandAnalysis);
    const perceivedBassLossDb = calculatePerceivedBassLoss(bandAnalysis);
    const translationScore = calculateTranslationScore(bandAnalysis);
    
    return {
      status,
      translationScore,
      perceivedBassLossDb,
      lostRatio: bandAnalysis.lost.ratio,
      survivalRatio: bandAnalysis.survival.ratio,
      confidence: 1.0
    };
  } catch (error) {
    console.error('[SmallSpeakerTranslator] Quick check failed:', error.message);
    return {
      status: TranslationStatus.FAIR,
      translationScore: 50,
      perceivedBassLossDb: 0,
      lostRatio: 0,
      survivalRatio: 0,
      confidence: 0,
      error: error.message
    };
  }
}

/**
 * Classify from pre-computed band ratios
 */
function classify(metrics) {
  const {
    lostRatio = 0,
    atRiskRatio = 0,
    survivalRatio = 0.3,
    preservedRatio = 0.5
  } = metrics;
  
  // Reconstruct band analysis structure
  const bandAnalysis = {
    lost: { ratio: lostRatio, energyLinear: lostRatio },
    atRisk: { ratio: atRiskRatio, energyLinear: atRiskRatio },
    survival: { ratio: survivalRatio, energyLinear: survivalRatio },
    preserved: { ratio: preservedRatio, energyLinear: preservedRatio }
  };
  
  const status = classifyTranslation(bandAnalysis);
  const perceivedBassLossDb = calculatePerceivedBassLoss(bandAnalysis);
  const translationScore = calculateTranslationScore(bandAnalysis);
  
  return {
    status,
    description: STATUS_DESCRIPTIONS[status],
    translationScore,
    perceivedBassLossDb
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  analyze,
  quickCheck,
  classify,
  measureBandEnergy,
  measureTotalEnergy,
  analyzeBands,
  classifyTranslation,
  calculatePerceivedBassLoss,
  calculateTranslationScore,
  predictDeviceTranslation,
  generateRecommendations,
  getAudioDuration,
  TranslationStatus,
  STATUS_DESCRIPTIONS,
  SPEAKER_BANDS,
  DEVICE_PROFILES,
  THRESHOLDS
};
