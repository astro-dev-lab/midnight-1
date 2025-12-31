/**
 * Multi-Pass Risk Accumulator
 * 
 * Tracks and penalizes repeated processing across multiple jobs.
 * Calculates composite risk score based on processing history,
 * artifact accumulation, and type repetition.
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Assets maintain lineage chain
 * tracking all transformations. This service assesses cumulative
 * processing burden to prevent quality degradation.
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Risk level classifications
 */
const RiskLevel = Object.freeze({
  PRISTINE: 'PRISTINE',       // No/minimal processing
  LOW: 'LOW',                 // Light processing, full headroom
  MODERATE: 'MODERATE',       // Acceptable processing level
  HIGH: 'HIGH',               // Heavy processing, limited headroom
  EXCESSIVE: 'EXCESSIVE'      // Processing capacity exhausted
});

/**
 * Processing category types
 */
const ProcessingCategory = Object.freeze({
  ANALYSIS: 'ANALYSIS',
  RESTORATION: 'RESTORATION',
  NORMALIZATION: 'NORMALIZATION',
  EQ: 'EQ',
  DYNAMICS: 'DYNAMICS',
  MASTERING: 'MASTERING',
  STEREO: 'STEREO',
  FORMAT: 'FORMAT'
});

/**
 * Risk level descriptions
 */
const RISK_DESCRIPTIONS = Object.freeze({
  [RiskLevel.PRISTINE]: 'Asset has minimal processing history. Full headroom for any transformations.',
  [RiskLevel.LOW]: 'Light processing detected. Good headroom for 2-3 additional transformation stages.',
  [RiskLevel.MODERATE]: 'Moderate processing history. Use care with additional dynamics processing.',
  [RiskLevel.HIGH]: 'Heavy processing detected. Limit additional transformations to essential operations.',
  [RiskLevel.EXCESSIVE]: 'Processing capacity exhausted. Additional transformations will degrade quality.'
});

/**
 * Map preset names to processing categories
 */
const PRESET_CATEGORY_MAP = Object.freeze({
  // Analysis (non-destructive)
  'analyze-full': ProcessingCategory.ANALYSIS,
  'analyze-loudness': ProcessingCategory.ANALYSIS,
  'analyze-spectrum': ProcessingCategory.ANALYSIS,
  'analyze-dynamics': ProcessingCategory.ANALYSIS,
  
  // Restoration
  'restore-declip': ProcessingCategory.RESTORATION,
  'restore-denoise': ProcessingCategory.RESTORATION,
  'restore-declick': ProcessingCategory.RESTORATION,
  
  // Normalization
  'normalize-peak': ProcessingCategory.NORMALIZATION,
  'normalize-loudness': ProcessingCategory.NORMALIZATION,
  'normalize-rms': ProcessingCategory.NORMALIZATION,
  'gain-adjust': ProcessingCategory.NORMALIZATION,
  
  // EQ
  'eq-correct': ProcessingCategory.EQ,
  'eq-enhance': ProcessingCategory.EQ,
  'eq-surgical': ProcessingCategory.EQ,
  
  // Dynamics
  'compress-gentle': ProcessingCategory.DYNAMICS,
  'compress-medium': ProcessingCategory.DYNAMICS,
  'compress-heavy': ProcessingCategory.DYNAMICS,
  'expand-gentle': ProcessingCategory.DYNAMICS,
  
  // Mastering (includes limiting)
  'master-standard': ProcessingCategory.MASTERING,
  'master-streaming': ProcessingCategory.MASTERING,
  'master-broadcast': ProcessingCategory.MASTERING,
  'master-vinyl': ProcessingCategory.MASTERING,
  'limit-peak': ProcessingCategory.MASTERING,
  'limit-loudness': ProcessingCategory.MASTERING,
  
  // Stereo
  'stereo-widen': ProcessingCategory.STEREO,
  'stereo-narrow': ProcessingCategory.STEREO,
  'mono-fold': ProcessingCategory.STEREO,
  
  // Format conversion
  'convert-wav': ProcessingCategory.FORMAT,
  'convert-mp3': ProcessingCategory.FORMAT,
  'convert-flac': ProcessingCategory.FORMAT,
  'convert-aac': ProcessingCategory.FORMAT,
  'resample-44100': ProcessingCategory.FORMAT,
  'resample-48000': ProcessingCategory.FORMAT,
  'dither-16bit': ProcessingCategory.FORMAT
});

