/**
 * Cross-Signal Consistency Checker
 * 
 * Detects when multiple ML models or signal analyzers produce contradictory
 * conclusions that cannot both be true. Such contradictions indicate at least
 * one analysis is wrong.
 * 
 * Per STUDIOOS_ML_INVESTMENT_CHARTER.md:
 * - ML outputs must be explainable
 * - ML limitations must be disclosed
 * - Contradictory outputs reduce confidence
 * 
 * @version 1.0.0
 */

// ============================================================================
// CONSISTENCY STATUS
// ============================================================================

const ConsistencyStatus = Object.freeze({
  CONSISTENT: 'CONSISTENT',
  MINOR_INCONSISTENCY: 'MINOR_INCONSISTENCY',
  INCONSISTENT: 'INCONSISTENT',
  CONTRADICTORY: 'CONTRADICTORY'
});

const ConsistencySeverity = Object.freeze({
  NONE: 'NONE',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
});

// ============================================================================
// CONFIDENCE REDUCTION
// ============================================================================

const CONSISTENCY_CONFIDENCE_REDUCTION = Object.freeze({
  [ConsistencyStatus.CONSISTENT]: 0,
  [ConsistencyStatus.MINOR_INCONSISTENCY]: 0.05,
  [ConsistencyStatus.INCONSISTENT]: 0.15,
  [ConsistencyStatus.CONTRADICTORY]: 0.30
});

const SEVERITY_WEIGHTS = Object.freeze({
  [ConsistencySeverity.NONE]: 0,
  [ConsistencySeverity.LOW]: 1,
  [ConsistencySeverity.MEDIUM]: 2,
  [ConsistencySeverity.HIGH]: 3,
  [ConsistencySeverity.CRITICAL]: 5
});

// ============================================================================
// CONSISTENCY RULES
// ============================================================================

/**
 * Consistency rules define pairs/groups of signals that must logically agree.
 * Each rule has:
 * - id: Unique identifier
 * - description: Human-readable description
 * - signals: Array of signal names required for the check
 * - check: Function that returns { consistent, severity, message }
 */
