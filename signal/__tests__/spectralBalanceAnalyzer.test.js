/**
 * Spectral Balance Analyzer Tests
 * 
 * Tests for octave-band spectral analysis and deviation
 * from reference curves (pink noise, genre-specific).
 */

const spectralBalanceAnalyzer = require('../services/spectralBalanceAnalyzer');

const {
  analyzeSpectralBalance,
  quickCheck,
  measureBandEnergy,
  measureAllBands,
  calculateSpectralTilt,
  calculateDeviation,
  identifyImbalanceRegion,
  classifyDeviation,
  generateRecommendation,
  getAvailableReferences,
  SpectralBalanceStatus,
  DEVIATION_THRESHOLDS,
  ImbalanceRegion,
  OCTAVE_BANDS,
  REFERENCE_CURVES
} = spectralBalanceAnalyzer;

// ============================================================================
// Constants Tests
// ============================================================================

describe('Spectral Balance Analyzer Constants', () => {
  describe('SpectralBalanceStatus', () => {
    test('should export all status values', () => {
      expect(SpectralBalanceStatus.BALANCED).toBe('BALANCED');
      expect(SpectralBalanceStatus.SLIGHT).toBe('SLIGHT');
      expect(SpectralBalanceStatus.MODERATE).toBe('MODERATE');
      expect(SpectralBalanceStatus.SIGNIFICANT).toBe('SIGNIFICANT');
      expect(SpectralBalanceStatus.EXTREME).toBe('EXTREME');
    });
    
    test('should have exactly 5 status values', () => {
      expect(Object.keys(SpectralBalanceStatus)).toHaveLength(5);
    });
  });
  
  describe('DEVIATION_THRESHOLDS', () => {
    test('should define threshold values in dB', () => {
      expect(DEVIATION_THRESHOLDS.BALANCED).toBe(2);
      expect(DEVIATION_THRESHOLDS.SLIGHT).toBe(4);
      expect(DEVIATION_THRESHOLDS.MODERATE).toBe(6);
      expect(DEVIATION_THRESHOLDS.SIGNIFICANT).toBe(10);
    });
    
    test('thresholds should be in ascending order', () => {
      expect(DEVIATION_THRESHOLDS.BALANCED).toBeLessThan(DEVIATION_THRESHOLDS.SLIGHT);
      expect(DEVIATION_THRESHOLDS.SLIGHT).toBeLessThan(DEVIATION_THRESHOLDS.MODERATE);
      expect(DEVIATION_THRESHOLDS.MODERATE).toBeLessThan(DEVIATION_THRESHOLDS.SIGNIFICANT);
    });
  });
  
  describe('ImbalanceRegion', () => {
    test('should export all region values', () => {
      expect(ImbalanceRegion.LOW).toBe('LOW');
      expect(ImbalanceRegion.LOW_MID).toBe('LOW_MID');
      expect(ImbalanceRegion.MID).toBe('MID');
      expect(ImbalanceRegion.HIGH_MID).toBe('HIGH_MID');
      expect(ImbalanceRegion.HIGH).toBe('HIGH');
      expect(ImbalanceRegion.BALANCED).toBe('BALANCED');
    });
  });
  
  describe('OCTAVE_BANDS', () => {
    test('should have 10 octave bands', () => {
      expect(OCTAVE_BANDS).toHaveLength(10);
    });
    
    test('should start at 31.5 Hz and end at 16 kHz', () => {
      expect(OCTAVE_BANDS[0].center).toBe(31.5);
      expect(OCTAVE_BANDS[9].center).toBe(16000);
    });
    
    test('each band should have center, low, high, and label', () => {
      OCTAVE_BANDS.forEach(band => {
        expect(band).toHaveProperty('center');
        expect(band).toHaveProperty('low');
        expect(band).toHaveProperty('high');
        expect(band).toHaveProperty('label');
      });
    });
    
    test('bands should be contiguous (low = previous high)', () => {
      for (let i = 1; i < OCTAVE_BANDS.length; i++) {
        expect(OCTAVE_BANDS[i].low).toBe(OCTAVE_BANDS[i - 1].high);
      }
    });
  });
  
  describe('REFERENCE_CURVES', () => {
    test('should include PINK_NOISE reference', () => {
      expect(REFERENCE_CURVES.PINK_NOISE).toBeDefined();
      expect(REFERENCE_CURVES.PINK_NOISE).toHaveLength(10);
    });
    
    test('should include FLAT reference', () => {
      expect(REFERENCE_CURVES.FLAT).toBeDefined();
      expect(REFERENCE_CURVES.FLAT.every(v => v === 0)).toBe(true);
    });
    
    test('should include genre-specific references', () => {
      expect(REFERENCE_CURVES.HIP_HOP).toBeDefined();
      expect(REFERENCE_CURVES.POP).toBeDefined();
      expect(REFERENCE_CURVES.ROCK).toBeDefined();
      expect(REFERENCE_CURVES.EDM).toBeDefined();
      expect(REFERENCE_CURVES.CLASSICAL).toBeDefined();
      expect(REFERENCE_CURVES.JAZZ).toBeDefined();
    });
    
    test('all reference curves should have 10 values', () => {
      Object.values(REFERENCE_CURVES).forEach(curve => {
        expect(curve).toHaveLength(10);
      });
    });
  });
});

