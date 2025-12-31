/**
 * Streaming Codec Stress Predictor
 * 
 * Predicts lossy codec artifact risk (MP3, AAC, Opus) by analyzing
 * pre-echo conditions, high-frequency content, stereo complexity,
 * and spectral flux without actually encoding.
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Analysis provides actionable
 * metrics for transformation parameter selection.
 * 
 * Critical for:
 * - Streaming platform delivery (Spotify, Apple Music, YouTube)
 * - Broadcast encoding
 * - Content destined for mobile/low-bandwidth
 * - Quality assurance before lossy distribution
 */

const { spawn } = require('child_process');

// ============================================================================
// Configuration
// ============================================================================

const FFMPEG_PATH = 'ffmpeg';
const FFPROBE_PATH = 'ffprobe';

/**
 * Frequency bands for codec stress analysis
 */
const CODEC_BANDS = {
  LOW: { low: 20, high: 200, label: 'Low frequencies' },
  MID: { low: 200, high: 2000, label: 'Midrange' },
  PRESENCE: { low: 2000, high: 5000, label: 'Presence' },
  SIBILANCE: { low: 5000, high: 10000, label: 'Sibilance zone' },
  AIR: { low: 10000, high: 16000, label: 'Air/Brilliance' },
  ULTRA_HF: { low: 16000, high: 20000, label: 'Ultra-high frequencies' }
};

/**
 * Codec stress status levels
 */