const CONSISTENCY_RULES = [
  {
    id: 'LOFI_TRANSIENT',
    description: 'Lo-fi subgenre should have soft transients',
    signals: ['subgenre', 'transientSharpness'],
    check: (signals) => {
      const { subgenre, transientSharpness } = signals;
      if (subgenre === 'lofi' && transientSharpness > 0.65) {
        return {
          consistent: false,
          severity: ConsistencySeverity.MEDIUM,
          message: 'Lo-fi classification but transients are sharp',
          expected: 'transientSharpness <= 0.65 for lo-fi',
          actual: `transientSharpness = ${transientSharpness}`
        };
      }
      return { consistent: true, severity: ConsistencySeverity.NONE };
    }
  },

  {
    id: 'DRILL_BASS',
    description: 'Drill subgenre should have high sub-bass energy',
    signals: ['subgenre', 'subBassEnergy'],
    check: (signals) => {
      const { subgenre, subBassEnergy } = signals;
      if (subgenre === 'drill' && subBassEnergy < 0.4) {
        return {
          consistent: false,
          severity: ConsistencySeverity.LOW,
          message: 'Drill classification but sub-bass is low',
          expected: 'subBassEnergy >= 0.4 for drill',
          actual: `subBassEnergy = ${subBassEnergy}`
        };
      }
      return { consistent: true, severity: ConsistencySeverity.NONE };
    }
  },

  {
    id: 'TRAP_BPM',
    description: 'Trap subgenre should have characteristic BPM range',
    signals: ['subgenre', 'bpm'],
    check: (signals) => {
      const { subgenre, bpm } = signals;
      // Trap is typically 130-170 BPM (or half-time at 65-85)
      if (subgenre === 'trap' && (bpm < 60 || bpm > 180)) {
        return {
          consistent: false,
          severity: ConsistencySeverity.LOW,
          message: 'Trap classification but BPM outside typical range',
          expected: 'BPM 60-180 for trap',
          actual: `bpm = ${bpm}`
        };
      }
      return { consistent: true, severity: ConsistencySeverity.NONE };
    }
  },

  {
    id: 'DYNAMIC_COMPRESSION',
    description: 'Dynamic range and crest factor must correlate',
    signals: ['dynamicRange', 'crestFactor'],
    check: (signals) => {
      const { dynamicRange, crestFactor } = signals;
      // Low dynamic range + high crest factor is physically inconsistent
      if (dynamicRange < 4 && crestFactor > 15) {
        return {
          consistent: false,
          severity: ConsistencySeverity.HIGH,
          message: 'Low dynamic range with high crest factor is physically inconsistent',
          expected: 'Correlated dynamic range and crest factor',
          actual: `dynamicRange = ${dynamicRange}, crestFactor = ${crestFactor}`
        };
      }
      return { consistent: true, severity: ConsistencySeverity.NONE };
    }
  },

  {
    id: 'LOUDNESS_PEAK',
    description: 'True peak cannot be lower than integrated loudness',
    signals: ['integratedLoudness', 'truePeak'],
    check: (signals) => {
      const { integratedLoudness, truePeak } = signals;
      // Peak must be >= loudness (less negative)
      if (truePeak < integratedLoudness) {
        return {
          consistent: false,
          severity: ConsistencySeverity.CRITICAL,
          message: 'True peak is lower than integrated loudness (physically impossible)',
          expected: 'truePeak >= integratedLoudness',
          actual: `truePeak = ${truePeak}, integratedLoudness = ${integratedLoudness}`
        };
      }
      return { consistent: true, severity: ConsistencySeverity.NONE };
    }
  },

  {
    id: 'BPM_TRANSIENT_DENSITY',
    description: 'High BPM should correlate with transient presence',
    signals: ['bpm', 'transientDensity'],
    check: (signals) => {
      const { bpm, transientDensity } = signals;
      // Very high BPM with virtually no transients is suspicious
      if (bpm > 160 && transientDensity < 0.15) {
        return {
          consistent: false,
          severity: ConsistencySeverity.LOW,
          message: 'High BPM but very low transient density',
          expected: 'transientDensity > 0.15 for high BPM',
          actual: `bpm = ${bpm}, transientDensity = ${transientDensity}`
        };
      }
      return { consistent: true, severity: ConsistencySeverity.NONE };
    }
  },

  {
    id: 'STEREO_MONO_TOPOLOGY',
    description: 'Stereo width must agree with channel topology',
    signals: ['stereoWidth', 'channelTopology'],
    check: (signals) => {
      const { stereoWidth, channelTopology } = signals;
      // Dual mono should have near-zero stereo width
      if (channelTopology === 'DUAL_MONO' && stereoWidth > 0.1) {
        return {
          consistent: false,
          severity: ConsistencySeverity.MEDIUM,
          message: 'Dual mono detected but stereo width is significant',
          expected: 'stereoWidth <= 0.1 for dual mono',
          actual: `stereoWidth = ${stereoWidth}`
        };
      }
      // True stereo should have non-zero width
      if (channelTopology === 'TRUE_STEREO' && stereoWidth < 0.05) {
        return {
          consistent: false,
          severity: ConsistencySeverity.LOW,
          message: 'True stereo but stereo width is nearly zero',
          expected: 'stereoWidth > 0.05 for true stereo',
          actual: `stereoWidth = ${stereoWidth}`
        };
      }
      return { consistent: true, severity: ConsistencySeverity.NONE };
    }
  },

  {
    id: 'CLASSIFICATION_CONFIDENCE_HYBRID',
    description: 'High classification confidence excludes hybrid status',
    signals: ['subgenreConfidence', 'isHybrid'],
    check: (signals) => {
      const { subgenreConfidence, isHybrid } = signals;
      // High confidence single classification shouldn't be hybrid
      if (subgenreConfidence > 0.85 && isHybrid === true) {
        return {
          consistent: false,
          severity: ConsistencySeverity.MEDIUM,
          message: 'High subgenre confidence but marked as hybrid',
          expected: 'Either lower confidence or not hybrid',
          actual: `subgenreConfidence = ${subgenreConfidence}, isHybrid = true`
        };
      }
      return { consistent: true, severity: ConsistencySeverity.NONE };
    }
  },

  {
    id: 'SAMPLE_RATE_FREQUENCY_CONTENT',
    description: 'High frequency content requires adequate sample rate',
    signals: ['sampleRate', 'highFrequencyPresence'],
    check: (signals) => {
      const { sampleRate, highFrequencyPresence } = signals;
      // High frequency content above 20kHz requires 48kHz+ sample rate
      if (sampleRate === 44100 && highFrequencyPresence > 0.8) {
        return {
          consistent: false,
          severity: ConsistencySeverity.LOW,
          message: 'High frequency presence detected but sample rate limits bandwidth',
          expected: 'Either higher sample rate or lower high frequency presence',
          actual: `sampleRate = ${sampleRate}, highFrequencyPresence = ${highFrequencyPresence}`
        };
      }
      return { consistent: true, severity: ConsistencySeverity.NONE };
    }
  },

  {
    id: 'CLIPPING_PEAK',
    description: 'Clipping detection must agree with true peak',
    signals: ['hasClipping', 'truePeak'],
    check: (signals) => {
      const { hasClipping, truePeak } = signals;
      // If true peak is well below 0dBFS, clipping should be false
      if (hasClipping === true && truePeak < -3) {
        return {
          consistent: false,
          severity: ConsistencySeverity.HIGH,
          message: 'Clipping detected but true peak is below -3dBFS',
          expected: 'truePeak >= -3 if clipping is present',
          actual: `hasClipping = true, truePeak = ${truePeak}`
        };
      }
      // If true peak is above 0, clipping should be true
      if (hasClipping === false && truePeak > 0) {
        return {
          consistent: false,
          severity: ConsistencySeverity.HIGH,
          message: 'No clipping detected but true peak exceeds 0dBFS',
          expected: 'hasClipping = true when truePeak > 0',
          actual: `hasClipping = false, truePeak = ${truePeak}`
        };
      }
      return { consistent: true, severity: ConsistencySeverity.NONE };
    }
  },

  {
    id: 'DC_OFFSET_PHASE',
    description: 'DC offset should correlate with low frequency issues',
    signals: ['dcOffset', 'phaseCorrelation'],
    check: (signals) => {
      const { dcOffset, phaseCorrelation } = signals;
      // Severe DC offset with perfect phase correlation is suspicious
      if (Math.abs(dcOffset) > 0.2 && phaseCorrelation > 0.95) {
        return {
          consistent: false,
          severity: ConsistencySeverity.MEDIUM,
          message: 'Severe DC offset but perfect phase correlation',
          expected: 'DC offset typically affects phase correlation',
          actual: `dcOffset = ${dcOffset}, phaseCorrelation = ${phaseCorrelation}`
        };
      }
      return { consistent: true, severity: ConsistencySeverity.NONE };
    }
  },

  {
    id: 'SILENCE_LOUDNESS',
    description: 'Silence detection must agree with loudness measurement',
    signals: ['isSilent', 'integratedLoudness'],
    check: (signals) => {
      const { isSilent, integratedLoudness } = signals;
      // If not silent, loudness should be audible
      if (isSilent === false && integratedLoudness < -50) {
        return {
          consistent: false,
          severity: ConsistencySeverity.MEDIUM,
          message: 'Not marked silent but loudness is very low',
          expected: 'integratedLoudness > -50 if not silent',
          actual: `isSilent = false, integratedLoudness = ${integratedLoudness}`
        };
      }
      // If silent, loudness should be very low
      if (isSilent === true && integratedLoudness > -40) {
        return {
          consistent: false,
          severity: ConsistencySeverity.HIGH,
          message: 'Marked silent but loudness is audible',
          expected: 'integratedLoudness < -40 if silent',
          actual: `isSilent = true, integratedLoudness = ${integratedLoudness}`
        };
      }
      return { consistent: true, severity: ConsistencySeverity.NONE };
    }
  }
];

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Check if all required signals are present
 * @param {Object} signals - Available signals
 * @param {string[]} required - Required signal names
 * @returns {boolean} True if all required signals are present
 */
