/**
 * Low-End Mono Compatibility Checker Tests
 * 
 * Tests for sub-120Hz phase correlation analysis including
 * sub-bass (20-60 Hz) and mid-bass (60-120 Hz) bands.
 */

const lowEndMonoChecker = require('../services/lowEndMonoChecker');

const {
  analyzeLowEndMono,
  quickCheck,
  measureBandCorrelation,
  classifyCorrelation,
  generateRecommendation,
  LowEndMonoStatus,
  CORRELATION_THRESHOLDS,
  FREQUENCY_BANDS
} = lowEndMonoChecker;

// ============================================================================
// Constants Tests
// ============================================================================

describe('Low-End Mono Checker Constants', () => {
  describe('LowEndMonoStatus', () => {
    test('should export all status values', () => {
      expect(LowEndMonoStatus.EXCELLENT).toBe('EXCELLENT');
      expect(LowEndMonoStatus.GOOD).toBe('GOOD');
      expect(LowEndMonoStatus.FAIR).toBe('FAIR');
      expect(LowEndMonoStatus.POOR).toBe('POOR');
      expect(LowEndMonoStatus.CRITICAL).toBe('CRITICAL');
    });
    
    test('should have exactly 5 status values', () => {
      expect(Object.keys(LowEndMonoStatus)).toHaveLength(5);
    });
  });
  
  describe('CORRELATION_THRESHOLDS', () => {
    test('should define threshold values', () => {
      expect(CORRELATION_THRESHOLDS.EXCELLENT).toBe(0.9);
      expect(CORRELATION_THRESHOLDS.GOOD).toBe(0.7);
      expect(CORRELATION_THRESHOLDS.FAIR).toBe(0.3);
      expect(CORRELATION_THRESHOLDS.POOR).toBe(0.0);
    });
    
    test('thresholds should be in descending order', () => {
      expect(CORRELATION_THRESHOLDS.EXCELLENT).toBeGreaterThan(CORRELATION_THRESHOLDS.GOOD);
      expect(CORRELATION_THRESHOLDS.GOOD).toBeGreaterThan(CORRELATION_THRESHOLDS.FAIR);
      expect(CORRELATION_THRESHOLDS.FAIR).toBeGreaterThan(CORRELATION_THRESHOLDS.POOR);
    });
  });
  
  describe('FREQUENCY_BANDS', () => {
    test('should define sub-bass band (20-60 Hz)', () => {
      expect(FREQUENCY_BANDS.SUB_BASS).toEqual({ low: 20, high: 60 });
    });
    
    test('should define mid-bass band (60-120 Hz)', () => {
      expect(FREQUENCY_BANDS.MID_BASS).toEqual({ low: 60, high: 120 });
    });
    
    test('should define full low-end band (20-120 Hz)', () => {
      expect(FREQUENCY_BANDS.FULL_LOW_END).toEqual({ low: 20, high: 120 });
    });
  });
});

// ============================================================================
// Classification Tests
// ============================================================================

describe('classifyCorrelation', () => {
  test('should classify EXCELLENT for correlation >= 0.9', () => {
    expect(classifyCorrelation(0.95)).toBe(LowEndMonoStatus.EXCELLENT);
    expect(classifyCorrelation(0.9)).toBe(LowEndMonoStatus.EXCELLENT);
    expect(classifyCorrelation(1.0)).toBe(LowEndMonoStatus.EXCELLENT);
  });
  
  test('should classify GOOD for correlation 0.7-0.9', () => {
    expect(classifyCorrelation(0.85)).toBe(LowEndMonoStatus.GOOD);
    expect(classifyCorrelation(0.7)).toBe(LowEndMonoStatus.GOOD);
    expect(classifyCorrelation(0.89)).toBe(LowEndMonoStatus.GOOD);
  });
  
  test('should classify FAIR for correlation 0.3-0.7', () => {
    expect(classifyCorrelation(0.5)).toBe(LowEndMonoStatus.FAIR);
    expect(classifyCorrelation(0.3)).toBe(LowEndMonoStatus.FAIR);
    expect(classifyCorrelation(0.69)).toBe(LowEndMonoStatus.FAIR);
  });
  
  test('should classify POOR for correlation 0.0-0.3', () => {
    expect(classifyCorrelation(0.15)).toBe(LowEndMonoStatus.POOR);
    expect(classifyCorrelation(0.0)).toBe(LowEndMonoStatus.POOR);
    expect(classifyCorrelation(0.29)).toBe(LowEndMonoStatus.POOR);
  });
  
  test('should classify CRITICAL for correlation < 0.0', () => {
    expect(classifyCorrelation(-0.1)).toBe(LowEndMonoStatus.CRITICAL);
    expect(classifyCorrelation(-0.5)).toBe(LowEndMonoStatus.CRITICAL);
    expect(classifyCorrelation(-1.0)).toBe(LowEndMonoStatus.CRITICAL);
  });
  
  test('should handle null and NaN values', () => {
    expect(classifyCorrelation(null)).toBe('UNKNOWN');
    expect(classifyCorrelation(NaN)).toBe('UNKNOWN');
  });
});

// ============================================================================
// Recommendation Tests
// ============================================================================

