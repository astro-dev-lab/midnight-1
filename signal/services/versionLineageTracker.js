/**
 * Version Lineage Tracker
 * 
 * Tracks DSP deltas across asset versions, analyzes cumulative
 * impact of processing chains, and detects patterns in version
 * history that may indicate quality degradation.
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Version tracking enables
 * transparency in processing history and quality assurance.
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Version relationship types
 */
const VersionRelation = Object.freeze({
  ORIGINAL: 'ORIGINAL',       // First version in lineage
  DERIVED: 'DERIVED',         // Derived from parent
  REMASTER: 'REMASTER',       // Remastered version
  REMIX: 'REMIX',             // Remix (different arrangement)
  ALTERNATE: 'ALTERNATE',     // Alternate mix/take
  REVISION: 'REVISION'        // Minor revision/fix
});

/**
 * Processing impact levels
 */
const ImpactLevel = Object.freeze({
  NONE: 'NONE',               // No measurable change
  MINIMAL: 'MINIMAL',         // < 0.5 dB change
  LOW: 'LOW',                 // 0.5-1.5 dB change
  MODERATE: 'MODERATE',       // 1.5-3 dB change
  HIGH: 'HIGH',               // 3-6 dB change
  SEVERE: 'SEVERE'            // > 6 dB change
});

/**
 * Quality trend indicators
 */
const QualityTrend = Object.freeze({
  IMPROVING: 'IMPROVING',
  STABLE: 'STABLE',
  DEGRADING: 'DEGRADING',
  FLUCTUATING: 'FLUCTUATING'
});

/**
 * DSP operation categories
 */
const DSPCategory = Object.freeze({
  DYNAMICS: 'DYNAMICS',       // Compression, limiting, expansion
  EQ: 'EQ',                   // Equalization
  LOUDNESS: 'LOUDNESS',       // Level changes, normalization
  SPATIAL: 'SPATIAL',         // Stereo width, panning
  TIME: 'TIME',               // Reverb, delay
  DISTORTION: 'DISTORTION',   // Saturation, clipping
  RESTORATION: 'RESTORATION', // Noise reduction, de-click
  OTHER: 'OTHER'
});

/**
 * Thresholds for change detection
 */
const THRESHOLDS = Object.freeze({
  LOUDNESS_CHANGE_MINIMAL: 0.5,    // dB
  LOUDNESS_CHANGE_SIGNIFICANT: 2,   // dB
  PEAK_CHANGE_WARNING: 1,           // dB closer to 0
  DYNAMIC_RANGE_CHANGE_WARNING: 2,  // dB
  CREST_FACTOR_CHANGE_WARNING: 1.5, // dB
  CUMULATIVE_LOUDNESS_WARNING: 4,   // dB total change
  CUMULATIVE_PEAK_WARNING: 2,       // dB total change
  MAX_RECOMMENDED_VERSIONS: 5,      // Generation limit warning
  GENERATION_LOSS_THRESHOLD: 0.3    // dB per generation
});

// ============================================================================
// Delta Calculation
// ============================================================================

/**
 * Calculate DSP delta between two versions
 * @param {Object} fromVersion - Source version metrics
 * @param {Object} toVersion - Target version metrics
 * @returns {Object} Delta analysis
 */
