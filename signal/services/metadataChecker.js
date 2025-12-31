/**
 * Metadata Completeness & Consistency Checker
 * 
 * Validates audio file metadata for completeness, consistency,
 * and compliance with distribution requirements. Checks ISRC,
 * artist, title, and other required fields.
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Metadata field categories
 */
const FieldCategory = Object.freeze({
  IDENTIFICATION: 'IDENTIFICATION',
  RIGHTS: 'RIGHTS',
  DESCRIPTIVE: 'DESCRIPTIVE',
  TECHNICAL: 'TECHNICAL',
  DISTRIBUTION: 'DISTRIBUTION'
});

/**
 * Validation severity levels
 */
const Severity = Object.freeze({
  INFO: 'INFO',
  WARNING: 'WARNING',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL'
});

/**
 * Completeness status
 */
const CompletenessStatus = Object.freeze({
  COMPLETE: 'COMPLETE',
  PARTIAL: 'PARTIAL',
  INCOMPLETE: 'INCOMPLETE',
  MISSING: 'MISSING'
});

/**
 * Field requirement levels
 */
const RequirementLevel = Object.freeze({
  REQUIRED: 'REQUIRED',
  RECOMMENDED: 'RECOMMENDED',
  OPTIONAL: 'OPTIONAL'
});

/**
 * Metadata field definitions with validation rules
 */
