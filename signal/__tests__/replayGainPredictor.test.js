/**
 * ReplayGain / SoundCheck Prediction Tests
 */

const {
  analyze,
  quickCheck,
  predictReplayGain,
  predictSoundCheck,
  predictPlatform,
  predictAllPlatforms,
  compareSubmittedVsPlayback,
  findLoudnessSweetSpot,
  NormalizationType,
  PredictionConfidence,
  REFERENCE_LEVELS,
  PLATFORM_NORMALIZATION
} = require('../services/replayGainPredictor');

// ============================================================================
// Constants Tests
// ============================================================================

describe('ReplayGain Predictor Constants', () => {
  describe('NormalizationType', () => {
    it('should have all required types', () => {
      expect(NormalizationType.NONE).toBe('NONE');
      expect(NormalizationType.DOWN_ONLY).toBe('DOWN_ONLY');
      expect(NormalizationType.UP_AND_DOWN).toBe('UP_AND_DOWN');
      expect(NormalizationType.STANDARD).toBe('STANDARD');
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(NormalizationType)).toBe(true);
    });
  });

  describe('PredictionConfidence', () => {
    it('should have all confidence levels', () => {
      expect(PredictionConfidence.HIGH).toBe('HIGH');
      expect(PredictionConfidence.MEDIUM).toBe('MEDIUM');
      expect(PredictionConfidence.LOW).toBe('LOW');
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(PredictionConfidence)).toBe(true);
    });
  });

  describe('REFERENCE_LEVELS', () => {
    it('should have ReplayGain reference at -18 LUFS', () => {
      expect(REFERENCE_LEVELS.REPLAY_GAIN).toBe(-18);
    });

    it('should have Sound Check reference at -16 LUFS', () => {
      expect(REFERENCE_LEVELS.SOUND_CHECK).toBe(-16);
    });

    it('should have Spotify modes', () => {
      expect(REFERENCE_LEVELS.SPOTIFY_NORMAL).toBe(-14);
      expect(REFERENCE_LEVELS.SPOTIFY_QUIET).toBe(-23);
      expect(REFERENCE_LEVELS.SPOTIFY_LOUD).toBe(-11);
    });

    it('should have broadcast reference', () => {
      expect(REFERENCE_LEVELS.EBU_R128).toBe(-23);
    });
  });

  describe('PLATFORM_NORMALIZATION', () => {
    it('should have major streaming platforms', () => {
      expect(PLATFORM_NORMALIZATION.SPOTIFY).toBeDefined();
      expect(PLATFORM_NORMALIZATION.APPLE_MUSIC).toBeDefined();
      expect(PLATFORM_NORMALIZATION.YOUTUBE).toBeDefined();
      expect(PLATFORM_NORMALIZATION.TIDAL).toBeDefined();
      expect(PLATFORM_NORMALIZATION.AMAZON_MUSIC).toBeDefined();
      expect(PLATFORM_NORMALIZATION.DEEZER).toBeDefined();
    });

    it('should have correct Spotify spec', () => {
      const spotify = PLATFORM_NORMALIZATION.SPOTIFY;
      expect(spotify.reference).toBe(-14);
      expect(spotify.type).toBe(NormalizationType.DOWN_ONLY);
      expect(spotify.confidence).toBe(PredictionConfidence.HIGH);
      expect(spotify.modes).toBeDefined();
      expect(spotify.modes.LOUD.reference).toBe(-11);
    });

    it('should have correct Apple Music spec', () => {
      const apple = PLATFORM_NORMALIZATION.APPLE_MUSIC;
      expect(apple.reference).toBe(-16);
      expect(apple.type).toBe(NormalizationType.UP_AND_DOWN);
      expect(apple.soundCheckScale).toBe(1000);
    });

    it('should have no normalization for SoundCloud', () => {
      const soundcloud = PLATFORM_NORMALIZATION.SOUNDCLOUD;
      expect(soundcloud.type).toBe(NormalizationType.NONE);
      expect(soundcloud.reference).toBeNull();
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(PLATFORM_NORMALIZATION)).toBe(true);
    });
  });
});

