/**
 * Confidence Recovery Service
 * 
 * Formalizes recovery paths when confidence scores are low.
 * Defines permitted actions based on confidence tier and failure type.
 * 
 * Per STUDIOOS_ERROR_RECOVERY_PLAYBOOK.md:
 * - Name the canonical error category
 * - State impact plainly
 * - Offer only permitted recovery actions
 */

const { CONFIDENCE_TIERS, getConfidenceTier } = require('./uxLanguage');
const { SUBGENRES } = require('./subgenreHeuristics');

// ============================================================================
// Recovery Path Definitions
// ============================================================================

/**
 * Confidence-based recovery strategies.
 * Each tier defines what recovery actions are available.
 */
const RECOVERY_TIERS = {
  // Confidence >= 85%: No recovery needed
  HIGH: {
    threshold: 0.85,
    status: 'nominal',
    userAction: 'none',
    systemAction: 'none',
    message: null
  },
  
  // Confidence >= 70%: Informational only
  GOOD: {
    threshold: 0.70,
    status: 'informational',
    userAction: 'optional_review',
    systemAction: 'flag_report',
    message: 'Processing completed with minor observations. Review report for details.'
  },
  
  // Confidence >= 55%: Soft warning
  MODERATE: {
    threshold: 0.55,
    status: 'advisory',
    userAction: 'review_recommended',
    systemAction: 'expand_report',
    message: 'Processing completed with moderate confidence. Review recommended before approval.',
    recoveryPaths: ['request_review', 'adjust_parameters', 'proceed_anyway']
  },
  
  // Confidence >= 40%: Hard warning
  LOW: {
    threshold: 0.40,
    status: 'warning',
    userAction: 'review_required',
    systemAction: 'block_auto_approve',
    message: 'Processing completed with low confidence. Manual review required.',
    recoveryPaths: ['request_review', 'adjust_parameters', 'reprocess_conservative', 'reject']
  },
  
  // Confidence < 40%: Critical
  VERY_LOW: {
    threshold: 0,
    status: 'critical',
    userAction: 'intervention_required',
    systemAction: 'block_delivery',
    message: 'Processing confidence critically low. Output may not meet quality standards.',
    recoveryPaths: ['request_manual_review', 'reprocess_minimal', 'escalate', 'reject']
  }
};

/**
 * Issue-specific recovery paths.
 * Maps specific issues to permitted recovery actions.
 */
