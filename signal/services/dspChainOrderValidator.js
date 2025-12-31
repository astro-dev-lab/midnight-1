/**
 * DSP Chain Order Validator
 * 
 * Ensures audio transformations occur in a safe and optimal sequence.
 * Validates that processing stages follow the recommended order to
 * prevent artifacts and maintain signal integrity.
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Processing chains must follow
 * established best practices for professional audio workflows.
 * 
 * Recommended Order:
 * 1. ANALYSIS - Measurement only, no modification
 * 2. RESTORATION - Noise reduction, de-click, de-clip
 * 3. GAIN_STAGING - Normalization, gain adjustment
 * 4. EQ - Frequency correction
 * 5. DYNAMICS - Compression, expansion
 * 6. LIMITING - Peak limiting, loudness maximization
 * 7. STEREO - Widening, M/S processing
 * 8. DITHER - Bit depth reduction dithering
 * 9. FORMAT_CONVERSION - Sample rate, format changes
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * DSP processing stages in recommended order
 */
const DSPStage = Object.freeze({
  ANALYSIS: 'ANALYSIS',
  RESTORATION: 'RESTORATION',
  GAIN_STAGING: 'GAIN_STAGING',
  EQ: 'EQ',
  DYNAMICS: 'DYNAMICS',
  LIMITING: 'LIMITING',
  STEREO: 'STEREO',
  DITHER: 'DITHER',
  FORMAT_CONVERSION: 'FORMAT_CONVERSION'
});

/**
 * Validation result status
 */
const ValidationStatus = Object.freeze({
  VALID: 'VALID',
  WARNING: 'WARNING',
  INVALID: 'INVALID'
});

/**
 * Violation severity levels
 */
const ViolationSeverity = Object.freeze({
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL'
});

/**
 * Safe processing order (index determines sequence)
 */
const SAFE_ORDER = Object.freeze([
  DSPStage.ANALYSIS,
  DSPStage.RESTORATION,
  DSPStage.GAIN_STAGING,
  DSPStage.EQ,
  DSPStage.DYNAMICS,
  DSPStage.LIMITING,
  DSPStage.STEREO,
  DSPStage.DITHER,
  DSPStage.FORMAT_CONVERSION
]);

/**
 * Map preset names to their primary DSP stage
 */
const PRESET_TO_STAGE = Object.freeze({
  // Analysis presets
  'analyze-full': DSPStage.ANALYSIS,
  'analyze-loudness': DSPStage.ANALYSIS,
  'analyze-spectrum': DSPStage.ANALYSIS,
  'analyze-dynamics': DSPStage.ANALYSIS,
  
  // Restoration presets
  'restore-declip': DSPStage.RESTORATION,
  'restore-denoise': DSPStage.RESTORATION,
  'restore-declick': DSPStage.RESTORATION,
  
  // Gain staging presets
  'normalize-peak': DSPStage.GAIN_STAGING,
  'normalize-loudness': DSPStage.GAIN_STAGING,
  'normalize-rms': DSPStage.GAIN_STAGING,
  'gain-adjust': DSPStage.GAIN_STAGING,
  
  // EQ presets
  'eq-correct': DSPStage.EQ,
  'eq-enhance': DSPStage.EQ,
  'eq-surgical': DSPStage.EQ,
  
  // Dynamics presets
  'compress-gentle': DSPStage.DYNAMICS,
  'compress-medium': DSPStage.DYNAMICS,
  'compress-heavy': DSPStage.DYNAMICS,
  'expand-gentle': DSPStage.DYNAMICS,
  
  // Limiting/Mastering presets
  'master-standard': DSPStage.LIMITING,
  'master-streaming': DSPStage.LIMITING,
  'master-broadcast': DSPStage.LIMITING,
  'master-vinyl': DSPStage.LIMITING,
  'limit-peak': DSPStage.LIMITING,
  'limit-loudness': DSPStage.LIMITING,
  
  // Stereo presets
  'stereo-widen': DSPStage.STEREO,
  'stereo-narrow': DSPStage.STEREO,
  'stereo-ms-encode': DSPStage.STEREO,
  'stereo-ms-decode': DSPStage.STEREO,
  'mono-fold': DSPStage.STEREO,
  
  // Dither presets
  'dither-16bit': DSPStage.DITHER,
  'dither-24bit': DSPStage.DITHER,
  
  // Format conversion presets
  'convert-wav': DSPStage.FORMAT_CONVERSION,
  'convert-mp3': DSPStage.FORMAT_CONVERSION,
  'convert-flac': DSPStage.FORMAT_CONVERSION,
  'convert-aac': DSPStage.FORMAT_CONVERSION,
  'resample-44100': DSPStage.FORMAT_CONVERSION,
  'resample-48000': DSPStage.FORMAT_CONVERSION,
  'resample-96000': DSPStage.FORMAT_CONVERSION
});