// ============================================================================
// ReplayGain Prediction Tests
// ============================================================================

describe('predictReplayGain', () => {
  it('should calculate correct gain for loud track', () => {
    const result = predictReplayGain({
      integratedLoudness: -10,
      truePeak: -1
    });

    expect(result.trackGain).toBe(-8); // -18 - (-10) = -8
    expect(result.reference).toBe(-18);
    expect(result.wouldClip).toBe(false);
  });

  it('should calculate correct gain for quiet track', () => {
    const result = predictReplayGain({
      integratedLoudness: -24,
      truePeak: -6
    });

    expect(result.trackGain).toBe(6); // -18 - (-24) = 6
    expect(result.wouldClip).toBe(false);
  });

  it('should detect clipping potential', () => {
    const result = predictReplayGain({
      integratedLoudness: -24,
      truePeak: -1
    });

    expect(result.trackGain).toBe(6);
    // After gain: -1 + 6 = 5 dBFS - would clip
    expect(result.wouldClip).toBe(true);
    expect(result.safeTrackGain).toBeLessThan(result.trackGain);
    expect(result.clippingPrevention).toBeLessThan(0);
  });

  it('should calculate album gain when provided', () => {
    const result = predictReplayGain({
      integratedLoudness: -14,
      truePeak: -1,
      albumLoudness: -16
    });

    expect(result.trackGain).toBe(-4);
    expect(result.albumGain).toBe(-2); // -18 - (-16) = -2
  });

  it('should format tags correctly', () => {
    const result = predictReplayGain({
      integratedLoudness: -14,
      truePeak: -1
    });

    expect(result.format.trackGainTag).toMatch(/^[+-]?\d+\.\d{2} dB$/);
    expect(result.format.trackPeakTag).toMatch(/^\d+\.\d{6}$/);
  });

  it('should handle alternative property names', () => {
    const result = predictReplayGain({
      integrated: -14,
      peakDb: -2
    });

    expect(result.trackGain).toBe(-4);
    expect(result.trackPeakDb).toBe(-2);
  });

  it('should return error for missing data', () => {
    const result = predictReplayGain({});
    expect(result.error).toBeDefined();
  });

  it('should accept custom reference level', () => {
    const result = predictReplayGain(
      { integratedLoudness: -14, truePeak: -2 },
      { reference: -14 }
    );

    expect(result.trackGain).toBe(0);
    expect(result.reference).toBe(-14);
  });
});

// ============================================================================
// Sound Check Prediction Tests
// ============================================================================

describe('predictSoundCheck', () => {
  it('should calculate correct adjustment for loud track', () => {
    const result = predictSoundCheck({
      integratedLoudness: -10
    });

    expect(result.adjustmentDb).toBe(-6); // -16 - (-10) = -6
    expect(result.reference).toBe(-16);
    expect(result.direction).toBe('DECREASE');
  });

  it('should calculate correct adjustment for quiet track', () => {
    const result = predictSoundCheck({
      integratedLoudness: -24
    });

    expect(result.adjustmentDb).toBe(8); // -16 - (-24) = 8
    expect(result.direction).toBe('INCREASE');
  });

  it('should calculate minimal change for on-target track', () => {
    const result = predictSoundCheck({
      integratedLoudness: -16
    });

    expect(result.adjustmentDb).toBe(0);
    expect(result.direction).toBe('MINIMAL');
  });

  it('should calculate Sound Check scale value', () => {
    const result = predictSoundCheck({
      integratedLoudness: -16
    });

    // At reference level, value should be 1000
    expect(result.soundCheckValue).toBe(1000);
  });

  it('should calculate lower value for loud tracks', () => {
    const result = predictSoundCheck({
      integratedLoudness: -10
    });

    // Louder = lower Sound Check value
    expect(result.soundCheckValue).toBeLessThan(1000);
  });

  it('should calculate higher value for quiet tracks', () => {
    const result = predictSoundCheck({
      integratedLoudness: -24
    });

    // Quieter = higher Sound Check value
    expect(result.soundCheckValue).toBeGreaterThan(1000);
  });

  it('should provide iTunes normalization string', () => {
    const result = predictSoundCheck({
      integratedLoudness: -16
    });

    expect(result.itunesNorm).toBeDefined();
    expect(result.itunesNorm).toMatch(/^\s[0-9A-F]{8}/);
  });

  it('should provide effective playback level', () => {
    const result = predictSoundCheck({
      integratedLoudness: -14
    });

    expect(result.effectivePlayback).toBe(-16);
  });

  it('should return error for missing data', () => {
    const result = predictSoundCheck({});
    expect(result.error).toBeDefined();
  });
});

