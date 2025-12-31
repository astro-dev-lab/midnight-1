/**
 * Artifact Accumulation Tracker Tests
 * 
 * Tests for measuring compounding effects across processing passes.
 */

const {
  analyze,
  quickCheck,
  classify,
  calculateAccumulationScore,
  classifyAccumulationStatus,
  detectDegradationTypes,
  estimateProcessingPasses,
  calculateProcessingHeadroom,
  generateRecommendations,
  AccumulationStatus,
  DegradationType,
  STATUS_DESCRIPTIONS,
  THRESHOLDS,
  SCORE_WEIGHTS,
  ESTIMATED_PASSES
} = require('../services/artifactAccumulationTracker');

// ============================================================================
// Constants Tests
// ============================================================================

describe('ArtifactAccumulationTracker Constants', () => {
  describe('AccumulationStatus', () => {
    it('should define all status levels', () => {
      expect(AccumulationStatus.PRISTINE).toBe('PRISTINE');
      expect(AccumulationStatus.LIGHT).toBe('LIGHT');
      expect(AccumulationStatus.MODERATE).toBe('MODERATE');
      expect(AccumulationStatus.HEAVY).toBe('HEAVY');
      expect(AccumulationStatus.SATURATED).toBe('SATURATED');
    });

    it('should have exactly 5 status levels', () => {
      expect(Object.keys(AccumulationStatus)).toHaveLength(5);
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(AccumulationStatus)).toBe(true);
    });
  });

  describe('DegradationType', () => {
    it('should define all degradation types', () => {
      expect(DegradationType.DYNAMICS_LOSS).toBe('DYNAMICS_LOSS');
      expect(DegradationType.PHASE_SMEAR).toBe('PHASE_SMEAR');
      expect(DegradationType.HARMONIC_BUILDUP).toBe('HARMONIC_BUILDUP');
      expect(DegradationType.STEREO_COLLAPSE).toBe('STEREO_COLLAPSE');
      expect(DegradationType.TRANSIENT_LOSS).toBe('TRANSIENT_LOSS');
      expect(DegradationType.NOISE_FLOOR_RISE).toBe('NOISE_FLOOR_RISE');
      expect(DegradationType.QUANTIZATION).toBe('QUANTIZATION');
    });

    it('should have exactly 7 degradation types', () => {
      expect(Object.keys(DegradationType)).toHaveLength(7);
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(DegradationType)).toBe(true);
    });
  });

  describe('STATUS_DESCRIPTIONS', () => {
    it('should have descriptions for all status levels', () => {
      Object.values(AccumulationStatus).forEach(status => {
        expect(STATUS_DESCRIPTIONS[status]).toBeDefined();
        expect(typeof STATUS_DESCRIPTIONS[status]).toBe('string');
        expect(STATUS_DESCRIPTIONS[status].length).toBeGreaterThan(20);
      });
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(STATUS_DESCRIPTIONS)).toBe(true);
    });
  });

  describe('THRESHOLDS', () => {
    it('should define crest factor thresholds in descending order', () => {
      const cf = THRESHOLDS.CREST_FACTOR;
      expect(cf.PRISTINE).toBeGreaterThan(cf.LIGHT);
      expect(cf.LIGHT).toBeGreaterThan(cf.MODERATE);
      expect(cf.MODERATE).toBeGreaterThan(cf.HEAVY);
      expect(cf.HEAVY).toBeGreaterThan(cf.SATURATED);
    });

    it('should define flat factor thresholds in ascending order', () => {
      const ff = THRESHOLDS.FLAT_FACTOR;
      expect(ff.PRISTINE).toBeLessThan(ff.LIGHT);
      expect(ff.LIGHT).toBeLessThan(ff.MODERATE);
      expect(ff.MODERATE).toBeLessThan(ff.HEAVY);
      expect(ff.HEAVY).toBeLessThan(ff.SATURATED);
    });

    it('should define phase coherence thresholds in descending order', () => {
      const pc = THRESHOLDS.PHASE_COHERENCE;
      expect(pc.PRISTINE).toBeGreaterThan(pc.LIGHT);
      expect(pc.LIGHT).toBeGreaterThan(pc.MODERATE);
      expect(pc.MODERATE).toBeGreaterThan(pc.HEAVY);
      expect(pc.HEAVY).toBeGreaterThan(pc.SATURATED);
    });

    it('should define noise floor thresholds', () => {
      expect(THRESHOLDS.NOISE_FLOOR.CLEAN).toBeDefined();
      expect(THRESHOLDS.NOISE_FLOOR.ACCEPTABLE).toBeDefined();
      expect(THRESHOLDS.NOISE_FLOOR.NOISY).toBeDefined();
      expect(THRESHOLDS.NOISE_FLOOR.DEGRADED).toBeDefined();
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(THRESHOLDS)).toBe(true);
    });
  });

  describe('SCORE_WEIGHTS', () => {
    it('should sum to 1.0', () => {
      const sum = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });

    it('should have crest factor as largest weight', () => {
      const maxWeight = Math.max(...Object.values(SCORE_WEIGHTS));
      expect(SCORE_WEIGHTS.CREST_FACTOR).toBe(maxWeight);
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(SCORE_WEIGHTS)).toBe(true);
    });
  });

  describe('ESTIMATED_PASSES', () => {
    it('should have ranges for all status levels', () => {
      Object.values(AccumulationStatus).forEach(status => {
        expect(ESTIMATED_PASSES[status]).toBeDefined();
        expect(ESTIMATED_PASSES[status].min).toBeDefined();
        expect(ESTIMATED_PASSES[status].max).toBeDefined();
        expect(ESTIMATED_PASSES[status].max).toBeGreaterThanOrEqual(ESTIMATED_PASSES[status].min);
      });
    });

    it('should increase with severity', () => {
      expect(ESTIMATED_PASSES.PRISTINE.max).toBeLessThanOrEqual(ESTIMATED_PASSES.LIGHT.min + 1);
      expect(ESTIMATED_PASSES.LIGHT.max).toBeLessThanOrEqual(ESTIMATED_PASSES.MODERATE.min + 1);
      expect(ESTIMATED_PASSES.MODERATE.max).toBeLessThanOrEqual(ESTIMATED_PASSES.HEAVY.min + 1);
      expect(ESTIMATED_PASSES.HEAVY.max).toBeLessThanOrEqual(ESTIMATED_PASSES.SATURATED.min + 1);
    });
  });
});

