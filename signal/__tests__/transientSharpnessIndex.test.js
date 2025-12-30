/**
 * Transient Sharpness Index Tests
 * 
 * Tests for transient analysis detecting overly blunted
 * or overly spiky transients.
 */

const transientSharpnessIndex = require('../services/transientSharpnessIndex');

const {
  analyzeTransientSharpness,
  quickCheck,
  getTransientStats,
  analyzeTransientDensity,
  analyzeHighFrequencyContent,
  analyzeAttackCharacteristics,
  classifySharpness,
  classifyDensity,
  calculateSharpnessIndex,
  getSharpnessDescription,
  getProcessingRecommendation,
  assessGenreAppropriateness,
  needsAttention,
  getSeverity,
  isSafeForLimiting,
  getAvailableGenres,
  TransientSharpness,
  TransientDensity,
  SHARPNESS_THRESHOLDS,
  ATTACK_TIMES,
  GENRE_TRANSIENT_PROFILES
} = transientSharpnessIndex;

// ============================================================================
// Constants Export Tests
// ============================================================================

describe('Transient Sharpness Index Constants', () => {
  describe('TransientSharpness', () => {
    test('should export all sharpness classifications', () => {
      expect(TransientSharpness.VERY_BLUNTED).toBe('VERY_BLUNTED');
      expect(TransientSharpness.BLUNTED).toBe('BLUNTED');
      expect(TransientSharpness.SOFT).toBe('SOFT');
      expect(TransientSharpness.NATURAL).toBe('NATURAL');
      expect(TransientSharpness.SHARP).toBe('SHARP');
      expect(TransientSharpness.HARSH).toBe('HARSH');
      expect(TransientSharpness.VERY_SPIKY).toBe('VERY_SPIKY');
    });
    
    test('should have exactly 7 sharpness classifications', () => {
      expect(Object.keys(TransientSharpness)).toHaveLength(7);
    });
  });
  
  describe('TransientDensity', () => {
    test('should export all density classifications', () => {
      expect(TransientDensity.SPARSE).toBe('SPARSE');
      expect(TransientDensity.LOW).toBe('LOW');
      expect(TransientDensity.MODERATE).toBe('MODERATE');
      expect(TransientDensity.DENSE).toBe('DENSE');
      expect(TransientDensity.VERY_DENSE).toBe('VERY_DENSE');
    });
    
    test('should have exactly 5 density classifications', () => {
      expect(Object.keys(TransientDensity)).toHaveLength(5);
    });
  });
  
  describe('SHARPNESS_THRESHOLDS', () => {
    test('should export sharpness thresholds', () => {
      expect(SHARPNESS_THRESHOLDS.VERY_BLUNTED).toBe(3);
      expect(SHARPNESS_THRESHOLDS.BLUNTED).toBe(6);
      expect(SHARPNESS_THRESHOLDS.SOFT).toBe(9);
      expect(SHARPNESS_THRESHOLDS.NATURAL_LOW).toBe(9);
      expect(SHARPNESS_THRESHOLDS.NATURAL_HIGH).toBe(15);
      expect(SHARPNESS_THRESHOLDS.SHARP).toBe(18);
      expect(SHARPNESS_THRESHOLDS.HARSH).toBe(22);
    });
    
    test('thresholds should be in ascending order', () => {
      expect(SHARPNESS_THRESHOLDS.VERY_BLUNTED).toBeLessThan(SHARPNESS_THRESHOLDS.BLUNTED);
      expect(SHARPNESS_THRESHOLDS.BLUNTED).toBeLessThan(SHARPNESS_THRESHOLDS.SOFT);
      expect(SHARPNESS_THRESHOLDS.NATURAL_LOW).toBeLessThanOrEqual(SHARPNESS_THRESHOLDS.NATURAL_HIGH);
      expect(SHARPNESS_THRESHOLDS.NATURAL_HIGH).toBeLessThan(SHARPNESS_THRESHOLDS.SHARP);
    });
  });
  
  describe('ATTACK_TIMES', () => {
    test('should export attack time classifications', () => {
      expect(ATTACK_TIMES.INSTANT).toBe(0.1);
      expect(ATTACK_TIMES.VERY_FAST).toBe(1);
      expect(ATTACK_TIMES.FAST).toBe(5);
      expect(ATTACK_TIMES.MEDIUM).toBe(20);
      expect(ATTACK_TIMES.SLOW).toBe(50);
      expect(ATTACK_TIMES.VERY_SLOW).toBe(100);
    });
  });
  
  describe('GENRE_TRANSIENT_PROFILES', () => {
    test('should export genre profiles', () => {
      expect(GENRE_TRANSIENT_PROFILES.EDM).toBeDefined();
      expect(GENRE_TRANSIENT_PROFILES.POP).toBeDefined();
      expect(GENRE_TRANSIENT_PROFILES.ROCK).toBeDefined();
      expect(GENRE_TRANSIENT_PROFILES.METAL).toBeDefined();
      expect(GENRE_TRANSIENT_PROFILES.JAZZ).toBeDefined();
      expect(GENRE_TRANSIENT_PROFILES.CLASSICAL).toBeDefined();
    });
    
    test('genre profiles should have required properties', () => {
      const edm = GENRE_TRANSIENT_PROFILES.EDM;
      expect(edm.minSharpness).toBeDefined();
      expect(edm.maxSharpness).toBeDefined();
      expect(edm.description).toBeDefined();
      expect(edm.minSharpness).toBeLessThan(edm.maxSharpness);
    });
    
    test('classical should have highest sharpness range', () => {
      const classical = GENRE_TRANSIENT_PROFILES.CLASSICAL;
      const edm = GENRE_TRANSIENT_PROFILES.EDM;
      
      expect(classical.maxSharpness).toBeGreaterThanOrEqual(edm.maxSharpness);
    });
  });
});

