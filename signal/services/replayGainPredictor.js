/**
 * ReplayGain / SoundCheck Prediction
 * 
 * Predicts how streaming platforms will re-normalize audio
 * during playback using ReplayGain, Sound Check, and
 * platform-specific normalization algorithms.
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Understanding playback
 * loudness ensures consistent listener experience across platforms.
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Normalization behavior types
 */
const NormalizationType = Object.freeze({
  NONE: 'NONE',           // No normalization
  DOWN_ONLY: 'DOWN_ONLY', // Only reduces volume
  UP_AND_DOWN: 'UP_AND_DOWN', // Adjusts both ways
  STANDARD: 'STANDARD'    // Broadcast standard
});

/**
 * Prediction confidence levels
 */
const PredictionConfidence = Object.freeze({
  HIGH: 'HIGH',       // Well-documented algorithm
  MEDIUM: 'MEDIUM',   // Generally accurate
  LOW: 'LOW'          // May vary
});

/**
 * Reference levels
 */
const REFERENCE_LEVELS = Object.freeze({
  REPLAY_GAIN: -18,       // ReplayGain reference (LUFS)
  SOUND_CHECK: -16,       // Apple Sound Check reference (LUFS)
  SPOTIFY_NORMAL: -14,    // Spotify normal mode
  SPOTIFY_QUIET: -23,     // Spotify quiet mode
  SPOTIFY_LOUD: -11,      // Spotify loud mode
  YOUTUBE: -14,           // YouTube reference
  EBU_R128: -23           // EBU R128 reference
});

/**
 * Platform normalization specifications
 */
const PLATFORM_NORMALIZATION = Object.freeze({
  SPOTIFY: {
    name: 'Spotify',
    reference: -14,
    type: NormalizationType.DOWN_ONLY,
    confidence: PredictionConfidence.HIGH,
    modes: {
      LOUD: { reference: -11, type: NormalizationType.DOWN_ONLY },
      NORMAL: { reference: -14, type: NormalizationType.DOWN_ONLY },
      QUIET: { reference: -23, type: NormalizationType.DOWN_ONLY }
    },
    algorithm: 'Spotify Volume Normalization',
    description: 'Only reduces loud tracks, preserves quiet ones'
  },
  APPLE_MUSIC: {
    name: 'Apple Music',
    reference: -16,
    type: NormalizationType.UP_AND_DOWN,
    confidence: PredictionConfidence.HIGH,
    soundCheckScale: 1000,  // Reference scale value
    algorithm: 'Sound Check',
    description: 'Normalizes both loud and quiet tracks to -16 LUFS'
  },
  YOUTUBE: {
    name: 'YouTube',
    reference: -14,
    type: NormalizationType.UP_AND_DOWN,
    confidence: PredictionConfidence.MEDIUM,
    algorithm: 'YouTube Loudness Normalization',
    description: 'Normalizes to -14 LUFS with content-based adjustments'
  },
  YOUTUBE_MUSIC: {
    name: 'YouTube Music',
    reference: -14,
    type: NormalizationType.UP_AND_DOWN,
    confidence: PredictionConfidence.MEDIUM,
    algorithm: 'YouTube Music Normalization',
    description: 'Similar to YouTube with music-specific tuning'
  },
  TIDAL: {
    name: 'Tidal',
    reference: -14,
    type: NormalizationType.DOWN_ONLY,
    confidence: PredictionConfidence.MEDIUM,
    modes: {
      HIFI: { reference: -14, type: NormalizationType.DOWN_ONLY },
      NORMAL: { reference: -14, type: NormalizationType.DOWN_ONLY }
    },
    algorithm: 'Tidal Loudness Normalization',
    description: 'Preserves dynamics in HiFi mode'
  },
  AMAZON_MUSIC: {
    name: 'Amazon Music',
    reference: -14,
    type: NormalizationType.DOWN_ONLY,
    confidence: PredictionConfidence.MEDIUM,
    algorithm: 'Amazon Loudness Normalization',
    description: 'Down-only normalization to -14 LUFS'
  },
  DEEZER: {
    name: 'Deezer',
    reference: -15,
    type: NormalizationType.DOWN_ONLY,
    confidence: PredictionConfidence.MEDIUM,
    algorithm: 'Deezer Loudness Normalization',
    description: 'Down-only normalization to -15 LUFS'
  },
  PANDORA: {
    name: 'Pandora',
    reference: -14,
    type: NormalizationType.UP_AND_DOWN,
    confidence: PredictionConfidence.LOW,
    algorithm: 'Pandora Normalization',
    description: 'Normalizes to -14 LUFS'
  },
  SOUNDCLOUD: {
    name: 'SoundCloud',
    reference: null,
    type: NormalizationType.NONE,
    confidence: PredictionConfidence.HIGH,
    algorithm: 'None',
    description: 'No automatic normalization'
  }
});

