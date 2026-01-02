/**
 * Cross-Signal Consistency Checker Tests
 * 
 * Tests for detecting contradictory ML outputs across signal analyzers.
 * Per STUDIOOS_ML_INVESTMENT_CHARTER: ML outputs must be consistent and explainable.
 * 
 * @version 1.0.0
 */

const {
  ConsistencyStatus,
  ConsistencySeverity,
  CONSISTENCY_CONFIDENCE_REDUCTION,
  SEVERITY_WEIGHTS,
  CONSISTENCY_RULES,
  hasRequiredSignals,
  checkRule,
  getAvailableRules,
  getRule,
  checkConsistency,
  calculateAggregateStatus,
  calculateConsistencyScore,
  quickCheck,
  analyze,
  checkSpecificRules,
  getContradictoryPairs,
  explainInconsistency,
  getSeverityRecommendation,
  applyConsistencyReduction
} = require('../services/crossSignalConsistencyChecker');

// ============================================================================
// ENUM TESTS
// ============================================================================

describe('ConsistencyStatus enum', () => {
  test('should have all required status values', () => {
    expect(ConsistencyStatus.CONSISTENT).toBe('CONSISTENT');
    expect(ConsistencyStatus.MINOR_INCONSISTENCY).toBe('MINOR_INCONSISTENCY');
    expect(ConsistencyStatus.INCONSISTENT).toBe('INCONSISTENT');
    expect(ConsistencyStatus.CONTRADICTORY).toBe('CONTRADICTORY');
  });

  test('should be frozen', () => {
    expect(Object.isFrozen(ConsistencyStatus)).toBe(true);
  });

  test('should have exactly 4 status values', () => {
    expect(Object.keys(ConsistencyStatus)).toHaveLength(4);
  });
});

describe('ConsistencySeverity enum', () => {
  test('should have all required severity values', () => {
    expect(ConsistencySeverity.NONE).toBe('NONE');
    expect(ConsistencySeverity.LOW).toBe('LOW');
    expect(ConsistencySeverity.MEDIUM).toBe('MEDIUM');
    expect(ConsistencySeverity.HIGH).toBe('HIGH');
    expect(ConsistencySeverity.CRITICAL).toBe('CRITICAL');
  });

  test('should be frozen', () => {
    expect(Object.isFrozen(ConsistencySeverity)).toBe(true);
  });

  test('should have exactly 5 severity levels', () => {
    expect(Object.keys(ConsistencySeverity)).toHaveLength(5);
  });
});

// ============================================================================
// CONSTANTS TESTS
// ============================================================================

describe('CONSISTENCY_CONFIDENCE_REDUCTION', () => {
  test('should have no reduction for consistent signals', () => {
    expect(CONSISTENCY_CONFIDENCE_REDUCTION[ConsistencyStatus.CONSISTENT]).toBe(0);
  });

  test('should have small reduction for minor inconsistency', () => {
    expect(CONSISTENCY_CONFIDENCE_REDUCTION[ConsistencyStatus.MINOR_INCONSISTENCY]).toBe(0.05);
  });

  test('should have moderate reduction for inconsistent', () => {
    expect(CONSISTENCY_CONFIDENCE_REDUCTION[ConsistencyStatus.INCONSISTENT]).toBe(0.15);
  });

  test('should have large reduction for contradictory', () => {
    expect(CONSISTENCY_CONFIDENCE_REDUCTION[ConsistencyStatus.CONTRADICTORY]).toBe(0.30);
  });
});

describe('SEVERITY_WEIGHTS', () => {
  test('should have correct weight for NONE', () => {
    expect(SEVERITY_WEIGHTS[ConsistencySeverity.NONE]).toBe(0);
  });

  test('should have increasing weights', () => {
    expect(SEVERITY_WEIGHTS[ConsistencySeverity.LOW]).toBe(1);
    expect(SEVERITY_WEIGHTS[ConsistencySeverity.MEDIUM]).toBe(2);
    expect(SEVERITY_WEIGHTS[ConsistencySeverity.HIGH]).toBe(3);
    expect(SEVERITY_WEIGHTS[ConsistencySeverity.CRITICAL]).toBe(5);
  });
});