function calculateDelta(fromVersion, toVersion) {
  if (!fromVersion || !toVersion) {
    return { error: 'Both versions required for delta calculation' };
  }

  const deltas = {};
  const changes = [];
  let totalImpact = 0;

  // Loudness metrics
  if (fromVersion.integratedLoudness !== undefined && 
      toVersion.integratedLoudness !== undefined) {
    const loudnessDelta = toVersion.integratedLoudness - fromVersion.integratedLoudness;
    deltas.integratedLoudness = Math.round(loudnessDelta * 100) / 100;
    totalImpact += Math.abs(loudnessDelta);
    
    if (Math.abs(loudnessDelta) >= THRESHOLDS.LOUDNESS_CHANGE_MINIMAL) {
      changes.push({
        metric: 'integratedLoudness',
        delta: loudnessDelta,
        direction: loudnessDelta > 0 ? 'INCREASED' : 'DECREASED',
        significance: Math.abs(loudnessDelta) >= THRESHOLDS.LOUDNESS_CHANGE_SIGNIFICANT 
          ? 'HIGH' : 'MODERATE'
      });
    }
  }

  // True peak
  if (fromVersion.truePeak !== undefined && toVersion.truePeak !== undefined) {
    const peakDelta = toVersion.truePeak - fromVersion.truePeak;
    deltas.truePeak = Math.round(peakDelta * 100) / 100;
    
    if (Math.abs(peakDelta) >= 0.5) {
      changes.push({
        metric: 'truePeak',
        delta: peakDelta,
        direction: peakDelta > 0 ? 'INCREASED' : 'DECREASED',
        warning: toVersion.truePeak > -1 ? 'Approaching 0 dBTP' : null
      });
    }
  }

  // Loudness range
  if (fromVersion.loudnessRange !== undefined && 
      toVersion.loudnessRange !== undefined) {
    const lraDelta = toVersion.loudnessRange - fromVersion.loudnessRange;
    deltas.loudnessRange = Math.round(lraDelta * 100) / 100;
    
    if (Math.abs(lraDelta) >= 1) {
      changes.push({
        metric: 'loudnessRange',
        delta: lraDelta,
        direction: lraDelta > 0 ? 'EXPANDED' : 'COMPRESSED',
        category: DSPCategory.DYNAMICS
      });
    }
  }

  // Dynamic range / Crest factor
  if (fromVersion.crestFactor !== undefined && 
      toVersion.crestFactor !== undefined) {
    const crestDelta = toVersion.crestFactor - fromVersion.crestFactor;
    deltas.crestFactor = Math.round(crestDelta * 100) / 100;
    
    if (Math.abs(crestDelta) >= 0.5) {
      changes.push({
        metric: 'crestFactor',
        delta: crestDelta,
        direction: crestDelta > 0 ? 'MORE_DYNAMIC' : 'LESS_DYNAMIC',
        category: DSPCategory.DYNAMICS
      });
    }
  }

  // Sample rate changes
  if (fromVersion.sampleRate !== undefined && 
      toVersion.sampleRate !== undefined) {
    if (fromVersion.sampleRate !== toVersion.sampleRate) {
      deltas.sampleRate = {
        from: fromVersion.sampleRate,
        to: toVersion.sampleRate,
        direction: toVersion.sampleRate > fromVersion.sampleRate 
          ? 'UPSAMPLED' : 'DOWNSAMPLED'
      };
      changes.push({
        metric: 'sampleRate',
        ...deltas.sampleRate,
        warning: toVersion.sampleRate < fromVersion.sampleRate 
          ? 'Lossy conversion' : null
      });
    }
  }

  // Bit depth changes
  if (fromVersion.bitDepth !== undefined && 
      toVersion.bitDepth !== undefined) {
    if (fromVersion.bitDepth !== toVersion.bitDepth) {
      deltas.bitDepth = {
        from: fromVersion.bitDepth,
        to: toVersion.bitDepth,
        direction: toVersion.bitDepth > fromVersion.bitDepth 
          ? 'INCREASED' : 'DECREASED'
      };
      changes.push({
        metric: 'bitDepth',
        ...deltas.bitDepth,
        warning: toVersion.bitDepth < fromVersion.bitDepth 
          ? 'Reduced resolution' : null
      });
    }
  }

  // Duration changes
  if (fromVersion.duration !== undefined && 
      toVersion.duration !== undefined) {
    const durationDelta = toVersion.duration - fromVersion.duration;
    if (Math.abs(durationDelta) > 0.1) {
      deltas.duration = Math.round(durationDelta * 100) / 100;
      changes.push({
        metric: 'duration',
        delta: durationDelta,
        direction: durationDelta > 0 ? 'LENGTHENED' : 'SHORTENED'
      });
    }
  }

  // Calculate overall impact level
  const impactLevel = classifyImpact(totalImpact);

  return {
    deltas,
    changes,
    totalImpact: Math.round(totalImpact * 100) / 100,
    impactLevel,
    hasSignificantChanges: changes.some(c => c.significance === 'HIGH'),
    warnings: changes.filter(c => c.warning).map(c => c.warning)
  };
}