function hasRequiredSignals(signals, required) {
  return required.every(name => 
    signals[name] !== undefined && signals[name] !== null
  );
}

/**
 * Check a single consistency rule
 * @param {Object} rule - Consistency rule
 * @param {Object} signals - Signal values
 * @returns {Object} Check result
 */
function checkRule(rule, signals) {
  // Check if required signals are present
  if (!hasRequiredSignals(signals, rule.signals)) {
    return {
      ruleId: rule.id,
      checked: false,
      reason: 'missing_signals',
      missingSignals: rule.signals.filter(s => signals[s] === undefined || signals[s] === null)
    };
  }

  try {
    const result = rule.check(signals);
    return {
      ruleId: rule.id,
      checked: true,
      ...result,
      description: rule.description
    };
  } catch (error) {
    return {
      ruleId: rule.id,
      checked: false,
      reason: 'check_error',
      error: error.message
    };
  }
}

/**
 * Get all available consistency rules
 * @returns {Object[]} List of rule definitions
 */
function getAvailableRules() {
  return CONSISTENCY_RULES.map(rule => ({
    id: rule.id,
    description: rule.description,
    signals: rule.signals
  }));
}

/**
 * Get a specific rule by ID
 * @param {string} ruleId - Rule identifier
 * @returns {Object|null} Rule or null
 */
