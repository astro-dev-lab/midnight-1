/**
 * Club System Stress Estimator
 * 
 * Predicts PA limiter stress, subwoofer excursion risk, and overall
 * club playback safety by analyzing sub-bass energy, dynamics, and
 * bass-to-total ratio.
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Analysis provides actionable
 * metrics for transformation parameter selection.
 * 
 * Critical for:
 * - Festival PA systems (high SPL, limiter protection)
 * - Club subwoofer systems (excursion limits)
 * - Large venue sound systems
 * - Broadcast trucks (bass management)
 */

const { spawn } = require('child_process');

// ============================================================================
// Configuration
// ============================================================================

const FFMPEG_PATH = 'ffmpeg';
const FFPROBE_PATH = 'ffprobe';

/**
 * Frequency bands for club system analysis
 * Based on typical PA/subwoofer crossover points
 */
const CLUB_BANDS = {
  SUB_BASS: { low: 20, high: 60, label: 'Sub-bass (20-60Hz)' },
  BASS: { low: 60, high: 120, label: 'Bass (60-120Hz)' },
  LOW_MID: { low: 120, high: 250, label: 'Low-mids (120-250Hz)' },
  MID: { low: 250, high: 2000, label: 'Midrange (250Hz-2kHz)' },
  HIGH: { low: 2000, high: 20000, label: 'Highs (2kHz-20kHz)' }
};

/**
 * PA limiter stress levels
 */
const LimiterStress = {
  NONE: 'NONE',
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
  SEVERE: 'SEVERE'
};

/**
 * Overall club playback status
 */
const ClubPlaybackStatus = {
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
  [ClubPlaybackStatus.EXCELLENT]: 'Excellent club translation with balanced bass energy',
  [ClubPlaybackStatus.GOOD]: 'Good club playback with minor PA stress expected',
  [ClubPlaybackStatus.FAIR]: 'Fair playback with moderate limiter engagement likely',
  [ClubPlaybackStatus.POOR]: 'Poor translation with significant limiter stress',
  [ClubPlaybackStatus.CRITICAL]: 'Critical - may cause PA protection/shutdown'
};

/**
 * Thresholds for classification
 */
const THRESHOLDS = {
  // Sub-bass to total energy ratio
  SUB_BASS_RATIO: {
    EXCELLENT: 0.15,
    GOOD: 0.20,
    FAIR: 0.25,
    POOR: 0.30
  },
  // Bass peak to RMS ratio (crest factor indicator)
  BASS_CREST: {
    LOW: 6,      // Less than 6dB = high stress
    MODERATE: 9, // 6-9dB = moderate stress
    HIGH: 12     // 9-12dB = low stress
  },
  // Bass energy relative to mid-range
  BASS_MID_RATIO: {
    EXCELLENT: 1.2,
    GOOD: 1.5,
    FAIR: 2.0,
    POOR: 2.5
  },
  // Estimated limiter threshold offset
  LIMITER_HEADROOM_DB: {
    SAFE: -6,
    MODERATE: -3,
    HIGH: 0
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
    console.error('[ClubSystemStress] Duration detection failed:', error.message);
    return 0;
  }
}

// ============================================================================
// Core Analysis Functions
// ============================================================================

