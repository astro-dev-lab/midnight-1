/**
 * ReplayGain / SoundCheck Prediction Service
 * 
 * Predicts how different platforms will re-normalize audio during playback.
 * Covers ReplayGain (v1/v2), Apple SoundCheck, EBU R128, Spotify normalization,
 * YouTube loudness normalization, and other platform-specific algorithms.
 * 
 * @module services/replayGainPredictor
 */

// ============================================================================
// Enums
// ============================================================================

/**
 * Normalization algorithm types
 * @readonly
 * @enum {string}
 */
const Algorithm = Object.freeze({
  REPLAY_GAIN_1: 'replayGain1',        // Original ReplayGain (89 dB reference)
  REPLAY_GAIN_2: 'replayGain2',        // ReplayGain 2.0 (EBU R128 based)
  SOUND_CHECK: 'soundCheck',           // Apple's SoundCheck
  EBU_R128: 'ebuR128',                 // European broadcast standard
  SPOTIFY: 'spotify',                  // Spotify normalization
  YOUTUBE: 'youtube',                  // YouTube loudness normalization
  TIDAL: 'tidal',                      // Tidal normalization
  AMAZON: 'amazon',                    // Amazon Music normalization
  DEEZER: 'deezer',                    // Deezer normalization
  PANDORA: 'pandora'                   // Pandora normalization
});

/**
 * Normalization mode (how gain is applied)
 * @readonly
 * @enum {string}
 */
const NormalizationMode = Object.freeze({
  REDUCE_ONLY: 'reduceOnly',           // Only reduce volume (never boost)
  FULL: 'full',                        // Both reduce and boost
  OFF: 'off'                           // No normalization
});

/**
 * Prediction confidence levels
 * @readonly
 * @enum {string}
 */
const Confidence = Object.freeze({
  HIGH: 'high',                        // Algorithm well-documented
  MEDIUM: 'medium',                    // Some approximation
  LOW: 'low',                          // Significant estimation
  ESTIMATED: 'estimated'               // Based on limited data
});

/**
 * Impact severity on playback
 * @readonly
 * @enum {string}
 */
const Impact = Object.freeze({
  NONE: 'none',                        // No adjustment needed
  MINIMAL: 'minimal',                  // < 1 dB adjustment
  MODERATE: 'moderate',                // 1-3 dB adjustment
  SIGNIFICANT: 'significant',          // 3-6 dB adjustment
  SEVERE: 'severe'                     // > 6 dB adjustment
});

// ============================================================================
// Constants
// ============================================================================

/**
 * Reference levels and algorithm parameters for each platform
 */
