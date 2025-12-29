/**
 * Decision Engine
 * 
 * Explicit rule system for processing decisions.
 * Integrates subgenre heuristics for risk-aware confidence scoring.
 * 
 * Per STUDIOOS_ML_INVESTMENT_CHARTER.md:
 * - Subgenre inference NEVER changes presets
 * - Subgenre inference NEVER changes parameters
 * - Subgenre inference ONLY affects constraint sensitivity
 * - Subgenre inference MUST be overrideable by deterministic metrics
 */

const { 
  SUBGENRES, 
  classifySubgenre, 
  getRiskWeights 
} = require('./subgenreHeuristics');

// ============================================================================
// Rule Definitions
// ============================================================================

/**
 * Decision rules organized by risk category.
 * Each rule defines:
 * - condition: Function that evaluates if rule applies
 * - action: Constraint modification or flag
 * - priority: Higher = evaluated first
 * - overrideable: Whether deterministic metrics can override
 */
const DECISION_RULES = {
  // -------------------------------------------------------------------------
  // Loudness Rules
  // -------------------------------------------------------------------------
  loudness: [
    {
      id: 'LOUD_001',
      name: 'Drill Loudness Cap',
      description: 'Hard-limit loudness increases for drill production profiles',
      condition: (ctx) => ctx.subgenre === SUBGENRES.DRILL && ctx.risks.clippingRisk > 0.5,
      action: (ctx) => ({
        constraint: 'maxLoudnessIncrease',
        value: 2, // LU max increase
        reason: 'Production profile indicates high clipping risk; limiting loudness increase'
      }),
      priority: 100,
      overrideable: false
    },
    {
      id: 'LOUD_002',
      name: 'Boom Bap Dynamics Preservation',
      description: 'Strongly preserve dynamics for boom bap production profiles',
      condition: (ctx) => ctx.subgenre === SUBGENRES.BOOM_BAP && ctx.signals.dynamicRange > 10,
      action: (ctx) => ({
        constraint: 'loudnessNormalization',
        value: 'minimal',
        reason: 'Wide dynamic range detected; preserving natural dynamics'
      }),
      priority: 90,
      overrideable: true
    },
    {
      id: 'LOUD_003',
      name: 'Conservative Hybrid Loudness',
      description: 'Apply conservative loudness for uncertain classifications',
      condition: (ctx) => ctx.isUncertain && ctx.risks.clippingRisk > 0.3,
      action: (ctx) => ({
        constraint: 'maxLoudnessIncrease',
        value: 3,
        reason: 'Uncertain production profile; applying conservative loudness ceiling'
      }),
      priority: 80,
      overrideable: true
    }
  ],

  // -------------------------------------------------------------------------
  // Low-End Rules
  // -------------------------------------------------------------------------
  lowEnd: [
    {
      id: 'LOW_001',
      name: 'Trap Sub-Bass Protection',
      description: 'Reduce low-end loudness aggression for trap production',
      condition: (ctx) => ctx.subgenre === SUBGENRES.TRAP && ctx.signals.subBassEnergy > 0.6,
      action: (ctx) => ({
        constraint: 'lowFrequencyAttenuation',
        value: true,
        attenuationDb: -1.5,
        reason: 'High sub-bass energy detected; applying gentle low-frequency control'
      }),
      priority: 85,
      overrideable: true
    },
    {
      id: 'LOW_002',
      name: 'Drill Low-End Limiting',
      description: 'Strict limiting for dense mid-low regions in drill',
      condition: (ctx) => ctx.subgenre === SUBGENRES.DRILL && ctx.risks.maskingRisk > 0.6,
      action: (ctx) => ({
        constraint: 'truePeakCeiling',
        value: -1.5, // dBTP
        reason: 'Dense low-mid region detected; enforcing stricter true peak ceiling'
      }),
      priority: 95,
      overrideable: false
    },
    {
      id: 'LOW_003',
      name: 'Trap Stereo Low-End',
      description: 'Penalize excessive stereo widening in lows for trap',
      condition: (ctx) => ctx.subgenre === SUBGENRES.TRAP && ctx.signals.stereoWidth > 0.8,
      action: (ctx) => ({
        constraint: 'lowFrequencyStereoWidth',
        value: 'mono',
        crossoverHz: 120,
        reason: 'Wide stereo field detected; collapsing low frequencies to mono for translation'
      }),
      priority: 75,
      overrideable: true
    }
  ],

  // -------------------------------------------------------------------------
  // Vocal Rules
  // -------------------------------------------------------------------------
  vocal: [
    {
      id: 'VOC_001',
      name: 'Trap Vocal Presence',
      description: 'Protect vocal presence in 2-5 kHz for trap production',
      condition: (ctx) => ctx.subgenre === SUBGENRES.TRAP && ctx.risks.maskingRisk > 0.4,
      action: (ctx) => ({
        constraint: 'vocalPresenceProtection',
        value: true,
        frequencyRange: { min: 2000, max: 5000 },
        reason: 'Masking risk detected; protecting vocal presence region'
      }),
      priority: 80,
      overrideable: true
    },
    {
      id: 'VOC_002',
      name: 'Melodic Vocal Clarity',
      description: 'Weight vocal clarity heavily for melodic rap',
      condition: (ctx) => ctx.subgenre === SUBGENRES.MELODIC && ctx.signals.mixBalance === 'vocal-dominant',
      action: (ctx) => ({
        constraint: 'vocalClarityWeight',
        value: 1.5, // Multiplier for vocal clarity in confidence
        reason: 'Vocal-dominant mix detected; prioritizing vocal intelligibility'
      }),
      priority: 85,
      overrideable: true
    }
  ],

  // -------------------------------------------------------------------------
  // Stereo/Phase Rules
  // -------------------------------------------------------------------------
  stereo: [
    {
      id: 'STER_001',
      name: 'Melodic Phase Protection',
      description: 'Protect mono compatibility for melodic rap',
      condition: (ctx) => ctx.subgenre === SUBGENRES.MELODIC && ctx.risks.phaseCollapseRisk > 0.3,
      action: (ctx) => ({
        constraint: 'monoCompatibilityCheck',
        value: true,
        threshold: 0.7, // Minimum correlation coefficient
        reason: 'Wide stereo effects detected; monitoring phase correlation'
      }),
      priority: 80,
      overrideable: true
    },
    {
      id: 'STER_002',
      name: 'Melodic Stereo Widening Limit',
      description: 'Penalize excessive stereo widening for melodic rap',
      condition: (ctx) => ctx.subgenre === SUBGENRES.MELODIC && ctx.signals.stereoWidth > 0.85,
      action: (ctx) => ({
        constraint: 'maxStereoWidth',
        value: 0.85,
        reason: 'Excessive stereo width detected; limiting to preserve mono compatibility'
      }),
      priority: 75,
      overrideable: true
    }
  ],

  // -------------------------------------------------------------------------
  // Dynamics/Compression Rules
  // -------------------------------------------------------------------------
  dynamics: [
    {
      id: 'DYN_001',
      name: 'Melodic Limiting Avoidance',
      description: 'Avoid aggressive limiting for melodic rap',
      condition: (ctx) => ctx.subgenre === SUBGENRES.MELODIC && ctx.signals.dynamicRange > 8,
      action: (ctx) => ({
        constraint: 'limitingStyle',
        value: 'gentle',
        maxGainReduction: 3, // dB
        reason: 'Good dynamic range detected; preserving with gentle limiting'
      }),
      priority: 85,
      overrideable: true
    },
    {
      id: 'DYN_002',
      name: 'Boom Bap Transient Preservation',
      description: 'Favor transient preservation for boom bap',
      condition: (ctx) => ctx.subgenre === SUBGENRES.BOOM_BAP,
      action: (ctx) => ({
        constraint: 'transientPreservation',
        value: true,
        attackMs: 30,
        reason: 'Boom bap production profile; preserving transient punch'
      }),
      priority: 90,
      overrideable: true
    },
    {
      id: 'DYN_003',
      name: 'Boom Bap Compression Artifact Sensitivity',
      description: 'Increase confidence penalty for compression artifacts',
      condition: (ctx) => ctx.subgenre === SUBGENRES.BOOM_BAP && ctx.risks.overCompressionRisk > 0.4,
      action: (ctx) => ({
        constraint: 'compressionArtifactPenalty',
        value: 1.5, // Multiplier
        reason: 'Compression artifact risk detected; increasing sensitivity'
      }),
      priority: 80,
      overrideable: true
    }
  ],

  // -------------------------------------------------------------------------
  // Translation Risk Rules
  // -------------------------------------------------------------------------
  translation: [
    {
      id: 'TRANS_001',
      name: 'Drill Translation Flagging',
      description: 'Flag translation risk more aggressively for drill',
      condition: (ctx) => ctx.subgenre === SUBGENRES.DRILL && ctx.risks.translationRisk > 0.4,
      action: (ctx) => ({
        constraint: 'translationRiskFlag',
        value: 'elevated',
        threshold: 0.4, // Lower threshold for flagging
        reason: 'Dense mix detected; flagging potential translation issues on smaller speakers'
      }),
      priority: 85,
      overrideable: true
    }
  ],

  // -------------------------------------------------------------------------
  // Uncertainty Rules
  // -------------------------------------------------------------------------
  uncertainty: [
    {
      id: 'UNC_001',
      name: 'Hybrid Conservative DSP',
      description: 'Apply conservative DSP for uncertain classifications',
      condition: (ctx) => ctx.isUncertain,
      action: (ctx) => ({
        constraint: 'processingMode',
        value: 'conservative',
        reason: 'Production profile uncertain; applying conservative processing'
      }),
      priority: 100,
      overrideable: false
    },
    {
      id: 'UNC_002',
      name: 'Hybrid Uncertainty Penalty',
      description: 'Increase confidence penalty for uncertain classifications',
      condition: (ctx) => ctx.isUncertain && ctx.classification.confidence < 0.5,
      action: (ctx) => ({
        constraint: 'uncertaintyPenalty',
        value: 0.1, // Additive penalty to confidence deduction
        reason: 'Uncertain production profile; widening confidence margin'
      }),
      priority: 95,
      overrideable: false
    },
    {
      id: 'UNC_003',
      name: 'Conflicting Signals Explanation',
      description: 'Require clear explanation for conflicting signals',
      condition: (ctx) => ctx.classification.conflictingSignals,
      action: (ctx) => ({
        constraint: 'reportExplanation',
        value: 'required',
        template: 'conflicting_signals',
        reason: 'Conflicting signal patterns detected'
      }),
      priority: 90,
      overrideable: false
    }
  ]
};

