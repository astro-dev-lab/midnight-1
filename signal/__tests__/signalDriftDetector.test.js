/**
 * Signal Drift Detector Tests
 * 
 * Tests for out-of-distribution detection including:
 * - Z-score calculations
 * - Mahalanobis distance
 * - OOD indicators
 * - Drift status determination
 * - Confidence reduction
 * 
 * @jest-environment node
 */

const {
  DriftStatus,
  DRIFT_THRESHOLDS,
  CONFIDENCE_REDUCTION,
  TRAINING_DISTRIBUTIONS,
  OOD_INDICATORS,
  calculateZScore,
  calculateSignalDistance,
  getDriftStatusFromZScore,
  checkBounds,
  checkOODIndicators,
  getTrainingDistribution,
  getAvailableDistributions,
  analyzeSignal,
  detectDrift,
  getOverallDriftStatus,
  quickCheck,
  analyze,
  checkMultipleModels,
  applyConfidenceReduction
} = require('../services/signalDriftDetector');

// ============================================================================
// TEST DATA
// ============================================================================

const inDistributionSignals = {
  bpm: 120,
  subBassEnergy: 0.55,
  transientDensity: 0.5,
  transientSharpness: 0.5,
  dynamicRange: 7,
  stereoWidth: 0.5,
  integratedLoudness: -14,
  truePeak: -1,
  crestFactor: 8,
  temporalDensity: 0.6
};

const minorDriftSignals = {
  bpm: 170, // 1.8 std from mean
  subBassEnergy: 0.55,
  transientDensity: 0.5,
  dynamicRange: 7,
  integratedLoudness: -14
};

const significantDriftSignals = {
  bpm: 200, // 3 std from mean
  subBassEnergy: 0.1, // 2.5 std from mean
  transientDensity: 0.9,
  dynamicRange: 1
};

const oodSignals = {
  bpm: 280, // Way beyond expected
  subBassEnergy: 0,
  dynamicRange: -5,
  integratedLoudness: -70
};

const silentAudio = {
  integratedLoudness: -60,
  rmsLevel: -65,
  bpm: 120
};

const noisyAudio = {
  crestFactor: 1.5,
  bpm: 120
};

// ============================================================================
// Z-SCORE CALCULATIONS
// ============================================================================

