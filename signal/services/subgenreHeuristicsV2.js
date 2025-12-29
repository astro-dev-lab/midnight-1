/**
 * Subgenre Heuristics Service v2
 * 
 * ML signal mapping for rap subgenre classification.
 * Per STUDIOOS_ML_INVESTMENT_CHARTER.md - Analysis-Only, No Generative Behavior
 * 
 * v2 Additions:
 * - 5 new subgenre buckets (lofi, phonk, cloudRap, ukDrill, rage)
 * - 3 new signal types (bpm detection, vinylNoise, reverbDecay)
 * - 2 new risk types (artifactRisk, lofiAestheticRisk)
 * - Tighter classification thresholds
 * 
 * Purpose:
 * - Classify production risk profiles, NOT artistic identity
 * - Probabilistic, advisory, never user-facing by default
 * - Used only to tune risk weighting, not creative intent
 */

// ============================================================================
// Version Information
// ============================================================================

const VERSION = '2.0.0';

// ============================================================================
// Subgenre Buckets (v2 Expanded)
// ============================================================================

const SUBGENRES = {
  // v1 buckets
  TRAP: 'trap',
  DRILL: 'drill',
  MELODIC: 'melodic',
  BOOMBAP: 'boomBap',
  BOOM_BAP: 'boomBap', // Alias for compatibility
  PLUGG: 'plugg',
  HYBRID: 'hybrid',
  
  // v2 additions
  LOFI: 'lofi',
  PHONK: 'phonk',
  CLOUD_RAP: 'cloudRap',
  UK_DRILL: 'ukDrill',
  RAGE: 'rage'
};

// ============================================================================
// Signal Thresholds per Subgenre
// ============================================================================

/**
 * Expected signal ranges for each subgenre.
 * Used for probabilistic classification.
 */