const ALGORITHM_SPECS = Object.freeze({
  [Algorithm.REPLAY_GAIN_1]: {
    name: 'ReplayGain 1.0',
    referenceLoudness: -14,            // Actually 89 dB SPL, approximated
    referenceDbfs: -14,
    usesLufs: false,
    usesPeak: true,
    peakLimit: 0,                      // dBFS
    preAmp: 0,
    defaultMode: NormalizationMode.FULL,
    description: 'Original ReplayGain algorithm using RMS-based loudness'
  },
  [Algorithm.REPLAY_GAIN_2]: {
    name: 'ReplayGain 2.0',
    referenceLoudness: -18,            // LUFS
    referenceDbfs: -18,
    usesLufs: true,
    usesPeak: true,
    peakLimit: -1,                     // dBTP
    preAmp: 0,
    defaultMode: NormalizationMode.FULL,
    description: 'ReplayGain 2.0 based on EBU R128 loudness measurement'
  },
  [Algorithm.SOUND_CHECK]: {
    name: 'Apple SoundCheck',
    referenceLoudness: -16,            // LUFS (approximately)
    referenceDbfs: -16,
    usesLufs: true,
    usesPeak: false,
    peakLimit: null,
    preAmp: 0,
    defaultMode: NormalizationMode.FULL,
    description: 'Apple iTunes/Music normalization using proprietary algorithm'
  },
  [Algorithm.EBU_R128]: {
    name: 'EBU R128',
    referenceLoudness: -23,            // LUFS (broadcast)
    referenceDbfs: -23,
    usesLufs: true,
    usesPeak: true,
    peakLimit: -1,                     // dBTP
    preAmp: 0,
    defaultMode: NormalizationMode.FULL,
    description: 'European Broadcasting Union loudness standard'
  },
  [Algorithm.SPOTIFY]: {
    name: 'Spotify Normalization',
    referenceLoudness: -14,            // LUFS
    referenceDbfs: -14,
    usesLufs: true,
    usesPeak: false,
    peakLimit: null,
    preAmp: 0,
    defaultMode: NormalizationMode.REDUCE_ONLY, // Spotify "Loud" mode
    description: 'Spotify loudness normalization (Loud/Normal/Quiet modes)'
  },
  [Algorithm.YOUTUBE]: {
    name: 'YouTube Loudness',
    referenceLoudness: -14,            // LUFS
    referenceDbfs: -14,
    usesLufs: true,
    usesPeak: false,
    peakLimit: null,
    preAmp: 0,
    defaultMode: NormalizationMode.REDUCE_ONLY,
    description: 'YouTube loudness normalization (reduce only)'
  },
  [Algorithm.TIDAL]: {
    name: 'Tidal Normalization',
    referenceLoudness: -14,            // LUFS
    referenceDbfs: -14,
    usesLufs: true,
    usesPeak: true,
    peakLimit: -1,
    preAmp: 0,
    defaultMode: NormalizationMode.FULL,
    description: 'Tidal loudness normalization'
  },
  [Algorithm.AMAZON]: {
    name: 'Amazon Music Normalization',
    referenceLoudness: -14,            // LUFS (estimated)
    referenceDbfs: -14,
    usesLufs: true,
    usesPeak: false,
    peakLimit: null,
    preAmp: 0,
    defaultMode: NormalizationMode.REDUCE_ONLY,
    description: 'Amazon Music loudness normalization'
  },
  [Algorithm.DEEZER]: {
    name: 'Deezer Normalization',
    referenceLoudness: -15,            // LUFS
    referenceDbfs: -15,
    usesLufs: true,
    usesPeak: false,
    peakLimit: null,
    preAmp: 0,
    defaultMode: NormalizationMode.FULL,
    description: 'Deezer loudness normalization'
  },
  [Algorithm.PANDORA]: {
    name: 'Pandora Normalization',
    referenceLoudness: -14,            // LUFS (estimated)
    referenceDbfs: -14,
    usesLufs: true,
    usesPeak: false,
    peakLimit: null,
    preAmp: 0,
    defaultMode: NormalizationMode.REDUCE_ONLY,
    description: 'Pandora loudness normalization'
  }
});

/**
 * Spotify-specific modes and their reference levels
 */
const SPOTIFY_MODES = Object.freeze({
  QUIET: { referenceLufs: -23, mode: NormalizationMode.FULL },
  NORMAL: { referenceLufs: -14, mode: NormalizationMode.FULL },
  LOUD: { referenceLufs: -11, mode: NormalizationMode.REDUCE_ONLY }
});

/**
 * SoundCheck calculation constants
 * Apple uses a 1000-sample window and milliwatt reference
 */
const SOUNDCHECK_CONSTANTS = Object.freeze({
  REFERENCE_MW: 1,                     // 1 milliwatt reference
  SCALING_FACTOR: 1000,
  BASE_VALUE: 65536                    // 2^16 for 16-bit normalization
});

/**
 * Status descriptions for UI/reporting
 */
const STATUS_DESCRIPTIONS = Object.freeze({
  [Impact.NONE]: 'No volume adjustment will be applied',
  [Impact.MINIMAL]: 'Minimal volume adjustment (less than 1 dB)',
  [Impact.MODERATE]: 'Moderate volume adjustment (1-3 dB)',
  [Impact.SIGNIFICANT]: 'Significant volume adjustment (3-6 dB)',
  [Impact.SEVERE]: 'Severe volume adjustment (more than 6 dB)'
});

// ============================================================================
// Core Prediction Functions
// ============================================================================

/**
 * Calculate the gain adjustment that a platform will apply
 * 
 * @param {Object} measurements - Audio loudness measurements
 * @param {number} measurements.integratedLufs - Integrated loudness in LUFS
 * @param {number} [measurements.truePeakDbtp] - True peak in dBTP
 * @param {number} [measurements.shortTermMax] - Maximum short-term loudness
 * @param {number} [measurements.momentaryMax] - Maximum momentary loudness
 * @param {string} algorithm - Algorithm from Algorithm enum
 * @param {Object} [options] - Prediction options
 * @param {string} [options.mode] - Normalization mode override
 * @param {number} [options.preAmp] - Pre-amplification offset
 * @returns {Object} Gain prediction result
 */