/**
 * Stages that can be repeated without issues
 */
const REPEATABLE_STAGES = Object.freeze([
  DSPStage.ANALYSIS,
  DSPStage.EQ
]);

/**
 * Stages that should generally not be repeated
 */
const NON_REPEATABLE_STAGES = Object.freeze([
  DSPStage.LIMITING,
  DSPStage.DITHER,
  DSPStage.FORMAT_CONVERSION
]);

/**
 * Known problematic stage sequences
 */
const PROBLEMATIC_SEQUENCES = Object.freeze([
  {
    before: DSPStage.LIMITING,
    after: DSPStage.DYNAMICS,
    severity: ViolationSeverity.ERROR,
    reason: 'Compression after limiting destroys headroom and causes artifacts'
  },
  {
    before: DSPStage.LIMITING,
    after: DSPStage.EQ,
    severity: ViolationSeverity.WARNING,
    reason: 'EQ after limiting may cause clipping on boosted frequencies'
  },
  {
    before: DSPStage.DITHER,
    after: DSPStage.DYNAMICS,
    severity: ViolationSeverity.CRITICAL,
    reason: 'Dynamics processing after dithering amplifies dither noise'
  },
  {
    before: DSPStage.DITHER,
    after: DSPStage.LIMITING,
    severity: ViolationSeverity.CRITICAL,
    reason: 'Limiting after dithering removes dither randomization benefits'
  },
  {
    before: DSPStage.FORMAT_CONVERSION,
    after: DSPStage.LIMITING,
    severity: ViolationSeverity.ERROR,
    reason: 'Limiting after format conversion may exceed codec limits'
  },
  {
    before: DSPStage.STEREO,
    after: DSPStage.LIMITING,
    severity: ViolationSeverity.WARNING,
    reason: 'Limiting after stereo widening may cause inter-sample peaks'
  }
]);

/**
 * Status descriptions for UI
 */