/**
 * Measure RMS and peak energy for a specific frequency band
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
    
    // Parse RMS and peak levels
    const rmsMatch = stderr.match(/RMS level dB:\s*(-?[\d.]+)/);
    const peakMatch = stderr.match(/Peak level dB:\s*(-?[\d.]+)/);
    
    const rmsDb = rmsMatch ? parseFloat(rmsMatch[1]) : -96;
    const peakDb = peakMatch ? parseFloat(peakMatch[1]) : -96;
    
    // Calculate crest factor (peak - RMS)
    const crestDb = peakDb - rmsDb;
    
    // Convert dB to linear for ratio calculations
    const rmsLinear = Math.pow(10, rmsDb / 20);
    
    return {
      rmsDb,
      peakDb,
      crestDb,
      rmsLinear,
      energyLinear: rmsLinear * rmsLinear
    };
  } catch (error) {
    console.error('[ClubSystemStress] Band energy failed (' + lowFreq + '-' + highFreq + 'Hz):', error.message);
    return { rmsDb: -96, peakDb: -96, crestDb: 0, rmsLinear: 0, energyLinear: 0 };
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
    const peakMatch = stderr.match(/Peak level dB:\s*(-?[\d.]+)/);
    
    const rmsDb = rmsMatch ? parseFloat(rmsMatch[1]) : -20;
    const peakDb = peakMatch ? parseFloat(peakMatch[1]) : -3;
    const rmsLinear = Math.pow(10, rmsDb / 20);
    
    return {
      rmsDb,
      peakDb,
      crestDb: peakDb - rmsDb,
      rmsLinear,
      energyLinear: rmsLinear * rmsLinear
    };
  } catch (error) {
    console.error('[ClubSystemStress] Total energy measurement failed:', error.message);
    return { rmsDb: -20, peakDb: -3, crestDb: 17, rmsLinear: 0.1, energyLinear: 0.01 };
  }
}

/**
 * Analyze all frequency bands relevant to club systems
 */
async function analyzeBands(filePath) {
  const [total, subBass, bass, lowMid, mid, high] = await Promise.all([
    measureTotalEnergy(filePath),
    measureBandEnergy(filePath, CLUB_BANDS.SUB_BASS.low, CLUB_BANDS.SUB_BASS.high),
    measureBandEnergy(filePath, CLUB_BANDS.BASS.low, CLUB_BANDS.BASS.high),
    measureBandEnergy(filePath, CLUB_BANDS.LOW_MID.low, CLUB_BANDS.LOW_MID.high),
    measureBandEnergy(filePath, CLUB_BANDS.MID.low, CLUB_BANDS.MID.high),
    measureBandEnergy(filePath, CLUB_BANDS.HIGH.low, CLUB_BANDS.HIGH.high)
  ]);
  
  const totalEnergy = total.energyLinear || 1e-10;
  
  // Combined low frequency energy (what stresses subs and PA limiters)
  const combinedBassEnergy = subBass.energyLinear + bass.energyLinear;
  
  return {
    total,
    subBass: {
      ...subBass,
      ratio: subBass.energyLinear / totalEnergy,
      band: CLUB_BANDS.SUB_BASS
    },
    bass: {
      ...bass,
      ratio: bass.energyLinear / totalEnergy,
      band: CLUB_BANDS.BASS
    },
    lowMid: {
      ...lowMid,
      ratio: lowMid.energyLinear / totalEnergy,
      band: CLUB_BANDS.LOW_MID
    },
    mid: {
      ...mid,
      ratio: mid.energyLinear / totalEnergy,
      band: CLUB_BANDS.MID
    },
    high: {
      ...high,
      ratio: high.energyLinear / totalEnergy,
      band: CLUB_BANDS.HIGH
    },
    combinedBass: {
      energyLinear: combinedBassEnergy,
      ratio: combinedBassEnergy / totalEnergy,
      rmsDb: 10 * Math.log10(combinedBassEnergy + 1e-10)
    }
  };
}

// ============================================================================
// Classification Functions
// ============================================================================

/**
 * Estimate PA limiter stress level
 */
function estimateLimiterStress(bandAnalysis) {
  const { subBass, bass, combinedBass, total } = bandAnalysis;
  
  // Factor 1: Combined bass ratio
  const bassRatio = combinedBass.ratio;
  
  // Factor 2: Sub-bass crest factor (lower = more sustained = more stress)
  const bassCrest = (subBass.crestDb + bass.crestDb) / 2;
  
  // Factor 3: Overall loudness (higher RMS = more stress)
  const totalRms = total.rmsDb;
  
  // Scoring system
  let stressScore = 0;
  
  // Bass ratio contribution
  if (bassRatio > 0.35) stressScore += 40;
  else if (bassRatio > 0.25) stressScore += 25;
  else if (bassRatio > 0.18) stressScore += 15;
  else if (bassRatio > 0.12) stressScore += 5;
  
  // Crest factor contribution (lower crest = higher stress)
  if (bassCrest < 4) stressScore += 35;
  else if (bassCrest < 6) stressScore += 25;
  else if (bassCrest < 9) stressScore += 15;
  else if (bassCrest < 12) stressScore += 5;
  
  // Overall loudness contribution
  if (totalRms > -8) stressScore += 25;
  else if (totalRms > -12) stressScore += 15;
  else if (totalRms > -16) stressScore += 5;
  
  // Classify
  if (stressScore >= 70) return LimiterStress.SEVERE;
  if (stressScore >= 50) return LimiterStress.HIGH;
  if (stressScore >= 30) return LimiterStress.MODERATE;
  if (stressScore >= 10) return LimiterStress.LOW;
  return LimiterStress.NONE;
}

