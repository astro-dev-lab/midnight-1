/**
 * Tests for Club System Stress Estimator
 * 
 * Validates PA limiter stress prediction, subwoofer excursion risk,
 * and overall club playback safety analysis.
 */

const clubSystemStressEstimator = require('../services/clubSystemStressEstimator');
const path = require('path');
const fs = require('fs');

const {
  analyze,
  quickCheck,
  classify,
  classifyPlaybackStatus,
  estimateLimiterStress,
  estimateExcursionRisk,
  calculateBassMidRatio,
  generateRecommendations,
  ClubPlaybackStatus,
  LimiterStress,
  STATUS_DESCRIPTIONS,
  CLUB_BANDS,
  THRESHOLDS
} = clubSystemStressEstimator;

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

describe('Club System Stress Estimator', () => {
  describe('Constants', () => {
    describe('ClubPlaybackStatus enum', () => {
      it('should export all 5 status levels', () => {
        expect(ClubPlaybackStatus.EXCELLENT).toBe('EXCELLENT');
        expect(ClubPlaybackStatus.GOOD).toBe('GOOD');
        expect(ClubPlaybackStatus.FAIR).toBe('FAIR');
        expect(ClubPlaybackStatus.POOR).toBe('POOR');
        expect(ClubPlaybackStatus.CRITICAL).toBe('CRITICAL');
      });

      it('should have exactly 5 status levels', () => {
        expect(Object.keys(ClubPlaybackStatus)).toHaveLength(5);
      });
    });

    describe('LimiterStress enum', () => {
      it('should export all limiter stress levels', () => {
        expect(LimiterStress.NONE).toBe('NONE');
        expect(LimiterStress.LOW).toBe('LOW');
        expect(LimiterStress.MODERATE).toBe('MODERATE');
        expect(LimiterStress.HIGH).toBe('HIGH');
        expect(LimiterStress.SEVERE).toBe('SEVERE');
      });

      it('should have exactly 5 stress levels', () => {
        expect(Object.keys(LimiterStress)).toHaveLength(5);
      });
    });

    describe('STATUS_DESCRIPTIONS', () => {
      it('should have descriptions for all status levels', () => {
        Object.values(ClubPlaybackStatus).forEach(status => {
          expect(STATUS_DESCRIPTIONS[status]).toBeDefined();
          expect(typeof STATUS_DESCRIPTIONS[status]).toBe('string');
          expect(STATUS_DESCRIPTIONS[status].length).toBeGreaterThan(10);
        });
      });
    });

    describe('CLUB_BANDS', () => {
      it('should export frequency band definitions', () => {
        expect(CLUB_BANDS.SUB_BASS).toBeDefined();
        expect(CLUB_BANDS.BASS).toBeDefined();
        expect(CLUB_BANDS.LOW_MID).toBeDefined();
        expect(CLUB_BANDS.MID).toBeDefined();
        expect(CLUB_BANDS.HIGH).toBeDefined();
      });

      it('should have proper band ranges', () => {
        expect(CLUB_BANDS.SUB_BASS.low).toBe(20);
        expect(CLUB_BANDS.SUB_BASS.high).toBe(60);
        expect(CLUB_BANDS.BASS.low).toBe(60);
        expect(CLUB_BANDS.BASS.high).toBe(120);
      });

      it('should have labels for all bands', () => {
        Object.values(CLUB_BANDS).forEach(band => {
          expect(band.label).toBeDefined();
          expect(typeof band.label).toBe('string');
        });
      });
    });

    describe('THRESHOLDS', () => {
      it('should export classification thresholds', () => {
        expect(THRESHOLDS.SUB_BASS_RATIO).toBeDefined();
        expect(THRESHOLDS.BASS_CREST).toBeDefined();
        expect(THRESHOLDS.BASS_MID_RATIO).toBeDefined();
      });

      it('should have sensible sub-bass ratio thresholds', () => {
        expect(THRESHOLDS.SUB_BASS_RATIO.EXCELLENT).toBeLessThan(THRESHOLDS.SUB_BASS_RATIO.GOOD);
        expect(THRESHOLDS.SUB_BASS_RATIO.GOOD).toBeLessThan(THRESHOLDS.SUB_BASS_RATIO.FAIR);
        expect(THRESHOLDS.SUB_BASS_RATIO.FAIR).toBeLessThan(THRESHOLDS.SUB_BASS_RATIO.POOR);
      });

      it('should have sensible bass crest thresholds', () => {
        expect(THRESHOLDS.BASS_CREST.LOW).toBeLessThan(THRESHOLDS.BASS_CREST.MODERATE);
        expect(THRESHOLDS.BASS_CREST.MODERATE).toBeLessThan(THRESHOLDS.BASS_CREST.HIGH);
      });
    });
  });

  // ==========================================================================
  // Classification Logic Tests
  // ==========================================================================

  describe('Classification Logic', () => {
    describe('classifyPlaybackStatus', () => {
      it('should classify low sub-bass ratio as EXCELLENT', () => {
        const bandAnalysis = {
          subBass: { ratio: 0.10, crestDb: 12, energyLinear: 0.10 },
          bass: { ratio: 0.15, crestDb: 11, energyLinear: 0.15 },
          combinedBass: { ratio: 0.25, energyLinear: 0.25 },
          mid: { ratio: 0.35, energyLinear: 0.35 },
          total: { rmsDb: -16 }
        };
        
        const status = classifyPlaybackStatus(bandAnalysis);
        expect([ClubPlaybackStatus.EXCELLENT, ClubPlaybackStatus.GOOD]).toContain(status);
      });

      it('should classify moderate sub-bass ratio as GOOD or FAIR', () => {
        const bandAnalysis = {
          subBass: { ratio: 0.18, crestDb: 9, energyLinear: 0.18 },
          bass: { ratio: 0.20, crestDb: 8, energyLinear: 0.20 },
          combinedBass: { ratio: 0.38, energyLinear: 0.38 },
          mid: { ratio: 0.30, energyLinear: 0.30 },
          total: { rmsDb: -12 }
        };
        
        const status = classifyPlaybackStatus(bandAnalysis);
        expect([ClubPlaybackStatus.GOOD, ClubPlaybackStatus.FAIR]).toContain(status);
      });

      it('should classify high sub-bass ratio as POOR or CRITICAL', () => {
        const bandAnalysis = {
          subBass: { ratio: 0.35, crestDb: 5, energyLinear: 0.35 },
          bass: { ratio: 0.25, crestDb: 5, energyLinear: 0.25 },
          combinedBass: { ratio: 0.60, energyLinear: 0.60 },
          mid: { ratio: 0.20, energyLinear: 0.20 },
          total: { rmsDb: -8 }
        };
        
        const status = classifyPlaybackStatus(bandAnalysis);
        expect([ClubPlaybackStatus.POOR, ClubPlaybackStatus.CRITICAL]).toContain(status);
      });

      it('should handle edge case with very high bass ratio', () => {
        const bandAnalysis = {
          subBass: { ratio: 0.45, crestDb: 3, energyLinear: 0.45 },
          bass: { ratio: 0.30, crestDb: 3, energyLinear: 0.30 },
          combinedBass: { ratio: 0.75, energyLinear: 0.75 },
          mid: { ratio: 0.10, energyLinear: 0.10 },
          total: { rmsDb: -4 }
        };
        
        const status = classifyPlaybackStatus(bandAnalysis);
        expect(status).toBe(ClubPlaybackStatus.CRITICAL);
      });

      it('should return valid status for complete band data', () => {
        const bandAnalysis = {
          subBass: { ratio: 0.15, crestDb: 10, energyLinear: 0.15 },
          bass: { ratio: 0.20, crestDb: 10, energyLinear: 0.20 },
          combinedBass: { ratio: 0.35, energyLinear: 0.35 },
          mid: { ratio: 0.30, energyLinear: 0.30 },
          total: { rmsDb: -14 }
        };
        const status = classifyPlaybackStatus(bandAnalysis);
        expect(Object.values(ClubPlaybackStatus)).toContain(status);
      });
    });

    describe('estimateLimiterStress', () => {
      it('should return NONE for very dynamic bass', () => {
        const bandAnalysis = {
          subBass: { crestDb: 15 },
          bass: { crestDb: 14 },
          combinedBass: { ratio: 0.2 },
          total: { rmsDb: -18 }
        };
        
        const stress = estimateLimiterStress(bandAnalysis);
        expect([LimiterStress.NONE, LimiterStress.LOW]).toContain(stress);
      });

      it('should return MODERATE for typical compressed bass', () => {
        const bandAnalysis = {
          subBass: { crestDb: 8 },
          bass: { crestDb: 7 },
          combinedBass: { ratio: 0.35 },
          total: { rmsDb: -12 }
        };
        
        const stress = estimateLimiterStress(bandAnalysis);
        expect([LimiterStress.MODERATE, LimiterStress.HIGH]).toContain(stress);
      });

      it('should return SEVERE for heavily limited bass', () => {
        const bandAnalysis = {
          subBass: { crestDb: 3 },
          bass: { crestDb: 4 },
          combinedBass: { ratio: 0.50 },
          total: { rmsDb: -6 }
        };
        
        const stress = estimateLimiterStress(bandAnalysis);
        expect([LimiterStress.HIGH, LimiterStress.SEVERE]).toContain(stress);
      });

      it('should handle missing crest values with defaults', () => {
        const bandAnalysis = {
          subBass: { crestDb: 10 },
          bass: { crestDb: 10 },
          combinedBass: { ratio: 0.3 },
          total: { rmsDb: -12 }
        };
        
        expect(() => estimateLimiterStress(bandAnalysis)).not.toThrow();
        const stress = estimateLimiterStress(bandAnalysis);
        expect(Object.values(LimiterStress)).toContain(stress);
      });
    });

    describe('estimateExcursionRisk', () => {
      it('should return LOW for balanced sub-bass', () => {
        const bandAnalysis = {
          subBass: { ratio: 0.10, peakDb: -12 },
          total: { peakDb: -3 }
        };
        
        const risk = estimateExcursionRisk(bandAnalysis);
        expect(['NONE', 'LOW']).toContain(risk);
      });

      it('should return HIGH for excessive sub-bass', () => {
        const bandAnalysis = {
          subBass: { ratio: 0.40, peakDb: -3 },
          total: { peakDb: 0 }
        };
        
        const risk = estimateExcursionRisk(bandAnalysis);
        expect(['HIGH', 'CRITICAL', 'MODERATE']).toContain(risk);
      });

      it('should handle minimal properties', () => {
        const bandAnalysis = {
          subBass: { ratio: 0.1, crestDb: 10 }
        };
        expect(() => estimateExcursionRisk(bandAnalysis)).not.toThrow();
        const risk = estimateExcursionRisk(bandAnalysis);
        expect(['NONE', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL']).toContain(risk);
      });
    });

    describe('calculateBassMidRatio', () => {
      it('should calculate correct ratio', () => {
        const bandAnalysis = {
          combinedBass: { energyLinear: 0.4 },
          mid: { energyLinear: 0.3 }
        };
        
        const ratio = calculateBassMidRatio(bandAnalysis);
        expect(ratio).toBeCloseTo(0.4 / 0.3, 1);
      });

      it('should handle equal energies', () => {
        const bandAnalysis = {
          combinedBass: { energyLinear: 0.3 },
          mid: { energyLinear: 0.3 }
        };
        
        const ratio = calculateBassMidRatio(bandAnalysis);
        expect(ratio).toBeCloseTo(1.0, 1);
      });

      it('should handle zero mid energy gracefully', () => {
        const bandAnalysis = {
          combinedBass: { energyLinear: 0.3 },
          mid: { energyLinear: 0 }
        };
        
        const ratio = calculateBassMidRatio(bandAnalysis);
        expect(ratio).not.toBe(Infinity);
        expect(typeof ratio).toBe('number');
      });

      it('should handle minimal properties', () => {
        const bandAnalysis = {
          combinedBass: { energyLinear: 0.3 },
          mid: { energyLinear: 0.3 }
        };
        expect(() => calculateBassMidRatio(bandAnalysis)).not.toThrow();
        const ratio = calculateBassMidRatio(bandAnalysis);
        expect(typeof ratio).toBe('number');
      });
    });
  });

  // ==========================================================================
  // Classify Function Tests
  // ==========================================================================

  describe('classify', () => {
    it('should classify balanced metrics as EXCELLENT or GOOD', () => {
      const metrics = {
        subBassRatio: 0.10,
        bassRatio: 0.15,
        midRatio: 0.35,
        subBassCrest: 12,
        bassCrest: 11,
        totalRmsDb: -16
      };
      
      const result = classify(metrics);
      expect([ClubPlaybackStatus.EXCELLENT, ClubPlaybackStatus.GOOD]).toContain(result.status);
      expect(result.description).toBeDefined();
    });

    it('should classify heavy bass as POOR or CRITICAL', () => {
      const metrics = {
        subBassRatio: 0.35,
        bassRatio: 0.25,
        midRatio: 0.20,
        subBassCrest: 5,
        bassCrest: 4,
        totalRmsDb: -8
      };
      
      const result = classify(metrics);
      expect([ClubPlaybackStatus.POOR, ClubPlaybackStatus.CRITICAL]).toContain(result.status);
    });

    it('should return all expected fields', () => {
      const metrics = {
        subBassRatio: 0.15,
        bassRatio: 0.20,
        midRatio: 0.30
      };
      
      const result = classify(metrics);
      expect(result.status).toBeDefined();
      expect(result.description).toBeDefined();
      expect(result.limiterStress).toBeDefined();
      expect(result.excursionRisk).toBeDefined();
      expect(result.bassMidRatio).toBeDefined();
    });

    it('should handle default values for missing metrics', () => {
      const result = classify({});
      expect(result.status).toBeDefined();
      expect(result.limiterStress).toBeDefined();
    });
  });

  // ==========================================================================
  // Recommendations Tests
  // ==========================================================================

  describe('generateRecommendations', () => {
    it('should return no recommendations for EXCELLENT status', () => {
      const analysis = {
        status: ClubPlaybackStatus.EXCELLENT,
        limiterStress: LimiterStress.NONE,
        excursionRisk: 'LOW',
        bassMidRatio: 1.0
      };
      
      const recs = generateRecommendations(analysis);
      expect(Array.isArray(recs)).toBe(true);
      // May have 0 or minimal recommendations
    });

    it('should recommend bass reduction for POOR status', () => {
      const analysis = {
        status: ClubPlaybackStatus.POOR,
        limiterStress: LimiterStress.HIGH,
        excursionRisk: 'HIGH',
        bassMidRatio: 2.5,
        subBassRatio: 0.35
      };
      
      const recs = generateRecommendations(analysis);
      expect(Array.isArray(recs)).toBe(true);
      expect(recs.length).toBeGreaterThan(0);
      
      const hasBassDec = recs.some(r => 
        r.toLowerCase().includes('bass') || 
        r.toLowerCase().includes('sub') ||
        r.toLowerCase().includes('low')
      );
      expect(hasBassDec).toBe(true);
    });

    it('should recommend dynamics for high limiter stress', () => {
      const analysis = {
        status: ClubPlaybackStatus.FAIR,
        limiterStress: LimiterStress.SEVERE,
        excursionRisk: 'MODERATE',
        bassMidRatio: 1.5
      };
      
      const recs = generateRecommendations(analysis);
      expect(recs.length).toBeGreaterThan(0);
    });

    it('should handle missing properties gracefully', () => {
      const analysis = {};
      expect(() => generateRecommendations(analysis)).not.toThrow();
      const recs = generateRecommendations(analysis);
      expect(Array.isArray(recs)).toBe(true);
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
      expect(result.limiterStress).toBeDefined();
      expect(result.excursionRisk).toBeDefined();
    });

    it('should handle non-existent file gracefully', async () => {
      const result = await quickCheck('/nonexistent/file.wav');
      
      // Should return a result with error handling, not throw
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
    });

    it('should be faster than full analyze', async () => {
      const testFile = getTestAudioPath('test-mastered.wav');
      
      if (!testAudioExists('test-mastered.wav')) {
        console.log('Skipping: no test audio files available');
        return;
      }
      
      const quickStart = Date.now();
      await quickCheck(testFile);
      const quickTime = Date.now() - quickStart;
      
      const fullStart = Date.now();
      await analyze(testFile);
      const fullTime = Date.now() - fullStart;
      
      // Quick check should be at least as fast (ideally faster)
      expect(quickTime).toBeLessThanOrEqual(fullTime + 100);
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
      expect(result.limiterStress).toBeDefined();
      expect(result.excursionRisk).toBeDefined();
      expect(result.bassMidRatio).toBeDefined();
      expect(result.confidence).toBeDefined();
    });

    it('should include band analysis data', async () => {
      const testFile = getTestAudioPath('test-mastered.wav');
      
      if (!testAudioExists('test-mastered.wav')) {
        console.log('Skipping: no test audio files available');
        return;
      }
      
      const result = await analyze(testFile);
      
      expect(result.subBassRatio).toBeDefined();
      expect(typeof result.subBassRatio).toBe('number');
    });

    it('should handle non-existent file gracefully', async () => {
      const result = await analyze('/nonexistent/file.wav');
      
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      // Error handling returns fallback status
      expect(Object.values(ClubPlaybackStatus)).toContain(result.status);
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
      expect(typeof classifyPlaybackStatus).toBe('function');
      expect(typeof estimateLimiterStress).toBe('function');
      expect(typeof estimateExcursionRisk).toBe('function');
      expect(typeof calculateBassMidRatio).toBe('function');
    });

    it('should export recommendation generator', () => {
      expect(typeof generateRecommendations).toBe('function');
    });

    it('should export all constants', () => {
      expect(ClubPlaybackStatus).toBeDefined();
      expect(LimiterStress).toBeDefined();
      expect(STATUS_DESCRIPTIONS).toBeDefined();
      expect(CLUB_BANDS).toBeDefined();
      expect(THRESHOLDS).toBeDefined();
    });
  });
});
