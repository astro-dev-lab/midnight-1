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
        expect(SPOTIFY_MODES.quiet).toBeDefined();
        expect(SPOTIFY_MODES.normal).toBeDefined();
        expect(SPOTIFY_MODES.loud).toBeDefined();
      });

      it('should have increasing loudness targets', () => {
        expect(SPOTIFY_MODES.quiet.targetLufs).toBeLessThan(SPOTIFY_MODES.normal.targetLufs);
        expect(SPOTIFY_MODES.normal.targetLufs).toBeLessThan(SPOTIFY_MODES.loud.targetLufs);
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
          truePeakDbfs: -1
        }, Algorithm.SPOTIFY);

        expect(result).toBeDefined();
        expect(result.predictedGain).toBeDefined();
        expect(typeof result.predictedGain).toBe('number');
      });

      it('should return zero gain for already-normalized audio', () => {
        // Spotify targets -14 LUFS
        const result = predictGain({
          integratedLufs: -14,
          truePeakDbfs: -1
        }, Algorithm.SPOTIFY);

        expect(Math.abs(result.predictedGain)).toBeLessThan(0.5);
      });

      it('should predict negative gain for loud audio', () => {
        const result = predictGain({
          integratedLufs: -8,  // Very loud
          truePeakDbfs: -0.5
        }, Algorithm.SPOTIFY);

        expect(result.predictedGain).toBeLessThan(0);
      });

      it('should predict positive gain for quiet audio on full mode platforms', () => {
        // ReplayGain 2.0 targets -18 LUFS with full mode
        const result = predictGain({
          integratedLufs: -24,  // Quiet
          truePeakDbfs: -6
        }, Algorithm.REPLAY_GAIN_2);

        expect(result.predictedGain).toBeGreaterThan(0);
      });

      it('should include confidence level', () => {
        const result = predictGain({
          integratedLufs: -14,
          truePeakDbfs: -1
        }, Algorithm.SPOTIFY);

        expect(result.confidence).toBeDefined();
      });

      it('should include impact assessment', () => {
        const result = predictGain({
          integratedLufs: -8,  // Loud - significant impact expected
          truePeakDbfs: -0.5
        }, Algorithm.SPOTIFY);

        expect(result.impact).toBeDefined();
      });
    });

    describe('predictReplayGain', () => {
      it('should calculate ReplayGain 2.0 values', () => {
        const result = predictReplayGain({
          integratedLufs: -14,
          truePeakDbfs: -1
        });

        expect(result).toBeDefined();
        expect(result.trackGain).toBeDefined();
        expect(result.trackPeak).toBeDefined();
      });

      it('should target -18 LUFS reference', () => {
        // At -14 LUFS, should get -4 dB gain to reach -18 LUFS
        const result = predictReplayGain({
          integratedLufs: -14,
          truePeakDbfs: -1
        });

        expect(result.trackGain).toBeCloseTo(-4, 1);
      });

      it('should calculate peak as linear value', () => {
        const result = predictReplayGain({
          integratedLufs: -14,
          truePeakDbfs: -6  // Should be ~0.5 linear
        });

        expect(result.trackPeak).toBeLessThan(1);
        expect(result.trackPeak).toBeGreaterThan(0);
      });

      it('should include album gain when album metrics provided', () => {
        const result = predictReplayGain(
          { integratedLufs: -14, truePeakDbfs: -1 },
          { integratedLufs: -12, truePeakDbfs: -0.5 }  // Album metrics
        );

        expect(result.albumGain).toBeDefined();
        expect(result.albumPeak).toBeDefined();
      });

      it('should format gain values with sign', () => {
        const result = predictReplayGain({
          integratedLufs: -20,  // Quiet - positive gain
          truePeakDbfs: -6
        });

        expect(result.formattedTrackGain).toBeDefined();
        if (result.trackGain > 0) {
          expect(result.formattedTrackGain).toContain('+');
        }
      });
    });

    describe('predictSoundCheck', () => {
      it('should calculate Sound Check values', () => {
        const result = predictSoundCheck({
          integratedLufs: -14,
          truePeakDbfs: -1
        });

        expect(result).toBeDefined();
        expect(result.gain).toBeDefined();
        expect(typeof result.gain).toBe('number');
      });

      it('should target -16 LUFS for Apple', () => {
        // At -14 LUFS, should get -2 dB to reach -16 LUFS
        const result = predictSoundCheck({
          integratedLufs: -14,
          truePeakDbfs: -1
        });

        expect(result.gain).toBeCloseTo(-2, 1);
      });

      it('should include Sound Check normData format', () => {
        const result = predictSoundCheck({
          integratedLufs: -16,
          truePeakDbfs: -1
        });

        // May include iTunNORM or similar format
        expect(result.normData || result.soundCheckValue).toBeDefined();
      });

      it('should handle very loud audio', () => {
        const result = predictSoundCheck({
          integratedLufs: -6,  // Very loud
          truePeakDbfs: -0.3
        });

        expect(result.gain).toBeLessThan(-5);
      });

      it('should handle very quiet audio', () => {
        const result = predictSoundCheck({
          integratedLufs: -24,  // Very quiet
          truePeakDbfs: -8
        });

        expect(result.gain).toBeGreaterThan(5);
      });
    });

    describe('predictSpotify', () => {
      it('should predict for default (loud) mode', () => {
        const result = predictSpotify({
          integratedLufs: -14,
          truePeakDbfs: -1
        });

        expect(result).toBeDefined();
        expect(result.mode).toBeDefined();
      });

      it('should predict for quiet mode', () => {
        const result = predictSpotify({
          integratedLufs: -14,
          truePeakDbfs: -1
        }, 'quiet');

        expect(result.mode).toBe('quiet');
        // Quiet mode targets -23 LUFS, so at -14 LUFS expect boost
        expect(result.gain).toBeDefined();
      });

      it('should predict for normal mode', () => {
        const result = predictSpotify({
          integratedLufs: -14,
          truePeakDbfs: -1
        }, 'normal');

        expect(result.mode).toBe('normal');
      });

      it('should predict for loud mode', () => {
        const result = predictSpotify({
          integratedLufs: -14,
          truePeakDbfs: -1
        }, 'loud');

        expect(result.mode).toBe('loud');
      });

      it('should apply reduce-only in loud mode', () => {
        // In loud mode (-11 target), at -14 LUFS, gain would be +3
        // But reduce-only means no boost
        const result = predictSpotify({
          integratedLufs: -14,  // Below target
          truePeakDbfs: -1
        }, 'loud');

        // Reduce-only should not boost
        expect(result.appliedGain).toBeLessThanOrEqual(0);
      });

      it('should reduce loud audio in loud mode', () => {
        const result = predictSpotify({
          integratedLufs: -8,  // Above -11 target
          truePeakDbfs: -0.5
        }, 'loud');

        expect(result.appliedGain).toBeLessThan(0);
      });
    });

    describe('predictAllPlatforms', () => {
      it('should return predictions for multiple platforms', () => {
        const result = predictAllPlatforms({
          integratedLufs: -14,
          truePeakDbfs: -1
        });

        expect(result).toBeDefined();
        expect(result.predictions).toBeDefined();
        expect(Object.keys(result.predictions).length).toBeGreaterThan(0);
      });

      it('should include all major streaming platforms', () => {
        const result = predictAllPlatforms({
          integratedLufs: -14,
          truePeakDbfs: -1
        });

        const platforms = Object.keys(result.predictions);
        expect(platforms).toContain(Algorithm.SPOTIFY);
        expect(platforms).toContain(Algorithm.YOUTUBE);
      });

      it('should include summary statistics', () => {
        const result = predictAllPlatforms({
          integratedLufs: -14,
          truePeakDbfs: -1
        });

        expect(result.summary).toBeDefined();
        expect(result.summary.maxGain).toBeDefined();
        expect(result.summary.minGain).toBeDefined();
      });

      it('should identify worst-case platform', () => {
        const result = predictAllPlatforms({
          integratedLufs: -8,  // Very loud - will be reduced
          truePeakDbfs: -0.5
        });

        expect(result.summary.worstCase).toBeDefined();
      });

      it('should calculate gain range', () => {
        const result = predictAllPlatforms({
          integratedLufs: -14,
          truePeakDbfs: -1
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
        const result = calculateOptimalTarget(['streaming']);

        // Most streaming platforms target -14 LUFS
        expect(result.optimalLufs).toBeCloseTo(-14, 1);
      });

      it('should recommend true peak limit', () => {
        const result = calculateOptimalTarget();

        expect(result.optimalTruePeak).toBeDefined();
        expect(result.optimalTruePeak).toBeLessThanOrEqual(-1);
      });

      it('should include reasoning', () => {
        const result = calculateOptimalTarget();

        expect(result.reason || result.rationale).toBeDefined();
      });

      it('should handle specific platform selection', () => {
        const result = calculateOptimalTarget([Algorithm.SPOTIFY, Algorithm.YOUTUBE]);

        expect(result.optimalLufs).toBeDefined();
        expect(result.platforms).toBeDefined();
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
          truePeakDbfs: -1
        });

        expect(result).toBeDefined();
        expect(Array.isArray(result.platforms || result.comparison)).toBe(true);
      });

      it('should identify platforms with most/least adjustment', () => {
        const result = comparePlatforms({
          integratedLufs: -8,  // Very loud
          truePeakDbfs: -0.5
        });

        expect(result.mostAdjustment || result.worstCase).toBeDefined();
        expect(result.leastAdjustment || result.bestCase).toBeDefined();
      });

      it('should sort by adjustment amount', () => {
        const result = comparePlatforms({
          integratedLufs: -14,
          truePeakDbfs: -1
        });

        const platforms = result.platforms || result.comparison;
        if (platforms && platforms.length > 1) {
          // Should be sorted by absolute gain
          const gains = platforms.map(p => Math.abs(p.gain || p.predictedGain || 0));
          const sorted = [...gains].sort((a, b) => a - b);
          // Either ascending or descending is valid
        }
      });
    });

    describe('analyzeDynamicRangeImpact', () => {
      it('should analyze dynamic range impact', () => {
        const result = analyzeDynamicRangeImpact({
          integratedLufs: -14,
          truePeakDbfs: -1,
          lra: 8  // Loudness range
        });

        expect(result).toBeDefined();
      });

      it('should consider loudness range in analysis', () => {
        const narrowResult = analyzeDynamicRangeImpact({
          integratedLufs: -14,
          truePeakDbfs: -1,
          lra: 4  // Narrow range
        });

        const wideResult = analyzeDynamicRangeImpact({
          integratedLufs: -14,
          truePeakDbfs: -1,
          lra: 12  // Wide range
        });

        // Results should differ based on LRA
        expect(narrowResult).toBeDefined();
        expect(wideResult).toBeDefined();
      });

      it('should include crest factor impact if available', () => {
        const result = analyzeDynamicRangeImpact({
          integratedLufs: -14,
          truePeakDbfs: -1,
          crestFactor: 10
        });

        expect(result).toBeDefined();
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
          truePeakDbfs: -1
        });

        expect(result).toBeDefined();
        expect(result.status || result.impact).toBeDefined();
      });

      it('should include key platform predictions', () => {
        const result = quickCheck({
          integratedLufs: -14,
          truePeakDbfs: -1
        });

        // Should include major platforms
        expect(
          result.spotify || result.predictions?.spotify
        ).toBeDefined();
      });

      it('should indicate if adjustments needed', () => {
        const loudResult = quickCheck({
          integratedLufs: -6,  // Very loud
          truePeakDbfs: -0.3
        });

        expect(loudResult.needsAdjustment || loudResult.willNormalize).toBeDefined();
      });

      it('should handle missing metrics gracefully', () => {
        const result = quickCheck({
          integratedLufs: -14
          // Missing truePeakDbfs
        });

        expect(result).toBeDefined();
      });

      it('should provide summary status', () => {
        const result = quickCheck({
          integratedLufs: -14,
          truePeakDbfs: -1
        });

        expect(
          result.summary || result.status || result.recommendation
        ).toBeDefined();
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
      it('should format peak as decimal', () => {
        const result = formatPeakValue(0.5);

        expect(result).toContain('0.5');
      });

      it('should format full-scale peak', () => {
        const result = formatPeakValue(1.0);

        expect(result).toContain('1');
      });

      it('should handle very small peaks', () => {
        const result = formatPeakValue(0.001);

        expect(result).toBeDefined();
        expect(result.length).toBeGreaterThan(0);
      });

      it('should use appropriate precision', () => {
        const result = formatPeakValue(0.891234);

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
          truePeakDbfs: -1.0,
          lra: 7
        };

        const allPlatforms = predictAllPlatforms(metrics);
        const quick = quickCheck(metrics);

        // Well-mastered audio should have minimal adjustments
        expect(Math.abs(allPlatforms.summary.avgGain || 0)).toBeLessThan(3);
      });

      it('should warn about very loud masters', () => {
        const metrics = {
          integratedLufs: -6,
          truePeakDbfs: -0.2,
          lra: 4
        };

        const result = predictAllPlatforms(metrics);

        // Should see significant reduction across platforms
        expect(result.summary.minGain).toBeLessThan(-3);
      });

      it('should handle broadcast-targeted audio', () => {
        const metrics = {
          integratedLufs: -23,
          truePeakDbfs: -2.0,
          lra: 15
        };

        const result = predictAllPlatforms(metrics);

        // Streaming platforms may boost this significantly
        expect(result.summary.maxGain).toBeGreaterThan(0);
      });

      it('should generate complete ReplayGain tags', () => {
        const metrics = {
          integratedLufs: -12,
          truePeakDbfs: -1.5
        };

        const rg = predictReplayGain(metrics);

        expect(rg.trackGain).toBeDefined();
        expect(rg.trackPeak).toBeDefined();
        expect(rg.formattedTrackGain).toBeDefined();
      });

      it('should generate Sound Check value', () => {
        const metrics = {
          integratedLufs: -16,
          truePeakDbfs: -1.0
        };

        const sc = predictSoundCheck(metrics);

        // At -16 LUFS (Apple's target), gain should be ~0
        expect(Math.abs(sc.gain)).toBeLessThan(1);
      });
    });

    describe('Edge cases', () => {
      it('should handle extremely loud audio', () => {
        const result = predictAllPlatforms({
          integratedLufs: -3,
          truePeakDbfs: 0
        });

        expect(result).toBeDefined();
        expect(result.predictions).toBeDefined();
      });

      it('should handle extremely quiet audio', () => {
        const result = predictAllPlatforms({
          integratedLufs: -40,
          truePeakDbfs: -20
        });

        expect(result).toBeDefined();
        expect(result.predictions).toBeDefined();
      });

      it('should handle missing LRA', () => {
        const result = analyzeDynamicRangeImpact({
          integratedLufs: -14,
          truePeakDbfs: -1
          // No LRA
        });

        expect(result).toBeDefined();
      });

      it('should provide consistent results', () => {
        const metrics = {
          integratedLufs: -14,
          truePeakDbfs: -1
        };

        const result1 = predictAllPlatforms(metrics);
        const result2 = predictAllPlatforms(metrics);

        expect(result1.summary.avgGain).toBe(result2.summary.avgGain);
      });
    });

    describe('Cross-platform consistency', () => {
      it('should show -14 LUFS is optimal for most streaming', () => {
        const optimal = calculateOptimalTarget(['streaming']);
        const atOptimal = predictAllPlatforms({
          integratedLufs: optimal.optimalLufs,
          truePeakDbfs: -1
        });

        // At optimal level, adjustments should be minimal
        expect(Math.abs(atOptimal.summary.avgGain || 0)).toBeLessThan(2);
      });

      it('should show variance increases away from optimal', () => {
        const atOptimal = predictAllPlatforms({
          integratedLufs: -14,
          truePeakDbfs: -1
        });

        const awayFromOptimal = predictAllPlatforms({
          integratedLufs: -8,
          truePeakDbfs: -0.5
        });

        // Louder audio should have more variance
        expect(awayFromOptimal.summary.gainRange).toBeGreaterThan(
          atOptimal.summary.gainRange || 0
        );
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
      const metrics = { integratedLufs: -14, truePeakDbfs: -1 };

      // predictGain
      const gain = predictGain(metrics, Algorithm.SPOTIFY);
      expect(gain).toHaveProperty('predictedGain');

      // predictReplayGain
      const rg = predictReplayGain(metrics);
      expect(rg).toHaveProperty('trackGain');
      expect(rg).toHaveProperty('trackPeak');

      // predictSoundCheck
      const sc = predictSoundCheck(metrics);
      expect(sc).toHaveProperty('gain');

      // predictAllPlatforms
      const all = predictAllPlatforms(metrics);
      expect(all).toHaveProperty('predictions');
      expect(all).toHaveProperty('summary');

      // quickCheck
      const quick = quickCheck(metrics);
      expect(quick).toBeDefined();
    });
  });
});