describe('generateRecommendation', () => {
  test('should recommend no action for EXCELLENT status', () => {
    const analysis = { overallStatus: LowEndMonoStatus.EXCELLENT };
    const result = generateRecommendation(analysis);
    expect(result).toContain('mono-compatible');
    expect(result).toContain('No action');
  });
  
  test('should indicate acceptable for GOOD status', () => {
    const analysis = { overallStatus: LowEndMonoStatus.GOOD };
    const result = generateRecommendation(analysis);
    expect(result).toContain('good');
  });
  
  test('should warn about mono playback for FAIR status', () => {
    const analysis = { overallStatus: LowEndMonoStatus.FAIR };
    const result = generateRecommendation(analysis);
    expect(result.toLowerCase()).toContain('mono');
  });
  
  test('should recommend mono summing for POOR status', () => {
    const analysis = { overallStatus: LowEndMonoStatus.POOR };
    const result = generateRecommendation(analysis);
    expect(result.toLowerCase()).toContain('mono');
    expect(result).toMatch(/120\s*Hz|phase/i);
  });
  
  test('should flag CRITICAL as urgent', () => {
    const analysis = { overallStatus: LowEndMonoStatus.CRITICAL };
    const result = generateRecommendation(analysis);
    expect(result).toContain('CRITICAL');
    expect(result.toLowerCase()).toContain('phase');
  });
  
  test('should identify sub-bass issues specifically', () => {
    const analysis = {
      overallStatus: LowEndMonoStatus.FAIR,
      subBass: { status: LowEndMonoStatus.POOR }
    };
    const result = generateRecommendation(analysis);
    expect(result).toContain('20-60 Hz');
  });
  
  test('should identify mid-bass issues specifically', () => {
    const analysis = {
      overallStatus: LowEndMonoStatus.FAIR,
      subBass: { status: LowEndMonoStatus.GOOD },
      midBass: { status: LowEndMonoStatus.POOR }
    };
    const result = generateRecommendation(analysis);
    expect(result).toContain('60-120 Hz');
  });
});

// ============================================================================
// Integration Tests (require FFmpeg)
// ============================================================================

describe('Low-End Mono Checker Integration', () => {
  // These tests require FFmpeg and actual audio files
  // They are marked with conditional execution
  
  const TEST_AUDIO_PATH = process.env.TEST_AUDIO_PATH;
  const hasTestAudio = !!TEST_AUDIO_PATH;
  
  const conditionalTest = hasTestAudio ? test : test.skip;
  
  conditionalTest('analyzeLowEndMono should return complete analysis structure', async () => {
    const result = await analyzeLowEndMono(TEST_AUDIO_PATH);
    
    expect(result).toHaveProperty('overallCorrelation');
    expect(result).toHaveProperty('overallStatus');
    expect(result).toHaveProperty('subBass');
    expect(result).toHaveProperty('midBass');
    expect(result).toHaveProperty('hasPhaseIssues');
    expect(result).toHaveProperty('cutoffHz');
    expect(result).toHaveProperty('processingTimeMs');
    expect(result).toHaveProperty('recommendation');
  });
  
  conditionalTest('quickCheck should return minimal analysis structure', async () => {
    const result = await quickCheck(TEST_AUDIO_PATH);
    
    expect(result).toHaveProperty('correlation');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('hasPhaseIssues');
    expect(result).toHaveProperty('processingTimeMs');
  });
  
  conditionalTest('sub-bass band should be included when requested', async () => {
    const result = await analyzeLowEndMono(TEST_AUDIO_PATH, { includeSubBass: true });
    
    expect(result.subBass).not.toBeNull();
    expect(result.subBass.band).toBe('20-60 Hz');
  });
  
  conditionalTest('mid-bass band should be included when requested', async () => {
    const result = await analyzeLowEndMono(TEST_AUDIO_PATH, { includeMidBass: true });
    
    expect(result.midBass).not.toBeNull();
    expect(result.midBass.band).toBe('60-120 Hz');
  });
});

// ============================================================================
// Edge Case Tests
// ============================================================================

describe('Edge Cases', () => {
  test('should handle missing analysis data gracefully', () => {
    const analysis = { overallStatus: undefined };
    const result = generateRecommendation(analysis);
    expect(result).toBeTruthy(); // Should not throw
  });
  
  test('correlation thresholds should cover full range -1 to +1', () => {
    // Test boundary conditions
    expect(classifyCorrelation(-1)).toBe(LowEndMonoStatus.CRITICAL);
    expect(classifyCorrelation(0)).toBe(LowEndMonoStatus.POOR);
    expect(classifyCorrelation(1)).toBe(LowEndMonoStatus.EXCELLENT);
  });
});

// ============================================================================
// Module Export Tests
// ============================================================================

describe('Module Exports', () => {
  test('should export all required functions', () => {
    expect(typeof analyzeLowEndMono).toBe('function');
    expect(typeof quickCheck).toBe('function');
    expect(typeof measureBandCorrelation).toBe('function');
    expect(typeof classifyCorrelation).toBe('function');
    expect(typeof generateRecommendation).toBe('function');
  });
  
  test('should export all required constants', () => {
    expect(LowEndMonoStatus).toBeDefined();
    expect(CORRELATION_THRESHOLDS).toBeDefined();
    expect(FREQUENCY_BANDS).toBeDefined();
  });
});
