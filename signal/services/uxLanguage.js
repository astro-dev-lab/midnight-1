/**
 * UX Language Service
 * 
 * Defines how subgenre uncertainty impacts user-facing language.
 * Per StudioOS specs: subgenre is NEVER presented as identity.
 * 
 * Production profile is framed as technical observation, not genre label.
 */

const { SUBGENRES } = require('./subgenreHeuristics');

// ============================================================================
// Language Templates
// ============================================================================

/**
 * Confidence tier thresholds and labels.
 */
const CONFIDENCE_TIERS = {
  HIGH: { min: 0.85, label: 'high', color: 'green' },
  GOOD: { min: 0.70, label: 'good', color: 'blue' },
  MODERATE: { min: 0.55, label: 'moderate', color: 'yellow' },
  LOW: { min: 0.40, label: 'low', color: 'orange' },
  VERY_LOW: { min: 0, label: 'very low', color: 'red' }
};

/**
 * Production profile descriptions - NEVER mention genre names.
 * Describes signal characteristics in technical terms.
 */
const PROFILE_DESCRIPTIONS = {
  [SUBGENRES.TRAP]: {
    brief: 'dense low-frequency content with prominent transients',
    detailed: 'Production profile indicates elevated sub-bass energy with high transient density, typical of aggressive urban production styles.',
    riskContext: 'Mixes with this profile often face challenges with vocal masking and translation to smaller playback systems.'
  },
  
  [SUBGENRES.DRILL]: {
    brief: 'heavily compressed low-mid content with limited dynamic range',
    detailed: 'Production profile shows dense mid-low frequency region with aggressive limiting and narrow stereo field.',
    riskContext: 'This production style carries elevated clipping and translation risk. Conservative processing is recommended.'
  },
  
  [SUBGENRES.MELODIC]: {
    brief: 'vocal-forward mix with wide stereo imaging',
    detailed: 'Production profile emphasizes vocal presence with spacious stereo effects and preserved dynamic range.',
    riskContext: 'Wide stereo content requires careful phase correlation monitoring for mono compatibility.'
  },
  
  [SUBGENRES.BOOM_BAP]: {
    brief: 'midrange-focused with natural dynamics',
    detailed: 'Production profile features strong midrange emphasis with wide dynamic range and minimal sub-bass.',
    riskContext: 'Preserving natural transients and dynamics is critical for this production style.'
  },
  
  [SUBGENRES.HYBRID]: {
    brief: 'mixed production characteristics',
    detailed: 'Production profile shows characteristics that span multiple production styles, suggesting a hybrid or experimental approach.',
    riskContext: 'Conservative processing is applied due to mixed signal patterns.'
  }
};

/**
 * Risk explanation templates.
 * Uses approved StudioOS terminology only.
 */
const RISK_EXPLANATIONS = {
  maskingRisk: {
    label: 'Frequency Masking',
    low: 'Frequency separation is well-maintained.',
    moderate: 'Some frequency overlap detected between elements.',
    high: 'Significant frequency collision detected. Vocal clarity may be affected.'
  },
  
  clippingRisk: {
    label: 'Peak Overload',
    low: 'Peak levels are within safe margins.',
    moderate: 'Peak levels approaching ceiling. Limiting may be applied.',
    high: 'Peak levels exceed recommended ceiling. Hard limiting required.'
  },
  
  translationRisk: {
    label: 'Playback Translation',
    low: 'Mix should translate well across playback systems.',
    moderate: 'Some translation variance expected on smaller speakers.',
    high: 'Significant translation issues likely on non-full-range systems.'
  },
  
  phaseCollapseRisk: {
    label: 'Phase Correlation',
    low: 'Stereo imaging is mono-compatible.',
    moderate: 'Some phase cancellation possible in mono playback.',
    high: 'Significant phase issues detected. Mono compatibility at risk.'
  },
  
  overCompressionRisk: {
    label: 'Dynamic Compression',
    low: 'Dynamic range is well-preserved.',
    moderate: 'Some dynamic compression artifacts possible.',
    high: 'Excessive compression detected. Transient degradation likely.'
  },
  
  vocalIntelligibilityRisk: {
    label: 'Vocal Clarity',
    low: 'Vocal intelligibility is well-preserved.',
    moderate: 'Some vocal clarity concerns in dense sections.',
    high: 'Vocal intelligibility compromised. Review recommended.'
  }
};

/**
 * Uncertainty language templates.
 */
