/**
 * Gain Reduction Distribution Mapper Tests
 * 
 * Tests for the gain reduction mapper service which analyzes
 * where and how often compression occurs throughout an audio file.
 */

const path = require('path');

const {
  analyzeGainReduction,
  quickCheck,
  classifyCompression,
  calculateCompressionScore,
  identifyPattern,
  calculateDistribution,
  calculateStatistics,
  generateRecommendation,
  CompressionIntensity,
  CREST_THRESHOLDS,
  DistributionPattern,
  WINDOW_SIZES,
  DEFAULT_WINDOW_SIZE
} = require('../services/gainReductionMapper');

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_FIXTURES_DIR = path.join(__dirname, '..', 'uploads');
const TEST_FILE = path.join(TEST_FIXTURES_DIR, 'test.mp3');
const NON_EXISTENT_FILE = '/nonexistent/path/file.wav';

// ============================================================================
// Constants Tests
// ============================================================================

describe('Gain Reduction Mapper Constants', () => {
  describe('CompressionIntensity', () => {
    it('should have all expected intensity levels', () => {
      expect(CompressionIntensity.EXTREME).toBe('EXTREME');
      expect(CompressionIntensity.HEAVY).toBe('HEAVY');
      expect(CompressionIntensity.MODERATE).toBe('MODERATE');
      expect(CompressionIntensity.LIGHT).toBe('LIGHT');
      expect(CompressionIntensity.MINIMAL).toBe('MINIMAL');
      expect(CompressionIntensity.NONE).toBe('NONE');
    });

    it('should have exactly 6 intensity levels', () => {
      expect(Object.keys(CompressionIntensity)).toHaveLength(6);
    });
  });

  describe('CREST_THRESHOLDS', () => {
    it('should have correct threshold values', () => {
      expect(CREST_THRESHOLDS.EXTREME).toBe(4);
      expect(CREST_THRESHOLDS.HEAVY).toBe(6);
      expect(CREST_THRESHOLDS.MODERATE).toBe(10);
      expect(CREST_THRESHOLDS.LIGHT).toBe(14);
      expect(CREST_THRESHOLDS.MINIMAL).toBe(18);
    });

    it('should have thresholds in ascending order', () => {
      expect(CREST_THRESHOLDS.EXTREME).toBeLessThan(CREST_THRESHOLDS.HEAVY);
      expect(CREST_THRESHOLDS.HEAVY).toBeLessThan(CREST_THRESHOLDS.MODERATE);
      expect(CREST_THRESHOLDS.MODERATE).toBeLessThan(CREST_THRESHOLDS.LIGHT);
      expect(CREST_THRESHOLDS.LIGHT).toBeLessThan(CREST_THRESHOLDS.MINIMAL);
    });
  });

  describe('DistributionPattern', () => {
    it('should have all expected patterns', () => {
      expect(DistributionPattern.UNIFORM).toBe('UNIFORM');
      expect(DistributionPattern.VERSE_CHORUS_VARIANCE).toBe('VERSE_CHORUS_VARIANCE');
      expect(DistributionPattern.ESCALATING).toBe('ESCALATING');
      expect(DistributionPattern.DE_ESCALATING).toBe('DE_ESCALATING');
      expect(DistributionPattern.DYNAMIC).toBe('DYNAMIC');
      expect(DistributionPattern.SPARSE).toBe('SPARSE');
    });

    it('should have exactly 6 patterns', () => {
      expect(Object.keys(DistributionPattern)).toHaveLength(6);
    });
  });

  describe('WINDOW_SIZES', () => {
    it('should have correct window sizes', () => {
      expect(WINDOW_SIZES.MICRO).toBe(0.1);
      expect(WINDOW_SIZES.BEAT).toBe(0.4);
      expect(WINDOW_SIZES.PHRASE).toBe(2.0);
      expect(WINDOW_SIZES.SECTION).toBe(8.0);
    });

    it('should have exactly 4 window sizes', () => {
      expect(Object.keys(WINDOW_SIZES)).toHaveLength(4);
    });

    it('should have window sizes in ascending order', () => {
      expect(WINDOW_SIZES.MICRO).toBeLessThan(WINDOW_SIZES.BEAT);
      expect(WINDOW_SIZES.BEAT).toBeLessThan(WINDOW_SIZES.PHRASE);
      expect(WINDOW_SIZES.PHRASE).toBeLessThan(WINDOW_SIZES.SECTION);
    });
  });

  describe('DEFAULT_WINDOW_SIZE', () => {
    it('should be BEAT window size', () => {
      expect(DEFAULT_WINDOW_SIZE).toBe(WINDOW_SIZES.BEAT);
    });

    it('should be 0.4 seconds', () => {
      expect(DEFAULT_WINDOW_SIZE).toBe(0.4);
    });
  });
});

