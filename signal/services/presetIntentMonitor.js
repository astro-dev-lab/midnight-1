/**
 * Preset Intent Preservation Monitor
 * 
 * Validates that processing transformations maintain the
 * original intent of applied presets. Detects when parameters
 * or subsequent operations contradict preset goals.
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Presets encode specific
 * delivery and quality goals that must be preserved through
 * the processing chain.
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Intent categories that presets can specify
 */
const IntentCategory = Object.freeze({
  DYNAMICS: 'DYNAMICS',           // Dynamic range goals
  LOUDNESS: 'LOUDNESS',           // Loudness targets
  FREQUENCY: 'FREQUENCY',         // Tonal balance goals
  STEREO: 'STEREO',               // Stereo field goals
  COMPATIBILITY: 'COMPATIBILITY', // Format/platform compatibility
  FIDELITY: 'FIDELITY',           // Audio quality preservation
  RESTORATION: 'RESTORATION'      // Artifact correction
});

/**
 * Violation severity levels
 */
const ViolationSeverity = Object.freeze({
  NONE: 'NONE',           // No violation
  MINOR: 'MINOR',         // Intent slightly compromised
  MODERATE: 'MODERATE',   // Intent noticeably affected
  MAJOR: 'MAJOR',         // Intent significantly violated
  CRITICAL: 'CRITICAL'    // Intent completely contradicted
});

/**
 * Preservation status values
 */
const PreservationStatus = Object.freeze({
  PRESERVED: 'PRESERVED',     // Intent fully maintained
  PARTIAL: 'PARTIAL',         // Intent partially maintained
  COMPROMISED: 'COMPROMISED', // Intent significantly affected
  VIOLATED: 'VIOLATED'        // Intent contradicted
});

/**
 * Severity descriptions
 */
const SEVERITY_DESCRIPTIONS = Object.freeze({
  [ViolationSeverity.NONE]: 'No violation detected. Intent fully preserved.',
  [ViolationSeverity.MINOR]: 'Minor deviation from intended outcome. Results may vary slightly.',
  [ViolationSeverity.MODERATE]: 'Noticeable deviation from intent. Review recommended.',
  [ViolationSeverity.MAJOR]: 'Significant violation of preset goals. Reconsider processing chain.',
  [ViolationSeverity.CRITICAL]: 'Preset intent completely contradicted. Processing likely to produce unacceptable results.'
});

/**
 * Preset intent definitions
 * Each preset specifies its goals and constraints
 */
