/**
 * Headroom Estimator Tests
 * 
 * Tests for pre-transform headroom margin calculation functionality
 */

const path = require('path');
const fs = require('fs').promises;
const os = require('os');

// Import the headroom estimator module
const headroomEstimator = require('../services/headroomEstimator');

const {
  HeadroomStatus,
  THRESHOLDS,
  TARGETS,
  estimateHeadroom,
  quickCheck,
  canApplyGain,
  classifyHeadroom,
  calculateHeadroom,
  calculateMaxGain,
  calculateCrestFactor,
  getRecommendation,
  getStatusDescription,
  isSufficientForProcessing,
  getSamplePeak,
  getTruePeak,
  getRmsLevel
} = headroomEstimator;

// ============================================================================
// Test Fixtures and Helpers
// ============================================================================

const TEST_FIXTURES_DIR = path.join(__dirname, 'fixtures');

/**
 * Create a temporary test file
 */
async function createTempFile(content = '') {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'headroom-test-'));
  const tempFile = path.join(tempDir, 'test.wav');
  if (content) {
    await fs.writeFile(tempFile, content);
  }
  return { tempDir, tempFile };
}

/**
 * Clean up temporary files
 */
async function cleanupTempDir(tempDir) {
  try {
    const files = await fs.readdir(tempDir);
    for (const file of files) {
      await fs.unlink(path.join(tempDir, file));
    }
    await fs.rmdir(tempDir);
  } catch (err) {
    // Ignore cleanup errors
  }
}

// ============================================================================
// HeadroomStatus Constants Tests
// ============================================================================

describe('HeadroomStatus Constants', () => {
  test('should have all required status values', () => {
    expect(HeadroomStatus).toBeDefined();
    expect(HeadroomStatus.CLIPPED).toBe('CLIPPED');
    expect(HeadroomStatus.CRITICAL).toBe('CRITICAL');
    expect(HeadroomStatus.LIMITED).toBe('LIMITED');
    expect(HeadroomStatus.ADEQUATE).toBe('ADEQUATE');
    expect(HeadroomStatus.GENEROUS).toBe('GENEROUS');
    expect(HeadroomStatus.EXCESSIVE).toBe('EXCESSIVE');
  });

  test('should have exactly 6 status types', () => {
    expect(Object.keys(HeadroomStatus)).toHaveLength(6);
  });
});

// ============================================================================
// THRESHOLDS Constants Tests
// ============================================================================

describe('THRESHOLDS Constants', () => {
  test('should have all required threshold values', () => {
    expect(THRESHOLDS).toBeDefined();
    expect(THRESHOLDS.CLIPPED).toBe(0);
    expect(THRESHOLDS.CRITICAL).toBe(0.5);
    expect(THRESHOLDS.LIMITED).toBe(3);
    expect(THRESHOLDS.ADEQUATE).toBe(6);
    expect(THRESHOLDS.GENEROUS).toBe(12);
  });

  test('should have thresholds in ascending order', () => {
    expect(THRESHOLDS.CLIPPED).toBeLessThan(THRESHOLDS.CRITICAL);
    expect(THRESHOLDS.CRITICAL).toBeLessThan(THRESHOLDS.LIMITED);
    expect(THRESHOLDS.LIMITED).toBeLessThan(THRESHOLDS.ADEQUATE);
    expect(THRESHOLDS.ADEQUATE).toBeLessThan(THRESHOLDS.GENEROUS);
  });
});

// ============================================================================
// TARGETS Constants Tests
// ============================================================================

