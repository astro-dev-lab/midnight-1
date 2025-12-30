/**
 * Limiter Stress Index Tests
 * 
 * Tests for the limiter stress analyzer that measures how "hard"
 * a limiter is working by combining multiple indicators.
 */

const path = require('path');
const fs = require('fs').promises;

const {
  LimiterStressStatus,
  STRESS_THRESHOLDS,
  COMPONENT_WEIGHTS,
  REFERENCE_VALUES,
  calculateStressIndex,
  classifyStress,
  generateRecommendation,
  normalizeInverted,
  normalizeDirect,
  analyzeLimiterStress,
  quickCheck
} = require('../services/limiterStressIndex');

const TEST_FIXTURES_DIR = path.join(__dirname, 'fixtures');

// ============================================================================
// Constants Tests
// ============================================================================

describe('LimiterStressStatus Constants', () => {
  test('should have all required status values', () => {
    expect(LimiterStressStatus.NONE).toBe('NONE');
    expect(LimiterStressStatus.LIGHT).toBe('LIGHT');
    expect(LimiterStressStatus.MODERATE).toBe('MODERATE');
    expect(LimiterStressStatus.HEAVY).toBe('HEAVY');
    expect(LimiterStressStatus.SEVERE).toBe('SEVERE');
    expect(LimiterStressStatus.EXTREME).toBe('EXTREME');
  });
  
  test('should have exactly 6 status levels', () => {
    expect(Object.keys(LimiterStressStatus)).toHaveLength(6);
  });
});

describe('STRESS_THRESHOLDS Constants', () => {
  test('should have all required thresholds', () => {
    expect(STRESS_THRESHOLDS.NONE).toBeDefined();
    expect(STRESS_THRESHOLDS.LIGHT).toBeDefined();
    expect(STRESS_THRESHOLDS.MODERATE).toBeDefined();
    expect(STRESS_THRESHOLDS.HEAVY).toBeDefined();
    expect(STRESS_THRESHOLDS.SEVERE).toBeDefined();
  });
  
  test('should have thresholds in ascending order', () => {
    expect(STRESS_THRESHOLDS.NONE).toBeLessThan(STRESS_THRESHOLDS.LIGHT);
    expect(STRESS_THRESHOLDS.LIGHT).toBeLessThan(STRESS_THRESHOLDS.MODERATE);
    expect(STRESS_THRESHOLDS.MODERATE).toBeLessThan(STRESS_THRESHOLDS.HEAVY);
    expect(STRESS_THRESHOLDS.HEAVY).toBeLessThan(STRESS_THRESHOLDS.SEVERE);
  });
  
  test('should have SEVERE threshold below 100', () => {
    expect(STRESS_THRESHOLDS.SEVERE).toBeLessThan(100);
  });
});

describe('COMPONENT_WEIGHTS Constants', () => {
  test('should have all required weight components', () => {
    expect(COMPONENT_WEIGHTS.crestFactor).toBeDefined();
    expect(COMPONENT_WEIGHTS.flatFactor).toBeDefined();
    expect(COMPONENT_WEIGHTS.headroom).toBeDefined();
    expect(COMPONENT_WEIGHTS.clipDensity).toBeDefined();
    expect(COMPONENT_WEIGHTS.lraCompression).toBeDefined();
    expect(COMPONENT_WEIGHTS.hfTransientLoss).toBeDefined();
  });
  
  test('weights should sum to 1.0', () => {
    const totalWeight = Object.values(COMPONENT_WEIGHTS).reduce((sum, w) => sum + w, 0);
    expect(totalWeight).toBeCloseTo(1.0, 5);
  });
  
  test('crestFactor should have highest weight', () => {
    const maxWeight = Math.max(...Object.values(COMPONENT_WEIGHTS));
    expect(COMPONENT_WEIGHTS.crestFactor).toBe(maxWeight);
  });
});

describe('REFERENCE_VALUES Constants', () => {
  test('should have crest factor range values', () => {
    expect(REFERENCE_VALUES.crestFactorMinDb).toBeDefined();
    expect(REFERENCE_VALUES.crestFactorMaxDb).toBeDefined();
    expect(REFERENCE_VALUES.crestFactorMinDb).toBeLessThan(REFERENCE_VALUES.crestFactorMaxDb);
  });
  
  test('should have LRA range values', () => {
    expect(REFERENCE_VALUES.lraMinLu).toBeDefined();
    expect(REFERENCE_VALUES.lraMaxLu).toBeDefined();
    expect(REFERENCE_VALUES.lraMinLu).toBeLessThan(REFERENCE_VALUES.lraMaxLu);
  });
  
  test('should have HF crest range values', () => {
    expect(REFERENCE_VALUES.hfCrestMinDb).toBeDefined();
    expect(REFERENCE_VALUES.hfCrestMaxDb).toBeDefined();
    expect(REFERENCE_VALUES.hfCrestMinDb).toBeLessThan(REFERENCE_VALUES.hfCrestMaxDb);
  });
});

