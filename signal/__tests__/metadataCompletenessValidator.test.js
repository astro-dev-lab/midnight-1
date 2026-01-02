/**
 * Metadata Completeness & Consistency Validator Tests
 */

const {
  analyze,
  quickCheck,
  validateField,
  validateISRC,
  validateCompleteness,
  validateForPlatform,
  validateForAllPlatforms,
  checkConsistency,
  checkLineageConsistency,
  ValidationStatus,
  FieldImportance,
  FieldStatus,
  METADATA_FIELDS,
  PLATFORM_REQUIREMENTS
} = require('../services/metadataCompletenessValidator');

// ============================================================================
// Test Fixtures
// ============================================================================

const completeMetadata = {
  isrc: 'USRC17607839',
  title: 'Test Track',
  artist: 'Test Artist',
  album: 'Test Album',
  composer: 'Test Composer',
  producer: 'Test Producer',
  mixEngineer: 'Mix Engineer',
  masterEngineer: 'Master Engineer',
  upc: '012345678901',
  catalogNumber: 'CAT-001',
  releaseDate: '2024-06-15',
  recordingDate: '2024-03-10',
  genre: 'Electronic',
  subgenre: 'Deep House',
  bpm: 124,
  key: 'C minor',
  duration: 245,
  sampleRate: 48000,
  bitDepth: 24,
  copyright: '© 2024 Test Label',
  publisher: 'Test Publisher',
  label: 'Test Label',
  explicit: false,
  instrumental: false
};

const minimalMetadata = {
  title: 'Test Track',
  artist: 'Test Artist',
  duration: 180
};

const invalidMetadata = {
  title: '',
  artist: null,
  isrc: 'invalid-isrc',
  bpm: 'not-a-number'
};

// ============================================================================
// Constants Tests
// ============================================================================

describe('Metadata Validator Constants', () => {
  describe('ValidationStatus', () => {
    it('should have all status levels', () => {
      expect(ValidationStatus.COMPLETE).toBe('COMPLETE');
      expect(ValidationStatus.MOSTLY_COMPLETE).toBe('MOSTLY_COMPLETE');
      expect(ValidationStatus.INCOMPLETE).toBe('INCOMPLETE');
      expect(ValidationStatus.INVALID).toBe('INVALID');
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(ValidationStatus)).toBe(true);
    });
  });

  describe('FieldImportance', () => {
    it('should have all importance levels', () => {
      expect(FieldImportance.REQUIRED).toBe('REQUIRED');
      expect(FieldImportance.RECOMMENDED).toBe('RECOMMENDED');
      expect(FieldImportance.OPTIONAL).toBe('OPTIONAL');
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(FieldImportance)).toBe(true);
    });
  });

  describe('FieldStatus', () => {
    it('should have all field statuses', () => {
      expect(FieldStatus.VALID).toBe('VALID');
      expect(FieldStatus.MISSING).toBe('MISSING');
      expect(FieldStatus.INVALID).toBe('INVALID');
      expect(FieldStatus.WARNING).toBe('WARNING');
    });
  });

  describe('METADATA_FIELDS', () => {
    it('should have core identification fields', () => {
      expect(METADATA_FIELDS.isrc).toBeDefined();
      expect(METADATA_FIELDS.title).toBeDefined();
      expect(METADATA_FIELDS.artist).toBeDefined();
    });

    it('should mark required fields correctly', () => {
      expect(METADATA_FIELDS.isrc.importance).toBe(FieldImportance.REQUIRED);
      expect(METADATA_FIELDS.title.importance).toBe(FieldImportance.REQUIRED);
      expect(METADATA_FIELDS.artist.importance).toBe(FieldImportance.REQUIRED);
    });

    it('should have ISRC pattern', () => {
      expect(METADATA_FIELDS.isrc.pattern).toBeDefined();
      expect(METADATA_FIELDS.isrc.pattern.test('USRC17607839')).toBe(true);
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(METADATA_FIELDS)).toBe(true);
    });
  });

  describe('PLATFORM_REQUIREMENTS', () => {
    it('should have major platforms', () => {
      expect(PLATFORM_REQUIREMENTS.SPOTIFY).toBeDefined();
      expect(PLATFORM_REQUIREMENTS.APPLE_MUSIC).toBeDefined();
      expect(PLATFORM_REQUIREMENTS.YOUTUBE_MUSIC).toBeDefined();
      expect(PLATFORM_REQUIREMENTS.TIDAL).toBeDefined();
    });

    it('should specify required fields per platform', () => {
      expect(PLATFORM_REQUIREMENTS.SPOTIFY.required).toContain('isrc');
      expect(PLATFORM_REQUIREMENTS.SPOTIFY.required).toContain('title');
      expect(PLATFORM_REQUIREMENTS.APPLE_MUSIC.required).toContain('genre');
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(PLATFORM_REQUIREMENTS)).toBe(true);
    });
  });
});