function predictGain(measurements, algorithm, options = {}) {
  if (!measurements || typeof measurements.integratedLufs !== 'number') {
    return {
      success: false,
      error: 'Missing required integratedLufs measurement',
      algorithm,
      gainDb: null
    };
  }

  const spec = ALGORITHM_SPECS[algorithm];
  if (!spec) {
    return {
      success: false,
      error: `Unknown algorithm: ${algorithm}`,
      algorithm,
      gainDb: null
    };
  }

  const mode = options.mode || spec.defaultMode;
  const preAmp = options.preAmp ?? spec.preAmp;
  const integratedLufs = measurements.integratedLufs;
  const truePeak = measurements.truePeakDbtp ?? 0;

  // Calculate raw gain needed
  let rawGain = spec.referenceLoudness - integratedLufs + preAmp;

  // Apply mode restrictions
  let appliedGain = rawGain;
  let gainLimited = false;

  if (mode === NormalizationMode.REDUCE_ONLY && rawGain > 0) {
    appliedGain = 0;
    gainLimited = true;
  } else if (mode === NormalizationMode.OFF) {
    appliedGain = 0;
    gainLimited = true;
  }

  // Check peak limiting
  let peakLimited = false;
  if (spec.usesPeak && spec.peakLimit !== null) {
    const resultingPeak = truePeak + appliedGain;
    if (resultingPeak > spec.peakLimit) {
      const peakReduction = resultingPeak - spec.peakLimit;
      appliedGain -= peakReduction;
      peakLimited = true;
    }
  }

  // Determine impact level
  const absGain = Math.abs(appliedGain);
  let impact;
  if (absGain === 0) {
    impact = Impact.NONE;
  } else if (absGain < 1) {
    impact = Impact.MINIMAL;
  } else if (absGain <= 3) {
    impact = Impact.MODERATE;
  } else if (absGain <= 6) {
    impact = Impact.SIGNIFICANT;
  } else {
    impact = Impact.SEVERE;
  }

  // Calculate resulting levels
  const resultingLoudness = integratedLufs + appliedGain;
  const resultingPeak = truePeak + appliedGain;

  return {
    success: true,
    algorithm,
    algorithmName: spec.name,
    referenceLoudness: spec.referenceLoudness,
    inputLoudness: integratedLufs,
    inputPeak: truePeak,
    rawGain: Math.round(rawGain * 100) / 100,
    appliedGain: Math.round(appliedGain * 100) / 100,
    resultingLoudness: Math.round(resultingLoudness * 100) / 100,
    resultingPeak: Math.round(resultingPeak * 100) / 100,
    mode,
    gainLimited,
    peakLimited,
    impact,
    impactDescription: STATUS_DESCRIPTIONS[impact],
    confidence: spec.usesLufs ? Confidence.HIGH : Confidence.MEDIUM
  };
}

/**
 * Predict ReplayGain adjustments (both v1 and v2)
 * 
 * @param {Object} measurements - Audio loudness measurements
 * @param {Object} [options] - Options
 * @param {boolean} [options.includeAlbum] - Include album-based predictions
 * @param {number} [options.albumLufs] - Album integrated loudness for album gain
 * @returns {Object} ReplayGain predictions
 */
function predictReplayGain(measurements, options = {}) {
  if (!measurements || typeof measurements.integratedLufs !== 'number') {
    return {
      success: false,
      error: 'Missing required integratedLufs measurement'
    };
  }

  const trackV1 = predictGain(measurements, Algorithm.REPLAY_GAIN_1);
  const trackV2 = predictGain(measurements, Algorithm.REPLAY_GAIN_2);

  const result = {
    success: true,
    track: {
      replayGain1: formatReplayGainValue(trackV1.appliedGain),
      replayGain2: formatReplayGainValue(trackV2.appliedGain),
      v1Details: trackV1,
      v2Details: trackV2
    },
    peakValue: formatPeakValue(measurements.truePeakDbtp ?? 0),
    recommendations: []
  };

  // Album gain if provided
  if (options.includeAlbum && typeof options.albumLufs === 'number') {
    const albumMeasurements = {
      ...measurements,
      integratedLufs: options.albumLufs
    };
    const albumV1 = predictGain(albumMeasurements, Algorithm.REPLAY_GAIN_1);
    const albumV2 = predictGain(albumMeasurements, Algorithm.REPLAY_GAIN_2);

    result.album = {
      replayGain1: formatReplayGainValue(albumV1.appliedGain),
      replayGain2: formatReplayGainValue(albumV2.appliedGain),
      v1Details: albumV1,
      v2Details: albumV2
    };
  }

  // Generate recommendations
  if (Math.abs(trackV2.appliedGain) > 6) {
    result.recommendations.push({
      priority: 'high',
      message: `Track will have ${trackV2.appliedGain > 0 ? 'significant boost' : 'significant reduction'}. Consider adjusting master level.`
    });
  }

  if (measurements.truePeakDbtp > -1) {
    result.recommendations.push({
      priority: 'medium',
      message: 'True peak exceeds -1 dBTP. May cause clipping after gain adjustment.'
    });
  }

  return result;
}

