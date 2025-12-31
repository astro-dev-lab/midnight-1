/**
 * Parameter Interaction Conflict Detector
 * 
 * Detects conflicts between processing parameters that may cause
 * artifacts or contradict intended audio quality goals.
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Parameter validation prevents
 * conflicting transformations that would degrade asset quality.
 * 
 * Example conflicts:
 * - EQ boost + aggressive limiting → clipping on boosted frequencies
 * - Stereo widening + mono compatibility requirement → phase issues
 * - Heavy compression + dynamics preservation intent → contradictory
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Conflict severity levels
 */
const ConflictSeverity = Object.freeze({
  NONE: 'NONE',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  BLOCKING: 'BLOCKING'
});

/**
 * Conflict categories
 */
const ConflictCategory = Object.freeze({
  DYNAMICS: 'DYNAMICS',
  FREQUENCY: 'FREQUENCY',
  STEREO: 'STEREO',
  HEADROOM: 'HEADROOM',
  INTENT: 'INTENT',
  ACCUMULATION: 'ACCUMULATION'
});

/**
 * Parameter types that can be analyzed
 */
const ParameterType = Object.freeze({
  // Dynamics parameters
  COMPRESSION_RATIO: 'COMPRESSION_RATIO',
  COMPRESSION_THRESHOLD: 'COMPRESSION_THRESHOLD',
  LIMITER_THRESHOLD: 'LIMITER_THRESHOLD',
  LIMITER_CEILING: 'LIMITER_CEILING',
  TARGET_LOUDNESS: 'TARGET_LOUDNESS',
  
  // EQ parameters
  EQ_BOOST_MAX: 'EQ_BOOST_MAX',
  EQ_CUT_MAX: 'EQ_CUT_MAX',
  HIGH_SHELF_GAIN: 'HIGH_SHELF_GAIN',
  LOW_SHELF_GAIN: 'LOW_SHELF_GAIN',
  
  // Stereo parameters
  STEREO_WIDTH: 'STEREO_WIDTH',
  MID_SIDE_BALANCE: 'MID_SIDE_BALANCE',
  MONO_BASS_FREQ: 'MONO_BASS_FREQ',
  
  // Quality parameters
  SAMPLE_RATE: 'SAMPLE_RATE',
  BIT_DEPTH: 'BIT_DEPTH',
  
  // Intent flags
  PRESERVE_DYNAMICS: 'PRESERVE_DYNAMICS',
  MONO_COMPATIBLE: 'MONO_COMPATIBLE',
  REFERENCE_LOUDNESS: 'REFERENCE_LOUDNESS',
  MAXIMIZE_LOUDNESS: 'MAXIMIZE_LOUDNESS'
});

/**
 * Severity descriptions for UI
 */
const SEVERITY_DESCRIPTIONS = Object.freeze({
  [ConflictSeverity.NONE]: 'No conflicts detected',
  [ConflictSeverity.LOW]: 'Minor parameter interaction - may slightly affect quality',
  [ConflictSeverity.MEDIUM]: 'Moderate conflict - review parameter choices',
  [ConflictSeverity.HIGH]: 'Significant conflict - will likely cause artifacts',
  [ConflictSeverity.BLOCKING]: 'Critical conflict - cannot proceed without resolution'
});

/**
 * Conflict detection rules
 */