const PRESET_INTENTS = Object.freeze({
  // =========================================
  // Mastering Presets
  // =========================================
  'master-standard': {
    name: 'Standard Mastering',
    category: 'MASTERING',
    goals: {
      [IntentCategory.LOUDNESS]: {
        targetLufs: -14,
        tolerance: 1.0,
        description: 'Streaming-ready loudness'
      },
      [IntentCategory.DYNAMICS]: {
        minCrestFactor: 6,
        description: 'Preserve reasonable dynamics'
      },
      [IntentCategory.FIDELITY]: {
        noClipping: true,
        maxTruePeak: -1.0,
        description: 'Clean, distortion-free output'
      }
    },
    constraints: {
      noSubsequentLimiting: true,
      noSubsequentNormalization: true,
      noLossyConversion: false
    }
  },
  
  'master-streaming': {
    name: 'Streaming Mastering',
    category: 'MASTERING',
    goals: {
      [IntentCategory.LOUDNESS]: {
        targetLufs: -14,
        tolerance: 0.5,
        description: 'Platform-normalized loudness'
      },
      [IntentCategory.DYNAMICS]: {
        minCrestFactor: 7,
        description: 'Dynamic for streaming normalization'
      },
      [IntentCategory.COMPATIBILITY]: {
        codecFriendly: true,
        description: 'Optimized for lossy codecs'
      }
    },
    constraints: {
      noSubsequentLimiting: true,
      noSubsequentNormalization: true,
      noHFBoost: true
    }
  },
  
  'master-broadcast': {
    name: 'Broadcast Mastering',
    category: 'MASTERING',
    goals: {
      [IntentCategory.LOUDNESS]: {
        targetLufs: -24,
        tolerance: 0.5,
        description: 'Broadcast standard loudness'
      },
      [IntentCategory.DYNAMICS]: {
        minCrestFactor: 9,
        description: 'Wide dynamics for broadcast'
      },
      [IntentCategory.FIDELITY]: {
        noClipping: true,
        maxTruePeak: -2.0,
        description: 'Broadcast-safe headroom'
      }
    },
    constraints: {
      noSubsequentLimiting: true,
      noSubsequentNormalization: true,
      noCompression: true
    }
  },
  
  'master-vinyl': {
    name: 'Vinyl Mastering',
    category: 'MASTERING',
    goals: {
      [IntentCategory.DYNAMICS]: {
        minCrestFactor: 10,
        description: 'Wide dynamics for vinyl'
      },
      [IntentCategory.FREQUENCY]: {
        noExcessiveBass: true,
        noExcessiveHF: true,
        description: 'Vinyl-safe frequency balance'
      },
      [IntentCategory.STEREO]: {
        monoCompatible: true,
        maxWidth: 0.8,
        description: 'Mono-compatible stereo field'
      }
    },
    constraints: {
      noSubsequentLimiting: true,
      noStereoWidening: true,
      noSubbassBoost: true
    }
  },
  
  // =========================================
  // Dynamics Presets
  // =========================================
  'compress-gentle': {
    name: 'Gentle Compression',
    category: 'DYNAMICS',
    goals: {
      [IntentCategory.DYNAMICS]: {
        targetReduction: 3,
        preserveCrest: true,
        description: 'Light dynamic control'
      },
      [IntentCategory.FIDELITY]: {
        transparent: true,
        description: 'Transparent processing'
      }
    },
    constraints: {
      noHeavyCompression: true,
      noLimiting: true
    }
  },
  
  'compress-medium': {
    name: 'Medium Compression',
    category: 'DYNAMICS',
    goals: {
      [IntentCategory.DYNAMICS]: {
        targetReduction: 6,
        description: 'Moderate dynamic control'
      }
    },
    constraints: {
      noStackedCompression: true
    }
  },
  
  'compress-heavy': {
    name: 'Heavy Compression',
    category: 'DYNAMICS',
    goals: {
      [IntentCategory.DYNAMICS]: {
        targetReduction: 12,
        description: 'Aggressive dynamic control'
      },
      [IntentCategory.LOUDNESS]: {
        maximized: true,
        description: 'Maximum perceived loudness'
      }
    },
    constraints: {}
  },
  
  // =========================================
  // Loudness Presets
  // =========================================
  'normalize-loudness': {
    name: 'Loudness Normalization',
    category: 'NORMALIZATION',
    goals: {
      [IntentCategory.LOUDNESS]: {
        targetLufs: -14,
        tolerance: 0.5,
        description: 'Consistent loudness level'
      },
      [IntentCategory.DYNAMICS]: {
        preserved: true,
        description: 'Dynamics unchanged'
      }
    },
    constraints: {
      noSubsequentGain: true,
      noDynamicsChange: true
    }
  },
  
  'normalize-peak': {
    name: 'Peak Normalization',
    category: 'NORMALIZATION',
    goals: {
      [IntentCategory.FIDELITY]: {
        maxPeak: -0.1,
        description: 'Maximize peak level'
      },
      [IntentCategory.DYNAMICS]: {
        preserved: true,
        description: 'Dynamics unchanged'
      }
    },
    constraints: {
      noSubsequentGain: true,
      noDynamicsChange: true
    }
  },
  
  'limit-peak': {
    name: 'Peak Limiting',
    category: 'LIMITING',
    goals: {
      [IntentCategory.FIDELITY]: {
        maxTruePeak: -1.0,
        noClipping: true,
        description: 'True peak control'
      },
      [IntentCategory.LOUDNESS]: {
        increased: true,
        description: 'Increased perceived loudness'
      }
    },
    constraints: {
      noSubsequentLimiting: true,
      noSubsequentGain: true
    }
  },
  
  'limit-loudness': {
    name: 'Loudness Maximizing',
    category: 'LIMITING',
    goals: {
      [IntentCategory.LOUDNESS]: {
        maximized: true,
        targetLufs: -9,
        description: 'Maximum loudness'
      },
      [IntentCategory.FIDELITY]: {
        maxTruePeak: -0.3,
        description: 'Controlled peaks'
      }
    },
    constraints: {
      noSubsequentLimiting: true,
      noSubsequentGain: true,
      noSubsequentCompression: true
    }
  },
  
  // =========================================
  // EQ Presets
  // =========================================
  'eq-correct': {
    name: 'Corrective EQ',
    category: 'EQ',
    goals: {
      [IntentCategory.FREQUENCY]: {
        balanced: true,
        description: 'Frequency balance correction'
      },
      [IntentCategory.FIDELITY]: {
        transparent: true,
        description: 'Transparent correction'
      }
    },
    constraints: {
      noContradictoryEQ: true
    }
  },
  
  'eq-enhance': {
    name: 'Enhancement EQ',
    category: 'EQ',
    goals: {
      [IntentCategory.FREQUENCY]: {
        enhanced: true,
        description: 'Tonal enhancement'
      }
    },
    constraints: {
      noContradictoryEQ: true
    }
  },
  
  // =========================================
  // Stereo Presets
  // =========================================
  'stereo-widen': {
    name: 'Stereo Widening',
    category: 'STEREO',
    goals: {
      [IntentCategory.STEREO]: {
        widened: true,
        targetWidth: 1.3,
        description: 'Enhanced stereo width'
      }
    },
    constraints: {
      noMonoFold: true,
      noStereoNarrow: true
    }
  },
  
  'stereo-narrow': {
    name: 'Stereo Narrowing',
    category: 'STEREO',
    goals: {
      [IntentCategory.STEREO]: {
        narrowed: true,
        targetWidth: 0.7,
        description: 'Reduced stereo width'
      },
      [IntentCategory.COMPATIBILITY]: {
        monoSafe: true,
        description: 'Improved mono compatibility'
      }
    },
    constraints: {
      noStereoWiden: true
    }
  },
  
  'mono-fold': {
    name: 'Mono Fold-down',
    category: 'STEREO',
    goals: {
      [IntentCategory.STEREO]: {
        mono: true,
        description: 'Mono output'
      },
      [IntentCategory.COMPATIBILITY]: {
        monoDelivery: true,
        description: 'Mono-only delivery'
      }
    },
    constraints: {
      noStereoProcessing: true
    }
  },
  
  // =========================================
  // Format Conversion Presets
  // =========================================
  'convert-wav': {
    name: 'WAV Export',
    category: 'FORMAT',
    goals: {
      [IntentCategory.FIDELITY]: {
        lossless: true,
        description: 'Lossless output'
      }
    },
    constraints: {}
  },
  
  'convert-mp3': {
    name: 'MP3 Export',
    category: 'FORMAT',
    goals: {
      [IntentCategory.COMPATIBILITY]: {
        universal: true,
        description: 'Universal compatibility'
      }
    },
    constraints: {
      noSubsequentLossyConversion: true
    }
  },
  
  'convert-flac': {
    name: 'FLAC Export',
    category: 'FORMAT',
    goals: {
      [IntentCategory.FIDELITY]: {
        lossless: true,
        archivalQuality: true,
        description: 'Archival lossless output'
      }
    },
    constraints: {
      noSubsequentLossyConversion: true
    }
  },
  
  // =========================================
  // Restoration Presets
  // =========================================
  'restore-declip': {
    name: 'Declipping Restoration',
    category: 'RESTORATION',
    goals: {
      [IntentCategory.RESTORATION]: {
        declipped: true,
        description: 'Clipping artifact removal'
      },
      [IntentCategory.DYNAMICS]: {
        restored: true,
        description: 'Dynamics restoration'
      }
    },
    constraints: {
      noSubsequentClipping: true,
      noHardLimiting: true
    }
  },
  
  'restore-denoise': {
    name: 'Noise Reduction',
    category: 'RESTORATION',
    goals: {
      [IntentCategory.RESTORATION]: {
        denoised: true,
        description: 'Noise floor reduction'
      },
      [IntentCategory.FIDELITY]: {
        preserveDetail: true,
        description: 'Detail preservation'
      }
    },
    constraints: {
      noNoiseAddition: true
    }
  },
  
  // =========================================
  // Analysis Presets
  // =========================================
  'analyze-full': {
    name: 'Full Analysis',
    category: 'ANALYSIS',
    goals: {},
    constraints: {}
  },
  
  'analyze-loudness': {
    name: 'Loudness Analysis',
    category: 'ANALYSIS',
    goals: {},
    constraints: {}
  }
});

