/**
 * DSP Chain Order Validator Tests
 * 
 * Tests for ensuring audio transformations occur in safe sequence.
 */

const {
  validateStageSequence,
  validatePresetSequence,
  validateProposedPreset,
  quickCheck,
  getStageOrder,
  getPresetStage,
  isRepeatableStage,
  isNonRepeatableStage,
  getRecommendedNextStages,
  buildOptimalOrder,
  findProblematicSequences,
  findOutOfOrderStages,
  findRepeatViolations,
  generateRecommendations,
  DSPStage,
  ValidationStatus,
  ViolationSeverity,
  SAFE_ORDER,
  PRESET_TO_STAGE,
  REPEATABLE_STAGES,
  NON_REPEATABLE_STAGES,
  PROBLEMATIC_SEQUENCES,
  STATUS_DESCRIPTIONS
} = require('../services/dspChainOrderValidator');

// ============================================================================
// Constants Tests
// ============================================================================

describe('DSPChainOrderValidator Constants', () => {
  describe('DSPStage', () => {
    it('should define all DSP stages', () => {
      expect(DSPStage.ANALYSIS).toBe('ANALYSIS');
      expect(DSPStage.RESTORATION).toBe('RESTORATION');
      expect(DSPStage.GAIN_STAGING).toBe('GAIN_STAGING');
      expect(DSPStage.EQ).toBe('EQ');
      expect(DSPStage.DYNAMICS).toBe('DYNAMICS');
      expect(DSPStage.LIMITING).toBe('LIMITING');
      expect(DSPStage.STEREO).toBe('STEREO');
      expect(DSPStage.DITHER).toBe('DITHER');
      expect(DSPStage.FORMAT_CONVERSION).toBe('FORMAT_CONVERSION');
    });

    it('should have exactly 9 stages', () => {
      expect(Object.keys(DSPStage)).toHaveLength(9);
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(DSPStage)).toBe(true);
    });
  });

  describe('ValidationStatus', () => {
    it('should define all status levels', () => {
      expect(ValidationStatus.VALID).toBe('VALID');
      expect(ValidationStatus.WARNING).toBe('WARNING');
      expect(ValidationStatus.INVALID).toBe('INVALID');
    });

    it('should have exactly 3 status levels', () => {
      expect(Object.keys(ValidationStatus)).toHaveLength(3);
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(ValidationStatus)).toBe(true);
    });
  });

  describe('ViolationSeverity', () => {
    it('should define all severity levels', () => {
      expect(ViolationSeverity.INFO).toBe('INFO');
      expect(ViolationSeverity.WARNING).toBe('WARNING');
      expect(ViolationSeverity.ERROR).toBe('ERROR');
      expect(ViolationSeverity.CRITICAL).toBe('CRITICAL');
    });

    it('should have exactly 4 severity levels', () => {
      expect(Object.keys(ViolationSeverity)).toHaveLength(4);
    });
  });

  describe('SAFE_ORDER', () => {
    it('should have all stages in correct order', () => {
      expect(SAFE_ORDER[0]).toBe(DSPStage.ANALYSIS);
      expect(SAFE_ORDER[1]).toBe(DSPStage.RESTORATION);
      expect(SAFE_ORDER[2]).toBe(DSPStage.GAIN_STAGING);
      expect(SAFE_ORDER[3]).toBe(DSPStage.EQ);
      expect(SAFE_ORDER[4]).toBe(DSPStage.DYNAMICS);
      expect(SAFE_ORDER[5]).toBe(DSPStage.LIMITING);
      expect(SAFE_ORDER[6]).toBe(DSPStage.STEREO);
      expect(SAFE_ORDER[7]).toBe(DSPStage.DITHER);
      expect(SAFE_ORDER[8]).toBe(DSPStage.FORMAT_CONVERSION);
    });

    it('should have 9 stages', () => {
      expect(SAFE_ORDER).toHaveLength(9);
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(SAFE_ORDER)).toBe(true);
    });
  });

  describe('PRESET_TO_STAGE', () => {
    it('should map analysis presets correctly', () => {
      expect(PRESET_TO_STAGE['analyze-full']).toBe(DSPStage.ANALYSIS);
      expect(PRESET_TO_STAGE['analyze-loudness']).toBe(DSPStage.ANALYSIS);
    });

    it('should map mastering presets to LIMITING', () => {
      expect(PRESET_TO_STAGE['master-standard']).toBe(DSPStage.LIMITING);
      expect(PRESET_TO_STAGE['master-streaming']).toBe(DSPStage.LIMITING);
    });

    it('should map format conversion presets correctly', () => {
      expect(PRESET_TO_STAGE['convert-wav']).toBe(DSPStage.FORMAT_CONVERSION);
      expect(PRESET_TO_STAGE['convert-mp3']).toBe(DSPStage.FORMAT_CONVERSION);
    });

    it('should map normalization presets to GAIN_STAGING', () => {
      expect(PRESET_TO_STAGE['normalize-loudness']).toBe(DSPStage.GAIN_STAGING);
      expect(PRESET_TO_STAGE['normalize-peak']).toBe(DSPStage.GAIN_STAGING);
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(PRESET_TO_STAGE)).toBe(true);
    });
  });

  describe('REPEATABLE_STAGES', () => {
    it('should include ANALYSIS', () => {
      expect(REPEATABLE_STAGES).toContain(DSPStage.ANALYSIS);
    });

    it('should include EQ', () => {
      expect(REPEATABLE_STAGES).toContain(DSPStage.EQ);
    });

    it('should not include LIMITING', () => {
      expect(REPEATABLE_STAGES).not.toContain(DSPStage.LIMITING);
    });
  });

  describe('NON_REPEATABLE_STAGES', () => {
    it('should include LIMITING', () => {
      expect(NON_REPEATABLE_STAGES).toContain(DSPStage.LIMITING);
    });

    it('should include DITHER', () => {
      expect(NON_REPEATABLE_STAGES).toContain(DSPStage.DITHER);
    });

    it('should include FORMAT_CONVERSION', () => {
      expect(NON_REPEATABLE_STAGES).toContain(DSPStage.FORMAT_CONVERSION);
    });
  });

  describe('PROBLEMATIC_SEQUENCES', () => {
    it('should have problematic sequence for limiting before dynamics', () => {
      const seq = PROBLEMATIC_SEQUENCES.find(
        s => s.before === DSPStage.LIMITING && s.after === DSPStage.DYNAMICS
      );
      expect(seq).toBeDefined();
      expect(seq.severity).toBe(ViolationSeverity.ERROR);
    });

    it('should have critical sequence for dither before dynamics', () => {
      const seq = PROBLEMATIC_SEQUENCES.find(
        s => s.before === DSPStage.DITHER && s.after === DSPStage.DYNAMICS
      );
      expect(seq).toBeDefined();
      expect(seq.severity).toBe(ViolationSeverity.CRITICAL);
    });

    it('should have reasons for all sequences', () => {
      PROBLEMATIC_SEQUENCES.forEach(seq => {
        expect(seq.reason).toBeDefined();
        expect(seq.reason.length).toBeGreaterThan(10);
      });
    });
  });

  describe('STATUS_DESCRIPTIONS', () => {
    it('should have descriptions for all statuses', () => {
      Object.values(ValidationStatus).forEach(status => {
        expect(STATUS_DESCRIPTIONS[status]).toBeDefined();
        expect(typeof STATUS_DESCRIPTIONS[status]).toBe('string');
      });
    });
  });
});

