/**
 * Metadata Completeness & Consistency Validator
 * 
 * Validates asset metadata for completeness, format correctness,
 * and consistency across version lineages. Ensures delivery-ready
 * metadata meets platform requirements.
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Metadata quality is critical
 * for platform acceptance and proper content attribution.
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Validation status levels
 */
const ValidationStatus = Object.freeze({
  COMPLETE: 'COMPLETE',           // All required fields present and valid
  MOSTLY_COMPLETE: 'MOSTLY_COMPLETE', // Minor issues only
  INCOMPLETE: 'INCOMPLETE',       // Missing required fields
  INVALID: 'INVALID'              // Has invalid data
});

/**
 * Field importance levels
 */
const FieldImportance = Object.freeze({
  REQUIRED: 'REQUIRED',     // Must have for delivery
  RECOMMENDED: 'RECOMMENDED', // Should have for best results
  OPTIONAL: 'OPTIONAL'      // Nice to have
});

/**
 * Field validation result
 */
const FieldStatus = Object.freeze({
  VALID: 'VALID',
  MISSING: 'MISSING',
  INVALID: 'INVALID',
  WARNING: 'WARNING'
});

/**
 * Standard metadata fields and their requirements
 */
const METADATA_FIELDS = Object.freeze({
  // Core identification
  isrc: {
    importance: FieldImportance.REQUIRED,
    description: 'International Standard Recording Code',
    pattern: /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/,
    example: 'USRC17607839'
  },
  title: {
    importance: FieldImportance.REQUIRED,
    description: 'Track title',
    minLength: 1,
    maxLength: 200,
    example: 'Song Title'
  },
  artist: {
    importance: FieldImportance.REQUIRED,
    description: 'Primary artist name',
    minLength: 1,
    maxLength: 200,
    example: 'Artist Name'
  },
  album: {
    importance: FieldImportance.RECOMMENDED,
    description: 'Album title',
    minLength: 1,
    maxLength: 200,
    example: 'Album Name'
  },
  
  // Credits
  composer: {
    importance: FieldImportance.RECOMMENDED,
    description: 'Composer/songwriter',
    minLength: 1,
    example: 'Composer Name'
  },
  producer: {
    importance: FieldImportance.RECOMMENDED,
    description: 'Producer name',
    minLength: 1,
    example: 'Producer Name'
  },
  mixEngineer: {
    importance: FieldImportance.OPTIONAL,
    description: 'Mixing engineer',
    minLength: 1,
    example: 'Engineer Name'
  },
  masterEngineer: {
    importance: FieldImportance.OPTIONAL,
    description: 'Mastering engineer',
    minLength: 1,
    example: 'Engineer Name'
  },
  
  // Identifiers
  upc: {
    importance: FieldImportance.RECOMMENDED,
    description: 'Universal Product Code',
    pattern: /^[0-9]{12,13}$/,
    example: '012345678901'
  },
  catalogNumber: {
    importance: FieldImportance.OPTIONAL,
    description: 'Label catalog number',
    minLength: 1,
    example: 'CAT-001'
  },
  
  // Dates
  releaseDate: {
    importance: FieldImportance.RECOMMENDED,
    description: 'Release date (ISO format)',
    pattern: /^\d{4}-\d{2}-\d{2}$/,
    example: '2024-01-15'
  },
  recordingDate: {
    importance: FieldImportance.OPTIONAL,
    description: 'Recording date',
    pattern: /^\d{4}(-\d{2}(-\d{2})?)?$/,
    example: '2024-01-10'
  },
  
  // Classification
  genre: {
    importance: FieldImportance.RECOMMENDED,
    description: 'Primary genre',
    minLength: 1,
    maxLength: 100,
    example: 'Electronic'
  },
  subgenre: {
    importance: FieldImportance.OPTIONAL,
    description: 'Sub-genre classification',
    minLength: 1,
    example: 'Deep House'
  },
  bpm: {
    importance: FieldImportance.OPTIONAL,
    description: 'Beats per minute',
    min: 20,
    max: 300,
    type: 'number'
  },
  key: {
    importance: FieldImportance.OPTIONAL,
    description: 'Musical key',
    pattern: /^[A-G](#|b)?\s*(major|minor|maj|min|m)?$/i,
    example: 'C major'
  },
  
  // Technical
  duration: {
    importance: FieldImportance.REQUIRED,
    description: 'Track duration in seconds',
    min: 0,
    type: 'number'
  },
  sampleRate: {
    importance: FieldImportance.RECOMMENDED,
    description: 'Sample rate in Hz',
    validValues: [44100, 48000, 88200, 96000, 176400, 192000],
    type: 'number'
  },
  bitDepth: {
    importance: FieldImportance.RECOMMENDED,
    description: 'Bit depth',
    validValues: [16, 24, 32],
    type: 'number'
  },
  
  // Rights
  copyright: {
    importance: FieldImportance.RECOMMENDED,
    description: 'Copyright notice',
    minLength: 1,
    example: '© 2024 Label Name'
  },
  publisher: {
    importance: FieldImportance.OPTIONAL,
    description: 'Publisher name',
    minLength: 1,
    example: 'Publisher Name'
  },
  label: {
    importance: FieldImportance.RECOMMENDED,
    description: 'Record label',
    minLength: 1,
    example: 'Label Name'
  },
  
  // Content flags
  explicit: {
    importance: FieldImportance.RECOMMENDED,
    description: 'Explicit content flag',
    type: 'boolean'
  },
  instrumental: {
    importance: FieldImportance.OPTIONAL,
    description: 'Instrumental track flag',
    type: 'boolean'
  }
});

/**
 * Platform-specific metadata requirements
 */
const PLATFORM_REQUIREMENTS = Object.freeze({
  SPOTIFY: {
    required: ['isrc', 'title', 'artist'],
    recommended: ['album', 'genre', 'releaseDate', 'explicit'],
    maxTitleLength: 200,
    maxArtistLength: 200
  },
  APPLE_MUSIC: {
    required: ['isrc', 'title', 'artist', 'genre'],
    recommended: ['album', 'composer', 'releaseDate', 'copyright', 'explicit'],
    maxTitleLength: 200,
    maxArtistLength: 200
  },
  YOUTUBE_MUSIC: {
    required: ['title', 'artist'],
    recommended: ['album', 'genre', 'releaseDate'],
    maxTitleLength: 100,
    maxArtistLength: 100
  },
  TIDAL: {
    required: ['isrc', 'title', 'artist'],
    recommended: ['album', 'genre', 'releaseDate', 'copyright', 'label'],
    maxTitleLength: 200,
    maxArtistLength: 200
  },
  AMAZON_MUSIC: {
    required: ['isrc', 'title', 'artist'],
    recommended: ['album', 'genre', 'releaseDate', 'upc'],
    maxTitleLength: 250,
    maxArtistLength: 250
  },
  SOUNDCLOUD: {
    required: ['title'],
    recommended: ['artist', 'genre', 'bpm'],
    maxTitleLength: 100,
    maxArtistLength: 100
  }
});

// ============================================================================
// ISRC Validation
// ============================================================================

/**
 * Validate ISRC format and structure
 * @param {string} isrc - ISRC code to validate
 * @returns {Object} Validation result
 */
function validateISRC(isrc) {
  if (!isrc || typeof isrc !== 'string') {
    return {
      valid: false,
      error: 'ISRC is required',
      status: FieldStatus.MISSING
    };
  }

  // Remove any spaces or hyphens (common formatting)
  const cleanISRC = isrc.replace(/[-\s]/g, '').toUpperCase();

  // ISRC format: CC-XXX-YY-NNNNN (12 characters when stripped)
  if (cleanISRC.length !== 12) {
    return {
      valid: false,
      error: `Invalid length: expected 12 characters, got ${cleanISRC.length}`,
      status: FieldStatus.INVALID,
      value: isrc
    };
  }

  // Validate pattern
  const pattern = METADATA_FIELDS.isrc.pattern;
  if (!pattern.test(cleanISRC)) {
    return {
      valid: false,
      error: 'Invalid ISRC format. Expected: CC-XXX-YY-NNNNN',
      status: FieldStatus.INVALID,
      value: isrc
    };
  }

  // Extract components
  const countryCode = cleanISRC.substring(0, 2);
  const registrantCode = cleanISRC.substring(2, 5);
  const yearCode = cleanISRC.substring(5, 7);
  const designationCode = cleanISRC.substring(7, 12);

  return {
    valid: true,
    status: FieldStatus.VALID,
    value: cleanISRC,
    formatted: `${countryCode}-${registrantCode}-${yearCode}-${designationCode}`,
    components: {
      countryCode,
      registrantCode,
      yearCode,
      designationCode
    }
  };
}

// ============================================================================
// Field Validation
// ============================================================================

/**
 * Validate a single metadata field
 * @param {string} fieldName - Field name
 * @param {*} value - Field value
 * @returns {Object} Validation result
 */
function validateField(fieldName, value) {
  const spec = METADATA_FIELDS[fieldName];
  
  if (!spec) {
    return {
      field: fieldName,
      status: FieldStatus.WARNING,
      message: 'Unknown field'
    };
  }

  // Check for missing value
  if (value === undefined || value === null || value === '') {
    return {
      field: fieldName,
      status: FieldStatus.MISSING,
      importance: spec.importance,
      description: spec.description
    };
  }

  // Type checking
  if (spec.type === 'number') {
    const numValue = typeof value === 'number' ? value : parseFloat(value);
    if (isNaN(numValue)) {
      return {
        field: fieldName,
        status: FieldStatus.INVALID,
        error: 'Must be a number',
        value
      };
    }

    if (spec.min !== undefined && numValue < spec.min) {
      return {
        field: fieldName,
        status: FieldStatus.INVALID,
        error: `Value ${numValue} below minimum ${spec.min}`,
        value: numValue
      };
    }

    if (spec.max !== undefined && numValue > spec.max) {
      return {
        field: fieldName,
        status: FieldStatus.INVALID,
        error: `Value ${numValue} exceeds maximum ${spec.max}`,
        value: numValue
      };
    }

    if (spec.validValues && !spec.validValues.includes(numValue)) {
      return {
        field: fieldName,
        status: FieldStatus.WARNING,
        warning: `Non-standard value: ${numValue}. Expected one of: ${spec.validValues.join(', ')}`,
        value: numValue
      };
    }

    return { field: fieldName, status: FieldStatus.VALID, value: numValue };
  }

  if (spec.type === 'boolean') {
    if (typeof value !== 'boolean') {
      return {
        field: fieldName,
        status: FieldStatus.INVALID,
        error: 'Must be a boolean',
        value
      };
    }
    return { field: fieldName, status: FieldStatus.VALID, value };
  }

  // String validation
  const strValue = String(value);

  if (spec.minLength && strValue.length < spec.minLength) {
    return {
      field: fieldName,
      status: FieldStatus.INVALID,
      error: `Too short: minimum ${spec.minLength} characters`,
      value: strValue
    };
  }

  if (spec.maxLength && strValue.length > spec.maxLength) {
    return {
      field: fieldName,
      status: FieldStatus.WARNING,
      warning: `Too long: ${strValue.length} characters, max ${spec.maxLength}`,
      value: strValue
    };
  }

  if (spec.pattern && !spec.pattern.test(strValue)) {
    return {
      field: fieldName,
      status: FieldStatus.INVALID,
      error: `Invalid format. Example: ${spec.example || 'N/A'}`,
      value: strValue
    };
  }

  return { field: fieldName, status: FieldStatus.VALID, value: strValue };
}

// ============================================================================
// Completeness Validation
// ============================================================================

/**
 * Validate metadata completeness
 * @param {Object} metadata - Metadata object
 * @returns {Object} Completeness validation result
 */
function validateCompleteness(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return {
      status: ValidationStatus.INVALID,
      error: 'Metadata must be an object'
    };
  }

  const results = {
    required: { passed: [], failed: [] },
    recommended: { passed: [], failed: [] },
    optional: { passed: [], failed: [] },
    fields: {}
  };

  // Check all defined fields
  for (const [fieldName, spec] of Object.entries(METADATA_FIELDS)) {
    const value = metadata[fieldName];
    const validation = fieldName === 'isrc' 
      ? validateISRC(value) 
      : validateField(fieldName, value);

    results.fields[fieldName] = validation;

    const category = spec.importance.toLowerCase();
    if (validation.status === FieldStatus.VALID) {
      results[category].passed.push(fieldName);
    } else {
      results[category].failed.push({
        field: fieldName,
        ...validation
      });
    }
  }

  // Calculate scores
  const requiredTotal = Object.values(METADATA_FIELDS)
    .filter(f => f.importance === FieldImportance.REQUIRED).length;
  const recommendedTotal = Object.values(METADATA_FIELDS)
    .filter(f => f.importance === FieldImportance.RECOMMENDED).length;

  const requiredScore = results.required.passed.length / requiredTotal;
  const recommendedScore = recommendedTotal > 0 
    ? results.recommended.passed.length / recommendedTotal 
    : 1;

  // Determine overall status
  let status;
  if (requiredScore === 1 && recommendedScore >= 0.8) {
    status = ValidationStatus.COMPLETE;
  } else if (requiredScore === 1) {
    status = ValidationStatus.MOSTLY_COMPLETE;
  } else if (requiredScore >= 0.5) {
    status = ValidationStatus.INCOMPLETE;
  } else {
    status = ValidationStatus.INVALID;
  }

  return {
    status,
    scores: {
      required: Math.round(requiredScore * 100),
      recommended: Math.round(recommendedScore * 100),
      overall: Math.round((requiredScore * 0.7 + recommendedScore * 0.3) * 100)
    },
    required: results.required,
    recommended: results.recommended,
    optional: results.optional,
    fields: results.fields,
    summary: {
      requiredComplete: results.required.failed.length === 0,
      missingRequired: results.required.failed.map(f => f.field),
      missingRecommended: results.recommended.failed.map(f => f.field)
    }
  };
}