/**
 * Classify impact level from total dB change
 * @param {number} totalImpact - Total impact in dB
 * @returns {string} Impact level
 */
function classifyImpact(totalImpact) {
  if (totalImpact < 0.1) return ImpactLevel.NONE;
  if (totalImpact < 0.5) return ImpactLevel.MINIMAL;
  if (totalImpact < 1.5) return ImpactLevel.LOW;
  if (totalImpact < 3) return ImpactLevel.MODERATE;
  if (totalImpact < 6) return ImpactLevel.HIGH;
  return ImpactLevel.SEVERE;
}

// ============================================================================
// Lineage Analysis
// ============================================================================

/**
 * Build complete lineage from version array
 * @param {Array} versions - Array of version objects with metrics
 * @returns {Object} Lineage structure
 */
function buildLineage(versions) {
  if (!Array.isArray(versions) || versions.length === 0) {
    return { error: 'No versions provided' };
  }

  // Sort by creation date or version number
  const sorted = [...versions].sort((a, b) => {
    if (a.createdAt && b.createdAt) {
      return new Date(a.createdAt) - new Date(b.createdAt);
    }
    return (a.versionNumber || 0) - (b.versionNumber || 0);
  });

  const lineage = {
    versions: [],
    edges: [],
    root: null
  };

  for (let i = 0; i < sorted.length; i++) {
    const version = sorted[i];
    const node = {
      id: version.id || `v${i + 1}`,
      name: version.name || version.versionName || `Version ${i + 1}`,
      generation: i + 1,
      relation: i === 0 ? VersionRelation.ORIGINAL : 
                inferRelation(sorted[i - 1], version),
      metrics: extractMetrics(version),
      createdAt: version.createdAt,
      dspOperations: version.dspOperations || []
    };

    lineage.versions.push(node);

    if (i === 0) {
      lineage.root = node.id;
    } else {
      // Create edge from previous version
      const delta = calculateDelta(
        extractMetrics(sorted[i - 1]),
        extractMetrics(version)
      );

      lineage.edges.push({
        from: lineage.versions[i - 1].id,
        to: node.id,
        delta
      });
    }
  }

  return lineage;
}

/**
 * Extract standard metrics from version object
 * @param {Object} version - Version object
 * @returns {Object} Extracted metrics
 */
function extractMetrics(version) {
  return {
    integratedLoudness: version.integratedLoudness ?? version.integrated ?? version.loudness,
    truePeak: version.truePeak ?? version.truePeakDbfs ?? version.peak,
    loudnessRange: version.loudnessRange ?? version.lra ?? version.range,
    crestFactor: version.crestFactor ?? version.crest,
    sampleRate: version.sampleRate,
    bitDepth: version.bitDepth,
    duration: version.duration
  };
}

/**
 * Infer version relation type
 * @param {Object} parent - Parent version
 * @param {Object} child - Child version
 * @returns {string} Relation type
 */
function inferRelation(parent, child) {
  const name = (child.name || child.versionName || '').toLowerCase();
  
  if (name.includes('remaster')) return VersionRelation.REMASTER;
  if (name.includes('remix')) return VersionRelation.REMIX;
  if (name.includes('alt') || name.includes('alternate')) return VersionRelation.ALTERNATE;
  if (name.includes('fix') || name.includes('rev')) return VersionRelation.REVISION;
  
  // Check for significant metric changes
  const parentMetrics = extractMetrics(parent);
  const childMetrics = extractMetrics(child);
  
  if (parentMetrics.duration && childMetrics.duration) {
    const durationChange = Math.abs(childMetrics.duration - parentMetrics.duration);
    if (durationChange > 30) return VersionRelation.REMIX; // >30s change
  }
  
  return VersionRelation.DERIVED;
}