// ============================================================================
// Classification Tests
// ============================================================================

describe('classifySharpness', () => {
  test('should classify VERY_BLUNTED for crest < 3 dB', () => {
    expect(classifySharpness(2)).toBe(TransientSharpness.VERY_BLUNTED);
    expect(classifySharpness(1)).toBe(TransientSharpness.VERY_BLUNTED);
    expect(classifySharpness(0)).toBe(TransientSharpness.VERY_BLUNTED);
  });
  
  test('should classify BLUNTED for crest 3-6 dB', () => {
    expect(classifySharpness(3)).toBe(TransientSharpness.BLUNTED);
    expect(classifySharpness(4.5)).toBe(TransientSharpness.BLUNTED);
    expect(classifySharpness(5.9)).toBe(TransientSharpness.BLUNTED);
  });
  
  test('should classify SOFT for crest 6-9 dB', () => {
    expect(classifySharpness(6)).toBe(TransientSharpness.SOFT);
    expect(classifySharpness(7.5)).toBe(TransientSharpness.SOFT);
    expect(classifySharpness(8.9)).toBe(TransientSharpness.SOFT);
  });
  
  test('should classify NATURAL for crest 9-15 dB', () => {
    expect(classifySharpness(9)).toBe(TransientSharpness.NATURAL);
    expect(classifySharpness(12)).toBe(TransientSharpness.NATURAL);
    expect(classifySharpness(15)).toBe(TransientSharpness.NATURAL);
  });
  
  test('should classify SHARP for crest 15-18 dB', () => {
    expect(classifySharpness(15.1)).toBe(TransientSharpness.SHARP);
    expect(classifySharpness(16)).toBe(TransientSharpness.SHARP);
    expect(classifySharpness(18)).toBe(TransientSharpness.SHARP);
  });
  
  test('should classify HARSH for crest 18-22 dB', () => {
    expect(classifySharpness(18.1)).toBe(TransientSharpness.HARSH);
    expect(classifySharpness(20)).toBe(TransientSharpness.HARSH);
    expect(classifySharpness(22)).toBe(TransientSharpness.HARSH);
  });
  
  test('should classify VERY_SPIKY for crest > 22 dB', () => {
    expect(classifySharpness(22.1)).toBe(TransientSharpness.VERY_SPIKY);
    expect(classifySharpness(25)).toBe(TransientSharpness.VERY_SPIKY);
    expect(classifySharpness(30)).toBe(TransientSharpness.VERY_SPIKY);
  });
  
  test('should return NATURAL for null value', () => {
    expect(classifySharpness(null)).toBe(TransientSharpness.NATURAL);
  });
  
  test('should return NATURAL for NaN', () => {
    expect(classifySharpness(NaN)).toBe(TransientSharpness.NATURAL);
  });
  
  test('should return NATURAL for Infinity', () => {
    expect(classifySharpness(Infinity)).toBe(TransientSharpness.NATURAL);
  });
});

