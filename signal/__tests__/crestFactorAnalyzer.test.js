/**
 * Crest Factor Analyzer Tests
 * 
 * Tests for peak-to-RMS relationship analysis and limiter decision support
 */

const path = require('path');
const fs = require('fs').promises;

// Import the crest factor analyzer module
const crestFactorAnalyzer = require('../services/crestFactorAnalyzer');

const {
  DynamicRangeStatus,
  THRESHOLDS,
  GENRE_TARGETS,
  LIMITER_RECOMMENDATIONS,
  analyzeCrestFactor,
  quickCheck,
  calculateCrestFactor,
  calculatePerChannelCrestFactors,
  classifyDynamicRange,
  getLimiterRecommendation,
  assessGenreAppropriateness,
  assessChannelBalance,
  needsProcessing,
  getStatusDescription,
  isSafeForLimiting,
  getAvailableGenres,
  getAudioStats
} = crestFactorAnalyzer;

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_FIXTURES_DIR = path.join(__dirname, 'fixtures');

// ============================================================================
// DynamicRangeStatus Constants Tests
// ============================================================================

describe('DynamicRangeStatus Constants', () => {
  test('should have all required status values', () => {
    expect(DynamicRangeStatus).toBeDefined();
    expect(DynamicRangeStatus.SEVERELY_LIMITED).toBe('SEVERELY_LIMITED');
    expect(DynamicRangeStatus.HEAVILY_COMPRESSED).toBe('HEAVILY_COMPRESSED');
    expect(DynamicRangeStatus.COMPRESSED).toBe('COMPRESSED');
    expect(DynamicRangeStatus.MODERATE).toBe('MODERATE');
    expect(DynamicRangeStatus.DYNAMIC).toBe('DYNAMIC');
    expect(DynamicRangeStatus.VERY_DYNAMIC).toBe('VERY_DYNAMIC');
  });

  test('should have exactly 6 status types', () => {
    expect(Object.keys(DynamicRangeStatus)).toHaveLength(6);
  });
});

// ============================================================================
// THRESHOLDS Constants Tests
// ============================================================================

describe('THRESHOLDS Constants', () => {
  test('should have all required threshold values', () => {
    expect(THRESHOLDS).toBeDefined();
    expect(THRESHOLDS.SEVERELY_LIMITED).toBe(4);
    expect(THRESHOLDS.HEAVILY_COMPRESSED).toBe(6);
    expect(THRESHOLDS.COMPRESSED).toBe(10);
    expect(THRESHOLDS.MODERATE).toBe(14);
    expect(THRESHOLDS.DYNAMIC).toBe(18);
  });

  test('should have thresholds in ascending order', () => {
    expect(THRESHOLDS.SEVERELY_LIMITED).toBeLessThan(THRESHOLDS.HEAVILY_COMPRESSED);
    expect(THRESHOLDS.HEAVILY_COMPRESSED).toBeLessThan(THRESHOLDS.COMPRESSED);
    expect(THRESHOLDS.COMPRESSED).toBeLessThan(THRESHOLDS.MODERATE);
    expect(THRESHOLDS.MODERATE).toBeLessThan(THRESHOLDS.DYNAMIC);
  });
});

// ============================================================================
// GENRE_TARGETS Constants Tests
// ============================================================================

describe('GENRE_TARGETS Constants', () => {
  test('should have common genres defined', () => {
    expect(GENRE_TARGETS).toBeDefined();
    expect(GENRE_TARGETS.EDM).toBeDefined();
    expect(GENRE_TARGETS.POP).toBeDefined();
    expect(GENRE_TARGETS.ROCK).toBeDefined();
    expect(GENRE_TARGETS.JAZZ).toBeDefined();
    expect(GENRE_TARGETS.CLASSICAL).toBeDefined();
    expect(GENRE_TARGETS.STREAMING).toBeDefined();
  });

  test('should have min, typical, max for each genre', () => {
    Object.keys(GENRE_TARGETS).forEach(genre => {
      expect(GENRE_TARGETS[genre].min).toBeDefined();
      expect(GENRE_TARGETS[genre].typical).toBeDefined();
      expect(GENRE_TARGETS[genre].max).toBeDefined();
      expect(GENRE_TARGETS[genre].min).toBeLessThan(GENRE_TARGETS[genre].typical);
      expect(GENRE_TARGETS[genre].typical).toBeLessThan(GENRE_TARGETS[genre].max);
    });
  });

  test('should have classical more dynamic than EDM', () => {
    expect(GENRE_TARGETS.CLASSICAL.typical).toBeGreaterThan(GENRE_TARGETS.EDM.typical);
  });
});

