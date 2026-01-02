/**
 * Version Lineage Tracker Tests
 */

const {
  analyze,
  quickCheck,
  calculateDelta,
  classifyImpact,
  buildLineage,
  extractMetrics,
  inferRelation,
  calculateCumulativeImpact,
  detectPatterns,
  determineQualityTrend,
  trackDSPOperations,
  categorizeOperation,
  estimateOperationImpact,
  VersionRelation,
  ImpactLevel,
  QualityTrend,
  DSPCategory,
  THRESHOLDS
} = require('../services/versionLineageTracker');

// ============================================================================
// Test Fixtures
// ============================================================================

const originalVersion = {
  id: 'v1',
  name: 'Original Mix',
  versionNumber: 1,
  createdAt: '2024-01-01T00:00:00Z',
  integratedLoudness: -14,
  truePeak: -1,
  loudnessRange: 8,
  crestFactor: 12,
  sampleRate: 48000,
  bitDepth: 24,
  duration: 240
};

const masteredVersion = {
  id: 'v2',
  name: 'Mastered',
  versionNumber: 2,
  createdAt: '2024-01-15T00:00:00Z',
  integratedLoudness: -10,
  truePeak: -0.5,
  loudnessRange: 6,
  crestFactor: 10,
  sampleRate: 48000,
  bitDepth: 24,
  duration: 240,
  dspOperations: [
    { name: 'Limiter', category: DSPCategory.DYNAMICS },
    { name: 'EQ', category: DSPCategory.EQ }
  ]
};

const remaster = {
  id: 'v3',
  name: 'Remaster 2024',
  versionNumber: 3,
  createdAt: '2024-06-01T00:00:00Z',
  integratedLoudness: -12,
  truePeak: -1,
  loudnessRange: 7,
  crestFactor: 11,
  sampleRate: 48000,
  bitDepth: 24,
  duration: 240
};

const loudnessWarVersions = [
  { integratedLoudness: -14, truePeak: -2, loudnessRange: 10 },
  { integratedLoudness: -12, truePeak: -1.5, loudnessRange: 8 },
  { integratedLoudness: -10, truePeak: -1, loudnessRange: 6 },
  { integratedLoudness: -8, truePeak: -0.5, loudnessRange: 4 }
];

// ============================================================================
// Constants Tests
// ============================================================================

describe('Version Lineage Tracker Constants', () => {
  describe('VersionRelation', () => {
    it('should have all relation types', () => {
      expect(VersionRelation.ORIGINAL).toBe('ORIGINAL');
      expect(VersionRelation.DERIVED).toBe('DERIVED');
      expect(VersionRelation.REMASTER).toBe('REMASTER');
      expect(VersionRelation.REMIX).toBe('REMIX');
      expect(VersionRelation.ALTERNATE).toBe('ALTERNATE');
      expect(VersionRelation.REVISION).toBe('REVISION');
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(VersionRelation)).toBe(true);
    });
  });

  describe('ImpactLevel', () => {
    it('should have all impact levels', () => {
      expect(ImpactLevel.NONE).toBe('NONE');
      expect(ImpactLevel.MINIMAL).toBe('MINIMAL');
      expect(ImpactLevel.LOW).toBe('LOW');
      expect(ImpactLevel.MODERATE).toBe('MODERATE');
      expect(ImpactLevel.HIGH).toBe('HIGH');
      expect(ImpactLevel.SEVERE).toBe('SEVERE');
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(ImpactLevel)).toBe(true);
    });
  });

  describe('QualityTrend', () => {
    it('should have all trend types', () => {
      expect(QualityTrend.IMPROVING).toBe('IMPROVING');
      expect(QualityTrend.STABLE).toBe('STABLE');
      expect(QualityTrend.DEGRADING).toBe('DEGRADING');
      expect(QualityTrend.FLUCTUATING).toBe('FLUCTUATING');
    });
  });

  describe('DSPCategory', () => {
    it('should have all DSP categories', () => {
      expect(DSPCategory.DYNAMICS).toBe('DYNAMICS');
      expect(DSPCategory.EQ).toBe('EQ');
      expect(DSPCategory.LOUDNESS).toBe('LOUDNESS');
      expect(DSPCategory.SPATIAL).toBe('SPATIAL');
      expect(DSPCategory.TIME).toBe('TIME');
      expect(DSPCategory.DISTORTION).toBe('DISTORTION');
      expect(DSPCategory.RESTORATION).toBe('RESTORATION');
    });
  });

  describe('THRESHOLDS', () => {
    it('should have loudness thresholds', () => {
      expect(THRESHOLDS.LOUDNESS_CHANGE_MINIMAL).toBeDefined();
      expect(THRESHOLDS.LOUDNESS_CHANGE_SIGNIFICANT).toBeDefined();
    });

    it('should have cumulative thresholds', () => {
      expect(THRESHOLDS.CUMULATIVE_LOUDNESS_WARNING).toBeDefined();
      expect(THRESHOLDS.CUMULATIVE_PEAK_WARNING).toBeDefined();
    });

    it('should have generation thresholds', () => {
      expect(THRESHOLDS.MAX_RECOMMENDED_VERSIONS).toBeDefined();
      expect(THRESHOLDS.GENERATION_LOSS_THRESHOLD).toBeDefined();
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(THRESHOLDS)).toBe(true);
    });
  });
});