const CONFLICT_RULES = Object.freeze([
  // EQ + Limiting conflicts
  {
    id: 'EQ_BOOST_LIMITING',
    name: 'EQ Boost vs Limiting Headroom',
    category: ConflictCategory.HEADROOM,
    description: 'Aggressive EQ boost combined with heavy limiting causes clipping on boosted frequencies',
    conditions: {
      eqBoostMax: { operator: 'gt', value: 6 },
      limiterThreshold: { operator: 'gt', value: -3 }
    },
    getSeverity: (params) => {
      const boost = params.eqBoostMax || 0;
      const threshold = params.limiterThreshold || -6;
      if (boost > 12 && threshold > -2) return ConflictSeverity.BLOCKING;
      if (boost > 9 && threshold > -3) return ConflictSeverity.HIGH;
      if (boost > 6) return ConflictSeverity.MEDIUM;
      return ConflictSeverity.LOW;
    },
    recommendation: 'Reduce EQ boost or increase limiter headroom. Consider applying limiting after EQ adjustment.'
  },
  
  // Stereo widening + Mono compatibility
  {
    id: 'STEREO_MONO_CONFLICT',
    name: 'Stereo Width vs Mono Compatibility',
    category: ConflictCategory.STEREO,
    description: 'Wide stereo processing contradicts mono compatibility requirement',
    conditions: {
      stereoWidth: { operator: 'gt', value: 1.2 },
      monoCompatible: { operator: 'eq', value: true }
    },
    getSeverity: (params) => {
      const width = params.stereoWidth || 1.0;
      if (width > 1.8) return ConflictSeverity.BLOCKING;
      if (width > 1.5) return ConflictSeverity.HIGH;
      if (width > 1.2) return ConflictSeverity.MEDIUM;
      return ConflictSeverity.LOW;
    },
    recommendation: 'Reduce stereo width or remove mono compatibility requirement. Use M/S processing with mono-safe side content.'
  },
  
  // Compression + Dynamics preservation
  {
    id: 'COMPRESSION_DYNAMICS_CONFLICT',
    name: 'Heavy Compression vs Dynamics Preservation',
    category: ConflictCategory.DYNAMICS,
    description: 'Heavy compression ratio contradicts dynamics preservation intent',
    conditions: {
      compressionRatio: { operator: 'gt', value: 6 },
      preserveDynamics: { operator: 'eq', value: true }
    },
    getSeverity: (params) => {
      const ratio = params.compressionRatio || 1;
      if (ratio > 20) return ConflictSeverity.BLOCKING;
      if (ratio > 10) return ConflictSeverity.HIGH;
      if (ratio > 6) return ConflictSeverity.MEDIUM;
      return ConflictSeverity.LOW;
    },
    recommendation: 'Use lower compression ratio (< 4:1) or disable dynamics preservation. Consider parallel compression.'
  },
  
  // Loudness maximization + Dynamics preservation
  {
    id: 'LOUDNESS_DYNAMICS_CONFLICT',
    name: 'Loudness Maximization vs Dynamics Preservation',
    category: ConflictCategory.INTENT,
    description: 'Maximizing loudness inherently reduces dynamic range',
    conditions: {
      maximizeLoudness: { operator: 'eq', value: true },
      preserveDynamics: { operator: 'eq', value: true }
    },
    getSeverity: () => ConflictSeverity.HIGH,
    recommendation: 'Choose one goal: either maximize loudness OR preserve dynamics. Cannot achieve both.'
  },
  
  // Aggressive limiting + Low threshold
  {
    id: 'LIMITING_THRESHOLD_CEILING',
    name: 'Limiter Threshold vs Ceiling Gap',
    category: ConflictCategory.HEADROOM,
    description: 'Insufficient gap between limiter threshold and ceiling causes distortion',
    conditions: {
      limiterThreshold: { operator: 'customGap', value: 3 }
    },
    getSeverity: (params) => {
      const threshold = params.limiterThreshold || -6;
      const ceiling = params.limiterCeiling || -0.3;
      const gap = Math.abs(threshold - ceiling);
      if (gap < 1) return ConflictSeverity.BLOCKING;
      if (gap < 2) return ConflictSeverity.HIGH;
      if (gap < 3) return ConflictSeverity.MEDIUM;
      return ConflictSeverity.LOW;
    },
    recommendation: 'Increase gap between limiter threshold and ceiling. Aim for at least 3 dB gap for transparent limiting.'
  },
  
  // High-frequency boost + Codec encoding
  {
    id: 'HF_BOOST_CODEC_CONFLICT',
    name: 'HF Boost vs Lossy Codec',
    category: ConflictCategory.FREQUENCY,
    description: 'High-frequency boost exacerbates lossy codec artifacts',
    conditions: {
      highShelfGain: { operator: 'gt', value: 3 },
      targetFormat: { operator: 'in', value: ['mp3', 'aac', 'ogg'] }
    },
    getSeverity: (params) => {
      const gain = params.highShelfGain || 0;
      if (gain > 6) return ConflictSeverity.HIGH;
      if (gain > 3) return ConflictSeverity.MEDIUM;
      return ConflictSeverity.LOW;
    },
    recommendation: 'Reduce high-frequency boost before lossy encoding. HF content is most affected by codec compression.'
  },
  
  // Low bass + Small speaker target
  {
    id: 'BASS_SMALL_SPEAKER_CONFLICT',
    name: 'Sub-bass vs Small Speaker Target',
    category: ConflictCategory.FREQUENCY,
    description: 'Sub-bass emphasis is inaudible on target small speakers',
    conditions: {
      lowShelfGain: { operator: 'gt', value: 3 },
      lowShelfFreq: { operator: 'lt', value: 80 },
      targetSmallSpeakers: { operator: 'eq', value: true }
    },
    getSeverity: (params) => {
      const gain = params.lowShelfGain || 0;
      const freq = params.lowShelfFreq || 100;
      if (freq < 60 && gain > 6) return ConflictSeverity.HIGH;
      if (freq < 80 && gain > 3) return ConflictSeverity.MEDIUM;
      return ConflictSeverity.LOW;
    },
    recommendation: 'Shift bass emphasis to 100-200Hz range for small speaker audibility, or remove small speaker target.'
  },
  
  // Sample rate conversion + Quality loss
  {
    id: 'SAMPLE_RATE_DOWNCONVERT',
    name: 'Sample Rate Downconversion Quality',
    category: ConflictCategory.ACCUMULATION,
    description: 'Multiple sample rate conversions accumulate quality loss',
    conditions: {
      sampleRateConversions: { operator: 'gt', value: 1 }
    },
    getSeverity: (params) => {
      const conversions = params.sampleRateConversions || 0;
      if (conversions > 3) return ConflictSeverity.HIGH;
      if (conversions > 2) return ConflictSeverity.MEDIUM;
      if (conversions > 1) return ConflictSeverity.LOW;
      return ConflictSeverity.NONE;
    },
    recommendation: 'Minimize sample rate conversions. Convert once at the final stage of processing.'
  },
  
  // Bit depth reduction + Dynamics processing
  {
    id: 'BIT_DEPTH_DYNAMICS',
    name: 'Bit Depth Reduction vs Dynamic Content',
    category: ConflictCategory.DYNAMICS,
    description: 'Reducing bit depth on highly dynamic content may cause quantization noise',
    conditions: {
      targetBitDepth: { operator: 'lt', value: 24 },
      dynamicRange: { operator: 'gt', value: 20 }
    },
    getSeverity: (params) => {
      const bitDepth = params.targetBitDepth || 24;
      const dynamicRange = params.dynamicRange || 10;
      if (bitDepth <= 16 && dynamicRange > 30) return ConflictSeverity.HIGH;
      if (bitDepth <= 16 && dynamicRange > 20) return ConflictSeverity.MEDIUM;
      return ConflictSeverity.LOW;
    },
    recommendation: 'Apply dithering when reducing bit depth. Consider noise-shaped dither for high dynamic range content.'
  },
  
  // Multiple limiters stacked
  {
    id: 'STACKED_LIMITERS',
    name: 'Stacked Limiters',
    category: ConflictCategory.ACCUMULATION,
    description: 'Multiple limiting stages cause cumulative distortion',
    conditions: {
      limiterCount: { operator: 'gt', value: 1 }
    },
    getSeverity: (params) => {
      const count = params.limiterCount || 0;
      if (count > 3) return ConflictSeverity.BLOCKING;
      if (count > 2) return ConflictSeverity.HIGH;
      if (count > 1) return ConflictSeverity.MEDIUM;
      return ConflictSeverity.NONE;
    },
    recommendation: 'Consolidate to single limiting stage. If multiple stages needed, use gentle settings on each.'
  }
]);