// ============================================================================
// LIMITER_RECOMMENDATIONS Constants Tests
// ============================================================================

describe('LIMITER_RECOMMENDATIONS Constants', () => {
  test('should have recommendations for all status types', () => {
    Object.values(DynamicRangeStatus).forEach(status => {
      expect(LIMITER_RECOMMENDATIONS[status]).toBeDefined();
    });
  });

  test('should have action and reason for each recommendation', () => {
    Object.values(LIMITER_RECOMMENDATIONS).forEach(rec => {
      expect(rec.action).toBeDefined();
      expect(typeof rec.reason).toBe('string');
    });
  });

  test('should recommend avoiding limiting for severely limited content', () => {
    const rec = LIMITER_RECOMMENDATIONS[DynamicRangeStatus.SEVERELY_LIMITED];
    expect(rec.action).toBe('avoid_limiting');
    expect(rec.maxGainReductionDb).toBe(0);
  });
});

// ============================================================================
// calculateCrestFactor Tests
// ============================================================================

describe('calculateCrestFactor', () => {
  test('should calculate crest factor from peak and RMS', () => {
    // Peak at -1dB, RMS at -14dB = 13dB crest factor
    expect(calculateCrestFactor(-1, -14)).toBe(13);
  });

  test('should return positive value for normal audio', () => {
    // Peak is always higher than RMS (less negative)
    expect(calculateCrestFactor(-3, -15)).toBe(12);
  });

  test('should handle equal peak and RMS (square wave)', () => {
    // Theoretical square wave has crest factor of 0dB
    expect(calculateCrestFactor(-6, -6)).toBe(0);
  });

  test('should handle heavily compressed audio', () => {
    // Peak at -0.5dB, RMS at -5dB = 4.5dB crest factor
    expect(calculateCrestFactor(-0.5, -5)).toBe(4.5);
  });

  test('should handle very dynamic audio', () => {
    // Peak at -10dB, RMS at -30dB = 20dB crest factor
    expect(calculateCrestFactor(-10, -30)).toBe(20);
  });

  test('should return null for null inputs', () => {
    expect(calculateCrestFactor(null, -10)).toBeNull();
    expect(calculateCrestFactor(-1, null)).toBeNull();
    expect(calculateCrestFactor(null, null)).toBeNull();
  });

  test('should handle infinite values gracefully', () => {
    expect(calculateCrestFactor(-Infinity, -10)).toBeNull();
    expect(calculateCrestFactor(-1, Infinity)).toBeNull();
  });
});

// ============================================================================
// calculatePerChannelCrestFactors Tests
// ============================================================================

describe('calculatePerChannelCrestFactors', () => {
  test('should calculate crest factors for stereo', () => {
    const peaks = [-1, -2];
    const rms = [-14, -15];
    const result = calculatePerChannelCrestFactors(peaks, rms);
    
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(13); // -1 - (-14)
    expect(result[1]).toBe(13); // -2 - (-15)
  });

  test('should handle mono', () => {
    const peaks = [-3];
    const rms = [-18];
    const result = calculatePerChannelCrestFactors(peaks, rms);
    
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(15);
  });

  test('should handle mismatched array lengths', () => {
    const peaks = [-1, -2, -3];
    const rms = [-14, -15]; // Only 2 channels
    const result = calculatePerChannelCrestFactors(peaks, rms);
    
    // Should use minimum length
    expect(result).toHaveLength(2);
  });

  test('should handle empty arrays', () => {
    expect(calculatePerChannelCrestFactors([], [])).toHaveLength(0);
  });
});