// ============================================================================
// Utility Functions Tests
// ============================================================================

describe('Utility Functions', () => {
  describe('getStageOrder', () => {
    it('should return 0 for ANALYSIS', () => {
      expect(getStageOrder(DSPStage.ANALYSIS)).toBe(0);
    });

    it('should return 5 for LIMITING', () => {
      expect(getStageOrder(DSPStage.LIMITING)).toBe(5);
    });

    it('should return 8 for FORMAT_CONVERSION', () => {
      expect(getStageOrder(DSPStage.FORMAT_CONVERSION)).toBe(8);
    });

    it('should return -1 for unknown stage', () => {
      expect(getStageOrder('UNKNOWN')).toBe(-1);
    });
  });

  describe('getPresetStage', () => {
    it('should return stage for known preset', () => {
      expect(getPresetStage('master-standard')).toBe(DSPStage.LIMITING);
    });

    it('should return null for unknown preset', () => {
      expect(getPresetStage('unknown-preset')).toBeNull();
    });
  });

  describe('isRepeatableStage', () => {
    it('should return true for ANALYSIS', () => {
      expect(isRepeatableStage(DSPStage.ANALYSIS)).toBe(true);
    });

    it('should return true for EQ', () => {
      expect(isRepeatableStage(DSPStage.EQ)).toBe(true);
    });

    it('should return false for LIMITING', () => {
      expect(isRepeatableStage(DSPStage.LIMITING)).toBe(false);
    });
  });

  describe('isNonRepeatableStage', () => {
    it('should return true for LIMITING', () => {
      expect(isNonRepeatableStage(DSPStage.LIMITING)).toBe(true);
    });

    it('should return true for DITHER', () => {
      expect(isNonRepeatableStage(DSPStage.DITHER)).toBe(true);
    });

    it('should return false for EQ', () => {
      expect(isNonRepeatableStage(DSPStage.EQ)).toBe(false);
    });
  });

  describe('getRecommendedNextStages', () => {
    it('should return all stages after ANALYSIS', () => {
      const next = getRecommendedNextStages(DSPStage.ANALYSIS);
      expect(next).toContain(DSPStage.ANALYSIS);
      expect(next).toContain(DSPStage.FORMAT_CONVERSION);
    });

    it('should only return later stages after LIMITING', () => {
      const next = getRecommendedNextStages(DSPStage.LIMITING);
      expect(next).toContain(DSPStage.LIMITING);
      expect(next).toContain(DSPStage.STEREO);
      expect(next).not.toContain(DSPStage.EQ);
    });

    it('should return all stages for unknown stage', () => {
      const next = getRecommendedNextStages('UNKNOWN');
      expect(next).toHaveLength(9);
    });
  });

  describe('buildOptimalOrder', () => {
    it('should sort stages into correct order', () => {
      const unordered = [DSPStage.LIMITING, DSPStage.EQ, DSPStage.ANALYSIS];
      const ordered = buildOptimalOrder(unordered);
      expect(ordered[0]).toBe(DSPStage.ANALYSIS);
      expect(ordered[1]).toBe(DSPStage.EQ);
      expect(ordered[2]).toBe(DSPStage.LIMITING);
    });

    it('should handle empty array', () => {
      expect(buildOptimalOrder([])).toEqual([]);
    });

    it('should handle null', () => {
      expect(buildOptimalOrder(null)).toEqual([]);
    });

    it('should put unknown stages at end', () => {
      const unordered = ['UNKNOWN', DSPStage.ANALYSIS];
      const ordered = buildOptimalOrder(unordered);
      expect(ordered[0]).toBe(DSPStage.ANALYSIS);
      expect(ordered[1]).toBe('UNKNOWN');
    });
  });
});

