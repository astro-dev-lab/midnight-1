/**
 * Loudness Standard Compliance Validator
 * 
 * Simultaneously validates audio against all major streaming
 * and broadcast platform loudness specifications.
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Assets must meet delivery
 * specifications across multiple distribution platforms.
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Compliance status levels
 */
const ComplianceStatus = Object.freeze({
  FULLY_COMPLIANT: 'FULLY_COMPLIANT',     // All platforms pass
  MOSTLY_COMPLIANT: 'MOSTLY_COMPLIANT',   // 75%+ platforms pass
  PARTIALLY_COMPLIANT: 'PARTIALLY_COMPLIANT', // 50-75% pass
  NON_COMPLIANT: 'NON_COMPLIANT'          // <50% pass
});

/**
 * Platform categories
 */
const PlatformCategory = Object.freeze({
  STREAMING: 'STREAMING',
  BROADCAST: 'BROADCAST',
  CONTENT_TYPE: 'CONTENT_TYPE'
});

/**
 * Check result types
 */
const CheckResult = Object.freeze({
  PASS: 'PASS',
  WARNING: 'WARNING',
  FAIL: 'FAIL'
});

/**
 * Status descriptions
 */
const STATUS_DESCRIPTIONS = Object.freeze({
  [ComplianceStatus.FULLY_COMPLIANT]: 'Audio meets all platform loudness specifications.',
  [ComplianceStatus.MOSTLY_COMPLIANT]: 'Audio meets most platform specifications with minor adjustments needed.',
  [ComplianceStatus.PARTIALLY_COMPLIANT]: 'Audio requires significant adjustment for many platforms.',
  [ComplianceStatus.NON_COMPLIANT]: 'Audio fails to meet most platform loudness requirements.'
});

/**
 * Platform loudness targets with extended metadata
 */