const SUBGENRE_PROFILES = {
  // ─────────────────────────────────────────────────────────────────────────
  // v1 Profiles (preserved)
  // ─────────────────────────────────────────────────────────────────────────
  
  [SUBGENRES.TRAP]: {
    bpm: { min: 120, max: 150 },
    subBassEnergy: { min: 0.5, max: 0.9 },
    transientDensity: { min: 0.5, max: 0.8 },
    dynamicRange: { min: 4, max: 10 },
    stereoWidth: { min: 0.3, max: 0.7 },
    vinylNoise: { min: 0, max: 0.1 },
    reverbDecay: { min: 0.2, max: 0.8 },
    mixBalance: 'balanced'
  },
  
  [SUBGENRES.DRILL]: {
    bpm: { min: 130, max: 145 },
    subBassEnergy: { min: 0.6, max: 0.95 },
    transientDensity: { min: 0.6, max: 0.9 },
    dynamicRange: { min: 2, max: 6 },
    stereoWidth: { min: 0.2, max: 0.5 },
    vinylNoise: { min: 0, max: 0.05 },
    reverbDecay: { min: 0.1, max: 0.5 },
    mixBalance: 'beat-dominant'
  },
  
  [SUBGENRES.MELODIC]: {
    bpm: { min: 90, max: 130 },
    subBassEnergy: { min: 0.3, max: 0.6 },
    transientDensity: { min: 0.2, max: 0.5 },
    dynamicRange: { min: 8, max: 14 },
    stereoWidth: { min: 0.6, max: 0.95 },
    vinylNoise: { min: 0, max: 0.15 },
    reverbDecay: { min: 0.5, max: 1.5 },
    mixBalance: 'vocal-dominant'
  },
  
  [SUBGENRES.BOOM_BAP]: {
    bpm: { min: 85, max: 100 },
    subBassEnergy: { min: 0.1, max: 0.4 },
    transientDensity: { min: 0.4, max: 0.7 },
    dynamicRange: { min: 10, max: 16 },
    stereoWidth: { min: 0.4, max: 0.7 },
    vinylNoise: { min: 0.1, max: 0.4 },
    reverbDecay: { min: 0.1, max: 0.4 },
    mixBalance: 'vocal-dominant'
  },
  
  [SUBGENRES.PLUGG]: {
    bpm: { min: 145, max: 165 },
    subBassEnergy: { min: 0.3, max: 0.5 },
    transientDensity: { min: 0.7, max: 0.95 },
    dynamicRange: { min: 3, max: 7 },
    stereoWidth: { min: 0.7, max: 0.95 },
    vinylNoise: { min: 0, max: 0.1 },
    reverbDecay: { min: 0.3, max: 0.7 },
    mixBalance: 'vocal-dominant'
  },
  
  // ─────────────────────────────────────────────────────────────────────────
  // v2 New Profiles
  // ─────────────────────────────────────────────────────────────────────────
  
  [SUBGENRES.LOFI]: {
    bpm: { min: 70, max: 95 },
    subBassEnergy: { min: 0.2, max: 0.5 },
    transientDensity: { min: 0.2, max: 0.4 },
    dynamicRange: { min: 6, max: 12 },
    stereoWidth: { min: 0.4, max: 0.7 },
    vinylNoise: { min: 0.3, max: 0.8 },
    reverbDecay: { min: 0.3, max: 0.8 },
    highFreqRolloff: { min: 0.4, max: 0.8 },
    mixBalance: 'balanced'
  },
  
  [SUBGENRES.PHONK]: {
    bpm: { min: 120, max: 145 },
    subBassEnergy: { min: 0.5, max: 0.8 },
    transientDensity: { min: 0.6, max: 0.9 },
    dynamicRange: { min: 3, max: 7 },
    stereoWidth: { min: 0.3, max: 0.6 },
    vinylNoise: { min: 0.1, max: 0.5 },
    reverbDecay: { min: 0.2, max: 0.6 },
    cowbellPresence: { min: 0.5, max: 1.0 },
    mixBalance: 'beat-dominant'
  },
  
  [SUBGENRES.CLOUD_RAP]: {
    bpm: { min: 80, max: 120 },
    subBassEnergy: { min: 0.3, max: 0.6 },
    transientDensity: { min: 0.1, max: 0.3 },
    dynamicRange: { min: 8, max: 14 },
    stereoWidth: { min: 0.7, max: 0.95 },
    vinylNoise: { min: 0, max: 0.2 },
    reverbDecay: { min: 1.0, max: 3.0 },
    mixBalance: 'vocal-dominant'
  },
  
  [SUBGENRES.UK_DRILL]: {
    bpm: { min: 138, max: 145 },
    subBassEnergy: { min: 0.6, max: 0.9 },
    transientDensity: { min: 0.5, max: 0.8 },
    dynamicRange: { min: 3, max: 6 },
    stereoWidth: { min: 0.25, max: 0.5 },
    vinylNoise: { min: 0, max: 0.05 },
    reverbDecay: { min: 0.1, max: 0.4 },
    slidingBass: { min: 0.6, max: 1.0 },
    mixBalance: 'beat-dominant'
  },
  
  [SUBGENRES.RAGE]: {
    bpm: { min: 140, max: 170 },
    subBassEnergy: { min: 0.4, max: 0.7 },
    transientDensity: { min: 0.7, max: 0.95 },
    dynamicRange: { min: 2, max: 5 },
    stereoWidth: { min: 0.4, max: 0.7 },
    vinylNoise: { min: 0, max: 0.1 },
    reverbDecay: { min: 0.1, max: 0.4 },
    distortion: { min: 0.4, max: 0.9 },
    mixBalance: 'balanced'
  }
};

// ============================================================================
// Risk Weight Adjustments per Subgenre (v2 Expanded)
// ============================================================================

/**
 * Subgenre-specific risk sensitivity multipliers.
 * Applied during confidence aggregation only.
 */