// ============================================================================
// Cumulative Impact Analysis
// ============================================================================

/**
 * Calculate cumulative impact across entire lineage
 * @param {Object} lineage - Lineage from buildLineage()
 * @returns {Object} Cumulative impact analysis
 */
function calculateCumulativeImpact(lineage) {
  if (lineage.error) {
    return { error: lineage.error };
  }

  if (lineage.versions.length < 2) {
    return {
      generations: lineage.versions.length,
      cumulativeDeltas: {},
      totalImpact: 0,
      impactLevel: ImpactLevel.NONE,
      perGenerationLoss: 0
    };
  }

  const original = lineage.versions[0].metrics;
  const latest = lineage.versions[lineage.versions.length - 1].metrics;

  // Calculate total delta from original to latest
  const totalDelta = calculateDelta(original, latest);

  // Calculate per-generation metrics
  const generations = lineage.versions.length;
  const perGenLoss = totalDelta.totalImpact / (generations - 1);

  // Track cumulative changes
  const cumulativeDeltas = {
    loudness: 0,
    peak: 0,
    dynamicRange: 0
  };

  for (const edge of lineage.edges) {
    if (edge.delta.deltas.integratedLoudness) {
      cumulativeDeltas.loudness += Math.abs(edge.delta.deltas.integratedLoudness);
    }
    if (edge.delta.deltas.truePeak) {
      cumulativeDeltas.peak += Math.abs(edge.delta.deltas.truePeak);
    }
    if (edge.delta.deltas.loudnessRange) {
      cumulativeDeltas.dynamicRange += Math.abs(edge.delta.deltas.loudnessRange);
    }
  }

  // Generate warnings
  const warnings = [];
  
  if (cumulativeDeltas.loudness > THRESHOLDS.CUMULATIVE_LOUDNESS_WARNING) {
    warnings.push({
      type: 'CUMULATIVE_LOUDNESS',
      message: `Cumulative loudness change of ${cumulativeDeltas.loudness.toFixed(1)} dB exceeds recommended threshold`,
      value: cumulativeDeltas.loudness
    });
  }

  if (cumulativeDeltas.peak > THRESHOLDS.CUMULATIVE_PEAK_WARNING) {
    warnings.push({
      type: 'CUMULATIVE_PEAK',
      message: `Cumulative peak change of ${cumulativeDeltas.peak.toFixed(1)} dB may indicate quality degradation`,
      value: cumulativeDeltas.peak
    });
  }

  if (generations > THRESHOLDS.MAX_RECOMMENDED_VERSIONS) {
    warnings.push({
      type: 'EXCESSIVE_GENERATIONS',
      message: `${generations} generations exceeds recommended maximum of ${THRESHOLDS.MAX_RECOMMENDED_VERSIONS}`,
      value: generations
    });
  }

  if (perGenLoss > THRESHOLDS.GENERATION_LOSS_THRESHOLD) {
    warnings.push({
      type: 'HIGH_GENERATION_LOSS',
      message: `Per-generation loss of ${perGenLoss.toFixed(2)} dB is above threshold`,
      value: perGenLoss
    });
  }

  return {
    generations,
    totalDelta,
    cumulativeDeltas: {
      loudness: Math.round(cumulativeDeltas.loudness * 100) / 100,
      peak: Math.round(cumulativeDeltas.peak * 100) / 100,
      dynamicRange: Math.round(cumulativeDeltas.dynamicRange * 100) / 100
    },
    totalImpact: totalDelta.totalImpact,
    impactLevel: totalDelta.impactLevel,
    perGenerationLoss: Math.round(perGenLoss * 100) / 100,
    warnings
  };
}