const PLATFORM_SPECS = Object.freeze({
  // Streaming platforms
  SPOTIFY: {
    name: 'Spotify',
    category: PlatformCategory.STREAMING,
    integrated: -14,
    truePeak: -1,
    lra: { min: 4, max: 16 },
    tolerance: 1.0,
    normalization: 'DOWN_ONLY',
    description: 'Spotify Volume Normalization (Normal mode)'
  },
  SPOTIFY_LOUD: {
    name: 'Spotify Loud',
    category: PlatformCategory.STREAMING,
    integrated: -11,
    truePeak: -1,
    lra: { min: 4, max: 16 },
    tolerance: 1.0,
    normalization: 'DOWN_ONLY',
    description: 'Spotify Loud mode'
  },
  APPLE_MUSIC: {
    name: 'Apple Music',
    category: PlatformCategory.STREAMING,
    integrated: -16,
    truePeak: -1,
    lra: { min: 4, max: 16 },
    tolerance: 0.5,
    normalization: 'UP_AND_DOWN',
    description: 'Apple Sound Check'
  },
  YOUTUBE: {
    name: 'YouTube',
    category: PlatformCategory.STREAMING,
    integrated: -14,
    truePeak: -1,
    lra: { min: 4, max: 16 },
    tolerance: 1.0,
    normalization: 'UP_AND_DOWN',
    description: 'YouTube loudness normalization'
  },
  TIDAL: {
    name: 'Tidal',
    category: PlatformCategory.STREAMING,
    integrated: -14,
    truePeak: -1,
    lra: { min: 4, max: 16 },
    tolerance: 1.0,
    normalization: 'DOWN_ONLY',
    description: 'Tidal HiFi normalization'
  },
  AMAZON_MUSIC: {
    name: 'Amazon Music',
    category: PlatformCategory.STREAMING,
    integrated: -14,
    truePeak: -2,
    lra: { min: 4, max: 16 },
    tolerance: 1.0,
    normalization: 'DOWN_ONLY',
    description: 'Amazon Music loudness normalization'
  },
  DEEZER: {
    name: 'Deezer',
    category: PlatformCategory.STREAMING,
    integrated: -15,
    truePeak: -1,
    lra: { min: 4, max: 16 },
    tolerance: 1.0,
    normalization: 'DOWN_ONLY',
    description: 'Deezer loudness normalization'
  },
  SOUNDCLOUD: {
    name: 'SoundCloud',
    category: PlatformCategory.STREAMING,
    integrated: -14,
    truePeak: -1,
    lra: { min: 4, max: 20 },
    tolerance: 2.0,
    normalization: 'NONE',
    description: 'SoundCloud (no normalization by default)'
  },
  
  // Broadcast standards
  EBU_R128: {
    name: 'EBU R128',
    category: PlatformCategory.BROADCAST,
    integrated: -23,
    truePeak: -1,
    lra: { min: 4, max: 16 },
    tolerance: 0.5,
    normalization: 'STANDARD',
    description: 'European broadcast standard'
  },
  ATSC_A85: {
    name: 'ATSC A/85',
    category: PlatformCategory.BROADCAST,
    integrated: -24,
    truePeak: -2,
    lra: { min: 4, max: 16 },
    tolerance: 0.5,
    normalization: 'STANDARD',
    description: 'US broadcast standard'
  },
  ARIB_TR_B32: {
    name: 'ARIB TR-B32',
    category: PlatformCategory.BROADCAST,
    integrated: -24,
    truePeak: -1,
    lra: { min: 4, max: 16 },
    tolerance: 0.5,
    normalization: 'STANDARD',
    description: 'Japanese broadcast standard'
  },
  
  // Content-specific targets
  PODCAST: {
    name: 'Podcast',
    category: PlatformCategory.CONTENT_TYPE,
    integrated: -16,
    truePeak: -1,
    lra: { min: 4, max: 12 },
    tolerance: 1.0,
    normalization: 'VARIES',
    description: 'Podcast distribution recommendation'
  },
  AUDIOBOOK: {
    name: 'Audiobook',
    category: PlatformCategory.CONTENT_TYPE,
    integrated: -18,
    truePeak: -3,
    lra: { min: 3, max: 10 },
    tolerance: 1.0,
    normalization: 'VARIES',
    description: 'ACX/Audible audiobook spec'
  },
  FILM_DIALOGUE: {
    name: 'Film (Dialogue)',
    category: PlatformCategory.CONTENT_TYPE,
    integrated: -27,
    truePeak: -1,
    lra: { min: 8, max: 20 },
    tolerance: 1.0,
    normalization: 'STANDARD',
    description: 'Film dialogue normalization'
  },
  MUSIC_MASTERING: {
    name: 'Music Mastering',
    category: PlatformCategory.CONTENT_TYPE,
    integrated: -14,
    truePeak: -1,
    lra: { min: 6, max: 14 },
    tolerance: 2.0,
    normalization: 'NONE',
    description: 'General music mastering target'
  }
});

/**
 * Default platform groups for common use cases
 */
const PLATFORM_GROUPS = Object.freeze({
  ALL_STREAMING: ['SPOTIFY', 'APPLE_MUSIC', 'YOUTUBE', 'TIDAL', 'AMAZON_MUSIC', 'DEEZER', 'SOUNDCLOUD'],
  MAJOR_STREAMING: ['SPOTIFY', 'APPLE_MUSIC', 'YOUTUBE', 'AMAZON_MUSIC'],
  BROADCAST: ['EBU_R128', 'ATSC_A85', 'ARIB_TR_B32'],
  CONTENT: ['PODCAST', 'AUDIOBOOK', 'FILM_DIALOGUE', 'MUSIC_MASTERING'],
  ALL: Object.keys(PLATFORM_SPECS)
});

/**
 * Compliance thresholds
 */