/**
 * Predict Apple SoundCheck adjustment value
 * 
 * @param {Object} measurements - Audio loudness measurements
 * @returns {Object} SoundCheck prediction
 */
function predictSoundCheck(measurements) {
  if (!measurements || typeof measurements.integratedLufs !== 'number') {
    return {
      success: false,
      error: 'Missing required integratedLufs measurement'
    };
  }

  const prediction = predictGain(measurements, Algorithm.SOUND_CHECK);

  // Calculate SoundCheck value (stored in iTunes as 4 16-bit values)
  // This is an approximation - actual SoundCheck uses proprietary analysis
  const gainLinear = Math.pow(10, prediction.appliedGain / 20);
  const soundCheckValue = Math.round(SOUNDCHECK_CONSTANTS.BASE_VALUE / gainLinear);

  // Format as hex pairs like iTunes does
  const hexValue = soundCheckValue.toString(16).toUpperCase().padStart(8, '0');

  return {
    success: true,
    algorithm: Algorithm.SOUND_CHECK,
    gainDb: prediction.appliedGain,
    soundCheckValue,
    soundCheckHex: hexValue,
    iTunesNormTag: ` ${hexValue} ${hexValue} ${hexValue} ${hexValue}`,
    impact: prediction.impact,
    impactDescription: prediction.impactDescription,
    confidence: Confidence.MEDIUM, // Apple's algorithm is proprietary
    details: prediction
  };
}

/**
 * Predict Spotify normalization for different modes
 * 
 * @param {Object} measurements - Audio loudness measurements
 * @param {Object} [options] - Options
 * @param {string} [options.mode] - 'QUIET', 'NORMAL', or 'LOUD'
 * @returns {Object} Spotify normalization predictions
 */
function predictSpotify(measurements, options = {}) {
  if (!measurements || typeof measurements.integratedLufs !== 'number') {
    return {
      success: false,
      error: 'Missing required integratedLufs measurement'
    };
  }

  const results = {};

  // Calculate for all modes
  for (const [modeName, modeSpec] of Object.entries(SPOTIFY_MODES)) {
    const modeOptions = {
      mode: modeSpec.mode
    };

    // Create custom spec for this mode
    const gainNeeded = modeSpec.referenceLufs - measurements.integratedLufs;
    let appliedGain = gainNeeded;

    // Apply mode restrictions
    if (modeSpec.mode === NormalizationMode.REDUCE_ONLY && gainNeeded > 0) {
      appliedGain = 0;
    }

    const absGain = Math.abs(appliedGain);
    let impact;
    if (absGain === 0) {
      impact = Impact.NONE;
    } else if (absGain < 1) {
      impact = Impact.MINIMAL;
    } else if (absGain <= 3) {
      impact = Impact.MODERATE;
    } else if (absGain <= 6) {
      impact = Impact.SIGNIFICANT;
    } else {
      impact = Impact.SEVERE;
    }

    results[modeName.toLowerCase()] = {
      referenceLufs: modeSpec.referenceLufs,
      gainDb: Math.round(appliedGain * 100) / 100,
      resultingLufs: Math.round((measurements.integratedLufs + appliedGain) * 100) / 100,
      normalizationMode: modeSpec.mode,
      impact,
      impactDescription: STATUS_DESCRIPTIONS[impact]
    };
  }

  // If specific mode requested, highlight it
  const requestedMode = options.mode?.toUpperCase();
  const primaryResult = results[requestedMode?.toLowerCase()] || results.normal;

  return {
    success: true,
    algorithm: Algorithm.SPOTIFY,
    inputLoudness: measurements.integratedLufs,
    modes: results,
    recommended: primaryResult,
    requestedMode: requestedMode || 'NORMAL',
    confidence: Confidence.HIGH,
    notes: [
      'Spotify offers 3 normalization modes users can select',
      'LOUD mode only reduces volume (never boosts quiet tracks)',
      'Most listeners use NORMAL mode (-14 LUFS target)'
    ]
  };
}

