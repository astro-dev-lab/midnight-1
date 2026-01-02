/**
 * Model Confidence Calibration Layer
 * 
 * Prevents ML models from reporting confidence scores that don't match their
 * actual accuracy. Per the V2 Manifest, confidence calibration must be within
 * ±10% of actual success rate.
 * 
 * Per STUDIOOS_ML_INVESTMENT_CHARTER.md:
 * - ML outputs must be explainable
 * - Same input + same params + same model = same result
 * - Confidence must reflect true accuracy
 * 
 * @version 1.0.0
 */

// ============================================================================
// CALIBRATION STATUS
// ============================================================================

const CalibrationStatus = Object.freeze({
  WELL_CALIBRATED: 'WELL_CALIBRATED',
  SLIGHTLY_MISCALIBRATED: 'SLIGHTLY_MISCALIBRATED',
  MISCALIBRATED: 'MISCALIBRATED',
  SEVERELY_MISCALIBRATED: 'SEVERELY_MISCALIBRATED'
});

// ============================================================================
// THRESHOLDS
// ============================================================================

const CALIBRATION_THRESHOLDS = Object.freeze({
  WELL_CALIBRATED: 0.05,
  SLIGHTLY_MISCALIBRATED: 0.10,
  MISCALIBRATED: 0.20,
  MAX_ALLOWED_OVERCONFIDENCE: 0.10,
  MIN_CONFIDENCE_FLOOR: 0.35,
  MAX_CONFIDENCE_CEILING: 0.95,
  MIN_SAMPLES_FOR_CALIBRATION: 10
});

// ============================================================================
// CALIBRATION BUCKETS
// ============================================================================

/**
 * Historical accuracy by confidence bucket.
 * Updated periodically based on observed outcomes.
 * 
 * Structure: { bucketId: { min, max, expectedAccuracy, samples, totalCorrect } }
 */
const DEFAULT_CALIBRATION_BUCKETS = Object.freeze({
  '0.90-1.00': { min: 0.90, max: 1.00, expectedAccuracy: 0.85, samples: 100, totalCorrect: 85 },
  '0.80-0.90': { min: 0.80, max: 0.90, expectedAccuracy: 0.78, samples: 150, totalCorrect: 117 },
  '0.70-0.80': { min: 0.70, max: 0.80, expectedAccuracy: 0.72, samples: 200, totalCorrect: 144 },
  '0.60-0.70': { min: 0.60, max: 0.70, expectedAccuracy: 0.65, samples: 180, totalCorrect: 117 },
  '0.50-0.60': { min: 0.50, max: 0.60, expectedAccuracy: 0.55, samples: 120, totalCorrect: 66 },
  '0.40-0.50': { min: 0.40, max: 0.50, expectedAccuracy: 0.45, samples: 80, totalCorrect: 36 },
  '0.00-0.40': { min: 0.00, max: 0.40, expectedAccuracy: 0.30, samples: 50, totalCorrect: 15 }
});

// ============================================================================
// MODEL-SPECIFIC CALIBRATION DATA
// ============================================================================

/**
 * Model-specific calibration data.
 * Can be customized per model based on observed performance.
 */
const MODEL_CALIBRATION = Object.freeze({
  subgenre_v2: {
    version: '2.0.0',
    lastCalibrated: '2024-12-01',
    temperatureScaling: 1.15,
    buckets: { ...DEFAULT_CALIBRATION_BUCKETS },
    biasCorrection: -0.02,
    description: 'Subgenre classification tends to be slightly overconfident'
  },
  
  risk_assessment: {
    version: '1.0.0',
    lastCalibrated: '2024-12-01',
    temperatureScaling: 1.0,
    buckets: { ...DEFAULT_CALIBRATION_BUCKETS },
    biasCorrection: 0,
    description: 'Risk assessment is well-calibrated'
  },
  
  loudness_prediction: {
    version: '1.0.0',
    lastCalibrated: '2024-12-01',
    temperatureScaling: 1.05,
    buckets: { ...DEFAULT_CALIBRATION_BUCKETS },
    biasCorrection: -0.01,
    description: 'Loudness predictions slightly overconfident at high ranges'
  }
});

// ============================================================================
// IN-MEMORY CALIBRATION STATE
// ============================================================================

// Runtime calibration stats (updated during operation)
const runtimeCalibrationStats = new Map();

// ============================================================================
// CORE CALIBRATION FUNCTIONS
// ============================================================================

/**
 * Get the bucket for a given confidence value
 * @param {number} confidence - Raw confidence value
 * @param {Object} [buckets] - Bucket configuration
 * @returns {Object} { bucketId, bucket }
 */
