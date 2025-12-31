/**
 * Metadata Completeness & Consistency Checker
 * 
 * Validates metadata completeness and detects inconsistencies
 * across assets including ISRC, artist, title, and other fields.
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Assets require complete
 * and consistent metadata for proper cataloging and delivery.
 */

// ============================================================================
// Constants
// ============================================================================

/**
 * Metadata field categories
 */
const FieldCategory = Object.freeze({
  IDENTIFICATION: 'IDENTIFICATION',   // ISRC, UPC, catalog number
  RIGHTS: 'RIGHTS',                   // Copyright, publisher, PRO
  DESCRIPTIVE: 'DESCRIPTIVE',         // Title, artist, album
  TECHNICAL: 'TECHNICAL',             // Sample rate, bit depth, codec
  TEMPORAL: 'TEMPORAL',               // Release date, recording date
  CLASSIFICATION: 'CLASSIFICATION'    // Genre, mood, tags
});

/**
 * Validation severity levels
 */
const IssueSeverity = Object.freeze({
  INFO: 'INFO',           // Informational, optional field missing
  WARNING: 'WARNING',     // Recommended field missing or inconsistent
  ERROR: 'ERROR',         // Required field missing or invalid
  CRITICAL: 'CRITICAL'    // Blocking issue, cannot proceed
});

/**
 * Issue types
 */
const IssueType = Object.freeze({
  MISSING_REQUIRED: 'MISSING_REQUIRED',
  MISSING_RECOMMENDED: 'MISSING_RECOMMENDED',
  INVALID_FORMAT: 'INVALID_FORMAT',
  INCONSISTENT: 'INCONSISTENT',
  DUPLICATE: 'DUPLICATE',
  MISMATCH: 'MISMATCH',
  TRUNCATED: 'TRUNCATED',
  ENCODING: 'ENCODING'
});

/**
 * Completeness status
 */
const CompletenessStatus = Object.freeze({
  COMPLETE: 'COMPLETE',
  MOSTLY_COMPLETE: 'MOSTLY_COMPLETE',
  INCOMPLETE: 'INCOMPLETE',
  MINIMAL: 'MINIMAL'
});

/**
 * Severity descriptions
 */
const SEVERITY_DESCRIPTIONS = Object.freeze({
  [IssueSeverity.INFO]: 'Optional metadata missing or could be improved',
  [IssueSeverity.WARNING]: 'Recommended metadata missing - may affect discoverability',
  [IssueSeverity.ERROR]: 'Required metadata missing or invalid - must be corrected',
  [IssueSeverity.CRITICAL]: 'Critical metadata issue - blocks processing or delivery'
});

/**
 * Required fields for different delivery contexts
 */
const REQUIRED_FIELDS = Object.freeze({
  STREAMING: ['title', 'artist', 'isrc', 'releaseDate', 'genre'],
  BROADCAST: ['title', 'artist', 'isrc', 'publisher', 'duration'],
  SYNC: ['title', 'artist', 'isrc', 'publisher', 'bpm', 'key'],
  ARCHIVE: ['title', 'artist', 'recordingDate', 'sampleRate', 'bitDepth'],
  DISTRIBUTION: ['title', 'artist', 'isrc', 'upc', 'label', 'releaseDate']
});

/**
 * Recommended fields for completeness
 */
const RECOMMENDED_FIELDS = Object.freeze({
  STREAMING: ['album', 'trackNumber', 'albumArtist', 'year', 'copyright'],
  BROADCAST: ['album', 'copyright', 'composer', 'lyrics'],
  SYNC: ['mood', 'energy', 'instruments', 'lyrics', 'description'],
  ARCHIVE: ['location', 'engineer', 'studio', 'equipment', 'notes'],
  DISTRIBUTION: ['albumArtist', 'trackNumber', 'discNumber', 'composer', 'copyright']
});

/**
 * Field validation patterns
 */
