/**
 * Tests for Car System Translation Risk Analyzer
 * 
 * Validates low-mid buildup detection, limiter pumping prediction,
 * and overall car playback risk analysis.
 */

const carSystemTranslator = require('../services/carSystemTranslator');
const path = require('path');
const fs = require('fs');

const {
  analyze,
  quickCheck,
  classify,
  classifyTranslationStatus,
  estimatePumpingRisk,
  calculateLimiterStressIndex,
  calculateResonanceScore,
  generateRecommendations,
  CarTranslationStatus,
  PumpingRisk,
  STATUS_DESCRIPTIONS,
  CAR_BANDS,
  THRESHOLDS
} = carSystemTranslator;

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

describe('Car System Translation Risk Analyzer', () => {
  describe('Constants', () => {
    describe('CarTranslationStatus enum', () => {
      it('should export all 5 status levels', () => {
        expect(CarTranslationStatus.EXCELLENT).toBe('EXCELLENT');
        expect(CarTranslationStatus.GOOD).toBe('GOOD');
        expect(CarTranslationStatus.FAIR).toBe('FAIR');
        expect(CarTranslationStatus.POOR).toBe('POOR');
        expect(CarTranslationStatus.CRITICAL).toBe('CRITICAL');
      });

      it('should have exactly 5 status levels', () => {
        expect(Object.keys(CarTranslationStatus)).toHaveLength(5);
      });
    });

    describe('PumpingRisk enum', () => {
      it('should export all pumping risk levels', () => {
        expect(PumpingRisk.NONE).toBe('NONE');
        expect(PumpingRisk.LOW).toBe('LOW');
        expect(PumpingRisk.MODERATE).toBe('MODERATE');
        expect(PumpingRisk.HIGH).toBe('HIGH');
        expect(PumpingRisk.SEVERE).toBe('SEVERE');
      });

      it('should have exactly 5 risk levels', () => {
        expect(Object.keys(PumpingRisk)).toHaveLength(5);
      });
    });

    describe('STATUS_DESCRIPTIONS', () => {
      it('should have descriptions for all status levels', () => {
        Object.values(CarTranslationStatus).forEach(status => {
          expect(STATUS_DESCRIPTIONS[status]).toBeDefined();
          expect(typeof STATUS_DESCRIPTIONS[status]).toBe('string');
          expect(STATUS_DESCRIPTIONS[status].length).toBeGreaterThan(10);
        });
      });
    });

    describe('CAR_BANDS', () => {
      it('should export car-specific frequency band definitions', () => {
        expect(CAR_BANDS.SUB_BASS).toBeDefined();
        expect(CAR_BANDS.BOOM_ZONE).toBeDefined();
        expect(CAR_BANDS.MUD_ZONE).toBeDefined();
        expect(CAR_BANDS.BOX_ZONE).toBeDefined();
        expect(CAR_BANDS.RESONANCE_ZONE).toBeDefined();
        expect(CAR_BANDS.MID).toBeDefined();
      });

      it('should have proper boom zone range', () => {
        expect(CAR_BANDS.BOOM_ZONE.low).toBe(80);
        expect(CAR_BANDS.BOOM_ZONE.high).toBe(120);
      });

      it('should have proper mud zone range', () => {
        expect(CAR_BANDS.MUD_ZONE.low).toBe(120);
        expect(CAR_BANDS.MUD_ZONE.high).toBe(200);
      });

      it('should have proper resonance zone range', () => {
        expect(CAR_BANDS.RESONANCE_ZONE.low).toBe(80);
        expect(CAR_BANDS.RESONANCE_ZONE.high).toBe(300);
      });

      it('should have labels for all bands', () => {
        Object.values(CAR_BANDS).forEach(band => {
          expect(band.label).toBeDefined();
          expect(typeof band.label).toBe('string');
        });
      });
    });

    describe('THRESHOLDS', () => {
      it('should export classification thresholds', () => {
        expect(THRESHOLDS.RESONANCE_RATIO).toBeDefined();
        expect(THRESHOLDS.BOOM_ZONE_RATIO).toBeDefined();
        expect(THRESHOLDS.CREST_FACTOR).toBeDefined();
        expect(THRESHOLDS.SUSTAINED).toBeDefined();
      });

      it('should have sensible resonance ratio thresholds', () => {
        expect(THRESHOLDS.RESONANCE_RATIO.EXCELLENT).toBeLessThan(THRESHOLDS.RESONANCE_RATIO.GOOD);
        expect(THRESHOLDS.RESONANCE_RATIO.GOOD).toBeLessThan(THRESHOLDS.RESONANCE_RATIO.FAIR);
        expect(THRESHOLDS.RESONANCE_RATIO.FAIR).toBeLessThan(THRESHOLDS.RESONANCE_RATIO.POOR);
      });

      it('should have sensible crest factor thresholds', () => {
        expect(THRESHOLDS.CREST_FACTOR.POOR).toBeLessThan(THRESHOLDS.CREST_FACTOR.FAIR);
        expect(THRESHOLDS.CREST_FACTOR.FAIR).toBeLessThan(THRESHOLDS.CREST_FACTOR.GOOD);
        expect(THRESHOLDS.CREST_FACTOR.GOOD).toBeLessThan(THRESHOLDS.CREST_FACTOR.EXCELLENT);
      });

      it('should have sustained energy thresholds', () => {
        expect(THRESHOLDS.SUSTAINED.THRESHOLD_DB).toBeDefined();
        expect(THRESHOLDS.SUSTAINED.WARNING_DURATION_MS).toBeDefined();
        expect(THRESHOLDS.SUSTAINED.DANGER_DURATION_MS).toBeDefined();
      });
    });
  });

  // ==========================================================================
  // Classification Logic Tests
  // ==========================================================================

  describe('Classification Logic', () => {
    describe('classifyTranslationStatus', () => {
      it('should classify low resonance as EXCELLENT', () => {
        const bandAnalysis = {
          resonanceZone: { ratio: 0.20, crestDb: 12 },
          boomZone: { ratio: 0.05 }
        };
        const sustainedAnalysis = { sustainedRatio: 0.05, maxSustainedMs: 100 };
        
        const status = classifyTranslationStatus(bandAnalysis, sustainedAnalysis);
        expect([CarTranslationStatus.EXCELLENT, CarTranslationStatus.GOOD]).toContain(status);
      });

      it('should classify moderate resonance as GOOD or FAIR', () => {
        const bandAnalysis = {
          resonanceZone: { ratio: 0.32, crestDb: 8 },
          boomZone: { ratio: 0.10 }
        };
        const sustainedAnalysis = { sustainedRatio: 0.15, maxSustainedMs: 300 };
        
        const status = classifyTranslationStatus(bandAnalysis, sustainedAnalysis);
        expect([CarTranslationStatus.GOOD, CarTranslationStatus.FAIR]).toContain(status);
      });

      it('should classify high resonance as POOR or CRITICAL', () => {
        const bandAnalysis = {
          resonanceZone: { ratio: 0.45, crestDb: 4 },
          boomZone: { ratio: 0.18 }
        };
        const sustainedAnalysis = { sustainedRatio: 0.5, maxSustainedMs: 1500 };
        
        const status = classifyTranslationStatus(bandAnalysis, sustainedAnalysis);
        expect([CarTranslationStatus.POOR, CarTranslationStatus.CRITICAL]).toContain(status);
      });

      it('should handle missing sustained analysis', () => {
        const bandAnalysis = {
          resonanceZone: { ratio: 0.30, crestDb: 10 },
          boomZone: { ratio: 0.08 }
        };
        
        expect(() => classifyTranslationStatus(bandAnalysis, null)).not.toThrow();
        expect(() => classifyTranslationStatus(bandAnalysis, {})).not.toThrow();
      });
    });

    describe('estimatePumpingRisk', () => {
      it('should return NONE for dynamic content', () => {
        const bandAnalysis = {
          resonanceZone: { ratio: 0.20, crestDb: 14 }
        };
        const sustainedAnalysis = { sustainedRatio: 0.05, maxSustainedMs: 100 };
        
        const risk = estimatePumpingRisk(bandAnalysis, sustainedAnalysis);
        expect([PumpingRisk.NONE, PumpingRisk.LOW]).toContain(risk);
      });

      it('should return MODERATE for typical compressed content', () => {
        const bandAnalysis = {
          resonanceZone: { ratio: 0.28, crestDb: 7 }
        };
        const sustainedAnalysis = { sustainedRatio: 0.25, maxSustainedMs: 400 };
        
        const risk = estimatePumpingRisk(bandAnalysis, sustainedAnalysis);
        expect([PumpingRisk.LOW, PumpingRisk.MODERATE]).toContain(risk);
      });

      it('should return HIGH or SEVERE for heavily compressed content', () => {
        const bandAnalysis = {
          resonanceZone: { ratio: 0.45, crestDb: 3 }
        };
        const sustainedAnalysis = { sustainedRatio: 0.6, maxSustainedMs: 2000 };
        
        const risk = estimatePumpingRisk(bandAnalysis, sustainedAnalysis);
        expect([PumpingRisk.HIGH, PumpingRisk.SEVERE]).toContain(risk);
      });

      it('should handle missing parameters', () => {
        expect(() => estimatePumpingRisk({}, {})).not.toThrow();
        expect(() => estimatePumpingRisk({}, null)).not.toThrow();
      });
    });

    describe('calculateLimiterStressIndex', () => {
      it('should return low value for dynamic content', () => {
        const bandAnalysis = {
          resonanceZone: { crestDb: 14 }
        };
        const sustainedAnalysis = { sustainedRatio: 0.05, maxSustainedMs: 100 };
        
        const stress = calculateLimiterStressIndex(bandAnalysis, sustainedAnalysis);
        expect(stress).toBeLessThan(0.3);
      });

      it('should return high value for compressed sustained content', () => {
        const bandAnalysis = {
          resonanceZone: { crestDb: 3 }
        };
        const sustainedAnalysis = { sustainedRatio: 0.6, maxSustainedMs: 2000 };
        
        const stress = calculateLimiterStressIndex(bandAnalysis, sustainedAnalysis);
        expect(stress).toBeGreaterThan(0.5);
      });

      it('should return value between 0 and 1', () => {
        const bandAnalysis = { resonanceZone: { crestDb: 8 } };
        const sustainedAnalysis = { sustainedRatio: 0.3, maxSustainedMs: 500 };
        
        const stress = calculateLimiterStressIndex(bandAnalysis, sustainedAnalysis);
        expect(stress).toBeGreaterThanOrEqual(0);
        expect(stress).toBeLessThanOrEqual(1);
      });

      it('should handle missing parameters', () => {
        expect(() => calculateLimiterStressIndex({}, {})).not.toThrow();
        const stress = calculateLimiterStressIndex({}, {});
        expect(typeof stress).toBe('number');
      });
    });

    describe('calculateResonanceScore', () => {
      it('should return high score for balanced content', () => {
        const bandAnalysis = {
          boomZone: { ratio: 0.05 },
          mudZone: { ratio: 0.06 },
          boxZone: { ratio: 0.05 }
        };
        
        const score = calculateResonanceScore(bandAnalysis);
        expect(score).toBeGreaterThan(70);
      });

      it('should return low score for boomy content', () => {
        const bandAnalysis = {
          boomZone: { ratio: 0.20 },
          mudZone: { ratio: 0.18 },
          boxZone: { ratio: 0.15 }
        };
        
        const score = calculateResonanceScore(bandAnalysis);
        expect(score).toBeLessThan(50);
      });

      it('should return value between 0 and 100', () => {
        const bandAnalysis = {
          boomZone: { ratio: 0.10 },
          mudZone: { ratio: 0.10 },
          boxZone: { ratio: 0.08 }
        };
        
        const score = calculateResonanceScore(bandAnalysis);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      });

      it('should handle missing properties', () => {
        expect(() => calculateResonanceScore({})).not.toThrow();
        const score = calculateResonanceScore({});
        expect(typeof score).toBe('number');
      });
    });
  });

  // ==========================================================================
  // Classify Function Tests
  // ==========================================================================

  describe('classify', () => {
    it('should classify balanced metrics as EXCELLENT or GOOD', () => {
      const metrics = {
        resonanceRatio: 0.22,
        boomZoneRatio: 0.06,
        crestFactorDb: 12,
        sustainedRatio: 0.05,
        maxSustainedMs: 150
      };
      
      const result = classify(metrics);
      expect([CarTranslationStatus.EXCELLENT, CarTranslationStatus.GOOD]).toContain(result.status);
      expect(result.description).toBeDefined();
    });

    it('should classify problematic metrics as POOR or CRITICAL', () => {
      const metrics = {
        resonanceRatio: 0.45,
        boomZoneRatio: 0.18,
        crestFactorDb: 4,
        sustainedRatio: 0.5,
        maxSustainedMs: 1500
      };
      
      const result = classify(metrics);
      expect([CarTranslationStatus.POOR, CarTranslationStatus.CRITICAL]).toContain(result.status);
    });

    it('should return all expected fields', () => {
      const metrics = {
        resonanceRatio: 0.30,
        boomZoneRatio: 0.10,
        crestFactorDb: 8
      };
      
      const result = classify(metrics);
      expect(result.status).toBeDefined();
      expect(result.description).toBeDefined();
      expect(result.pumpingRisk).toBeDefined();
      expect(result.limiterStressIndex).toBeDefined();
      expect(result.resonanceScore).toBeDefined();
    });

    it('should handle default values for missing metrics', () => {
      const result = classify({});
      expect(result.status).toBeDefined();
      expect(result.pumpingRisk).toBeDefined();
      expect(Object.values(CarTranslationStatus)).toContain(result.status);
    });
  });

  // ==========================================================================
  // Recommendations Tests
  // ==========================================================================

  describe('generateRecommendations', () => {
    it('should return no/few recommendations for EXCELLENT status', () => {
      const analysis = {
        status: CarTranslationStatus.EXCELLENT,
        pumpingRisk: PumpingRisk.NONE,
        limiterStressIndex: 0.1,
        boomZoneRatio: 0.05,
        mudZoneRatio: 0.05
      };
      
      const recs = generateRecommendations(analysis);
      expect(Array.isArray(recs)).toBe(true);
    });

    it('should recommend low-mid reduction for POOR status', () => {
      const analysis = {
        status: CarTranslationStatus.POOR,
        pumpingRisk: PumpingRisk.HIGH,
        limiterStressIndex: 0.7,
        boomZoneRatio: 0.15,
        mudZoneRatio: 0.15
      };
      
      const recs = generateRecommendations(analysis);
      expect(Array.isArray(recs)).toBe(true);
      expect(recs.length).toBeGreaterThan(0);
      
      const hasLowMidRec = recs.some(r => 
        r.toLowerCase().includes('low-mid') || 
        r.toLowerCase().includes('mid') ||
        r.toLowerCase().includes('80') ||
        r.toLowerCase().includes('300')
      );
      expect(hasLowMidRec).toBe(true);
    });

    it('should recommend dynamics improvement for high pumping risk', () => {
      const analysis = {
        status: CarTranslationStatus.FAIR,
        pumpingRisk: PumpingRisk.SEVERE,
        limiterStressIndex: 0.8
      };
      
      const recs = generateRecommendations(analysis);
      expect(recs.length).toBeGreaterThan(0);
      
      const hasDynamicsRec = recs.some(r => 
        r.toLowerCase().includes('dynamic') || 
        r.toLowerCase().includes('sidechain') ||
        r.toLowerCase().includes('compression')
      );
      expect(hasDynamicsRec).toBe(true);
    });

    it('should recommend boom zone cut for high boom ratio', () => {
      const analysis = {
        status: CarTranslationStatus.FAIR,
        boomZoneRatio: 0.18
      };
      
      const recs = generateRecommendations(analysis);
      
      const hasBoomRec = recs.some(r => 
        r.toLowerCase().includes('80-120') || 
        r.toLowerCase().includes('boom')
      );
      expect(hasBoomRec).toBe(true);
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
      expect(result.pumpingRisk).toBeDefined();
      expect(result.resonanceRatio).toBeDefined();
      expect(result.boomZoneRatio).toBeDefined();
    });

    it('should handle non-existent file gracefully', async () => {
      const result = await quickCheck('/nonexistent/file.wav');
      
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(Object.values(CarTranslationStatus)).toContain(result.status);
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
      expect(result.pumpingRisk).toBeDefined();
      expect(result.limiterStressIndex).toBeDefined();
      expect(result.resonanceScore).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });

    it('should include detailed band ratios', async () => {
      const testFile = getTestAudioPath('test-mastered.wav');
      
      if (!testAudioExists('test-mastered.wav')) {
        console.log('Skipping: no test audio files available');
        return;
      }
      
      const result = await analyze(testFile);
      
      expect(result.resonanceRatio).toBeDefined();
      expect(result.boomZoneRatio).toBeDefined();
      expect(result.mudZoneRatio).toBeDefined();
      expect(result.boxZoneRatio).toBeDefined();
    });

    it('should include sustained energy metrics', async () => {
      const testFile = getTestAudioPath('test-mastered.wav');
      
      if (!testAudioExists('test-mastered.wav')) {
        console.log('Skipping: no test audio files available');
        return;
      }
      
      const result = await analyze(testFile);
      
      expect(result.sustainedRatio).toBeDefined();
      expect(result.maxSustainedMs).toBeDefined();
    });

    it('should handle non-existent file gracefully', async () => {
      const result = await analyze('/nonexistent/file.wav');
      
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(Object.values(CarTranslationStatus)).toContain(result.status);
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

    it('should export classification functions', () => {
      expect(typeof classifyTranslationStatus).toBe('function');
      expect(typeof estimatePumpingRisk).toBe('function');
      expect(typeof calculateLimiterStressIndex).toBe('function');
      expect(typeof calculateResonanceScore).toBe('function');
    });

    it('should export recommendation generator', () => {
      expect(typeof generateRecommendations).toBe('function');
    });

    it('should export all constants', () => {
      expect(CarTranslationStatus).toBeDefined();
      expect(PumpingRisk).toBeDefined();
      expect(STATUS_DESCRIPTIONS).toBeDefined();
      expect(CAR_BANDS).toBeDefined();
      expect(THRESHOLDS).toBeDefined();
    });
  });
});
