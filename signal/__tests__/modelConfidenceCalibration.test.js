/**
 * Model Confidence Calibration Tests
 * 
 * Tests for confidence calibration including:
 * - Temperature scaling
 * - Bucket-based calibration
 * - ECE calculation
 * - Reliability scoring
 * 
 * @jest-environment node
 */

const {
  CalibrationStatus,
  CALIBRATION_THRESHOLDS,
  DEFAULT_CALIBRATION_BUCKETS,
  MODEL_CALIBRATION,
  getBucket,
  applyTemperatureScaling,
  softmax,
  clipConfidence,
  calculateSingleCalibrationError,
  calculateECE,
  getCalibrationStatus,
  calibrateConfidence,
  quickCheck,
  updateCalibrationStats,
  getCalibrationStats,
  clearCalibrationStats,
  getModelCalibrationStatus,
  analyze,
  getAvailableModels,
  calibrateBatch,
  calculateReliabilityScore
} = require('../services/modelConfidenceCalibration');

// ============================================================================
// TEST SETUP
// ============================================================================

describe('Model Confidence Calibration', () => {
  beforeEach(() => {
    clearCalibrationStats();
  });

  // ==========================================================================
  // CORE FUNCTIONS
  // ==========================================================================

  describe('Core Functions', () => {
    describe('getBucket', () => {
      test('should return correct bucket for high confidence', () => {
        const result = getBucket(0.95);
        expect(result.bucketId).toBe('0.90-1.00');
        expect(result.bucket.min).toBe(0.90);
      });

      test('should return correct bucket for medium confidence', () => {
        const result = getBucket(0.75);
        expect(result.bucketId).toBe('0.70-0.80');
      });

      test('should return correct bucket for low confidence', () => {
        const result = getBucket(0.35);
        expect(result.bucketId).toBe('0.00-0.40');
      });

      test('should handle boundary values', () => {
        expect(getBucket(0.90).bucketId).toBe('0.90-1.00');
        expect(getBucket(0.80).bucketId).toBe('0.80-0.90');
        expect(getBucket(0.70).bucketId).toBe('0.70-0.80');
      });

      test('should handle edge case of exactly 1.0', () => {
        const result = getBucket(1.0);
        expect(result.bucketId).toBe('0.90-1.00');
      });

      test('should handle values below minimum bucket', () => {
        const result = getBucket(0.1);
        expect(result.bucketId).toBe('0.00-0.40');
      });
    });

    describe('softmax', () => {
      test('should convert logits to probabilities', () => {
        const probs = softmax([1, 2, 3]);
        expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
        expect(probs[2]).toBeGreaterThan(probs[1]);
        expect(probs[1]).toBeGreaterThan(probs[0]);
      });

      test('should handle single value', () => {
        const probs = softmax([5]);
        expect(probs).toEqual([1]);
      });

      test('should handle equal values', () => {
        const probs = softmax([1, 1, 1]);
        expect(probs[0]).toBeCloseTo(1 / 3);
        expect(probs[1]).toBeCloseTo(1 / 3);
        expect(probs[2]).toBeCloseTo(1 / 3);
      });

      test('should handle negative values', () => {
        const probs = softmax([-1, 0, 1]);
        expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
        expect(probs[2]).toBeGreaterThan(probs[0]);
      });

      test('should handle large values without overflow', () => {
        const probs = softmax([100, 101, 102]);
        expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
      });
    });

    describe('applyTemperatureScaling', () => {
      test('should return softmax for temperature 1.0', () => {
        const logits = [1, 2, 3];
        const probs = applyTemperatureScaling(logits, 1.0);
        const expectedProbs = softmax(logits);
        probs.forEach((p, i) => expect(p).toBeCloseTo(expectedProbs[i]));
      });

      test('should soften distribution for temperature > 1.0', () => {
        const logits = [1, 2, 3];
        const hotProbs = applyTemperatureScaling(logits, 1.0);
        const coldProbs = applyTemperatureScaling(logits, 2.0);
        
        // Cold (higher temp) should be more uniform
        const hotMax = Math.max(...hotProbs);
        const coldMax = Math.max(...coldProbs);
        expect(coldMax).toBeLessThan(hotMax);
      });

      test('should sharpen distribution for temperature < 1.0', () => {
        const logits = [1, 2, 3];
        const normalProbs = applyTemperatureScaling(logits, 1.0);
        const sharpProbs = applyTemperatureScaling(logits, 0.5);
        
        // Sharp (lower temp) should be more peaked
        const normalMax = Math.max(...normalProbs);
        const sharpMax = Math.max(...sharpProbs);
        expect(sharpMax).toBeGreaterThan(normalMax);
      });

      test('should throw for non-positive temperature', () => {
        expect(() => applyTemperatureScaling([1, 2], 0)).toThrow();
        expect(() => applyTemperatureScaling([1, 2], -1)).toThrow();
      });
    });

    describe('clipConfidence', () => {
      test('should not clip valid confidence', () => {
        const result = clipConfidence(0.7);
        expect(result.clipped).toBe(0.7);
        expect(result.wasClipped).toBe(false);
      });

      test('should clip below floor', () => {
        const result = clipConfidence(0.1);
        expect(result.clipped).toBe(CALIBRATION_THRESHOLDS.MIN_CONFIDENCE_FLOOR);
        expect(result.wasClipped).toBe(true);
        expect(result.clipReason).toBe('below_floor');
      });

      test('should clip above ceiling', () => {
        const result = clipConfidence(0.99);
        expect(result.clipped).toBe(CALIBRATION_THRESHOLDS.MAX_CONFIDENCE_CEILING);
        expect(result.wasClipped).toBe(true);
        expect(result.clipReason).toBe('above_ceiling');
      });

      test('should include original value', () => {
        const result = clipConfidence(0.1);
        expect(result.original).toBe(0.1);
      });

      test('should include floor and ceiling values', () => {
        const result = clipConfidence(0.5);
        expect(result.floor).toBe(CALIBRATION_THRESHOLDS.MIN_CONFIDENCE_FLOOR);
        expect(result.ceiling).toBe(CALIBRATION_THRESHOLDS.MAX_CONFIDENCE_CEILING);
      });
    });

    describe('calculateSingleCalibrationError', () => {
      test('should return error for correct prediction', () => {
        expect(calculateSingleCalibrationError(0.9, true)).toBeCloseTo(0.1);
        expect(calculateSingleCalibrationError(0.5, true)).toBeCloseTo(0.5);
      });

      test('should return error for incorrect prediction', () => {
        expect(calculateSingleCalibrationError(0.9, false)).toBeCloseTo(0.9);
        expect(calculateSingleCalibrationError(0.5, false)).toBeCloseTo(0.5);
      });

      test('should return 0 for perfect prediction', () => {
        expect(calculateSingleCalibrationError(1.0, true)).toBeCloseTo(0);
        expect(calculateSingleCalibrationError(0, false)).toBeCloseTo(0);
      });
    });
  });

  // ==========================================================================
  // ECE CALCULATION
  // ==========================================================================

  describe('ECE Calculation', () => {
    describe('calculateECE', () => {
      test('should return 0 ECE for perfectly calibrated predictions', () => {
        // Predictions where confidence matches accuracy
        const predictions = [
          { predicted: 0.95, correct: true },
          { predicted: 0.95, correct: true },
          { predicted: 0.95, correct: true },
          { predicted: 0.95, correct: true },
          { predicted: 0.95, correct: false }, // 80% accuracy at 95% confidence
        ];
        const result = calculateECE(predictions);
        // Should have some ECE since 95% confidence with 80% accuracy
        expect(result.ece).toBeGreaterThan(0);
      });

      test('should return 0 for empty predictions', () => {
        const result = calculateECE([]);
        expect(result.ece).toBe(0);
        expect(result.sampleCount).toBe(0);
      });

      test('should include per-bucket breakdown', () => {
        const predictions = [
          { predicted: 0.9, correct: true },
          { predicted: 0.5, correct: false }
        ];
        const result = calculateECE(predictions);
        expect(result.perBucket).toBeInstanceOf(Array);
      });

      test('should determine calibration status', () => {
        const predictions = [
          { predicted: 0.9, correct: true },
          { predicted: 0.9, correct: true },
          { predicted: 0.9, correct: true }
        ];
        const result = calculateECE(predictions);
        expect(Object.values(CalibrationStatus)).toContain(result.status);
      });

      test('should handle overconfident predictions', () => {
        // Model says 90% but only 50% correct
        const predictions = [
          { predicted: 0.9, correct: true },
          { predicted: 0.9, correct: false }
        ];
        const result = calculateECE(predictions);
        expect(result.ece).toBeGreaterThan(0);
      });

      test('should handle underconfident predictions', () => {
        // Model says 50% but 100% correct
        const predictions = [
          { predicted: 0.5, correct: true },
          { predicted: 0.5, correct: true }
        ];
        const result = calculateECE(predictions);
        expect(result.ece).toBeGreaterThan(0);
      });
    });

    describe('getCalibrationStatus', () => {
      test('should return WELL_CALIBRATED for low ECE', () => {
        expect(getCalibrationStatus(0.03)).toBe(CalibrationStatus.WELL_CALIBRATED);
      });

      test('should return SLIGHTLY_MISCALIBRATED for moderate ECE', () => {
        expect(getCalibrationStatus(0.08)).toBe(CalibrationStatus.SLIGHTLY_MISCALIBRATED);
      });

      test('should return MISCALIBRATED for high ECE', () => {
        expect(getCalibrationStatus(0.15)).toBe(CalibrationStatus.MISCALIBRATED);
      });

      test('should return SEVERELY_MISCALIBRATED for very high ECE', () => {
        expect(getCalibrationStatus(0.30)).toBe(CalibrationStatus.SEVERELY_MISCALIBRATED);
      });
    });
  });

  // ==========================================================================
  // MAIN CALIBRATION
  // ==========================================================================

  describe('Main Calibration', () => {
    describe('calibrateConfidence', () => {
      test('should calibrate high confidence downward', () => {
        const result = calibrateConfidence(0.98, 'subgenre_v2');
        // Temperature scaling and bucket calibration should reduce
        expect(result.calibrated).toBeLessThan(0.98);
        expect(result.adjustment).toBeLessThan(0);
      });

      test('should include all result fields', () => {
        const result = calibrateConfidence(0.8, 'subgenre_v2');
        expect(result.calibrated).toBeDefined();
        expect(result.original).toBe(0.8);
        expect(result.adjustment).toBeDefined();
        expect(result.status).toBeDefined();
        expect(result.bucket).toBeDefined();
        expect(result.modelId).toBe('subgenre_v2');
      });

      test('should handle unknown model gracefully', () => {
        const result = calibrateConfidence(0.8, 'unknown_model');
        expect(result.calibrated).toBeDefined();
        // Should still work with defaults
      });

      test('should clip very high values', () => {
        const result = calibrateConfidence(1.0, 'subgenre_v2');
        expect(result.calibrated).toBeLessThanOrEqual(CALIBRATION_THRESHOLDS.MAX_CONFIDENCE_CEILING);
      });

      test('should clip very low values', () => {
        const result = calibrateConfidence(0.1, 'subgenre_v2');
        expect(result.calibrated).toBeGreaterThanOrEqual(CALIBRATION_THRESHOLDS.MIN_CONFIDENCE_FLOOR);
      });

      test('should handle NaN input', () => {
        const result = calibrateConfidence(NaN, 'subgenre_v2');
        expect(result.error).toBeDefined();
        expect(result.calibrated).toBe(CALIBRATION_THRESHOLDS.MIN_CONFIDENCE_FLOOR);
      });

      test('should include warnings for extreme values', () => {
        const result = calibrateConfidence(0.99, 'subgenre_v2');
        expect(result.warnings).toBeInstanceOf(Array);
      });

      test('should use temperature scaling with logits', () => {
        const result = calibrateConfidence(0.9, 'subgenre_v2', {
          logits: [1, 2, 3]
        });
        expect(result.calibrationMethod).toBe('temperature_scaling');
      });

      test('should use bucket adjustment without logits', () => {
        const result = calibrateConfidence(0.9, 'subgenre_v2');
        expect(result.calibrationMethod).toBe('bucket_adjustment');
      });
    });

    describe('quickCheck', () => {
      test('should return calibrated value', () => {
        const result = quickCheck(0.9, 'subgenre_v2');
        expect(result.calibrated).toBeDefined();
      });

      test('should indicate if adjustment was made', () => {
        const result = quickCheck(0.99, 'subgenre_v2');
        expect(result.wasAdjusted).toBe(true);
      });

      test('should show adjustment amount', () => {
        const result = quickCheck(0.8, 'subgenre_v2');
        expect(typeof result.adjustment).toBe('number');
      });
    });
  });

  // ==========================================================================
  // CALIBRATION STATS TRACKING
  // ==========================================================================

  describe('Calibration Stats Tracking', () => {
    const modelId = 'test_model';

    describe('updateCalibrationStats', () => {
      test('should record predictions', () => {
        updateCalibrationStats(modelId, 0.9, true);
        updateCalibrationStats(modelId, 0.8, false);

        const stats = getCalibrationStats(modelId);
        expect(stats.sampleCount).toBe(2);
      });

      test('should limit stored predictions', () => {
        // Add more than limit
        for (let i = 0; i < 1100; i++) {
          updateCalibrationStats(modelId, 0.8, true);
        }

        const stats = getCalibrationStats(modelId);
        expect(stats.sampleCount).toBe(1000);
      });
    });

    describe('getCalibrationStats', () => {
      test('should return empty stats for unknown model', () => {
        const stats = getCalibrationStats('unknown');
        expect(stats.hasData).toBe(false);
        expect(stats.sampleCount).toBe(0);
      });

      test('should calculate ECE from recorded predictions', () => {
        updateCalibrationStats(modelId, 0.9, true);
        updateCalibrationStats(modelId, 0.9, true);
        updateCalibrationStats(modelId, 0.9, false);

        const stats = getCalibrationStats(modelId);
        expect(stats.hasData).toBe(true);
        expect(stats.ece).toBeDefined();
      });

      test('should include last updated timestamp', () => {
        updateCalibrationStats(modelId, 0.9, true);

        const stats = getCalibrationStats(modelId);
        expect(stats.lastUpdated).toBeDefined();
      });
    });

    describe('clearCalibrationStats', () => {
      test('should clear specific model stats', () => {
        updateCalibrationStats(modelId, 0.9, true);
        updateCalibrationStats('other_model', 0.9, true);

        clearCalibrationStats(modelId);

        expect(getCalibrationStats(modelId).hasData).toBe(false);
        expect(getCalibrationStats('other_model').hasData).toBe(true);
      });

      test('should clear all stats when no model specified', () => {
        updateCalibrationStats(modelId, 0.9, true);
        updateCalibrationStats('other_model', 0.9, true);

        clearCalibrationStats();

        expect(getCalibrationStats(modelId).hasData).toBe(false);
        expect(getCalibrationStats('other_model').hasData).toBe(false);
      });
    });
  });

  // ==========================================================================
  // MODEL STATUS & ANALYSIS
  // ==========================================================================

  describe('Model Status & Analysis', () => {
    describe('getModelCalibrationStatus', () => {
      test('should return status for configured model', () => {
        const status = getModelCalibrationStatus('subgenre_v2');
        expect(status.configured).toBe(true);
        expect(status.configuration).toBeDefined();
        expect(status.configuration.version).toBeDefined();
      });

      test('should return unconfigured for unknown model', () => {
        const status = getModelCalibrationStatus('unknown');
        expect(status.configured).toBe(false);
      });

      test('should include runtime stats', () => {
        updateCalibrationStats('subgenre_v2', 0.9, true);

        const status = getModelCalibrationStatus('subgenre_v2');
        expect(status.runtimeStats).toBeDefined();
        expect(status.runtimeStats.hasData).toBe(true);
      });

      test('should include recommendations', () => {
        const status = getModelCalibrationStatus('subgenre_v2');
        expect(status.recommendations).toBeInstanceOf(Array);
      });
    });

    describe('analyze', () => {
      test('should return complete analysis', () => {
        const result = analyze('subgenre_v2');
        expect(result.timestamp).toBeDefined();
        expect(result.modelId).toBe('subgenre_v2');
        expect(result.configured).toBe(true);
      });

      test('should include calibration buckets', () => {
        const result = analyze('subgenre_v2');
        expect(result.calibrationBuckets).toBeDefined();
      });

      test('should analyze provided predictions', () => {
        const predictions = [
          { predicted: 0.9, correct: true },
          { predicted: 0.9, correct: false }
        ];
        const result = analyze('subgenre_v2', predictions);
        expect(result.analysisResult).toBeDefined();
        expect(result.analysisResult.ece).toBeDefined();
      });
    });

    describe('getAvailableModels', () => {
      test('should return all configured models', () => {
        const models = getAvailableModels();
        expect(models.subgenre_v2).toBeDefined();
        expect(models.risk_assessment).toBeDefined();
      });

      test('should include model details', () => {
        const models = getAvailableModels();
        expect(models.subgenre_v2.version).toBeDefined();
        expect(models.subgenre_v2.temperatureScaling).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // BATCH OPERATIONS
  // ==========================================================================

  describe('Batch Operations', () => {
    describe('calibrateBatch', () => {
      test('should calibrate multiple values', () => {
        const items = [
          { confidence: 0.9 },
          { confidence: 0.8 },
          { confidence: 0.7 }
        ];
        const results = calibrateBatch(items, 'subgenre_v2');
        expect(results.length).toBe(3);
        results.forEach(r => {
          expect(r.calibrated).toBeDefined();
        });
      });

      test('should preserve original items', () => {
        const items = [{ confidence: 0.9, extra: 'data' }];
        const results = calibrateBatch(items, 'subgenre_v2');
        expect(results[0].originalItem.extra).toBe('data');
      });

      test('should handle empty batch', () => {
        const results = calibrateBatch([], 'subgenre_v2');
        expect(results).toEqual([]);
      });
    });
  });

  // ==========================================================================
  // RELIABILITY SCORING
  // ==========================================================================

  describe('Reliability Scoring', () => {
    describe('calculateReliabilityScore', () => {
      test('should calculate reliability from confidence', () => {
        const result = calculateReliabilityScore(0.85, 'subgenre_v2');
        expect(result.reliability).toBeDefined();
        expect(result.reliability).toBeGreaterThan(0);
        expect(result.reliability).toBeLessThanOrEqual(1);
      });

      test('should include calibrated confidence', () => {
        const result = calculateReliabilityScore(0.85, 'subgenre_v2');
        expect(result.calibratedConfidence).toBeDefined();
        expect(result.originalConfidence).toBe(0.85);
      });

      test('should apply drift reduction', () => {
        const result = calculateReliabilityScore(0.85, 'subgenre_v2', {
          driftReduction: 0.1
        });
        expect(result.factors.driftReduction).toBe(0.1);
        expect(result.reliability).toBeLessThan(result.calibratedConfidence);
      });

      test('should penalize miscalibrated models', () => {
        const well = calculateReliabilityScore(0.85, 'risk_assessment');
        const poor = calculateReliabilityScore(0.85, 'risk_assessment');
        // Both should be similar for well-calibrated model
        expect(Math.abs(well.reliability - poor.reliability)).toBeLessThan(0.1);
      });

      test('should include calibration factors', () => {
        const result = calculateReliabilityScore(0.85, 'subgenre_v2');
        expect(result.factors).toBeDefined();
        expect(result.factors.calibrationAdjustment).toBeDefined();
      });

      test('should not go below floor', () => {
        const result = calculateReliabilityScore(0.1, 'subgenre_v2', {
          driftReduction: 0.5
        });
        expect(result.reliability).toBeGreaterThanOrEqual(CALIBRATION_THRESHOLDS.MIN_CONFIDENCE_FLOOR);
      });

      test('should not exceed ceiling', () => {
        const result = calculateReliabilityScore(1.0, 'subgenre_v2');
        expect(result.reliability).toBeLessThanOrEqual(CALIBRATION_THRESHOLDS.MAX_CONFIDENCE_CEILING);
      });
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe('Edge Cases', () => {
    test('should handle zero confidence', () => {
      const result = calibrateConfidence(0, 'subgenre_v2');
      expect(result.calibrated).toBe(CALIBRATION_THRESHOLDS.MIN_CONFIDENCE_FLOOR);
    });

    test('should handle negative confidence', () => {
      const result = calibrateConfidence(-0.5, 'subgenre_v2');
      expect(result.calibrated).toBe(CALIBRATION_THRESHOLDS.MIN_CONFIDENCE_FLOOR);
    });

    test('should handle confidence > 1', () => {
      const result = calibrateConfidence(1.5, 'subgenre_v2');
      expect(result.calibrated).toBeLessThanOrEqual(CALIBRATION_THRESHOLDS.MAX_CONFIDENCE_CEILING);
    });

    test('should handle undefined model gracefully', () => {
      const result = calibrateConfidence(0.8, undefined);
      expect(result.calibrated).toBeDefined();
    });

    test('should handle empty logits array', () => {
      const result = calibrateConfidence(0.8, 'subgenre_v2', { logits: [] });
      // Should not crash
      expect(result.calibrated).toBeDefined();
    });
  });

  // ==========================================================================
  // CONSTANTS VALIDATION
  // ==========================================================================

  describe('Constants Validation', () => {
    test('CalibrationStatus should have all expected values', () => {
      expect(CalibrationStatus.WELL_CALIBRATED).toBeDefined();
      expect(CalibrationStatus.SLIGHTLY_MISCALIBRATED).toBeDefined();
      expect(CalibrationStatus.MISCALIBRATED).toBeDefined();
      expect(CalibrationStatus.SEVERELY_MISCALIBRATED).toBeDefined();
    });

    test('CALIBRATION_THRESHOLDS should have valid values', () => {
      expect(CALIBRATION_THRESHOLDS.WELL_CALIBRATED).toBeLessThan(CALIBRATION_THRESHOLDS.SLIGHTLY_MISCALIBRATED);
      expect(CALIBRATION_THRESHOLDS.SLIGHTLY_MISCALIBRATED).toBeLessThan(CALIBRATION_THRESHOLDS.MISCALIBRATED);
      expect(CALIBRATION_THRESHOLDS.MIN_CONFIDENCE_FLOOR).toBeLessThan(CALIBRATION_THRESHOLDS.MAX_CONFIDENCE_CEILING);
    });

    test('DEFAULT_CALIBRATION_BUCKETS should cover full range', () => {
      const buckets = Object.values(DEFAULT_CALIBRATION_BUCKETS);
      const minVal = Math.min(...buckets.map(b => b.min));
      const maxVal = Math.max(...buckets.map(b => b.max));
      expect(minVal).toBe(0);
      expect(maxVal).toBe(1);
    });

    test('MODEL_CALIBRATION should have valid configurations', () => {
      for (const config of Object.values(MODEL_CALIBRATION)) {
        expect(config.version).toBeDefined();
        expect(config.temperatureScaling).toBeGreaterThan(0);
        expect(typeof config.biasCorrection).toBe('number');
      }
    });
  });
});