const RISK_WEIGHT_ADJUSTMENTS = {
  // v1 profiles
  [SUBGENRES.TRAP]: {
    maskingRisk: 1.0,
    clippingRisk: 1.1,
    phaseCollapseRisk: 0.8,
    dynamicsRisk: 0.9,
    translationRisk: 1.0,
    vocalIntelligibilityRisk: 1.0,
    overCompressionRisk: 0.9,
    artifactRisk: 1.0,
    lofiAestheticRisk: 0.5
  },
  
  [SUBGENRES.DRILL]: {
    maskingRisk: 1.3,
    clippingRisk: 1.5,
    phaseCollapseRisk: 0.7,
    dynamicsRisk: 0.7,
    translationRisk: 1.3,
    vocalIntelligibilityRisk: 1.0,
    overCompressionRisk: 1.4,
    artifactRisk: 1.0,
    lofiAestheticRisk: 0.5
  },
  
  [SUBGENRES.MELODIC]: {
    maskingRisk: 0.8,
    clippingRisk: 0.9,
    phaseCollapseRisk: 1.4,
    dynamicsRisk: 1.3,
    translationRisk: 1.1,
    vocalIntelligibilityRisk: 1.3,
    overCompressionRisk: 1.2,
    artifactRisk: 1.0,
    lofiAestheticRisk: 0.7
  },
  
  [SUBGENRES.BOOM_BAP]: {
    maskingRisk: 0.9,
    clippingRisk: 0.8,
    phaseCollapseRisk: 0.9,
    dynamicsRisk: 1.5,
    translationRisk: 0.8,
    vocalIntelligibilityRisk: 1.1,
    overCompressionRisk: 1.4,
    artifactRisk: 1.0,
    lofiAestheticRisk: 0.8
  },
  
  [SUBGENRES.PLUGG]: {
    maskingRisk: 0.8,
    clippingRisk: 1.1,
    phaseCollapseRisk: 1.3,
    dynamicsRisk: 0.7,
    translationRisk: 1.2,
    vocalIntelligibilityRisk: 1.2,
    overCompressionRisk: 1.0,
    artifactRisk: 0.9,
    lofiAestheticRisk: 0.6
  },
  
  [SUBGENRES.HYBRID]: {
    maskingRisk: 1.0,
    clippingRisk: 1.0,
    phaseCollapseRisk: 1.0,
    dynamicsRisk: 1.0,
    translationRisk: 1.0,
    vocalIntelligibilityRisk: 1.0,
    overCompressionRisk: 1.0,
    artifactRisk: 1.0,
    lofiAestheticRisk: 0.7
  },
  
  // v2 new profiles
  [SUBGENRES.LOFI]: {
    maskingRisk: 0.7,
    clippingRisk: 0.6,
    phaseCollapseRisk: 0.8,
    dynamicsRisk: 1.2,
    translationRisk: 0.7,
    vocalIntelligibilityRisk: 0.9,
    overCompressionRisk: 0.8,
    artifactRisk: 0.4,        // Low weight - artifacts often intentional
    lofiAestheticRisk: 1.5    // High weight - protect lo-fi character
  },
  
  [SUBGENRES.PHONK]: {
    maskingRisk: 1.1,
    clippingRisk: 0.8,        // Lower - distortion often intentional
    phaseCollapseRisk: 0.7,
    dynamicsRisk: 0.6,        // Low - heavy compression expected
    translationRisk: 1.0,
    vocalIntelligibilityRisk: 0.9,
    overCompressionRisk: 0.6, // Low - Memphis compression expected
    artifactRisk: 0.5,        // Low - sample artifacts expected
    lofiAestheticRisk: 1.2
  },
  
  [SUBGENRES.CLOUD_RAP]: {
    maskingRisk: 0.7,
    clippingRisk: 0.8,
    phaseCollapseRisk: 1.5,   // High - wide stereo critical
    dynamicsRisk: 1.2,
    translationRisk: 1.3,     // High - speaker translation important
    vocalIntelligibilityRisk: 1.2,
    overCompressionRisk: 1.1,
    artifactRisk: 0.9,
    lofiAestheticRisk: 1.0
  },
  
  [SUBGENRES.UK_DRILL]: {
    maskingRisk: 1.4,         // High - dense mixes
    clippingRisk: 1.5,        // High - aggressive levels
    phaseCollapseRisk: 0.7,
    dynamicsRisk: 0.7,
    translationRisk: 1.4,     // High - bass translation critical
    vocalIntelligibilityRisk: 1.0,
    overCompressionRisk: 1.4,
    artifactRisk: 1.0,
    lofiAestheticRisk: 0.5
  },
  
  [SUBGENRES.RAGE]: {
    maskingRisk: 1.2,
    clippingRisk: 0.7,        // Low - distortion intentional
    phaseCollapseRisk: 0.8,
    dynamicsRisk: 0.5,        // Very low - crushed dynamics expected
    translationRisk: 1.1,
    vocalIntelligibilityRisk: 0.8,
    overCompressionRisk: 0.5, // Very low - heavy compression expected
    artifactRisk: 0.3,        // Very low - distortion is the point
    lofiAestheticRisk: 0.6
  }
};

