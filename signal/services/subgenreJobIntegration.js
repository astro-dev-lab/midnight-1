/**
 * Subgenre Job Integration (v2)
 * 
 * Integrates v2 subgenre classification into the StudioOS job pipeline.
 * Provides hooks for classification during job creation and constraint
 * sensitivity adjustment during processing.
 * 
 * GUARDRAILS (Immutable):
 * 1. Subgenre inference NEVER changes presets
 * 2. Subgenre inference NEVER changes parameters
 * 3. Subgenre inference ONLY affects constraint sensitivity
 * 4. Subgenre labels NEVER appear in user-facing output
 */

const {
  classifySubgenre,
  getRiskWeights,
  getConfidenceLevel,
  SUBGENRES,
  SIGNALS
} = require('./subgenreHeuristicsV2');

const { DecisionEngine, applySubgenreContext } = require('./decisionEngine');
const { generateRecoveryGuidance } = require('./confidenceRecovery');

// ============================================================================
// Job Pipeline Hooks
// ============================================================================

/**
 * Pre-processing hook: Classify asset and attach metadata.
 * Called during job creation before processing begins.
 * 
 * @param {Object} job - Job entity
 * @param {Object} signals - Extracted audio signals from analysis
 * @returns {Object} - Enriched job with classification metadata
 */
function classifyOnJobCreate(job, signals) {
  // Extract relevant signals for classification
  const classificationInput = normalizeSignals(signals);
  
  // Perform classification
  const classification = classifySubgenre(classificationInput);
  
  // Get risk weights (does NOT modify job parameters)
  const riskWeights = getRiskWeights(classification.primary);
  
  // Get confidence level
  const confidenceLevel = getConfidenceLevel(classification.confidence);
  
  // Attach to job as internal metadata (never exposed to UI)
  return {
    ...job,
    _classification: {
      primary: classification.primary,
      probability: classification.probability,
      confidence: classification.confidence,
      confidenceLevel,
      isHybrid: classification.isHybrid,
      components: classification.components,
      riskWeights,
      classifiedAt: new Date().toISOString()
    }
  };
}

/**
 * Normalize incoming signals to classification format.
 * Maps various signal source formats to v2 classification schema.
 * 
 * @param {Object} signals - Raw signals from analysis
 * @returns {Object} - Normalized signals
 */
function normalizeSignals(signals) {
  return {
    // Core signals
    bpm: signals.bpm ?? signals.tempo ?? 140,
    bassWeight: signals.bassWeight ?? signals.lowEnd ?? signals.bass ?? 0.5,
    hiHatDensity: signals.hiHatDensity ?? signals.hihatRate ?? signals.percussionDensity ?? 0.5,
    vocalPresence: signals.vocalPresence ?? signals.vocals ?? signals.vocalEnergy ?? 0.3,
    stereoWidth: signals.stereoWidth ?? signals.stereo ?? 0.5,
    dynamicRange: signals.dynamicRange ?? signals.dynamics ?? 12,
    
    // v2 extended signals
    vinylNoise: signals.vinylNoise ?? signals.noiseFloor ?? 0,
    reverbDecay: signals.reverbDecay ?? signals.reverb ?? 0.3,
    distortion: signals.distortion ?? signals.saturation ?? 0,
    cowbellPresence: signals.cowbellPresence ?? 0,
    slidingBass: signals.slidingBass ?? signals.bassSlide ?? 0
  };
}

/**
 * Constraint sensitivity adjustment hook.
 * Adjusts constraint thresholds based on subgenre risk weights.
 * 
 * GUARDRAIL: This ONLY adjusts sensitivity, never presets or parameters.
 * 
 * @param {Object} baseConstraints - Default constraint thresholds
 * @param {Object} classification - Classification metadata from job
 * @returns {Object} - Adjusted constraints
 */