/**
 * Map preset categories to processing operations that violate them
 */
const CONSTRAINT_VIOLATIONS = Object.freeze({
  noSubsequentLimiting: ['limit-peak', 'limit-loudness', 'master-standard', 'master-streaming', 'master-broadcast', 'master-vinyl'],
  noSubsequentNormalization: ['normalize-peak', 'normalize-loudness', 'normalize-rms'],
  noSubsequentGain: ['normalize-peak', 'normalize-loudness', 'gain-adjust'],
  noLossyConversion: ['convert-mp3', 'convert-aac'],
  noSubsequentLossyConversion: ['convert-mp3', 'convert-aac'],
  noHFBoost: ['eq-enhance'], // Simplified - would need parameter checking
  noCompression: ['compress-gentle', 'compress-medium', 'compress-heavy'],
  noHeavyCompression: ['compress-heavy'],
  noStackedCompression: ['compress-gentle', 'compress-medium', 'compress-heavy'],
  noSubsequentCompression: ['compress-gentle', 'compress-medium', 'compress-heavy'],
  noLimiting: ['limit-peak', 'limit-loudness'],
  noHardLimiting: ['limit-loudness'],
  noDynamicsChange: ['compress-gentle', 'compress-medium', 'compress-heavy', 'limit-peak', 'limit-loudness', 'expand-gentle'],
  noStereoWidening: ['stereo-widen'],
  noStereoWiden: ['stereo-widen'],
  noStereoNarrow: ['stereo-narrow'],
  noMonoFold: ['mono-fold'],
  noStereoProcessing: ['stereo-widen', 'stereo-narrow'],
  noContradictoryEQ: [], // Checked via parameter analysis
  noSubbassBoost: ['eq-enhance'], // Simplified
  noNoiseAddition: [], // Checked via parameter analysis
  noSubsequentClipping: ['limit-loudness'] // Aggressive limiting can clip
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get intent definition for a preset
 * @param {string} presetName - Preset name
 * @returns {Object|null} Intent definition or null
 */
function getPresetIntent(presetName) {
  return PRESET_INTENTS[presetName] || null;
}

/**
 * Get all constraints for a preset
 * @param {string} presetName - Preset name
 * @returns {Object} Constraints object
 */
function getPresetConstraints(presetName) {
  const intent = getPresetIntent(presetName);
  return intent?.constraints || {};
}

/**
 * Get all goals for a preset
 * @param {string} presetName - Preset name
 * @returns {Object} Goals object
 */
function getPresetGoals(presetName) {
  const intent = getPresetIntent(presetName);
  return intent?.goals || {};
}

/**
 * Check if a subsequent preset violates a constraint
 * @param {string} constraintName - Constraint to check
 * @param {string} subsequentPreset - Preset to evaluate
 * @returns {boolean} True if violated
 */
function violatesConstraint(constraintName, subsequentPreset) {
  const violatingPresets = CONSTRAINT_VIOLATIONS[constraintName] || [];
  return violatingPresets.includes(subsequentPreset);
}

/**
 * Map severity to numeric value for comparison
 * @param {string} severity - ViolationSeverity
 * @returns {number} Numeric severity
 */
function severityToNumber(severity) {
  const map = {
    [ViolationSeverity.NONE]: 0,
    [ViolationSeverity.MINOR]: 1,
    [ViolationSeverity.MODERATE]: 2,
    [ViolationSeverity.MAJOR]: 3,
    [ViolationSeverity.CRITICAL]: 4
  };
  return map[severity] ?? 0;
}

/**
 * Map numeric value to severity
 * @param {number} value - Numeric severity
 * @returns {string} ViolationSeverity
 */
function numberToSeverity(value) {
  if (value >= 4) return ViolationSeverity.CRITICAL;
  if (value >= 3) return ViolationSeverity.MAJOR;
  if (value >= 2) return ViolationSeverity.MODERATE;
  if (value >= 1) return ViolationSeverity.MINOR;
  return ViolationSeverity.NONE;
}

// ============================================================================
// Violation Detection Functions
// ============================================================================

/**
 * Check constraint violations for a preset chain
 * @param {string} originalPreset - Original preset with intent
 * @param {Array<string>} subsequentPresets - Presets applied after
 * @returns {Array<Object>} Array of violations
 */
function checkConstraintViolations(originalPreset, subsequentPresets) {
  const violations = [];
  const constraints = getPresetConstraints(originalPreset);
  const intent = getPresetIntent(originalPreset);
  
  if (!intent || !subsequentPresets || subsequentPresets.length === 0) {
    return violations;
  }
  
  for (const constraint of Object.keys(constraints)) {
    if (!constraints[constraint]) continue;
    
    for (const subsequent of subsequentPresets) {
      if (violatesConstraint(constraint, subsequent)) {
        // Determine severity based on constraint importance
        let severity = ViolationSeverity.MODERATE;
        
        if (constraint.includes('Limiting') || constraint.includes('Clipping')) {
          severity = ViolationSeverity.MAJOR;
        } else if (constraint.includes('Normalization') || constraint.includes('Gain')) {
          severity = ViolationSeverity.MODERATE;
        } else if (constraint.includes('Stereo') || constraint.includes('EQ')) {
          severity = ViolationSeverity.MINOR;
        }
        
        // Upgrade severity for mastering presets
        if (intent.category === 'MASTERING' && severity !== ViolationSeverity.MINOR) {
          severity = ViolationSeverity.MAJOR;
        }
        
        violations.push({
          originalPreset,
          subsequentPreset: subsequent,
          constraint,
          severity,
          message: `${subsequent} violates ${constraint} constraint from ${originalPreset}`
        });
      }
    }
  }
  
  return violations;
}

/**
 * Check if parameters contradict preset goals
 * @param {string} presetName - Preset name
 * @param {Object} parameters - Applied parameters
 * @returns {Array<Object>} Parameter violations
 */
function checkParameterViolations(presetName, parameters) {
  const violations = [];
  const goals = getPresetGoals(presetName);
  
  if (!goals || !parameters) {
    return violations;
  }
  
  // Check loudness goal violations
  if (goals[IntentCategory.LOUDNESS]) {
    const loudnessGoal = goals[IntentCategory.LOUDNESS];
    
    if (loudnessGoal.targetLufs !== undefined && parameters.targetLufs !== undefined) {
      const diff = Math.abs(parameters.targetLufs - loudnessGoal.targetLufs);
      const tolerance = loudnessGoal.tolerance || 1.0;
      
      if (diff > tolerance * 3) {
        violations.push({
          presetName,
          category: IntentCategory.LOUDNESS,
          severity: ViolationSeverity.MAJOR,
          parameter: 'targetLufs',
          expected: loudnessGoal.targetLufs,
          actual: parameters.targetLufs,
          message: `Loudness target ${parameters.targetLufs} LUFS deviates significantly from preset goal of ${loudnessGoal.targetLufs} LUFS`
        });
      } else if (diff > tolerance) {
        violations.push({
          presetName,
          category: IntentCategory.LOUDNESS,
          severity: ViolationSeverity.MINOR,
          parameter: 'targetLufs',
          expected: loudnessGoal.targetLufs,
          actual: parameters.targetLufs,
          message: `Loudness target ${parameters.targetLufs} LUFS differs from preset goal of ${loudnessGoal.targetLufs} LUFS`
        });
      }
    }
  }
  
  // Check dynamics goal violations
  if (goals[IntentCategory.DYNAMICS]) {
    const dynamicsGoal = goals[IntentCategory.DYNAMICS];
    
    if (dynamicsGoal.preserved && parameters.compression !== undefined) {
      violations.push({
        presetName,
        category: IntentCategory.DYNAMICS,
        severity: ViolationSeverity.MODERATE,
        parameter: 'compression',
        message: 'Compression applied when preset intends to preserve dynamics'
      });
    }
    
    if (dynamicsGoal.minCrestFactor !== undefined && parameters.targetCrestFactor !== undefined) {
      if (parameters.targetCrestFactor < dynamicsGoal.minCrestFactor) {
        violations.push({
          presetName,
          category: IntentCategory.DYNAMICS,
          severity: ViolationSeverity.MAJOR,
          parameter: 'targetCrestFactor',
          expected: dynamicsGoal.minCrestFactor,
          actual: parameters.targetCrestFactor,
          message: `Target crest factor ${parameters.targetCrestFactor} dB below preset minimum of ${dynamicsGoal.minCrestFactor} dB`
        });
      }
    }
  }
  
  // Check fidelity goal violations
  if (goals[IntentCategory.FIDELITY]) {
    const fidelityGoal = goals[IntentCategory.FIDELITY];
    
    if (fidelityGoal.noClipping && parameters.allowClipping) {
      violations.push({
        presetName,
        category: IntentCategory.FIDELITY,
        severity: ViolationSeverity.CRITICAL,
        parameter: 'allowClipping',
        message: 'Clipping enabled when preset requires clean output'
      });
    }
    
    if (fidelityGoal.maxTruePeak !== undefined && parameters.truePeakCeiling !== undefined) {
      if (parameters.truePeakCeiling > fidelityGoal.maxTruePeak) {
        violations.push({
          presetName,
          category: IntentCategory.FIDELITY,
          severity: ViolationSeverity.MODERATE,
          parameter: 'truePeakCeiling',
          expected: fidelityGoal.maxTruePeak,
          actual: parameters.truePeakCeiling,
          message: `True peak ceiling ${parameters.truePeakCeiling} dB exceeds preset maximum of ${fidelityGoal.maxTruePeak} dB`
        });
      }
    }
    
    if (fidelityGoal.lossless && parameters.codec === 'lossy') {
      violations.push({
        presetName,
        category: IntentCategory.FIDELITY,
        severity: ViolationSeverity.MAJOR,
        parameter: 'codec',
        message: 'Lossy codec applied when preset requires lossless output'
      });
    }
  }
  
  // Check stereo goal violations
  if (goals[IntentCategory.STEREO]) {
    const stereoGoal = goals[IntentCategory.STEREO];
    
    if (stereoGoal.mono && parameters.stereoWidth !== undefined && parameters.stereoWidth > 0) {
      violations.push({
        presetName,
        category: IntentCategory.STEREO,
        severity: ViolationSeverity.MAJOR,
        parameter: 'stereoWidth',
        message: 'Stereo width applied when preset specifies mono output'
      });
    }
    
    if (stereoGoal.monoCompatible && parameters.stereoWidth !== undefined) {
      if (parameters.stereoWidth > 1.0) {
        violations.push({
          presetName,
          category: IntentCategory.STEREO,
          severity: ViolationSeverity.MODERATE,
          parameter: 'stereoWidth',
          message: 'Excessive stereo width may compromise mono compatibility'
        });
      }
    }
  }
  
  return violations;
}

/**
 * Check output metrics against preset goals
 * @param {string} presetName - Preset name
 * @param {Object} metrics - Output audio metrics
 * @returns {Array<Object>} Metric violations
 */
function checkMetricViolations(presetName, metrics) {
  const violations = [];
  const goals = getPresetGoals(presetName);
  
  if (!goals || !metrics) {
    return violations;
  }
  
  // Check loudness metrics
  if (goals[IntentCategory.LOUDNESS] && metrics.loudnessLufs !== undefined) {
    const loudnessGoal = goals[IntentCategory.LOUDNESS];
    
    if (loudnessGoal.targetLufs !== undefined) {
      const diff = Math.abs(metrics.loudnessLufs - loudnessGoal.targetLufs);
      const tolerance = loudnessGoal.tolerance || 1.0;
      
      if (diff > tolerance * 2) {
        violations.push({
          presetName,
          category: IntentCategory.LOUDNESS,
          severity: ViolationSeverity.MAJOR,
          metric: 'loudnessLufs',
          expected: loudnessGoal.targetLufs,
          actual: metrics.loudnessLufs,
          message: `Output loudness ${metrics.loudnessLufs.toFixed(1)} LUFS significantly differs from target ${loudnessGoal.targetLufs} LUFS`
        });
      } else if (diff > tolerance) {
        violations.push({
          presetName,
          category: IntentCategory.LOUDNESS,
          severity: ViolationSeverity.MINOR,
          metric: 'loudnessLufs',
          expected: loudnessGoal.targetLufs,
          actual: metrics.loudnessLufs,
          message: `Output loudness ${metrics.loudnessLufs.toFixed(1)} LUFS differs from target ${loudnessGoal.targetLufs} LUFS`
        });
      }
    }
  }
  
  // Check dynamics metrics
  if (goals[IntentCategory.DYNAMICS] && metrics.crestFactorDb !== undefined) {
    const dynamicsGoal = goals[IntentCategory.DYNAMICS];
    
    if (dynamicsGoal.minCrestFactor !== undefined) {
      if (metrics.crestFactorDb < dynamicsGoal.minCrestFactor) {
        violations.push({
          presetName,
          category: IntentCategory.DYNAMICS,
          severity: ViolationSeverity.MAJOR,
          metric: 'crestFactorDb',
          expected: dynamicsGoal.minCrestFactor,
          actual: metrics.crestFactorDb,
          message: `Output crest factor ${metrics.crestFactorDb.toFixed(1)} dB below minimum ${dynamicsGoal.minCrestFactor} dB`
        });
      }
    }
  }
  
  // Check fidelity metrics
  if (goals[IntentCategory.FIDELITY]) {
    const fidelityGoal = goals[IntentCategory.FIDELITY];
    
    if (fidelityGoal.noClipping && metrics.clippedSamples !== undefined && metrics.clippedSamples > 0) {
      violations.push({
        presetName,
        category: IntentCategory.FIDELITY,
        severity: ViolationSeverity.CRITICAL,
        metric: 'clippedSamples',
        actual: metrics.clippedSamples,
        message: `${metrics.clippedSamples} clipped samples detected when preset requires clean output`
      });
    }
    
    if (fidelityGoal.maxTruePeak !== undefined && metrics.truePeakDbfs !== undefined) {
      if (metrics.truePeakDbfs > fidelityGoal.maxTruePeak) {
        violations.push({
          presetName,
          category: IntentCategory.FIDELITY,
          severity: ViolationSeverity.MODERATE,
          metric: 'truePeakDbfs',
          expected: fidelityGoal.maxTruePeak,
          actual: metrics.truePeakDbfs,
          message: `True peak ${metrics.truePeakDbfs.toFixed(1)} dBTP exceeds limit ${fidelityGoal.maxTruePeak} dBTP`
        });
      }
    }
  }
  
  return violations;
}

// ============================================================================
// Main Analysis Functions
// ============================================================================

/**
 * Check intent preservation for a complete processing chain
 * @param {Array<string>} presetChain - Chain of applied presets
 * @param {Object} options - Check options
 * @returns {Object} Preservation analysis
 */
function checkIntentPreservation(presetChain, options = {}) {
  const { parameters = {}, outputMetrics = {} } = options;
  
  if (!presetChain || presetChain.length === 0) {
    return {
      status: PreservationStatus.PRESERVED,
      violations: [],
      summary: 'No presets to analyze',
      preservedIntents: [],
      violatedIntents: []
    };
  }
  
  const allViolations = [];
  const preservedIntents = new Set();
  const violatedIntents = new Set();
  
  // Check each preset against subsequent presets
  for (let i = 0; i < presetChain.length; i++) {
    const currentPreset = presetChain[i];
    const subsequentPresets = presetChain.slice(i + 1);
    const intent = getPresetIntent(currentPreset);
    
    if (!intent) continue;
    
    // Check constraint violations
    const constraintViolations = checkConstraintViolations(currentPreset, subsequentPresets);
    allViolations.push(...constraintViolations);
    
    // Check parameter violations
    const paramViolations = checkParameterViolations(currentPreset, parameters);
    allViolations.push(...paramViolations);
    
    // Check metric violations (only for last preset typically)
    if (i === presetChain.length - 1 && Object.keys(outputMetrics).length > 0) {
      const metricViolations = checkMetricViolations(currentPreset, outputMetrics);
      allViolations.push(...metricViolations);
    }
    
    // Track which intents are preserved/violated
    for (const category of Object.keys(intent.goals || {})) {
      const hasViolation = allViolations.some(
        v => v.originalPreset === currentPreset && v.category === category
      );
      
      if (hasViolation) {
        violatedIntents.add(`${currentPreset}:${category}`);
      } else {
        preservedIntents.add(`${currentPreset}:${category}`);
      }
    }
  }
  
  // Determine overall status
  const maxSeverity = allViolations.reduce((max, v) => {
    return Math.max(max, severityToNumber(v.severity));
  }, 0);
  
  let status;
  if (maxSeverity >= severityToNumber(ViolationSeverity.CRITICAL)) {
    status = PreservationStatus.VIOLATED;
  } else if (maxSeverity >= severityToNumber(ViolationSeverity.MAJOR)) {
    status = PreservationStatus.COMPROMISED;
  } else if (maxSeverity >= severityToNumber(ViolationSeverity.MINOR)) {
    status = PreservationStatus.PARTIAL;
  } else {
    status = PreservationStatus.PRESERVED;
  }
  
  // Generate summary
  let summary;
  if (allViolations.length === 0) {
    summary = 'All preset intents fully preserved through processing chain';
  } else {
    const criticalCount = allViolations.filter(v => v.severity === ViolationSeverity.CRITICAL).length;
    const majorCount = allViolations.filter(v => v.severity === ViolationSeverity.MAJOR).length;
    
    if (criticalCount > 0) {
      summary = `${criticalCount} critical violation(s) detected - preset intent completely contradicted`;
    } else if (majorCount > 0) {
      summary = `${majorCount} major violation(s) detected - preset intent significantly compromised`;
    } else {
      summary = `${allViolations.length} minor violation(s) detected - some deviation from intended outcome`;
    }
  }
  
  return {
    status,
    violations: allViolations,
    violationCount: allViolations.length,
    summary,
    preservedIntents: [...preservedIntents],
    violatedIntents: [...violatedIntents],
    maxSeverity: numberToSeverity(maxSeverity)
  };
}

/**
 * Predict violations if a preset is added to chain
 * @param {Array<string>} existingChain - Current preset chain
 * @param {string} proposedPreset - Preset to add
 * @returns {Object} Prediction result
 */
function predictIntentViolations(existingChain, proposedPreset) {
  if (!proposedPreset) {
    return {
      canAdd: true,
      predictedViolations: [],
      recommendation: 'No preset specified'
    };
  }
  
  const chain = [...(existingChain || [])];
  const proposedIntent = getPresetIntent(proposedPreset);
  
  // Check if proposed preset would violate existing intents
  const violationsOfExisting = [];
  for (const existing of chain) {
    const violations = checkConstraintViolations(existing, [proposedPreset]);
    violationsOfExisting.push(...violations);
  }
  
  // Check if existing chain would violate proposed intent
  // (This is less common but can happen with format constraints)
  const violationsOfProposed = [];
  if (proposedIntent && Object.keys(proposedIntent.constraints || {}).length > 0) {
    // Future operations that violate this preset's constraints
    // Not checked here since we're adding at end
  }
  
  const allPredicted = [...violationsOfExisting, ...violationsOfProposed];
  const maxSeverity = allPredicted.reduce((max, v) => {
    return Math.max(max, severityToNumber(v.severity));
  }, 0);
  
  const canAdd = maxSeverity < severityToNumber(ViolationSeverity.CRITICAL);
  
  let recommendation;
  if (allPredicted.length === 0) {
    recommendation = `${proposedPreset} can be safely added to the chain`;
  } else if (!canAdd) {
    recommendation = `Adding ${proposedPreset} would critically violate existing intents`;
  } else {
    recommendation = `Adding ${proposedPreset} would cause ${allPredicted.length} violation(s) - review before proceeding`;
  }
  
  return {
    canAdd,
    predictedViolations: allPredicted,
    predictedSeverity: numberToSeverity(maxSeverity),
    violationCount: allPredicted.length,
    recommendation,
    affectedPresets: [...new Set(allPredicted.map(v => v.originalPreset))]
  };
}

/**
 * Quick check for intent preservation
 * @param {Array<string>} presetChain - Preset chain
 * @returns {Object} Quick check result
 */
function quickCheck(presetChain) {
  const result = checkIntentPreservation(presetChain);
  
  return {
    status: result.status,
    violationCount: result.violationCount,
    hasViolations: result.violationCount > 0,
    maxSeverity: result.maxSeverity,
    isPreserved: result.status === PreservationStatus.PRESERVED,
    isCompromised: result.status === PreservationStatus.COMPROMISED || 
                   result.status === PreservationStatus.VIOLATED
  };
}

/**
 * Get all intents that would be affected by a processing chain
 * @param {Array<string>} presetChain - Preset chain
 * @returns {Object} Intent summary
 */
function summarizeIntents(presetChain) {
  if (!presetChain || presetChain.length === 0) {
    return {
      totalIntents: 0,
      categories: {},
      primaryGoals: []
    };
  }
  
  const categories = {};
  const primaryGoals = [];
  
  for (const preset of presetChain) {
    const intent = getPresetIntent(preset);
    if (!intent) continue;
    
    // Count by category
    const category = intent.category;
    categories[category] = (categories[category] || 0) + 1;
    
    // Collect primary goals
    for (const [goalCategory, goalDef] of Object.entries(intent.goals || {})) {
      if (goalDef.description) {
        primaryGoals.push({
          preset,
          category: goalCategory,
          goal: goalDef.description
        });
      }
    }
  }
  
  return {
    totalIntents: presetChain.length,
    categories,
    primaryGoals,
    presetCount: presetChain.filter(p => getPresetIntent(p) !== null).length
  };
}

/**
 * Generate recommendations for intent preservation
 * @param {Object} preservationResult - Result from checkIntentPreservation
 * @returns {Array<string>} Recommendations
 */
function generateRecommendations(preservationResult) {
  const recommendations = [];
  
  if (!preservationResult || preservationResult.violationCount === 0) {
    return recommendations;
  }
  
  const { violations, status } = preservationResult;
  
  // Group violations by type
  const constraintViolations = violations.filter(v => v.constraint);
  const parameterViolations = violations.filter(v => v.parameter);
  const metricViolations = violations.filter(v => v.metric);
  
  // Recommendations for constraint violations
  if (constraintViolations.length > 0) {
    const limitingViolations = constraintViolations.filter(v => 
      v.constraint.includes('Limiting')
    );
    if (limitingViolations.length > 0) {
      recommendations.push('Remove subsequent limiting stages to preserve mastering intent');
    }
    
    const normViolations = constraintViolations.filter(v => 
      v.constraint.includes('Normalization') || v.constraint.includes('Gain')
    );
    if (normViolations.length > 0) {
      recommendations.push('Avoid gain changes after normalization to maintain consistent levels');
    }
  }
  
  // Recommendations for parameter violations
  if (parameterViolations.length > 0) {
    recommendations.push('Review parameter values to ensure they align with preset goals');
  }
  
  // Recommendations for metric violations
  if (metricViolations.length > 0) {
    const clippingViolations = metricViolations.filter(v => 
      v.metric === 'clippedSamples'
    );
    if (clippingViolations.length > 0) {
      recommendations.push('Reduce input gain or adjust limiter settings to eliminate clipping');
    }
    
    const loudnessViolations = metricViolations.filter(v => 
      v.metric === 'loudnessLufs'
    );
    if (loudnessViolations.length > 0) {
      recommendations.push('Adjust loudness normalization to meet target specifications');
    }
  }
  
  // Status-based recommendations
  if (status === PreservationStatus.VIOLATED) {
    recommendations.push('Consider simplifying the processing chain to preserve original intent');
  } else if (status === PreservationStatus.COMPROMISED) {
    recommendations.push('Some preset goals are significantly affected - review output carefully');
  }
  
  return recommendations;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Main analysis functions
  checkIntentPreservation,
  predictIntentViolations,
  quickCheck,
  summarizeIntents,
  
  // Violation detection
  checkConstraintViolations,
  checkParameterViolations,
  checkMetricViolations,
  
  // Utility functions
  getPresetIntent,
  getPresetConstraints,
  getPresetGoals,
  violatesConstraint,
  
  // Recommendations
  generateRecommendations,
  
  // Constants
  IntentCategory,
  ViolationSeverity,
  PreservationStatus,
  SEVERITY_DESCRIPTIONS,
  PRESET_INTENTS,
  CONSTRAINT_VIOLATIONS
};