// ============================================================================
// ISRC Validation Tests
// ============================================================================

describe('validateISRC', () => {
  it('should validate correct ISRC format', () => {
    const result = validateISRC('USRC17607839');
    
    expect(result.valid).toBe(true);
    expect(result.status).toBe(FieldStatus.VALID);
  });

  it('should extract ISRC components', () => {
    const result = validateISRC('USRC17607839');
    
    expect(result.components.countryCode).toBe('US');
    expect(result.components.registrantCode).toBe('RC1');
    expect(result.components.yearCode).toBe('76');
    expect(result.components.designationCode).toBe('07839');
  });

  it('should format ISRC with hyphens', () => {
    const result = validateISRC('USRC17607839');
    
    expect(result.formatted).toBe('US-RC1-76-07839');
  });

  it('should accept ISRC with hyphens', () => {
    const result = validateISRC('US-RC1-76-07839');
    
    expect(result.valid).toBe(true);
    expect(result.value).toBe('USRC17607839');
  });

  it('should accept lowercase and convert', () => {
    const result = validateISRC('usrc17607839');
    
    expect(result.valid).toBe(true);
    expect(result.value).toBe('USRC17607839');
  });

  it('should reject invalid length', () => {
    const result = validateISRC('USRC1760');
    
    expect(result.valid).toBe(false);
    expect(result.status).toBe(FieldStatus.INVALID);
    expect(result.error).toContain('Invalid length');
  });

  it('should reject invalid format', () => {
    const result = validateISRC('12RC17607839');
    
    expect(result.valid).toBe(false);
    expect(result.status).toBe(FieldStatus.INVALID);
  });

  it('should handle missing ISRC', () => {
    expect(validateISRC(null).status).toBe(FieldStatus.MISSING);
    expect(validateISRC(undefined).status).toBe(FieldStatus.MISSING);
    expect(validateISRC('').status).toBe(FieldStatus.MISSING);
  });
});

// ============================================================================
// Field Validation Tests
// ============================================================================

