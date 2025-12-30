/**
 * Loudness Analyzer Tests
 * 
 * Tests for EBU R128 loudness analysis including momentary,
 * short-term, and integrated LUFS measurements.
 */

const loudnessAnalyzer = require('../services/loudnessAnalyzer');

const {
  analyzeLoudness,
  quickCheck,
  getEBUR128Stats,
  classifyLoudness,
  classifyLRA,
  checkCompliance,
  getNormalizationRecommendation,
  assessDynamicConsistency,
  getStatusDescription,
  getAvailablePlatforms,
  isSafeForPlatform,
  LoudnessStatus,
  LRAStatus,
  LOUDNESS_TARGETS,
  COMPLIANCE_TOLERANCE
} = loudnessAnalyzer;

// ============================================================================
// Constants Export Tests
// ============================================================================

describe('Loudness Analyzer Constants', () => {
  describe('LoudnessStatus', () => {
    test('should export all loudness status values', () => {
      expect(LoudnessStatus.TOO_QUIET).toBe('TOO_QUIET');
      expect(LoudnessStatus.SLIGHTLY_QUIET).toBe('SLIGHTLY_QUIET');
      expect(LoudnessStatus.COMPLIANT).toBe('COMPLIANT');
      expect(LoudnessStatus.SLIGHTLY_LOUD).toBe('SLIGHTLY_LOUD');
      expect(LoudnessStatus.TOO_LOUD).toBe('TOO_LOUD');
    });
    
    test('should have exactly 5 status values', () => {
      expect(Object.keys(LoudnessStatus)).toHaveLength(5);
    });
  });
  
  describe('LRAStatus', () => {
    test('should export all LRA status values', () => {
      expect(LRAStatus.TOO_COMPRESSED).toBe('TOO_COMPRESSED');
      expect(LRAStatus.OPTIMAL).toBe('OPTIMAL');
      expect(LRAStatus.TOO_DYNAMIC).toBe('TOO_DYNAMIC');
    });
    
    test('should have exactly 3 status values', () => {
      expect(Object.keys(LRAStatus)).toHaveLength(3);
    });
  });
  
  describe('LOUDNESS_TARGETS', () => {
    test('should export streaming platform targets', () => {
      expect(LOUDNESS_TARGETS.SPOTIFY).toBeDefined();
      expect(LOUDNESS_TARGETS.APPLE_MUSIC).toBeDefined();
      expect(LOUDNESS_TARGETS.YOUTUBE).toBeDefined();
      expect(LOUDNESS_TARGETS.TIDAL).toBeDefined();
      expect(LOUDNESS_TARGETS.AMAZON_MUSIC).toBeDefined();
      expect(LOUDNESS_TARGETS.DEEZER).toBeDefined();
    });
    
    test('should export broadcast standard targets', () => {
      expect(LOUDNESS_TARGETS.EBU_R128).toBeDefined();
      expect(LOUDNESS_TARGETS.ATSC_A85).toBeDefined();
      expect(LOUDNESS_TARGETS.ARIB_TR_B32).toBeDefined();
    });
    
    test('should export general targets', () => {
      expect(LOUDNESS_TARGETS.PODCAST).toBeDefined();
      expect(LOUDNESS_TARGETS.AUDIOBOOK).toBeDefined();
      expect(LOUDNESS_TARGETS.FILM).toBeDefined();
      expect(LOUDNESS_TARGETS.MASTERING).toBeDefined();
    });
    
    test('Spotify target should be -14 LUFS with -1 dBTP', () => {
      expect(LOUDNESS_TARGETS.SPOTIFY.integrated).toBe(-14);
      expect(LOUDNESS_TARGETS.SPOTIFY.truePeak).toBe(-1);
      expect(LOUDNESS_TARGETS.SPOTIFY.lra.min).toBe(4);
      expect(LOUDNESS_TARGETS.SPOTIFY.lra.max).toBe(16);
    });
    
    test('EBU R128 target should be -23 LUFS with -1 dBTP', () => {
      expect(LOUDNESS_TARGETS.EBU_R128.integrated).toBe(-23);
      expect(LOUDNESS_TARGETS.EBU_R128.truePeak).toBe(-1);
    });
    
    test('ATSC A/85 target should be -24 LUFS with -2 dBTP', () => {
      expect(LOUDNESS_TARGETS.ATSC_A85.integrated).toBe(-24);
      expect(LOUDNESS_TARGETS.ATSC_A85.truePeak).toBe(-2);
    });
    
    test('Apple Music target should be -16 LUFS', () => {
      expect(LOUDNESS_TARGETS.APPLE_MUSIC.integrated).toBe(-16);
    });
  });
  
  describe('COMPLIANCE_TOLERANCE', () => {
    test('should export compliance tolerance of 1 LU', () => {
      expect(COMPLIANCE_TOLERANCE).toBe(1.0);
    });
  });
});