// ============================================================================
// Decision Engine Core
// ============================================================================

class DecisionEngine {
  constructor(options = {}) {
    this.rules = this._flattenRules(DECISION_RULES);
    this.enableLogging = options.logging || false;
  }

  /**
   * Flatten nested rules into priority-sorted array.
   */
  _flattenRules(rulesByCategory) {
    const allRules = [];
    for (const category of Object.values(rulesByCategory)) {
      allRules.push(...category);
    }
    return allRules.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Build decision context from signals and risks.
   * 
   * @param {Object} signals - Audio signal measurements
   * @param {Object} risks - Calculated risk scores
   * @returns {Object} - Decision context
   */
  buildContext(signals, risks) {
    const classification = classifySubgenre(signals);
    const riskWeights = getRiskWeights(classification);
    
    return {
      signals,
      risks,
      classification,
      subgenre: classification.primary,
      isUncertain: classification.isUncertain,
      riskWeights
    };
  }

  /**
   * Evaluate all applicable rules and return constraints.
   * 
   * @param {Object} context - Decision context
   * @returns {Object} - Aggregated constraints and decisions
   */
  evaluate(context) {
    const decisions = [];
    const constraints = {};
    const appliedRules = [];
    
    for (const rule of this.rules) {
      try {
        if (rule.condition(context)) {
          const result = rule.action(context);
          
          decisions.push({
            ruleId: rule.id,
            ruleName: rule.name,
            ...result
          });
          
          // Merge constraints (later rules don't override earlier ones)
          if (result.constraint && !(result.constraint in constraints)) {
            constraints[result.constraint] = {
              value: result.value,
              reason: result.reason,
              ruleId: rule.id,
              overrideable: rule.overrideable
            };
          }
          
          appliedRules.push(rule.id);
          
          if (this.enableLogging) {
            console.log(`[DecisionEngine] Rule ${rule.id} applied: ${rule.name}`);
          }
        }
      } catch (error) {
        console.error(`[DecisionEngine] Error evaluating rule ${rule.id}:`, error.message);
      }
    }
    
    return {
      decisions,
      constraints,
      appliedRules,
      context: {
        subgenre: context.subgenre,
        confidence: context.classification.confidence,
        isUncertain: context.isUncertain,
        riskWeights: context.riskWeights
      }
    };
  }

  /**
   * Process signals through complete decision pipeline.
   * 
   * @param {Object} signals - Audio signal measurements
   * @param {Object} risks - Calculated risk scores
   * @returns {Object} - Complete decision result
   */
  process(signals, risks) {
    const context = this.buildContext(signals, risks);
    const result = this.evaluate(context);
    
    return {
      ...result,
      subgenreLikelihood: context.classification.likelihoods,
      riskWeights: context.riskWeights
    };
  }

  /**
   * Apply risk weights to calculate weighted confidence score.
   * 
   * @param {Object} baseRisks - Base risk scores (0-1)
   * @param {Object} riskWeights - Subgenre-specific weight adjustments
   * @returns {Object} - Weighted risks and aggregate confidence
   */
  calculateWeightedConfidence(baseRisks, riskWeights) {
    const weightedRisks = {};
    let totalWeightedRisk = 0;
    let weightSum = 0;
    
    for (const [riskType, baseValue] of Object.entries(baseRisks)) {
      const weight = riskWeights[riskType] || 1.0;
      const weightedValue = baseValue * weight;
      
      weightedRisks[riskType] = {
        base: baseValue,
        weight,
        weighted: weightedValue
      };
      
      totalWeightedRisk += weightedValue;
      weightSum += weight;
    }
    
    // Normalize and invert to get confidence
    const averageWeightedRisk = weightSum > 0 ? totalWeightedRisk / weightSum : 0;
    const confidence = Math.max(0, Math.min(1, 1 - averageWeightedRisk));
    
    return {
      weightedRisks,
      aggregateRisk: averageWeightedRisk,
      confidence,
      confidencePercent: Math.round(confidence * 100)
    };
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  DecisionEngine,
  DECISION_RULES
};