describe('classifyDensity', () => {
  test('should classify SPARSE for < 0.5 transients/sec', () => {
    expect(classifyDensity(0)).toBe(TransientDensity.SPARSE);
    expect(classifyDensity(0.3)).toBe(TransientDensity.SPARSE);
    expect(classifyDensity(0.49)).toBe(TransientDensity.SPARSE);
  });
  
  test('should classify LOW for 0.5-2 transients/sec', () => {
    expect(classifyDensity(0.5)).toBe(TransientDensity.LOW);
    expect(classifyDensity(1)).toBe(TransientDensity.LOW);
    expect(classifyDensity(1.9)).toBe(TransientDensity.LOW);
  });
  
  test('should classify MODERATE for 2-5 transients/sec', () => {
    expect(classifyDensity(2)).toBe(TransientDensity.MODERATE);
    expect(classifyDensity(3.5)).toBe(TransientDensity.MODERATE);
    expect(classifyDensity(4.9)).toBe(TransientDensity.MODERATE);
  });
  
  test('should classify DENSE for 5-10 transients/sec', () => {
    expect(classifyDensity(5)).toBe(TransientDensity.DENSE);
    expect(classifyDensity(7)).toBe(TransientDensity.DENSE);
    expect(classifyDensity(9.9)).toBe(TransientDensity.DENSE);
  });
  
  test('should classify VERY_DENSE for >= 10 transients/sec', () => {
    expect(classifyDensity(10)).toBe(TransientDensity.VERY_DENSE);
    expect(classifyDensity(15)).toBe(TransientDensity.VERY_DENSE);
    expect(classifyDensity(50)).toBe(TransientDensity.VERY_DENSE);
  });
  
  test('should return MODERATE for null value', () => {
    expect(classifyDensity(null)).toBe(TransientDensity.MODERATE);
  });
  
  test('should return MODERATE for NaN', () => {
    expect(classifyDensity(NaN)).toBe(TransientDensity.MODERATE);
  });
});

describe('calculateSharpnessIndex', () => {
  test('should return 0 for 0 dB crest factor', () => {
    expect(calculateSharpnessIndex(0)).toBe(0);
  });
  
  test('should return 50 for 12.5 dB crest factor', () => {
    expect(calculateSharpnessIndex(12.5)).toBe(50);
  });
  
  test('should return 100 for 25+ dB crest factor', () => {
    expect(calculateSharpnessIndex(25)).toBe(100);
    expect(calculateSharpnessIndex(30)).toBe(100);
  });
  
  test('should return 40 for 10 dB crest factor', () => {
    expect(calculateSharpnessIndex(10)).toBe(40);
  });
  
  test('should return 50 for null value', () => {
    expect(calculateSharpnessIndex(null)).toBe(50);
  });
  
  test('should return 50 for NaN', () => {
    expect(calculateSharpnessIndex(NaN)).toBe(50);
  });
  
  test('should clamp to 0-100 range', () => {
    expect(calculateSharpnessIndex(-5)).toBe(0);
    expect(calculateSharpnessIndex(50)).toBe(100);
  });
});

// ============================================================================
// Description and Recommendation Tests
// ============================================================================

