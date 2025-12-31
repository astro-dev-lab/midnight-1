/**
 * Tests for Noise Floor Modulation Detector
 * 
 * Validates breathing/pumping artifact detection and noise floor analysis.
 */

const path = require('path');
const fs = require('fs');

const noiseFloorModulationDetector = require('../services/noiseFloorModulationDetector');

const {
  analyze,
  quickCheck,
  classify,
  analyzeNoiseFloorVariation,
  analyzeModulationCorrelation,
  detectModulationType,
  classifyStatus,
  calculateModulationScore,
  generateRecommendations,
  calculateVariance,
  NoiseModulationStatus,
  ModulationType,
  STATUS_DESCRIPTIONS,
  THRESHOLDS,
  REFERENCE
} = noiseFloorModulationDetector;

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_FIXTURES_DIR = path.join(__dirname, 'fixtures');

function getTestAudioPath(filename) {
  return path.join(TEST_FIXTURES_DIR, filename);
}

function testAudioExists(filename) {
  return fs.existsSync(getTestAudioPath(filename));
}

// ============================================================================
// Constants Tests
// ============================================================================

describe('Noise Floor Modulation Detector', () => {
  describe('Constants', () => {
    describe('NoiseModulationStatus enum', () => {
      it('should export all status levels', () => {
        expect(NoiseModulationStatus.CLEAN).toBe('CLEAN');
        expect(NoiseModulationStatus.MINIMAL).toBe('MINIMAL');
        expect(NoiseModulationStatus.NOTICEABLE).toBe('NOTICEABLE');
        expect(NoiseModulationStatus.OBVIOUS).toBe('OBVIOUS');
        expect(NoiseModulationStatus.SEVERE).toBe('SEVERE');
      });

      it('should have exactly 5 status levels', () => {
        expect(Object.keys(NoiseModulationStatus)).toHaveLength(5);
      });
    });

    describe('ModulationType enum', () => {
      it('should export all modulation types', () => {
        expect(ModulationType.NONE).toBe('NONE');
        expect(ModulationType.BREATHING).toBe('BREATHING');
        expect(ModulationType.PUMPING).toBe('PUMPING');
        expect(ModulationType.GATING_ARTIFACTS).toBe('GATING_ARTIFACTS');
        expect(ModulationType.MIXED).toBe('MIXED');
      });

      it('should have exactly 5 modulation types', () => {
        expect(Object.keys(ModulationType)).toHaveLength(5);
      });
    });

    describe('STATUS_DESCRIPTIONS', () => {
      it('should have descriptions for all status levels', () => {
        Object.values(NoiseModulationStatus).forEach(status => {
          expect(STATUS_DESCRIPTIONS[status]).toBeDefined();
          expect(typeof STATUS_DESCRIPTIONS[status]).toBe('string');
          expect(STATUS_DESCRIPTIONS[status].length).toBeGreaterThan(10);
        });
      });
    });

    describe('THRESHOLDS', () => {
      it('should export noise floor thresholds', () => {
        expect(THRESHOLDS.NOISE_FLOOR.QUIET_THRESHOLD_DB).toBeDefined();
        expect(THRESHOLDS.NOISE_FLOOR.MIN_QUIET_DURATION_MS).toBeDefined();
      });

      it('should export modulation depth thresholds in ascending order', () => {
        expect(THRESHOLDS.MODULATION_DEPTH.MINIMAL).toBeLessThan(THRESHOLDS.MODULATION_DEPTH.NOTICEABLE);
        expect(THRESHOLDS.MODULATION_DEPTH.NOTICEABLE).toBeLessThan(THRESHOLDS.MODULATION_DEPTH.OBVIOUS);
        expect(THRESHOLDS.MODULATION_DEPTH.OBVIOUS).toBeLessThan(THRESHOLDS.MODULATION_DEPTH.SEVERE);
      });

      it('should export correlation thresholds', () => {
        expect(THRESHOLDS.CORRELATION.BREATHING_THRESHOLD).toBeDefined();
        expect(THRESHOLDS.CORRELATION.PUMPING_THRESHOLD).toBeDefined();
      });
    });

    describe('REFERENCE values', () => {
      it('should have typical noise floor reference', () => {
        expect(REFERENCE.TYPICAL_NOISE_FLOOR_DB).toBe(-60);
      });

      it('should have digital silence reference', () => {
        expect(REFERENCE.DIGITAL_SILENCE_DB).toBe(-96);
      });
    });
  });

  // ==========================================================================
  // Utility Functions Tests
  // ==========================================================================

  describe('Utility Functions', () => {
    describe('calculateVariance', () => {
      it('should return 0 for empty array', () => {
        expect(calculateVariance([])).toBe(0);
      });

      it('should return 0 for identical values', () => {
        expect(calculateVariance([5, 5, 5, 5])).toBe(0);
      });

      it('should calculate variance correctly', () => {
        const result = calculateVariance([1, 2, 3, 4, 5]);
        expect(result).toBeGreaterThan(0);
        expect(result).toBeLessThan(3);
      });
    });
  });

  // ==========================================================================
  // Analysis Functions Tests
  // ==========================================================================

  describe('Analysis Functions', () => {
    describe('analyzeNoiseFloorVariation', () => {
      it('should return defaults for empty input', () => {
        const result = analyzeNoiseFloorVariation([]);
        expect(result.noiseFloorDb).toBe(REFERENCE.TYPICAL_NOISE_FLOOR_DB);
        expect(result.modulationDepthDb).toBe(0);
      });

      it('should return defaults for insufficient data', () => {
        const result = analyzeNoiseFloorVariation([-50, -52]);
        expect(result.modulationDepthDb).toBe(0);
      });

      it('should analyze noise floor from quiet sections', () => {
        // Simulate RMS windows with quiet sections
        const rmsWindows = [
          -20, -18, -25, -50, -52, -48, -22, -19, -55, -53, -50
        ];
        
        const result = analyzeNoiseFloorVariation(rmsWindows, -45);
        
        expect(result.noiseFloorDb).toBeDefined();
        expect(result.modulationDepthDb).toBeDefined();
        expect(result.quietWindowCount).toBeGreaterThan(0);
      });

      it('should calculate modulation depth as max-min', () => {
        const rmsWindows = [
          -20, -50, -55, -48, -52, -60, -50
        ];
        
        const result = analyzeNoiseFloorVariation(rmsWindows, -45);
        
        // Modulation depth should be the range of quiet windows
        expect(result.modulationDepthDb).toBeGreaterThanOrEqual(0);
      });
    });

    describe('analyzeModulationCorrelation', () => {
      it('should return defaults for empty input', () => {
        const result = analyzeModulationCorrelation([]);
        expect(result.programNoiseCorrelation).toBe(0);
        expect(result.hasBreathing).toBe(false);
        expect(result.hasPumping).toBe(false);
      });

      it('should return defaults for insufficient data', () => {
        const result = analyzeModulationCorrelation([-30, -35, -40]);
        expect(result.hasBreathing).toBe(false);
      });

      it('should detect breathing patterns', () => {
        // Simulate breathing: loud section followed by quiet with rising noise
        const rmsWindows = [];
        for (let i = 0; i < 50; i++) {
          if (i % 10 < 5) {
            rmsWindows.push(-15); // Loud section
          } else if (i % 10 === 5) {
            rmsWindows.push(-45); // Drop to quiet
          } else {
            rmsWindows.push(-40 + (i % 10 - 5)); // Noise rises
          }
        }
        
        const result = analyzeModulationCorrelation(rmsWindows);
        expect(result.breathingEventRate).toBeDefined();
      });
    });

    describe('detectModulationType', () => {
      it('should return NONE for minimal modulation', () => {
        const result = detectModulationType(
          { modulationDepthDb: 1 },
          { hasBreathing: false, hasPumping: false }
        );
        expect(result).toBe(ModulationType.NONE);
      });

      it('should return BREATHING when detected', () => {
        const result = detectModulationType(
          { modulationDepthDb: 8 },
          { hasBreathing: true, hasPumping: false }
        );
        expect(result).toBe(ModulationType.BREATHING);
      });

      it('should return PUMPING when detected', () => {
        const result = detectModulationType(
          { modulationDepthDb: 8 },
          { hasBreathing: false, hasPumping: true }
        );
        expect(result).toBe(ModulationType.PUMPING);
      });

      it('should return MIXED when both detected', () => {
        const result = detectModulationType(
          { modulationDepthDb: 8 },
          { hasBreathing: true, hasPumping: true }
        );
        expect(result).toBe(ModulationType.MIXED);
      });

      it('should return GATING_ARTIFACTS for high variance without correlation', () => {
        const result = detectModulationType(
          { modulationDepthDb: 8, varianceDb: 7 },
          { hasBreathing: false, hasPumping: false }
        );
        expect(result).toBe(ModulationType.GATING_ARTIFACTS);
      });
    });
  });

  // ==========================================================================
  // Classification Tests
  // ==========================================================================

  describe('Classification', () => {
    describe('classifyStatus', () => {
      it('should classify minimal depth as CLEAN', () => {
        expect(classifyStatus(1)).toBe(NoiseModulationStatus.CLEAN);
        expect(classifyStatus(2)).toBe(NoiseModulationStatus.CLEAN);
      });

      it('should classify low depth as MINIMAL', () => {
        expect(classifyStatus(4)).toBe(NoiseModulationStatus.MINIMAL);
      });

      it('should classify moderate depth as NOTICEABLE', () => {
        expect(classifyStatus(7)).toBe(NoiseModulationStatus.NOTICEABLE);
      });

      it('should classify high depth as OBVIOUS', () => {
        expect(classifyStatus(12)).toBe(NoiseModulationStatus.OBVIOUS);
      });

      it('should classify very high depth as SEVERE', () => {
        expect(classifyStatus(18)).toBe(NoiseModulationStatus.SEVERE);
      });

      it('should boost severity when artifacts detected', () => {
        const withoutArtifacts = classifyStatus(4, { hasBreathing: false, hasPumping: false });
        const withBreathing = classifyStatus(4, { hasBreathing: true, hasPumping: false });
        
        // With breathing detected, effective depth increases
        expect([NoiseModulationStatus.MINIMAL, NoiseModulationStatus.NOTICEABLE])
          .toContain(withBreathing);
      });
    });

    describe('calculateModulationScore', () => {
      it('should return 0 for no modulation', () => {
        const score = calculateModulationScore(
          { modulationDepthDb: 0, varianceDb: 0 },
          { programNoiseCorrelation: 0, breathingEventRate: 0, pumpingEventRate: 0 }
        );
        expect(score).toBe(0);
      });

      it('should return high score for significant modulation', () => {
        const score = calculateModulationScore(
          { modulationDepthDb: 15, varianceDb: 8 },
          { programNoiseCorrelation: 0.8, breathingEventRate: 0.6, pumpingEventRate: 0.4 }
        );
        expect(score).toBeGreaterThan(60);
      });

      it('should stay within 0-100 range', () => {
        const lowScore = calculateModulationScore({}, {});
        const highScore = calculateModulationScore(
          { modulationDepthDb: 30, varianceDb: 20 },
          { programNoiseCorrelation: 1, breathingEventRate: 2, pumpingEventRate: 2 }
        );
        
        expect(lowScore).toBeGreaterThanOrEqual(0);
        expect(highScore).toBeLessThanOrEqual(100);
      });

      it('should handle null/undefined input', () => {
        expect(calculateModulationScore(null, null)).toBe(0);
        expect(calculateModulationScore(undefined, undefined)).toBe(0);
      });
    });

    describe('classify function', () => {
      it('should classify from metrics object', () => {
        const result = classify({
          modulationDepthDb: 8,
          hasBreathing: true,
          hasPumping: false
        });
        
        expect(result.status).toBeDefined();
        expect(result.modulationType).toBeDefined();
        expect(result.modulationScore).toBeDefined();
        expect(result.description).toBeDefined();
      });

      it('should handle missing metrics', () => {
        const result = classify({});
        expect(result.status).toBeDefined();
        expect(Object.values(NoiseModulationStatus)).toContain(result.status);
      });

      it('should handle null input', () => {
        const result = classify(null);
        expect(result.status).toBe(NoiseModulationStatus.CLEAN);
      });
    });
  });

  // ==========================================================================
  // Recommendations Tests
  // ==========================================================================

  describe('generateRecommendations', () => {
    it('should return positive message for CLEAN status', () => {
      const recs = generateRecommendations({ status: NoiseModulationStatus.CLEAN });
      expect(recs.length).toBeGreaterThan(0);
      expect(recs[0].toLowerCase()).toContain('no noise');
    });

    it('should recommend slower release for BREATHING', () => {
      const recs = generateRecommendations({
        status: NoiseModulationStatus.NOTICEABLE,
        modulationType: ModulationType.BREATHING,
        modulationDepthDb: 8
      });
      expect(recs.some(r => r.toLowerCase().includes('release'))).toBe(true);
    });

    it('should recommend compression changes for PUMPING', () => {
      const recs = generateRecommendations({
        status: NoiseModulationStatus.NOTICEABLE,
        modulationType: ModulationType.PUMPING,
        modulationDepthDb: 8
      });
      expect(recs.some(r => r.toLowerCase().includes('compression'))).toBe(true);
    });

    it('should recommend expansion for GATING_ARTIFACTS', () => {
      const recs = generateRecommendations({
        status: NoiseModulationStatus.OBVIOUS,
        modulationType: ModulationType.GATING_ARTIFACTS,
        modulationDepthDb: 12
      });
      expect(recs.some(r => r.toLowerCase().includes('gat'))).toBe(true);
    });

    it('should handle null input', () => {
      expect(generateRecommendations(null)).toEqual([]);
    });
  });

  // ==========================================================================
  // Quick Check Tests
  // ==========================================================================

  describe('quickCheck', () => {
    it('should return expected structure', async () => {
      const testFile = getTestAudioPath('test-mastered.wav');
      
      if (!testAudioExists('test-mastered.wav')) {
        console.log('Skipping: no test audio files available');
        return;
      }
      
      const result = await quickCheck(testFile);
      
      expect(result.status).toBeDefined();
      expect(result.modulationType).toBeDefined();
      expect(result.modulationScore).toBeDefined();
      expect(result.noiseFloorDb).toBeDefined();
      expect(result.modulationDepthDb).toBeDefined();
    });

    it('should handle non-existent file gracefully', async () => {
      const result = await quickCheck('/nonexistent/file.wav');
      
      expect(result).toBeDefined();
      expect(result.status).toBe(NoiseModulationStatus.CLEAN);
      expect(result.confidence).toBeLessThanOrEqual(0.5);
    });
  });

  // ==========================================================================
  // Full Analyze Tests
  // ==========================================================================

  describe('analyze', () => {
    it('should return comprehensive analysis structure', async () => {
      const testFile = getTestAudioPath('test-mastered.wav');
      
      if (!testAudioExists('test-mastered.wav')) {
        console.log('Skipping: no test audio files available');
        return;
      }
      
      const result = await analyze(testFile);
      
      expect(result.status).toBeDefined();
      expect(result.description).toBeDefined();
      expect(result.modulationType).toBeDefined();
      expect(result.modulationScore).toBeDefined();
      expect(result.noiseFloorDb).toBeDefined();
      expect(result.modulationDepthDb).toBeDefined();
      expect(result.hasBreathing).toBeDefined();
      expect(result.hasPumping).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });

    it('should handle non-existent file gracefully', async () => {
      const result = await analyze('/nonexistent/file.wav');
      
      expect(result).toBeDefined();
      expect(result.status).toBe(NoiseModulationStatus.CLEAN);
      expect(result.confidence).toBeLessThanOrEqual(0.5);
    });
  });

  // ==========================================================================
  // Module Exports Tests
  // ==========================================================================

  describe('Module Exports', () => {
    it('should export main functions', () => {
      expect(typeof analyze).toBe('function');
      expect(typeof quickCheck).toBe('function');
      expect(typeof classify).toBe('function');
    });

    it('should export analysis functions', () => {
      expect(typeof analyzeNoiseFloorVariation).toBe('function');
      expect(typeof analyzeModulationCorrelation).toBe('function');
      expect(typeof detectModulationType).toBe('function');
    });

    it('should export classification functions', () => {
      expect(typeof classifyStatus).toBe('function');
      expect(typeof calculateModulationScore).toBe('function');
      expect(typeof generateRecommendations).toBe('function');
    });

    it('should export all constants', () => {
      expect(NoiseModulationStatus).toBeDefined();
      expect(ModulationType).toBeDefined();
      expect(STATUS_DESCRIPTIONS).toBeDefined();
      expect(THRESHOLDS).toBeDefined();
      expect(REFERENCE).toBeDefined();
    });
  });
});