describe('CONSISTENCY_RULES', () => {
  test('should have at least 10 rules', () => {
    expect(CONSISTENCY_RULES.length).toBeGreaterThanOrEqual(10);
  });

  test('each rule should have required properties', () => {
    for (const rule of CONSISTENCY_RULES) {
      expect(rule).toHaveProperty('id');
      expect(rule).toHaveProperty('description');
      expect(rule).toHaveProperty('signals');
      expect(rule).toHaveProperty('check');
      expect(typeof rule.id).toBe('string');
      expect(typeof rule.description).toBe('string');
      expect(Array.isArray(rule.signals)).toBe(true);
      expect(typeof rule.check).toBe('function');
    }
  });

  test('should have unique rule IDs', () => {
    const ids = CONSISTENCY_RULES.map(r => r.id);
    const uniqueIds = [...new Set(ids)];
    expect(ids.length).toBe(uniqueIds.length);
  });
});

// ============================================================================
// HELPER FUNCTION TESTS
// ============================================================================

describe('hasRequiredSignals', () => {
  test('should return true when all signals present', () => {
    const signals = { subgenre: 'lofi', transientSharpness: 0.5 };
    expect(hasRequiredSignals(signals, ['subgenre', 'transientSharpness'])).toBe(true);
  });

  test('should return false when signal is missing', () => {
    const signals = { subgenre: 'lofi' };
    expect(hasRequiredSignals(signals, ['subgenre', 'transientSharpness'])).toBe(false);
  });

  test('should return false when signal is null', () => {
    const signals = { subgenre: 'lofi', transientSharpness: null };
    expect(hasRequiredSignals(signals, ['subgenre', 'transientSharpness'])).toBe(false);
  });

  test('should return false when signal is undefined', () => {
    const signals = { subgenre: 'lofi', transientSharpness: undefined };
    expect(hasRequiredSignals(signals, ['subgenre', 'transientSharpness'])).toBe(false);
  });

  test('should return true for empty required array', () => {
    expect(hasRequiredSignals({}, [])).toBe(true);
  });
});

describe('checkRule', () => {
  const lofiTransientRule = CONSISTENCY_RULES.find(r => r.id === 'LOFI_TRANSIENT');

  test('should detect violation when lo-fi has sharp transients', () => {
    const signals = { subgenre: 'lofi', transientSharpness: 0.8 };
    const result = checkRule(lofiTransientRule, signals);
    
    expect(result.ruleId).toBe('LOFI_TRANSIENT');
    expect(result.checked).toBe(true);
    expect(result.consistent).toBe(false);
    expect(result.severity).toBe(ConsistencySeverity.MEDIUM);
  });

  test('should pass when lo-fi has soft transients', () => {
    const signals = { subgenre: 'lofi', transientSharpness: 0.4 };
    const result = checkRule(lofiTransientRule, signals);
    
    expect(result.checked).toBe(true);
    expect(result.consistent).toBe(true);
  });

  test('should skip when required signals missing', () => {
    const signals = { subgenre: 'lofi' };
    const result = checkRule(lofiTransientRule, signals);
    
    expect(result.checked).toBe(false);
    expect(result.reason).toBe('missing_signals');
    expect(result.missingSignals).toContain('transientSharpness');
  });

  test('should pass for non-lofi subgenre', () => {
    const signals = { subgenre: 'trap', transientSharpness: 0.9 };
    const result = checkRule(lofiTransientRule, signals);
    
    expect(result.checked).toBe(true);
    expect(result.consistent).toBe(true);
  });
});