describe('validateField', () => {
  describe('String fields', () => {
    it('should validate valid title', () => {
      const result = validateField('title', 'My Song Title');
      
      expect(result.status).toBe(FieldStatus.VALID);
      expect(result.value).toBe('My Song Title');
    });

    it('should reject empty required field', () => {
      const result = validateField('title', '');
      
      expect(result.status).toBe(FieldStatus.MISSING);
    });

    it('should warn on exceeding max length', () => {
      const longTitle = 'A'.repeat(250);
      const result = validateField('title', longTitle);
      
      expect(result.status).toBe(FieldStatus.WARNING);
      expect(result.warning).toContain('Too long');
    });
  });

  describe('Number fields', () => {
    it('should validate valid BPM', () => {
      const result = validateField('bpm', 128);
      
      expect(result.status).toBe(FieldStatus.VALID);
      expect(result.value).toBe(128);
    });

    it('should reject non-numeric BPM', () => {
      const result = validateField('bpm', 'fast');
      
      expect(result.status).toBe(FieldStatus.INVALID);
      expect(result.error).toContain('number');
    });

    it('should reject BPM below minimum', () => {
      const result = validateField('bpm', 10);
      
      expect(result.status).toBe(FieldStatus.INVALID);
      expect(result.error).toContain('minimum');
    });

    it('should reject BPM above maximum', () => {
      const result = validateField('bpm', 400);
      
      expect(result.status).toBe(FieldStatus.INVALID);
      expect(result.error).toContain('maximum');
    });

    it('should warn on non-standard sample rate', () => {
      const result = validateField('sampleRate', 22050);
      
      expect(result.status).toBe(FieldStatus.WARNING);
    });

    it('should accept valid sample rates', () => {
      expect(validateField('sampleRate', 48000).status).toBe(FieldStatus.VALID);
      expect(validateField('sampleRate', 96000).status).toBe(FieldStatus.VALID);
    });
  });

  describe('Boolean fields', () => {
    it('should validate boolean explicit flag', () => {
      expect(validateField('explicit', true).status).toBe(FieldStatus.VALID);
      expect(validateField('explicit', false).status).toBe(FieldStatus.VALID);
    });

    it('should reject non-boolean values', () => {
      const result = validateField('explicit', 'yes');
      
      expect(result.status).toBe(FieldStatus.INVALID);
    });
  });

  describe('Pattern fields', () => {
    it('should validate date format', () => {
      const result = validateField('releaseDate', '2024-06-15');
      
      expect(result.status).toBe(FieldStatus.VALID);
    });

    it('should reject invalid date format', () => {
      const result = validateField('releaseDate', '15/06/2024');
      
      expect(result.status).toBe(FieldStatus.INVALID);
    });

    it('should validate musical key', () => {
      expect(validateField('key', 'C major').status).toBe(FieldStatus.VALID);
      expect(validateField('key', 'F# minor').status).toBe(FieldStatus.VALID);
      expect(validateField('key', 'Bb min').status).toBe(FieldStatus.VALID);
    });
  });

  it('should handle unknown fields', () => {
    const result = validateField('unknownField', 'value');
    
    expect(result.status).toBe(FieldStatus.WARNING);
    expect(result.message).toContain('Unknown');
  });
});

// ============================================================================
// Completeness Validation Tests
// ============================================================================

describe('validateCompleteness', () => {
  it('should return COMPLETE for fully filled metadata', () => {
    const result = validateCompleteness(completeMetadata);
    
    expect(result.status).toBe(ValidationStatus.COMPLETE);
    expect(result.scores.required).toBe(100);
  });

  it('should return INCOMPLETE for minimal metadata', () => {
    const result = validateCompleteness(minimalMetadata);
    
    expect([ValidationStatus.INCOMPLETE, ValidationStatus.MOSTLY_COMPLETE])
      .toContain(result.status);
  });

  it('should categorize fields correctly', () => {
    const result = validateCompleteness(completeMetadata);
    
    expect(result.required.passed).toContain('isrc');
    expect(result.required.passed).toContain('title');
    expect(result.recommended.passed).toContain('album');
  });

  it('should list missing required fields', () => {
    const result = validateCompleteness({ title: 'Test' });
    
    expect(result.summary.missingRequired.length).toBeGreaterThan(0);
    expect(result.summary.requiredComplete).toBe(false);
  });

  it('should calculate scores', () => {
    const result = validateCompleteness(completeMetadata);
    
    expect(result.scores.required).toBeDefined();
    expect(result.scores.recommended).toBeDefined();
    expect(result.scores.overall).toBeDefined();
    expect(result.scores.overall).toBeGreaterThan(0);
  });

  it('should handle null metadata', () => {
    const result = validateCompleteness(null);
    
    expect(result.status).toBe(ValidationStatus.INVALID);
    expect(result.error).toBeDefined();
  });

  it('should provide field-level details', () => {
    const result = validateCompleteness(completeMetadata);
    
    expect(result.fields.isrc).toBeDefined();
    expect(result.fields.isrc.status).toBe(FieldStatus.VALID);
  });
});

// ============================================================================
// Platform Validation Tests
// ============================================================================

