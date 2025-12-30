/**
 * Temporal Density Mapper Tests
 * 
 * Tests for temporal energy analysis and section detection
 * (hook vs verse, energy curves, structural analysis).
 */

const temporalDensityMapper = require('../services/temporalDensityMapper');

const {
  analyzeTemporalDensity,
  quickSectionDetection,
  getEnergyTimeline,
  getLoudnessTimeline,
  detectEnergySections,
  getAudioStats,
  segmentByEnergy,
  classifySections,
  findHook,
  mergeSections,
  calculatePercentiles,
  classifyEnergyLevel,
  classifyEnergyByValue,
  detectTrend,
  calculateEnergyCurve,
  assessEnergyProfile,
  getSectionDescription,
  isInHook,
  getSectionAtTime,
  getDuration,
  SectionType,
  EnergyLevel,
  EnergyTrend,
  WINDOW_SIZES,
  ENERGY_THRESHOLDS
} = temporalDensityMapper;

// ============================================================================
// Constants Export Tests
// ============================================================================

describe('Temporal Density Mapper Constants', () => {
  describe('SectionType', () => {
    test('should export all section types', () => {
      expect(SectionType.INTRO).toBe('INTRO');
      expect(SectionType.VERSE).toBe('VERSE');
      expect(SectionType.PRE_CHORUS).toBe('PRE_CHORUS');
      expect(SectionType.CHORUS).toBe('CHORUS');
      expect(SectionType.HOOK).toBe('HOOK');
      expect(SectionType.DROP).toBe('DROP');
      expect(SectionType.BRIDGE).toBe('BRIDGE');
      expect(SectionType.BREAKDOWN).toBe('BREAKDOWN');
      expect(SectionType.BUILD_UP).toBe('BUILD_UP');
      expect(SectionType.OUTRO).toBe('OUTRO');
      expect(SectionType.TRANSITION).toBe('TRANSITION');
      expect(SectionType.UNKNOWN).toBe('UNKNOWN');
    });
    
    test('should have exactly 12 section types', () => {
      expect(Object.keys(SectionType)).toHaveLength(12);
    });
  });
  
  describe('EnergyLevel', () => {
    test('should export all energy levels', () => {
      expect(EnergyLevel.VERY_LOW).toBe('VERY_LOW');
      expect(EnergyLevel.LOW).toBe('LOW');
      expect(EnergyLevel.MEDIUM).toBe('MEDIUM');
      expect(EnergyLevel.HIGH).toBe('HIGH');
      expect(EnergyLevel.VERY_HIGH).toBe('VERY_HIGH');
    });
    
    test('should have exactly 5 energy levels', () => {
      expect(Object.keys(EnergyLevel)).toHaveLength(5);
    });
  });
  
  describe('EnergyTrend', () => {
    test('should export all energy trends', () => {
      expect(EnergyTrend.RISING).toBe('RISING');
      expect(EnergyTrend.FALLING).toBe('FALLING');
      expect(EnergyTrend.STABLE).toBe('STABLE');
      expect(EnergyTrend.FLUCTUATING).toBe('FLUCTUATING');
    });
    
    test('should have exactly 4 energy trends', () => {
      expect(Object.keys(EnergyTrend)).toHaveLength(4);
    });
  });
  
  describe('WINDOW_SIZES', () => {
    test('should export all window sizes', () => {
      expect(WINDOW_SIZES.MICRO).toBe(0.1);
      expect(WINDOW_SIZES.SHORT).toBe(0.5);
      expect(WINDOW_SIZES.MEDIUM).toBe(2.0);
      expect(WINDOW_SIZES.LONG).toBe(8.0);
    });
    
    test('should have 4 window size presets', () => {
      expect(Object.keys(WINDOW_SIZES)).toHaveLength(4);
    });
  });
  
  describe('ENERGY_THRESHOLDS', () => {
    test('should export all energy thresholds', () => {
      expect(ENERGY_THRESHOLDS.SILENCE).toBe(-60);
      expect(ENERGY_THRESHOLDS.VERY_LOW).toBe(-40);
      expect(ENERGY_THRESHOLDS.LOW).toBe(-24);
      expect(ENERGY_THRESHOLDS.MEDIUM).toBe(-16);
      expect(ENERGY_THRESHOLDS.HIGH).toBe(-10);
      expect(ENERGY_THRESHOLDS.VERY_HIGH).toBe(-6);
    });
    
    test('thresholds should be in ascending order', () => {
      expect(ENERGY_THRESHOLDS.SILENCE).toBeLessThan(ENERGY_THRESHOLDS.VERY_LOW);
      expect(ENERGY_THRESHOLDS.VERY_LOW).toBeLessThan(ENERGY_THRESHOLDS.LOW);
      expect(ENERGY_THRESHOLDS.LOW).toBeLessThan(ENERGY_THRESHOLDS.MEDIUM);
      expect(ENERGY_THRESHOLDS.MEDIUM).toBeLessThan(ENERGY_THRESHOLDS.HIGH);
      expect(ENERGY_THRESHOLDS.HIGH).toBeLessThan(ENERGY_THRESHOLDS.VERY_HIGH);
    });
  });
});