function adjustConstraintSensitivity(baseConstraints, classification) {
  if (!classification || !classification.riskWeights) {
    return baseConstraints;
  }
  
  const weights = classification.riskWeights;
  
  // Clone to avoid mutation
  const adjusted = { ...baseConstraints };
  
  // Adjust loudness sensitivity
  if (adjusted.loudness && weights.clipping) {
    adjusted.loudness = {
      ...adjusted.loudness,
      // Higher weight = stricter limit
      threshold: adjusted.loudness.threshold / weights.clipping,
      warningMargin: adjusted.loudness.warningMargin * weights.clipping
    };
  }
  
  // Adjust low-end sensitivity
  if (adjusted.lowEnd && weights.lowEndMasking) {
    adjusted.lowEnd = {
      ...adjusted.lowEnd,
      monitoringWeight: adjusted.lowEnd.monitoringWeight * weights.lowEndMasking
    };
  }
  
  // Adjust phase sensitivity
  if (adjusted.phase && weights.phaseIssues) {
    adjusted.phase = {
      ...adjusted.phase,
      correlationThreshold: Math.min(
        adjusted.phase.correlationThreshold * weights.phaseIssues,
        0.9
      )
    };
  }
  
  // Adjust dynamics sensitivity
  if (adjusted.dynamics && weights.dynamicsLoss) {
    adjusted.dynamics = {
      ...adjusted.dynamics,
      rangeMinimum: adjusted.dynamics.rangeMinimum * weights.dynamicsLoss
    };
  }
  
  // v2: Adjust artifact sensitivity
  if (adjusted.artifacts && weights.artifactRisk) {
    adjusted.artifacts = {
      ...adjusted.artifacts,
      preservationPriority: weights.artifactRisk > 1 ? 'high' : 'normal'
    };
  }
  
  return adjusted;
}

/**
 * Get decision rules applicable to this classification.
 * 
 * @param {Object} classification - Classification metadata
 * @returns {Array} - Applicable decision rules
 */
function getApplicableRules(classification) {
  const engine = new DecisionEngine(classification);
  return engine.rules.filter(rule => 
    !rule.subgenres || rule.subgenres.includes(classification.primary)
  );
}

/**
 * Process analysis results through decision engine.
 * 
 * @param {Object} analysisResults - Results from audio analysis
 * @param {Object} classification - Classification metadata
 * @returns {Object} - Decision results with recommendations
 */
function processDecisions(analysisResults, classification) {
  const engine = new DecisionEngine(classification);
  
  // Evaluate all applicable rules
  const decisions = engine.evaluate(analysisResults);
  
  // Get any triggered warnings
  const warnings = decisions.filter(d => d.triggered && d.severity === 'warning');
  
  // Get any triggered errors
  const errors = decisions.filter(d => d.triggered && d.severity === 'error');
  
  // Generate recommendations (in approved UX language)
  const recommendations = decisions
    .filter(d => d.triggered)
    .map(d => ({
      category: d.category,
      message: d.uxMessage, // Uses approved language from uxLanguage.js
      severity: d.severity
    }));
  
  return {
    passed: errors.length === 0,
    warnings: warnings.length,
    errors: errors.length,
    recommendations,
    confidence: classification.confidence,
    confidenceLevel: classification.confidenceLevel
  };
}

/**
 * Generate recovery guidance for low-confidence classifications.
 * 
 * @param {Object} classification - Classification metadata
 * @param {Object} job - Job entity
 * @param {string} userRole - User's role (basic/standard/advanced)
 * @returns {Object|null} - Recovery guidance if applicable
 */
function getClassificationRecovery(classification, job, userRole) {
  if (classification.confidenceLevel === 'HIGH' || 
      classification.confidenceLevel === 'MEDIUM') {
    return null; // No recovery needed
  }
  
  // Determine issue type
  const issueType = classification.isHybrid ? 
    'HYBRID_CHARACTERISTICS' : 
    'INSUFFICIENT_SIGNALS';
  
  return generateRecoveryGuidance(
    issueType,
    classification.confidence,
    userRole
  );
}

// ============================================================================
// Job State Hooks
// ============================================================================

/**
 * Hook called when job enters PROCESSING state.
 * 
 * @param {Object} job - Job entity with classification
 * @returns {Object} - Processing configuration
 */
function onJobProcessing(job) {
  const classification = job._classification;
  
  if (!classification) {
    // No classification available, use defaults
    return {
      constraintAdjustments: null,
      appliedRules: [],
      confidenceLevel: 'UNKNOWN'
    };
  }
  
  return {
    constraintAdjustments: adjustConstraintSensitivity(
      getDefaultConstraints(),
      classification
    ),
    appliedRules: getApplicableRules(classification).map(r => r.id),
    confidenceLevel: classification.confidenceLevel
  };
}

/**
 * Hook called when job completes.
 * Generates final report with classification context.
 * 
 * @param {Object} job - Completed job
 * @param {Object} results - Processing results
 * @returns {Object} - Final report (without subgenre labels)
 */