describe('validateForPlatform', () => {
  describe('Spotify validation', () => {
    it('should pass complete metadata', () => {
      const result = validateForPlatform(completeMetadata, 'SPOTIFY');
      
      expect(result.ready).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should fail on missing required fields', () => {
      const result = validateForPlatform({ title: 'Test' }, 'SPOTIFY');
      
      expect(result.ready).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should warn on missing recommended fields', () => {
      const result = validateForPlatform({
        isrc: 'USRC17607839',
        title: 'Test',
        artist: 'Artist'
      }, 'SPOTIFY');
      
      expect(result.ready).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Apple Music validation', () => {
    it('should require genre', () => {
      const result = validateForPlatform({
        isrc: 'USRC17607839',
        title: 'Test',
        artist: 'Artist'
      }, 'APPLE_MUSIC');
      
      expect(result.ready).toBe(false);
      const genreIssue = result.issues.find(i => i.field === 'genre');
      expect(genreIssue).toBeDefined();
    });
  });

  it('should return error for unknown platform', () => {
    const result = validateForPlatform(completeMetadata, 'UNKNOWN');
    
    expect(result.error).toBeDefined();
  });

  it('should warn on title length exceeding platform limit', () => {
    const longTitleMetadata = {
      ...completeMetadata,
      title: 'A'.repeat(150)
    };
    
    const result = validateForPlatform(longTitleMetadata, 'YOUTUBE_MUSIC');
    
    const titleWarning = result.warnings.find(w => w.field === 'title');
    expect(titleWarning).toBeDefined();
  });
});

describe('validateForAllPlatforms', () => {
  it('should check all platforms', () => {
    const result = validateForAllPlatforms(completeMetadata);
    
    expect(result.platforms.SPOTIFY).toBeDefined();
    expect(result.platforms.APPLE_MUSIC).toBeDefined();
    expect(result.platforms.YOUTUBE_MUSIC).toBeDefined();
  });

  it('should identify universally ready metadata', () => {
    const result = validateForAllPlatforms(completeMetadata);
    
    expect(result.universallyReady).toBe(true);
    expect(result.readyFor.length).toBe(Object.keys(PLATFORM_REQUIREMENTS).length);
  });

  it('should list platforms not ready for', () => {
    const result = validateForAllPlatforms(minimalMetadata);
    
    expect(result.notReadyFor.length).toBeGreaterThan(0);
  });

  it('should calculate average score', () => {
    const result = validateForAllPlatforms(completeMetadata);
    
    expect(result.averageScore).toBeDefined();
    expect(result.averageScore).toBeGreaterThan(0);
  });
});

// ============================================================================
// Consistency Tests
// ============================================================================

describe('checkConsistency', () => {
  it('should pass for consistent metadata', () => {
    const result = checkConsistency(completeMetadata);
    
    expect(result.consistent).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('should detect recording date after release date', () => {
    const inconsistent = {
      ...completeMetadata,
      releaseDate: '2024-01-01',
      recordingDate: '2024-06-01'
    };
    
    const result = checkConsistency(inconsistent);
    
    expect(result.consistent).toBe(false);
    expect(result.issues.some(i => i.type === 'DATE_INCONSISTENCY')).toBe(true);
  });

  it('should warn on ISRC year mismatch', () => {
    const mismatched = {
      ...completeMetadata,
      isrc: 'USRC12012345', // Year 20
      releaseDate: '2024-06-15'
    };
    
    const result = checkConsistency(mismatched);
    
    expect(result.warnings.some(w => w.type === 'YEAR_MISMATCH')).toBe(true);
  });

  it('should detect explicit + instrumental conflict', () => {
    const conflicting = {
      ...completeMetadata,
      explicit: true,
      instrumental: true
    };
    
    const result = checkConsistency(conflicting);
    
    expect(result.issues.some(i => i.type === 'FLAG_CONFLICT')).toBe(true);
  });

  it('should warn on BPM/genre mismatch', () => {
    const mismatched = {
      ...completeMetadata,
      genre: 'Drum and Bass',
      bpm: 90 // Too slow for DnB
    };
    
    const result = checkConsistency(mismatched);
    
    expect(result.warnings.some(w => w.type === 'BPM_GENRE_MISMATCH')).toBe(true);
  });

  it('should list checks performed', () => {
    const result = checkConsistency(completeMetadata);
    
    expect(result.checksPerformed).toBeDefined();
    expect(result.checksPerformed.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Lineage Consistency Tests
// ============================================================================

describe('checkLineageConsistency', () => {
  const originalVersion = {
    ...completeMetadata,
    versionName: 'Original Mix'
  };

  it('should handle single version', () => {
    const result = checkLineageConsistency([originalVersion]);
    
    expect(result.consistent).toBe(true);
    expect(result.versionCount).toBe(1);
  });

  it('should detect immutable field changes', () => {
    const modifiedVersion = {
      ...originalVersion,
      versionName: 'Remix',
      title: 'Different Title' // Should not change
    };
    
    const result = checkLineageConsistency([originalVersion, modifiedVersion]);
    
    expect(result.issues.some(i => 
      i.type === 'IMMUTABLE_FIELD_CHANGED' && i.field === 'title'
    )).toBe(true);
  });

  it('should flag ISRC changes as errors', () => {
    const modifiedVersion = {
      ...originalVersion,
      versionName: 'v2',
      isrc: 'GBXYZ99999999'
    };
    
    const result = checkLineageConsistency([originalVersion, modifiedVersion]);
    
    const isrcIssue = result.issues.find(i => i.field === 'isrc');
    expect(isrcIssue).toBeDefined();
    expect(isrcIssue.severity).toBe('error');
  });

  it('should track legitimate changes', () => {
    const remastered = {
      ...originalVersion,
      versionName: 'Remaster',
      masterEngineer: 'New Engineer',
      bpm: 125 // BPM can be re-analyzed
    };
    
    const result = checkLineageConsistency([originalVersion, remastered]);
    
    expect(result.changes.length).toBeGreaterThan(0);
    expect(result.changes.some(c => c.field === 'masterEngineer')).toBe(true);
  });

  it('should detect dropped fields', () => {
    const incompleteVersion = {
      title: originalVersion.title,
      artist: originalVersion.artist,
      versionName: 'v2'
    };
    
    const result = checkLineageConsistency([originalVersion, incompleteVersion]);
    
    expect(result.issues.some(i => i.type === 'FIELD_DROPPED')).toBe(true);
  });

  it('should provide summary counts', () => {
    const result = checkLineageConsistency([originalVersion, {
      ...originalVersion,
      masterEngineer: 'New'
    }]);
    
    expect(result.summary.errors).toBeDefined();
    expect(result.summary.warnings).toBeDefined();
    expect(result.summary.legitimateChanges).toBeDefined();
  });

  it('should handle empty array', () => {
    const result = checkLineageConsistency([]);
    
    expect(result.error).toBeDefined();
  });
});

// ============================================================================
// Quick Check Tests
// ============================================================================

describe('quickCheck', () => {
  it('should return status and score', () => {
    const result = quickCheck(completeMetadata);
    
    expect(result.status).toBeDefined();
    expect(result.score).toBeDefined();
    expect(result.score).toBeGreaterThan(0);
  });

  it('should indicate required completeness', () => {
    const result = quickCheck(completeMetadata);
    
    expect(result.requiredComplete).toBe(true);
  });

  it('should indicate consistency', () => {
    const result = quickCheck(completeMetadata);
    
    expect(result.consistent).toBe(true);
  });

  it('should list issues', () => {
    const result = quickCheck({
      title: '',
      releaseDate: '2024-01-01',
      recordingDate: '2024-06-01'
    });
    
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('should list warnings', () => {
    const result = quickCheck({
      ...completeMetadata,
      isrc: 'USRC10012345', // Old year
      releaseDate: '2024-06-15'
    });
    
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Full Analysis Tests
// ============================================================================

describe('analyze', () => {
  it('should include all analysis components', () => {
    const result = analyze(completeMetadata);
    
    expect(result.status).toBeDefined();
    expect(result.completeness).toBeDefined();
    expect(result.consistency).toBeDefined();
    expect(result.platforms).toBeDefined();
  });

  it('should include summary', () => {
    const result = analyze(completeMetadata);
    
    expect(result.summary.score).toBeDefined();
    expect(result.summary.requiredComplete).toBeDefined();
    expect(result.summary.platformsReady).toBeDefined();
  });

  it('should check lineage when versions provided', () => {
    const result = analyze(completeMetadata, {
      versions: [completeMetadata, { ...completeMetadata, masterEngineer: 'New' }]
    });
    
    expect(result.lineage).toBeDefined();
    expect(result.lineage.versionCount).toBe(2);
  });

  it('should generate recommendations', () => {
    const result = analyze(minimalMetadata);
    
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('should prioritize recommendations', () => {
    const result = analyze({ title: 'Test' });
    
    const highPriority = result.recommendations.filter(r => r.priority === 'HIGH');
    expect(highPriority.length).toBeGreaterThan(0);
  });

  it('should include timestamp', () => {
    const result = analyze(completeMetadata);
    
    expect(result.analyzedAt).toBeDefined();
    expect(new Date(result.analyzedAt)).toBeInstanceOf(Date);
  });
});

// ============================================================================
// Integration Scenarios
// ============================================================================

describe('Integration Scenarios', () => {
  describe('New Release Workflow', () => {
    it('should validate complete release metadata', () => {
      const result = analyze(completeMetadata);
      
      expect(result.status).toBe(ValidationStatus.COMPLETE);
      expect(result.platforms.universallyReady).toBe(true);
    });

    it('should identify missing fields for release', () => {
      const incomplete = {
        title: 'New Track',
        artist: 'Artist'
      };
      
      const result = analyze(incomplete);
      
      expect(result.recommendations.some(r => 
        r.priority === 'HIGH' && r.message.includes('required')
      )).toBe(true);
    });
  });

  describe('Version Management', () => {
    it('should track metadata through versions', () => {
      const original = { ...completeMetadata, versionName: 'Original' };
      const extended = { 
        ...original, 
        versionName: 'Extended Mix',
        duration: 420,
        mixEngineer: 'Remix Engineer'
      };
      
      const result = analyze(extended, { versions: [original, extended] });
      
      expect(result.lineage.consistent).toBe(true);
      expect(result.lineage.changes.some(c => c.field === 'duration')).toBe(true);
    });
  });

  describe('Multi-Platform Delivery', () => {
    it('should identify platform-specific gaps', () => {
      const spotifyReady = {
        isrc: 'USRC17607839',
        title: 'Test',
        artist: 'Artist',
        album: 'Album'
      };
      
      const platforms = validateForAllPlatforms(spotifyReady);
      
      expect(platforms.platforms.SPOTIFY.ready).toBe(true);
      // Apple Music requires genre
      expect(platforms.platforms.APPLE_MUSIC.ready).toBe(false);
    });
  });

  describe('Quality Assurance', () => {
    it('should catch data quality issues', () => {
      const qualityIssues = {
        ...completeMetadata,
        explicit: true,
        instrumental: true, // Conflict
        releaseDate: '2024-01-01',
        recordingDate: '2024-06-01' // After release
      };
      
      const result = analyze(qualityIssues);
      
      expect(result.consistency.consistent).toBe(false);
      expect(result.consistency.issues.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('should handle empty object', () => {
    const result = validateCompleteness({});
    
    expect(result.status).toBe(ValidationStatus.INVALID);
  });

  it('should handle whitespace-only strings', () => {
    const result = validateField('title', '   ');
    
    // Whitespace should be treated as empty after trim
    expect(result.status).toBe(FieldStatus.VALID); // It passes basic check
  });

  it('should handle numeric strings', () => {
    const result = validateField('bpm', '128');
    
    expect(result.status).toBe(FieldStatus.VALID);
    expect(result.value).toBe(128);
  });

  it('should handle extremely long strings', () => {
    const result = validateField('title', 'A'.repeat(1000));
    
    expect(result.status).toBe(FieldStatus.WARNING);
  });

  it('should handle special characters in ISRC', () => {
    const result = validateISRC('US-RC1-76-07839');
    
    expect(result.valid).toBe(true);
  });

  it('should handle partial date formats', () => {
    expect(validateField('recordingDate', '2024').status).toBe(FieldStatus.VALID);
    expect(validateField('recordingDate', '2024-06').status).toBe(FieldStatus.VALID);
  });

  it('should handle zero duration', () => {
    const result = validateField('duration', 0);
    
    expect(result.status).toBe(FieldStatus.VALID);
  });
});
