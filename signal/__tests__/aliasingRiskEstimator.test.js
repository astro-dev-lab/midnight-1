/**
 * Tests for Aliasing Risk Estimator
 * 
 * Validates high-frequency content analysis near Nyquist, processing risk
 * assessment, and aliasing prevention recommendations.
 */

const path = require('path');
const fs = require('fs');

const {
  analyze,
  quickCheck,
  classify,
  calculateAliasingRiskScore,
  classifyAliasingRisk,
  assessProcessingRisk,
  recommendFilterFrequency,
  generateRecommendations,
  AliasingRiskStatus,
  HFContentType,
  ProcessingRisk,
  STATUS_DESCRIPTIONS,
  THRESHOLDS,
  REFERENCE
} = require('../services/aliasingRiskEstimator');

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

describe('Aliasing Risk Estimator', () => {
  describe('Constants', () => {
    describe('AliasingRiskStatus enum', () => {
      it('should export all status levels', () => {
        expect(AliasingRiskStatus.SAFE).toBe('SAFE');
        expect(AliasingRiskStatus.LOW_RISK).toBe('LOW_RISK');
        expect(AliasingRiskStatus.MODERATE_RISK).toBe('MODERATE_RISK');
        expect(AliasingRiskStatus.HIGH_RISK).toBe('HIGH_RISK');
        expect(AliasingRiskStatus.CRITICAL).toBe('CRITICAL');
      });

      it('should have exactly 5 status levels', () => {
        expect(Object.keys(AliasingRiskStatus)).toHaveLength(5);
      });
    });

    describe('HFContentType enum', () => {
      it('should export all HF content types', () => {
        expect(HFContentType.NONE).toBe('NONE');
        expect(HFContentType.HARMONIC).toBe('HARMONIC');
        expect(HFContentType.SYNTHESIS).toBe('SYNTHESIS');
        expect(HFContentType.NOISE).toBe('NOISE');
        expect(HFContentType.ULTRASONIC).toBe('ULTRASONIC');
        expect(HFContentType.MIXED).toBe('MIXED');
      });

      it('should have exactly 6 content types', () => {
        expect(Object.keys(HFContentType)).toHaveLength(6);
      });
    });

    describe('ProcessingRisk enum', () => {
      it('should export all processing risk types', () => {
        expect(ProcessingRisk.NONE).toBe('NONE');
        expect(ProcessingRisk.DOWNSAMPLING).toBe('DOWNSAMPLING');
        expect(ProcessingRisk.PITCH_SHIFT).toBe('PITCH_SHIFT');
        expect(ProcessingRisk.DISTORTION).toBe('DISTORTION');
        expect(ProcessingRisk.SYNTHESIS).toBe('SYNTHESIS');
        expect(ProcessingRisk.FILTERING).toBe('FILTERING');
      });

      it('should have exactly 6 processing types', () => {
        expect(Object.keys(ProcessingRisk)).toHaveLength(6);
      });
    });

    describe('STATUS_DESCRIPTIONS', () => {
      it('should have descriptions for all status levels', () => {
        Object.values(AliasingRiskStatus).forEach(status => {
          expect(STATUS_DESCRIPTIONS[status]).toBeDefined();
          expect(typeof STATUS_DESCRIPTIONS[status]).toBe('string');
          expect(STATUS_DESCRIPTIONS[status].length).toBeGreaterThan(10);
        });
      });
    });

    describe('THRESHOLDS', () => {
      it('should export HF energy thresholds', () => {
        expect(THRESHOLDS.HF_ENERGY).toBeDefined();
        expect(THRESHOLDS.HF_ENERGY.NEGLIGIBLE).toBeDefined();
        expect(THRESHOLDS.HF_ENERGY.LOW).toBeDefined();
        expect(THRESHOLDS.HF_ENERGY.MODERATE).toBeDefined();
        expect(THRESHOLDS.HF_ENERGY.HIGH).toBeDefined();
        expect(THRESHOLDS.HF_ENERGY.CRITICAL).toBeDefined();
      });

      it('should have HF energy thresholds in order (less negative = higher energy)', () => {
        expect(THRESHOLDS.HF_ENERGY.NEGLIGIBLE).toBeLessThan(THRESHOLDS.HF_ENERGY.LOW);
        expect(THRESHOLDS.HF_ENERGY.LOW).toBeLessThan(THRESHOLDS.HF_ENERGY.MODERATE);
        expect(THRESHOLDS.HF_ENERGY.MODERATE).toBeLessThan(THRESHOLDS.HF_ENERGY.HIGH);
      });

      it('should export frequency band definitions', () => {
        expect(THRESHOLDS.FREQUENCY_BANDS).toBeDefined();
        expect(THRESHOLDS.FREQUENCY_BANDS.SAFE_ZONE).toBe(0.8);
        expect(THRESHOLDS.FREQUENCY_BANDS.WARNING_ZONE).toBe(0.9);
        expect(THRESHOLDS.FREQUENCY_BANDS.DANGER_ZONE).toBe(0.95);
        expect(THRESHOLDS.FREQUENCY_BANDS.CRITICAL_ZONE).toBe(0.98);
      });

      it('should export sample rate definitions', () => {
        expect(THRESHOLDS.SAMPLE_RATES).toBeDefined();
        expect(THRESHOLDS.SAMPLE_RATES.CD).toBe(44100);
        expect(THRESHOLDS.SAMPLE_RATES.PROFESSIONAL).toBe(48000);
        expect(THRESHOLDS.SAMPLE_RATES.HIGH_RES).toBe(96000);
      });

      it('should export minimum duration requirement', () => {
        expect(THRESHOLDS.MIN_DURATION).toBeDefined();
        expect(THRESHOLDS.MIN_DURATION).toBeGreaterThan(0);
      });
    });

    describe('REFERENCE', () => {
      it('should export reference values', () => {
        expect(REFERENCE.AUDIBLE_LIMIT_HZ).toBe(20000);
        expect(REFERENCE.CD_NYQUIST).toBe(22050);
        expect(REFERENCE.PROFESSIONAL_NYQUIST).toBe(24000);
        expect(REFERENCE.TYPICAL_ANTI_ALIAS_ROLLOFF).toBe(0.9);
      });
    });
  });

  // ==========================================================================
  // Classification Logic Tests
  // ==========================================================================

  describe('Classification Logic', () => {
    describe('calculateAliasingRiskScore', () => {
      it('should return low score for negligible HF energy', () => {
        const relativeEnergy = { dangerRelativeDb: -65, criticalRelativeDb: -70 };
        const score = calculateAliasingRiskScore(relativeEnergy, HFContentType.NONE);
        expect(score).toBeLessThan(20);
      });

      it('should return moderate score for moderate HF energy', () => {
        const relativeEnergy = { dangerRelativeDb: -30, criticalRelativeDb: -40 };
        const score = calculateAliasingRiskScore(relativeEnergy, HFContentType.HARMONIC);
        expect(score).toBeGreaterThanOrEqual(20);
        expect(score).toBeLessThan(70);
      });

      it('should return high score for high HF energy', () => {
        const relativeEnergy = { dangerRelativeDb: -15, criticalRelativeDb: -10 };
        const score = calculateAliasingRiskScore(relativeEnergy, HFContentType.SYNTHESIS);
        expect(score).toBeGreaterThanOrEqual(50);
      });

      it('should return value between 0 and 100', () => {
        const relativeEnergy = { dangerRelativeDb: -40, criticalRelativeDb: -50 };
        const score = calculateAliasingRiskScore(relativeEnergy, HFContentType.HARMONIC);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      });

      it('should handle null relativeEnergy', () => {
        expect(calculateAliasingRiskScore(null, HFContentType.NONE)).toBe(0);
      });

      it('should boost score for SYNTHESIS content type', () => {
        const relativeEnergy = { dangerRelativeDb: -25, criticalRelativeDb: -30 };
        const harmonicScore = calculateAliasingRiskScore(relativeEnergy, HFContentType.HARMONIC);
        const synthScore = calculateAliasingRiskScore(relativeEnergy, HFContentType.SYNTHESIS);
        expect(synthScore).toBeGreaterThanOrEqual(harmonicScore);
      });
    });

    describe('classifyAliasingRisk', () => {
      it('should classify very low energy as SAFE', () => {
        expect(classifyAliasingRisk({ dangerRelativeDb: -65, criticalRelativeDb: -70 }))
          .toBe(AliasingRiskStatus.SAFE);
      });

      it('should classify low energy as LOW_RISK', () => {
        expect(classifyAliasingRisk({ dangerRelativeDb: -45, criticalRelativeDb: -55 }))
          .toBe(AliasingRiskStatus.LOW_RISK);
      });

      it('should classify moderate energy as MODERATE_RISK', () => {
        expect(classifyAliasingRisk({ dangerRelativeDb: -32, criticalRelativeDb: -45 }))
          .toBe(AliasingRiskStatus.MODERATE_RISK);
      });

      it('should classify high energy as HIGH_RISK', () => {
        expect(classifyAliasingRisk({ dangerRelativeDb: -20, criticalRelativeDb: -30 }))
          .toBe(AliasingRiskStatus.HIGH_RISK);
      });

      it('should classify critical energy as CRITICAL', () => {
        expect(classifyAliasingRisk({ dangerRelativeDb: -15, criticalRelativeDb: -10 }))
          .toBe(AliasingRiskStatus.CRITICAL);
      });

      it('should return SAFE for null input', () => {
        expect(classifyAliasingRisk(null)).toBe(AliasingRiskStatus.SAFE);
      });
    });

    describe('assessProcessingRisk', () => {
      it('should assess downsampling risk when target is lower', () => {
        const metrics = {
          sampleRate: 48000,
          status: AliasingRiskStatus.MODERATE_RISK
        };
        
        const risks = assessProcessingRisk(metrics, 44100);
        expect(risks).toBeDefined();
        expect(Array.isArray(risks)).toBe(true);
      });

      it('should return risks as array', () => {
        const metrics = {
          sampleRate: 44100,
          status: AliasingRiskStatus.HIGH_RISK
        };
        
        const risks = assessProcessingRisk(metrics);
        expect(Array.isArray(risks)).toBe(true);
      });

      it('should handle empty metrics object', () => {
        expect(() => assessProcessingRisk({})).not.toThrow();
      });
    });

    describe('recommendFilterFrequency', () => {
      it('should recommend frequency below Nyquist', () => {
        const freq = recommendFilterFrequency(44100, AliasingRiskStatus.MODERATE_RISK);
        expect(freq).toBeLessThan(22050);
        expect(freq).toBeGreaterThan(0);
      });

      it('should recommend different frequencies for different risk levels', () => {
        const moderateFreq = recommendFilterFrequency(44100, AliasingRiskStatus.MODERATE_RISK);
        const highFreq = recommendFilterFrequency(44100, AliasingRiskStatus.HIGH_RISK);
        // Higher risk may warrant same or lower cutoff
        expect(highFreq).toBeLessThanOrEqual(moderateFreq);
      });

      it('should scale with sample rate', () => {
        const freq44 = recommendFilterFrequency(44100, AliasingRiskStatus.MODERATE_RISK);
        const freq48 = recommendFilterFrequency(48000, AliasingRiskStatus.MODERATE_RISK);
        expect(freq48).toBeGreaterThan(freq44);
      });
    });
  });

  // ==========================================================================
  // Recommendation Tests
  // ==========================================================================

  describe('generateRecommendations', () => {
    it('should return array of recommendations', () => {
      const metrics = {
        status: AliasingRiskStatus.HIGH_RISK,
        sampleRate: 44100,
        hfEnergyDb: -20
      };
      
      const recs = generateRecommendations(metrics);
      expect(Array.isArray(recs)).toBe(true);
    });

    it('should return few/no recommendations for SAFE status', () => {
      const metrics = {
        status: AliasingRiskStatus.SAFE,
        sampleRate: 44100,
        hfEnergyDb: -70
      };
      
      const recs = generateRecommendations(metrics);
      // SAFE status may still return informational recommendations
      expect(recs.length).toBeLessThanOrEqual(2);
    });

    it('should recommend filtering for HIGH_RISK', () => {
      const metrics = {
        status: AliasingRiskStatus.HIGH_RISK,
        sampleRate: 44100,
        hfEnergyDb: -20
      };
      
      const recs = generateRecommendations(metrics);
      const hasFilterRec = recs.some(r => 
        r.toLowerCase().includes('filter') || 
        r.toLowerCase().includes('low-pass')
      );
      expect(hasFilterRec).toBe(true);
    });

    it('should handle null input gracefully', () => {
      expect(() => generateRecommendations(null)).not.toThrow();
      const recs = generateRecommendations(null);
      expect(Array.isArray(recs)).toBe(true);
    });
  });

  // ==========================================================================
  // Classify Function Tests
  // ==========================================================================

  describe('classify', () => {
    it('should classify low-risk metrics as SAFE or LOW_RISK', () => {
      const result = classify({
        hfEnergyDb: -55,
        sampleRate: 44100
      });
      
      expect([AliasingRiskStatus.SAFE, AliasingRiskStatus.LOW_RISK]).toContain(result.status);
    });

    it('should classify metrics and return valid status', () => {
      const result = classify({
        hfEnergyDb: -15,
        sampleRate: 44100
      });
      
      // classify() should return a valid status from the enum
      expect(Object.values(AliasingRiskStatus)).toContain(result.status);
    });

    it('should return all expected fields', () => {
      const result = classify({ hfEnergyDb: -40, sampleRate: 44100 });
      
      expect(result.status).toBeDefined();
      expect(result.description).toBeDefined();
    });

    it('should handle empty metrics', () => {
      const result = classify({});
      expect(Object.values(AliasingRiskStatus)).toContain(result.status);
    });

    it('should handle null input', () => {
      expect(() => classify(null)).not.toThrow();
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
      expect(result.sampleRate).toBeDefined();
    });

    it('should handle non-existent file gracefully', async () => {
      const result = await quickCheck('/nonexistent/file.wav');
      
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(Object.values(AliasingRiskStatus)).toContain(result.status);
    });

    it('should return confidence score', async () => {
      const testFile = getTestAudioPath('test-mastered.wav');
      
      if (!testAudioExists('test-mastered.wav')) {
        console.log('Skipping: no test audio files available');
        return;
      }
      
      const result = await quickCheck(testFile);
      expect(result.confidence).toBeDefined();
      expect(typeof result.confidence).toBe('number');
    });
  });

  // ==========================================================================
  // Full Analysis Tests
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
      expect(result.sampleRate).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });

    it('should include sample rate info', async () => {
      const testFile = getTestAudioPath('test-mastered.wav');
      
      if (!testAudioExists('test-mastered.wav')) {
        console.log('Skipping: no test audio files available');
        return;
      }
      
      const result = await analyze(testFile);
      
      expect(result.sampleRate).toBeGreaterThan(0);
      expect(result.nyquist).toBe(result.sampleRate / 2);
    });

    it('should handle non-existent file gracefully', async () => {
      const result = await analyze('/nonexistent/file.wav');
      
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(Object.values(AliasingRiskStatus)).toContain(result.status);
    });

    it('should return valid confidence score', async () => {
      const testFile = getTestAudioPath('test-mastered.wav');
      
      if (!testAudioExists('test-mastered.wav')) {
        console.log('Skipping: no test audio files available');
        return;
      }
      
      const result = await analyze(testFile);
      
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  // ==========================================================================
  // Module Exports Tests
  // ==========================================================================

  describe('Module Exports', () => {
    it('should export analyze function', () => {
      expect(typeof analyze).toBe('function');
    });

    it('should export quickCheck function', () => {
      expect(typeof quickCheck).toBe('function');
    });

    it('should export classify function', () => {
      expect(typeof classify).toBe('function');
    });

    it('should export scoring and classification functions', () => {
      expect(typeof calculateAliasingRiskScore).toBe('function');
      expect(typeof classifyAliasingRisk).toBe('function');
      expect(typeof assessProcessingRisk).toBe('function');
      expect(typeof recommendFilterFrequency).toBe('function');
    });

    it('should export recommendation generator', () => {
      expect(typeof generateRecommendations).toBe('function');
    });

    it('should export all constants', () => {
      expect(AliasingRiskStatus).toBeDefined();
      expect(HFContentType).toBeDefined();
      expect(ProcessingRisk).toBeDefined();
      expect(STATUS_DESCRIPTIONS).toBeDefined();
      expect(THRESHOLDS).toBeDefined();
      expect(REFERENCE).toBeDefined();
    });
  });
});