describe('getAvailableRules', () => {
  test('should return all rules with correct properties', () => {
    const rules = getAvailableRules();
    
    expect(rules.length).toBe(CONSISTENCY_RULES.length);
    for (const rule of rules) {
      expect(rule).toHaveProperty('id');
      expect(rule).toHaveProperty('description');
      expect(rule).toHaveProperty('signals');
      expect(rule).not.toHaveProperty('check'); // Check function excluded
    }
  });
});

describe('getRule', () => {
  test('should return rule by ID', () => {
    const rule = getRule('LOFI_TRANSIENT');
    
    expect(rule).toBeDefined();
    expect(rule.id).toBe('LOFI_TRANSIENT');
    expect(rule).toHaveProperty('description');
    expect(rule).toHaveProperty('signals');
  });

  test('should return null for unknown rule', () => {
    const rule = getRule('UNKNOWN_RULE');
    expect(rule).toBeNull();
  });
});

// ============================================================================
// INDIVIDUAL RULE TESTS
// ============================================================================

describe('Rule: LOFI_TRANSIENT', () => {
  const rule = CONSISTENCY_RULES.find(r => r.id === 'LOFI_TRANSIENT');

  test('should fail when lofi with sharp transients', () => {
    const result = rule.check({ subgenre: 'lofi', transientSharpness: 0.7 });
    expect(result.consistent).toBe(false);
    expect(result.severity).toBe(ConsistencySeverity.MEDIUM);
  });

  test('should pass when lofi with soft transients', () => {
    const result = rule.check({ subgenre: 'lofi', transientSharpness: 0.5 });
    expect(result.consistent).toBe(true);
  });

  test('should pass for non-lofi genres', () => {
    const result = rule.check({ subgenre: 'drill', transientSharpness: 0.9 });
    expect(result.consistent).toBe(true);
  });
});

describe('Rule: DRILL_BASS', () => {
  const rule = CONSISTENCY_RULES.find(r => r.id === 'DRILL_BASS');

  test('should fail when drill with low sub-bass', () => {
    const result = rule.check({ subgenre: 'drill', subBassEnergy: 0.2 });
    expect(result.consistent).toBe(false);
    expect(result.severity).toBe(ConsistencySeverity.LOW);
  });

  test('should pass when drill with high sub-bass', () => {
    const result = rule.check({ subgenre: 'drill', subBassEnergy: 0.7 });
    expect(result.consistent).toBe(true);
  });
});

describe('Rule: TRAP_BPM', () => {
  const rule = CONSISTENCY_RULES.find(r => r.id === 'TRAP_BPM');

  test('should fail when trap with very slow BPM', () => {
    const result = rule.check({ subgenre: 'trap', bpm: 50 });
    expect(result.consistent).toBe(false);
  });

  test('should fail when trap with very fast BPM', () => {
    const result = rule.check({ subgenre: 'trap', bpm: 200 });
    expect(result.consistent).toBe(false);
  });

  test('should pass for trap with typical BPM', () => {
    const result = rule.check({ subgenre: 'trap', bpm: 140 });
    expect(result.consistent).toBe(true);
  });
});

describe('Rule: DYNAMIC_COMPRESSION', () => {
  const rule = CONSISTENCY_RULES.find(r => r.id === 'DYNAMIC_COMPRESSION');

  test('should fail when low DR with high crest factor', () => {
    const result = rule.check({ dynamicRange: 3, crestFactor: 18 });
    expect(result.consistent).toBe(false);
    expect(result.severity).toBe(ConsistencySeverity.HIGH);
  });

  test('should pass when DR and crest factor correlate', () => {
    const result = rule.check({ dynamicRange: 10, crestFactor: 12 });
    expect(result.consistent).toBe(true);
  });
});

