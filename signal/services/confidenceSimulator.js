/**
 * Confidence Simulator
 * 
 * Simulates confidence outcomes across subgenres for testing and validation.
 * Demonstrates how subgenre classification affects risk weighting and final confidence.
 */

const { SUBGENRES, classifySubgenre, getRiskWeights, SUBGENRE_PROFILES } = require('./subgenreHeuristics');
const { DecisionEngine } = require('./decisionEngine');

// ============================================================================
// Simulation Scenarios
// ============================================================================

/**
 * Predefined signal profiles for simulation.
 * Each represents a typical mix within its subgenre.
 */
const SIMULATION_SCENARIOS = {
  // Clean trap mix - well-balanced
  trapClean: {
    name: 'Trap - Clean Mix',
    signals: {
      bpm: 140,
      subBassEnergy: 0.7,
      transientDensity: 0.65,
      dynamicRange: 7,
      stereoWidth: 0.5,
      mixBalance: 'balanced'
    },
    risks: {
      maskingRisk: 0.35,
      clippingRisk: 0.25,
      translationRisk: 0.3,
      phaseCollapseRisk: 0.15,
      overCompressionRisk: 0.2,
      vocalIntelligibilityRisk: 0.2
    }
  },

  // Trap mix with issues
  trapProblematic: {
    name: 'Trap - Problematic Mix',
    signals: {
      bpm: 145,
      subBassEnergy: 0.85,
      transientDensity: 0.75,
      dynamicRange: 5,
      stereoWidth: 0.85,
      mixBalance: 'balanced'
    },
    risks: {
      maskingRisk: 0.6,
      clippingRisk: 0.5,
      translationRisk: 0.55,
      phaseCollapseRisk: 0.3,
      overCompressionRisk: 0.45,
      vocalIntelligibilityRisk: 0.4
    }
  },

  // Drill - typical aggressive mix
  drillTypical: {
    name: 'Drill - Typical Mix',
    signals: {
      bpm: 140,
      subBassEnergy: 0.8,
      transientDensity: 0.75,
      dynamicRange: 4,
      stereoWidth: 0.35,
      mixBalance: 'beat-dominant'
    },
    risks: {
      maskingRisk: 0.65,
      clippingRisk: 0.55,
      translationRisk: 0.55,
      phaseCollapseRisk: 0.2,
      overCompressionRisk: 0.6,
      vocalIntelligibilityRisk: 0.35
    }
  },

  // Drill with serious issues
  drillExtreme: {
    name: 'Drill - Extreme Mix',
    signals: {
      bpm: 142,
      subBassEnergy: 0.92,
      transientDensity: 0.85,
      dynamicRange: 2.5,
      stereoWidth: 0.25,
      mixBalance: 'beat-dominant'
    },
    risks: {
      maskingRisk: 0.8,
      clippingRisk: 0.75,
      translationRisk: 0.7,
      phaseCollapseRisk: 0.25,
      overCompressionRisk: 0.8,
      vocalIntelligibilityRisk: 0.5
    }
  },

  // Melodic rap - spacious mix
  melodicClean: {
    name: 'Melodic Rap - Clean Mix',
    signals: {
      bpm: 110,
      subBassEnergy: 0.45,
      transientDensity: 0.35,
      dynamicRange: 11,
      stereoWidth: 0.75,
      mixBalance: 'vocal-dominant'
    },
    risks: {
      maskingRisk: 0.2,
      clippingRisk: 0.15,
      translationRisk: 0.35,
      phaseCollapseRisk: 0.3,
      overCompressionRisk: 0.15,
      vocalIntelligibilityRisk: 0.25
    }
  },

  // Melodic rap with phase issues
  melodicPhaseIssues: {
    name: 'Melodic Rap - Phase Issues',
    signals: {
      bpm: 105,
      subBassEnergy: 0.4,
      transientDensity: 0.3,
      dynamicRange: 10,
      stereoWidth: 0.92,
      mixBalance: 'vocal-dominant'
    },
    risks: {
      maskingRisk: 0.25,
      clippingRisk: 0.2,
      translationRisk: 0.55,
      phaseCollapseRisk: 0.6,
      overCompressionRisk: 0.2,
      vocalIntelligibilityRisk: 0.35
    }
  },

  // Boom bap - classic sound
  boomBapClassic: {
    name: 'Boom Bap - Classic Mix',
    signals: {
      bpm: 92,
      subBassEnergy: 0.25,
      transientDensity: 0.55,
      dynamicRange: 13,
      stereoWidth: 0.55,
      mixBalance: 'vocal-dominant'
    },
    risks: {
      maskingRisk: 0.25,
      clippingRisk: 0.15,
      translationRisk: 0.2,
      phaseCollapseRisk: 0.15,
      overCompressionRisk: 0.35,
      vocalIntelligibilityRisk: 0.2
    }
  },

  // Boom bap - over-compressed
  boomBapCompressed: {
    name: 'Boom Bap - Over-Compressed',
    signals: {
      bpm: 95,
      subBassEnergy: 0.3,
      transientDensity: 0.45,
      dynamicRange: 6,
      stereoWidth: 0.5,
      mixBalance: 'vocal-dominant'
    },
    risks: {
      maskingRisk: 0.3,
      clippingRisk: 0.25,
      translationRisk: 0.25,
      phaseCollapseRisk: 0.15,
      overCompressionRisk: 0.65,
      vocalIntelligibilityRisk: 0.25
    }
  },

  // Hybrid - ambiguous signals
  hybridAmbiguous: {
    name: 'Hybrid - Ambiguous',
    signals: {
      bpm: 120,
      subBassEnergy: 0.5,
      transientDensity: 0.5,
      dynamicRange: 8,
      stereoWidth: 0.6,
      mixBalance: 'balanced'
    },
    risks: {
      maskingRisk: 0.4,
      clippingRisk: 0.35,
      translationRisk: 0.4,
      phaseCollapseRisk: 0.3,
      overCompressionRisk: 0.35,
      vocalIntelligibilityRisk: 0.3
    }
  },

  // Hybrid - conflicting signals
  hybridConflicting: {
    name: 'Hybrid - Conflicting Signals',
    signals: {
      bpm: 135,          // Could be trap or drill
      subBassEnergy: 0.2, // Suggests boom bap
      transientDensity: 0.3, // Suggests melodic
      dynamicRange: 12,   // Suggests melodic/boom bap
      stereoWidth: 0.85,  // Suggests melodic
      mixBalance: 'balanced'
    },
    risks: {
      maskingRisk: 0.35,
      clippingRisk: 0.3,
      translationRisk: 0.45,
      phaseCollapseRisk: 0.4,
      overCompressionRisk: 0.25,
      vocalIntelligibilityRisk: 0.3
    }
  }
};