// ============================================================================
// v2 Classification Thresholds
// ============================================================================

const CLASSIFICATION_THRESHOLDS = {
  // With 10 subgenres, equal distribution = 0.10 each
  // Strong signal should be ~1.5x average = 0.15
  HYBRID_PROBABILITY: 0.11,   // v2: minimum probability to be considered primary
  HYBRID_GAP: 0.015,          // v2: minimum gap to secondary for non-hybrid
  CONFLICTING_SIGNALS: 0.01,  // v2: signals within this range are conflicting
  CONFIDENCE_BLEND: 0.08      // v2: start blending below this
};

// ============================================================================
// v2 Signal Weights
// ============================================================================

const SIGNAL_WEIGHTS = {
  bpm: 2.5,              // v2: increased (was 2.0)
  subBassEnergy: 1.5,
  transientDensity: 1.0,
  dynamicRange: 2.0,
  stereoWidth: 1.0,
  mixBalance: 1.5,
  // v2 new signals
  vinylNoise: 2.0,       // Strong discriminator for lofi
  reverbDecay: 1.5,      // Discriminator for cloud rap
  distortion: 2.0,       // Discriminator for rage
  cowbellPresence: 1.5,  // Discriminator for phonk
  slidingBass: 1.5,      // Discriminator for UK drill
  highFreqRolloff: 1.5   // Discriminator for lofi
};

// ============================================================================
// Signal Type Constants
// ============================================================================

const SIGNALS = {
  BPM: 'bpm',
  SUB_BASS_ENERGY: 'subBassEnergy',
  TRANSIENT_DENSITY: 'transientDensity',
  DYNAMIC_RANGE: 'dynamicRange',
  STEREO_WIDTH: 'stereoWidth',
  MIX_BALANCE: 'mixBalance',
  VINYL_NOISE: 'vinylNoise',
  REVERB_DECAY: 'reverbDecay',
  DISTORTION: 'distortion',
  COWBELL_PRESENCE: 'cowbellPresence',
  SLIDING_BASS: 'slidingBass',
  HIGH_FREQ_ROLLOFF: 'highFreqRolloff'
};

// ============================================================================
// Classification Functions
// ============================================================================

/**
 * Normalize input signals to v2 schema.
 * Maps common signal names to expected v2 names.
 */
function normalizeInputSignals(signals) {
  return {
    bpm: signals.bpm ?? signals.tempo ?? 140,
    subBassEnergy: signals.subBassEnergy ?? signals.bassWeight ?? signals.bass ?? 0.5,
    transientDensity: signals.transientDensity ?? signals.hiHatDensity ?? signals.percussionDensity ?? 0.5,
    dynamicRange: signals.dynamicRange ?? signals.dynamics ?? 12,
    stereoWidth: signals.stereoWidth ?? signals.stereo ?? 0.5,
    vocalPresence: signals.vocalPresence ?? signals.vocals ?? 0.3,
    vinylNoise: signals.vinylNoise ?? 0,
    reverbDecay: signals.reverbDecay ?? signals.reverb ?? 0.3,
    distortion: signals.distortion ?? signals.saturation ?? 0,
    cowbellPresence: signals.cowbellPresence ?? 0,
    slidingBass: signals.slidingBass ?? signals.bassSlide ?? 0,
    highFreqRolloff: signals.highFreqRolloff ?? 0.5,
    mixBalance: signals.mixBalance ?? inferMixBalance(signals)
  };
}

/**
 * Infer mix balance from vocal presence.
 */
