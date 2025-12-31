/**
 * Mono Fold-Down Simulator
 * 
 * Analyzes stereo audio to predict phase cancellation and level changes
 * when summed to mono. Uses L-R correlation analysis per frequency band
 * to identify problematic stereo content.
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Analysis provides actionable
 * metrics for transformation parameter selection.
 * 
 * Critical for:
 * - Club/festival PA systems (often mono below 100-120Hz)
 * - Bluetooth/mono speaker playback
 * - Broadcast downmix (mono compatibility required)
 * - Vinyl cutting (mono bass required)
 */

const { spawn } = require('child_process');

// ============================================================================
// Configuration
// ============================================================================

const FFMPEG_PATH = 'ffmpeg';
const FFPROBE_PATH = 'ffprobe';

/**
 * Frequency bands for mono compatibility analysis
 * Critical bands (bass) have stricter thresholds
 */
const ANALYSIS_BANDS = [
  { name: 'subBass',  low: 20,    high: 80,    critical: true,  label: 'Sub Bass (20-80Hz)' },
  { name: 'bass',     low: 80,    high: 250,   critical: true,  label: 'Bass (80-250Hz)' },
  { name: 'lowMid',   low: 250,   high: 500,   critical: false, label: 'Low Mid (250-500Hz)' },
  { name: 'mid',      low: 500,   high: 2000,  critical: false, label: 'Mid (500Hz-2kHz)' },
  { name: 'upperMid', low: 2000,  high: 6000,  critical: false, label: 'Upper Mid (2-6kHz)' },
  { name: 'high',     low: 6000,  high: 20000, critical: false, label: 'High (6-20kHz)' }
];

/**
 * Perceptual weights for overall correlation calculation
 */
const BAND_WEIGHTS = {
  subBass: 0.15,
  bass: 0.25,
  lowMid: 0.20,
  mid: 0.20,
  upperMid: 0.12,
  high: 0.08
};

/**
 * Mono compatibility status classifications
 */
const MonoCompatibilityStatus = {
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
  [MonoCompatibilityStatus.EXCELLENT]: 'Fully mono-compatible with minimal phase issues',
  [MonoCompatibilityStatus.GOOD]: 'Good mono compatibility with minor stereo content',
  [MonoCompatibilityStatus.FAIR]: 'Moderate mono compatibility, some cancellation possible',
  [MonoCompatibilityStatus.POOR]: 'Poor mono compatibility, significant cancellation likely',
  [MonoCompatibilityStatus.CRITICAL]: 'Critical phase issues, severe cancellation in mono'
};

/**
 * Correlation thresholds for status classification
 */
const CORRELATION_THRESHOLDS = {
  EXCELLENT: 0.8,
  GOOD: 0.6,
  FAIR: 0.4,
  POOR: 0.2
};

/**
 * Gain change thresholds (dB)
 */
const GAIN_THRESHOLDS = {
  EXCELLENT: -1.0,
  GOOD: -2.0,
  FAIR: -3.0,
  POOR: -6.0
};

/**
 * Cancellation severity classifications
 */
const CancellationSeverity = {
  NONE: 'NONE',
  MINOR: 'MINOR',
  MODERATE: 'MODERATE',
  SEVERE: 'SEVERE',
  CRITICAL: 'CRITICAL'
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
    console.error('[MonoFoldDownSimulator] Duration detection failed:', error.message);
    return 0;
  }
}

/**
 * Check if audio file is stereo
 */
async function isStereo(filePath) {
  try {
    const args = [
      '-v', 'error',
      '-show_entries', 'stream=channels',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ];
    
    const { stdout } = await execCommand(FFPROBE_PATH, args);
    const channels = parseInt(stdout.trim(), 10);
    return channels >= 2;
  } catch (error) {
    console.error('[MonoFoldDownSimulator] Channel detection failed:', error.message);
    return false;
  }
}

// ============================================================================
// Core Analysis Functions
// ============================================================================

/**
 * Measure overall stereo phase correlation using aphasemeter
 */