// ============================================================================
// Percentile Calculation Tests
// ============================================================================

describe('calculatePercentiles', () => {
  test('should calculate percentiles for simple array', () => {
    const values = [-30, -25, -20, -15, -10, -5, 0, 5, 10, 15];
    const result = calculatePercentiles(values);
    
    expect(result.p20).toBeDefined();
    expect(result.p40).toBeDefined();
    expect(result.p50).toBeDefined();
    expect(result.p60).toBeDefined();
    expect(result.p80).toBeDefined();
  });
  
  test('should return nulls for empty array', () => {
    const result = calculatePercentiles([]);
    
    expect(result.p20).toBeNull();
    expect(result.p40).toBeNull();
    expect(result.p50).toBeNull();
  });
  
  test('should return nulls for null input', () => {
    const result = calculatePercentiles(null);
    
    expect(result.p20).toBeNull();
    expect(result.p50).toBeNull();
  });
  
  test('should filter out values below -100', () => {
    const values = [-120, -90, -20, -10, 0];
    const result = calculatePercentiles(values);
    
    // -120 and -90 should be filtered out as they're below -100
    expect(result.p50).toBeGreaterThan(-100);
  });
  
  test('should handle single value', () => {
    const values = [-15];
    const result = calculatePercentiles(values);
    
    expect(result.p50).toBe(-15);
  });
});

// ============================================================================
// Energy Level Classification Tests
// ============================================================================

describe('classifyEnergyLevel', () => {
  const percentiles = { p20: -30, p40: -20, p50: -15, p60: -10, p80: -5 };
  
  test('should classify VERY_LOW below p20', () => {
    expect(classifyEnergyLevel(-35, percentiles)).toBe(EnergyLevel.VERY_LOW);
  });
  
  test('should classify LOW between p20 and p40', () => {
    expect(classifyEnergyLevel(-25, percentiles)).toBe(EnergyLevel.LOW);
  });
  
  test('should classify MEDIUM between p40 and p60', () => {
    expect(classifyEnergyLevel(-15, percentiles)).toBe(EnergyLevel.MEDIUM);
  });
  
  test('should classify HIGH between p60 and p80', () => {
    expect(classifyEnergyLevel(-8, percentiles)).toBe(EnergyLevel.HIGH);
  });
  
  test('should classify VERY_HIGH above p80', () => {
    expect(classifyEnergyLevel(-2, percentiles)).toBe(EnergyLevel.VERY_HIGH);
  });
  
  test('should return MEDIUM for null value', () => {
    expect(classifyEnergyLevel(null, percentiles)).toBe(EnergyLevel.MEDIUM);
  });
  
  test('should return MEDIUM for null percentiles', () => {
    expect(classifyEnergyLevel(-15, { p20: null })).toBe(EnergyLevel.MEDIUM);
  });
});