// ============================================================================
// Platform Compatibility
// ============================================================================

/**
 * Validate metadata against platform requirements
 * @param {Object} metadata - Metadata object
 * @param {string} platform - Platform key
 * @returns {Object} Platform validation result
 */
function validateForPlatform(metadata, platform) {
  const spec = PLATFORM_REQUIREMENTS[platform];
  
  if (!spec) {
    return { platform, error: 'Unknown platform' };
  }

  const issues = [];
  const warnings = [];
  let ready = true;

  // Check required fields
  for (const field of spec.required) {
    const value = metadata[field];
    if (!value || (typeof value === 'string' && !value.trim())) {
      issues.push({
        field,
        severity: 'error',
        message: `Required field '${field}' is missing`
      });
      ready = false;
    }
  }

  // Check recommended fields
  for (const field of spec.recommended || []) {
    const value = metadata[field];
    if (!value || (typeof value === 'string' && !value.trim())) {
      warnings.push({
        field,
        severity: 'warning',
        message: `Recommended field '${field}' is missing`
      });
    }
  }

  // Check length limits
  if (spec.maxTitleLength && metadata.title) {
    if (metadata.title.length > spec.maxTitleLength) {
      warnings.push({
        field: 'title',
        severity: 'warning',
        message: `Title exceeds ${spec.maxTitleLength} characters`
      });
    }
  }

  if (spec.maxArtistLength && metadata.artist) {
    if (metadata.artist.length > spec.maxArtistLength) {
      warnings.push({
        field: 'artist',
        severity: 'warning',
        message: `Artist name exceeds ${spec.maxArtistLength} characters`
      });
    }
  }

  return {
    platform,
    ready,
    issues,
    warnings,
    score: ready ? (warnings.length === 0 ? 100 : 80) : 0
  };
}