const ISSUE_RECOVERY_PATHS = {
  // Classification issues
  uncertain_classification: {
    category: 'Analysis',
    impact: 'Production profile could not be confidently determined',
    actions: [
      {
        id: 'proceed_conservative',
        label: 'Proceed with Conservative Processing',
        description: 'Apply genre-agnostic parameters to minimize risk',
        automatic: true,
        roleRequired: 'basic'
      },
      {
        id: 'provide_context',
        label: 'Provide Production Context',
        description: 'Manually specify expected production style for better optimization',
        automatic: false,
        roleRequired: 'standard'
      }
    ]
  },
  
  conflicting_signals: {
    category: 'Analysis',
    impact: 'Signal patterns suggest multiple production approaches',
    actions: [
      {
        id: 'review_report',
        label: 'Review Signal Analysis',
        description: 'Examine which signals are conflicting and why',
        automatic: false,
        roleRequired: 'basic'
      },
      {
        id: 'override_classification',
        label: 'Override Production Profile',
        description: 'Manually set production profile based on artistic intent',
        automatic: false,
        roleRequired: 'advanced'
      }
    ]
  },
  
  // Risk-based issues
  high_clipping_risk: {
    category: 'Processing',
    impact: 'Output may exhibit clipping or distortion artifacts',
    actions: [
      {
        id: 'reduce_loudness',
        label: 'Reduce Target Loudness',
        description: 'Lower the loudness target by 2 LUFS',
        automatic: false,
        roleRequired: 'standard'
      },
      {
        id: 'accept_ceiling',
        label: 'Accept Conservative Ceiling',
        description: 'System will apply stricter true peak limiting',
        automatic: true,
        roleRequired: 'basic'
      }
    ]
  },
  
  high_masking_risk: {
    category: 'Processing',
    impact: 'Frequency collision may affect vocal clarity',
    actions: [
      {
        id: 'review_mix',
        label: 'Review Mix Balance',
        description: 'Examine frequency distribution report',
        automatic: false,
        roleRequired: 'basic'
      },
      {
        id: 'proceed_flagged',
        label: 'Proceed with Flag',
        description: 'Continue with masking risk noted in output metadata',
        automatic: false,
        roleRequired: 'standard'
      }
    ]
  },
  
  high_translation_risk: {
    category: 'Output',
    impact: 'Output may sound different on smaller playback systems',
    actions: [
      {
        id: 'review_spectrum',
        label: 'Review Spectral Balance',
        description: 'Check low-frequency and stereo distribution',
        automatic: false,
        roleRequired: 'basic'
      },
      {
        id: 'add_reference',
        label: 'Request Reference Check',
        description: 'System will compare against reference track distribution',
        automatic: false,
        roleRequired: 'advanced'
      }
    ]
  },
  
  high_phase_risk: {
    category: 'Output',
    impact: 'Mono playback may exhibit phase cancellation',
    actions: [
      {
        id: 'apply_mono_check',
        label: 'Apply Mono Compatibility Check',
        description: 'System will verify and flag mono-incompatible sections',
        automatic: true,
        roleRequired: 'basic'
      },
      {
        id: 'reduce_stereo_width',
        label: 'Request Reduced Stereo Width',
        description: 'Collapse stereo field to improve mono compatibility',
        automatic: false,
        roleRequired: 'standard'
      }
    ]
  },
  
  high_compression_risk: {
    category: 'Processing',
    impact: 'Dynamic range may be compromised',
    actions: [
      {
        id: 'reduce_compression',
        label: 'Use Gentle Limiting',
        description: 'Apply more conservative compression settings',
        automatic: false,
        roleRequired: 'standard'
      },
      {
        id: 'preserve_dynamics',
        label: 'Prioritize Dynamics',
        description: 'Skip loudness maximization to preserve natural dynamics',
        automatic: false,
        roleRequired: 'advanced'
      }
    ]
  },
  
  // System issues
  extraction_errors: {
    category: 'System',
    impact: 'Some analysis components failed to execute',
    actions: [
      {
        id: 'retry_analysis',
        label: 'Retry Analysis',
        description: 'Re-run failed analysis components',
        automatic: false,
        roleRequired: 'basic'
      },
      {
        id: 'proceed_partial',
        label: 'Proceed with Partial Data',
        description: 'Continue with available signals only',
        automatic: false,
        roleRequired: 'standard'
      },
      {
        id: 'escalate_support',
        label: 'Escalate to Support',
        description: 'Report issue to system administrators',
        automatic: false,
        roleRequired: 'basic'
      }
    ]
  },
  
  low_confidence: {
    category: 'Analysis',
    impact: 'Overall processing confidence is below acceptable threshold',
    actions: [
      {
        id: 'request_review',
        label: 'Request Manual Review',
        description: 'Flag output for human quality review',
        automatic: false,
        roleRequired: 'basic'
      },
      {
        id: 'reprocess_minimal',
        label: 'Reprocess with Minimal Changes',
        description: 'Re-run with conservative preset to minimize risk',
        automatic: false,
        roleRequired: 'standard'
      },
      {
        id: 'reject_output',
        label: 'Reject and Report',
        description: 'Mark job as failed with detailed failure report',
        automatic: false,
        roleRequired: 'standard'
      }
    ]
  }
};

// ============================================================================
// Recovery Functions
// ============================================================================

/**
 * Determine recovery tier from confidence score.
 * 
 * @param {number} confidence - Confidence value 0-1
 * @returns {Object} - Recovery tier configuration
 */
function getRecoveryTier(confidence) {
  for (const [tierName, tier] of Object.entries(RECOVERY_TIERS)) {
    if (confidence >= tier.threshold) {
      return { name: tierName, ...tier };
    }
  }
  return { name: 'VERY_LOW', ...RECOVERY_TIERS.VERY_LOW };
}

/**
 * Get available recovery paths for a set of issues.
 * 
 * @param {Array} issues - Array of issue objects with type property
 * @param {string} userRole - User role (basic, standard, advanced)
 * @returns {Object} - Available recovery paths grouped by issue
 */
