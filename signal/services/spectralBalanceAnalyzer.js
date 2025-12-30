/**
 * Spectral Balance Analyzer
 * 
 * Measures deviation from expected spectral curves (pink noise or genre-specific)
 * to identify tonal imbalances that affect mix translation across playback systems.
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Analysis provides actionable
 * metrics for transformation parameter selection.
 * 
 * Key metrics:
 * - Deviation Index: RMS deviation from reference curve (dB)
 * - Spectral Tilt: Measured slope in dB/octave
 * - Imbalance Region: Which frequency range is problematic
 */

const { spawn } = require('child_process');

// ============================================================================
// Configuration
// ============================================================================

const FFMPEG_PATH = 'ffmpeg';
const FFPROBE_PATH = 'ffprobe';

/**
 * Standard octave band center frequencies (ISO 266)
 * 10 bands covering 31 Hz to 16 kHz
 */
const OCTAVE_BANDS = [
  { center: 31.5, low: 22, high: 44, label: '31 Hz' },
  { center: 63, low: 44, high: 88, label: '63 Hz' },
  { center: 125, low: 88, high: 177, label: '125 Hz' },
  { center: 250, low: 177, high: 354, label: '250 Hz' },
  { center: 500, low: 354, high: 707, label: '500 Hz' },
  { center: 1000, low: 707, high: 1414, label: '1 kHz' },
  { center: 2000, low: 1414, high: 2828, label: '2 kHz' },
  { center: 4000, low: 2828, high: 5656, label: '4 kHz' },
  { center: 8000, low: 5656, high: 11314, label: '8 kHz' },
  { center: 16000, low: 11314, high: 20000, label: '16 kHz' }
];

/**
 * Reference spectral curves (relative dB per octave band)
 * Normalized to 0 dB at 1 kHz (index 5)
 */
const REFERENCE_CURVES = {
  // Pink noise: -3 dB/octave slope (perceptually flat)
  PINK_NOISE: [9, 6, 3, 0, -3, -6, -9, -12, -15, -18].map((v, i) => v + 6), // Normalize to 0 at 1kHz
  
  // Flat (white noise): equal energy per Hz
  FLAT: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  
  // Genre-specific targets (empirically derived)
  HIP_HOP: [6, 4, 2, 1, 0, -1, -2, -3, -4, -6],      // Bass-heavy, rolled-off highs
  POP: [2, 1, 0, 1, 2, 1, 0, -1, -2, -4],            // Balanced with mid presence
  ROCK: [3, 2, 1, 0, -1, 0, 1, 0, -1, -3],           // Guitar-focused mids
  EDM: [8, 6, 3, 0, -2, -3, -2, 0, 2, 0],            // Heavy bass, bright highs
  CLASSICAL: [0, 0, 0, 0, 0, 0, 0, -1, -2, -4],      // Natural, slight HF rolloff
  JAZZ: [1, 1, 0, 0, 0, 0, -1, -2, -3, -5],          // Warm, smooth highs
  PODCAST: [0, 0, 0, 1, 2, 1, 0, -2, -4, -8],        // Voice-optimized
  BROADCAST: [0, 0, 0, 0, 0, 0, -1, -2, -3, -5]      // Broadcast standard
};

/**
 * Spectral balance status classifications
 */
const SpectralBalanceStatus = {
  BALANCED: 'BALANCED',           // < 2 dB RMS deviation
  SLIGHT: 'SLIGHT',               // 2-4 dB deviation
  MODERATE: 'MODERATE',           // 4-6 dB deviation
  SIGNIFICANT: 'SIGNIFICANT',     // 6-10 dB deviation
  EXTREME: 'EXTREME'              // > 10 dB deviation
};

/**
 * Thresholds for status classification (dB RMS)
 */
const DEVIATION_THRESHOLDS = {
  BALANCED: 2,
  SLIGHT: 4,
  MODERATE: 6,
  SIGNIFICANT: 10
  // Above 10 = EXTREME
};

/**
 * Imbalance region classifications
 */