describe('Rule: LOUDNESS_PEAK', () => {
  const rule = CONSISTENCY_RULES.find(r => r.id === 'LOUDNESS_PEAK');

  test('should fail when peak is below integrated loudness', () => {
    const result = rule.check({ integratedLoudness: -14, truePeak: -16 });
    expect(result.consistent).toBe(false);
    expect(result.severity).toBe(ConsistencySeverity.CRITICAL);
  });

  test('should pass when peak is above integrated loudness', () => {
    const result = rule.check({ integratedLoudness: -14, truePeak: -2 });
    expect(result.consistent).toBe(true);
  });

  test('should pass when peak equals integrated loudness', () => {
    const result = rule.check({ integratedLoudness: -14, truePeak: -14 });
    expect(result.consistent).toBe(true);
  });
});

describe('Rule: BPM_TRANSIENT_DENSITY', () => {
  const rule = CONSISTENCY_RULES.find(r => r.id === 'BPM_TRANSIENT_DENSITY');

  test('should fail when high BPM with no transients', () => {
    const result = rule.check({ bpm: 180, transientDensity: 0.1 });
    expect(result.consistent).toBe(false);
  });

  test('should pass when high BPM with transients', () => {
    const result = rule.check({ bpm: 180, transientDensity: 0.5 });
    expect(result.consistent).toBe(true);
  });
});

describe('Rule: STEREO_MONO_TOPOLOGY', () => {
  const rule = CONSISTENCY_RULES.find(r => r.id === 'STEREO_MONO_TOPOLOGY');

  test('should fail when dual mono has stereo width', () => {
    const result = rule.check({ stereoWidth: 0.5, channelTopology: 'DUAL_MONO' });
    expect(result.consistent).toBe(false);
    expect(result.severity).toBe(ConsistencySeverity.MEDIUM);
  });

  test('should fail when true stereo has no width', () => {
    const result = rule.check({ stereoWidth: 0.02, channelTopology: 'TRUE_STEREO' });
    expect(result.consistent).toBe(false);
    expect(result.severity).toBe(ConsistencySeverity.LOW);
  });

  test('should pass for consistent stereo topology', () => {
    const result = rule.check({ stereoWidth: 0.6, channelTopology: 'TRUE_STEREO' });
    expect(result.consistent).toBe(true);
  });
});

describe('Rule: CLASSIFICATION_CONFIDENCE_HYBRID', () => {
  const rule = CONSISTENCY_RULES.find(r => r.id === 'CLASSIFICATION_CONFIDENCE_HYBRID');

  test('should fail when high confidence but marked hybrid', () => {
    const result = rule.check({ subgenreConfidence: 0.9, isHybrid: true });
    expect(result.consistent).toBe(false);
  });

  test('should pass when low confidence and hybrid', () => {
    const result = rule.check({ subgenreConfidence: 0.6, isHybrid: true });
    expect(result.consistent).toBe(true);
  });

  test('should pass when high confidence and not hybrid', () => {
    const result = rule.check({ subgenreConfidence: 0.9, isHybrid: false });
    expect(result.consistent).toBe(true);
  });
});

describe('Rule: CLIPPING_PEAK', () => {
  const rule = CONSISTENCY_RULES.find(r => r.id === 'CLIPPING_PEAK');

  test('should fail when clipping but peak is low', () => {
    const result = rule.check({ hasClipping: true, truePeak: -6 });
    expect(result.consistent).toBe(false);
    expect(result.severity).toBe(ConsistencySeverity.HIGH);
  });

  test('should fail when no clipping but peak exceeds 0', () => {
    const result = rule.check({ hasClipping: false, truePeak: 1.5 });
    expect(result.consistent).toBe(false);
    expect(result.severity).toBe(ConsistencySeverity.HIGH);
  });

  test('should pass when clipping and peak is high', () => {
    const result = rule.check({ hasClipping: true, truePeak: -1 });
    expect(result.consistent).toBe(true);
  });
});

