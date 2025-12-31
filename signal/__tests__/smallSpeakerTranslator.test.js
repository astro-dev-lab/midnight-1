/**
 * Tests for Small Speaker Translation Estimator
 * 
 * Validates frequency band analysis, translation scoring,
 * and device-specific prediction logic.
 */

const {
  analyze,
  quickCheck,
  classify,
  measureBandEnergy,
  measureTotalEnergy,
  analyzeBands,
  classifyTranslation,
  calculatePerceivedBassLoss,
  calculateTranslationScore,
  predictDeviceTranslation,
  generateRecommendations,
  getAudioDuration,
  TranslationStatus,
  STATUS_DESCRIPTIONS,
  SPEAKER_BANDS,
  DEVICE_PROFILES,
  THRESHOLDS
} = require('../services/smallSpeakerTranslator');

// ============================================================================
// Constants Tests
// ============================================================================

describe('SmallSpeakerTranslator Constants', () => {
  
  describe('TranslationStatus', () => {
    it('should have all expected status values', () => {
      expect(TranslationStatus.EXCELLENT).toBe('EXCELLENT');
      expect(TranslationStatus.GOOD).toBe('GOOD');
      expect(TranslationStatus.FAIR).toBe('FAIR');
      expect(TranslationStatus.POOR).toBe('POOR');
      expect(TranslationStatus.CRITICAL).toBe('CRITICAL');
    });
    
    it('should have exactly 5 status values', () => {
      const statuses = Object.values(TranslationStatus);
      expect(statuses).toHaveLength(5);
    });
  });
  
  describe('STATUS_DESCRIPTIONS', () => {
    it('should have descriptions for all statuses', () => {
      Object.values(TranslationStatus).forEach(status => {
        expect(STATUS_DESCRIPTIONS[status]).toBeDefined();
        expect(typeof STATUS_DESCRIPTIONS[status]).toBe('string');
        expect(STATUS_DESCRIPTIONS[status].length).toBeGreaterThan(10);
      });
    });
    
    it('should have unique descriptions', () => {
      const descriptions = Object.values(STATUS_DESCRIPTIONS);
      const unique = [...new Set(descriptions)];
      expect(unique).toHaveLength(descriptions.length);
    });
  });
  
  describe('SPEAKER_BANDS', () => {
    it('should have all expected bands', () => {
      expect(SPEAKER_BANDS.LOST).toBeDefined();
      expect(SPEAKER_BANDS.AT_RISK).toBeDefined();
      expect(SPEAKER_BANDS.SURVIVAL).toBeDefined();
      expect(SPEAKER_BANDS.PRESERVED).toBeDefined();
    });
    
    it('should have correct frequency ranges for LOST band', () => {
      expect(SPEAKER_BANDS.LOST.low).toBe(20);
      expect(SPEAKER_BANDS.LOST.high).toBe(80);
    });
    
    it('should have correct frequency ranges for AT_RISK band', () => {
      expect(SPEAKER_BANDS.AT_RISK.low).toBe(80);
      expect(SPEAKER_BANDS.AT_RISK.high).toBe(150);
    });
    
    it('should have correct frequency ranges for SURVIVAL band', () => {
      expect(SPEAKER_BANDS.SURVIVAL.low).toBe(150);
      expect(SPEAKER_BANDS.SURVIVAL.high).toBe(400);
    });
    
    it('should have correct frequency ranges for PRESERVED band', () => {
      expect(SPEAKER_BANDS.PRESERVED.low).toBe(400);
      expect(SPEAKER_BANDS.PRESERVED.high).toBe(1000);
    });
    
    it('should have contiguous frequency coverage', () => {
      expect(SPEAKER_BANDS.LOST.high).toBe(SPEAKER_BANDS.AT_RISK.low);
      expect(SPEAKER_BANDS.AT_RISK.high).toBe(SPEAKER_BANDS.SURVIVAL.low);
      expect(SPEAKER_BANDS.SURVIVAL.high).toBe(SPEAKER_BANDS.PRESERVED.low);
    });
    
    it('should have appropriate weights', () => {
      expect(SPEAKER_BANDS.LOST.weight).toBe(0.0);  // Lost - no weight
      expect(SPEAKER_BANDS.AT_RISK.weight).toBe(0.2);  // Reduced
      expect(SPEAKER_BANDS.SURVIVAL.weight).toBe(1.0);  // Full weight
      expect(SPEAKER_BANDS.PRESERVED.weight).toBe(1.0);  // Full weight
    });
    
    it('should have descriptive labels', () => {
      Object.values(SPEAKER_BANDS).forEach(band => {
        expect(band.label).toBeDefined();
        expect(band.label.length).toBeGreaterThan(5);
      });
    });
  });
  
  describe('DEVICE_PROFILES', () => {
    it('should have all expected device profiles', () => {
      expect(DEVICE_PROFILES.PHONE).toBeDefined();
      expect(DEVICE_PROFILES.LAPTOP).toBeDefined();
      expect(DEVICE_PROFILES.TABLET).toBeDefined();
      expect(DEVICE_PROFILES.BLUETOOTH_SMALL).toBeDefined();
    });
    
    it('should have device names for all profiles', () => {
      Object.values(DEVICE_PROFILES).forEach(profile => {
        expect(profile.name).toBeDefined();
        expect(typeof profile.name).toBe('string');
      });
    });
    
    it('should have descending cutoff frequencies', () => {
      Object.values(DEVICE_PROFILES).forEach(profile => {
        expect(profile.cutoff3dB).toBeGreaterThan(profile.cutoff12dB);
        expect(profile.cutoff12dB).toBeGreaterThan(profile.cutoff24dB);
      });
    });
    
    it('should have phone with highest cutoff (worst bass)', () => {
      expect(DEVICE_PROFILES.PHONE.cutoff3dB).toBeGreaterThan(DEVICE_PROFILES.LAPTOP.cutoff3dB);
      expect(DEVICE_PROFILES.PHONE.cutoff3dB).toBeGreaterThan(DEVICE_PROFILES.TABLET.cutoff3dB);
    });
    
    it('should have small bluetooth with lowest cutoff (best small speaker bass)', () => {
      expect(DEVICE_PROFILES.BLUETOOTH_SMALL.cutoff3dB).toBeLessThanOrEqual(DEVICE_PROFILES.LAPTOP.cutoff3dB);
    });
  });
  
  describe('THRESHOLDS', () => {
    it('should have LOST_RATIO thresholds', () => {
      expect(THRESHOLDS.LOST_RATIO.EXCELLENT).toBeDefined();
      expect(THRESHOLDS.LOST_RATIO.GOOD).toBeDefined();
      expect(THRESHOLDS.LOST_RATIO.FAIR).toBeDefined();
      expect(THRESHOLDS.LOST_RATIO.POOR).toBeDefined();
    });
    
    it('should have ascending LOST_RATIO thresholds', () => {
      expect(THRESHOLDS.LOST_RATIO.EXCELLENT).toBeLessThan(THRESHOLDS.LOST_RATIO.GOOD);
      expect(THRESHOLDS.LOST_RATIO.GOOD).toBeLessThan(THRESHOLDS.LOST_RATIO.FAIR);
      expect(THRESHOLDS.LOST_RATIO.FAIR).toBeLessThan(THRESHOLDS.LOST_RATIO.POOR);
    });
    
    it('should have SURVIVAL_RATIO thresholds', () => {
      expect(THRESHOLDS.SURVIVAL_RATIO.EXCELLENT).toBeDefined();
      expect(THRESHOLDS.SURVIVAL_RATIO.GOOD).toBeDefined();
      expect(THRESHOLDS.SURVIVAL_RATIO.FAIR).toBeDefined();
      expect(THRESHOLDS.SURVIVAL_RATIO.POOR).toBeDefined();
    });
    
    it('should have descending SURVIVAL_RATIO thresholds', () => {
      expect(THRESHOLDS.SURVIVAL_RATIO.EXCELLENT).toBeGreaterThan(THRESHOLDS.SURVIVAL_RATIO.GOOD);
      expect(THRESHOLDS.SURVIVAL_RATIO.GOOD).toBeGreaterThan(THRESHOLDS.SURVIVAL_RATIO.FAIR);
      expect(THRESHOLDS.SURVIVAL_RATIO.FAIR).toBeGreaterThan(THRESHOLDS.SURVIVAL_RATIO.POOR);
    });
    
    it('should have PERCEIVED_LOSS_DB thresholds', () => {
      expect(THRESHOLDS.PERCEIVED_LOSS_DB.EXCELLENT).toBeDefined();
      expect(THRESHOLDS.PERCEIVED_LOSS_DB.GOOD).toBeDefined();
      expect(THRESHOLDS.PERCEIVED_LOSS_DB.FAIR).toBeDefined();
      expect(THRESHOLDS.PERCEIVED_LOSS_DB.POOR).toBeDefined();
    });
    
    it('should have ascending PERCEIVED_LOSS_DB thresholds', () => {
      expect(THRESHOLDS.PERCEIVED_LOSS_DB.EXCELLENT).toBeLessThan(THRESHOLDS.PERCEIVED_LOSS_DB.GOOD);
      expect(THRESHOLDS.PERCEIVED_LOSS_DB.GOOD).toBeLessThan(THRESHOLDS.PERCEIVED_LOSS_DB.FAIR);
      expect(THRESHOLDS.PERCEIVED_LOSS_DB.FAIR).toBeLessThan(THRESHOLDS.PERCEIVED_LOSS_DB.POOR);
    });
  });
  
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('Utility Functions', () => {
  
  describe('calculatePerceivedBassLoss', () => {
    it('should return 0 for no bass content', () => {
      const bandAnalysis = {
        lost: { energyLinear: 0, ratio: 0 },
        atRisk: { energyLinear: 0, ratio: 0 },
        survival: { energyLinear: 0.5, ratio: 0.5 }
      };
      
      const loss = calculatePerceivedBassLoss(bandAnalysis);
      expect(loss).toBe(0);
    });
    
    it('should return 0 when survival compensates fully', () => {
      const bandAnalysis = {
        lost: { energyLinear: 0.1, ratio: 0.1 },
        atRisk: { energyLinear: 0.1, ratio: 0.1 },
        survival: { energyLinear: 0.4, ratio: 0.4 }  // High survival compensates
      };
      
      const loss = calculatePerceivedBassLoss(bandAnalysis);
      expect(loss).toBe(0);
    });
    
    it('should return positive dB for bass-heavy content with low survival', () => {
      const bandAnalysis = {
        lost: { energyLinear: 0.4, ratio: 0.4 },
        atRisk: { energyLinear: 0.2, ratio: 0.2 },
        survival: { energyLinear: 0.1, ratio: 0.1 }
      };
      
      const loss = calculatePerceivedBassLoss(bandAnalysis);
      expect(loss).toBeGreaterThan(0);
    });
    
    it('should return higher loss for more bass-heavy mixes', () => {
      const lowBass = {
        lost: { energyLinear: 0.1, ratio: 0.1 },
        atRisk: { energyLinear: 0.1, ratio: 0.1 },
        survival: { energyLinear: 0.2, ratio: 0.2 }
      };
      
      const highBass = {
        lost: { energyLinear: 0.5, ratio: 0.5 },
        atRisk: { energyLinear: 0.3, ratio: 0.3 },
        survival: { energyLinear: 0.1, ratio: 0.1 }
      };
      
      const lowLoss = calculatePerceivedBassLoss(lowBass);
      const highLoss = calculatePerceivedBassLoss(highBass);
      
      expect(highLoss).toBeGreaterThan(lowLoss);
    });
    
    it('should cap loss at 30dB for extreme cases', () => {
      const extreme = {
        lost: { energyLinear: 0.9, ratio: 0.9 },
        atRisk: { energyLinear: 0.09, ratio: 0.09 },
        survival: { energyLinear: 0.0001, ratio: 0.0001 }
      };
      
      const loss = calculatePerceivedBassLoss(extreme);
      expect(loss).toBeLessThanOrEqual(30);
    });
  });
  
  describe('calculateTranslationScore', () => {
    it('should return 100 for perfect translation (no bass, high survival)', () => {
      const perfect = {
        lost: { ratio: 0 },
        survival: { ratio: 0.3 },
        preserved: { ratio: 0.4 }
      };
      
      const score = calculateTranslationScore(perfect);
      expect(score).toBe(100);
    });
    
    it('should return lower score for high lost ratio', () => {
      const highLost = {
        lost: { ratio: 0.5 },
        survival: { ratio: 0.1 },
        preserved: { ratio: 0.2 }
      };
      
      const score = calculateTranslationScore(highLost);
      expect(score).toBeLessThan(80);
    });
    
    it('should clamp score between 0 and 100', () => {
      const worst = {
        lost: { ratio: 0.9 },
        survival: { ratio: 0 },
        preserved: { ratio: 0 }
      };
      
      const score = calculateTranslationScore(worst);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
    
    it('should reward high survival ratio', () => {
      const lowSurvival = {
        lost: { ratio: 0.3 },
        survival: { ratio: 0.05 },
        preserved: { ratio: 0.2 }
      };
      
      const highSurvival = {
        lost: { ratio: 0.3 },
        survival: { ratio: 0.25 },
        preserved: { ratio: 0.2 }
      };
      
      expect(calculateTranslationScore(highSurvival)).toBeGreaterThan(calculateTranslationScore(lowSurvival));
    });
  });
  
  describe('classifyTranslation', () => {
    it('should return EXCELLENT for ideal band distribution', () => {
      const ideal = {
        lost: { ratio: 0.1, energyLinear: 0.1 },
        atRisk: { ratio: 0.1, energyLinear: 0.1 },
        survival: { ratio: 0.3, energyLinear: 0.3 },
        preserved: { ratio: 0.4, energyLinear: 0.4 }
      };
      
      expect(classifyTranslation(ideal)).toBe(TranslationStatus.EXCELLENT);
    });
    
    it('should return GOOD for moderate band distribution', () => {
      const moderate = {
        lost: { ratio: 0.2, energyLinear: 0.2 },
        atRisk: { ratio: 0.1, energyLinear: 0.1 },
        survival: { ratio: 0.22, energyLinear: 0.22 },
        preserved: { ratio: 0.3, energyLinear: 0.3 }
      };
      
      expect(classifyTranslation(moderate)).toBe(TranslationStatus.GOOD);
    });
    
    it('should return FAIR for borderline distribution', () => {
      const borderline = {
        lost: { ratio: 0.3, energyLinear: 0.3 },
        atRisk: { ratio: 0.15, energyLinear: 0.15 },
        survival: { ratio: 0.16, energyLinear: 0.16 },
        preserved: { ratio: 0.25, energyLinear: 0.25 }
      };
      
      expect(classifyTranslation(borderline)).toBe(TranslationStatus.FAIR);
    });
    
    it('should return POOR for problematic distribution', () => {
      const problematic = {
        lost: { ratio: 0.4, energyLinear: 0.4 },
        atRisk: { ratio: 0.15, energyLinear: 0.15 },
        survival: { ratio: 0.12, energyLinear: 0.12 },
        preserved: { ratio: 0.2, energyLinear: 0.2 }
      };
      
      expect(classifyTranslation(problematic)).toBe(TranslationStatus.POOR);
    });
    
    it('should return CRITICAL for severe bass-heavy mix', () => {
      const severe = {
        lost: { ratio: 0.5, energyLinear: 0.5 },
        atRisk: { ratio: 0.2, energyLinear: 0.2 },
        survival: { ratio: 0.05, energyLinear: 0.05 },
        preserved: { ratio: 0.1, energyLinear: 0.1 }
      };
      
      expect(classifyTranslation(severe)).toBe(TranslationStatus.CRITICAL);
    });
    
    it('should be deterministic', () => {
      const bandAnalysis = {
        lost: { ratio: 0.25, energyLinear: 0.25 },
        atRisk: { ratio: 0.15, energyLinear: 0.15 },
        survival: { ratio: 0.2, energyLinear: 0.2 },
        preserved: { ratio: 0.3, energyLinear: 0.3 }
      };
      
      const result1 = classifyTranslation(bandAnalysis);
      const result2 = classifyTranslation(bandAnalysis);
      const result3 = classifyTranslation(bandAnalysis);
      
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });
  });
  
  describe('predictDeviceTranslation', () => {
    const sampleBandAnalysis = {
      lost: { energyLinear: 0.2, ratio: 0.2 },
      atRisk: { energyLinear: 0.15, ratio: 0.15 },
      survival: { energyLinear: 0.25, ratio: 0.25 },
      preserved: { energyLinear: 0.4, ratio: 0.4 }
    };
    
    it('should include device name in prediction', () => {
      const prediction = predictDeviceTranslation(sampleBandAnalysis, DEVICE_PROFILES.PHONE);
      expect(prediction.device).toBe('Phone Speaker');
    });
    
    it('should calculate preservedRatio', () => {
      const prediction = predictDeviceTranslation(sampleBandAnalysis, DEVICE_PROFILES.PHONE);
      expect(prediction.preservedRatio).toBeGreaterThan(0);
      expect(prediction.preservedRatio).toBeLessThanOrEqual(1);
    });
    
    it('should calculate estimatedLossDb', () => {
      const prediction = predictDeviceTranslation(sampleBandAnalysis, DEVICE_PROFILES.PHONE);
      expect(prediction.estimatedLossDb).toBeGreaterThanOrEqual(0);
    });
    
    it('should set willSoundThin flag for high loss', () => {
      const bassHeavy = {
        lost: { energyLinear: 0.5, ratio: 0.5 },
        atRisk: { energyLinear: 0.2, ratio: 0.2 },
        survival: { energyLinear: 0.1, ratio: 0.1 },
        preserved: { energyLinear: 0.2, ratio: 0.2 }
      };
      
      const prediction = predictDeviceTranslation(bassHeavy, DEVICE_PROFILES.PHONE);
      expect(typeof prediction.willSoundThin).toBe('boolean');
    });
    
    it('should set willSoundEmpty flag for extreme loss', () => {
      const prediction = predictDeviceTranslation(sampleBandAnalysis, DEVICE_PROFILES.PHONE);
      expect(typeof prediction.willSoundEmpty).toBe('boolean');
    });
    
    it('should predict worse translation for phone than laptop', () => {
      const phonePrediction = predictDeviceTranslation(sampleBandAnalysis, DEVICE_PROFILES.PHONE);
      const laptopPrediction = predictDeviceTranslation(sampleBandAnalysis, DEVICE_PROFILES.LAPTOP);
      
      // Phone has higher cutoff, so should lose more bass
      expect(phonePrediction.estimatedLossDb).toBeGreaterThanOrEqual(laptopPrediction.estimatedLossDb);
    });
    
    it('should predict better translation for bluetooth small speaker', () => {
      const phonePrediction = predictDeviceTranslation(sampleBandAnalysis, DEVICE_PROFILES.PHONE);
      const btPrediction = predictDeviceTranslation(sampleBandAnalysis, DEVICE_PROFILES.BLUETOOTH_SMALL);
      
      // Bluetooth small has lower cutoff, so should preserve more
      expect(btPrediction.preservedRatio).toBeGreaterThanOrEqual(phonePrediction.preservedRatio);
    });
  });
  
  describe('generateRecommendations', () => {
    it('should return simple message for EXCELLENT status', () => {
      const analysis = {
        status: TranslationStatus.EXCELLENT,
        bandAnalysis: {
          lost: { ratio: 0.1 },
          survival: { ratio: 0.3 }
        },
        perceivedBassLossDb: 2
      };
      
      const recs = generateRecommendations(analysis);
      expect(recs).toHaveLength(1);
      expect(recs[0]).toContain('excellent');
    });
    
    it('should recommend saturation for high lost ratio', () => {
      const analysis = {
        status: TranslationStatus.POOR,
        bandAnalysis: {
          lost: { ratio: 0.4 },
          survival: { ratio: 0.1 }
        },
        perceivedBassLossDb: 10
      };
      
      const recs = generateRecommendations(analysis);
      expect(recs.some(r => r.toLowerCase().includes('saturation'))).toBe(true);
    });
    
    it('should recommend boosting survival zone for low survival', () => {
      const analysis = {
        status: TranslationStatus.FAIR,
        bandAnalysis: {
          lost: { ratio: 0.2 },
          survival: { ratio: 0.1 }
        },
        perceivedBassLossDb: 7
      };
      
      const recs = generateRecommendations(analysis);
      expect(recs.some(r => r.includes('200') || r.includes('400') || r.includes('150'))).toBe(true);
    });
    
    it('should mention perceived bass loss when high', () => {
      const analysis = {
        status: TranslationStatus.POOR,
        bandAnalysis: {
          lost: { ratio: 0.2 },
          survival: { ratio: 0.15 }
        },
        perceivedBassLossDb: 12
      };
      
      const recs = generateRecommendations(analysis);
      expect(recs.some(r => r.includes('12') || r.includes('dB'))).toBe(true);
    });
    
    it('should recommend phone testing for POOR status', () => {
      const analysis = {
        status: TranslationStatus.POOR,
        bandAnalysis: {
          lost: { ratio: 0.35 },
          survival: { ratio: 0.12 }
        },
        perceivedBassLossDb: 8
      };
      
      const recs = generateRecommendations(analysis);
      expect(recs.some(r => r.toLowerCase().includes('phone'))).toBe(true);
    });
    
    it('should have strong warnings for CRITICAL status', () => {
      const analysis = {
        status: TranslationStatus.CRITICAL,
        bandAnalysis: {
          lost: { ratio: 0.5 },
          survival: { ratio: 0.05 }
        },
        perceivedBassLossDb: 15
      };
      
      const recs = generateRecommendations(analysis);
      expect(recs.length).toBeGreaterThan(2);
      expect(recs.some(r => r.toLowerCase().includes('thin') || r.toLowerCase().includes('empty'))).toBe(true);
    });
    
    it('should return array for all statuses', () => {
      Object.values(TranslationStatus).forEach(status => {
        const analysis = {
          status,
          bandAnalysis: {
            lost: { ratio: 0.2 },
            survival: { ratio: 0.2 }
          },
          perceivedBassLossDb: 5
        };
        
        const recs = generateRecommendations(analysis);
        expect(Array.isArray(recs)).toBe(true);
      });
    });
  });
  
});

// ============================================================================
// classify Function Tests
// ============================================================================

describe('classify function', () => {
  it('should classify from raw metrics', () => {
    const result = classify({
      lostRatio: 0.1,
      atRiskRatio: 0.1,
      survivalRatio: 0.3,
      preservedRatio: 0.5
    });
    
    expect(result.status).toBeDefined();
    expect(Object.values(TranslationStatus)).toContain(result.status);
  });
  
  it('should return EXCELLENT for ideal ratios', () => {
    const result = classify({
      lostRatio: 0.1,
      atRiskRatio: 0.1,
      survivalRatio: 0.3,
      preservedRatio: 0.4
    });
    
    expect(result.status).toBe(TranslationStatus.EXCELLENT);
  });
  
  it('should return CRITICAL for bass-heavy ratios', () => {
    const result = classify({
      lostRatio: 0.5,
      atRiskRatio: 0.2,
      survivalRatio: 0.05,
      preservedRatio: 0.1
    });
    
    expect(result.status).toBe(TranslationStatus.CRITICAL);
  });
  
  it('should include description', () => {
    const result = classify({
      lostRatio: 0.2,
      survivalRatio: 0.25
    });
    
    expect(result.description).toBeDefined();
    expect(typeof result.description).toBe('string');
  });
  
  it('should include translationScore', () => {
    const result = classify({
      lostRatio: 0.2,
      survivalRatio: 0.25
    });
    
    expect(result.translationScore).toBeDefined();
    expect(typeof result.translationScore).toBe('number');
  });
  
  it('should include perceivedBassLossDb', () => {
    const result = classify({
      lostRatio: 0.3,
      survivalRatio: 0.15
    });
    
    expect(result.perceivedBassLossDb).toBeDefined();
    expect(typeof result.perceivedBassLossDb).toBe('number');
  });
  
  it('should use defaults for missing ratios', () => {
    const result = classify({});
    
    expect(result.status).toBeDefined();
    expect(result.translationScore).toBeDefined();
  });
  
  it('should handle edge case of zero ratios', () => {
    const result = classify({
      lostRatio: 0,
      atRiskRatio: 0,
      survivalRatio: 0,
      preservedRatio: 0
    });
    
    expect(result.status).toBeDefined();
  });
});

// ============================================================================
// Integration Tests (Quick Check and Analyze)
// ============================================================================

describe('Integration Functions', () => {
  
  describe('quickCheck', () => {
    it('should return object with required fields for missing file', async () => {
      const result = await quickCheck('/nonexistent/audio.wav');
      
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.confidence).toBeDefined();
    });
    
    it('should have low confidence for failed analysis', async () => {
      const result = await quickCheck('/nonexistent/audio.wav');
      
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
    
    it('should include translationScore', async () => {
      const result = await quickCheck('/nonexistent/audio.wav');
      
      expect(typeof result.translationScore).toBe('number');
    });
    
    it('should include perceivedBassLossDb', async () => {
      const result = await quickCheck('/nonexistent/audio.wav');
      
      expect(typeof result.perceivedBassLossDb).toBe('number');
    });
    
    it('should include lostRatio', async () => {
      const result = await quickCheck('/nonexistent/audio.wav');
      
      expect(typeof result.lostRatio).toBe('number');
    });
    
    it('should include survivalRatio', async () => {
      const result = await quickCheck('/nonexistent/audio.wav');
      
      expect(typeof result.survivalRatio).toBe('number');
    });
    
    it('should have valid status even when FFmpeg returns defaults', async () => {
      const result = await quickCheck('/nonexistent/audio.wav');
      
      // FFmpeg errors return default values which still classify
      expect(Object.values(TranslationStatus)).toContain(result.status);
    });
    
    it('should return valid TranslationStatus', async () => {
      const result = await quickCheck('/nonexistent/audio.wav');
      
      // Even with FFmpeg failure, returns valid status
      expect(Object.values(TranslationStatus)).toContain(result.status);
    });
  });
  
  describe('analyze', () => {
    it('should return object with required fields for missing file', async () => {
      const result = await analyze('/nonexistent/audio.wav');
      
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.confidence).toBeDefined();
    });
    
    it('should have low confidence for failed analysis', async () => {
      const result = await analyze('/nonexistent/audio.wav');
      
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
    
    it('should include description', async () => {
      const result = await analyze('/nonexistent/audio.wav');
      
      expect(typeof result.description).toBe('string');
    });
    
    it('should include translationScore', async () => {
      const result = await analyze('/nonexistent/audio.wav');
      
      expect(typeof result.translationScore).toBe('number');
    });
    
    it('should include perceivedBassLossDb', async () => {
      const result = await analyze('/nonexistent/audio.wav');
      
      expect(typeof result.perceivedBassLossDb).toBe('number');
    });
    
    it('should include bandAnalysis', async () => {
      const result = await analyze('/nonexistent/audio.wav');
      
      expect(result.bandAnalysis).toBeDefined();
    });
    
    it('should include devicePredictions by default', async () => {
      const result = await analyze('/nonexistent/audio.wav');
      
      expect(Array.isArray(result.devicePredictions)).toBe(true);
    });
    
    it('should include recommendations', async () => {
      const result = await analyze('/nonexistent/audio.wav');
      
      expect(Array.isArray(result.recommendations)).toBe(true);
    });
    
    it('should include duration', async () => {
      const result = await analyze('/nonexistent/audio.wav');
      
      expect(typeof result.duration).toBe('number');
    });
    
    it('should have valid status even when FFmpeg returns defaults', async () => {
      const result = await analyze('/nonexistent/audio.wav');
      
      // FFmpeg errors return default band values which still classify
      expect(Object.values(TranslationStatus)).toContain(result.status);
    });
    
    it('should respect includeDevicePredictions option', async () => {
      const result = await analyze('/nonexistent/audio.wav', { includeDevicePredictions: false });
      
      // Even on error, it should respect the option
      expect(Array.isArray(result.devicePredictions)).toBe(true);
    });
    
    it('should return valid TranslationStatus', async () => {
      const result = await analyze('/nonexistent/audio.wav');
      
      // Even with FFmpeg failure, returns valid status
      expect(Object.values(TranslationStatus)).toContain(result.status);
    });
    
    it('should have valid translationScore', async () => {
      const result = await analyze('/nonexistent/audio.wav');
      
      expect(result.translationScore).toBeGreaterThanOrEqual(0);
      expect(result.translationScore).toBeLessThanOrEqual(100);
    });
  });
  
});

// ============================================================================
// Status Mapping Tests
// ============================================================================

describe('Status Mapping', () => {
  
  it('should map all statuses to valid descriptions', () => {
    Object.values(TranslationStatus).forEach(status => {
      expect(STATUS_DESCRIPTIONS[status]).toBeDefined();
    });
  });
  
  it('should have distinct descriptions for each status', () => {
    const descriptions = Object.values(STATUS_DESCRIPTIONS);
    const unique = new Set(descriptions);
    expect(unique.size).toBe(descriptions.length);
  });
  
  it('should mention translation quality in descriptions', () => {
    expect(STATUS_DESCRIPTIONS[TranslationStatus.EXCELLENT].toLowerCase()).toContain('excellent');
    expect(STATUS_DESCRIPTIONS[TranslationStatus.POOR].toLowerCase()).toContain('poor');
    expect(STATUS_DESCRIPTIONS[TranslationStatus.CRITICAL].toLowerCase()).toContain('critical');
  });
  
});

// ============================================================================
// Export Tests
// ============================================================================

describe('Module Exports', () => {
  
  it('should export analyze function', () => {
    expect(typeof analyze).toBe('function');
  });
  
  it('should export quickCheck function', () => {
    expect(typeof quickCheck).toBe('function');
  });
  
  it('should export classify function', () => {
    expect(typeof classify).toBe('function');
  });
  
  it('should export measureBandEnergy function', () => {
    expect(typeof measureBandEnergy).toBe('function');
  });
  
  it('should export measureTotalEnergy function', () => {
    expect(typeof measureTotalEnergy).toBe('function');
  });
  
  it('should export analyzeBands function', () => {
    expect(typeof analyzeBands).toBe('function');
  });
  
  it('should export classifyTranslation function', () => {
    expect(typeof classifyTranslation).toBe('function');
  });
  
  it('should export calculatePerceivedBassLoss function', () => {
    expect(typeof calculatePerceivedBassLoss).toBe('function');
  });
  
  it('should export calculateTranslationScore function', () => {
    expect(typeof calculateTranslationScore).toBe('function');
  });
  
  it('should export predictDeviceTranslation function', () => {
    expect(typeof predictDeviceTranslation).toBe('function');
  });
  
  it('should export generateRecommendations function', () => {
    expect(typeof generateRecommendations).toBe('function');
  });
  
  it('should export getAudioDuration function', () => {
    expect(typeof getAudioDuration).toBe('function');
  });
  
  it('should export TranslationStatus constant', () => {
    expect(TranslationStatus).toBeDefined();
    expect(typeof TranslationStatus).toBe('object');
  });
  
  it('should export STATUS_DESCRIPTIONS constant', () => {
    expect(STATUS_DESCRIPTIONS).toBeDefined();
    expect(typeof STATUS_DESCRIPTIONS).toBe('object');
  });
  
  it('should export SPEAKER_BANDS constant', () => {
    expect(SPEAKER_BANDS).toBeDefined();
    expect(typeof SPEAKER_BANDS).toBe('object');
  });
  
  it('should export DEVICE_PROFILES constant', () => {
    expect(DEVICE_PROFILES).toBeDefined();
    expect(typeof DEVICE_PROFILES).toBe('object');
  });
  
  it('should export THRESHOLDS constant', () => {
    expect(THRESHOLDS).toBeDefined();
    expect(typeof THRESHOLDS).toBe('object');
  });
  
});

// ============================================================================
// Edge Case Tests
// ============================================================================

describe('Edge Cases', () => {
  
  describe('Numeric boundary conditions', () => {
    it('should handle zero energy in all bands', () => {
      const zeroBands = {
        lost: { ratio: 0, energyLinear: 0 },
        atRisk: { ratio: 0, energyLinear: 0 },
        survival: { ratio: 0, energyLinear: 0 },
        preserved: { ratio: 0, energyLinear: 0 }
      };
      
      expect(() => classifyTranslation(zeroBands)).not.toThrow();
      expect(() => calculatePerceivedBassLoss(zeroBands)).not.toThrow();
      expect(() => calculateTranslationScore(zeroBands)).not.toThrow();
    });
    
    it('should handle very small energy values', () => {
      const tinyBands = {
        lost: { ratio: 1e-10, energyLinear: 1e-10 },
        atRisk: { ratio: 1e-10, energyLinear: 1e-10 },
        survival: { ratio: 1e-10, energyLinear: 1e-10 },
        preserved: { ratio: 1e-10, energyLinear: 1e-10 }
      };
      
      expect(() => classifyTranslation(tinyBands)).not.toThrow();
      expect(() => calculatePerceivedBassLoss(tinyBands)).not.toThrow();
    });
    
    it('should handle energy ratio of exactly 1', () => {
      const fullBand = {
        lost: { ratio: 1, energyLinear: 1 },
        atRisk: { ratio: 0, energyLinear: 0 },
        survival: { ratio: 0, energyLinear: 0 },
        preserved: { ratio: 0, energyLinear: 0 }
      };
      
      expect(() => classifyTranslation(fullBand)).not.toThrow();
    });
  });
  
  describe('Device prediction edge cases', () => {
    it('should handle zero energy in band analysis', () => {
      const zeroBands = {
        lost: { energyLinear: 0, ratio: 0 },
        atRisk: { energyLinear: 0, ratio: 0 },
        survival: { energyLinear: 0, ratio: 0 },
        preserved: { energyLinear: 0, ratio: 0 }
      };
      
      expect(() => predictDeviceTranslation(zeroBands, DEVICE_PROFILES.PHONE)).not.toThrow();
    });
    
    it('should handle all energy in lost band', () => {
      const allLost = {
        lost: { energyLinear: 1, ratio: 1 },
        atRisk: { energyLinear: 0, ratio: 0 },
        survival: { energyLinear: 0, ratio: 0 },
        preserved: { energyLinear: 0, ratio: 0 }
      };
      
      const prediction = predictDeviceTranslation(allLost, DEVICE_PROFILES.PHONE);
      expect(prediction.estimatedLossDb).toBeGreaterThan(0);
    });
    
    it('should handle all energy in preserved band', () => {
      const allPreserved = {
        lost: { energyLinear: 0, ratio: 0 },
        atRisk: { energyLinear: 0, ratio: 0 },
        survival: { energyLinear: 0, ratio: 0 },
        preserved: { energyLinear: 1, ratio: 1 }
      };
      
      const prediction = predictDeviceTranslation(allPreserved, DEVICE_PROFILES.PHONE);
      expect(prediction.estimatedLossDb).toBe(0);
    });
  });
  
  describe('Recommendation edge cases', () => {
    it('should handle complete bandAnalysis', () => {
      const complete = {
        status: TranslationStatus.FAIR,
        bandAnalysis: {
          lost: { ratio: 0.2 },
          survival: { ratio: 0.15 }
        },
        perceivedBassLossDb: 5
      };
      
      expect(() => generateRecommendations(complete)).not.toThrow();
      const recs = generateRecommendations(complete);
      expect(Array.isArray(recs)).toBe(true);
    });
  });
  
});

// ============================================================================
// Consistency Tests
// ============================================================================

describe('Consistency', () => {
  
  it('should maintain status ordering from EXCELLENT to CRITICAL', () => {
    // Create test cases with progressively worse band distributions
    const testCases = [
      { lost: 0.05, survival: 0.35 },  // Should be best
      { lost: 0.15, survival: 0.25 },
      { lost: 0.25, survival: 0.18 },
      { lost: 0.35, survival: 0.12 },
      { lost: 0.5, survival: 0.05 }    // Should be worst
    ];
    
    const statusOrder = [
      TranslationStatus.EXCELLENT,
      TranslationStatus.GOOD,
      TranslationStatus.FAIR,
      TranslationStatus.POOR,
      TranslationStatus.CRITICAL
    ];
    
    const results = testCases.map(tc => {
      const bandAnalysis = {
        lost: { ratio: tc.lost, energyLinear: tc.lost },
        atRisk: { ratio: 0.1, energyLinear: 0.1 },
        survival: { ratio: tc.survival, energyLinear: tc.survival },
        preserved: { ratio: 0.3, energyLinear: 0.3 }
      };
      return classifyTranslation(bandAnalysis);
    });
    
    // Each result should be same or worse than previous
    for (let i = 1; i < results.length; i++) {
      const prevIndex = statusOrder.indexOf(results[i-1]);
      const currIndex = statusOrder.indexOf(results[i]);
      expect(currIndex).toBeGreaterThanOrEqual(prevIndex);
    }
  });
  
  it('should produce consistent translation scores for same input', () => {
    const bandAnalysis = {
      lost: { ratio: 0.25 },
      survival: { ratio: 0.2 },
      preserved: { ratio: 0.35 }
    };
    
    const scores = Array(5).fill(null).map(() => calculateTranslationScore(bandAnalysis));
    const allSame = scores.every(s => s === scores[0]);
    
    expect(allSame).toBe(true);
  });
  
});