function getRule(ruleId) {
  const rule = CONSISTENCY_RULES.find(r => r.id === ruleId);
  if (!rule) return null;
  return {
    id: rule.id,
    description: rule.description,
    signals: rule.signals
  };
}

// ============================================================================
// MAIN CHECK FUNCTIONS
// ============================================================================

/**
 * Check all consistency rules against signals
 * @param {Object} signals - Signal values
 * @returns {Object} Consistency check result
 */
function checkConsistency(signals) {
  const results = [];
  const violations = [];
  const passed = [];
  const skipped = [];

  for (const rule of CONSISTENCY_RULES) {
    const result = checkRule(rule, signals);
    results.push(result);

    if (!result.checked) {
      skipped.push(result);
    } else if (!result.consistent) {
      violations.push(result);
    } else {
      passed.push(result);
    }
  }

  // Calculate aggregate status
  const aggregateStatus = calculateAggregateStatus(violations);
  const consistencyScore = calculateConsistencyScore(passed.length, violations.length, skipped.length);
  const confidenceReduction = CONSISTENCY_CONFIDENCE_REDUCTION[aggregateStatus];

  return {
    status: aggregateStatus,
    consistencyScore,
    confidenceReduction,

    summary: {
      totalRules: CONSISTENCY_RULES.length,
      checked: passed.length + violations.length,
      passed: passed.length,
      failed: violations.length,
      skipped: skipped.length
    },

    violations,
    passedRules: passed.map(p => p.ruleId),
    skippedRules: skipped.map(s => ({ ruleId: s.ruleId, reason: s.reason })),

    recommendations: buildConsistencyRecommendations(aggregateStatus, violations)
  };
}

/**
 * Calculate aggregate consistency status
 * @param {Object[]} violations - List of violations
 * @returns {string} ConsistencyStatus
 */