// ============================================================================
// Classification Tests
// ============================================================================

describe('classifyCompression', () => {
  describe('EXTREME classification', () => {
    it('should classify crest < 4 dB as EXTREME', () => {
      expect(classifyCompression(2)).toBe('EXTREME');
      expect(classifyCompression(3.5)).toBe('EXTREME');
      expect(classifyCompression(3.9)).toBe('EXTREME');
    });

    it('should classify 0 dB as EXTREME', () => {
      expect(classifyCompression(0)).toBe('EXTREME');
    });

    it('should classify negative crest as EXTREME', () => {
      expect(classifyCompression(-2)).toBe('EXTREME');
    });
  });

  describe('HEAVY classification', () => {
    it('should classify 4-6 dB as HEAVY', () => {
      expect(classifyCompression(4)).toBe('HEAVY');
      expect(classifyCompression(5)).toBe('HEAVY');
      expect(classifyCompression(5.9)).toBe('HEAVY');
    });
  });

  describe('MODERATE classification', () => {
    it('should classify 6-10 dB as MODERATE', () => {
      expect(classifyCompression(6)).toBe('MODERATE');
      expect(classifyCompression(8)).toBe('MODERATE');
      expect(classifyCompression(9.9)).toBe('MODERATE');
    });
  });

  describe('LIGHT classification', () => {
    it('should classify 10-14 dB as LIGHT', () => {
      expect(classifyCompression(10)).toBe('LIGHT');
      expect(classifyCompression(12)).toBe('LIGHT');
      expect(classifyCompression(13.9)).toBe('LIGHT');
    });
  });

  describe('MINIMAL classification', () => {
    it('should classify 14-18 dB as MINIMAL', () => {
      expect(classifyCompression(14)).toBe('MINIMAL');
      expect(classifyCompression(16)).toBe('MINIMAL');
      expect(classifyCompression(17.9)).toBe('MINIMAL');
    });
  });

  describe('NONE classification', () => {
    it('should classify > 18 dB as NONE', () => {
      expect(classifyCompression(18)).toBe('NONE');
      expect(classifyCompression(20)).toBe('NONE');
      expect(classifyCompression(25)).toBe('NONE');
    });
  });

  describe('Edge cases', () => {
    it('should return UNKNOWN for null', () => {
      expect(classifyCompression(null)).toBe('UNKNOWN');
    });

    it('should return UNKNOWN for NaN', () => {
      expect(classifyCompression(NaN)).toBe('UNKNOWN');
    });

    it('should return UNKNOWN for undefined', () => {
      expect(classifyCompression(undefined)).toBe('UNKNOWN');
    });
  });
});

describe('calculateCompressionScore', () => {
  describe('Normal ranges', () => {
    it('should return 100 for crest = 0 dB', () => {
      expect(calculateCompressionScore(0)).toBe(100);
    });

    it('should return ~50 for crest = 10 dB', () => {
      expect(calculateCompressionScore(10)).toBe(50);
    });

    it('should return 0 for crest >= 20 dB', () => {
      expect(calculateCompressionScore(20)).toBe(0);
      expect(calculateCompressionScore(25)).toBe(0);
    });
  });

  describe('Score calculation', () => {
    it('should calculate score as (20 - crest) * 5', () => {
      expect(calculateCompressionScore(5)).toBe(75);
      expect(calculateCompressionScore(15)).toBe(25);
      expect(calculateCompressionScore(18)).toBe(10);
    });

    it('should clamp score to 0-100 range', () => {
      expect(calculateCompressionScore(-5)).toBe(100); // Would be 125, clamped to 100
      expect(calculateCompressionScore(30)).toBe(0);  // Would be -50, clamped to 0
    });
  });

  describe('Precision', () => {
    it('should return score with 1 decimal place', () => {
      const score = calculateCompressionScore(7.5);
      expect(score.toString()).toMatch(/^\d+(\.\d)?$/);
    });
  });

  describe('Edge cases', () => {
    it('should return 0 for null', () => {
      expect(calculateCompressionScore(null)).toBe(0);
    });

    it('should return 0 for NaN', () => {
      expect(calculateCompressionScore(NaN)).toBe(0);
    });
  });
});