describe('TARGETS Constants', () => {
  test('should have all required target values', () => {
    expect(TARGETS).toBeDefined();
    expect(TARGETS.STREAMING).toBeDefined();
    expect(TARGETS.BROADCAST).toBeDefined();
    expect(TARGETS.MASTERING).toBeDefined();
    expect(TARGETS.MIXING).toBeDefined();
  });

  test('should have reasonable dBTP target values', () => {
    // Streaming platforms typically require -1dBTP
    expect(TARGETS.STREAMING).toBe(-1);
    // Broadcast typically requires -2dBTP (EBU R128)
    expect(TARGETS.BROADCAST).toBe(-2);
    // Mastering typically targets -1dBTP
    expect(TARGETS.MASTERING).toBe(-1);
    // Mixing allows more headroom at -6dB
    expect(TARGETS.MIXING).toBe(-6);
  });
});

// ============================================================================
// classifyHeadroom Tests
// Note: headroom is POSITIVE when below 0dBFS (3dB headroom = peak at -3dB)
// ============================================================================

describe('classifyHeadroom', () => {
  test('should classify 0dB or negative headroom as CLIPPED', () => {
    expect(classifyHeadroom(0)).toBe(HeadroomStatus.CLIPPED);
    expect(classifyHeadroom(-1)).toBe(HeadroomStatus.CLIPPED);
    expect(classifyHeadroom(-3)).toBe(HeadroomStatus.CLIPPED);
  });

  test('should classify 0-0.5dB headroom as CRITICAL', () => {
    expect(classifyHeadroom(0.1)).toBe(HeadroomStatus.CRITICAL);
    expect(classifyHeadroom(0.3)).toBe(HeadroomStatus.CRITICAL);
    expect(classifyHeadroom(0.49)).toBe(HeadroomStatus.CRITICAL);
  });

  test('should classify 0.5-3dB headroom as LIMITED', () => {
    expect(classifyHeadroom(0.5)).toBe(HeadroomStatus.LIMITED);
    expect(classifyHeadroom(1.5)).toBe(HeadroomStatus.LIMITED);
    expect(classifyHeadroom(2.9)).toBe(HeadroomStatus.LIMITED);
  });

  test('should classify 3-6dB headroom as ADEQUATE', () => {
    expect(classifyHeadroom(3)).toBe(HeadroomStatus.ADEQUATE);
    expect(classifyHeadroom(4.5)).toBe(HeadroomStatus.ADEQUATE);
    expect(classifyHeadroom(5.9)).toBe(HeadroomStatus.ADEQUATE);
  });

  test('should classify 6-12dB headroom as GENEROUS', () => {
    expect(classifyHeadroom(6)).toBe(HeadroomStatus.GENEROUS);
    expect(classifyHeadroom(9.0)).toBe(HeadroomStatus.GENEROUS);
    expect(classifyHeadroom(11.9)).toBe(HeadroomStatus.GENEROUS);
  });

  test('should classify more than 12dB headroom as EXCESSIVE', () => {
    expect(classifyHeadroom(12)).toBe(HeadroomStatus.EXCESSIVE);
    expect(classifyHeadroom(18.0)).toBe(HeadroomStatus.EXCESSIVE);
    expect(classifyHeadroom(30.0)).toBe(HeadroomStatus.EXCESSIVE);
  });

  test('should handle edge cases', () => {
    expect(classifyHeadroom(Infinity)).toBe(HeadroomStatus.EXCESSIVE);
    expect(classifyHeadroom(-Infinity)).toBe(HeadroomStatus.CLIPPED);
  });

  test('should default to ADEQUATE for null/undefined', () => {
    expect(classifyHeadroom(null)).toBe(HeadroomStatus.ADEQUATE);
    expect(classifyHeadroom(undefined)).toBe(HeadroomStatus.ADEQUATE);
  });
});

// ============================================================================
// calculateHeadroom Tests
// Note: headroom = -peakDb (peak at -3dB = 3dB headroom)
// ============================================================================