// ============================================================================
// ReplayGain Calculation
// ============================================================================

/**
 * Calculate ReplayGain values from loudness data
 * @param {Object} loudnessData - Loudness measurements
 * @param {Object} options - Calculation options
 * @returns {Object} ReplayGain values
 */
function predictReplayGain(loudnessData, options = {}) {
  const {
    integratedLoudness,
    integrated,
    truePeak,
    truePeakDbfs,
    peakDb,
    albumLoudness = null
  } = loudnessData;
  
  const loudness = integratedLoudness ?? integrated;
  const peak = truePeak ?? truePeakDbfs ?? peakDb ?? 0;
  
  if (loudness === null || loudness === undefined) {
    return { error: 'Missing integrated loudness data' };
  }
  
  // ReplayGain reference is -18 LUFS (approximation from RMS-based original)
  const reference = options.reference ?? REFERENCE_LEVELS.REPLAY_GAIN;
  
  // Track gain: adjustment to reach reference level
  const trackGain = reference - loudness;
  
  // Peak after gain application
  const trackPeakAfterGain = peak + trackGain;
  
  // Clip prevention: if peak would exceed 0 dBFS, reduce gain
  const clippingPrevention = trackPeakAfterGain > 0 ? -trackPeakAfterGain : 0;
  const safeTrackGain = trackGain + clippingPrevention;
  
  // Album gain (if album loudness provided)
  let albumGain = null;
  let safeAlbumGain = null;
  if (albumLoudness !== null) {
    albumGain = reference - albumLoudness;
    const albumPeakAfterGain = peak + albumGain;
    const albumClipPrevention = albumPeakAfterGain > 0 ? -albumPeakAfterGain : 0;
    safeAlbumGain = albumGain + albumClipPrevention;
  }
  
  // Convert peak to linear for ReplayGain format
  const trackPeakLinear = Math.pow(10, peak / 20);
  
  return {
    trackGain: Math.round(trackGain * 100) / 100,
    safeTrackGain: Math.round(safeTrackGain * 100) / 100,
    albumGain: albumGain !== null ? Math.round(albumGain * 100) / 100 : null,
    safeAlbumGain: safeAlbumGain !== null ? Math.round(safeAlbumGain * 100) / 100 : null,
    trackPeak: Math.round(trackPeakLinear * 1000000) / 1000000,
    trackPeakDb: Math.round(peak * 10) / 10,
    reference,
    wouldClip: trackPeakAfterGain > 0,
    clippingPrevention: Math.round(clippingPrevention * 100) / 100,
    format: {
      trackGainTag: `${trackGain >= 0 ? '+' : ''}${trackGain.toFixed(2)} dB`,
      albumGainTag: albumGain !== null 
        ? `${albumGain >= 0 ? '+' : ''}${albumGain.toFixed(2)} dB`
        : null,
      trackPeakTag: trackPeakLinear.toFixed(6)
    }
  };
}

// ============================================================================
// Apple Sound Check Calculation
// ============================================================================

/**
 * Calculate Apple Sound Check values
 * @param {Object} loudnessData - Loudness measurements
 * @returns {Object} Sound Check values
 */
