/**
 * Multi-Pass Risk Accumulator Tests
 * 
 * Tests for tracking and penalizing repeated processing
 * across multiple jobs with composite risk scoring.
 */

const {
  // Main analysis functions
  calculateRisk,
  evaluateProposedJob,
  quickCheck,
  
  // Score calculation
  calculateRiskScore,
  calculateBaseScore,
  calculateRepeatPenalty,
  classifyRiskLevel,
  calculateHeadroom,
  
  // Utility functions
  getPresetCategory,
  getCategoryWeight,
  getRepeatPenalty,
  countByCategory,
  countDestructivePasses,
  
  // Recommendations
  generateRecommendations,
  estimateFromMetrics,
  
  // Constants
  RiskLevel,
  ProcessingCategory,
  RISK_DESCRIPTIONS,
  PRESET_CATEGORY_MAP,
  CATEGORY_WEIGHTS,
  REPEAT_PENALTIES,
  THRESHOLDS
} = require('../services/multiPassRiskAccumulator');

// ============================================================================
// Constants Tests
// ============================================================================

describe('Multi-Pass Risk Accumulator', () => {
  describe('Constants', () => {
    describe('RiskLevel', () => {
      it('should have all risk levels defined', () => {
        expect(RiskLevel.PRISTINE).toBe('PRISTINE');
        expect(RiskLevel.LOW).toBe('LOW');
        expect(RiskLevel.MODERATE).toBe('MODERATE');
        expect(RiskLevel.HIGH).toBe('HIGH');
        expect(RiskLevel.EXCESSIVE).toBe('EXCESSIVE');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(RiskLevel)).toBe(true);
      });

      it('should have 5 levels', () => {
        expect(Object.keys(RiskLevel)).toHaveLength(5);
      });
    });

    describe('ProcessingCategory', () => {
      it('should have all categories defined', () => {
        expect(ProcessingCategory.ANALYSIS).toBe('ANALYSIS');
        expect(ProcessingCategory.RESTORATION).toBe('RESTORATION');
        expect(ProcessingCategory.NORMALIZATION).toBe('NORMALIZATION');
        expect(ProcessingCategory.EQ).toBe('EQ');
        expect(ProcessingCategory.DYNAMICS).toBe('DYNAMICS');
        expect(ProcessingCategory.MASTERING).toBe('MASTERING');
        expect(ProcessingCategory.STEREO).toBe('STEREO');
        expect(ProcessingCategory.FORMAT).toBe('FORMAT');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(ProcessingCategory)).toBe(true);
      });

      it('should have 8 categories', () => {
        expect(Object.keys(ProcessingCategory)).toHaveLength(8);
      });
    });

    describe('RISK_DESCRIPTIONS', () => {
      it('should have description for each risk level', () => {
        for (const level of Object.values(RiskLevel)) {
          expect(RISK_DESCRIPTIONS[level]).toBeDefined();
          expect(typeof RISK_DESCRIPTIONS[level]).toBe('string');
          expect(RISK_DESCRIPTIONS[level].length).toBeGreaterThan(0);
        }
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(RISK_DESCRIPTIONS)).toBe(true);
      });
    });

    describe('PRESET_CATEGORY_MAP', () => {
      it('should map analysis presets correctly', () => {
        expect(PRESET_CATEGORY_MAP['analyze-full']).toBe(ProcessingCategory.ANALYSIS);
        expect(PRESET_CATEGORY_MAP['analyze-loudness']).toBe(ProcessingCategory.ANALYSIS);
      });

      it('should map mastering presets correctly', () => {
        expect(PRESET_CATEGORY_MAP['master-standard']).toBe(ProcessingCategory.MASTERING);
        expect(PRESET_CATEGORY_MAP['limit-peak']).toBe(ProcessingCategory.MASTERING);
      });

      it('should map dynamics presets correctly', () => {
        expect(PRESET_CATEGORY_MAP['compress-gentle']).toBe(ProcessingCategory.DYNAMICS);
        expect(PRESET_CATEGORY_MAP['compress-heavy']).toBe(ProcessingCategory.DYNAMICS);
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(PRESET_CATEGORY_MAP)).toBe(true);
      });
    });

    describe('CATEGORY_WEIGHTS', () => {
      it('should have zero weight for analysis', () => {
        expect(CATEGORY_WEIGHTS[ProcessingCategory.ANALYSIS]).toBe(0);
      });

      it('should have highest weight for mastering', () => {
        const weights = Object.values(CATEGORY_WEIGHTS);
        const maxWeight = Math.max(...weights);
        expect(CATEGORY_WEIGHTS[ProcessingCategory.MASTERING]).toBe(maxWeight);
      });

      it('should have weight for each category', () => {
        for (const category of Object.values(ProcessingCategory)) {
          expect(CATEGORY_WEIGHTS[category]).toBeDefined();
          expect(typeof CATEGORY_WEIGHTS[category]).toBe('number');
        }
      });
    });

    describe('REPEAT_PENALTIES', () => {
      it('should have no penalty for analysis', () => {
        expect(REPEAT_PENALTIES[ProcessingCategory.ANALYSIS]).toBe(0);
      });

      it('should have highest penalty for mastering', () => {
        const penalties = Object.values(REPEAT_PENALTIES);
        const maxPenalty = Math.max(...penalties);
        expect(REPEAT_PENALTIES[ProcessingCategory.MASTERING]).toBe(maxPenalty);
      });

      it('should have penalty > 1 for destructive categories', () => {
        expect(REPEAT_PENALTIES[ProcessingCategory.DYNAMICS]).toBeGreaterThan(1);
        expect(REPEAT_PENALTIES[ProcessingCategory.MASTERING]).toBeGreaterThan(1);
        expect(REPEAT_PENALTIES[ProcessingCategory.EQ]).toBeGreaterThan(1);
      });
    });

    describe('THRESHOLDS', () => {
      it('should have ascending risk score thresholds', () => {
        const { RISK_SCORE } = THRESHOLDS;
        expect(RISK_SCORE.PRISTINE).toBeLessThan(RISK_SCORE.LOW);
        expect(RISK_SCORE.LOW).toBeLessThan(RISK_SCORE.MODERATE);
        expect(RISK_SCORE.MODERATE).toBeLessThan(RISK_SCORE.HIGH);
        expect(RISK_SCORE.HIGH).toBeLessThan(RISK_SCORE.EXCESSIVE);
      });

      it('should have max recommended passes for each category', () => {
        for (const category of Object.values(ProcessingCategory)) {
          expect(THRESHOLDS.MAX_RECOMMENDED_PASSES[category]).toBeDefined();
          expect(THRESHOLDS.MAX_RECOMMENDED_PASSES[category]).toBeGreaterThan(0);
        }
      });

      it('should allow unlimited analysis passes', () => {
        expect(THRESHOLDS.MAX_RECOMMENDED_PASSES[ProcessingCategory.ANALYSIS]).toBe(999);
      });

      it('should limit mastering to single pass', () => {
        expect(THRESHOLDS.MAX_RECOMMENDED_PASSES[ProcessingCategory.MASTERING]).toBe(1);
      });
    });
  });

  // ============================================================================
  // Utility Functions Tests
  // ============================================================================

  describe('Utility Functions', () => {
    describe('getPresetCategory', () => {
      it('should return correct category for known presets', () => {
        expect(getPresetCategory('analyze-full')).toBe(ProcessingCategory.ANALYSIS);
        expect(getPresetCategory('compress-gentle')).toBe(ProcessingCategory.DYNAMICS);
        expect(getPresetCategory('master-standard')).toBe(ProcessingCategory.MASTERING);
      });

      it('should return null for unknown presets', () => {
        expect(getPresetCategory('unknown-preset')).toBeNull();
        expect(getPresetCategory('custom-workflow')).toBeNull();
      });

      it('should return null for empty input', () => {
        expect(getPresetCategory('')).toBeNull();
        expect(getPresetCategory(null)).toBeNull();
      });
    });

    describe('getCategoryWeight', () => {
      it('should return correct weights', () => {
        expect(getCategoryWeight(ProcessingCategory.ANALYSIS)).toBe(0);
        expect(getCategoryWeight(ProcessingCategory.MASTERING)).toBe(20);
      });

      it('should return default weight for unknown category', () => {
        expect(getCategoryWeight('UNKNOWN')).toBe(10);
      });
    });

    describe('getRepeatPenalty', () => {
      it('should return correct penalties', () => {
        expect(getRepeatPenalty(ProcessingCategory.ANALYSIS)).toBe(0);
        expect(getRepeatPenalty(ProcessingCategory.MASTERING)).toBe(2.5);
      });

      it('should return default penalty for unknown category', () => {
        expect(getRepeatPenalty('UNKNOWN')).toBe(1.5);
      });
    });

    describe('countByCategory', () => {
      it('should count presets by category', () => {
        const history = [
          'analyze-full',
          'compress-gentle',
          'compress-medium',
          'master-standard'
        ];
        
        const counts = countByCategory(history);
        
        expect(counts[ProcessingCategory.ANALYSIS]).toBe(1);
        expect(counts[ProcessingCategory.DYNAMICS]).toBe(2);
        expect(counts[ProcessingCategory.MASTERING]).toBe(1);
      });

      it('should handle job objects with preset property', () => {
        const history = [
          { preset: 'compress-gentle' },
          { preset: 'compress-medium' }
        ];
        
        const counts = countByCategory(history);
        
        expect(counts[ProcessingCategory.DYNAMICS]).toBe(2);
      });

      it('should return empty object for empty history', () => {
        expect(countByCategory([])).toEqual({});
      });
    });

    describe('countDestructivePasses', () => {
      it('should exclude analysis from count', () => {
        const counts = {
          [ProcessingCategory.ANALYSIS]: 5,
          [ProcessingCategory.DYNAMICS]: 2,
          [ProcessingCategory.MASTERING]: 1
        };
        
        expect(countDestructivePasses(counts)).toBe(3);
      });

      it('should return 0 for analysis-only history', () => {
        const counts = {
          [ProcessingCategory.ANALYSIS]: 10
        };
        
        expect(countDestructivePasses(counts)).toBe(0);
      });
    });
  });

  // ============================================================================
  // Score Calculation Tests
  // ============================================================================

  describe('Score Calculation', () => {
    describe('calculateBaseScore', () => {
      it('should return 0 for empty history', () => {
        expect(calculateBaseScore([])).toBe(0);
        expect(calculateBaseScore(null)).toBe(0);
      });

      it('should return 0 for analysis-only history', () => {
        const history = ['analyze-full', 'analyze-loudness', 'analyze-spectrum'];
        expect(calculateBaseScore(history)).toBe(0);
      });

      it('should calculate score based on category weights', () => {
        const history = ['compress-gentle']; // DYNAMICS = 15
        expect(calculateBaseScore(history)).toBe(15);
      });

      it('should sum weights across multiple presets', () => {
        const history = [
          'compress-gentle',  // DYNAMICS = 15
          'eq-correct',       // EQ = 10
          'master-standard'   // MASTERING = 20
        ];
        expect(calculateBaseScore(history)).toBe(45);
      });

      it('should apply default weight for unknown presets', () => {
        const history = ['unknown-preset'];
        expect(calculateBaseScore(history)).toBe(10);
      });

      it('should handle job objects with preset property', () => {
        const history = [
          { preset: 'compress-gentle' },
          { preset: 'eq-correct' }
        ];
        expect(calculateBaseScore(history)).toBe(25); // 15 + 10
      });
    });

    describe('calculateRepeatPenalty', () => {
      it('should return 0 for no repeats', () => {
        const counts = {
          [ProcessingCategory.DYNAMICS]: 1,
          [ProcessingCategory.MASTERING]: 1
        };
        expect(calculateRepeatPenalty(counts)).toBe(0);
      });

      it('should apply penalty for exceeding max recommended passes', () => {
        const counts = {
          [ProcessingCategory.DYNAMICS]: 3 // Max is 2
        };
        const penalty = calculateRepeatPenalty(counts);
        expect(penalty).toBeGreaterThan(0);
      });

      it('should apply higher penalty for mastering repeats', () => {
        const masteringCounts = { [ProcessingCategory.MASTERING]: 3 };
        const dynamicsCounts = { [ProcessingCategory.DYNAMICS]: 3 };
        
        const masteringPenalty = calculateRepeatPenalty(masteringCounts);
        const dynamicsPenalty = calculateRepeatPenalty(dynamicsCounts);
        
        expect(masteringPenalty).toBeGreaterThan(dynamicsPenalty);
      });

      it('should not penalize analysis repeats', () => {
        const counts = { [ProcessingCategory.ANALYSIS]: 100 };
        expect(calculateRepeatPenalty(counts)).toBe(0);
      });
    });

    describe('calculateRiskScore', () => {
      it('should return zero score for empty history', () => {
        const result = calculateRiskScore([]);
        
        expect(result.totalScore).toBe(0);
        expect(result.baseScore).toBe(0);
        expect(result.repeatPenalty).toBe(0);
        expect(result.passCount).toBe(0);
      });

      it('should calculate complete score breakdown', () => {
        const history = ['compress-gentle', 'compress-medium', 'master-standard'];
        const result = calculateRiskScore(history);
        
        expect(result.totalScore).toBeGreaterThan(0);
        expect(result.baseScore).toBe(50); // 15 + 15 + 20
        expect(result.passCount).toBe(3);
        expect(result.destructivePasses).toBe(3);
      });

      it('should include repeat penalty in total', () => {
        const history = [
          'compress-gentle',
          'compress-medium',
          'compress-heavy' // 3 dynamics exceeds limit of 2
        ];
        
        const result = calculateRiskScore(history);
        
        expect(result.repeatPenalty).toBeGreaterThan(0);
        expect(result.totalScore).toBe(result.baseScore + result.repeatPenalty);
      });

      it('should cap total score at 100', () => {
        const heavyHistory = [
          'master-standard', 'master-streaming', 'master-broadcast',
          'compress-gentle', 'compress-medium', 'compress-heavy',
          'limit-peak', 'limit-loudness'
        ];
        
        const result = calculateRiskScore(heavyHistory);
        
        expect(result.totalScore).toBeLessThanOrEqual(100);
      });

      it('should include accumulation bonus', () => {
        const history = ['compress-gentle'];
        const result = calculateRiskScore(history, { accumulationScore: 50 });
        
        expect(result.accumulationBonus).toBe(25); // 50 * 0.5
        expect(result.totalScore).toBeGreaterThan(result.baseScore);
      });

      it('should allow disabling repeat penalty', () => {
        const history = ['compress-gentle', 'compress-medium', 'compress-heavy'];
        
        const withPenalty = calculateRiskScore(history, { includeRepeatPenalty: true });
        const withoutPenalty = calculateRiskScore(history, { includeRepeatPenalty: false });
        
        expect(withPenalty.totalScore).toBeGreaterThan(withoutPenalty.totalScore);
        expect(withoutPenalty.repeatPenalty).toBe(0);
      });
    });

    describe('classifyRiskLevel', () => {
      it('should classify PRISTINE for score < 10', () => {
        expect(classifyRiskLevel(0)).toBe(RiskLevel.PRISTINE);
        expect(classifyRiskLevel(5)).toBe(RiskLevel.PRISTINE);
        expect(classifyRiskLevel(9)).toBe(RiskLevel.PRISTINE);
      });

      it('should classify LOW for score 10-24', () => {
        expect(classifyRiskLevel(10)).toBe(RiskLevel.LOW);
        expect(classifyRiskLevel(20)).toBe(RiskLevel.LOW);
        expect(classifyRiskLevel(24)).toBe(RiskLevel.LOW);
      });

      it('should classify MODERATE for score 25-49', () => {
        expect(classifyRiskLevel(25)).toBe(RiskLevel.MODERATE);
        expect(classifyRiskLevel(35)).toBe(RiskLevel.MODERATE);
        expect(classifyRiskLevel(49)).toBe(RiskLevel.MODERATE);
      });

      it('should classify HIGH for score 50-74', () => {
        expect(classifyRiskLevel(50)).toBe(RiskLevel.HIGH);
        expect(classifyRiskLevel(60)).toBe(RiskLevel.HIGH);
        expect(classifyRiskLevel(74)).toBe(RiskLevel.HIGH);
      });

      it('should classify EXCESSIVE for score >= 75', () => {
        expect(classifyRiskLevel(75)).toBe(RiskLevel.EXCESSIVE);
        expect(classifyRiskLevel(90)).toBe(RiskLevel.EXCESSIVE);
        expect(classifyRiskLevel(100)).toBe(RiskLevel.EXCESSIVE);
      });
    });

    describe('calculateHeadroom', () => {
      it('should calculate remaining headroom percent', () => {
        expect(calculateHeadroom(0).headroomPercent).toBe(100);
        expect(calculateHeadroom(50).headroomPercent).toBe(50);
        expect(calculateHeadroom(100).headroomPercent).toBe(0);
      });

      it('should determine capability flags', () => {
        const fullHeadroom = calculateHeadroom(0);
        expect(fullHeadroom.canAddNormalization).toBe(true);
        expect(fullHeadroom.canAddEQ).toBe(true);
        expect(fullHeadroom.canAddDynamics).toBe(true);
        expect(fullHeadroom.canAddMastering).toBe(true);
        expect(fullHeadroom.canAddStereo).toBe(true);
      });

      it('should limit capabilities when headroom is low', () => {
        const lowHeadroom = calculateHeadroom(90);
        expect(lowHeadroom.canAddNormalization).toBe(true); // 10 remaining >= 10
        expect(lowHeadroom.canAddMastering).toBe(false);    // 10 remaining < 25
      });

      it('should return appropriate recommendations', () => {
        const fullHeadroom = calculateHeadroom(20);
        expect(fullHeadroom.recommendation).toContain('Full processing');
        
        const limitedHeadroom = calculateHeadroom(60);
        expect(limitedHeadroom.recommendation).toContain('Limited');
        
        const minimalHeadroom = calculateHeadroom(80);
        expect(minimalHeadroom.recommendation).toContain('Minimal');
        
        const noHeadroom = calculateHeadroom(95);
        expect(noHeadroom.recommendation).toContain('No processing');
      });
    });
  });

  // ============================================================================
  // Main Analysis Functions Tests
  // ============================================================================

  describe('Main Analysis Functions', () => {
    describe('calculateRisk', () => {
      it('should return PRISTINE for empty history', () => {
        const result = calculateRisk([]);
        
        expect(result.riskLevel).toBe(RiskLevel.PRISTINE);
        expect(result.score).toBe(0);
        expect(result.canAddMoreProcessing).toBe(true);
      });

      it('should return complete risk assessment', () => {
        const history = ['compress-gentle', 'eq-correct'];
        const result = calculateRisk(history);
        
        expect(result.riskLevel).toBeDefined();
        expect(result.description).toBeDefined();
        expect(result.score).toBeGreaterThan(0);
        expect(result.scoreBreakdown).toBeDefined();
        expect(result.headroom).toBeDefined();
        expect(result.categoryCounts).toBeDefined();
        expect(result.warnings).toBeDefined();
        expect(typeof result.canAddMoreProcessing).toBe('boolean');
      });

      it('should identify over-limit categories', () => {
        const history = [
          'compress-gentle',
          'compress-medium',
          'compress-heavy' // 3 exceeds max of 2
        ];
        
        const result = calculateRisk(history);
        
        expect(result.overLimitCategories.length).toBeGreaterThan(0);
        expect(result.overLimitCategories[0].category).toBe(ProcessingCategory.DYNAMICS);
        expect(result.overLimitCategories[0].excess).toBe(1);
      });

      it('should generate warnings for over-limit categories', () => {
        const history = [
          'compress-gentle',
          'compress-medium',
          'compress-heavy'
        ];
        
        const result = calculateRisk(history);
        
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.warnings.some(w => w.includes('DYNAMICS'))).toBe(true);
      });

      it('should set canAddMoreProcessing to false for EXCESSIVE risk', () => {
        const heavyHistory = [
          'master-standard', 'master-streaming', 'master-broadcast',
          'compress-gentle', 'compress-medium', 'compress-heavy',
          'limit-peak', 'limit-loudness', 'eq-enhance'
        ];
        
        const result = calculateRisk(heavyHistory);
        
        if (result.riskLevel === RiskLevel.EXCESSIVE) {
          expect(result.canAddMoreProcessing).toBe(false);
        }
      });

      it('should track destructive vs total passes', () => {
        const history = [
          'analyze-full',
          'analyze-loudness',
          'compress-gentle',
          'master-standard'
        ];
        
        const result = calculateRisk(history);
        
        expect(result.passCount).toBe(4);
        expect(result.destructivePasses).toBe(2); // Only compress and master
      });

      it('should include accumulation score when provided', () => {
        const history = ['compress-gentle'];
        
        const withoutAccumulation = calculateRisk(history);
        const withAccumulation = calculateRisk(history, { accumulationScore: 60 });
        
        expect(withAccumulation.score).toBeGreaterThan(withoutAccumulation.score);
      });
    });

    describe('evaluateProposedJob', () => {
      it('should evaluate adding a job to empty history', () => {
        const result = evaluateProposedJob([], 'compress-gentle');
        
        expect(result.canProceed).toBe(true);
        expect(result.proposedPreset).toBe('compress-gentle');
        expect(result.currentRisk).toBe(0);
        expect(result.proposedRisk).toBeGreaterThan(0);
        expect(result.scoreIncrease).toBeGreaterThan(0);
      });

      it('should detect level changes', () => {
        // Start with minimal history
        const history = ['analyze-full'];
        
        // Add mastering which should increase level
        const result = evaluateProposedJob(history, 'master-standard');
        
        expect(result.proposedRisk).toBeGreaterThan(result.currentRisk);
      });

      it('should detect when category limit would be exceeded', () => {
        const history = ['master-standard']; // Max mastering is 1
        const result = evaluateProposedJob(history, 'master-streaming');
        
        expect(result.wouldExceedLimit).toBe(true);
        expect(result.canProceed).toBe(false);
        expect(result.currentCategoryCount).toBe(1);
        expect(result.maxRecommended).toBe(1);
      });

      it('should allow safe additions', () => {
        const history = ['analyze-full'];
        const result = evaluateProposedJob(history, 'eq-correct');
        
        expect(result.canProceed).toBe(true);
        expect(result.wouldExceedLimit).toBe(false);
      });

      it('should provide appropriate recommendations', () => {
        const history = ['master-standard'];
        
        const blockedResult = evaluateProposedJob(history, 'master-streaming');
        expect(blockedResult.recommendation).toContain('Avoid');
        
        const safeResult = evaluateProposedJob(history, 'analyze-full');
        expect(safeResult.recommendation).toContain('safely');
      });

      it('should include proposed headroom assessment', () => {
        const result = evaluateProposedJob([], 'compress-gentle');
        
        expect(result.proposedHeadroom).toBeDefined();
        expect(result.proposedHeadroom.headroomPercent).toBeDefined();
      });

      it('should handle null history', () => {
        const result = evaluateProposedJob(null, 'compress-gentle');
        
        expect(result.canProceed).toBe(true);
        expect(result.currentRisk).toBe(0);
      });
    });

    describe('quickCheck', () => {
      it('should return essential risk info', () => {
        const history = ['compress-gentle', 'eq-correct'];
        const result = quickCheck(history);
        
        expect(result.riskLevel).toBeDefined();
        expect(result.score).toBeDefined();
        expect(result.passCount).toBeDefined();
        expect(result.destructivePasses).toBeDefined();
        expect(result.canAddMoreProcessing).toBeDefined();
        expect(result.headroomPercent).toBeDefined();
        expect(result.warningCount).toBeDefined();
        expect(typeof result.hasExcessiveRisk).toBe('boolean');
        expect(typeof result.hasHighRisk).toBe('boolean');
      });

      it('should detect excessive risk', () => {
        const heavyHistory = [
          'master-standard', 'master-streaming', 'master-broadcast',
          'compress-gentle', 'compress-medium', 'compress-heavy',
          'limit-peak', 'limit-loudness'
        ];
        
        const result = quickCheck(heavyHistory);
        
        if (result.riskLevel === RiskLevel.EXCESSIVE) {
          expect(result.hasExcessiveRisk).toBe(true);
        }
      });

      it('should detect high risk', () => {
        const moderateHistory = [
          'master-standard',
          'compress-gentle',
          'compress-medium',
          'eq-correct'
        ];
        
        const result = quickCheck(moderateHistory);
        
        if (result.riskLevel === RiskLevel.HIGH) {
          expect(result.hasHighRisk).toBe(true);
        }
      });

      it('should count warnings', () => {
        const history = [
          'compress-gentle',
          'compress-medium',
          'compress-heavy'
        ];
        
        const result = quickCheck(history);
        
        expect(result.warningCount).toBeGreaterThan(0);
      });
    });
  });

  // ============================================================================
  // Recommendations Tests
  // ============================================================================

  describe('Recommendations', () => {
    describe('generateRecommendations', () => {
      it('should return empty array for null input', () => {
        expect(generateRecommendations(null)).toEqual([]);
      });

      it('should provide recommendations for EXCESSIVE risk', () => {
        const assessment = {
          riskLevel: RiskLevel.EXCESSIVE,
          overLimitCategories: [],
          headroom: { canAddMastering: false, canAddDynamics: false },
          categoryCounts: {}
        };
        
        const recommendations = generateRecommendations(assessment);
        
        expect(recommendations.length).toBeGreaterThan(0);
        expect(recommendations.some(r => r.includes('Do not'))).toBe(true);
      });

      it('should provide recommendations for HIGH risk', () => {
        const assessment = {
          riskLevel: RiskLevel.HIGH,
          overLimitCategories: [],
          headroom: { canAddMastering: false, canAddDynamics: true },
          categoryCounts: {}
        };
        
        const recommendations = generateRecommendations(assessment);
        
        expect(recommendations.some(r => r.includes('Limit') || r.includes('essential'))).toBe(true);
      });

      it('should recommend consolidating mastering passes', () => {
        const assessment = {
          riskLevel: RiskLevel.HIGH,
          overLimitCategories: [
            { category: ProcessingCategory.MASTERING, count: 2, maxRecommended: 1, excess: 1 }
          ],
          headroom: {},
          categoryCounts: {}
        };
        
        const recommendations = generateRecommendations(assessment);
        
        expect(recommendations.some(r => r.includes('mastering') && r.includes('consolidate'))).toBe(true);
      });

      it('should recommend parallel processing for dynamics stacking', () => {
        const assessment = {
          riskLevel: RiskLevel.MODERATE,
          overLimitCategories: [
            { category: ProcessingCategory.DYNAMICS, count: 3, maxRecommended: 2, excess: 1 }
          ],
          headroom: {},
          categoryCounts: {}
        };
        
        const recommendations = generateRecommendations(assessment);
        
        expect(recommendations.some(r => r.includes('dynamics') && r.includes('parallel'))).toBe(true);
      });

      it('should note when EQ is still possible but not limiting', () => {
        const assessment = {
          riskLevel: RiskLevel.MODERATE,
          overLimitCategories: [],
          headroom: { canAddMastering: false, canAddEQ: true },
          categoryCounts: {}
        };
        
        const recommendations = generateRecommendations(assessment);
        
        expect(recommendations.some(r => r.includes('EQ') && r.includes('limiting'))).toBe(true);
      });
    });

    describe('estimateFromMetrics', () => {
      it('should return no data for null input', () => {
        const result = estimateFromMetrics(null);
        
        expect(result.estimatedPasses).toBe(0);
        expect(result.confidence).toBe(0);
        expect(result.method).toBe('no_data');
      });

      it('should estimate from accumulation score', () => {
        const result = estimateFromMetrics({ accumulationScore: 40 });
        
        expect(result.estimatedPasses).toBe(3);
        expect(result.confidence).toBe(0.7);
        expect(result.method).toBe('accumulation_score');
      });

      it('should estimate low passes from low accumulation', () => {
        const result = estimateFromMetrics({ accumulationScore: 10 });
        expect(result.estimatedPasses).toBe(0);
      });

      it('should estimate high passes from high accumulation', () => {
        const result = estimateFromMetrics({ accumulationScore: 80 });
        expect(result.estimatedPasses).toBe(8);
      });

      it('should fall back to crest factor when no accumulation score', () => {
        const result = estimateFromMetrics({ crestFactorDb: 8 });
        
        expect(result.estimatedPasses).toBe(3);
        expect(result.confidence).toBe(0.5);
        expect(result.method).toBe('crest_factor');
      });

      it('should estimate pristine from high crest factor', () => {
        const result = estimateFromMetrics({ crestFactorDb: 16 });
        expect(result.estimatedPasses).toBe(0);
      });

      it('should estimate heavy processing from low crest factor', () => {
        const result = estimateFromMetrics({ crestFactorDb: 4 });
        expect(result.estimatedPasses).toBe(7);
      });

      it('should return insufficient data when no usable metrics', () => {
        const result = estimateFromMetrics({ phaseCoherence: 0.9 });
        
        expect(result.method).toBe('insufficient_data');
        expect(result.confidence).toBe(0);
      });
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration Tests', () => {
    describe('Typical workflow scenarios', () => {
      it('should track simple mastering workflow', () => {
        const workflow = [
          'analyze-full',      // Analysis - no impact
          'eq-correct',        // EQ = 10
          'compress-gentle',   // Dynamics = 15
          'master-standard'    // Mastering = 20
        ];
        
        const result = calculateRisk(workflow);
        
        expect(result.score).toBe(45); // 10 + 15 + 20
        expect(result.riskLevel).toBe(RiskLevel.MODERATE);
        expect(result.destructivePasses).toBe(3);
      });

      it('should warn about re-mastering', () => {
        const remaster = [
          'master-standard',   // First master
          'analyze-loudness',  // Analysis
          'master-streaming'   // Second master - problematic
        ];
        
        const result = calculateRisk(remaster);
        
        expect(result.overLimitCategories.length).toBeGreaterThan(0);
        expect(result.warnings.some(w => w.includes('MASTERING'))).toBe(true);
      });

      it('should handle format conversion chain', () => {
        const conversions = [
          'convert-wav',
          'resample-48000',
          'convert-flac'
        ];
        
        const result = calculateRisk(conversions);
        
        // Should show moderate concern for multiple format changes
        expect(result.overLimitCategories.some(
          c => c.category === ProcessingCategory.FORMAT
        )).toBe(true);
      });

      it('should allow extensive analysis', () => {
        const analysis = [
          'analyze-full',
          'analyze-loudness',
          'analyze-spectrum',
          'analyze-dynamics'
        ];
        
        const result = calculateRisk(analysis);
        
        expect(result.riskLevel).toBe(RiskLevel.PRISTINE);
        expect(result.score).toBe(0);
        expect(result.overLimitCategories).toHaveLength(0);
      });
    });

    describe('Progressive risk evaluation', () => {
      it('should show increasing risk through workflow', () => {
        const steps = [
          'eq-correct',
          'compress-gentle',
          'master-standard'
        ];
        
        let previousScore = 0;
        for (let i = 0; i < steps.length; i++) {
          const history = steps.slice(0, i + 1);
          const result = calculateRisk(history);
          
          expect(result.score).toBeGreaterThan(previousScore);
          previousScore = result.score;
        }
      });

      it('should evaluate proposed jobs incrementally', () => {
        let history = [];
        const presets = ['eq-correct', 'compress-gentle', 'master-standard'];
        
        for (const preset of presets) {
          const evaluation = evaluateProposedJob(history, preset);
          
          expect(evaluation.scoreIncrease).toBeGreaterThan(0);
          expect(evaluation.proposedRisk).toBeGreaterThan(evaluation.currentRisk);
          
          if (evaluation.canProceed) {
            history.push(preset);
          }
        }
      });
    });

    describe('Edge cases', () => {
      it('should handle mixed string and object history', () => {
        const history = [
          'eq-correct',
          { preset: 'compress-gentle' },
          'master-standard'
        ];
        
        const result = calculateRisk(history);
        
        expect(result.passCount).toBe(3);
        expect(result.score).toBeGreaterThan(0);
      });

      it('should handle unknown presets gracefully', () => {
        const history = [
          'unknown-custom-preset',
          'another-unknown',
          'eq-correct'
        ];
        
        const result = calculateRisk(history);
        
        // Should apply default weights for unknowns
        expect(result.score).toBeGreaterThan(10); // At least EQ weight + defaults
      });

      it('should handle very long processing chains', () => {
        const history = Array(50).fill('eq-correct');
        
        const result = calculateRisk(history);
        
        // Should cap at 100
        expect(result.score).toBeLessThanOrEqual(100);
        expect(result.riskLevel).toBe(RiskLevel.EXCESSIVE);
      });

      it('should provide consistent results', () => {
        const history = ['compress-gentle', 'eq-correct', 'master-standard'];
        
        const result1 = calculateRisk(history);
        const result2 = calculateRisk(history);
        
        expect(result1.score).toBe(result2.score);
        expect(result1.riskLevel).toBe(result2.riskLevel);
      });
    });

    describe('Category limit enforcement', () => {
      it('should enforce dynamics limit of 2', () => {
        const history = ['compress-gentle', 'compress-medium'];
        const evaluation = evaluateProposedJob(history, 'compress-heavy');
        
        expect(evaluation.wouldExceedLimit).toBe(true);
        expect(evaluation.canProceed).toBe(false);
      });

      it('should enforce mastering limit of 1', () => {
        const history = ['master-standard'];
        const evaluation = evaluateProposedJob(history, 'limit-peak');
        
        expect(evaluation.wouldExceedLimit).toBe(true);
        expect(evaluation.canProceed).toBe(false);
      });

      it('should allow EQ within limit', () => {
        const history = ['eq-correct', 'eq-enhance'];
        const evaluation = evaluateProposedJob(history, 'eq-surgical');
        
        expect(evaluation.canProceed).toBe(true);
        expect(evaluation.currentCategoryCount).toBe(2);
        expect(evaluation.maxRecommended).toBe(3);
      });
    });
  });

  // ============================================================================
  // API Contract Tests
  // ============================================================================

  describe('API Contract', () => {
    it('should export all required functions', () => {
      expect(typeof calculateRisk).toBe('function');
      expect(typeof evaluateProposedJob).toBe('function');
      expect(typeof quickCheck).toBe('function');
      expect(typeof calculateRiskScore).toBe('function');
      expect(typeof classifyRiskLevel).toBe('function');
      expect(typeof calculateHeadroom).toBe('function');
      expect(typeof generateRecommendations).toBe('function');
      expect(typeof estimateFromMetrics).toBe('function');
    });

    it('should export all required constants', () => {
      expect(RiskLevel).toBeDefined();
      expect(ProcessingCategory).toBeDefined();
      expect(RISK_DESCRIPTIONS).toBeDefined();
      expect(PRESET_CATEGORY_MAP).toBeDefined();
      expect(CATEGORY_WEIGHTS).toBeDefined();
      expect(REPEAT_PENALTIES).toBeDefined();
      expect(THRESHOLDS).toBeDefined();
    });

    it('should maintain consistent return shapes', () => {
      const history = ['compress-gentle'];
      
      // calculateRisk
      const risk = calculateRisk(history);
      expect(risk).toHaveProperty('riskLevel');
      expect(risk).toHaveProperty('score');
      expect(risk).toHaveProperty('description');
      expect(risk).toHaveProperty('scoreBreakdown');
      expect(risk).toHaveProperty('headroom');
      
      // evaluateProposedJob
      const evaluation = evaluateProposedJob(history, 'eq-correct');
      expect(evaluation).toHaveProperty('canProceed');
      expect(evaluation).toHaveProperty('proposedRisk');
      expect(evaluation).toHaveProperty('currentRisk');
      
      // quickCheck
      const quick = quickCheck(history);
      expect(quick).toHaveProperty('riskLevel');
      expect(quick).toHaveProperty('score');
      expect(quick).toHaveProperty('canAddMoreProcessing');
    });
  });
});