function calculateAggregateStatus(violations) {
  if (violations.length === 0) {
    return ConsistencyStatus.CONSISTENT;
  }

  // Calculate weighted severity score
  const severityScore = violations.reduce((sum, v) => {
    return sum + (SEVERITY_WEIGHTS[v.severity] || 0);
  }, 0);

  // Check for critical violations
  const hasCritical = violations.some(v => v.severity === ConsistencySeverity.CRITICAL);
  if (hasCritical) {
    return ConsistencyStatus.CONTRADICTORY;
  }

  // Check for multiple high severity
  const highCount = violations.filter(v => v.severity === ConsistencySeverity.HIGH).length;
  if (highCount >= 2) {
    return ConsistencyStatus.CONTRADICTORY;
  }

  // Check weighted score
  if (severityScore >= 6) {
    return ConsistencyStatus.CONTRADICTORY;
  }
  if (severityScore >= 3) {
    return ConsistencyStatus.INCONSISTENT;
  }
  if (severityScore >= 1) {
    return ConsistencyStatus.MINOR_INCONSISTENCY;
  }

  return ConsistencyStatus.CONSISTENT;
}

/**
 * Calculate consistency score (0-1)
 * @param {number} passed - Number of passed rules
 * @param {number} failed - Number of failed rules
 * @param {number} skipped - Number of skipped rules
 * @returns {number} Consistency score
 */
function calculateConsistencyScore(passed, failed, skipped) {
  const checked = passed + failed;
  if (checked === 0) return 1.0; // No rules checked = assume consistent
  return Math.round((passed / checked) * 100) / 100;
}

/**
 * Build recommendations based on consistency analysis
 * @param {string} status - Consistency status
 * @param {Object[]} violations - List of violations
 * @returns {string[]} Recommendations
 */
function buildConsistencyRecommendations(status, violations) {
  const recommendations = [];

  switch (status) {
    case ConsistencyStatus.CONTRADICTORY:
      recommendations.push('Critical signal contradictions detected');
      recommendations.push('At least one analysis result is incorrect');
      recommendations.push('Manual review strongly recommended');
      recommendations.push('ML confidence reduced by 30%');
      break;
    case ConsistencyStatus.INCONSISTENT:
      recommendations.push('Significant signal inconsistencies found');
      recommendations.push('Results may be unreliable');
      recommendations.push('ML confidence reduced by 15%');
      break;
    case ConsistencyStatus.MINOR_INCONSISTENCY:
      recommendations.push('Minor signal inconsistencies detected');
      recommendations.push('Results should still be usable');
      break;
    case ConsistencyStatus.CONSISTENT:
      recommendations.push('All checked signals are consistent');
      break;
  }

  // Add specific violation recommendations
  for (const violation of violations.slice(0, 3)) {
    recommendations.push(`${violation.ruleId}: ${violation.message}`);
  }

  return recommendations;
}

// ============================================================================
// QUICK CHECK & ANALYSIS
// ============================================================================

/**
 * Quick consistency check
 * @param {Object} signals - Signal values
 * @returns {Object} Quick check result
 */
function quickCheck(signals) {
  const result = checkConsistency(signals);
  
  return {
    consistent: result.status === ConsistencyStatus.CONSISTENT,
    status: result.status,
    violationCount: result.violations.length,
    worstSeverity: result.violations.length > 0
      ? result.violations.reduce((worst, v) => {
          const current = SEVERITY_WEIGHTS[v.severity] || 0;
          const worstWeight = SEVERITY_WEIGHTS[worst] || 0;
          return current > worstWeight ? v.severity : worst;
        }, ConsistencySeverity.NONE)
      : ConsistencySeverity.NONE
  };
}

/**
 * Full consistency analysis
 * @param {Object} signals - Signal values
 * @returns {Object} Complete analysis
 */
function analyze(signals) {
  const result = checkConsistency(signals);

  return {
    timestamp: new Date().toISOString(),
    ...result,
    
    availableRules: CONSISTENCY_RULES.length,
    severityWeights: SEVERITY_WEIGHTS,
    confidenceReductions: CONSISTENCY_CONFIDENCE_REDUCTION
  };
}

/**
 * Check specific rules only
 * @param {Object} signals - Signal values
 * @param {string[]} ruleIds - Rule IDs to check
 * @returns {Object} Check result
 */
