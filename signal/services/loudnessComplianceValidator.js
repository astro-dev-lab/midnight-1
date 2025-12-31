/**
 * Loudness Standard Compliance Validator
 * 
 * Multi-platform simultaneous validation against streaming
 * services, broadcast standards, and distribution requirements.
 * 
 * Validates against: Spotify, Apple Music, YouTube, Tidal,
 * Amazon Music, EBU R128, ATSC A/85, ARIB TR-B32, and more.
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
  GAMING: 'GAMING'
});

/**
 * Compliance status
 */
const ComplianceStatus = Object.freeze({
  COMPLIANT: 'COMPLIANT',
  WARNING: 'WARNING',
  NON_COMPLIANT: 'NON_COMPLIANT',
  UNKNOWN: 'UNKNOWN'
});

/**
 * Loudness measurement types
 */
const MeasurementType = Object.freeze({
  INTEGRATED: 'INTEGRATED',
  SHORT_TERM: 'SHORT_TERM',
  MOMENTARY: 'MOMENTARY',
  TRUE_PEAK: 'TRUE_PEAK',
  LRA: 'LRA'
});

/**
 * Platform loudness specifications
 * All loudness values in LUFS, true peak in dBTP
 */
const PLATFORM_SPECS = Object.freeze({
  // =========================================
  // Streaming Platforms
  // =========================================
  spotify: {
    name: 'Spotify',
    category: PlatformCategory.STREAMING,
    targetLufs: -14,
    toleranceLufs: 1.0,
    truePeakLimit: -1.0,
    lraMax: null,
    normalization: 'positive_gain',
    description: 'Spotify normalizes to -14 LUFS with positive gain for quiet tracks'
  },
  
  apple_music: {
    name: 'Apple Music',
    category: PlatformCategory.STREAMING,
    targetLufs: -16,
    toleranceLufs: 1.0,
    truePeakLimit: -1.0,
    lraMax: null,
    normalization: 'sound_check',
    description: 'Apple Music uses Sound Check normalization around -16 LUFS'
  },
  
  youtube: {
    name: 'YouTube',
    category: PlatformCategory.STREAMING,
    targetLufs: -14,
    toleranceLufs: 1.0,
    truePeakLimit: -1.0,
    lraMax: null,
    normalization: 'negative_only',
    description: 'YouTube normalizes down to -14 LUFS but does not boost quiet content'
  },
  
  youtube_music: {
    name: 'YouTube Music',
    category: PlatformCategory.STREAMING,
    targetLufs: -14,
    toleranceLufs: 1.0,
    truePeakLimit: -1.0,
    lraMax: null,
    normalization: 'negative_only',
    description: 'YouTube Music follows YouTube normalization'
  },
  
  tidal: {
    name: 'Tidal',
    category: PlatformCategory.STREAMING,
    targetLufs: -14,
    toleranceLufs: 1.0,
    truePeakLimit: -1.0,
    lraMax: null,
    normalization: 'reference',
    description: 'Tidal normalizes to -14 LUFS reference level'
  },
  
  amazon_music: {
    name: 'Amazon Music',
    category: PlatformCategory.STREAMING,
    targetLufs: -14,
    toleranceLufs: 1.0,
    truePeakLimit: -2.0,
    lraMax: null,
    normalization: 'positive_gain',
    description: 'Amazon Music normalizes to -14 LUFS'
  },
  
  deezer: {
    name: 'Deezer',
    category: PlatformCategory.STREAMING,
    targetLufs: -15,
    toleranceLufs: 1.0,
    truePeakLimit: -1.0,
    lraMax: null,
    normalization: 'positive_gain',
    description: 'Deezer normalizes to -15 LUFS'
  },
  
  pandora: {
    name: 'Pandora',
    category: PlatformCategory.STREAMING,
    targetLufs: -14,
    toleranceLufs: 1.5,
    truePeakLimit: -1.0,
    lraMax: null,
    normalization: 'positive_gain',
    description: 'Pandora normalizes around -14 LUFS'
  },
  
  soundcloud: {
    name: 'SoundCloud',
    category: PlatformCategory.STREAMING,
    targetLufs: -14,
    toleranceLufs: 2.0,
    truePeakLimit: -1.0,
    lraMax: null,
    normalization: 'optional',
    description: 'SoundCloud optional normalization to -14 LUFS'
  },
  
  // =========================================
  // Broadcast Standards
  // =========================================
  ebu_r128: {
    name: 'EBU R128',
    category: PlatformCategory.BROADCAST,
    targetLufs: -23,
    toleranceLufs: 0.5,
    truePeakLimit: -1.0,
    lraMax: 20,
    normalization: 'standard',
    description: 'European broadcast standard -23 LUFS ±0.5 LU'
  },
  
  atsc_a85: {
    name: 'ATSC A/85',
    category: PlatformCategory.BROADCAST,
    targetLufs: -24,
    toleranceLufs: 2.0,
    truePeakLimit: -2.0,
    lraMax: null,
    normalization: 'standard',
    description: 'US broadcast standard -24 LKFS ±2 LU'
  },
  
  arib_tr_b32: {
    name: 'ARIB TR-B32',
    category: PlatformCategory.BROADCAST,
    targetLufs: -24,
    toleranceLufs: 2.0,
    truePeakLimit: -1.0,
    lraMax: null,
    normalization: 'standard',
    description: 'Japanese broadcast standard -24 LKFS'
  },
  
  op_59: {
    name: 'OP-59 (Australia)',
    category: PlatformCategory.BROADCAST,
    targetLufs: -24,
    toleranceLufs: 1.0,
    truePeakLimit: -2.0,
    lraMax: null,
    normalization: 'standard',
    description: 'Australian broadcast standard -24 LKFS'
  },
  
  // =========================================
  // Cinema & Film
  // =========================================
  dolby_atmos: {
    name: 'Dolby Atmos',
    category: PlatformCategory.CINEMA,
    targetLufs: -18,
    toleranceLufs: 2.0,
    truePeakLimit: -1.0,
    lraMax: null,
    normalization: 'reference',
    description: 'Dolby Atmos music reference -18 LUFS'
  },
  
  netflix: {
    name: 'Netflix',
    category: PlatformCategory.CINEMA,
    targetLufs: -27,
    toleranceLufs: 2.0,
    truePeakLimit: -2.0,
    lraMax: null,
    normalization: 'dialog_anchor',
    description: 'Netflix dialog-anchored loudness -27 LUFS'
  },
  
  // =========================================
  // Podcast Platforms
  // =========================================
  apple_podcasts: {
    name: 'Apple Podcasts',
    category: PlatformCategory.PODCAST,
    targetLufs: -16,
    toleranceLufs: 1.0,
    truePeakLimit: -1.0,
    lraMax: null,
    normalization: 'sound_check',
    description: 'Apple Podcasts recommends -16 LUFS'
  },
  
  spotify_podcasts: {
    name: 'Spotify Podcasts',
    category: PlatformCategory.PODCAST,
    targetLufs: -14,
    toleranceLufs: 1.0,
    truePeakLimit: -1.0,
    lraMax: null,
    normalization: 'positive_gain',
    description: 'Spotify Podcasts normalizes same as music'
  },
  
  // =========================================
  // Gaming
  // =========================================
  playstation: {
    name: 'PlayStation',
    category: PlatformCategory.GAMING,
    targetLufs: -24,
    toleranceLufs: 2.0,
    truePeakLimit: -1.0,
    lraMax: null,
    normalization: 'reference',
    description: 'PlayStation audio reference -24 LUFS'
  },
  
  xbox: {
    name: 'Xbox',
    category: PlatformCategory.GAMING,
    targetLufs: -24,
    toleranceLufs: 2.0,
    truePeakLimit: -1.0,
    lraMax: null,
    normalization: 'reference',
    description: 'Xbox audio reference -24 LUFS'
  }
});