// ============================================================================
// Pattern Detection
// ============================================================================

/**
 * Detect processing patterns across versions
 * @param {Object} lineage - Lineage from buildLineage()
 * @returns {Object} Pattern analysis
 */
function detectPatterns(lineage) {
  if (lineage.error || lineage.versions.length < 2) {
    return { patterns: [], trend: QualityTrend.STABLE };
  }

  const patterns = [];
  const loudnessChanges = [];
  const dynamicChanges = [];

  // Collect changes
  for (const edge of lineage.edges) {
    if (edge.delta.deltas.integratedLoudness) {
      loudnessChanges.push(edge.delta.deltas.integratedLoudness);
    }
    if (edge.delta.deltas.loudnessRange) {
      dynamicChanges.push(edge.delta.deltas.loudnessRange);
    }
  }

  // Pattern: Consistent loudness increase (loudness war behavior)
  if (loudnessChanges.length >= 2) {
    const allIncreasing = loudnessChanges.every(c => c > 0.3);
    const allDecreasing = loudnessChanges.every(c => c < -0.3);
    const totalLoudnessChange = loudnessChanges.reduce((a, b) => a + b, 0);

    if (allIncreasing && totalLoudnessChange > 2) {
      patterns.push({
        type: 'LOUDNESS_ESCALATION',
        description: 'Progressive loudness increase across versions',
        severity: 'WARNING',
        totalChange: totalLoudnessChange
      });
    }

    if (allDecreasing && totalLoudnessChange < -3) {
      patterns.push({
        type: 'LOUDNESS_REDUCTION',
        description: 'Progressive loudness decrease (possible remastering)',
        severity: 'INFO',
        totalChange: totalLoudnessChange
      });
    }
  }

  // Pattern: Consistent dynamic range reduction
  if (dynamicChanges.length >= 2) {
    const allCompressing = dynamicChanges.every(c => c < -0.5);
    const totalDRChange = dynamicChanges.reduce((a, b) => a + b, 0);

    if (allCompressing && totalDRChange < -2) {
      patterns.push({
        type: 'DYNAMIC_COMPRESSION',
        description: 'Progressive dynamic range compression',
        severity: 'WARNING',
        totalChange: totalDRChange
      });
    }
  }

  // Pattern: Oscillating changes (back and forth)
  if (loudnessChanges.length >= 3) {
    let oscillations = 0;
    for (let i = 1; i < loudnessChanges.length; i++) {
      if ((loudnessChanges[i] > 0) !== (loudnessChanges[i - 1] > 0)) {
        oscillations++;
      }
    }

    if (oscillations >= loudnessChanges.length - 1) {
      patterns.push({
        type: 'OSCILLATING_CHANGES',
        description: 'Inconsistent processing - changes reversed between versions',
        severity: 'WARNING'
      });
    }
  }

  // Pattern: Sample rate degradation
  const sampleRates = lineage.versions
    .map(v => v.metrics.sampleRate)
    .filter(s => s !== undefined);
    
  if (sampleRates.length >= 2) {
    const degrading = sampleRates.slice(1).every((s, i) => s <= sampleRates[i]);
    const final = sampleRates[sampleRates.length - 1];
    const original = sampleRates[0];
    
    if (degrading && final < original) {
      patterns.push({
        type: 'SAMPLE_RATE_DEGRADATION',
        description: `Sample rate reduced from ${original} to ${final} Hz`,
        severity: final < 44100 ? 'ERROR' : 'WARNING'
      });
    }
  }

  // Determine overall quality trend
  const trend = determineQualityTrend(lineage, patterns);

  return {
    patterns,
    patternCount: patterns.length,
    trend,
    hasWarnings: patterns.some(p => p.severity === 'WARNING'),
    hasErrors: patterns.some(p => p.severity === 'ERROR')
  };
}

/**
 * Determine overall quality trend
 * @param {Object} lineage - Lineage structure
 * @param {Array} patterns - Detected patterns
 * @returns {string} Quality trend
 */