function predictSoundCheck(loudnessData) {
  const { integratedLoudness, integrated } = loudnessData;
  const loudness = integratedLoudness ?? integrated;
  
  if (loudness === null || loudness === undefined) {
    return { error: 'Missing integrated loudness data' };
  }
  
  // Sound Check reference: -16 LUFS, scale value 1000 = unity
  const reference = REFERENCE_LEVELS.SOUND_CHECK;
  const adjustmentDb = reference - loudness;
  
  // Convert dB adjustment to Sound Check scale
  // Sound Check value = 1000 * 10^(adjustment/20)
  const soundCheckValue = Math.round(1000 * Math.pow(10, adjustmentDb / 20));
  
  // Sound Check stores as 32-bit integer
  // Typical range: ~100 (very loud) to ~10000 (very quiet)
  const normalizedValue = Math.max(1, Math.min(65535, soundCheckValue));
  
  // iTunes normalization string format (hex encoded)
  const hexValue = normalizedValue.toString(16).toUpperCase().padStart(8, '0');
  
  return {
    adjustmentDb: Math.round(adjustmentDb * 10) / 10,
    soundCheckValue: normalizedValue,
    reference,
    originalLoudness: Math.round(loudness * 10) / 10,
    direction: adjustmentDb > 0.5 ? 'INCREASE' : 
               adjustmentDb < -0.5 ? 'DECREASE' : 'MINIMAL',
    // How it will sound on Apple devices
    effectivePlayback: reference,
    itunesNorm: ` ${hexValue} ${hexValue} ${hexValue} ${hexValue}`,
    description: adjustmentDb > 0 
      ? `Volume will be increased by ${Math.abs(adjustmentDb).toFixed(1)} dB`
      : adjustmentDb < 0
        ? `Volume will be decreased by ${Math.abs(adjustmentDb).toFixed(1)} dB`
        : 'Volume will remain unchanged'
  };
}

// ============================================================================
// Platform-Specific Prediction
// ============================================================================

/**
 * Predict normalization for a specific platform
 * @param {Object} loudnessData - Loudness measurements
 * @param {string} platformKey - Platform identifier
 * @param {Object} options - Platform-specific options
 * @returns {Object} Platform prediction
 */
function predictPlatform(loudnessData, platformKey, options = {}) {
  const { integratedLoudness, integrated } = loudnessData;
  const loudness = integratedLoudness ?? integrated;
  
  const spec = PLATFORM_NORMALIZATION[platformKey];
  if (!spec) {
    return { platform: platformKey, error: 'Unknown platform' };
  }
  
  if (loudness === null || loudness === undefined) {
    return { platform: platformKey, error: 'Missing loudness data' };
  }
  
  // Handle platforms with no normalization
  if (spec.type === NormalizationType.NONE) {
    return {
      platform: platformKey,
      name: spec.name,
      willNormalize: false,
      adjustment: 0,
      effectivePlayback: loudness,
      originalLoudness: loudness,
      type: spec.type,
      confidence: spec.confidence,
      description: 'No normalization - plays at original level'
    };
  }
  
  // Get reference for mode (if applicable)
  const mode = options.mode || 'NORMAL';
  const modeSpec = spec.modes?.[mode] || spec;
  const reference = modeSpec.reference;
  
  // Calculate adjustment
  let adjustment = reference - loudness;
  let willNormalize = true;
  
  // DOWN_ONLY platforms don't increase volume
  if (modeSpec.type === NormalizationType.DOWN_ONLY) {
    if (loudness < reference) {
      // Track is quieter than reference - no adjustment
      adjustment = 0;
      willNormalize = false;
    }
  }
  
  const effectivePlayback = loudness + adjustment;
  
  return {
    platform: platformKey,
    name: spec.name,
    mode: options.mode || null,
    willNormalize,
    adjustment: Math.round(adjustment * 10) / 10,
    originalLoudness: Math.round(loudness * 10) / 10,
    effectivePlayback: Math.round(effectivePlayback * 10) / 10,
    reference,
    type: modeSpec.type,
    confidence: spec.confidence,
    algorithm: spec.algorithm,
    direction: adjustment > 0.5 ? 'UP' : adjustment < -0.5 ? 'DOWN' : 'NONE',
    description: willNormalize
      ? `Volume will be ${adjustment > 0 ? 'increased' : 'decreased'} by ${Math.abs(adjustment).toFixed(1)} dB`
      : 'Volume will remain at original level'
  };
}

/**
 * Predict normalization across all platforms
 * @param {Object} loudnessData - Loudness measurements
 * @returns {Object} All platform predictions
 */