const UNCERTAINTY_TEMPLATES = {
  uncertain: {
    header: 'Production Profile: Mixed Characteristics',
    explanation: 'The analyzed content shows characteristics that do not clearly align with a single production style. Processing decisions are based on the most prevalent signal patterns.',
    confidence: 'Confidence in production profile classification is limited. Conservative processing parameters are applied.'
  },
  
  conflicting: {
    header: 'Production Profile: Conflicting Signals',
    explanation: 'Signal analysis detected conflicting characteristics. For example, the tempo and transient patterns suggest different production approaches.',
    confidence: 'Due to conflicting signals, the system applies conservative constraints to avoid unintended processing artifacts.'
  },
  
  lowConfidence: {
    header: 'Production Profile: Low Classification Confidence',
    explanation: 'The production profile could not be confidently determined from the available signals.',
    confidence: 'Processing will use conservative, genre-agnostic parameters to minimize risk.'
  }
};

/**
 * Constraint explanation templates.
 */
const CONSTRAINT_EXPLANATIONS = {
  maxLoudnessIncrease: {
    template: 'Loudness increase limited to {value} LU to protect against peak overload.',
    reason: 'Production profile indicates elevated clipping risk.'
  },
  
  truePeakCeiling: {
    template: 'True peak ceiling set to {value} dBTP.',
    reason: 'Dense frequency content requires stricter peak limiting.'
  },
  
  loudnessNormalization: {
    template: 'Loudness normalization set to {value} mode.',
    reason: 'Preserving natural dynamics detected in production.'
  },
  
  lowFrequencyAttenuation: {
    template: 'Low-frequency attenuation of {attenuationDb} dB applied below 60 Hz.',
    reason: 'Managing sub-bass energy for improved translation.'
  },
  
  vocalPresenceProtection: {
    template: 'Vocal presence protected in {frequencyRange.min}-{frequencyRange.max} Hz range.',
    reason: 'Masking risk detected in vocal frequency range.'
  },
  
  monoCompatibilityCheck: {
    template: 'Phase correlation monitoring enabled with minimum correlation threshold.',
    reason: 'Wide stereo content detected.'
  },
  
  transientPreservation: {
    template: 'Transient preservation enabled with {attackMs}ms attack time.',
    reason: 'Production style benefits from preserved transient punch.'
  },
  
  processingMode: {
    template: 'Processing mode set to {value}.',
    reason: 'Applied due to uncertain production profile.'
  }
};

// ============================================================================
// Language Generation Functions
// ============================================================================

/**
 * Get confidence tier for a confidence value.
 * 
 * @param {number} confidence - Confidence value 0-1
 * @returns {Object} - Tier object with label and color
 */
function getConfidenceTier(confidence) {
  for (const tier of Object.values(CONFIDENCE_TIERS)) {
    if (confidence >= tier.min) {
      return tier;
    }
  }
  return CONFIDENCE_TIERS.VERY_LOW;
}

/**
 * Generate production profile description.
 * NEVER includes genre labels.
 * 
 * @param {Object} classification - Subgenre classification result
 * @returns {Object} - Profile description object
 */
function generateProfileDescription(classification) {
  const { primary, confidence, isUncertain, conflictingSignals } = classification;
  const profile = PROFILE_DESCRIPTIONS[primary];
  
  if (isUncertain && conflictingSignals) {
    return {
      header: UNCERTAINTY_TEMPLATES.conflicting.header,
      description: UNCERTAINTY_TEMPLATES.conflicting.explanation,
      confidence: UNCERTAINTY_TEMPLATES.conflicting.confidence,
      isUncertain: true
    };
  }
  
  if (isUncertain) {
    return {
      header: UNCERTAINTY_TEMPLATES.uncertain.header,
      description: UNCERTAINTY_TEMPLATES.uncertain.explanation,
      confidence: UNCERTAINTY_TEMPLATES.uncertain.confidence,
      isUncertain: true
    };
  }
  
  if (confidence < 0.5) {
    return {
      header: UNCERTAINTY_TEMPLATES.lowConfidence.header,
      description: UNCERTAINTY_TEMPLATES.lowConfidence.explanation,
      confidence: UNCERTAINTY_TEMPLATES.lowConfidence.confidence,
      isUncertain: true
    };
  }
  
  return {
    header: `Production Profile: ${profile.brief}`,
    description: profile.detailed,
    riskContext: profile.riskContext,
    confidence: `Classification confidence: ${(confidence * 100).toFixed(0)}%`,
    isUncertain: false
  };
}

/**
 * Generate risk explanation for a specific risk type.
 * 
 * @param {string} riskType - Risk type key
 * @param {number} riskValue - Risk value 0-1
 * @returns {Object} - Risk explanation
 */