// ============================================================================
// Simulation Functions
// ============================================================================

/**
 * Run a single simulation scenario.
 * 
 * @param {Object} scenario - Scenario definition
 * @returns {Object} - Complete simulation result
 */
function runScenario(scenario) {
  const engine = new DecisionEngine();
  
  // Get classification
  const classification = classifySubgenre(scenario.signals);
  const riskWeights = getRiskWeights(classification);
  
  // Run through decision engine
  const decision = engine.process(scenario.signals, scenario.risks);
  
  // Calculate weighted confidence
  const confidenceResult = engine.calculateWeightedConfidence(
    scenario.risks, 
    riskWeights
  );
  
  return {
    scenario: scenario.name,
    classification: {
      primary: classification.primary,
      confidence: classification.confidence,
      isUncertain: classification.isUncertain,
      likelihoods: classification.likelihoods,
      conflictingSignals: classification.conflictingSignals
    },
    riskWeights,
    appliedRules: decision.appliedRules,
    constraints: decision.constraints,
    confidence: {
      base: calculateBaseConfidence(scenario.risks),
      weighted: confidenceResult.confidence,
      percent: confidenceResult.confidencePercent,
      delta: confidenceResult.confidence - calculateBaseConfidence(scenario.risks)
    },
    weightedRisks: confidenceResult.weightedRisks
  };
}

/**
 * Calculate unweighted base confidence.
 */
function calculateBaseConfidence(risks) {
  const values = Object.values(risks);
  const avgRisk = values.reduce((a, b) => a + b, 0) / values.length;
  return 1 - avgRisk;
}

/**
 * Run all simulation scenarios and generate report.
 * 
 * @returns {Object} - Complete simulation report
 */