/**
 * Predict gain adjustments for all major platforms
 * 
 * @param {Object} measurements - Audio loudness measurements
 * @returns {Object} Multi-platform predictions
 */
function predictAllPlatforms(measurements) {
  if (!measurements || typeof measurements.integratedLufs !== 'number') {
    return {
      success: false,
      error: 'Missing required integratedLufs measurement',
      platforms: {}
    };
  }

  const platforms = {};
  const summary = {
    minGain: Infinity,
    maxGain: -Infinity,
    avgGain: 0,
    gainRange: 0,
    mostImpactful: null,
    leastImpactful: null
  };

  let gainSum = 0;
  let count = 0;

  for (const algorithm of Object.values(Algorithm)) {
    const prediction = predictGain(measurements, algorithm);
    platforms[algorithm] = prediction;

    if (prediction.success) {
      const gain = prediction.appliedGain;
      gainSum += gain;
      count++;

      if (gain < summary.minGain) {
        summary.minGain = gain;
      }
      if (gain > summary.maxGain) {
        summary.maxGain = gain;
      }

      const absGain = Math.abs(gain);
      if (!summary.mostImpactful || absGain > Math.abs(platforms[summary.mostImpactful]?.appliedGain || 0)) {
        summary.mostImpactful = algorithm;
      }
      if (!summary.leastImpactful || absGain < Math.abs(platforms[summary.leastImpactful]?.appliedGain || 0)) {
        summary.leastImpactful = algorithm;
      }
    }
  }

  summary.avgGain = count > 0 ? Math.round((gainSum / count) * 100) / 100 : 0;
  summary.gainRange = Math.round((summary.maxGain - summary.minGain) * 100) / 100;

  // Group platforms by impact
  const byImpact = {};
  for (const [algo, prediction] of Object.entries(platforms)) {
    if (prediction.success) {
      const impact = prediction.impact;
      if (!byImpact[impact]) {
        byImpact[impact] = [];
      }
      byImpact[impact].push({
        algorithm: algo,
        name: prediction.algorithmName,
        gain: prediction.appliedGain
      });
    }
  }

  return {
    success: true,
    inputLoudness: measurements.integratedLufs,
    inputPeak: measurements.truePeakDbtp,
    platforms,
    summary,
    byImpact,
    recommendations: generatePlatformRecommendations(measurements, platforms, summary)
  };
}

/**
 * Calculate optimal loudness target for multi-platform delivery
 * 
 * @param {string[]} targetPlatforms - Array of platform Algorithm values
 * @param {Object} [options] - Options
 * @param {boolean} [options.prioritizeReduction] - Prefer targets that reduce rather than boost
 * @returns {Object} Optimal target recommendation
 */
function calculateOptimalTarget(targetPlatforms, options = {}) {
  if (!targetPlatforms || targetPlatforms.length === 0) {
    targetPlatforms = Object.values(Algorithm);
  }

  const targets = targetPlatforms
    .map(algo => ALGORITHM_SPECS[algo])
    .filter(spec => spec)
    .map(spec => spec.referenceLoudness);

  if (targets.length === 0) {
    return {
      success: false,
      error: 'No valid platforms specified'
    };
  }

  // Find range
  const minTarget = Math.min(...targets);
  const maxTarget = Math.max(...targets);
  const avgTarget = targets.reduce((a, b) => a + b, 0) / targets.length;

  // Optimal is typically between -14 and -16 LUFS for most platforms
  let optimal;
  if (options.prioritizeReduction) {
    // Target slightly louder so most platforms reduce (never boost)
    optimal = maxTarget;
  } else {
    // Target the average for balanced adjustments
    optimal = Math.round(avgTarget);
  }

  // Calculate adjustments for each platform at optimal level
  const adjustments = {};
  for (const algo of targetPlatforms) {
    const spec = ALGORITHM_SPECS[algo];
    if (spec) {
      const adjustment = spec.referenceLoudness - optimal;
      adjustments[algo] = {
        name: spec.name,
        targetLufs: spec.referenceLoudness,
        adjustmentDb: Math.round(adjustment * 100) / 100,
        direction: adjustment > 0 ? 'boost' : adjustment < 0 ? 'reduce' : 'none'
      };
    }
  }

  return {
    success: true,
    optimalLufs: optimal,
    targetRange: {
      min: minTarget,
      max: maxTarget,
      spread: Math.round((maxTarget - minTarget) * 100) / 100
    },
    platformAdjustments: adjustments,
    recommendation: `Target ${optimal} LUFS for optimal playback across selected platforms`
  };
}