// ============================================================================
// classifyDynamicRange Tests
// ============================================================================

describe('classifyDynamicRange', () => {
  test('should classify < 4dB as SEVERELY_LIMITED', () => {
    expect(classifyDynamicRange(3)).toBe(DynamicRangeStatus.SEVERELY_LIMITED);
    expect(classifyDynamicRange(2)).toBe(DynamicRangeStatus.SEVERELY_LIMITED);
    expect(classifyDynamicRange(0)).toBe(DynamicRangeStatus.SEVERELY_LIMITED);
  });

  test('should classify 4-6dB as HEAVILY_COMPRESSED', () => {
    expect(classifyDynamicRange(4)).toBe(DynamicRangeStatus.HEAVILY_COMPRESSED);
    expect(classifyDynamicRange(5)).toBe(DynamicRangeStatus.HEAVILY_COMPRESSED);
    expect(classifyDynamicRange(5.9)).toBe(DynamicRangeStatus.HEAVILY_COMPRESSED);
  });

  test('should classify 6-10dB as COMPRESSED', () => {
    expect(classifyDynamicRange(6)).toBe(DynamicRangeStatus.COMPRESSED);
    expect(classifyDynamicRange(8)).toBe(DynamicRangeStatus.COMPRESSED);
    expect(classifyDynamicRange(9.9)).toBe(DynamicRangeStatus.COMPRESSED);
  });

  test('should classify 10-14dB as MODERATE', () => {
    expect(classifyDynamicRange(10)).toBe(DynamicRangeStatus.MODERATE);
    expect(classifyDynamicRange(12)).toBe(DynamicRangeStatus.MODERATE);
    expect(classifyDynamicRange(13.9)).toBe(DynamicRangeStatus.MODERATE);
  });

  test('should classify 14-18dB as DYNAMIC', () => {
    expect(classifyDynamicRange(14)).toBe(DynamicRangeStatus.DYNAMIC);
    expect(classifyDynamicRange(16)).toBe(DynamicRangeStatus.DYNAMIC);
    expect(classifyDynamicRange(17.9)).toBe(DynamicRangeStatus.DYNAMIC);
  });

  test('should classify > 18dB as VERY_DYNAMIC', () => {
    expect(classifyDynamicRange(18)).toBe(DynamicRangeStatus.VERY_DYNAMIC);
    expect(classifyDynamicRange(20)).toBe(DynamicRangeStatus.VERY_DYNAMIC);
    expect(classifyDynamicRange(25)).toBe(DynamicRangeStatus.VERY_DYNAMIC);
  });

  test('should default to MODERATE for null/undefined', () => {
    expect(classifyDynamicRange(null)).toBe(DynamicRangeStatus.MODERATE);
    expect(classifyDynamicRange(undefined)).toBe(DynamicRangeStatus.MODERATE);
  });
});

// ============================================================================
// getLimiterRecommendation Tests
// ============================================================================

describe('getLimiterRecommendation', () => {
  test('should return recommendation for each status', () => {
    Object.values(DynamicRangeStatus).forEach(status => {
      const rec = getLimiterRecommendation(status);
      expect(rec).toBeDefined();
      expect(rec.action).toBeDefined();
      expect(rec.reason).toBeDefined();
    });
  });

  test('should recommend avoiding limiting for severely limited', () => {
    const rec = getLimiterRecommendation(DynamicRangeStatus.SEVERELY_LIMITED);
    expect(rec.action).toBe('avoid_limiting');
  });

  test('should recommend standard limiting for moderate dynamics', () => {
    const rec = getLimiterRecommendation(DynamicRangeStatus.MODERATE);
    expect(rec.action).toBe('standard_limiting');
    expect(rec.attackMs).toBeDefined();
    expect(rec.releaseMs).toBeDefined();
  });

  test('should recommend multi-stage for very dynamic content', () => {
    const rec = getLimiterRecommendation(DynamicRangeStatus.VERY_DYNAMIC);
    expect(rec.action).toBe('multi_stage');
  });

  test('should return default for unknown status', () => {
    const rec = getLimiterRecommendation('UNKNOWN_STATUS');
    expect(rec).toBeDefined();
    expect(rec.action).toBeDefined();
  });
});