const THRESHOLDS = Object.freeze({
  FULLY_COMPLIANT: 100,     // All platforms pass
  MOSTLY_COMPLIANT: 75,     // 75%+ pass
  PARTIALLY_COMPLIANT: 50,  // 50%+ pass
  WARNING_TOLERANCE: 0.5    // Extra tolerance for warnings vs fails
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get platform specification
 * @param {string} platformKey - Platform identifier
 * @returns {Object|null} Platform spec or null
 */
function getPlatformSpec(platformKey) {
  return PLATFORM_SPECS[platformKey] || null;
}

/**
 * Get all platforms in a category
 * @param {string} category - PlatformCategory value
 * @returns {Array<string>} Platform keys
 */
function getPlatformsByCategory(category) {
  return Object.entries(PLATFORM_SPECS)
    .filter(([_, spec]) => spec.category === category)
    .map(([key]) => key);
}

/**
 * Calculate deviation from target
 * @param {number} actual - Actual value
 * @param {number} target - Target value
 * @param {number} tolerance - Allowed tolerance
 * @returns {Object} Deviation info
 */
function calculateDeviation(actual, target, tolerance = 1.0) {
  const delta = actual - target;
  const absDelta = Math.abs(delta);
  
  return {
    delta: Math.round(delta * 10) / 10,
    absDelta: Math.round(absDelta * 10) / 10,
    withinTolerance: absDelta <= tolerance,
    withinWarning: absDelta <= tolerance + THRESHOLDS.WARNING_TOLERANCE,
    direction: delta > 0 ? 'ABOVE' : delta < 0 ? 'BELOW' : 'ON_TARGET'
  };
}

/**
 * Check if LRA is within range
 * @param {number} lra - Loudness Range value
 * @param {Object} range - { min, max } range
 * @returns {Object} Check result
 */
function checkLRARange(lra, range) {
  if (lra < range.min) {
    return { pass: false, issue: 'TOO_NARROW', delta: lra - range.min };
  }
  if (lra > range.max) {
    return { pass: false, issue: 'TOO_WIDE', delta: lra - range.max };
  }
  return { pass: true, issue: null, delta: 0 };
}

// ============================================================================
// Single Platform Validation
// ============================================================================

/**
 * Validate loudness against a single platform
 * @param {Object} loudnessData - Loudness measurements
 * @param {string} platformKey - Platform identifier
 * @returns {Object} Platform compliance result
 */
function validatePlatform(loudnessData, platformKey) {
  const spec = getPlatformSpec(platformKey);
  if (!spec) {
    return {
      platform: platformKey,
      error: 'Unknown platform',
      compliant: false
    };
  }
  
  const {
    integratedLoudness,
    integrated,
    truePeak,
    truePeakDbfs,
    loudnessRange,
    lra
  } = loudnessData;
  
  // Normalize input names
  const actualIntegrated = integratedLoudness ?? integrated ?? null;
  const actualTruePeak = truePeak ?? truePeakDbfs ?? null;
  const actualLRA = loudnessRange ?? lra ?? null;
  
  if (actualIntegrated === null) {
    return {
      platform: platformKey,
      name: spec.name,
      error: 'Missing integrated loudness data',
      compliant: false
    };
  }
  
  // Check integrated loudness
  const integratedDev = calculateDeviation(actualIntegrated, spec.integrated, spec.tolerance);
  const integratedResult = {
    value: Math.round(actualIntegrated * 10) / 10,
    target: spec.integrated,
    tolerance: spec.tolerance,
    delta: integratedDev.delta,
    pass: integratedDev.withinTolerance,
    result: integratedDev.withinTolerance ? CheckResult.PASS : 
            integratedDev.withinWarning ? CheckResult.WARNING : CheckResult.FAIL
  };
  
  // Check true peak
  let truePeakResult = { pass: true, result: CheckResult.PASS };
  if (actualTruePeak !== null) {
    const tpPass = actualTruePeak <= spec.truePeak;
    const tpWarning = actualTruePeak <= spec.truePeak + 0.5;
    truePeakResult = {
      value: Math.round(actualTruePeak * 10) / 10,
      target: spec.truePeak,
      delta: Math.round((actualTruePeak - spec.truePeak) * 10) / 10,
      pass: tpPass,
      result: tpPass ? CheckResult.PASS : tpWarning ? CheckResult.WARNING : CheckResult.FAIL
    };
  }
  
  // Check LRA
  let lraResult = { pass: true, result: CheckResult.PASS };
  if (actualLRA !== null && spec.lra) {
    const lraCheck = checkLRARange(actualLRA, spec.lra);
    lraResult = {
      value: Math.round(actualLRA * 10) / 10,
      range: spec.lra,
      delta: Math.round(lraCheck.delta * 10) / 10,
      pass: lraCheck.pass,
      issue: lraCheck.issue,
      result: lraCheck.pass ? CheckResult.PASS : CheckResult.WARNING
    };
  }
  
  // Overall compliance
  const compliant = integratedResult.pass && truePeakResult.pass && lraResult.pass;
  const hasWarnings = !compliant && (
    integratedResult.result === CheckResult.WARNING ||
    truePeakResult.result === CheckResult.WARNING ||
    lraResult.result === CheckResult.WARNING
  );
  
  return {
    platform: platformKey,
    name: spec.name,
    category: spec.category,
    compliant,
    hasWarnings,
    integrated: integratedResult,
    truePeak: truePeakResult,
    lra: lraResult,
    normalization: spec.normalization,
    adjustmentNeeded: compliant ? 0 : spec.integrated - actualIntegrated
  };
}

// ============================================================================
// Multi-Platform Validation
// ============================================================================

/**
 * Validate against all specified platforms
 * @param {Object} loudnessData - Loudness measurements
 * @param {Array<string>} platforms - Platform keys (default: all)
 * @returns {Object} Complete compliance matrix
 */
function validateAllPlatforms(loudnessData, platforms = PLATFORM_GROUPS.ALL) {
  const results = {};
  let passCount = 0;
  let warningCount = 0;
  let failCount = 0;
  
  for (const platformKey of platforms) {
    const result = validatePlatform(loudnessData, platformKey);
    results[platformKey] = result;
    
    if (result.compliant) {
      passCount++;
    } else if (result.hasWarnings) {
      warningCount++;
    } else {
      failCount++;
    }
  }
  
  const total = platforms.length;
  const compliancePercent = Math.round((passCount / total) * 100);
  
  // Determine overall status
  let status;
  if (compliancePercent >= THRESHOLDS.FULLY_COMPLIANT) {
    status = ComplianceStatus.FULLY_COMPLIANT;
  } else if (compliancePercent >= THRESHOLDS.MOSTLY_COMPLIANT) {
    status = ComplianceStatus.MOSTLY_COMPLIANT;
  } else if (compliancePercent >= THRESHOLDS.PARTIALLY_COMPLIANT) {
    status = ComplianceStatus.PARTIALLY_COMPLIANT;
  } else {
    status = ComplianceStatus.NON_COMPLIANT;
  }
  
  return {
    status,
    description: STATUS_DESCRIPTIONS[status],
    complianceScore: compliancePercent,
    summary: {
      total,
      passing: passCount,
      warnings: warningCount,
      failing: failCount
    },
    platforms: results
  };
}

/**
 * Get compliance matrix grouped by category
 * @param {Object} loudnessData - Loudness measurements
 * @param {Array<string>} platforms - Platform keys
 * @returns {Object} Categorized compliance matrix
 */
function getComplianceMatrix(loudnessData, platforms = PLATFORM_GROUPS.ALL) {
  const all = validateAllPlatforms(loudnessData, platforms);
  
  // Group by category
  const byCategory = {
    [PlatformCategory.STREAMING]: {},
    [PlatformCategory.BROADCAST]: {},
    [PlatformCategory.CONTENT_TYPE]: {}
  };
  
  for (const [key, result] of Object.entries(all.platforms)) {
    if (result.category) {
      byCategory[result.category][key] = result;
    }
  }
  
  // Calculate category compliance
  const categoryScores = {};
  for (const [category, platforms] of Object.entries(byCategory)) {
    const entries = Object.values(platforms);
    if (entries.length > 0) {
      const passing = entries.filter(p => p.compliant).length;
      categoryScores[category] = Math.round((passing / entries.length) * 100);
    }
  }
  
  return {
    ...all,
    byCategory,
    categoryScores
  };
}

// ============================================================================
// Optimization Functions
// ============================================================================

/**
 * Find optimal loudness target for multiple platforms
 * @param {Object} loudnessData - Current loudness data
 * @param {Array<string>} priorityPlatforms - Platforms to optimize for
 * @returns {Object} Optimal target recommendation
 */
function findOptimalTarget(loudnessData, priorityPlatforms = PLATFORM_GROUPS.MAJOR_STREAMING) {
  const currentIntegrated = loudnessData.integratedLoudness ?? loudnessData.integrated;
  
  if (currentIntegrated === null || currentIntegrated === undefined) {
    return { error: 'Missing integrated loudness data' };
  }
  
  // Collect target values
  const targets = priorityPlatforms
    .map(p => getPlatformSpec(p))
    .filter(Boolean)
    .map(spec => ({
      platform: spec.name,
      target: spec.integrated,
      tolerance: spec.tolerance
    }));
  
  if (targets.length === 0) {
    return { error: 'No valid platforms specified' };
  }
  
  // Find the range that satisfies most platforms
  const minTarget = Math.min(...targets.map(t => t.target));
  const maxTarget = Math.max(...targets.map(t => t.target));
  
  // Calculate which target value satisfies the most platforms with tolerance
  let bestTarget = minTarget;
  let maxSatisfied = 0;
  
  for (let testTarget = minTarget; testTarget <= maxTarget; testTarget += 0.5) {
    const satisfied = targets.filter(t => 
      Math.abs(testTarget - t.target) <= t.tolerance
    ).length;
    
    if (satisfied > maxSatisfied) {
      maxSatisfied = satisfied;
      bestTarget = testTarget;
    }
  }
  
  // Calculate required adjustment
  const adjustmentNeeded = bestTarget - currentIntegrated;
  
  // List which platforms would be satisfied
  const satisfiedPlatforms = targets
    .filter(t => Math.abs(bestTarget - t.target) <= t.tolerance)
    .map(t => t.platform);
  
  return {
    currentLoudness: Math.round(currentIntegrated * 10) / 10,
    recommendedTarget: bestTarget,
    adjustmentNeeded: Math.round(adjustmentNeeded * 10) / 10,
    satisfiedPlatforms,
    satisfactionRate: Math.round((satisfiedPlatforms.length / targets.length) * 100),
    recommendation: adjustmentNeeded === 0 
      ? 'Current loudness is optimal'
      : `Adjust loudness by ${adjustmentNeeded > 0 ? '+' : ''}${adjustmentNeeded.toFixed(1)} dB`
  };
}

/**
 * Calculate required adjustments for each platform
 * @param {Object} loudnessData - Current loudness data
 * @param {Array<string>} platforms - Platform keys
 * @returns {Object} Per-platform adjustment requirements
 */
function calculateRequiredAdjustments(loudnessData, platforms = PLATFORM_GROUPS.ALL) {
  const currentIntegrated = loudnessData.integratedLoudness ?? loudnessData.integrated;
  const currentTruePeak = loudnessData.truePeak ?? loudnessData.truePeakDbfs;
  
  const adjustments = {};
  
  for (const platformKey of platforms) {
    const spec = getPlatformSpec(platformKey);
    if (!spec) continue;
    
    const loudnessAdjust = spec.integrated - currentIntegrated;
    
    // Calculate true peak headroom after loudness adjustment
    let truePeakAfterAdjust = null;
    let truePeakSafe = true;
    if (currentTruePeak !== null && currentTruePeak !== undefined) {
      truePeakAfterAdjust = currentTruePeak + loudnessAdjust;
      truePeakSafe = truePeakAfterAdjust <= spec.truePeak;
    }
    
    adjustments[platformKey] = {
      platform: spec.name,
      loudnessAdjustment: Math.round(loudnessAdjust * 10) / 10,
      truePeakAfterAdjust: truePeakAfterAdjust !== null 
        ? Math.round(truePeakAfterAdjust * 10) / 10 
        : null,
      truePeakSafe,
      needsLimiting: !truePeakSafe,
      direction: loudnessAdjust > 0.5 ? 'INCREASE' : 
                 loudnessAdjust < -0.5 ? 'DECREASE' : 'NONE'
    };
  }
  
  // Find minimum adjustment to satisfy all
  const allAdjustments = Object.values(adjustments).map(a => a.loudnessAdjustment);
  const minAdjust = Math.min(...allAdjustments);
  const maxAdjust = Math.max(...allAdjustments);
  
  return {
    perPlatform: adjustments,
    summary: {
      minAdjustment: minAdjust,
      maxAdjustment: maxAdjust,
      range: Math.round((maxAdjust - minAdjust) * 10) / 10,
      anyNeedLimiting: Object.values(adjustments).some(a => a.needsLimiting)
    }
  };
}

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * Generate warnings based on compliance results
 * @param {Object} complianceResult - Result from validateAllPlatforms
 * @returns {Array<string>} Warning messages
 */
function generateWarnings(complianceResult) {
  const warnings = [];
  
  if (!complianceResult || !complianceResult.platforms) {
    return warnings;
  }
  
  // Check for common issues
  const truePeakFailures = [];
  const integratedFailures = [];
  const lraIssues = [];
  
  for (const [key, result] of Object.entries(complianceResult.platforms)) {
    if (result.truePeak && result.truePeak.result === CheckResult.FAIL) {
      truePeakFailures.push({ platform: result.name, delta: result.truePeak.delta });
    }
    if (result.integrated && result.integrated.result === CheckResult.FAIL) {
      integratedFailures.push({ platform: result.name, delta: result.integrated.delta });
    }
    if (result.lra && !result.lra.pass) {
      lraIssues.push({ platform: result.name, issue: result.lra.issue });
    }
  }
  
  if (truePeakFailures.length > 0) {
    const worst = truePeakFailures.reduce((max, f) => f.delta > max.delta ? f : max);
    warnings.push(`True peak exceeds limit on ${truePeakFailures.length} platform(s) by up to ${worst.delta.toFixed(1)} dB`);
  }
  
  if (integratedFailures.length > 0) {
    const tooLoud = integratedFailures.filter(f => f.delta > 0).length;
    const tooQuiet = integratedFailures.filter(f => f.delta < 0).length;
    if (tooLoud > 0) {
      warnings.push(`Loudness exceeds target on ${tooLoud} platform(s)`);
    }
    if (tooQuiet > 0) {
      warnings.push(`Loudness below target on ${tooQuiet} platform(s)`);
    }
  }
  
  if (lraIssues.length > 0) {
    const narrow = lraIssues.filter(i => i.issue === 'TOO_NARROW').length;
    const wide = lraIssues.filter(i => i.issue === 'TOO_WIDE').length;
    if (narrow > 0) warnings.push(`Loudness range too narrow for ${narrow} platform(s)`);
    if (wide > 0) warnings.push(`Loudness range too wide for ${wide} platform(s)`);
  }
  
  return warnings;
}

/**
 * Generate recommendations based on compliance analysis
 * @param {Object} complianceResult - Result from validateAllPlatforms
 * @param {Object} optimalTarget - Result from findOptimalTarget
 * @returns {Array<string>} Recommendations
 */
function generateRecommendations(complianceResult, optimalTarget = null) {
  const recommendations = [];
  
  if (!complianceResult) return recommendations;
  
  const { status, complianceScore } = complianceResult;
  
  if (status === ComplianceStatus.FULLY_COMPLIANT) {
    recommendations.push('Audio is fully compliant with all tested platforms');
    return recommendations;
  }
  
  // Loudness adjustment recommendation
  if (optimalTarget && optimalTarget.adjustmentNeeded !== 0) {
    const adj = optimalTarget.adjustmentNeeded;
    if (adj > 0) {
      recommendations.push(`Increase loudness by ${adj.toFixed(1)} dB for optimal platform compatibility`);
    } else {
      recommendations.push(`Reduce loudness by ${Math.abs(adj).toFixed(1)} dB for optimal platform compatibility`);
    }
  }
  
  // True peak recommendation
  const truePeakIssues = Object.values(complianceResult.platforms)
    .filter(p => p.truePeak && p.truePeak.result === CheckResult.FAIL);
  if (truePeakIssues.length > 0) {
    recommendations.push('Apply true peak limiting to meet platform requirements');
  }
  
  // Platform-specific recommendations
  if (complianceScore < 50) {
    recommendations.push('Consider targeting -14 LUFS with -1 dBTP for maximum streaming compatibility');
  }
  
  return recommendations;
}

/**
 * Quick compliance check
 * @param {Object} loudnessData - Loudness measurements
 * @param {Array<string>} platforms - Platform keys
 * @returns {Object} Quick check result
 */
function quickCheck(loudnessData, platforms = PLATFORM_GROUPS.MAJOR_STREAMING) {
  const result = validateAllPlatforms(loudnessData, platforms);
  
  return {
    status: result.status,
    complianceScore: result.complianceScore,
    passing: result.summary.passing,
    total: result.summary.total,
    isFullyCompliant: result.status === ComplianceStatus.FULLY_COMPLIANT,
    isMostlyCompliant: result.status === ComplianceStatus.MOSTLY_COMPLIANT,
    needsWork: result.status === ComplianceStatus.NON_COMPLIANT,
    failingPlatforms: Object.entries(result.platforms)
      .filter(([_, p]) => !p.compliant)
      .map(([key]) => key)
  };
}

/**
 * Full compliance analysis
 * @param {Object} loudnessData - Loudness measurements
 * @param {Object} options - Analysis options
 * @returns {Object} Complete analysis
 */
function analyze(loudnessData, options = {}) {
  const {
    platforms = PLATFORM_GROUPS.ALL,
    priorityPlatforms = PLATFORM_GROUPS.MAJOR_STREAMING
  } = options;
  
  const compliance = getComplianceMatrix(loudnessData, platforms);
  const optimal = findOptimalTarget(loudnessData, priorityPlatforms);
  const adjustments = calculateRequiredAdjustments(loudnessData, platforms);
  const warnings = generateWarnings(compliance);
  const recommendations = generateRecommendations(compliance, optimal);
  
  return {
    ...compliance,
    optimal,
    adjustments: adjustments.summary,
    perPlatformAdjustments: adjustments.perPlatform,
    warnings,
    recommendations,
    analyzedAt: new Date().toISOString()
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Main analysis functions
  analyze,
  validatePlatform,
  validateAllPlatforms,
  getComplianceMatrix,
  quickCheck,
  
  // Optimization functions
  findOptimalTarget,
  calculateRequiredAdjustments,
  
  // Utility functions
  getPlatformSpec,
  getPlatformsByCategory,
  generateWarnings,
  generateRecommendations,
  
  // Constants
  ComplianceStatus,
  PlatformCategory,
  CheckResult,
  STATUS_DESCRIPTIONS,
  PLATFORM_SPECS,
  PLATFORM_GROUPS,
  THRESHOLDS
};
