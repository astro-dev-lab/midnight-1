/**
 * Signal Drift Detector
 * 
 * Detects when incoming audio signals diverge significantly from the 
 * training distribution of ML models. Out-of-distribution (OOD) inputs
 * produce unreliable predictions that should be flagged.
 * 
 * Per STUDIOOS_ML_INVESTMENT_CHARTER.md:
 * - ML outputs must be explainable
 * - ML limitations must be disclosed
 * - OOD inputs should reduce confidence
 * 
 * @version 1.0.0
 */

// ============================================================================
// DRIFT STATUS
// ============================================================================

const DriftStatus = Object.freeze({
  IN_DISTRIBUTION: 'IN_DISTRIBUTION',
  MINOR_DRIFT: 'MINOR_DRIFT',
  SIGNIFICANT_DRIFT: 'SIGNIFICANT_DRIFT',
  OUT_OF_DISTRIBUTION: 'OUT_OF_DISTRIBUTION'
});

// ============================================================================
// THRESHOLDS
// ============================================================================

const DRIFT_THRESHOLDS = Object.freeze({
  MINOR: 1.5,
  SIGNIFICANT: 2.5,
  OOD: 4.0
});

const CONFIDENCE_REDUCTION = Object.freeze({
  [DriftStatus.IN_DISTRIBUTION]: 0,
  [DriftStatus.MINOR_DRIFT]: 0.05,
  [DriftStatus.SIGNIFICANT_DRIFT]: 0.15,
  [DriftStatus.OUT_OF_DISTRIBUTION]: 0.30
});

// ============================================================================
// TRAINING DISTRIBUTION PROFILES
// ============================================================================

/**
 * Training distribution statistics per model.
 * These represent the expected ranges for signals the model was trained on.
 * Values outside these ranges indicate potential OOD inputs.
 */
const TRAINING_DISTRIBUTIONS = Object.freeze({
  subgenre_v2: {
    version: '2.0.0',
    trainingSize: 10000,
    expectedGenres: ['rap', 'hiphop', 'trap', 'drill', 'lofi', 'boom_bap', 'cloud', 'melodic', 'aggressive', 'experimental'],
    signals: {
      bpm: { mean: 125, std: 25, min: 60, max: 200, weight: 1.0 },
      subBassEnergy: { mean: 0.55, std: 0.18, min: 0, max: 1, weight: 1.2 },
      transientDensity: { mean: 0.55, std: 0.20, min: 0, max: 1, weight: 1.0 },
      transientSharpness: { mean: 0.5, std: 0.22, min: 0, max: 1, weight: 0.8 },
      dynamicRange: { mean: 7, std: 3.5, min: 0, max: 20, weight: 1.0 },
      stereoWidth: { mean: 0.55, std: 0.18, min: 0, max: 1, weight: 0.7 },
      integratedLoudness: { mean: -14, std: 4, min: -60, max: 0, weight: 1.0 },
      truePeak: { mean: -1, std: 2, min: -60, max: 3, weight: 0.8 },
      crestFactor: { mean: 8, std: 4, min: 1, max: 25, weight: 0.9 },
      temporalDensity: { mean: 0.6, std: 0.2, min: 0, max: 1, weight: 0.8 }
    }
  },
  
  loudness_analysis: {
    version: '1.0.0',
    trainingSize: 5000,
    signals: {
      integratedLoudness: { mean: -14, std: 6, min: -60, max: 0, weight: 1.5 },
      truePeak: { mean: -1, std: 3, min: -60, max: 3, weight: 1.2 },
      loudnessRange: { mean: 8, std: 4, min: 0, max: 30, weight: 1.0 },
      shortTermMax: { mean: -10, std: 5, min: -60, max: 0, weight: 0.8 }
    }
  },

  transient_analysis: {
    version: '1.0.0',
    trainingSize: 5000,
    signals: {
      transientDensity: { mean: 0.5, std: 0.25, min: 0, max: 1, weight: 1.2 },
      transientSharpness: { mean: 0.5, std: 0.25, min: 0, max: 1, weight: 1.2 },
      attackTime: { mean: 20, std: 15, min: 0, max: 100, weight: 0.9 },
      releaseTime: { mean: 100, std: 60, min: 0, max: 500, weight: 0.7 }
    }
  }
});