function predictAllPlatforms(loudnessData) {
  const { integratedLoudness, integrated } = loudnessData;
  const loudness = integratedLoudness ?? integrated;
  
  if (loudness === null || loudness === undefined) {
    return { error: 'Missing loudness data' };
  }
  
  const predictions = {};
  let totalAdjustment = 0;
  let normalizingCount = 0;
  let largestDecrease = 0;
  let largestIncrease = 0;
  
  for (const platformKey of Object.keys(PLATFORM_NORMALIZATION)) {
    const prediction = predictPlatform(loudnessData, platformKey);
    predictions[platformKey] = prediction;
    
    if (prediction.willNormalize) {
      normalizingCount++;
      totalAdjustment += prediction.adjustment;
      
      if (prediction.adjustment < largestDecrease) {
        largestDecrease = prediction.adjustment;
      }
      if (prediction.adjustment > largestIncrease) {
        largestIncrease = prediction.adjustment;
      }
    }
  }
  
  const platformCount = Object.keys(predictions).length;
  
  return {
    originalLoudness: Math.round(loudness * 10) / 10,
    platforms: predictions,
    summary: {
      totalPlatforms: platformCount,
      willNormalize: normalizingCount,
      unchanged: platformCount - normalizingCount,
      averageAdjustment: normalizingCount > 0 
        ? Math.round((totalAdjustment / normalizingCount) * 10) / 10 
        : 0,
      largestDecrease: Math.round(largestDecrease * 10) / 10,
      largestIncrease: Math.round(largestIncrease * 10) / 10,
      adjustmentRange: Math.round((largestIncrease - largestDecrease) * 10) / 10
    }
  };
}

// ============================================================================
// Comparison Functions
// ============================================================================

/**
 * Compare submitted loudness to effective playback across platforms
 * @param {Object} loudnessData - Loudness measurements
 * @returns {Object} Comparison results
 */
function compareSubmittedVsPlayback(loudnessData) {
  const { integratedLoudness, integrated } = loudnessData;
  const loudness = integratedLoudness ?? integrated;
  
  if (loudness === null || loudness === undefined) {
    return { error: 'Missing loudness data' };
  }
  
  const all = predictAllPlatforms(loudnessData);
  
  // Find platforms where loudness changes most
  const significantChanges = [];
  const preservedPlatforms = [];
  
  for (const [key, prediction] of Object.entries(all.platforms)) {
    if (prediction.error) continue;
    
    if (Math.abs(prediction.adjustment) > 1.0) {
      significantChanges.push({
        platform: prediction.name,
        adjustment: prediction.adjustment,
        effective: prediction.effectivePlayback
      });
    } else if (!prediction.willNormalize || Math.abs(prediction.adjustment) < 0.5) {
      preservedPlatforms.push(prediction.name);
    }
  }
  
  // Sort by magnitude of change
  significantChanges.sort((a, b) => Math.abs(b.adjustment) - Math.abs(a.adjustment));
  
  return {
    originalLoudness: Math.round(loudness * 10) / 10,
    significantChanges,
    preservedPlatforms,
    consistency: {
      minEffective: all.summary.largestDecrease + loudness,
      maxEffective: loudness, // DOWN_ONLY platforms preserve
      range: all.summary.adjustmentRange
    },
    recommendation: all.summary.adjustmentRange > 3 
      ? 'Consider targeting -14 LUFS for more consistent playback across platforms'
      : 'Playback will be relatively consistent across platforms'
  };
}

/**
 * Find optimal loudness to minimize platform normalization
 * @param {Array<string>} targetPlatforms - Platforms to optimize for
 * @returns {Object} Optimal loudness recommendation
 */
function findLoudnessSweetSpot(targetPlatforms = null) {
  const platforms = targetPlatforms || Object.keys(PLATFORM_NORMALIZATION);
  
  // Collect references from target platforms
  const references = platforms
    .map(p => PLATFORM_NORMALIZATION[p])
    .filter(spec => spec && spec.reference !== null)
    .map(spec => ({
      name: spec.name,
      reference: spec.reference,
      type: spec.type
    }));
  
  if (references.length === 0) {
    return { error: 'No valid platforms specified' };
  }
  
  // For DOWN_ONLY platforms, quieter is better (no normalization)
  // For UP_AND_DOWN, matching reference is best
  const downOnlyRefs = references.filter(r => 
    PLATFORM_NORMALIZATION[Object.keys(PLATFORM_NORMALIZATION).find(k => 
      PLATFORM_NORMALIZATION[k].name === r.name
    )]?.type === NormalizationType.DOWN_ONLY
  ).map(r => r.reference);
  
  const upDownRefs = references.filter(r => 
    PLATFORM_NORMALIZATION[Object.keys(PLATFORM_NORMALIZATION).find(k => 
      PLATFORM_NORMALIZATION[k].name === r.name
    )]?.type === NormalizationType.UP_AND_DOWN
  ).map(r => r.reference);
  
  // Optimal for down-only: just below the quietest reference
  const optimalForDownOnly = downOnlyRefs.length > 0 
    ? Math.min(...downOnlyRefs) - 0.5 
    : -14;
  
  // Optimal for up-down: average of references
  const optimalForUpDown = upDownRefs.length > 0
    ? upDownRefs.reduce((a, b) => a + b, 0) / upDownRefs.length
    : -14;
  
  // Compromise: weight towards the most common scenario
  const sweetSpot = downOnlyRefs.length > upDownRefs.length
    ? optimalForDownOnly
    : Math.round(((optimalForDownOnly + optimalForUpDown) / 2) * 2) / 2;
  
  return {
    recommendedLoudness: sweetSpot,
    rationale: 'Balances minimal normalization on major streaming platforms',
    downOnlyOptimal: optimalForDownOnly,
    upDownOptimal: Math.round(optimalForUpDown * 10) / 10,
    platformCount: references.length,
    notes: [
      'For Spotify/Tidal/Amazon (down-only): quieter tracks avoid normalization',
      'For Apple/YouTube (up-and-down): matching reference is ideal',
      `Recommended: ${sweetSpot} LUFS minimizes adjustments across platforms`
    ]
  };
}