const FIELD_PATTERNS = Object.freeze({
  isrc: /^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$/,
  upc: /^\d{12,13}$/,
  iswc: /^T-?\d{9}-?\d$/,
  bpm: /^\d{2,3}(\.\d{1,2})?$/,
  year: /^(19|20)\d{2}$/,
  duration: /^\d+(\.\d{1,3})?$/,
  sampleRate: /^(44100|48000|88200|96000|176400|192000)$/,
  bitDepth: /^(16|24|32)$/,
  key: /^[A-G][#b]?(m|maj|min|major|minor)?$/i,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  url: /^https?:\/\/.+/
});

/**
 * Field max lengths
 */
const FIELD_MAX_LENGTHS = Object.freeze({
  title: 200,
  artist: 200,
  album: 200,
  albumArtist: 200,
  composer: 500,
  publisher: 200,
  copyright: 500,
  genre: 100,
  mood: 100,
  description: 2000,
  lyrics: 10000,
  isrc: 12,
  upc: 13,
  catalogNumber: 50
});

/**
 * Common metadata field aliases
 */
const FIELD_ALIASES = Object.freeze({
  artist: ['performers', 'artist_name', 'artistName', 'primary_artist'],
  title: ['track', 'track_title', 'trackTitle', 'song', 'name'],
  album: ['album_title', 'albumTitle', 'release', 'release_title'],
  albumArtist: ['album_artist', 'primary_album_artist', 'band'],
  year: ['release_year', 'releaseYear', 'date'],
  genre: ['genres', 'primary_genre', 'style'],
  isrc: ['ISRC', 'isrc_code'],
  upc: ['UPC', 'barcode', 'ean'],
  bpm: ['tempo', 'beats_per_minute'],
  key: ['musical_key', 'tonality']
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalize field name using aliases
 * @param {string} fieldName - Field name to normalize
 * @returns {string} Normalized field name
 */
function normalizeFieldName(fieldName) {
  if (!fieldName) return fieldName;
  
  const lower = fieldName.toLowerCase();
  
  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    if (canonical.toLowerCase() === lower) return canonical;
    if (aliases.some(a => a.toLowerCase() === lower)) return canonical;
  }
  
  return fieldName;
}

/**
 * Check if a value is empty
 * @param {*} value - Value to check
 * @returns {boolean} True if empty
 */
function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Validate ISRC format
 * @param {string} isrc - ISRC to validate
 * @returns {Object} Validation result
 */
function validateIsrc(isrc) {
  if (!isrc) {
    return { valid: false, error: 'ISRC is missing' };
  }
  
  const normalized = isrc.replace(/[-\s]/g, '').toUpperCase();
  
  if (normalized.length !== 12) {
    return { valid: false, error: `ISRC must be 12 characters, got ${normalized.length}` };
  }
  
  if (!FIELD_PATTERNS.isrc.test(normalized)) {
    return { valid: false, error: 'ISRC format invalid (expected: CC-XXX-YY-NNNNN)' };
  }
  
  // Extract components
  const countryCode = normalized.substring(0, 2);
  const registrantCode = normalized.substring(2, 5);
  const yearOfReference = normalized.substring(5, 7);
  const designation = normalized.substring(7, 12);
  
  return {
    valid: true,
    normalized,
    components: {
      countryCode,
      registrantCode,
      yearOfReference,
      designation
    }
  };
}

/**
 * Validate UPC format
 * @param {string} upc - UPC to validate
 * @returns {Object} Validation result
 */
function validateUpc(upc) {
  if (!upc) {
    return { valid: false, error: 'UPC is missing' };
  }
  
  const normalized = upc.replace(/[-\s]/g, '');
  
  if (!FIELD_PATTERNS.upc.test(normalized)) {
    return { valid: false, error: 'UPC must be 12-13 digits' };
  }
  
  // Validate check digit
  const digits = normalized.split('').map(Number);
  let sum = 0;
  
  for (let i = 0; i < digits.length - 1; i++) {
    sum += digits[i] * (i % 2 === 0 ? 1 : 3);
  }
  
  const checkDigit = (10 - (sum % 10)) % 10;
  const valid = checkDigit === digits[digits.length - 1];
  
  return {
    valid,
    normalized,
    error: valid ? null : 'UPC check digit invalid'
  };
}

/**
 * Calculate string similarity using Levenshtein distance
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Similarity score 0-1
 */
function stringSimilarity(a, b) {
  if (!a || !b) return 0;
  
  const aLower = a.toLowerCase().trim();
  const bLower = b.toLowerCase().trim();
  
  if (aLower === bLower) return 1;
  if (aLower.length === 0 || bLower.length === 0) return 0;
  
  // Levenshtein distance calculation
  const matrix = [];
  
  for (let i = 0; i <= bLower.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= aLower.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= bLower.length; i++) {
    for (let j = 1; j <= aLower.length; j++) {
      if (bLower[i - 1] === aLower[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  const distance = matrix[bLower.length][aLower.length];
  const maxLength = Math.max(aLower.length, bLower.length);
  
  return 1 - (distance / maxLength);
}

/**
 * Check for character encoding issues
 * @param {string} value - String to check
 * @returns {Object} Encoding check result
 */
function checkEncoding(value) {
  if (!value || typeof value !== 'string') {
    return { valid: true, issues: [] };
  }
  
  const issues = [];
  
  // Check for replacement characters
  if (value.includes('\uFFFD')) {
    issues.push('Contains Unicode replacement characters (encoding error)');
  }
  
  // Check for null bytes
  if (value.includes('\u0000')) {
    issues.push('Contains null bytes');
  }
  
  // Check for control characters (except common whitespace)
  const controlCharRegex = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
  if (controlCharRegex.test(value)) {
    issues.push('Contains invalid control characters');
  }
  
  // Check for excessive whitespace
  if (/\s{3,}/.test(value)) {
    issues.push('Contains excessive whitespace');
  }
  
  return {
    valid: issues.length === 0,
    issues
  };
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate a single metadata field
 * @param {string} fieldName - Field name
 * @param {*} value - Field value
 * @returns {Object} Validation result
 */
function validateField(fieldName, value) {
  const normalized = normalizeFieldName(fieldName);
  const result = {
    field: normalized,
    originalField: fieldName,
    value,
    valid: true,
    issues: []
  };
  
  // Check emptiness
  if (isEmpty(value)) {
    result.valid = false;
    result.issues.push({
      type: IssueType.MISSING_REQUIRED,
      message: `${normalized} is empty`
    });
    return result;
  }
  
  // String-specific validations
  if (typeof value === 'string') {
    // Check max length
    const maxLength = FIELD_MAX_LENGTHS[normalized];
    if (maxLength && value.length > maxLength) {
      result.issues.push({
        type: IssueType.TRUNCATED,
        severity: IssueSeverity.WARNING,
        message: `${normalized} exceeds max length (${value.length}/${maxLength})`
      });
    }
    
    // Check encoding
    const encodingCheck = checkEncoding(value);
    if (!encodingCheck.valid) {
      result.valid = false;
      for (const issue of encodingCheck.issues) {
        result.issues.push({
          type: IssueType.ENCODING,
          severity: IssueSeverity.ERROR,
          message: `${normalized}: ${issue}`
        });
      }
    }
    
    // Pattern validation for specific fields
    const pattern = FIELD_PATTERNS[normalized];
    if (pattern && !pattern.test(value)) {
      result.valid = false;
      result.issues.push({
        type: IssueType.INVALID_FORMAT,
        severity: IssueSeverity.ERROR,
        message: `${normalized} format is invalid`
      });
    }
  }
  
  // ISRC-specific validation
  if (normalized === 'isrc') {
    const isrcResult = validateIsrc(value);
    if (!isrcResult.valid) {
      result.valid = false;
      result.issues.push({
        type: IssueType.INVALID_FORMAT,
        severity: IssueSeverity.ERROR,
        message: isrcResult.error
      });
    } else {
      result.normalized = isrcResult.normalized;
      result.components = isrcResult.components;
    }
  }
  
  // UPC-specific validation
  if (normalized === 'upc') {
    const upcResult = validateUpc(value);
    if (!upcResult.valid) {
      result.valid = false;
      result.issues.push({
        type: IssueType.INVALID_FORMAT,
        severity: IssueSeverity.ERROR,
        message: upcResult.error
      });
    }
  }
  
  return result;
}

/**
 * Check metadata completeness for a delivery context
 * @param {Object} metadata - Metadata object
 * @param {string} context - Delivery context (STREAMING, BROADCAST, etc.)
 * @returns {Object} Completeness result
 */
function checkCompleteness(metadata, context = 'STREAMING') {
  const required = REQUIRED_FIELDS[context] || REQUIRED_FIELDS.STREAMING;
  const recommended = RECOMMENDED_FIELDS[context] || RECOMMENDED_FIELDS.STREAMING;
  
  const missingRequired = [];
  const missingRecommended = [];
  const presentFields = [];
  
  // Helper to find field value checking all aliases
  const findFieldValue = (field) => {
    // Check direct field name
    if (!isEmpty(metadata[field])) return metadata[field];
    
    // Check normalized name
    const normalized = normalizeFieldName(field);
    if (!isEmpty(metadata[normalized])) return metadata[normalized];
    
    // Check all aliases for this field
    const aliases = FIELD_ALIASES[field] || FIELD_ALIASES[normalized] || [];
    for (const alias of aliases) {
      if (!isEmpty(metadata[alias])) return metadata[alias];
    }
    
    // Check if any metadata key normalizes to this field
    for (const key of Object.keys(metadata)) {
      if (normalizeFieldName(key) === field || normalizeFieldName(key) === normalized) {
        if (!isEmpty(metadata[key])) return metadata[key];
      }
    }
    
    return undefined;
  };
  
  // Check required fields
  for (const field of required) {
    if (isEmpty(findFieldValue(field))) {
      missingRequired.push(field);
    } else {
      presentFields.push(field);
    }
  }
  
  // Check recommended fields
  for (const field of recommended) {
    if (isEmpty(findFieldValue(field))) {
      missingRecommended.push(field);
    } else {
      presentFields.push(field);
    }
  }
  
  // Calculate completeness percentage
  const totalFields = required.length + recommended.length;
  const presentCount = totalFields - missingRequired.length - missingRecommended.length;
  const completenessPercent = Math.round((presentCount / totalFields) * 100);
  
  // Determine status
  let status;
  if (missingRequired.length === 0 && missingRecommended.length === 0) {
    status = CompletenessStatus.COMPLETE;
  } else if (missingRequired.length === 0) {
    status = CompletenessStatus.MOSTLY_COMPLETE;
  } else if (missingRequired.length <= 2) {
    status = CompletenessStatus.INCOMPLETE;
  } else {
    status = CompletenessStatus.MINIMAL;
  }
  
  return {
    status,
    context,
    completenessPercent,
    missingRequired,
    missingRecommended,
    presentFields,
    requiredCount: required.length,
    recommendedCount: recommended.length,
    missingRequiredCount: missingRequired.length,
    missingRecommendedCount: missingRecommended.length,
    isComplete: missingRequired.length === 0,
    isFullyComplete: missingRequired.length === 0 && missingRecommended.length === 0
  };
}

/**
 * Detect inconsistencies between two metadata objects
 * @param {Object} metadata1 - First metadata object
 * @param {Object} metadata2 - Second metadata object
 * @param {Object} options - Comparison options
 * @returns {Object} Inconsistency report
 */
function detectInconsistencies(metadata1, metadata2, options = {}) {
  const { 
    strictMatch = false,
    similarityThreshold = 0.8,
    fieldsToCompare = null
  } = options;
  
  const inconsistencies = [];
  const matches = [];
  
  // Determine fields to compare
  const fields = fieldsToCompare || [
    ...new Set([...Object.keys(metadata1), ...Object.keys(metadata2)])
  ];
  
  for (const field of fields) {
    const normalized = normalizeFieldName(field);
    const value1 = metadata1[field] ?? metadata1[normalized];
    const value2 = metadata2[field] ?? metadata2[normalized];
    
    // Skip if both missing
    if (isEmpty(value1) && isEmpty(value2)) continue;
    
    // Check for one missing
    if (isEmpty(value1) !== isEmpty(value2)) {
      inconsistencies.push({
        field: normalized,
        type: IssueType.MISMATCH,
        severity: IssueSeverity.WARNING,
        value1: value1 ?? null,
        value2: value2 ?? null,
        message: `${normalized} present in one source but missing in another`
      });
      continue;
    }
    
    // Compare values
    const str1 = String(value1);
    const str2 = String(value2);
    
    if (strictMatch) {
      if (str1 !== str2) {
        inconsistencies.push({
          field: normalized,
          type: IssueType.MISMATCH,
          severity: IssueSeverity.ERROR,
          value1,
          value2,
          message: `${normalized} values do not match exactly`
        });
      } else {
        matches.push({ field: normalized, value: value1 });
      }
    } else {
      const similarity = stringSimilarity(str1, str2);
      
      if (similarity < similarityThreshold) {
        inconsistencies.push({
          field: normalized,
          type: IssueType.MISMATCH,
          severity: similarity < 0.5 ? IssueSeverity.ERROR : IssueSeverity.WARNING,
          value1,
          value2,
          similarity,
          message: `${normalized} values differ significantly (${Math.round(similarity * 100)}% similar)`
        });
      } else if (similarity < 1) {
        inconsistencies.push({
          field: normalized,
          type: IssueType.INCONSISTENT,
          severity: IssueSeverity.INFO,
          value1,
          value2,
          similarity,
          message: `${normalized} values have minor differences`
        });
      } else {
        matches.push({ field: normalized, value: value1 });
      }
    }
  }
  
  return {
    consistent: inconsistencies.filter(i => i.severity !== IssueSeverity.INFO).length === 0,
    inconsistencies,
    matches,
    inconsistencyCount: inconsistencies.length,
    matchCount: matches.length,
    fieldsCompared: fields.length
  };
}

/**
 * Check for duplicate ISRCs in a collection
 * @param {Array<Object>} assets - Array of asset metadata
 * @returns {Object} Duplicate check result
 */
function checkDuplicateIsrcs(assets) {
  const isrcMap = new Map();
  const duplicates = [];
  
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const isrc = asset.isrc?.replace(/[-\s]/g, '').toUpperCase();
    
    if (!isrc) continue;
    
    if (isrcMap.has(isrc)) {
      const existing = isrcMap.get(isrc);
      duplicates.push({
        isrc,
        indices: [existing.index, i],
        assets: [existing.asset, asset],
        severity: IssueSeverity.CRITICAL,
        message: `Duplicate ISRC ${isrc} found`
      });
    } else {
      isrcMap.set(isrc, { index: i, asset });
    }
  }
  
  return {
    hasDuplicates: duplicates.length > 0,
    duplicates,
    duplicateCount: duplicates.length,
    uniqueIsrcCount: isrcMap.size,
    totalAssetsWithIsrc: isrcMap.size + duplicates.length
  };
}

// ============================================================================
// Main Analysis Functions
// ============================================================================

/**
 * Perform complete metadata validation
 * @param {Object} metadata - Metadata to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
function validateMetadata(metadata, options = {}) {
  const {
    context = 'STREAMING',
    validateFormats = true,
    checkEncodingIssues = true
  } = options;
  
  if (!metadata || typeof metadata !== 'object') {
    return {
      valid: false,
      issues: [{
        type: IssueType.MISSING_REQUIRED,
        severity: IssueSeverity.CRITICAL,
        message: 'No metadata provided'
      }],
      completeness: null,
      fieldResults: {}
    };
  }
  
  const issues = [];
  const fieldResults = {};
  
  // Validate each field
  for (const [field, value] of Object.entries(metadata)) {
    if (validateFormats) {
      const result = validateField(field, value);
      fieldResults[field] = result;
      
      if (!result.valid) {
        for (const issue of result.issues) {
          issues.push({
            ...issue,
            field,
            severity: issue.severity || IssueSeverity.ERROR
          });
        }
      }
    }
  }
  
  // Check completeness
  const completeness = checkCompleteness(metadata, context);
  
  // Add missing required field issues
  for (const field of completeness.missingRequired) {
    issues.push({
      field,
      type: IssueType.MISSING_REQUIRED,
      severity: IssueSeverity.ERROR,
      message: `Required field '${field}' is missing`
    });
  }
  
  // Add missing recommended field issues
  for (const field of completeness.missingRecommended) {
    issues.push({
      field,
      type: IssueType.MISSING_RECOMMENDED,
      severity: IssueSeverity.WARNING,
      message: `Recommended field '${field}' is missing`
    });
  }
  
  // Determine overall validity
  const criticalIssues = issues.filter(i => i.severity === IssueSeverity.CRITICAL);
  const errorIssues = issues.filter(i => i.severity === IssueSeverity.ERROR);
  
  return {
    valid: criticalIssues.length === 0 && errorIssues.length === 0,
    issues,
    issueCount: issues.length,
    criticalCount: criticalIssues.length,
    errorCount: errorIssues.length,
    warningCount: issues.filter(i => i.severity === IssueSeverity.WARNING).length,
    completeness,
    fieldResults,
    context
  };
}

/**
 * Compare metadata across multiple assets
 * @param {Array<Object>} assets - Array of asset metadata
 * @param {Object} options - Comparison options
 * @returns {Object} Comparison result
 */
function compareMetadataAcrossAssets(assets, options = {}) {
  const {
    referenceIndex = 0,
    fieldsToCompare = ['title', 'artist', 'album', 'isrc', 'genre']
  } = options;
  
  if (!assets || assets.length < 2) {
    return {
      consistent: true,
      comparisons: [],
      summary: 'Insufficient assets for comparison'
    };
  }
  
  const reference = assets[referenceIndex];
  const comparisons = [];
  
  for (let i = 0; i < assets.length; i++) {
    if (i === referenceIndex) continue;
    
    const result = detectInconsistencies(reference, assets[i], {
      fieldsToCompare,
      ...options
    });
    
    comparisons.push({
      referenceIndex,
      compareIndex: i,
      ...result
    });
  }
  
  // Check for duplicate ISRCs
  const duplicateCheck = checkDuplicateIsrcs(assets);
  
  // Overall consistency
  const allConsistent = comparisons.every(c => c.consistent) && 
                        !duplicateCheck.hasDuplicates;
  
  return {
    consistent: allConsistent,
    comparisons,
    duplicateIsrcs: duplicateCheck,
    totalComparisons: comparisons.length,
    inconsistentPairs: comparisons.filter(c => !c.consistent).length,
    summary: allConsistent 
      ? 'All assets have consistent metadata'
      : `Found inconsistencies in ${comparisons.filter(c => !c.consistent).length} comparison(s)`
  };
}

/**
 * Quick check for metadata issues
 * @param {Object} metadata - Metadata to check
 * @param {string} context - Delivery context
 * @returns {Object} Quick check result
 */
function quickCheck(metadata, context = 'STREAMING') {
  const result = validateMetadata(metadata, { context });
  const completeness = result.completeness;
  
  return {
    valid: result.valid,
    completenessStatus: completeness.status,
    completenessPercent: completeness.completenessPercent,
    missingRequiredCount: completeness.missingRequiredCount,
    issueCount: result.issueCount,
    criticalCount: result.criticalCount,
    errorCount: result.errorCount,
    hasIsrc: !isEmpty(metadata?.isrc),
    hasValidIsrc: metadata?.isrc ? validateIsrc(metadata.isrc).valid : false,
    isDeliveryReady: result.valid && completeness.isComplete
  };
}

/**
 * Generate recommendations for metadata improvement
 * @param {Object} validationResult - Result from validateMetadata
 * @returns {Array<string>} Recommendations
 */
function generateRecommendations(validationResult) {
  const recommendations = [];
  
  if (!validationResult) return recommendations;
  
  const { issues, completeness } = validationResult;
  
  // Missing required fields
  if (completeness?.missingRequired?.length > 0) {
    recommendations.push(
      `Add required fields: ${completeness.missingRequired.join(', ')}`
    );
  }
  
  // ISRC issues
  const isrcIssues = issues?.filter(i => i.field === 'isrc');
  if (isrcIssues?.length > 0) {
    recommendations.push('Verify ISRC code format (CC-XXX-YY-NNNNN)');
  }
  
  // Encoding issues
  const encodingIssues = issues?.filter(i => i.type === IssueType.ENCODING);
  if (encodingIssues?.length > 0) {
    recommendations.push('Fix character encoding issues - ensure UTF-8 encoding');
  }
  
  // Truncation warnings
  const truncationIssues = issues?.filter(i => i.type === IssueType.TRUNCATED);
  if (truncationIssues?.length > 0) {
    recommendations.push('Shorten fields that exceed maximum length');
  }
  
  // Low completeness
  if (completeness?.completenessPercent < 50) {
    recommendations.push('Add more metadata to improve discoverability');
  }
  
  // Missing recommended fields
  if (completeness?.missingRecommended?.length > 3) {
    recommendations.push(
      `Consider adding: ${completeness.missingRecommended.slice(0, 3).join(', ')}`
    );
  }
  
  return recommendations;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Main functions
  validateMetadata,
  checkCompleteness,
  detectInconsistencies,
  compareMetadataAcrossAssets,
  quickCheck,
  
  // Field validation
  validateField,
  validateIsrc,
  validateUpc,
  checkDuplicateIsrcs,
  
  // Utilities
  normalizeFieldName,
  isEmpty,
  stringSimilarity,
  checkEncoding,
  
  // Recommendations
  generateRecommendations,
  
  // Constants
  FieldCategory,
  IssueSeverity,
  IssueType,
  CompletenessStatus,
  SEVERITY_DESCRIPTIONS,
  REQUIRED_FIELDS,
  RECOMMENDED_FIELDS,
  FIELD_PATTERNS,
  FIELD_MAX_LENGTHS,
  FIELD_ALIASES
};