describe('Rule: SILENCE_LOUDNESS', () => {
  const rule = CONSISTENCY_RULES.find(r => r.id === 'SILENCE_LOUDNESS');

  test('should fail when not silent but very quiet', () => {
    const result = rule.check({ isSilent: false, integratedLoudness: -60 });
    expect(result.consistent).toBe(false);
    expect(result.severity).toBe(ConsistencySeverity.MEDIUM);
  });

  test('should fail when silent but loud', () => {
    const result = rule.check({ isSilent: true, integratedLoudness: -20 });
    expect(result.consistent).toBe(false);
    expect(result.severity).toBe(ConsistencySeverity.HIGH);
  });

  test('should pass when silence correlates with loudness', () => {
    const result = rule.check({ isSilent: false, integratedLoudness: -14 });
    expect(result.consistent).toBe(true);
  });
});

// ============================================================================
// MAIN CHECK FUNCTIONS
// ============================================================================

describe('checkConsistency', () => {
  test('should return consistent for valid signals', () => {
    const signals = {
      subgenre: 'lofi',
      transientSharpness: 0.3,
      integratedLoudness: -14,
      truePeak: -1
    };
    
    const result = checkConsistency(signals);
    
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('consistencyScore');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('violations');
    expect(result).toHaveProperty('passedRules');
    expect(result).toHaveProperty('recommendations');
  });

  test('should detect contradictory signals', () => {
    const signals = {
      integratedLoudness: -14,
      truePeak: -20 // Physically impossible
    };
    
    const result = checkConsistency(signals);
    
    expect(result.status).toBe(ConsistencyStatus.CONTRADICTORY);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.confidenceReduction).toBe(0.30);
  });

  test('should count checked vs skipped rules', () => {
    const signals = {
      subgenre: 'lofi',
      transientSharpness: 0.4
    };
    
    const result = checkConsistency(signals);
    
    expect(result.summary.totalRules).toBe(CONSISTENCY_RULES.length);
    expect(result.summary.checked + result.summary.skipped).toBe(result.summary.totalRules);
  });

  test('should have zero confidence reduction when consistent', () => {
    const signals = {
      subgenre: 'trap',
      transientSharpness: 0.8,
      bpm: 140
    };
    
    const result = checkConsistency(signals);
    
    if (result.status === ConsistencyStatus.CONSISTENT) {
      expect(result.confidenceReduction).toBe(0);
    }
  });
});

describe('calculateAggregateStatus', () => {
  test('should return CONSISTENT for no violations', () => {
    expect(calculateAggregateStatus([])).toBe(ConsistencyStatus.CONSISTENT);
  });

  test('should return CONTRADICTORY for critical violation', () => {
    const violations = [{ severity: ConsistencySeverity.CRITICAL }];
    expect(calculateAggregateStatus(violations)).toBe(ConsistencyStatus.CONTRADICTORY);
  });

  test('should return CONTRADICTORY for multiple high violations', () => {
    const violations = [
      { severity: ConsistencySeverity.HIGH },
      { severity: ConsistencySeverity.HIGH }
    ];
    expect(calculateAggregateStatus(violations)).toBe(ConsistencyStatus.CONTRADICTORY);
  });

  test('should return INCONSISTENT for high weighted score', () => {
    const violations = [
      { severity: ConsistencySeverity.MEDIUM },
      { severity: ConsistencySeverity.MEDIUM }
    ];
    expect(calculateAggregateStatus(violations)).toBe(ConsistencyStatus.INCONSISTENT);
  });

  test('should return MINOR_INCONSISTENCY for low score', () => {
    const violations = [{ severity: ConsistencySeverity.LOW }];
    expect(calculateAggregateStatus(violations)).toBe(ConsistencyStatus.MINOR_INCONSISTENCY);
  });
});

describe('calculateConsistencyScore', () => {
  test('should return 1 for all passed rules', () => {
    expect(calculateConsistencyScore(10, 0, 0)).toBe(1);
  });

  test('should return 0 for all failed rules', () => {
    expect(calculateConsistencyScore(0, 10, 0)).toBe(0);
  });

  test('should calculate correct ratio', () => {
    expect(calculateConsistencyScore(8, 2, 0)).toBe(0.8);
  });

  test('should return 1 when no rules checked', () => {
    expect(calculateConsistencyScore(0, 0, 5)).toBe(1);
  });
});