// ============================================================================
// OUT-OF-DISTRIBUTION INDICATORS
// ============================================================================

/**
 * Hard indicators that strongly suggest OOD input
 * regardless of statistical measures
 */
const OOD_INDICATORS = Object.freeze({
  SILENCE: {
    id: 'SILENCE',
    description: 'Audio is effectively silent',
    check: (signals) => {
      const loudness = signals.integratedLoudness ?? signals.rmsLevel;
      return loudness !== undefined && loudness < -55;
    },
    severity: 'critical'
  },
  
  NOISE_ONLY: {
    id: 'NOISE_ONLY',
    description: 'Audio appears to be pure noise',
    check: (signals) => {
      const crest = signals.crestFactor;
      return crest !== undefined && crest < 2;
    },
    severity: 'critical'
  },
  
  EXTREME_DURATION: {
    id: 'EXTREME_DURATION',
    description: 'Duration outside expected range',
    check: (signals) => {
      const duration = signals.duration;
      return duration !== undefined && (duration < 5 || duration > 1800);
    },
    severity: 'high'
  },
  
  MONO_SUM_CANCELLATION: {
    id: 'MONO_SUM_CANCELLATION',
    description: 'Channels cancel when summed to mono',
    check: (signals) => {
      const correlation = signals.phaseCorrelation ?? signals.stereoCorrelation;
      return correlation !== undefined && correlation < -0.8;
    },
    severity: 'high'
  },
  
  CLIPPED_AUDIO: {
    id: 'CLIPPED_AUDIO',
    description: 'Severe digital clipping detected',
    check: (signals) => {
      const peak = signals.truePeak ?? signals.peakLevel;
      return peak !== undefined && peak > 0;
    },
    severity: 'medium'
  },
  
  DC_OFFSET: {
    id: 'DC_OFFSET',
    description: 'Significant DC offset present',
    check: (signals) => {
      const dcOffset = signals.dcOffset ?? signals.dcBias;
      return dcOffset !== undefined && Math.abs(dcOffset) > 0.1;
    },
    severity: 'medium'
  },
  
  EXTREME_BPM: {
    id: 'EXTREME_BPM',
    description: 'BPM outside expected range for music',
    check: (signals) => {
      const bpm = signals.bpm;
      return bpm !== undefined && (bpm < 40 || bpm > 250);
    },
    severity: 'medium'
  },
  
  INVALID_SAMPLE_RATE: {
    id: 'INVALID_SAMPLE_RATE',
    description: 'Non-standard sample rate',
    check: (signals) => {
      const sr = signals.sampleRate;
      const validRates = [44100, 48000, 88200, 96000, 176400, 192000];
      return sr !== undefined && !validRates.includes(sr);
    },
    severity: 'low'
  }
});

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Calculate z-score (standard deviations from mean)
 * @param {number} value - Observed value
 * @param {number} mean - Distribution mean
 * @param {number} std - Distribution standard deviation
 * @returns {number} Z-score
 */
function calculateZScore(value, mean, std) {
  if (std === 0) {
    return value === mean ? 0 : Infinity;
  }
  return Math.abs(value - mean) / std;
}

/**
 * Calculate Mahalanobis-like distance for a single signal
 * (simplified: uses z-score with weight)
 * @param {number} value - Observed value
 * @param {Object} distribution - Signal distribution {mean, std, weight}
 * @returns {number} Weighted distance
 */
function calculateSignalDistance(value, distribution) {
  const zScore = calculateZScore(value, distribution.mean, distribution.std);
  return zScore * (distribution.weight || 1.0);
}

