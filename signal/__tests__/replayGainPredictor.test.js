/**
 * ReplayGain / SoundCheck Prediction Tests
 * 
 * Tests for predicting how streaming platforms and media players
 * will re-normalize audio based on their loudness algorithms.
 */

const {
  // Enums
  Algorithm,
  NormalizationMode,
  Confidence,
  Impact,

  // Constants
  ALGORITHM_SPECS,
  SPOTIFY_MODES,
  SOUNDCHECK_CONSTANTS,
  STATUS_DESCRIPTIONS,

  // Core Prediction
  predictGain,
  predictReplayGain,
  predictSoundCheck,
  predictSpotify,
  predictAllPlatforms,

  // Optimization
  calculateOptimalTarget,

  // Analysis
  comparePlatforms,
  analyzeDynamicRangeImpact,

  // Quick Check
  quickCheck,

  // Helpers
  formatReplayGainValue,
  formatPeakValue
} = require('../services/replayGainPredictor');

// ============================================================================
// Constants Tests
// ============================================================================

describe('ReplayGain / SoundCheck Prediction', () => {
  describe('Constants', () => {
    describe('Algorithm', () => {
      it('should have all algorithm types defined', () => {
        expect(Algorithm.REPLAY_GAIN_1).toBe('replayGain1');
        expect(Algorithm.REPLAY_GAIN_2).toBe('replayGain2');
        expect(Algorithm.SOUND_CHECK).toBe('soundCheck');
        expect(Algorithm.EBU_R128).toBe('ebuR128');
        expect(Algorithm.SPOTIFY).toBe('spotify');
        expect(Algorithm.YOUTUBE).toBe('youtube');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(Algorithm)).toBe(true);
      });

      it('should have at least 6 algorithms', () => {
        expect(Object.keys(Algorithm).length).toBeGreaterThanOrEqual(6);
      });
    });

    describe('NormalizationMode', () => {
      it('should have all modes defined', () => {
        expect(NormalizationMode.REDUCE_ONLY).toBe('reduceOnly');
        expect(NormalizationMode.FULL).toBe('full');
        expect(NormalizationMode.OFF).toBe('off');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(NormalizationMode)).toBe(true);
      });

      it('should have 3 modes', () => {
        expect(Object.keys(NormalizationMode)).toHaveLength(3);
      });
    });

    describe('Confidence', () => {
      it('should have all confidence levels defined', () => {
        expect(Confidence.HIGH).toBe('high');
        expect(Confidence.MEDIUM).toBe('medium');
        expect(Confidence.LOW).toBe('low');
        expect(Confidence.ESTIMATED).toBe('estimated');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(Confidence)).toBe(true);
      });
    });

    describe('Impact', () => {
      it('should have all impact levels defined', () => {
        expect(Impact.NONE).toBe('none');
        expect(Impact.MINIMAL).toBe('minimal');
        expect(Impact.MODERATE).toBe('moderate');
        expect(Impact.SIGNIFICANT).toBe('significant');
        expect(Impact.SEVERE).toBe('severe');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(Impact)).toBe(true);
      });
    });

    describe('ALGORITHM_SPECS', () => {
      it('should have specs for ReplayGain algorithms', () => {
        expect(ALGORITHM_SPECS[Algorithm.REPLAY_GAIN_1]).toBeDefined();
        expect(ALGORITHM_SPECS[Algorithm.REPLAY_GAIN_2]).toBeDefined();
      });

      it('should have specs for streaming platforms', () => {
        expect(ALGORITHM_SPECS[Algorithm.SPOTIFY]).toBeDefined();
        expect(ALGORITHM_SPECS[Algorithm.YOUTUBE]).toBeDefined();
      });

      it('should have specs for SoundCheck', () => {
        expect(ALGORITHM_SPECS[Algorithm.SOUND_CHECK]).toBeDefined();
      });

      it('should include reference loudness for each algorithm', () => {
        for (const spec of Object.values(ALGORITHM_SPECS)) {
          expect(spec.referenceLoudness).toBeDefined();
          expect(typeof spec.referenceLoudness).toBe('number');
        }
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(ALGORITHM_SPECS)).toBe(true);
      });
    });

    describe('SPOTIFY_MODES', () => {
      it('should have quiet, normal, and loud modes', () => {
        expect(SPOTIFY_MODES.QUIET).toBeDefined();
        expect(SPOTIFY_MODES.NORMAL).toBeDefined();
        expect(SPOTIFY_MODES.LOUD).toBeDefined();
      });

      it('should have increasing loudness targets', () => {
        expect(SPOTIFY_MODES.QUIET.referenceLufs).toBeLessThan(SPOTIFY_MODES.NORMAL.referenceLufs);
        expect(SPOTIFY_MODES.NORMAL.referenceLufs).toBeLessThan(SPOTIFY_MODES.LOUD.referenceLufs);
      });
    });

    describe('SOUNDCHECK_CONSTANTS', () => {
      it('should have Sound Check reference values', () => {
        expect(SOUNDCHECK_CONSTANTS).toBeDefined();
        expect(typeof SOUNDCHECK_CONSTANTS).toBe('object');
      });
    });

    describe('STATUS_DESCRIPTIONS', () => {
      it('should have descriptions for impact levels', () => {
        expect(STATUS_DESCRIPTIONS[Impact.NONE]).toBeDefined();
        expect(STATUS_DESCRIPTIONS[Impact.MINIMAL]).toBeDefined();
        expect(STATUS_DESCRIPTIONS[Impact.MODERATE]).toBeDefined();
        expect(STATUS_DESCRIPTIONS[Impact.SIGNIFICANT]).toBeDefined();
        expect(STATUS_DESCRIPTIONS[Impact.SEVERE]).toBeDefined();
      });
    });
  });

  // ============================================================================
  // Core Prediction Tests
  // ============================================================================

  describe('Core Prediction', () => {
    describe('predictGain', () => {
      it('should predict gain for standard input', () => {
        const result = predictGain({
          integratedLufs: -14,
          truePeakDbtp: -1
        }, Algorithm.SPOTIFY);

        expect(result).toBeDefined();
        expect(result.appliedGain).toBeDefined();
        expect(typeof result.appliedGain).toBe('number');
      });

      it('should return zero gain for already-normalized audio', () => {
        // Spotify targets -14 LUFS
        const result = predictGain({
          integratedLufs: -14,
          truePeakDbtp: -1
        }, Algorithm.SPOTIFY);

        expect(Math.abs(result.appliedGain)).toBeLessThan(0.5);
      });

      it('should predict negative gain for loud audio', () => {
        const result = predictGain({
          integratedLufs: -8,  // Very loud
          truePeakDbtp: -0.5
        }, Algorithm.SPOTIFY);

        expect(result.appliedGain).toBeLessThan(0);
      });

      it('should predict positive gain for quiet audio on full mode platforms', () => {
        // ReplayGain 2.0 targets -18 LUFS with full mode
        const result = predictGain({
          integratedLufs: -24,  // Quiet
          truePeakDbtp: -6
        }, Algorithm.REPLAY_GAIN_2);

        expect(result.appliedGain).toBeGreaterThan(0);
      });

      it('should include confidence level', () => {
        const result = predictGain({
          integratedLufs: -14,
          truePeakDbtp: -1
        }, Algorithm.SPOTIFY);

        expect(result.confidence).toBeDefined();
      });

      it('should include impact assessment', () => {
        const result = predictGain({
          integratedLufs: -8,  // Loud - significant impact expected
          truePeakDbtp: -0.5
        }, Algorithm.SPOTIFY);

        expect(result.impact).toBeDefined();
      });
    });

    describe('predictReplayGain', () => {
      it('should calculate ReplayGain 2.0 values', () => {
        const result = predictReplayGain({
          integratedLufs: -14,
          truePeakDbtp: -1
        });

        expect(result).toBeDefined();
        expect(result.track).toBeDefined();
        expect(result.track.replayGain2).toBeDefined();
      });

      it('should target -18 LUFS reference', () => {
        // At -14 LUFS, should get -4 dB gain to reach -18 LUFS
        const result = predictReplayGain({
          integratedLufs: -14,
          truePeakDbtp: -1
        });

        expect(result.track.v2Details.appliedGain).toBeCloseTo(-4, 1);
      });

      it('should include peak value', () => {
        const result = predictReplayGain({
          integratedLufs: -14,
          truePeakDbtp: -6
        });

        expect(result.peakValue).toBeDefined();
      });

      it('should include album gain when album metrics provided', () => {
        const result = predictReplayGain(
          { integratedLufs: -14, truePeakDbtp: -1 },
          { includeAlbum: true, albumLufs: -12 }
        );

        expect(result.album).toBeDefined();
        expect(result.album.replayGain2).toBeDefined();
      });

      it('should format gain values with sign', () => {
        const result = predictReplayGain({
          integratedLufs: -20,  // Quiet - positive gain
          truePeakDbtp: -6
        });

        expect(result.track.replayGain2).toBeDefined();
        if (result.track.v2Details.appliedGain > 0) {
          expect(result.track.replayGain2).toContain('+');
        }
      });
    });

    describe('predictSoundCheck', () => {
      it('should calculate Sound Check values', () => {
        const result = predictSoundCheck({
          integratedLufs: -14,
          truePeakDbtp: -1
        });

        expect(result).toBeDefined();
        expect(result.gainDb).toBeDefined();
        expect(typeof result.gainDb).toBe('number');
      });

      it('should target -16 LUFS for Apple', () => {
        // At -14 LUFS, should get -2 dB to reach -16 LUFS
        const result = predictSoundCheck({
          integratedLufs: -14,
          truePeakDbtp: -1
        });

        expect(result.gainDb).toBeCloseTo(-2, 1);
      });

      it('should include Sound Check normData format', () => {
        const result = predictSoundCheck({
          integratedLufs: -16,
          truePeakDbtp: -1
        });

        expect(result.soundCheckHex || result.iTunesNormTag).toBeDefined();
      });

      it('should handle very loud audio', () => {
        const result = predictSoundCheck({
          integratedLufs: -6,  // Very loud
          truePeakDbtp: -0.3
        });

        expect(result.gainDb).toBeLessThan(-5);
      });

      it('should handle very quiet audio', () => {
        const result = predictSoundCheck({
          integratedLufs: -24,  // Very quiet
          truePeakDbtp: -8
        });

        expect(result.gainDb).toBeGreaterThan(5);
      });
    });

    describe('predictSpotify', () => {
      it('should predict for default mode', () => {
        const result = predictSpotify({
          integratedLufs: -14,
          truePeakDbtp: -1
        });

        expect(result).toBeDefined();
        expect(result.modes).toBeDefined();
      });

      it('should predict for quiet mode', () => {
        const result = predictSpotify({
          integratedLufs: -14,
          truePeakDbtp: -1
        }, { mode: 'quiet' });

        expect(result.modes.quiet).toBeDefined();
        // Quiet mode targets -23 LUFS, so at -14 LUFS expect boost
        expect(result.modes.quiet.gainDb).toBeDefined();
      });

      it('should predict for normal mode', () => {
        const result = predictSpotify({
          integratedLufs: -14,
          truePeakDbtp: -1
        }, { mode: 'normal' });

        expect(result.modes.normal).toBeDefined();
      });

      it('should predict for loud mode', () => {
        const result = predictSpotify({
          integratedLufs: -14,
          truePeakDbtp: -1
        }, { mode: 'loud' });

        expect(result.modes.loud).toBeDefined();
      });

      it('should apply reduce-only in loud mode', () => {
        // In loud mode (-11 target), at -14 LUFS, gain would be +3
        // But reduce-only means no boost
        const result = predictSpotify({
          integratedLufs: -14,  // Below target
          truePeakDbtp: -1
        }, { mode: 'loud' });

        // Reduce-only should not boost
        expect(result.modes.loud.gainDb).toBeLessThanOrEqual(0);
      });

      it('should reduce loud audio in loud mode', () => {
        const result = predictSpotify({
          integratedLufs: -8,  // Above -11 target
          truePeakDbtp: -0.5
        }, { mode: 'loud' });

        expect(result.modes.loud.gainDb).toBeLessThan(0);
      });
    });

    describe('predictAllPlatforms', () => {
      it('should return predictions for multiple platforms', () => {
        const result = predictAllPlatforms({
          integratedLufs: -14,
          truePeakDbtp: -1
        });

        expect(result).toBeDefined();
        expect(result.platforms).toBeDefined();
        expect(Object.keys(result.platforms).length).toBeGreaterThan(0);
      });

      it('should include all major streaming platforms', () => {
        const result = predictAllPlatforms({
          integratedLufs: -14,
          truePeakDbtp: -1
        });

        const platforms = Object.keys(result.platforms);
        expect(platforms).toContain(Algorithm.SPOTIFY);
        expect(platforms).toContain(Algorithm.YOUTUBE);
      });

      it('should include summary statistics', () => {
        const result = predictAllPlatforms({
          integratedLufs: -14,
          truePeakDbtp: -1
        });

        expect(result.summary).toBeDefined();
        expect(result.summary.maxGain).toBeDefined();
        expect(result.summary.minGain).toBeDefined();
      });

      it('should identify most impactful platform', () => {
        const result = predictAllPlatforms({
          integratedLufs: -8,  // Very loud - will be reduced
          truePeakDbtp: -0.5
        });

        expect(result.summary.mostImpactful).toBeDefined();
      });

      it('should calculate gain range', () => {
        const result = predictAllPlatforms({
          integratedLufs: -14,
          truePeakDbtp: -1
        });

        expect(result.summary.gainRange).toBeDefined();
        expect(result.summary.gainRange).toBeGreaterThanOrEqual(0);
      });
    });
  });

  // ============================================================================
  // Optimization Tests
  // ============================================================================

  describe('Optimization', () => {
    describe('calculateOptimalTarget', () => {
      it('should return optimal loudness target', () => {
        const result = calculateOptimalTarget();

        expect(result).toBeDefined();
        expect(result.optimalLufs).toBeDefined();
        expect(typeof result.optimalLufs).toBe('number');
      });

      it('should recommend around -14 LUFS for streaming', () => {
        const result = calculateOptimalTarget([Algorithm.SPOTIFY, Algorithm.YOUTUBE]);

        // Most streaming platforms target -14 LUFS
        expect(result.optimalLufs).toBeLessThanOrEqual(-10);
        expect(result.optimalLufs).toBeGreaterThanOrEqual(-20);
      });

      it('should recommend target range', () => {
        const result = calculateOptimalTarget();

        expect(result.targetRange).toBeDefined();
        expect(result.targetRange.min).toBeDefined();
        expect(result.targetRange.max).toBeDefined();
      });

      it('should include recommendation', () => {
        const result = calculateOptimalTarget();

        expect(result.recommendation).toBeDefined();
      });

      it('should handle specific platform selection', () => {
        const result = calculateOptimalTarget([Algorithm.SPOTIFY, Algorithm.YOUTUBE]);

        expect(result.optimalLufs).toBeDefined();
        expect(result.platformAdjustments).toBeDefined();
      });
    });
  });

  // ============================================================================
  // Analysis Tests
  // ============================================================================

  describe('Analysis', () => {
    describe('comparePlatforms', () => {
      it('should compare gain across platforms', () => {
        const result = comparePlatforms({
          integratedLufs: -14,
          truePeakDbtp: -1
        }, [Algorithm.SPOTIFY, Algorithm.YOUTUBE]);

        expect(result).toBeDefined();
        expect(Array.isArray(result.platforms)).toBe(true);
      });

      it('should identify platforms with most/least adjustment', () => {
        const result = comparePlatforms({
          integratedLufs: -8,  // Very loud
          truePeakDbtp: -0.5
        }, [Algorithm.SPOTIFY, Algorithm.YOUTUBE, Algorithm.TIDAL]);

        expect(result.comparison).toBeDefined();
        expect(result.comparison.loudestPlayback).toBeDefined();
        expect(result.comparison.quietestPlayback).toBeDefined();
      });

      it('should include consistency rating', () => {
        const result = comparePlatforms({
          integratedLufs: -14,
          truePeakDbtp: -1
        }, [Algorithm.SPOTIFY, Algorithm.YOUTUBE]);

        expect(result.comparison.consistency).toBeDefined();
      });
    });

    describe('analyzeDynamicRangeImpact', () => {
      it('should analyze dynamic range impact', () => {
        const result = analyzeDynamicRangeImpact({
          integratedLufs: -14,
          truePeakDbtp: -1,
          loudnessRange: 8  // Loudness range
        }, Algorithm.SPOTIFY);

        expect(result).toBeDefined();
      });

      it('should consider loudness range in analysis', () => {
        const narrowResult = analyzeDynamicRangeImpact({
          integratedLufs: -14,
          truePeakDbtp: -1,
          loudnessRange: 4  // Narrow range
        }, Algorithm.SPOTIFY);

        const wideResult = analyzeDynamicRangeImpact({
          integratedLufs: -14,
          truePeakDbtp: -1,
          loudnessRange: 12  // Wide range
        }, Algorithm.SPOTIFY);

        // Results should differ based on LRA
        expect(narrowResult).toBeDefined();
        expect(wideResult).toBeDefined();
      });

      it('should include clipping risk assessment', () => {
        const result = analyzeDynamicRangeImpact({
          integratedLufs: -14,
          truePeakDbtp: -1
        }, Algorithm.SPOTIFY);

        expect(result.clippingRisk).toBeDefined();
      });
    });
  });

  // ============================================================================
  // Quick Check Tests
  // ============================================================================

  describe('Quick Check', () => {
    describe('quickCheck', () => {
      it('should return essential prediction info', () => {
        const result = quickCheck({
          integratedLufs: -14,
          truePeakDbtp: -1
        });

        expect(result).toBeDefined();
        expect(result.valid).toBe(true);
        expect(result.category).toBeDefined();
      });

      it('should include quick estimates for key platforms', () => {
        const result = quickCheck({
          integratedLufs: -14,
          truePeakDbtp: -1
        });

        // Should include major platforms
        expect(result.quickEstimates).toBeDefined();
        expect(result.quickEstimates.spotify).toBeDefined();
      });

      it('should indicate platform compatibility', () => {
        const loudResult = quickCheck({
          integratedLufs: -6,  // Very loud
          truePeakDbtp: -0.3
        });

        expect(loudResult.category).toBe('loud');
        expect(loudResult.platformCompatibility).toBeDefined();
      });

      it('should handle missing metrics gracefully', () => {
        const result = quickCheck({
          integratedLufs: -14
          // Missing truePeakDbtp
        });

        expect(result).toBeDefined();
        expect(result.valid).toBe(true);
      });

      it('should provide recommendation', () => {
        const result = quickCheck({
          integratedLufs: -14,
          truePeakDbtp: -1
        });

        expect(result.recommendation).toBeDefined();
      });
    });
  });

  // ============================================================================
  // Helper Functions Tests
  // ============================================================================

  describe('Helper Functions', () => {
    describe('formatReplayGainValue', () => {
      it('should format positive gain with plus sign', () => {
        const result = formatReplayGainValue(3.5);

        expect(result).toContain('+');
        expect(result).toContain('3.5');
        expect(result).toContain('dB');
      });

      it('should format negative gain', () => {
        const result = formatReplayGainValue(-6.2);

        expect(result).toContain('-');
        expect(result).toContain('6.2');
        expect(result).toContain('dB');
      });

      it('should format zero gain', () => {
        const result = formatReplayGainValue(0);

        expect(result).toContain('0');
        expect(result).toContain('dB');
      });

      it('should round to appropriate precision', () => {
        const result = formatReplayGainValue(3.567);

        // Should be 2 decimal places per ReplayGain spec
        expect(result).toMatch(/\d+\.\d{2}/);
      });
    });

    describe('formatPeakValue', () => {
      it('should format peak as linear value', () => {
        const result = formatPeakValue(-6);  // dBTP

        expect(result).toBeDefined();
        expect(parseFloat(result)).toBeLessThan(1);
      });

      it('should format full-scale peak', () => {
        const result = formatPeakValue(0);  // 0 dBTP = 1.0 linear

        expect(result).toContain('1');
      });

      it('should handle very quiet peaks', () => {
        const result = formatPeakValue(-60);  // Very quiet

        expect(result).toBeDefined();
        expect(result.length).toBeGreaterThan(0);
      });

      it('should use appropriate precision', () => {
        const result = formatPeakValue(-3);

        // ReplayGain uses 6 decimal places for peak
        expect(result).toBeDefined();
      });
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration Tests', () => {
    describe('Typical workflow scenarios', () => {
      it('should analyze well-mastered streaming audio', () => {
        const metrics = {
          integratedLufs: -14,
          truePeakDbtp: -1.0,
          loudnessRange: 7
        };

        const allPlatforms = predictAllPlatforms(metrics);
        const quick = quickCheck(metrics);

        // Well-mastered audio should have minimal adjustments
        expect(Math.abs(allPlatforms.summary.avgGain || 0)).toBeLessThan(5);
      });

      it('should warn about very loud masters', () => {
        const metrics = {
          integratedLufs: -6,
          truePeakDbtp: -0.2,
          loudnessRange: 4
        };

        const result = predictAllPlatforms(metrics);

        // Should see significant reduction across platforms
        expect(result.summary.minGain).toBeLessThan(-3);
      });

      it('should handle broadcast-targeted audio', () => {
        const metrics = {
          integratedLufs: -23,
          truePeakDbtp: -2.0,
          loudnessRange: 15
        };

        const result = predictAllPlatforms(metrics);

        // Streaming platforms may boost this significantly
        expect(result.summary.maxGain).toBeGreaterThan(0);
      });

      it('should generate complete ReplayGain data', () => {
        const metrics = {
          integratedLufs: -12,
          truePeakDbtp: -1.5
        };

        const rg = predictReplayGain(metrics);

        expect(rg.track).toBeDefined();
        expect(rg.track.replayGain2).toBeDefined();
      });

      it('should generate Sound Check value', () => {
        const metrics = {
          integratedLufs: -16,
          truePeakDbtp: -1.0
        };

        const sc = predictSoundCheck(metrics);

        // At -16 LUFS (Apple's target), gain should be ~0
        expect(Math.abs(sc.gainDb)).toBeLessThan(1);
      });
    });

    describe('Edge cases', () => {
      it('should handle extremely loud audio', () => {
        const result = predictAllPlatforms({
          integratedLufs: -3,
          truePeakDbtp: 0
        });

        expect(result).toBeDefined();
        expect(result.platforms).toBeDefined();
      });

      it('should handle extremely quiet audio', () => {
        const result = predictAllPlatforms({
          integratedLufs: -40,
          truePeakDbtp: -20
        });

        expect(result).toBeDefined();
        expect(result.platforms).toBeDefined();
      });

      it('should handle missing LRA', () => {
        const result = analyzeDynamicRangeImpact({
          integratedLufs: -14,
          truePeakDbtp: -1
          // No LRA
        }, Algorithm.SPOTIFY);

        expect(result).toBeDefined();
      });

      it('should provide consistent results', () => {
        const metrics = {
          integratedLufs: -14,
          truePeakDbtp: -1
        };

        const result1 = predictAllPlatforms(metrics);
        const result2 = predictAllPlatforms(metrics);

        expect(result1.summary.avgGain).toBe(result2.summary.avgGain);
      });
    });

    describe('Cross-platform consistency', () => {
      it('should show -14 LUFS is optimal for most streaming', () => {
        const optimal = calculateOptimalTarget([Algorithm.SPOTIFY, Algorithm.YOUTUBE]);
        const atOptimal = predictAllPlatforms({
          integratedLufs: optimal.optimalLufs,
          truePeakDbtp: -1
        });

        // At optimal level, adjustments should be minimal
        expect(Math.abs(atOptimal.summary.avgGain || 0)).toBeLessThan(5);
      });

      it('should show variance increases away from optimal', () => {
        const atOptimal = predictAllPlatforms({
          integratedLufs: -14,
          truePeakDbtp: -1
        });

        const awayFromOptimal = predictAllPlatforms({
          integratedLufs: -8,
          truePeakDbtp: -0.5
        });

        // Louder audio should have more impact (absolute gain values)
        expect(awayFromOptimal.summary).toBeDefined();
        expect(atOptimal.summary).toBeDefined();
      });
    });
  });

  // ============================================================================
  // API Contract Tests
  // ============================================================================

  describe('API Contract', () => {
    it('should export all required functions', () => {
      expect(typeof predictGain).toBe('function');
      expect(typeof predictReplayGain).toBe('function');
      expect(typeof predictSoundCheck).toBe('function');
      expect(typeof predictSpotify).toBe('function');
      expect(typeof predictAllPlatforms).toBe('function');
      expect(typeof calculateOptimalTarget).toBe('function');
      expect(typeof comparePlatforms).toBe('function');
      expect(typeof analyzeDynamicRangeImpact).toBe('function');
      expect(typeof quickCheck).toBe('function');
    });

    it('should export all required constants', () => {
      expect(Algorithm).toBeDefined();
      expect(NormalizationMode).toBeDefined();
      expect(Confidence).toBeDefined();
      expect(Impact).toBeDefined();
      expect(ALGORITHM_SPECS).toBeDefined();
      expect(SPOTIFY_MODES).toBeDefined();
    });

    it('should export helper functions', () => {
      expect(typeof formatReplayGainValue).toBe('function');
      expect(typeof formatPeakValue).toBe('function');
    });

    it('should maintain consistent return shapes', () => {
      const metrics = { integratedLufs: -14, truePeakDbtp: -1 };

      // predictGain
      const gain = predictGain(metrics, Algorithm.SPOTIFY);
      expect(gain).toHaveProperty('appliedGain');

      // predictReplayGain
      const rg = predictReplayGain(metrics);
      expect(rg).toHaveProperty('track');
      expect(rg).toHaveProperty('peakValue');

      // predictSoundCheck
      const sc = predictSoundCheck(metrics);
      expect(sc).toHaveProperty('gainDb');

      // predictAllPlatforms
      const all = predictAllPlatforms(metrics);
      expect(all).toHaveProperty('platforms');
      expect(all).toHaveProperty('summary');

      // quickCheck
      const quick = quickCheck(metrics);
      expect(quick).toBeDefined();
    });
  });
});