// ============================================================================
// QUICK CHECK & ANALYSIS
// ============================================================================

describe('quickCheck', () => {
  test('should return consistent for valid signals', () => {
    const signals = {
      subgenre: 'lofi',
      transientSharpness: 0.3
    };
    
    const result = quickCheck(signals);
    
    expect(result).toHaveProperty('consistent');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('violationCount');
    expect(result).toHaveProperty('worstSeverity');
  });

  test('should identify worst severity in violations', () => {
    const signals = {
      integratedLoudness: -14,
      truePeak: -20 // Physically impossible - CRITICAL
    };
    
    const result = quickCheck(signals);
    
    expect(result.consistent).toBe(false);
    expect(result.worstSeverity).toBe(ConsistencySeverity.CRITICAL);
  });
});

describe('analyze', () => {
  test('should return full analysis with timestamp', () => {
    const signals = {
      subgenre: 'trap',
      bpm: 140
    };
    
    const result = analyze(signals);
    
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('availableRules');
    expect(result).toHaveProperty('severityWeights');
    expect(result).toHaveProperty('confidenceReductions');
  });

  test('should include severity weights in output', () => {
    const result = analyze({});
    expect(result.severityWeights).toEqual(SEVERITY_WEIGHTS);
  });
});

describe('checkSpecificRules', () => {
  test('should check only specified rules', () => {
    const signals = {
      subgenre: 'lofi',
      transientSharpness: 0.8,
      bpm: 100
    };
    
    const result = checkSpecificRules(signals, ['LOFI_TRANSIENT']);
    
    expect(result.results).toHaveLength(1);
    expect(result.results[0].ruleId).toBe('LOFI_TRANSIENT');
  });

  test('should handle unknown rule IDs', () => {
    const result = checkSpecificRules({}, ['UNKNOWN_RULE']);
    
    expect(result.results[0].checked).toBe(false);
    expect(result.results[0].reason).toBe('rule_not_found');
  });

  test('should handle mixed known/unknown rules', () => {
    const signals = { subgenre: 'lofi', transientSharpness: 0.4 };
    const result = checkSpecificRules(signals, ['LOFI_TRANSIENT', 'UNKNOWN']);
    
    expect(result.results).toHaveLength(2);
  });
});

describe('getContradictoryPairs', () => {
  test('should return empty for consistent signals', () => {
    const signals = {
      subgenre: 'lofi',
      transientSharpness: 0.3
    };
    
    const pairs = getContradictoryPairs(signals);
    expect(pairs).toHaveLength(0);
  });

  test('should return contradictory pairs for critical violations', () => {
    const signals = {
      integratedLoudness: -14,
      truePeak: -20
    };
    
    const pairs = getContradictoryPairs(signals);
    
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs[0]).toHaveProperty('ruleId');
    expect(pairs[0]).toHaveProperty('signals');
    expect(pairs[0]).toHaveProperty('severity');
  });
});

// ============================================================================
// EXPLANATIONS
// ============================================================================

describe('explainInconsistency', () => {
  test('should explain a violation', () => {
    const violation = {
      ruleId: 'LOFI_TRANSIENT',
      message: 'Lo-fi classification but transients are sharp',
      expected: 'transientSharpness <= 0.65 for lo-fi',
      actual: 'transientSharpness = 0.8',
      severity: ConsistencySeverity.MEDIUM
    };
    
    const explanation = explainInconsistency(violation);
    
    expect(explanation).toHaveProperty('ruleId');
    expect(explanation).toHaveProperty('description');
    expect(explanation).toHaveProperty('issue');
    expect(explanation).toHaveProperty('expected');
    expect(explanation).toHaveProperty('actual');
    expect(explanation).toHaveProperty('severity');
    expect(explanation).toHaveProperty('recommendation');
  });

  test('should handle unknown rule ID gracefully', () => {
    const violation = {
      ruleId: 'UNKNOWN',
      message: 'Unknown issue',
      severity: ConsistencySeverity.LOW
    };
    
    const explanation = explainInconsistency(violation);
    expect(explanation.description).toBe('Unknown rule');
  });
});