/**
 * Preset platform groups for common use cases
 */
const PLATFORM_GROUPS = Object.freeze({
  streaming_all: ['spotify', 'apple_music', 'youtube', 'tidal', 'amazon_music', 'deezer'],
  streaming_major: ['spotify', 'apple_music', 'youtube'],
  broadcast_intl: ['ebu_r128', 'atsc_a85', 'arib_tr_b32'],
  broadcast_us: ['atsc_a85'],
  broadcast_eu: ['ebu_r128'],
  podcast_all: ['apple_podcasts', 'spotify_podcasts'],
  cinema: ['dolby_atmos', 'netflix'],
  gaming: ['playstation', 'xbox']
});

/**
 * Compliance status descriptions
 */
const STATUS_DESCRIPTIONS = Object.freeze({
  [ComplianceStatus.COMPLIANT]: 'Audio meets all platform requirements',
  [ComplianceStatus.WARNING]: 'Audio may require adjustment for optimal playback',
  [ComplianceStatus.NON_COMPLIANT]: 'Audio does not meet platform requirements',
  [ComplianceStatus.UNKNOWN]: 'Unable to determine compliance status'
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get platform specification
 * @param {string} platformId - Platform identifier
 * @returns {Object|null} Platform spec or null
 */
function getPlatformSpec(platformId) {
  return PLATFORM_SPECS[platformId] || null;
}

/**
 * Get platforms in a group
 * @param {string} groupId - Group identifier
 * @returns {Array<string>} Platform IDs
 */
function getPlatformGroup(groupId) {
  return PLATFORM_GROUPS[groupId] || [];
}

/**
 * Get all platform IDs
 * @returns {Array<string>} All platform IDs
 */
function getAllPlatforms() {
  return Object.keys(PLATFORM_SPECS);
}

/**
 * Get platforms by category
 * @param {string} category - PlatformCategory
 * @returns {Array<string>} Platform IDs
 */
function getPlatformsByCategory(category) {
  return Object.entries(PLATFORM_SPECS)
    .filter(([, spec]) => spec.category === category)
    .map(([id]) => id);
}

/**
 * Calculate deviation from target
 * @param {number} measured - Measured value
 * @param {number} target - Target value
 * @returns {number} Deviation (positive = louder than target)
 */
function calculateDeviation(measured, target) {
  return measured - target;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate loudness against a single platform
 * @param {Object} metrics - Loudness metrics
 * @param {string} platformId - Platform identifier
 * @returns {Object} Validation result
 */
function validatePlatform(metrics, platformId) {
  const spec = getPlatformSpec(platformId);
  
  if (!spec) {
    return {
      platformId,
      platform: null,
      status: ComplianceStatus.UNKNOWN,
      message: `Unknown platform: ${platformId}`,
      issues: [],
      metrics: null
    };
  }
  
  if (!metrics || typeof metrics.integratedLufs !== 'number') {
    return {
      platformId,
      platform: spec.name,
      status: ComplianceStatus.UNKNOWN,
      message: 'Insufficient loudness metrics provided',
      issues: [],
      metrics: null
    };
  }
  
  const issues = [];
  let worstStatus = ComplianceStatus.COMPLIANT;
  
  // Check integrated loudness
  const lufsDeviation = calculateDeviation(metrics.integratedLufs, spec.targetLufs);
  const lufsAbsDeviation = Math.abs(lufsDeviation);
  
  if (lufsAbsDeviation > spec.toleranceLufs * 2) {
    issues.push({
      type: MeasurementType.INTEGRATED,
      severity: 'error',
      message: `Integrated loudness ${metrics.integratedLufs.toFixed(1)} LUFS is ${lufsAbsDeviation.toFixed(1)} LU from target ${spec.targetLufs} LUFS`,
      measured: metrics.integratedLufs,
      target: spec.targetLufs,
      deviation: lufsDeviation
    });
    worstStatus = ComplianceStatus.NON_COMPLIANT;
  } else if (lufsAbsDeviation > spec.toleranceLufs) {
    issues.push({
      type: MeasurementType.INTEGRATED,
      severity: 'warning',
      message: `Integrated loudness ${metrics.integratedLufs.toFixed(1)} LUFS slightly off target ${spec.targetLufs} LUFS`,
      measured: metrics.integratedLufs,
      target: spec.targetLufs,
      deviation: lufsDeviation
    });
    if (worstStatus === ComplianceStatus.COMPLIANT) {
      worstStatus = ComplianceStatus.WARNING;
    }
  }
  
  // Check true peak
  if (spec.truePeakLimit !== null && typeof metrics.truePeakDbtp === 'number') {
    if (metrics.truePeakDbtp > spec.truePeakLimit) {
      issues.push({
        type: MeasurementType.TRUE_PEAK,
        severity: 'error',
        message: `True peak ${metrics.truePeakDbtp.toFixed(1)} dBTP exceeds limit ${spec.truePeakLimit} dBTP`,
        measured: metrics.truePeakDbtp,
        limit: spec.truePeakLimit,
        excess: metrics.truePeakDbtp - spec.truePeakLimit
      });
      worstStatus = ComplianceStatus.NON_COMPLIANT;
    }
  }
  
  // Check LRA if specified
  if (spec.lraMax !== null && typeof metrics.lra === 'number') {
    if (metrics.lra > spec.lraMax) {
      issues.push({
        type: MeasurementType.LRA,
        severity: 'warning',
        message: `Loudness range ${metrics.lra.toFixed(1)} LU exceeds recommended maximum ${spec.lraMax} LU`,
        measured: metrics.lra,
        limit: spec.lraMax,
        excess: metrics.lra - spec.lraMax
      });
      if (worstStatus === ComplianceStatus.COMPLIANT) {
        worstStatus = ComplianceStatus.WARNING;
      }
    }
  }
  
  return {
    platformId,
    platform: spec.name,
    category: spec.category,
    status: worstStatus,
    message: worstStatus === ComplianceStatus.COMPLIANT 
      ? `Meets ${spec.name} requirements`
      : `${issues.length} issue(s) for ${spec.name}`,
    issues,
    metrics: {
      integratedLufs: metrics.integratedLufs,
      truePeakDbtp: metrics.truePeakDbtp,
      lra: metrics.lra,
      targetLufs: spec.targetLufs,
      deviation: lufsDeviation
    },
    normalization: spec.normalization,
    description: spec.description
  };
}

/**
 * Validate loudness against multiple platforms
 * @param {Object} metrics - Loudness metrics
 * @param {Array<string>} platformIds - Platform identifiers
 * @returns {Object} Multi-platform validation result
 */
function validateMultiplePlatforms(metrics, platformIds) {
  if (!platformIds || platformIds.length === 0) {
    platformIds = getPlatformGroup('streaming_major');
  }
  
  const results = platformIds.map(id => validatePlatform(metrics, id));
  
  const compliant = results.filter(r => r.status === ComplianceStatus.COMPLIANT);
  const warning = results.filter(r => r.status === ComplianceStatus.WARNING);
  const nonCompliant = results.filter(r => r.status === ComplianceStatus.NON_COMPLIANT);
  
  // Overall status
  let overallStatus;
  if (nonCompliant.length > 0) {
    overallStatus = ComplianceStatus.NON_COMPLIANT;
  } else if (warning.length > 0) {
    overallStatus = ComplianceStatus.WARNING;
  } else if (compliant.length > 0) {
    overallStatus = ComplianceStatus.COMPLIANT;
  } else {
    overallStatus = ComplianceStatus.UNKNOWN;
  }
  
  return {
    overallStatus,
    summary: {
      total: results.length,
      compliant: compliant.length,
      warning: warning.length,
      nonCompliant: nonCompliant.length
    },
    results,
    compliantPlatforms: compliant.map(r => r.platformId),
    nonCompliantPlatforms: nonCompliant.map(r => r.platformId),
    metrics
  };
}

/**
 * Validate against a platform group
 * @param {Object} metrics - Loudness metrics
 * @param {string} groupId - Group identifier
 * @returns {Object} Group validation result
 */
function validatePlatformGroup(metrics, groupId) {
  const platforms = getPlatformGroup(groupId);
  
  if (platforms.length === 0) {
    return {
      groupId,
      error: `Unknown platform group: ${groupId}`,
      results: []
    };
  }
  
  const validation = validateMultiplePlatforms(metrics, platforms);
  
  return {
    groupId,
    ...validation
  };
}

/**
 * Quick compliance check
 * @param {Object} metrics - Loudness metrics
 * @param {Array<string>} platformIds - Optional platform list
 * @returns {Object} Quick check result
 */
function quickCheck(metrics, platformIds) {
  const result = validateMultiplePlatforms(metrics, platformIds);
  
  return {
    overallStatus: result.overallStatus,
    isCompliant: result.overallStatus === ComplianceStatus.COMPLIANT,
    hasWarnings: result.summary.warning > 0,
    hasErrors: result.summary.nonCompliant > 0,
    compliantCount: result.summary.compliant,
    totalChecked: result.summary.total,
    complianceRate: result.summary.total > 0 
      ? (result.summary.compliant / result.summary.total * 100).toFixed(1) + '%'
      : '0%'
  };
}

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * Find optimal loudness target for multiple platforms
 * @param {Array<string>} platformIds - Platforms to optimize for
 * @returns {Object} Optimal target analysis
 */
function findOptimalTarget(platformIds) {
  if (!platformIds || platformIds.length === 0) {
    platformIds = getPlatformGroup('streaming_major');
  }
  
  const specs = platformIds
    .map(id => ({ id, spec: getPlatformSpec(id) }))
    .filter(p => p.spec !== null);
  
  if (specs.length === 0) {
    return { error: 'No valid platforms specified' };
  }
  
  // Calculate optimal target (weighted average with consideration for strictest)
  const targets = specs.map(p => p.spec.targetLufs);
  const avgTarget = targets.reduce((a, b) => a + b, 0) / targets.length;
  
  // Find strictest true peak requirement
  const truePeakLimits = specs
    .map(p => p.spec.truePeakLimit)
    .filter(tp => tp !== null);
  const strictestTruePeak = truePeakLimits.length > 0 
    ? Math.min(...truePeakLimits) 
    : -1.0;
  
  // Find strictest tolerance
  const strictestTolerance = Math.min(...specs.map(p => p.spec.toleranceLufs));
  
  return {
    optimalLufs: Math.round(avgTarget * 10) / 10,
    optimalTruePeak: strictestTruePeak,
    targetRange: {
      min: Math.min(...targets),
      max: Math.max(...targets),
      spread: Math.max(...targets) - Math.min(...targets)
    },
    strictestTolerance,
    platforms: specs.map(p => ({
      id: p.id,
      name: p.spec.name,
      target: p.spec.targetLufs
    })),
    recommendation: `Target ${Math.round(avgTarget)} LUFS with true peak ≤ ${strictestTruePeak} dBTP`
  };
}

/**
 * Predict normalization impact per platform
 * @param {Object} metrics - Current loudness metrics
 * @param {Array<string>} platformIds - Platforms to analyze
 * @returns {Object} Normalization predictions
 */
function predictNormalization(metrics, platformIds) {
  if (!metrics || typeof metrics.integratedLufs !== 'number') {
    return { error: 'Integrated loudness required' };
  }
  
  if (!platformIds || platformIds.length === 0) {
    platformIds = getPlatformGroup('streaming_all');
  }
  
  const predictions = platformIds.map(id => {
    const spec = getPlatformSpec(id);
    if (!spec) return null;
    
    const deviation = metrics.integratedLufs - spec.targetLufs;
    const gainChange = -deviation; // Negative deviation = boost needed
    
    let action;
    let willNormalize;
    
    if (Math.abs(deviation) < 0.5) {
      action = 'none';
      willNormalize = false;
    } else if (deviation > 0) {
      // Louder than target - will be turned down
      action = 'reduce';
      willNormalize = true;
    } else {
      // Quieter than target
      if (spec.normalization === 'negative_only') {
        action = 'none';
        willNormalize = false;
      } else {
        action = 'boost';
        willNormalize = true;
      }
    }
    
    return {
      platformId: id,
      platform: spec.name,
      currentLufs: metrics.integratedLufs,
      targetLufs: spec.targetLufs,
      deviation,
      gainChange,
      action,
      willNormalize,
      normalizationType: spec.normalization
    };
  }).filter(p => p !== null);
  
  const normalized = predictions.filter(p => p.willNormalize);
  const unchanged = predictions.filter(p => !p.willNormalize);
  
  return {
    predictions,
    summary: {
      total: predictions.length,
      willNormalize: normalized.length,
      unchanged: unchanged.length,
      averageGainChange: normalized.length > 0 
        ? normalized.reduce((sum, p) => sum + p.gainChange, 0) / normalized.length
        : 0
    },
    worstCase: predictions.reduce((worst, p) => 
      Math.abs(p.gainChange) > Math.abs(worst.gainChange) ? p : worst
    , predictions[0] || { gainChange: 0 })
  };
}

/**
 * Generate compliance report
 * @param {Object} metrics - Loudness metrics
 * @param {Object} options - Report options
 * @returns {Object} Compliance report
 */
function generateComplianceReport(metrics, options = {}) {
  const {
    platforms = getPlatformGroup('streaming_major'),
    includeRecommendations = true,
    includeNormalization = true
  } = options;
  
  const validation = validateMultiplePlatforms(metrics, platforms);
  const optimal = findOptimalTarget(platforms);
  
  const report = {
    timestamp: new Date().toISOString(),
    metrics: {
      integratedLufs: metrics.integratedLufs,
      truePeakDbtp: metrics.truePeakDbtp,
      lra: metrics.lra
    },
    compliance: validation,
    optimalTarget: optimal
  };
  
  if (includeNormalization) {
    report.normalization = predictNormalization(metrics, platforms);
  }
  
  if (includeRecommendations) {
    report.recommendations = generateRecommendations(validation, optimal);
  }
  
  return report;
}

/**
 * Generate recommendations based on validation
 * @param {Object} validation - Validation result
 * @param {Object} optimal - Optimal target analysis
 * @returns {Array<string>} Recommendations
 */
function generateRecommendations(validation, optimal) {
  const recommendations = [];
  
  if (!validation || !validation.results) {
    return recommendations;
  }
  
  // Check for loudness issues
  const loudnessIssues = validation.results
    .flatMap(r => r.issues)
    .filter(i => i.type === MeasurementType.INTEGRATED);
  
  if (loudnessIssues.length > 0) {
    const avgDeviation = loudnessIssues.reduce((sum, i) => sum + i.deviation, 0) / loudnessIssues.length;
    
    if (avgDeviation > 0) {
      recommendations.push(`Reduce loudness by approximately ${Math.abs(avgDeviation).toFixed(1)} LU to improve compliance`);
    } else {
      recommendations.push(`Consider increasing loudness by approximately ${Math.abs(avgDeviation).toFixed(1)} LU`);
    }
  }
  
  // Check for true peak issues
  const truePeakIssues = validation.results
    .flatMap(r => r.issues)
    .filter(i => i.type === MeasurementType.TRUE_PEAK);
  
  if (truePeakIssues.length > 0) {
    const maxExcess = Math.max(...truePeakIssues.map(i => i.excess));
    recommendations.push(`Apply true peak limiting to reduce peaks by at least ${maxExcess.toFixed(1)} dB`);
  }
  
  // Check for LRA issues
  const lraIssues = validation.results
    .flatMap(r => r.issues)
    .filter(i => i.type === MeasurementType.LRA);
  
  if (lraIssues.length > 0) {
    recommendations.push('Consider gentle compression to reduce loudness range for broadcast compliance');
  }
  
  // Optimal target recommendation
  if (optimal && optimal.optimalLufs) {
    recommendations.push(optimal.recommendation);
  }
  
  // All compliant
  if (validation.overallStatus === ComplianceStatus.COMPLIANT) {
    recommendations.push('Audio meets all platform requirements - no changes needed');
  }
  
  return recommendations;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Validation functions
  validatePlatform,
  validateMultiplePlatforms,
  validatePlatformGroup,
  quickCheck,
  
  // Analysis functions
  findOptimalTarget,
  predictNormalization,
  generateComplianceReport,
  generateRecommendations,
  
  // Utility functions
  getPlatformSpec,
  getPlatformGroup,
  getAllPlatforms,
  getPlatformsByCategory,
  calculateDeviation,
  
  // Constants
  PlatformCategory,
  ComplianceStatus,
  MeasurementType,
  PLATFORM_SPECS,
  PLATFORM_GROUPS,
  STATUS_DESCRIPTIONS
};