function getBucket(confidence, buckets = DEFAULT_CALIBRATION_BUCKETS) {
  for (const [bucketId, bucket] of Object.entries(buckets)) {
    if (confidence >= bucket.min && confidence < bucket.max) {
      return { bucketId, bucket };
    }
  }
  
  // Handle edge case of exactly 1.0
  if (confidence >= 1.0) {
    return { bucketId: '0.90-1.00', bucket: buckets['0.90-1.00'] };
  }
  
  // Below minimum bucket
  return { bucketId: '0.00-0.40', bucket: buckets['0.00-0.40'] };
}

/**
 * Apply temperature scaling to logits
 * Temperature > 1.0 softens probabilities (less confident)
 * Temperature < 1.0 sharpens probabilities (more confident)
 * @param {number[]} logits - Raw model logits
 * @param {number} temperature - Temperature parameter
 * @returns {number[]} Calibrated probabilities
 */
function applyTemperatureScaling(logits, temperature) {
  if (temperature <= 0) {
    throw new Error('Temperature must be positive');
  }
  
  if (temperature === 1.0) {
    return softmax(logits);
  }

  // Scale logits by temperature
  const scaledLogits = logits.map(l => l / temperature);
  return softmax(scaledLogits);
}

/**
 * Softmax function
 * @param {number[]} logits - Input logits
 * @returns {number[]} Probabilities (sum to 1)
 */
function softmax(logits) {
  const maxLogit = Math.max(...logits);
  const expLogits = logits.map(l => Math.exp(l - maxLogit));
  const sumExp = expLogits.reduce((a, b) => a + b, 0);
  return expLogits.map(e => e / sumExp);
}

/**
 * Clip confidence to valid range
 * @param {number} confidence - Raw confidence
 * @returns {Object} { clipped, wasClipped, original }
 */
function clipConfidence(confidence) {
  const { MIN_CONFIDENCE_FLOOR, MAX_CONFIDENCE_CEILING } = CALIBRATION_THRESHOLDS;
  
  let clipped = confidence;
  let wasClipped = false;
  let clipReason = null;

  if (confidence < MIN_CONFIDENCE_FLOOR) {
    clipped = MIN_CONFIDENCE_FLOOR;
    wasClipped = true;
    clipReason = 'below_floor';
  } else if (confidence > MAX_CONFIDENCE_CEILING) {
    clipped = MAX_CONFIDENCE_CEILING;
    wasClipped = true;
    clipReason = 'above_ceiling';
  }

  return {
    clipped,
    wasClipped,
    clipReason,
    original: confidence,
    floor: MIN_CONFIDENCE_FLOOR,
    ceiling: MAX_CONFIDENCE_CEILING
  };
}

/**
 * Calculate calibration error for a single prediction
 * @param {number} predicted - Predicted confidence
 * @param {boolean} correct - Whether prediction was correct
 * @returns {number} Calibration error
 */
function calculateSingleCalibrationError(predicted, correct) {
  const actual = correct ? 1 : 0;
  return Math.abs(predicted - actual);
}

/**
 * Calculate Expected Calibration Error (ECE)
 * @param {Array<{predicted: number, correct: boolean}>} predictions - Array of predictions
 * @param {number} [numBins=10] - Number of bins for bucketing
 * @returns {Object} { ece, perBucket, status }
 */
function calculateECE(predictions, numBins = 10) {
  if (predictions.length === 0) {
    return {
      ece: 0,
      perBucket: [],
      status: CalibrationStatus.WELL_CALIBRATED,
      sampleCount: 0
    };
  }

  // Create bins
  const bins = Array.from({ length: numBins }, () => ({
    sumPredicted: 0,
    sumCorrect: 0,
    count: 0
  }));

  // Assign predictions to bins
  for (const { predicted, correct } of predictions) {
    const binIndex = Math.min(Math.floor(predicted * numBins), numBins - 1);
    bins[binIndex].sumPredicted += predicted;
    bins[binIndex].sumCorrect += correct ? 1 : 0;
    bins[binIndex].count++;
  }

  // Calculate ECE
  let ece = 0;
  const perBucket = [];
  const totalSamples = predictions.length;

  for (let i = 0; i < numBins; i++) {
    const bin = bins[i];
    if (bin.count === 0) continue;

    const avgPredicted = bin.sumPredicted / bin.count;
    const avgCorrect = bin.sumCorrect / bin.count;
    const binError = Math.abs(avgPredicted - avgCorrect);
    const weight = bin.count / totalSamples;

    ece += weight * binError;

    perBucket.push({
      binIndex: i,
      range: `${(i / numBins).toFixed(2)}-${((i + 1) / numBins).toFixed(2)}`,
      avgPredicted: Math.round(avgPredicted * 100) / 100,
      avgActual: Math.round(avgCorrect * 100) / 100,
      error: Math.round(binError * 100) / 100,
      count: bin.count
    });
  }

  // Determine status
  const status = getCalibrationStatus(ece);

  return {
    ece: Math.round(ece * 1000) / 1000,
    perBucket,
    status,
    sampleCount: totalSamples
  };
}