function determineQualityTrend(lineage, patterns) {
  const hasNegativePatterns = patterns.some(p => 
    p.severity === 'WARNING' || p.severity === 'ERROR'
  );
  
  const hasOscillating = patterns.some(p => 
    p.type === 'OSCILLATING_CHANGES'
  );
  
  const hasLoudnessReduction = patterns.some(p => 
    p.type === 'LOUDNESS_REDUCTION'
  );

  if (hasOscillating) return QualityTrend.FLUCTUATING;
  if (hasNegativePatterns) return QualityTrend.DEGRADING;
  if (hasLoudnessReduction) return QualityTrend.IMPROVING;
  
  return QualityTrend.STABLE;
}

// ============================================================================
// DSP Operation Tracking
// ============================================================================

/**
 * Track DSP operations applied between versions
 * @param {Object} fromVersion - Source version
 * @param {Object} toVersion - Target version with dspOperations
 * @returns {Object} DSP operation summary
 */
function trackDSPOperations(fromVersion, toVersion) {
  const operations = toVersion.dspOperations || [];
  
  if (operations.length === 0) {
    return {
      operations: [],
      categories: {},
      estimatedImpact: ImpactLevel.NONE
    };
  }

  // Categorize operations
  const categories = {};
  for (const op of operations) {
    const category = op.category || categorizeOperation(op.name || op.type);
    categories[category] = categories[category] || [];
    categories[category].push(op);
  }

  // Estimate impact from operation types
  let impactScore = 0;
  for (const op of operations) {
    impactScore += estimateOperationImpact(op);
  }

  return {
    operations,
    operationCount: operations.length,
    categories,
    categoryBreakdown: Object.entries(categories).map(([cat, ops]) => ({
      category: cat,
      count: ops.length
    })),
    estimatedImpact: classifyImpact(impactScore)
  };
}

/**
 * Categorize a DSP operation by name
 * @param {string} operationName - Operation name
 * @returns {string} DSP category
 */
function categorizeOperation(operationName) {
  const name = (operationName || '').toLowerCase();
  
  if (/compressor|limiter|gate|expander|dynamics/.test(name)) {
    return DSPCategory.DYNAMICS;
  }
  if (/eq|equalizer|filter|low.?pass|high.?pass|shelf|bell/.test(name)) {
    return DSPCategory.EQ;
  }
  if (/gain|level|loudness|normalize|lufs/.test(name)) {
    return DSPCategory.LOUDNESS;
  }
  if (/stereo|pan|width|mid.?side|spatial/.test(name)) {
    return DSPCategory.SPATIAL;
  }
  if (/reverb|delay|echo/.test(name)) {
    return DSPCategory.TIME;
  }
  if (/saturat|distort|overdrive|clip|tape/.test(name)) {
    return DSPCategory.DISTORTION;
  }
  if (/de.?noise|de.?click|restoration|repair/.test(name)) {
    return DSPCategory.RESTORATION;
  }
  
  return DSPCategory.OTHER;
}

/**
 * Estimate impact score from operation
 * @param {Object} operation - DSP operation
 * @returns {number} Impact score
 */
function estimateOperationImpact(operation) {
  const category = operation.category || categorizeOperation(operation.name);
  
  // Base impact by category
  const categoryImpact = {
    [DSPCategory.DYNAMICS]: 1.5,
    [DSPCategory.EQ]: 1.0,
    [DSPCategory.LOUDNESS]: 2.0,
    [DSPCategory.SPATIAL]: 0.5,
    [DSPCategory.TIME]: 0.5,
    [DSPCategory.DISTORTION]: 1.5,
    [DSPCategory.RESTORATION]: 0.3,
    [DSPCategory.OTHER]: 0.5
  };

  return categoryImpact[category] || 0.5;
}

// ============================================================================
// Quick Check
// ============================================================================

