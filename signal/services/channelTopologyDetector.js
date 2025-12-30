/**
 * Channel Topology Detector
 * 
 * Identifies the channel configuration of audio assets:
 * - MONO: Single channel audio
 * - STEREO: True stereo with distinct L/R content
 * - DUAL_MONO: Two identical channels (fake stereo)
 * - MID_SIDE: Mid-Side encoded stereo
 * - MULTICHANNEL: More than 2 channels (5.1, 7.1, etc.)
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Channel topology detection is part
 * of the analysis pipeline for accurate asset characterization.
 */

const { spawn } = require('child_process');

// ============================================================================
// Configuration
// ============================================================================

const FFMPEG_PATH = 'ffmpeg';
const FFPROBE_PATH = 'ffprobe';

/**
 * Channel topology types
 */
const ChannelTopology = {
  MONO: 'MONO',
  STEREO: 'STEREO',
  DUAL_MONO: 'DUAL_MONO',
  MID_SIDE: 'MID_SIDE',
  MULTICHANNEL: 'MULTICHANNEL',
  UNKNOWN: 'UNKNOWN'
};

/**
 * Detection confidence levels
 */
const Confidence = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW'
};

/**
 * Thresholds for topology detection
 */
const THRESHOLDS = {
  // Dual-mono detection: correlation threshold for identical channels
  DUAL_MONO_CORRELATION: 0.9999,
  
  // Mid-Side detection thresholds
  MID_SIDE_SIDE_LEVEL_THRESHOLD: -30, // dB - side channel typically quieter
  MID_SIDE_CORRELATION_RANGE: [-0.3, 0.3], // M/S typically shows low correlation
  
  // Stereo width threshold (below this = effectively mono content in stereo container)
  STEREO_WIDTH_MINIMUM: 0.05,
  
  // Phase correlation thresholds
  PHASE_CORRELATION_MONO_THRESHOLD: 0.99,
  PHASE_CORRELATION_STEREO_THRESHOLD: 0.3
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
// Channel Analysis Functions
// ============================================================================

/**
 * Get basic channel info using ffprobe
 * @param {string} filePath - Path to audio file
 * @returns {Promise<{channels: number, channelLayout: string}>}
 */
async function getChannelInfo(filePath) {
  const args = [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_streams',
    '-select_streams', 'a:0',
    filePath
  ];
  
  const { stdout } = await execCommand(FFPROBE_PATH, args);
  const data = JSON.parse(stdout);
  
  const audioStream = data.streams?.[0] || {};
  
  return {
    channels: audioStream.channels || 0,
    channelLayout: audioStream.channel_layout || 'unknown'
  };
}

/**
 * Analyze channel difference using pan filter to extract L-R
 * @param {string} filePath - Path to audio file
 * @returns {Promise<{diffLevel: number, diffRms: number}>}
 */
async function analyzeChannelDifference(filePath) {
  // Extract L-R (difference signal) and measure its level
  const args = [
    '-i', filePath,
    '-af', 'pan=mono|c0=c0-c1,astats=metadata=1:reset=1',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse peak and RMS levels of difference signal
    const peakMatch = stderr.match(/Peak level dB:\s*([-\d.]+)/);
    const rmsMatch = stderr.match(/RMS level dB:\s*([-\d.]+)/);
    
    return {
      diffPeakDb: peakMatch ? parseFloat(peakMatch[1]) : -Infinity,
      diffRmsDb: rmsMatch ? parseFloat(rmsMatch[1]) : -Infinity
    };
  } catch (error) {
    console.error('[ChannelTopologyDetector] Channel difference analysis failed:', error.message);
    return {
      diffPeakDb: null,
      diffRmsDb: null,
      error: error.message
    };
  }
}

/**
 * Analyze channel sum using pan filter to extract L+R (mid signal)
 * @param {string} filePath - Path to audio file
 * @returns {Promise<{sumLevel: number, sumRms: number}>}
 */
async function analyzeChannelSum(filePath) {
  // Extract L+R (sum/mid signal) and measure its level
  const args = [
    '-i', filePath,
    '-af', 'pan=mono|c0=0.5*c0+0.5*c1,astats=metadata=1:reset=1',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse peak and RMS levels of sum signal
    const peakMatch = stderr.match(/Peak level dB:\s*([-\d.]+)/);
    const rmsMatch = stderr.match(/RMS level dB:\s*([-\d.]+)/);
    
    return {
      sumPeakDb: peakMatch ? parseFloat(peakMatch[1]) : -Infinity,
      sumRmsDb: rmsMatch ? parseFloat(rmsMatch[1]) : -Infinity
    };
  } catch (error) {
    console.error('[ChannelTopologyDetector] Channel sum analysis failed:', error.message);
    return {
      sumPeakDb: null,
      sumRmsDb: null,
      error: error.message
    };
  }
}

/**
 * Analyze individual channel levels
 * @param {string} filePath - Path to audio file
 * @returns {Promise<{leftDb: number, rightDb: number}>}
 */
async function analyzeIndividualChannels(filePath) {
  const results = { leftPeakDb: null, leftRmsDb: null, rightPeakDb: null, rightRmsDb: null };
  
  // Analyze left channel
  try {
    const leftArgs = [
      '-i', filePath,
      '-af', 'pan=mono|c0=c0,astats=metadata=1:reset=1',
      '-f', 'null',
      '-'
    ];
    const { stderr: leftStderr } = await execCommand(FFMPEG_PATH, leftArgs);
    
    const leftPeakMatch = leftStderr.match(/Peak level dB:\s*([-\d.]+)/);
    const leftRmsMatch = leftStderr.match(/RMS level dB:\s*([-\d.]+)/);
    
    results.leftPeakDb = leftPeakMatch ? parseFloat(leftPeakMatch[1]) : -Infinity;
    results.leftRmsDb = leftRmsMatch ? parseFloat(leftRmsMatch[1]) : -Infinity;
  } catch (error) {
    console.error('[ChannelTopologyDetector] Left channel analysis failed:', error.message);
  }
  
  // Analyze right channel
  try {
    const rightArgs = [
      '-i', filePath,
      '-af', 'pan=mono|c0=c1,astats=metadata=1:reset=1',
      '-f', 'null',
      '-'
    ];
    const { stderr: rightStderr } = await execCommand(FFMPEG_PATH, rightArgs);
    
    const rightPeakMatch = rightStderr.match(/Peak level dB:\s*([-\d.]+)/);
    const rightRmsMatch = rightStderr.match(/RMS level dB:\s*([-\d.]+)/);
    
    results.rightPeakDb = rightPeakMatch ? parseFloat(rightPeakMatch[1]) : -Infinity;
    results.rightRmsDb = rightRmsMatch ? parseFloat(rightRmsMatch[1]) : -Infinity;
  } catch (error) {
    console.error('[ChannelTopologyDetector] Right channel analysis failed:', error.message);
  }
  
  return results;
}

/**
 * Calculate cross-correlation between L and R channels
 * Uses a sample-based approach via FFmpeg's ebur128 metadata
 * @param {string} filePath - Path to audio file
 * @returns {Promise<{correlation: number}>}
 */
async function analyzePhaseCorrelation(filePath) {
  const args = [
    '-i', filePath,
    '-af', 'stereotools=mlev=1:slev=1:phasef=0:mode=lr>lr,aphasemeter=video=0',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse phase correlation from aphasemeter
    // Look for the lavfi.aphasemeter.phase metadata
    const phaseMatches = stderr.match(/lavfi\.aphasemeter\.phase[=:]\s*([-\d.]+)/g);
    
    if (phaseMatches && phaseMatches.length > 0) {
      // Average all phase readings
      const values = phaseMatches.map(m => {
        const val = m.match(/([-\d.]+)$/);
        return val ? parseFloat(val[1]) : 0;
      });
      const avgCorrelation = values.reduce((a, b) => a + b, 0) / values.length;
      return { correlation: avgCorrelation };
    }
    
    // Fallback: try simple phase match
    const simpleMatch = stderr.match(/phase[=:]\s*([-\d.]+)/i);
    if (simpleMatch) {
      return { correlation: parseFloat(simpleMatch[1]) };
    }
    
    return { correlation: null };
  } catch (error) {
    console.error('[ChannelTopologyDetector] Phase correlation failed:', error.message);
    return { correlation: null, error: error.message };
  }
}

// ============================================================================
// Topology Detection Logic
// ============================================================================

/**
 * Detect dual-mono (identical L/R channels)
 * @param {Object} analysis - Analysis data
 * @returns {{isDualMono: boolean, confidence: string}}
 */
function detectDualMono(analysis) {
  const { diff, correlation } = analysis;
  
  // If difference signal is essentially silence, it's dual-mono
  if (diff.diffPeakDb !== null && diff.diffPeakDb < -80) {
    return { isDualMono: true, confidence: Confidence.HIGH };
  }
  
  // Very high correlation with very low difference RMS
  if (diff.diffRmsDb !== null && diff.diffRmsDb < -60) {
    return { isDualMono: true, confidence: Confidence.HIGH };
  }
  
  // Moderately low difference signal
  if (diff.diffPeakDb !== null && diff.diffPeakDb < -50) {
    return { isDualMono: true, confidence: Confidence.MEDIUM };
  }
  
  return { isDualMono: false, confidence: Confidence.HIGH };
}

/**
 * Detect Mid-Side encoding
 * M/S encoded audio has specific characteristics:
 * - One channel contains M (mono sum)
 * - Other channel contains S (stereo difference)
 * - S channel typically much quieter than M
 * - Low or negative correlation
 * 
 * @param {Object} analysis - Analysis data
 * @returns {{isMidSide: boolean, confidence: string, details: Object}}
 */
function detectMidSide(analysis) {
  const { channels, correlation, sum, diff } = analysis;
  
  // M/S detection heuristics:
  // 1. Significant level difference between channels
  // 2. One channel (Side) is typically 10-20dB quieter
  // 3. Low correlation (can be negative)
  
  const levelDiff = Math.abs(
    (channels.leftRmsDb || -Infinity) - (channels.rightRmsDb || -Infinity)
  );
  
  // Check if one channel is significantly quieter (typical of S channel)
  const hasQuietChannel = levelDiff > 10;
  
  // M/S typically shows low or negative correlation
  const hasLowCorrelation = correlation.correlation !== null && 
    correlation.correlation >= THRESHOLDS.MID_SIDE_CORRELATION_RANGE[0] &&
    correlation.correlation <= THRESHOLDS.MID_SIDE_CORRELATION_RANGE[1];
  
  // Check for M/S characteristics
  if (hasQuietChannel && hasLowCorrelation) {
    return {
      isMidSide: true,
      confidence: Confidence.MEDIUM,
      details: {
        levelDifference: levelDiff,
        correlation: correlation.correlation
      }
    };
  }
  
  // Very low correlation with moderate level difference
  if (hasLowCorrelation && levelDiff > 6) {
    return {
      isMidSide: true,
      confidence: Confidence.LOW,
      details: {
        levelDifference: levelDiff,
        correlation: correlation.correlation
      }
    };
  }
  
  return {
    isMidSide: false,
    confidence: Confidence.HIGH,
    details: null
  };
}

/**
 * Detect true stereo vs mono content in stereo container
 * @param {Object} analysis - Analysis data
 * @returns {{isTrueStereo: boolean, stereoWidth: number, confidence: string}}
 */
function detectTrueStereo(analysis) {
  const { diff, sum, correlation } = analysis;
  
  // Calculate stereo width as ratio of difference to sum
  let stereoWidth = 0;
  
  if (sum.sumRmsDb !== null && diff.diffRmsDb !== null) {
    // Convert from dB to linear, calculate ratio
    const sumLinear = Math.pow(10, sum.sumRmsDb / 20);
    const diffLinear = Math.pow(10, diff.diffRmsDb / 20);
    
    if (sumLinear > 0) {
      stereoWidth = diffLinear / sumLinear;
    }
  }
  
  // True stereo has noticeable width and moderate correlation
  const hasStereoWidth = stereoWidth > THRESHOLDS.STEREO_WIDTH_MINIMUM;
  const hasModerateCorrelation = correlation.correlation !== null &&
    correlation.correlation > THRESHOLDS.PHASE_CORRELATION_STEREO_THRESHOLD &&
    correlation.correlation < THRESHOLDS.PHASE_CORRELATION_MONO_THRESHOLD;
  
  if (hasStereoWidth && hasModerateCorrelation) {
    return {
      isTrueStereo: true,
      stereoWidth,
      confidence: Confidence.HIGH
    };
  }
  
  if (hasStereoWidth) {
    return {
      isTrueStereo: true,
      stereoWidth,
      confidence: Confidence.MEDIUM
    };
  }
  
  return {
    isTrueStereo: false,
    stereoWidth,
    confidence: Confidence.HIGH
  };
}

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Detect the channel topology of an audio file.
 * 
 * @param {string} filePath - Path to audio file
 * @returns {Promise<TopologyResult>}
 * 
 * @typedef {Object} TopologyResult
 * @property {string} topology - One of ChannelTopology values
 * @property {string} confidence - Detection confidence (HIGH, MEDIUM, LOW)
 * @property {number} channelCount - Number of audio channels
 * @property {string} channelLayout - FFmpeg channel layout string
 * @property {Object} metrics - Detailed analysis metrics
 * @property {string[]} notes - Additional observations
 */
async function detectTopology(filePath) {
  const startTime = Date.now();
  const notes = [];
  
  // Get basic channel info
  const info = await getChannelInfo(filePath);
  
  // Handle mono files directly
  if (info.channels === 1) {
    return {
      topology: ChannelTopology.MONO,
      confidence: Confidence.HIGH,
      channelCount: 1,
      channelLayout: info.channelLayout,
      metrics: {
        analysisTimeMs: Date.now() - startTime
      },
      notes: ['Single channel audio detected']
    };
  }
  
  // Handle multichannel (>2 channels)
  if (info.channels > 2) {
    return {
      topology: ChannelTopology.MULTICHANNEL,
      confidence: Confidence.HIGH,
      channelCount: info.channels,
      channelLayout: info.channelLayout,
      metrics: {
        analysisTimeMs: Date.now() - startTime
      },
      notes: [`${info.channels}-channel audio (${info.channelLayout})`]
    };
  }
  
  // For stereo files, perform detailed analysis
  const [diff, sum, channels, correlation] = await Promise.all([
    analyzeChannelDifference(filePath),
    analyzeChannelSum(filePath),
    analyzeIndividualChannels(filePath),
    analyzePhaseCorrelation(filePath)
  ]);
  
  const analysis = { info, diff, sum, channels, correlation };
  
  // Check for dual-mono first (most specific)
  const dualMonoResult = detectDualMono(analysis);
  if (dualMonoResult.isDualMono) {
    notes.push('Channels appear identical (dual-mono)');
    return {
      topology: ChannelTopology.DUAL_MONO,
      confidence: dualMonoResult.confidence,
      channelCount: 2,
      channelLayout: info.channelLayout,
      metrics: {
        diffPeakDb: diff.diffPeakDb,
        diffRmsDb: diff.diffRmsDb,
        correlation: correlation.correlation,
        analysisTimeMs: Date.now() - startTime
      },
      notes
    };
  }
  
  // Check for Mid-Side encoding
  const midSideResult = detectMidSide(analysis);
  if (midSideResult.isMidSide) {
    notes.push('Mid-Side encoding detected');
    if (midSideResult.confidence === Confidence.LOW) {
      notes.push('M/S detection confidence is low - verify manually');
    }
    return {
      topology: ChannelTopology.MID_SIDE,
      confidence: midSideResult.confidence,
      channelCount: 2,
      channelLayout: info.channelLayout,
      metrics: {
        levelDifference: midSideResult.details?.levelDifference,
        correlation: correlation.correlation,
        leftRmsDb: channels.leftRmsDb,
        rightRmsDb: channels.rightRmsDb,
        analysisTimeMs: Date.now() - startTime
      },
      notes
    };
  }
  
  // Check for true stereo
  const stereoResult = detectTrueStereo(analysis);
  if (stereoResult.isTrueStereo) {
    notes.push('True stereo content detected');
    if (stereoResult.stereoWidth < 0.2) {
      notes.push('Narrow stereo image');
    } else if (stereoResult.stereoWidth > 0.8) {
      notes.push('Wide stereo image');
    }
    return {
      topology: ChannelTopology.STEREO,
      confidence: stereoResult.confidence,
      channelCount: 2,
      channelLayout: info.channelLayout,
      metrics: {
        stereoWidth: stereoResult.stereoWidth,
        correlation: correlation.correlation,
        diffRmsDb: diff.diffRmsDb,
        sumRmsDb: sum.sumRmsDb,
        analysisTimeMs: Date.now() - startTime
      },
      notes
    };
  }
  
  // Default: stereo container with mono-ish content
  notes.push('Stereo file with limited stereo content');
  return {
    topology: ChannelTopology.STEREO,
    confidence: Confidence.MEDIUM,
    channelCount: 2,
    channelLayout: info.channelLayout,
    metrics: {
      stereoWidth: stereoResult.stereoWidth,
      correlation: correlation.correlation,
      diffRmsDb: diff.diffRmsDb,
      sumRmsDb: sum.sumRmsDb,
      analysisTimeMs: Date.now() - startTime
    },
    notes
  };
}

/**
 * Quick topology check - just returns basic channel count
 * Use when full analysis is not needed.
 * 
 * @param {string} filePath - Path to audio file
 * @returns {Promise<{channels: number, topology: string}>}
 */
async function quickCheck(filePath) {
  const info = await getChannelInfo(filePath);
  
  let topology;
  if (info.channels === 1) {
    topology = ChannelTopology.MONO;
  } else if (info.channels === 2) {
    topology = ChannelTopology.STEREO; // Assume stereo, full analysis needed for specifics
  } else if (info.channels > 2) {
    topology = ChannelTopology.MULTICHANNEL;
  } else {
    topology = ChannelTopology.UNKNOWN;
  }
  
  return {
    channels: info.channels,
    channelLayout: info.channelLayout,
    topology
  };
}

/**
 * Check if topology is mono-compatible
 * @param {string} topology - Topology type
 * @returns {boolean}
 */
function isMonoCompatible(topology) {
  return topology === ChannelTopology.MONO || topology === ChannelTopology.DUAL_MONO;
}

/**
 * Get human-readable topology description
 * @param {string} topology - Topology type
 * @returns {string}
 */
function getTopologyDescription(topology) {
  const descriptions = {
    [ChannelTopology.MONO]: 'Mono (single channel)',
    [ChannelTopology.STEREO]: 'Stereo (distinct left/right)',
    [ChannelTopology.DUAL_MONO]: 'Dual-mono (identical channels)',
    [ChannelTopology.MID_SIDE]: 'Mid-Side encoded stereo',
    [ChannelTopology.MULTICHANNEL]: 'Multichannel surround',
    [ChannelTopology.UNKNOWN]: 'Unknown channel configuration'
  };
  
  return descriptions[topology] || descriptions[ChannelTopology.UNKNOWN];
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Main detection
  detectTopology,
  quickCheck,
  
  // Individual analyzers (for advanced use)
  getChannelInfo,
  analyzeChannelDifference,
  analyzeChannelSum,
  analyzeIndividualChannels,
  analyzePhaseCorrelation,
  
  // Detection logic (for testing)
  detectDualMono,
  detectMidSide,
  detectTrueStereo,
  
  // Helpers
  isMonoCompatible,
  getTopologyDescription,
  
  // Constants
  ChannelTopology,
  Confidence,
  THRESHOLDS
};