/**
 * Determine drift status from z-score
 * @param {number} zScore - Z-score value
 * @returns {string} DriftStatus
 */
function getDriftStatusFromZScore(zScore) {
  if (zScore >= DRIFT_THRESHOLDS.OOD) {
    return DriftStatus.OUT_OF_DISTRIBUTION;
  }
  if (zScore >= DRIFT_THRESHOLDS.SIGNIFICANT) {
    return DriftStatus.SIGNIFICANT_DRIFT;
  }
  if (zScore >= DRIFT_THRESHOLDS.MINOR) {
    return DriftStatus.MINOR_DRIFT;
  }
  return DriftStatus.IN_DISTRIBUTION;
}

/**
 * Check if a value is within hard bounds
 * @param {number} value - Observed value
 * @param {Object} distribution - Signal distribution {min, max}
 * @returns {Object} {inBounds, violation}
 */
function checkBounds(value, distribution) {
  if (value < distribution.min) {
    return {
      inBounds: false,
      violation: 'below_minimum',
      expected: `>= ${distribution.min}`,
      actual: value
    };
  }
  if (value > distribution.max) {
    return {
      inBounds: false,
      violation: 'above_maximum',
      expected: `<= ${distribution.max}`,
      actual: value
    };
  }
  return { inBounds: true };
}

/**
 * Check all hard OOD indicators
 * @param {Object} signals - Signal values
 * @returns {Object} {isOOD, indicators}
 */
function checkOODIndicators(signals) {
  const triggered = [];
  
  for (const [id, indicator] of Object.entries(OOD_INDICATORS)) {
    try {
      if (indicator.check(signals)) {
        triggered.push({
          id: indicator.id,
          description: indicator.description,
          severity: indicator.severity
        });
      }
    } catch (e) {
      // Indicator check failed, skip
    }
  }

  // Critical indicators immediately mark as OOD
  const hasCritical = triggered.some(t => t.severity === 'critical');
  const hasHigh = triggered.filter(t => t.severity === 'high').length >= 2;

  return {
    isOOD: hasCritical || hasHigh,
    indicators: triggered,
    criticalCount: triggered.filter(t => t.severity === 'critical').length,
    highCount: triggered.filter(t => t.severity === 'high').length
  };
}

/**
 * Get training distribution for a model
 * @param {string} modelId - Model identifier
 * @returns {Object|null} Training distribution or null
 */
function getTrainingDistribution(modelId) {
  return TRAINING_DISTRIBUTIONS[modelId] || null;
}

/**
 * Analyze individual signal drift
 * @param {string} signalName - Name of the signal
 * @param {number} value - Observed value
 * @param {Object} distribution - Expected distribution
 * @returns {Object} Signal analysis
 */
function analyzeSignal(signalName, value, distribution) {
  const zScore = calculateZScore(value, distribution.mean, distribution.std);
  const status = getDriftStatusFromZScore(zScore);
  const bounds = checkBounds(value, distribution);
  const distance = calculateSignalDistance(value, distribution);

  return {
    signal: signalName,
    value,
    expected: {
      mean: distribution.mean,
      std: distribution.std,
      min: distribution.min,
      max: distribution.max
    },
    zScore: Math.round(zScore * 100) / 100,
    distance: Math.round(distance * 100) / 100,
    status,
    inBounds: bounds.inBounds,
    violation: bounds.violation || null
  };
}

// ============================================================================
// MAIN DETECTION FUNCTIONS
// ============================================================================

/**
 * Detect signal drift for a model
 * @param {Object} signals - Input signal values
 * @param {string} modelId - Model identifier
 * @returns {Object} Drift analysis
 */