// ============================================================================
// classifyAccumulationStatus Tests
// ============================================================================

describe('classifyAccumulationStatus', () => {
  it('should return PRISTINE for score 0', () => {
    expect(classifyAccumulationStatus(0)).toBe(AccumulationStatus.PRISTINE);
  });

  it('should return PRISTINE for score below 15', () => {
    expect(classifyAccumulationStatus(10)).toBe(AccumulationStatus.PRISTINE);
    expect(classifyAccumulationStatus(14)).toBe(AccumulationStatus.PRISTINE);
  });

  it('should return LIGHT for score 15-29', () => {
    expect(classifyAccumulationStatus(15)).toBe(AccumulationStatus.LIGHT);
    expect(classifyAccumulationStatus(20)).toBe(AccumulationStatus.LIGHT);
    expect(classifyAccumulationStatus(29)).toBe(AccumulationStatus.LIGHT);
  });

  it('should return MODERATE for score 30-49', () => {
    expect(classifyAccumulationStatus(30)).toBe(AccumulationStatus.MODERATE);
    expect(classifyAccumulationStatus(40)).toBe(AccumulationStatus.MODERATE);
    expect(classifyAccumulationStatus(49)).toBe(AccumulationStatus.MODERATE);
  });

  it('should return HEAVY for score 50-74', () => {
    expect(classifyAccumulationStatus(50)).toBe(AccumulationStatus.HEAVY);
    expect(classifyAccumulationStatus(60)).toBe(AccumulationStatus.HEAVY);
    expect(classifyAccumulationStatus(74)).toBe(AccumulationStatus.HEAVY);
  });

  it('should return SATURATED for score 75+', () => {
    expect(classifyAccumulationStatus(75)).toBe(AccumulationStatus.SATURATED);
    expect(classifyAccumulationStatus(90)).toBe(AccumulationStatus.SATURATED);
    expect(classifyAccumulationStatus(100)).toBe(AccumulationStatus.SATURATED);
  });
});

