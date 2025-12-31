/**
 * Metadata Completeness & Consistency Checker Tests
 */

const {
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
} = require('../services/metadataConsistencyChecker');

// ============================================================================
// Constants Tests
// ============================================================================

describe('Metadata Completeness & Consistency Checker', () => {
  describe('Constants', () => {
    describe('FieldCategory', () => {
      it('should have all categories defined', () => {
        expect(FieldCategory.IDENTIFICATION).toBe('IDENTIFICATION');
        expect(FieldCategory.RIGHTS).toBe('RIGHTS');
        expect(FieldCategory.DESCRIPTIVE).toBe('DESCRIPTIVE');
        expect(FieldCategory.TECHNICAL).toBe('TECHNICAL');
        expect(FieldCategory.TEMPORAL).toBe('TEMPORAL');
        expect(FieldCategory.CLASSIFICATION).toBe('CLASSIFICATION');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(FieldCategory)).toBe(true);
      });
    });

    describe('IssueSeverity', () => {
      it('should have all severity levels defined', () => {
        expect(IssueSeverity.INFO).toBe('INFO');
        expect(IssueSeverity.WARNING).toBe('WARNING');
        expect(IssueSeverity.ERROR).toBe('ERROR');
        expect(IssueSeverity.CRITICAL).toBe('CRITICAL');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(IssueSeverity)).toBe(true);
      });
    });

    describe('IssueType', () => {
      it('should have all issue types defined', () => {
        expect(IssueType.MISSING_REQUIRED).toBe('MISSING_REQUIRED');
        expect(IssueType.INVALID_FORMAT).toBe('INVALID_FORMAT');
        expect(IssueType.INCONSISTENT).toBe('INCONSISTENT');
        expect(IssueType.MISMATCH).toBe('MISMATCH');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(IssueType)).toBe(true);
      });
    });

    describe('CompletenessStatus', () => {
      it('should have all status values defined', () => {
        expect(CompletenessStatus.COMPLETE).toBe('COMPLETE');
        expect(CompletenessStatus.MOSTLY_COMPLETE).toBe('MOSTLY_COMPLETE');
        expect(CompletenessStatus.INCOMPLETE).toBe('INCOMPLETE');
        expect(CompletenessStatus.MINIMAL).toBe('MINIMAL');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(CompletenessStatus)).toBe(true);
      });
    });

    describe('REQUIRED_FIELDS', () => {
      it('should define fields for each context', () => {
        expect(REQUIRED_FIELDS.STREAMING).toContain('title');
        expect(REQUIRED_FIELDS.STREAMING).toContain('artist');
        expect(REQUIRED_FIELDS.STREAMING).toContain('isrc');
        expect(REQUIRED_FIELDS.BROADCAST).toContain('publisher');
        expect(REQUIRED_FIELDS.SYNC).toContain('bpm');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(REQUIRED_FIELDS)).toBe(true);
      });
    });

    describe('FIELD_PATTERNS', () => {
      it('should validate ISRC format', () => {
        expect(FIELD_PATTERNS.isrc.test('USRC17607839')).toBe(true);
        expect(FIELD_PATTERNS.isrc.test('invalid')).toBe(false);
      });

      it('should validate UPC format', () => {
        expect(FIELD_PATTERNS.upc.test('012345678901')).toBe(true);
        expect(FIELD_PATTERNS.upc.test('invalid')).toBe(false);
      });

      it('should validate year format', () => {
        expect(FIELD_PATTERNS.year.test('2024')).toBe(true);
        expect(FIELD_PATTERNS.year.test('1899')).toBe(false);
      });
    });
  });

  // ============================================================================
  // Utility Functions Tests
  // ============================================================================

  describe('Utility Functions', () => {
    describe('normalizeFieldName', () => {
      it('should normalize known aliases', () => {
        expect(normalizeFieldName('artist_name')).toBe('artist');
        expect(normalizeFieldName('track_title')).toBe('title');
        expect(normalizeFieldName('album_artist')).toBe('albumArtist');
      });

      it('should preserve unknown field names', () => {
        expect(normalizeFieldName('customField')).toBe('customField');
      });

      it('should handle null/undefined', () => {
        expect(normalizeFieldName(null)).toBeNull();
        expect(normalizeFieldName(undefined)).toBeUndefined();
      });
    });

    describe('isEmpty', () => {
      it('should detect empty values', () => {
        expect(isEmpty(null)).toBe(true);
        expect(isEmpty(undefined)).toBe(true);
        expect(isEmpty('')).toBe(true);
        expect(isEmpty('   ')).toBe(true);
        expect(isEmpty([])).toBe(true);
        expect(isEmpty({})).toBe(true);
      });

      it('should detect non-empty values', () => {
        expect(isEmpty('value')).toBe(false);
        expect(isEmpty(0)).toBe(false);
        expect(isEmpty([1])).toBe(false);
        expect(isEmpty({ a: 1 })).toBe(false);
      });
    });

    describe('stringSimilarity', () => {
      it('should return 1 for identical strings', () => {
        expect(stringSimilarity('test', 'test')).toBe(1);
        expect(stringSimilarity('Test', 'test')).toBe(1);
      });

      it('should return 0 for empty strings', () => {
        expect(stringSimilarity('', 'test')).toBe(0);
        expect(stringSimilarity(null, 'test')).toBe(0);
      });

      it('should return partial similarity for similar strings', () => {
        const similarity = stringSimilarity('testing', 'tested');
        expect(similarity).toBeGreaterThan(0);
        expect(similarity).toBeLessThan(1);
      });
    });

    describe('checkEncoding', () => {
      it('should pass valid strings', () => {
        const result = checkEncoding('Valid string');
        expect(result.valid).toBe(true);
        expect(result.issues).toHaveLength(0);
      });

      it('should detect replacement characters', () => {
        const result = checkEncoding('Bad \uFFFD encoding');
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.includes('replacement'))).toBe(true);
      });

      it('should detect control characters', () => {
        const result = checkEncoding('Has\x00null');
        expect(result.valid).toBe(false);
      });

      it('should handle null input', () => {
        const result = checkEncoding(null);
        expect(result.valid).toBe(true);
      });
    });
  });

  // ============================================================================
  // ISRC/UPC Validation Tests
  // ============================================================================

  describe('ISRC/UPC Validation', () => {
    describe('validateIsrc', () => {
      it('should validate correct ISRC', () => {
        const result = validateIsrc('USRC17607839');
        expect(result.valid).toBe(true);
        expect(result.normalized).toBe('USRC17607839');
      });

      it('should validate ISRC with dashes', () => {
        const result = validateIsrc('US-RC1-76-07839');
        expect(result.valid).toBe(true);
        expect(result.normalized).toBe('USRC17607839');
      });

      it('should extract ISRC components', () => {
        const result = validateIsrc('USRC17607839');
        expect(result.components.countryCode).toBe('US');
        expect(result.components.registrantCode).toBe('RC1');
        expect(result.components.yearOfReference).toBe('76');
        expect(result.components.designation).toBe('07839');
      });

      it('should reject invalid ISRC length', () => {
        const result = validateIsrc('USRC176');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('12 characters');
      });

      it('should reject missing ISRC', () => {
        const result = validateIsrc(null);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('missing');
      });

      it('should reject invalid ISRC format', () => {
        const result = validateIsrc('123456789012');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('format');
      });
    });

    describe('validateUpc', () => {
      it('should validate correct UPC', () => {
        const result = validateUpc('012345678905');
        expect(result.valid).toBe(true);
      });

      it('should reject invalid check digit', () => {
        const result = validateUpc('012345678901');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('check digit');
      });

      it('should reject missing UPC', () => {
        const result = validateUpc(null);
        expect(result.valid).toBe(false);
      });

      it('should reject invalid length', () => {
        const result = validateUpc('12345');
        expect(result.valid).toBe(false);
      });
    });
  });

  // ============================================================================
  // Field Validation Tests
  // ============================================================================

  describe('Field Validation', () => {
    describe('validateField', () => {
      it('should validate non-empty field', () => {
        const result = validateField('title', 'My Song');
        expect(result.valid).toBe(true);
        expect(result.field).toBe('title');
      });

      it('should detect empty field', () => {
        const result = validateField('title', '');
        expect(result.valid).toBe(false);
        expect(result.issues[0].type).toBe(IssueType.MISSING_REQUIRED);
      });

      it('should detect max length violation', () => {
        const longTitle = 'A'.repeat(250);
        const result = validateField('title', longTitle);
        expect(result.issues.some(i => i.type === IssueType.TRUNCATED)).toBe(true);
      });

      it('should validate ISRC format', () => {
        const result = validateField('isrc', 'USRC17607839');
        expect(result.valid).toBe(true);
        expect(result.normalized).toBe('USRC17607839');
      });

      it('should detect invalid ISRC', () => {
        const result = validateField('isrc', 'invalid');
        expect(result.valid).toBe(false);
      });

      it('should normalize field names', () => {
        const result = validateField('artist_name', 'Artist');
        expect(result.field).toBe('artist');
      });
    });
  });

  // ============================================================================
  // Completeness Tests
  // ============================================================================

  describe('Completeness Checking', () => {
    describe('checkCompleteness', () => {
      it('should detect complete metadata', () => {
        const metadata = {
          title: 'My Song',
          artist: 'Artist',
          isrc: 'USRC17607839',
          releaseDate: '2024-01-01',
          genre: 'Rock',
          album: 'Album',
          trackNumber: 1,
          albumArtist: 'Artist',
          year: '2024',
          copyright: '2024 Label'
        };
        
        const result = checkCompleteness(metadata, 'STREAMING');
        expect(result.status).toBe(CompletenessStatus.COMPLETE);
        expect(result.isFullyComplete).toBe(true);
      });

      it('should detect missing required fields', () => {
        const metadata = {
          title: 'My Song'
        };
        
        const result = checkCompleteness(metadata, 'STREAMING');
        expect(result.missingRequired).toContain('artist');
        expect(result.missingRequired).toContain('isrc');
        expect(result.isComplete).toBe(false);
      });

      it('should detect missing recommended fields', () => {
        const metadata = {
          title: 'My Song',
          artist: 'Artist',
          isrc: 'USRC17607839',
          releaseDate: '2024-01-01',
          genre: 'Rock'
        };
        
        const result = checkCompleteness(metadata, 'STREAMING');
        expect(result.missingRecommended.length).toBeGreaterThan(0);
        expect(result.status).toBe(CompletenessStatus.MOSTLY_COMPLETE);
      });

      it('should calculate completeness percentage', () => {
        const metadata = {
          title: 'My Song',
          artist: 'Artist'
        };
        
        const result = checkCompleteness(metadata, 'STREAMING');
        expect(result.completenessPercent).toBeGreaterThan(0);
        expect(result.completenessPercent).toBeLessThan(100);
      });

      it('should check different contexts', () => {
        const metadata = {
          title: 'My Song',
          artist: 'Artist',
          isrc: 'USRC17607839',
          publisher: 'Publisher',
          duration: '180'
        };
        
        const broadcastResult = checkCompleteness(metadata, 'BROADCAST');
        expect(broadcastResult.isComplete).toBe(true);
      });

      it('should recognize field aliases', () => {
        const metadata = {
          track_title: 'My Song',
          artist_name: 'Artist',
          ISRC: 'USRC17607839',
          releaseDate: '2024-01-01',
          primary_genre: 'Rock'
        };
        
        const result = checkCompleteness(metadata, 'STREAMING');
        // Should recognize aliased fields
        expect(result.missingRequired).not.toContain('title');
      });
    });
  });

  // ============================================================================
  // Inconsistency Detection Tests
  // ============================================================================

  describe('Inconsistency Detection', () => {
    describe('detectInconsistencies', () => {
      it('should detect matching metadata', () => {
        const meta1 = { title: 'Song', artist: 'Artist' };
        const meta2 = { title: 'Song', artist: 'Artist' };
        
        const result = detectInconsistencies(meta1, meta2);
        expect(result.consistent).toBe(true);
        expect(result.matchCount).toBe(2);
      });

      it('should detect mismatched values', () => {
        const meta1 = { title: 'Summer Nights', artist: 'Artist' };
        const meta2 = { title: 'Winter Days', artist: 'Artist' };
        
        const result = detectInconsistencies(meta1, meta2);
        expect(result.consistent).toBe(false);
        expect(result.inconsistencies.some(i => i.field === 'title')).toBe(true);
      });

      it('should detect missing field in one source', () => {
        const meta1 = { title: 'Song', artist: 'Artist' };
        const meta2 = { title: 'Song' };
        
        const result = detectInconsistencies(meta1, meta2);
        expect(result.inconsistencies.some(i => i.field === 'artist')).toBe(true);
      });

      it('should use strict matching when specified', () => {
        const meta1 = { title: 'Song' };
        const meta2 = { title: 'song' }; // Different case
        
        const result = detectInconsistencies(meta1, meta2, { strictMatch: true });
        expect(result.inconsistencies.length).toBeGreaterThan(0);
      });

      it('should compare only specified fields', () => {
        const meta1 = { title: 'Song', artist: 'A', album: 'X' };
        const meta2 = { title: 'Song', artist: 'B', album: 'X' };
        
        const result = detectInconsistencies(meta1, meta2, {
          fieldsToCompare: ['title', 'album']
        });
        
        expect(result.consistent).toBe(true);
        expect(result.fieldsCompared).toBe(2);
      });

      it('should include similarity score', () => {
        const meta1 = { title: 'My Song Title' };
        const meta2 = { title: 'My Song Titl' };
        
        const result = detectInconsistencies(meta1, meta2);
        const titleInconsistency = result.inconsistencies.find(i => i.field === 'title');
        
        if (titleInconsistency) {
          expect(titleInconsistency.similarity).toBeDefined();
        }
      });
    });

    describe('checkDuplicateIsrcs', () => {
      it('should detect duplicate ISRCs', () => {
        const assets = [
          { title: 'Song A', isrc: 'USRC17607839' },
          { title: 'Song B', isrc: 'USRC17607839' }
        ];
        
        const result = checkDuplicateIsrcs(assets);
        expect(result.hasDuplicates).toBe(true);
        expect(result.duplicateCount).toBe(1);
      });

      it('should not flag unique ISRCs', () => {
        const assets = [
          { title: 'Song A', isrc: 'USRC17607839' },
          { title: 'Song B', isrc: 'USRC17607840' }
        ];
        
        const result = checkDuplicateIsrcs(assets);
        expect(result.hasDuplicates).toBe(false);
        expect(result.uniqueIsrcCount).toBe(2);
      });

      it('should skip assets without ISRC', () => {
        const assets = [
          { title: 'Song A' },
          { title: 'Song B', isrc: 'USRC17607839' }
        ];
        
        const result = checkDuplicateIsrcs(assets);
        expect(result.totalAssetsWithIsrc).toBe(1);
      });

      it('should normalize ISRC for comparison', () => {
        const assets = [
          { title: 'Song A', isrc: 'US-RC1-76-07839' },
          { title: 'Song B', isrc: 'USRC17607839' }
        ];
        
        const result = checkDuplicateIsrcs(assets);
        expect(result.hasDuplicates).toBe(true);
      });
    });
  });

  // ============================================================================
  // Main Validation Tests
  // ============================================================================

  describe('Main Validation', () => {
    describe('validateMetadata', () => {
      it('should validate complete metadata', () => {
        const metadata = {
          title: 'My Song',
          artist: 'Artist',
          isrc: 'USRC17607839',
          releaseDate: '2024-01-01',
          genre: 'Rock'
        };
        
        const result = validateMetadata(metadata);
        expect(result.valid).toBe(true);
      });

      it('should detect missing required fields', () => {
        const metadata = { title: 'Song' };
        
        const result = validateMetadata(metadata);
        expect(result.valid).toBe(false);
        expect(result.issues.some(i => i.type === IssueType.MISSING_REQUIRED)).toBe(true);
      });

      it('should include completeness info', () => {
        const metadata = { title: 'Song', artist: 'Artist' };
        
        const result = validateMetadata(metadata);
        expect(result.completeness).toBeDefined();
        expect(result.completeness.status).toBeDefined();
      });

      it('should count issues by severity', () => {
        const metadata = { title: 'Song' };
        
        const result = validateMetadata(metadata);
        expect(result.errorCount).toBeGreaterThan(0);
        expect(result.warningCount).toBeGreaterThanOrEqual(0);
      });

      it('should handle null metadata', () => {
        const result = validateMetadata(null);
        expect(result.valid).toBe(false);
        expect(result.issues[0].severity).toBe(IssueSeverity.CRITICAL);
      });

      it('should validate for different contexts', () => {
        const metadata = {
          title: 'Song',
          artist: 'Artist',
          isrc: 'USRC17607839',
          publisher: 'Publisher',
          duration: '180'
        };
        
        const result = validateMetadata(metadata, { context: 'BROADCAST' });
        expect(result.context).toBe('BROADCAST');
        expect(result.completeness.context).toBe('BROADCAST');
      });
    });

    describe('compareMetadataAcrossAssets', () => {
      it('should compare multiple assets', () => {
        const assets = [
          { title: 'Song', artist: 'Artist', isrc: 'USRC17607839' },
          { title: 'Song', artist: 'Artist', isrc: 'USRC17607840' },
          { title: 'Song', artist: 'Artist', isrc: 'USRC17607841' }
        ];
        
        const result = compareMetadataAcrossAssets(assets);
        expect(result.totalComparisons).toBe(2);
        expect(result.consistent).toBe(true);
      });

      it('should detect inconsistencies across assets', () => {
        const assets = [
          { title: 'Song', artist: 'The Beatles' },
          { title: 'Song', artist: 'Rolling Stones' }
        ];
        
        const result = compareMetadataAcrossAssets(assets);
        expect(result.consistent).toBe(false);
        expect(result.inconsistentPairs).toBe(1);
      });

      it('should check for duplicate ISRCs', () => {
        const assets = [
          { title: 'Song A', isrc: 'USRC17607839' },
          { title: 'Song B', isrc: 'USRC17607839' }
        ];
        
        const result = compareMetadataAcrossAssets(assets);
        expect(result.duplicateIsrcs.hasDuplicates).toBe(true);
        expect(result.consistent).toBe(false);
      });

      it('should handle insufficient assets', () => {
        const result = compareMetadataAcrossAssets([{ title: 'Song' }]);
        expect(result.consistent).toBe(true);
        expect(result.summary).toContain('Insufficient');
      });
    });

    describe('quickCheck', () => {
      it('should return essential status info', () => {
        const metadata = {
          title: 'Song',
          artist: 'Artist',
          isrc: 'USRC17607839'
        };
        
        const result = quickCheck(metadata);
        expect(result.valid).toBeDefined();
        expect(result.completenessStatus).toBeDefined();
        expect(result.completenessPercent).toBeDefined();
        expect(result.hasIsrc).toBe(true);
        expect(result.hasValidIsrc).toBe(true);
      });

      it('should detect delivery readiness', () => {
        const completeMetadata = {
          title: 'Song',
          artist: 'Artist',
          isrc: 'USRC17607839',
          releaseDate: '2024-01-01',
          genre: 'Rock'
        };
        
        const result = quickCheck(completeMetadata);
        expect(result.isDeliveryReady).toBe(true);
      });

      it('should detect incomplete metadata', () => {
        const result = quickCheck({ title: 'Song' });
        expect(result.isDeliveryReady).toBe(false);
        expect(result.missingRequiredCount).toBeGreaterThan(0);
      });
    });
  });

  // ============================================================================
  // Recommendations Tests
  // ============================================================================

  describe('Recommendations', () => {
    describe('generateRecommendations', () => {
      it('should recommend adding missing required fields', () => {
        const result = validateMetadata({ title: 'Song' });
        const recommendations = generateRecommendations(result);
        
        expect(recommendations.some(r => r.includes('required'))).toBe(true);
      });

      it('should recommend fixing ISRC issues', () => {
        const result = validateMetadata({ 
          title: 'Song',
          artist: 'Artist',
          isrc: 'invalid',
          releaseDate: '2024-01-01',
          genre: 'Rock'
        });
        const recommendations = generateRecommendations(result);
        
        expect(recommendations.some(r => r.includes('ISRC'))).toBe(true);
      });

      it('should return empty for valid metadata', () => {
        const result = validateMetadata({
          title: 'Song',
          artist: 'Artist',
          isrc: 'USRC17607839',
          releaseDate: '2024-01-01',
          genre: 'Rock',
          album: 'Album',
          trackNumber: 1,
          albumArtist: 'Artist',
          year: '2024',
          copyright: '2024 Label'
        });
        const recommendations = generateRecommendations(result);
        
        expect(recommendations.length).toBe(0);
      });

      it('should handle null input', () => {
        const recommendations = generateRecommendations(null);
        expect(recommendations).toEqual([]);
      });
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration Tests', () => {
    it('should validate typical streaming metadata', () => {
      const metadata = {
        title: 'Summer Nights',
        artist: 'The Band',
        album: 'Greatest Hits',
        albumArtist: 'The Band',
        isrc: 'USRC17607839',
        upc: '012345678905',
        releaseDate: '2024-06-15',
        genre: 'Pop',
        trackNumber: 5,
        year: '2024',
        copyright: '© 2024 Record Label'
      };
      
      const result = validateMetadata(metadata, { context: 'STREAMING' });
      expect(result.valid).toBe(true);
      expect(result.completeness.status).toBe(CompletenessStatus.COMPLETE);
    });

    it('should detect album-level inconsistencies', () => {
      const tracks = [
        { title: 'Track 1', artist: 'Artist', album: 'Greatest Hits', isrc: 'USRC17607839' },
        { title: 'Track 2', artist: 'Artist', album: 'Live Concert', isrc: 'USRC17607840' }, // Different album
        { title: 'Track 3', artist: 'Artist', album: 'Greatest Hits', isrc: 'USRC17607841' }
      ];
      
      const result = compareMetadataAcrossAssets(tracks, {
        fieldsToCompare: ['album', 'artist']
      });
      
      expect(result.consistent).toBe(false);
    });

    it('should handle international characters', () => {
      const metadata = {
        title: 'Été à Paris',
        artist: 'Françoise',
        album: 'Chansons d\'amour',
        isrc: 'FRRC17607839',
        releaseDate: '2024-01-01',
        genre: 'Chanson'
      };
      
      const result = validateMetadata(metadata);
      expect(result.valid).toBe(true);
    });

    it('should provide consistent results', () => {
      const metadata = {
        title: 'Song',
        artist: 'Artist',
        isrc: 'USRC17607839'
      };
      
      const result1 = validateMetadata(metadata);
      const result2 = validateMetadata(metadata);
      
      expect(result1.valid).toBe(result2.valid);
      expect(result1.issueCount).toBe(result2.issueCount);
    });
  });

  // ============================================================================
  // API Contract Tests
  // ============================================================================

  describe('API Contract', () => {
    it('should export all required functions', () => {
      expect(typeof validateMetadata).toBe('function');
      expect(typeof checkCompleteness).toBe('function');
      expect(typeof detectInconsistencies).toBe('function');
      expect(typeof compareMetadataAcrossAssets).toBe('function');
      expect(typeof quickCheck).toBe('function');
      expect(typeof validateField).toBe('function');
      expect(typeof validateIsrc).toBe('function');
      expect(typeof validateUpc).toBe('function');
      expect(typeof generateRecommendations).toBe('function');
    });

    it('should export all required constants', () => {
      expect(FieldCategory).toBeDefined();
      expect(IssueSeverity).toBeDefined();
      expect(IssueType).toBeDefined();
      expect(CompletenessStatus).toBeDefined();
      expect(REQUIRED_FIELDS).toBeDefined();
      expect(FIELD_PATTERNS).toBeDefined();
    });
  });
});
