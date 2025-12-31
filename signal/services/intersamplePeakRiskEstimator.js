/**
 * Intersample Peak Risk Estimator
 * 
 * Detects true peak behavior that will cause clipping after D/A conversion
 * or lossy codec encoding. Intersample peaks occur when the reconstructed
 * analog signal exceeds digital sample values.
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
 * Intersample peak risk status levels
 */
const IntersamplePeakStatus = {
  SAFE: 'SAFE',           // True peak well below ceiling
  MARGINAL: 'MARGINAL',   // True peak close to ceiling
  EXCEEDS: 'EXCEEDS',     // True peak exceeds sample peak significantly
  CRITICAL: 'CRITICAL'    // Will clip post-conversion
};

/**
 * Status descriptions for reporting
 */
const STATUS_DESCRIPTIONS = {
  [IntersamplePeakStatus.SAFE]: 'True peak safely below ceiling with adequate headroom for codec processing',
  [IntersamplePeakStatus.MARGINAL]: 'True peak close to ceiling - minor risk of post-codec clipping',
  [IntersamplePeakStatus.EXCEEDS]: 'Significant intersample overshoot detected - likely to clip after D/A conversion',
  [IntersamplePeakStatus.CRITICAL]: 'Critical intersample peak violation - will clip on most playback systems'
};

/**
 * Threshold configuration
 */
const THRESHOLDS = {
  // Intersample overshoot (true peak - sample peak in dB)
  OVERSHOOT: {
    SAFE: 0.3,      // < 0.3 dB overshoot is safe
    MARGINAL: 0.8,  // 0.3 - 0.8 dB needs attention
    EXCEEDS: 1.5    // 0.8 - 1.5 dB is problematic, > 1.5 is critical
  },
  // True peak ceiling standards
  CEILING: {
    STREAMING: -1.0,    // Spotify, Apple Music, YouTube
    BROADCAST: -2.0,    // EBU R128 broadcast
    CD: -0.3,           // CD mastering
    SAFE: -1.0          // Default safe ceiling
  },
  // Codec-induced additional overshoot risk
  CODEC_RISK: {
    MP3_128: 0.8,   // Additional dB risk at 128kbps MP3
    MP3_192: 0.5,
    MP3_256: 0.3,
    MP3_320: 0.2,
    AAC_128: 0.5,
    AAC_192: 0.3,
    AAC_256: 0.2,
    OPUS_64: 0.6,
    OPUS_128: 0.3,
    OPUS_192: 0.2
  }
};

/**
 * Reference values for analysis
 */