function getRecoveryPaths(issues, userRole = 'basic') {
  const roleHierarchy = { basic: 1, standard: 2, advanced: 3 };
  const userLevel = roleHierarchy[userRole] || 1;
  
  const paths = {};
  
  for (const issue of issues) {
    const issueType = issue.type;
    const recoveryDef = ISSUE_RECOVERY_PATHS[issueType];
    
    if (recoveryDef) {
      const availableActions = recoveryDef.actions.filter(action => {
        const requiredLevel = roleHierarchy[action.roleRequired] || 1;
        return userLevel >= requiredLevel;
      });
      
      paths[issueType] = {
        category: recoveryDef.category,
        impact: recoveryDef.impact,
        actions: availableActions
      };
    }
  }
  
  return paths;
}

/**
 * Generate complete recovery guidance for a decision result.
 * 
 * @param {Object} decisionResult - Result from DecisionEngine
 * @param {Array} issues - Detected issues
 * @param {string} userRole - User role
 * @returns {Object} - Complete recovery guidance
 */
function generateRecoveryGuidance(decisionResult, issues, userRole = 'basic') {
  const confidence = decisionResult.context?.confidence || 0.5;
  const tier = getRecoveryTier(confidence);
  const paths = getRecoveryPaths(issues, userRole);
  
  const guidance = {
    confidenceTier: tier.name,
    status: tier.status,
    requiresAction: tier.status !== 'nominal' && tier.status !== 'informational',
    message: tier.message,
    recoveryPaths: paths,
    automaticActions: [],
    userActions: []
  };
  
  // Collect automatic and user actions
  for (const [issueType, path] of Object.entries(paths)) {
    for (const action of path.actions) {
      if (action.automatic) {
        guidance.automaticActions.push({
          issue: issueType,
          action: action.id,
          label: action.label
        });
      } else {
        guidance.userActions.push({
          issue: issueType,
          action: action.id,
          label: action.label,
          description: action.description
        });
      }
    }
  }
  
  return guidance;
}

/**
 * Validate a recovery action request.
 * 
 * @param {string} actionId - Requested action ID
 * @param {string} issueType - Issue type the action is for
 * @param {string} userRole - User role
 * @returns {Object} - Validation result
 */
function validateRecoveryAction(actionId, issueType, userRole) {
  const recoveryDef = ISSUE_RECOVERY_PATHS[issueType];
  
  if (!recoveryDef) {
    return {
      valid: false,
      error: 'Unknown issue type',
      message: 'This action is not defined in the current StudioOS architecture.'
    };
  }
  
  const action = recoveryDef.actions.find(a => a.id === actionId);
  
  if (!action) {
    return {
      valid: false,
      error: 'Unknown action',
      message: 'This recovery action is not defined for this issue type.'
    };
  }
  
  const roleHierarchy = { basic: 1, standard: 2, advanced: 3 };
  const userLevel = roleHierarchy[userRole] || 1;
  const requiredLevel = roleHierarchy[action.roleRequired] || 1;
  
  if (userLevel < requiredLevel) {
    return {
      valid: false,
      error: 'Insufficient permissions',
      message: `This action requires ${action.roleRequired} role or higher.`
    };
  }
  
  return {
    valid: true,
    action: action,
    message: `Action "${action.label}" is available.`
  };
}

/**
 * Format recovery guidance for display.
 * 
 * @param {Object} guidance - Generated recovery guidance
 * @returns {string} - Formatted display text
 */
function formatRecoveryGuidance(guidance) {
  let output = '';
  
  output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  output += `CONFIDENCE RECOVERY GUIDANCE\n`;
  output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
  
  output += `Status: ${guidance.status.toUpperCase()}\n`;
  output += `Confidence Tier: ${guidance.confidenceTier}\n`;
  
  if (guidance.message) {
    output += `\n${guidance.message}\n`;
  }
  
  if (guidance.automaticActions.length > 0) {
    output += '\n── Automatic Actions Applied ──\n';
    for (const action of guidance.automaticActions) {
      output += `  ✓ ${action.label}\n`;
    }
  }
  
  if (guidance.userActions.length > 0) {
    output += '\n── Available Recovery Actions ──\n';
    for (const action of guidance.userActions) {
      output += `\n  • ${action.label}\n`;
      output += `    ${action.description}\n`;
    }
  }
  
  if (!guidance.requiresAction) {
    output += '\n✓ No action required.\n';
  }
  
  output += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  
  return output;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  RECOVERY_TIERS,
  ISSUE_RECOVERY_PATHS,
  getRecoveryTier,
  getRecoveryPaths,
  generateRecoveryGuidance,
  validateRecoveryAction,
  formatRecoveryGuidance
};
