/**
 * Parameter Interaction Conflict Detector Tests
 * 
 * Tests for detecting conflicts between processing parameters.
 */

const {
  detectConflicts,
  detectParameterConflicts,
  validateParameters,
  quickCheck,
  checkPairConflict,
  getRulesForParameter,
  normalizeParameters,
  generateRecommendations,
  suggestResolutions,
  ConflictSeverity,
  ConflictCategory,
  ParameterType,
  CONFLICT_RULES,
  THRESHOLDS,
  SEVERITY_DESCRIPTIONS
} = require('../services/parameterConflictDetector');

// ============================================================================
// Constants Tests
// ============================================================================

describe('ParameterConflictDetector Constants', () => {
  describe('ConflictSeverity', () => {
    it('should define all severity levels', () => {
      expect(ConflictSeverity.NONE).toBe('NONE');
      expect(ConflictSeverity.LOW).toBe('LOW');
      expect(ConflictSeverity.MEDIUM).toBe('MEDIUM');
      expect(ConflictSeverity.HIGH).toBe('HIGH');
      expect(ConflictSeverity.BLOCKING).toBe('BLOCKING');
    });

    it('should have exactly 5 severity levels', () => {
      expect(Object.keys(ConflictSeverity)).toHaveLength(5);
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(ConflictSeverity)).toBe(true);
    });
  });

  describe('ConflictCategory', () => {
    it('should define all categories', () => {
      expect(ConflictCategory.DYNAMICS).toBe('DYNAMICS');
      expect(ConflictCategory.FREQUENCY).toBe('FREQUENCY');
      expect(ConflictCategory.STEREO).toBe('STEREO');
      expect(ConflictCategory.HEADROOM).toBe('HEADROOM');
      expect(ConflictCategory.INTENT).toBe('INTENT');
      expect(ConflictCategory.ACCUMULATION).toBe('ACCUMULATION');
    });

    it('should have exactly 6 categories', () => {
      expect(Object.keys(ConflictCategory)).toHaveLength(6);
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(ConflictCategory)).toBe(true);
    });
  });

  describe('ParameterType', () => {
    it('should define dynamics parameters', () => {
      expect(ParameterType.COMPRESSION_RATIO).toBe('COMPRESSION_RATIO');
      expect(ParameterType.LIMITER_THRESHOLD).toBe('LIMITER_THRESHOLD');
    });

    it('should define EQ parameters', () => {
      expect(ParameterType.EQ_BOOST_MAX).toBe('EQ_BOOST_MAX');
      expect(ParameterType.HIGH_SHELF_GAIN).toBe('HIGH_SHELF_GAIN');
    });

    it('should define stereo parameters', () => {
      expect(ParameterType.STEREO_WIDTH).toBe('STEREO_WIDTH');
      expect(ParameterType.MONO_COMPATIBLE).toBe('MONO_COMPATIBLE');
    });

    it('should define intent flags', () => {
      expect(ParameterType.PRESERVE_DYNAMICS).toBe('PRESERVE_DYNAMICS');
      expect(ParameterType.MAXIMIZE_LOUDNESS).toBe('MAXIMIZE_LOUDNESS');
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(ParameterType)).toBe(true);
    });
  });

  describe('CONFLICT_RULES', () => {
    it('should have multiple rules defined', () => {
      expect(CONFLICT_RULES.length).toBeGreaterThan(5);
    });

    it('should have unique rule IDs', () => {
      const ids = CONFLICT_RULES.map(r => r.id);
      const uniqueIds = [...new Set(ids)];
      expect(uniqueIds.length).toBe(ids.length);
    });

    it('should have required properties on each rule', () => {
      CONFLICT_RULES.forEach(rule => {
        expect(rule.id).toBeDefined();
        expect(rule.name).toBeDefined();
        expect(rule.category).toBeDefined();
        expect(rule.description).toBeDefined();
        expect(rule.conditions).toBeDefined();
        expect(typeof rule.getSeverity).toBe('function');
        expect(rule.recommendation).toBeDefined();
      });
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(CONFLICT_RULES)).toBe(true);
    });
  });

  describe('THRESHOLDS', () => {
    it('should define EQ_BOOST thresholds', () => {
      expect(THRESHOLDS.EQ_BOOST.SAFE).toBeDefined();
      expect(THRESHOLDS.EQ_BOOST.MODERATE).toBeDefined();
      expect(THRESHOLDS.EQ_BOOST.AGGRESSIVE).toBeDefined();
    });

    it('should define COMPRESSION_RATIO thresholds', () => {
      expect(THRESHOLDS.COMPRESSION_RATIO.GENTLE).toBeDefined();
      expect(THRESHOLDS.COMPRESSION_RATIO.HEAVY).toBeDefined();
    });

    it('should define STEREO_WIDTH thresholds', () => {
      expect(THRESHOLDS.STEREO_WIDTH.NORMAL).toBe(1.0);
      expect(THRESHOLDS.STEREO_WIDTH.WIDE).toBeGreaterThan(1.0);
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(THRESHOLDS)).toBe(true);
    });
  });

  describe('SEVERITY_DESCRIPTIONS', () => {
    it('should have descriptions for all severities', () => {
      Object.values(ConflictSeverity).forEach(severity => {
        expect(SEVERITY_DESCRIPTIONS[severity]).toBeDefined();
        expect(typeof SEVERITY_DESCRIPTIONS[severity]).toBe('string');
      });
    });
  });
});