const REFERENCE = {
  DIGITAL_CEILING: 0.0,       // 0 dBFS digital ceiling
  MIN_ANALYSIS_DB: -60,       // Minimum level for meaningful analysis
  OVERSAMPLING_FACTOR: 4      // True peak uses 4x oversampling
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
// Peak Analysis Functions
// ============================================================================

/**
 * Get sample peak using astats filter
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Sample peak measurements
 */
async function getSamplePeak(filePath) {
  const args = [
    '-i', filePath,
    '-af', 'astats=metadata=1:measure_overall=Peak_level:measure_perchannel=Peak_level',
    '-f', 'null', '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse overall peak level
    const overallMatch = stderr.match(/Overall.*Peak level[^:]*:\s*([-\d.]+)/i);
    const peakDb = overallMatch ? parseFloat(overallMatch[1]) : null;
    
    // Parse channel peaks
    const channelPeaks = [];
    const channelMatches = stderr.matchAll(/Channel:\s*(\d+)[\s\S]*?Peak level[^:]*:\s*([-\d.]+)/gi);
    for (const match of channelMatches) {
      channelPeaks.push({
        channel: parseInt(match[1]),
        peakDb: parseFloat(match[2])
      });
    }
    
    // Also try to get peak count (consecutive max samples)
    const flatMatch = stderr.match(/Flat factor[^:]*:\s*([\d.]+)/i);
    const flatFactor = flatMatch ? parseFloat(flatMatch[1]) : 0;
    
    return {
      peakDb: peakDb !== null ? peakDb : -Infinity,
      channelPeaks,
      flatFactor,
      isValid: peakDb !== null && isFinite(peakDb)
    };
  } catch (error) {
    console.error('[IntersamplePeakRisk] Sample peak analysis failed:', error.message);
    return {
      peakDb: -Infinity,
      channelPeaks: [],
      flatFactor: 0,
      isValid: false
    };
  }
}

/**
 * Get true peak using ebur128 filter
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} True peak measurements
 */
async function getTruePeak(filePath) {
  const args = [
    '-i', filePath,
    '-af', 'ebur128=peak=true',
    '-f', 'null', '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse true peak from ebur128 output
    // Format: "True peak: -0.5 dBTP"
    const truePeakMatch = stderr.match(/True peak[^:]*:\s*([-\d.]+)\s*dBTP/i);
    let truePeakDb = truePeakMatch ? parseFloat(truePeakMatch[1]) : null;
    
    // Also check for per-channel true peaks
    const channelTruePeaks = [];
    const channelMatches = stderr.matchAll(/CH(\d+):\s*([-\d.]+)\s*dBTP/gi);
    for (const match of channelMatches) {
      channelTruePeaks.push({
        channel: parseInt(match[1]),
        truePeakDb: parseFloat(match[2])
      });
    }
    
    // If overall not found, use max of channels
    if (truePeakDb === null && channelTruePeaks.length > 0) {
      truePeakDb = Math.max(...channelTruePeaks.map(c => c.truePeakDb));
    }
    
    // Parse integrated loudness for context
    const integratedMatch = stderr.match(/I:\s*([-\d.]+)\s*LUFS/i);
    const integratedLufs = integratedMatch ? parseFloat(integratedMatch[1]) : null;
    
    return {
      truePeakDb: truePeakDb !== null ? truePeakDb : -Infinity,
      channelTruePeaks,
      integratedLufs,
      isValid: truePeakDb !== null && isFinite(truePeakDb)
    };
  } catch (error) {
    console.error('[IntersamplePeakRisk] True peak analysis failed:', error.message);
    return {
      truePeakDb: -Infinity,
      channelTruePeaks: [],
      integratedLufs: null,
      isValid: false
    };
  }
}

/**
 * Alternative true peak via loudnorm filter (faster, less detail)
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} True peak from loudnorm
 */
async function getTruePeakViaLoudnorm(filePath) {
  const args = [
    '-i', filePath,
    '-af', 'loudnorm=print_format=json',
    '-f', 'null', '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse JSON output from loudnorm
    const jsonMatch = stderr.match(/\{[\s\S]*?"input_tp"[\s\S]*?\}/);
    if (jsonMatch) {
      const metrics = JSON.parse(jsonMatch[0]);
      return {
        truePeakDb: parseFloat(metrics.input_tp) || -Infinity,
        integratedLufs: parseFloat(metrics.input_i) || null,
        loudnessRange: parseFloat(metrics.input_lra) || null,
        isValid: true
      };
    }
    
    return { truePeakDb: -Infinity, isValid: false };
  } catch (error) {
    console.error('[IntersamplePeakRisk] Loudnorm analysis failed:', error.message);
    return { truePeakDb: -Infinity, isValid: false };
  }
}

// ============================================================================
// Classification Functions
// ============================================================================

/**
 * Calculate intersample overshoot
 * @param {number} truePeakDb - True peak in dBTP
 * @param {number} samplePeakDb - Sample peak in dBFS
 * @returns {number} Overshoot in dB
 */
function calculateOvershoot(truePeakDb, samplePeakDb) {
  if (!isFinite(truePeakDb) || !isFinite(samplePeakDb)) {
    return 0;
  }
  // True peak is typically higher (less negative) than sample peak
  return Math.max(0, truePeakDb - samplePeakDb);
}

/**
 * Calculate headroom to ceiling
 * @param {number} truePeakDb - True peak in dBTP
 * @param {string} standard - Ceiling standard to use
 * @returns {number} Headroom in dB (negative if exceeds)
 */
function calculateHeadroom(truePeakDb, standard = 'STREAMING') {
  const ceiling = THRESHOLDS.CEILING[standard] || THRESHOLDS.CEILING.SAFE;
  return ceiling - truePeakDb;
}

/**
 * Calculate post-codec risk for various codecs
 * @param {number} truePeakDb - Current true peak
 * @param {number} overshootDb - Current overshoot
 * @returns {Object} Risk assessment per codec
 */
function calculateCodecRisk(truePeakDb, overshootDb) {
  const risks = {};
  
  for (const [codec, additionalRisk] of Object.entries(THRESHOLDS.CODEC_RISK)) {
    const projectedPeak = truePeakDb + additionalRisk;
    const projectedOvershoot = overshootDb + additionalRisk;
    
    risks[codec] = {
      projectedPeakDb: projectedPeak,
      projectedOvershoot: projectedOvershoot,
      willClip: projectedPeak > THRESHOLDS.CEILING.STREAMING,
      riskLevel: projectedPeak > 0 ? 'CRITICAL' : 
                 projectedPeak > THRESHOLDS.CEILING.STREAMING ? 'HIGH' :
                 projectedPeak > THRESHOLDS.CEILING.BROADCAST ? 'MODERATE' : 'LOW'
    };
  }
  
  return risks;
}

/**
 * Calculate safe gain before ceiling violation
 * @param {number} truePeakDb - Current true peak
 * @param {string} standard - Ceiling standard
 * @returns {number} Safe gain in dB
 */
function calculateSafeGain(truePeakDb, standard = 'STREAMING') {
  const headroom = calculateHeadroom(truePeakDb, standard);
  return Math.max(0, headroom);
}

/**
 * Classify intersample peak risk status
 * @param {number} overshootDb - Overshoot in dB
 * @param {number} truePeakDb - True peak in dBTP
 * @returns {string} Status classification
 */
function classifyStatus(overshootDb, truePeakDb) {
  // Critical if true peak exceeds digital ceiling
  if (truePeakDb > REFERENCE.DIGITAL_CEILING) {
    return IntersamplePeakStatus.CRITICAL;
  }
  
  // Critical if true peak exceeds streaming ceiling with high overshoot
  if (truePeakDb > THRESHOLDS.CEILING.STREAMING && overshootDb > THRESHOLDS.OVERSHOOT.EXCEEDS) {
    return IntersamplePeakStatus.CRITICAL;
  }
  
  // Exceeds if significant overshoot
  if (overshootDb > THRESHOLDS.OVERSHOOT.EXCEEDS) {
    return IntersamplePeakStatus.EXCEEDS;
  }
  
  // Marginal if moderate overshoot or close to ceiling
  if (overshootDb > THRESHOLDS.OVERSHOOT.MARGINAL || truePeakDb > THRESHOLDS.CEILING.STREAMING) {
    return IntersamplePeakStatus.MARGINAL;
  }
  
  // Safe if minimal overshoot and good headroom
  if (overshootDb <= THRESHOLDS.OVERSHOOT.SAFE && truePeakDb <= THRESHOLDS.CEILING.BROADCAST) {
    return IntersamplePeakStatus.SAFE;
  }
  
  return IntersamplePeakStatus.MARGINAL;
}

/**
 * Calculate overall risk score (0-100)
 * @param {number} overshootDb - Overshoot in dB
 * @param {number} truePeakDb - True peak in dBTP
 * @param {number} flatFactor - Flat factor (consecutive max samples)
 * @returns {number} Risk score 0-100
 */
function calculateRiskScore(overshootDb, truePeakDb, flatFactor = 0) {
  let score = 0;
  
  // Overshoot contribution (0-40 points)
  const overshootNorm = Math.min(overshootDb / 2.0, 1.0);
  score += overshootNorm * 40;
  
  // True peak vs ceiling contribution (0-40 points)
  const ceilingMargin = THRESHOLDS.CEILING.STREAMING - truePeakDb;
  if (ceilingMargin < 0) {
    score += 40; // Exceeds ceiling
  } else if (ceilingMargin < 1.0) {
    score += (1.0 - ceilingMargin) * 40;
  }
  
  // Flat factor contribution (0-20 points) - indicates existing limiting
  const flatNorm = Math.min(flatFactor / 0.5, 1.0);
  score += flatNorm * 20;
  
  return Math.min(100, Math.max(0, Math.round(score)));
}

/**
 * Generate recommendations based on analysis
 * @param {Object} analysis - Complete analysis results
 * @returns {Array<string>} List of recommendations
 */
function generateRecommendations(analysis) {
  const recommendations = [];
  
  if (!analysis) return recommendations;
  
  const { status, overshootDb, truePeakDb, headroomDb } = analysis;
  
  if (status === IntersamplePeakStatus.CRITICAL) {
    recommendations.push('Apply true peak limiting immediately to prevent clipping on playback systems');
    if (truePeakDb > 0) {
      recommendations.push(`Reduce gain by at least ${Math.abs(truePeakDb).toFixed(1)} dB before any processing`);
    }
    recommendations.push('Use a true peak limiter set to -1.0 dBTP ceiling for streaming delivery');
  }
  
  if (status === IntersamplePeakStatus.EXCEEDS) {
    recommendations.push('Significant intersample peaks detected - apply true peak limiting');
    recommendations.push(`Target -1.0 dBTP ceiling to ensure ${overshootDb.toFixed(1)} dB overshoot is contained`);
  }
  
  if (status === IntersamplePeakStatus.MARGINAL) {
    recommendations.push('Consider true peak limiting for streaming platforms');
    if (headroomDb !== undefined && headroomDb < 0.5) {
      recommendations.push('Limited headroom available - avoid additional gain increases');
    }
  }
  
  // Codec-specific recommendations
  if (analysis.codecRisks) {
    const highRiskCodecs = Object.entries(analysis.codecRisks)
      .filter(([_, risk]) => risk.riskLevel === 'HIGH' || risk.riskLevel === 'CRITICAL')
      .map(([codec, _]) => codec);
    
    if (highRiskCodecs.length > 0) {
      recommendations.push(`High clipping risk for: ${highRiskCodecs.join(', ')} - use 320kbps or lossless`);
    }
  }
  
  if (recommendations.length === 0) {
    recommendations.push('True peak levels are within safe limits for all delivery formats');
  }
  
  return recommendations;
}

// ============================================================================
// Main Analysis Functions
// ============================================================================

/**
 * Full intersample peak risk analysis
 * @param {string} filePath - Path to audio file
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Complete analysis results
 */
async function analyze(filePath, options = {}) {
  const startTime = Date.now();
  const { standard = 'STREAMING' } = options;
  
  try {
    // Run sample peak and true peak analysis in parallel
    const [samplePeakResult, truePeakResult] = await Promise.all([
      getSamplePeak(filePath),
      getTruePeak(filePath)
    ]);
    
    const samplePeakDb = samplePeakResult.peakDb;
    const truePeakDb = truePeakResult.truePeakDb;
    const flatFactor = samplePeakResult.flatFactor;
    
    // Calculate derived metrics
    const overshootDb = calculateOvershoot(truePeakDb, samplePeakDb);
    const headroomDb = calculateHeadroom(truePeakDb, standard);
    const safeGainDb = calculateSafeGain(truePeakDb, standard);
    const codecRisks = calculateCodecRisk(truePeakDb, overshootDb);
    
    // Classify status
    const status = classifyStatus(overshootDb, truePeakDb);
    const riskScore = calculateRiskScore(overshootDb, truePeakDb, flatFactor);
    
    const analysis = {
      status,
      description: STATUS_DESCRIPTIONS[status],
      riskScore,
      
      // Peak measurements
      samplePeakDb,
      truePeakDb,
      overshootDb,
      
      // Headroom
      headroomDb,
      safeGainDb,
      ceilingStandard: standard,
      ceilingDb: THRESHOLDS.CEILING[standard],
      
      // Channel detail
      channelPeaks: samplePeakResult.channelPeaks,
      channelTruePeaks: truePeakResult.channelTruePeaks,
      
      // Processing indicators
      flatFactor,
      integratedLufs: truePeakResult.integratedLufs,
      
      // Codec risk assessment
      codecRisks,
      worstCodecRisk: Object.entries(codecRisks)
        .sort((a, b) => b[1].projectedPeakDb - a[1].projectedPeakDb)[0]?.[0] || null,
      
      // Metadata
      analysisTimeMs: Date.now() - startTime,
      confidence: (samplePeakResult.isValid && truePeakResult.isValid) ? 0.95 : 0.5
    };
    
    // Generate recommendations
    analysis.recommendations = generateRecommendations(analysis);
    
    return analysis;
  } catch (error) {
    console.error('[IntersamplePeakRisk] Analysis failed:', error.message);
    return {
      status: IntersamplePeakStatus.MARGINAL,
      description: 'Analysis incomplete - could not determine intersample peak risk',
      riskScore: 50,
      samplePeakDb: null,
      truePeakDb: null,
      overshootDb: null,
      headroomDb: null,
      error: error.message,
      analysisTimeMs: Date.now() - startTime,
      confidence: 0
    };
  }
}

/**
 * Quick intersample peak check (faster, essential metrics only)
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Quick analysis results
 */
async function quickCheck(filePath) {
  const startTime = Date.now();
  
  try {
    // Use loudnorm for faster true peak
    const [samplePeakResult, truePeakResult] = await Promise.all([
      getSamplePeak(filePath),
      getTruePeakViaLoudnorm(filePath)
    ]);
    
    const samplePeakDb = samplePeakResult.peakDb;
    const truePeakDb = truePeakResult.truePeakDb;
    
    const overshootDb = calculateOvershoot(truePeakDb, samplePeakDb);
    const headroomDb = calculateHeadroom(truePeakDb, 'STREAMING');
    const status = classifyStatus(overshootDb, truePeakDb);
    const riskScore = calculateRiskScore(overshootDb, truePeakDb, samplePeakResult.flatFactor);
    
    return {
      status,
      riskScore,
      samplePeakDb,
      truePeakDb,
      overshootDb,
      headroomDb,
      analysisTimeMs: Date.now() - startTime,
      confidence: (samplePeakResult.isValid && truePeakResult.isValid) ? 0.9 : 0.4
    };
  } catch (error) {
    console.error('[IntersamplePeakRisk] Quick check failed:', error.message);
    return {
      status: IntersamplePeakStatus.MARGINAL,
      riskScore: 50,
      samplePeakDb: null,
      truePeakDb: null,
      overshootDb: null,
      headroomDb: null,
      analysisTimeMs: Date.now() - startTime,
      confidence: 0
    };
  }
}

/**
 * Classify from pre-computed metrics
 * @param {Object} metrics - Pre-computed peak metrics
 * @returns {Object} Classification results
 */
function classify(metrics) {
  const {
    samplePeakDb = -Infinity,
    truePeakDb = -Infinity,
    flatFactor = 0
  } = metrics || {};
  
  const overshootDb = calculateOvershoot(truePeakDb, samplePeakDb);
  const headroomDb = calculateHeadroom(truePeakDb, 'STREAMING');
  const status = classifyStatus(overshootDb, truePeakDb);
  const riskScore = calculateRiskScore(overshootDb, truePeakDb, flatFactor);
  
  return {
    status,
    description: STATUS_DESCRIPTIONS[status],
    riskScore,
    overshootDb,
    headroomDb,
    safeGainDb: calculateSafeGain(truePeakDb, 'STREAMING')
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
  getSamplePeak,
  getTruePeak,
  getTruePeakViaLoudnorm,
  
  // Classification functions
  calculateOvershoot,
  calculateHeadroom,
  calculateCodecRisk,
  calculateSafeGain,
  classifyStatus,
  calculateRiskScore,
  generateRecommendations,
  
  // Constants
  IntersamplePeakStatus,
  STATUS_DESCRIPTIONS,
  THRESHOLDS,
  REFERENCE
};