// ============================================================================
// Detection Functions Tests
// ============================================================================

describe('Detection Functions', () => {
  describe('findProblematicSequences', () => {
    it('should detect limiting before dynamics', () => {
      const stages = [DSPStage.LIMITING, DSPStage.DYNAMICS];
      const problems = findProblematicSequences(stages);
      expect(problems).toHaveLength(1);
      expect(problems[0].before).toBe(DSPStage.LIMITING);
      expect(problems[0].after).toBe(DSPStage.DYNAMICS);
    });

    it('should detect dither before limiting', () => {
      const stages = [DSPStage.DITHER, DSPStage.LIMITING];
      const problems = findProblematicSequences(stages);
      expect(problems).toHaveLength(1);
      expect(problems[0].severity).toBe(ViolationSeverity.CRITICAL);
    });

    it('should return empty for valid sequence', () => {
      const stages = [DSPStage.ANALYSIS, DSPStage.EQ, DSPStage.LIMITING];
      const problems = findProblematicSequences(stages);
      expect(problems).toHaveLength(0);
    });

    it('should detect multiple problems', () => {
      const stages = [DSPStage.DITHER, DSPStage.LIMITING, DSPStage.DYNAMICS];
      const problems = findProblematicSequences(stages);
      expect(problems.length).toBeGreaterThan(1);
    });
  });

  describe('findOutOfOrderStages', () => {
    it('should detect out of order EQ after LIMITING', () => {
      const stages = [DSPStage.LIMITING, DSPStage.EQ];
      const violations = findOutOfOrderStages(stages);
      expect(violations).toHaveLength(1);
      expect(violations[0].stage).toBe(DSPStage.EQ);
    });

    it('should return empty for correct order', () => {
      const stages = [DSPStage.ANALYSIS, DSPStage.EQ, DSPStage.LIMITING];
      const violations = findOutOfOrderStages(stages);
      expect(violations).toHaveLength(0);
    });

    it('should handle unknown stages gracefully', () => {
      const stages = ['UNKNOWN', DSPStage.LIMITING];
      const violations = findOutOfOrderStages(stages);
      expect(violations).toHaveLength(0);
    });
  });

  describe('findRepeatViolations', () => {
    it('should detect repeated LIMITING', () => {
      const stages = [DSPStage.LIMITING, DSPStage.LIMITING];
      const violations = findRepeatViolations(stages);
      expect(violations).toHaveLength(1);
      expect(violations[0].stage).toBe(DSPStage.LIMITING);
      expect(violations[0].count).toBe(2);
    });

    it('should detect repeated DITHER as critical', () => {
      const stages = [DSPStage.DITHER, DSPStage.DITHER];
      const violations = findRepeatViolations(stages);
      expect(violations).toHaveLength(1);
      expect(violations[0].severity).toBe(ViolationSeverity.CRITICAL);
    });

    it('should allow repeated EQ', () => {
      const stages = [DSPStage.EQ, DSPStage.EQ];
      const violations = findRepeatViolations(stages);
      expect(violations).toHaveLength(0);
    });

    it('should allow repeated ANALYSIS', () => {
      const stages = [DSPStage.ANALYSIS, DSPStage.ANALYSIS];
      const violations = findRepeatViolations(stages);
      expect(violations).toHaveLength(0);
    });
  });
});