// ============================================================================
// Classification Function Tests
// ============================================================================

describe('classifyLoudness', () => {
  describe('with Spotify target (-14 LUFS)', () => {
    const target = -14;
    
    test('should classify -14 LUFS as COMPLIANT', () => {
      expect(classifyLoudness(-14, target)).toBe(LoudnessStatus.COMPLIANT);
    });
    
    test('should classify -14.5 LUFS as COMPLIANT (within tolerance)', () => {
      expect(classifyLoudness(-14.5, target)).toBe(LoudnessStatus.COMPLIANT);
    });
    
    test('should classify -13.5 LUFS as COMPLIANT (within tolerance)', () => {
      expect(classifyLoudness(-13.5, target)).toBe(LoudnessStatus.COMPLIANT);
    });
    
    test('should classify -15 LUFS as SLIGHTLY_QUIET', () => {
      expect(classifyLoudness(-15.5, target)).toBe(LoudnessStatus.SLIGHTLY_QUIET);
    });
    
    test('should classify -16 LUFS as SLIGHTLY_QUIET', () => {
      expect(classifyLoudness(-16, target)).toBe(LoudnessStatus.SLIGHTLY_QUIET);
    });
    
    test('should classify -18 LUFS as TOO_QUIET', () => {
      expect(classifyLoudness(-18, target)).toBe(LoudnessStatus.TOO_QUIET);
    });
    
    test('should classify -12 LUFS as SLIGHTLY_LOUD', () => {
      expect(classifyLoudness(-12, target)).toBe(LoudnessStatus.SLIGHTLY_LOUD);
    });
    
    test('should classify -11.5 LUFS as SLIGHTLY_LOUD', () => {
      expect(classifyLoudness(-11.5, target)).toBe(LoudnessStatus.SLIGHTLY_LOUD);
    });
    
    test('should classify -10 LUFS as TOO_LOUD', () => {
      expect(classifyLoudness(-10, target)).toBe(LoudnessStatus.TOO_LOUD);
    });
    
    test('should classify -6 LUFS as TOO_LOUD', () => {
      expect(classifyLoudness(-6, target)).toBe(LoudnessStatus.TOO_LOUD);
    });
  });
  
  describe('with EBU R128 target (-23 LUFS)', () => {
    const target = -23;
    
    test('should classify -23 LUFS as COMPLIANT', () => {
      expect(classifyLoudness(-23, target)).toBe(LoudnessStatus.COMPLIANT);
    });
    
    test('should classify -27 LUFS as TOO_QUIET', () => {
      expect(classifyLoudness(-27, target)).toBe(LoudnessStatus.TOO_QUIET);
    });
    
    test('should classify -19 LUFS as TOO_LOUD', () => {
      expect(classifyLoudness(-19, target)).toBe(LoudnessStatus.TOO_LOUD);
    });
  });
  
  describe('edge cases', () => {
    test('should return COMPLIANT for null value', () => {
      expect(classifyLoudness(null, -14)).toBe(LoudnessStatus.COMPLIANT);
    });
    
    test('should return COMPLIANT for NaN value', () => {
      expect(classifyLoudness(NaN, -14)).toBe(LoudnessStatus.COMPLIANT);
    });
    
    test('should return COMPLIANT for Infinity', () => {
      expect(classifyLoudness(Infinity, -14)).toBe(LoudnessStatus.COMPLIANT);
    });
    
    test('should handle exact boundary at -17 LUFS (3 dB below -14)', () => {
      // -17 is exactly 3 dB below, but < -3 means TOO_QUIET
      // -17 - (-14) = -3, which is not < -3, so SLIGHTLY_QUIET
      expect(classifyLoudness(-17, -14)).toBe(LoudnessStatus.SLIGHTLY_QUIET);
    });
    
    test('should handle -16.9 LUFS as SLIGHTLY_QUIET', () => {
      expect(classifyLoudness(-16.9, -14)).toBe(LoudnessStatus.SLIGHTLY_QUIET);
    });
  });
});