function detectDrift(signals, modelId) {
  const distribution = getTrainingDistribution(modelId);
  
  if (!distribution) {
    return {
      status: DriftStatus.IN_DISTRIBUTION,
      shouldTrustML: true,
      modelId,
      error: 'No training distribution available for model',
      distances: {},
      aggregateDistance: 0,
      recommendations: ['No drift detection available for this model']
    };
  }

  // Check hard OOD indicators first
  const oodCheck = checkOODIndicators(signals);
  
  if (oodCheck.isOOD) {
    return {
      status: DriftStatus.OUT_OF_DISTRIBUTION,
      shouldTrustML: false,
      modelId,
      oodIndicators: oodCheck.indicators,
      confidenceReduction: CONFIDENCE_REDUCTION[DriftStatus.OUT_OF_DISTRIBUTION],
      distances: {},
      aggregateDistance: Infinity,
      violations: [],
      summary: {
        signalsAnalyzed: 0,
        signalsInDistribution: 0,
        signalsWithDrift: 0,
        boundViolations: 0
      },
      recommendations: [
        'Hard OOD indicators detected',
        'ML predictions should not be trusted',
        'Consider manual classification'
      ]
    };
  }

  // Analyze each signal
  const signalAnalyses = {};
  const distances = [];
  const violations = [];

  for (const [signalName, signalDist] of Object.entries(distribution.signals)) {
    const value = signals[signalName];
    
    if (value === undefined || value === null) {
      continue; // Skip missing signals
    }

    const analysis = analyzeSignal(signalName, value, signalDist);
    signalAnalyses[signalName] = analysis;
    distances.push(analysis.distance);

    if (!analysis.inBounds) {
      violations.push({
        signal: signalName,
        violation: analysis.violation,
        value: analysis.value,
        expected: analysis.expected
      });
    }
  }

  // Calculate aggregate distance (RMS of weighted distances)
  const aggregateDistance = distances.length > 0
    ? Math.sqrt(distances.reduce((sum, d) => sum + d * d, 0) / distances.length)
    : 0;

  // Determine overall status
  const overallStatus = getOverallDriftStatus(signalAnalyses, aggregateDistance, violations);
  const shouldTrustML = overallStatus !== DriftStatus.OUT_OF_DISTRIBUTION;
  const confidenceReduction = CONFIDENCE_REDUCTION[overallStatus];

  // Build recommendations
  const recommendations = buildDriftRecommendations(overallStatus, violations, signalAnalyses);

  return {
    status: overallStatus,
    shouldTrustML,
    confidenceReduction,
    modelId,
    trainingVersion: distribution.version,
    
    distances: signalAnalyses,
    aggregateDistance: Math.round(aggregateDistance * 100) / 100,
    
    violations,
    oodIndicators: oodCheck.indicators,
    
    summary: {
      signalsAnalyzed: Object.keys(signalAnalyses).length,
      signalsInDistribution: Object.values(signalAnalyses).filter(
        a => a.status === DriftStatus.IN_DISTRIBUTION
      ).length,
      signalsWithDrift: Object.values(signalAnalyses).filter(
        a => a.status !== DriftStatus.IN_DISTRIBUTION
      ).length,
      boundViolations: violations.length
    },
    
    recommendations
  };
}

/**
 * Determine overall drift status from signal analyses
 * @param {Object} signalAnalyses - Per-signal analyses
 * @param {number} aggregateDistance - RMS distance
 * @param {Array} violations - Bound violations
 * @returns {string} DriftStatus
 */