// ============================================================================
// normalizeParameters Tests
// ============================================================================

describe('normalizeParameters', () => {
  it('should pass through standard parameter names', () => {
    const params = { eqBoostMax: 6, limiterThreshold: -3 };
    const result = normalizeParameters(params);
    expect(result.eqBoostMax).toBe(6);
    expect(result.limiterThreshold).toBe(-3);
  });

  it('should normalize common aliases', () => {
    const params = { eq_boost: 6, stereo_width: 1.5, ratio: 4 };
    const result = normalizeParameters(params);
    expect(result.eqBoostMax).toBe(6);
    expect(result.stereoWidth).toBe(1.5);
    expect(result.compressionRatio).toBe(4);
  });

  it('should handle null input', () => {
    expect(normalizeParameters(null)).toEqual({});
  });

  it('should handle empty object', () => {
    expect(normalizeParameters({})).toEqual({});
  });

  it('should not overwrite existing standard keys', () => {
    const params = { eqBoostMax: 6, eq_boost: 10 };
    const result = normalizeParameters(params);
    expect(result.eqBoostMax).toBe(6); // Original preserved
  });
});

// ============================================================================
// detectConflicts Tests
// ============================================================================

describe('detectConflicts', () => {
  it('should return empty array for no conflicts', () => {
    // Use parameters that don't trigger any rules
    const params = { targetBitDepth: 24, sampleRate: 48000 };
    const conflicts = detectConflicts(params);
    expect(conflicts).toHaveLength(0);
  });

  it('should detect EQ boost + limiting conflict', () => {
    const params = { eqBoostMax: 9, limiterThreshold: -2 };
    const conflicts = detectConflicts(params);
    const eqConflict = conflicts.find(c => c.ruleId === 'EQ_BOOST_LIMITING');
    expect(eqConflict).toBeDefined();
  });

  it('should detect stereo + mono conflict', () => {
    const params = { stereoWidth: 1.5, monoCompatible: true };
    const conflicts = detectConflicts(params);
    const stereoConflict = conflicts.find(c => c.ruleId === 'STEREO_MONO_CONFLICT');
    expect(stereoConflict).toBeDefined();
  });

  it('should detect compression + dynamics preservation conflict', () => {
    const params = { compressionRatio: 10, preserveDynamics: true };
    const conflicts = detectConflicts(params);
    const dynamicsConflict = conflicts.find(c => c.ruleId === 'COMPRESSION_DYNAMICS_CONFLICT');
    expect(dynamicsConflict).toBeDefined();
  });

  it('should detect loudness + dynamics conflict', () => {
    const params = { maximizeLoudness: true, preserveDynamics: true };
    const conflicts = detectConflicts(params);
    const intentConflict = conflicts.find(c => c.ruleId === 'LOUDNESS_DYNAMICS_CONFLICT');
    expect(intentConflict).toBeDefined();
    expect(intentConflict.severity).toBe(ConflictSeverity.HIGH);
  });

  it('should detect stacked limiters', () => {
    const params = { limiterCount: 3 };
    const conflicts = detectConflicts(params);
    const stackedConflict = conflicts.find(c => c.ruleId === 'STACKED_LIMITERS');
    expect(stackedConflict).toBeDefined();
  });

  it('should sort conflicts by severity', () => {
    const params = { 
      eqBoostMax: 15,
      limiterThreshold: -1,
      stereoWidth: 1.5,
      monoCompatible: true
    };
    const conflicts = detectConflicts(params);
    
    // Check that more severe conflicts come first
    for (let i = 0; i < conflicts.length - 1; i++) {
      const severityOrder = {
        [ConflictSeverity.BLOCKING]: 0,
        [ConflictSeverity.HIGH]: 1,
        [ConflictSeverity.MEDIUM]: 2,
        [ConflictSeverity.LOW]: 3
      };
      expect(severityOrder[conflicts[i].severity])
        .toBeLessThanOrEqual(severityOrder[conflicts[i + 1].severity]);
    }
  });

  it('should handle empty params', () => {
    const conflicts = detectConflicts({});
    expect(conflicts).toHaveLength(0);
  });
});