// ============================================================================
// Quick Check Functions
// ============================================================================

/**
 * Quick normalization prediction summary
 * @param {Object} loudnessData - Loudness measurements
 * @returns {Object} Quick summary
 */
function quickCheck(loudnessData) {
  const all = predictAllPlatforms(loudnessData);
  
  if (all.error) {
    return { error: all.error };
  }
  
  const replayGain = predictReplayGain(loudnessData);
  const soundCheck = predictSoundCheck(loudnessData);
  
  return {
    originalLoudness: all.originalLoudness,
    replayGainTrack: replayGain.trackGain,
    soundCheckAdjustment: soundCheck.adjustmentDb,
    platformsNormalizing: all.summary.willNormalize,
    platformsUnchanged: all.summary.unchanged,
    averageAdjustment: all.summary.averageAdjustment,
    wouldBeQuieter: all.summary.largestDecrease < -1,
    wouldBeLouder: all.summary.largestIncrease > 1,
    consistency: all.summary.adjustmentRange < 3 ? 'GOOD' : 
                 all.summary.adjustmentRange < 6 ? 'MODERATE' : 'POOR'
  };
}

/**
 * Full analysis with all predictions
 * @param {Object} loudnessData - Loudness measurements
 * @param {Object} options - Analysis options
 * @returns {Object} Complete analysis
 */
function analyze(loudnessData, options = {}) {
  const replayGain = predictReplayGain(loudnessData, options);
  const soundCheck = predictSoundCheck(loudnessData);
  const allPlatforms = predictAllPlatforms(loudnessData);
  const comparison = compareSubmittedVsPlayback(loudnessData);
  const sweetSpot = findLoudnessSweetSpot(options.targetPlatforms);
  
  const warnings = [];
  const recommendations = [];
  
  // Generate insights
  if (allPlatforms.summary?.largestDecrease < -6) {
    warnings.push('Audio is significantly louder than platform targets');
    recommendations.push('Reduce loudness to avoid heavy normalization');
  }
  
  if (allPlatforms.summary?.largestIncrease > 3) {
    warnings.push('Audio is quieter than some platform targets');
  }
  
  if (replayGain.wouldClip) {
    warnings.push('ReplayGain adjustment would cause clipping');
    recommendations.push('Use safe gain values that prevent clipping');
  }
  
  if (comparison.significantChanges?.length > 3) {
    recommendations.push(`Consider ${sweetSpot.recommendedLoudness} LUFS for more consistent playback`);
  }
  
  return {
    originalLoudness: allPlatforms.originalLoudness,
    replayGain,
    soundCheck,
    platforms: allPlatforms.platforms,
    summary: allPlatforms.summary,
    comparison,
    sweetSpot,
    warnings,
    recommendations,
    analyzedAt: new Date().toISOString()
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Main analysis
  analyze,
  quickCheck,
  
  // ReplayGain
  predictReplayGain,
  
  // Sound Check
  predictSoundCheck,
  
  // Platform predictions
  predictPlatform,
  predictAllPlatforms,
  
  // Comparison and optimization
  compareSubmittedVsPlayback,
  findLoudnessSweetSpot,
  
  // Constants
  NormalizationType,
  PredictionConfidence,
  REFERENCE_LEVELS,
  PLATFORM_NORMALIZATION
};