function onJobComplete(job, results) {
  const classification = job._classification;
  
  // GUARDRAIL: Subgenre labels NEVER appear in output
  // We only include confidence-based adjustments in the report
  
  return {
    ...results,
    processingNotes: generateProcessingNotes(classification, results),
    confidenceLevel: classification?.confidenceLevel || 'UNKNOWN'
  };
}

/**
 * Generate processing notes without exposing subgenre.
 * 
 * @param {Object} classification - Classification metadata
 * @param {Object} results - Processing results
 * @returns {Array<string>} - Processing notes in approved language
 */
function generateProcessingNotes(classification, results) {
  const notes = [];
  
  if (!classification) {
    return notes;
  }
  
  // Note about confidence level (without genre labels)
  if (classification.confidenceLevel === 'HIGH') {
    notes.push('Processing completed with high-confidence signal analysis.');
  } else if (classification.confidenceLevel === 'LOW' || 
             classification.confidenceLevel === 'VERY_LOW') {
    notes.push('Processing completed. Signal analysis indicated mixed characteristics; standard constraints were applied.');
  }
  
  // Note about hybrid detection
  if (classification.isHybrid) {
    notes.push('Detected characteristics from multiple production styles. Balanced processing applied.');
  }
  
  // Note about applied adjustments
  if (classification.riskWeights) {
    const adjustedAreas = [];
    if (classification.riskWeights.clipping > 1) adjustedAreas.push('loudness');
    if (classification.riskWeights.phaseIssues > 1) adjustedAreas.push('stereo');
    if (classification.riskWeights.lowEndMasking > 1) adjustedAreas.push('low-end');
    
    if (adjustedAreas.length > 0) {
      notes.push(`Enhanced monitoring applied to: ${adjustedAreas.join(', ')}.`);
    }
  }
  
  return notes;
}

/**
 * Get default constraint thresholds.
 * These are the base values before subgenre adjustment.
 * 
 * @returns {Object} - Default constraints
 */
function getDefaultConstraints() {
  return {
    loudness: {
      threshold: -14, // LUFS
      peak: -1, // dBTP
      warningMargin: 2 // LU
    },
    lowEnd: {
      rolloff: 30, // Hz
      monitoringWeight: 1.0
    },
    phase: {
      correlationThreshold: 0.3,
      lowFreqThreshold: 0.5
    },
    dynamics: {
      rangeMinimum: 6, // LU
      crestFactor: 1.5
    },
    artifacts: {
      preservationPriority: 'normal',
      noiseFloor: -60 // dB
    }
  };
}

// ============================================================================
// Batch Processing Support
// ============================================================================

/**
 * Classify multiple assets in batch.
 * Optimized for catalog-scale processing.
 * 
 * @param {Array<Object>} assets - Array of { id, signals }
 * @returns {Array<Object>} - Classifications
 */
function batchClassify(assets) {
  return assets.map(asset => ({
    id: asset.id,
    classification: classifySubgenre(normalizeSignals(asset.signals))
  }));
}

/**
 * Generate batch classification report.
 * 
 * @param {Array<Object>} classifications - Batch classification results
 * @returns {Object} - Summary report
 */
function generateBatchReport(classifications) {
  const summary = {
    total: classifications.length,
    byConfidenceLevel: {},
    hybridCount: 0,
    averageConfidence: 0
  };
  
  let totalConfidence = 0;
  
  for (const item of classifications) {
    const level = getConfidenceLevel(item.classification.confidence);
    summary.byConfidenceLevel[level] = (summary.byConfidenceLevel[level] || 0) + 1;
    
    if (item.classification.isHybrid) {
      summary.hybridCount++;
    }
    
    totalConfidence += item.classification.confidence;
  }
  
  summary.averageConfidence = totalConfidence / classifications.length;
  summary.averageConfidenceLevel = getConfidenceLevel(summary.averageConfidence);
  
  return summary;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Job hooks
  classifyOnJobCreate,
  onJobProcessing,
  onJobComplete,
  
  // Core functions
  normalizeSignals,
  adjustConstraintSensitivity,
  getApplicableRules,
  processDecisions,
  getClassificationRecovery,
  
  // Batch operations
  batchClassify,
  generateBatchReport,
  
  // Utilities
  getDefaultConstraints,
  generateProcessingNotes,
  
  // Re-exports for convenience
  SUBGENRES,
  SIGNALS
};