// ============================================================================
// detectParameterConflicts Tests
// ============================================================================

describe('detectParameterConflicts', () => {
  it('should merge current analysis with proposed params', () => {
    const current = { dynamicRange: 25 };
    const proposed = { targetBitDepth: 16 };
    const result = detectParameterConflicts(current, proposed);
    
    const bitDepthConflict = result.conflicts.find(c => c.ruleId === 'BIT_DEPTH_DYNAMICS');
    expect(bitDepthConflict).toBeDefined();
  });

  it('should include preset intent in conflict detection', () => {
    const current = {};
    const proposed = { stereoWidth: 1.6 };
    const intent = { monoCompatible: true };
    const result = detectParameterConflicts(current, proposed, intent);
    
    expect(result.conflicts.length).toBeGreaterThan(0);
  });

  it('should categorize conflicts', () => {
    const params = { 
      eqBoostMax: 10,
      limiterThreshold: -2,
      stereoWidth: 1.5,
      monoCompatible: true
    };
    const result = detectParameterConflicts(params, {});
    
    expect(result.byCategory[ConflictCategory.HEADROOM]).toBeDefined();
    expect(result.byCategory[ConflictCategory.STEREO]).toBeDefined();
  });

  it('should set canProceed false for blocking conflicts', () => {
    const params = { 
      eqBoostMax: 15,
      limiterThreshold: -1
    };
    const result = detectParameterConflicts(params, {});
    expect(result.hasBlockingConflict).toBe(true);
    expect(result.canProceed).toBe(false);
  });

  it('should include recommendations', () => {
    const params = { stereoWidth: 1.5, monoCompatible: true };
    const result = detectParameterConflicts(params, {});
    expect(result.recommendations.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// validateParameters Tests
// ============================================================================

describe('validateParameters', () => {
  it('should return isValid true for no conflicts', () => {
    const result = validateParameters({ eqBoostMax: 2 });
    expect(result.isValid).toBe(true);
    expect(result.hasErrors).toBe(false);
  });

  it('should return hasWarnings for medium conflicts', () => {
    const result = validateParameters({ stereoWidth: 1.3, monoCompatible: true });
    expect(result.hasWarnings).toBe(true);
  });

  it('should return hasErrors for high/blocking conflicts', () => {
    const result = validateParameters({ 
      eqBoostMax: 15,
      limiterThreshold: -1
    });
    expect(result.hasErrors).toBe(true);
  });

  it('should include full conflict detection result', () => {
    const result = validateParameters({ compressionRatio: 10, preserveDynamics: true });
    expect(result.conflicts).toBeDefined();
    expect(result.conflictCount).toBeGreaterThan(0);
  });
});

// ============================================================================
// quickCheck Tests
// ============================================================================

describe('quickCheck', () => {
  it('should return hasConflicts false for clean params', () => {
    const result = quickCheck({ eqBoostMax: 2 });
    expect(result.hasConflicts).toBe(false);
    expect(result.conflictCount).toBe(0);
  });

  it('should count conflicts by severity', () => {
    const result = quickCheck({ 
      eqBoostMax: 10,
      limiterThreshold: -2,
      stereoWidth: 1.5,
      monoCompatible: true
    });
    expect(result.hasConflicts).toBe(true);
    expect(result.conflictCount).toBeGreaterThan(0);
    expect(typeof result.highCount).toBe('number');
    expect(typeof result.mediumCount).toBe('number');
  });

  it('should include top conflict', () => {
    const result = quickCheck({ stereoWidth: 1.5, monoCompatible: true });
    expect(result.topConflict).toBeDefined();
    expect(result.topConflict.ruleId).toBe('STEREO_MONO_CONFLICT');
  });

  it('should set canProceed based on blocking conflicts', () => {
    const safeResult = quickCheck({ eqBoostMax: 3 });
    expect(safeResult.canProceed).toBe(true);
    
    const blockingResult = quickCheck({ eqBoostMax: 15, limiterThreshold: -0.5 });
    expect(blockingResult.canProceed).toBe(false);
  });
});

// ============================================================================
// checkPairConflict Tests
// ============================================================================

describe('checkPairConflict', () => {
  it('should detect conflict between two parameters', () => {
    const conflict = checkPairConflict('stereoWidth', 1.5, 'monoCompatible', true);
    expect(conflict).not.toBeNull();
    expect(conflict.ruleId).toBe('STEREO_MONO_CONFLICT');
  });

  it('should return null for non-conflicting pair', () => {
    // Using parameters that don't trigger any rule together
    const conflict = checkPairConflict('targetBitDepth', 24, 'sampleRate', 48000);
    expect(conflict).toBeNull();
  });

  it('should handle unknown parameters', () => {
    const conflict = checkPairConflict('unknownParam', 100, 'anotherUnknown', 200);
    expect(conflict).toBeNull();
  });
});

// ============================================================================
// getRulesForParameter Tests
// ============================================================================

describe('getRulesForParameter', () => {
  it('should find rules for eqBoostMax', () => {
    const rules = getRulesForParameter('eqBoostMax');
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.some(r => r.id === 'EQ_BOOST_LIMITING')).toBe(true);
  });

  it('should find rules for stereoWidth', () => {
    const rules = getRulesForParameter('stereoWidth');
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.some(r => r.id === 'STEREO_MONO_CONFLICT')).toBe(true);
  });

  it('should return empty for unknown parameter', () => {
    const rules = getRulesForParameter('unknownParameter');
    expect(rules).toHaveLength(0);
  });
});

// ============================================================================
// generateRecommendations Tests
// ============================================================================

describe('generateRecommendations', () => {
  it('should return empty for no conflicts', () => {
    const recs = generateRecommendations([]);
    expect(recs).toHaveLength(0);
  });

  it('should generate recommendations from conflicts', () => {
    const conflicts = [{
      category: ConflictCategory.STEREO,
      severity: ConflictSeverity.HIGH,
      recommendation: 'Reduce stereo width'
    }];
    const recs = generateRecommendations(conflicts);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.some(r => r.includes('Reduce stereo width'))).toBe(true);
  });

  it('should indicate blocking conflicts', () => {
    const conflicts = [{
      category: ConflictCategory.HEADROOM,
      severity: ConflictSeverity.BLOCKING,
      recommendation: 'Fix headroom issue'
    }];
    const recs = generateRecommendations(conflicts);
    expect(recs.some(r => r.includes('BLOCKING'))).toBe(true);
  });
});

// ============================================================================
// suggestResolutions Tests
// ============================================================================

describe('suggestResolutions', () => {
  it('should suggest lowering EQ boost', () => {
    const params = { eqBoostMax: 10 };
    const conflicts = [{ ruleId: 'EQ_BOOST_LIMITING', affectedParams: ['eqBoostMax'] }];
    const result = suggestResolutions(params, conflicts);
    
    expect(result.suggestions.eqBoostMax).toBeDefined();
    expect(result.suggestions.eqBoostMax).toBeLessThan(10);
  });

  it('should suggest reducing stereo width', () => {
    const params = { stereoWidth: 1.8 };
    const conflicts = [{ ruleId: 'STEREO_MONO_CONFLICT', affectedParams: ['stereoWidth'] }];
    const result = suggestResolutions(params, conflicts);
    
    expect(result.suggestions.stereoWidth).toBeDefined();
    expect(result.suggestions.stereoWidth).toBeLessThanOrEqual(1.0);
  });

  it('should suggest reducing compression ratio', () => {
    const params = { compressionRatio: 12 };
    const conflicts = [{ ruleId: 'COMPRESSION_DYNAMICS_CONFLICT', affectedParams: ['compressionRatio'] }];
    const result = suggestResolutions(params, conflicts);
    
    expect(result.suggestions.compressionRatio).toBeDefined();
    expect(result.suggestions.compressionRatio).toBeLessThan(12);
  });

  it('should include original params', () => {
    const params = { eqBoostMax: 10 };
    const result = suggestResolutions(params, []);
    expect(result.originalParams).toEqual(params);
  });

  it('should report hasSuggestions', () => {
    const params = { eqBoostMax: 10 };
    const conflicts = [{ ruleId: 'EQ_BOOST_LIMITING', affectedParams: ['eqBoostMax'] }];
    const result = suggestResolutions(params, conflicts);
    expect(result.hasSuggestions).toBe(true);
  });

  it('should handle no conflicts', () => {
    const result = suggestResolutions({}, []);
    expect(result.hasSuggestions).toBe(false);
  });
});

// ============================================================================
// Specific Conflict Rule Tests
// ============================================================================

describe('Specific Conflict Rules', () => {
  describe('EQ_BOOST_LIMITING rule', () => {
    it('should be BLOCKING for extreme values', () => {
      const conflicts = detectConflicts({ eqBoostMax: 15, limiterThreshold: -1 });
      const conflict = conflicts.find(c => c.ruleId === 'EQ_BOOST_LIMITING');
      expect(conflict.severity).toBe(ConflictSeverity.BLOCKING);
    });

    it('should be HIGH for aggressive values', () => {
      const conflicts = detectConflicts({ eqBoostMax: 10, limiterThreshold: -2 });
      const conflict = conflicts.find(c => c.ruleId === 'EQ_BOOST_LIMITING');
      expect(conflict.severity).toBe(ConflictSeverity.HIGH);
    });

    it('should be MEDIUM for moderate values', () => {
      const conflicts = detectConflicts({ eqBoostMax: 7, limiterThreshold: -2.5 });
      const conflict = conflicts.find(c => c.ruleId === 'EQ_BOOST_LIMITING');
      expect(conflict.severity).toBe(ConflictSeverity.MEDIUM);
    });
  });

  describe('STEREO_MONO_CONFLICT rule', () => {
    it('should be BLOCKING for extreme width', () => {
      const conflicts = detectConflicts({ stereoWidth: 2.0, monoCompatible: true });
      const conflict = conflicts.find(c => c.ruleId === 'STEREO_MONO_CONFLICT');
      expect(conflict.severity).toBe(ConflictSeverity.BLOCKING);
    });

    it('should not trigger without mono requirement', () => {
      const conflicts = detectConflicts({ stereoWidth: 2.0, monoCompatible: false });
      const conflict = conflicts.find(c => c.ruleId === 'STEREO_MONO_CONFLICT');
      expect(conflict).toBeUndefined();
    });
  });

  describe('STACKED_LIMITERS rule', () => {
    it('should be BLOCKING for 4+ limiters', () => {
      const conflicts = detectConflicts({ limiterCount: 4 });
      const conflict = conflicts.find(c => c.ruleId === 'STACKED_LIMITERS');
      expect(conflict.severity).toBe(ConflictSeverity.BLOCKING);
    });

    it('should be HIGH for 3 limiters', () => {
      const conflicts = detectConflicts({ limiterCount: 3 });
      const conflict = conflicts.find(c => c.ruleId === 'STACKED_LIMITERS');
      expect(conflict.severity).toBe(ConflictSeverity.HIGH);
    });

    it('should be MEDIUM for 2 limiters', () => {
      const conflicts = detectConflicts({ limiterCount: 2 });
      const conflict = conflicts.find(c => c.ruleId === 'STACKED_LIMITERS');
      expect(conflict.severity).toBe(ConflictSeverity.MEDIUM);
    });
  });
});

// ============================================================================
// Module Exports Tests
// ============================================================================

describe('Module Exports', () => {
  const exports = require('../services/parameterConflictDetector');

  it('should export detection functions', () => {
    expect(typeof exports.detectConflicts).toBe('function');
    expect(typeof exports.detectParameterConflicts).toBe('function');
    expect(typeof exports.validateParameters).toBe('function');
    expect(typeof exports.quickCheck).toBe('function');
  });

  it('should export utility functions', () => {
    expect(typeof exports.checkPairConflict).toBe('function');
    expect(typeof exports.getRulesForParameter).toBe('function');
    expect(typeof exports.normalizeParameters).toBe('function');
  });

  it('should export recommendation functions', () => {
    expect(typeof exports.generateRecommendations).toBe('function');
    expect(typeof exports.suggestResolutions).toBe('function');
  });

  it('should export all constants', () => {
    expect(exports.ConflictSeverity).toBeDefined();
    expect(exports.ConflictCategory).toBeDefined();
    expect(exports.ParameterType).toBeDefined();
    expect(exports.CONFLICT_RULES).toBeDefined();
    expect(exports.THRESHOLDS).toBeDefined();
    expect(exports.SEVERITY_DESCRIPTIONS).toBeDefined();
  });
});