function inferMixBalance(signals) {
  const vocalPresence = signals.vocalPresence ?? signals.vocals ?? 0.3;
  if (vocalPresence > 0.6) return 'vocal-dominant';
  if (vocalPresence < 0.25) return 'beat-dominant';
  return 'balanced';
}

/**
 * Calculate how well signals match a subgenre profile.
 * Returns a probability score 0-1.
 * 
 * Uses weighted signal matching with discriminating features prioritized.
 * 
 * @param {Object} signals - Extracted audio signals
 * @param {string} subgenre - Subgenre to match against
 * @returns {number} - Match probability (0-1)
 */
function calculateSubgenreMatch(signals, subgenre) {
  const profile = SUBGENRE_PROFILES[subgenre];
  if (!profile) return 0;
  
  let matchScore = 0;
  let totalWeight = 0;
  
  for (const [signalKey, weight] of Object.entries(SIGNAL_WEIGHTS)) {
    // Skip mixBalance - handled separately below
    if (signalKey === 'mixBalance') continue;
    
    const signalValue = signals[signalKey];
    const profileRange = profile[signalKey];
    
    // Only process if both signal and profile range exist
    if (signalValue !== undefined && profileRange !== undefined && 
        typeof profileRange === 'object' && profileRange.min !== undefined) {
      const score = isInRange(signalValue, profileRange) 
        ? 1 
        : rangeProximity(signalValue, profileRange);
      
      matchScore += score * weight;
      totalWeight += weight;
    }
  }
  
  // Mix balance matching (string comparison, not range)
  if (signals.mixBalance !== undefined && profile.mixBalance) {
    const score = signals.mixBalance === profile.mixBalance ? 1 : 0.2;
    matchScore += score * SIGNAL_WEIGHTS.mixBalance;
    totalWeight += SIGNAL_WEIGHTS.mixBalance;
  }
  
  return totalWeight > 0 ? matchScore / totalWeight : 0;
}

/**
 * Classify audio signals into subgenre probabilities.
 * 
 * @param {Object} signals - Extracted audio signals
 * @returns {Object} - Subgenre likelihood distribution
 */
function classifySubgenre(signals) {
  // Normalize input signals to v2 schema
  const normalizedSignals = normalizeInputSignals(signals);
  
  const likelihoods = {};
  let totalScore = 0;
  
  // Get unique subgenre values (excludes alias duplicates and hybrid)
  const uniqueSubgenres = [...new Set(Object.values(SUBGENRES))].filter(
    s => s !== SUBGENRES.HYBRID
  );
  
  // Calculate raw match scores for all non-hybrid subgenres
  for (const subgenre of uniqueSubgenres) {
    likelihoods[subgenre] = calculateSubgenreMatch(normalizedSignals, subgenre);
    totalScore += likelihoods[subgenre];
  }
  
  // Normalize to probabilities
  if (totalScore > 0) {
    for (const subgenre in likelihoods) {
      likelihoods[subgenre] = likelihoods[subgenre] / totalScore;
    }
  }
  
  // Sort by probability
  const sorted = Object.entries(likelihoods)
    .sort(([, a], [, b]) => b - a);
  
  const [topSubgenre, topProbability] = sorted[0] || [SUBGENRES.HYBRID, 0];
  const [secondSubgenre, secondProbability] = sorted[1] || [null, 0];
  
  // Check for hybrid condition - v2 tighter thresholds
  const isHybrid = topProbability < CLASSIFICATION_THRESHOLDS.HYBRID_PROBABILITY || 
                   (secondProbability > 0 && 
                    topProbability - secondProbability < CLASSIFICATION_THRESHOLDS.HYBRID_GAP);
  
  // Check for conflicting signals
  const hasConflictingSignals = secondProbability > 0 && 
                                 topProbability - secondProbability < CLASSIFICATION_THRESHOLDS.CONFLICTING_SIGNALS;
  
  return {
    likelihoods,
    probabilities: likelihoods, // Alias for backward compatibility
    primary: isHybrid ? SUBGENRES.HYBRID : topSubgenre,
    confidence: isHybrid ? Math.max(topProbability, 0.3) : topProbability,
    isUncertain: isHybrid,
    isHybrid: isHybrid, // Explicit alias
    conflictingSignals: hasConflictingSignals && !isHybrid,
    secondaryCandidate: secondSubgenre,
    components: sorted.slice(0, 2).map(([s]) => s), // For hybrid breakdowns
    topCandidates: sorted.slice(0, 3).map(([s, p]) => ({ subgenre: s, probability: p }))
  };
}