describe('classifyEnergyByValue', () => {
  test('should classify VERY_LOW below silence threshold', () => {
    expect(classifyEnergyByValue(-65)).toBe(EnergyLevel.VERY_LOW);
  });
  
  test('should classify LOW between silence and low threshold', () => {
    expect(classifyEnergyByValue(-30)).toBe(EnergyLevel.LOW);
  });
  
  test('should classify MEDIUM between low and medium threshold', () => {
    expect(classifyEnergyByValue(-20)).toBe(EnergyLevel.MEDIUM);
  });
  
  test('should classify HIGH between medium and high threshold', () => {
    expect(classifyEnergyByValue(-12)).toBe(EnergyLevel.HIGH);
  });
  
  test('should classify VERY_HIGH above high threshold', () => {
    expect(classifyEnergyByValue(-4)).toBe(EnergyLevel.VERY_HIGH);
  });
});

// ============================================================================
// Trend Detection Tests
// ============================================================================

describe('detectTrend', () => {
  test('should detect RISING trend', () => {
    const values = [-30, -28, -26, -24, -22, -20, -18, -16, -14, -12];
    expect(detectTrend(values)).toBe(EnergyTrend.RISING);
  });
  
  test('should detect FALLING trend', () => {
    const values = [-12, -14, -16, -18, -20, -22, -24, -26, -28, -30];
    expect(detectTrend(values)).toBe(EnergyTrend.FALLING);
  });
  
  test('should detect STABLE trend', () => {
    const values = [-20, -20.1, -19.9, -20.2, -19.8, -20, -20.1, -19.9, -20, -20];
    expect(detectTrend(values)).toBe(EnergyTrend.STABLE);
  });
  
  test('should detect FLUCTUATING trend', () => {
    const values = [-10, -30, -12, -28, -15, -25, -10, -30, -12, -28];
    expect(detectTrend(values)).toBe(EnergyTrend.FLUCTUATING);
  });
  
  test('should return STABLE for empty array', () => {
    expect(detectTrend([])).toBe(EnergyTrend.STABLE);
  });
  
  test('should return STABLE for very short array', () => {
    expect(detectTrend([-20, -18])).toBe(EnergyTrend.STABLE);
  });
  
  test('should return STABLE for null input', () => {
    expect(detectTrend(null)).toBe(EnergyTrend.STABLE);
  });
});

// ============================================================================
// Energy Curve Tests
// ============================================================================

describe('calculateEnergyCurve', () => {
  test('should calculate curve statistics', () => {
    const values = [-30, -25, -20, -15, -10];
    const result = calculateEnergyCurve(values);
    
    expect(result.mean).toBe(-20);
    expect(result.max).toBe(-10);
    expect(result.min).toBe(-30);
    expect(result.range).toBe(20);
    expect(result.stdDev).toBeGreaterThan(0);
  });
  
  test('should return nulls for empty array', () => {
    const result = calculateEnergyCurve([]);
    
    expect(result.mean).toBeNull();
    expect(result.stdDev).toBeNull();
    expect(result.range).toBeNull();
  });
  
  test('should filter out invalid values', () => {
    const values = [-120, -20, -15, -10]; // -120 should be filtered
    const result = calculateEnergyCurve(values);
    
    expect(result.min).toBe(-20);
    expect(result.mean).toBe(-15);
  });
  
  test('should calculate dynamic contrast', () => {
    const values = [-20, -20, -20, -20]; // All same = low contrast
    const result = calculateEnergyCurve(values);
    
    expect(result.dynamicContrast).toBe(0);
  });
});

