/**
 * DC Offset Detector Tests
 * 
 * Tests the DC offset detection and correction service.
 */

const dcOffsetDetector = require('../services/dcOffsetDetector');

const {
  Severity,
  THRESHOLDS,
  classifySeverity,
  getRecommendation,
  needsCorrection,
  getOffsetDescription,
  parseDCOffsets,
  getTempDir
} = dcOffsetDetector;

// ============================================================================
// Severity Constants Tests
// ============================================================================

describe('dcOffsetDetector', () => {
  describe('Severity constants', () => {
    it('should define all severity levels', () => {
      expect(Severity.NONE).toBe('NONE');
      expect(Severity.MINOR).toBe('MINOR');
      expect(Severity.MODERATE).toBe('MODERATE');
      expect(Severity.SEVERE).toBe('SEVERE');
    });

    it('should have 4 severity levels', () => {
      expect(Object.keys(Severity)).toHaveLength(4);
    });
  });

  describe('THRESHOLDS configuration', () => {
    it('should define negligible threshold', () => {
      expect(THRESHOLDS.NEGLIGIBLE).toBeDefined();
      expect(THRESHOLDS.NEGLIGIBLE).toBeLessThan(0.01);
    });

    it('should define minor threshold', () => {
      expect(THRESHOLDS.MINOR).toBeDefined();
      expect(THRESHOLDS.MINOR).toBeGreaterThan(THRESHOLDS.NEGLIGIBLE);
    });

    it('should define moderate threshold', () => {
      expect(THRESHOLDS.MODERATE).toBeDefined();
      expect(THRESHOLDS.MODERATE).toBeGreaterThanOrEqual(THRESHOLDS.MINOR);
    });

    it('should define severe threshold', () => {
      expect(THRESHOLDS.SEVERE).toBeDefined();
    });

    it('thresholds should be in ascending order', () => {
      expect(THRESHOLDS.NEGLIGIBLE).toBeLessThan(THRESHOLDS.MINOR);
      expect(THRESHOLDS.MINOR).toBeLessThanOrEqual(THRESHOLDS.MODERATE);
    });
  });

  // ============================================================================
  // classifySeverity Tests
  // ============================================================================

  describe('classifySeverity', () => {
    it('should return NONE for null offset', () => {
      expect(classifySeverity(null)).toBe(Severity.NONE);
    });

    it('should return NONE for undefined offset', () => {
      expect(classifySeverity(undefined)).toBe(Severity.NONE);
    });

    it('should return NONE for negligible offset', () => {
      expect(classifySeverity(0.0001)).toBe(Severity.NONE);
      expect(classifySeverity(0.0005)).toBe(Severity.NONE);
    });

    it('should return MINOR for small offset', () => {
      expect(classifySeverity(0.002)).toBe(Severity.MINOR);
      expect(classifySeverity(0.004)).toBe(Severity.MINOR);
    });

    it('should return MODERATE for medium offset', () => {
      expect(classifySeverity(0.008)).toBe(Severity.MODERATE);
      expect(classifySeverity(0.015)).toBe(Severity.MODERATE);
    });

    it('should return SEVERE for large offset', () => {
      expect(classifySeverity(0.03)).toBe(Severity.SEVERE);
      expect(classifySeverity(0.1)).toBe(Severity.SEVERE);
    });

    it('should handle negative offsets', () => {
      expect(classifySeverity(-0.03)).toBe(Severity.SEVERE);
      expect(classifySeverity(-0.0001)).toBe(Severity.NONE);
    });
  });

  // ============================================================================
  // getRecommendation Tests
  // ============================================================================

  describe('getRecommendation', () => {
    it('should return no action for NONE severity', () => {
      const rec = getRecommendation(Severity.NONE, 0);
      expect(rec).toContain('No DC offset');
      expect(rec.toLowerCase()).toContain('no');
    });

    it('should return optional for MINOR severity', () => {
      const rec = getRecommendation(Severity.MINOR, 0.002);
      expect(rec.toLowerCase()).toContain('minor');
      expect(rec.toLowerCase()).toContain('optional');
    });

    it('should recommend correction for MODERATE severity', () => {
      const rec = getRecommendation(Severity.MODERATE, 0.01);
      expect(rec.toLowerCase()).toContain('moderate');
      expect(rec.toLowerCase()).toContain('recommended');
    });

    it('should strongly recommend for SEVERE severity', () => {
      const rec = getRecommendation(Severity.SEVERE, 0.05);
      expect(rec.toLowerCase()).toContain('severe');
      expect(rec.toLowerCase()).toContain('strongly');
    });
  });

  // ============================================================================
  // needsCorrection Tests
  // ============================================================================

  describe('needsCorrection', () => {
    it('should return false for NONE severity', () => {
      expect(needsCorrection(Severity.NONE)).toBe(false);
    });

    it('should return false for MINOR with default threshold', () => {
      expect(needsCorrection(Severity.MINOR)).toBe(false);
    });

    it('should return true for MINOR with MINOR threshold', () => {
      expect(needsCorrection(Severity.MINOR, Severity.MINOR)).toBe(true);
    });

    it('should return true for MODERATE with default threshold', () => {
      expect(needsCorrection(Severity.MODERATE)).toBe(true);
    });

    it('should return true for SEVERE', () => {
      expect(needsCorrection(Severity.SEVERE)).toBe(true);
      expect(needsCorrection(Severity.SEVERE, Severity.MINOR)).toBe(true);
      expect(needsCorrection(Severity.SEVERE, Severity.SEVERE)).toBe(true);
    });

    it('should return false for MODERATE with SEVERE threshold', () => {
      expect(needsCorrection(Severity.MODERATE, Severity.SEVERE)).toBe(false);
    });
  });

  // ============================================================================
  // getOffsetDescription Tests
  // ============================================================================

  describe('getOffsetDescription', () => {
    it('should return Unknown for null', () => {
      expect(getOffsetDescription(null)).toBe('Unknown');
    });

    it('should return Unknown for undefined', () => {
      expect(getOffsetDescription(undefined)).toBe('Unknown');
    });

    it('should describe negligible offset', () => {
      const desc = getOffsetDescription(0.0001);
      expect(desc).toContain('Negligible');
      expect(desc).toContain('%');
    });

    it('should describe minor offset', () => {
      const desc = getOffsetDescription(0.002);
      expect(desc).toContain('Minor');
    });

    it('should describe moderate offset', () => {
      const desc = getOffsetDescription(0.01);
      expect(desc).toContain('Moderate');
    });

    it('should describe severe offset', () => {
      const desc = getOffsetDescription(0.05);
      expect(desc).toContain('Severe');
    });

    it('should handle negative offsets', () => {
      const desc = getOffsetDescription(-0.05);
      expect(desc).toContain('Severe');
      expect(desc).toContain('%');
    });
  });

  // ============================================================================
  // parseDCOffsets Tests
  // ============================================================================

  describe('parseDCOffsets', () => {
    it('should parse single channel DC offset', () => {
      const output = `
        [Parsed_astats_0 @ 0x123] DC offset: 0.000123
      `;
      
      const offsets = parseDCOffsets(output);
      expect(offsets.left).toBeCloseTo(0.000123, 6);
    });

    it('should parse stereo DC offsets', () => {
      const output = `
        [Parsed_astats_0 @ 0x123] DC offset: 0.000123
        [Parsed_astats_0 @ 0x123] DC offset: -0.000456
      `;
      
      const offsets = parseDCOffsets(output);
      expect(offsets.left).toBeCloseTo(0.000123, 6);
      expect(offsets.right).toBeCloseTo(-0.000456, 6);
    });

    it('should handle scientific notation', () => {
      const output = `DC offset: 1.5e-05`;
      
      const offsets = parseDCOffsets(output);
      expect(offsets.left).toBeCloseTo(0.000015, 6);
    });

    it('should return empty object for no matches', () => {
      const offsets = parseDCOffsets('no dc offset data here');
      expect(Object.keys(offsets)).toHaveLength(0);
    });

    it('should parse multiple channels', () => {
      const output = `
        DC offset: 0.001
        DC offset: 0.002
        DC offset: 0.003
        DC offset: 0.004
      `;
      
      const offsets = parseDCOffsets(output);
      expect(offsets.left).toBeCloseTo(0.001, 6);
      expect(offsets.right).toBeCloseTo(0.002, 6);
      expect(offsets.channel3).toBeCloseTo(0.003, 6);
      expect(offsets.channel4).toBeCloseTo(0.004, 6);
    });

    it('should fallback to Mean difference if DC offset not found', () => {
      const output = `Mean difference: 0.000789`;
      
      const offsets = parseDCOffsets(output);
      expect(offsets.left).toBeCloseTo(0.000789, 6);
    });
  });

  // ============================================================================
  // Function Exports Tests
  // ============================================================================

  describe('function exports', () => {
    it('should export detectDCOffset function', () => {
      expect(typeof dcOffsetDetector.detectDCOffset).toBe('function');
    });

    it('should export correctDCOffset function', () => {
      expect(typeof dcOffsetDetector.correctDCOffset).toBe('function');
    });

    it('should export detectAndCorrect function', () => {
      expect(typeof dcOffsetDetector.detectAndCorrect).toBe('function');
    });

    it('should export withDCCorrection function', () => {
      expect(typeof dcOffsetDetector.withDCCorrection).toBe('function');
    });

    it('should export cleanupTempFile function', () => {
      expect(typeof dcOffsetDetector.cleanupTempFile).toBe('function');
    });

    it('should export cleanupOldTempFiles function', () => {
      expect(typeof dcOffsetDetector.cleanupOldTempFiles).toBe('function');
    });
  });

  // ============================================================================
  // getTempDir Tests
  // ============================================================================

  describe('getTempDir', () => {
    it('should return a string', () => {
      expect(typeof getTempDir()).toBe('string');
    });

    it('should return a non-empty path', () => {
      expect(getTempDir().length).toBeGreaterThan(0);
    });

    it('should contain midnight in path', () => {
      expect(getTempDir()).toContain('midnight');
    });
  });

  // ============================================================================
  // StudioOS Compliance Tests
  // ============================================================================

  describe('StudioOS terminology compliance', () => {
    it('should use approved terminology in recommendations', () => {
      const recommendations = [
        getRecommendation(Severity.NONE, 0),
        getRecommendation(Severity.MINOR, 0.002),
        getRecommendation(Severity.MODERATE, 0.01),
        getRecommendation(Severity.SEVERE, 0.05)
      ];
      
      const forbiddenTerms = ['track', 'session', 'plugin', 'channel strip'];
      
      for (const rec of recommendations) {
        for (const term of forbiddenTerms) {
          expect(rec.toLowerCase()).not.toContain(term);
        }
      }
    });

    it('should use asset terminology', () => {
      const moduleSource = require('fs').readFileSync(
        require.resolve('../services/dcOffsetDetector'),
        'utf-8'
      );
      
      // Should use approved term "asset"
      expect(moduleSource).toContain('asset');
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    it('detectDCOffset should handle non-existent file gracefully', async () => {
      const result = await dcOffsetDetector.detectDCOffset('/nonexistent/file.wav');
      
      // Should return a result with error info, not throw
      expect(result.hasOffset).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('cleanupTempFile should refuse files outside temp dir', async () => {
      const result = await dcOffsetDetector.cleanupTempFile('/etc/passwd');
      expect(result).toBe(false);
    });

    it('cleanupTempFile should handle non-existent files', async () => {
      const tempDir = getTempDir();
      const result = await dcOffsetDetector.cleanupTempFile(
        `${tempDir}/nonexistent_dc_removed_xyz123.wav`
      );
      expect(result).toBe(false);
    });

    it('cleanupOldTempFiles should return stats', async () => {
      const result = await dcOffsetDetector.cleanupOldTempFiles();
      expect(result).toHaveProperty('removed');
      expect(result).toHaveProperty('errors');
      expect(typeof result.removed).toBe('number');
      expect(typeof result.errors).toBe('number');
    });
  });

  // ============================================================================
  // Integration Scenario Tests
  // ============================================================================

  describe('DC offset classification scenarios', () => {
    it('should correctly classify clean audio (no offset)', () => {
      const offset = 0.00005; // 0.005%
      expect(classifySeverity(offset)).toBe(Severity.NONE);
      expect(needsCorrection(classifySeverity(offset))).toBe(false);
    });

    it('should correctly classify minor offset', () => {
      const offset = 0.003; // 0.3%
      expect(classifySeverity(offset)).toBe(Severity.MINOR);
      expect(needsCorrection(classifySeverity(offset))).toBe(false);
      expect(needsCorrection(classifySeverity(offset), Severity.MINOR)).toBe(true);
    });

    it('should correctly classify moderate offset', () => {
      const offset = 0.012; // 1.2%
      expect(classifySeverity(offset)).toBe(Severity.MODERATE);
      expect(needsCorrection(classifySeverity(offset))).toBe(true);
    });

    it('should correctly classify severe offset', () => {
      const offset = 0.05; // 5%
      expect(classifySeverity(offset)).toBe(Severity.SEVERE);
      expect(needsCorrection(classifySeverity(offset))).toBe(true);
    });
  });
});
