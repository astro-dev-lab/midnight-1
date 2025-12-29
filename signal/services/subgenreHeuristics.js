/**
 * Subgenre Heuristics Service
 * 
 * ML signal mapping for rap subgenre classification.
 * Per STUDIOOS_ML_INVESTMENT_CHARTER.md - Analysis-Only, No Generative Behavior
 * 
 * Purpose:
 * - Classify production risk profiles, NOT artistic identity
 * - Probabilistic, advisory, never user-facing by default
 * - Used only to tune risk weighting, not creative intent
 */

// ============================================================================
// Subgenre Buckets (Coarse Classification)
// ============================================================================

const SUBGENRES = {
  TRAP: 'trap',
  DRILL: 'drill',
  MELODIC: 'melodic',
  BOOM_BAP: 'boomBap',
  HYBRID: 'hybrid'
};

// ============================================================================
// Signal Thresholds per Subgenre
// ============================================================================

/**
 * Expected signal ranges for each subgenre.
 * Used for probabilistic classification.
 */
const SUBGENRE_PROFILES = {
  [SUBGENRES.TRAP]: {
    bpm: { min: 120, max: 150 },
    subBassEnergy: { min: 0.5, max: 0.9 },      // 30-60 Hz energy ratio
    transientDensity: { min: 0.5, max: 0.8 },
    dynamicRange: { min: 4, max: 10 },          // LU
    stereoWidth: { min: 0.3, max: 0.7 },
    expectedRisks: {
      maskingRisk: { min: 0.3, max: 0.6 },
      clippingRisk: { min: 0.2, max: 0.4 },
      translationRisk: { min: 0.25, max: 0.45 }
    },
    mixBalance: 'balanced'
  },
  
  [SUBGENRES.DRILL]: {
    bpm: { min: 130, max: 145 },
    subBassEnergy: { min: 0.6, max: 0.95 },
    transientDensity: { min: 0.6, max: 0.9 },
    dynamicRange: { min: 2, max: 6 },
    stereoWidth: { min: 0.2, max: 0.5 },
    expectedRisks: {
      maskingRisk: { min: 0.5, max: 0.8 },
      clippingRisk: { min: 0.4, max: 0.7 },
      overCompressionRisk: { min: 0.5, max: 0.8 },
      translationRisk: { min: 0.4, max: 0.7 }
    },
    mixBalance: 'beat-dominant'
  },
  
  [SUBGENRES.MELODIC]: {
    bpm: { min: 90, max: 130 },
    subBassEnergy: { min: 0.3, max: 0.6 },
    transientDensity: { min: 0.2, max: 0.5 },
    dynamicRange: { min: 8, max: 14 },
    stereoWidth: { min: 0.6, max: 0.95 },
    expectedRisks: {
      vocalIntelligibilityRisk: { min: 0.2, max: 0.5 },
      phaseCollapseRisk: { min: 0.2, max: 0.5 },
      translationRisk: { min: 0.3, max: 0.6 }
    },
    mixBalance: 'vocal-dominant'
  },
  
  [SUBGENRES.BOOM_BAP]: {
    bpm: { min: 85, max: 100 },
    subBassEnergy: { min: 0.1, max: 0.4 },
    transientDensity: { min: 0.4, max: 0.7 },
    dynamicRange: { min: 10, max: 16 },
    stereoWidth: { min: 0.4, max: 0.7 },
    expectedRisks: {
      overCompressionRisk: { min: 0.3, max: 0.6 },
      translationRisk: { min: 0.15, max: 0.3 },
      maskingRisk: { min: 0.2, max: 0.4 }
    },
    mixBalance: 'vocal-dominant'
  }
};

// ============================================================================
// Risk Weight Adjustments per Subgenre
// ============================================================================

/**
 * Subgenre-specific risk sensitivity multipliers.
 * Applied during confidence aggregation only.
 */
const RISK_WEIGHT_ADJUSTMENTS = {
  [SUBGENRES.TRAP]: {
    maskingRisk: 1.0,
    clippingRisk: 1.1,
    phaseCollapseRisk: 0.8,
    dynamicsRisk: 0.9,
    translationRisk: 1.0,
    vocalIntelligibilityRisk: 1.0,
    overCompressionRisk: 0.9
  },
  
  [SUBGENRES.DRILL]: {
    maskingRisk: 1.3,
    clippingRisk: 1.5,
    phaseCollapseRisk: 0.7,
    dynamicsRisk: 0.7,
    translationRisk: 1.3,
    vocalIntelligibilityRisk: 1.0,
    overCompressionRisk: 1.4
  },
  
  [SUBGENRES.MELODIC]: {
    maskingRisk: 0.8,
    clippingRisk: 0.9,
    phaseCollapseRisk: 1.4,
    dynamicsRisk: 1.3,
    translationRisk: 1.1,
    vocalIntelligibilityRisk: 1.3,
    overCompressionRisk: 1.2
  },
  
  [SUBGENRES.BOOM_BAP]: {
    maskingRisk: 0.9,
    clippingRisk: 0.8,
    phaseCollapseRisk: 0.9,
    dynamicsRisk: 1.5,
    translationRisk: 0.8,
    vocalIntelligibilityRisk: 1.1,
    overCompressionRisk: 1.4
  },
  
  [SUBGENRES.HYBRID]: {
    // Conservative weights for uncertain classification
    maskingRisk: 1.0,
    clippingRisk: 1.0,
    phaseCollapseRisk: 1.0,
    dynamicsRisk: 1.0,
    translationRisk: 1.0,
    vocalIntelligibilityRisk: 1.0,
    overCompressionRisk: 1.0
  }
};