describe('calculateHeadroom', () => {
  test('should calculate headroom from peak level', () => {
    // Peak at -3dB means 3dB of headroom
    expect(calculateHeadroom(-3)).toBe(3);
  });

  test('should return 0 for peaks at 0dBFS', () => {
    // Note: -0 and 0 are equivalent in JavaScript arithmetic
    expect(calculateHeadroom(0) === 0).toBe(true);
    expect(calculateHeadroom(0) + 1).toBe(1);
  });

  test('should return negative for clipped signals (peak above 0dBFS)', () => {
    expect(calculateHeadroom(1)).toBe(-1);
    expect(calculateHeadroom(3)).toBe(-3);
  });

  test('should handle typical mastering levels', () => {
    expect(calculateHeadroom(-0.5)).toBe(0.5);
    expect(calculateHeadroom(-1.0)).toBe(1.0);
    expect(calculateHeadroom(-6.0)).toBe(6.0);
  });

  test('should handle very quiet signals', () => {
    expect(calculateHeadroom(-40)).toBe(40);
    expect(calculateHeadroom(-60)).toBe(60);
  });
});

// ============================================================================
// calculateCrestFactor Tests
// ============================================================================

describe('calculateCrestFactor', () => {
  test('should calculate crest factor from peak and RMS', () => {
    // Peak at 0dB, RMS at -12dB = 12dB crest factor
    expect(calculateCrestFactor(0, -12)).toBe(12);
  });

  test('should handle typical values', () => {
    // Peak at -1dB, RMS at -14dB = 13dB crest factor
    expect(calculateCrestFactor(-1, -14)).toBe(13);
  });

  test('should handle compressed audio (low crest factor)', () => {
    // Peak at -0.5dB, RMS at -6dB = 5.5dB crest factor (heavily compressed)
    expect(calculateCrestFactor(-0.5, -6)).toBe(5.5);
  });

  test('should handle dynamic audio (high crest factor)', () => {
    // Peak at -6dB, RMS at -24dB = 18dB crest factor (very dynamic)
    expect(calculateCrestFactor(-6, -24)).toBe(18);
  });

  test('should return 0 when peak equals RMS', () => {
    expect(calculateCrestFactor(-6, -6)).toBe(0);
  });

  test('should handle negative crest factor (impossible in reality)', () => {
    // RMS higher than peak (shouldn't happen in real audio)
    expect(calculateCrestFactor(-12, -6)).toBe(-6);
  });
});

// ============================================================================
// getRecommendation Tests
// Note: getRecommendation takes an analysis object with status, headroomDb, etc.
// ============================================================================

describe('getRecommendation', () => {
  test('should provide recommendation for CLIPPED status', () => {
    const analysis = { status: HeadroomStatus.CLIPPED, headroomDb: -1 };
    const recommendation = getRecommendation(analysis);
    expect(typeof recommendation).toBe('string');
    expect(recommendation.length).toBeGreaterThan(0);
    expect(recommendation.toLowerCase()).toMatch(/clip/);
  });

  test('should provide recommendation for CRITICAL status', () => {
    const analysis = { status: HeadroomStatus.CRITICAL, headroomDb: 0.3 };
    const recommendation = getRecommendation(analysis);
    expect(typeof recommendation).toBe('string');
    expect(recommendation).toMatch(/0\.3/);
  });

  test('should provide recommendation for LIMITED status', () => {
    const analysis = { status: HeadroomStatus.LIMITED, headroomDb: 2 };
    const recommendation = getRecommendation(analysis);
    expect(typeof recommendation).toBe('string');
    expect(recommendation.toLowerCase()).toMatch(/limited/i);
  });

  test('should provide recommendation for ADEQUATE status', () => {
    const analysis = { status: HeadroomStatus.ADEQUATE, headroomDb: 5 };
    const recommendation = getRecommendation(analysis);
    expect(typeof recommendation).toBe('string');
    expect(recommendation.toLowerCase()).toMatch(/adequate|safe/i);
  });

  test('should provide recommendation for GENEROUS status', () => {
    const analysis = { status: HeadroomStatus.GENEROUS, headroomDb: 10, maxGainForStreaming: 9 };
    const recommendation = getRecommendation(analysis);
    expect(typeof recommendation).toBe('string');
    expect(recommendation.toLowerCase()).toMatch(/generous/i);
  });

  test('should provide recommendation for EXCESSIVE status', () => {
    const analysis = { status: HeadroomStatus.EXCESSIVE, headroomDb: 20 };
    const recommendation = getRecommendation(analysis);
    expect(typeof recommendation).toBe('string');
    expect(recommendation.toLowerCase()).toMatch(/excessive|quiet/i);
  });

  test('should handle unknown status', () => {
    const analysis = { status: 'UNKNOWN', headroomDb: 5 };
    const recommendation = getRecommendation(analysis);
    expect(typeof recommendation).toBe('string');
    expect(recommendation.toLowerCase()).toMatch(/unable|unknown/i);
  });
});