/**
 * Risk weights per processing category
 * Higher weight = more impact on risk score
 */
const CATEGORY_WEIGHTS = Object.freeze({
  [ProcessingCategory.ANALYSIS]: 0,       // Non-destructive
  [ProcessingCategory.RESTORATION]: 5,    // Usually improves quality
  [ProcessingCategory.NORMALIZATION]: 8,  // Minor signal changes
  [ProcessingCategory.EQ]: 10,            // Frequency modification
  [ProcessingCategory.DYNAMICS]: 15,      // Significant signal changes
  [ProcessingCategory.MASTERING]: 20,     // Heavy processing
  [ProcessingCategory.STEREO]: 12,        // Can cause phase issues
  [ProcessingCategory.FORMAT]: 5          // Quality depends on format
});

/**
 * Repeat penalty multipliers
 */
const REPEAT_PENALTIES = Object.freeze({
  [ProcessingCategory.ANALYSIS]: 0,       // Can repeat freely
  [ProcessingCategory.RESTORATION]: 1.2,  // Minor penalty
  [ProcessingCategory.NORMALIZATION]: 1.5, // Moderate penalty
  [ProcessingCategory.EQ]: 1.3,           // Some EQ stacking is OK
  [ProcessingCategory.DYNAMICS]: 2.0,     // Heavy penalty for stacking
  [ProcessingCategory.MASTERING]: 2.5,    // Very heavy penalty
  [ProcessingCategory.STEREO]: 1.8,       // Stereo processing stacks poorly
  [ProcessingCategory.FORMAT]: 1.5        // Conversion losses accumulate
});

/**
 * Risk score thresholds
 */