// ============================================================================
// Platform Prediction Tests
// ============================================================================

describe('predictPlatform', () => {
  describe('Spotify (DOWN_ONLY)', () => {
    it('should normalize loud tracks', () => {
      const result = predictPlatform(
        { integratedLoudness: -10 },
        'SPOTIFY'
      );

      expect(result.willNormalize).toBe(true);
      expect(result.adjustment).toBe(-4); // -14 - (-10) = -4
      expect(result.effectivePlayback).toBe(-14);
      expect(result.direction).toBe('DOWN');
    });

    it('should not normalize quiet tracks', () => {
      const result = predictPlatform(
        { integratedLoudness: -18 },
        'SPOTIFY'
      );

      expect(result.willNormalize).toBe(false);
      expect(result.adjustment).toBe(0);
      expect(result.effectivePlayback).toBe(-18);
    });

    it('should support different modes', () => {
      const loudMode = predictPlatform(
        { integratedLoudness: -10 },
        'SPOTIFY',
        { mode: 'LOUD' }
      );

      expect(loudMode.reference).toBe(-11);
      expect(loudMode.adjustment).toBe(-1);
    });
  });

  describe('Apple Music (UP_AND_DOWN)', () => {
    it('should normalize loud tracks down', () => {
      const result = predictPlatform(
        { integratedLoudness: -10 },
        'APPLE_MUSIC'
      );

      expect(result.willNormalize).toBe(true);
      expect(result.adjustment).toBe(-6);
      expect(result.effectivePlayback).toBe(-16);
    });

    it('should normalize quiet tracks up', () => {
      const result = predictPlatform(
        { integratedLoudness: -24 },
        'APPLE_MUSIC'
      );

      expect(result.willNormalize).toBe(true);
      expect(result.adjustment).toBe(8);
      expect(result.effectivePlayback).toBe(-16);
    });
  });

  describe('SoundCloud (NO NORMALIZATION)', () => {
    it('should not normalize at all', () => {
      const result = predictPlatform(
        { integratedLoudness: -10 },
        'SOUNDCLOUD'
      );

      expect(result.willNormalize).toBe(false);
      expect(result.adjustment).toBe(0);
      expect(result.effectivePlayback).toBe(-10);
      expect(result.type).toBe(NormalizationType.NONE);
    });
  });

  it('should return error for unknown platform', () => {
    const result = predictPlatform(
      { integratedLoudness: -14 },
      'UNKNOWN_PLATFORM'
    );

    expect(result.error).toBe('Unknown platform');
  });

  it('should return error for missing loudness', () => {
    const result = predictPlatform({}, 'SPOTIFY');
    expect(result.error).toBe('Missing loudness data');
  });

  it('should include confidence level', () => {
    const result = predictPlatform(
      { integratedLoudness: -14 },
      'SPOTIFY'
    );

    expect(result.confidence).toBe(PredictionConfidence.HIGH);
  });
});

// ============================================================================
// All Platforms Prediction Tests
// ============================================================================