// ============================================================================
// getStatusDescription Tests
// ============================================================================

describe('getStatusDescription', () => {
  test('should return description for CLIPPED status', () => {
    const desc = getStatusDescription(HeadroomStatus.CLIPPED);
    expect(typeof desc).toBe('string');
    expect(desc.toLowerCase()).toMatch(/clip/);
  });

  test('should return description for CRITICAL status', () => {
    const desc = getStatusDescription(HeadroomStatus.CRITICAL);
    expect(typeof desc).toBe('string');
    expect(desc.toLowerCase()).toMatch(/critical|0\.5/);
  });

  test('should return description for LIMITED status', () => {
    const desc = getStatusDescription(HeadroomStatus.LIMITED);
    expect(typeof desc).toBe('string');
    expect(desc.toLowerCase()).toMatch(/limited/);
  });

  test('should return description for ADEQUATE status', () => {
    const desc = getStatusDescription(HeadroomStatus.ADEQUATE);
    expect(typeof desc).toBe('string');
    expect(desc.toLowerCase()).toMatch(/adequate/);
  });

  test('should return description for GENEROUS status', () => {
    const desc = getStatusDescription(HeadroomStatus.GENEROUS);
    expect(typeof desc).toBe('string');
    expect(desc.toLowerCase()).toMatch(/generous/);
  });

  test('should return description for EXCESSIVE status', () => {
    const desc = getStatusDescription(HeadroomStatus.EXCESSIVE);
    expect(typeof desc).toBe('string');
    expect(desc.toLowerCase()).toMatch(/excessive|quiet/);
  });

  test('should return unknown for invalid status', () => {
    const desc = getStatusDescription('INVALID');
    expect(typeof desc).toBe('string');
    expect(desc.toLowerCase()).toMatch(/unknown/);
  });
});

// ============================================================================
// isSufficientForProcessing Tests
// ============================================================================

describe('isSufficientForProcessing', () => {
  test('should return false for CLIPPED status', () => {
    expect(isSufficientForProcessing(HeadroomStatus.CLIPPED)).toBe(false);
  });

  test('should return false for CRITICAL status', () => {
    expect(isSufficientForProcessing(HeadroomStatus.CRITICAL)).toBe(false);
  });

  test('should return true for LIMITED status', () => {
    expect(isSufficientForProcessing(HeadroomStatus.LIMITED)).toBe(true);
  });

  test('should return true for ADEQUATE status', () => {
    expect(isSufficientForProcessing(HeadroomStatus.ADEQUATE)).toBe(true);
  });

  test('should return true for GENEROUS status', () => {
    expect(isSufficientForProcessing(HeadroomStatus.GENEROUS)).toBe(true);
  });

  test('should return true for EXCESSIVE status', () => {
    expect(isSufficientForProcessing(HeadroomStatus.EXCESSIVE)).toBe(true);
  });
});

// ============================================================================
// canApplyGain Tests (requires fixture files - async function)
// ============================================================================