const FIELD_DEFINITIONS = Object.freeze({
  // Identification
  isrc: {
    name: 'ISRC',
    category: FieldCategory.IDENTIFICATION,
    requirement: RequirementLevel.REQUIRED,
    pattern: /^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$/,
    description: 'International Standard Recording Code',
    example: 'USRC17607839',
    maxLength: 12
  },
  
  upc: {
    name: 'UPC/EAN',
    category: FieldCategory.IDENTIFICATION,
    requirement: RequirementLevel.RECOMMENDED,
    pattern: /^\d{12,13}$/,
    description: 'Universal Product Code',
    example: '012345678905'
  },
  
  iswc: {
    name: 'ISWC',
    category: FieldCategory.RIGHTS,
    requirement: RequirementLevel.OPTIONAL,
    pattern: /^T-?\d{9}-?\d$/,
    description: 'International Standard Musical Work Code',
    example: 'T-345246800-1'
  },
  
  // Descriptive - Core
  title: {
    name: 'Track Title',
    category: FieldCategory.DESCRIPTIVE,
    requirement: RequirementLevel.REQUIRED,
    minLength: 1,
    maxLength: 200,
    description: 'Track title'
  },
  
  artist: {
    name: 'Artist',
    category: FieldCategory.DESCRIPTIVE,
    requirement: RequirementLevel.REQUIRED,
    minLength: 1,
    maxLength: 200,
    description: 'Primary artist name'
  },
  
  albumArtist: {
    name: 'Album Artist',
    category: FieldCategory.DESCRIPTIVE,
    requirement: RequirementLevel.RECOMMENDED,
    description: 'Album-level artist'
  },
  
  album: {
    name: 'Album',
    category: FieldCategory.DESCRIPTIVE,
    requirement: RequirementLevel.RECOMMENDED,
    maxLength: 200,
    description: 'Album title'
  },
  
  // Descriptive - Extended
  genre: {
    name: 'Genre',
    category: FieldCategory.DESCRIPTIVE,
    requirement: RequirementLevel.RECOMMENDED,
    description: 'Music genre'
  },
  
  year: {
    name: 'Year',
    category: FieldCategory.DESCRIPTIVE,
    requirement: RequirementLevel.RECOMMENDED,
    pattern: /^(19|20)\d{2}$/,
    description: 'Release year',
    example: '2024'
  },
  
  trackNumber: {
    name: 'Track Number',
    category: FieldCategory.DESCRIPTIVE,
    requirement: RequirementLevel.RECOMMENDED,
    pattern: /^\d+$/,
    description: 'Track position in album'
  },
  
  discNumber: {
    name: 'Disc Number',
    category: FieldCategory.DESCRIPTIVE,
    requirement: RequirementLevel.OPTIONAL,
    pattern: /^\d+$/,
    description: 'Disc number for multi-disc releases'
  },
  
  composer: {
    name: 'Composer',
    category: FieldCategory.RIGHTS,
    requirement: RequirementLevel.RECOMMENDED,
    description: 'Songwriter/composer'
  },
  
  lyricist: {
    name: 'Lyricist',
    category: FieldCategory.RIGHTS,
    requirement: RequirementLevel.OPTIONAL,
    description: 'Lyrics author'
  },
  
  publisher: {
    name: 'Publisher',
    category: FieldCategory.RIGHTS,
    requirement: RequirementLevel.RECOMMENDED,
    description: 'Music publisher'
  },
  
  // Rights & Legal
  copyright: {
    name: 'Copyright',
    category: FieldCategory.RIGHTS,
    requirement: RequirementLevel.REQUIRED,
    pattern: /^[©℗]?\s?\d{4}\s.+/,
    description: 'Copyright notice',
    example: '© 2024 Label Name'
  },
  
  recordLabel: {
    name: 'Record Label',
    category: FieldCategory.RIGHTS,
    requirement: RequirementLevel.RECOMMENDED,
    description: 'Releasing record label'
  },
  
  // Technical
  bpm: {
    name: 'BPM',
    category: FieldCategory.TECHNICAL,
    requirement: RequirementLevel.OPTIONAL,
    pattern: /^\d{2,3}(\.\d+)?$/,
    description: 'Tempo in beats per minute'
  },
  
  key: {
    name: 'Musical Key',
    category: FieldCategory.TECHNICAL,
    requirement: RequirementLevel.OPTIONAL,
    pattern: /^[A-G][#b]?m?$/,
    description: 'Musical key signature',
    example: 'Am'
  },
  
  language: {
    name: 'Language',
    category: FieldCategory.DESCRIPTIVE,
    requirement: RequirementLevel.RECOMMENDED,
    pattern: /^[a-z]{2,3}$/,
    description: 'ISO 639 language code',
    example: 'en'
  },
  
  // Distribution
  releaseDate: {
    name: 'Release Date',
    category: FieldCategory.DISTRIBUTION,
    requirement: RequirementLevel.REQUIRED,
    pattern: /^\d{4}-\d{2}-\d{2}$/,
    description: 'Release date in ISO format',
    example: '2024-01-15'
  },
  
  explicit: {
    name: 'Explicit Content',
    category: FieldCategory.DISTRIBUTION,
    requirement: RequirementLevel.REQUIRED,
    type: 'boolean',
    description: 'Explicit content flag'
  },
  
  territory: {
    name: 'Territory',
    category: FieldCategory.DISTRIBUTION,
    requirement: RequirementLevel.OPTIONAL,
    description: 'Distribution territory restrictions'
  }
});

/**
 * Distribution platform requirements
 */
const PLATFORM_REQUIREMENTS = Object.freeze({
  spotify: {
    name: 'Spotify',
    required: ['isrc', 'title', 'artist', 'releaseDate', 'explicit'],
    recommended: ['album', 'genre', 'copyright', 'upc']
  },
  
  apple_music: {
    name: 'Apple Music',
    required: ['isrc', 'title', 'artist', 'releaseDate', 'explicit', 'copyright'],
    recommended: ['album', 'genre', 'composer', 'upc']
  },
  
  youtube_music: {
    name: 'YouTube Music',
    required: ['title', 'artist'],
    recommended: ['album', 'isrc', 'releaseDate']
  },
  
  amazon_music: {
    name: 'Amazon Music',
    required: ['isrc', 'title', 'artist', 'releaseDate', 'explicit', 'copyright'],
    recommended: ['album', 'genre', 'recordLabel', 'upc']
  },
  
  tidal: {
    name: 'Tidal',
    required: ['isrc', 'title', 'artist', 'releaseDate', 'explicit'],
    recommended: ['album', 'copyright', 'composer']
  },
  
  soundcloud: {
    name: 'SoundCloud',
    required: ['title', 'artist'],
    recommended: ['genre', 'releaseDate']
  },
  
  beatport: {
    name: 'Beatport',
    required: ['isrc', 'title', 'artist', 'releaseDate', 'genre', 'bpm', 'key'],
    recommended: ['recordLabel', 'copyright']
  }
});

/**
 * Common inconsistency patterns to check
 */
const CONSISTENCY_RULES = Object.freeze({
  artistAlbumArtistMatch: {
    id: 'ARTIST_ALBUM_ARTIST',
    description: 'Album artist should match or encompass track artist',
    severity: Severity.WARNING
  },
  
  yearReleaseDateMatch: {
    id: 'YEAR_RELEASE_DATE',
    description: 'Year should match release date year',
    severity: Severity.WARNING
  },
  
  isrcCountryCode: {
    id: 'ISRC_COUNTRY',
    description: 'ISRC country code should be valid ISO 3166-1 alpha-2',
    severity: Severity.ERROR
  },
  
  titleCasing: {
    id: 'TITLE_CASING',
    description: 'Title should use proper casing',
    severity: Severity.INFO
  },
  
  duplicateIsrc: {
    id: 'DUPLICATE_ISRC',
    description: 'ISRC should be unique per recording',
    severity: Severity.CRITICAL
  },
  
  featuredArtistFormat: {
    id: 'FEATURED_ARTIST',
    description: 'Featured artist notation should be consistent',
    severity: Severity.WARNING
  }
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get field definition
 * @param {string} fieldName - Field name
 * @returns {Object|null} Field definition
 */
function getFieldDefinition(fieldName) {
  return FIELD_DEFINITIONS[fieldName] || null;
}

/**
 * Get platform requirements
 * @param {string} platformId - Platform identifier
 * @returns {Object|null} Platform requirements
 */
function getPlatformRequirements(platformId) {
  return PLATFORM_REQUIREMENTS[platformId] || null;
}

/**
 * Check if value is empty
 * @param {*} value - Value to check
 * @returns {boolean} True if empty
 */
function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Normalize string for comparison
 * @param {string} str - String to normalize
 * @returns {string} Normalized string
 */
function normalizeString(str) {
  if (typeof str !== 'string') return '';
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Extract year from date string
 * @param {string} dateStr - Date string
 * @returns {string|null} Year or null
 */
function extractYear(dateStr) {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})/);
  return match ? match[1] : null;
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate a single field
 * @param {string} fieldName - Field name
 * @param {*} value - Field value
 * @returns {Object} Validation result
 */
function validateField(fieldName, value) {
  const definition = getFieldDefinition(fieldName);
  
  if (!definition) {
    return {
      field: fieldName,
      valid: true,
      issues: [],
      message: 'Unknown field - no validation rules'
    };
  }
  
  const issues = [];
  const fieldEmpty = isEmpty(value);
  
  // Check required fields
  if (fieldEmpty) {
    if (definition.requirement === RequirementLevel.REQUIRED) {
      issues.push({
        type: 'missing',
        severity: Severity.ERROR,
        message: `Required field ${definition.name} is missing`
      });
    } else if (definition.requirement === RequirementLevel.RECOMMENDED) {
      issues.push({
        type: 'missing',
        severity: Severity.WARNING,
        message: `Recommended field ${definition.name} is missing`
      });
    }
    
    return {
      field: fieldName,
      name: definition.name,
      valid: issues.length === 0,
      present: false,
      issues,
      requirement: definition.requirement
    };
  }
  
  // Pattern validation
  if (definition.pattern && typeof value === 'string') {
    if (!definition.pattern.test(value)) {
      issues.push({
        type: 'format',
        severity: Severity.ERROR,
        message: `${definition.name} format is invalid`,
        expected: definition.example,
        actual: value
      });
    }
  }
  
  // Length validation
  if (definition.minLength && typeof value === 'string') {
    if (value.length < definition.minLength) {
      issues.push({
        type: 'length',
        severity: Severity.ERROR,
        message: `${definition.name} is too short (min: ${definition.minLength})`
      });
    }
  }
  
  if (definition.maxLength && typeof value === 'string') {
    if (value.length > definition.maxLength) {
      issues.push({
        type: 'length',
        severity: Severity.WARNING,
        message: `${definition.name} is too long (max: ${definition.maxLength})`
      });
    }
  }
  
  // Type validation
  if (definition.type === 'boolean' && typeof value !== 'boolean') {
    issues.push({
      type: 'type',
      severity: Severity.ERROR,
      message: `${definition.name} should be a boolean value`
    });
  }
  
  return {
    field: fieldName,
    name: definition.name,
    valid: issues.filter(i => i.severity === Severity.ERROR || i.severity === Severity.CRITICAL).length === 0,
    present: true,
    value,
    issues,
    requirement: definition.requirement
  };
}

/**
 * Validate ISRC format and structure
 * @param {string} isrc - ISRC code
 * @returns {Object} Validation result
 */
function validateIsrc(isrc) {
  const result = validateField('isrc', isrc);
  
  if (!isrc || result.issues.length > 0) {
    return result;
  }
  
  // Additional ISRC validation
  const countryCode = isrc.substring(0, 2);
  const registrantCode = isrc.substring(2, 5);
  const year = isrc.substring(5, 7);
  const designation = isrc.substring(7, 12);
  
  // Validate country code (basic check)
  const validCountryCodes = [
    'US', 'GB', 'CA', 'AU', 'DE', 'FR', 'JP', 'BR', 'IT', 'ES', 
    'NL', 'SE', 'NO', 'DK', 'FI', 'BE', 'AT', 'CH', 'IE', 'NZ',
    'MX', 'AR', 'CO', 'CL', 'PE', 'KR', 'IN', 'ZA', 'PL', 'PT'
  ];
  
  if (!validCountryCodes.includes(countryCode)) {
    result.issues.push({
      type: 'warning',
      severity: Severity.INFO,
      message: `ISRC country code ${countryCode} may be uncommon`
    });
  }
  
  result.parsed = {
    countryCode,
    registrantCode,
    year: `20${year}`,
    designation
  };
  
  return result;
}

/**
 * Validate all metadata fields
 * @param {Object} metadata - Metadata object
 * @returns {Object} Validation result
 */
function validateMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return {
      valid: false,
      status: CompletenessStatus.MISSING,
      message: 'No metadata provided',
      fields: [],
      issues: []
    };
  }
  
  const fieldResults = [];
  const allIssues = [];
  
  // Validate all defined fields
  for (const [fieldName, definition] of Object.entries(FIELD_DEFINITIONS)) {
    const value = metadata[fieldName];
    const result = validateField(fieldName, value);
    fieldResults.push(result);
    allIssues.push(...result.issues);
  }
  
  // Calculate completeness
  const requiredFields = fieldResults.filter(f => f.requirement === RequirementLevel.REQUIRED);
  const presentRequired = requiredFields.filter(f => f.present);
  const validRequired = requiredFields.filter(f => f.valid && f.present);
  
  const recommendedFields = fieldResults.filter(f => f.requirement === RequirementLevel.RECOMMENDED);
  const presentRecommended = recommendedFields.filter(f => f.present);
  
  // Determine status
  let status;
  if (validRequired.length === requiredFields.length) {
    if (presentRecommended.length === recommendedFields.length) {
      status = CompletenessStatus.COMPLETE;
    } else {
      status = CompletenessStatus.PARTIAL;
    }
  } else if (presentRequired.length > 0) {
    status = CompletenessStatus.INCOMPLETE;
  } else {
    status = CompletenessStatus.MISSING;
  }
  
  const errorCount = allIssues.filter(i => i.severity === Severity.ERROR || i.severity === Severity.CRITICAL).length;
  
  return {
    valid: errorCount === 0,
    status,
    completeness: {
      required: {
        total: requiredFields.length,
        present: presentRequired.length,
        valid: validRequired.length,
        percentage: Math.round((validRequired.length / requiredFields.length) * 100)
      },
      recommended: {
        total: recommendedFields.length,
        present: presentRecommended.length,
        percentage: Math.round((presentRecommended.length / recommendedFields.length) * 100)
      }
    },
    fields: fieldResults,
    issues: allIssues,
    issueCount: {
      critical: allIssues.filter(i => i.severity === Severity.CRITICAL).length,
      error: allIssues.filter(i => i.severity === Severity.ERROR).length,
      warning: allIssues.filter(i => i.severity === Severity.WARNING).length,
      info: allIssues.filter(i => i.severity === Severity.INFO).length
    }
  };
}