// ============================================================================
// Classification Tests
// ============================================================================

describe('classifyDeviation', () => {
  test('should classify BALANCED for deviation < 2 dB', () => {
    expect(classifyDeviation(0)).toBe(SpectralBalanceStatus.BALANCED);
    expect(classifyDeviation(1.5)).toBe(SpectralBalanceStatus.BALANCED);
    expect(classifyDeviation(1.99)).toBe(SpectralBalanceStatus.BALANCED);
  });
  
  test('should classify SLIGHT for deviation 2-4 dB', () => {
    expect(classifyDeviation(2)).toBe(SpectralBalanceStatus.SLIGHT);
    expect(classifyDeviation(3)).toBe(SpectralBalanceStatus.SLIGHT);
    expect(classifyDeviation(3.99)).toBe(SpectralBalanceStatus.SLIGHT);
  });
  
  test('should classify MODERATE for deviation 4-6 dB', () => {
    expect(classifyDeviation(4)).toBe(SpectralBalanceStatus.MODERATE);
    expect(classifyDeviation(5)).toBe(SpectralBalanceStatus.MODERATE);
    expect(classifyDeviation(5.99)).toBe(SpectralBalanceStatus.MODERATE);
  });
  
  test('should classify SIGNIFICANT for deviation 6-10 dB', () => {
    expect(classifyDeviation(6)).toBe(SpectralBalanceStatus.SIGNIFICANT);
    expect(classifyDeviation(8)).toBe(SpectralBalanceStatus.SIGNIFICANT);
    expect(classifyDeviation(9.99)).toBe(SpectralBalanceStatus.SIGNIFICANT);
  });
  
  test('should classify EXTREME for deviation > 10 dB', () => {
    expect(classifyDeviation(10)).toBe(SpectralBalanceStatus.EXTREME);
    expect(classifyDeviation(15)).toBe(SpectralBalanceStatus.EXTREME);
    expect(classifyDeviation(20)).toBe(SpectralBalanceStatus.EXTREME);
  });
  
  test('should handle null and NaN values', () => {
    expect(classifyDeviation(null)).toBe('UNKNOWN');
    expect(classifyDeviation(NaN)).toBe('UNKNOWN');
  });
});

// ============================================================================
// Calculation Tests
// ============================================================================

describe('calculateSpectralTilt', () => {
  test('should calculate negative slope for pink noise', () => {
    // Pink noise has -3 dB/octave slope
    const pinkLike = [0, -3, -6, -9, -12, -15, -18, -21, -24, -27];
    const tilt = calculateSpectralTilt(pinkLike);
    expect(tilt).toBeLessThan(0);
    expect(tilt).toBeCloseTo(-3, 0);
  });
  
  test('should calculate zero slope for flat response', () => {
    const flat = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const tilt = calculateSpectralTilt(flat);
    expect(tilt).toBeCloseTo(0, 1);
  });
  
  test('should calculate positive slope for rising response', () => {
    const rising = [-10, -8, -6, -4, -2, 0, 2, 4, 6, 8];
    const tilt = calculateSpectralTilt(rising);
    expect(tilt).toBeGreaterThan(0);
  });
  
  test('should handle arrays with null values', () => {
    const partial = [0, -3, null, -9, -12, -15, null, -21, -24, -27];
    const tilt = calculateSpectralTilt(partial);
    expect(tilt).not.toBeNull();
  });
  
  test('should return null for insufficient data', () => {
    const tooFew = [0, -3];
    const tilt = calculateSpectralTilt(tooFew);
    expect(tilt).toBeNull();
  });
});