function runAllScenarios() {
  const results = {};
  const summary = {
    bySubgenre: {},
    confidenceRange: { min: 1, max: 0 },
    ruleApplications: {}
  };
  
  for (const [key, scenario] of Object.entries(SIMULATION_SCENARIOS)) {
    const result = runScenario(scenario);
    results[key] = result;
    
    // Track by subgenre
    const subgenre = result.classification.primary;
    if (!summary.bySubgenre[subgenre]) {
      summary.bySubgenre[subgenre] = {
        scenarios: [],
        avgConfidence: 0,
        avgDelta: 0
      };
    }
    summary.bySubgenre[subgenre].scenarios.push({
      name: scenario.name,
      confidence: result.confidence.percent,
      delta: result.confidence.delta
    });
    
    // Track confidence range
    summary.confidenceRange.min = Math.min(
      summary.confidenceRange.min, 
      result.confidence.weighted
    );
    summary.confidenceRange.max = Math.max(
      summary.confidenceRange.max, 
      result.confidence.weighted
    );
    
    // Track rule applications
    for (const ruleId of result.appliedRules) {
      summary.ruleApplications[ruleId] = (summary.ruleApplications[ruleId] || 0) + 1;
    }
  }
  
  // Calculate averages
  for (const subgenre of Object.keys(summary.bySubgenre)) {
    const data = summary.bySubgenre[subgenre];
    data.avgConfidence = data.scenarios.reduce((a, s) => a + s.confidence, 0) / data.scenarios.length;
    data.avgDelta = data.scenarios.reduce((a, s) => a + s.delta, 0) / data.scenarios.length;
  }
  
  return { results, summary };
}

/**
 * Generate human-readable simulation report.
 * 
 * @returns {string} - Formatted report
 */
function generateReport() {
  const { results, summary } = runAllScenarios();
  
  let report = '═══════════════════════════════════════════════════════════════════\n';
  report += '                  SUBGENRE CONFIDENCE SIMULATION REPORT\n';
  report += '═══════════════════════════════════════════════════════════════════\n\n';
  
  // Summary by subgenre
  report += '┌─────────────────────────────────────────────────────────────────┐\n';
  report += '│ SUMMARY BY SUBGENRE                                             │\n';
  report += '├─────────────────────────────────────────────────────────────────┤\n';
  
  for (const [subgenre, data] of Object.entries(summary.bySubgenre)) {
    report += `│ ${subgenre.toUpperCase().padEnd(12)} │ Avg Confidence: ${data.avgConfidence.toFixed(1)}% │ Avg Delta: ${(data.avgDelta * 100).toFixed(2).padStart(6)}% │\n`;
  }
  report += '└─────────────────────────────────────────────────────────────────┘\n\n';
  
  // Detailed results
  report += '┌─────────────────────────────────────────────────────────────────┐\n';
  report += '│ DETAILED SCENARIO RESULTS                                       │\n';
  report += '└─────────────────────────────────────────────────────────────────┘\n\n';
  
  for (const [key, result] of Object.entries(results)) {
    report += `▶ ${result.scenario}\n`;
    report += `  Classification: ${result.classification.primary} (${(result.classification.confidence * 100).toFixed(1)}% confidence)\n`;
    report += `  Uncertain: ${result.classification.isUncertain ? 'YES' : 'NO'}`;
    if (result.classification.conflictingSignals) {
      report += ' | Conflicting Signals Detected';
    }
    report += '\n';
    report += `  Base Confidence: ${(result.confidence.base * 100).toFixed(1)}%\n`;
    report += `  Weighted Confidence: ${result.confidence.percent}%\n`;
    report += `  Delta: ${(result.confidence.delta * 100).toFixed(2)}%\n`;
    report += `  Rules Applied: ${result.appliedRules.join(', ') || 'None'}\n`;
    
    if (Object.keys(result.constraints).length > 0) {
      report += '  Constraints:\n';
      for (const [constraint, data] of Object.entries(result.constraints)) {
        report += `    - ${constraint}: ${JSON.stringify(data.value)}\n`;
      }
    }
    report += '\n';
  }
  
  // Rule application frequency
  report += '┌─────────────────────────────────────────────────────────────────┐\n';
  report += '│ RULE APPLICATION FREQUENCY                                      │\n';
  report += '├─────────────────────────────────────────────────────────────────┤\n';
  
  const sortedRules = Object.entries(summary.ruleApplications)
    .sort(([, a], [, b]) => b - a);
  
  for (const [ruleId, count] of sortedRules) {
    report += `│ ${ruleId.padEnd(15)} │ ${count} applications ${'█'.repeat(count).padEnd(20)} │\n`;
  }
  report += '└─────────────────────────────────────────────────────────────────┘\n';
  
  return report;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  SIMULATION_SCENARIOS,
  runScenario,
  runAllScenarios,
  generateReport
};

// Run if executed directly
if (require.main === module) {
  console.log(generateReport());
}