// ============================================================================
// Normalization Function Tests
// ============================================================================

describe('normalizeInverted', () => {
  test('should return 1 when value equals min', () => {
    expect(normalizeInverted(3, 3, 18)).toBe(1);
  });
  
  test('should return 0 when value equals max', () => {
    expect(normalizeInverted(18, 3, 18)).toBe(0);
  });
  
  test('should return 0.5 for midpoint value', () => {
    expect(normalizeInverted(10.5, 3, 18)).toBeCloseTo(0.5, 2);
  });
  
  test('should return 1 when value is below min', () => {
    expect(normalizeInverted(1, 3, 18)).toBe(1);
  });
  
  test('should return 0 when value is above max', () => {
    expect(normalizeInverted(25, 3, 18)).toBe(0);
  });
  
  test('should return 0 for null value', () => {
    expect(normalizeInverted(null, 3, 18)).toBe(0);
  });
  
  test('should return 0 for NaN value', () => {
    expect(normalizeInverted(NaN, 3, 18)).toBe(0);
  });
});

describe('normalizeDirect', () => {
  test('should return 0 when value equals min', () => {
    expect(normalizeDirect(0, 0, 1)).toBe(0);
  });
  
  test('should return 1 when value equals max', () => {
    expect(normalizeDirect(1, 0, 1)).toBe(1);
  });
  
  test('should return 0.5 for midpoint value', () => {
    expect(normalizeDirect(0.5, 0, 1)).toBeCloseTo(0.5, 2);
  });
  
  test('should return 0 when value is below min', () => {
    expect(normalizeDirect(-1, 0, 1)).toBe(0);
  });
  
  test('should return 1 when value is above max', () => {
    expect(normalizeDirect(2, 0, 1)).toBe(1);
  });
  
  test('should return 0 for null value', () => {
    expect(normalizeDirect(null, 0, 1)).toBe(0);
  });
});

// ============================================================================
// Classification Tests
// ============================================================================

describe('classifyStress', () => {
  test('should return NONE for stress < 10', () => {
    expect(classifyStress(0)).toBe('NONE');
    expect(classifyStress(5)).toBe('NONE');
    expect(classifyStress(9.9)).toBe('NONE');
  });
  
  test('should return LIGHT for stress 10-29', () => {
    expect(classifyStress(10)).toBe('LIGHT');
    expect(classifyStress(20)).toBe('LIGHT');
    expect(classifyStress(29.9)).toBe('LIGHT');
  });
  
  test('should return MODERATE for stress 30-49', () => {
    expect(classifyStress(30)).toBe('MODERATE');
    expect(classifyStress(40)).toBe('MODERATE');
    expect(classifyStress(49.9)).toBe('MODERATE');
  });
  
  test('should return HEAVY for stress 50-69', () => {
    expect(classifyStress(50)).toBe('HEAVY');
    expect(classifyStress(60)).toBe('HEAVY');
    expect(classifyStress(69.9)).toBe('HEAVY');
  });
  
  test('should return SEVERE for stress 70-84', () => {
    expect(classifyStress(70)).toBe('SEVERE');
    expect(classifyStress(80)).toBe('SEVERE');
    expect(classifyStress(84.9)).toBe('SEVERE');
  });
  
  test('should return EXTREME for stress >= 85', () => {
    expect(classifyStress(85)).toBe('EXTREME');
    expect(classifyStress(90)).toBe('EXTREME');
    expect(classifyStress(100)).toBe('EXTREME');
  });
  
  test('should return UNKNOWN for null', () => {
    expect(classifyStress(null)).toBe('UNKNOWN');
  });
  
  test('should return UNKNOWN for NaN', () => {
    expect(classifyStress(NaN)).toBe('UNKNOWN');
  });
});

// ============================================================================
// Stress Index Calculation Tests
// ============================================================================