/**
 * Validate metadata for a specific platform
 * @param {Object} metadata - Metadata object
 * @param {string} platformId - Platform identifier
 * @returns {Object} Platform validation result
 */
function validateForPlatform(metadata, platformId) {
  const requirements = getPlatformRequirements(platformId);
  
  if (!requirements) {
    return {
      platformId,
      error: `Unknown platform: ${platformId}`,
      valid: false
    };
  }
  
  const issues = [];
  const missingRequired = [];
  const missingRecommended = [];
  
  // Check required fields
  for (const field of requirements.required) {
    const value = metadata?.[field];
    const result = validateField(field, value);
    
    if (!result.present) {
      missingRequired.push(field);
      issues.push({
        field,
        severity: Severity.ERROR,
        message: `Required for ${requirements.name}: ${FIELD_DEFINITIONS[field]?.name || field}`
      });
    } else if (!result.valid) {
      issues.push(...result.issues);
    }
  }
  
  // Check recommended fields
  for (const field of requirements.recommended || []) {
    const value = metadata?.[field];
    const result = validateField(field, value);
    
    if (!result.present) {
      missingRecommended.push(field);
      issues.push({
        field,
        severity: Severity.WARNING,
        message: `Recommended for ${requirements.name}: ${FIELD_DEFINITIONS[field]?.name || field}`
      });
    }
  }
  
  const valid = missingRequired.length === 0;
  
  return {
    platformId,
    platform: requirements.name,
    valid,
    status: valid 
      ? (missingRecommended.length === 0 ? CompletenessStatus.COMPLETE : CompletenessStatus.PARTIAL)
      : CompletenessStatus.INCOMPLETE,
    missingRequired,
    missingRecommended,
    issues,
    readiness: {
      requiredComplete: requirements.required.length - missingRequired.length,
      requiredTotal: requirements.required.length,
      percentage: Math.round(((requirements.required.length - missingRequired.length) / requirements.required.length) * 100)
    }
  };
}

