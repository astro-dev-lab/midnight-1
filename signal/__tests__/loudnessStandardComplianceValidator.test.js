/**
 * Loudness Standard Compliance Validator Tests
 */

const {
  analyze,
  validatePlatform,
  validateAllPlatforms,
  getComplianceMatrix,
  quickCheck,
  findOptimalTarget,
  calculateRequiredAdjustments,
  getPlatformSpec,
  getPlatformsByCategory,
  generateWarnings,
  generateRecommendations,
  ComplianceStatus,
  PlatformCategory,
  CheckResult,
  STATUS_DESCRIPTIONS,
  PLATFORM_SPECS,
  PLATFORM_GROUPS,
  THRESHOLDS
} = require('../services/loudnessStandardComplianceValidator');

// ============================================================================
// Constants Tests
// ============================================================================

describe('Loudness Standard Compliance Validator', () => {
  describe('Constants', () => {
    describe('ComplianceStatus', () => {
      it('should have all status values defined', () => {
        expect(ComplianceStatus.FULLY_COMPLIANT).toBe('FULLY_COMPLIANT');
        expect(ComplianceStatus.MOSTLY_COMPLIANT).toBe('MOSTLY_COMPLIANT');
        expect(ComplianceStatus.PARTIALLY_COMPLIANT).toBe('PARTIALLY_COMPLIANT');
        expect(ComplianceStatus.NON_COMPLIANT).toBe('NON_COMPLIANT');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(ComplianceStatus)).toBe(true);
      });
    });

    describe('PlatformCategory', () => {
      it('should have all categories defined', () => {
        expect(PlatformCategory.STREAMING).toBe('STREAMING');
        expect(PlatformCategory.BROADCAST).toBe('BROADCAST');
        expect(PlatformCategory.CONTENT_TYPE).toBe('CONTENT_TYPE');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(PlatformCategory)).toBe(true);
      });
    });

    describe('PLATFORM_SPECS', () => {
      it('should define major streaming platforms', () => {
        expect(PLATFORM_SPECS.SPOTIFY).toBeDefined();
        expect(PLATFORM_SPECS.APPLE_MUSIC).toBeDefined();
        expect(PLATFORM_SPECS.YOUTUBE).toBeDefined();
        expect(PLATFORM_SPECS.TIDAL).toBeDefined();
        expect(PLATFORM_SPECS.AMAZON_MUSIC).toBeDefined();
      });

      it('should define broadcast standards', () => {
        expect(PLATFORM_SPECS.EBU_R128).toBeDefined();
        expect(PLATFORM_SPECS.ATSC_A85).toBeDefined();
      });

      it('should have required fields for each platform', () => {
        for (const [key, spec] of Object.entries(PLATFORM_SPECS)) {
          expect(spec.name).toBeDefined();
          expect(spec.category).toBeDefined();
          expect(spec.integrated).toBeDefined();
          expect(spec.truePeak).toBeDefined();
        }
      });

      it('should have correct Spotify specs', () => {
        expect(PLATFORM_SPECS.SPOTIFY.integrated).toBe(-14);
        expect(PLATFORM_SPECS.SPOTIFY.truePeak).toBe(-1);
      });

      it('should have correct Apple Music specs', () => {
        expect(PLATFORM_SPECS.APPLE_MUSIC.integrated).toBe(-16);
        expect(PLATFORM_SPECS.APPLE_MUSIC.truePeak).toBe(-1);
      });

      it('should have correct EBU R128 specs', () => {
        expect(PLATFORM_SPECS.EBU_R128.integrated).toBe(-23);
        expect(PLATFORM_SPECS.EBU_R128.truePeak).toBe(-1);
      });
    });

    describe('PLATFORM_GROUPS', () => {
      it('should define platform groups', () => {
        expect(PLATFORM_GROUPS.ALL_STREAMING).toContain('SPOTIFY');
        expect(PLATFORM_GROUPS.MAJOR_STREAMING).toContain('APPLE_MUSIC');
        expect(PLATFORM_GROUPS.BROADCAST).toContain('EBU_R128');
      });

      it('should have ALL group containing all platforms', () => {
        expect(PLATFORM_GROUPS.ALL.length).toBe(Object.keys(PLATFORM_SPECS).length);
      });
    });

    describe('STATUS_DESCRIPTIONS', () => {
      it('should have description for each status', () => {
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
        const spec = getPlatformSpec('SPOTIFY');
        expect(spec.name).toBe('Spotify');
        expect(spec.integrated).toBe(-14);
      });

      it('should return null for unknown platforms', () => {
        expect(getPlatformSpec('UNKNOWN')).toBeNull();
      });
    });

    describe('getPlatformsByCategory', () => {
      it('should return streaming platforms', () => {
        const streaming = getPlatformsByCategory(PlatformCategory.STREAMING);
        expect(streaming).toContain('SPOTIFY');
        expect(streaming).toContain('APPLE_MUSIC');
        expect(streaming).not.toContain('EBU_R128');
      });

      it('should return broadcast platforms', () => {
        const broadcast = getPlatformsByCategory(PlatformCategory.BROADCAST);
        expect(broadcast).toContain('EBU_R128');
        expect(broadcast).toContain('ATSC_A85');
        expect(broadcast).not.toContain('SPOTIFY');
      });
    });
  });

  // ============================================================================
  // Single Platform Validation Tests
  // ============================================================================

  describe('Single Platform Validation', () => {
    describe('validatePlatform', () => {
      it('should pass for compliant loudness', () => {
        const result = validatePlatform(
          { integratedLoudness: -14, truePeak: -1.5, loudnessRange: 8 },
          'SPOTIFY'
        );
        
        expect(result.compliant).toBe(true);
        expect(result.integrated.pass).toBe(true);
        expect(result.truePeak.pass).toBe(true);
      });

      it('should fail for non-compliant loudness', () => {
        const result = validatePlatform(
          { integratedLoudness: -8, truePeak: 0, loudnessRange: 8 },
          'SPOTIFY'
        );
        
        expect(result.compliant).toBe(false);
        expect(result.integrated.pass).toBe(false);
        expect(result.truePeak.pass).toBe(false);
      });

      it('should calculate adjustment needed', () => {
        const result = validatePlatform(
          { integratedLoudness: -10, truePeak: -1, loudnessRange: 8 },
          'SPOTIFY'
        );
        
        expect(result.adjustmentNeeded).toBe(-4); // -14 - (-10) = -4
      });

      it('should handle alternative property names', () => {
        const result = validatePlatform(
          { integrated: -14, truePeakDbfs: -1.5, lra: 8 },
          'SPOTIFY'
        );
        
        expect(result.compliant).toBe(true);
      });

      it('should return error for unknown platform', () => {
        const result = validatePlatform(
          { integratedLoudness: -14 },
          'UNKNOWN_PLATFORM'
        );
        
        expect(result.compliant).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should handle missing data gracefully', () => {
        const result = validatePlatform({}, 'SPOTIFY');
        
        expect(result.compliant).toBe(false);
        expect(result.error).toContain('Missing');
      });

      it('should detect LRA issues', () => {
        const result = validatePlatform(
          { integratedLoudness: -14, truePeak: -1, loudnessRange: 2 },
          'SPOTIFY'
        );
        
        expect(result.lra.pass).toBe(false);
        expect(result.lra.issue).toBe('TOO_NARROW');
      });

      it('should warn within tolerance buffer', () => {
        const result = validatePlatform(
          { integratedLoudness: -12.5, truePeak: -1, loudnessRange: 8 },
          'SPOTIFY'
        );
        
        // 1.5 LU off, within warning range
        expect(result.integrated.result).toBe(CheckResult.WARNING);
      });
    });
  });

  // ============================================================================
  // Multi-Platform Validation Tests
  // ============================================================================

  describe('Multi-Platform Validation', () => {
    describe('validateAllPlatforms', () => {
      it('should validate against all platforms', () => {
        const result = validateAllPlatforms(
          { integratedLoudness: -14, truePeak: -1, loudnessRange: 8 },
          PLATFORM_GROUPS.MAJOR_STREAMING
        );
        
        expect(result.status).toBeDefined();
        expect(result.complianceScore).toBeDefined();
        expect(result.platforms).toBeDefined();
        expect(Object.keys(result.platforms).length).toBe(PLATFORM_GROUPS.MAJOR_STREAMING.length);
      });

      it('should calculate compliance score correctly', () => {
        // -14 LUFS should pass Spotify, YouTube, Tidal, Amazon but not Apple (-16)
        const result = validateAllPlatforms(
          { integratedLoudness: -14, truePeak: -2, loudnessRange: 8 },
          PLATFORM_GROUPS.MAJOR_STREAMING
        );
        
        expect(result.complianceScore).toBeGreaterThan(50);
        expect(result.summary.passing).toBeGreaterThan(0);
      });

      it('should return FULLY_COMPLIANT when all pass', () => {
        // Use a loudness that satisfies a subset we know will pass
        const result = validateAllPlatforms(
          { integratedLoudness: -14, truePeak: -2, loudnessRange: 8 },
          ['SPOTIFY', 'YOUTUBE', 'TIDAL']
        );
        
        expect(result.status).toBe(ComplianceStatus.FULLY_COMPLIANT);
        expect(result.complianceScore).toBe(100);
      });

      it('should return NON_COMPLIANT when most fail', () => {
        const result = validateAllPlatforms(
          { integratedLoudness: -5, truePeak: 2, loudnessRange: 2 },
          PLATFORM_GROUPS.ALL
        );
        
        expect(result.status).toBe(ComplianceStatus.NON_COMPLIANT);
        expect(result.complianceScore).toBeLessThan(50);
      });

      it('should include summary counts', () => {
        const result = validateAllPlatforms(
          { integratedLoudness: -14, truePeak: -1, loudnessRange: 8 },
          PLATFORM_GROUPS.MAJOR_STREAMING
        );
        
        expect(result.summary.total).toBe(PLATFORM_GROUPS.MAJOR_STREAMING.length);
        expect(result.summary.passing + result.summary.warnings + result.summary.failing)
          .toBe(result.summary.total);
      });
    });

    describe('getComplianceMatrix', () => {
      it('should group results by category', () => {
        const result = getComplianceMatrix(
          { integratedLoudness: -14, truePeak: -1, loudnessRange: 8 }
        );
        
        expect(result.byCategory).toBeDefined();
        expect(result.byCategory[PlatformCategory.STREAMING]).toBeDefined();
        expect(result.byCategory[PlatformCategory.BROADCAST]).toBeDefined();
      });

      it('should calculate category scores', () => {
        const result = getComplianceMatrix(
          { integratedLoudness: -14, truePeak: -1, loudnessRange: 8 }
        );
        
        expect(result.categoryScores).toBeDefined();
        expect(result.categoryScores[PlatformCategory.STREAMING]).toBeDefined();
      });
    });
  });

  // ============================================================================
  // Optimization Functions Tests
  // ============================================================================

  describe('Optimization Functions', () => {
    describe('findOptimalTarget', () => {
      it('should find optimal target for major streaming', () => {
        const result = findOptimalTarget(
          { integratedLoudness: -10 },
          PLATFORM_GROUPS.MAJOR_STREAMING
        );
        
        expect(result.recommendedTarget).toBeDefined();
        expect(result.adjustmentNeeded).toBeDefined();
        expect(result.satisfiedPlatforms).toBeDefined();
      });

      it('should calculate correct adjustment', () => {
        const result = findOptimalTarget(
          { integratedLoudness: -10 },
          ['SPOTIFY'] // -14 target
        );
        
        expect(result.adjustmentNeeded).toBe(-4);
      });

      it('should report 0 adjustment when optimal', () => {
        const result = findOptimalTarget(
          { integratedLoudness: -14 },
          ['SPOTIFY', 'YOUTUBE', 'TIDAL']
        );
        
        expect(result.adjustmentNeeded).toBe(0);
      });

      it('should handle missing data', () => {
        const result = findOptimalTarget({}, PLATFORM_GROUPS.MAJOR_STREAMING);
        
        expect(result.error).toBeDefined();
      });

      it('should include satisfaction rate', () => {
        const result = findOptimalTarget(
          { integratedLoudness: -14 },
          PLATFORM_GROUPS.MAJOR_STREAMING
        );
        
        expect(result.satisfactionRate).toBeDefined();
        expect(result.satisfactionRate).toBeGreaterThanOrEqual(0);
        expect(result.satisfactionRate).toBeLessThanOrEqual(100);
      });
    });

    describe('calculateRequiredAdjustments', () => {
      it('should calculate per-platform adjustments', () => {
        const result = calculateRequiredAdjustments(
          { integratedLoudness: -10, truePeak: -1 },
          ['SPOTIFY', 'APPLE_MUSIC']
        );
        
        expect(result.perPlatform.SPOTIFY).toBeDefined();
        expect(result.perPlatform.APPLE_MUSIC).toBeDefined();
        expect(result.perPlatform.SPOTIFY.loudnessAdjustment).toBe(-4);
        expect(result.perPlatform.APPLE_MUSIC.loudnessAdjustment).toBe(-6);
      });

      it('should detect when limiting is needed', () => {
        const result = calculateRequiredAdjustments(
          { integratedLoudness: -20, truePeak: -1 },
          ['SPOTIFY'] // Will need +6 dB, true peak would become +5
        );
        
        expect(result.perPlatform.SPOTIFY.needsLimiting).toBe(true);
      });

      it('should include summary statistics', () => {
        const result = calculateRequiredAdjustments(
          { integratedLoudness: -14, truePeak: -1 },
          PLATFORM_GROUPS.MAJOR_STREAMING
        );
        
        expect(result.summary.minAdjustment).toBeDefined();
        expect(result.summary.maxAdjustment).toBeDefined();
        expect(result.summary.range).toBeDefined();
      });
    });
  });

  // ============================================================================
  // Analysis Functions Tests
  // ============================================================================

  describe('Analysis Functions', () => {
    describe('generateWarnings', () => {
      it('should return empty for fully compliant', () => {
        const compliance = validateAllPlatforms(
          { integratedLoudness: -14, truePeak: -2, loudnessRange: 8 },
          ['SPOTIFY', 'YOUTUBE', 'TIDAL']
        );
        const warnings = generateWarnings(compliance);
        
        expect(warnings.length).toBe(0);
      });

      it('should warn about true peak issues', () => {
        const compliance = validateAllPlatforms(
          { integratedLoudness: -14, truePeak: 0.5, loudnessRange: 8 },
          PLATFORM_GROUPS.MAJOR_STREAMING
        );
        const warnings = generateWarnings(compliance);
        
        expect(warnings.some(w => w.includes('True peak'))).toBe(true);
      });

      it('should warn about loudness issues', () => {
        const compliance = validateAllPlatforms(
          { integratedLoudness: -8, truePeak: -1, loudnessRange: 8 },
          PLATFORM_GROUPS.MAJOR_STREAMING
        );
        const warnings = generateWarnings(compliance);
        
        expect(warnings.some(w => w.includes('Loudness'))).toBe(true);
      });

      it('should handle null input', () => {
        expect(generateWarnings(null)).toEqual([]);
      });
    });

    describe('generateRecommendations', () => {
      it('should recommend fully compliant status', () => {
        const compliance = {
          status: ComplianceStatus.FULLY_COMPLIANT,
          complianceScore: 100,
          platforms: {}
        };
        const recommendations = generateRecommendations(compliance);
        
        expect(recommendations.some(r => r.includes('fully compliant'))).toBe(true);
      });

      it('should recommend loudness adjustment when needed', () => {
        const compliance = validateAllPlatforms(
          { integratedLoudness: -10, truePeak: -1, loudnessRange: 8 },
          PLATFORM_GROUPS.MAJOR_STREAMING
        );
        const optimal = findOptimalTarget(
          { integratedLoudness: -10 },
          PLATFORM_GROUPS.MAJOR_STREAMING
        );
        const recommendations = generateRecommendations(compliance, optimal);
        
        expect(recommendations.some(r => r.includes('dB'))).toBe(true);
      });
    });

    describe('quickCheck', () => {
      it('should return simplified status', () => {
        const result = quickCheck(
          { integratedLoudness: -14, truePeak: -1, loudnessRange: 8 }
        );
        
        expect(result.status).toBeDefined();
        expect(result.complianceScore).toBeDefined();
        expect(typeof result.isFullyCompliant).toBe('boolean');
        expect(typeof result.needsWork).toBe('boolean');
      });

      it('should list failing platforms', () => {
        const result = quickCheck(
          { integratedLoudness: -5, truePeak: 2, loudnessRange: 8 }
        );
        
        expect(result.failingPlatforms).toBeDefined();
        expect(result.failingPlatforms.length).toBeGreaterThan(0);
      });
    });

    describe('analyze', () => {
      it('should return complete analysis', () => {
        const result = analyze(
          { integratedLoudness: -14, truePeak: -1, loudnessRange: 8 }
        );
        
        expect(result.status).toBeDefined();
        expect(result.complianceScore).toBeDefined();
        expect(result.platforms).toBeDefined();
        expect(result.optimal).toBeDefined();
        expect(result.adjustments).toBeDefined();
        expect(result.warnings).toBeDefined();
        expect(result.recommendations).toBeDefined();
        expect(result.analyzedAt).toBeDefined();
      });

      it('should include category breakdown', () => {
        const result = analyze(
          { integratedLoudness: -14, truePeak: -1, loudnessRange: 8 }
        );
        
        expect(result.byCategory).toBeDefined();
        expect(result.categoryScores).toBeDefined();
      });

      it('should respect platform options', () => {
        const result = analyze(
          { integratedLoudness: -14, truePeak: -1, loudnessRange: 8 },
          { platforms: ['SPOTIFY', 'APPLE_MUSIC'] }
        );
        
        expect(Object.keys(result.platforms)).toEqual(['SPOTIFY', 'APPLE_MUSIC']);
      });
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration Tests', () => {
    describe('Typical workflow scenarios', () => {
      it('should validate mastered audio for streaming', () => {
        const masteredAudio = {
          integratedLoudness: -14,
          truePeak: -1,
          loudnessRange: 7
        };
        
        const result = analyze(masteredAudio, {
          platforms: PLATFORM_GROUPS.ALL_STREAMING
        });
        
        expect(result.status).not.toBe(ComplianceStatus.NON_COMPLIANT);
      });

      it('should validate broadcast audio', () => {
        const broadcastAudio = {
          integratedLoudness: -23,
          truePeak: -1,
          loudnessRange: 12
        };
        
        const result = validateAllPlatforms(broadcastAudio, PLATFORM_GROUPS.BROADCAST);
        
        expect(result.platforms.EBU_R128.compliant).toBe(true);
      });

      it('should identify optimal loudness for multi-platform', () => {
        const currentAudio = {
          integratedLoudness: -12
        };
        
        const optimal = findOptimalTarget(currentAudio, PLATFORM_GROUPS.MAJOR_STREAMING);
        
        expect(optimal.satisfiedPlatforms.length).toBeGreaterThan(0);
        expect(optimal.recommendation).toBeDefined();
      });
    });

    describe('Edge cases', () => {
      it('should handle very loud audio', () => {
        const result = analyze({ integratedLoudness: -3, truePeak: 2 });
        
        expect(result.status).toBe(ComplianceStatus.NON_COMPLIANT);
        expect(result.warnings.length).toBeGreaterThan(0);
      });

      it('should handle very quiet audio', () => {
        const result = analyze({ integratedLoudness: -35, truePeak: -20 });
        
        expect(result.status).toBeDefined();
        // Should fail most streaming but might pass broadcast
      });

      it('should handle missing optional fields', () => {
        const result = analyze({ integratedLoudness: -14 });
        
        expect(result.status).toBeDefined();
        expect(result.platforms).toBeDefined();
      });
    });
  });

  // ============================================================================
  // API Contract Tests
  // ============================================================================

  describe('API Contract', () => {
    it('should export all required functions', () => {
      expect(typeof analyze).toBe('function');
      expect(typeof validatePlatform).toBe('function');
      expect(typeof validateAllPlatforms).toBe('function');
      expect(typeof getComplianceMatrix).toBe('function');
      expect(typeof quickCheck).toBe('function');
      expect(typeof findOptimalTarget).toBe('function');
      expect(typeof calculateRequiredAdjustments).toBe('function');
    });

    it('should export all required constants', () => {
      expect(ComplianceStatus).toBeDefined();
      expect(PlatformCategory).toBeDefined();
      expect(CheckResult).toBeDefined();
      expect(PLATFORM_SPECS).toBeDefined();
      expect(PLATFORM_GROUPS).toBeDefined();
    });
  });
});