// ============================================================================
// Classification Functions
// ============================================================================

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
  
  // Signal weights - BPM and dynamic range are most discriminating
  const weights = {
    bpm: 2.0,
    subBassEnergy: 1.5,
    transientDensity: 1.0,
    dynamicRange: 2.0,
    stereoWidth: 1.0,
    mixBalance: 1.5
  };
  
  // BPM match (heavily weighted - most discriminating)
  if (signals.bpm !== undefined) {
    const bpmMatch = isInRange(signals.bpm, profile.bpm);
    const bpmScore = bpmMatch ? 1 : gaussian(signals.bpm, profile.bpm);
    matchScore += bpmScore * weights.bpm;
    totalWeight += weights.bpm;
  }
  
  // Sub-bass energy match
  if (signals.subBassEnergy !== undefined) {
    const score = rangeProximity(signals.subBassEnergy, profile.subBassEnergy);
    matchScore += score * weights.subBassEnergy;
    totalWeight += weights.subBassEnergy;
  }
  
  // Transient density match
  if (signals.transientDensity !== undefined) {
    const score = rangeProximity(signals.transientDensity, profile.transientDensity);
    matchScore += score * weights.transientDensity;
    totalWeight += weights.transientDensity;
  }
  
  // Dynamic range match (heavily weighted - very discriminating)
  if (signals.dynamicRange !== undefined) {
    const score = rangeProximity(signals.dynamicRange, profile.dynamicRange);
    matchScore += score * weights.dynamicRange;
    totalWeight += weights.dynamicRange;
  }
  
  // Stereo width match
  if (signals.stereoWidth !== undefined) {
    const score = rangeProximity(signals.stereoWidth, profile.stereoWidth);
    matchScore += score * weights.stereoWidth;
    totalWeight += weights.stereoWidth;
  }
  
  // Mix balance match
  if (signals.mixBalance !== undefined && profile.mixBalance) {
    const score = signals.mixBalance === profile.mixBalance ? 1 : 0.2;
    matchScore += score * weights.mixBalance;
    totalWeight += weights.mixBalance;
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
  const likelihoods = {};
  let totalScore = 0;
  
  // Calculate raw match scores
  for (const subgenre of Object.values(SUBGENRES)) {
    if (subgenre === SUBGENRES.HYBRID) continue;
    likelihoods[subgenre] = calculateSubgenreMatch(signals, subgenre);
    totalScore += likelihoods[subgenre];
  }
  
  // Normalize to probabilities
  if (totalScore > 0) {
    for (const subgenre in likelihoods) {
      likelihoods[subgenre] = likelihoods[subgenre] / totalScore;
    }
  }
  
  // Determine primary classification
  const sorted = Object.entries(likelihoods)
    .sort(([, a], [, b]) => b - a);
  
  const [topSubgenre, topProbability] = sorted[0] || [SUBGENRES.HYBRID, 0];
  const [secondSubgenre, secondProbability] = sorted[1] || [null, 0];
  
  // Check for hybrid condition - more permissive thresholds
  // Only classify as hybrid if top probability is very low OR extremely close race
  const isHybrid = topProbability < 0.35 || 
                   (secondProbability > 0 && topProbability - secondProbability < 0.08);
  
  // Check for conflicting signals (close competition between top candidates)
  const hasConflictingSignals = secondProbability > 0 && topProbability - secondProbability < 0.12;
  
  return {
    likelihoods,
    primary: isHybrid ? SUBGENRES.HYBRID : topSubgenre,
    confidence: isHybrid ? Math.max(topProbability, 0.3) : topProbability,
    isUncertain: isHybrid,
    conflictingSignals: hasConflictingSignals && !isHybrid,
    secondaryCandidate: secondSubgenre
  };
}

/**
 * Get risk weight adjustments for a classified subgenre.
 * 
 * @param {Object} classification - Subgenre classification result
 * @returns {Object} - Risk weight multipliers
 */
function getRiskWeights(classification) {
  const { primary, confidence, isUncertain } = classification;
  
  const baseWeights = RISK_WEIGHT_ADJUSTMENTS[primary] || RISK_WEIGHT_ADJUSTMENTS[SUBGENRES.HYBRID];
  
  // If uncertain, blend toward neutral (1.0) weights
  if (isUncertain || confidence < 0.6) {
    const blendFactor = confidence;
    const blendedWeights = {};
    
    for (const [risk, weight] of Object.entries(baseWeights)) {
      blendedWeights[risk] = 1.0 + (weight - 1.0) * blendFactor;
    }
    
    return blendedWeights;
  }
  
  return { ...baseWeights };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if value is within range.
 */
function isInRange(value, range) {
  return value >= range.min && value <= range.max;
}

/**
 * Calculate Gaussian proximity to range midpoint.
 */
function gaussian(value, range) {
  const midpoint = (range.min + range.max) / 2;
  const spread = (range.max - range.min) / 2;
  const distance = Math.abs(value - midpoint);
  return Math.exp(-(distance * distance) / (2 * spread * spread));
}

/**
 * Calculate proximity score for value within expected range.
 */
function rangeProximity(value, range) {
  if (isInRange(value, range)) {
    return 1.0;
  }
  
  // Calculate distance from range
  const distance = value < range.min 
    ? range.min - value 
    : value - range.max;
  
  // Decay based on distance
  const rangeSpan = range.max - range.min;
  return Math.max(0, 1 - (distance / rangeSpan));
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  SUBGENRES,
  SUBGENRE_PROFILES,
  RISK_WEIGHT_ADJUSTMENTS,
  classifySubgenre,
  getRiskWeights,
  calculateSubgenreMatch
};