/**
 * Estimate subwoofer excursion risk
 */
function estimateExcursionRisk(bandAnalysis) {
  const { subBass } = bandAnalysis;
  
  // Sub-bass peak level relative to RMS (transient content)
  const crestDb = subBass.crestDb;
  
  // Sub-bass energy ratio
  const subBassRatio = subBass.ratio;
  
  // Risk scoring
  let riskScore = 0;
  
  // High sub-bass ratio increases excursion risk
  if (subBassRatio > 0.25) riskScore += 50;
  else if (subBassRatio > 0.18) riskScore += 35;
  else if (subBassRatio > 0.12) riskScore += 20;
  else if (subBassRatio > 0.08) riskScore += 10;
  
  // Low crest factor (sustained bass) increases risk
  if (crestDb < 3) riskScore += 50;
  else if (crestDb < 6) riskScore += 30;
  else if (crestDb < 10) riskScore += 15;
  
  // Classify risk level
  if (riskScore >= 70) return 'CRITICAL';
  if (riskScore >= 50) return 'HIGH';
  if (riskScore >= 30) return 'MODERATE';
  if (riskScore >= 10) return 'LOW';
  return 'MINIMAL';
}

/**
 * Calculate bass-to-mid ratio
 */
function calculateBassMidRatio(bandAnalysis) {
  const { combinedBass, mid } = bandAnalysis;
  
  if (mid.energyLinear < 1e-10) {
    return combinedBass.energyLinear > 0 ? 10 : 1;  // Very bass-heavy or neutral
  }
  
  return combinedBass.energyLinear / mid.energyLinear;
}

/**
 * Classify overall club playback status
 */