/**
 * Validate metadata for multiple platforms
 * @param {Object} metadata - Metadata object
 * @param {Array<string>} platformIds - Platform identifiers
 * @returns {Object} Multi-platform validation result
 */
function validateForPlatforms(metadata, platformIds) {
  if (!platformIds || platformIds.length === 0) {
    platformIds = Object.keys(PLATFORM_REQUIREMENTS);
  }
  
  const results = platformIds.map(id => validateForPlatform(metadata, id));
  const validPlatforms = results.filter(r => r.valid);
  
  return {
    results,
    summary: {
      total: results.length,
      ready: validPlatforms.length,
      notReady: results.length - validPlatforms.length
    },
    readyPlatforms: validPlatforms.map(r => r.platformId),
    notReadyPlatforms: results.filter(r => !r.valid).map(r => r.platformId)
  };
}

// ============================================================================
// Consistency Checking
// ============================================================================

/**
 * Check metadata consistency
 * @param {Object} metadata - Metadata object
 * @returns {Object} Consistency check result
 */
function checkConsistency(metadata) {
  if (!metadata) {
    return {
      consistent: true,
      issues: [],
      checks: []
    };
  }
  
  const issues = [];
  const checks = [];
  
  // Year vs Release Date
  if (metadata.year && metadata.releaseDate) {
    const releaseDateYear = extractYear(metadata.releaseDate);
    const yearMatch = metadata.year === releaseDateYear;
    
    checks.push({
      rule: CONSISTENCY_RULES.yearReleaseDateMatch.id,
      passed: yearMatch,
      details: yearMatch ? null : `Year ${metadata.year} doesn't match release date year ${releaseDateYear}`
    });
    
    if (!yearMatch) {
      issues.push({
        rule: CONSISTENCY_RULES.yearReleaseDateMatch.id,
        severity: CONSISTENCY_RULES.yearReleaseDateMatch.severity,
        message: CONSISTENCY_RULES.yearReleaseDateMatch.description,
        expected: releaseDateYear,
        actual: metadata.year
      });
    }
  }
  
  // Artist vs Album Artist
  if (metadata.artist && metadata.albumArtist) {
    const artistNorm = normalizeString(metadata.artist);
    const albumArtistNorm = normalizeString(metadata.albumArtist);
    
    const related = artistNorm.includes(albumArtistNorm) || 
                    albumArtistNorm.includes(artistNorm) ||
                    albumArtistNorm === 'various artists';
    
    checks.push({
      rule: CONSISTENCY_RULES.artistAlbumArtistMatch.id,
      passed: related,
      details: related ? null : `Artist "${metadata.artist}" may not match album artist "${metadata.albumArtist}"`
    });
    
    if (!related) {
      issues.push({
        rule: CONSISTENCY_RULES.artistAlbumArtistMatch.id,
        severity: CONSISTENCY_RULES.artistAlbumArtistMatch.severity,
        message: CONSISTENCY_RULES.artistAlbumArtistMatch.description
      });
    }
  }
  
  // Title casing check
  if (metadata.title) {
    const hasWeirdCasing = /^[a-z]/.test(metadata.title) || 
                           /[A-Z]{5,}/.test(metadata.title);
    
    checks.push({
      rule: CONSISTENCY_RULES.titleCasing.id,
      passed: !hasWeirdCasing,
      details: hasWeirdCasing ? 'Title may have unusual casing' : null
    });
    
    if (hasWeirdCasing) {
      issues.push({
        rule: CONSISTENCY_RULES.titleCasing.id,
        severity: CONSISTENCY_RULES.titleCasing.severity,
        message: CONSISTENCY_RULES.titleCasing.description
      });
    }
  }
  
  // Featured artist format
  if (metadata.title || metadata.artist) {
    const text = `${metadata.title || ''} ${metadata.artist || ''}`;
    const featPatterns = [
      /\(feat\.?\s/i,
      /\[feat\.?\s/i,
      /\(ft\.?\s/i,
      /\sft\.?\s/i,
      /\sfeaturing\s/i
    ];
    
    const matchedPatterns = featPatterns.filter(p => p.test(text));
    const inconsistentFeat = matchedPatterns.length > 1;
    
    checks.push({
      rule: CONSISTENCY_RULES.featuredArtistFormat.id,
      passed: !inconsistentFeat,
      details: inconsistentFeat ? 'Multiple featured artist notation styles detected' : null
    });
    
    if (inconsistentFeat) {
      issues.push({
        rule: CONSISTENCY_RULES.featuredArtistFormat.id,
        severity: CONSISTENCY_RULES.featuredArtistFormat.severity,
        message: CONSISTENCY_RULES.featuredArtistFormat.description
      });
    }
  }
  
  return {
    consistent: issues.filter(i => i.severity !== Severity.INFO).length === 0,
    issues,
    checks,
    passedChecks: checks.filter(c => c.passed).length,
    totalChecks: checks.length
  };
}

/**
 * Check for duplicate ISRCs across tracks
 * @param {Array<Object>} tracks - Array of track metadata
 * @returns {Object} Duplicate check result
 */
function checkDuplicateIsrcs(tracks) {
  if (!tracks || tracks.length === 0) {
    return {
      hasDuplicates: false,
      duplicates: [],
      uniqueCount: 0
    };
  }
  
  const isrcMap = new Map();
  const duplicates = [];
  
  for (let i = 0; i < tracks.length; i++) {
    const isrc = tracks[i].isrc;
    if (!isrc) continue;
    
    if (isrcMap.has(isrc)) {
      const existing = isrcMap.get(isrc);
      duplicates.push({
        isrc,
        indices: [existing.index, i],
        tracks: [existing.title, tracks[i].title]
      });
    } else {
      isrcMap.set(isrc, { index: i, title: tracks[i].title });
    }
  }
  
  return {
    hasDuplicates: duplicates.length > 0,
    duplicates,
    uniqueCount: isrcMap.size,
    totalTracks: tracks.length
  };
}

/**
 * Compare metadata between two versions
 * @param {Object} original - Original metadata
 * @param {Object} updated - Updated metadata
 * @returns {Object} Comparison result
 */
function compareMetadata(original, updated) {
  if (!original || !updated) {
    return {
      error: 'Both original and updated metadata required',
      changes: []
    };
  }
  
  const changes = [];
  const allFields = new Set([
    ...Object.keys(original),
    ...Object.keys(updated)
  ]);
  
  for (const field of allFields) {
    const origValue = original[field];
    const newValue = updated[field];
    
    if (origValue !== newValue) {
      const definition = getFieldDefinition(field);
      
      changes.push({
        field,
        name: definition?.name || field,
        original: origValue,
        updated: newValue,
        type: isEmpty(origValue) ? 'added' : isEmpty(newValue) ? 'removed' : 'modified'
      });
    }
  }
  
  return {
    hasChanges: changes.length > 0,
    changeCount: changes.length,
    changes,
    added: changes.filter(c => c.type === 'added'),
    removed: changes.filter(c => c.type === 'removed'),
    modified: changes.filter(c => c.type === 'modified')
  };
}

// ============================================================================
// Quick Check & Reporting
// ============================================================================

/**
 * Quick completeness check
 * @param {Object} metadata - Metadata object
 * @returns {Object} Quick check result
 */
function quickCheck(metadata) {
  const result = validateMetadata(metadata);
  
  return {
    status: result.status,
    valid: result.valid,
    requiredComplete: result.completeness.required.percentage === 100,
    requiredPercentage: result.completeness.required.percentage,
    recommendedPercentage: result.completeness.recommended.percentage,
    errorCount: result.issueCount.error + result.issueCount.critical,
    warningCount: result.issueCount.warning
  };
}

/**
 * Generate metadata report
 * @param {Object} metadata - Metadata object
 * @param {Object} options - Report options
 * @returns {Object} Comprehensive report
 */
function generateReport(metadata, options = {}) {
  const { platforms = ['spotify', 'apple_music'], includeConsistency = true } = options;
  
  const validation = validateMetadata(metadata);
  const platformResults = validateForPlatforms(metadata, platforms);
  
  const report = {
    timestamp: new Date().toISOString(),
    validation,
    platforms: platformResults
  };
  
  if (includeConsistency) {
    report.consistency = checkConsistency(metadata);
  }
  
  // Generate recommendations
  report.recommendations = generateRecommendations(validation, platformResults);
  
  return report;
}

/**
 * Generate recommendations
 * @param {Object} validation - Validation result
 * @param {Object} platformResults - Platform validation results
 * @returns {Array<string>} Recommendations
 */
function generateRecommendations(validation, platformResults) {
  const recommendations = [];
  
  if (!validation) return recommendations;
  
  // Missing required fields
  const missingRequired = validation.fields
    .filter(f => f.requirement === RequirementLevel.REQUIRED && !f.present);
  
  if (missingRequired.length > 0) {
    recommendations.push(
      `Add missing required fields: ${missingRequired.map(f => f.name).join(', ')}`
    );
  }
  
  // Format errors
  const formatErrors = validation.issues.filter(i => i.type === 'format');
  if (formatErrors.length > 0) {
    recommendations.push('Fix field format errors to ensure proper distribution');
  }
  
  // Platform-specific
  if (platformResults?.notReadyPlatforms?.length > 0) {
    recommendations.push(
      `Complete metadata for: ${platformResults.notReadyPlatforms.join(', ')}`
    );
  }
  
  // All complete
  if (validation.status === CompletenessStatus.COMPLETE) {
    recommendations.push('Metadata is complete and ready for distribution');
  }
  
  return recommendations;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Validation functions
  validateField,
  validateIsrc,
  validateMetadata,
  validateForPlatform,
  validateForPlatforms,
  
  // Consistency checking
  checkConsistency,
  checkDuplicateIsrcs,
  compareMetadata,
  
  // Quick check & reporting
  quickCheck,
  generateReport,
  generateRecommendations,
  
  // Utility functions
  getFieldDefinition,
  getPlatformRequirements,
  isEmpty,
  normalizeString,
  
  // Constants
  FieldCategory,
  Severity,
  CompletenessStatus,
  RequirementLevel,
  FIELD_DEFINITIONS,
  PLATFORM_REQUIREMENTS,
  CONSISTENCY_RULES
};
