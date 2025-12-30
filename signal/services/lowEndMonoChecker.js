/**
 * Low-End Mono Compatibility Checker
 * 
 * Measures phase correlation specifically in the low-frequency range
 * (sub-120 Hz) to detect bass cancellation issues on mono playback systems.
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Analysis provides actionable
 * metrics for transformation parameter selection.
 * 
 * Critical for:
 * - Club/festival PA systems (often summed to mono below 100-120 Hz)
 * - Bluetooth speakers and phone speakers
 * - Mono broadcast downmix
 * - Vinyl cutting (requires mono bass for groove stability)
 */

const { spawn } = require('child_process');

// ============================================================================
// Configuration
// ============================================================================

const FFMPEG_PATH = 'ffmpeg';

/**
 * Default frequency cutoffs for low-end analysis
 */
const FREQUENCY_BANDS = {
  SUB_BASS: { low: 20, high: 60 },      // Sub-bass: kick fundamentals, 808s
  MID_BASS: { low: 60, high: 120 },     // Mid-bass: bass guitar, synth bass
  FULL_LOW_END: { low: 20, high: 120 }  // Combined low-end
};

/**
 * Phase correlation status classifications
 */
const LowEndMonoStatus = {
  EXCELLENT: 'EXCELLENT',       // > 0.9 - Fully mono-compatible
  GOOD: 'GOOD',                 // 0.7-0.9 - Safe for most systems
  FAIR: 'FAIR',                 // 0.3-0.7 - May lose punch on mono
  POOR: 'POOR',                 // 0.0-0.3 - Bass cancellation likely
  CRITICAL: 'CRITICAL'          // < 0.0 - Severe phase inversion
};

/**
 * Thresholds for status classification
 */