function checkSpecificRules(signals, ruleIds) {
  const results = [];
  const violations = [];
  const passed = [];

  for (const ruleId of ruleIds) {
    const rule = CONSISTENCY_RULES.find(r => r.id === ruleId);
    if (!rule) {
      results.push({
        ruleId,
        checked: false,
        reason: 'rule_not_found'
      });
      continue;
    }

    const result = checkRule(rule, signals);
    results.push(result);

    if (result.checked && !result.consistent) {
      violations.push(result);
    } else if (result.checked) {
      passed.push(result);
    }
  }

  const aggregateStatus = calculateAggregateStatus(violations);

  return {
    status: aggregateStatus,
    results,
    violations,
    passedRules: passed.map(p => p.ruleId)
  };
}

/**
 * Get contradictory signal pairs
 * @param {Object} signals - Signal values
 * @returns {Object[]} List of contradictory pairs
 */
function getContradictoryPairs(signals) {
  const result = checkConsistency(signals);
  
  return result.violations
    .filter(v => v.severity === ConsistencySeverity.CRITICAL || v.severity === ConsistencySeverity.HIGH)
    .map(v => ({
      ruleId: v.ruleId,
      signals: CONSISTENCY_RULES.find(r => r.id === v.ruleId)?.signals || [],
      severity: v.severity,
      message: v.message
    }));
}

/**
 * Explain an inconsistency
 * @param {Object} violation - Violation object
 * @returns {Object} Human-readable explanation
 */
function explainInconsistency(violation) {
  const rule = CONSISTENCY_RULES.find(r => r.id === violation.ruleId);
  
  return {
    ruleId: violation.ruleId,
    description: rule?.description || 'Unknown rule',
    issue: violation.message,
    expected: violation.expected,
    actual: violation.actual,
    severity: violation.severity,
    recommendation: getSeverityRecommendation(violation.severity)
  };
}

/**
 * Get recommendation based on severity
 * @param {string} severity - Severity level
 * @returns {string} Recommendation
 */
function getSeverityRecommendation(severity) {
  switch (severity) {
    case ConsistencySeverity.CRITICAL:
      return 'Manual review required. Do not trust automated analysis.';
    case ConsistencySeverity.HIGH:
      return 'Significant issue detected. Verify analysis results manually.';
    case ConsistencySeverity.MEDIUM:
      return 'Notable inconsistency. Consider manual verification.';
    case ConsistencySeverity.LOW:
      return 'Minor inconsistency. May be acceptable depending on context.';
    default:
      return 'No action required.';
  }
}

/**
 * Apply consistency-based confidence reduction
 * @param {number} confidence - Original confidence
 * @param {string} consistencyStatus - Consistency status
 * @returns {Object} Adjusted confidence details
 */
function applyConsistencyReduction(confidence, consistencyStatus) {
  const reduction = CONSISTENCY_CONFIDENCE_REDUCTION[consistencyStatus] || 0;
  const adjusted = Math.max(0, confidence - reduction);
  
  return {
    original: confidence,
    adjusted: Math.round(adjusted * 1000) / 1000,
    reduction,
    status: consistencyStatus,
    wasReduced: reduction > 0
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Enums
  ConsistencyStatus,
  ConsistencySeverity,

  // Constants
  CONSISTENCY_CONFIDENCE_REDUCTION,
  SEVERITY_WEIGHTS,
  CONSISTENCY_RULES,

  // Core functions
  hasRequiredSignals,
  checkRule,
  getAvailableRules,
  getRule,

  // Main checks
  checkConsistency,
  calculateAggregateStatus,
  calculateConsistencyScore,

  // Quick check & analysis
  quickCheck,
  analyze,
  checkSpecificRules,
  getContradictoryPairs,

  // Explanations
  explainInconsistency,
  getSeverityRecommendation,

  // Confidence adjustment
  applyConsistencyReduction
};
