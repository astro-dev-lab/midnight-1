/**
 * Loudness Standard Compliance Validator
 * 
 * Multi-platform simultaneous validation against streaming,
 * broadcast, cinema, and other loudness standards. Validates
 * integrated loudness, true peak, loudness range, and more.
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Assets must meet delivery
 * specifications for target platforms.
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Platform categories
 */
const PlatformCategory = Object.freeze({
  STREAMING: 'STREAMING',
  BROADCAST: 'BROADCAST',
  CINEMA: 'CINEMA',
  PODCAST: 'PODCAST',
  GAMING: 'GAMING',
  VINYL: 'VINYL',
  CD: 'CD'
});

/**
 * Compliance status values
 */
const ComplianceStatus = Object.freeze({
  COMPLIANT: 'COMPLIANT',
  WARNING: 'WARNING',
  NON_COMPLIANT: 'NON_COMPLIANT',
  UNKNOWN: 'UNKNOWN'
});

/**
 * Metric types for validation
 */
const MetricType = Object.freeze({
  INTEGRATED_LOUDNESS: 'INTEGRATED_LOUDNESS',
  TRUE_PEAK: 'TRUE_PEAK',
  LOUDNESS_RANGE: 'LOUDNESS_RANGE',
  SHORT_TERM_MAX: 'SHORT_TERM_MAX',
  MOMENTARY_MAX: 'MOMENTARY_MAX',
  DIALOG_LOUDNESS: 'DIALOG_LOUDNESS'
});

/**
 * Status descriptions
 */
const STATUS_DESCRIPTIONS = Object.freeze({
  [ComplianceStatus.COMPLIANT]: 'Audio meets all platform requirements',
  [ComplianceStatus.WARNING]: 'Audio may trigger platform normalization or be flagged',
  [ComplianceStatus.NON_COMPLIANT]: 'Audio does not meet platform requirements',
  [ComplianceStatus.UNKNOWN]: 'Unable to determine compliance status'
});

/**
 * Platform loudness standards
 * Based on official platform specifications and industry standards
 */