// ============================================================================
// assessGenreAppropriateness Tests
// ============================================================================

describe('assessGenreAppropriateness', () => {
  test('should assess EDM as too compressed when crest factor is low', () => {
    const result = assessGenreAppropriateness(5, 'EDM');
    expect(result.appropriate).toBe('too_compressed');
    expect(result.genre).toBe('EDM');
  });

  test('should assess EDM as acceptable with typical crest factor', () => {
    const result = assessGenreAppropriateness(8, 'EDM');
    expect(result.appropriate).toBe('ideal');
  });

  test('should assess classical as too dynamic when very compressed', () => {
    const result = assessGenreAppropriateness(10, 'CLASSICAL');
    expect(result.appropriate).toBe('too_compressed');
  });

  test('should assess classical as ideal with high crest factor', () => {
    const result = assessGenreAppropriateness(18, 'CLASSICAL');
    expect(result.appropriate).toBe('ideal');
  });

  test('should handle null crest factor', () => {
    const result = assessGenreAppropriateness(null, 'POP');
    expect(result.appropriate).toBeNull();
  });

  test('should include target information', () => {
    const result = assessGenreAppropriateness(12, 'JAZZ');
    expect(result.target).toBeDefined();
    expect(result.target.min).toBeDefined();
    expect(result.target.typical).toBeDefined();
    expect(result.target.max).toBeDefined();
  });

  test('should calculate suggested adjustment', () => {
    // Too compressed for jazz
    const result = assessGenreAppropriateness(10, 'JAZZ');
    expect(result.suggestedAdjustment).toBeGreaterThan(0);
  });
});

// ============================================================================
// assessChannelBalance Tests
// ============================================================================

describe('assessChannelBalance', () => {
  test('should detect balanced channels', () => {
    const result = assessChannelBalance([12, 12.5]);
    expect(result.balanced).toBe(true);
    expect(result.issue).toBeNull();
  });

  test('should detect minor imbalance', () => {
    const result = assessChannelBalance([12, 14]);
    expect(result.balanced).toBe(false);
    expect(result.issue).toBe('minor_imbalance');
  });

  test('should detect significant imbalance', () => {
    const result = assessChannelBalance([10, 16]);
    expect(result.balanced).toBe(false);
    expect(result.issue).toBe('significant_imbalance');
  });

  test('should handle mono (single channel)', () => {
    const result = assessChannelBalance([12]);
    expect(result.balanced).toBe(true);
    expect(result.differenceDb).toBe(0);
  });

  test('should handle null values in array', () => {
    const result = assessChannelBalance([12, null, 13]);
    expect(result).toBeDefined();
    expect(result.balanced).toBe(true);
  });

  test('should include per-channel data', () => {
    const input = [12, 13, 12.5];
    const result = assessChannelBalance(input);
    expect(result.perChannel).toEqual(input);
  });
});

// ============================================================================
// needsProcessing Tests
// ============================================================================