const CORRELATION_THRESHOLDS = {
  EXCELLENT: 0.9,
  GOOD: 0.7,
  FAIR: 0.3,
  POOR: 0.0
  // Below 0.0 = CRITICAL
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
 * Measure phase correlation for a specific frequency band
 * @param {string} filePath - Path to audio file
 * @param {number} lowFreq - Low cutoff frequency (Hz)
 * @param {number} highFreq - High cutoff frequency (Hz)
 * @returns {Promise<Object>} - Phase correlation data for the band
 */
async function measureBandCorrelation(filePath, lowFreq, highFreq) {
  // Build filter chain: bandpass filter → phase meter
  const filterChain = [
    `highpass=f=${lowFreq}`,
    `lowpass=f=${highFreq}`,
    'aphasemeter=rate=10:duration=0'
  ].join(',');
  
  const args = [
    '-i', filePath,
    '-af', filterChain,
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse phase correlation values from aphasemeter output
    // Format: [Parsed_aphasemeter...] phase: X.XXXXX
    const phaseMatches = stderr.matchAll(/phase:\s*([-\d.]+)/g);
    const correlationValues = [];
    
    for (const match of phaseMatches) {
      const value = parseFloat(match[1]);
      if (!isNaN(value)) {
        correlationValues.push(value);
      }
    }
    
    if (correlationValues.length === 0) {
      // Fallback: try alternative aphasemeter output format
      const altMatch = stderr.match(/lavfi\.aphasemeter\.phase=([-\d.]+)/);
      if (altMatch) {
        correlationValues.push(parseFloat(altMatch[1]));
      }
    }
    
    if (correlationValues.length === 0) {
      return {
        correlation: null,
        status: 'UNKNOWN',
        error: 'Could not parse phase correlation from FFmpeg output'
      };
    }
    
    // Calculate average correlation
    const avgCorrelation = correlationValues.reduce((a, b) => a + b, 0) / correlationValues.length;
    
    // Calculate minimum (worst case)
    const minCorrelation = Math.min(...correlationValues);
    
    return {
      correlation: avgCorrelation,
      minCorrelation,
      sampleCount: correlationValues.length,
      status: classifyCorrelation(avgCorrelation)
    };
    
  } catch (error) {
    console.error(`[LowEndMonoChecker] Band correlation analysis failed (${lowFreq}-${highFreq}Hz):`, error.message);
    return {
      correlation: null,
      status: 'ERROR',
      error: error.message
    };
  }
}

/**
 * Classify correlation value to status
 * @param {number} correlation - Phase correlation value (-1 to +1)
 * @returns {string} - LowEndMonoStatus value
 */
function classifyCorrelation(correlation) {
  if (correlation === null || isNaN(correlation)) {
    return 'UNKNOWN';
  }
  if (correlation >= CORRELATION_THRESHOLDS.EXCELLENT) {
    return LowEndMonoStatus.EXCELLENT;
  }
  if (correlation >= CORRELATION_THRESHOLDS.GOOD) {
    return LowEndMonoStatus.GOOD;
  }
  if (correlation >= CORRELATION_THRESHOLDS.FAIR) {
    return LowEndMonoStatus.FAIR;
  }
  if (correlation >= CORRELATION_THRESHOLDS.POOR) {
    return LowEndMonoStatus.POOR;
  }
  return LowEndMonoStatus.CRITICAL;
}

/**
 * Generate recommendation based on analysis results
 * @param {Object} analysis - Full analysis results
 * @returns {string} - Human-readable recommendation
 */
function generateRecommendation(analysis) {
  const { overallStatus, subBass, midBass } = analysis;
  
  if (overallStatus === LowEndMonoStatus.EXCELLENT) {
    return 'Low-end is fully mono-compatible. No action needed.';
  }
  
  if (overallStatus === LowEndMonoStatus.GOOD) {
    return 'Low-end mono compatibility is good. Minor phase variance is acceptable.';
  }
  
  if (overallStatus === LowEndMonoStatus.FAIR) {
    // Identify problem region
    if (subBass && subBass.status === LowEndMonoStatus.POOR) {
      return 'Sub-bass (20-60 Hz) has phase issues. Consider applying mono below 60 Hz.';
    }
    if (midBass && midBass.status === LowEndMonoStatus.POOR) {
      return 'Mid-bass (60-120 Hz) has phase issues. Check bass stereo processing.';
    }
    return 'Low-end may lose punch on mono systems. Consider narrowing bass stereo width.';
  }
  
  if (overallStatus === LowEndMonoStatus.POOR) {
    return 'Significant bass cancellation on mono playback. Apply mono summing below 120 Hz or correct phase alignment.';
  }
  
  if (overallStatus === LowEndMonoStatus.CRITICAL) {
    return 'CRITICAL: Severe low-end phase inversion detected. Bass will cancel on mono systems. Immediate phase correction required.';
  }
  
  return 'Unable to determine recommendation.';
}

// ============================================================================
// Main Analysis Functions
// ============================================================================

/**
 * Comprehensive low-end mono compatibility analysis
 * @param {string} filePath - Path to audio file
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} - Complete low-end mono analysis
 */
async function analyzeLowEndMono(filePath, options = {}) {
  const {
    cutoffHz = 120,
    includeSubBass = true,
    includeMidBass = true
  } = options;
  
  const startTime = Date.now();
  
  // Run analyses in parallel
  const analyses = [
    measureBandCorrelation(filePath, FREQUENCY_BANDS.FULL_LOW_END.low, cutoffHz)
  ];
  
  if (includeSubBass) {
    analyses.push(measureBandCorrelation(filePath, FREQUENCY_BANDS.SUB_BASS.low, FREQUENCY_BANDS.SUB_BASS.high));
  }
  
  if (includeMidBass) {
    analyses.push(measureBandCorrelation(filePath, FREQUENCY_BANDS.MID_BASS.low, FREQUENCY_BANDS.MID_BASS.high));
  }
  
  const [overall, subBass, midBass] = await Promise.all(analyses);
  
  const processingTimeMs = Date.now() - startTime;
  
  // Determine overall status (use worst-case)
  const statuses = [overall.status];
  if (subBass) statuses.push(subBass.status);
  if (midBass) statuses.push(midBass.status);
  
  const statusPriority = [
    LowEndMonoStatus.CRITICAL,
    LowEndMonoStatus.POOR,
    LowEndMonoStatus.FAIR,
    LowEndMonoStatus.GOOD,
    LowEndMonoStatus.EXCELLENT
  ];
  
  let overallStatus = LowEndMonoStatus.EXCELLENT;
  for (const status of statusPriority) {
    if (statuses.includes(status)) {
      overallStatus = status;
      break;
    }
  }
  
  const result = {
    overallCorrelation: overall.correlation,
    overallStatus,
    subBass: includeSubBass ? {
      correlation: subBass?.correlation,
      status: subBass?.status,
      band: '20-60 Hz'
    } : null,
    midBass: includeMidBass ? {
      correlation: midBass?.correlation,
      status: midBass?.status,
      band: '60-120 Hz'
    } : null,
    hasPhaseIssues: overallStatus === LowEndMonoStatus.POOR || overallStatus === LowEndMonoStatus.CRITICAL,
    cutoffHz,
    processingTimeMs
  };
  
  result.recommendation = generateRecommendation(result);
  
  return result;
}

/**
 * Quick check for low-end mono compatibility
 * Only measures overall sub-120 Hz correlation
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} - Quick check result
 */
async function quickCheck(filePath) {
  const startTime = Date.now();
  
  const result = await measureBandCorrelation(
    filePath,
    FREQUENCY_BANDS.FULL_LOW_END.low,
    FREQUENCY_BANDS.FULL_LOW_END.high
  );
  
  const processingTimeMs = Date.now() - startTime;
  
  return {
    correlation: result.correlation,
    status: result.status,
    hasPhaseIssues: result.status === LowEndMonoStatus.POOR || result.status === LowEndMonoStatus.CRITICAL,
    processingTimeMs
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Main analysis functions
  analyzeLowEndMono,
  quickCheck,
  
  // Utility functions
  measureBandCorrelation,
  classifyCorrelation,
  generateRecommendation,
  
  // Constants
  LowEndMonoStatus,
  CORRELATION_THRESHOLDS,
  FREQUENCY_BANDS
};