async function measureOverallCorrelation(filePath) {
  try {
    const args = [
      '-i', filePath,
      '-af', 'aphasemeter=video=0',
      '-f', 'null', '-'
    ];
    
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    const phaseMatches = stderr.match(/phase:\s*(-?[\d.]+)/g);
    
    if (!phaseMatches || phaseMatches.length === 0) {
      return { correlation: 1.0, samples: 0 };
    }
    
    const phaseValues = phaseMatches.map(m => {
      const match = m.match(/phase:\s*(-?[\d.]+)/);
      return match ? parseFloat(match[1]) : 0;
    });
    
    const avgCorrelation = phaseValues.reduce((a, b) => a + b, 0) / phaseValues.length;
    
    return {
      correlation: avgCorrelation,
      samples: phaseValues.length,
      min: Math.min(...phaseValues),
      max: Math.max(...phaseValues)
    };
  } catch (error) {
    console.error('[MonoFoldDownSimulator] Correlation measurement failed:', error.message);
    return { correlation: 1.0, samples: 0 };
  }
}

/**
 * Measure phase correlation for a specific frequency band
 */
async function measureBandCorrelation(filePath, lowFreq, highFreq) {
  try {
    const filterChain = 'highpass=f=' + lowFreq + ',lowpass=f=' + highFreq + ',aphasemeter=video=0';
    
    const args = [
      '-i', filePath,
      '-af', filterChain,
      '-f', 'null', '-'
    ];
    
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    const phaseMatches = stderr.match(/phase:\s*(-?[\d.]+)/g);
    
    if (!phaseMatches || phaseMatches.length === 0) {
      return { correlation: 1.0, samples: 0 };
    }
    
    const phaseValues = phaseMatches.map(m => {
      const match = m.match(/phase:\s*(-?[\d.]+)/);
      return match ? parseFloat(match[1]) : 0;
    });
    
    const avgCorrelation = phaseValues.reduce((a, b) => a + b, 0) / phaseValues.length;
    
    return {
      correlation: avgCorrelation,
      samples: phaseValues.length,
      min: Math.min(...phaseValues),
      max: Math.max(...phaseValues)
    };
  } catch (error) {
    console.error('[MonoFoldDownSimulator] Band correlation failed (' + lowFreq + '-' + highFreq + 'Hz):', error.message);
    return { correlation: 1.0, samples: 0 };
  }
}

/**
 * Measure stereo and mono RMS levels for gain change calculation
 */
async function measureLevels(filePath) {
  try {
    const stereoArgs = [
      '-i', filePath,
      '-af', 'astats=metadata=1:reset=1',
      '-f', 'null', '-'
    ];
    
    const stereoResult = await execCommand(FFMPEG_PATH, stereoArgs);
    
    const monoArgs = [
      '-i', filePath,
      '-af', 'pan=mono|c0=0.5*c0+0.5*c1,astats=metadata=1:reset=1',
      '-f', 'null', '-'
    ];
    
    const monoResult = await execCommand(FFMPEG_PATH, monoArgs);
    
    const stereoRmsMatch = stereoResult.stderr.match(/RMS level dB:\s*(-?[\d.]+)/);
    const monoRmsMatch = monoResult.stderr.match(/RMS level dB:\s*(-?[\d.]+)/);
    
    const stereoRms = stereoRmsMatch ? parseFloat(stereoRmsMatch[1]) : -20;
    const monoRms = monoRmsMatch ? parseFloat(monoRmsMatch[1]) : -20;
    
    return {
      stereoRmsDb: stereoRms,
      monoRmsDb: monoRms,
      gainChangeDb: monoRms - stereoRms
    };
  } catch (error) {
    console.error('[MonoFoldDownSimulator] Level measurement failed:', error.message);
    return { stereoRmsDb: -20, monoRmsDb: -20, gainChangeDb: 0 };
  }
}

/**
 * Measure band-specific gain change when folded to mono
 */
async function measureBandLevels(filePath, lowFreq, highFreq) {
  try {
    const bandFilter = 'highpass=f=' + lowFreq + ',lowpass=f=' + highFreq;
    
    const stereoArgs = [
      '-i', filePath,
      '-af', bandFilter + ',astats=metadata=1:reset=1',
      '-f', 'null', '-'
    ];
    
    const monoArgs = [
      '-i', filePath,
      '-af', 'pan=mono|c0=0.5*c0+0.5*c1,' + bandFilter + ',astats=metadata=1:reset=1',
      '-f', 'null', '-'
    ];
    
    const [stereoResult, monoResult] = await Promise.all([
      execCommand(FFMPEG_PATH, stereoArgs),
      execCommand(FFMPEG_PATH, monoArgs)
    ]);
    
    const stereoRmsMatch = stereoResult.stderr.match(/RMS level dB:\s*(-?[\d.]+)/);
    const monoRmsMatch = monoResult.stderr.match(/RMS level dB:\s*(-?[\d.]+)/);
    
    const stereoRms = stereoRmsMatch ? parseFloat(stereoRmsMatch[1]) : -60;
    const monoRms = monoRmsMatch ? parseFloat(monoRmsMatch[1]) : -60;
    
    return {
      stereoRmsDb: stereoRms,
      monoRmsDb: monoRms,
      gainChangeDb: monoRms - stereoRms
    };
  } catch (error) {
    console.error('[MonoFoldDownSimulator] Band level failed (' + lowFreq + '-' + highFreq + 'Hz):', error.message);
    return { stereoRmsDb: -60, monoRmsDb: -60, gainChangeDb: 0 };
  }
}