// ============================================================================
// Pattern Detection Tests
// ============================================================================

describe('identifyPattern', () => {
  describe('UNKNOWN pattern', () => {
    it('should return UNKNOWN for empty array', () => {
      const result = identifyPattern([]);
      expect(result.pattern).toBe('UNKNOWN');
    });

    it('should return UNKNOWN for null', () => {
      const result = identifyPattern(null);
      expect(result.pattern).toBe('UNKNOWN');
    });

    it('should return UNKNOWN for fewer than 3 segments', () => {
      const segments = [
        { crestFactorDb: 10 },
        { crestFactorDb: 12 }
      ];
      const result = identifyPattern(segments);
      expect(result.pattern).toBe('UNKNOWN');
    });
  });

  describe('SPARSE pattern', () => {
    it('should detect sparse compression (high crest, low variance)', () => {
      const segments = Array(10).fill(null).map(() => ({
        crestFactorDb: 18 + Math.random() * 2 // 18-20 dB, minimal compression
      }));
      const result = identifyPattern(segments);
      expect(result.pattern).toBe('SPARSE');
    });
  });

  describe('UNIFORM pattern', () => {
    it('should detect uniform compression (consistent levels)', () => {
      const segments = Array(10).fill(null).map((_, i) => ({
        crestFactorDb: 8 + (i % 2) * 1 // 8-9 dB, small variance
      }));
      const result = identifyPattern(segments);
      expect(result.pattern).toBe('UNIFORM');
    });
  });

  describe('ESCALATING pattern', () => {
    it('should detect escalating compression', () => {
      const segments = Array(12).fill(null).map((_, i) => ({
        crestFactorDb: 16 - (i * 1.2) // Decreasing crest = increasing compression
      }));
      const result = identifyPattern(segments);
      expect(result.pattern).toBe('ESCALATING');
    });
  });

  describe('DE_ESCALATING pattern', () => {
    it('should detect de-escalating compression', () => {
      const segments = Array(12).fill(null).map((_, i) => ({
        crestFactorDb: 4 + (i * 1.2) // Increasing crest = decreasing compression
      }));
      const result = identifyPattern(segments);
      expect(result.pattern).toBe('DE_ESCALATING');
    });
  });

  describe('VERSE_CHORUS_VARIANCE pattern', () => {
    it('should detect alternating intensity', () => {
      const segments = [];
      for (let i = 0; i < 12; i++) {
        segments.push({
          crestFactorDb: i % 2 === 0 ? 6 : 14 // Alternating heavy/light
        });
      }
      const result = identifyPattern(segments);
      expect(['VERSE_CHORUS_VARIANCE', 'DYNAMIC']).toContain(result.pattern);
    });
  });

  describe('DYNAMIC pattern', () => {
    it('should detect highly variable compression', () => {
      const segments = [
        { crestFactorDb: 2 },
        { crestFactorDb: 18 },
        { crestFactorDb: 5 },
        { crestFactorDb: 20 },
        { crestFactorDb: 3 },
        { crestFactorDb: 16 }
      ];
      const result = identifyPattern(segments);
      expect(['DYNAMIC', 'VERSE_CHORUS_VARIANCE']).toContain(result.pattern);
    });
  });

  describe('Pattern description', () => {
    it('should include description with pattern', () => {
      const segments = Array(10).fill(null).map(() => ({
        crestFactorDb: 8
      }));
      const result = identifyPattern(segments);
      expect(result.description).toBeDefined();
      expect(typeof result.description).toBe('string');
      expect(result.description.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Distribution Calculation Tests
// ============================================================================

describe('calculateDistribution', () => {
  describe('Empty/null input', () => {
    it('should return zeros for empty array', () => {
      const dist = calculateDistribution([]);
      expect(dist.extreme).toBe(0);
      expect(dist.heavy).toBe(0);
      expect(dist.moderate).toBe(0);
      expect(dist.light).toBe(0);
      expect(dist.minimal).toBe(0);
      expect(dist.none).toBe(0);
    });

    it('should return zeros for null', () => {
      const dist = calculateDistribution(null);
      expect(dist.extreme).toBe(0);
    });
  });

  describe('Uniform distribution', () => {
    it('should calculate correct percentages for uniform segments', () => {
      const segments = [
        { crestFactorDb: 2 },  // EXTREME
        { crestFactorDb: 5 },  // HEAVY
        { crestFactorDb: 8 },  // MODERATE
        { crestFactorDb: 12 }, // LIGHT
        { crestFactorDb: 16 }, // MINIMAL
        { crestFactorDb: 20 }, // NONE
        { crestFactorDb: 2 },  // EXTREME
        { crestFactorDb: 5 },  // HEAVY
        { crestFactorDb: 8 },  // MODERATE
        { crestFactorDb: 12 }  // LIGHT
      ];
      const dist = calculateDistribution(segments);
      expect(dist.extreme).toBe(20);
      expect(dist.heavy).toBe(20);
      expect(dist.moderate).toBe(20);
      expect(dist.light).toBe(20);
      expect(dist.minimal).toBe(10);
      expect(dist.none).toBe(10);
    });
  });

  describe('Single category', () => {
    it('should return 100% for single category', () => {
      const segments = Array(5).fill(null).map(() => ({ crestFactorDb: 5 }));
      const dist = calculateDistribution(segments);
      expect(dist.heavy).toBe(100);
      expect(dist.extreme).toBe(0);
    });
  });

  describe('Precision', () => {
    it('should return values with 1 decimal place', () => {
      const segments = [
        { crestFactorDb: 2 },
        { crestFactorDb: 5 },
        { crestFactorDb: 8 }
      ];
      const dist = calculateDistribution(segments);
      Object.values(dist).forEach(val => {
        expect(val.toString()).toMatch(/^\d+(\.\d)?$/);
      });
    });
  });
});

// ============================================================================
// Statistics Calculation Tests
// ============================================================================

describe('calculateStatistics', () => {
  describe('Empty/null input', () => {
    it('should return null values for empty array', () => {
      const stats = calculateStatistics([]);
      expect(stats.meanCrestFactor).toBeNull();
      expect(stats.crestFactorStdDev).toBeNull();
      expect(stats.minCrestFactor).toBeNull();
      expect(stats.maxCrestFactor).toBeNull();
      expect(stats.meanCompressionScore).toBeNull();
      expect(stats.levelConsistency).toBeNull();
      expect(stats.heavyCompressionCount).toBe(0);
      expect(stats.heavyCompressionDensity).toBe(0);
    });

    it('should return null values for null input', () => {
      const stats = calculateStatistics(null);
      expect(stats.meanCrestFactor).toBeNull();
    });
  });

  describe('Mean calculation', () => {
    it('should calculate mean crest factor correctly', () => {
      const segments = [
        { crestFactorDb: 6, rmsDb: -18 },
        { crestFactorDb: 8, rmsDb: -16 },
        { crestFactorDb: 10, rmsDb: -14 }
      ];
      const stats = calculateStatistics(segments);
      expect(stats.meanCrestFactor).toBe(8);
    });
  });

  describe('Min/Max calculation', () => {
    it('should find min and max crest factors', () => {
      const segments = [
        { crestFactorDb: 5 },
        { crestFactorDb: 12 },
        { crestFactorDb: 8 }
      ];
      const stats = calculateStatistics(segments);
      expect(stats.minCrestFactor).toBe(5);
      expect(stats.maxCrestFactor).toBe(12);
    });
  });

  describe('Heavy compression metrics', () => {
    it('should count heavy/extreme segments', () => {
      const segments = [
        { crestFactorDb: 2 },  // EXTREME
        { crestFactorDb: 5 },  // HEAVY
        { crestFactorDb: 8 },  // MODERATE
        { crestFactorDb: 12 }  // LIGHT
      ];
      const stats = calculateStatistics(segments);
      expect(stats.heavyCompressionCount).toBe(2);
      expect(stats.heavyCompressionDensity).toBe(0.5);
    });
  });

  describe('Level consistency', () => {
    it('should calculate RMS range as consistency metric', () => {
      const segments = [
        { crestFactorDb: 8, rmsDb: -20 },
        { crestFactorDb: 8, rmsDb: -15 },
        { crestFactorDb: 8, rmsDb: -18 }
      ];
      const stats = calculateStatistics(segments);
      expect(stats.levelConsistency).toBe(5); // -15 - (-20) = 5
    });
  });
});

// ============================================================================
// Recommendation Generation Tests
// ============================================================================

describe('generateRecommendation', () => {
  describe('Insufficient data', () => {
    it('should indicate insufficient data when no statistics', () => {
      const analysis = { statistics: { meanCrestFactor: null } };
      const rec = generateRecommendation(analysis);
      expect(rec).toContain('Insufficient data');
    });
  });

  describe('Heavy compression warning', () => {
    it('should warn about heavy compression > 30%', () => {
      const analysis = {
        statistics: { meanCrestFactor: 5, heavyCompressionDensity: 0.3 },
        distribution: { extreme: 20, heavy: 15 },
        pattern: { pattern: 'UNIFORM' }
      };
      const rec = generateRecommendation(analysis);
      expect(rec).toContain('heavy/extreme compression');
    });
  });

  describe('Pattern-based recommendations', () => {
    it('should provide verse/chorus variance advice', () => {
      const analysis = {
        statistics: { meanCrestFactor: 10, heavyCompressionDensity: 0.1 },
        distribution: { extreme: 5, heavy: 5 },
        pattern: { pattern: 'VERSE_CHORUS_VARIANCE' }
      };
      const rec = generateRecommendation(analysis);
      expect(rec).toContain('varies between sections');
    });

    it('should warn about escalating compression', () => {
      const analysis = {
        statistics: { meanCrestFactor: 10, heavyCompressionDensity: 0.1 },
        distribution: { extreme: 5, heavy: 5 },
        pattern: { pattern: 'ESCALATING' }
      };
      const rec = generateRecommendation(analysis);
      expect(rec).toContain('increases toward the end');
    });
  });

  describe('Healthy dynamics', () => {
    it('should confirm healthy dynamics for dynamic content', () => {
      const analysis = {
        statistics: { meanCrestFactor: 15, heavyCompressionDensity: 0.01, crestFactorStdDev: 2 },
        distribution: { extreme: 0, heavy: 0 },
        pattern: { pattern: 'SPARSE' }
      };
      const rec = generateRecommendation(analysis);
      expect(rec).toContain('healthy dynamics');
    });
  });
});

// ============================================================================
// Quick Check Tests
// ============================================================================

describe('quickCheck', () => {
  describe('File handling', () => {
    it('should return UNKNOWN for non-existent file', async () => {
      const result = await quickCheck(NON_EXISTENT_FILE);
      expect(result.status).toBe('UNKNOWN');
    }, 15000);
  });

  describe('Valid file analysis', () => {
    it('should return valid status for real audio file', async () => {
      const result = await quickCheck(TEST_FILE);
      expect(['OVER_COMPRESSED', 'HEAVILY_COMPRESSED', 'MODERATELY_COMPRESSED', 'DYNAMIC', 'BALANCED', 'UNKNOWN']).toContain(result.status);
    }, 30000);

    it('should return pattern classification', async () => {
      const result = await quickCheck(TEST_FILE);
      if (result.status !== 'UNKNOWN') {
        expect(['UNIFORM', 'VERSE_CHORUS_VARIANCE', 'ESCALATING', 'DE_ESCALATING', 'DYNAMIC', 'SPARSE', 'UNKNOWN']).toContain(result.pattern);
      }
    }, 30000);

    it('should return segment count', async () => {
      const result = await quickCheck(TEST_FILE);
      expect(typeof result.segmentCount).toBe('number');
    }, 30000);

    it('should return processing time', async () => {
      const result = await quickCheck(TEST_FILE);
      expect(result.processingTimeMs).toBeDefined();
      expect(typeof result.processingTimeMs).toBe('number');
    }, 30000);
  });

  describe('Response structure', () => {
    it('should have all required fields', async () => {
      const result = await quickCheck(TEST_FILE);
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('pattern');
      expect(result).toHaveProperty('segmentCount');
      expect(result).toHaveProperty('processingTimeMs');
    }, 30000);

    it('should include meanCrestFactor when successful', async () => {
      const result = await quickCheck(TEST_FILE);
      if (result.status !== 'UNKNOWN') {
        expect(result).toHaveProperty('meanCrestFactor');
        expect(typeof result.meanCrestFactor).toBe('number');
      }
    }, 30000);

    it('should include heavyCompressionPercent when successful', async () => {
      const result = await quickCheck(TEST_FILE);
      if (result.status !== 'UNKNOWN') {
        expect(result).toHaveProperty('heavyCompressionPercent');
        expect(typeof result.heavyCompressionPercent).toBe('number');
      }
    }, 30000);
  });
});

// ============================================================================
// Full Analysis Tests
// ============================================================================

describe('analyzeGainReduction', () => {
  describe('File handling', () => {
    it('should handle non-existent file gracefully', async () => {
      const result = await analyzeGainReduction(NON_EXISTENT_FILE);
      expect(result.segmentCount).toBe(0);
    }, 15000);
  });

  describe('Valid file analysis', () => {
    it('should return complete analysis object', async () => {
      const result = await analyzeGainReduction(TEST_FILE);
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('windowSize');
      expect(result).toHaveProperty('segmentCount');
      expect(result).toHaveProperty('statistics');
      expect(result).toHaveProperty('distribution');
      expect(result).toHaveProperty('pattern');
      expect(result).toHaveProperty('patternDescription');
      expect(result).toHaveProperty('recommendation');
      expect(result).toHaveProperty('processingTimeMs');
    }, 60000);

    it('should include segments by default', async () => {
      const result = await analyzeGainReduction(TEST_FILE);
      expect(result).toHaveProperty('segments');
      expect(Array.isArray(result.segments)).toBe(true);
    }, 60000);

    it('should omit segments when option is false', async () => {
      const result = await analyzeGainReduction(TEST_FILE, { includeSegments: false });
      expect(result.segments).toBeUndefined();
    }, 60000);
  });

  describe('Segment structure', () => {
    it('should have required fields in each segment', async () => {
      const result = await analyzeGainReduction(TEST_FILE);
      if (result.segments && result.segments.length > 0) {
        const segment = result.segments[0];
        expect(segment).toHaveProperty('index');
        expect(segment).toHaveProperty('startTime');
        expect(segment).toHaveProperty('endTime');
        expect(segment).toHaveProperty('compressionIntensity');
        expect(segment).toHaveProperty('compressionScore');
      }
    }, 60000);

    it('should have valid intensity values in segments', async () => {
      const result = await analyzeGainReduction(TEST_FILE);
      if (result.segments && result.segments.length > 0) {
        result.segments.forEach(seg => {
          expect(['EXTREME', 'HEAVY', 'MODERATE', 'LIGHT', 'MINIMAL', 'NONE', 'UNKNOWN']).toContain(seg.compressionIntensity);
        });
      }
    }, 60000);
  });

  describe('Custom window size', () => {
    it('should accept custom window size', async () => {
      const result = await analyzeGainReduction(TEST_FILE, { windowSize: WINDOW_SIZES.PHRASE });
      expect(result.windowSize).toBe(WINDOW_SIZES.PHRASE);
    }, 60000);

    it('should produce fewer segments with larger window', async () => {
      const [smallWindow, largeWindow] = await Promise.all([
        analyzeGainReduction(TEST_FILE, { windowSize: WINDOW_SIZES.BEAT }),
        analyzeGainReduction(TEST_FILE, { windowSize: WINDOW_SIZES.SECTION })
      ]);
      expect(largeWindow.segmentCount).toBeLessThanOrEqual(smallWindow.segmentCount);
    }, 120000);
  });

  describe('Statistics structure', () => {
    it('should return valid statistics', async () => {
      const result = await analyzeGainReduction(TEST_FILE);
      if (result.segmentCount > 0) {
        expect(result.statistics).toHaveProperty('meanCrestFactor');
        expect(result.statistics).toHaveProperty('crestFactorStdDev');
        expect(result.statistics).toHaveProperty('minCrestFactor');
        expect(result.statistics).toHaveProperty('maxCrestFactor');
        expect(result.statistics).toHaveProperty('meanCompressionScore');
        expect(result.statistics).toHaveProperty('heavyCompressionCount');
        expect(result.statistics).toHaveProperty('heavyCompressionDensity');
      }
    }, 60000);
  });

  describe('Distribution structure', () => {
    it('should return valid distribution', async () => {
      const result = await analyzeGainReduction(TEST_FILE);
      if (result.segmentCount > 0) {
        expect(result.distribution).toHaveProperty('extreme');
        expect(result.distribution).toHaveProperty('heavy');
        expect(result.distribution).toHaveProperty('moderate');
        expect(result.distribution).toHaveProperty('light');
        expect(result.distribution).toHaveProperty('minimal');
        expect(result.distribution).toHaveProperty('none');
      }
    }, 60000);

    it('should have distribution percentages sum to 100', async () => {
      const result = await analyzeGainReduction(TEST_FILE);
      if (result.segmentCount > 0) {
        const sum = Object.values(result.distribution).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(100, 0);
      }
    }, 60000);
  });
});