// ============================================================================
// Analysis & Comparison Functions
// ============================================================================

/**
 * Compare how an asset will play across different platforms
 * 
 * @param {Object} measurements - Audio loudness measurements
 * @param {string[]} platforms - Platforms to compare
 * @returns {Object} Comparison results
 */
function comparePlatforms(measurements, platforms) {
  if (!measurements || typeof measurements.integratedLufs !== 'number') {
    return {
      success: false,
      error: 'Missing required integratedLufs measurement'
    };
  }

  if (!platforms || platforms.length < 2) {
    return {
      success: false,
      error: 'At least 2 platforms required for comparison'
    };
  }

  const predictions = platforms
    .map(p => predictGain(measurements, p))
    .filter(p => p.success);

  if (predictions.length < 2) {
    return {
      success: false,
      error: 'Could not predict for enough platforms'
    };
  }

  const gains = predictions.map(p => p.appliedGain);
  const maxDifference = Math.max(...gains) - Math.min(...gains);

  // Find the quietest and loudest playback
  const sorted = [...predictions].sort((a, b) => a.appliedGain - b.appliedGain);
  const quietest = sorted[0];
  const loudest = sorted[sorted.length - 1];

  // Determine consistency
  let consistency;
  if (maxDifference <= 1) {
    consistency = 'excellent';
  } else if (maxDifference <= 2) {
    consistency = 'good';
  } else if (maxDifference <= 4) {
    consistency = 'moderate';
  } else {
    consistency = 'poor';
  }

  return {
    success: true,
    platforms: predictions,
    comparison: {
      maxDifference: Math.round(maxDifference * 100) / 100,
      quietestPlayback: {
        platform: quietest.algorithm,
        name: quietest.algorithmName,
        gain: quietest.appliedGain
      },
      loudestPlayback: {
        platform: loudest.algorithm,
        name: loudest.algorithmName,
        gain: loudest.appliedGain
      },
      consistency,
      consistencyDescription: `${consistency.charAt(0).toUpperCase() + consistency.slice(1)} playback consistency across platforms`
    }
  };
}

/**
 * Analyze dynamic range impact of normalization
 * 
 * @param {Object} measurements - Audio loudness measurements with dynamic range info
 * @param {string} algorithm - Target algorithm
 * @returns {Object} Dynamic range analysis
 */
function analyzeDynamicRangeImpact(measurements, algorithm) {
  if (!measurements || typeof measurements.integratedLufs !== 'number') {
    return {
      success: false,
      error: 'Missing required measurements'
    };
  }

  const prediction = predictGain(measurements, algorithm);
  if (!prediction.success) {
    return prediction;
  }

  const dynamicRange = measurements.loudnessRange ?? measurements.dynamicRange ?? null;
  const shortTermMax = measurements.shortTermMax ?? null;

  let headroom = null;
  let clippingRisk = 'none';

  if (measurements.truePeakDbtp !== undefined) {
    headroom = -1 - measurements.truePeakDbtp; // Headroom to -1 dBTP
    const resultingPeak = measurements.truePeakDbtp + prediction.appliedGain;

    if (resultingPeak > 0) {
      clippingRisk = 'high';
    } else if (resultingPeak > -1) {
      clippingRisk = 'moderate';
    } else if (resultingPeak > -2) {
      clippingRisk = 'low';
    }
  }

  return {
    success: true,
    algorithm,
    prediction,
    dynamicRange: {
      original: dynamicRange,
      preserved: true, // Gain doesn't change dynamic range
      note: 'Gain adjustments preserve dynamic range'
    },
    headroom: {
      original: headroom,
      afterNormalization: headroom !== null ? Math.round((headroom - prediction.appliedGain) * 100) / 100 : null
    },
    clippingRisk,
    shortTermLoudness: {
      max: shortTermMax,
      afterNormalization: shortTermMax !== null ? Math.round((shortTermMax + prediction.appliedGain) * 100) / 100 : null
    }
  };
}

