/**
 * Tests for Clipping Propagation Detector
 * 
 * Validates upstream vs downstream clipping detection and severity classification.
 */

const path = require('path');
const fs = require('fs');

const clippingPropagationDetector = require('../services/clippingPropagationDetector');

const {
  analyze,
  quickCheck,
  classify,
  calculateClipDensity,
  classifySeverity,
  determineSource,
  calculateClippingScore,
  detectAsymmetry,
  generateRecommendations,
  ClippingSource,
  ClippingSeverity,
  STATUS_DESCRIPTIONS,
  THRESHOLDS,
  REFERENCE
} = clippingPropagationDetector;

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

describe('Clipping Propagation Detector', () => {
  describe('Constants', () => {
    describe('ClippingSource enum', () => {
      it('should export all source classifications', () => {
        expect(ClippingSource.NONE).toBe('NONE');
        expect(ClippingSource.UPSTREAM).toBe('UPSTREAM');
        expect(ClippingSource.DOWNSTREAM).toBe('DOWNSTREAM');
        expect(ClippingSource.MIXED).toBe('MIXED');
        expect(ClippingSource.SOFT_CLIP).toBe('SOFT_CLIP');
        expect(ClippingSource.UNDETERMINED).toBe('UNDETERMINED');
      });

      it('should have exactly 6 source types', () => {
        expect(Object.keys(ClippingSource)).toHaveLength(6);
      });
    });

    describe('ClippingSeverity enum', () => {
      it('should export all severity levels', () => {
        expect(ClippingSeverity.NONE).toBe('NONE');
        expect(ClippingSeverity.MINOR).toBe('MINOR');
        expect(ClippingSeverity.MODERATE).toBe('MODERATE');
        expect(ClippingSeverity.SEVERE).toBe('SEVERE');
        expect(ClippingSeverity.EXTREME).toBe('EXTREME');
      });

      it('should have exactly 5 severity levels', () => {
        expect(Object.keys(ClippingSeverity)).toHaveLength(5);
      });
    });

    describe('STATUS_DESCRIPTIONS', () => {
      it('should have descriptions for all source types', () => {
        Object.values(ClippingSource).forEach(source => {
          expect(STATUS_DESCRIPTIONS[source]).toBeDefined();
          expect(typeof STATUS_DESCRIPTIONS[source]).toBe('string');
          expect(STATUS_DESCRIPTIONS[source].length).toBeGreaterThan(10);
        });
      });
    });

    describe('THRESHOLDS', () => {
      it('should export clip detection thresholds', () => {
        expect(THRESHOLDS.CLIP_DETECTION.CEILING_DB).toBeDefined();
        expect(THRESHOLDS.CLIP_DETECTION.CONSECUTIVE_MIN).toBeDefined();
      });

      it('should export density thresholds in ascending order', () => {
        expect(THRESHOLDS.DENSITY.MINOR).toBeLessThan(THRESHOLDS.DENSITY.MODERATE);
        expect(THRESHOLDS.DENSITY.MODERATE).toBeLessThan(THRESHOLDS.DENSITY.SEVERE);
      });

      it('should export waveform thresholds', () => {
        expect(THRESHOLDS.WAVEFORM.FLAT_FACTOR_HARD_CLIP).toBeGreaterThan(
          THRESHOLDS.WAVEFORM.FLAT_FACTOR_SOFT_CLIP
        );
      });
    });
  });

  // ==========================================================================
  // Calculation Functions Tests
  // ==========================================================================

  describe('Calculation Functions', () => {
    describe('calculateClipDensity', () => {
      it('should return 0 for no clipped samples', () => {
        expect(calculateClipDensity(0, 100000)).toBe(0);
      });

      it('should calculate correct percentage', () => {
        expect(calculateClipDensity(100, 10000)).toBe(1);
        expect(calculateClipDensity(50, 10000)).toBe(0.5);
        expect(calculateClipDensity(1, 10000)).toBe(0.01);
      });

      it('should handle zero total samples', () => {
        expect(calculateClipDensity(100, 0)).toBe(0);
      });
    });

    describe('classifySeverity', () => {
      it('should classify zero density as NONE', () => {
        expect(classifySeverity(0)).toBe(ClippingSeverity.NONE);
      });

      it('should classify very low density as MINOR', () => {
        expect(classifySeverity(0.005)).toBe(ClippingSeverity.MINOR);
      });

      it('should classify low density as MODERATE', () => {
        expect(classifySeverity(0.05)).toBe(ClippingSeverity.MODERATE);
      });

      it('should classify high density as SEVERE', () => {
        expect(classifySeverity(0.5)).toBe(ClippingSeverity.SEVERE);
      });

      it('should classify very high density as EXTREME', () => {
        expect(classifySeverity(2.0)).toBe(ClippingSeverity.EXTREME);
      });
    });

    describe('determineSource', () => {
      it('should return NONE for clean signal', () => {
        const source = determineSource(
          { peakDb: -3.0, flatFactor: 0.01 },
          { distribution: 'NONE' }
        );
        expect(source).toBe(ClippingSource.NONE);
      });

      it('should return SOFT_CLIP for moderate limiting', () => {
        const source = determineSource(
          { peakDb: -0.5, flatFactor: 0.15 },
          { distribution: 'SCATTERED' }
        );
        expect(source).toBe(ClippingSource.SOFT_CLIP);
      });

      it('should return UPSTREAM for consistent clipping distribution', () => {
        const source = determineSource(
          { peakDb: -0.05, flatFactor: 0.4 },
          { distribution: 'CONSISTENT' }
        );
        expect(source).toBe(ClippingSource.UPSTREAM);
      });

      it('should return DOWNSTREAM for end-heavy clipping', () => {
        const source = determineSource(
          { peakDb: -0.05, flatFactor: 0.4 },
          { distribution: 'END_HEAVY' }
        );
        expect(source).toBe(ClippingSource.DOWNSTREAM);
      });

      it('should return MIXED for scattered clipping', () => {
        const source = determineSource(
          { peakDb: -0.05, flatFactor: 0.4 },
          { distribution: 'SCATTERED' }
        );
        expect(source).toBe(ClippingSource.MIXED);
      });
    });

    describe('calculateClippingScore', () => {
      it('should return 0 for clean signal', () => {
        const score = calculateClippingScore(
          { peakDb: -6.0, flatFactor: 0, crestFactorDb: 15 },
          { clippingRatio: 0 }
        );
        expect(score).toBe(0);
      });

      it('should return high score for clipped signal', () => {
        const score = calculateClippingScore(
          { peakDb: 0, flatFactor: 0.5, crestFactorDb: 4 },
          { clippingRatio: 0.1 }
        );
        expect(score).toBeGreaterThan(60);
      });

      it('should increase with flat factor', () => {
        const score1 = calculateClippingScore(
          { peakDb: -1.0, flatFactor: 0.1, crestFactorDb: 10 },
          {}
        );
        const score2 = calculateClippingScore(
          { peakDb: -1.0, flatFactor: 0.3, crestFactorDb: 10 },
          {}
        );
        expect(score2).toBeGreaterThan(score1);
      });

      it('should stay within 0-100 range', () => {
        const lowScore = calculateClippingScore(
          { peakDb: -20, flatFactor: 0, crestFactorDb: 20 },
          {}
        );
        const highScore = calculateClippingScore(
          { peakDb: 3, flatFactor: 1.0, crestFactorDb: 2 },
          { clippingRatio: 0.5 }
        );
        
        expect(lowScore).toBeGreaterThanOrEqual(0);
        expect(highScore).toBeLessThanOrEqual(100);
      });
    });

    describe('detectAsymmetry', () => {
      it('should return false for balanced channels', () => {
        const result = detectAsymmetry([
          { channel: 0, peakDb: -1.0 },
          { channel: 1, peakDb: -1.2 }
        ]);
        expect(result).toBe(false);
      });

      it('should return true for asymmetric channels', () => {
        const result = detectAsymmetry([
          { channel: 0, peakDb: -0.5 },
          { channel: 1, peakDb: -3.0 }
        ]);
        expect(result).toBe(true);
      });

      it('should handle single channel', () => {
        expect(detectAsymmetry([{ channel: 0, peakDb: -1.0 }])).toBe(false);
      });

      it('should handle empty/null input', () => {
        expect(detectAsymmetry([])).toBe(false);
        expect(detectAsymmetry(null)).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Recommendations Tests
  // ==========================================================================

  describe('generateRecommendations', () => {
    it('should return positive message for NONE source', () => {
      const recs = generateRecommendations({ source: ClippingSource.NONE });
      expect(recs.length).toBeGreaterThan(0);
      expect(recs[0].toLowerCase()).toContain('no clipping');
    });

    it('should recommend source replacement for UPSTREAM', () => {
      const recs = generateRecommendations({
        source: ClippingSource.UPSTREAM,
        severity: ClippingSeverity.MODERATE
      });
      expect(recs.some(r => r.toLowerCase().includes('source'))).toBe(true);
    });

    it('should recommend gain staging review for DOWNSTREAM', () => {
      const recs = generateRecommendations({
        source: ClippingSource.DOWNSTREAM,
        severity: ClippingSeverity.MODERATE
      });
      expect(recs.some(r => 
        r.toLowerCase().includes('gain') || r.toLowerCase().includes('processing')
      )).toBe(true);
    });

    it('should warn about extreme severity', () => {
      const recs = generateRecommendations({
        source: ClippingSource.UPSTREAM,
        severity: ClippingSeverity.EXTREME
      });
      expect(recs.some(r => 
        r.toLowerCase().includes('critical') || r.toLowerCase().includes('extreme')
      )).toBe(true);
    });

    it('should handle null input', () => {
      expect(generateRecommendations(null)).toEqual([]);
    });
  });

  // ==========================================================================
  // Classify Function Tests
  // ==========================================================================

  describe('classify', () => {
    it('should classify from metrics object', () => {
      const result = classify({
        peakDb: -0.5,
        flatFactor: 0.2,
        clipDensityPercent: 0.05
      });
      
      expect(result.source).toBeDefined();
      expect(result.severity).toBeDefined();
      expect(result.description).toBeDefined();
      expect(result.clippingScore).toBeDefined();
    });

    it('should handle missing metrics', () => {
      const result = classify({});
      expect(result.source).toBeDefined();
      expect(Object.values(ClippingSource)).toContain(result.source);
    });

    it('should handle null input', () => {
      const result = classify(null);
      expect(result.source).toBeDefined();
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
      
      expect(result.source).toBeDefined();
      expect(result.severity).toBeDefined();
      expect(result.peakDb).toBeDefined();
      expect(result.flatFactor).toBeDefined();
      expect(result.clippingScore).toBeDefined();
    });

    it('should handle non-existent file gracefully', async () => {
      const result = await quickCheck('/nonexistent/file.wav');
      
      expect(result).toBeDefined();
      expect(result.source).toBeDefined();
      expect(Object.values(ClippingSource)).toContain(result.source);
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
      
      expect(result.source).toBeDefined();
      expect(result.severity).toBeDefined();
      expect(result.description).toBeDefined();
      expect(result.clippingScore).toBeDefined();
      expect(result.peakDb).toBeDefined();
      expect(result.flatFactor).toBeDefined();
      expect(result.temporalDistribution).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });

    it('should include temporal distribution', async () => {
      const testFile = getTestAudioPath('test-mastered.wav');
      
      if (!testAudioExists('test-mastered.wav')) {
        console.log('Skipping: no test audio files available');
        return;
      }
      
      const result = await analyze(testFile);
      
      expect(result.temporalDistribution).toBeDefined();
      expect(['NONE', 'CONSISTENT', 'END_HEAVY', 'START_HEAVY', 'SCATTERED', 'UNKNOWN'])
        .toContain(result.temporalDistribution);
    });

    it('should handle non-existent file gracefully', async () => {
      const result = await analyze('/nonexistent/file.wav');
      
      expect(result).toBeDefined();
      expect(result.source).toBeDefined();
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

    it('should export calculation functions', () => {
      expect(typeof calculateClipDensity).toBe('function');
      expect(typeof classifySeverity).toBe('function');
      expect(typeof determineSource).toBe('function');
      expect(typeof calculateClippingScore).toBe('function');
      expect(typeof detectAsymmetry).toBe('function');
    });

    it('should export all constants', () => {
      expect(ClippingSource).toBeDefined();
      expect(ClippingSeverity).toBeDefined();
      expect(STATUS_DESCRIPTIONS).toBeDefined();
      expect(THRESHOLDS).toBeDefined();
      expect(REFERENCE).toBeDefined();
    });
  });
});