describe('calculateStressIndex', () => {
  test('should return 0 stress for dynamic audio', () => {
    const components = {
      dynamics: { crestFactorDb: 18, peakDb: -6, flatFactor: 0 },
      clips: { clipDensity: 0 },
      lra: { lra: 16 },
      hfTransients: { hfCrestFactorDb: 20 }
    };
    const result = calculateStressIndex(components);
    expect(result.stressIndex).toBe(0);
  });
  
  test('should return high stress for limited audio', () => {
    const components = {
      dynamics: { crestFactorDb: 3, peakDb: -0.5, flatFactor: 0.8 },
      clips: { clipDensity: 0.5 },
      lra: { lra: 4 },
      hfTransients: { hfCrestFactorDb: 6 }
    };
    const result = calculateStressIndex(components);
    expect(result.stressIndex).toBeGreaterThan(70);
  });
  
  test('should return moderate stress for typical mastered audio', () => {
    const components = {
      dynamics: { crestFactorDb: 10, peakDb: -1.5, flatFactor: 0.3 },
      clips: { clipDensity: 0 },
      lra: { lra: 8 },
      hfTransients: { hfCrestFactorDb: 12 }
    };
    const result = calculateStressIndex(components);
    expect(result.stressIndex).toBeGreaterThan(20);
    expect(result.stressIndex).toBeLessThan(60);
  });
  
  test('should include component breakdown', () => {
    const components = {
      dynamics: { crestFactorDb: 10, peakDb: -3, flatFactor: 0.2 },
      clips: { clipDensity: 0 },
      lra: { lra: 10 },
      hfTransients: { hfCrestFactorDb: 14 }
    };
    const result = calculateStressIndex(components);
    expect(result.components).toBeDefined();
    expect(result.components.crestFactor).toBeDefined();
    expect(result.components.flatFactor).toBeDefined();
    expect(result.components.headroom).toBeDefined();
    expect(result.components.clipDensity).toBeDefined();
    expect(result.components.lraCompression).toBeDefined();
    expect(result.components.hfTransientLoss).toBeDefined();
  });
  
  test('should handle null dynamics gracefully', () => {
    const components = {
      dynamics: null,
      clips: { clipDensity: 0 },
      lra: { lra: 10 },
      hfTransients: { hfCrestFactorDb: 14 }
    };
    const result = calculateStressIndex(components);
    expect(result.stressIndex).toBeDefined();
    expect(typeof result.stressIndex).toBe('number');
  });
  
  test('should handle missing properties gracefully', () => {
    const components = {
      dynamics: {},
      clips: {},
      lra: {},
      hfTransients: {}
    };
    const result = calculateStressIndex(components);
    expect(result.stressIndex).toBeDefined();
    expect(isNaN(result.stressIndex)).toBe(false);
  });
});

// ============================================================================
// Recommendation Generation Tests
// ============================================================================