describe('predictAllPlatforms', () => {
  it('should return predictions for all platforms', () => {
    const result = predictAllPlatforms({
      integratedLoudness: -14
    });

    expect(result.platforms).toBeDefined();
    expect(result.platforms.SPOTIFY).toBeDefined();
    expect(result.platforms.APPLE_MUSIC).toBeDefined();
    expect(result.platforms.YOUTUBE).toBeDefined();
  });

  it('should include summary statistics', () => {
    const result = predictAllPlatforms({
      integratedLoudness: -14
    });

    expect(result.summary).toBeDefined();
    expect(result.summary.totalPlatforms).toBeGreaterThan(0);
    expect(typeof result.summary.willNormalize).toBe('number');
    expect(typeof result.summary.unchanged).toBe('number');
  });

  it('should calculate adjustment range', () => {
    const result = predictAllPlatforms({
      integratedLoudness: -14
    });

    expect(result.summary.largestDecrease).toBeDefined();
    expect(result.summary.largestIncrease).toBeDefined();
    expect(result.summary.adjustmentRange).toBeDefined();
  });

  it('should handle loud track correctly', () => {
    const result = predictAllPlatforms({
      integratedLoudness: -8
    });

    // Loud track should be normalized on most platforms
    expect(result.summary.willNormalize).toBeGreaterThan(0);
    expect(result.summary.largestDecrease).toBeLessThan(0);
  });

  it('should handle quiet track correctly', () => {
    const result = predictAllPlatforms({
      integratedLoudness: -24
    });

    // Quiet track - UP_AND_DOWN platforms will increase
    const apple = result.platforms.APPLE_MUSIC;
    expect(apple.adjustment).toBeGreaterThan(0);
    
    // DOWN_ONLY platforms will not adjust
    const spotify = result.platforms.SPOTIFY;
    expect(spotify.adjustment).toBe(0);
  });

  it('should return error for missing data', () => {
    const result = predictAllPlatforms({});
    expect(result.error).toBeDefined();
  });
});

// ============================================================================
// Comparison Tests
// ============================================================================

describe('compareSubmittedVsPlayback', () => {
  it('should identify significant changes', () => {
    const result = compareSubmittedVsPlayback({
      integratedLoudness: -8
    });

    expect(result.significantChanges).toBeDefined();
    expect(result.significantChanges.length).toBeGreaterThan(0);
  });

  it('should identify preserved platforms', () => {
    const result = compareSubmittedVsPlayback({
      integratedLoudness: -14
    });

    expect(result.preservedPlatforms).toBeDefined();
  });

  it('should calculate consistency metrics', () => {
    const result = compareSubmittedVsPlayback({
      integratedLoudness: -14
    });

    expect(result.consistency).toBeDefined();
    expect(result.consistency.minEffective).toBeDefined();
    expect(result.consistency.maxEffective).toBeDefined();
    expect(result.consistency.range).toBeDefined();
  });

  it('should provide recommendation', () => {
    const result = compareSubmittedVsPlayback({
      integratedLoudness: -8
    });

    expect(result.recommendation).toBeDefined();
    expect(typeof result.recommendation).toBe('string');
  });

  it('should return error for missing data', () => {
    const result = compareSubmittedVsPlayback({});
    expect(result.error).toBeDefined();
  });
});

// ============================================================================
// Sweet Spot Tests
// ============================================================================