const PLATFORM_STANDARDS = Object.freeze({
  // =========================================
  // Streaming Platforms
  // =========================================
  'spotify': {
    name: 'Spotify',
    category: PlatformCategory.STREAMING,
    integratedLoudness: { target: -14, tolerance: 1, min: -20, max: -8 },
    truePeak: { max: -1 },
    loudnessRange: { min: 4, max: 20, recommended: { min: 6, max: 16 } },
    normalization: 'negative_gain_only',
    notes: 'Loud tracks turned down, quiet tracks NOT boosted by default'
  },
  
  'apple-music': {
    name: 'Apple Music',
    category: PlatformCategory.STREAMING,
    integratedLoudness: { target: -16, tolerance: 1, min: -22, max: -10 },
    truePeak: { max: -1 },
    loudnessRange: { recommended: { min: 6, max: 18 } },
    normalization: 'sound_check',
    notes: 'Sound Check normalizes both up and down'
  },
  
  'youtube': {
    name: 'YouTube',
    category: PlatformCategory.STREAMING,
    integratedLoudness: { target: -14, tolerance: 1, min: -20, max: -8 },
    truePeak: { max: -1 },
    normalization: 'negative_gain_only',
    notes: 'Loud content turned down, quiet content left alone'
  },
  
  'tidal': {
    name: 'Tidal',
    category: PlatformCategory.STREAMING,
    integratedLoudness: { target: -14, tolerance: 1, min: -20, max: -8 },
    truePeak: { max: -1 },
    normalization: 'reference_normalization',
    notes: 'Normalizes to -14 LUFS reference'
  },
  
  'amazon-music': {
    name: 'Amazon Music',
    category: PlatformCategory.STREAMING,
    integratedLoudness: { target: -14, tolerance: 1.5, min: -20, max: -9 },
    truePeak: { max: -1 },
    normalization: 'adaptive',
    notes: 'Adaptive normalization based on content type'
  },
  
  'deezer': {
    name: 'Deezer',
    category: PlatformCategory.STREAMING,
    integratedLoudness: { target: -15, tolerance: 1, min: -20, max: -9 },
    truePeak: { max: -1 },
    normalization: 'both_directions',
    notes: 'Normalizes both loud and quiet content'
  },
  
  'soundcloud': {
    name: 'SoundCloud',
    category: PlatformCategory.STREAMING,
    integratedLoudness: { target: -14, tolerance: 2, min: -20, max: -6 },
    truePeak: { max: -1 },
    normalization: 'optional',
    notes: 'User-optional normalization'
  },
  
  // =========================================
  // Broadcast Standards
  // =========================================
  'ebu-r128': {
    name: 'EBU R128 (Europe)',
    category: PlatformCategory.BROADCAST,
    integratedLoudness: { target: -23, tolerance: 0.5, min: -24, max: -22 },
    truePeak: { max: -1 },
    loudnessRange: { max: 18, recommended: { max: 15 } },
    shortTermMax: { max: -18 },
    notes: 'European broadcast standard'
  },
  
  'atsc-a85': {
    name: 'ATSC A/85 (US)',
    category: PlatformCategory.BROADCAST,
    integratedLoudness: { target: -24, tolerance: 2, min: -26, max: -22 },
    truePeak: { max: -2 },
    dialogLoudness: { target: -24, tolerance: 2 },
    notes: 'US broadcast standard (CALM Act)'
  },
  
  'arib-tr-b32': {
    name: 'ARIB TR-B32 (Japan)',
    category: PlatformCategory.BROADCAST,
    integratedLoudness: { target: -24, tolerance: 1, min: -25, max: -23 },
    truePeak: { max: -1 },
    notes: 'Japanese broadcast standard'
  },
  
  'op-59': {
    name: 'OP-59 (Australia)',
    category: PlatformCategory.BROADCAST,
    integratedLoudness: { target: -24, tolerance: 1, min: -25, max: -23 },
    truePeak: { max: -2 },
    notes: 'Australian broadcast standard'
  },
  
  // =========================================
  // Cinema Standards
  // =========================================
  'dolby-cinema': {
    name: 'Dolby Cinema',
    category: PlatformCategory.CINEMA,
    integratedLoudness: { target: -27, tolerance: 2, min: -31, max: -24 },
    truePeak: { max: -3 },
    dialogLoudness: { target: -27, tolerance: 2 },
    notes: 'Dolby theatrical standard'
  },
  
  'netflix': {
    name: 'Netflix',
    category: PlatformCategory.STREAMING,
    integratedLoudness: { target: -27, tolerance: 2, min: -30, max: -24 },
    truePeak: { max: -2 },
    dialogLoudness: { target: -27, tolerance: 2 },
    loudnessRange: { max: 20 },
    notes: 'Netflix streaming standard (dialog-gated)'
  },
  
  // =========================================
  // Podcast Standards
  // =========================================
  'podcast-apple': {
    name: 'Apple Podcasts',
    category: PlatformCategory.PODCAST,
    integratedLoudness: { target: -16, tolerance: 1, min: -18, max: -14 },
    truePeak: { max: -1 },
    notes: 'Apple Podcasts recommended levels'
  },
  
  'podcast-spotify': {
    name: 'Spotify Podcasts',
    category: PlatformCategory.PODCAST,
    integratedLoudness: { target: -14, tolerance: 2, min: -18, max: -12 },
    truePeak: { max: -1 },
    notes: 'Spotify podcast loudness normalization'
  },
  
  'podcast-general': {
    name: 'Podcast General',
    category: PlatformCategory.PODCAST,
    integratedLoudness: { target: -16, tolerance: 2, min: -20, max: -12 },
    truePeak: { max: -1.5 },
    loudnessRange: { max: 10, recommended: { max: 8 } },
    notes: 'General podcast recommendations'
  },
  
  // =========================================
  // Gaming Standards
  // =========================================
  'gaming-console': {
    name: 'Console Gaming',
    category: PlatformCategory.GAMING,
    integratedLoudness: { target: -18, tolerance: 2, min: -23, max: -14 },
    truePeak: { max: -1 },
    dialogLoudness: { target: -18, tolerance: 2 },
    notes: 'Console gaming loudness guidelines'
  },
  
  // =========================================
  // Physical Media
  // =========================================
  'cd-redbook': {
    name: 'CD (Red Book)',
    category: PlatformCategory.CD,
    integratedLoudness: { min: -18, max: -8, recommended: { min: -14, max: -10 } },
    truePeak: { max: 0 },
    notes: 'CD has no normalization - loudness is preserved'
  },
  
  'vinyl-master': {
    name: 'Vinyl Mastering',
    category: PlatformCategory.VINYL,
    integratedLoudness: { min: -18, max: -12, recommended: { min: -16, max: -14 } },
    truePeak: { max: -0.5 },
    loudnessRange: { min: 8, recommended: { min: 10 } },
    notes: 'Vinyl requires dynamic range for cutting'
  }
});

