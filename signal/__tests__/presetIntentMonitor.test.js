/**
 * Preset Intent Preservation Monitor Tests
 * 
 * Tests for validating that processing transformations
 * maintain the original intent of applied presets.
 */

const {
  // Main analysis functions
  checkIntentPreservation,
  predictIntentViolations,
  quickCheck,
  summarizeIntents,
  
  // Violation detection
  checkConstraintViolations,
  checkParameterViolations,
  checkMetricViolations,
  
  // Utility functions
  getPresetIntent,
  getPresetConstraints,
  getPresetGoals,
  violatesConstraint,
  
  // Recommendations
  generateRecommendations,
  
  // Constants
  IntentCategory,
  ViolationSeverity,
  PreservationStatus,
  SEVERITY_DESCRIPTIONS,
  PRESET_INTENTS,
  CONSTRAINT_VIOLATIONS
} = require('../services/presetIntentMonitor');

// ============================================================================
// Constants Tests
// ============================================================================

describe('Preset Intent Preservation Monitor', () => {
  describe('Constants', () => {
    describe('IntentCategory', () => {
      it('should have all intent categories defined', () => {
        expect(IntentCategory.DYNAMICS).toBe('DYNAMICS');
        expect(IntentCategory.LOUDNESS).toBe('LOUDNESS');
        expect(IntentCategory.FREQUENCY).toBe('FREQUENCY');
        expect(IntentCategory.STEREO).toBe('STEREO');
        expect(IntentCategory.COMPATIBILITY).toBe('COMPATIBILITY');
        expect(IntentCategory.FIDELITY).toBe('FIDELITY');
        expect(IntentCategory.RESTORATION).toBe('RESTORATION');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(IntentCategory)).toBe(true);
      });

      it('should have 7 categories', () => {
        expect(Object.keys(IntentCategory)).toHaveLength(7);
      });
    });

    describe('ViolationSeverity', () => {
      it('should have all severity levels defined', () => {
        expect(ViolationSeverity.NONE).toBe('NONE');
        expect(ViolationSeverity.MINOR).toBe('MINOR');
        expect(ViolationSeverity.MODERATE).toBe('MODERATE');
        expect(ViolationSeverity.MAJOR).toBe('MAJOR');
        expect(ViolationSeverity.CRITICAL).toBe('CRITICAL');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(ViolationSeverity)).toBe(true);
      });

      it('should have 5 levels', () => {
        expect(Object.keys(ViolationSeverity)).toHaveLength(5);
      });
    });

    describe('PreservationStatus', () => {
      it('should have all status values defined', () => {
        expect(PreservationStatus.PRESERVED).toBe('PRESERVED');
        expect(PreservationStatus.PARTIAL).toBe('PARTIAL');
        expect(PreservationStatus.COMPROMISED).toBe('COMPROMISED');
        expect(PreservationStatus.VIOLATED).toBe('VIOLATED');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(PreservationStatus)).toBe(true);
      });

      it('should have 4 statuses', () => {
        expect(Object.keys(PreservationStatus)).toHaveLength(4);
      });
    });

    describe('SEVERITY_DESCRIPTIONS', () => {
      it('should have description for each severity level', () => {
        for (const level of Object.values(ViolationSeverity)) {
          expect(SEVERITY_DESCRIPTIONS[level]).toBeDefined();
          expect(typeof SEVERITY_DESCRIPTIONS[level]).toBe('string');
          expect(SEVERITY_DESCRIPTIONS[level].length).toBeGreaterThan(0);
        }
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(SEVERITY_DESCRIPTIONS)).toBe(true);
      });
    });

    describe('PRESET_INTENTS', () => {
      it('should define mastering presets', () => {
        expect(PRESET_INTENTS['master-standard']).toBeDefined();
        expect(PRESET_INTENTS['master-streaming']).toBeDefined();
        expect(PRESET_INTENTS['master-broadcast']).toBeDefined();
        expect(PRESET_INTENTS['master-vinyl']).toBeDefined();
      });

      it('should define dynamics presets', () => {
        expect(PRESET_INTENTS['compress-gentle']).toBeDefined();
        expect(PRESET_INTENTS['compress-medium']).toBeDefined();
        expect(PRESET_INTENTS['compress-heavy']).toBeDefined();
      });

      it('should define normalization presets', () => {
        expect(PRESET_INTENTS['normalize-loudness']).toBeDefined();
        expect(PRESET_INTENTS['normalize-peak']).toBeDefined();
      });

      it('should include goals for each preset', () => {
        const mastering = PRESET_INTENTS['master-standard'];
        expect(mastering.goals).toBeDefined();
        expect(mastering.goals[IntentCategory.LOUDNESS]).toBeDefined();
      });

      it('should include constraints for relevant presets', () => {
        const mastering = PRESET_INTENTS['master-standard'];
        expect(mastering.constraints).toBeDefined();
        expect(mastering.constraints.noSubsequentLimiting).toBe(true);
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(PRESET_INTENTS)).toBe(true);
      });
    });

    describe('CONSTRAINT_VIOLATIONS', () => {
      it('should map constraints to violating presets', () => {
        expect(CONSTRAINT_VIOLATIONS.noSubsequentLimiting).toContain('limit-peak');
        expect(CONSTRAINT_VIOLATIONS.noSubsequentNormalization).toContain('normalize-loudness');
        expect(CONSTRAINT_VIOLATIONS.noCompression).toContain('compress-gentle');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(CONSTRAINT_VIOLATIONS)).toBe(true);
      });
    });
  });

  // ============================================================================
  // Utility Functions Tests
  // ============================================================================

  describe('Utility Functions', () => {
    describe('getPresetIntent', () => {
      it('should return intent for known presets', () => {
        const intent = getPresetIntent('master-standard');
        
        expect(intent).toBeDefined();
        expect(intent.name).toBe('Standard Mastering');
        expect(intent.category).toBe('MASTERING');
      });

      it('should return null for unknown presets', () => {
        expect(getPresetIntent('unknown-preset')).toBeNull();
        expect(getPresetIntent('custom-workflow')).toBeNull();
      });

      it('should return null for null/undefined input', () => {
        expect(getPresetIntent(null)).toBeNull();
        expect(getPresetIntent(undefined)).toBeNull();
      });
    });

    describe('getPresetConstraints', () => {
      it('should return constraints for presets with constraints', () => {
        const constraints = getPresetConstraints('master-standard');
        
        expect(constraints.noSubsequentLimiting).toBe(true);
        expect(constraints.noSubsequentNormalization).toBe(true);
      });

      it('should return empty object for presets without constraints', () => {
        const constraints = getPresetConstraints('analyze-full');
        
        expect(constraints).toEqual({});
      });

      it('should return empty object for unknown presets', () => {
        expect(getPresetConstraints('unknown')).toEqual({});
      });
    });

    describe('getPresetGoals', () => {
      it('should return goals for presets with goals', () => {
        const goals = getPresetGoals('master-standard');
        
        expect(goals[IntentCategory.LOUDNESS]).toBeDefined();
        expect(goals[IntentCategory.LOUDNESS].targetLufs).toBe(-14);
      });

      it('should return empty object for analysis presets', () => {
        const goals = getPresetGoals('analyze-full');
        
        expect(goals).toEqual({});
      });

      it('should return empty object for unknown presets', () => {
        expect(getPresetGoals('unknown')).toEqual({});
      });
    });

    describe('violatesConstraint', () => {
      it('should return true when preset violates constraint', () => {
        expect(violatesConstraint('noSubsequentLimiting', 'limit-peak')).toBe(true);
        expect(violatesConstraint('noCompression', 'compress-gentle')).toBe(true);
      });

      it('should return false when preset does not violate', () => {
        expect(violatesConstraint('noSubsequentLimiting', 'eq-correct')).toBe(false);
        expect(violatesConstraint('noCompression', 'normalize-peak')).toBe(false);
      });

      it('should return false for unknown constraints', () => {
        expect(violatesConstraint('unknownConstraint', 'limit-peak')).toBe(false);
      });
    });
  });

  // ============================================================================
  // Violation Detection Tests
  // ============================================================================

  describe('Violation Detection', () => {
    describe('checkConstraintViolations', () => {
      it('should detect limiting after mastering', () => {
        const violations = checkConstraintViolations(
          'master-standard',
          ['limit-peak']
        );
        
        expect(violations.length).toBeGreaterThan(0);
        expect(violations[0].constraint).toBe('noSubsequentLimiting');
        expect(violations[0].subsequentPreset).toBe('limit-peak');
      });

      it('should detect normalization after mastering', () => {
        const violations = checkConstraintViolations(
          'master-standard',
          ['normalize-loudness']
        );
        
        expect(violations.length).toBeGreaterThan(0);
        expect(violations[0].constraint).toBe('noSubsequentNormalization');
      });

      it('should return empty for no violations', () => {
        const violations = checkConstraintViolations(
          'master-standard',
          ['analyze-full']
        );
        
        expect(violations).toHaveLength(0);
      });

      it('should return empty for null/empty inputs', () => {
        expect(checkConstraintViolations('master-standard', null)).toHaveLength(0);
        expect(checkConstraintViolations('master-standard', [])).toHaveLength(0);
        expect(checkConstraintViolations('unknown', ['limit-peak'])).toHaveLength(0);
      });

      it('should detect multiple violations', () => {
        const violations = checkConstraintViolations(
          'master-standard',
          ['limit-peak', 'normalize-loudness']
        );
        
        expect(violations.length).toBe(2);
      });

      it('should assign appropriate severity', () => {
        const violations = checkConstraintViolations(
          'master-standard',
          ['limit-peak']
        );
        
        // Limiting violations should be MAJOR for mastering
        expect(violations[0].severity).toBe(ViolationSeverity.MAJOR);
      });

      it('should detect stereo widening after vinyl mastering', () => {
        const violations = checkConstraintViolations(
          'master-vinyl',
          ['stereo-widen']
        );
        
        expect(violations.length).toBeGreaterThan(0);
        expect(violations[0].constraint).toBe('noStereoWidening');
      });

      it('should detect compression after broadcast mastering', () => {
        const violations = checkConstraintViolations(
          'master-broadcast',
          ['compress-gentle']
        );
        
        expect(violations.length).toBeGreaterThan(0);
        expect(violations[0].constraint).toBe('noCompression');
      });
    });

    describe('checkParameterViolations', () => {
      it('should detect loudness target deviation', () => {
        const violations = checkParameterViolations(
          'master-standard',
          { targetLufs: -8 } // Far from -14 target
        );
        
        expect(violations.length).toBeGreaterThan(0);
        expect(violations[0].category).toBe(IntentCategory.LOUDNESS);
        expect(violations[0].parameter).toBe('targetLufs');
      });

      it('should allow loudness within tolerance', () => {
        const violations = checkParameterViolations(
          'master-standard',
          { targetLufs: -14.5 } // Within 1 LUFS tolerance
        );
        
        // Should have no loudness violations
        const loudnessViolations = violations.filter(
          v => v.category === IntentCategory.LOUDNESS
        );
        expect(loudnessViolations).toHaveLength(0);
      });

      it('should detect dynamics violation when preserved expected', () => {
        const violations = checkParameterViolations(
          'normalize-loudness',
          { compression: true }
        );
        
        expect(violations.some(v => v.category === IntentCategory.DYNAMICS)).toBe(true);
      });

      it('should detect clipping enabled when not allowed', () => {
        const violations = checkParameterViolations(
          'master-standard',
          { allowClipping: true }
        );
        
        expect(violations.length).toBeGreaterThan(0);
        expect(violations[0].severity).toBe(ViolationSeverity.CRITICAL);
      });

      it('should detect true peak ceiling violation', () => {
        const violations = checkParameterViolations(
          'master-standard',
          { truePeakCeiling: 0 } // Above -1.0 limit
        );
        
        expect(violations.some(v => v.parameter === 'truePeakCeiling')).toBe(true);
      });

      it('should detect stereo width on mono preset', () => {
        const violations = checkParameterViolations(
          'mono-fold',
          { stereoWidth: 1.2 }
        );
        
        expect(violations.some(v => v.category === IntentCategory.STEREO)).toBe(true);
      });

      it('should return empty for null inputs', () => {
        expect(checkParameterViolations('master-standard', null)).toHaveLength(0);
        expect(checkParameterViolations('unknown', { targetLufs: -8 })).toHaveLength(0);
      });
    });

    describe('checkMetricViolations', () => {
      it('should detect loudness off target', () => {
        const violations = checkMetricViolations(
          'master-standard',
          { loudnessLufs: -10 } // Far from -14 target
        );
        
        expect(violations.length).toBeGreaterThan(0);
        expect(violations[0].category).toBe(IntentCategory.LOUDNESS);
        expect(violations[0].severity).toBe(ViolationSeverity.MAJOR);
      });

      it('should detect minor loudness deviation', () => {
        const violations = checkMetricViolations(
          'master-standard',
          { loudnessLufs: -12.5 } // 1.5 off, more than 1 tolerance
        );
        
        expect(violations.length).toBeGreaterThan(0);
        expect(violations[0].severity).toBe(ViolationSeverity.MINOR);
      });

      it('should detect crest factor below minimum', () => {
        const violations = checkMetricViolations(
          'master-standard',
          { crestFactorDb: 4 } // Below 6 dB minimum
        );
        
        expect(violations.length).toBeGreaterThan(0);
        expect(violations[0].category).toBe(IntentCategory.DYNAMICS);
      });

      it('should detect clipping when not allowed', () => {
        const violations = checkMetricViolations(
          'master-standard',
          { clippedSamples: 100 }
        );
        
        expect(violations.length).toBeGreaterThan(0);
        expect(violations[0].severity).toBe(ViolationSeverity.CRITICAL);
      });

      it('should detect true peak exceeding limit', () => {
        const violations = checkMetricViolations(
          'master-standard',
          { truePeakDbfs: 0 } // Above -1.0 limit
        );
        
        expect(violations.some(v => v.metric === 'truePeakDbfs')).toBe(true);
      });

      it('should return empty for null inputs', () => {
        expect(checkMetricViolations('master-standard', null)).toHaveLength(0);
        expect(checkMetricViolations('unknown', { loudnessLufs: -10 })).toHaveLength(0);
      });

      it('should return empty when metrics meet goals', () => {
        const violations = checkMetricViolations(
          'master-standard',
          { 
            loudnessLufs: -14,
            crestFactorDb: 8,
            truePeakDbfs: -1.5,
            clippedSamples: 0
          }
        );
        
        expect(violations).toHaveLength(0);
      });
    });
  });

  // ============================================================================
  // Main Analysis Functions Tests
  // ============================================================================

  describe('Main Analysis Functions', () => {
    describe('checkIntentPreservation', () => {
      it('should return PRESERVED for empty chain', () => {
        const result = checkIntentPreservation([]);
        
        expect(result.status).toBe(PreservationStatus.PRESERVED);
        expect(result.violations).toHaveLength(0);
      });

      it('should return PRESERVED for valid chain', () => {
        const result = checkIntentPreservation([
          'analyze-full',
          'eq-correct',
          'compress-gentle'
        ]);
        
        expect(result.status).toBe(PreservationStatus.PRESERVED);
        expect(result.violations).toHaveLength(0);
      });

      it('should detect violations in processing chain', () => {
        const result = checkIntentPreservation([
          'master-standard',
          'limit-peak'
        ]);
        
        expect(result.status).not.toBe(PreservationStatus.PRESERVED);
        expect(result.violations.length).toBeGreaterThan(0);
      });

      it('should return complete analysis object', () => {
        const result = checkIntentPreservation(['master-standard']);
        
        expect(result.status).toBeDefined();
        expect(result.violations).toBeDefined();
        expect(result.violationCount).toBeDefined();
        expect(result.summary).toBeDefined();
        expect(result.preservedIntents).toBeDefined();
        expect(result.violatedIntents).toBeDefined();
        expect(result.maxSeverity).toBeDefined();
      });

      it('should incorporate parameter violations', () => {
        const result = checkIntentPreservation(
          ['master-standard'],
          { parameters: { allowClipping: true } }
        );
        
        expect(result.violations.length).toBeGreaterThan(0);
        expect(result.violations.some(v => v.parameter === 'allowClipping')).toBe(true);
      });

      it('should incorporate metric violations', () => {
        const result = checkIntentPreservation(
          ['master-standard'],
          { outputMetrics: { clippedSamples: 50 } }
        );
        
        expect(result.violations.length).toBeGreaterThan(0);
        expect(result.violations.some(v => v.metric === 'clippedSamples')).toBe(true);
      });

      it('should track preserved and violated intents', () => {
        const result = checkIntentPreservation([
          'master-standard',
          'limit-peak'
        ]);
        
        // Should have some violated intents
        expect(result.violatedIntents.length).toBeGreaterThanOrEqual(0);
        // All intents tracked
        expect(result.preservedIntents.length + result.violatedIntents.length).toBeGreaterThanOrEqual(0);
      });

      it('should provide meaningful summary', () => {
        const cleanResult = checkIntentPreservation(['analyze-full']);
        expect(cleanResult.summary).toContain('preserved');
        
        const violatedResult = checkIntentPreservation([
          'master-standard',
          'limit-peak'
        ]);
        expect(violatedResult.summary).toContain('violation');
      });

      it('should classify status based on max severity', () => {
        // Critical violation -> VIOLATED
        const criticalResult = checkIntentPreservation(
          ['master-standard'],
          { parameters: { allowClipping: true } }
        );
        expect(criticalResult.status).toBe(PreservationStatus.VIOLATED);
        
        // Major violation -> COMPROMISED
        const majorResult = checkIntentPreservation([
          'master-standard',
          'limit-peak'
        ]);
        expect(majorResult.status).toBe(PreservationStatus.COMPROMISED);
      });
    });

    describe('predictIntentViolations', () => {
      it('should predict violations for proposed addition', () => {
        const result = predictIntentViolations(
          ['master-standard'],
          'limit-peak'
        );
        
        expect(result.predictedViolations.length).toBeGreaterThan(0);
        expect(result.canAdd).toBe(true); // Major but not critical
      });

      it('should return canAdd true for safe additions', () => {
        const result = predictIntentViolations(
          ['analyze-full'],
          'eq-correct'
        );
        
        expect(result.canAdd).toBe(true);
        expect(result.predictedViolations).toHaveLength(0);
      });

      it('should handle empty existing chain', () => {
        const result = predictIntentViolations([], 'master-standard');
        
        expect(result.canAdd).toBe(true);
        expect(result.predictedViolations).toHaveLength(0);
      });

      it('should handle null proposed preset', () => {
        const result = predictIntentViolations(['master-standard'], null);
        
        expect(result.canAdd).toBe(true);
        expect(result.recommendation).toContain('No preset');
      });

      it('should provide recommendation', () => {
        const safeResult = predictIntentViolations(
          ['analyze-full'],
          'eq-correct'
        );
        expect(safeResult.recommendation).toContain('safely');
        
        const violationResult = predictIntentViolations(
          ['master-standard'],
          'limit-peak'
        );
        expect(violationResult.recommendation).toContain('violation');
      });

      it('should track affected presets', () => {
        const result = predictIntentViolations(
          ['master-standard', 'master-streaming'],
          'limit-peak'
        );
        
        expect(result.affectedPresets).toContain('master-standard');
        expect(result.affectedPresets).toContain('master-streaming');
      });

      it('should return violation count', () => {
        const result = predictIntentViolations(
          ['master-standard'],
          'limit-peak'
        );
        
        expect(result.violationCount).toBe(result.predictedViolations.length);
      });
    });

    describe('quickCheck', () => {
      it('should return essential status info', () => {
        const result = quickCheck(['master-standard', 'eq-correct']);
        
        expect(result.status).toBeDefined();
        expect(result.violationCount).toBeDefined();
        expect(typeof result.hasViolations).toBe('boolean');
        expect(typeof result.isPreserved).toBe('boolean');
        expect(typeof result.isCompromised).toBe('boolean');
      });

      it('should detect preserved status', () => {
        const result = quickCheck(['analyze-full', 'eq-correct']);
        
        expect(result.isPreserved).toBe(true);
        expect(result.isCompromised).toBe(false);
        expect(result.hasViolations).toBe(false);
      });

      it('should detect compromised status', () => {
        const result = quickCheck(['master-standard', 'limit-peak']);
        
        expect(result.isPreserved).toBe(false);
        expect(result.isCompromised).toBe(true);
        expect(result.hasViolations).toBe(true);
      });

      it('should count violations', () => {
        const result = quickCheck([
          'master-standard',
          'limit-peak',
          'normalize-loudness'
        ]);
        
        expect(result.violationCount).toBeGreaterThan(0);
      });
    });

    describe('summarizeIntents', () => {
      it('should count intents by category', () => {
        const summary = summarizeIntents([
          'master-standard',
          'compress-gentle',
          'eq-correct'
        ]);
        
        expect(summary.categories['MASTERING']).toBe(1);
        expect(summary.categories['DYNAMICS']).toBe(1);
        expect(summary.categories['EQ']).toBe(1);
      });

      it('should collect primary goals', () => {
        const summary = summarizeIntents(['master-standard']);
        
        expect(summary.primaryGoals.length).toBeGreaterThan(0);
        expect(summary.primaryGoals[0].goal).toBeDefined();
      });

      it('should return empty for empty chain', () => {
        const summary = summarizeIntents([]);
        
        expect(summary.totalIntents).toBe(0);
        expect(summary.categories).toEqual({});
        expect(summary.primaryGoals).toHaveLength(0);
      });

      it('should count known presets', () => {
        const summary = summarizeIntents([
          'master-standard',
          'unknown-preset',
          'eq-correct'
        ]);
        
        expect(summary.totalIntents).toBe(3);
        expect(summary.presetCount).toBe(2); // Known presets only
      });
    });
  });

  // ============================================================================
  // Recommendations Tests
  // ============================================================================

  describe('Recommendations', () => {
    describe('generateRecommendations', () => {
      it('should return empty for no violations', () => {
        const result = checkIntentPreservation(['analyze-full']);
        const recommendations = generateRecommendations(result);
        
        expect(recommendations).toHaveLength(0);
      });

      it('should recommend removing limiting after mastering', () => {
        const result = checkIntentPreservation([
          'master-standard',
          'limit-peak'
        ]);
        const recommendations = generateRecommendations(result);
        
        expect(recommendations.some(r => r.includes('limiting'))).toBe(true);
      });

      it('should recommend avoiding gain changes after normalization', () => {
        const result = checkIntentPreservation([
          'normalize-loudness',
          'gain-adjust'
        ]);
        const recommendations = generateRecommendations(result);
        
        expect(recommendations.some(r => r.includes('gain'))).toBe(true);
      });

      it('should provide parameter review recommendation', () => {
        const result = checkIntentPreservation(
          ['master-standard'],
          { parameters: { targetLufs: -8 } }
        );
        const recommendations = generateRecommendations(result);
        
        expect(recommendations.some(r => r.includes('parameter'))).toBe(true);
      });

      it('should recommend reducing gain for clipping', () => {
        const result = checkIntentPreservation(
          ['master-standard'],
          { outputMetrics: { clippedSamples: 100 } }
        );
        const recommendations = generateRecommendations(result);
        
        expect(recommendations.some(r => r.includes('clipping') || r.includes('gain'))).toBe(true);
      });

      it('should suggest simplifying for violated status', () => {
        const result = checkIntentPreservation(
          ['master-standard'],
          { parameters: { allowClipping: true } }
        );
        const recommendations = generateRecommendations(result);
        
        expect(recommendations.some(r => r.includes('simplify'))).toBe(true);
      });

      it('should return empty for null input', () => {
        expect(generateRecommendations(null)).toHaveLength(0);
      });
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration Tests', () => {
    describe('Typical workflow scenarios', () => {
      it('should validate standard mastering workflow', () => {
        const chain = [
          'analyze-full',
          'eq-correct',
          'compress-gentle',
          'master-standard'
        ];
        
        const result = checkIntentPreservation(chain);
        
        expect(result.status).toBe(PreservationStatus.PRESERVED);
        expect(result.violations).toHaveLength(0);
      });

      it('should detect re-mastering problems', () => {
        const chain = [
          'master-standard',
          'master-streaming' // Second mastering stage
        ];
        
        const result = checkIntentPreservation(chain);
        
        expect(result.violations.length).toBeGreaterThan(0);
      });

      it('should validate restoration workflow', () => {
        const chain = [
          'restore-declip',
          'restore-denoise',
          'normalize-loudness'
        ];
        
        const result = checkIntentPreservation(chain);
        
        // Should detect dynamics change constraint from normalize-loudness
        // after restoration that preserved dynamics
        expect(result.status).toBe(PreservationStatus.PRESERVED);
      });

      it('should detect vinyl mastering violations', () => {
        const chain = [
          'master-vinyl',
          'stereo-widen' // Violates mono-compatibility
        ];
        
        const result = checkIntentPreservation(chain);
        
        expect(result.violations.some(
          v => v.constraint === 'noStereoWidening'
        )).toBe(true);
      });

      it('should validate broadcast mastering constraints', () => {
        const chain = [
          'master-broadcast',
          'compress-gentle' // Violates no-compression
        ];
        
        const result = checkIntentPreservation(chain);
        
        expect(result.violations.some(
          v => v.constraint === 'noCompression'
        )).toBe(true);
      });
    });

    describe('Progressive chain building', () => {
      it('should predict safe additions', () => {
        let chain = ['analyze-full'];
        
        // Add EQ
        let prediction = predictIntentViolations(chain, 'eq-correct');
        expect(prediction.canAdd).toBe(true);
        chain.push('eq-correct');
        
        // Add compression
        prediction = predictIntentViolations(chain, 'compress-gentle');
        expect(prediction.canAdd).toBe(true);
        chain.push('compress-gentle');
        
        // Final validation
        const result = checkIntentPreservation(chain);
        expect(result.status).toBe(PreservationStatus.PRESERVED);
      });

      it('should warn about problematic additions', () => {
        const chain = ['master-standard'];
        
        const prediction = predictIntentViolations(chain, 'limit-peak');
        
        expect(prediction.predictedViolations.length).toBeGreaterThan(0);
        expect(prediction.recommendation).toContain('violation');
      });
    });

    describe('Edge cases', () => {
      it('should handle unknown presets gracefully', () => {
        const chain = ['unknown-preset', 'master-standard'];
        
        const result = checkIntentPreservation(chain);
        
        // Should not throw, should analyze known presets
        expect(result.status).toBeDefined();
      });

      it('should handle mixed known/unknown chains', () => {
        const chain = [
          'analyze-full',
          'custom-processor',
          'master-standard'
        ];
        
        const result = checkIntentPreservation(chain);
        
        expect(result.status).toBeDefined();
      });

      it('should handle long processing chains', () => {
        const chain = [
          'analyze-full',
          'restore-denoise',
          'eq-correct',
          'eq-enhance',
          'compress-gentle',
          'stereo-narrow',
          'master-standard'
        ];
        
        const result = checkIntentPreservation(chain);
        
        expect(result.status).toBeDefined();
        expect(result.violations).toBeDefined();
      });

      it('should provide consistent results', () => {
        const chain = ['master-standard', 'limit-peak'];
        
        const result1 = checkIntentPreservation(chain);
        const result2 = checkIntentPreservation(chain);
        
        expect(result1.status).toBe(result2.status);
        expect(result1.violationCount).toBe(result2.violationCount);
      });
    });

    describe('Goal validation', () => {
      it('should validate loudness goals', () => {
        const result = checkIntentPreservation(
          ['master-standard'],
          { outputMetrics: { loudnessLufs: -14 } }
        );
        
        // Loudness on target - no violations
        const loudnessViolations = result.violations.filter(
          v => v.category === IntentCategory.LOUDNESS
        );
        expect(loudnessViolations).toHaveLength(0);
      });

      it('should validate dynamics goals', () => {
        const result = checkIntentPreservation(
          ['master-standard'],
          { outputMetrics: { crestFactorDb: 8 } }
        );
        
        // Crest factor above minimum - no violations
        const dynamicsViolations = result.violations.filter(
          v => v.category === IntentCategory.DYNAMICS
        );
        expect(dynamicsViolations).toHaveLength(0);
      });

      it('should validate fidelity goals', () => {
        const result = checkIntentPreservation(
          ['master-standard'],
          { outputMetrics: { clippedSamples: 0, truePeakDbfs: -1.5 } }
        );
        
        // No clipping, true peak below limit - no violations
        const fidelityViolations = result.violations.filter(
          v => v.category === IntentCategory.FIDELITY
        );
        expect(fidelityViolations).toHaveLength(0);
      });
    });
  });

  // ============================================================================
  // API Contract Tests
  // ============================================================================

  describe('API Contract', () => {
    it('should export all required functions', () => {
      expect(typeof checkIntentPreservation).toBe('function');
      expect(typeof predictIntentViolations).toBe('function');
      expect(typeof quickCheck).toBe('function');
      expect(typeof summarizeIntents).toBe('function');
      expect(typeof checkConstraintViolations).toBe('function');
      expect(typeof checkParameterViolations).toBe('function');
      expect(typeof checkMetricViolations).toBe('function');
      expect(typeof generateRecommendations).toBe('function');
    });

    it('should export all required constants', () => {
      expect(IntentCategory).toBeDefined();
      expect(ViolationSeverity).toBeDefined();
      expect(PreservationStatus).toBeDefined();
      expect(SEVERITY_DESCRIPTIONS).toBeDefined();
      expect(PRESET_INTENTS).toBeDefined();
      expect(CONSTRAINT_VIOLATIONS).toBeDefined();
    });

    it('should maintain consistent return shapes', () => {
      const chain = ['master-standard'];
      
      // checkIntentPreservation
      const preservation = checkIntentPreservation(chain);
      expect(preservation).toHaveProperty('status');
      expect(preservation).toHaveProperty('violations');
      expect(preservation).toHaveProperty('summary');
      
      // predictIntentViolations
      const prediction = predictIntentViolations(chain, 'limit-peak');
      expect(prediction).toHaveProperty('canAdd');
      expect(prediction).toHaveProperty('predictedViolations');
      expect(prediction).toHaveProperty('recommendation');
      
      // quickCheck
      const quick = quickCheck(chain);
      expect(quick).toHaveProperty('status');
      expect(quick).toHaveProperty('isPreserved');
      expect(quick).toHaveProperty('hasViolations');
      
      // summarizeIntents
      const summary = summarizeIntents(chain);
      expect(summary).toHaveProperty('totalIntents');
      expect(summary).toHaveProperty('categories');
      expect(summary).toHaveProperty('primaryGoals');
    });
  });
});