/**
 * Quick lineage check
 * @param {Array} versions - Version array
 * @returns {Object} Quick check result
 */
function quickCheck(versions) {
  const lineage = buildLineage(versions);
  
  if (lineage.error) {
    return { error: lineage.error };
  }

  const impact = calculateCumulativeImpact(lineage);
  const patterns = detectPatterns(lineage);

  return {
    generations: lineage.versions.length,
    totalImpact: impact.totalImpact,
    impactLevel: impact.impactLevel,
    trend: patterns.trend,
    hasWarnings: patterns.hasWarnings || impact.warnings.length > 0,
    warningCount: patterns.patterns.filter(p => p.severity === 'WARNING').length + 
                  impact.warnings.length,
    patternCount: patterns.patternCount
  };
}

// ============================================================================
// Full Analysis
// ============================================================================

/**
 * Complete lineage analysis
 * @param {Array} versions - Version array
 * @param {Object} options - Analysis options
 * @returns {Object} Complete analysis
 */
function analyze(versions, options = {}) {
  const lineage = buildLineage(versions);
  
  if (lineage.error) {
    return { error: lineage.error };
  }

  const cumulativeImpact = calculateCumulativeImpact(lineage);
  const patterns = detectPatterns(lineage);

  // Generate recommendations
  const recommendations = [];

  if (cumulativeImpact.impactLevel === ImpactLevel.SEVERE) {
    recommendations.push({
      priority: 'HIGH',
      message: 'Consider reverting to earlier version - cumulative processing impact is severe'
    });
  }

  if (patterns.trend === QualityTrend.DEGRADING) {
    recommendations.push({
      priority: 'HIGH',
      message: 'Quality degradation detected across versions - review processing chain'
    });
  }

  if (patterns.trend === QualityTrend.FLUCTUATING) {
    recommendations.push({
      priority: 'MEDIUM',
      message: 'Inconsistent processing detected - establish standardized workflow'
    });
  }

  if (cumulativeImpact.generations > THRESHOLDS.MAX_RECOMMENDED_VERSIONS) {
    recommendations.push({
      priority: 'MEDIUM',
      message: `${cumulativeImpact.generations} generations is high - consider consolidating versions`
    });
  }

  for (const warning of cumulativeImpact.warnings) {
    if (warning.type === 'HIGH_GENERATION_LOSS') {
      recommendations.push({
        priority: 'MEDIUM',
        message: 'Per-generation quality loss detected - minimize round-trips'
      });
    }
  }

  // Build version summary
  const versionSummary = lineage.versions.map((v, i) => ({
    id: v.id,
    name: v.name,
    generation: v.generation,
    relation: v.relation,
    delta: i > 0 ? lineage.edges[i - 1].delta.impactLevel : null
  }));

  return {
    lineage,
    versionCount: lineage.versions.length,
    versionSummary,
    cumulativeImpact,
    patterns: patterns.patterns,
    trend: patterns.trend,
    recommendations,
    summary: {
      generations: cumulativeImpact.generations,
      totalImpact: cumulativeImpact.totalImpact,
      impactLevel: cumulativeImpact.impactLevel,
      trend: patterns.trend,
      patternCount: patterns.patternCount,
      warningCount: cumulativeImpact.warnings.length + 
                    patterns.patterns.filter(p => p.severity === 'WARNING').length
    },
    analyzedAt: new Date().toISOString()
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Main analysis
  analyze,
  quickCheck,
  
  // Delta calculation
  calculateDelta,
  classifyImpact,
  
  // Lineage building
  buildLineage,
  extractMetrics,
  inferRelation,
  
  // Impact analysis
  calculateCumulativeImpact,
  
  // Pattern detection
  detectPatterns,
  determineQualityTrend,
  
  // DSP tracking
  trackDSPOperations,
  categorizeOperation,
  estimateOperationImpact,
  
  // Constants
  VersionRelation,
  ImpactLevel,
  QualityTrend,
  DSPCategory,
  THRESHOLDS
};