// ============================================================================
// Delta Calculation Tests
// ============================================================================

describe('calculateDelta', () => {
  it('should calculate loudness delta', () => {
    const result = calculateDelta(originalVersion, masteredVersion);
    
    expect(result.deltas.integratedLoudness).toBe(4); // -10 - (-14)
  });

  it('should calculate peak delta', () => {
    const result = calculateDelta(originalVersion, masteredVersion);
    
    expect(result.deltas.truePeak).toBe(0.5); // -0.5 - (-1)
  });

  it('should calculate loudness range delta', () => {
    const result = calculateDelta(originalVersion, masteredVersion);
    
    expect(result.deltas.loudnessRange).toBe(-2); // 6 - 8
  });

  it('should track significant changes', () => {
    const result = calculateDelta(originalVersion, masteredVersion);
    
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.hasSignificantChanges).toBe(true);
  });

  it('should classify impact level', () => {
    const result = calculateDelta(originalVersion, masteredVersion);
    
    expect([ImpactLevel.MODERATE, ImpactLevel.HIGH]).toContain(result.impactLevel);
  });

  it('should detect sample rate changes', () => {
    const downsampled = { ...originalVersion, sampleRate: 44100 };
    const result = calculateDelta(originalVersion, downsampled);
    
    expect(result.deltas.sampleRate).toBeDefined();
    expect(result.deltas.sampleRate.direction).toBe('DOWNSAMPLED');
  });

  it('should detect bit depth changes', () => {
    const reduced = { ...originalVersion, bitDepth: 16 };
    const result = calculateDelta(originalVersion, reduced);
    
    expect(result.deltas.bitDepth).toBeDefined();
    expect(result.deltas.bitDepth.direction).toBe('DECREASED');
  });

  it('should detect duration changes', () => {
    const extended = { ...originalVersion, duration: 300 };
    const result = calculateDelta(originalVersion, extended);
    
    expect(result.deltas.duration).toBe(60);
  });

  it('should generate warnings for concerning changes', () => {
    const hotMaster = { ...originalVersion, truePeak: -0.3 };
    const result = calculateDelta(originalVersion, hotMaster);
    
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('should handle missing versions', () => {
    expect(calculateDelta(null, originalVersion).error).toBeDefined();
    expect(calculateDelta(originalVersion, null).error).toBeDefined();
  });

  it('should handle minimal changes', () => {
    const tiny = { ...originalVersion, integratedLoudness: -13.7 }; // 0.3 dB change
    const result = calculateDelta(originalVersion, tiny);
    
    expect(result.impactLevel).toBe(ImpactLevel.MINIMAL);
  });
});

describe('classifyImpact', () => {
  it('should classify none for < 0.1', () => {
    expect(classifyImpact(0.05)).toBe(ImpactLevel.NONE);
  });

  it('should classify minimal for 0.1-0.5', () => {
    expect(classifyImpact(0.3)).toBe(ImpactLevel.MINIMAL);
  });

  it('should classify low for 0.5-1.5', () => {
    expect(classifyImpact(1)).toBe(ImpactLevel.LOW);
  });

  it('should classify moderate for 1.5-3', () => {
    expect(classifyImpact(2)).toBe(ImpactLevel.MODERATE);
  });

  it('should classify high for 3-6', () => {
    expect(classifyImpact(5)).toBe(ImpactLevel.HIGH);
  });

  it('should classify severe for > 6', () => {
    expect(classifyImpact(8)).toBe(ImpactLevel.SEVERE);
  });
});

// ============================================================================
// Lineage Building Tests
// ============================================================================

describe('buildLineage', () => {
  it('should build lineage from version array', () => {
    const versions = [originalVersion, masteredVersion, remaster];
    const result = buildLineage(versions);
    
    expect(result.versions).toHaveLength(3);
    expect(result.edges).toHaveLength(2);
    expect(result.root).toBe('v1');
  });

  it('should assign generation numbers', () => {
    const versions = [originalVersion, masteredVersion];
    const result = buildLineage(versions);
    
    expect(result.versions[0].generation).toBe(1);
    expect(result.versions[1].generation).toBe(2);
  });

  it('should mark first version as ORIGINAL', () => {
    const versions = [originalVersion, masteredVersion];
    const result = buildLineage(versions);
    
    expect(result.versions[0].relation).toBe(VersionRelation.ORIGINAL);
  });

  it('should infer relation types', () => {
    const versions = [originalVersion, remaster];
    const result = buildLineage(versions);
    
    expect(result.versions[1].relation).toBe(VersionRelation.REMASTER);
  });

  it('should calculate deltas for edges', () => {
    const versions = [originalVersion, masteredVersion];
    const result = buildLineage(versions);
    
    expect(result.edges[0].delta).toBeDefined();
    expect(result.edges[0].delta.deltas).toBeDefined();
  });

  it('should sort by creation date', () => {
    const unsorted = [masteredVersion, originalVersion];
    const result = buildLineage(unsorted);
    
    expect(result.versions[0].name).toBe('Original Mix');
    expect(result.versions[1].name).toBe('Mastered');
  });

  it('should handle empty array', () => {
    expect(buildLineage([]).error).toBeDefined();
  });

  it('should handle single version', () => {
    const result = buildLineage([originalVersion]);
    
    expect(result.versions).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
  });
});

describe('extractMetrics', () => {
  it('should extract standard metrics', () => {
    const metrics = extractMetrics(originalVersion);
    
    expect(metrics.integratedLoudness).toBe(-14);
    expect(metrics.truePeak).toBe(-1);
    expect(metrics.loudnessRange).toBe(8);
  });

  it('should handle alternative property names', () => {
    const altVersion = {
      integrated: -14,
      truePeakDbfs: -1,
      lra: 8
    };
    
    const metrics = extractMetrics(altVersion);
    
    expect(metrics.integratedLoudness).toBe(-14);
    expect(metrics.truePeak).toBe(-1);
    expect(metrics.loudnessRange).toBe(8);
  });
});

describe('inferRelation', () => {
  it('should detect remaster', () => {
    const child = { name: 'Remaster 2024' };
    expect(inferRelation(originalVersion, child)).toBe(VersionRelation.REMASTER);
  });

  it('should detect remix', () => {
    const child = { name: 'Club Remix' };
    expect(inferRelation(originalVersion, child)).toBe(VersionRelation.REMIX);
  });

  it('should detect alternate', () => {
    const child = { name: 'Alternate Take' };
    expect(inferRelation(originalVersion, child)).toBe(VersionRelation.ALTERNATE);
  });

  it('should detect revision', () => {
    const child = { name: 'Fix v2' };
    expect(inferRelation(originalVersion, child)).toBe(VersionRelation.REVISION);
  });

  it('should infer remix from duration change', () => {
    const child = { name: 'Version 2', duration: 360 }; // 2 min longer
    expect(inferRelation(originalVersion, child)).toBe(VersionRelation.REMIX);
  });

  it('should default to DERIVED', () => {
    const child = { name: 'Version 2' };
    expect(inferRelation(originalVersion, child)).toBe(VersionRelation.DERIVED);
  });
});

// ============================================================================
// Cumulative Impact Tests
// ============================================================================

describe('calculateCumulativeImpact', () => {
  it('should calculate total generations', () => {
    const lineage = buildLineage([originalVersion, masteredVersion, remaster]);
    const result = calculateCumulativeImpact(lineage);
    
    expect(result.generations).toBe(3);
  });

  it('should calculate cumulative deltas', () => {
    const lineage = buildLineage([originalVersion, masteredVersion]);
    const result = calculateCumulativeImpact(lineage);
    
    expect(result.cumulativeDeltas.loudness).toBeGreaterThan(0);
  });

  it('should calculate per-generation loss', () => {
    const lineage = buildLineage([originalVersion, masteredVersion, remaster]);
    const result = calculateCumulativeImpact(lineage);
    
    expect(result.perGenerationLoss).toBeDefined();
    expect(typeof result.perGenerationLoss).toBe('number');
  });

  it('should generate warnings for excessive change', () => {
    const lineage = buildLineage(loudnessWarVersions.map((v, i) => ({
      ...v,
      id: `v${i + 1}`,
      createdAt: new Date(Date.now() + i * 86400000).toISOString()
    })));
    
    const result = calculateCumulativeImpact(lineage);
    
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('should warn on excessive generations', () => {
    const manyVersions = Array(7).fill(null).map((_, i) => ({
      ...originalVersion,
      id: `v${i + 1}`,
      integratedLoudness: -14 + i * 0.5,
      createdAt: new Date(Date.now() + i * 86400000).toISOString()
    }));
    
    const lineage = buildLineage(manyVersions);
    const result = calculateCumulativeImpact(lineage);
    
    expect(result.warnings.some(w => w.type === 'EXCESSIVE_GENERATIONS')).toBe(true);
  });

  it('should handle single version', () => {
    const lineage = buildLineage([originalVersion]);
    const result = calculateCumulativeImpact(lineage);
    
    expect(result.generations).toBe(1);
    expect(result.totalImpact).toBe(0);
  });
});

// ============================================================================
// Pattern Detection Tests
// ============================================================================

describe('detectPatterns', () => {
  it('should detect loudness escalation', () => {
    const lineage = buildLineage(loudnessWarVersions.map((v, i) => ({
      ...v,
      id: `v${i + 1}`,
      createdAt: new Date(Date.now() + i * 86400000).toISOString()
    })));
    
    const result = detectPatterns(lineage);
    
    expect(result.patterns.some(p => p.type === 'LOUDNESS_ESCALATION')).toBe(true);
  });

  it('should detect dynamic compression pattern', () => {
    const compressingVersions = [
      { loudnessRange: 12 },
      { loudnessRange: 9 },
      { loudnessRange: 6 }
    ].map((v, i) => ({
      ...v,
      id: `v${i + 1}`,
      integratedLoudness: -14,
      createdAt: new Date(Date.now() + i * 86400000).toISOString()
    }));
    
    const lineage = buildLineage(compressingVersions);
    const result = detectPatterns(lineage);
    
    expect(result.patterns.some(p => p.type === 'DYNAMIC_COMPRESSION')).toBe(true);
  });

  it('should detect oscillating changes', () => {
    const oscillating = [
      { integratedLoudness: -14 },
      { integratedLoudness: -12 },
      { integratedLoudness: -15 },
      { integratedLoudness: -11 }
    ].map((v, i) => ({
      ...v,
      id: `v${i + 1}`,
      createdAt: new Date(Date.now() + i * 86400000).toISOString()
    }));
    
    const lineage = buildLineage(oscillating);
    const result = detectPatterns(lineage);
    
    expect(result.patterns.some(p => p.type === 'OSCILLATING_CHANGES')).toBe(true);
  });

  it('should detect sample rate degradation', () => {
    const degrading = [
      { sampleRate: 96000 },
      { sampleRate: 48000 },
      { sampleRate: 44100 }
    ].map((v, i) => ({
      ...v,
      id: `v${i + 1}`,
      integratedLoudness: -14,
      createdAt: new Date(Date.now() + i * 86400000).toISOString()
    }));
    
    const lineage = buildLineage(degrading);
    const result = detectPatterns(lineage);
    
    expect(result.patterns.some(p => p.type === 'SAMPLE_RATE_DEGRADATION')).toBe(true);
  });

  it('should identify quality trend', () => {
    const lineage = buildLineage([originalVersion, masteredVersion]);
    const result = detectPatterns(lineage);
    
    expect(Object.values(QualityTrend)).toContain(result.trend);
  });

  it('should handle single version', () => {
    const lineage = buildLineage([originalVersion]);
    const result = detectPatterns(lineage);
    
    expect(result.patterns).toHaveLength(0);
    expect(result.trend).toBe(QualityTrend.STABLE);
  });
});

describe('determineQualityTrend', () => {
  it('should return FLUCTUATING for oscillating patterns', () => {
    const patterns = [{ type: 'OSCILLATING_CHANGES', severity: 'WARNING' }];
    expect(determineQualityTrend({}, patterns)).toBe(QualityTrend.FLUCTUATING);
  });

  it('should return DEGRADING for warning patterns', () => {
    const patterns = [{ type: 'LOUDNESS_ESCALATION', severity: 'WARNING' }];
    expect(determineQualityTrend({}, patterns)).toBe(QualityTrend.DEGRADING);
  });

  it('should return IMPROVING for loudness reduction', () => {
    const patterns = [{ type: 'LOUDNESS_REDUCTION', severity: 'INFO' }];
    expect(determineQualityTrend({}, patterns)).toBe(QualityTrend.IMPROVING);
  });

  it('should return STABLE for no patterns', () => {
    expect(determineQualityTrend({}, [])).toBe(QualityTrend.STABLE);
  });
});

// ============================================================================
// DSP Operation Tests
// ============================================================================

describe('trackDSPOperations', () => {
  it('should track operations', () => {
    const result = trackDSPOperations(originalVersion, masteredVersion);
    
    expect(result.operations).toHaveLength(2);
    expect(result.operationCount).toBe(2);
  });

  it('should categorize operations', () => {
    const result = trackDSPOperations(originalVersion, masteredVersion);
    
    expect(result.categories[DSPCategory.DYNAMICS]).toBeDefined();
    expect(result.categories[DSPCategory.EQ]).toBeDefined();
  });

  it('should estimate impact', () => {
    const result = trackDSPOperations(originalVersion, masteredVersion);
    
    expect(Object.values(ImpactLevel)).toContain(result.estimatedImpact);
  });

  it('should handle no operations', () => {
    const result = trackDSPOperations(originalVersion, remaster);
    
    expect(result.operations).toHaveLength(0);
    expect(result.estimatedImpact).toBe(ImpactLevel.NONE);
  });
});

describe('categorizeOperation', () => {
  it('should categorize dynamics processors', () => {
    expect(categorizeOperation('Compressor')).toBe(DSPCategory.DYNAMICS);
    expect(categorizeOperation('Limiter')).toBe(DSPCategory.DYNAMICS);
    expect(categorizeOperation('Gate')).toBe(DSPCategory.DYNAMICS);
  });

  it('should categorize EQ', () => {
    expect(categorizeOperation('Parametric EQ')).toBe(DSPCategory.EQ);
    expect(categorizeOperation('High Pass Filter')).toBe(DSPCategory.EQ);
    expect(categorizeOperation('Low Shelf')).toBe(DSPCategory.EQ);
  });

  it('should categorize loudness', () => {
    expect(categorizeOperation('Gain')).toBe(DSPCategory.LOUDNESS);
    expect(categorizeOperation('Normalize')).toBe(DSPCategory.LOUDNESS);
    expect(categorizeOperation('LUFS Match')).toBe(DSPCategory.LOUDNESS);
  });

  it('should categorize spatial', () => {
    expect(categorizeOperation('Stereo Width')).toBe(DSPCategory.SPATIAL);
    expect(categorizeOperation('Pan')).toBe(DSPCategory.SPATIAL);
    expect(categorizeOperation('Mid-Side')).toBe(DSPCategory.SPATIAL);
  });

  it('should categorize time-based', () => {
    expect(categorizeOperation('Reverb')).toBe(DSPCategory.TIME);
    expect(categorizeOperation('Delay')).toBe(DSPCategory.TIME);
  });

  it('should categorize distortion', () => {
    expect(categorizeOperation('Saturation')).toBe(DSPCategory.DISTORTION);
    expect(categorizeOperation('Tape Emulation')).toBe(DSPCategory.DISTORTION);
  });

  it('should categorize restoration', () => {
    expect(categorizeOperation('DeNoise')).toBe(DSPCategory.RESTORATION);
    expect(categorizeOperation('DeClick')).toBe(DSPCategory.RESTORATION);
  });

  it('should default to OTHER', () => {
    expect(categorizeOperation('Unknown Plugin')).toBe(DSPCategory.OTHER);
  });
});

describe('estimateOperationImpact', () => {
  it('should estimate higher impact for loudness operations', () => {
    const loudness = estimateOperationImpact({ name: 'Normalize' });
    const spatial = estimateOperationImpact({ name: 'Stereo Width' });
    
    expect(loudness).toBeGreaterThan(spatial);
  });

  it('should use category if provided', () => {
    const impact = estimateOperationImpact({ 
      name: 'Custom',
      category: DSPCategory.DYNAMICS 
    });
    
    expect(impact).toBe(1.5);
  });
});

// ============================================================================
// Quick Check Tests
// ============================================================================

describe('quickCheck', () => {
  it('should return generation count', () => {
    const result = quickCheck([originalVersion, masteredVersion]);
    
    expect(result.generations).toBe(2);
  });

  it('should return impact level', () => {
    const result = quickCheck([originalVersion, masteredVersion]);
    
    expect(result.impactLevel).toBeDefined();
    expect(Object.values(ImpactLevel)).toContain(result.impactLevel);
  });

  it('should return trend', () => {
    const result = quickCheck([originalVersion, masteredVersion]);
    
    expect(Object.values(QualityTrend)).toContain(result.trend);
  });

  it('should count warnings', () => {
    const result = quickCheck(loudnessWarVersions.map((v, i) => ({
      ...v,
      id: `v${i + 1}`,
      createdAt: new Date(Date.now() + i * 86400000).toISOString()
    })));
    
    expect(result.hasWarnings).toBe(true);
    expect(result.warningCount).toBeGreaterThan(0);
  });

  it('should handle errors', () => {
    expect(quickCheck([]).error).toBeDefined();
  });
});

// ============================================================================
// Full Analysis Tests
// ============================================================================

describe('analyze', () => {
  it('should include lineage', () => {
    const result = analyze([originalVersion, masteredVersion]);
    
    expect(result.lineage).toBeDefined();
    expect(result.lineage.versions).toHaveLength(2);
  });

  it('should include version summary', () => {
    const result = analyze([originalVersion, masteredVersion]);
    
    expect(result.versionSummary).toBeDefined();
    expect(result.versionSummary).toHaveLength(2);
  });

  it('should include cumulative impact', () => {
    const result = analyze([originalVersion, masteredVersion]);
    
    expect(result.cumulativeImpact).toBeDefined();
    expect(result.cumulativeImpact.generations).toBe(2);
  });

  it('should include patterns', () => {
    const result = analyze([originalVersion, masteredVersion]);
    
    expect(result.patterns).toBeDefined();
    expect(result.trend).toBeDefined();
  });

  it('should generate recommendations', () => {
    const result = analyze(loudnessWarVersions.map((v, i) => ({
      ...v,
      id: `v${i + 1}`,
      createdAt: new Date(Date.now() + i * 86400000).toISOString()
    })));
    
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('should include summary', () => {
    const result = analyze([originalVersion, masteredVersion]);
    
    expect(result.summary).toBeDefined();
    expect(result.summary.generations).toBe(2);
    expect(result.summary.totalImpact).toBeDefined();
    expect(result.summary.trend).toBeDefined();
  });

  it('should include timestamp', () => {
    const result = analyze([originalVersion, masteredVersion]);
    
    expect(result.analyzedAt).toBeDefined();
    expect(new Date(result.analyzedAt)).toBeInstanceOf(Date);
  });

  it('should handle errors', () => {
    expect(analyze([]).error).toBeDefined();
  });
});

// ============================================================================
// Integration Scenarios
// ============================================================================

describe('Integration Scenarios', () => {
  describe('Standard Mastering Workflow', () => {
    it('should track from mix to master', () => {
      const versions = [
        { ...originalVersion, name: 'Mix' },
        { ...masteredVersion, name: 'Master' }
      ];
      
      const result = analyze(versions);
      
      expect(result.versionCount).toBe(2);
      expect(result.cumulativeImpact.impactLevel).not.toBe(ImpactLevel.SEVERE);
    });
  });

  describe('Remastering Chain', () => {
    it('should track across remaster versions', () => {
      const versions = [originalVersion, masteredVersion, remaster];
      const result = analyze(versions);
      
      expect(result.versionSummary[2].relation).toBe(VersionRelation.REMASTER);
    });
  });

  describe('Loudness War Detection', () => {
    it('should detect and warn about escalating loudness', () => {
      const result = analyze(loudnessWarVersions.map((v, i) => ({
        ...v,
        id: `v${i + 1}`,
        name: `Master v${i + 1}`,
        createdAt: new Date(Date.now() + i * 86400000).toISOString()
      })));
      
      expect(result.trend).toBe(QualityTrend.DEGRADING);
      expect(result.patterns.some(p => p.type === 'LOUDNESS_ESCALATION')).toBe(true);
    });
  });

  describe('Quality Assurance', () => {
    it('should recommend action for severe degradation', () => {
      const degradedVersions = [
        { integratedLoudness: -20, loudnessRange: 14, sampleRate: 96000 },
        { integratedLoudness: -14, loudnessRange: 10, sampleRate: 48000 },
        { integratedLoudness: -8, loudnessRange: 5, sampleRate: 44100 }
      ].map((v, i) => ({
        ...v,
        id: `v${i + 1}`,
        createdAt: new Date(Date.now() + i * 86400000).toISOString()
      }));
      
      const result = analyze(degradedVersions);
      
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations.some(r => r.priority === 'HIGH')).toBe(true);
    });
  });

  describe('Remix Tracking', () => {
    it('should identify remixes by duration change', () => {
      const versions = [
        { ...originalVersion, duration: 180 },
        { ...originalVersion, name: 'Extended', duration: 360 }
      ];
      
      const lineage = buildLineage(versions);
      
      expect(lineage.versions[1].relation).toBe(VersionRelation.REMIX);
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('should handle versions with missing metrics', () => {
    const sparse = [
      { id: 'v1', integratedLoudness: -14 },
      { id: 'v2', integratedLoudness: -12 }
    ];
    
    const result = analyze(sparse);
    
    expect(result.error).toBeUndefined();
    expect(result.versionCount).toBe(2);
  });

  it('should handle identical versions', () => {
    const identical = [originalVersion, { ...originalVersion, id: 'v2' }];
    const result = analyze(identical);
    
    expect(result.cumulativeImpact.totalImpact).toBe(0);
    expect(result.cumulativeImpact.impactLevel).toBe(ImpactLevel.NONE);
  });

  it('should handle very small changes', () => {
    const tiny = [
      { ...originalVersion },
      { ...originalVersion, id: 'v2', integratedLoudness: -13.5 } // 0.5 dB change to trigger MINIMAL
    ];
    
    const result = analyze(tiny);
    
    expect([ImpactLevel.NONE, ImpactLevel.MINIMAL, ImpactLevel.LOW])
      .toContain(result.cumulativeImpact.impactLevel);
  });

  it('should handle many generations', () => {
    const many = Array(10).fill(null).map((_, i) => ({
      id: `v${i + 1}`,
      integratedLoudness: -14 + i * 0.3,
      createdAt: new Date(Date.now() + i * 86400000).toISOString()
    }));
    
    const result = analyze(many);
    
    expect(result.versionCount).toBe(10);
    expect(result.cumulativeImpact.warnings.some(w => 
      w.type === 'EXCESSIVE_GENERATIONS'
    )).toBe(true);
  });

  it('should handle unsorted input', () => {
    const unsorted = [
      { ...remaster, createdAt: '2024-06-01T00:00:00Z' },
      { ...originalVersion, createdAt: '2024-01-01T00:00:00Z' },
      { ...masteredVersion, createdAt: '2024-03-01T00:00:00Z' }
    ];
    
    const result = analyze(unsorted);
    
    // Should be sorted by date
    expect(result.versionSummary[0].name).toBe('Original Mix');
  });
});