describe('findLoudnessSweetSpot', () => {
  it('should return recommended loudness', () => {
    const result = findLoudnessSweetSpot();

    expect(result.recommendedLoudness).toBeDefined();
    expect(typeof result.recommendedLoudness).toBe('number');
  });

  it('should provide rationale', () => {
    const result = findLoudnessSweetSpot();

    expect(result.rationale).toBeDefined();
    expect(result.notes).toBeDefined();
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it('should calculate for specific platforms', () => {
    const result = findLoudnessSweetSpot(['SPOTIFY', 'APPLE_MUSIC']);

    expect(result.platformCount).toBe(2);
    expect(result.recommendedLoudness).toBeDefined();
  });

  it('should handle empty platform list', () => {
    const result = findLoudnessSweetSpot([]);

    expect(result.error).toBeDefined();
  });

  it('should distinguish DOWN_ONLY vs UP_AND_DOWN optimal', () => {
    const result = findLoudnessSweetSpot();

    expect(result.downOnlyOptimal).toBeDefined();
    expect(result.upDownOptimal).toBeDefined();
  });
});

// ============================================================================
// Quick Check Tests
// ============================================================================

describe('quickCheck', () => {
  it('should provide summary metrics', () => {
    const result = quickCheck({
      integratedLoudness: -14,
      truePeak: -1
    });

    expect(result.originalLoudness).toBe(-14);
    expect(result.replayGainTrack).toBeDefined();
    expect(result.soundCheckAdjustment).toBeDefined();
    expect(result.platformsNormalizing).toBeDefined();
  });

  it('should classify consistency', () => {
    const quietResult = quickCheck({ integratedLoudness: -14 });
    expect(['GOOD', 'MODERATE', 'POOR']).toContain(quietResult.consistency);
  });

  it('should detect potential volume changes', () => {
    const loudResult = quickCheck({ integratedLoudness: -8 });
    expect(loudResult.wouldBeQuieter).toBe(true);

    const quietResult = quickCheck({ integratedLoudness: -24 });
    expect(quietResult.wouldBeLouder).toBe(true);
  });

  it('should return error for missing data', () => {
    const result = quickCheck({});
    expect(result.error).toBeDefined();
  });
});

// ============================================================================
// Full Analysis Tests
// ============================================================================

describe('analyze', () => {
  it('should include all prediction types', () => {
    const result = analyze({
      integratedLoudness: -14,
      truePeak: -1
    });

    expect(result.replayGain).toBeDefined();
    expect(result.soundCheck).toBeDefined();
    expect(result.platforms).toBeDefined();
    expect(result.summary).toBeDefined();
  });

  it('should include comparison', () => {
    const result = analyze({
      integratedLoudness: -14,
      truePeak: -1
    });

    expect(result.comparison).toBeDefined();
    expect(result.comparison.significantChanges).toBeDefined();
  });

  it('should include sweet spot recommendation', () => {
    const result = analyze({
      integratedLoudness: -14,
      truePeak: -1
    });

    expect(result.sweetSpot).toBeDefined();
    expect(result.sweetSpot.recommendedLoudness).toBeDefined();
  });

  it('should generate warnings for loud tracks', () => {
    const result = analyze({
      integratedLoudness: -6,
      truePeak: -0.5
    });

    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('should generate clipping warning', () => {
    const result = analyze({
      integratedLoudness: -24,
      truePeak: -1
    });

    // ReplayGain would add ~6 dB, causing clipping
    const hasClipWarning = result.warnings.some(w => 
      w.toLowerCase().includes('clip')
    );
    expect(hasClipWarning).toBe(true);
  });

  it('should provide recommendations', () => {
    const result = analyze({
      integratedLoudness: -6,
      truePeak: -0.5
    });

    expect(result.recommendations).toBeDefined();
  });

  it('should include timestamp', () => {
    const result = analyze({
      integratedLoudness: -14,
      truePeak: -1
    });

    expect(result.analyzedAt).toBeDefined();
    expect(new Date(result.analyzedAt)).toBeInstanceOf(Date);
  });

  it('should accept target platforms option', () => {
    const result = analyze(
      { integratedLoudness: -14, truePeak: -1 },
      { targetPlatforms: ['SPOTIFY', 'APPLE_MUSIC'] }
    );

    expect(result.sweetSpot.platformCount).toBe(2);
  });
});

// ============================================================================
// Integration Scenarios
// ============================================================================

describe('Integration Scenarios', () => {
  describe('Hot/Loud Master Scenario', () => {
    const loudMaster = {
      integratedLoudness: -8,
      truePeak: -0.3
    };

    it('should predict significant normalization', () => {
      const result = analyze(loudMaster);

      expect(result.summary.willNormalize).toBeGreaterThan(5);
      expect(result.platforms.SPOTIFY.adjustment).toBeLessThan(-4);
    });

    it('should recommend quieter target', () => {
      const result = analyze(loudMaster);

      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Dynamic Master Scenario', () => {
    const dynamicMaster = {
      integratedLoudness: -18,
      truePeak: -3
    };

    it('should predict mixed normalization behavior', () => {
      const result = analyze(dynamicMaster);

      // DOWN_ONLY platforms should not adjust
      expect(result.platforms.SPOTIFY.willNormalize).toBe(false);
      
      // UP_AND_DOWN platforms will adjust up
      expect(result.platforms.APPLE_MUSIC.willNormalize).toBe(true);
      expect(result.platforms.APPLE_MUSIC.adjustment).toBeGreaterThan(0);
    });
  });

  describe('Broadcast Optimized Scenario', () => {
    const broadcastMaster = {
      integratedLoudness: -23,
      truePeak: -2
    };

    it('should preserve level on streaming', () => {
      const result = analyze(broadcastMaster);

      // DOWN_ONLY platforms should not touch it
      expect(result.platforms.SPOTIFY.willNormalize).toBe(false);
      expect(result.platforms.TIDAL.willNormalize).toBe(false);
    });

    it('should increase on UP_AND_DOWN platforms', () => {
      const result = analyze(broadcastMaster);

      expect(result.platforms.APPLE_MUSIC.adjustment).toBeGreaterThan(0);
      expect(result.platforms.YOUTUBE.adjustment).toBeGreaterThan(0);
    });
  });

  describe('Ideal Streaming Master Scenario', () => {
    const idealMaster = {
      integratedLoudness: -14,
      truePeak: -1
    };

    it('should have minimal adjustments', () => {
      const result = analyze(idealMaster);

      expect(result.summary.averageAdjustment).toBeGreaterThan(-3);
      expect(result.summary.averageAdjustment).toBeLessThan(3);
    });

    it('should have good consistency', () => {
      const quick = quickCheck(idealMaster);
      expect(quick.consistency).toBe('GOOD');
    });
  });

  describe('Multi-Platform Delivery', () => {
    it('should identify platforms with same effective level', () => {
      const result = predictAllPlatforms({
        integratedLoudness: -16
      });

      // Apple Music targets -16, so no adjustment
      expect(result.platforms.APPLE_MUSIC.effectivePlayback).toBe(-16);
    });

    it('should help choose optimal loudness', () => {
      const sweetSpot = findLoudnessSweetSpot([
        'SPOTIFY',
        'APPLE_MUSIC',
        'YOUTUBE',
        'TIDAL'
      ]);

      // Should be around -14 to -16 for these platforms
      expect(sweetSpot.recommendedLoudness).toBeGreaterThanOrEqual(-17);
      expect(sweetSpot.recommendedLoudness).toBeLessThanOrEqual(-13);
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('should handle null values gracefully', () => {
    expect(predictReplayGain({ integratedLoudness: null }).error).toBeDefined();
    expect(predictSoundCheck({ integratedLoudness: null }).error).toBeDefined();
  });

  it('should handle extremely loud content', () => {
    const result = analyze({
      integratedLoudness: -3,
      truePeak: 0
    });

    expect(result.platforms.SPOTIFY.adjustment).toBeLessThan(-10);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('should handle extremely quiet content', () => {
    const result = analyze({
      integratedLoudness: -35,
      truePeak: -12
    });

    expect(result.platforms.APPLE_MUSIC.adjustment).toBeGreaterThan(15);
  });

  it('should handle content at reference levels', () => {
    // At ReplayGain reference
    const rgResult = predictReplayGain({ integratedLoudness: -18 });
    expect(rgResult.trackGain).toBe(0);

    // At Sound Check reference
    const scResult = predictSoundCheck({ integratedLoudness: -16 });
    expect(scResult.adjustmentDb).toBe(0);
  });

  it('should handle album gain edge cases', () => {
    // Album quieter than track
    const result = predictReplayGain({
      integratedLoudness: -14,
      truePeak: -1,
      albumLoudness: -20
    });

    expect(result.albumGain).toBe(2);
    expect(result.trackGain).toBe(-4);
  });
});