const ImbalanceRegion = {
  LOW: 'LOW',           // Bands 0-2 (31-125 Hz)
  LOW_MID: 'LOW_MID',   // Bands 2-4 (125-500 Hz)
  MID: 'MID',           // Bands 4-6 (500-2000 Hz)
  HIGH_MID: 'HIGH_MID', // Bands 6-8 (2-8 kHz)
  HIGH: 'HIGH',         // Bands 8-9 (8-16 kHz)
  BALANCED: 'BALANCED'  // No dominant imbalance
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
 * Measure energy in a specific frequency band using FFmpeg
 * @param {string} filePath - Path to audio file
 * @param {number} lowFreq - Low cutoff frequency
 * @param {number} highFreq - High cutoff frequency
 * @returns {Promise<number>} - RMS energy level in dB
 */
async function measureBandEnergy(filePath, lowFreq, highFreq) {
  // Bandpass filter → RMS measurement
  const filterChain = [
    `highpass=f=${lowFreq}`,
    `lowpass=f=${highFreq}`,
    'astats=metadata=1:measure_overall=RMS_level:measure_perchannel=0'
  ].join(',');
  
  const args = [
    '-i', filePath,
    '-af', filterChain,
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse RMS level from astats output
    const rmsMatch = stderr.match(/RMS level dB:\s*([-\d.]+)/);
    if (rmsMatch) {
      return parseFloat(rmsMatch[1]);
    }
    
    // Fallback: try Overall RMS
    const overallMatch = stderr.match(/Overall.*RMS.*?:\s*([-\d.]+)/i);
    if (overallMatch) {
      return parseFloat(overallMatch[1]);
    }
    
    // Fallback: try lavfi metadata format
    const lavfiMatch = stderr.match(/lavfi\.astats\.Overall\.RMS_level=([-\d.]+)/);
    if (lavfiMatch) {
      return parseFloat(lavfiMatch[1]);
    }
    
    return null;
  } catch (error) {
    console.error(`[SpectralBalanceAnalyzer] Band energy measurement failed (${lowFreq}-${highFreq}Hz):`, error.message);
    return null;
  }
}

/**
 * Measure energy across all octave bands
 * @param {string} filePath - Path to audio file
 * @returns {Promise<number[]>} - Array of RMS levels per band (dB)
 */
async function measureAllBands(filePath) {
  // Run all band measurements in parallel
  const measurements = await Promise.all(
    OCTAVE_BANDS.map(band => measureBandEnergy(filePath, band.low, band.high))
  );
  
  return measurements;
}

/**
 * Calculate spectral tilt (slope in dB/octave)
 * Uses linear regression on the band energies
 * @param {number[]} bandLevels - Array of dB levels per band
 * @returns {number} - Slope in dB/octave
 */
function calculateSpectralTilt(bandLevels) {
  const validBands = bandLevels.map((level, i) => ({ level, index: i }))
    .filter(b => b.level !== null && !isNaN(b.level));
  
  if (validBands.length < 3) {
    return null;
  }
  
  // Linear regression: y = mx + b
  const n = validBands.length;
  const sumX = validBands.reduce((s, b) => s + b.index, 0);
  const sumY = validBands.reduce((s, b) => s + b.level, 0);
  const sumXY = validBands.reduce((s, b) => s + b.index * b.level, 0);
  const sumX2 = validBands.reduce((s, b) => s + b.index * b.index, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  
  return slope; // dB per octave band (approximately dB/octave)
}

/**
 * Normalize band levels to 0 dB mean
 * @param {number[]} levels - Array of dB levels
 * @returns {number[]} - Normalized levels
 */
function normalizeLevels(levels) {
  const validLevels = levels.filter(l => l !== null && !isNaN(l));
  if (validLevels.length === 0) return levels;
  
  const mean = validLevels.reduce((a, b) => a + b, 0) / validLevels.length;
  return levels.map(l => l !== null ? l - mean : null);
}

/**
 * Calculate RMS deviation from reference curve
 * @param {number[]} measured - Measured band levels (normalized)
 * @param {number[]} reference - Reference curve (normalized)
 * @returns {number} - RMS deviation in dB
 */
function calculateDeviation(measured, reference) {
  const validPairs = measured.map((m, i) => ({ m, r: reference[i] }))
    .filter(p => p.m !== null && !isNaN(p.m));
  
  if (validPairs.length === 0) return null;
  
  const squaredDiffs = validPairs.map(p => Math.pow(p.m - p.r, 2));
  const meanSquared = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
  
  return Math.sqrt(meanSquared);
}

/**
 * Identify which frequency region has the largest imbalance
 * @param {number[]} measured - Measured band levels (normalized)
 * @param {number[]} reference - Reference curve (normalized)
 * @returns {Object} - Imbalance region and deviation
 */
function identifyImbalanceRegion(measured, reference) {
  const regions = [
    { name: ImbalanceRegion.LOW, bands: [0, 1, 2] },
    { name: ImbalanceRegion.LOW_MID, bands: [2, 3, 4] },
    { name: ImbalanceRegion.MID, bands: [4, 5, 6] },
    { name: ImbalanceRegion.HIGH_MID, bands: [6, 7, 8] },
    { name: ImbalanceRegion.HIGH, bands: [8, 9] }
  ];
  
  let maxDeviation = 0;
  let worstRegion = ImbalanceRegion.BALANCED;
  let isExcessive = false; // true = too much, false = too little
  
  for (const region of regions) {
    const deviations = region.bands
      .filter(i => measured[i] !== null && !isNaN(measured[i]))
      .map(i => measured[i] - reference[i]);
    
    if (deviations.length === 0) continue;
    
    const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;
    const absDeviation = Math.abs(avgDeviation);
    
    if (absDeviation > maxDeviation) {
      maxDeviation = absDeviation;
      worstRegion = region.name;
      isExcessive = avgDeviation > 0;
    }
  }
  
  // Only flag if deviation is significant (> 3 dB average)
  if (maxDeviation < 3) {
    return { region: ImbalanceRegion.BALANCED, deviation: 0, isExcessive: null };
  }
  
  return { region: worstRegion, deviation: maxDeviation, isExcessive };
}

/**
 * Classify deviation to status
 * @param {number} deviation - RMS deviation in dB
 * @returns {string} - SpectralBalanceStatus value
 */
function classifyDeviation(deviation) {
  if (deviation === null || isNaN(deviation)) {
    return 'UNKNOWN';
  }
  if (deviation < DEVIATION_THRESHOLDS.BALANCED) {
    return SpectralBalanceStatus.BALANCED;
  }
  if (deviation < DEVIATION_THRESHOLDS.SLIGHT) {
    return SpectralBalanceStatus.SLIGHT;
  }
  if (deviation < DEVIATION_THRESHOLDS.MODERATE) {
    return SpectralBalanceStatus.MODERATE;
  }
  if (deviation < DEVIATION_THRESHOLDS.SIGNIFICANT) {
    return SpectralBalanceStatus.SIGNIFICANT;
  }
  return SpectralBalanceStatus.EXTREME;
}

/**
 * Generate recommendation based on analysis
 * @param {Object} analysis - Analysis results
 * @returns {string} - Human-readable recommendation
 */
function generateRecommendation(analysis) {
  const { status, imbalanceRegion, isExcessive } = analysis;
  
  if (status === SpectralBalanceStatus.BALANCED) {
    return 'Spectral balance is within target range. No corrective EQ needed.';
  }
  
  if (status === SpectralBalanceStatus.SLIGHT) {
    return 'Minor spectral coloration detected. May be intentional stylistic choice.';
  }
  
  const direction = isExcessive ? 'excessive' : 'deficient';
  const action = isExcessive ? 'Reduce' : 'Boost';
  
  const regionDescriptions = {
    [ImbalanceRegion.LOW]: `Low frequencies (31-125 Hz) are ${direction}. ${action} bass content.`,
    [ImbalanceRegion.LOW_MID]: `Low-mid frequencies (125-500 Hz) are ${direction}. ${action} warmth/body.`,
    [ImbalanceRegion.MID]: `Mid frequencies (500-2000 Hz) are ${direction}. ${action} presence/clarity.`,
    [ImbalanceRegion.HIGH_MID]: `High-mid frequencies (2-8 kHz) are ${direction}. ${action} brightness/edge.`,
    [ImbalanceRegion.HIGH]: `High frequencies (8-16 kHz) are ${direction}. ${action} air/sparkle.`
  };
  
  const regionAdvice = regionDescriptions[imbalanceRegion] || 'Check overall spectral balance.';
  
  if (status === SpectralBalanceStatus.EXTREME) {
    return `EXTREME spectral imbalance detected. ${regionAdvice} Consider significant corrective EQ.`;
  }
  
  return regionAdvice;
}

// ============================================================================
// Main Analysis Functions
// ============================================================================

/**
 * Comprehensive spectral balance analysis
 * @param {string} filePath - Path to audio file
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} - Complete spectral balance analysis
 */
async function analyzeSpectralBalance(filePath, options = {}) {
  const {
    reference = 'PINK_NOISE',
    returnPerBand = true
  } = options;
  
  const startTime = Date.now();
  
  // Get reference curve
  const referenceCurve = REFERENCE_CURVES[reference] || REFERENCE_CURVES.PINK_NOISE;
  const normalizedReference = normalizeLevels(referenceCurve);
  
  // Measure all octave bands
  const rawLevels = await measureAllBands(filePath);
  const measuredLevels = normalizeLevels(rawLevels);
  
  // Calculate metrics
  const spectralTilt = calculateSpectralTilt(rawLevels);
  const deviationIndex = calculateDeviation(measuredLevels, normalizedReference);
  const status = classifyDeviation(deviationIndex);
  const imbalance = identifyImbalanceRegion(measuredLevels, normalizedReference);
  
  // Expected tilt for reference
  const expectedTilt = calculateSpectralTilt(referenceCurve);
  
  const processingTimeMs = Date.now() - startTime;
  
  const result = {
    deviationIndex: deviationIndex !== null ? parseFloat(deviationIndex.toFixed(2)) : null,
    spectralTiltDb: spectralTilt !== null ? parseFloat(spectralTilt.toFixed(2)) : null,
    expectedTiltDb: expectedTilt !== null ? parseFloat(expectedTilt.toFixed(2)) : null,
    status,
    imbalanceRegion: imbalance.region,
    isExcessive: imbalance.isExcessive,
    reference,
    processingTimeMs
  };
  
  if (returnPerBand) {
    result.perBand = OCTAVE_BANDS.map((band, i) => ({
      label: band.label,
      center: band.center,
      measured: rawLevels[i] !== null ? parseFloat(rawLevels[i].toFixed(1)) : null,
      normalized: measuredLevels[i] !== null ? parseFloat(measuredLevels[i].toFixed(1)) : null,
      reference: normalizedReference[i] !== null ? parseFloat(normalizedReference[i].toFixed(1)) : null,
      deviation: measuredLevels[i] !== null ? parseFloat((measuredLevels[i] - normalizedReference[i]).toFixed(1)) : null
    }));
  }
  
  result.recommendation = generateRecommendation(result);
  
  return result;
}

/**
 * Quick check for spectral balance
 * Uses fewer bands for faster analysis
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} - Quick check result
 */
async function quickCheck(filePath) {
  const startTime = Date.now();
  
  // Measure key bands only: low (125), mid (1k), high (8k)
  const keyBands = [
    OCTAVE_BANDS[2], // 125 Hz
    OCTAVE_BANDS[5], // 1 kHz
    OCTAVE_BANDS[8]  // 8 kHz
  ];
  
  const levels = await Promise.all(
    keyBands.map(band => measureBandEnergy(filePath, band.low, band.high))
  );
  
  const processingTimeMs = Date.now() - startTime;
  
  // Check for obvious imbalances
  const [low, mid, high] = levels;
  
  let status = SpectralBalanceStatus.BALANCED;
  let imbalanceRegion = ImbalanceRegion.BALANCED;
  
  if (low !== null && mid !== null) {
    const lowMidDiff = low - mid;
    if (Math.abs(lowMidDiff) > 10) {
      status = SpectralBalanceStatus.SIGNIFICANT;
      imbalanceRegion = lowMidDiff > 0 ? ImbalanceRegion.LOW : ImbalanceRegion.MID;
    } else if (Math.abs(lowMidDiff) > 6) {
      status = SpectralBalanceStatus.MODERATE;
      imbalanceRegion = lowMidDiff > 0 ? ImbalanceRegion.LOW : ImbalanceRegion.MID;
    }
  }
  
  if (mid !== null && high !== null) {
    const midHighDiff = mid - high;
    // Only flag high-end issues if more severe than existing
    if (Math.abs(midHighDiff) > 12 && status !== SpectralBalanceStatus.SIGNIFICANT) {
      status = SpectralBalanceStatus.SIGNIFICANT;
      imbalanceRegion = midHighDiff > 0 ? ImbalanceRegion.HIGH : ImbalanceRegion.MID;
    }
  }
  
  return {
    status,
    imbalanceRegion,
    bands: {
      low: low !== null ? parseFloat(low.toFixed(1)) : null,
      mid: mid !== null ? parseFloat(mid.toFixed(1)) : null,
      high: high !== null ? parseFloat(high.toFixed(1)) : null
    },
    processingTimeMs
  };
}

/**
 * Get list of available reference curves
 * @returns {string[]} - Array of reference curve names
 */
function getAvailableReferences() {
  return Object.keys(REFERENCE_CURVES);
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Main analysis functions
  analyzeSpectralBalance,
  quickCheck,
  
  // Utility functions
  measureBandEnergy,
  measureAllBands,
  calculateSpectralTilt,
  calculateDeviation,
  identifyImbalanceRegion,
  classifyDeviation,
  generateRecommendation,
  getAvailableReferences,
  
  // Constants
  SpectralBalanceStatus,
  DEVIATION_THRESHOLDS,
  ImbalanceRegion,
  OCTAVE_BANDS,
  REFERENCE_CURVES
};