/**
 * Validate metadata against all platforms
 * @param {Object} metadata - Metadata object
 * @returns {Object} All platform validation results
 */
function validateForAllPlatforms(metadata) {
  const results = {};
  let universallyReady = true;
  let totalScore = 0;

  for (const platform of Object.keys(PLATFORM_REQUIREMENTS)) {
    const validation = validateForPlatform(metadata, platform);
    results[platform] = validation;
    
    if (!validation.ready) {
      universallyReady = false;
    }
    totalScore += validation.score || 0;
  }

  const platformCount = Object.keys(PLATFORM_REQUIREMENTS).length;

  return {
    platforms: results,
    universallyReady,
    readyFor: Object.entries(results)
      .filter(([, v]) => v.ready)
      .map(([k]) => k),
    notReadyFor: Object.entries(results)
      .filter(([, v]) => !v.ready)
      .map(([k]) => k),
    averageScore: Math.round(totalScore / platformCount)
  };
}

// ============================================================================
// Consistency Validation
// ============================================================================

/**
 * Check consistency between related metadata fields
 * @param {Object} metadata - Metadata object
 * @returns {Object} Consistency check result
 */
function checkConsistency(metadata) {
  const issues = [];
  const warnings = [];

  // Check date consistency
  if (metadata.releaseDate && metadata.recordingDate) {
    const release = new Date(metadata.releaseDate);
    const recording = new Date(metadata.recordingDate);
    
    if (recording > release) {
      issues.push({
        type: 'DATE_INCONSISTENCY',
        message: 'Recording date is after release date',
        fields: ['releaseDate', 'recordingDate']
      });
    }
  }

  // Check ISRC year vs release date
  if (metadata.isrc && metadata.releaseDate) {
    const isrcValidation = validateISRC(metadata.isrc);
    if (isrcValidation.valid) {
      const isrcYear = parseInt('20' + isrcValidation.components.yearCode);
      const releaseYear = new Date(metadata.releaseDate).getFullYear();
      
      if (Math.abs(isrcYear - releaseYear) > 2) {
        warnings.push({
          type: 'YEAR_MISMATCH',
          message: `ISRC year (${isrcYear}) differs significantly from release year (${releaseYear})`,
          fields: ['isrc', 'releaseDate']
        });
      }
    }
  }

  // Check artist/composer duplication
  if (metadata.artist && metadata.composer) {
    if (metadata.artist.toLowerCase() === metadata.composer.toLowerCase()) {
      // Not necessarily an issue, but worth noting
    }
  }

  // Check explicit content flag vs instrumental
  if (metadata.explicit === true && metadata.instrumental === true) {
    issues.push({
      type: 'FLAG_CONFLICT',
      message: 'Track marked as both explicit and instrumental',
      fields: ['explicit', 'instrumental']
    });
  }

  // Check BPM reasonable range for genre
  if (metadata.bpm && metadata.genre) {
    const genre = metadata.genre.toLowerCase();
    const bpm = metadata.bpm;

    const genreBPMRanges = {
      'house': [118, 135],
      'techno': [125, 150],
      'drum and bass': [160, 180],
      'hip hop': [70, 115],
      'dubstep': [130, 150],
      'ambient': [60, 90]
    };

    for (const [genreKey, [min, max]] of Object.entries(genreBPMRanges)) {
      if (genre.includes(genreKey) && (bpm < min - 20 || bpm > max + 20)) {
        warnings.push({
          type: 'BPM_GENRE_MISMATCH',
          message: `BPM ${bpm} is unusual for ${metadata.genre} (typical: ${min}-${max})`,
          fields: ['bpm', 'genre']
        });
        break;
      }
    }
  }

  return {
    consistent: issues.length === 0,
    issues,
    warnings,
    checksPerformed: [
      'date_consistency',
      'isrc_year_match',
      'flag_conflicts',
      'bpm_genre_correlation'
    ]
  };
}