/**
 * Get calibration status from ECE value
 * @param {number} ece - Expected Calibration Error
 * @returns {string} CalibrationStatus
 */
function getCalibrationStatus(ece) {
  if (ece <= CALIBRATION_THRESHOLDS.WELL_CALIBRATED) {
    return CalibrationStatus.WELL_CALIBRATED;
  }
  if (ece <= CALIBRATION_THRESHOLDS.SLIGHTLY_MISCALIBRATED) {
    return CalibrationStatus.SLIGHTLY_MISCALIBRATED;
  }
  if (ece <= CALIBRATION_THRESHOLDS.MISCALIBRATED) {
    return CalibrationStatus.MISCALIBRATED;
  }
  return CalibrationStatus.SEVERELY_MISCALIBRATED;
}

// ============================================================================
// MAIN CALIBRATION FUNCTIONS
// ============================================================================

/**
 * Calibrate a raw confidence value
 * @param {number} rawConfidence - Raw model confidence
 * @param {string} modelId - Model identifier
 * @param {Object} [context] - Additional context
 * @returns {Object} Calibration result
 */
function calibrateConfidence(rawConfidence, modelId, context = {}) {
  // Validate input
  if (typeof rawConfidence !== 'number' || Number.isNaN(rawConfidence)) {
    return {
      calibrated: CALIBRATION_THRESHOLDS.MIN_CONFIDENCE_FLOOR,
      original: rawConfidence,
      adjustment: 0,
      status: CalibrationStatus.SEVERELY_MISCALIBRATED,
      error: 'Invalid raw confidence value',
      wasClipped: true
    };
  }

  // Get model calibration data
  const modelCalib = MODEL_CALIBRATION[modelId] || {
    temperatureScaling: 1.0,
    buckets: DEFAULT_CALIBRATION_BUCKETS,
    biasCorrection: 0
  };

  // Step 1: Apply temperature scaling if we have logits
  let adjusted = rawConfidence;
  
  if (context.logits && Array.isArray(context.logits)) {
    const calibratedProbs = applyTemperatureScaling(context.logits, modelCalib.temperatureScaling);
    adjusted = Math.max(...calibratedProbs);
  } else if (modelCalib.temperatureScaling !== 1.0) {
    // Apply approximate temperature scaling to single confidence value
    // Higher temperature = lower confidence
    adjusted = rawConfidence / (rawConfidence + (1 - rawConfidence) * modelCalib.temperatureScaling);
  }

  // Step 2: Apply bucket-based calibration
  const { bucketId, bucket } = getBucket(adjusted, modelCalib.buckets);
  const bucketMidpoint = (bucket.min + bucket.max) / 2;
  
  // If model tends to be overconfident, adjust down toward expected accuracy
  if (adjusted > bucket.expectedAccuracy) {
    const overconfidence = adjusted - bucket.expectedAccuracy;
    const maxAllowed = CALIBRATION_THRESHOLDS.MAX_ALLOWED_OVERCONFIDENCE;
    
    if (overconfidence > maxAllowed) {
      // Reduce overconfidence beyond allowed threshold
      adjusted = bucket.expectedAccuracy + maxAllowed;
    }
  }

  // Step 3: Apply bias correction
  adjusted += modelCalib.biasCorrection;

  // Step 4: Clip to valid range
  const clipResult = clipConfidence(adjusted);
  const calibrated = clipResult.clipped;

  // Calculate adjustment
  const adjustment = calibrated - rawConfidence;

  // Determine calibration quality
  const calibrationError = Math.abs(adjustment);
  const status = getCalibrationStatus(calibrationError);

  return {
    calibrated: Math.round(calibrated * 1000) / 1000,
    original: rawConfidence,
    adjustment: Math.round(adjustment * 1000) / 1000,
    status,
    bucket: bucketId,
    expectedAccuracy: bucket.expectedAccuracy,
    wasClipped: clipResult.wasClipped,
    clipReason: clipResult.clipReason,
    calibrationMethod: context.logits ? 'temperature_scaling' : 'bucket_adjustment',
    modelId,
    warnings: buildCalibrationWarnings(rawConfidence, calibrated, status)
  };
}