// ============================================================================
// Classification Functions
// ============================================================================

/**
 * Estimate mono gain change from correlation coefficient
 */
function estimateGainFromCorrelation(correlation) {
  if (correlation >= 1) return 3.0;
  if (correlation <= -1) return -96;
  
  const gainFactor = (1 + correlation) / 2;
  return 10 * Math.log10(gainFactor + 1e-10);
}

/**
 * Classify cancellation severity for a band
 */
function classifyCancellationSeverity(correlation, gainChangeDb, isCritical) {
  const thresholdMultiplier = isCritical ? 1.5 : 1.0;
  
  if (gainChangeDb < -6 * thresholdMultiplier || correlation < 0) {
    return CancellationSeverity.CRITICAL;
  }
  if (gainChangeDb < -4 * thresholdMultiplier || correlation < 0.2) {
    return CancellationSeverity.SEVERE;
  }
  if (gainChangeDb < -2 * thresholdMultiplier || correlation < 0.4) {
    return CancellationSeverity.MODERATE;
  }
  if (gainChangeDb < -1 * thresholdMultiplier || correlation < 0.7) {
    return CancellationSeverity.MINOR;
  }
  return CancellationSeverity.NONE;
}

/**
 * Classify overall mono compatibility status
 */
function classifyMonoCompatibility(metrics) {
  const { overallCorrelation, monoGainChangeDb, bassCorrelation } = metrics;
  
  if (bassCorrelation < 0.2) return MonoCompatibilityStatus.CRITICAL;
  if (monoGainChangeDb < -6) return MonoCompatibilityStatus.CRITICAL;
  
  if (overallCorrelation >= CORRELATION_THRESHOLDS.EXCELLENT && 
      monoGainChangeDb >= GAIN_THRESHOLDS.EXCELLENT) {
    return MonoCompatibilityStatus.EXCELLENT;
  }
  
  if (overallCorrelation >= CORRELATION_THRESHOLDS.GOOD && 
      monoGainChangeDb >= GAIN_THRESHOLDS.GOOD) {
    return MonoCompatibilityStatus.GOOD;
  }
  
  if (overallCorrelation >= CORRELATION_THRESHOLDS.FAIR && 
      monoGainChangeDb >= GAIN_THRESHOLDS.FAIR) {
    return MonoCompatibilityStatus.FAIR;
  }
  
  if (overallCorrelation >= CORRELATION_THRESHOLDS.POOR) {
    return MonoCompatibilityStatus.POOR;
  }
  
  return MonoCompatibilityStatus.CRITICAL;
}

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations(analysis) {
  const recommendations = [];
  
  if (analysis.status === MonoCompatibilityStatus.EXCELLENT) {
    recommendations.push('Audio is fully mono-compatible, no action needed');
    return recommendations;
  }
  
  const bassBands = analysis.bandAnalysis.filter(b => 
    b.name === 'subBass' || b.name === 'bass'
  );
  
  for (const band of bassBands) {
    if (band.correlation < 0.5) {
      recommendations.push(band.label + ': Use mono bass or reduce stereo width below ' + band.high + 'Hz');
    }
  }
  
  for (const band of analysis.bandAnalysis) {
    if (band.severity === CancellationSeverity.SEVERE || 
        band.severity === CancellationSeverity.CRITICAL) {
      recommendations.push(band.label + ': Significant phase cancellation detected (' + band.gainChangeDb.toFixed(1) + 'dB loss)');
    }
  }
  
  if (analysis.status === MonoCompatibilityStatus.CRITICAL) {
    recommendations.push('Consider using stereo-to-mono bass processing');
    recommendations.push('Review stereo widening plugins for phase issues');
  } else if (analysis.status === MonoCompatibilityStatus.POOR) {
    recommendations.push('Check on mono playback systems before delivery');
    recommendations.push('Consider reducing stereo width on problematic elements');
  } else if (analysis.status === MonoCompatibilityStatus.FAIR) {
    recommendations.push('Minor mono compatibility issues detected');
    recommendations.push('Test on mono Bluetooth speakers to verify translation');
  }
  
  return recommendations;
}