// ============================================================================
// validateStageSequence Tests
// ============================================================================

describe('validateStageSequence', () => {
  it('should return VALID for empty sequence', () => {
    const result = validateStageSequence([]);
    expect(result.status).toBe(ValidationStatus.VALID);
  });

  it('should return VALID for correct order', () => {
    const stages = [DSPStage.ANALYSIS, DSPStage.EQ, DSPStage.DYNAMICS, DSPStage.LIMITING];
    const result = validateStageSequence(stages);
    expect(result.status).toBe(ValidationStatus.VALID);
    expect(result.violations).toHaveLength(0);
  });

  it('should return WARNING for minor order issues', () => {
    const stages = [DSPStage.LIMITING, DSPStage.EQ]; // EQ after limiting
    const result = validateStageSequence(stages);
    expect(result.status).toBe(ValidationStatus.WARNING);
  });

  it('should return INVALID for critical sequences', () => {
    const stages = [DSPStage.DITHER, DSPStage.DYNAMICS];
    const result = validateStageSequence(stages);
    expect(result.status).toBe(ValidationStatus.INVALID);
  });

  it('should return INVALID for repeated LIMITING', () => {
    const stages = [DSPStage.LIMITING, DSPStage.LIMITING];
    const result = validateStageSequence(stages);
    expect(result.status).toBe(ValidationStatus.INVALID);
  });

  it('should include recommendations', () => {
    const stages = [DSPStage.LIMITING, DSPStage.DYNAMICS];
    const result = validateStageSequence(stages);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('should count unique stages', () => {
    const stages = [DSPStage.ANALYSIS, DSPStage.EQ, DSPStage.EQ, DSPStage.LIMITING];
    const result = validateStageSequence(stages);
    expect(result.stageCount).toBe(4);
    expect(result.uniqueStages).toHaveLength(3);
  });

  it('should handle null input', () => {
    const result = validateStageSequence(null);
    expect(result.status).toBe(ValidationStatus.VALID);
  });
});

// ============================================================================
// validatePresetSequence Tests
// ============================================================================

describe('validatePresetSequence', () => {
  it('should return VALID for empty sequence', () => {
    const result = validatePresetSequence([]);
    expect(result.status).toBe(ValidationStatus.VALID);
  });

  it('should validate known presets', () => {
    const presets = ['analyze-full', 'normalize-loudness', 'master-standard'];
    const result = validatePresetSequence(presets);
    expect(result.status).toBe(ValidationStatus.VALID);
  });

  it('should detect problematic preset order', () => {
    const presets = ['master-standard', 'compress-heavy']; // Limiting before dynamics
    const result = validatePresetSequence(presets);
    expect(result.status).toBe(ValidationStatus.INVALID);
  });

  it('should include mapped stages', () => {
    const presets = ['analyze-full', 'master-standard'];
    const result = validatePresetSequence(presets);
    expect(result.mappedStages).toContain(DSPStage.ANALYSIS);
    expect(result.mappedStages).toContain(DSPStage.LIMITING);
  });

  it('should flag unknown presets as INFO', () => {
    const presets = ['unknown-preset'];
    const result = validatePresetSequence(presets);
    const unknownViolation = result.violations.find(v => v.type === 'UNKNOWN_PRESET');
    expect(unknownViolation).toBeDefined();
    expect(unknownViolation.severity).toBe(ViolationSeverity.INFO);
  });
});

// ============================================================================
// validateProposedPreset Tests
// ============================================================================

describe('validateProposedPreset', () => {
  it('should allow valid addition', () => {
    const existing = ['analyze-full', 'normalize-loudness'];
    const result = validateProposedPreset(existing, 'master-standard');
    expect(result.canProceed).toBe(true);
  });

  it('should reject problematic addition', () => {
    const existing = ['master-standard']; // Already limited
    const result = validateProposedPreset(existing, 'compress-heavy');
    expect(result.canProceed).toBe(false);
  });

  it('should include proposed preset info', () => {
    const result = validateProposedPreset([], 'master-standard');
    expect(result.proposedPreset).toBe('master-standard');
    expect(result.proposedStage).toBe(DSPStage.LIMITING);
  });

  it('should include existing stages', () => {
    const existing = ['analyze-full', 'eq-correct'];
    const result = validateProposedPreset(existing, 'master-standard');
    expect(result.existingStages).toContain(DSPStage.ANALYSIS);
    expect(result.existingStages).toContain(DSPStage.EQ);
  });

  it('should handle empty existing presets', () => {
    const result = validateProposedPreset([], 'analyze-full');
    expect(result.canProceed).toBe(true);
  });

  it('should handle null existing presets', () => {
    const result = validateProposedPreset(null, 'analyze-full');
    expect(result.canProceed).toBe(true);
  });

  it('should reject repeated limiting', () => {
    const existing = ['master-standard'];
    const result = validateProposedPreset(existing, 'limit-peak');
    expect(result.canProceed).toBe(false);
  });
});

// ============================================================================
// quickCheck Tests
// ============================================================================

describe('quickCheck', () => {
  it('should return isValid true for valid sequence', () => {
    const stages = [DSPStage.ANALYSIS, DSPStage.LIMITING];
    const result = quickCheck(stages);
    expect(result.isValid).toBe(true);
    expect(result.hasErrors).toBe(false);
  });

  it('should return hasWarnings for warnings', () => {
    const stages = [DSPStage.LIMITING, DSPStage.EQ];
    const result = quickCheck(stages);
    expect(result.hasWarnings).toBe(true);
  });

  it('should return hasErrors for errors', () => {
    const stages = [DSPStage.DITHER, DSPStage.LIMITING];
    const result = quickCheck(stages);
    expect(result.hasErrors).toBe(true);
  });

  it('should count violations by severity', () => {
    const stages = [DSPStage.DITHER, DSPStage.LIMITING, DSPStage.DYNAMICS];
    const result = quickCheck(stages);
    expect(result.violationCount).toBeGreaterThan(0);
    expect(result.criticalCount).toBeGreaterThan(0);
  });

  it('should handle empty array', () => {
    const result = quickCheck([]);
    expect(result.isValid).toBe(true);
    expect(result.violationCount).toBe(0);
  });
});

// ============================================================================
// generateRecommendations Tests
// ============================================================================

describe('generateRecommendations', () => {
  it('should generate recommendations for critical violations', () => {
    const stages = [DSPStage.DITHER];
    const violations = [{
      type: 'REPEAT_VIOLATION',
      stage: DSPStage.DITHER,
      severity: ViolationSeverity.CRITICAL,
      count: 2
    }];
    const recs = generateRecommendations(stages, violations);
    expect(recs.some(r => r.includes('CRITICAL'))).toBe(true);
  });

  it('should generate recommendations for out of order stages', () => {
    const stages = [DSPStage.LIMITING, DSPStage.EQ];
    const violations = [{
      type: 'OUT_OF_ORDER',
      stage: DSPStage.EQ,
      severity: ViolationSeverity.WARNING
    }];
    const recs = generateRecommendations(stages, violations);
    expect(recs.length).toBeGreaterThan(0);
  });

  it('should return empty for no violations', () => {
    const recs = generateRecommendations([], []);
    expect(recs).toHaveLength(0);
  });

  it('should recommend dithering when limiting present without dither', () => {
    // Note: this recommendation only appears when there are violations to process
    // For a pure recommendation without violations, the function returns empty
    const stages = [DSPStage.LIMITING, DSPStage.EQ]; // Out of order to trigger violation processing
    const violations = [{
      type: 'OUT_OF_ORDER',
      stage: DSPStage.EQ,
      severity: ViolationSeverity.WARNING
    }];
    const recs = generateRecommendations(stages, violations);
    expect(recs.some(r => r.toLowerCase().includes('dither'))).toBe(true);
  });
});

// ============================================================================
// Module Exports Tests
// ============================================================================

describe('Module Exports', () => {
  const exports = require('../services/dspChainOrderValidator');

  it('should export validateStageSequence', () => {
    expect(typeof exports.validateStageSequence).toBe('function');
  });

  it('should export validatePresetSequence', () => {
    expect(typeof exports.validatePresetSequence).toBe('function');
  });

  it('should export validateProposedPreset', () => {
    expect(typeof exports.validateProposedPreset).toBe('function');
  });

  it('should export quickCheck', () => {
    expect(typeof exports.quickCheck).toBe('function');
  });

  it('should export utility functions', () => {
    expect(typeof exports.getStageOrder).toBe('function');
    expect(typeof exports.getPresetStage).toBe('function');
    expect(typeof exports.isRepeatableStage).toBe('function');
    expect(typeof exports.isNonRepeatableStage).toBe('function');
    expect(typeof exports.getRecommendedNextStages).toBe('function');
    expect(typeof exports.buildOptimalOrder).toBe('function');
  });

  it('should export detection functions', () => {
    expect(typeof exports.findProblematicSequences).toBe('function');
    expect(typeof exports.findOutOfOrderStages).toBe('function');
    expect(typeof exports.findRepeatViolations).toBe('function');
    expect(typeof exports.generateRecommendations).toBe('function');
  });

  it('should export all constants', () => {
    expect(exports.DSPStage).toBeDefined();
    expect(exports.ValidationStatus).toBeDefined();
    expect(exports.ViolationSeverity).toBeDefined();
    expect(exports.SAFE_ORDER).toBeDefined();
    expect(exports.PRESET_TO_STAGE).toBeDefined();
    expect(exports.REPEATABLE_STAGES).toBeDefined();
    expect(exports.NON_REPEATABLE_STAGES).toBeDefined();
    expect(exports.PROBLEMATIC_SEQUENCES).toBeDefined();
    expect(exports.STATUS_DESCRIPTIONS).toBeDefined();
  });
});