describe('calculateDeviation', () => {
  test('should return 0 for identical curves', () => {
    const measured = [0, -3, -6, -9, -12];
    const reference = [0, -3, -6, -9, -12];
    const deviation = calculateDeviation(measured, reference);
    expect(deviation).toBeCloseTo(0, 5);
  });
  
  test('should return positive value for different curves', () => {
    const measured = [3, 0, -3, -6, -9];
    const reference = [0, -3, -6, -9, -12];
    const deviation = calculateDeviation(measured, reference);
    expect(deviation).toBeGreaterThan(0);
  });
  
  test('should calculate RMS deviation correctly', () => {
    // 3 dB deviation on all bands = 3 dB RMS
    const measured = [3, 0, -3, -6, -9];
    const reference = [0, -3, -6, -9, -12];
    const deviation = calculateDeviation(measured, reference);
    expect(deviation).toBeCloseTo(3, 0);
  });
  
  test('should handle null values in measured', () => {
    const measured = [0, null, -6, null, -12];
    const reference = [0, -3, -6, -9, -12];
    const deviation = calculateDeviation(measured, reference);
    expect(deviation).not.toBeNull();
  });
});

describe('identifyImbalanceRegion', () => {
  test('should return BALANCED for small deviations', () => {
    const measured = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const reference = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    const result = identifyImbalanceRegion(measured, reference);
    expect(result.region).toBe(ImbalanceRegion.BALANCED);
  });
  
  test('should identify LOW region imbalance', () => {
    const measured = [10, 10, 10, 0, 0, 0, 0, 0, 0, 0];
    const reference = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const result = identifyImbalanceRegion(measured, reference);
    expect(result.region).toBe(ImbalanceRegion.LOW);
    expect(result.isExcessive).toBe(true);
  });
  
  test('should identify HIGH region deficiency', () => {
    const measured = [0, 0, 0, 0, 0, 0, 0, 0, -10, -10];
    const reference = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const result = identifyImbalanceRegion(measured, reference);
    expect(result.region).toBe(ImbalanceRegion.HIGH);
    expect(result.isExcessive).toBe(false);
  });
  
  test('should identify MID region imbalance', () => {
    const measured = [0, 0, 0, 0, 10, 10, 10, 0, 0, 0];
    const reference = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const result = identifyImbalanceRegion(measured, reference);
    expect(result.region).toBe(ImbalanceRegion.MID);
  });
});

// ============================================================================
// Recommendation Tests
// ============================================================================