describe('getSharpnessDescription', () => {
  test('should describe VERY_BLUNTED', () => {
    const desc = getSharpnessDescription(TransientSharpness.VERY_BLUNTED);
    expect(desc).toContain('over-compressed');
    expect(desc).toContain('flattened');
  });
  
  test('should describe BLUNTED', () => {
    const desc = getSharpnessDescription(TransientSharpness.BLUNTED);
    expect(desc).toContain('soft');
    expect(desc).toContain('compression');
  });
  
  test('should describe NATURAL', () => {
    const desc = getSharpnessDescription(TransientSharpness.NATURAL);
    expect(desc).toContain('balanced');
  });
  
  test('should describe HARSH', () => {
    const desc = getSharpnessDescription(TransientSharpness.HARSH);
    expect(desc).toContain('harsh');
    expect(desc).toContain('clicky');
  });
  
  test('should describe VERY_SPIKY', () => {
    const desc = getSharpnessDescription(TransientSharpness.VERY_SPIKY);
    expect(desc).toContain('painful');
    expect(desc).toContain('softening');
  });
  
  test('should return unknown for invalid value', () => {
    const desc = getSharpnessDescription('INVALID');
    expect(desc).toContain('Unknown');
  });
});

describe('getProcessingRecommendation', () => {
  test('should recommend restore for VERY_BLUNTED', () => {
    const rec = getProcessingRecommendation(TransientSharpness.VERY_BLUNTED);
    
    expect(rec.action).toBe('RESTORE_TRANSIENTS');
    expect(rec.transientShaperAttack).toBe('increase');
    expect(rec.transientShaperAmount).toBe(30);
    expect(rec.priority).toBe('high');
  });
  
  test('should recommend enhance for BLUNTED', () => {
    const rec = getProcessingRecommendation(TransientSharpness.BLUNTED);
    
    expect(rec.action).toBe('ENHANCE_TRANSIENTS');
    expect(rec.transientShaperAmount).toBe(15);
    expect(rec.priority).toBe('medium');
  });
  
  test('should recommend preserve for NATURAL', () => {
    const rec = getProcessingRecommendation(TransientSharpness.NATURAL);
    
    expect(rec.action).toBe('PRESERVE');
    expect(rec.transientShaperAmount).toBe(0);
    expect(rec.priority).toBe('none');
  });
  
  test('should recommend softening for HARSH', () => {
    const rec = getProcessingRecommendation(TransientSharpness.HARSH);
    
    expect(rec.action).toBe('SOFTEN_TRANSIENTS');
    expect(rec.transientShaperAttack).toBe('decrease');
    expect(rec.transientShaperAmount).toBe(-15);
    expect(rec.limiterAttack).toBe('fast');
  });
  
  test('should recommend significant softening for VERY_SPIKY', () => {
    const rec = getProcessingRecommendation(TransientSharpness.VERY_SPIKY);
    
    expect(rec.action).toBe('SIGNIFICANT_SOFTENING');
    expect(rec.transientShaperAmount).toBe(-30);
    expect(rec.limiterAttack).toBe('very-fast');
    expect(rec.priority).toBe('high');
  });
  
  test('should return NATURAL recommendation for unknown sharpness', () => {
    const rec = getProcessingRecommendation('INVALID');
    
    expect(rec.action).toBe('PRESERVE');
  });
});

// ============================================================================
// Genre Assessment Tests
// ============================================================================

describe('assessGenreAppropriateness', () => {
  describe('EDM genre', () => {
    const profile = GENRE_TRANSIENT_PROFILES.EDM;
    
    test('should be appropriate within range', () => {
      const result = assessGenreAppropriateness(15, 'EDM');
      
      expect(result.isAppropriate).toBe(true);
      expect(result.genre).toBe('EDM');
      expect(result.deviation).toBe(0);
    });
    
    test('should detect too soft for EDM', () => {
      const result = assessGenreAppropriateness(5, 'EDM');
      
      expect(result.isAppropriate).toBe(false);
      expect(result.deviation).toBeGreaterThan(0);
      expect(result.reason).toContain('softer');
    });
    
    test('should detect too sharp for EDM', () => {
      const result = assessGenreAppropriateness(25, 'EDM');
      
      expect(result.isAppropriate).toBe(false);
      expect(result.reason).toContain('sharper');
    });
  });
  
  describe('CLASSICAL genre', () => {
    test('should accept wide dynamic range', () => {
      const result = assessGenreAppropriateness(20, 'CLASSICAL');
      
      expect(result.isAppropriate).toBe(true);
    });
    
    test('should reject over-compressed for classical', () => {
      const result = assessGenreAppropriateness(8, 'CLASSICAL');
      
      expect(result.isAppropriate).toBe(false);
      expect(result.reason).toContain('softer');
    });
  });
  
  describe('case insensitivity', () => {
    test('should accept lowercase genre', () => {
      const result = assessGenreAppropriateness(12, 'pop');
      
      expect(result.profile).toEqual(GENRE_TRANSIENT_PROFILES.POP);
    });
    
    test('should accept mixed case genre', () => {
      const result = assessGenreAppropriateness(12, 'RoCk');
      
      expect(result.profile).toEqual(GENRE_TRANSIENT_PROFILES.ROCK);
    });
  });
  
  describe('edge cases', () => {
    test('should default to POP for unknown genre', () => {
      const result = assessGenreAppropriateness(12, 'unknown_genre');
      
      expect(result.profile).toEqual(GENRE_TRANSIENT_PROFILES.POP);
    });
    
    test('should handle null crest factor', () => {
      const result = assessGenreAppropriateness(null, 'EDM');
      
      expect(result.isAppropriate).toBeNull();
      expect(result.reason).toContain('not available');
    });
  });
});