/**
 * Predict timbre changes when folded to mono
 */
function predictTimbreChanges(bandAnalysis) {
  const changes = [];
  
  for (const band of bandAnalysis) {
    if (band.gainChangeDb < -2) {
      const description = band.gainChangeDb < -6
        ? band.label + ' will be significantly quieter (' + band.gainChangeDb.toFixed(1) + 'dB)'
        : band.label + ' will lose ' + Math.abs(band.gainChangeDb).toFixed(1) + 'dB';
      
      changes.push({
        band: band.name,
        label: band.label,
        description,
        gainChangeDb: band.gainChangeDb,
        severity: band.severity
      });
    }
  }
  
  return changes;
}

// ============================================================================
// Main Analysis Functions
// ============================================================================

/**
 * Full mono fold-down analysis
 */
async function analyze(filePath, options = {}) {
  const {
    includeBandAnalysis = true,
    includeTimeline = false
  } = options;
  
  try {
    const stereo = await isStereo(filePath);
    if (!stereo) {
      return {
        status: MonoCompatibilityStatus.EXCELLENT,
        description: 'Audio is already mono',
        overallCorrelation: 1.0,
        monoGainChangeDb: 0,
        bassCorrelation: 1.0,
        bandAnalysis: [],
        timbreChanges: [],
        recommendations: ['Audio is already mono, no fold-down analysis needed'],
        confidence: 1.0
      };
    }
    
    const duration = await getAudioDuration(filePath);
    const overallPhase = await measureOverallCorrelation(filePath);
    const overallLevels = await measureLevels(filePath);
    
    let bandAnalysis = [];
    if (includeBandAnalysis) {
      bandAnalysis = await Promise.all(
        ANALYSIS_BANDS.map(async (band) => {
          const [correlation, levels] = await Promise.all([
            measureBandCorrelation(filePath, band.low, band.high),
            measureBandLevels(filePath, band.low, band.high)
          ]);
          
          const severity = classifyCancellationSeverity(
            correlation.correlation,
            levels.gainChangeDb,
            band.critical
          );
          
          return {
            name: band.name,
            label: band.label,
            low: band.low,
            high: band.high,
            critical: band.critical,
            correlation: correlation.correlation,
            correlationMin: correlation.min,
            correlationMax: correlation.max,
            stereoRmsDb: levels.stereoRmsDb,
            monoRmsDb: levels.monoRmsDb,
            gainChangeDb: levels.gainChangeDb,
            severity
          };
        })
      );
    }
    
    const subBassBand = bandAnalysis.find(b => b.name === 'subBass');
    const bassBand = bandAnalysis.find(b => b.name === 'bass');
    const bassCorrelation = subBassBand && bassBand
      ? (subBassBand.correlation * 0.4 + bassBand.correlation * 0.6)
      : overallPhase.correlation;
    
    let weightedCorrelation = overallPhase.correlation;
    if (bandAnalysis.length > 0) {
      weightedCorrelation = bandAnalysis.reduce((sum, band) => {
        const weight = BAND_WEIGHTS[band.name] || 0.1;
        return sum + band.correlation * weight;
      }, 0);
    }
    
    const worstBand = bandAnalysis.length > 0
      ? bandAnalysis.reduce((worst, band) => 
          band.gainChangeDb < worst.gainChangeDb ? band : worst
        )
      : null;
    
    const metrics = {
      overallCorrelation: weightedCorrelation,
      monoGainChangeDb: overallLevels.gainChangeDb,
      bassCorrelation
    };
    const status = classifyMonoCompatibility(metrics);
    
    const timbreChanges = predictTimbreChanges(bandAnalysis);
    
    const result = {
      status,
      description: STATUS_DESCRIPTIONS[status],
      overallCorrelation: weightedCorrelation,
      rawCorrelation: overallPhase.correlation,
      correlationRange: {
        min: overallPhase.min,
        max: overallPhase.max
      },
      monoGainChangeDb: overallLevels.gainChangeDb,
      stereoRmsDb: overallLevels.stereoRmsDb,
      monoRmsDb: overallLevels.monoRmsDb,
      bassCorrelation,
      bandAnalysis,
      worstBand: worstBand ? {
        name: worstBand.name,
        label: worstBand.label,
        correlation: worstBand.correlation,
        gainChangeDb: worstBand.gainChangeDb,
        severity: worstBand.severity
      } : null,
      timbreChanges,
      recommendations: generateRecommendations({
        status,
        bandAnalysis,
        overallCorrelation: weightedCorrelation,
        monoGainChangeDb: overallLevels.gainChangeDb
      }),
      duration,
      confidence: Math.min(1, overallPhase.samples / 100)
    };
    
    return result;
  } catch (error) {
    console.error('[MonoFoldDownSimulator] Analysis failed:', error.message);
    return {
      status: MonoCompatibilityStatus.EXCELLENT,
      description: 'Analysis failed, assuming mono-compatible',
      overallCorrelation: 1.0,
      monoGainChangeDb: 0,
      bassCorrelation: 1.0,
      bandAnalysis: [],
      timbreChanges: [],
      recommendations: [],
      confidence: 0,
      error: error.message
    };
  }
}