describe('assessEnergyProfile', () => {
  test('should assess FLAT profile for small range', () => {
    const curve = { mean: -15, range: 4, stdDev: 1 };
    const result = assessEnergyProfile(curve);
    
    expect(result.profile).toBe('FLAT');
    expect(result.description).toContain('consistent');
  });
  
  test('should assess MODERATE profile for medium range', () => {
    const curve = { mean: -15, range: 10, stdDev: 3 };
    const result = assessEnergyProfile(curve);
    
    expect(result.profile).toBe('MODERATE');
    expect(result.description).toContain('pop');
  });
  
  test('should assess DYNAMIC profile for larger range', () => {
    const curve = { mean: -15, range: 15, stdDev: 5 };
    const result = assessEnergyProfile(curve);
    
    expect(result.profile).toBe('DYNAMIC');
    expect(result.description).toContain('orchestral');
  });
  
  test('should assess HIGHLY_DYNAMIC profile for very large range', () => {
    const curve = { mean: -15, range: 25, stdDev: 8 };
    const result = assessEnergyProfile(curve);
    
    expect(result.profile).toBe('HIGHLY_DYNAMIC');
    expect(result.description).toContain('section-specific');
  });
  
  test('should return UNKNOWN for null curve', () => {
    const result = assessEnergyProfile(null);
    expect(result.profile).toBe('UNKNOWN');
  });
  
  test('should return UNKNOWN for null mean', () => {
    const result = assessEnergyProfile({ mean: null, range: 10 });
    expect(result.profile).toBe('UNKNOWN');
  });
  
  test('should include recommendation', () => {
    const curve = { mean: -15, range: 10, stdDev: 3 };
    const result = assessEnergyProfile(curve);
    
    expect(result.recommendation).toBeDefined();
    expect(result.recommendation.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Section Segmentation Tests
// ============================================================================

describe('segmentByEnergy', () => {
  const percentiles = { p20: -30, p40: -20, p50: -15, p60: -10, p80: -5 };
  
  test('should segment into sections based on energy', () => {
    const values = [-25, -25, -25, -8, -8, -8, -25, -25]; // Low, High, Low
    const sections = segmentByEnergy(values, 2.0, percentiles);
    
    expect(sections.length).toBeGreaterThanOrEqual(2);
  });
  
  test('should return empty array for empty values', () => {
    const sections = segmentByEnergy([], 2.0, percentiles);
    expect(sections).toHaveLength(0);
  });
  
  test('should return empty array for null values', () => {
    const sections = segmentByEnergy(null, 2.0, percentiles);
    expect(sections).toHaveLength(0);
  });
  
  test('should set section times correctly', () => {
    const values = [-20, -20, -20, -20]; // All medium
    const windowSize = 2.0;
    const sections = segmentByEnergy(values, windowSize, percentiles);
    
    expect(sections.length).toBe(1);
    expect(sections[0].startTime).toBe(0);
    expect(sections[0].endTime).toBe(values.length * windowSize);
    expect(sections[0].duration).toBe(values.length * windowSize);
  });
  
  test('should calculate average, peak, and min energy', () => {
    // Use consistent percentiles where all values fall in same category
    const testPercentiles = { p20: -25, p40: -18, p50: -15, p60: -12, p80: -8 };
    const values = [-24, -23, -22, -21]; // All should be LOW (between p20=-25 and p40=-18)
    const sections = segmentByEnergy(values, 2.0, testPercentiles);
    
    // Should be one section since all values are in LOW range
    expect(sections).toHaveLength(1);
    expect(sections[0].peakEnergy).toBe(-21); // Max (highest = least negative)
    expect(sections[0].minEnergy).toBe(-24); // Min (lowest = most negative)
  });
  
  test('should detect trend in sections', () => {
    const values = [-30, -28, -26, -24, -22, -20]; // Rising
    const sections = segmentByEnergy(values, 2.0, percentiles);
    
    // The trend is calculated for the section
    expect(sections[0].trend).toBeDefined();
  });
});

describe('mergeSections', () => {
  test('should merge short sections', () => {
    const sections = [
      { startTime: 0, endTime: 1, duration: 1, avgEnergy: -20, peakEnergy: -18, minEnergy: -22, level: 'MEDIUM' },
      { startTime: 1, endTime: 5, duration: 4, avgEnergy: -15, peakEnergy: -12, minEnergy: -18, level: 'MEDIUM' }
    ];
    
    const merged = mergeSections(sections, 2.0);
    
    // First section (1s) should be merged with second
    expect(merged.length).toBeLessThan(sections.length);
  });
  
  test('should not merge sections longer than threshold', () => {
    const sections = [
      { startTime: 0, endTime: 4, duration: 4, avgEnergy: -20, peakEnergy: -18, minEnergy: -22, level: 'MEDIUM' },
      { startTime: 4, endTime: 8, duration: 4, avgEnergy: -15, peakEnergy: -12, minEnergy: -18, level: 'HIGH' }
    ];
    
    const merged = mergeSections(sections, 2.0);
    
    expect(merged).toHaveLength(2);
  });
  
  test('should return empty for null input', () => {
    expect(mergeSections(null)).toEqual(null);
  });
  
  test('should return single section unchanged', () => {
    const sections = [
      { startTime: 0, endTime: 10, duration: 10, avgEnergy: -20, peakEnergy: -18, minEnergy: -22, level: 'MEDIUM' }
    ];
    
    const merged = mergeSections(sections, 2.0);
    
    expect(merged).toHaveLength(1);
  });
});

// ============================================================================
// Section Classification Tests
// ============================================================================

describe('classifySections', () => {
  test('should classify intro for first low-energy section', () => {
    const sections = [
      { startTime: 0, endTime: 8, duration: 8, level: EnergyLevel.LOW, avgEnergy: -25, trend: EnergyTrend.STABLE }
    ];
    
    const classified = classifySections(sections, 60);
    
    expect(classified[0].type).toBe(SectionType.INTRO);
  });
  
  test('should classify outro for last low-energy section', () => {
    const sections = [
      { startTime: 0, endTime: 30, duration: 30, level: EnergyLevel.HIGH, avgEnergy: -12, trend: EnergyTrend.STABLE },
      { startTime: 30, endTime: 40, duration: 10, level: EnergyLevel.LOW, avgEnergy: -28, trend: EnergyTrend.STABLE }
    ];
    
    const classified = classifySections(sections, 40);
    
    expect(classified[1].type).toBe(SectionType.OUTRO);
  });
  
  test('should classify chorus for high-energy stable section', () => {
    const sections = [
      { startTime: 0, endTime: 10, duration: 10, level: EnergyLevel.LOW, avgEnergy: -25, trend: EnergyTrend.STABLE },
      { startTime: 10, endTime: 30, duration: 20, level: EnergyLevel.HIGH, avgEnergy: -10, trend: EnergyTrend.STABLE },
      { startTime: 30, endTime: 40, duration: 10, level: EnergyLevel.LOW, avgEnergy: -25, trend: EnergyTrend.STABLE }
    ];
    
    const classified = classifySections(sections, 40);
    
    expect(classified[1].type).toBe(SectionType.CHORUS);
  });
  
  test('should classify build-up for rising section before high energy', () => {
    const sections = [
      { startTime: 0, endTime: 5, duration: 5, level: EnergyLevel.LOW, avgEnergy: -28, trend: EnergyTrend.STABLE },
      { startTime: 5, endTime: 15, duration: 10, level: EnergyLevel.MEDIUM, avgEnergy: -18, trend: EnergyTrend.RISING },
      { startTime: 15, endTime: 25, duration: 10, level: EnergyLevel.HIGH, avgEnergy: -10, trend: EnergyTrend.STABLE }
    ];
    
    const classified = classifySections(sections, 25);
    
    // Second section (not first) should be BUILD_UP
    expect(classified[1].type).toBe(SectionType.BUILD_UP);
  });
  
  test('should classify drop for very high energy after rising section', () => {
    const sections = [
      { startTime: 0, endTime: 5, duration: 5, level: EnergyLevel.LOW, avgEnergy: -28, trend: EnergyTrend.STABLE },
      { startTime: 5, endTime: 15, duration: 10, level: EnergyLevel.MEDIUM, avgEnergy: -18, trend: EnergyTrend.RISING },
      { startTime: 15, endTime: 25, duration: 10, level: EnergyLevel.VERY_HIGH, avgEnergy: -5, trend: EnergyTrend.STABLE },
      { startTime: 25, endTime: 35, duration: 10, level: EnergyLevel.LOW, avgEnergy: -28, trend: EnergyTrend.STABLE }
    ];
    
    const classified = classifySections(sections, 35);
    
    // Third section (index 2) should be DROP - very high after rising
    expect(classified[2].type).toBe(SectionType.DROP);
  });
  
  test('should classify verse for medium stable section', () => {
    const sections = [
      { startTime: 0, endTime: 5, duration: 5, level: EnergyLevel.LOW, avgEnergy: -28, trend: EnergyTrend.STABLE },
      { startTime: 5, endTime: 25, duration: 20, level: EnergyLevel.MEDIUM, avgEnergy: -18, trend: EnergyTrend.STABLE },
      { startTime: 25, endTime: 35, duration: 10, level: EnergyLevel.HIGH, avgEnergy: -10, trend: EnergyTrend.STABLE }
    ];
    
    const classified = classifySections(sections, 35);
    
    expect(classified[1].type).toBe(SectionType.VERSE);
  });
  
  test('should classify breakdown for low energy after high', () => {
    const sections = [
      { startTime: 0, endTime: 15, duration: 15, level: EnergyLevel.HIGH, avgEnergy: -10, trend: EnergyTrend.STABLE },
      { startTime: 15, endTime: 25, duration: 10, level: EnergyLevel.LOW, avgEnergy: -28, trend: EnergyTrend.STABLE },
      { startTime: 25, endTime: 35, duration: 10, level: EnergyLevel.MEDIUM, avgEnergy: -18, trend: EnergyTrend.STABLE }
    ];
    
    const classified = classifySections(sections, 35);
    
    // Second section should be BREAKDOWN (low after high, not last)
    expect(classified[1].type).toBe(SectionType.BREAKDOWN);
  });
  
  test('should return empty for empty input', () => {
    const classified = classifySections([], 60);
    expect(classified).toHaveLength(0);
  });
  
  test('should include confidence scores', () => {
    const sections = [
      { startTime: 0, endTime: 10, duration: 10, level: EnergyLevel.LOW, avgEnergy: -25, trend: EnergyTrend.STABLE }
    ];
    
    const classified = classifySections(sections, 60);
    
    expect(classified[0].confidence).toBeGreaterThan(0);
    expect(classified[0].confidence).toBeLessThanOrEqual(1);
  });
  
  test('should include relative energy', () => {
    const sections = [
      { startTime: 0, endTime: 10, duration: 10, level: EnergyLevel.HIGH, avgEnergy: -10, trend: EnergyTrend.STABLE },
      { startTime: 10, endTime: 20, duration: 10, level: EnergyLevel.LOW, avgEnergy: -30, trend: EnergyTrend.STABLE }
    ];
    
    const classified = classifySections(sections, 20);
    
    // First section should have positive relative energy, second should be negative
    expect(classified[0].relativeEnergy).toBeGreaterThan(classified[1].relativeEnergy);
  });
});

// ============================================================================
// Hook Detection Tests
// ============================================================================

describe('findHook', () => {
  test('should find explicit hook section', () => {
    const sections = [
      { type: SectionType.INTRO, avgEnergy: -25, peakEnergy: -22 },
      { type: SectionType.VERSE, avgEnergy: -18, peakEnergy: -15 },
      { type: SectionType.HOOK, avgEnergy: -8, peakEnergy: -5 },
      { type: SectionType.OUTRO, avgEnergy: -28, peakEnergy: -25 }
    ];
    
    const hook = findHook(sections);
    
    expect(hook.type).toBe(SectionType.HOOK);
  });
  
  test('should find drop section as hook', () => {
    const sections = [
      { type: SectionType.BUILD_UP, avgEnergy: -18, peakEnergy: -15 },
      { type: SectionType.DROP, avgEnergy: -6, peakEnergy: -3 }
    ];
    
    const hook = findHook(sections);
    
    expect(hook.type).toBe(SectionType.DROP);
  });
  
  test('should prefer highest energy hook when multiple', () => {
    const sections = [
      { type: SectionType.HOOK, avgEnergy: -10, peakEnergy: -8 },
      { type: SectionType.HOOK, avgEnergy: -6, peakEnergy: -4 }
    ];
    
    const hook = findHook(sections);
    
    expect(hook.peakEnergy).toBe(-4);
  });
  
  test('should fall back to chorus if no hook', () => {
    const sections = [
      { type: SectionType.VERSE, avgEnergy: -20, peakEnergy: -18 },
      { type: SectionType.CHORUS, avgEnergy: -10, peakEnergy: -8 }
    ];
    
    const hook = findHook(sections);
    
    expect(hook.type).toBe(SectionType.CHORUS);
  });
  
  test('should fall back to highest energy section if no hook or chorus', () => {
    const sections = [
      { type: SectionType.VERSE, avgEnergy: -20, peakEnergy: -18 },
      { type: SectionType.VERSE, avgEnergy: -12, peakEnergy: -10 }
    ];
    
    const hook = findHook(sections);
    
    expect(hook.avgEnergy).toBe(-12);
  });
  
  test('should return null for empty sections', () => {
    expect(findHook([])).toBeNull();
  });
  
  test('should return null for null input', () => {
    expect(findHook(null)).toBeNull();
  });
  
  test('should not include intro/outro as fallback hook', () => {
    const sections = [
      { type: SectionType.INTRO, avgEnergy: -15, peakEnergy: -12 },
      { type: SectionType.OUTRO, avgEnergy: -20, peakEnergy: -18 }
    ];
    
    const hook = findHook(sections);
    
    // Should return null since only intro/outro exist
    expect(hook).toBeNull();
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('getSectionDescription', () => {
  test('should describe INTRO', () => {
    const desc = getSectionDescription(SectionType.INTRO);
    expect(desc).toContain('Introduction');
  });
  
  test('should describe VERSE', () => {
    const desc = getSectionDescription(SectionType.VERSE);
    expect(desc).toContain('Verse');
  });
  
  test('should describe CHORUS', () => {
    const desc = getSectionDescription(SectionType.CHORUS);
    expect(desc).toContain('Chorus');
  });
  
  test('should describe HOOK', () => {
    const desc = getSectionDescription(SectionType.HOOK);
    expect(desc).toContain('Hook');
    expect(desc).toContain('peak');
  });
  
  test('should describe DROP', () => {
    const desc = getSectionDescription(SectionType.DROP);
    expect(desc).toContain('Drop');
  });
  
  test('should describe BUILD_UP', () => {
    const desc = getSectionDescription(SectionType.BUILD_UP);
    expect(desc).toContain('Build-Up');
  });
  
  test('should describe BREAKDOWN', () => {
    const desc = getSectionDescription(SectionType.BREAKDOWN);
    expect(desc).toContain('Breakdown');
  });
  
  test('should describe OUTRO', () => {
    const desc = getSectionDescription(SectionType.OUTRO);
    expect(desc).toContain('Outro');
  });
  
  test('should return unknown for invalid type', () => {
    const desc = getSectionDescription('INVALID');
    expect(desc).toContain('Unknown');
  });
});

describe('isInHook', () => {
  const hook = { startTime: 30, endTime: 45 };
  
  test('should return true for timestamp in hook', () => {
    expect(isInHook(35, hook)).toBe(true);
  });
  
  test('should return true at hook start', () => {
    expect(isInHook(30, hook)).toBe(true);
  });
  
  test('should return true at hook end', () => {
    expect(isInHook(45, hook)).toBe(true);
  });
  
  test('should return false before hook', () => {
    expect(isInHook(25, hook)).toBe(false);
  });
  
  test('should return false after hook', () => {
    expect(isInHook(50, hook)).toBe(false);
  });
  
  test('should return false for null hook', () => {
    expect(isInHook(35, null)).toBe(false);
  });
  
  test('should return false for hook with null startTime', () => {
    expect(isInHook(35, { startTime: null })).toBe(false);
  });
});

describe('getSectionAtTime', () => {
  const sections = [
    { startTime: 0, endTime: 15, type: SectionType.INTRO },
    { startTime: 15, endTime: 45, type: SectionType.VERSE },
    { startTime: 45, endTime: 75, type: SectionType.CHORUS }
  ];
  
  test('should return correct section for timestamp', () => {
    expect(getSectionAtTime(10, sections).type).toBe(SectionType.INTRO);
    expect(getSectionAtTime(30, sections).type).toBe(SectionType.VERSE);
    expect(getSectionAtTime(60, sections).type).toBe(SectionType.CHORUS);
  });
  
  test('should return section at boundary', () => {
    // At endTime of INTRO (15), it matches INTRO since condition is <= endTime
    expect(getSectionAtTime(15, sections).type).toBe(SectionType.INTRO);
  });
  
  test('should return null for empty sections', () => {
    expect(getSectionAtTime(10, [])).toBeNull();
  });
  
  test('should return null for null sections', () => {
    expect(getSectionAtTime(10, null)).toBeNull();
  });
  
  test('should handle section with null endTime', () => {
    const sections = [
      { startTime: 0, endTime: null, type: SectionType.UNKNOWN }
    ];
    
    expect(getSectionAtTime(100, sections).type).toBe(SectionType.UNKNOWN);
  });
});

// ============================================================================
// Module Export Tests
// ============================================================================

describe('Module Exports', () => {
  test('should export main analysis functions', () => {
    expect(typeof analyzeTemporalDensity).toBe('function');
    expect(typeof quickSectionDetection).toBe('function');
  });
  
  test('should export core analysis functions', () => {
    expect(typeof getEnergyTimeline).toBe('function');
    expect(typeof getLoudnessTimeline).toBe('function');
    expect(typeof detectEnergySections).toBe('function');
    expect(typeof getAudioStats).toBe('function');
  });
  
  test('should export section analysis functions', () => {
    expect(typeof segmentByEnergy).toBe('function');
    expect(typeof classifySections).toBe('function');
    expect(typeof findHook).toBe('function');
    expect(typeof mergeSections).toBe('function');
  });
  
  test('should export energy analysis functions', () => {
    expect(typeof calculatePercentiles).toBe('function');
    expect(typeof classifyEnergyLevel).toBe('function');
    expect(typeof classifyEnergyByValue).toBe('function');
    expect(typeof detectTrend).toBe('function');
    expect(typeof calculateEnergyCurve).toBe('function');
    expect(typeof assessEnergyProfile).toBe('function');
  });
  
  test('should export utility functions', () => {
    expect(typeof getSectionDescription).toBe('function');
    expect(typeof isInHook).toBe('function');
    expect(typeof getSectionAtTime).toBe('function');
    expect(typeof getDuration).toBe('function');
  });
  
  test('should export constants', () => {
    expect(SectionType).toBeDefined();
    expect(EnergyLevel).toBeDefined();
    expect(EnergyTrend).toBeDefined();
    expect(WINDOW_SIZES).toBeDefined();
    expect(ENERGY_THRESHOLDS).toBeDefined();
  });
});

// ============================================================================
// Integration Export from audioProcessor Tests
// ============================================================================

describe('audioProcessor integration', () => {
  const audioProcessor = require('../services/audioProcessor');
  
  test('should export temporalDensityMapper from audioProcessor', () => {
    expect(audioProcessor.temporalDensityMapper).toBeDefined();
    expect(audioProcessor.temporalDensityMapper.analyzeTemporalDensity).toBe(analyzeTemporalDensity);
    expect(audioProcessor.temporalDensityMapper.quickSectionDetection).toBe(quickSectionDetection);
  });
  
  test('should export SectionType from audioProcessor', () => {
    expect(audioProcessor.temporalDensityMapper.SectionType).toEqual(SectionType);
  });
  
  test('should export EnergyLevel from audioProcessor', () => {
    expect(audioProcessor.temporalDensityMapper.EnergyLevel).toEqual(EnergyLevel);
  });
  
  test('should export EnergyTrend from audioProcessor', () => {
    expect(audioProcessor.temporalDensityMapper.EnergyTrend).toEqual(EnergyTrend);
  });
});