describe('generateRecommendation', () => {
  test('should recommend no action for BALANCED status', () => {
    const analysis = { status: SpectralBalanceStatus.BALANCED };
    const result = generateRecommendation(analysis);
    expect(result).toContain('within target');
    expect(result).toContain('No corrective');
  });
  
  test('should note stylistic choice for SLIGHT deviation', () => {
    const analysis = { status: SpectralBalanceStatus.SLIGHT };
    const result = generateRecommendation(analysis);
    expect(result.toLowerCase()).toContain('stylistic');
  });
  
  test('should recommend reduction for excessive frequencies', () => {
    const analysis = {
      status: SpectralBalanceStatus.MODERATE,
      imbalanceRegion: ImbalanceRegion.LOW,
      isExcessive: true
    };
    const result = generateRecommendation(analysis);
    expect(result).toContain('Reduce');
    expect(result).toContain('bass');
  });
  
  test('should recommend boost for deficient frequencies', () => {
    const analysis = {
      status: SpectralBalanceStatus.MODERATE,
      imbalanceRegion: ImbalanceRegion.HIGH,
      isExcessive: false
    };
    const result = generateRecommendation(analysis);
    expect(result).toContain('Boost');
    expect(result).toContain('air');
  });
  
  test('should flag EXTREME as urgent', () => {
    const analysis = {
      status: SpectralBalanceStatus.EXTREME,
      imbalanceRegion: ImbalanceRegion.MID,
      isExcessive: true
    };
    const result = generateRecommendation(analysis);
    expect(result).toContain('EXTREME');
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('getAvailableReferences', () => {
  test('should return array of reference curve names', () => {
    const refs = getAvailableReferences();
    expect(Array.isArray(refs)).toBe(true);
    expect(refs).toContain('PINK_NOISE');
    expect(refs).toContain('FLAT');
    expect(refs).toContain('HIP_HOP');
  });
  
  test('should match REFERENCE_CURVES keys', () => {
    const refs = getAvailableReferences();
    expect(refs).toEqual(Object.keys(REFERENCE_CURVES));
  });
});

// ============================================================================
// Integration Tests (require FFmpeg)
// ============================================================================

describe('Spectral Balance Analyzer Integration', () => {
  const TEST_AUDIO_PATH = process.env.TEST_AUDIO_PATH;
  const hasTestAudio = !!TEST_AUDIO_PATH;
  
  const conditionalTest = hasTestAudio ? test : test.skip;
  
  conditionalTest('analyzeSpectralBalance should return complete analysis structure', async () => {
    const result = await analyzeSpectralBalance(TEST_AUDIO_PATH);
    
    expect(result).toHaveProperty('deviationIndex');
    expect(result).toHaveProperty('spectralTiltDb');
    expect(result).toHaveProperty('expectedTiltDb');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('imbalanceRegion');
    expect(result).toHaveProperty('isExcessive');
    expect(result).toHaveProperty('reference');
    expect(result).toHaveProperty('processingTimeMs');
    expect(result).toHaveProperty('recommendation');
  });
  
  conditionalTest('should include per-band data when requested', async () => {
    const result = await analyzeSpectralBalance(TEST_AUDIO_PATH, { returnPerBand: true });
    
    expect(result).toHaveProperty('perBand');
    expect(result.perBand).toHaveLength(10);
    expect(result.perBand[0]).toHaveProperty('label');
    expect(result.perBand[0]).toHaveProperty('center');
    expect(result.perBand[0]).toHaveProperty('measured');
    expect(result.perBand[0]).toHaveProperty('deviation');
  });
  
  conditionalTest('should accept custom reference curve', async () => {
    const result = await analyzeSpectralBalance(TEST_AUDIO_PATH, { reference: 'HIP_HOP' });
    expect(result.reference).toBe('HIP_HOP');
  });
  
  conditionalTest('quickCheck should return minimal analysis structure', async () => {
    const result = await quickCheck(TEST_AUDIO_PATH);
    
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('imbalanceRegion');
    expect(result).toHaveProperty('bands');
    expect(result).toHaveProperty('processingTimeMs');
    expect(result.bands).toHaveProperty('low');
    expect(result.bands).toHaveProperty('mid');
    expect(result.bands).toHaveProperty('high');
  });
});

// ============================================================================
// Edge Case Tests
// ============================================================================

describe('Edge Cases', () => {
  test('should handle empty band levels array', () => {
    const tilt = calculateSpectralTilt([]);
    expect(tilt).toBeNull();
  });
  
  test('should handle all-null band levels', () => {
    const levels = [null, null, null, null, null, null, null, null, null, null];
    const deviation = calculateDeviation(levels, REFERENCE_CURVES.PINK_NOISE);
    expect(deviation).toBeNull();
  });
  
  test('should handle missing imbalanceRegion gracefully', () => {
    const analysis = { status: SpectralBalanceStatus.MODERATE };
    const result = generateRecommendation(analysis);
    expect(result).toBeTruthy();
  });
});

// ============================================================================
// Module Export Tests
// ============================================================================

describe('Module Exports', () => {
  test('should export all required functions', () => {
    expect(typeof analyzeSpectralBalance).toBe('function');
    expect(typeof quickCheck).toBe('function');
    expect(typeof measureBandEnergy).toBe('function');
    expect(typeof measureAllBands).toBe('function');
    expect(typeof calculateSpectralTilt).toBe('function');
    expect(typeof calculateDeviation).toBe('function');
    expect(typeof identifyImbalanceRegion).toBe('function');
    expect(typeof classifyDeviation).toBe('function');
    expect(typeof generateRecommendation).toBe('function');
    expect(typeof getAvailableReferences).toBe('function');
  });
  
  test('should export all required constants', () => {
    expect(SpectralBalanceStatus).toBeDefined();
    expect(DEVIATION_THRESHOLDS).toBeDefined();
    expect(ImbalanceRegion).toBeDefined();
    expect(OCTAVE_BANDS).toBeDefined();
    expect(REFERENCE_CURVES).toBeDefined();
  });
});