describe('needsProcessing', () => {
  test('should recommend expansion for over-compressed content', () => {
    const result = needsProcessing(5, 'STREAMING');
    expect(result.needs).toBe('expansion');
    expect(result.suggestedProcessing).toBeDefined();
  });

  test('should recommend compression for very dynamic content', () => {
    const result = needsProcessing(20, 'STREAMING');
    expect(result.needs).toBe('compression');
    expect(result.suggestedProcessing).toBeDefined();
  });

  test('should not recommend processing for appropriate content', () => {
    const result = needsProcessing(12, 'STREAMING');
    expect(result.needs).toBe(false);
    expect(result.suggestedProcessing).toBeNull();
  });

  test('should handle null crest factor', () => {
    const result = needsProcessing(null, 'STREAMING');
    expect(result.needs).toBeNull();
  });

  test('should include target crest factor', () => {
    const result = needsProcessing(10, 'MASTERING');
    expect(result.targetCrestFactor).toBeDefined();
  });

  test('should calculate adjustment needed', () => {
    const result = needsProcessing(5, 'STREAMING');
    expect(result.adjustmentNeeded).toBeGreaterThan(0);
  });
});

// ============================================================================
// getStatusDescription Tests
// ============================================================================

describe('getStatusDescription', () => {
  test('should return description for each status', () => {
    Object.values(DynamicRangeStatus).forEach(status => {
      const desc = getStatusDescription(status);
      expect(typeof desc).toBe('string');
      expect(desc.length).toBeGreaterThan(0);
    });
  });

  test('should mention dB ranges in descriptions', () => {
    expect(getStatusDescription(DynamicRangeStatus.SEVERELY_LIMITED)).toMatch(/<4 dB/);
    expect(getStatusDescription(DynamicRangeStatus.MODERATE)).toMatch(/10-14 dB/);
  });

  test('should return unknown for invalid status', () => {
    const desc = getStatusDescription('INVALID');
    expect(desc.toLowerCase()).toMatch(/unknown/);
  });
});

// ============================================================================
// isSafeForLimiting Tests
// ============================================================================

describe('isSafeForLimiting', () => {
  test('should return false for SEVERELY_LIMITED', () => {
    expect(isSafeForLimiting(DynamicRangeStatus.SEVERELY_LIMITED)).toBe(false);
  });

  test('should return false for HEAVILY_COMPRESSED', () => {
    expect(isSafeForLimiting(DynamicRangeStatus.HEAVILY_COMPRESSED)).toBe(false);
  });

  test('should return true for COMPRESSED', () => {
    expect(isSafeForLimiting(DynamicRangeStatus.COMPRESSED)).toBe(true);
  });

  test('should return true for MODERATE', () => {
    expect(isSafeForLimiting(DynamicRangeStatus.MODERATE)).toBe(true);
  });

  test('should return true for DYNAMIC', () => {
    expect(isSafeForLimiting(DynamicRangeStatus.DYNAMIC)).toBe(true);
  });

  test('should return true for VERY_DYNAMIC', () => {
    expect(isSafeForLimiting(DynamicRangeStatus.VERY_DYNAMIC)).toBe(true);
  });
});

// ============================================================================
// getAvailableGenres Tests
// ============================================================================

describe('getAvailableGenres', () => {
  test('should return array of genre names', () => {
    const genres = getAvailableGenres();
    expect(Array.isArray(genres)).toBe(true);
    expect(genres.length).toBeGreaterThan(0);
  });

  test('should include common genres', () => {
    const genres = getAvailableGenres();
    expect(genres).toContain('EDM');
    expect(genres).toContain('POP');
    expect(genres).toContain('ROCK');
    expect(genres).toContain('JAZZ');
    expect(genres).toContain('CLASSICAL');
  });

  test('should include streaming and mastering targets', () => {
    const genres = getAvailableGenres();
    expect(genres).toContain('STREAMING');
    expect(genres).toContain('MASTERING');
  });
});

// ============================================================================
// Module Exports Tests
// ============================================================================