// ============================================================================
// Lineage Consistency
// ============================================================================

/**
 * Check metadata consistency across version lineage
 * @param {Array} versions - Array of version metadata objects
 * @returns {Object} Lineage consistency result
 */
function checkLineageConsistency(versions) {
  if (!Array.isArray(versions) || versions.length === 0) {
    return { error: 'No versions provided' };
  }

  if (versions.length === 1) {
    return {
      consistent: true,
      versionCount: 1,
      message: 'Single version - no lineage to check'
    };
  }

  const issues = [];
  const changes = [];
  
  // Fields that should remain constant across versions
  const immutableFields = ['isrc', 'title', 'artist', 'album', 'composer'];
  // Fields that may legitimately change
  const mutableFields = ['mixEngineer', 'masterEngineer', 'bpm', 'duration'];

  const firstVersion = versions[0];

  for (let i = 1; i < versions.length; i++) {
    const version = versions[i];
    const versionLabel = version.versionName || `Version ${i + 1}`;

    // Check immutable fields
    for (const field of immutableFields) {
      const originalValue = firstVersion[field];
      const currentValue = version[field];

      if (originalValue && currentValue && originalValue !== currentValue) {
        issues.push({
          type: 'IMMUTABLE_FIELD_CHANGED',
          field,
          originalValue,
          newValue: currentValue,
          version: versionLabel,
          severity: field === 'isrc' ? 'error' : 'warning'
        });
      }
    }

    // Track legitimate changes
    for (const field of mutableFields) {
      const originalValue = firstVersion[field];
      const currentValue = version[field];

      if (originalValue !== currentValue) {
        changes.push({
          field,
          from: originalValue,
          to: currentValue,
          version: versionLabel
        });
      }
    }
  }

  // Check for missing data in later versions
  for (let i = 1; i < versions.length; i++) {
    const version = versions[i];
    
    for (const field of Object.keys(METADATA_FIELDS)) {
      if (firstVersion[field] && !version[field]) {
        issues.push({
          type: 'FIELD_DROPPED',
          field,
          version: version.versionName || `Version ${i + 1}`,
          severity: 'warning'
        });
      }
    }
  }

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  return {
    consistent: errorCount === 0,
    versionCount: versions.length,
    issues,
    changes,
    summary: {
      errors: errorCount,
      warnings: warningCount,
      legitimateChanges: changes.length
    }
  };
}