describe('classifyLRA', () => {
  describe('with default target (4-16 LU)', () => {
    test('should classify 8 LU as OPTIMAL', () => {
      expect(classifyLRA(8)).toBe(LRAStatus.OPTIMAL);
    });
    
    test('should classify 4 LU as OPTIMAL (boundary)', () => {
      expect(classifyLRA(4)).toBe(LRAStatus.OPTIMAL);
    });
    
    test('should classify 16 LU as OPTIMAL (boundary)', () => {
      expect(classifyLRA(16)).toBe(LRAStatus.OPTIMAL);
    });
    
    test('should classify 3 LU as TOO_COMPRESSED', () => {
      expect(classifyLRA(3)).toBe(LRAStatus.TOO_COMPRESSED);
    });
    
    test('should classify 2 LU as TOO_COMPRESSED', () => {
      expect(classifyLRA(2)).toBe(LRAStatus.TOO_COMPRESSED);
    });
    
    test('should classify 17 LU as TOO_DYNAMIC', () => {
      expect(classifyLRA(17)).toBe(LRAStatus.TOO_DYNAMIC);
    });
    
    test('should classify 25 LU as TOO_DYNAMIC', () => {
      expect(classifyLRA(25)).toBe(LRAStatus.TOO_DYNAMIC);
    });
  });
  
  describe('with custom target', () => {
    test('should use custom range {3, 10}', () => {
      expect(classifyLRA(2, { min: 3, max: 10 })).toBe(LRAStatus.TOO_COMPRESSED);
      expect(classifyLRA(5, { min: 3, max: 10 })).toBe(LRAStatus.OPTIMAL);
      expect(classifyLRA(12, { min: 3, max: 10 })).toBe(LRAStatus.TOO_DYNAMIC);
    });
  });
  
  describe('edge cases', () => {
    test('should return OPTIMAL for null value', () => {
      expect(classifyLRA(null)).toBe(LRAStatus.OPTIMAL);
    });
    
    test('should return OPTIMAL for NaN value', () => {
      expect(classifyLRA(NaN)).toBe(LRAStatus.OPTIMAL);
    });
  });
});

// ============================================================================
// Compliance Check Tests
// ============================================================================