describe('Module Exports', () => {
  test('should export all required constants', () => {
    expect(crestFactorAnalyzer.DynamicRangeStatus).toBeDefined();
    expect(crestFactorAnalyzer.THRESHOLDS).toBeDefined();
    expect(crestFactorAnalyzer.GENRE_TARGETS).toBeDefined();
    expect(crestFactorAnalyzer.LIMITER_RECOMMENDATIONS).toBeDefined();
  });

  test('should export main functions', () => {
    expect(typeof crestFactorAnalyzer.analyzeCrestFactor).toBe('function');
    expect(typeof crestFactorAnalyzer.quickCheck).toBe('function');
  });

  test('should export core calculation functions', () => {
    expect(typeof crestFactorAnalyzer.calculateCrestFactor).toBe('function');
    expect(typeof crestFactorAnalyzer.calculatePerChannelCrestFactors).toBe('function');
    expect(typeof crestFactorAnalyzer.classifyDynamicRange).toBe('function');
  });

  test('should export recommendation functions', () => {
    expect(typeof crestFactorAnalyzer.getLimiterRecommendation).toBe('function');
    expect(typeof crestFactorAnalyzer.assessGenreAppropriateness).toBe('function');
    expect(typeof crestFactorAnalyzer.assessChannelBalance).toBe('function');
    expect(typeof crestFactorAnalyzer.needsProcessing).toBe('function');
  });

  test('should export utility functions', () => {
    expect(typeof crestFactorAnalyzer.getStatusDescription).toBe('function');
    expect(typeof crestFactorAnalyzer.isSafeForLimiting).toBe('function');
    expect(typeof crestFactorAnalyzer.getAvailableGenres).toBe('function');
    expect(typeof crestFactorAnalyzer.getAudioStats).toBe('function');
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Error Handling', () => {
  test('getAudioStats should handle non-existent file gracefully', async () => {
    const result = await getAudioStats('/nonexistent/file.wav');
    expect(result).toBeDefined();
    expect(result.peakDb).toBeNull();
    expect(result.rmsDb).toBeNull();
    expect(result.error).toBeDefined();
  });

  test('quickCheck should handle non-existent file gracefully', async () => {
    const result = await quickCheck('/nonexistent/file.wav');
    expect(result).toBeDefined();
    expect(result.crestFactorDb).toBeNull();
  });

  test('analyzeCrestFactor should handle non-existent file gracefully', async () => {
    const result = await analyzeCrestFactor('/nonexistent/file.wav');
    expect(result).toBeDefined();
    expect(result.crestFactorDb).toBeNull();
    expect(result.status).toBe(DynamicRangeStatus.MODERATE); // Default
  });
});

// ============================================================================
// Integration Tests (require fixture files)
// ============================================================================

describe('Integration Tests', () => {
  let fixturesExist = false;
  let testFile = null;

  beforeAll(async () => {
    try {
      await fs.access(TEST_FIXTURES_DIR);
      const files = await fs.readdir(TEST_FIXTURES_DIR);
      const wavFiles = files.filter(f => f.endsWith('.wav'));
      if (wavFiles.length > 0) {
        testFile = path.join(TEST_FIXTURES_DIR, wavFiles[0]);
        fixturesExist = true;
      }
    } catch {
      // No fixtures directory
    }
  });

  test('analyzeCrestFactor should return complete analysis object', async () => {
    if (!fixturesExist) {
      console.log('Skipping: no fixture files available');
      return;
    }

    const result = await analyzeCrestFactor(testFile);
    
    expect(result).toBeDefined();
    expect(result.filePath).toBe(testFile);
    expect(result.crestFactorDb).toBeDefined();
    expect(result.status).toBeDefined();
    expect(Object.values(DynamicRangeStatus)).toContain(result.status);
    expect(result.limiterRecommendation).toBeDefined();
    expect(result.analysisTimeMs).toBeDefined();
  }, 15000);

  test('quickCheck should return simplified result', async () => {
    if (!fixturesExist) {
      console.log('Skipping: no fixture files available');
      return;
    }

    const result = await quickCheck(testFile);
    
    expect(result).toBeDefined();
    expect(result.crestFactorDb).toBeDefined();
    expect(result.status).toBeDefined();
    expect(result.limiterAction).toBeDefined();
  }, 10000);

  test('analyzeCrestFactor should include per-channel data', async () => {
    if (!fixturesExist) {
      console.log('Skipping: no fixture files available');
      return;
    }

    const result = await analyzeCrestFactor(testFile);
    
    expect(result.perChannel).toBeDefined();
    expect(result.perChannel.crestFactors).toBeDefined();
    expect(result.perChannel.peaks).toBeDefined();
    expect(result.perChannel.rms).toBeDefined();
  }, 15000);

  test('analyzeCrestFactor with genre should include genre assessment', async () => {
    if (!fixturesExist) {
      console.log('Skipping: no fixture files available');
      return;
    }

    const result = await analyzeCrestFactor(testFile, { genre: 'POP' });
    
    expect(result.genreAssessment).toBeDefined();
    expect(result.genreAssessment.genre).toBe('POP');
    expect(result.genreAssessment.appropriate).toBeDefined();
  }, 15000);
});

// ============================================================================
// Consistency Tests
// ============================================================================

describe('Consistency Tests', () => {
  test('classifyDynamicRange and getLimiterRecommendation should be consistent', () => {
    const crestFactors = [2, 5, 8, 12, 16, 20];
    
    crestFactors.forEach(cf => {
      const status = classifyDynamicRange(cf);
      const rec = getLimiterRecommendation(status);
      expect(rec).toBeDefined();
      expect(rec.action).toBeDefined();
    });
  });

  test('isSafeForLimiting should match limiter recommendations', () => {
    // SEVERELY_LIMITED and HEAVILY_COMPRESSED should not be safe
    expect(isSafeForLimiting(DynamicRangeStatus.SEVERELY_LIMITED)).toBe(false);
    expect(LIMITER_RECOMMENDATIONS[DynamicRangeStatus.SEVERELY_LIMITED].action).toBe('avoid_limiting');
    
    expect(isSafeForLimiting(DynamicRangeStatus.HEAVILY_COMPRESSED)).toBe(false);
    expect(LIMITER_RECOMMENDATIONS[DynamicRangeStatus.HEAVILY_COMPRESSED].action).toBe('minimal_limiting');
  });

  test('genre targets should be consistent with thresholds', () => {
    // EDM typical should be in compressed range
    expect(GENRE_TARGETS.EDM.typical).toBeLessThan(THRESHOLDS.MODERATE);
    
    // Classical typical should be in dynamic range
    expect(GENRE_TARGETS.CLASSICAL.typical).toBeGreaterThan(THRESHOLDS.MODERATE);
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe('Edge Cases', () => {
  test('calculateCrestFactor should handle boundary values', () => {
    expect(calculateCrestFactor(0, -10)).toBe(10);
    expect(calculateCrestFactor(-0.1, -0.1)).toBe(0);
  });

  test('classifyDynamicRange should handle exact threshold values', () => {
    expect(classifyDynamicRange(4)).toBe(DynamicRangeStatus.HEAVILY_COMPRESSED);
    expect(classifyDynamicRange(6)).toBe(DynamicRangeStatus.COMPRESSED);
    expect(classifyDynamicRange(10)).toBe(DynamicRangeStatus.MODERATE);
    expect(classifyDynamicRange(14)).toBe(DynamicRangeStatus.DYNAMIC);
    expect(classifyDynamicRange(18)).toBe(DynamicRangeStatus.VERY_DYNAMIC);
  });

  test('assessGenreAppropriateness should handle case-insensitive genre', () => {
    const result1 = assessGenreAppropriateness(10, 'pop');
    const result2 = assessGenreAppropriateness(10, 'POP');
    const result3 = assessGenreAppropriateness(10, 'Pop');
    
    expect(result1.target).toEqual(result2.target);
    expect(result2.target).toEqual(result3.target);
  });

  test('needsProcessing should handle unknown target use', () => {
    const result = needsProcessing(12, 'UNKNOWN_FORMAT');
    // Should fall back to STREAMING
    expect(result).toBeDefined();
    expect(result.targetCrestFactor).toBe(GENRE_TARGETS.STREAMING.typical);
  });
});
