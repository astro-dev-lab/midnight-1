/**
 * Tests for Streaming Codec Stress Predictor
 * 
 * Validates pre-echo detection, high-frequency analysis, stereo complexity,
 * and overall codec artifact prediction.
 */

const codecStressPredictor = require('../services/codecStressPredictor');
const path = require('path');
const fs = require('fs');

const {
  analyze,
  quickCheck,
  classify,
  calculateCodecStressScore,
  classifyCodecStress,
  predictArtifactTypes,
  suggestMinimumBitrate,
  generateRecommendations,
  CodecStressStatus,
  PreEchoRisk,
  STATUS_DESCRIPTIONS,
  CODEC_BANDS,
  THRESHOLDS
} = codecStressPredictor;

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

describe('Streaming Codec Stress Predictor', () => {
  describe('Constants', () => {
    describe('CodecStressStatus enum', () => {
      it('should export all 4 status levels', () => {
        expect(CodecStressStatus.LOW).toBe('LOW');
        expect(CodecStressStatus.MODERATE).toBe('MODERATE');
        expect(CodecStressStatus.HIGH).toBe('HIGH');
        expect(CodecStressStatus.CRITICAL).toBe('CRITICAL');
      });

      it('should have exactly 4 status levels', () => {
        expect(Object.keys(CodecStressStatus)).toHaveLength(4);
      });
    });

    describe('PreEchoRisk enum', () => {
      it('should export all pre-echo risk levels', () => {
        expect(PreEchoRisk.NONE).toBe('NONE');
        expect(PreEchoRisk.LOW).toBe('LOW');
        expect(PreEchoRisk.MODERATE).toBe('MODERATE');
        expect(PreEchoRisk.HIGH).toBe('HIGH');
        expect(PreEchoRisk.SEVERE).toBe('SEVERE');
      });

      it('should have exactly 5 risk levels', () => {
        expect(Object.keys(PreEchoRisk)).toHaveLength(5);
      });
    });

    describe('STATUS_DESCRIPTIONS', () => {
      it('should have descriptions for all status levels', () => {
        Object.values(CodecStressStatus).forEach(status => {
          expect(STATUS_DESCRIPTIONS[status]).toBeDefined();
          expect(typeof STATUS_DESCRIPTIONS[status]).toBe('string');
          expect(STATUS_DESCRIPTIONS[status].length).toBeGreaterThan(10);
        });
      });
    });

    describe('CODEC_BANDS', () => {
      it('should export codec-relevant frequency band definitions', () => {
        expect(CODEC_BANDS.LOW).toBeDefined();
        expect(CODEC_BANDS.MID).toBeDefined();
        expect(CODEC_BANDS.PRESENCE).toBeDefined();
        expect(CODEC_BANDS.SIBILANCE).toBeDefined();
        expect(CODEC_BANDS.AIR).toBeDefined();
        expect(CODEC_BANDS.ULTRA_HF).toBeDefined();
      });

      it('should have proper sibilance zone range', () => {
        expect(CODEC_BANDS.SIBILANCE.low).toBe(5000);
        expect(CODEC_BANDS.SIBILANCE.high).toBe(10000);
      });

      it('should have proper air band range', () => {
        expect(CODEC_BANDS.AIR.low).toBe(10000);
        expect(CODEC_BANDS.AIR.high).toBe(16000);
      });

      it('should have labels for all bands', () => {
        Object.values(CODEC_BANDS).forEach(band => {
          expect(band.label).toBeDefined();
          expect(typeof band.label).toBe('string');
        });
      });
    });

    describe('THRESHOLDS', () => {
      it('should export classification thresholds', () => {
        expect(THRESHOLDS.HF_ENERGY).toBeDefined();
        expect(THRESHOLDS.SIBILANCE).toBeDefined();
        expect(THRESHOLDS.PRE_ECHO).toBeDefined();
        expect(THRESHOLDS.STEREO_COMPLEXITY).toBeDefined();
        expect(THRESHOLDS.SPECTRAL_FLUX).toBeDefined();
      });

      it('should have sensible HF energy thresholds', () => {
        expect(THRESHOLDS.HF_ENERGY.LOW).toBeLessThan(THRESHOLDS.HF_ENERGY.MODERATE);
        expect(THRESHOLDS.HF_ENERGY.MODERATE).toBeLessThan(THRESHOLDS.HF_ENERGY.HIGH);
      });

      it('should have pre-echo detection thresholds', () => {
        expect(THRESHOLDS.PRE_ECHO.QUIET_THRESHOLD_DB).toBeDefined();
        expect(THRESHOLDS.PRE_ECHO.TRANSIENT_JUMP_DB).toBeDefined();
        expect(THRESHOLDS.PRE_ECHO.EVENTS_PER_MIN_LOW).toBeDefined();
        expect(THRESHOLDS.PRE_ECHO.EVENTS_PER_MIN_MODERATE).toBeDefined();
        expect(THRESHOLDS.PRE_ECHO.EVENTS_PER_MIN_HIGH).toBeDefined();
      });

      it('should have sensible stereo complexity thresholds', () => {
        expect(THRESHOLDS.STEREO_COMPLEXITY.LOW).toBeLessThan(THRESHOLDS.STEREO_COMPLEXITY.MODERATE);
        expect(THRESHOLDS.STEREO_COMPLEXITY.MODERATE).toBeLessThan(THRESHOLDS.STEREO_COMPLEXITY.HIGH);
      });
    });
  });

  // ==========================================================================
  // Classification Logic Tests
  // ==========================================================================

  describe('Classification Logic', () => {
    describe('calculateCodecStressScore', () => {
      it('should return low score for clean content', () => {
        const hfAnalysis = { hfEnergyRatio: 0.05, sibilanceRatio: 0.02 };
        const preEchoAnalysis = { preEchoRisk: PreEchoRisk.NONE };
        const stereoAnalysis = { jointStereoStress: 'LOW' };
        const fluxAnalysis = { spectralFluxNormalized: 0.1 };
        
        const score = calculateCodecStressScore(hfAnalysis, preEchoAnalysis, stereoAnalysis, fluxAnalysis);
        expect(score).toBeLessThan(25);
      });

      it('should return moderate score for typical content', () => {
        const hfAnalysis = { hfEnergyRatio: 0.15, sibilanceRatio: 0.08 };
        const preEchoAnalysis = { preEchoRisk: PreEchoRisk.MODERATE };
        const stereoAnalysis = { jointStereoStress: 'MODERATE' };
        const fluxAnalysis = { spectralFluxNormalized: 0.3 };
        
        const score = calculateCodecStressScore(hfAnalysis, preEchoAnalysis, stereoAnalysis, fluxAnalysis);
        expect(score).toBeGreaterThan(20);
        expect(score).toBeLessThan(60);
      });

      it('should return high score for problematic content', () => {
        const hfAnalysis = { hfEnergyRatio: 0.35, sibilanceRatio: 0.18 };
        const preEchoAnalysis = { preEchoRisk: PreEchoRisk.SEVERE };
        const stereoAnalysis = { jointStereoStress: 'SEVERE' };
        const fluxAnalysis = { spectralFluxNormalized: 0.7 };
        
        const score = calculateCodecStressScore(hfAnalysis, preEchoAnalysis, stereoAnalysis, fluxAnalysis);
        expect(score).toBeGreaterThan(60);
      });

      it('should return value between 0 and 100', () => {
        const score = calculateCodecStressScore({}, {}, {}, {});
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      });

      it('should handle missing parameters', () => {
        expect(() => calculateCodecStressScore(null, null, null, null)).not.toThrow();
        expect(() => calculateCodecStressScore({}, {}, {}, {})).not.toThrow();
      });
    });

    describe('classifyCodecStress', () => {
      it('should classify low score as LOW', () => {
        expect(classifyCodecStress(10)).toBe(CodecStressStatus.LOW);
        expect(classifyCodecStress(19)).toBe(CodecStressStatus.LOW);
      });

      it('should classify moderate score as MODERATE', () => {
        expect(classifyCodecStress(25)).toBe(CodecStressStatus.MODERATE);
        expect(classifyCodecStress(40)).toBe(CodecStressStatus.MODERATE);
      });

      it('should classify high score as HIGH', () => {
        expect(classifyCodecStress(50)).toBe(CodecStressStatus.HIGH);
        expect(classifyCodecStress(65)).toBe(CodecStressStatus.HIGH);
      });

      it('should classify very high score as CRITICAL', () => {
        expect(classifyCodecStress(75)).toBe(CodecStressStatus.CRITICAL);
        expect(classifyCodecStress(95)).toBe(CodecStressStatus.CRITICAL);
      });
    });

    describe('predictArtifactTypes', () => {
      it('should predict pre-echo artifacts for high risk', () => {
        const preEchoAnalysis = { preEchoRisk: PreEchoRisk.SEVERE };
        
        const artifacts = predictArtifactTypes({}, preEchoAnalysis, {});
        
        const hasPreEcho = artifacts.some(a => a.type === 'PRE_ECHO');
        expect(hasPreEcho).toBe(true);
      });

      it('should predict HF swirl for high HF content', () => {
        const hfAnalysis = { hfEnergyRatio: 0.35 };
        
        const artifacts = predictArtifactTypes(hfAnalysis, {}, {});
        
        const hasHfSwirl = artifacts.some(a => a.type === 'HF_SWIRL');
        expect(hasHfSwirl).toBe(true);
      });

      it('should predict sibilance artifacts for high sibilance', () => {
        const hfAnalysis = { sibilanceRatio: 0.15 };
        
        const artifacts = predictArtifactTypes(hfAnalysis, {}, {});
        
        const hasSibilance = artifacts.some(a => a.type === 'SIBILANCE');
        expect(hasSibilance).toBe(true);
      });

      it('should predict stereo collapse for complex stereo', () => {
        const stereoAnalysis = { jointStereoStress: 'SEVERE' };
        
        const artifacts = predictArtifactTypes({}, {}, stereoAnalysis);
        
        const hasStereoCollapse = artifacts.some(a => a.type === 'STEREO_COLLAPSE');
        expect(hasStereoCollapse).toBe(true);
      });

      it('should return empty array for clean content', () => {
        const artifacts = predictArtifactTypes(
          { hfEnergyRatio: 0.05, sibilanceRatio: 0.02 },
          { preEchoRisk: PreEchoRisk.NONE },
          { jointStereoStress: 'LOW' }
        );
        
        expect(Array.isArray(artifacts)).toBe(true);
        expect(artifacts.length).toBe(0);
      });

      it('should handle missing parameters', () => {
        expect(() => predictArtifactTypes(null, null, null)).not.toThrow();
        expect(() => predictArtifactTypes({}, {}, {})).not.toThrow();
      });
    });

    describe('suggestMinimumBitrate', () => {
      it('should suggest low bitrates for clean content', () => {
        const suggestion = suggestMinimumBitrate(10);
        
        expect(suggestion.mp3).toBeLessThanOrEqual(128);
        expect(suggestion.aac).toBeLessThanOrEqual(96);
        expect(suggestion.opus).toBeLessThanOrEqual(64);
      });

      it('should suggest moderate bitrates for typical content', () => {
        const suggestion = suggestMinimumBitrate(35);
        
        expect(suggestion.mp3).toBeGreaterThanOrEqual(192);
        expect(suggestion.aac).toBeGreaterThanOrEqual(128);
      });

      it('should suggest high bitrates for problematic content', () => {
        const suggestion = suggestMinimumBitrate(80);
        
        expect(suggestion.mp3).toBe(320);
        expect(suggestion.aac).toBeGreaterThanOrEqual(256);
        expect(suggestion.note).toBeDefined();
      });

      it('should return object with codec bitrates', () => {
        const suggestion = suggestMinimumBitrate(50);
        
        expect(suggestion.mp3).toBeDefined();
        expect(suggestion.aac).toBeDefined();
        expect(suggestion.opus).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // Classify Function Tests
  // ==========================================================================

  describe('classify', () => {
    it('should classify low-stress metrics as LOW', () => {
      const metrics = {
        preEchoEventsPerMin: 2,
        hfEnergyRatio: 0.05,
        sibilanceRatio: 0.02,
        stereoComplexity: 0.1,
        spectralFluxNormalized: 0.1
      };
      
      const result = classify(metrics);
      expect(result.status).toBe(CodecStressStatus.LOW);
      expect(result.description).toBeDefined();
    });

    it('should classify high-stress metrics as HIGH or CRITICAL', () => {
      const metrics = {
        preEchoEventsPerMin: 40,
        hfEnergyRatio: 0.35,
        sibilanceRatio: 0.18,
        stereoComplexity: 0.6,
        spectralFluxNormalized: 0.5
      };
      
      const result = classify(metrics);
      expect([CodecStressStatus.HIGH, CodecStressStatus.CRITICAL]).toContain(result.status);
    });

    it('should return all expected fields', () => {
      const result = classify({});
      
      expect(result.status).toBeDefined();
      expect(result.description).toBeDefined();
      expect(result.stressScore).toBeDefined();
      expect(result.preEchoRisk).toBeDefined();
      expect(result.suggestedBitrates).toBeDefined();
    });

    it('should handle default values for missing metrics', () => {
      const result = classify({});
      
      expect(Object.values(CodecStressStatus)).toContain(result.status);
      expect(result.stressScore).toBeGreaterThanOrEqual(0);
    });

    it('should derive pre-echo risk from events per minute', () => {
      const resultLow = classify({ preEchoEventsPerMin: 2 });
      expect([PreEchoRisk.NONE, PreEchoRisk.LOW]).toContain(resultLow.preEchoRisk);
      
      const resultHigh = classify({ preEchoEventsPerMin: 35 });
      expect([PreEchoRisk.HIGH, PreEchoRisk.SEVERE]).toContain(resultHigh.preEchoRisk);
    });
  });

  // ==========================================================================
  // Recommendations Tests
  // ==========================================================================

  describe('generateRecommendations', () => {
    it('should return no/few recommendations for LOW status', () => {
      const analysis = {
        status: CodecStressStatus.LOW,
        preEchoRisk: PreEchoRisk.NONE,
        hfEnergyRatio: 0.05,
        sibilanceRatio: 0.02,
        stereoComplexity: 0.1
      };
      
      const recs = generateRecommendations(analysis);
      expect(Array.isArray(recs)).toBe(true);
    });

    it('should recommend high bitrate for CRITICAL status', () => {
      const analysis = {
        status: CodecStressStatus.CRITICAL,
        preEchoRisk: PreEchoRisk.HIGH
      };
      
      const recs = generateRecommendations(analysis);
      expect(recs.length).toBeGreaterThan(0);
      
      const hasBitrateRec = recs.some(r => 
        r.toLowerCase().includes('320') || 
        r.toLowerCase().includes('lossless') ||
        r.toLowerCase().includes('bitrate')
      );
      expect(hasBitrateRec).toBe(true);
    });

    it('should recommend fade-ins for high pre-echo risk', () => {
      const analysis = {
        status: CodecStressStatus.HIGH,
        preEchoRisk: PreEchoRisk.SEVERE
      };
      
      const recs = generateRecommendations(analysis);
      
      const hasFadeRec = recs.some(r => 
        r.toLowerCase().includes('fade') || 
        r.toLowerCase().includes('transient')
      );
      expect(hasFadeRec).toBe(true);
    });

    it('should recommend de-essing for high sibilance', () => {
      const analysis = {
        status: CodecStressStatus.MODERATE,
        sibilanceRatio: 0.15
      };
      
      const recs = generateRecommendations(analysis);
      
      const hasDeessRec = recs.some(r => 
        r.toLowerCase().includes('de-ess') || 
        r.toLowerCase().includes('sibilance')
      );
      expect(hasDeessRec).toBe(true);
    });

    it('should recommend stereo width reduction for complex stereo', () => {
      const analysis = {
        status: CodecStressStatus.MODERATE,
        stereoComplexity: 0.5
      };
      
      const recs = generateRecommendations(analysis);
      
      const hasStereoRec = recs.some(r => 
        r.toLowerCase().includes('stereo') || 
        r.toLowerCase().includes('width') ||
        r.toLowerCase().includes('mono')
      );
      expect(hasStereoRec).toBe(true);
    });

    it('should handle missing properties gracefully', () => {
      expect(() => generateRecommendations({})).not.toThrow();
      expect(() => generateRecommendations(null)).not.toThrow();
      expect(() => generateRecommendations(undefined)).not.toThrow();
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
      expect(result.stressScore).toBeDefined();
      expect(result.preEchoRisk).toBeDefined();
      expect(result.hfEnergyRatio).toBeDefined();
    });

    it('should handle non-existent file gracefully', async () => {
      const result = await quickCheck('/nonexistent/file.wav');
      
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(Object.values(CodecStressStatus)).toContain(result.status);
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
      expect(result.stressScore).toBeDefined();
      expect(result.preEchoRisk).toBeDefined();
      expect(result.hfEnergyRatio).toBeDefined();
      expect(result.stereoComplexity).toBeDefined();
      expect(result.predictedArtifacts).toBeDefined();
      expect(result.suggestedBitrates).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });

    it('should include pre-echo metrics', async () => {
      const testFile = getTestAudioPath('test-mastered.wav');
      
      if (!testAudioExists('test-mastered.wav')) {
        console.log('Skipping: no test audio files available');
        return;
      }
      
      const result = await analyze(testFile);
      
      expect(result.preEchoEvents).toBeDefined();
      expect(result.preEchoEventsPerMin).toBeDefined();
    });

    it('should include HF metrics', async () => {
      const testFile = getTestAudioPath('test-mastered.wav');
      
      if (!testAudioExists('test-mastered.wav')) {
        console.log('Skipping: no test audio files available');
        return;
      }
      
      const result = await analyze(testFile);
      
      expect(result.sibilanceRatio).toBeDefined();
      expect(result.airRatio).toBeDefined();
    });

    it('should include stereo metrics', async () => {
      const testFile = getTestAudioPath('test-mastered.wav');
      
      if (!testAudioExists('test-mastered.wav')) {
        console.log('Skipping: no test audio files available');
        return;
      }
      
      const result = await analyze(testFile);
      
      expect(result.avgCorrelation).toBeDefined();
      expect(result.jointStereoStress).toBeDefined();
    });

    it('should handle non-existent file gracefully', async () => {
      const result = await analyze('/nonexistent/file.wav');
      
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(Object.values(CodecStressStatus)).toContain(result.status);
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

    it('should export score and classification functions', () => {
      expect(typeof calculateCodecStressScore).toBe('function');
      expect(typeof classifyCodecStress).toBe('function');
      expect(typeof predictArtifactTypes).toBe('function');
      expect(typeof suggestMinimumBitrate).toBe('function');
    });

    it('should export recommendation generator', () => {
      expect(typeof generateRecommendations).toBe('function');
    });

    it('should export all constants', () => {
      expect(CodecStressStatus).toBeDefined();
      expect(PreEchoRisk).toBeDefined();
      expect(STATUS_DESCRIPTIONS).toBeDefined();
      expect(CODEC_BANDS).toBeDefined();
      expect(THRESHOLDS).toBeDefined();
    });
  });
});