describe('checkCompliance', () => {
  describe('Spotify compliance', () => {
    test('should be compliant at -14 LUFS, -2 dBTP, 8 LU', () => {
      const analysis = { integrated: -14, truePeak: -2, lra: 8 };
      const result = checkCompliance(analysis, 'SPOTIFY');
      
      expect(result.isCompliant).toBe(true);
      expect(result.loudnessStatus).toBe(LoudnessStatus.COMPLIANT);
      expect(result.lraStatus).toBe(LRAStatus.OPTIMAL);
      expect(result.truePeakOk).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
    
    test('should fail if true peak exceeds -1 dBTP', () => {
      const analysis = { integrated: -14, truePeak: 0.5, lra: 8 };
      const result = checkCompliance(analysis, 'SPOTIFY');
      
      expect(result.isCompliant).toBe(false);
      expect(result.truePeakOk).toBe(false);
      expect(result.issues.find(i => i.type === 'truePeak')).toBeDefined();
    });
    
    test('should fail if loudness is too quiet', () => {
      const analysis = { integrated: -20, truePeak: -2, lra: 8 };
      const result = checkCompliance(analysis, 'SPOTIFY');
      
      expect(result.isCompliant).toBe(false);
      expect(result.loudnessStatus).toBe(LoudnessStatus.TOO_QUIET);
      expect(result.issues.find(i => i.type === 'loudness')).toBeDefined();
    });
    
    test('should fail if loudness is too loud', () => {
      const analysis = { integrated: -8, truePeak: -2, lra: 8 };
      const result = checkCompliance(analysis, 'SPOTIFY');
      
      expect(result.isCompliant).toBe(false);
      expect(result.loudnessStatus).toBe(LoudnessStatus.TOO_LOUD);
    });
    
    test('should fail if LRA is too compressed', () => {
      const analysis = { integrated: -14, truePeak: -2, lra: 2 };
      const result = checkCompliance(analysis, 'SPOTIFY');
      
      expect(result.isCompliant).toBe(false);
      expect(result.lraStatus).toBe(LRAStatus.TOO_COMPRESSED);
      expect(result.issues.find(i => i.type === 'lra')).toBeDefined();
    });
    
    test('should fail if LRA is too dynamic', () => {
      const analysis = { integrated: -14, truePeak: -2, lra: 20 };
      const result = checkCompliance(analysis, 'SPOTIFY');
      
      expect(result.isCompliant).toBe(false);
      expect(result.lraStatus).toBe(LRAStatus.TOO_DYNAMIC);
    });
  });
  
  describe('EBU R128 compliance', () => {
    test('should be compliant at -23 LUFS', () => {
      const analysis = { integrated: -23, truePeak: -2, lra: 10 };
      const result = checkCompliance(analysis, 'EBU_R128');
      
      expect(result.isCompliant).toBe(true);
      expect(result.target.integrated).toBe(-23);
    });
    
    test('should fail if too loud for broadcast', () => {
      const analysis = { integrated: -14, truePeak: -2, lra: 10 };
      const result = checkCompliance(analysis, 'EBU_R128');
      
      expect(result.isCompliant).toBe(false);
      expect(result.loudnessStatus).toBe(LoudnessStatus.TOO_LOUD);
    });
  });
  
  describe('platform case insensitivity', () => {
    test('should accept lowercase platform names', () => {
      const analysis = { integrated: -14, truePeak: -2, lra: 8 };
      const result = checkCompliance(analysis, 'spotify');
      
      expect(result.platform).toBe('spotify');
      expect(result.target.integrated).toBe(-14);
    });
    
    test('should accept mixed case platform names', () => {
      const analysis = { integrated: -14, truePeak: -2, lra: 8 };
      const result = checkCompliance(analysis, 'SpOtIfY');
      
      expect(result.target.integrated).toBe(-14);
    });
    
    test('should default to Spotify for unknown platform', () => {
      const analysis = { integrated: -14, truePeak: -2, lra: 8 };
      const result = checkCompliance(analysis, 'unknown_platform');
      
      expect(result.target.integrated).toBe(-14); // Spotify default
    });
  });
  
  describe('issue details', () => {
    test('should include adjustment values in issues', () => {
      const analysis = { integrated: -18, truePeak: 0, lra: 8 };
      const result = checkCompliance(analysis, 'SPOTIFY');
      
      const loudnessIssue = result.issues.find(i => i.type === 'loudness');
      expect(loudnessIssue.adjustment).toBe(4); // Need to add 4 dB
      
      const peakIssue = result.issues.find(i => i.type === 'truePeak');
      expect(peakIssue.adjustment).toBe(-1); // Need to reduce by 1 dB
    });
    
    test('should include measured values', () => {
      const analysis = { integrated: -14, truePeak: -2, lra: 8 };
      const result = checkCompliance(analysis, 'SPOTIFY');
      
      expect(result.measured.integrated).toBe(-14);
      expect(result.measured.truePeak).toBe(-2);
      expect(result.measured.lra).toBe(8);
    });
  });
});

// ============================================================================
// Normalization Recommendation Tests
// ============================================================================

describe('getNormalizationRecommendation', () => {
  describe('basic recommendations', () => {
    test('should recommend gain increase for quiet content', () => {
      const analysis = { integrated: -20, truePeak: -8, lra: 8, momentary: { max: -18 }, shortTerm: { max: -19 } };
      const result = getNormalizationRecommendation(analysis, 'SPOTIFY');
      
      expect(result.canNormalize).toBe(true);
      expect(result.gainNeeded).toBe(6); // -14 - (-20) = 6
      expect(result.willClip).toBe(false); // -8 + 6 = -2, within -1 limit
    });
    
    test('should recommend gain decrease for loud content', () => {
      const analysis = { integrated: -10, truePeak: -2, lra: 8, momentary: { max: -8 }, shortTerm: { max: -9 } };
      const result = getNormalizationRecommendation(analysis, 'SPOTIFY');
      
      expect(result.canNormalize).toBe(true);
      expect(result.gainNeeded).toBe(-4); // -14 - (-10) = -4
    });
    
    test('should indicate limiter needed when gain would cause clipping', () => {
      const analysis = { integrated: -18, truePeak: -3, lra: 8, momentary: { max: -16 }, shortTerm: { max: -17 } };
      const result = getNormalizationRecommendation(analysis, 'SPOTIFY');
      
      // Gain needed: -14 - (-18) = 4 dB
      // Projected true peak: -3 + 4 = 1 dBTP, exceeds -1 limit
      expect(result.gainNeeded).toBe(4);
      expect(result.willClip).toBe(true);
      expect(result.needsLimiter).toBe(true);
    });
    
    test('should indicate momentary risk for high momentary peaks', () => {
      const analysis = { integrated: -20, truePeak: -5, lra: 8, momentary: { max: -4 }, shortTerm: { max: -12 } };
      const result = getNormalizationRecommendation(analysis, 'SPOTIFY');
      
      // Gain needed: -14 - (-20) = 6 dB
      // Momentary max: -4 + 6 = 2, which is > -1
      expect(result.momentaryRisk).toBe(true);
    });
  });
  
  describe('LRA notes', () => {
    test('should note if LRA is too high', () => {
      const analysis = { integrated: -14, truePeak: -2, lra: 20, momentary: { max: -12 }, shortTerm: { max: -13 } };
      const result = getNormalizationRecommendation(analysis, 'SPOTIFY');
      
      expect(result.lraNote).toContain('compression');
    });
    
    test('should not have LRA note if within range', () => {
      const analysis = { integrated: -14, truePeak: -2, lra: 10, momentary: { max: -12 }, shortTerm: { max: -13 } };
      const result = getNormalizationRecommendation(analysis, 'SPOTIFY');
      
      expect(result.lraNote).toBeNull();
    });
  });
  
  describe('edge cases', () => {
    test('should return canNormalize false if integrated is null', () => {
      const analysis = { integrated: null, truePeak: -2, lra: 8, momentary: { max: null }, shortTerm: { max: null } };
      const result = getNormalizationRecommendation(analysis, 'SPOTIFY');
      
      expect(result.canNormalize).toBe(false);
      expect(result.reason).toContain('Unable to measure');
    });
    
    test('should handle missing momentary data', () => {
      const analysis = { integrated: -14, truePeak: -2, lra: 8 };
      const result = getNormalizationRecommendation(analysis, 'SPOTIFY');
      
      expect(result.canNormalize).toBe(true);
      // Should not throw
    });
  });
  
  describe('platform-specific recommendations', () => {
    test('should target -23 LUFS for EBU R128', () => {
      const analysis = { integrated: -14, truePeak: -2, lra: 8, momentary: { max: -12 }, shortTerm: { max: -13 } };
      const result = getNormalizationRecommendation(analysis, 'EBU_R128');
      
      expect(result.gainNeeded).toBe(-9); // -23 - (-14) = -9
      expect(result.projectedLoudness).toBe(-23);
    });
    
    test('should target -24 LUFS for ATSC A/85', () => {
      const analysis = { integrated: -14, truePeak: -2, lra: 8, momentary: { max: -12 }, shortTerm: { max: -13 } };
      const result = getNormalizationRecommendation(analysis, 'ATSC_A85');
      
      expect(result.gainNeeded).toBe(-10);
      expect(result.projectedLoudness).toBe(-24);
    });
  });
});

// ============================================================================
// Dynamic Consistency Tests
// ============================================================================

describe('assessDynamicConsistency', () => {
  describe('consistency classifications', () => {
    test('should classify very consistent content', () => {
      const analysis = {
        integrated: -14,
        momentary: { max: -12, min: -18 }, // 6 dB swing
        shortTerm: { max: -13, min: -17 }  // 4 dB swing
      };
      const result = assessDynamicConsistency(analysis);
      
      expect(result.consistency).toBe('very_consistent');
      expect(result.momentarySwing).toBe(6);
      expect(result.shortTermSwing).toBe(4);
    });
    
    test('should classify consistent content', () => {
      const analysis = {
        integrated: -14,
        momentary: { max: -10, min: -22 }, // 12 dB swing
        shortTerm: { max: -12, min: -20 }  // 8 dB swing
      };
      const result = assessDynamicConsistency(analysis);
      
      expect(result.consistency).toBe('consistent');
    });
    
    test('should classify variable content', () => {
      const analysis = {
        integrated: -14,
        momentary: { max: -8, min: -28 },  // 20 dB swing
        shortTerm: { max: -10, min: -22 }  // 12 dB swing
      };
      const result = assessDynamicConsistency(analysis);
      
      expect(result.consistency).toBe('variable');
      expect(result.description).toContain('level automation');
    });
    
    test('should classify highly variable content', () => {
      const analysis = {
        integrated: -14,
        momentary: { max: -5, min: -35 },  // 30 dB swing
        shortTerm: { max: -8, min: -26 }   // 18 dB swing
      };
      const result = assessDynamicConsistency(analysis);
      
      expect(result.consistency).toBe('highly_variable');
      expect(result.description).toContain('section-by-section');
    });
  });
  
  describe('deviation calculations', () => {
    test('should calculate deviation from integrated', () => {
      const analysis = {
        integrated: -14,
        momentary: { max: -10, min: -20 },
        shortTerm: { max: -12, min: -18 }
      };
      const result = assessDynamicConsistency(analysis);
      
      expect(result.momentaryDeviation).toBe(4);  // -10 - (-14) = 4
      expect(result.shortTermDeviation).toBe(2);   // -12 - (-14) = 2
    });
  });
  
  describe('edge cases', () => {
    test('should handle missing momentary max', () => {
      const analysis = {
        integrated: -14,
        momentary: { max: null },
        shortTerm: { max: -12, min: -18 }
      };
      const result = assessDynamicConsistency(analysis);
      
      expect(result.consistent).toBeNull();
      expect(result.reason).toContain('Insufficient data');
    });
    
    test('should handle missing short-term max', () => {
      const analysis = {
        integrated: -14,
        momentary: { max: -10, min: -20 },
        shortTerm: { max: null }
      };
      const result = assessDynamicConsistency(analysis);
      
      expect(result.consistent).toBeNull();
    });
    
    test('should handle undefined momentary', () => {
      const analysis = { integrated: -14 };
      const result = assessDynamicConsistency(analysis);
      
      expect(result.consistent).toBeNull();
    });
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('getStatusDescription', () => {
  test('should describe TOO_QUIET', () => {
    const desc = getStatusDescription(LoudnessStatus.TOO_QUIET);
    expect(desc).toContain('below target');
    expect(desc).toContain('>3 LU');
  });
  
  test('should describe SLIGHTLY_QUIET', () => {
    const desc = getStatusDescription(LoudnessStatus.SLIGHTLY_QUIET);
    expect(desc).toContain('below target');
    expect(desc).toContain('1-3 LU');
  });
  
  test('should describe COMPLIANT', () => {
    const desc = getStatusDescription(LoudnessStatus.COMPLIANT);
    expect(desc).toContain('Within target');
    expect(desc).toContain('±1 LU');
  });
  
  test('should describe SLIGHTLY_LOUD', () => {
    const desc = getStatusDescription(LoudnessStatus.SLIGHTLY_LOUD);
    expect(desc).toContain('above target');
    expect(desc).toContain('1-3 LU');
  });
  
  test('should describe TOO_LOUD', () => {
    const desc = getStatusDescription(LoudnessStatus.TOO_LOUD);
    expect(desc).toContain('above target');
    expect(desc).toContain('>3 LU');
  });
  
  test('should return unknown for invalid status', () => {
    const desc = getStatusDescription('INVALID');
    expect(desc).toContain('Unknown');
  });
});

describe('getAvailablePlatforms', () => {
  test('should return array of platform names', () => {
    const platforms = getAvailablePlatforms();
    
    expect(Array.isArray(platforms)).toBe(true);
    expect(platforms).toContain('SPOTIFY');
    expect(platforms).toContain('APPLE_MUSIC');
    expect(platforms).toContain('YOUTUBE');
    expect(platforms).toContain('EBU_R128');
    expect(platforms).toContain('ATSC_A85');
  });
  
  test('should have at least 10 platforms', () => {
    const platforms = getAvailablePlatforms();
    expect(platforms.length).toBeGreaterThanOrEqual(10);
  });
});

describe('isSafeForPlatform', () => {
  describe('Spotify safety', () => {
    test('should be safe at -14 LUFS', () => {
      expect(isSafeForPlatform(-14, 'SPOTIFY')).toBe(true);
    });
    
    test('should be safe at -15 LUFS (slightly quiet)', () => {
      expect(isSafeForPlatform(-15, 'SPOTIFY')).toBe(true);
    });
    
    test('should be safe at -12 LUFS (slightly loud)', () => {
      expect(isSafeForPlatform(-12, 'SPOTIFY')).toBe(true);
    });
    
    test('should not be safe at -8 LUFS (too loud)', () => {
      expect(isSafeForPlatform(-8, 'SPOTIFY')).toBe(false);
    });
    
    test('should not be safe at -20 LUFS (too quiet)', () => {
      expect(isSafeForPlatform(-20, 'SPOTIFY')).toBe(false);
    });
  });
  
  describe('EBU R128 safety', () => {
    test('should be safe at -23 LUFS', () => {
      expect(isSafeForPlatform(-23, 'EBU_R128')).toBe(true);
    });
    
    test('should not be safe at -14 LUFS', () => {
      expect(isSafeForPlatform(-14, 'EBU_R128')).toBe(false);
    });
  });
  
  describe('default platform', () => {
    test('should default to Spotify if platform not specified', () => {
      expect(isSafeForPlatform(-14)).toBe(true);
      expect(isSafeForPlatform(-23)).toBe(false); // Too quiet for Spotify
    });
  });
});

// ============================================================================
// Module Export Tests
// ============================================================================

describe('Module Exports', () => {
  test('should export main analysis functions', () => {
    expect(typeof analyzeLoudness).toBe('function');
    expect(typeof quickCheck).toBe('function');
    expect(typeof getEBUR128Stats).toBe('function');
  });
  
  test('should export classification functions', () => {
    expect(typeof classifyLoudness).toBe('function');
    expect(typeof classifyLRA).toBe('function');
    expect(typeof checkCompliance).toBe('function');
  });
  
  test('should export recommendation functions', () => {
    expect(typeof getNormalizationRecommendation).toBe('function');
    expect(typeof assessDynamicConsistency).toBe('function');
  });
  
  test('should export utility functions', () => {
    expect(typeof getStatusDescription).toBe('function');
    expect(typeof getAvailablePlatforms).toBe('function');
    expect(typeof isSafeForPlatform).toBe('function');
  });
  
  test('should export constants', () => {
    expect(LoudnessStatus).toBeDefined();
    expect(LRAStatus).toBeDefined();
    expect(LOUDNESS_TARGETS).toBeDefined();
    expect(COMPLIANCE_TOLERANCE).toBeDefined();
  });
});

// ============================================================================
// Integration Export from audioProcessor Tests
// ============================================================================

describe('audioProcessor integration', () => {
  const audioProcessor = require('../services/audioProcessor');
  
  test('should export loudnessAnalyzer from audioProcessor', () => {
    expect(audioProcessor.loudnessAnalyzer).toBeDefined();
    expect(audioProcessor.loudnessAnalyzer.analyzeLoudness).toBe(analyzeLoudness);
    expect(audioProcessor.loudnessAnalyzer.quickCheck).toBe(quickCheck);
  });
  
  test('should export LoudnessStatus from audioProcessor', () => {
    expect(audioProcessor.loudnessAnalyzer.LoudnessStatus).toEqual(LoudnessStatus);
  });
  
  test('should export LOUDNESS_TARGETS from audioProcessor', () => {
    expect(audioProcessor.loudnessAnalyzer.LOUDNESS_TARGETS).toEqual(LOUDNESS_TARGETS);
  });
});