describe('Signal Drift Detector', () => {
  describe('Z-Score Calculations', () => {
    describe('calculateZScore', () => {
      test('should return 0 for value at mean', () => {
        expect(calculateZScore(100, 100, 10)).toBe(0);
      });

      test('should return 1 for value one std from mean', () => {
        expect(calculateZScore(110, 100, 10)).toBe(1);
        expect(calculateZScore(90, 100, 10)).toBe(1);
      });

      test('should return 2 for value two std from mean', () => {
        expect(calculateZScore(120, 100, 10)).toBe(2);
        expect(calculateZScore(80, 100, 10)).toBe(2);
      });

      test('should handle negative values', () => {
        expect(calculateZScore(-20, -10, 5)).toBe(2);
      });

      test('should return Infinity for zero std when value differs', () => {
        expect(calculateZScore(101, 100, 0)).toBe(Infinity);
      });

      test('should return 0 for zero std when value equals mean', () => {
        expect(calculateZScore(100, 100, 0)).toBe(0);
      });

      test('should always return positive values (absolute)', () => {
        expect(calculateZScore(80, 100, 10)).toBeGreaterThan(0);
      });
    });

    describe('calculateSignalDistance', () => {
      test('should apply weight to z-score', () => {
        const dist = { mean: 100, std: 10, weight: 2 };
        const distance = calculateSignalDistance(110, dist);
        expect(distance).toBe(2); // 1 * 2
      });

      test('should default weight to 1', () => {
        const dist = { mean: 100, std: 10 };
        const distance = calculateSignalDistance(120, dist);
        expect(distance).toBe(2);
      });

      test('should handle zero distance', () => {
        const dist = { mean: 100, std: 10, weight: 1.5 };
        const distance = calculateSignalDistance(100, dist);
        expect(distance).toBe(0);
      });
    });
  });

  // ==========================================================================
  // DRIFT STATUS DETERMINATION
  // ==========================================================================

  describe('Drift Status Determination', () => {
    describe('getDriftStatusFromZScore', () => {
      test('should return IN_DISTRIBUTION for low z-scores', () => {
        expect(getDriftStatusFromZScore(0)).toBe(DriftStatus.IN_DISTRIBUTION);
        expect(getDriftStatusFromZScore(1)).toBe(DriftStatus.IN_DISTRIBUTION);
        expect(getDriftStatusFromZScore(1.4)).toBe(DriftStatus.IN_DISTRIBUTION);
      });

      test('should return MINOR_DRIFT for moderate z-scores', () => {
        expect(getDriftStatusFromZScore(1.5)).toBe(DriftStatus.MINOR_DRIFT);
        expect(getDriftStatusFromZScore(2)).toBe(DriftStatus.MINOR_DRIFT);
        expect(getDriftStatusFromZScore(2.4)).toBe(DriftStatus.MINOR_DRIFT);
      });

      test('should return SIGNIFICANT_DRIFT for high z-scores', () => {
        expect(getDriftStatusFromZScore(2.5)).toBe(DriftStatus.SIGNIFICANT_DRIFT);
        expect(getDriftStatusFromZScore(3)).toBe(DriftStatus.SIGNIFICANT_DRIFT);
        expect(getDriftStatusFromZScore(3.9)).toBe(DriftStatus.SIGNIFICANT_DRIFT);
      });

      test('should return OUT_OF_DISTRIBUTION for extreme z-scores', () => {
        expect(getDriftStatusFromZScore(4)).toBe(DriftStatus.OUT_OF_DISTRIBUTION);
        expect(getDriftStatusFromZScore(5)).toBe(DriftStatus.OUT_OF_DISTRIBUTION);
        expect(getDriftStatusFromZScore(100)).toBe(DriftStatus.OUT_OF_DISTRIBUTION);
      });
    });

    describe('checkBounds', () => {
      const dist = { min: 0, max: 100 };

      test('should return inBounds for valid value', () => {
        const result = checkBounds(50, dist);
        expect(result.inBounds).toBe(true);
        expect(result.violation).toBeUndefined();
      });

      test('should return inBounds for boundary values', () => {
        expect(checkBounds(0, dist).inBounds).toBe(true);
        expect(checkBounds(100, dist).inBounds).toBe(true);
      });

      test('should detect below_minimum violation', () => {
        const result = checkBounds(-1, dist);
        expect(result.inBounds).toBe(false);
        expect(result.violation).toBe('below_minimum');
        expect(result.actual).toBe(-1);
      });

      test('should detect above_maximum violation', () => {
        const result = checkBounds(101, dist);
        expect(result.inBounds).toBe(false);
        expect(result.violation).toBe('above_maximum');
        expect(result.actual).toBe(101);
      });
    });
  });

  // ==========================================================================
  // OOD INDICATORS
  // ==========================================================================

  describe('OOD Indicators', () => {
    describe('checkOODIndicators', () => {
      test('should detect silence', () => {
        const result = checkOODIndicators(silentAudio);
        expect(result.indicators.some(i => i.id === 'SILENCE')).toBe(true);
        expect(result.isOOD).toBe(true); // Critical severity
      });

      test('should detect noise-only audio', () => {
        const result = checkOODIndicators(noisyAudio);
        expect(result.indicators.some(i => i.id === 'NOISE_ONLY')).toBe(true);
        expect(result.isOOD).toBe(true); // Critical severity
      });

      test('should detect extreme duration', () => {
        const result = checkOODIndicators({ duration: 2 });
        expect(result.indicators.some(i => i.id === 'EXTREME_DURATION')).toBe(true);

        const result2 = checkOODIndicators({ duration: 3600 });
        expect(result2.indicators.some(i => i.id === 'EXTREME_DURATION')).toBe(true);
      });

      test('should detect mono sum cancellation', () => {
        const result = checkOODIndicators({ phaseCorrelation: -0.95 });
        expect(result.indicators.some(i => i.id === 'MONO_SUM_CANCELLATION')).toBe(true);
      });

      test('should detect clipped audio', () => {
        const result = checkOODIndicators({ truePeak: 0.5 });
        expect(result.indicators.some(i => i.id === 'CLIPPED_AUDIO')).toBe(true);
      });

      test('should detect DC offset', () => {
        const result = checkOODIndicators({ dcOffset: 0.2 });
        expect(result.indicators.some(i => i.id === 'DC_OFFSET')).toBe(true);
      });

      test('should detect extreme BPM', () => {
        const result = checkOODIndicators({ bpm: 30 });
        expect(result.indicators.some(i => i.id === 'EXTREME_BPM')).toBe(true);

        const result2 = checkOODIndicators({ bpm: 300 });
        expect(result2.indicators.some(i => i.id === 'EXTREME_BPM')).toBe(true);
      });

      test('should detect invalid sample rate', () => {
        const result = checkOODIndicators({ sampleRate: 22050 });
        expect(result.indicators.some(i => i.id === 'INVALID_SAMPLE_RATE')).toBe(true);
      });

      test('should accept valid sample rates', () => {
        const result = checkOODIndicators({ sampleRate: 44100 });
        expect(result.indicators.some(i => i.id === 'INVALID_SAMPLE_RATE')).toBe(false);
      });

      test('should return isOOD=true for critical indicators', () => {
        const result = checkOODIndicators(silentAudio);
        expect(result.isOOD).toBe(true);
        expect(result.criticalCount).toBeGreaterThan(0);
      });

      test('should return isOOD=true for multiple high severity', () => {
        const result = checkOODIndicators({
          duration: 2,
          phaseCorrelation: -0.95
        });
        expect(result.highCount).toBeGreaterThanOrEqual(2);
        expect(result.isOOD).toBe(true);
      });

      test('should not mark OOD for single medium severity', () => {
        const result = checkOODIndicators({ truePeak: 0.5 });
        expect(result.indicators.length).toBeGreaterThan(0);
        expect(result.isOOD).toBe(false);
      });

      test('should handle empty signals', () => {
        const result = checkOODIndicators({});
        expect(result.indicators).toEqual([]);
        expect(result.isOOD).toBe(false);
      });
    });
  });

  // ==========================================================================
  // TRAINING DISTRIBUTIONS
  // ==========================================================================

  describe('Training Distributions', () => {
    describe('getTrainingDistribution', () => {
      test('should return distribution for known model', () => {
        const dist = getTrainingDistribution('subgenre_v2');
        expect(dist).not.toBeNull();
        expect(dist.version).toBe('2.0.0');
        expect(dist.signals).toBeDefined();
      });

      test('should return null for unknown model', () => {
        expect(getTrainingDistribution('unknown_model')).toBeNull();
      });

      test('should have expected signals for subgenre_v2', () => {
        const dist = getTrainingDistribution('subgenre_v2');
        expect(dist.signals.bpm).toBeDefined();
        expect(dist.signals.subBassEnergy).toBeDefined();
        expect(dist.signals.transientDensity).toBeDefined();
      });
    });

    describe('getAvailableDistributions', () => {
      test('should return summary of available distributions', () => {
        const available = getAvailableDistributions();
        expect(available.subgenre_v2).toBeDefined();
        expect(available.subgenre_v2.version).toBe('2.0.0');
        expect(available.subgenre_v2.signals).toBeInstanceOf(Array);
      });

      test('should include all distributions', () => {
        const available = getAvailableDistributions();
        expect(Object.keys(available).length).toBe(Object.keys(TRAINING_DISTRIBUTIONS).length);
      });
    });
  });

  // ==========================================================================
  // SIGNAL ANALYSIS
  // ==========================================================================

  describe('Signal Analysis', () => {
    describe('analyzeSignal', () => {
      const bpmDist = { mean: 125, std: 25, min: 60, max: 200, weight: 1.0 };

      test('should analyze in-distribution signal', () => {
        const result = analyzeSignal('bpm', 125, bpmDist);
        expect(result.signal).toBe('bpm');
        expect(result.value).toBe(125);
        expect(result.zScore).toBe(0);
        expect(result.status).toBe(DriftStatus.IN_DISTRIBUTION);
        expect(result.inBounds).toBe(true);
      });

      test('should analyze drifting signal', () => {
        const result = analyzeSignal('bpm', 175, bpmDist);
        expect(result.zScore).toBe(2);
        expect(result.status).toBe(DriftStatus.MINOR_DRIFT);
      });

      test('should detect out of bounds', () => {
        const result = analyzeSignal('bpm', 50, bpmDist);
        expect(result.inBounds).toBe(false);
        expect(result.violation).toBe('below_minimum');
      });

      test('should include expected distribution', () => {
        const result = analyzeSignal('bpm', 120, bpmDist);
        expect(result.expected.mean).toBe(125);
        expect(result.expected.std).toBe(25);
        expect(result.expected.min).toBe(60);
        expect(result.expected.max).toBe(200);
      });
    });
  });

  // ==========================================================================
  // MAIN DRIFT DETECTION
  // ==========================================================================

  describe('Main Drift Detection', () => {
    describe('detectDrift', () => {
      test('should detect in-distribution signals', () => {
        const result = detectDrift(inDistributionSignals, 'subgenre_v2');
        expect(result.status).toBe(DriftStatus.IN_DISTRIBUTION);
        expect(result.shouldTrustML).toBe(true);
        expect(result.confidenceReduction).toBe(0);
      });

      test('should detect minor drift', () => {
        const result = detectDrift(minorDriftSignals, 'subgenre_v2');
        expect([DriftStatus.MINOR_DRIFT, DriftStatus.IN_DISTRIBUTION]).toContain(result.status);
      });

      test('should detect significant drift', () => {
        const result = detectDrift(significantDriftSignals, 'subgenre_v2');
        expect([DriftStatus.SIGNIFICANT_DRIFT, DriftStatus.MINOR_DRIFT]).toContain(result.status);
      });

      test('should detect OOD from hard indicators', () => {
        const result = detectDrift(silentAudio, 'subgenre_v2');
        expect(result.status).toBe(DriftStatus.OUT_OF_DISTRIBUTION);
        expect(result.shouldTrustML).toBe(false);
        expect(result.oodIndicators.length).toBeGreaterThan(0);
      });

      test('should handle unknown model gracefully', () => {
        const result = detectDrift(inDistributionSignals, 'unknown');
        expect(result.status).toBe(DriftStatus.IN_DISTRIBUTION);
        expect(result.shouldTrustML).toBe(true);
        expect(result.error).toBeDefined();
      });

      test('should include model and version info', () => {
        const result = detectDrift(inDistributionSignals, 'subgenre_v2');
        expect(result.modelId).toBe('subgenre_v2');
        expect(result.trainingVersion).toBe('2.0.0');
      });

      test('should include summary statistics', () => {
        const result = detectDrift(inDistributionSignals, 'subgenre_v2');
        expect(result.summary).toBeDefined();
        expect(result.summary.signalsAnalyzed).toBeGreaterThan(0);
        expect(typeof result.summary.signalsInDistribution).toBe('number');
      });

      test('should include recommendations', () => {
        const result = detectDrift(inDistributionSignals, 'subgenre_v2');
        expect(result.recommendations).toBeInstanceOf(Array);
      });

      test('should calculate aggregate distance', () => {
        const result = detectDrift(inDistributionSignals, 'subgenre_v2');
        expect(typeof result.aggregateDistance).toBe('number');
        expect(result.aggregateDistance).toBeGreaterThanOrEqual(0);
      });

      test('should skip missing signals', () => {
        const partialSignals = { bpm: 120 };
        const result = detectDrift(partialSignals, 'subgenre_v2');
        expect(result.summary.signalsAnalyzed).toBe(1);
      });

      test('should detect violations', () => {
        const violatingSignals = { bpm: 10 }; // Below min of 60
        const result = detectDrift(violatingSignals, 'subgenre_v2');
        expect(result.violations.length).toBeGreaterThan(0);
      });
    });

    describe('getOverallDriftStatus', () => {
      test('should return OOD for multiple violations', () => {
        const violations = [1, 2, 3];
        const result = getOverallDriftStatus({}, 0, violations);
        expect(result).toBe(DriftStatus.OUT_OF_DISTRIBUTION);
      });

      test('should return OOD for high aggregate distance', () => {
        const result = getOverallDriftStatus({}, 5, []);
        expect(result).toBe(DriftStatus.OUT_OF_DISTRIBUTION);
      });

      test('should return SIGNIFICANT for OOD signals', () => {
        const analyses = {
          bpm: { status: DriftStatus.OUT_OF_DISTRIBUTION }
        };
        const result = getOverallDriftStatus(analyses, 0, []);
        expect(result).toBe(DriftStatus.SIGNIFICANT_DRIFT);
      });

      test('should return SIGNIFICANT for multiple significant drifts', () => {
        const analyses = {
          bpm: { status: DriftStatus.SIGNIFICANT_DRIFT },
          bass: { status: DriftStatus.SIGNIFICANT_DRIFT }
        };
        const result = getOverallDriftStatus(analyses, 0, []);
        expect(result).toBe(DriftStatus.SIGNIFICANT_DRIFT);
      });

      test('should return IN_DISTRIBUTION when all signals normal', () => {
        const analyses = {
          bpm: { status: DriftStatus.IN_DISTRIBUTION },
          bass: { status: DriftStatus.IN_DISTRIBUTION }
        };
        const result = getOverallDriftStatus(analyses, 0, []);
        expect(result).toBe(DriftStatus.IN_DISTRIBUTION);
      });
    });
  });

  // ==========================================================================
  // QUICK CHECK & ANALYSIS
  // ==========================================================================

  describe('Quick Check & Analysis', () => {
    describe('quickCheck', () => {
      test('should quickly identify in-distribution', () => {
        const result = quickCheck(inDistributionSignals, 'subgenre_v2');
        expect(result.status).toBe(DriftStatus.IN_DISTRIBUTION);
        expect(result.shouldTrustML).toBe(true);
      });

      test('should quickly identify OOD from indicators', () => {
        const result = quickCheck(silentAudio, 'subgenre_v2');
        expect(result.status).toBe(DriftStatus.OUT_OF_DISTRIBUTION);
        expect(result.shouldTrustML).toBe(false);
        expect(result.hasOODIndicators).toBe(true);
      });

      test('should return max z-score', () => {
        const result = quickCheck(minorDriftSignals, 'subgenre_v2');
        expect(typeof result.maxZScore).toBe('number');
      });

      test('should handle unknown model', () => {
        const result = quickCheck(inDistributionSignals, 'unknown');
        expect(result.noDistributionAvailable).toBe(true);
        expect(result.shouldTrustML).toBe(true);
      });

      test('should count signals checked', () => {
        const result = quickCheck(inDistributionSignals, 'subgenre_v2');
        expect(result.signalsChecked).toBeGreaterThan(0);
      });
    });

    describe('analyze', () => {
      test('should return complete analysis', () => {
        const result = analyze(inDistributionSignals, 'subgenre_v2');
        expect(result.timestamp).toBeDefined();
        expect(result.modelId).toBe('subgenre_v2');
        expect(result.status).toBeDefined();
        expect(result.distribution).toBeDefined();
        expect(result.thresholds).toEqual(DRIFT_THRESHOLDS);
      });

      test('should include distribution metadata', () => {
        const result = analyze(inDistributionSignals, 'subgenre_v2');
        expect(result.distribution.version).toBe('2.0.0');
        expect(result.distribution.trainingSize).toBeGreaterThan(0);
      });

      test('should handle unknown model', () => {
        const result = analyze(inDistributionSignals, 'unknown');
        expect(result.distribution).toBeNull();
      });
    });

    describe('checkMultipleModels', () => {
      test('should check multiple models', () => {
        const result = checkMultipleModels(inDistributionSignals, [
          'subgenre_v2',
          'loudness_analysis'
        ]);
        expect(result.byModel.subgenre_v2).toBeDefined();
        expect(result.byModel.loudness_analysis).toBeDefined();
      });

      test('should determine overall status', () => {
        const result = checkMultipleModels(inDistributionSignals, ['subgenre_v2']);
        expect(result.overallStatus).toBeDefined();
      });

      test('should determine shouldTrustAnyML', () => {
        const result = checkMultipleModels(inDistributionSignals, ['subgenre_v2']);
        expect(result.shouldTrustAnyML).toBe(true);
      });

      test('should report OOD across all models', () => {
        const result = checkMultipleModels(silentAudio, [
          'subgenre_v2',
          'loudness_analysis'
        ]);
        expect(result.overallStatus).toBe(DriftStatus.OUT_OF_DISTRIBUTION);
      });
    });
  });

  // ==========================================================================
  // CONFIDENCE ADJUSTMENT
  // ==========================================================================

  describe('Confidence Adjustment', () => {
    describe('applyConfidenceReduction', () => {
      test('should not reduce for in-distribution', () => {
        const result = applyConfidenceReduction(0.9, DriftStatus.IN_DISTRIBUTION);
        expect(result.adjusted).toBe(0.9);
        expect(result.reduction).toBe(0);
        expect(result.wasReduced).toBe(false);
      });

      test('should reduce by 5% for minor drift', () => {
        const result = applyConfidenceReduction(0.9, DriftStatus.MINOR_DRIFT);
        expect(result.adjusted).toBe(0.85);
        expect(result.reduction).toBe(0.05);
        expect(result.wasReduced).toBe(true);
      });

      test('should reduce by 15% for significant drift', () => {
        const result = applyConfidenceReduction(0.9, DriftStatus.SIGNIFICANT_DRIFT);
        expect(result.adjusted).toBe(0.75);
        expect(result.reduction).toBe(0.15);
      });

      test('should reduce by 30% for OOD', () => {
        const result = applyConfidenceReduction(0.9, DriftStatus.OUT_OF_DISTRIBUTION);
        expect(result.adjusted).toBe(0.6);
        expect(result.reduction).toBe(0.30);
      });

      test('should not go below 0', () => {
        const result = applyConfidenceReduction(0.1, DriftStatus.OUT_OF_DISTRIBUTION);
        expect(result.adjusted).toBe(0);
      });

      test('should include original confidence', () => {
        const result = applyConfidenceReduction(0.9, DriftStatus.MINOR_DRIFT);
        expect(result.original).toBe(0.9);
      });

      test('should include drift status', () => {
        const result = applyConfidenceReduction(0.9, DriftStatus.MINOR_DRIFT);
        expect(result.driftStatus).toBe(DriftStatus.MINOR_DRIFT);
      });
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe('Edge Cases', () => {
    test('should handle empty signals object', () => {
      const result = detectDrift({}, 'subgenre_v2');
      expect(result.summary.signalsAnalyzed).toBe(0);
    });

    test('should handle null values in signals', () => {
      const signals = { bpm: null, subBassEnergy: 0.5 };
      const result = detectDrift(signals, 'subgenre_v2');
      expect(result.summary.signalsAnalyzed).toBe(1);
    });

    test('should handle undefined values in signals', () => {
      const signals = { bpm: undefined, subBassEnergy: 0.5 };
      const result = detectDrift(signals, 'subgenre_v2');
      expect(result.summary.signalsAnalyzed).toBe(1);
    });

    test('should handle extreme positive values', () => {
      const signals = { bpm: 10000 };
      const result = detectDrift(signals, 'subgenre_v2');
      expect(result.violations.length).toBeGreaterThan(0);
    });

    test('should handle extreme negative values', () => {
      const signals = { integratedLoudness: -1000 };
      const result = detectDrift(signals, 'subgenre_v2');
      // -1000 triggers SILENCE OOD indicator, so expect OOD status
      expect(result.status).toBe(DriftStatus.OUT_OF_DISTRIBUTION);
    });

    test('should handle zero values', () => {
      const signals = { bpm: 0, subBassEnergy: 0 };
      const result = detectDrift(signals, 'subgenre_v2');
      // Should complete without error
      expect(result.status).toBeDefined();
    });

    test('should handle very small std', () => {
      const dist = { mean: 100, std: 0.001, min: 0, max: 200 };
      const distance = calculateSignalDistance(100.01, dist);
      expect(distance).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // CONSTANTS VALIDATION
  // ==========================================================================

  describe('Constants Validation', () => {
    test('DriftStatus should have all expected values', () => {
      expect(DriftStatus.IN_DISTRIBUTION).toBeDefined();
      expect(DriftStatus.MINOR_DRIFT).toBeDefined();
      expect(DriftStatus.SIGNIFICANT_DRIFT).toBeDefined();
      expect(DriftStatus.OUT_OF_DISTRIBUTION).toBeDefined();
    });

    test('DRIFT_THRESHOLDS should be in ascending order', () => {
      expect(DRIFT_THRESHOLDS.MINOR).toBeLessThan(DRIFT_THRESHOLDS.SIGNIFICANT);
      expect(DRIFT_THRESHOLDS.SIGNIFICANT).toBeLessThan(DRIFT_THRESHOLDS.OOD);
    });

    test('CONFIDENCE_REDUCTION should increase with severity', () => {
      expect(CONFIDENCE_REDUCTION[DriftStatus.IN_DISTRIBUTION])
        .toBeLessThan(CONFIDENCE_REDUCTION[DriftStatus.MINOR_DRIFT]);
      expect(CONFIDENCE_REDUCTION[DriftStatus.MINOR_DRIFT])
        .toBeLessThan(CONFIDENCE_REDUCTION[DriftStatus.SIGNIFICANT_DRIFT]);
      expect(CONFIDENCE_REDUCTION[DriftStatus.SIGNIFICANT_DRIFT])
        .toBeLessThan(CONFIDENCE_REDUCTION[DriftStatus.OUT_OF_DISTRIBUTION]);
    });

    test('OOD_INDICATORS should have check functions', () => {
      for (const indicator of Object.values(OOD_INDICATORS)) {
        expect(typeof indicator.check).toBe('function');
        expect(indicator.id).toBeDefined();
        expect(indicator.description).toBeDefined();
        expect(indicator.severity).toBeDefined();
      }
    });

    test('TRAINING_DISTRIBUTIONS should have required fields', () => {
      for (const dist of Object.values(TRAINING_DISTRIBUTIONS)) {
        expect(dist.version).toBeDefined();
        expect(dist.signals).toBeDefined();
        expect(Object.keys(dist.signals).length).toBeGreaterThan(0);
      }
    });
  });
});