function classifyPlaybackStatus(bandAnalysis) {
  const { subBass, combinedBass } = bandAnalysis;
  const bassMidRatio = calculateBassMidRatio(bandAnalysis);
  const limiterStress = estimateLimiterStress(bandAnalysis);
  
  // Use sub-bass ratio as primary metric
  const subBassRatio = subBass.ratio;
  
  // Excellent: Low sub-bass, balanced bass-mid, no limiter stress
  if (subBassRatio < THRESHOLDS.SUB_BASS_RATIO.EXCELLENT && 
      bassMidRatio < THRESHOLDS.BASS_MID_RATIO.EXCELLENT &&
      (limiterStress === LimiterStress.NONE || limiterStress === LimiterStress.LOW)) {
    return ClubPlaybackStatus.EXCELLENT;
  }
  
  // Good: Moderate sub-bass, reasonable bass-mid
  if (subBassRatio < THRESHOLDS.SUB_BASS_RATIO.GOOD && 
      bassMidRatio < THRESHOLDS.BASS_MID_RATIO.GOOD &&
      limiterStress !== LimiterStress.SEVERE && limiterStress !== LimiterStress.HIGH) {
    return ClubPlaybackStatus.GOOD;
  }
  
  // Fair: Elevated sub-bass but manageable
  if (subBassRatio < THRESHOLDS.SUB_BASS_RATIO.FAIR && 
      bassMidRatio < THRESHOLDS.BASS_MID_RATIO.FAIR) {
    return ClubPlaybackStatus.FAIR;
  }
  
  // Poor: High sub-bass, high bass-mid ratio
  if (subBassRatio < THRESHOLDS.SUB_BASS_RATIO.POOR) {
    return ClubPlaybackStatus.POOR;
  }
  
  return ClubPlaybackStatus.CRITICAL;
}

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations(analysis) {
  const recommendations = [];
  const { status, limiterStress, excursionRisk, bandAnalysis, bassMidRatio } = analysis;
  
  if (status === ClubPlaybackStatus.EXCELLENT) {
    recommendations.push('Mix is well-suited for club PA systems');
    return recommendations;
  }
  
  // Limiter stress recommendations
  if (limiterStress === LimiterStress.SEVERE || limiterStress === LimiterStress.HIGH) {
    recommendations.push('High PA limiter stress expected - consider reducing sub-bass energy');
    recommendations.push('Use high-pass filter at 30-35Hz to reduce subsonic content');
  } else if (limiterStress === LimiterStress.MODERATE) {
    recommendations.push('Moderate limiter engagement likely on loud systems');
  }
  
  // Excursion risk recommendations
  if (excursionRisk === 'CRITICAL' || excursionRisk === 'HIGH') {
    recommendations.push('Subwoofer excursion risk is high - sustained sub-bass may trigger protection');
    recommendations.push('Consider adding dynamic control (multiband compression) on sub frequencies');
  }
  
  // Bass-mid ratio recommendations
  if (bassMidRatio && bassMidRatio > 2.0) {
    recommendations.push('Bass-to-mid ratio is high (' + bassMidRatio.toFixed(1) + ':1) - may sound muddy in clubs');
  }
  
  // Sub-bass specific
  if (bandAnalysis && bandAnalysis.subBass && bandAnalysis.subBass.ratio > 0.25) {
    recommendations.push('Sub-bass content (20-60Hz) is ' + (bandAnalysis.subBass.ratio * 100).toFixed(0) + '% of total energy');
    recommendations.push('Festival systems may limit heavily on bass drops');
  }
  
  // Status-specific recommendations
  if (status === ClubPlaybackStatus.CRITICAL) {
    recommendations.push('Playback on large PA systems is risky - recommend bass reduction');
  } else if (status === ClubPlaybackStatus.POOR) {
    recommendations.push('Test on club-style monitors before final delivery');
  }
  
  return recommendations;
}

// ============================================================================
// Main Analysis Functions
// ============================================================================

/**
 * Full club system stress analysis
 */
async function analyze(filePath, options = {}) {
  try {
    const duration = await getAudioDuration(filePath);
    const bandAnalysis = await analyzeBands(filePath);
    
    const status = classifyPlaybackStatus(bandAnalysis);
    const limiterStress = estimateLimiterStress(bandAnalysis);
    const excursionRisk = estimateExcursionRisk(bandAnalysis);
    const bassMidRatio = calculateBassMidRatio(bandAnalysis);
    
    const result = {
      status,
      description: STATUS_DESCRIPTIONS[status],
      limiterStress,
      excursionRisk,
      bassMidRatio,
      bandAnalysis: {
        subBass: {
          label: bandAnalysis.subBass.band.label,
          rmsDb: bandAnalysis.subBass.rmsDb,
          peakDb: bandAnalysis.subBass.peakDb,
          crestDb: bandAnalysis.subBass.crestDb,
          ratio: bandAnalysis.subBass.ratio,
          percentage: (bandAnalysis.subBass.ratio * 100).toFixed(1) + '%'
        },
        bass: {
          label: bandAnalysis.bass.band.label,
          rmsDb: bandAnalysis.bass.rmsDb,
          peakDb: bandAnalysis.bass.peakDb,
          crestDb: bandAnalysis.bass.crestDb,
          ratio: bandAnalysis.bass.ratio,
          percentage: (bandAnalysis.bass.ratio * 100).toFixed(1) + '%'
        },
        lowMid: {
          label: bandAnalysis.lowMid.band.label,
          rmsDb: bandAnalysis.lowMid.rmsDb,
          ratio: bandAnalysis.lowMid.ratio,
          percentage: (bandAnalysis.lowMid.ratio * 100).toFixed(1) + '%'
        },
        mid: {
          label: bandAnalysis.mid.band.label,
          rmsDb: bandAnalysis.mid.rmsDb,
          ratio: bandAnalysis.mid.ratio,
          percentage: (bandAnalysis.mid.ratio * 100).toFixed(1) + '%'
        },
        high: {
          label: bandAnalysis.high.band.label,
          rmsDb: bandAnalysis.high.rmsDb,
          ratio: bandAnalysis.high.ratio,
          percentage: (bandAnalysis.high.ratio * 100).toFixed(1) + '%'
        },
        combinedBass: {
          ratio: bandAnalysis.combinedBass.ratio,
          percentage: (bandAnalysis.combinedBass.ratio * 100).toFixed(1) + '%'
        }
      },
      recommendations: generateRecommendations({
        status,
        limiterStress,
        excursionRisk,
        bandAnalysis,
        bassMidRatio
      }),
      duration,
      confidence: duration > 0 ? 1.0 : 0
    };
    
    return result;
  } catch (error) {
    console.error('[ClubSystemStress] Analysis failed:', error.message);
    return {
      status: ClubPlaybackStatus.FAIR,
      description: 'Analysis failed',
      limiterStress: LimiterStress.MODERATE,
      excursionRisk: 'MODERATE',
      bassMidRatio: 1,
      bandAnalysis: {},
      recommendations: [],
      confidence: 0,
      error: error.message
    };
  }
}