/**
 * Build warnings based on calibration result
 * @param {number} raw - Raw confidence
 * @param {number} calibrated - Calibrated confidence
 * @param {string} status - Calibration status
 * @returns {string[]} Warnings
 */
function buildCalibrationWarnings(raw, calibrated, status) {
  const warnings = [];

  if (raw > 0.95) {
    warnings.push('Extremely high raw confidence may indicate overfit model');
  }

  if (raw > calibrated + 0.15) {
    warnings.push('Significant confidence reduction applied');
  }

  if (status === CalibrationStatus.SEVERELY_MISCALIBRATED) {
    warnings.push('Model appears severely miscalibrated');
  }

  return warnings;
}

/**
 * Quick calibration check
 * @param {number} rawConfidence - Raw confidence
 * @param {string} modelId - Model identifier
 * @returns {Object} { calibrated, wasAdjusted }
 */
function quickCheck(rawConfidence, modelId) {
  const result = calibrateConfidence(rawConfidence, modelId);
  
  return {
    calibrated: result.calibrated,
    wasAdjusted: Math.abs(result.adjustment) > 0.001,
    adjustment: result.adjustment
  };
}

// ============================================================================
// CALIBRATION STATS TRACKING
// ============================================================================

/**
 * Update calibration statistics with a new observation
 * @param {string} modelId - Model identifier
 * @param {number} predicted - Predicted confidence
 * @param {boolean} correct - Whether prediction was correct
 */
function updateCalibrationStats(modelId, predicted, correct) {
  if (!runtimeCalibrationStats.has(modelId)) {
    runtimeCalibrationStats.set(modelId, {
      predictions: [],
      lastUpdated: null
    });
  }

  const stats = runtimeCalibrationStats.get(modelId);
  
  stats.predictions.push({ predicted, correct });
  stats.lastUpdated = new Date().toISOString();

  // Keep only last 1000 predictions
  if (stats.predictions.length > 1000) {
    stats.predictions = stats.predictions.slice(-1000);
  }
}

/**
 * Get current calibration statistics for a model
 * @param {string} modelId - Model identifier
 * @returns {Object} Current calibration stats
 */
function getCalibrationStats(modelId) {
  const stats = runtimeCalibrationStats.get(modelId);
  
  if (!stats || stats.predictions.length === 0) {
    return {
      modelId,
      hasData: false,
      ece: null,
      status: null,
      sampleCount: 0
    };
  }

  const eceResult = calculateECE(stats.predictions);

  return {
    modelId,
    hasData: true,
    ...eceResult,
    lastUpdated: stats.lastUpdated
  };
}

/**
 * Clear calibration statistics
 * @param {string} [modelId] - Model identifier (clears all if not provided)
 */
function clearCalibrationStats(modelId) {
  if (modelId) {
    runtimeCalibrationStats.delete(modelId);
  } else {
    runtimeCalibrationStats.clear();
  }
}

// ============================================================================
// MODEL CALIBRATION STATUS
// ============================================================================

/**
 * Get full calibration status for a model
 * @param {string} modelId - Model identifier
 * @returns {Object} Calibration status
 */
function getModelCalibrationStatus(modelId) {
  const modelCalib = MODEL_CALIBRATION[modelId];
  const runtimeStats = getCalibrationStats(modelId);

  if (!modelCalib) {
    return {
      modelId,
      configured: false,
      runtimeStats,
      recommendations: ['No calibration configuration available for this model']
    };
  }

  const recommendations = [];

  if (runtimeStats.hasData) {
    if (runtimeStats.ece > CALIBRATION_THRESHOLDS.SLIGHTLY_MISCALIBRATED) {
      recommendations.push('Runtime ECE exceeds threshold - consider recalibration');
    }
  } else {
    recommendations.push('Insufficient runtime data for calibration assessment');
  }

  return {
    modelId,
    configured: true,
    
    configuration: {
      version: modelCalib.version,
      lastCalibrated: modelCalib.lastCalibrated,
      temperatureScaling: modelCalib.temperatureScaling,
      biasCorrection: modelCalib.biasCorrection,
      description: modelCalib.description
    },

    runtimeStats,
    
    thresholds: {
      wellCalibrated: CALIBRATION_THRESHOLDS.WELL_CALIBRATED,
      slightlyMiscalibrated: CALIBRATION_THRESHOLDS.SLIGHTLY_MISCALIBRATED,
      maxOverconfidence: CALIBRATION_THRESHOLDS.MAX_ALLOWED_OVERCONFIDENCE
    },

    recommendations
  };
}