/**
 * Quick mono compatibility check (faster, less detailed)
 */
async function quickCheck(filePath) {
  try {
    const stereo = await isStereo(filePath);
    if (!stereo) {
      return {
        status: MonoCompatibilityStatus.EXCELLENT,
        overallCorrelation: 1.0,
        monoGainChangeDb: 0,
        bassCorrelation: 1.0,
        confidence: 1.0
      };
    }
    
    const [overallPhase, bassCorr, levels] = await Promise.all([
      measureOverallCorrelation(filePath),
      measureBandCorrelation(filePath, 20, 250),
      measureLevels(filePath)
    ]);
    
    const metrics = {
      overallCorrelation: overallPhase.correlation,
      monoGainChangeDb: levels.gainChangeDb,
      bassCorrelation: bassCorr.correlation
    };
    
    const status = classifyMonoCompatibility(metrics);
    
    return {
      status,
      overallCorrelation: overallPhase.correlation,
      monoGainChangeDb: levels.gainChangeDb,
      bassCorrelation: bassCorr.correlation,
      confidence: Math.min(1, overallPhase.samples / 100)
    };
  } catch (error) {
    console.error('[MonoFoldDownSimulator] Quick check failed:', error.message);
    return {
      status: MonoCompatibilityStatus.EXCELLENT,
      overallCorrelation: 1.0,
      monoGainChangeDb: 0,
      bassCorrelation: 1.0,
      confidence: 0,
      error: error.message
    };
  }
}

/**
 * Classify mono compatibility from pre-computed metrics
 */
function classify(metrics) {
  const {
    overallCorrelation = 1.0,
    monoGainChangeDb = 0,
    bassCorrelation = 1.0,
    bandCorrelations = []
  } = metrics;
  
  let bandAnalysis = [];
  if (bandCorrelations.length > 0) {
    bandAnalysis = ANALYSIS_BANDS.map((band, i) => {
      const corr = bandCorrelations[i] || 1.0;
      const estGain = estimateGainFromCorrelation(corr);
      
      return {
        name: band.name,
        label: band.label,
        correlation: corr,
        gainChangeDb: estGain,
        severity: classifyCancellationSeverity(corr, estGain, band.critical)
      };
    });
  }
  
  const status = classifyMonoCompatibility({
    overallCorrelation,
    monoGainChangeDb,
    bassCorrelation
  });
  
  return {
    status,
    description: STATUS_DESCRIPTIONS[status],
    overallCorrelation,
    monoGainChangeDb,
    bassCorrelation,
    bandAnalysis,
    timbreChanges: predictTimbreChanges(bandAnalysis)
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  analyze,
  quickCheck,
  classify,
  measureOverallCorrelation,
  measureBandCorrelation,
  measureLevels,
  measureBandLevels,
  isStereo,
  getAudioDuration,
  classifyMonoCompatibility,
  classifyCancellationSeverity,
  estimateGainFromCorrelation,
  generateRecommendations,
  predictTimbreChanges,
  MonoCompatibilityStatus,
  CancellationSeverity,
  STATUS_DESCRIPTIONS,
  ANALYSIS_BANDS,
  BAND_WEIGHTS,
  CORRELATION_THRESHOLDS,
  GAIN_THRESHOLDS
};