/**
 * Quick club playback assessment
 */
async function quickCheck(filePath) {
  try {
    const bandAnalysis = await analyzeBands(filePath);
    const status = classifyPlaybackStatus(bandAnalysis);
    const limiterStress = estimateLimiterStress(bandAnalysis);
    const excursionRisk = estimateExcursionRisk(bandAnalysis);
    const bassMidRatio = calculateBassMidRatio(bandAnalysis);
    
    return {
      status,
      limiterStress,
      excursionRisk,
      bassMidRatio,
      subBassRatio: bandAnalysis.subBass.ratio,
      combinedBassRatio: bandAnalysis.combinedBass.ratio,
      confidence: 1.0
    };
  } catch (error) {
    console.error('[ClubSystemStress] Quick check failed:', error.message);
    return {
      status: ClubPlaybackStatus.FAIR,
      limiterStress: LimiterStress.MODERATE,
      excursionRisk: 'MODERATE',
      bassMidRatio: 1,
      subBassRatio: 0,
      combinedBassRatio: 0,
      confidence: 0,
      error: error.message
    };
  }
}

/**
 * Classify from pre-computed metrics
 */
function classify(metrics) {
  const {
    subBassRatio = 0.1,
    bassRatio = 0.15,
    midRatio = 0.3,
    subBassCrest = 10,
    bassCrest = 10,
    totalRmsDb = -16
  } = metrics;
  
  // Reconstruct band analysis structure
  const bandAnalysis = {
    subBass: { 
      ratio: subBassRatio, 
      energyLinear: subBassRatio, 
      crestDb: subBassCrest 
    },
    bass: { 
      ratio: bassRatio, 
      energyLinear: bassRatio, 
      crestDb: bassCrest 
    },
    mid: { 
      ratio: midRatio, 
      energyLinear: midRatio 
    },
    combinedBass: {
      energyLinear: subBassRatio + bassRatio,
      ratio: subBassRatio + bassRatio
    },
    total: {
      rmsDb: totalRmsDb
    }
  };
  
  const status = classifyPlaybackStatus(bandAnalysis);
  const limiterStress = estimateLimiterStress(bandAnalysis);
  const excursionRisk = estimateExcursionRisk(bandAnalysis);
  const bassMidRatio = calculateBassMidRatio(bandAnalysis);
  
  return {
    status,
    description: STATUS_DESCRIPTIONS[status],
    limiterStress,
    excursionRisk,
    bassMidRatio
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
  classifyPlaybackStatus,
  estimateLimiterStress,
  estimateExcursionRisk,
  calculateBassMidRatio,
  generateRecommendations,
  getAudioDuration,
  ClubPlaybackStatus,
  LimiterStress,
  STATUS_DESCRIPTIONS,
  CLUB_BANDS,
  THRESHOLDS
};