describe('getSeverityRecommendation', () => {
  test('should return action-oriented recommendation for CRITICAL', () => {
    const rec = getSeverityRecommendation(ConsistencySeverity.CRITICAL);
    expect(rec).toContain('Manual review required');
  });

  test('should return recommendation for HIGH', () => {
    const rec = getSeverityRecommendation(ConsistencySeverity.HIGH);
    expect(rec).toContain('Significant issue');
  });

  test('should return recommendation for MEDIUM', () => {
    const rec = getSeverityRecommendation(ConsistencySeverity.MEDIUM);
    expect(rec).toContain('Notable inconsistency');
  });

  test('should return recommendation for LOW', () => {
    const rec = getSeverityRecommendation(ConsistencySeverity.LOW);
    expect(rec).toContain('Minor inconsistency');
  });

  test('should return no action for NONE', () => {
    const rec = getSeverityRecommendation(ConsistencySeverity.NONE);
    expect(rec).toContain('No action required');
  });
});

// ============================================================================
// CONFIDENCE ADJUSTMENT
// ============================================================================

describe('applyConsistencyReduction', () => {
  test('should not reduce for consistent status', () => {
    const result = applyConsistencyReduction(0.85, ConsistencyStatus.CONSISTENT);
    
    expect(result.original).toBe(0.85);
    expect(result.adjusted).toBe(0.85);
    expect(result.reduction).toBe(0);
    expect(result.wasReduced).toBe(false);
  });

  test('should reduce 5% for minor inconsistency', () => {
    const result = applyConsistencyReduction(0.85, ConsistencyStatus.MINOR_INCONSISTENCY);
    
    expect(result.adjusted).toBe(0.8);
    expect(result.reduction).toBe(0.05);
    expect(result.wasReduced).toBe(true);
  });

  test('should reduce 15% for inconsistent', () => {
    const result = applyConsistencyReduction(0.85, ConsistencyStatus.INCONSISTENT);
    
    expect(result.adjusted).toBe(0.7);
    expect(result.reduction).toBe(0.15);
  });

  test('should reduce 30% for contradictory', () => {
    const result = applyConsistencyReduction(0.85, ConsistencyStatus.CONTRADICTORY);
    
    expect(result.adjusted).toBe(0.55);
    expect(result.reduction).toBe(0.30);
  });

  test('should not go below 0', () => {
    const result = applyConsistencyReduction(0.1, ConsistencyStatus.CONTRADICTORY);
    
    expect(result.adjusted).toBe(0);
    expect(result.original).toBe(0.1);
  });

  test('should handle unknown status with no reduction', () => {
    const result = applyConsistencyReduction(0.85, 'UNKNOWN');
    
    expect(result.adjusted).toBe(0.85);
    expect(result.reduction).toBe(0);
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Integration: Full analysis pipeline', () => {
  test('should handle complete audio analysis signals', () => {
    const signals = {
      subgenre: 'trap',
      transientSharpness: 0.75,
      subBassEnergy: 0.6,
      bpm: 140,
      dynamicRange: 8,
      crestFactor: 10,
      integratedLoudness: -14,
      truePeak: -1,
      transientDensity: 0.6,
      stereoWidth: 0.4,
      channelTopology: 'TRUE_STEREO',
      subgenreConfidence: 0.85,
      isHybrid: false,
      hasClipping: false,
      isSilent: false
    };
    
    const result = analyze(signals);
    
    expect(result.summary.checked).toBeGreaterThan(0);
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('consistencyScore');
  });

  test('should detect multiple violations at once', () => {
    const signals = {
      // Lo-fi with sharp transients (MEDIUM)
      subgenre: 'lofi',
      transientSharpness: 0.8,
      
      // Peak below loudness (CRITICAL)
      integratedLoudness: -14,
      truePeak: -20
    };
    
    const result = checkConsistency(signals);
    
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
    expect(result.status).toBe(ConsistencyStatus.CONTRADICTORY);
  });

  test('should work with minimal signals', () => {
    const signals = { bpm: 120 };
    const result = checkConsistency(signals);
    
    expect(result).toHaveProperty('status');
    expect(result.summary.skipped).toBeGreaterThan(0);
  });

  test('should work with empty signals', () => {
    const result = checkConsistency({});
    
    expect(result.status).toBe(ConsistencyStatus.CONSISTENT);
    expect(result.summary.checked).toBe(0);
    expect(result.summary.skipped).toBe(result.summary.totalRules);
  });
});

describe('Integration: Confidence reduction chain', () => {
  test('should chain consistency check with confidence reduction', () => {
    const originalConfidence = 0.85;
    const signals = {
      integratedLoudness: -14,
      truePeak: -20 // Contradictory
    };
    
    const consistencyResult = checkConsistency(signals);
    const adjustedResult = applyConsistencyReduction(
      originalConfidence,
      consistencyResult.status
    );
    
    expect(adjustedResult.wasReduced).toBe(true);
    expect(adjustedResult.adjusted).toBeLessThan(originalConfidence);
  });

  test('should preserve confidence for consistent signals', () => {
    const originalConfidence = 0.85;
    const signals = {
      integratedLoudness: -14,
      truePeak: -1 // Consistent
    };
    
    const consistencyResult = checkConsistency(signals);
    const adjustedResult = applyConsistencyReduction(
      originalConfidence,
      consistencyResult.status
    );
    
    expect(adjustedResult.adjusted).toBe(originalConfidence);
  });
});

describe('Edge cases', () => {
  test('should handle boundary values for LOFI_TRANSIENT', () => {
    const rule = CONSISTENCY_RULES.find(r => r.id === 'LOFI_TRANSIENT');
    
    // Exactly at threshold (0.65) - should pass
    const atThreshold = rule.check({ subgenre: 'lofi', transientSharpness: 0.65 });
    expect(atThreshold.consistent).toBe(true);
    
    // Just above threshold - should fail
    const aboveThreshold = rule.check({ subgenre: 'lofi', transientSharpness: 0.66 });
    expect(aboveThreshold.consistent).toBe(false);
  });

  test('should handle boundary values for DRILL_BASS', () => {
    const rule = CONSISTENCY_RULES.find(r => r.id === 'DRILL_BASS');
    
    // Exactly at threshold (0.4) - should pass
    const atThreshold = rule.check({ subgenre: 'drill', subBassEnergy: 0.4 });
    expect(atThreshold.consistent).toBe(true);
    
    // Just below threshold - should fail
    const belowThreshold = rule.check({ subgenre: 'drill', subBassEnergy: 0.39 });
    expect(belowThreshold.consistent).toBe(false);
  });

  test('should handle zero values', () => {
    const signals = {
      transientSharpness: 0,
      subBassEnergy: 0,
      bpm: 0,
      dynamicRange: 0,
      crestFactor: 0
    };
    
    const result = checkConsistency(signals);
    expect(result).toHaveProperty('status');
  });

  test('should handle negative values', () => {
    const signals = {
      integratedLoudness: -60,
      truePeak: -40
    };
    
    const result = checkConsistency(signals);
    expect(result).toHaveProperty('status');
  });

  test('should handle very large numbers', () => {
    const signals = {
      bpm: 10000,
      transientDensity: 0.5
    };
    
    const result = checkConsistency(signals);
    expect(result).toHaveProperty('status');
  });
});