/**
 * Full calibration analysis
 * @param {string} modelId - Model identifier
 * @param {Array} [recentPredictions] - Recent predictions to analyze
 * @returns {Object} Complete analysis
 */
function analyze(modelId, recentPredictions = null) {
  const status = getModelCalibrationStatus(modelId);
  
  let analysisResult = null;
  if (recentPredictions && recentPredictions.length > 0) {
    analysisResult = calculateECE(recentPredictions);
  }

  return {
    timestamp: new Date().toISOString(),
    modelId,
    ...status,
    analysisResult,
    
    calibrationBuckets: MODEL_CALIBRATION[modelId]?.buckets || DEFAULT_CALIBRATION_BUCKETS
  };
}

// ============================================================================
// BATCH CALIBRATION
// ============================================================================

/**
 * Calibrate multiple confidence values
 * @param {Array<{confidence: number, context?: Object}>} items - Items to calibrate
 * @param {string} modelId - Model identifier
 * @returns {Object[]} Calibrated results
 */
function calibrateBatch(items, modelId) {
  return items.map(item => ({
    ...calibrateConfidence(item.confidence, modelId, item.context || {}),
    originalItem: item
  }));
}

/**
 * Get available model configurations
 * @returns {Object} Available models summary
 */
function getAvailableModels() {
  const available = {};
  
  for (const [modelId, config] of Object.entries(MODEL_CALIBRATION)) {
    available[modelId] = {
      version: config.version,
      lastCalibrated: config.lastCalibrated,
      temperatureScaling: config.temperatureScaling,
      description: config.description
    };
  }

  return available;
}

// ============================================================================
// RELIABILITY SCORE
// ============================================================================

/**
 * Calculate reliability score combining confidence and calibration
 * @param {number} confidence - Calibrated confidence
 * @param {string} modelId - Model identifier
 * @param {Object} [context] - Additional context
 * @returns {Object} Reliability assessment
 */
function calculateReliabilityScore(confidence, modelId, context = {}) {
  const calibResult = calibrateConfidence(confidence, modelId, context);
  const modelStatus = getModelCalibrationStatus(modelId);

  // Start with calibrated confidence
  let reliability = calibResult.calibrated;

  // Adjust based on calibration quality
  if (calibResult.status === CalibrationStatus.SEVERELY_MISCALIBRATED) {
    reliability *= 0.7;
  } else if (calibResult.status === CalibrationStatus.MISCALIBRATED) {
    reliability *= 0.85;
  } else if (calibResult.status === CalibrationStatus.SLIGHTLY_MISCALIBRATED) {
    reliability *= 0.95;
  }

  // Apply drift adjustment if provided
  if (context.driftReduction) {
    reliability -= context.driftReduction;
  }

  // Ensure within bounds
  reliability = Math.max(CALIBRATION_THRESHOLDS.MIN_CONFIDENCE_FLOOR, 
                         Math.min(CALIBRATION_THRESHOLDS.MAX_CONFIDENCE_CEILING, reliability));

  return {
    reliability: Math.round(reliability * 1000) / 1000,
    calibratedConfidence: calibResult.calibrated,
    originalConfidence: confidence,
    calibrationStatus: calibResult.status,
    modelConfigured: modelStatus.configured,
    factors: {
      calibrationAdjustment: calibResult.adjustment,
      calibrationPenalty: calibResult.status !== CalibrationStatus.WELL_CALIBRATED,
      driftReduction: context.driftReduction || 0
    }
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Enums
  CalibrationStatus,

  // Constants
  CALIBRATION_THRESHOLDS,
  DEFAULT_CALIBRATION_BUCKETS,
  MODEL_CALIBRATION,

  // Core functions
  getBucket,
  applyTemperatureScaling,
  softmax,
  clipConfidence,
  calculateSingleCalibrationError,
  calculateECE,
  getCalibrationStatus,

  // Main calibration
  calibrateConfidence,
  quickCheck,

  // Stats tracking
  updateCalibrationStats,
  getCalibrationStats,
  clearCalibrationStats,

  // Model status
  getModelCalibrationStatus,
  analyze,
  getAvailableModels,

  // Batch operations
  calibrateBatch,

  // Reliability
  calculateReliabilityScore
};