// ============================================================================
// Attention and Severity Tests
// ============================================================================

describe('needsAttention', () => {
  test('should need attention for VERY_BLUNTED', () => {
    expect(needsAttention(TransientSharpness.VERY_BLUNTED)).toBe(true);
  });
  
  test('should need attention for BLUNTED', () => {
    expect(needsAttention(TransientSharpness.BLUNTED)).toBe(true);
  });
  
  test('should not need attention for SOFT', () => {
    expect(needsAttention(TransientSharpness.SOFT)).toBe(false);
  });
  
  test('should not need attention for NATURAL', () => {
    expect(needsAttention(TransientSharpness.NATURAL)).toBe(false);
  });
  
  test('should not need attention for SHARP', () => {
    expect(needsAttention(TransientSharpness.SHARP)).toBe(false);
  });
  
  test('should need attention for HARSH', () => {
    expect(needsAttention(TransientSharpness.HARSH)).toBe(true);
  });
  
  test('should need attention for VERY_SPIKY', () => {
    expect(needsAttention(TransientSharpness.VERY_SPIKY)).toBe(true);
  });
});

describe('getSeverity', () => {
  test('should return high for VERY_BLUNTED', () => {
    expect(getSeverity(TransientSharpness.VERY_BLUNTED)).toBe('high');
  });
  
  test('should return medium for BLUNTED', () => {
    expect(getSeverity(TransientSharpness.BLUNTED)).toBe('medium');
  });
  
  test('should return low for SOFT', () => {
    expect(getSeverity(TransientSharpness.SOFT)).toBe('low');
  });
  
  test('should return none for NATURAL', () => {
    expect(getSeverity(TransientSharpness.NATURAL)).toBe('none');
  });
  
  test('should return low for SHARP', () => {
    expect(getSeverity(TransientSharpness.SHARP)).toBe('low');
  });
  
  test('should return medium for HARSH', () => {
    expect(getSeverity(TransientSharpness.HARSH)).toBe('medium');
  });
  
  test('should return high for VERY_SPIKY', () => {
    expect(getSeverity(TransientSharpness.VERY_SPIKY)).toBe('high');
  });
  
  test('should return none for unknown', () => {
    expect(getSeverity('INVALID')).toBe('none');
  });
});

// ============================================================================
// Limiting Safety Tests
// ============================================================================