describe('generateRecommendation', () => {
  test('should return dynamic range message for NONE status', () => {
    const analysis = { status: 'NONE', stressIndex: 5, components: {}, hasClipping: false };
    const recommendation = generateRecommendation(analysis);
    expect(recommendation).toContain('No apparent limiting');
  });
  
  test('should return safe message for LIGHT status', () => {
    const analysis = { status: 'LIGHT', stressIndex: 20, components: {}, hasClipping: false };
    const recommendation = generateRecommendation(analysis);
    expect(recommendation).toContain('Light limiting');
    expect(recommendation).toContain('Safe');
  });
  
  test('should return gain limit advice for MODERATE status', () => {
    const analysis = { status: 'MODERATE', stressIndex: 40, components: {}, hasClipping: false };
    const recommendation = generateRecommendation(analysis);
    expect(recommendation).toContain('Moderate limiting');
    expect(recommendation).toContain('1-2 dB');
  });
  
  test('should include contributor advice for HEAVY status', () => {
    const analysis = {
      status: 'HEAVY',
      stressIndex: 60,
      components: { crestFactor: 80, flatFactor: 30, headroom: 20 },
      hasClipping: false
    };
    const recommendation = generateRecommendation(analysis);
    expect(recommendation).toContain('Heavy limiting');
    expect(recommendation).toContain('artifacts');
  });
  
  test('should warn about distortion for SEVERE status', () => {
    const analysis = {
      status: 'SEVERE',
      stressIndex: 78,
      components: { crestFactor: 90, flatFactor: 60 },
      hasClipping: false
    };
    const recommendation = generateRecommendation(analysis);
    expect(recommendation).toContain('SEVERE');
    expect(recommendation).toContain('distortion');
  });
  
  test('should strongly warn for EXTREME status', () => {
    const analysis = {
      status: 'EXTREME',
      stressIndex: 92,
      components: { crestFactor: 100, flatFactor: 80 },
      hasClipping: false
    };
    const recommendation = generateRecommendation(analysis);
    expect(recommendation).toContain('EXTREME');
    expect(recommendation).toContain('pre-master');
  });
  
  test('should include clipping warning when hasClipping is true', () => {
    const analysis = {
      status: 'EXTREME',
      stressIndex: 95,
      components: { crestFactor: 100, clipDensity: 100 },
      hasClipping: true
    };
    const recommendation = generateRecommendation(analysis);
    expect(recommendation).toContain('CLIPPING');
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  test('calculateStressIndex should handle completely empty input', () => {
    const result = calculateStressIndex({});
    expect(result.stressIndex).toBeDefined();
    expect(result.components).toBeDefined();
  });
  
  test('classifyStress should handle negative values', () => {
    expect(classifyStress(-10)).toBe('NONE');
  });
  
  test('classifyStress should handle values over 100', () => {
    expect(classifyStress(150)).toBe('EXTREME');
  });
  
  test('generateRecommendation should handle missing components', () => {
    const analysis = { status: 'HEAVY', stressIndex: 60 };
    const recommendation = generateRecommendation(analysis);
    expect(recommendation).toBeDefined();
    expect(typeof recommendation).toBe('string');
  });
  
  test('calculateStressIndex should bound clip density contribution', () => {
    const components = {
      dynamics: { crestFactorDb: 10, peakDb: -3 },
      clips: { clipDensity: 50 }, // Extremely high clip density
      lra: { lra: 10 },
      hfTransients: { hfCrestFactorDb: 14 }
    };
    const result = calculateStressIndex(components);
    // clipDensity component should be capped at 100
    expect(result.components.clipDensity).toBeLessThanOrEqual(100);
  });
});

// ============================================================================
// Consistency Tests
// ============================================================================

describe('Consistency Tests', () => {
  test('classifyStress and STRESS_THRESHOLDS should be consistent', () => {
    expect(classifyStress(STRESS_THRESHOLDS.NONE - 0.1)).toBe('NONE');
    expect(classifyStress(STRESS_THRESHOLDS.NONE)).toBe('LIGHT');
    expect(classifyStress(STRESS_THRESHOLDS.LIGHT)).toBe('MODERATE');
    expect(classifyStress(STRESS_THRESHOLDS.MODERATE)).toBe('HEAVY');
    expect(classifyStress(STRESS_THRESHOLDS.HEAVY)).toBe('SEVERE');
    expect(classifyStress(STRESS_THRESHOLDS.SEVERE)).toBe('EXTREME');
  });
  
  test('status progression matches increasing stress', () => {
    const statuses = ['NONE', 'LIGHT', 'MODERATE', 'HEAVY', 'SEVERE', 'EXTREME'];
    const stressValues = [0, 20, 40, 60, 75, 90];
    
    stressValues.forEach((stress, i) => {
      expect(classifyStress(stress)).toBe(statuses[i]);
    });
  });
});

// ============================================================================
// Integration Tests (with real audio files)
// ============================================================================

describe('Integration Tests', () => {
  let fixturesExist = false;
  let testFile;
  
  beforeAll(async () => {
    try {
      const files = await fs.readdir(TEST_FIXTURES_DIR);
      const audioFiles = files.filter(f => 
        f.endsWith('.wav') || f.endsWith('.mp3') || f.endsWith('.flac')
      );
      fixturesExist = audioFiles.length > 0;
      if (fixturesExist) {
        testFile = path.join(TEST_FIXTURES_DIR, audioFiles[0]);
      }
    } catch {
      fixturesExist = false;
    }
  });
  
  test('analyzeLimiterStress should return complete result', async () => {
    if (!fixturesExist) {
      console.log('Skipping: No test fixtures available');
      return;
    }
    
    const result = await analyzeLimiterStress(testFile);
    
    expect(result).toBeDefined();
    expect(result.stressIndex).toBeDefined();
    expect(typeof result.stressIndex).toBe('number');
    expect(result.status).toBeDefined();
    expect(Object.values(LimiterStressStatus).concat(['UNKNOWN'])).toContain(result.status);
    expect(result.components).toBeDefined();
    expect(result.metrics).toBeDefined();
    expect(result.recommendation).toBeDefined();
    expect(result.processingTimeMs).toBeDefined();
  }, 30000);
  
  test('quickCheck should return simplified result', async () => {
    if (!fixturesExist) {
      console.log('Skipping: No test fixtures available');
      return;
    }
    
    const result = await quickCheck(testFile);
    
    expect(result).toBeDefined();
    expect(result.stressIndex).toBeDefined();
    expect(typeof result.stressIndex).toBe('number');
    expect(result.status).toBeDefined();
    expect(result.crestFactorDb).toBeDefined();
    expect(result.processingTimeMs).toBeDefined();
  }, 15000);
  
  test('quickCheck should be faster than full analysis', async () => {
    if (!fixturesExist) {
      console.log('Skipping: No test fixtures available');
      return;
    }
    
    const quickResult = await quickCheck(testFile);
    const fullResult = await analyzeLimiterStress(testFile);
    
    // Quick check should use fewer FFmpeg calls and be faster
    expect(quickResult.processingTimeMs).toBeLessThanOrEqual(fullResult.processingTimeMs);
  }, 45000);
});