// ============================================================================
// Quick Check
// ============================================================================

/**
 * Quick metadata validation check
 * @param {Object} metadata - Metadata object
 * @returns {Object} Quick check result
 */
function quickCheck(metadata) {
  const completeness = validateCompleteness(metadata);
  const consistency = checkConsistency(metadata);

  const issues = [];
  
  if (completeness.summary.missingRequired.length > 0) {
    issues.push(`Missing required: ${completeness.summary.missingRequired.join(', ')}`);
  }
  
  if (consistency.issues.length > 0) {
    issues.push(...consistency.issues.map(i => i.message));
  }

  return {
    status: completeness.status,
    score: completeness.scores.overall,
    requiredComplete: completeness.summary.requiredComplete,
    consistent: consistency.consistent,
    issues,
    warnings: consistency.warnings.map(w => w.message)
  };
}

// ============================================================================
// Full Analysis
// ============================================================================

/**
 * Complete metadata analysis
 * @param {Object} metadata - Metadata object
 * @param {Object} options - Analysis options
 * @returns {Object} Complete analysis result
 */
function analyze(metadata, options = {}) {
  const completeness = validateCompleteness(metadata);
  const consistency = checkConsistency(metadata);
  const platforms = validateForAllPlatforms(metadata);
  
  let lineage = null;
  if (options.versions && options.versions.length > 0) {
    lineage = checkLineageConsistency(options.versions);
  }

  // Generate recommendations
  const recommendations = [];

  if (completeness.summary.missingRequired.length > 0) {
    recommendations.push({
      priority: 'HIGH',
      message: `Add missing required fields: ${completeness.summary.missingRequired.join(', ')}`
    });
  }

  if (completeness.summary.missingRecommended.length > 0) {
    recommendations.push({
      priority: 'MEDIUM',
      message: `Consider adding: ${completeness.summary.missingRecommended.slice(0, 3).join(', ')}`
    });
  }

  if (consistency.issues.length > 0) {
    recommendations.push({
      priority: 'HIGH',
      message: 'Fix metadata inconsistencies before delivery'
    });
  }

  if (platforms.notReadyFor.length > 0) {
    recommendations.push({
      priority: 'MEDIUM',
      message: `Complete metadata for: ${platforms.notReadyFor.join(', ')}`
    });
  }

  return {
    status: completeness.status,
    completeness,
    consistency,
    platforms,
    lineage,
    recommendations,
    summary: {
      score: completeness.scores.overall,
      requiredComplete: completeness.summary.requiredComplete,
      consistent: consistency.consistent,
      platformsReady: platforms.readyFor.length,
      platformsTotal: Object.keys(PLATFORM_REQUIREMENTS).length
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
  
  // Field validation
  validateField,
  validateISRC,
  
  // Completeness
  validateCompleteness,
  
  // Platform validation
  validateForPlatform,
  validateForAllPlatforms,
  
  // Consistency
  checkConsistency,
  checkLineageConsistency,
  
  // Constants
  ValidationStatus,
  FieldImportance,
  FieldStatus,
  METADATA_FIELDS,
  PLATFORM_REQUIREMENTS
};