describe('canApplyGain', () => {
  // canApplyGain is async and requires file path - skip if no fixtures
  test('should be a function', () => {
    expect(typeof canApplyGain).toBe('function');
  });

  test('should handle non-existent file gracefully', async () => {
    const result = await canApplyGain('/nonexistent/file.wav', 3);
    expect(result).toBeDefined();
    // Should return result with null peaks and canApply: false
    expect(result.canApply).toBe(false);
    expect(result.currentPeakDb).toBeNull();
  });
});

// ============================================================================
// calculateMaxGain Tests
// Note: calculateMaxGain(truePeakDb, targetCeiling) = targetCeiling - truePeakDb
// ============================================================================

describe('calculateMaxGain', () => {
  test('should calculate max gain for streaming target (-1dB ceiling)', () => {
    // Peak at -6dB, ceiling -1dB: max gain = -1 - (-6) = 5dB
    expect(calculateMaxGain(-6, -1)).toBe(5);
  });

  test('should calculate max gain for broadcast target (-2dB ceiling)', () => {
    // Peak at -6dB, ceiling -2dB: max gain = -2 - (-6) = 4dB
    expect(calculateMaxGain(-6, -2)).toBe(4);
  });

  test('should use streaming target by default', () => {
    // Peak at -6dB, default ceiling -1dB: max gain = 5dB
    expect(calculateMaxGain(-6)).toBe(5);
  });

  test('should return negative when peak exceeds ceiling', () => {
    // Peak at 0dB, ceiling -1dB: needs -1dB attenuation
    expect(calculateMaxGain(0, -1)).toBe(-1);
  });

  test('should return 0 when peak equals ceiling', () => {
    expect(calculateMaxGain(-1, -1)).toBe(0);
  });

  test('should handle null input', () => {
    expect(calculateMaxGain(null)).toBe(null);
    expect(calculateMaxGain(undefined)).toBe(null);
  });

  test('should handle very quiet signals', () => {
    // Peak at -40dB, ceiling -1dB: max gain = 39dB
    expect(calculateMaxGain(-40, -1)).toBe(39);
  });
});

// ============================================================================
// Module Export Tests
// ============================================================================

describe('Module Exports', () => {
  test('should export all required constants', () => {
    expect(headroomEstimator.HeadroomStatus).toBeDefined();
    expect(headroomEstimator.THRESHOLDS).toBeDefined();
    expect(headroomEstimator.TARGETS).toBeDefined();
  });

  test('should export all main functions', () => {
    expect(typeof headroomEstimator.estimateHeadroom).toBe('function');
    expect(typeof headroomEstimator.quickCheck).toBe('function');
    expect(typeof headroomEstimator.canApplyGain).toBe('function');
  });

  test('should export analysis component functions', () => {
    expect(typeof headroomEstimator.getSamplePeak).toBe('function');
    expect(typeof headroomEstimator.getTruePeak).toBe('function');
    expect(typeof headroomEstimator.getRmsLevel).toBe('function');
  });

  test('should export calculation helper functions', () => {
    expect(typeof headroomEstimator.calculateHeadroom).toBe('function');
    expect(typeof headroomEstimator.calculateMaxGain).toBe('function');
    expect(typeof headroomEstimator.calculateCrestFactor).toBe('function');
    expect(typeof headroomEstimator.classifyHeadroom).toBe('function');
  });

  test('should export utility functions', () => {
    expect(typeof headroomEstimator.getRecommendation).toBe('function');
    expect(typeof headroomEstimator.getStatusDescription).toBe('function');
    expect(typeof headroomEstimator.isSufficientForProcessing).toBe('function');
  });
});

// ============================================================================
// Error Handling Tests
// Note: The implementation returns results with null values rather than throwing
// ============================================================================