function getOverallDriftStatus(signalAnalyses, aggregateDistance, violations) {
  // Multiple bound violations = OOD
  if (violations.length >= 3) {
    return DriftStatus.OUT_OF_DISTRIBUTION;
  }

  // High aggregate distance = OOD
  if (aggregateDistance >= DRIFT_THRESHOLDS.OOD) {
    return DriftStatus.OUT_OF_DISTRIBUTION;
  }

  // Count signals by status
  const statusCounts = {
    [DriftStatus.OUT_OF_DISTRIBUTION]: 0,
    [DriftStatus.SIGNIFICANT_DRIFT]: 0,
    [DriftStatus.MINOR_DRIFT]: 0,
    [DriftStatus.IN_DISTRIBUTION]: 0
  };

  for (const analysis of Object.values(signalAnalyses)) {
    statusCounts[analysis.status]++;
  }

  // Any OOD signal = significant overall
  if (statusCounts[DriftStatus.OUT_OF_DISTRIBUTION] > 0) {
    return DriftStatus.SIGNIFICANT_DRIFT;
  }

  // Multiple significant drifts = significant overall
  if (statusCounts[DriftStatus.SIGNIFICANT_DRIFT] >= 2) {
    return DriftStatus.SIGNIFICANT_DRIFT;
  }

  // Any significant or multiple minor = minor overall
  if (statusCounts[DriftStatus.SIGNIFICANT_DRIFT] > 0 || 
      statusCounts[DriftStatus.MINOR_DRIFT] >= 3) {
    return DriftStatus.MINOR_DRIFT;
  }

  // Few minor drifts = minor overall
  if (statusCounts[DriftStatus.MINOR_DRIFT] > 0) {
    return DriftStatus.MINOR_DRIFT;
  }

  return DriftStatus.IN_DISTRIBUTION;
}

/**
 * Build recommendations based on drift analysis
 * @param {string} status - Overall drift status
 * @param {Array} violations - Bound violations
 * @param {Object} signalAnalyses - Per-signal analyses
 * @returns {string[]} Recommendations
 */
function buildDriftRecommendations(status, violations, signalAnalyses) {
  const recommendations = [];

  switch (status) {
    case DriftStatus.OUT_OF_DISTRIBUTION:
      recommendations.push('Input significantly differs from training data');
      recommendations.push('Consider manual classification');
      recommendations.push('ML confidence has been reduced by 30%');
      break;
    case DriftStatus.SIGNIFICANT_DRIFT:
      recommendations.push('Some signals outside expected ranges');
      recommendations.push('ML predictions may be less reliable');
      recommendations.push('ML confidence has been reduced by 15%');
      break;
    case DriftStatus.MINOR_DRIFT:
      recommendations.push('Minor signal drift detected');
      recommendations.push('ML predictions should still be reasonable');
      break;
    case DriftStatus.IN_DISTRIBUTION:
      recommendations.push('Input within expected distribution');
      break;
  }

  // Add specific signal recommendations
  for (const violation of violations.slice(0, 3)) {
    recommendations.push(`${violation.signal}: ${violation.violation} (${violation.value})`);
  }

  return recommendations;
}

// ============================================================================
// QUICK CHECK & ANALYSIS
// ============================================================================

/**
 * Quick drift check for a model
 * @param {Object} signals - Input signal values
 * @param {string} modelId - Model identifier
 * @returns {Object} Quick check result
 */
function quickCheck(signals, modelId) {
  // Check hard OOD indicators only
  const oodCheck = checkOODIndicators(signals);
  
  if (oodCheck.isOOD) {
    return {
      status: DriftStatus.OUT_OF_DISTRIBUTION,
      shouldTrustML: false,
      hasOODIndicators: true,
      indicatorCount: oodCheck.indicators.length
    };
  }

  // Quick aggregate check
  const distribution = getTrainingDistribution(modelId);
  
  if (!distribution) {
    return {
      status: DriftStatus.IN_DISTRIBUTION,
      shouldTrustML: true,
      noDistributionAvailable: true
    };
  }

  let maxZScore = 0;
  let signalsChecked = 0;

  for (const [signalName, signalDist] of Object.entries(distribution.signals)) {
    const value = signals[signalName];
    if (value === undefined || value === null) continue;

    const zScore = calculateZScore(value, signalDist.mean, signalDist.std);
    maxZScore = Math.max(maxZScore, zScore);
    signalsChecked++;
  }

  const status = getDriftStatusFromZScore(maxZScore);

  return {
    status,
    shouldTrustML: status !== DriftStatus.OUT_OF_DISTRIBUTION,
    maxZScore: Math.round(maxZScore * 100) / 100,
    signalsChecked,
    hasOODIndicators: oodCheck.indicators.length > 0
  };
}