const THRESHOLDS = Object.freeze({
  RISK_SCORE: {
    PRISTINE: 10,
    LOW: 25,
    MODERATE: 50,
    HIGH: 75,
    EXCESSIVE: 100
  },
  MAX_RECOMMENDED_PASSES: {
    [ProcessingCategory.ANALYSIS]: 999,   // Unlimited
    [ProcessingCategory.RESTORATION]: 3,
    [ProcessingCategory.NORMALIZATION]: 2,
    [ProcessingCategory.EQ]: 3,
    [ProcessingCategory.DYNAMICS]: 2,
    [ProcessingCategory.MASTERING]: 1,
    [ProcessingCategory.STEREO]: 2,
    [ProcessingCategory.FORMAT]: 2
  }
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get processing category for a preset
 * @param {string} presetName - Preset name
 * @returns {string|null} ProcessingCategory or null
 */
function getPresetCategory(presetName) {
  return PRESET_CATEGORY_MAP[presetName] || null;
}

/**
 * Get weight for a processing category
 * @param {string} category - ProcessingCategory
 * @returns {number} Weight value
 */
function getCategoryWeight(category) {
  const weight = CATEGORY_WEIGHTS[category];
  return weight !== undefined ? weight : 10;
}

/**
 * Get repeat penalty multiplier for a category
 * @param {string} category - ProcessingCategory
 * @returns {number} Penalty multiplier
 */
function getRepeatPenalty(category) {
  const penalty = REPEAT_PENALTIES[category];
  return penalty !== undefined ? penalty : 1.5;
}

/**
 * Count processing passes by category
 * @param {Array<Object>} history - Processing history
 * @returns {Object} Category counts
 */
function countByCategory(history) {
  const counts = {};
  
  for (const entry of history) {
    const preset = entry.preset || entry;
    const category = typeof preset === 'string' 
      ? getPresetCategory(preset) 
      : ProcessingCategory.DYNAMICS; // Default
    
    if (category) {
      counts[category] = (counts[category] || 0) + 1;
    }
  }
  
  return counts;
}

/**
 * Get total non-analysis processing passes
 * @param {Object} categoryCounts - Category counts
 * @returns {number} Total destructive passes
 */
function countDestructivePasses(categoryCounts) {
  let total = 0;
  for (const [category, count] of Object.entries(categoryCounts)) {
    if (category !== ProcessingCategory.ANALYSIS) {
      total += count;
    }
  }
  return total;
}

// ============================================================================
// Risk Calculation Functions
// ============================================================================

/**
 * Calculate base risk score from processing history
 * @param {Array<Object|string>} history - Array of preset names or job objects
 * @returns {number} Base risk score
 */
function calculateBaseScore(history) {
  if (!history || history.length === 0) {
    return 0;
  }
  
  let score = 0;
  
  for (const entry of history) {
    const preset = typeof entry === 'string' ? entry : entry.preset;
    const category = getPresetCategory(preset);
    
    if (category) {
      score += getCategoryWeight(category);
    } else {
      // Unknown preset - apply default weight
      score += 10;
    }
  }
  
  return score;
}

/**
 * Calculate repeat penalty from category counts
 * @param {Object} categoryCounts - Category counts
 * @returns {number} Additional penalty score
 */
function calculateRepeatPenalty(categoryCounts) {
  let penalty = 0;
  
  for (const [category, count] of Object.entries(categoryCounts)) {
    if (count > 1) {
      const multiplier = getRepeatPenalty(category);
      const maxRecommended = THRESHOLDS.MAX_RECOMMENDED_PASSES[category] || 2;
      const excess = Math.max(0, count - maxRecommended);
      
      // Apply escalating penalty for excess passes
      penalty += excess * getCategoryWeight(category) * multiplier;
    }
  }
  
  return penalty;
}

/**
 * Calculate total risk score
 * @param {Array<Object|string>} history - Processing history
 * @param {Object} options - Calculation options
 * @returns {Object} Score breakdown
 */
function calculateRiskScore(history, options = {}) {
  const {
    accumulationScore = 0,  // From artifact accumulation tracker
    includeRepeatPenalty = true
  } = options;
  
  if (!history || history.length === 0) {
    return {
      totalScore: 0,
      baseScore: 0,
      repeatPenalty: 0,
      accumulationBonus: 0,
      passCount: 0,
      destructivePasses: 0
    };
  }
  
  const categoryCounts = countByCategory(history);
  const baseScore = calculateBaseScore(history);
  const repeatPenalty = includeRepeatPenalty ? calculateRepeatPenalty(categoryCounts) : 0;
  
  // Accumulation score adds directly (0-100 scale)
  const accumulationBonus = accumulationScore * 0.5;
  
  const totalScore = Math.min(100, baseScore + repeatPenalty + accumulationBonus);
  
  return {
    totalScore: Math.round(totalScore),
    baseScore: Math.round(baseScore),
    repeatPenalty: Math.round(repeatPenalty),
    accumulationBonus: Math.round(accumulationBonus),
    passCount: history.length,
    destructivePasses: countDestructivePasses(categoryCounts),
    categoryCounts
  };
}

/**
 * Classify risk level from score
 * @param {number} score - Risk score (0-100)
 * @returns {string} RiskLevel value
 */
function classifyRiskLevel(score) {
  if (score >= THRESHOLDS.RISK_SCORE.HIGH) {
    return RiskLevel.EXCESSIVE;
  }
  if (score >= THRESHOLDS.RISK_SCORE.MODERATE) {
    return RiskLevel.HIGH;
  }
  if (score >= THRESHOLDS.RISK_SCORE.LOW) {
    return RiskLevel.MODERATE;
  }
  if (score >= THRESHOLDS.RISK_SCORE.PRISTINE) {
    return RiskLevel.LOW;
  }
  return RiskLevel.PRISTINE;
}

/**
 * Calculate remaining processing headroom
 * @param {number} currentScore - Current risk score
 * @returns {Object} Headroom assessment
 */
function calculateHeadroom(currentScore) {
  const remaining = Math.max(0, 100 - currentScore);
  
  return {
    headroomPercent: remaining,
    canAddNormalization: remaining >= 10,
    canAddEQ: remaining >= 12,
    canAddDynamics: remaining >= 20,
    canAddMastering: remaining >= 25,
    canAddStereo: remaining >= 15,
    recommendation: remaining >= 50 ? 'Full processing flexibility available' :
                    remaining >= 30 ? 'Limited headroom - use conservative settings' :
                    remaining >= 15 ? 'Minimal headroom - essential operations only' :
                    'No processing headroom - quality will degrade'
  };
}

// ============================================================================
// Main Analysis Functions
// ============================================================================

/**
 * Calculate full risk assessment from processing history
 * @param {Array<Object|string>} history - Processing history (presets or job objects)
 * @param {Object} options - Assessment options
 * @returns {Object} Complete risk assessment
 */
function calculateRisk(history, options = {}) {
  const scoreBreakdown = calculateRiskScore(history, options);
  const riskLevel = classifyRiskLevel(scoreBreakdown.totalScore);
  const headroom = calculateHeadroom(scoreBreakdown.totalScore);
  const categoryCounts = scoreBreakdown.categoryCounts || countByCategory(history || []);
  
  // Find categories that exceed recommended limits
  const overLimitCategories = [];
  for (const [category, count] of Object.entries(categoryCounts)) {
    const max = THRESHOLDS.MAX_RECOMMENDED_PASSES[category];
    if (count > max) {
      overLimitCategories.push({
        category,
        count,
        maxRecommended: max,
        excess: count - max
      });
    }
  }
  
  // Generate warnings
  const warnings = [];
  if (overLimitCategories.length > 0) {
    for (const item of overLimitCategories) {
      warnings.push(
        `${item.category} processing applied ${item.count} times (recommended max: ${item.maxRecommended})`
      );
    }
  }
  
  if (riskLevel === RiskLevel.EXCESSIVE) {
    warnings.push('Processing capacity exhausted - additional transformations not recommended');
  } else if (riskLevel === RiskLevel.HIGH) {
    warnings.push('Heavy processing detected - limit additional transformations');
  }
  
  return {
    riskLevel,
    description: RISK_DESCRIPTIONS[riskLevel],
    score: scoreBreakdown.totalScore,
    scoreBreakdown,
    headroom,
    categoryCounts,
    overLimitCategories,
    warnings,
    canAddMoreProcessing: riskLevel !== RiskLevel.EXCESSIVE,
    passCount: scoreBreakdown.passCount,
    destructivePasses: scoreBreakdown.destructivePasses
  };
}

/**
 * Evaluate risk of adding a proposed job to existing history
 * @param {Array<Object|string>} history - Existing processing history
 * @param {string} proposedPreset - Preset to add
 * @param {Object} options - Evaluation options
 * @returns {Object} Evaluation result
 */
function evaluateProposedJob(history, proposedPreset, options = {}) {
  const currentRisk = calculateRisk(history, options);
  const proposedHistory = [...(history || []), proposedPreset];
  const proposedRisk = calculateRisk(proposedHistory, options);
  
  const proposedCategory = getPresetCategory(proposedPreset);
  const currentCategoryCount = currentRisk.categoryCounts[proposedCategory] || 0;
  const maxRecommended = THRESHOLDS.MAX_RECOMMENDED_PASSES[proposedCategory] || 2;
  
  const wouldExceedLimit = currentCategoryCount >= maxRecommended;
  const scoreIncrease = proposedRisk.score - currentRisk.score;
  const levelChange = currentRisk.riskLevel !== proposedRisk.riskLevel;
  
  // Determine if we should proceed
  const shouldProceed = proposedRisk.riskLevel !== RiskLevel.EXCESSIVE && 
                        !wouldExceedLimit;
  
  return {
    canProceed: shouldProceed,
    proposedPreset,
    proposedCategory,
    currentRisk: currentRisk.score,
    proposedRisk: proposedRisk.score,
    scoreIncrease,
    currentLevel: currentRisk.riskLevel,
    proposedLevel: proposedRisk.riskLevel,
    levelChange,
    wouldExceedLimit,
    currentCategoryCount,
    maxRecommended,
    recommendation: !shouldProceed 
      ? `Avoid ${proposedPreset} - would exceed processing limits`
      : levelChange 
        ? `${proposedPreset} will increase risk to ${proposedRisk.riskLevel}`
        : `${proposedPreset} can be safely applied`,
    proposedHeadroom: proposedRisk.headroom
  };
}

/**
 * Quick risk check
 * @param {Array<Object|string>} history - Processing history
 * @returns {Object} Quick check result
 */
function quickCheck(history) {
  const result = calculateRisk(history);
  
  return {
    riskLevel: result.riskLevel,
    score: result.score,
    passCount: result.passCount,
    destructivePasses: result.destructivePasses,
    canAddMoreProcessing: result.canAddMoreProcessing,
    headroomPercent: result.headroom.headroomPercent,
    warningCount: result.warnings.length,
    hasExcessiveRisk: result.riskLevel === RiskLevel.EXCESSIVE,
    hasHighRisk: result.riskLevel === RiskLevel.HIGH
  };
}

/**
 * Generate recommendations based on risk assessment
 * @param {Object} riskAssessment - Result from calculateRisk
 * @returns {Array<string>} Recommendations
 */
function generateRecommendations(riskAssessment) {
  const recommendations = [];
  
  if (!riskAssessment) return recommendations;
  
  const { riskLevel, overLimitCategories, headroom, categoryCounts } = riskAssessment;
  
  // Risk-level recommendations
  if (riskLevel === RiskLevel.EXCESSIVE) {
    recommendations.push('Do not apply additional processing - quality will degrade');
    recommendations.push('Consider requesting a less processed source if available');
  } else if (riskLevel === RiskLevel.HIGH) {
    recommendations.push('Limit additional transformations to essential operations only');
    recommendations.push('Use conservative settings for any remaining processing');
  } else if (riskLevel === RiskLevel.MODERATE) {
    recommendations.push('Moderate processing headroom available');
    recommendations.push('Avoid stacking multiple dynamics processors');
  }
  
  // Category-specific recommendations
  if (overLimitCategories && overLimitCategories.length > 0) {
    for (const item of overLimitCategories) {
      if (item.category === ProcessingCategory.MASTERING) {
        recommendations.push('Multiple mastering passes detected - consolidate to single stage');
      } else if (item.category === ProcessingCategory.DYNAMICS) {
        recommendations.push('Multiple dynamics processors detected - consider parallel processing');
      }
    }
  }
  
  // Headroom-based recommendations
  if (headroom) {
    if (!headroom.canAddMastering && headroom.canAddEQ) {
      recommendations.push('EQ adjustments still possible, but avoid additional limiting');
    }
    if (!headroom.canAddDynamics) {
      recommendations.push('No headroom for additional dynamics processing');
    }
  }
  
  return recommendations;
}

/**
 * Estimate processing pass count from audio metrics
 * @param {Object} metrics - Audio analysis metrics
 * @returns {Object} Estimated pass count
 */
function estimateFromMetrics(metrics) {
  if (!metrics) {
    return { estimatedPasses: 0, confidence: 0, method: 'no_data' };
  }
  
  const { crestFactorDb, flatFactor, phaseCoherence, accumulationScore } = metrics;
  
  // Use accumulation score if available
  if (typeof accumulationScore === 'number') {
    let passes;
    if (accumulationScore < 15) passes = 0;
    else if (accumulationScore < 30) passes = 1;
    else if (accumulationScore < 50) passes = 3;
    else if (accumulationScore < 75) passes = 5;
    else passes = 8;
    
    return {
      estimatedPasses: passes,
      confidence: 0.7,
      method: 'accumulation_score',
      accumulationScore
    };
  }
  
  // Fallback to crest factor estimation
  if (typeof crestFactorDb === 'number') {
    let passes;
    if (crestFactorDb > 14) passes = 0;
    else if (crestFactorDb > 10) passes = 1;
    else if (crestFactorDb > 7) passes = 3;
    else if (crestFactorDb > 5) passes = 5;
    else passes = 7;
    
    return {
      estimatedPasses: passes,
      confidence: 0.5,
      method: 'crest_factor',
      crestFactorDb
    };
  }
  
  return { estimatedPasses: 0, confidence: 0, method: 'insufficient_data' };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Main analysis functions
  calculateRisk,
  evaluateProposedJob,
  quickCheck,
  
  // Score calculation
  calculateRiskScore,
  calculateBaseScore,
  calculateRepeatPenalty,
  classifyRiskLevel,
  calculateHeadroom,
  
  // Utility functions
  getPresetCategory,
  getCategoryWeight,
  getRepeatPenalty,
  countByCategory,
  countDestructivePasses,
  
  // Recommendations
  generateRecommendations,
  estimateFromMetrics,
  
  // Constants
  RiskLevel,
  ProcessingCategory,
  RISK_DESCRIPTIONS,
  PRESET_CATEGORY_MAP,
  CATEGORY_WEIGHTS,
  REPEAT_PENALTIES,
  THRESHOLDS
};