describe('Error Handling', () => {
  test('estimateHeadroom should handle non-existent file gracefully', async () => {
    const result = await estimateHeadroom('/nonexistent/file.wav');
    expect(result).toBeDefined();
    // Should return null peak values
    expect(result.samplePeakDb).toBeNull();
  });

  test('quickCheck should handle non-existent file gracefully', async () => {
    const result = await quickCheck('/nonexistent/file.wav');
    expect(result).toBeDefined();
    expect(result.headroomDb).toBeNull();
  });

  test('canApplyGain should handle non-existent file gracefully', async () => {
    const result = await canApplyGain('/nonexistent/file.wav', 3);
    expect(result).toBeDefined();
    expect(result.canApply).toBe(false);
    expect(result.currentPeakDb).toBeNull();
  });

  test('getSamplePeak should reject non-existent file', async () => {
    const result = await getSamplePeak('/nonexistent/file.wav');
    expect(result.peakDb).toBeNull();
  });

  test('getTruePeak should reject non-existent file', async () => {
    const result = await getTruePeak('/nonexistent/file.wav');
    expect(result.truePeakDb).toBeNull();
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

  test('estimateHeadroom should return complete analysis object', async () => {
    if (!fixturesExist) {
      console.log('Skipping: no fixture files available');
      return;
    }

    const result = await estimateHeadroom(testFile);
    
    expect(result).toBeDefined();
    expect(result.filePath).toBe(testFile);
    expect(result.status).toBeDefined();
    expect(Object.values(HeadroomStatus)).toContain(result.status);
    expect(typeof result.headroomDb).toBe('number');
    expect(typeof result.peakDb).toBe('number');
    expect(result.recommendation).toBeDefined();
    expect(result.recommendation.action).toBeDefined();
    expect(typeof result.recommendation.safeForProcessing).toBe('boolean');
  }, 15000);

  test('quickCheck should return simplified result', async () => {
    if (!fixturesExist) {
      console.log('Skipping: no fixture files available');
      return;
    }

    const result = await quickCheck(testFile);
    
    expect(result).toBeDefined();
    expect(result.status).toBeDefined();
    expect(Object.values(HeadroomStatus)).toContain(result.status);
    expect(typeof result.headroomDb).toBe('number');
    expect(typeof result.safeForProcessing).toBe('boolean');
  }, 10000);

  test('estimateHeadroom should include true peak when available', async () => {
    if (!fixturesExist) {
      console.log('Skipping: no fixture files available');
      return;
    }

    const result = await estimateHeadroom(testFile, { includeTruePeak: true });
    
    expect(result).toBeDefined();
    // True peak analysis might not always be available, but should have peak info
    expect(typeof result.peakDb).toBe('number');
  }, 20000);

  test('estimateHeadroom should include RMS and crest factor', async () => {
    if (!fixturesExist) {
      console.log('Skipping: no fixture files available');
      return;
    }

    const result = await estimateHeadroom(testFile);
    
    expect(result).toBeDefined();
    if (result.rmsDb !== undefined) {
      expect(typeof result.rmsDb).toBe('number');
    }
    if (result.crestFactorDb !== undefined) {
      expect(typeof result.crestFactorDb).toBe('number');
      expect(result.crestFactorDb).toBeGreaterThanOrEqual(0);
    }
  }, 15000);

  test('estimateHeadroom should respect target parameter', async () => {
    if (!fixturesExist) {
      console.log('Skipping: no fixture files available');
      return;
    }

    const resultStreaming = await estimateHeadroom(testFile, { target: 'STREAMING' });
    const resultMixing = await estimateHeadroom(testFile, { target: 'MIXING' });
    
    expect(resultStreaming).toBeDefined();
    expect(resultMixing).toBeDefined();
    // Different targets may result in different recommendations
    expect(resultStreaming.target).toBe('STREAMING');
    expect(resultMixing.target).toBe('MIXING');
  }, 20000);
});

// ============================================================================
// Edge Cases Tests
// Note: headroom is POSITIVE (3dB headroom = peak at -3dB)
// ============================================================================

describe('Edge Cases', () => {
  test('classifyHeadroom should handle boundary values precisely', () => {
    // Just below CRITICAL threshold (toward LIMITED)
    expect(classifyHeadroom(0.5)).toBe(HeadroomStatus.LIMITED);
    // Just above CRITICAL threshold (toward 0)
    expect(classifyHeadroom(0.49)).toBe(HeadroomStatus.CRITICAL);
    // At LIMITED threshold
    expect(classifyHeadroom(3)).toBe(HeadroomStatus.ADEQUATE);
  });

  test('should handle very small headroom values as CRITICAL', () => {
    expect(classifyHeadroom(0.001)).toBe(HeadroomStatus.CRITICAL);
    expect(classifyHeadroom(0.01)).toBe(HeadroomStatus.CRITICAL);
    expect(classifyHeadroom(0.1)).toBe(HeadroomStatus.CRITICAL);
  });

  test('calculateMaxGain should handle edge cases', () => {
    // Peak exactly at ceiling
    expect(calculateMaxGain(-1, -1)).toBe(0);
    // Very small gain needed
    expect(calculateMaxGain(-1.001, -1)).toBeCloseTo(0.001, 3);
  });

  test('calculateCrestFactor should handle extreme values', () => {
    // Very high crest factor (extremely dynamic)
    expect(calculateCrestFactor(-6, -60)).toBe(54);
    // Very low crest factor (heavily limited)
    expect(calculateCrestFactor(-0.1, -3)).toBeCloseTo(2.9, 1);
  });
  
  test('calculateCrestFactor should handle null inputs', () => {
    expect(calculateCrestFactor(null, -10)).toBeNull();
    expect(calculateCrestFactor(-6, null)).toBeNull();
    expect(calculateCrestFactor(null, null)).toBeNull();
  });
});

// ============================================================================
// Consistency Tests
// ============================================================================

describe('Consistency Tests', () => {
  test('classifyHeadroom and calculateHeadroom should be consistent', () => {
    // Peak levels from clipping to very quiet
    const peakLevels = [0, -0.3, -2, -5, -10, -20];
    
    peakLevels.forEach(peak => {
      const headroom = calculateHeadroom(peak);
      const status = classifyHeadroom(headroom);
      expect(Object.values(HeadroomStatus)).toContain(status);
    });
  });

  test('calculateHeadroom values should classify correctly', () => {
    // Peak at 0dB = 0 headroom = CLIPPED
    expect(classifyHeadroom(calculateHeadroom(0))).toBe(HeadroomStatus.CLIPPED);
    // Peak at -3dB = 3 headroom = ADEQUATE
    expect(classifyHeadroom(calculateHeadroom(-3))).toBe(HeadroomStatus.ADEQUATE);
    // Peak at -10dB = 10 headroom = GENEROUS  
    expect(classifyHeadroom(calculateHeadroom(-10))).toBe(HeadroomStatus.GENEROUS);
    // Peak at -20dB = 20 headroom = EXCESSIVE
    expect(classifyHeadroom(calculateHeadroom(-20))).toBe(HeadroomStatus.EXCESSIVE);
  });

  test('calculateMaxGain should work with all target types', () => {
    const peakDb = -6;
    
    // Streaming: ceiling -1, max gain = 5
    expect(calculateMaxGain(peakDb, TARGETS.STREAMING)).toBe(5);
    // Broadcast: ceiling -2, max gain = 4
    expect(calculateMaxGain(peakDb, TARGETS.BROADCAST)).toBe(4);
    // Mastering: ceiling -1, max gain = 5
    expect(calculateMaxGain(peakDb, TARGETS.MASTERING)).toBe(5);
    // Mixing: ceiling -6, max gain = 0
    expect(calculateMaxGain(peakDb, TARGETS.MIXING)).toBe(0);
  });
});