describe('isSafeForLimiting', () => {
  test('should be safe for NATURAL', () => {
    const result = isSafeForLimiting(TransientSharpness.NATURAL);
    
    expect(result.safe).toBe(true);
    expect(result.recommendedAttack).toBe('medium');
  });
  
  test('should be safe for SHARP', () => {
    const result = isSafeForLimiting(TransientSharpness.SHARP);
    
    expect(result.safe).toBe(true);
  });
  
  test('should be safe for HARSH with fast attack', () => {
    const result = isSafeForLimiting(TransientSharpness.HARSH);
    
    expect(result.safe).toBe(true);
    expect(result.recommendedAttack).toBe('fast');
  });
  
  test('should not be safe for VERY_BLUNTED', () => {
    const result = isSafeForLimiting(TransientSharpness.VERY_BLUNTED);
    
    expect(result.safe).toBe(false);
    expect(result.recommendedAttack).toBe('slow');
    expect(result.reason).toContain('blunted');
  });
  
  test('should not be safe for BLUNTED', () => {
    const result = isSafeForLimiting(TransientSharpness.BLUNTED);
    
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('blunted');
  });
  
  test('should not be safe for SOFT', () => {
    const result = isSafeForLimiting(TransientSharpness.SOFT);
    
    expect(result.safe).toBe(false);
  });
  
  test('should handle VERY_SPIKY with very-fast attack', () => {
    const result = isSafeForLimiting(TransientSharpness.VERY_SPIKY);
    
    expect(result.safe).toBe(false);
    expect(result.recommendedAttack).toBe('very-fast');
    expect(result.reason).toContain('spiky');
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('getAvailableGenres', () => {
  test('should return array of genre names', () => {
    const genres = getAvailableGenres();
    
    expect(Array.isArray(genres)).toBe(true);
    expect(genres).toContain('EDM');
    expect(genres).toContain('POP');
    expect(genres).toContain('ROCK');
    expect(genres).toContain('CLASSICAL');
    expect(genres).toContain('JAZZ');
  });
  
  test('should have at least 10 genres', () => {
    const genres = getAvailableGenres();
    expect(genres.length).toBeGreaterThanOrEqual(10);
  });
});

// ============================================================================
// Module Export Tests
// ============================================================================

describe('Module Exports', () => {
  test('should export main analysis functions', () => {
    expect(typeof analyzeTransientSharpness).toBe('function');
    expect(typeof quickCheck).toBe('function');
  });
  
  test('should export core analysis functions', () => {
    expect(typeof getTransientStats).toBe('function');
    expect(typeof analyzeTransientDensity).toBe('function');
    expect(typeof analyzeHighFrequencyContent).toBe('function');
    expect(typeof analyzeAttackCharacteristics).toBe('function');
  });
  
  test('should export classification functions', () => {
    expect(typeof classifySharpness).toBe('function');
    expect(typeof classifyDensity).toBe('function');
    expect(typeof calculateSharpnessIndex).toBe('function');
  });
  
  test('should export assessment functions', () => {
    expect(typeof getSharpnessDescription).toBe('function');
    expect(typeof getProcessingRecommendation).toBe('function');
    expect(typeof assessGenreAppropriateness).toBe('function');
    expect(typeof needsAttention).toBe('function');
    expect(typeof getSeverity).toBe('function');
    expect(typeof isSafeForLimiting).toBe('function');
  });
  
  test('should export utility functions', () => {
    expect(typeof getAvailableGenres).toBe('function');
  });
  
  test('should export constants', () => {
    expect(TransientSharpness).toBeDefined();
    expect(TransientDensity).toBeDefined();
    expect(SHARPNESS_THRESHOLDS).toBeDefined();
    expect(ATTACK_TIMES).toBeDefined();
    expect(GENRE_TRANSIENT_PROFILES).toBeDefined();
  });
});

// ============================================================================
// Integration Export from audioProcessor Tests
// ============================================================================

describe('audioProcessor integration', () => {
  const audioProcessor = require('../services/audioProcessor');
  
  test('should export transientSharpnessIndex from audioProcessor', () => {
    expect(audioProcessor.transientSharpnessIndex).toBeDefined();
    expect(audioProcessor.transientSharpnessIndex.analyzeTransientSharpness).toBe(analyzeTransientSharpness);
    expect(audioProcessor.transientSharpnessIndex.quickCheck).toBe(quickCheck);
  });
  
  test('should export TransientSharpness from audioProcessor', () => {
    expect(audioProcessor.transientSharpnessIndex.TransientSharpness).toEqual(TransientSharpness);
  });
  
  test('should export TransientDensity from audioProcessor', () => {
    expect(audioProcessor.transientSharpnessIndex.TransientDensity).toEqual(TransientDensity);
  });
  
  test('should export GENRE_TRANSIENT_PROFILES from audioProcessor', () => {
    expect(audioProcessor.transientSharpnessIndex.GENRE_TRANSIENT_PROFILES).toEqual(GENRE_TRANSIENT_PROFILES);
  });
});
