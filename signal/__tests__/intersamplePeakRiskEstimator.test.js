/**
 * Tests for Intersample Peak Risk Estimator
 * 
 * Validates true peak detection, overshoot calculation, and codec risk prediction.
 */

const path = require('path');
const fs = require('fs');

const intersamplePeakRiskEstimator = require('../services/intersamplePeakRiskEstimator');

const {
  analyze,
  quickCheck,
  classify,
  calculateOvershoot,
  calculateHeadroom,
  calculateCodecRisk,
  calculateSafeGain,
  classifyStatus,
  calculateRiskScore,
  generateRecommendations,
  IntersamplePeakStatus,
  STATUS_DESCRIPTIONS,
  THRESHOLDS,
  REFERENCE
} = intersamplePeakRiskEstimator;

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

describe('Intersample Peak Risk Estimator', () => {
  describe('Constants', () => {
    describe('IntersamplePeakStatus enum', () => {
      it('should export all status levels', () => {
        expect(IntersamplePeakStatus.SAFE).toBe('SAFE');
        expect(IntersamplePeakStatus.MARGINAL).toBe('MARGINAL');
        expect(IntersamplePeakStatus.EXCEEDS).toBe('EXCEEDS');
        expect(IntersamplePeakStatus.CRITICAL).toBe('CRITICAL');
      });

      it('should have exactly 4 status levels', () => {
        expect(Object.keys(IntersamplePeakStatus)).toHaveLength(4);
      });
    });

    describe('STATUS_DESCRIPTIONS', () => {
      it('should have descriptions for all status levels', () => {
        Object.values(IntersamplePeakStatus).forEach(status => {
          expect(STATUS_DESCRIPTIONS[status]).toBeDefined();
          expect(typeof STATUS_DESCRIPTIONS[status]).toBe('string');
          expect(STATUS_DESCRIPTIONS[status].length).toBeGreaterThan(10);
        });
      });
    });

    describe('THRESHOLDS', () => {
      it('should export overshoot thresholds in ascending order', () => {
        expect(THRESHOLDS.OVERSHOOT.SAFE).toBeLessThan(THRESHOLDS.OVERSHOOT.MARGINAL);
        expect(THRESHOLDS.OVERSHOOT.MARGINAL).toBeLessThan(THRESHOLDS.OVERSHOOT.EXCEEDS);
      });

      it('should export ceiling standards', () => {
        expect(THRESHOLDS.CEILING.STREAMING).toBe(-1.0);
        expect(THRESHOLDS.CEILING.BROADCAST).toBe(-2.0);
        expect(THRESHOLDS.CEILING.CD).toBeDefined();
      });

      it('should export codec risk values', () => {
        expect(THRESHOLDS.CODEC_RISK.MP3_128).toBeGreaterThan(0);
        expect(THRESHOLDS.CODEC_RISK.MP3_320).toBeLessThan(THRESHOLDS.CODEC_RISK.MP3_128);
        expect(THRESHOLDS.CODEC_RISK.AAC_128).toBeDefined();
        expect(THRESHOLDS.CODEC_RISK.OPUS_128).toBeDefined();
      });
    });

    describe('REFERENCE values', () => {
      it('should have digital ceiling at 0 dBFS', () => {
        expect(REFERENCE.DIGITAL_CEILING).toBe(0.0);
      });

      it('should have 4x oversampling factor for true peak', () => {
        expect(REFERENCE.OVERSAMPLING_FACTOR).toBe(4);
      });
    });
  });

  // ==========================================================================
  // Calculation Functions Tests
  // ==========================================================================

  describe('Calculation Functions', () => {
    describe('calculateOvershoot', () => {
      it('should return 0 for equal peaks', () => {
        expect(calculateOvershoot(-3.0, -3.0)).toBe(0);
      });

      it('should return positive value when true peak exceeds sample peak', () => {
        expect(calculateOvershoot(-0.5, -1.0)).toBe(0.5);
        expect(calculateOvershoot(-1.0, -2.5)).toBe(1.5);
      });

      it('should return 0 when sample peak exceeds true peak', () => {
        // This shouldn't happen in practice, but should handle gracefully
        expect(calculateOvershoot(-2.0, -1.0)).toBe(0);
      });

      it('should handle infinite values', () => {
        expect(calculateOvershoot(-Infinity, -3.0)).toBe(0);
        expect(calculateOvershoot(-3.0, -Infinity)).toBe(0);
      });
    });

    describe('calculateHeadroom', () => {
      it('should calculate headroom to streaming ceiling', () => {
        // Streaming ceiling is -1.0 dBTP
        expect(calculateHeadroom(-3.0, 'STREAMING')).toBe(2.0);
        expect(calculateHeadroom(-1.0, 'STREAMING')).toBe(0);
        expect(calculateHeadroom(0, 'STREAMING')).toBe(-1.0);
      });

      it('should calculate headroom to broadcast ceiling', () => {
        // Broadcast ceiling is -2.0 dBTP
        expect(calculateHeadroom(-4.0, 'BROADCAST')).toBe(2.0);
        expect(calculateHeadroom(-2.0, 'BROADCAST')).toBe(0);
      });

      it('should use SAFE ceiling as default', () => {
        const result = calculateHeadroom(-3.0);
        expect(result).toBe(THRESHOLDS.CEILING.SAFE - (-3.0));
      });
    });

    describe('calculateSafeGain', () => {
      it('should return available headroom as safe gain', () => {
        expect(calculateSafeGain(-5.0, 'STREAMING')).toBe(4.0);
        expect(calculateSafeGain(-3.0, 'STREAMING')).toBe(2.0);
      });

      it('should return 0 when already at or above ceiling', () => {
        expect(calculateSafeGain(-1.0, 'STREAMING')).toBe(0);
        expect(calculateSafeGain(0, 'STREAMING')).toBe(0);
        expect(calculateSafeGain(1.0, 'STREAMING')).toBe(0);
      });
    });

    describe('calculateCodecRisk', () => {
      it('should project additional peak for each codec', () => {
        const risks = calculateCodecRisk(-2.0, 0.5);
        
        expect(risks.MP3_128).toBeDefined();
        expect(risks.MP3_128.projectedPeakDb).toBeGreaterThan(-2.0);
        expect(risks.MP3_128.projectedPeakDb).toBe(-2.0 + THRESHOLDS.CODEC_RISK.MP3_128);
      });

      it('should flag codecs that will clip', () => {
        // True peak at -0.3, will clip with low bitrate codecs (adding 0.8dB pushes to 0.5)
        const risks = calculateCodecRisk(-0.3, 0.3);
        
        expect(risks.MP3_128.willClip).toBe(true);
        // MP3_320 adds 0.2dB, so -0.3 + 0.2 = -0.1, still below 0 but above -1.0 streaming
        expect(risks.MP3_320.projectedPeakDb).toBeGreaterThan(THRESHOLDS.CEILING.STREAMING);
      });

      it('should assign risk levels', () => {
        const risks = calculateCodecRisk(-1.5, 0.5);
        
        Object.values(risks).forEach(risk => {
          expect(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']).toContain(risk.riskLevel);
        });
      });
    });

    describe('calculateRiskScore', () => {
      it('should return 0-100 range', () => {
        expect(calculateRiskScore(0, -10, 0)).toBeGreaterThanOrEqual(0);
        expect(calculateRiskScore(0, -10, 0)).toBeLessThanOrEqual(100);
        expect(calculateRiskScore(3, 1, 0.8)).toBeLessThanOrEqual(100);
      });

      it('should return low score for safe content', () => {
        const score = calculateRiskScore(0.1, -5.0, 0);
        expect(score).toBeLessThan(20);
      });

      it('should return high score for problematic content', () => {
        const score = calculateRiskScore(2.0, 0.5, 0.5);
        expect(score).toBeGreaterThan(70);
      });

      it('should increase with overshoot', () => {
        const score1 = calculateRiskScore(0.2, -3.0, 0);
        const score2 = calculateRiskScore(1.0, -3.0, 0);
        const score3 = calculateRiskScore(2.0, -3.0, 0);
        
        expect(score2).toBeGreaterThan(score1);
        expect(score3).toBeGreaterThan(score2);
      });

      it('should increase with flat factor', () => {
        const score1 = calculateRiskScore(0.5, -2.0, 0);
        const score2 = calculateRiskScore(0.5, -2.0, 0.3);
        
        expect(score2).toBeGreaterThan(score1);
      });
    });
  });

  // ==========================================================================
  // Classification Tests
  // ==========================================================================

  describe('Classification', () => {
    describe('classifyStatus', () => {
      it('should classify as SAFE with low overshoot and good headroom', () => {
        expect(classifyStatus(0.1, -4.0)).toBe(IntersamplePeakStatus.SAFE);
        expect(classifyStatus(0.2, -3.0)).toBe(IntersamplePeakStatus.SAFE);
      });

      it('should classify as MARGINAL with moderate overshoot', () => {
        expect(classifyStatus(0.5, -2.0)).toBe(IntersamplePeakStatus.MARGINAL);
        expect(classifyStatus(0.6, -1.5)).toBe(IntersamplePeakStatus.MARGINAL);
      });

      it('should classify as EXCEEDS with high overshoot', () => {
        expect(classifyStatus(1.6, -3.0)).toBe(IntersamplePeakStatus.EXCEEDS);
        expect(classifyStatus(2.0, -2.5)).toBe(IntersamplePeakStatus.EXCEEDS);
      });

      it('should classify as CRITICAL when exceeding digital ceiling', () => {
        expect(classifyStatus(1.0, 0.5)).toBe(IntersamplePeakStatus.CRITICAL);
        expect(classifyStatus(0.5, 0.1)).toBe(IntersamplePeakStatus.CRITICAL);
      });

      it('should classify as CRITICAL with high overshoot above streaming ceiling', () => {
        expect(classifyStatus(2.0, -0.5)).toBe(IntersamplePeakStatus.CRITICAL);
      });
    });

    describe('classify function', () => {
      it('should classify from metrics object', () => {
        const result = classify({
          samplePeakDb: -2.0,
          truePeakDb: -1.5,
          flatFactor: 0.1
        });
        
        expect(result.status).toBeDefined();
        expect(result.description).toBeDefined();
        expect(result.riskScore).toBeDefined();
        expect(result.overshootDb).toBe(0.5);
      });

      it('should handle missing metrics', () => {
        const result = classify({});
        expect(result.status).toBeDefined();
        expect(Object.values(IntersamplePeakStatus)).toContain(result.status);
      });

      it('should handle null input', () => {
        const result = classify(null);
        expect(result.status).toBeDefined();
      });

      it('should include safe gain calculation', () => {
        const result = classify({
          samplePeakDb: -5.0,
          truePeakDb: -4.0
        });
        
        expect(result.safeGainDb).toBeDefined();
        expect(result.safeGainDb).toBeGreaterThan(0);
      });
    });
  });

  // ==========================================================================
  // Recommendations Tests
  // ==========================================================================

  describe('generateRecommendations', () => {
    it('should generate recommendations for CRITICAL status', () => {
      const recs = generateRecommendations({
        status: IntersamplePeakStatus.CRITICAL,
        truePeakDb: 0.5,
        overshootDb: 1.5
      });
      
      expect(recs.length).toBeGreaterThan(0);
      expect(recs.some(r => r.toLowerCase().includes('limit'))).toBe(true);
    });

    it('should recommend gain reduction when above ceiling', () => {
      const recs = generateRecommendations({
        status: IntersamplePeakStatus.CRITICAL,
        truePeakDb: 1.5,
        overshootDb: 1.0
      });
      
      expect(recs.some(r => r.toLowerCase().includes('reduce') || r.toLowerCase().includes('gain'))).toBe(true);
    });

    it('should warn about high-risk codecs', () => {
      const recs = generateRecommendations({
        status: IntersamplePeakStatus.EXCEEDS,
        truePeakDb: -0.5,
        overshootDb: 1.0,
        codecRisks: {
          MP3_128: { riskLevel: 'HIGH' },
          MP3_320: { riskLevel: 'LOW' }
        }
      });
      
      expect(recs.some(r => r.includes('MP3_128'))).toBe(true);
    });

    it('should return positive message for SAFE status', () => {
      const recs = generateRecommendations({
        status: IntersamplePeakStatus.SAFE,
        truePeakDb: -3.0,
        overshootDb: 0.1
      });
      
      expect(recs.length).toBeGreaterThan(0);
      expect(recs.some(r => r.toLowerCase().includes('safe') || r.toLowerCase().includes('within'))).toBe(true);
    });

    it('should handle null/undefined input', () => {
      expect(generateRecommendations(null)).toEqual([]);
      expect(generateRecommendations(undefined)).toEqual([]);
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
      expect(result.riskScore).toBeDefined();
      expect(result.samplePeakDb).toBeDefined();
      expect(result.truePeakDb).toBeDefined();
      expect(result.overshootDb).toBeDefined();
      expect(result.headroomDb).toBeDefined();
    });

    it('should handle non-existent file gracefully', async () => {
      const result = await quickCheck('/nonexistent/file.wav');
      
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(Object.values(IntersamplePeakStatus)).toContain(result.status);
      expect(result.confidence).toBeLessThanOrEqual(0.5);
    });

    it('should include confidence score', async () => {
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
      expect(result.riskScore).toBeDefined();
      expect(result.samplePeakDb).toBeDefined();
      expect(result.truePeakDb).toBeDefined();
      expect(result.overshootDb).toBeDefined();
      expect(result.headroomDb).toBeDefined();
      expect(result.safeGainDb).toBeDefined();
      expect(result.codecRisks).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });

    it('should include codec risk assessment', async () => {
      const testFile = getTestAudioPath('test-mastered.wav');
      
      if (!testAudioExists('test-mastered.wav')) {
        console.log('Skipping: no test audio files available');
        return;
      }
      
      const result = await analyze(testFile);
      
      expect(result.codecRisks).toBeDefined();
      expect(result.codecRisks.MP3_128).toBeDefined();
      expect(result.codecRisks.AAC_128).toBeDefined();
    });

    it('should support different ceiling standards', async () => {
      const testFile = getTestAudioPath('test-mastered.wav');
      
      if (!testAudioExists('test-mastered.wav')) {
        console.log('Skipping: no test audio files available');
        return;
      }
      
      const streamingResult = await analyze(testFile, { standard: 'STREAMING' });
      const broadcastResult = await analyze(testFile, { standard: 'BROADCAST' });
      
      expect(streamingResult.ceilingStandard).toBe('STREAMING');
      expect(broadcastResult.ceilingStandard).toBe('BROADCAST');
      expect(streamingResult.ceilingDb).toBe(-1.0);
      expect(broadcastResult.ceilingDb).toBe(-2.0);
    });

    it('should handle non-existent file gracefully', async () => {
      const result = await analyze('/nonexistent/file.wav');
      
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
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
      expect(typeof calculateOvershoot).toBe('function');
      expect(typeof calculateHeadroom).toBe('function');
      expect(typeof calculateCodecRisk).toBe('function');
      expect(typeof calculateSafeGain).toBe('function');
      expect(typeof classifyStatus).toBe('function');
      expect(typeof calculateRiskScore).toBe('function');
    });

    it('should export recommendation generator', () => {
      expect(typeof generateRecommendations).toBe('function');
    });

    it('should export all constants', () => {
      expect(IntersamplePeakStatus).toBeDefined();
      expect(STATUS_DESCRIPTIONS).toBeDefined();
      expect(THRESHOLDS).toBeDefined();
      expect(REFERENCE).toBeDefined();
    });
  });
});