/**
 * Platform groups for batch validation
 */
const PLATFORM_GROUPS = Object.freeze({
  'all-streaming': ['spotify', 'apple-music', 'youtube', 'tidal', 'amazon-music', 'deezer', 'soundcloud'],
  'major-streaming': ['spotify', 'apple-music', 'youtube'],
  'all-broadcast': ['ebu-r128', 'atsc-a85', 'arib-tr-b32', 'op-59'],
  'all-podcast': ['podcast-apple', 'podcast-spotify', 'podcast-general'],
  'film-tv': ['netflix', 'dolby-cinema', 'ebu-r128', 'atsc-a85']
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get standard definition for a platform
 * @param {string} platformId - Platform identifier
 * @returns {Object|null} Standard definition or null
 */
function getStandard(platformId) {
  return PLATFORM_STANDARDS[platformId] || null;
}

/**
 * Get all platforms in a category
 * @param {string} category - PlatformCategory
 * @returns {Array<string>} Platform IDs
 */
function getPlatformsByCategory(category) {
  return Object.entries(PLATFORM_STANDARDS)
    .filter(([_, std]) => std.category === category)
    .map(([id]) => id);
}

/**
 * Expand platform group to individual platforms
 * @param {string|Array<string>} platforms - Platform ID, group name, or array
 * @returns {Array<string>} Expanded platform IDs
 */
function expandPlatforms(platforms) {
  if (Array.isArray(platforms)) {
    return platforms.flatMap(p => expandPlatforms(p));
  }
  
  if (PLATFORM_GROUPS[platforms]) {
    return PLATFORM_GROUPS[platforms];
  }
  
  if (PLATFORM_STANDARDS[platforms]) {
    return [platforms];
  }
  
  // Check if it's a category
  const categoryPlatforms = getPlatformsByCategory(platforms);
  if (categoryPlatforms.length > 0) {
    return categoryPlatforms;
  }
  
  return [];
}

/**
 * Check if a value is within range
 * @param {number} value - Value to check
 * @param {Object} range - Range object with min/max/target/tolerance
 * @returns {Object} Range check result
 */
function checkRange(value, range) {
  if (value === undefined || value === null || !range) {
    return { status: ComplianceStatus.UNKNOWN, inRange: false };
  }
  
  // Target with tolerance check
  if (range.target !== undefined) {
    const tolerance = range.tolerance || 0;
    const diff = Math.abs(value - range.target);
    
    if (diff <= tolerance) {
      return { 
        status: ComplianceStatus.COMPLIANT, 
        inRange: true,
        deviation: diff,
        target: range.target
      };
    }
    
    // Check if within extended min/max
    if (range.min !== undefined && value < range.min) {
      return {
        status: ComplianceStatus.NON_COMPLIANT,
        inRange: false,
        deviation: range.min - value,
        belowMin: true
      };
    }
    
    if (range.max !== undefined && value > range.max) {
      return {
        status: ComplianceStatus.NON_COMPLIANT,
        inRange: false,
        deviation: value - range.max,
        aboveMax: true
      };
    }
    
    // Within min/max but outside tolerance
    return {
      status: ComplianceStatus.WARNING,
      inRange: true,
      deviation: diff,
      target: range.target
    };
  }
  
  // Min/max only check
  if (range.min !== undefined && value < range.min) {
    return {
      status: ComplianceStatus.NON_COMPLIANT,
      inRange: false,
      deviation: range.min - value,
      belowMin: true
    };
  }
  
  if (range.max !== undefined && value > range.max) {
    return {
      status: ComplianceStatus.NON_COMPLIANT,
      inRange: false,
      deviation: value - range.max,
      aboveMax: true
    };
  }
  
  return { status: ComplianceStatus.COMPLIANT, inRange: true };
}

/**
 * Get worst compliance status from array
 * @param {Array<string>} statuses - Array of ComplianceStatus values
 * @returns {string} Worst status
 */
function worstStatus(statuses) {
  if (statuses.includes(ComplianceStatus.NON_COMPLIANT)) {
    return ComplianceStatus.NON_COMPLIANT;
  }
  if (statuses.includes(ComplianceStatus.WARNING)) {
    return ComplianceStatus.WARNING;
  }
  if (statuses.includes(ComplianceStatus.UNKNOWN)) {
    return ComplianceStatus.UNKNOWN;
  }
  return ComplianceStatus.COMPLIANT;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate metrics against a single platform
 * @param {Object} metrics - Audio metrics
 * @param {string} platformId - Platform identifier
 * @returns {Object} Validation result
 */
function validatePlatform(metrics, platformId) {
  const standard = getStandard(platformId);
  
  if (!standard) {
    return {
      platformId,
      platformName: platformId,
      status: ComplianceStatus.UNKNOWN,
      message: `Unknown platform: ${platformId}`,
      checks: []
    };
  }
  
  if (!metrics) {
    return {
      platformId,
      platformName: standard.name,
      category: standard.category,
      status: ComplianceStatus.UNKNOWN,
      message: 'No metrics provided',
      checks: []
    };
  }
  
  const checks = [];
  
  // Check integrated loudness
  if (standard.integratedLoudness) {
    const result = checkRange(metrics.integratedLoudness, standard.integratedLoudness);
    checks.push({
      metric: MetricType.INTEGRATED_LOUDNESS,
      value: metrics.integratedLoudness,
      ...result,
      standard: standard.integratedLoudness
    });
  }
  
  // Check true peak
  if (standard.truePeak) {
    const tpValue = metrics.truePeak ?? metrics.truePeakDbfs;
    const result = checkRange(tpValue, standard.truePeak);
    checks.push({
      metric: MetricType.TRUE_PEAK,
      value: tpValue,
      ...result,
      standard: standard.truePeak
    });
  }
  
  // Check loudness range
  if (standard.loudnessRange && metrics.loudnessRange !== undefined) {
    const result = checkRange(metrics.loudnessRange, standard.loudnessRange);
    checks.push({
      metric: MetricType.LOUDNESS_RANGE,
      value: metrics.loudnessRange,
      ...result,
      standard: standard.loudnessRange
    });
  }
  
  // Check short-term max
  if (standard.shortTermMax && metrics.shortTermMax !== undefined) {
    const result = checkRange(metrics.shortTermMax, standard.shortTermMax);
    checks.push({
      metric: MetricType.SHORT_TERM_MAX,
      value: metrics.shortTermMax,
      ...result,
      standard: standard.shortTermMax
    });
  }
  
  // Check dialog loudness
  if (standard.dialogLoudness && metrics.dialogLoudness !== undefined) {
    const result = checkRange(metrics.dialogLoudness, standard.dialogLoudness);
    checks.push({
      metric: MetricType.DIALOG_LOUDNESS,
      value: metrics.dialogLoudness,
      ...result,
      standard: standard.dialogLoudness
    });
  }
  
  const overallStatus = worstStatus(checks.map(c => c.status));
  const failedChecks = checks.filter(c => c.status === ComplianceStatus.NON_COMPLIANT);
  const warningChecks = checks.filter(c => c.status === ComplianceStatus.WARNING);
  
  let message;
  if (overallStatus === ComplianceStatus.COMPLIANT) {
    message = `Meets ${standard.name} requirements`;
  } else if (overallStatus === ComplianceStatus.WARNING) {
    message = `May be normalized by ${standard.name}`;
  } else if (overallStatus === ComplianceStatus.NON_COMPLIANT) {
    message = `Does not meet ${standard.name} requirements`;
  } else {
    message = `Unable to validate against ${standard.name}`;
  }
  
  return {
    platformId,
    platformName: standard.name,
    category: standard.category,
    status: overallStatus,
    message,
    checks,
    failedCount: failedChecks.length,
    warningCount: warningChecks.length,
    normalization: standard.normalization,
    notes: standard.notes
  };
}

/**
 * Validate metrics against multiple platforms simultaneously
 * @param {Object} metrics - Audio metrics
 * @param {string|Array<string>} platforms - Platforms to validate
 * @returns {Object} Multi-platform validation result
 */
function validateMultiPlatform(metrics, platforms = 'major-streaming') {
  const platformList = expandPlatforms(platforms);
  
  if (platformList.length === 0) {
    return {
      status: ComplianceStatus.UNKNOWN,
      message: 'No valid platforms specified',
      results: [],
      summary: {}
    };
  }
  
  const results = platformList.map(p => validatePlatform(metrics, p));
  
  // Summary by status
  const summary = {
    compliant: results.filter(r => r.status === ComplianceStatus.COMPLIANT).map(r => r.platformId),
    warning: results.filter(r => r.status === ComplianceStatus.WARNING).map(r => r.platformId),
    nonCompliant: results.filter(r => r.status === ComplianceStatus.NON_COMPLIANT).map(r => r.platformId),
    unknown: results.filter(r => r.status === ComplianceStatus.UNKNOWN).map(r => r.platformId)
  };
  
  // Summary by category
  const byCategory = {};
  for (const result of results) {
    if (!result.category) continue;
    if (!byCategory[result.category]) {
      byCategory[result.category] = { compliant: 0, warning: 0, nonCompliant: 0 };
    }
    if (result.status === ComplianceStatus.COMPLIANT) byCategory[result.category].compliant++;
    else if (result.status === ComplianceStatus.WARNING) byCategory[result.category].warning++;
    else if (result.status === ComplianceStatus.NON_COMPLIANT) byCategory[result.category].nonCompliant++;
  }
  
  const overallStatus = worstStatus(results.map(r => r.status));
  
  let message;
  if (overallStatus === ComplianceStatus.COMPLIANT) {
    message = `Compliant with all ${platformList.length} platforms`;
  } else if (summary.nonCompliant.length > 0) {
    message = `Non-compliant with ${summary.nonCompliant.length} of ${platformList.length} platforms`;
  } else if (summary.warning.length > 0) {
    message = `Warnings for ${summary.warning.length} of ${platformList.length} platforms`;
  } else {
    message = 'Unable to validate all platforms';
  }
  
  return {
    status: overallStatus,
    message,
    platformCount: platformList.length,
    results,
    summary,
    byCategory,
    compliantCount: summary.compliant.length,
    warningCount: summary.warning.length,
    nonCompliantCount: summary.nonCompliant.length
  };
}

/**
 * Quick compliance check
 * @param {Object} metrics - Audio metrics
 * @param {string|Array<string>} platforms - Platforms to check
 * @returns {Object} Quick check result
 */
function quickCheck(metrics, platforms = 'major-streaming') {
  const result = validateMultiPlatform(metrics, platforms);
  
  return {
    status: result.status,
    compliantCount: result.compliantCount,
    warningCount: result.warningCount,
    nonCompliantCount: result.nonCompliantCount,
    platformCount: result.platformCount,
    isFullyCompliant: result.status === ComplianceStatus.COMPLIANT,
    hasNonCompliance: result.nonCompliantCount > 0,
    message: result.message
  };
}

/**
 * Calculate required adjustments for compliance
 * @param {Object} metrics - Audio metrics
 * @param {string} platformId - Target platform
 * @returns {Object} Required adjustments
 */
function calculateAdjustments(metrics, platformId) {
  const standard = getStandard(platformId);
  
  if (!standard || !metrics) {
    return {
      platformId,
      adjustments: [],
      canAutoFix: false
    };
  }
  
  const adjustments = [];
  
  // Loudness adjustment
  if (standard.integratedLoudness?.target !== undefined && 
      metrics.integratedLoudness !== undefined) {
    const diff = standard.integratedLoudness.target - metrics.integratedLoudness;
    const tolerance = standard.integratedLoudness.tolerance || 0;
    
    if (Math.abs(diff) > tolerance) {
      adjustments.push({
        type: 'loudness',
        current: metrics.integratedLoudness,
        target: standard.integratedLoudness.target,
        adjustment: diff,
        unit: 'LUFS',
        action: diff > 0 ? 'increase' : 'decrease',
        description: `Adjust loudness by ${diff > 0 ? '+' : ''}${diff.toFixed(1)} LUFS`
      });
    }
  }
  
  // True peak adjustment
  if (standard.truePeak?.max !== undefined) {
    const tpValue = metrics.truePeak ?? metrics.truePeakDbfs;
    if (tpValue !== undefined && tpValue > standard.truePeak.max) {
      const reduction = tpValue - standard.truePeak.max;
      adjustments.push({
        type: 'truePeak',
        current: tpValue,
        target: standard.truePeak.max,
        adjustment: -reduction,
        unit: 'dBTP',
        action: 'limit',
        description: `Reduce true peak by ${reduction.toFixed(1)} dB`
      });
    }
  }
  
  // Loudness range adjustment (if too wide)
  if (standard.loudnessRange?.max !== undefined && 
      metrics.loudnessRange !== undefined &&
      metrics.loudnessRange > standard.loudnessRange.max) {
    adjustments.push({
      type: 'loudnessRange',
      current: metrics.loudnessRange,
      target: standard.loudnessRange.max,
      adjustment: standard.loudnessRange.max - metrics.loudnessRange,
      unit: 'LU',
      action: 'compress',
      description: `Reduce loudness range by ${(metrics.loudnessRange - standard.loudnessRange.max).toFixed(1)} LU`
    });
  }
  
  return {
    platformId,
    platformName: standard.name,
    adjustments,
    adjustmentCount: adjustments.length,
    canAutoFix: adjustments.every(a => ['loudness', 'truePeak'].includes(a.type)),
    requiresProcessing: adjustments.length > 0
  };
}

/**
 * Find platforms that a given metrics set is compliant with
 * @param {Object} metrics - Audio metrics
 * @param {string|Array<string>} platforms - Platforms to check
 * @returns {Object} Compatible platforms
 */
function findCompliantPlatforms(metrics, platforms = 'all-streaming') {
  const result = validateMultiPlatform(metrics, platforms);
  
  return {
    compliant: result.summary.compliant,
    warning: result.summary.warning,
    nonCompliant: result.summary.nonCompliant,
    bestMatch: result.summary.compliant[0] || result.summary.warning[0] || null,
    recommendation: result.summary.compliant.length > 0
      ? `Optimal for: ${result.summary.compliant.join(', ')}`
      : result.summary.warning.length > 0
        ? `Acceptable for: ${result.summary.warning.join(', ')} (with normalization)`
        : 'Consider adjusting loudness for target platforms'
  };
}

/**
 * Generate compliance report
 * @param {Object} metrics - Audio metrics
 * @param {string|Array<string>} platforms - Platforms to report on
 * @returns {Object} Detailed report
 */
function generateReport(metrics, platforms = 'major-streaming') {
  const validation = validateMultiPlatform(metrics, platforms);
  const adjustmentsByPlatform = {};
  
  for (const platformId of expandPlatforms(platforms)) {
    adjustmentsByPlatform[platformId] = calculateAdjustments(metrics, platformId);
  }
  
  return {
    ...validation,
    metrics,
    adjustments: adjustmentsByPlatform,
    generatedAt: new Date().toISOString(),
    recommendations: generateRecommendations(validation, adjustmentsByPlatform)
  };
}

/**
 * Generate recommendations based on validation results
 * @param {Object} validation - Validation result
 * @param {Object} adjustments - Adjustments by platform
 * @returns {Array<string>} Recommendations
 */
function generateRecommendations(validation, adjustments) {
  const recommendations = [];
  
  if (!validation) return recommendations;
  
  if (validation.status === ComplianceStatus.COMPLIANT) {
    recommendations.push('Audio meets all target platform requirements - no changes needed');
    return recommendations;
  }
  
  // Check for common issues
  const tpIssues = validation.results?.filter(r => 
    r.checks?.some(c => c.metric === MetricType.TRUE_PEAK && c.status !== ComplianceStatus.COMPLIANT)
  ) || [];
  
  if (tpIssues.length > 0) {
    recommendations.push('Apply true peak limiting to meet platform requirements');
  }
  
  const loudnessIssues = validation.results?.filter(r =>
    r.checks?.some(c => c.metric === MetricType.INTEGRATED_LOUDNESS && c.status === ComplianceStatus.NON_COMPLIANT)
  ) || [];
  
  if (loudnessIssues.length > 0) {
    recommendations.push('Adjust integrated loudness to match target platform specifications');
  }
  
  const lraIssues = validation.results?.filter(r =>
    r.checks?.some(c => c.metric === MetricType.LOUDNESS_RANGE && c.status !== ComplianceStatus.COMPLIANT)
  ) || [];
  
  if (lraIssues.length > 0) {
    recommendations.push('Consider dynamics processing to adjust loudness range');
  }
  
  // Platform-specific recommendations
  if (validation.summary?.nonCompliant?.includes('ebu-r128')) {
    recommendations.push('EBU R128 compliance requires precise -23 LUFS ±0.5 - consider dedicated broadcast mastering');
  }
  
  return recommendations;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Main validation functions
  validatePlatform,
  validateMultiPlatform,
  quickCheck,
  
  // Analysis functions
  calculateAdjustments,
  findCompliantPlatforms,
  generateReport,
  generateRecommendations,
  
  // Utility functions
  getStandard,
  getPlatformsByCategory,
  expandPlatforms,
  checkRange,
  worstStatus,
  
  // Constants
  PlatformCategory,
  ComplianceStatus,
  MetricType,
  STATUS_DESCRIPTIONS,
  PLATFORM_STANDARDS,
  PLATFORM_GROUPS
};