// ============================================================================
// Quick Check Functions
// ============================================================================

/**
 * Quick summary of normalization impact
 * 
 * @param {Object} measurements - Audio loudness measurements
 * @returns {Object} Quick summary
 */
function quickCheck(measurements) {
  if (!measurements || typeof measurements.integratedLufs !== 'number') {
    return {
      valid: false,
      error: 'Missing integratedLufs measurement'
    };
  }

  const lufs = measurements.integratedLufs;

  // Quick categorization based on common targets
  let category;
  let platformCompatibility;

  if (lufs <= -18) {
    category = 'quiet';
    platformCompatibility = 'Will be boosted on most platforms';
  } else if (lufs <= -14) {
    category = 'optimal';
    platformCompatibility = 'Good compatibility with most platforms';
  } else if (lufs <= -10) {
    category = 'moderate';
    platformCompatibility = 'Will be reduced on most platforms';
  } else {
    category = 'loud';
    platformCompatibility = 'Significant reduction on all platforms';
  }

  // Quick gain estimates
  const spotifyGain = -14 - lufs;
  const appleMusicGain = -16 - lufs;
  const youtubeGain = Math.min(0, -14 - lufs); // YouTube only reduces
  const broadcastGain = -23 - lufs;

  return {
    valid: true,
    inputLufs: lufs,
    category,
    platformCompatibility,
    quickEstimates: {
      spotify: Math.round(spotifyGain * 10) / 10,
      appleMusic: Math.round(appleMusicGain * 10) / 10,
      youtube: Math.round(youtubeGain * 10) / 10,
      broadcast: Math.round(broadcastGain * 10) / 10
    },
    recommendation: generateQuickRecommendation(lufs)
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format gain value as ReplayGain string
 */
function formatReplayGainValue(gainDb) {
  const sign = gainDb >= 0 ? '+' : '';
  return `${sign}${gainDb.toFixed(2)} dB`;
}

/**
 * Format peak value for ReplayGain tag
 */
function formatPeakValue(peakDbtp) {
  // Convert dBTP to linear (0.0 to 1.0 scale)
  const linear = Math.pow(10, peakDbtp / 20);
  return linear.toFixed(6);
}

/**
 * Generate recommendations based on platform predictions
 */
function generatePlatformRecommendations(measurements, platforms, summary) {
  const recommendations = [];

  // Check for severe adjustments
  if (Math.abs(summary.maxGain) > 6 || Math.abs(summary.minGain) > 6) {
    recommendations.push({
      priority: 'high',
      type: 'loudness',
      message: 'Master level is significantly different from platform targets. Consider adjusting to -14 to -16 LUFS.'
    });
  }

  // Check for inconsistent playback
  if (summary.gainRange > 4) {
    recommendations.push({
      priority: 'medium',
      type: 'consistency',
      message: 'Playback levels will vary significantly across platforms.'
    });
  }

  // Peak warning
  if (measurements.truePeakDbtp > -1) {
    recommendations.push({
      priority: 'high',
      type: 'peak',
      message: 'True peak exceeds -1 dBTP. Risk of distortion after gain boost on some platforms.'
    });
  }

  // Boost warning
  const boostingPlatforms = Object.entries(platforms)
    .filter(([_, p]) => p.success && p.appliedGain > 0)
    .map(([algo, _]) => ALGORITHM_SPECS[algo]?.name);

  if (boostingPlatforms.length > 0) {
    recommendations.push({
      priority: 'info',
      type: 'boost',
      message: `These platforms may boost your audio: ${boostingPlatforms.join(', ')}`
    });
  }

  return recommendations;
}

/**
 * Generate quick recommendation based on LUFS
 */
function generateQuickRecommendation(lufs) {
  if (lufs < -20) {
    return 'Consider increasing loudness to prevent excessive platform boost';
  } else if (lufs < -16) {
    return 'Good for Apple Music and broadcast; may be boosted on Spotify';
  } else if (lufs < -14) {
    return 'Optimal range for streaming platforms';
  } else if (lufs < -10) {
    return 'Slightly loud; will be reduced on most platforms';
  } else {
    return 'Very loud master; will be significantly reduced everywhere';
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
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
};