/**
 * Get risk weight adjustments for a subgenre.
 * 
 * @param {string|Object} subgenreOrClassification - Subgenre string or classification result
 * @returns {Object} - Risk weight multipliers (normalized to job integration format)
 */
function getRiskWeights(subgenreOrClassification) {
  let primary, confidence, isUncertain;
  
  // Support both string and object input
  if (typeof subgenreOrClassification === 'string') {
    primary = subgenreOrClassification;
    confidence = 1.0;
    isUncertain = false;
  } else {
    primary = subgenreOrClassification.primary;
    confidence = subgenreOrClassification.confidence;
    isUncertain = subgenreOrClassification.isUncertain;
  }
  
  const baseWeights = RISK_WEIGHT_ADJUSTMENTS[primary] || RISK_WEIGHT_ADJUSTMENTS[SUBGENRES.HYBRID];
  
  // If uncertain, blend toward neutral (1.0) weights - v2 earlier blend
  if (isUncertain || confidence < CLASSIFICATION_THRESHOLDS.CONFIDENCE_BLEND) {
    const blendFactor = confidence;
    const blendedWeights = {};
    
    for (const [risk, weight] of Object.entries(baseWeights)) {
      blendedWeights[risk] = 1.0 + (weight - 1.0) * blendFactor;
    }
    
    return normalizeRiskWeights(blendedWeights);
  }
  
  return normalizeRiskWeights({ ...baseWeights });
}

/**
 * Normalize v2 risk weight keys to job integration format.
 */
function normalizeRiskWeights(weights) {
  return {
    // Map v2 names to expected names
    clipping: weights.clippingRisk ?? 1.0,
    lowEndMasking: weights.maskingRisk ?? 1.0,
    phaseIssues: weights.phaseCollapseRisk ?? 1.0,
    dynamicsLoss: weights.dynamicsRisk ?? 1.0,
    translation: weights.translationRisk ?? 1.0,
    vocalClarity: weights.vocalIntelligibilityRisk ?? 1.0,
    overCompression: weights.overCompressionRisk ?? 1.0,
    artifactRisk: weights.artifactRisk ?? 1.0,
    lofiAestheticRisk: weights.lofiAestheticRisk ?? 0.7
  };
}

/**
 * Get confidence level category from confidence score.
 * 
 * @param {number} confidence - Confidence score 0-1
 * @returns {string} - Confidence level (HIGH, MEDIUM, LOW, VERY_LOW)
 */
function getConfidenceLevel(confidence) {
  if (confidence >= 0.75) return 'HIGH';
  if (confidence >= 0.55) return 'MEDIUM';
  if (confidence >= 0.35) return 'LOW';
  return 'VERY_LOW';
}

// ============================================================================
// Helper Functions
// ============================================================================

function isInRange(value, range) {
  return value >= range.min && value <= range.max;
}

function gaussian(value, range) {
  const midpoint = (range.min + range.max) / 2;
  const spread = (range.max - range.min) / 2;
  const distance = Math.abs(value - midpoint);
  return Math.exp(-(distance * distance) / (2 * spread * spread));
}

function rangeProximity(value, range) {
  if (isInRange(value, range)) {
    return 1.0;
  }
  
  const distance = value < range.min 
    ? range.min - value 
    : value - range.max;
  
  const rangeSpan = range.max - range.min;
  return Math.max(0, 1 - (distance / (rangeSpan || 1)));
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  VERSION,
  SUBGENRES,
  SIGNALS,
  SUBGENRE_PROFILES,
  RISK_WEIGHT_ADJUSTMENTS,
  CLASSIFICATION_THRESHOLDS,
  SIGNAL_WEIGHTS,
  classifySubgenre,
  getRiskWeights,
  getConfidenceLevel,
  calculateSubgenreMatch,
  normalizeRiskWeights
};