function generateRiskExplanation(riskType, riskValue) {
  const template = RISK_EXPLANATIONS[riskType];
  if (!template) {
    return {
      label: riskType,
      level: 'unknown',
      explanation: 'Risk assessment unavailable.'
    };
  }
  
  let level, explanation;
  if (riskValue < 0.3) {
    level = 'low';
    explanation = template.low;
  } else if (riskValue < 0.6) {
    level = 'moderate';
    explanation = template.moderate;
  } else {
    level = 'high';
    explanation = template.high;
  }
  
  return {
    label: template.label,
    level,
    value: riskValue,
    explanation
  };
}

/**
 * Generate constraint explanation.
 * 
 * @param {string} constraintType - Constraint key
 * @param {Object} constraintData - Constraint value and metadata
 * @returns {string} - Human-readable explanation
 */
function generateConstraintExplanation(constraintType, constraintData) {
  const template = CONSTRAINT_EXPLANATIONS[constraintType];
  if (!template) {
    return `${constraintType} set to ${JSON.stringify(constraintData.value)}`;
  }
  
  // Simple template interpolation
  let text = template.template;
  if (typeof constraintData.value === 'object') {
    for (const [key, val] of Object.entries(constraintData.value)) {
      text = text.replace(`{${key}}`, val);
    }
  } else {
    text = text.replace('{value}', constraintData.value);
  }
  
  // Replace any remaining placeholders from constraintData
  for (const [key, val] of Object.entries(constraintData)) {
    if (key !== 'value' && typeof val !== 'object') {
      text = text.replace(`{${key}}`, val);
    }
  }
  
  return text;
}

/**
 * Generate complete processing report language.
 * 
 * @param {Object} decisionResult - Full decision engine result
 * @returns {Object} - Complete report language
 */
function generateReportLanguage(decisionResult) {
  const { context, constraints, appliedRules, subgenreLikelihood, riskWeights } = decisionResult;
  const classification = {
    primary: context.subgenre,
    confidence: context.confidence,
    isUncertain: context.isUncertain,
    likelihoods: subgenreLikelihood
  };
  
  // Generate profile section
  const profileSection = generateProfileDescription(classification);
  
  // Generate constraint explanations
  const constraintExplanations = [];
  for (const [type, data] of Object.entries(constraints)) {
    constraintExplanations.push({
      constraint: type,
      explanation: generateConstraintExplanation(type, data),
      reason: data.reason,
      overrideable: data.overrideable
    });
  }
  
  // Generate confidence summary
  const confidenceTier = getConfidenceTier(context.confidence);
  
  return {
    profile: profileSection,
    constraints: constraintExplanations,
    summary: {
      confidenceTier,
      rulesApplied: appliedRules.length,
      constraintsActive: Object.keys(constraints).length,
      processingApproach: context.isUncertain ? 'conservative' : 'optimized'
    },
    // Never expose internal subgenre labels to users
    _internal: {
      subgenre: context.subgenre,
      likelihoods: subgenreLikelihood,
      riskWeights
    }
  };
}

/**
 * Format report for display (user-facing output).
 * 
 * @param {Object} reportLanguage - Generated report language
 * @returns {string} - Formatted display text
 */
function formatReportForDisplay(reportLanguage) {
  const { profile, constraints, summary } = reportLanguage;
  
  let output = '';
  
  // Profile section
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  output += `${profile.header}\n`;
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  output += `${profile.description}\n\n`;
  
  if (profile.riskContext) {
    output += `⚠ ${profile.riskContext}\n\n`;
  }
  
  output += `${profile.confidence}\n\n`;
  
  // Constraints section
  if (constraints.length > 0) {
    output += `──────────────────────────────────────────────────────────────────\n`;
    output += `Processing Constraints Applied\n`;
    output += `──────────────────────────────────────────────────────────────────\n\n`;
    
    for (const constraint of constraints) {
      output += `• ${constraint.explanation}\n`;
      output += `  Reason: ${constraint.reason}\n`;
      if (!constraint.overrideable) {
        output += `  [Non-overrideable]\n`;
      }
      output += '\n';
    }
  }
  
  // Summary
  output += `──────────────────────────────────────────────────────────────────\n`;
  output += `Summary\n`;
  output += `──────────────────────────────────────────────────────────────────\n\n`;
  output += `Confidence Level: ${summary.confidenceTier.label.toUpperCase()}\n`;
  output += `Processing Approach: ${summary.processingApproach}\n`;
  output += `Rules Applied: ${summary.rulesApplied}\n`;
  output += `Active Constraints: ${summary.constraintsActive}\n`;
  
  return output;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  CONFIDENCE_TIERS,
  PROFILE_DESCRIPTIONS,
  RISK_EXPLANATIONS,
  UNCERTAINTY_TEMPLATES,
  CONSTRAINT_EXPLANATIONS,
  getConfidenceTier,
  generateProfileDescription,
  generateRiskExplanation,
  generateConstraintExplanation,
  generateReportLanguage,
  formatReportForDisplay
};