const STATUS_DESCRIPTIONS = Object.freeze({
  [ValidationStatus.VALID]: 'Processing chain follows recommended order',
  [ValidationStatus.WARNING]: 'Processing chain has minor order issues that may affect quality',
  [ValidationStatus.INVALID]: 'Processing chain has critical order violations that will cause artifacts'
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the order index for a DSP stage
 * @param {string} stage - DSPStage value
 * @returns {number} Order index (-1 if unknown)
 */
function getStageOrder(stage) {
  return SAFE_ORDER.indexOf(stage);
}

/**
 * Get the DSP stage for a preset
 * @param {string} presetName - Preset name
 * @returns {string|null} DSPStage value or null if unknown
 */
function getPresetStage(presetName) {
  return PRESET_TO_STAGE[presetName] || null;
}

/**
 * Check if a stage is repeatable
 * @param {string} stage - DSPStage value
 * @returns {boolean}
 */
function isRepeatableStage(stage) {
  return REPEATABLE_STAGES.includes(stage);
}

/**
 * Check if a stage should not be repeated
 * @param {string} stage - DSPStage value
 * @returns {boolean}
 */
function isNonRepeatableStage(stage) {
  return NON_REPEATABLE_STAGES.includes(stage);
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Find problematic sequence patterns in a stage list
 * @param {Array<string>} stages - Ordered list of DSPStage values
 * @returns {Array<Object>} Found problematic sequences
 */
function findProblematicSequences(stages) {
  const problems = [];
  
  for (let i = 0; i < stages.length - 1; i++) {
    const currentStage = stages[i];
    
    // Check all subsequent stages for problems
    for (let j = i + 1; j < stages.length; j++) {
      const laterStage = stages[j];
      
      // Find matching problematic sequence
      const problem = PROBLEMATIC_SEQUENCES.find(
        seq => seq.before === currentStage && seq.after === laterStage
      );
      
      if (problem) {
        problems.push({
          ...problem,
          beforeIndex: i,
          afterIndex: j,
          beforeStage: currentStage,
          afterStage: laterStage
        });
      }
    }
  }
  
  return problems;
}

/**
 * Find out-of-order stages
 * @param {Array<string>} stages - Ordered list of DSPStage values
 * @returns {Array<Object>} Out-of-order violations
 */
function findOutOfOrderStages(stages) {
  const violations = [];
  let maxOrderSeen = -1;
  
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const order = getStageOrder(stage);
    
    if (order === -1) {
      // Unknown stage - skip
      continue;
    }
    
    if (order < maxOrderSeen) {
      // This stage should have come earlier
      violations.push({
        stage,
        index: i,
        expectedBefore: SAFE_ORDER[maxOrderSeen],
        severity: ViolationSeverity.WARNING,
        reason: `${stage} typically occurs before ${SAFE_ORDER[maxOrderSeen]} in the processing chain`
      });
    } else {
      maxOrderSeen = order;
    }
  }
  
  return violations;
}

/**
 * Find repeated non-repeatable stages
 * @param {Array<string>} stages - Ordered list of DSPStage values
 * @returns {Array<Object>} Repeat violations
 */
function findRepeatViolations(stages) {
  const violations = [];
  const stageCounts = {};
  
  for (const stage of stages) {
    stageCounts[stage] = (stageCounts[stage] || 0) + 1;
  }
  
  for (const [stage, count] of Object.entries(stageCounts)) {
    if (count > 1 && isNonRepeatableStage(stage)) {
      violations.push({
        stage,
        count,
        severity: stage === DSPStage.DITHER ? ViolationSeverity.CRITICAL : ViolationSeverity.ERROR,
        reason: `${stage} should not be applied ${count} times - causes cumulative degradation`
      });
    }
  }
  
  return violations;
}

/**
 * Validate a sequence of DSP stages
 * @param {Array<string>} stages - Ordered list of DSPStage values
 * @returns {Object} Validation result
 */
function validateStageSequence(stages) {
  if (!stages || !Array.isArray(stages) || stages.length === 0) {
    return {
      status: ValidationStatus.VALID,
      description: 'Empty processing chain is valid',
      violations: [],
      recommendations: []
    };
  }
  
  const allViolations = [];
  
  // Check for problematic sequences
  const problematicSequences = findProblematicSequences(stages);
  allViolations.push(...problematicSequences.map(p => ({
    type: 'PROBLEMATIC_SEQUENCE',
    ...p
  })));
  
  // Check for out-of-order stages
  const outOfOrder = findOutOfOrderStages(stages);
  allViolations.push(...outOfOrder.map(o => ({
    type: 'OUT_OF_ORDER',
    ...o
  })));
  
  // Check for repeated non-repeatable stages
  const repeatViolations = findRepeatViolations(stages);
  allViolations.push(...repeatViolations.map(r => ({
    type: 'REPEAT_VIOLATION',
    ...r
  })));
  
  // Determine overall status
  let status = ValidationStatus.VALID;
  if (allViolations.some(v => v.severity === ViolationSeverity.CRITICAL)) {
    status = ValidationStatus.INVALID;
  } else if (allViolations.some(v => v.severity === ViolationSeverity.ERROR)) {
    status = ValidationStatus.INVALID;
  } else if (allViolations.some(v => v.severity === ViolationSeverity.WARNING)) {
    status = ValidationStatus.WARNING;
  }
  
  // Generate recommendations
  const recommendations = generateRecommendations(stages, allViolations);
  
  return {
    status,
    description: STATUS_DESCRIPTIONS[status],
    violations: allViolations,
    recommendations,
    stageCount: stages.length,
    uniqueStages: [...new Set(stages)]
  };
}

/**
 * Validate a sequence of preset names
 * @param {Array<string>} presetNames - Ordered list of preset names
 * @returns {Object} Validation result
 */
function validatePresetSequence(presetNames) {
  if (!presetNames || !Array.isArray(presetNames) || presetNames.length === 0) {
    return {
      status: ValidationStatus.VALID,
      description: 'Empty preset sequence is valid',
      violations: [],
      recommendations: [],
      presets: []
    };
  }
  
  // Map presets to stages
  const stages = [];
  const unknownPresets = [];
  
  for (const preset of presetNames) {
    const stage = getPresetStage(preset);
    if (stage) {
      stages.push(stage);
    } else {
      unknownPresets.push(preset);
    }
  }
  
  // Validate the stages
  const result = validateStageSequence(stages);
  
  // Add unknown preset warnings
  if (unknownPresets.length > 0) {
    result.violations.push({
      type: 'UNKNOWN_PRESET',
      severity: ViolationSeverity.INFO,
      presets: unknownPresets,
      reason: `Unknown presets cannot be validated: ${unknownPresets.join(', ')}`
    });
  }
  
  result.presets = presetNames;
  result.mappedStages = stages;
  
  return result;
}

/**
 * Validate adding a proposed preset to existing history
 * @param {Array<string>} existingPresets - Already applied preset names
 * @param {string} proposedPreset - Preset to add
 * @returns {Object} Validation result for the proposed addition
 */
function validateProposedPreset(existingPresets, proposedPreset) {
  const existing = existingPresets || [];
  const proposed = [...existing, proposedPreset];
  
  // Validate the combined sequence
  const fullResult = validatePresetSequence(proposed);
  
  // Check if the proposed preset specifically causes issues
  const proposedStage = getPresetStage(proposedPreset);
  const existingStages = existing.map(p => getPresetStage(p)).filter(Boolean);
  
  // Find violations that involve the proposed stage
  const newViolations = fullResult.violations.filter(v => {
    if (v.type === 'PROBLEMATIC_SEQUENCE' && v.afterStage === proposedStage) {
      return true;
    }
    if (v.type === 'OUT_OF_ORDER' && v.stage === proposedStage) {
      return true;
    }
    if (v.type === 'REPEAT_VIOLATION' && v.stage === proposedStage) {
      return true;
    }
    return false;
  });
  
  // Determine if we can proceed
  const canProceed = !newViolations.some(v => 
    v.severity === ViolationSeverity.CRITICAL || 
    v.severity === ViolationSeverity.ERROR
  );
  
  return {
    canProceed,
    proposedPreset,
    proposedStage,
    existingStages,
    status: fullResult.status,
    newViolations,
    allViolations: fullResult.violations,
    recommendations: fullResult.recommendations,
    description: canProceed 
      ? `${proposedPreset} can be safely added to the processing chain`
      : `${proposedPreset} would cause processing chain violations`
  };
}

/**
 * Get the recommended next stages after a given stage
 * @param {string} currentStage - Current DSPStage
 * @returns {Array<string>} Recommended next stages
 */
function getRecommendedNextStages(currentStage) {
  const currentOrder = getStageOrder(currentStage);
  if (currentOrder === -1) {
    return [...SAFE_ORDER]; // All stages are valid if current is unknown
  }
  
  // Return stages that come after or at the same position
  return SAFE_ORDER.slice(currentOrder);
}

/**
 * Generate recommendations based on violations
 * @param {Array<string>} stages - Current stages
 * @param {Array<Object>} violations - Found violations
 * @returns {Array<string>} Recommendations
 */
function generateRecommendations(stages, violations) {
  const recommendations = [];
  
  if (violations.length === 0) {
    return recommendations;
  }
  
  // Check for critical issues first
  const criticalViolations = violations.filter(v => v.severity === ViolationSeverity.CRITICAL);
  if (criticalViolations.length > 0) {
    recommendations.push('CRITICAL: Processing chain has severe issues that will cause significant quality degradation');
    for (const v of criticalViolations) {
      if (v.type === 'REPEAT_VIOLATION') {
        recommendations.push(`Remove duplicate ${v.stage} stages - only apply once at the end of the chain`);
      } else {
        recommendations.push(`Reorder chain: ${v.reason}`);
      }
    }
  }
  
  // Check for error-level issues
  const errorViolations = violations.filter(v => v.severity === ViolationSeverity.ERROR);
  for (const v of errorViolations) {
    if (v.type === 'PROBLEMATIC_SEQUENCE') {
      recommendations.push(`Move ${v.afterStage} before ${v.beforeStage} to prevent artifacts`);
    } else if (v.type === 'REPEAT_VIOLATION') {
      recommendations.push(`Consolidate ${v.count} ${v.stage} operations into a single stage`);
    }
  }
  
  // Check for warnings
  const warningViolations = violations.filter(v => v.severity === ViolationSeverity.WARNING);
  for (const v of warningViolations) {
    if (v.type === 'OUT_OF_ORDER') {
      recommendations.push(`Consider moving ${v.stage} earlier in the chain for optimal results`);
    } else if (v.type === 'PROBLEMATIC_SEQUENCE') {
      recommendations.push(`Be aware: ${v.reason}`);
    }
  }
  
  // General recommendations based on stage presence
  if (stages.includes(DSPStage.LIMITING) && !stages.includes(DSPStage.DITHER)) {
    recommendations.push('Consider adding dithering if target format has lower bit depth');
  }
  
  if (stages.includes(DSPStage.STEREO) && stages.includes(DSPStage.LIMITING)) {
    const stereoIdx = stages.lastIndexOf(DSPStage.STEREO);
    const limitIdx = stages.lastIndexOf(DSPStage.LIMITING);
    if (stereoIdx > limitIdx) {
      recommendations.push('Stereo widening after limiting may cause inter-sample peaks - consider true-peak limiting');
    }
  }
  
  return recommendations;
}

/**
 * Build an optimal stage order from an unordered list
 * @param {Array<string>} stages - Unordered list of stages to apply
 * @returns {Array<string>} Optimally ordered stages
 */
function buildOptimalOrder(stages) {
  if (!stages || stages.length === 0) {
    return [];
  }
  
  // Sort by the safe order index
  return [...stages].sort((a, b) => {
    const orderA = getStageOrder(a);
    const orderB = getStageOrder(b);
    
    // Unknown stages go to the end
    if (orderA === -1) return 1;
    if (orderB === -1) return -1;
    
    return orderA - orderB;
  });
}

/**
 * Quick validation check
 * @param {Array<string>} stages - Ordered list of DSPStage values
 * @returns {Object} Quick validation result
 */
function quickCheck(stages) {
  const result = validateStageSequence(stages);
  
  return {
    status: result.status,
    isValid: result.status === ValidationStatus.VALID,
    hasWarnings: result.status === ValidationStatus.WARNING,
    hasErrors: result.status === ValidationStatus.INVALID,
    violationCount: result.violations.length,
    criticalCount: result.violations.filter(v => v.severity === ViolationSeverity.CRITICAL).length,
    errorCount: result.violations.filter(v => v.severity === ViolationSeverity.ERROR).length,
    warningCount: result.violations.filter(v => v.severity === ViolationSeverity.WARNING).length
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Main validation functions
  validateStageSequence,
  validatePresetSequence,
  validateProposedPreset,
  quickCheck,
  
  // Utility functions
  getStageOrder,
  getPresetStage,
  isRepeatableStage,
  isNonRepeatableStage,
  getRecommendedNextStages,
  buildOptimalOrder,
  
  // Detection functions
  findProblematicSequences,
  findOutOfOrderStages,
  findRepeatViolations,
  generateRecommendations,
  
  // Constants
  DSPStage,
  ValidationStatus,
  ViolationSeverity,
  SAFE_ORDER,
  PRESET_TO_STAGE,
  REPEATABLE_STAGES,
  NON_REPEATABLE_STAGES,
  PROBLEMATIC_SEQUENCES,
  STATUS_DESCRIPTIONS
};