/**
 * Thresholds for parameter analysis
 */
const THRESHOLDS = Object.freeze({
  EQ_BOOST: {
    SAFE: 3,
    MODERATE: 6,
    AGGRESSIVE: 9,
    EXTREME: 12
  },
  COMPRESSION_RATIO: {
    GENTLE: 2,
    MODERATE: 4,
    HEAVY: 8,
    LIMITING: 20
  },
  STEREO_WIDTH: {
    NARROW: 0.5,
    NORMAL: 1.0,
    WIDE: 1.3,
    EXTREME: 1.8
  },
  LIMITER_THRESHOLD: {
    GENTLE: -6,
    MODERATE: -3,
    AGGRESSIVE: -1,
    EXTREME: 0
  }
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Evaluate a condition against parameters
 * @param {Object} condition - Condition to evaluate
 * @param {Object} params - Parameters to check
 * @param {string} paramKey - Parameter key to check
 * @returns {boolean} Whether condition is met
 */
function evaluateCondition(condition, params, paramKey) {
  const value = params[paramKey];
  
  if (value === undefined || value === null) {
    return false;
  }
  
  switch (condition.operator) {
    case 'gt':
      return value > condition.value;
    case 'gte':
      return value >= condition.value;
    case 'lt':
      return value < condition.value;
    case 'lte':
      return value <= condition.value;
    case 'eq':
      return value === condition.value;
    case 'neq':
      return value !== condition.value;
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(value);
    case 'customGap':
      // Special case for threshold/ceiling gap
      return true; // Let getSeverity handle the logic
    default:
      return false;
  }
}

/**
 * Check if all conditions in a rule are met
 * @param {Object} rule - Conflict rule
 * @param {Object} params - Parameters to check
 * @returns {boolean} Whether all conditions are met
 */
function checkRuleConditions(rule, params) {
  for (const [paramKey, condition] of Object.entries(rule.conditions)) {
    if (!evaluateCondition(condition, params, paramKey)) {
      return false;
    }
  }
  return true;
}

/**
 * Normalize parameter names to standard keys
 * @param {Object} params - Raw parameters
 * @returns {Object} Normalized parameters
 */
function normalizeParameters(params) {
  if (!params) return {};
  
  const normalized = { ...params };
  
  // Normalize common aliases
  const aliases = {
    'eq_boost': 'eqBoostMax',
    'eqBoost': 'eqBoostMax',
    'boost': 'eqBoostMax',
    'limiter_threshold': 'limiterThreshold',
    'threshold': 'limiterThreshold',
    'stereo_width': 'stereoWidth',
    'width': 'stereoWidth',
    'compression_ratio': 'compressionRatio',
    'ratio': 'compressionRatio',
    'mono_compatible': 'monoCompatible',
    'mono': 'monoCompatible',
    'preserve_dynamics': 'preserveDynamics',
    'dynamic': 'preserveDynamics',
    'maximize_loudness': 'maximizeLoudness',
    'loudness_max': 'maximizeLoudness',
    'limiter_ceiling': 'limiterCeiling',
    'ceiling': 'limiterCeiling',
    'target_format': 'targetFormat',
    'format': 'targetFormat',
    'high_shelf_gain': 'highShelfGain',
    'hfGain': 'highShelfGain',
    'low_shelf_gain': 'lowShelfGain',
    'lfGain': 'lowShelfGain',
    'target_bit_depth': 'targetBitDepth',
    'bitDepth': 'targetBitDepth'
  };
  
  for (const [alias, standard] of Object.entries(aliases)) {
    if (alias in params && !(standard in normalized)) {
      normalized[standard] = params[alias];
    }
  }
  
  return normalized;
}

// ============================================================================
// Detection Functions
// ============================================================================

/**
 * Detect conflicts in parameter set
 * @param {Object} params - Processing parameters
 * @param {Object} options - Detection options
 * @returns {Array<Object>} Detected conflicts
 */
function detectConflicts(params, options = {}) {
  const normalizedParams = normalizeParameters(params);
  const conflicts = [];
  
  for (const rule of CONFLICT_RULES) {
    // Check if conditions are met
    if (!checkRuleConditions(rule, normalizedParams)) {
      continue;
    }
    
    // Get severity
    const severity = rule.getSeverity(normalizedParams);
    
    if (severity === ConflictSeverity.NONE) {
      continue;
    }
    
    conflicts.push({
      ruleId: rule.id,
      name: rule.name,
      category: rule.category,
      severity,
      description: rule.description,
      recommendation: rule.recommendation,
      affectedParams: Object.keys(rule.conditions)
    });
  }
  
  // Sort by severity (most severe first)
  const severityOrder = {
    [ConflictSeverity.BLOCKING]: 0,
    [ConflictSeverity.HIGH]: 1,
    [ConflictSeverity.MEDIUM]: 2,
    [ConflictSeverity.LOW]: 3,
    [ConflictSeverity.NONE]: 4
  };
  
  conflicts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  
  return conflicts;
}

/**
 * Detect conflicts between current analysis and proposed parameters
 * @param {Object} currentAnalysis - Current audio analysis metrics
 * @param {Object} proposedParams - Proposed processing parameters
 * @param {Object} presetIntent - Optional preset intent constraints
 * @returns {Object} Conflict detection result
 */
function detectParameterConflicts(currentAnalysis, proposedParams, presetIntent = {}) {
  // Merge current state with proposed changes
  const mergedParams = {
    ...currentAnalysis,
    ...proposedParams,
    ...presetIntent
  };
  
  const conflicts = detectConflicts(mergedParams);
  
  // Categorize conflicts
  const byCategory = {};
  for (const conflict of conflicts) {
    if (!byCategory[conflict.category]) {
      byCategory[conflict.category] = [];
    }
    byCategory[conflict.category].push(conflict);
  }
  
  // Determine overall status
  const hasBlocking = conflicts.some(c => c.severity === ConflictSeverity.BLOCKING);
  const hasHigh = conflicts.some(c => c.severity === ConflictSeverity.HIGH);
  
  return {
    conflicts,
    conflictCount: conflicts.length,
    byCategory,
    hasBlockingConflict: hasBlocking,
    hasHighConflict: hasHigh,
    canProceed: !hasBlocking,
    overallSeverity: hasBlocking ? ConflictSeverity.BLOCKING :
                     hasHigh ? ConflictSeverity.HIGH :
                     conflicts.length > 0 ? ConflictSeverity.MEDIUM :
                     ConflictSeverity.NONE,
    recommendations: conflicts.map(c => c.recommendation)
  };
}

/**
 * Check a specific parameter combination for conflicts
 * @param {string} param1Key - First parameter key
 * @param {*} param1Value - First parameter value
 * @param {string} param2Key - Second parameter key
 * @param {*} param2Value - Second parameter value
 * @returns {Object|null} Conflict if found, null otherwise
 */
function checkPairConflict(param1Key, param1Value, param2Key, param2Value) {
  const params = {
    [param1Key]: param1Value,
    [param2Key]: param2Value
  };
  
  const conflicts = detectConflicts(params);
  return conflicts.length > 0 ? conflicts[0] : null;
}

/**
 * Get all rules that apply to a specific parameter
 * @param {string} paramKey - Parameter key
 * @returns {Array<Object>} Applicable rules
 */
function getRulesForParameter(paramKey) {
  return CONFLICT_RULES.filter(rule => 
    Object.keys(rule.conditions).includes(paramKey)
  );
}

/**
 * Validate a complete parameter set
 * @param {Object} params - All processing parameters
 * @returns {Object} Validation result
 */
function validateParameters(params) {
  const result = detectParameterConflicts(params, {}, {});
  
  return {
    isValid: result.conflictCount === 0,
    hasWarnings: result.conflictCount > 0 && !result.hasBlockingConflict,
    hasErrors: result.hasBlockingConflict || result.hasHighConflict,
    ...result
  };
}

/**
 * Quick conflict check
 * @param {Object} params - Parameters to check
 * @returns {Object} Quick check result
 */
function quickCheck(params) {
  const conflicts = detectConflicts(params);
  
  return {
    hasConflicts: conflicts.length > 0,
    conflictCount: conflicts.length,
    blockingCount: conflicts.filter(c => c.severity === ConflictSeverity.BLOCKING).length,
    highCount: conflicts.filter(c => c.severity === ConflictSeverity.HIGH).length,
    mediumCount: conflicts.filter(c => c.severity === ConflictSeverity.MEDIUM).length,
    lowCount: conflicts.filter(c => c.severity === ConflictSeverity.LOW).length,
    canProceed: !conflicts.some(c => c.severity === ConflictSeverity.BLOCKING),
    topConflict: conflicts[0] || null
  };
}

/**
 * Generate recommendations for resolving conflicts
 * @param {Array<Object>} conflicts - Detected conflicts
 * @returns {Array<string>} Prioritized recommendations
 */
function generateRecommendations(conflicts) {
  if (!conflicts || conflicts.length === 0) {
    return [];
  }
  
  const recommendations = [];
  
  // Group by category for organized recommendations
  const byCategory = {};
  for (const conflict of conflicts) {
    if (!byCategory[conflict.category]) {
      byCategory[conflict.category] = [];
    }
    byCategory[conflict.category].push(conflict);
  }
  
  // Add category headers and recommendations
  for (const [category, categoryConflicts] of Object.entries(byCategory)) {
    if (categoryConflicts.some(c => c.severity === ConflictSeverity.BLOCKING)) {
      recommendations.push(`BLOCKING ${category} conflicts must be resolved:`);
    } else if (categoryConflicts.some(c => c.severity === ConflictSeverity.HIGH)) {
      recommendations.push(`Review ${category} parameters:`);
    }
    
    for (const conflict of categoryConflicts) {
      recommendations.push(`  - ${conflict.recommendation}`);
    }
  }
  
  return recommendations;
}

/**
 * Suggest parameter adjustments to resolve conflicts
 * @param {Object} params - Current parameters
 * @param {Array<Object>} conflicts - Detected conflicts
 * @returns {Object} Suggested parameter changes
 */
function suggestResolutions(params, conflicts) {
  const suggestions = {};
  
  for (const conflict of conflicts) {
    switch (conflict.ruleId) {
      case 'EQ_BOOST_LIMITING':
        if (params.eqBoostMax > 6) {
          suggestions.eqBoostMax = 6;
        }
        if (params.limiterThreshold > -6) {
          suggestions.limiterThreshold = -6;
        }
        break;
        
      case 'STEREO_MONO_CONFLICT':
        if (params.stereoWidth > 1.2) {
          suggestions.stereoWidth = 1.0;
        }
        break;
        
      case 'COMPRESSION_DYNAMICS_CONFLICT':
        if (params.compressionRatio > 6) {
          suggestions.compressionRatio = 4;
        }
        break;
        
      case 'LOUDNESS_DYNAMICS_CONFLICT':
        suggestions.note = 'Choose either maximizeLoudness OR preserveDynamics, not both';
        break;
        
      case 'STACKED_LIMITERS':
        suggestions.limiterCount = 1;
        break;
    }
  }
  
  return {
    suggestions,
    hasSuggestions: Object.keys(suggestions).length > 0,
    originalParams: params,
    resolvedConflictCount: conflicts.filter(c => 
      Object.keys(suggestions).some(k => c.affectedParams.includes(k))
    ).length
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Main detection functions
  detectConflicts,
  detectParameterConflicts,
  validateParameters,
  quickCheck,
  
  // Utility functions
  checkPairConflict,
  getRulesForParameter,
  normalizeParameters,
  evaluateCondition,
  checkRuleConditions,
  
  // Recommendation functions
  generateRecommendations,
  suggestResolutions,
  
  // Constants
  ConflictSeverity,
  ConflictCategory,
  ParameterType,
  CONFLICT_RULES,
  THRESHOLDS,
  SEVERITY_DESCRIPTIONS
};