/**
 * Full drift analysis for a model
 * @param {Object} signals - Input signal values
 * @param {string} modelId - Model identifier
 * @returns {Object} Complete analysis
 */
function analyze(signals, modelId) {
  const driftResult = detectDrift(signals, modelId);
  const distribution = getTrainingDistribution(modelId);

  return {
    timestamp: new Date().toISOString(),
    modelId,
    
    ...driftResult,
    
    distribution: distribution ? {
      version: distribution.version,
      trainingSize: distribution.trainingSize,
      signalCount: Object.keys(distribution.signals).length,
      expectedGenres: distribution.expectedGenres
    } : null,
    
    thresholds: DRIFT_THRESHOLDS,
    confidenceReductions: CONFIDENCE_REDUCTION
  };
}

/**
 * Check multiple models at once
 * @param {Object} signals - Input signal values
 * @param {string[]} modelIds - Model identifiers to check
 * @returns {Object} Results keyed by modelId
 */
function checkMultipleModels(signals, modelIds) {
  const results = {};
  
  for (const modelId of modelIds) {
    results[modelId] = quickCheck(signals, modelId);
  }

  // Overall assessment
  const worstStatus = Object.values(results).reduce((worst, r) => {
    const statusOrder = [
      DriftStatus.IN_DISTRIBUTION,
      DriftStatus.MINOR_DRIFT,
      DriftStatus.SIGNIFICANT_DRIFT,
      DriftStatus.OUT_OF_DISTRIBUTION
    ];
    const currentIndex = statusOrder.indexOf(r.status);
    const worstIndex = statusOrder.indexOf(worst);
    return currentIndex > worstIndex ? r.status : worst;
  }, DriftStatus.IN_DISTRIBUTION);

  return {
    byModel: results,
    overallStatus: worstStatus,
    shouldTrustAnyML: !Object.values(results).every(
      r => r.status === DriftStatus.OUT_OF_DISTRIBUTION
    )
  };
}

/**
 * Apply confidence reduction based on drift
 * @param {number} confidence - Original confidence
 * @param {string} driftStatus - Drift status
 * @returns {Object} {adjusted, reduction, original}
 */
function applyConfidenceReduction(confidence, driftStatus) {
  const reduction = CONFIDENCE_REDUCTION[driftStatus] || 0;
  const adjusted = Math.max(0, confidence - reduction);
  
  return {
    original: confidence,
    adjusted: Math.round(adjusted * 100) / 100,
    reduction,
    driftStatus,
    wasReduced: reduction > 0
  };
}

/**
 * Get available training distributions
 * @returns {Object} Available distributions summary
 */
function getAvailableDistributions() {
  const available = {};
  
  for (const [modelId, dist] of Object.entries(TRAINING_DISTRIBUTIONS)) {
    available[modelId] = {
      version: dist.version,
      trainingSize: dist.trainingSize,
      signalCount: Object.keys(dist.signals).length,
      signals: Object.keys(dist.signals)
    };
  }

  return available;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Enums
  DriftStatus,
  
  // Constants
  DRIFT_THRESHOLDS,
  CONFIDENCE_REDUCTION,
  TRAINING_DISTRIBUTIONS,
  OOD_INDICATORS,

  // Core calculations
  calculateZScore,
  calculateSignalDistance,
  getDriftStatusFromZScore,
  checkBounds,
  checkOODIndicators,

  // Distribution access
  getTrainingDistribution,
  getAvailableDistributions,

  // Signal analysis
  analyzeSignal,

  // Main detection
  detectDrift,
  getOverallDriftStatus,

  // Quick check & analysis
  quickCheck,
  analyze,
  checkMultipleModels,

  // Confidence adjustment
  applyConfidenceReduction
};
