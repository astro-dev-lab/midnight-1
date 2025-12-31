/**
 * Loudness Standard Compliance Validator Tests
 * 
 * Tests for multi-platform simultaneous validation against
 * streaming services, broadcast standards, and distribution requirements.
 */

const {
  // Validation functions
  validatePlatform,
  validateMultiplePlatforms,
  validatePlatformGroup,
  quickCheck,
  
  // Analysis functions
  findOptimalTarget,
  predictNormalization,
  generateComplianceReport,
  generateRecommendations,
  
  // Utility functions
  getPlatformSpec,
  getPlatformGroup,
  getAllPlatforms,
  getPlatformsByCategory,
  calculateDeviation,
  
  // Constants
  PlatformCategory,
  ComplianceStatus,
  MeasurementType,
  PLATFORM_SPECS,
  PLATFORM_GROUPS,
  STATUS_DESCRIPTIONS
} = require('../services/loudnessComplianceValidator');

// ============================================================================
// Constants Tests
// ============================================================================

describe('Loudness Standard Compliance Validator', () => {
  describe('Constants', () => {
    describe('PlatformCategory', () => {
      it('should have all categories defined', () => {
        expect(PlatformCategory.STREAMING).toBe('STREAMING');
        expect(PlatformCategory.BROADCAST).toBe('BROADCAST');
        expect(PlatformCategory.CINEMA).toBe('CINEMA');
        expect(PlatformCategory.PODCAST).toBe('PODCAST');
        expect(PlatformCategory.GAMING).toBe('GAMING');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(PlatformCategory)).toBe(true);
      });
    });

    describe('ComplianceStatus', () => {
      it('should have all statuses defined', () => {
        expect(ComplianceStatus.COMPLIANT).toBe('COMPLIANT');
        expect(ComplianceStatus.WARNING).toBe('WARNING');
        expect(ComplianceStatus.NON_COMPLIANT).toBe('NON_COMPLIANT');
        expect(ComplianceStatus.UNKNOWN).toBe('UNKNOWN');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(ComplianceStatus)).toBe(true);
      });
    });

    describe('MeasurementType', () => {
      it('should have all measurement types', () => {
        expect(MeasurementType.INTEGRATED).toBe('INTEGRATED');
        expect(MeasurementType.SHORT_TERM).toBe('SHORT_TERM');
        expect(MeasurementType.MOMENTARY).toBe('MOMENTARY');
        expect(MeasurementType.TRUE_PEAK).toBe('TRUE_PEAK');
        expect(MeasurementType.LRA).toBe('LRA');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(MeasurementType)).toBe(true);
      });
    });

    describe('PLATFORM_SPECS', () => {
      it('should define major streaming platforms', () => {
        expect(PLATFORM_SPECS.spotify).toBeDefined();
        expect(PLATFORM_SPECS.apple_music).toBeDefined();
        expect(PLATFORM_SPECS.youtube).toBeDefined();
        expect(PLATFORM_SPECS.tidal).toBeDefined();
        expect(PLATFORM_SPECS.amazon_music).toBeDefined();
      });

      it('should define broadcast standards', () => {
        expect(PLATFORM_SPECS.ebu_r128).toBeDefined();
        expect(PLATFORM_SPECS.atsc_a85).toBeDefined();
        expect(PLATFORM_SPECS.arib_tr_b32).toBeDefined();
      });

      it('should have required properties for each platform', () => {
        for (const [id, spec] of Object.entries(PLATFORM_SPECS)) {
          expect(spec.name).toBeDefined();
          expect(spec.category).toBeDefined();
          expect(typeof spec.targetLufs).toBe('number');
          expect(typeof spec.toleranceLufs).toBe('number');
          expect(spec.description).toBeDefined();
        }
      });

      it('should have Spotify at -14 LUFS', () => {
        expect(PLATFORM_SPECS.spotify.targetLufs).toBe(-14);
      });

      it('should have Apple Music at -16 LUFS', () => {
        expect(PLATFORM_SPECS.apple_music.targetLufs).toBe(-16);
      });

      it('should have EBU R128 at -23 LUFS', () => {
        expect(PLATFORM_SPECS.ebu_r128.targetLufs).toBe(-23);
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(PLATFORM_SPECS)).toBe(true);
      });
    });

    describe('PLATFORM_GROUPS', () => {
      it('should define streaming groups', () => {
        expect(PLATFORM_GROUPS.streaming_all).toContain('spotify');
        expect(PLATFORM_GROUPS.streaming_major).toContain('apple_music');
      });

      it('should define broadcast groups', () => {
        expect(PLATFORM_GROUPS.broadcast_eu).toContain('ebu_r128');
        expect(PLATFORM_GROUPS.broadcast_us).toContain('atsc_a85');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(PLATFORM_GROUPS)).toBe(true);
      });
    });

    describe('STATUS_DESCRIPTIONS', () => {
      it('should have descriptions for all statuses', () => {
        for (const status of Object.values(ComplianceStatus)) {
          expect(STATUS_DESCRIPTIONS[status]).toBeDefined();
          expect(typeof STATUS_DESCRIPTIONS[status]).toBe('string');
        }
      });
    });
  });

  // ============================================================================
  // Utility Functions Tests
  // ============================================================================

  describe('Utility Functions', () => {
    describe('getPlatformSpec', () => {
      it('should return spec for known platforms', () => {
        const spec = getPlatformSpec('spotify');
        expect(spec.name).toBe('Spotify');
        expect(spec.targetLufs).toBe(-14);
      });

      it('should return null for unknown platforms', () => {
        expect(getPlatformSpec('unknown')).toBeNull();
      });
    });

    describe('getPlatformGroup', () => {
      it('should return platforms in group', () => {
        const group = getPlatformGroup('streaming_major');
        expect(group).toContain('spotify');
        expect(group).toContain('apple_music');
        expect(group).toContain('youtube');
      });

      it('should return empty array for unknown group', () => {
        expect(getPlatformGroup('unknown')).toEqual([]);
      });
    });

    describe('getAllPlatforms', () => {
      it('should return all platform IDs', () => {
        const platforms = getAllPlatforms();
        expect(platforms).toContain('spotify');
        expect(platforms).toContain('ebu_r128');
        expect(platforms.length).toBeGreaterThan(10);
      });
    });

    describe('getPlatformsByCategory', () => {
      it('should return streaming platforms', () => {
        const platforms = getPlatformsByCategory(PlatformCategory.STREAMING);
        expect(platforms).toContain('spotify');
        expect(platforms).toContain('apple_music');
      });

      it('should return broadcast platforms', () => {
        const platforms = getPlatformsByCategory(PlatformCategory.BROADCAST);
        expect(platforms).toContain('ebu_r128');
        expect(platforms).toContain('atsc_a85');
      });
    });

    describe('calculateDeviation', () => {
      it('should calculate positive deviation (louder)', () => {
        expect(calculateDeviation(-10, -14)).toBe(4);
      });

      it('should calculate negative deviation (quieter)', () => {
        expect(calculateDeviation(-18, -14)).toBe(-4);
      });

      it('should return 0 for exact match', () => {
        expect(calculateDeviation(-14, -14)).toBe(0);
      });
    });
  });

  // ============================================================================
  // Validation Functions Tests
  // ============================================================================

  describe('Validation Functions', () => {
    describe('validatePlatform', () => {
      it('should return COMPLIANT for matching loudness', () => {
        const result = validatePlatform(
          { integratedLufs: -14, truePeakDbtp: -1.5 },
          'spotify'
        );
        
        expect(result.status).toBe(ComplianceStatus.COMPLIANT);
        expect(result.platform).toBe('Spotify');
        expect(result.issues).toHaveLength(0);
      });

      it('should return WARNING for slight deviation', () => {
        const result = validatePlatform(
          { integratedLufs: -12.5, truePeakDbtp: -1.5 },
          'spotify'
        );
        
        expect(result.status).toBe(ComplianceStatus.WARNING);
        expect(result.issues.length).toBeGreaterThan(0);
      });

      it('should return NON_COMPLIANT for large deviation', () => {
        const result = validatePlatform(
          { integratedLufs: -8, truePeakDbtp: -1.5 },
          'spotify'
        );
        
        expect(result.status).toBe(ComplianceStatus.NON_COMPLIANT);
      });

      it('should detect true peak violations', () => {
        const result = validatePlatform(
          { integratedLufs: -14, truePeakDbtp: 0 },
          'spotify'
        );
        
        expect(result.status).toBe(ComplianceStatus.NON_COMPLIANT);
        expect(result.issues.some(i => i.type === MeasurementType.TRUE_PEAK)).toBe(true);
      });

      it('should check LRA for EBU R128', () => {
        const result = validatePlatform(
          { integratedLufs: -23, truePeakDbtp: -1.5, lra: 25 },
          'ebu_r128'
        );
        
        expect(result.issues.some(i => i.type === MeasurementType.LRA)).toBe(true);
      });

      it('should return UNKNOWN for missing metrics', () => {
        const result = validatePlatform({}, 'spotify');
        expect(result.status).toBe(ComplianceStatus.UNKNOWN);
      });

      it('should return UNKNOWN for unknown platform', () => {
        const result = validatePlatform(
          { integratedLufs: -14 },
          'unknown_platform'
        );
        expect(result.status).toBe(ComplianceStatus.UNKNOWN);
      });

      it('should include deviation in metrics', () => {
        const result = validatePlatform(
          { integratedLufs: -12, truePeakDbtp: -2 },
          'spotify'
        );
        
        expect(result.metrics.deviation).toBe(2);
      });
    });

    describe('validateMultiplePlatforms', () => {
      it('should validate against multiple platforms', () => {
        const result = validateMultiplePlatforms(
          { integratedLufs: -14, truePeakDbtp: -1.5 },
          ['spotify', 'youtube', 'tidal']
        );
        
        expect(result.results).toHaveLength(3);
        expect(result.summary.total).toBe(3);
      });

      it('should summarize compliance counts', () => {
        const result = validateMultiplePlatforms(
          { integratedLufs: -14, truePeakDbtp: -1.5 },
          ['spotify', 'youtube', 'apple_music']
        );
        
        // Spotify and YouTube target -14, Apple Music -16
        expect(result.summary.compliant).toBeGreaterThan(0);
      });

      it('should determine overall status', () => {
        const compliantResult = validateMultiplePlatforms(
          { integratedLufs: -14, truePeakDbtp: -1.5 },
          ['spotify', 'youtube']
        );
        expect(compliantResult.overallStatus).toBe(ComplianceStatus.COMPLIANT);
        
        const nonCompliantResult = validateMultiplePlatforms(
          { integratedLufs: -5, truePeakDbtp: -1.5 },
          ['spotify', 'youtube']
        );
        expect(nonCompliantResult.overallStatus).toBe(ComplianceStatus.NON_COMPLIANT);
      });

      it('should track compliant and non-compliant platforms', () => {
        const result = validateMultiplePlatforms(
          { integratedLufs: -14, truePeakDbtp: -1.5 },
          ['spotify', 'ebu_r128']
        );
        
        expect(result.compliantPlatforms).toContain('spotify');
        expect(result.nonCompliantPlatforms).toContain('ebu_r128');
      });

      it('should default to major streaming platforms', () => {
        const result = validateMultiplePlatforms(
          { integratedLufs: -14, truePeakDbtp: -1.5 }
        );
        
        expect(result.results.length).toBeGreaterThan(0);
      });
    });

    describe('validatePlatformGroup', () => {
      it('should validate against platform group', () => {
        const result = validatePlatformGroup(
          { integratedLufs: -14, truePeakDbtp: -1.5 },
          'streaming_major'
        );
        
        expect(result.groupId).toBe('streaming_major');
        expect(result.results.length).toBeGreaterThan(0);
      });

      it('should return error for unknown group', () => {
        const result = validatePlatformGroup(
          { integratedLufs: -14 },
          'unknown_group'
        );
        
        expect(result.error).toBeDefined();
      });
    });

    describe('quickCheck', () => {
      it('should return essential compliance info', () => {
        const result = quickCheck(
          { integratedLufs: -14, truePeakDbtp: -1.5 },
          ['spotify', 'youtube']
        );
        
        expect(result.overallStatus).toBeDefined();
        expect(typeof result.isCompliant).toBe('boolean');
        expect(typeof result.hasWarnings).toBe('boolean');
        expect(typeof result.hasErrors).toBe('boolean');
        expect(result.complianceRate).toBeDefined();
      });

      it('should detect compliant audio', () => {
        const result = quickCheck(
          { integratedLufs: -14, truePeakDbtp: -1.5 },
          ['spotify', 'youtube']
        );
        
        expect(result.isCompliant).toBe(true);
      });

      it('should detect non-compliant audio', () => {
        const result = quickCheck(
          { integratedLufs: -5, truePeakDbtp: 0 },
          ['spotify']
        );
        
        expect(result.isCompliant).toBe(false);
        expect(result.hasErrors).toBe(true);
      });
    });
  });

  // ============================================================================
  // Analysis Functions Tests
  // ============================================================================

  describe('Analysis Functions', () => {
    describe('findOptimalTarget', () => {
      it('should find optimal target for streaming', () => {
        const result = findOptimalTarget(['spotify', 'youtube', 'tidal']);
        
        expect(result.optimalLufs).toBe(-14);
        expect(result.optimalTruePeak).toBeDefined();
      });

      it('should include target range', () => {
        const result = findOptimalTarget(['spotify', 'apple_music']);
        
        expect(result.targetRange.min).toBeDefined();
        expect(result.targetRange.max).toBeDefined();
        expect(result.targetRange.spread).toBe(2); // -14 to -16
      });

      it('should find strictest true peak', () => {
        const result = findOptimalTarget(['spotify', 'amazon_music']);
        
        // Amazon Music has stricter -2 dBTP limit
        expect(result.optimalTruePeak).toBe(-2.0);
      });

      it('should provide recommendation', () => {
        const result = findOptimalTarget(['spotify', 'youtube']);
        
        expect(result.recommendation).toContain('LUFS');
        expect(result.recommendation).toContain('dBTP');
      });

      it('should default to major streaming platforms', () => {
        const result = findOptimalTarget();
        
        expect(result.optimalLufs).toBeDefined();
        expect(result.platforms.length).toBeGreaterThan(0);
      });

      it('should return error for no valid platforms', () => {
        const result = findOptimalTarget(['invalid']);
        
        expect(result.error).toBeDefined();
      });
    });

    describe('predictNormalization', () => {
      it('should predict gain reduction for loud audio', () => {
        const result = predictNormalization(
          { integratedLufs: -10 },
          ['spotify']
        );
        
        expect(result.predictions[0].action).toBe('reduce');
        expect(result.predictions[0].gainChange).toBe(-4); // -10 to -14
      });

      it('should predict gain boost for quiet audio', () => {
        const result = predictNormalization(
          { integratedLufs: -18 },
          ['spotify']
        );
        
        // Spotify boosts quiet content
        expect(result.predictions[0].action).toBe('boost');
        expect(result.predictions[0].gainChange).toBe(4);
      });

      it('should predict no change for YouTube quiet audio', () => {
        const result = predictNormalization(
          { integratedLufs: -18 },
          ['youtube']
        );
        
        // YouTube does not boost
        expect(result.predictions[0].action).toBe('none');
        expect(result.predictions[0].willNormalize).toBe(false);
      });

      it('should summarize normalization impact', () => {
        const result = predictNormalization(
          { integratedLufs: -10 },
          ['spotify', 'youtube', 'apple_music']
        );
        
        expect(result.summary.total).toBe(3);
        expect(result.summary.willNormalize).toBeGreaterThan(0);
      });

      it('should find worst case platform', () => {
        const result = predictNormalization(
          { integratedLufs: -10 },
          ['spotify', 'apple_music']
        );
        
        // Apple Music at -16 has bigger gain change from -10
        expect(result.worstCase.platformId).toBe('apple_music');
      });

      it('should return error for missing loudness', () => {
        const result = predictNormalization({}, ['spotify']);
        expect(result.error).toBeDefined();
      });
    });

    describe('generateComplianceReport', () => {
      it('should generate complete report', () => {
        const report = generateComplianceReport(
          { integratedLufs: -14, truePeakDbtp: -1.5, lra: 8 }
        );
        
        expect(report.timestamp).toBeDefined();
        expect(report.metrics).toBeDefined();
        expect(report.compliance).toBeDefined();
        expect(report.optimalTarget).toBeDefined();
        expect(report.normalization).toBeDefined();
        expect(report.recommendations).toBeDefined();
      });

      it('should include compliance validation', () => {
        const report = generateComplianceReport(
          { integratedLufs: -14, truePeakDbtp: -1.5 },
          { platforms: ['spotify', 'youtube'] }
        );
        
        expect(report.compliance.results).toHaveLength(2);
      });

      it('should allow excluding normalization', () => {
        const report = generateComplianceReport(
          { integratedLufs: -14 },
          { includeNormalization: false }
        );
        
        expect(report.normalization).toBeUndefined();
      });

      it('should allow excluding recommendations', () => {
        const report = generateComplianceReport(
          { integratedLufs: -14 },
          { includeRecommendations: false }
        );
        
        expect(report.recommendations).toBeUndefined();
      });
    });

    describe('generateRecommendations', () => {
      it('should recommend reducing loudness for loud audio', () => {
        const validation = validateMultiplePlatforms(
          { integratedLufs: -8, truePeakDbtp: -1.5 },
          ['spotify']
        );
        const optimal = findOptimalTarget(['spotify']);
        
        const recommendations = generateRecommendations(validation, optimal);
        
        expect(recommendations.some(r => r.includes('Reduce'))).toBe(true);
      });

      it('should recommend true peak limiting', () => {
        const validation = validateMultiplePlatforms(
          { integratedLufs: -14, truePeakDbtp: 0 },
          ['spotify']
        );
        
        const recommendations = generateRecommendations(validation, null);
        
        expect(recommendations.some(r => r.includes('peak'))).toBe(true);
      });

      it('should recommend compression for high LRA', () => {
        const validation = validateMultiplePlatforms(
          { integratedLufs: -23, truePeakDbtp: -1.5, lra: 25 },
          ['ebu_r128']
        );
        
        const recommendations = generateRecommendations(validation, null);
        
        expect(recommendations.some(r => r.includes('compression'))).toBe(true);
      });

      it('should confirm no changes for compliant audio', () => {
        const validation = validateMultiplePlatforms(
          { integratedLufs: -14, truePeakDbtp: -1.5 },
          ['spotify', 'youtube']
        );
        const optimal = findOptimalTarget(['spotify']);
        
        const recommendations = generateRecommendations(validation, optimal);
        
        expect(recommendations.some(r => r.includes('no changes'))).toBe(true);
      });

      it('should return empty for null validation', () => {
        expect(generateRecommendations(null, null)).toHaveLength(0);
      });
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration Tests', () => {
    describe('Streaming workflow', () => {
      it('should validate typical mastered audio', () => {
        const metrics = {
          integratedLufs: -14,
          truePeakDbtp: -1.0,
          lra: 7
        };
        
        const result = validatePlatformGroup(metrics, 'streaming_major');
        
        expect(result.summary.compliant).toBeGreaterThan(0);
      });

      it('should handle over-compressed audio', () => {
        const metrics = {
          integratedLufs: -8,
          truePeakDbtp: -0.5,
          lra: 4
        };
        
        const result = validatePlatformGroup(metrics, 'streaming_all');
        
        expect(result.summary.nonCompliant).toBeGreaterThan(0);
      });

      it('should handle dynamic/quiet audio', () => {
        const metrics = {
          integratedLufs: -20,
          truePeakDbtp: -3.0,
          lra: 15
        };
        
        const predictions = predictNormalization(metrics, ['spotify', 'youtube']);
        
        // Spotify should boost, YouTube should not
        const spotifyPrediction = predictions.predictions.find(p => p.platformId === 'spotify');
        const youtubePrediction = predictions.predictions.find(p => p.platformId === 'youtube');
        
        expect(spotifyPrediction.willNormalize).toBe(true);
        expect(youtubePrediction.willNormalize).toBe(false);
      });
    });

    describe('Broadcast workflow', () => {
      it('should validate EBU R128 compliance', () => {
        const metrics = {
          integratedLufs: -23,
          truePeakDbtp: -1.0,
          lra: 15
        };
        
        const result = validatePlatform(metrics, 'ebu_r128');
        
        expect(result.status).toBe(ComplianceStatus.COMPLIANT);
      });

      it('should detect broadcast non-compliance', () => {
        const metrics = {
          integratedLufs: -14, // Too loud for broadcast
          truePeakDbtp: -1.0,
          lra: 8
        };
        
        const result = validatePlatformGroup(metrics, 'broadcast_intl');
        
        expect(result.summary.nonCompliant).toBeGreaterThan(0);
      });
    });

    describe('Multi-platform optimization', () => {
      it('should find optimal target across platforms', () => {
        const optimal = findOptimalTarget(['spotify', 'apple_music', 'youtube']);
        
        // Should be between -14 and -16
        expect(optimal.optimalLufs).toBeGreaterThanOrEqual(-16);
        expect(optimal.optimalLufs).toBeLessThanOrEqual(-14);
      });

      it('should generate comprehensive report', () => {
        const metrics = {
          integratedLufs: -13,
          truePeakDbtp: -0.8,
          lra: 9
        };
        
        const report = generateComplianceReport(metrics, {
          platforms: ['spotify', 'apple_music', 'youtube', 'ebu_r128']
        });
        
        expect(report.compliance.results).toHaveLength(4);
        expect(report.recommendations.length).toBeGreaterThan(0);
      });
    });

    describe('Edge cases', () => {
      it('should handle extreme loudness values', () => {
        const result = validatePlatform(
          { integratedLufs: -50, truePeakDbtp: -20 },
          'spotify'
        );
        
        expect(result.status).toBeDefined();
      });

      it('should handle missing optional metrics', () => {
        const result = validatePlatform(
          { integratedLufs: -14 },
          'spotify'
        );
        
        // Should still validate without true peak
        expect(result.status).toBeDefined();
      });

      it('should provide consistent results', () => {
        const metrics = { integratedLufs: -14, truePeakDbtp: -1.5 };
        
        const result1 = quickCheck(metrics, ['spotify']);
        const result2 = quickCheck(metrics, ['spotify']);
        
        expect(result1.isCompliant).toBe(result2.isCompliant);
      });
    });
  });

  // ============================================================================
  // API Contract Tests
  // ============================================================================

  describe('API Contract', () => {
    it('should export all required functions', () => {
      expect(typeof validatePlatform).toBe('function');
      expect(typeof validateMultiplePlatforms).toBe('function');
      expect(typeof validatePlatformGroup).toBe('function');
      expect(typeof quickCheck).toBe('function');
      expect(typeof findOptimalTarget).toBe('function');
      expect(typeof predictNormalization).toBe('function');
      expect(typeof generateComplianceReport).toBe('function');
      expect(typeof generateRecommendations).toBe('function');
    });

    it('should export all required constants', () => {
      expect(PlatformCategory).toBeDefined();
      expect(ComplianceStatus).toBeDefined();
      expect(MeasurementType).toBeDefined();
      expect(PLATFORM_SPECS).toBeDefined();
      expect(PLATFORM_GROUPS).toBeDefined();
    });

    it('should maintain consistent return shapes', () => {
      const metrics = { integratedLufs: -14, truePeakDbtp: -1.5 };
      
      // validatePlatform
      const single = validatePlatform(metrics, 'spotify');
      expect(single).toHaveProperty('status');
      expect(single).toHaveProperty('issues');
      expect(single).toHaveProperty('platform');
      
      // validateMultiplePlatforms
      const multi = validateMultiplePlatforms(metrics, ['spotify']);
      expect(multi).toHaveProperty('overallStatus');
      expect(multi).toHaveProperty('summary');
      expect(multi).toHaveProperty('results');
      
      // quickCheck
      const quick = quickCheck(metrics, ['spotify']);
      expect(quick).toHaveProperty('isCompliant');
      expect(quick).toHaveProperty('complianceRate');
    });
  });
});