const CodecStressStatus = {
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

/**
 * Pre-echo risk levels
 */
const PreEchoRisk = {
  NONE: 'NONE',
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
  SEVERE: 'SEVERE'
};

/**
 * Status descriptions
 */
const STATUS_DESCRIPTIONS = {
  [CodecStressStatus.LOW]: 'Safe for all streaming bitrates with minimal artifact risk',
  [CodecStressStatus.MODERATE]: 'Minor artifacts possible at bitrates below 192kbps',
  [CodecStressStatus.HIGH]: 'Audible artifacts likely at bitrates below 256kbps',
  [CodecStressStatus.CRITICAL]: 'Significant artifacts expected even at high bitrates'
};

/**
 * Thresholds for classification
 */
const THRESHOLDS = {
  // High-frequency energy ratio
  HF_ENERGY: {
    LOW: 0.10,
    MODERATE: 0.20,
    HIGH: 0.30
  },
  // Sibilance zone energy
  SIBILANCE: {
    LOW: 0.05,
    MODERATE: 0.10,
    HIGH: 0.15
  },
  // Pre-echo detection
  PRE_ECHO: {
    QUIET_THRESHOLD_DB: -40,
    TRANSIENT_JUMP_DB: 20,
    EVENTS_PER_MIN_LOW: 5,
    EVENTS_PER_MIN_MODERATE: 15,
    EVENTS_PER_MIN_HIGH: 30
  },
  // Stereo complexity (side/mid ratio)
  STEREO_COMPLEXITY: {
    LOW: 0.15,
    MODERATE: 0.30,
    HIGH: 0.50
  },
  // Spectral flux
  SPECTRAL_FLUX: {
    LOW: 0.2,
    MODERATE: 0.4,
    HIGH: 0.6
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
        reject(new Error(`${command} exited with code ${code}: ${stderr}`));
      }
    });
    
    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ${command}: ${err.message}`));
    });
  });
}

// ============================================================================
// Audio Analysis Functions
// ============================================================================

/**
 * Get audio duration
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
    console.error('[CodecStressPredictor] Duration detection failed:', error.message);
    return 0;
  }
}

/**
 * Check if audio is stereo
 */
async function isStereo(filePath) {
  try {
    const args = [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=channels',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ];
    
    const { stdout } = await execCommand(FFPROBE_PATH, args);
    const channels = parseInt(stdout.trim(), 10);
    return channels >= 2;
  } catch (error) {
    console.error('[CodecStressPredictor] Channel detection failed:', error.message);
    return false;
  }
}

/**
 * Measure energy in a frequency band
 */
async function measureBandEnergy(filePath, lowFreq, highFreq) {
  try {
    const filterChain = `highpass=f=${lowFreq},lowpass=f=${highFreq},astats=metadata=1:reset=1`;
    
    const args = [
      '-i', filePath,
      '-af', filterChain,
      '-f', 'null',
      '-'
    ];
    
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    const rmsMatch = stderr.match(/RMS level dB:\s*([-\d.]+)/);
    const peakMatch = stderr.match(/Peak level dB:\s*([-\d.]+)/);
    
    const rmsDb = rmsMatch ? parseFloat(rmsMatch[1]) : -60;
    const peakDb = peakMatch ? parseFloat(peakMatch[1]) : -60;
    const rmsLinear = Math.pow(10, rmsDb / 20);
    
    return {
      rmsDb,
      peakDb,
      rmsLinear,
      energyLinear: rmsLinear * rmsLinear
    };
  } catch (error) {
    console.error(`[CodecStressPredictor] Band ${lowFreq}-${highFreq}Hz analysis failed:`, error.message);
    return {
      rmsDb: -60,
      peakDb: -60,
      rmsLinear: 0.001,
      energyLinear: 0.000001
    };
  }
}

/**
 * Measure total energy
 */
async function measureTotalEnergy(filePath) {
  try {
    const args = [
      '-i', filePath,
      '-af', 'astats=metadata=1:reset=1',
      '-f', 'null',
      '-'
    ];
    
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    const rmsMatch = stderr.match(/RMS level dB:\s*([-\d.]+)/);
    const peakMatch = stderr.match(/Peak level dB:\s*([-\d.]+)/);
    
    const rmsDb = rmsMatch ? parseFloat(rmsMatch[1]) : -20;
    const peakDb = peakMatch ? parseFloat(peakMatch[1]) : -3;
    const rmsLinear = Math.pow(10, rmsDb / 20);
    
    return {
      rmsDb,
      peakDb,
      rmsLinear,
      energyLinear: rmsLinear * rmsLinear
    };
  } catch (error) {
    console.error('[CodecStressPredictor] Total energy analysis failed:', error.message);
    return {
      rmsDb: -20,
      peakDb: -3,
      rmsLinear: 0.1,
      energyLinear: 0.01
    };
  }
}

/**
 * Analyze high-frequency content
 */
async function analyzeHighFrequencyContent(filePath) {
  const [sibilance, air, ultraHf, total] = await Promise.all([
    measureBandEnergy(filePath, CODEC_BANDS.SIBILANCE.low, CODEC_BANDS.SIBILANCE.high),
    measureBandEnergy(filePath, CODEC_BANDS.AIR.low, CODEC_BANDS.AIR.high),
    measureBandEnergy(filePath, CODEC_BANDS.ULTRA_HF.low, CODEC_BANDS.ULTRA_HF.high),
    measureTotalEnergy(filePath)
  ]);
  
  const totalEnergy = total.energyLinear || 0.000001;
  
  // Combined HF energy (10kHz+)
  const hfEnergy = air.energyLinear + ultraHf.energyLinear;
  
  return {
    sibilanceRatio: sibilance.energyLinear / totalEnergy,
    airRatio: air.energyLinear / totalEnergy,
    ultraHfRatio: ultraHf.energyLinear / totalEnergy,
    hfEnergyRatio: hfEnergy / totalEnergy,
    total
  };
}

/**
 * Detect pre-echo risk conditions
 * Pre-echo occurs when a sharp transient follows a quiet section
 */
async function analyzePreEchoRisk(filePath, windowSizeMs = 23) {
  try {
    const sampleRate = 44100;
    const samplesPerWindow = Math.round(sampleRate * windowSizeMs / 1000);
    
    // Analyze with small windows to detect transients
    const filterChain = `asetnsamples=n=${samplesPerWindow},astats=metadata=1:reset=1`;
    
    const args = [
      '-i', filePath,
      '-af', filterChain,
      '-f', 'null',
      '-'
    ];
    
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse RMS and peak values from frames
    const rmsMatches = stderr.matchAll(/RMS level dB:\s*([-\d.]+)/g);
    const peakMatches = stderr.matchAll(/Peak level dB:\s*([-\d.]+)/g);
    
    const rmsValues = Array.from(rmsMatches).map(m => parseFloat(m[1]));
    const peakValues = Array.from(peakMatches).map(m => parseFloat(m[1]));
    
    if (rmsValues.length < 3) {
      return {
        preEchoEvents: 0,
        preEchoEventsPerMin: 0,
        preEchoRisk: PreEchoRisk.NONE,
        worstTransientDb: 0
      };
    }
    
    // Detect quiet->loud transitions (pre-echo conditions)
    const quietThreshold = THRESHOLDS.PRE_ECHO.QUIET_THRESHOLD_DB;
    const transientJump = THRESHOLDS.PRE_ECHO.TRANSIENT_JUMP_DB;
    
    let preEchoEvents = 0;
    let worstTransientDb = 0;
    
    for (let i = 2; i < rmsValues.length; i++) {
      const prev1Quiet = rmsValues[i - 1] < quietThreshold;
      const prev2Quiet = rmsValues[i - 2] < quietThreshold;
      const currentLoud = peakValues[i] > rmsValues[i - 1] + transientJump;
      
      if (prev1Quiet && prev2Quiet && currentLoud) {
        preEchoEvents++;
        const jump = peakValues[i] - rmsValues[i - 1];
        worstTransientDb = Math.max(worstTransientDb, jump);
      }
    }
    
    // Calculate events per minute
    const durationSeconds = (rmsValues.length * windowSizeMs) / 1000;
    const eventsPerMin = durationSeconds > 0 ? (preEchoEvents / durationSeconds) * 60 : 0;
    
    // Classify risk
    let preEchoRisk = PreEchoRisk.NONE;
    if (eventsPerMin > THRESHOLDS.PRE_ECHO.EVENTS_PER_MIN_HIGH) {
      preEchoRisk = PreEchoRisk.SEVERE;
    } else if (eventsPerMin > THRESHOLDS.PRE_ECHO.EVENTS_PER_MIN_MODERATE) {
      preEchoRisk = PreEchoRisk.HIGH;
    } else if (eventsPerMin > THRESHOLDS.PRE_ECHO.EVENTS_PER_MIN_LOW) {
      preEchoRisk = PreEchoRisk.MODERATE;
    } else if (preEchoEvents > 0) {
      preEchoRisk = PreEchoRisk.LOW;
    }
    
    return {
      preEchoEvents,
      preEchoEventsPerMin: eventsPerMin,
      preEchoRisk,
      worstTransientDb
    };
  } catch (error) {
    console.error('[CodecStressPredictor] Pre-echo analysis failed:', error.message);
    return {
      preEchoEvents: 0,
      preEchoEventsPerMin: 0,
      preEchoRisk: PreEchoRisk.NONE,
      worstTransientDb: 0
    };
  }
}

/**
 * Analyze stereo complexity for joint stereo encoding stress
 */
async function analyzeStereoComplexity(filePath) {
  try {
    const stereo = await isStereo(filePath);
    
    if (!stereo) {
      return {
        isStereo: false,
        stereoComplexity: 0,
        jointStereoStress: 'NONE'
      };
    }
    
    // Use aphasemeter for phase/correlation analysis
    const args = [
      '-i', filePath,
      '-af', 'aphasemeter=video=0',
      '-f', 'null',
      '-'
    ];
    
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse phase meter values (correlation ranges from -1 to +1)
    const phaseMatches = stderr.matchAll(/phase:\s*([-\d.]+)/g);
    const phaseValues = Array.from(phaseMatches).map(m => parseFloat(m[1]));
    
    if (phaseValues.length === 0) {
      return {
        isStereo: true,
        stereoComplexity: 0.2,
        avgCorrelation: 0.8,
        jointStereoStress: 'LOW'
      };
    }
    
    // Average correlation
    const avgCorrelation = phaseValues.reduce((a, b) => a + b, 0) / phaseValues.length;
    
    // Stereo complexity = how much decorrelation (lower correlation = more complex)
    // Correlation 1.0 = mono, 0 = fully decorrelated, -1 = out of phase
    const stereoComplexity = (1 - avgCorrelation) / 2; // Normalize to 0-1
    
    // Joint stereo stress classification
    let jointStereoStress = 'LOW';
    if (stereoComplexity > THRESHOLDS.STEREO_COMPLEXITY.HIGH) {
      jointStereoStress = 'SEVERE';
    } else if (stereoComplexity > THRESHOLDS.STEREO_COMPLEXITY.MODERATE) {
      jointStereoStress = 'HIGH';
    } else if (stereoComplexity > THRESHOLDS.STEREO_COMPLEXITY.LOW) {
      jointStereoStress = 'MODERATE';
    }
    
    return {
      isStereo: true,
      stereoComplexity,
      avgCorrelation,
      jointStereoStress
    };
  } catch (error) {
    console.error('[CodecStressPredictor] Stereo analysis failed:', error.message);
    return {
      isStereo: true,
      stereoComplexity: 0.2,
      avgCorrelation: 0.8,
      jointStereoStress: 'LOW'
    };
  }
}

/**
 * Calculate spectral flux (rate of spectral change)
 * High spectral flux = rapid timbral changes = codec stress
 */
async function calculateSpectralFlux(filePath, windowSizeMs = 50) {
  try {
    const sampleRate = 44100;
    const samplesPerWindow = Math.round(sampleRate * windowSizeMs / 1000);
    
    // Use astats on small windows to measure frame-to-frame changes
    const filterChain = `asetnsamples=n=${samplesPerWindow},astats=metadata=1:reset=1`;
    
    const args = [
      '-i', filePath,
      '-af', filterChain,
      '-f', 'null',
      '-'
    ];
    
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse RMS values as proxy for spectral content
    const rmsMatches = stderr.matchAll(/RMS level dB:\s*([-\d.]+)/g);
    const rmsValues = Array.from(rmsMatches).map(m => parseFloat(m[1]));
    
    if (rmsValues.length < 2) {
      return {
        spectralFlux: 0,
        spectralFluxNormalized: 0,
        spectralStability: 'HIGH'
      };
    }
    
    // Calculate flux as sum of positive changes (half-wave rectified)
    let totalFlux = 0;
    for (let i = 1; i < rmsValues.length; i++) {
      const diff = rmsValues[i] - rmsValues[i - 1];
      totalFlux += Math.max(0, diff);  // Only count increases
    }
    
    // Normalize by number of frames
    const avgFlux = totalFlux / (rmsValues.length - 1);
    
    // Normalize to 0-1 scale (assuming max reasonable flux is ~20dB/frame)
    const spectralFluxNormalized = Math.min(1, avgFlux / 20);
    
    // Classify stability
    let spectralStability = 'HIGH';
    if (spectralFluxNormalized > THRESHOLDS.SPECTRAL_FLUX.HIGH) {
      spectralStability = 'LOW';
    } else if (spectralFluxNormalized > THRESHOLDS.SPECTRAL_FLUX.MODERATE) {
      spectralStability = 'MODERATE';
    }
    
    return {
      spectralFlux: avgFlux,
      spectralFluxNormalized,
      spectralStability
    };
  } catch (error) {
    console.error('[CodecStressPredictor] Spectral flux analysis failed:', error.message);
    return {
      spectralFlux: 0,
      spectralFluxNormalized: 0,
      spectralStability: 'HIGH'
    };
  }
}

// ============================================================================
// Classification Functions
// ============================================================================

/**
 * Calculate overall codec stress score
 */
function calculateCodecStressScore(hfAnalysis, preEchoAnalysis, stereoAnalysis, fluxAnalysis) {
  let score = 0;
  
  // Pre-echo contribution (0-35 points)
  const preEchoRiskMap = {
    [PreEchoRisk.NONE]: 0,
    [PreEchoRisk.LOW]: 8,
    [PreEchoRisk.MODERATE]: 18,
    [PreEchoRisk.HIGH]: 28,
    [PreEchoRisk.SEVERE]: 35
  };
  score += preEchoRiskMap[preEchoAnalysis?.preEchoRisk] || 0;
  
  // HF energy contribution (0-25 points)
  const hfRatio = hfAnalysis?.hfEnergyRatio || 0;
  if (hfRatio > THRESHOLDS.HF_ENERGY.HIGH) score += 25;
  else if (hfRatio > THRESHOLDS.HF_ENERGY.MODERATE) score += 15;
  else if (hfRatio > THRESHOLDS.HF_ENERGY.LOW) score += 8;
  
  // Sibilance contribution (0-15 points)
  const sibRatio = hfAnalysis?.sibilanceRatio || 0;
  if (sibRatio > THRESHOLDS.SIBILANCE.HIGH) score += 15;
  else if (sibRatio > THRESHOLDS.SIBILANCE.MODERATE) score += 10;
  else if (sibRatio > THRESHOLDS.SIBILANCE.LOW) score += 5;
  
  // Stereo complexity contribution (0-15 points)
  const stereoStressMap = {
    'NONE': 0,
    'LOW': 3,
    'MODERATE': 8,
    'HIGH': 12,
    'SEVERE': 15
  };
  score += stereoStressMap[stereoAnalysis?.jointStereoStress] || 0;
  
  // Spectral flux contribution (0-10 points)
  const fluxNorm = fluxAnalysis?.spectralFluxNormalized || 0;
  score += Math.min(10, fluxNorm * 15);
  
  return Math.min(100, score);
}

/**
 * Classify overall codec stress status
 */
function classifyCodecStress(stressScore) {
  if (stressScore < 20) return CodecStressStatus.LOW;
  if (stressScore < 45) return CodecStressStatus.MODERATE;
  if (stressScore < 70) return CodecStressStatus.HIGH;
  return CodecStressStatus.CRITICAL;
}

/**
 * Predict artifact types
 */
function predictArtifactTypes(hfAnalysis, preEchoAnalysis, stereoAnalysis) {
  const artifacts = [];
  
  // Pre-echo artifacts
  if (preEchoAnalysis?.preEchoRisk === PreEchoRisk.HIGH || 
      preEchoAnalysis?.preEchoRisk === PreEchoRisk.SEVERE) {
    artifacts.push({
      type: 'PRE_ECHO',
      description: 'Temporal smearing before transients (drum hits, plucks)',
      severity: preEchoAnalysis.preEchoRisk
    });
  }
  
  // HF artifacts
  if ((hfAnalysis?.hfEnergyRatio || 0) > THRESHOLDS.HF_ENERGY.MODERATE) {
    artifacts.push({
      type: 'HF_SWIRL',
      description: 'Swirly/underwater artifacts on cymbals and air frequencies',
      severity: (hfAnalysis?.hfEnergyRatio || 0) > THRESHOLDS.HF_ENERGY.HIGH ? 'HIGH' : 'MODERATE'
    });
  }
  
  // Sibilance artifacts
  if ((hfAnalysis?.sibilanceRatio || 0) > THRESHOLDS.SIBILANCE.MODERATE) {
    artifacts.push({
      type: 'SIBILANCE',
      description: 'Lisping/harsh sibilance artifacts on vocals',
      severity: (hfAnalysis?.sibilanceRatio || 0) > THRESHOLDS.SIBILANCE.HIGH ? 'HIGH' : 'MODERATE'
    });
  }
  
  // Stereo artifacts
  if (stereoAnalysis?.jointStereoStress === 'HIGH' || 
      stereoAnalysis?.jointStereoStress === 'SEVERE') {
    artifacts.push({
      type: 'STEREO_COLLAPSE',
      description: 'Stereo image instability and phase artifacts',
      severity: stereoAnalysis.jointStereoStress
    });
  }
  
  return artifacts;
}

/**
 * Suggest minimum bitrate
 */
function suggestMinimumBitrate(stressScore) {
  if (stressScore < 15) return { mp3: 128, aac: 96, opus: 64 };
  if (stressScore < 30) return { mp3: 192, aac: 128, opus: 96 };
  if (stressScore < 50) return { mp3: 256, aac: 192, opus: 128 };
  if (stressScore < 70) return { mp3: 320, aac: 256, opus: 160 };
  return { mp3: 320, aac: 320, opus: 192, note: 'Consider lossless for this content' };
}

/**
 * Generate recommendations
 */
function generateRecommendations(analysis) {
  const recommendations = [];
  const { status, preEchoRisk, hfEnergyRatio, sibilanceRatio, stereoComplexity } = analysis || {};
  
  if (status === CodecStressStatus.CRITICAL) {
    recommendations.push('Use lossless formats (FLAC, WAV) for archival');
    recommendations.push('Minimum 320kbps recommended for lossy distribution');
  } else if (status === CodecStressStatus.HIGH) {
    recommendations.push('Use 256kbps+ for streaming distribution');
  }
  
  if (preEchoRisk === PreEchoRisk.HIGH || preEchoRisk === PreEchoRisk.SEVERE) {
    recommendations.push('Add subtle fade-ins (5-10ms) before sharp transients');
    recommendations.push('Consider reducing attack on drum transients');
  }
  
  if ((hfEnergyRatio || 0) > 0.25) {
    recommendations.push('Consider slight high-shelf reduction above 12kHz');
    recommendations.push('Use de-essing on vocal tracks');
  }
  
  if ((sibilanceRatio || 0) > 0.12) {
    recommendations.push('Apply de-esser to reduce sibilance artifacts');
  }
  
  if ((stereoComplexity || 0) > 0.4) {
    recommendations.push('Reduce stereo width on problematic elements');
    recommendations.push('Consider mono bass for better codec compatibility');
  }
  
  return recommendations;
}

// ============================================================================
// Main Analysis Functions
// ============================================================================

/**
 * Full codec stress analysis
 */
async function analyze(filePath, options = {}) {
  try {
    const [hfAnalysis, preEchoAnalysis, stereoAnalysis, fluxAnalysis, duration] = await Promise.all([
      analyzeHighFrequencyContent(filePath),
      analyzePreEchoRisk(filePath, options.windowSizeMs || 23),
      analyzeStereoComplexity(filePath),
      calculateSpectralFlux(filePath, options.fluxWindowMs || 50),
      getAudioDuration(filePath)
    ]);
    
    const stressScore = calculateCodecStressScore(hfAnalysis, preEchoAnalysis, stereoAnalysis, fluxAnalysis);
    const status = classifyCodecStress(stressScore);
    const artifacts = predictArtifactTypes(hfAnalysis, preEchoAnalysis, stereoAnalysis);
    const suggestedBitrates = suggestMinimumBitrate(stressScore);
    
    const result = {
      status,
      description: STATUS_DESCRIPTIONS[status],
      stressScore,
      
      // Pre-echo metrics
      preEchoRisk: preEchoAnalysis.preEchoRisk,
      preEchoEvents: preEchoAnalysis.preEchoEvents,
      preEchoEventsPerMin: preEchoAnalysis.preEchoEventsPerMin,
      
      // HF metrics
      hfEnergyRatio: hfAnalysis.hfEnergyRatio,
      sibilanceRatio: hfAnalysis.sibilanceRatio,
      airRatio: hfAnalysis.airRatio,
      
      // Stereo metrics
      stereoComplexity: stereoAnalysis.stereoComplexity,
      avgCorrelation: stereoAnalysis.avgCorrelation,
      jointStereoStress: stereoAnalysis.jointStereoStress,
      
      // Flux metrics
      spectralFlux: fluxAnalysis.spectralFlux,
      spectralFluxNormalized: fluxAnalysis.spectralFluxNormalized,
      
      // Predictions
      predictedArtifacts: artifacts,
      suggestedBitrates,
      
      duration,
      confidence: duration > 0 ? 0.9 : 0.5
    };
    
    result.recommendations = generateRecommendations(result);
    
    return result;
  } catch (error) {
    console.error('[CodecStressPredictor] Analysis failed:', error.message);
    return {
      status: CodecStressStatus.MODERATE,
      description: STATUS_DESCRIPTIONS[CodecStressStatus.MODERATE],
      stressScore: 30,
      preEchoRisk: PreEchoRisk.LOW,
      preEchoEvents: 0,
      preEchoEventsPerMin: 0,
      hfEnergyRatio: 0.15,
      sibilanceRatio: 0.05,
      airRatio: 0.05,
      stereoComplexity: 0.2,
      avgCorrelation: 0.8,
      jointStereoStress: 'LOW',
      spectralFlux: 1,
      spectralFluxNormalized: 0.1,
      predictedArtifacts: [],
      suggestedBitrates: { mp3: 192, aac: 128, opus: 96 },
      duration: 0,
      confidence: 0,
      error: error.message,
      recommendations: []
    };
  }
}

/**
 * Quick check for rapid assessment
 */
async function quickCheck(filePath) {
  try {
    const [hfAnalysis, preEchoAnalysis] = await Promise.all([
      analyzeHighFrequencyContent(filePath),
      analyzePreEchoRisk(filePath)
    ]);
    
    // Simplified stress calculation
    const stressScore = calculateCodecStressScore(hfAnalysis, preEchoAnalysis, {}, {});
    const status = classifyCodecStress(stressScore);
    
    return {
      status,
      description: STATUS_DESCRIPTIONS[status],
      stressScore,
      preEchoRisk: preEchoAnalysis.preEchoRisk,
      hfEnergyRatio: hfAnalysis.hfEnergyRatio,
      sibilanceRatio: hfAnalysis.sibilanceRatio,
      confidence: 0.7
    };
  } catch (error) {
    console.error('[CodecStressPredictor] Quick check failed:', error.message);
    return {
      status: CodecStressStatus.MODERATE,
      description: STATUS_DESCRIPTIONS[CodecStressStatus.MODERATE],
      stressScore: 30,
      preEchoRisk: PreEchoRisk.LOW,
      hfEnergyRatio: 0.15,
      sibilanceRatio: 0.05,
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
    preEchoEventsPerMin = 0,
    hfEnergyRatio = 0.15,
    sibilanceRatio = 0.05,
    stereoComplexity = 0.2,
    spectralFluxNormalized = 0.1
  } = metrics;
  
  // Reconstruct analysis structures
  let preEchoRisk = PreEchoRisk.NONE;
  if (preEchoEventsPerMin > THRESHOLDS.PRE_ECHO.EVENTS_PER_MIN_HIGH) {
    preEchoRisk = PreEchoRisk.SEVERE;
  } else if (preEchoEventsPerMin > THRESHOLDS.PRE_ECHO.EVENTS_PER_MIN_MODERATE) {
    preEchoRisk = PreEchoRisk.HIGH;
  } else if (preEchoEventsPerMin > THRESHOLDS.PRE_ECHO.EVENTS_PER_MIN_LOW) {
    preEchoRisk = PreEchoRisk.MODERATE;
  } else if (preEchoEventsPerMin > 0) {
    preEchoRisk = PreEchoRisk.LOW;
  }
  
  let jointStereoStress = 'LOW';
  if (stereoComplexity > THRESHOLDS.STEREO_COMPLEXITY.HIGH) {
    jointStereoStress = 'SEVERE';
  } else if (stereoComplexity > THRESHOLDS.STEREO_COMPLEXITY.MODERATE) {
    jointStereoStress = 'HIGH';
  } else if (stereoComplexity > THRESHOLDS.STEREO_COMPLEXITY.LOW) {
    jointStereoStress = 'MODERATE';
  }
  
  const hfAnalysis = { hfEnergyRatio, sibilanceRatio };
  const preEchoAnalysis = { preEchoRisk };
  const stereoAnalysis = { jointStereoStress };
  const fluxAnalysis = { spectralFluxNormalized };
  
  const stressScore = calculateCodecStressScore(hfAnalysis, preEchoAnalysis, stereoAnalysis, fluxAnalysis);
  const status = classifyCodecStress(stressScore);
  const suggestedBitrates = suggestMinimumBitrate(stressScore);
  
  return {
    status,
    description: STATUS_DESCRIPTIONS[status],
    stressScore,
    preEchoRisk,
    suggestedBitrates
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  analyze,
  quickCheck,
  classify,
  analyzeHighFrequencyContent,
  analyzePreEchoRisk,
  analyzeStereoComplexity,
  calculateSpectralFlux,
  calculateCodecStressScore,
  classifyCodecStress,
  predictArtifactTypes,
  suggestMinimumBitrate,
  generateRecommendations,
  getAudioDuration,
  isStereo,
  CodecStressStatus,
  PreEchoRisk,
  STATUS_DESCRIPTIONS,
  CODEC_BANDS,
  THRESHOLDS
};