// ============================================================================
// calculateAccumulationScore Tests
// ============================================================================

describe('calculateAccumulationScore', () => {
  it('should return low score for pristine audio', () => {
    const stats = { crestFactorDb: 16, flatFactor: 0, noiseFloorDb: -70 };
    const phase = { phaseCoherence: 0.98 };
    const harmonics = { harmonicRatioDb: -50 };
    const transients = { transientPreservation: 'GOOD' };
    
    const score = calculateAccumulationScore(stats, phase, harmonics, transients);
    expect(score).toBeLessThan(15);
  });

  it('should return moderate score for processed audio', () => {
    const stats = { crestFactorDb: 8, flatFactor: 0.06, noiseFloorDb: -55 };
    const phase = { phaseCoherence: 0.75 };
    const harmonics = { harmonicRatioDb: -30 };
    const transients = { transientPreservation: 'MODERATE' };
    
    const score = calculateAccumulationScore(stats, phase, harmonics, transients);
    expect(score).toBeGreaterThanOrEqual(30);
    expect(score).toBeLessThan(60);
  });

  it('should return high score for heavily processed audio', () => {
    const stats = { crestFactorDb: 4, flatFactor: 0.2, noiseFloorDb: -45 };
    const phase = { phaseCoherence: 0.45 };
    const harmonics = { harmonicRatioDb: -20 };
    const transients = { transientPreservation: 'POOR' };
    
    const score = calculateAccumulationScore(stats, phase, harmonics, transients);
    expect(score).toBeGreaterThanOrEqual(60);
  });

  it('should return maximum score for saturated audio', () => {
    const stats = { crestFactorDb: 2, flatFactor: 0.4, noiseFloorDb: -35 };
    const phase = { phaseCoherence: 0.25 };
    const harmonics = { harmonicRatioDb: -10 };
    const transients = { transientPreservation: 'POOR' };
    
    const score = calculateAccumulationScore(stats, phase, harmonics, transients);
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it('should handle null stats gracefully', () => {
    const score = calculateAccumulationScore(null, null, null, null);
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('should handle empty objects', () => {
    const score = calculateAccumulationScore({}, {}, {}, {});
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('should clamp score to 0-100 range', () => {
    // Even with extreme values
    const stats = { crestFactorDb: -10, flatFactor: 1.0, noiseFloorDb: 0 };
    const score = calculateAccumulationScore(stats, null, null, null);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ============================================================================
// detectDegradationTypes Tests
// ============================================================================

describe('detectDegradationTypes', () => {
  it('should detect dynamics loss', () => {
    const stats = { crestFactorDb: 5 };
    const degradations = detectDegradationTypes(stats, null, null, null);
    
    const dynamicsLoss = degradations.find(d => d.type === DegradationType.DYNAMICS_LOSS);
    expect(dynamicsLoss).toBeDefined();
  });

  it('should detect severe dynamics loss', () => {
    const stats = { crestFactorDb: 3 };
    const degradations = detectDegradationTypes(stats, null, null, null);
    
    const dynamicsLoss = degradations.find(d => d.type === DegradationType.DYNAMICS_LOSS);
    expect(dynamicsLoss).toBeDefined();
    expect(dynamicsLoss.severity).toBe('SEVERE');
  });

  it('should detect phase smear', () => {
    const phase = { phaseCoherence: 0.5 };
    const degradations = detectDegradationTypes(null, phase, null, null);
    
    const phaseSmear = degradations.find(d => d.type === DegradationType.PHASE_SMEAR);
    expect(phaseSmear).toBeDefined();
  });

  it('should detect harmonic buildup', () => {
    const harmonics = { hasExcessiveHarmonics: true, harmonicRatioDb: -12 };
    const degradations = detectDegradationTypes(null, null, harmonics, null);
    
    const harmonicBuildup = degradations.find(d => d.type === DegradationType.HARMONIC_BUILDUP);
    expect(harmonicBuildup).toBeDefined();
  });

  it('should detect stereo collapse', () => {
    const phase = { isStereo: true, avgCorrelation: 0.98 };
    const degradations = detectDegradationTypes(null, phase, null, null);
    
    const stereoCollapse = degradations.find(d => d.type === DegradationType.STEREO_COLLAPSE);
    expect(stereoCollapse).toBeDefined();
  });

  it('should detect transient loss', () => {
    const transients = { transientPreservation: 'POOR', transientDensity: 0.1 };
    const degradations = detectDegradationTypes(null, null, null, transients);
    
    const transientLoss = degradations.find(d => d.type === DegradationType.TRANSIENT_LOSS);
    expect(transientLoss).toBeDefined();
  });

  it('should detect noise floor rise', () => {
    const stats = { noiseFloorDb: -45 };
    const degradations = detectDegradationTypes(stats, null, null, null);
    
    const noiseRise = degradations.find(d => d.type === DegradationType.NOISE_FLOOR_RISE);
    expect(noiseRise).toBeDefined();
  });

  it('should return empty array for pristine audio', () => {
    const stats = { crestFactorDb: 15, flatFactor: 0.001, noiseFloorDb: -70 };
    const phase = { phaseCoherence: 0.95, isStereo: true, avgCorrelation: 0.7 };
    const harmonics = { hasExcessiveHarmonics: false, harmonicRatioDb: -40 };
    const transients = { transientPreservation: 'GOOD' };
    
    const degradations = detectDegradationTypes(stats, phase, harmonics, transients);
    expect(degradations).toHaveLength(0);
  });

  it('should detect multiple degradation types', () => {
    const stats = { crestFactorDb: 4, flatFactor: 0.25, noiseFloorDb: -40 };
    const phase = { phaseCoherence: 0.4, isStereo: true, avgCorrelation: 0.99 };
    const harmonics = { hasExcessiveHarmonics: true, harmonicRatioDb: -8 };
    const transients = { transientPreservation: 'POOR', transientDensity: 0.05 };
    
    const degradations = detectDegradationTypes(stats, phase, harmonics, transients);
    expect(degradations.length).toBeGreaterThan(3);
  });

  it('should include severity and metric in each degradation', () => {
    const stats = { crestFactorDb: 4 };
    const degradations = detectDegradationTypes(stats, null, null, null);
    
    degradations.forEach(d => {
      expect(d.type).toBeDefined();
      expect(d.severity).toBeDefined();
      expect(d.metric).toBeDefined();
    });
  });
});

// ============================================================================
// estimateProcessingPasses Tests
// ============================================================================

describe('estimateProcessingPasses', () => {
  it('should return range for PRISTINE', () => {
    const result = estimateProcessingPasses(AccumulationStatus.PRISTINE);
    expect(result.min).toBe(0);
    expect(result.max).toBe(1);
    expect(result.estimate).toBeDefined();
  });

  it('should return range for LIGHT', () => {
    const result = estimateProcessingPasses(AccumulationStatus.LIGHT);
    expect(result.min).toBeGreaterThanOrEqual(1);
    expect(result.max).toBeGreaterThanOrEqual(result.min);
  });

  it('should return range for MODERATE', () => {
    const result = estimateProcessingPasses(AccumulationStatus.MODERATE);
    expect(result.min).toBeGreaterThanOrEqual(3);
  });

  it('should return range for HEAVY', () => {
    const result = estimateProcessingPasses(AccumulationStatus.HEAVY);
    expect(result.min).toBeGreaterThanOrEqual(5);
  });

  it('should return range for SATURATED', () => {
    const result = estimateProcessingPasses(AccumulationStatus.SATURATED);
    expect(result.min).toBeGreaterThanOrEqual(8);
    expect(result.max).toBeGreaterThanOrEqual(10);
  });

  it('should calculate estimate as midpoint', () => {
    const result = estimateProcessingPasses(AccumulationStatus.MODERATE);
    const expectedEstimate = Math.round((result.min + result.max) / 2);
    expect(result.estimate).toBe(expectedEstimate);
  });

  it('should handle unknown status', () => {
    const result = estimateProcessingPasses('UNKNOWN');
    expect(result.min).toBeDefined();
    expect(result.max).toBeDefined();
    expect(result.estimate).toBeDefined();
  });
});

// ============================================================================
// calculateProcessingHeadroom Tests
// ============================================================================

describe('calculateProcessingHeadroom', () => {
  it('should return 100% headroom for score 0', () => {
    const result = calculateProcessingHeadroom(0);
    expect(result.headroomPercent).toBe(100);
  });

  it('should return 0% headroom for score 100', () => {
    const result = calculateProcessingHeadroom(100);
    expect(result.headroomPercent).toBe(0);
  });

  it('should allow all processing types for high headroom', () => {
    const result = calculateProcessingHeadroom(20);
    expect(result.canAddCompression).toBe(true);
    expect(result.canAddLimiting).toBe(true);
    expect(result.canAddSaturation).toBe(true);
  });

  it('should restrict processing for low headroom', () => {
    const result = calculateProcessingHeadroom(85);
    expect(result.canAddCompression).toBe(false);
    expect(result.canAddLimiting).toBe(false);
    expect(result.canAddSaturation).toBe(false);
  });

  it('should allow compression up to 70% accumulation', () => {
    const result = calculateProcessingHeadroom(70);
    expect(result.canAddCompression).toBe(true);
    expect(result.headroomPercent).toBe(30);
  });

  it('should include recommendation', () => {
    const result = calculateProcessingHeadroom(50);
    expect(result.recommendation).toBeDefined();
    expect(typeof result.recommendation).toBe('string');
  });
});

// ============================================================================
// generateRecommendations Tests
// ============================================================================

describe('generateRecommendations', () => {
  it('should return empty array for null input', () => {
    const recommendations = generateRecommendations(null);
    expect(recommendations).toEqual([]);
  });

  it('should generate recommendations for SATURATED status', () => {
    const analysis = {
      status: AccumulationStatus.SATURATED,
      degradationTypes: [],
      headroom: { canAddLimiting: false }
    };
    
    const recommendations = generateRecommendations(analysis);
    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations.some(r => r.includes('maximum processing'))).toBe(true);
  });

  it('should generate recommendations for HEAVY status', () => {
    const analysis = {
      status: AccumulationStatus.HEAVY,
      degradationTypes: [],
      headroom: { canAddLimiting: true }
    };
    
    const recommendations = generateRecommendations(analysis);
    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations.some(r => r.includes('Heavy processing'))).toBe(true);
  });

  it('should add recommendation for dynamics loss', () => {
    const analysis = {
      status: AccumulationStatus.MODERATE,
      degradationTypes: [{ type: DegradationType.DYNAMICS_LOSS }],
      headroom: { canAddLimiting: true }
    };
    
    const recommendations = generateRecommendations(analysis);
    expect(recommendations.some(r => r.includes('compression'))).toBe(true);
  });

  it('should add recommendation for transient loss', () => {
    const analysis = {
      status: AccumulationStatus.MODERATE,
      degradationTypes: [{ type: DegradationType.TRANSIENT_LOSS }],
      headroom: { canAddLimiting: true }
    };
    
    const recommendations = generateRecommendations(analysis);
    expect(recommendations.some(r => r.includes('transient'))).toBe(true);
  });

  it('should add recommendation for phase smear', () => {
    const analysis = {
      status: AccumulationStatus.MODERATE,
      degradationTypes: [{ type: DegradationType.PHASE_SMEAR }],
      headroom: { canAddLimiting: true }
    };
    
    const recommendations = generateRecommendations(analysis);
    expect(recommendations.some(r => r.includes('stereo') || r.includes('Phase'))).toBe(true);
  });

  it('should add recommendation when limiting not allowed', () => {
    const analysis = {
      status: AccumulationStatus.MODERATE,
      degradationTypes: [],
      headroom: { canAddLimiting: false }
    };
    
    const recommendations = generateRecommendations(analysis);
    expect(recommendations.some(r => r.includes('limiting'))).toBe(true);
  });
});

// ============================================================================
// classify Tests
// ============================================================================

describe('classify', () => {
  it('should classify pristine metrics', () => {
    const metrics = {
      crestFactorDb: 16,
      flatFactor: 0,
      noiseFloorDb: -70,
      phaseCoherence: 0.98,
      harmonicRatioDb: -50,
      transientPreservation: 'GOOD'
    };
    
    const result = classify(metrics);
    expect(result.status).toBe(AccumulationStatus.PRISTINE);
    expect(result.accumulationScore).toBeLessThan(15);
  });

  it('should classify heavily processed metrics', () => {
    const metrics = {
      crestFactorDb: 4,
      flatFactor: 0.2,
      noiseFloorDb: -45,
      phaseCoherence: 0.4,
      harmonicRatioDb: -20,
      transientPreservation: 'POOR'
    };
    
    const result = classify(metrics);
    expect([AccumulationStatus.HEAVY, AccumulationStatus.SATURATED]).toContain(result.status);
    expect(result.accumulationScore).toBeGreaterThan(50);
  });

  it('should include all expected properties', () => {
    const result = classify({});
    expect(result.status).toBeDefined();
    expect(result.description).toBeDefined();
    expect(result.accumulationScore).toBeDefined();
    expect(result.estimatedPasses).toBeDefined();
    expect(result.headroom).toBeDefined();
  });

  it('should handle null input', () => {
    const result = classify(null);
    expect(result.status).toBeDefined();
    expect(result.accumulationScore).toBeGreaterThanOrEqual(0);
    expect(result.accumulationScore).toBeLessThanOrEqual(100);
  });
});

// ============================================================================
// quickCheck Tests
// ============================================================================

describe('quickCheck', () => {
  it('should return expected structure', async () => {
    // Mock a non-existent file - should handle gracefully
    const result = await quickCheck('/nonexistent/file.wav');
    
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('description');
    expect(result).toHaveProperty('accumulationScore');
    expect(result).toHaveProperty('analysisTimeMs');
    expect(result).toHaveProperty('confidence');
  });

  it('should return status from AccumulationStatus enum', async () => {
    const result = await quickCheck('/nonexistent/file.wav');
    expect(Object.values(AccumulationStatus)).toContain(result.status);
  });

  it('should include headroom percent', async () => {
    const result = await quickCheck('/nonexistent/file.wav');
    expect(result).toHaveProperty('headroomPercent');
    expect(result.headroomPercent).toBeGreaterThanOrEqual(0);
    expect(result.headroomPercent).toBeLessThanOrEqual(100);
  });

  it('should have lower confidence on error', async () => {
    const result = await quickCheck('/nonexistent/file.wav');
    expect(result.confidence).toBeLessThan(1);
  });
});

// ============================================================================
// analyze Tests
// ============================================================================

describe('analyze', () => {
  it('should return expected structure', async () => {
    const result = await analyze('/nonexistent/file.wav');
    
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('description');
    expect(result).toHaveProperty('accumulationScore');
    expect(result).toHaveProperty('analysisTimeMs');
    expect(result).toHaveProperty('confidence');
  });

  it('should return status from AccumulationStatus enum', async () => {
    const result = await analyze('/nonexistent/file.wav');
    expect(Object.values(AccumulationStatus)).toContain(result.status);
  });

  it('should include headroom when successful', async () => {
    const result = await analyze('/nonexistent/file.wav');
    // On error path, may not have full headroom object
    if (!result.error) {
      expect(result).toHaveProperty('headroom');
    }
  });

  it('should include recommendations array', async () => {
    const result = await analyze('/nonexistent/file.wav');
    if (!result.error) {
      expect(result).toHaveProperty('recommendations');
      expect(Array.isArray(result.recommendations)).toBe(true);
    }
  });

  it('should handle errors gracefully', async () => {
    const result = await analyze('/nonexistent/file.wav');
    expect(result.status).toBeDefined();
    expect(typeof result.analysisTimeMs).toBe('number');
  });
});

// ============================================================================
// Module Exports Tests
// ============================================================================

describe('Module Exports', () => {
  const exports = require('../services/artifactAccumulationTracker');

  it('should export analyze function', () => {
    expect(typeof exports.analyze).toBe('function');
  });

  it('should export quickCheck function', () => {
    expect(typeof exports.quickCheck).toBe('function');
  });

  it('should export classify function', () => {
    expect(typeof exports.classify).toBe('function');
  });

  it('should export calculateAccumulationScore function', () => {
    expect(typeof exports.calculateAccumulationScore).toBe('function');
  });

  it('should export classifyAccumulationStatus function', () => {
    expect(typeof exports.classifyAccumulationStatus).toBe('function');
  });

  it('should export detectDegradationTypes function', () => {
    expect(typeof exports.detectDegradationTypes).toBe('function');
  });

  it('should export estimateProcessingPasses function', () => {
    expect(typeof exports.estimateProcessingPasses).toBe('function');
  });

  it('should export calculateProcessingHeadroom function', () => {
    expect(typeof exports.calculateProcessingHeadroom).toBe('function');
  });

  it('should export generateRecommendations function', () => {
    expect(typeof exports.generateRecommendations).toBe('function');
  });

  it('should export AccumulationStatus enum', () => {
    expect(exports.AccumulationStatus).toBeDefined();
    expect(Object.keys(exports.AccumulationStatus).length).toBe(5);
  });

  it('should export DegradationType enum', () => {
    expect(exports.DegradationType).toBeDefined();
    expect(Object.keys(exports.DegradationType).length).toBe(7);
  });

  it('should export STATUS_DESCRIPTIONS', () => {
    expect(exports.STATUS_DESCRIPTIONS).toBeDefined();
  });

  it('should export THRESHOLDS', () => {
    expect(exports.THRESHOLDS).toBeDefined();
    expect(exports.THRESHOLDS.CREST_FACTOR).toBeDefined();
    expect(exports.THRESHOLDS.FLAT_FACTOR).toBeDefined();
    expect(exports.THRESHOLDS.PHASE_COHERENCE).toBeDefined();
  });

  it('should export SCORE_WEIGHTS', () => {
    expect(exports.SCORE_WEIGHTS).toBeDefined();
  });

  it('should export ESTIMATED_PASSES', () => {
    expect(exports.ESTIMATED_PASSES).toBeDefined();
  });

  it('should export component analysis functions', () => {
    expect(typeof exports.analyzeAudioStats).toBe('function');
    expect(typeof exports.analyzePhaseCorrelation).toBe('function');
    expect(typeof exports.analyzeHarmonicContent).toBe('function');
    expect(typeof exports.analyzeTransients).toBe('function');
  });
});
