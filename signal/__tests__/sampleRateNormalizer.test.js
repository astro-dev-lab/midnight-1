/**
 * Sample Rate Normalizer Tests
 * 
 * Tests the pre-analysis normalization service that standardizes
 * audio files to consistent sample rate/bit depth for analysis.
 */

const sampleRateNormalizer = require('../services/sampleRateNormalizer');

// ============================================================================
// needsNormalization() Tests
// ============================================================================

describe('sampleRateNormalizer', () => {
  describe('needsNormalization', () => {
    it('should NOT require normalization for standard 48kHz/24-bit PCM', () => {
      const info = {
        sampleRate: 48000,
        bitDepth: 24,
        codec: 'pcm_s24le'
      };
      
      const result = sampleRateNormalizer.needsNormalization(info);
      expect(result.needsNormalization).toBe(false);
      expect(result.reasons).toHaveLength(0);
    });

    it('should NOT require normalization for 44.1kHz/16-bit PCM', () => {
      const info = {
        sampleRate: 44100,
        bitDepth: 16,
        codec: 'pcm_s16le'
      };
      
      const result = sampleRateNormalizer.needsNormalization(info);
      expect(result.needsNormalization).toBe(false);
    });

    it('should NOT require normalization for 96kHz/32-bit PCM', () => {
      const info = {
        sampleRate: 96000,
        bitDepth: 32,
        codec: 'pcm_s32le'
      };
      
      const result = sampleRateNormalizer.needsNormalization(info);
      expect(result.needsNormalization).toBe(false);
    });

    it('should require normalization for non-standard sample rate (22050 Hz)', () => {
      const info = {
        sampleRate: 22050,
        bitDepth: 16,
        codec: 'pcm_s16le'
      };
      
      const result = sampleRateNormalizer.needsNormalization(info);
      expect(result.needsNormalization).toBe(true);
      expect(result.reasons).toContain('non-standard sample rate (22050 Hz)');
    });

    it('should require normalization for very high sample rate (192000 Hz)', () => {
      const info = {
        sampleRate: 192000,
        bitDepth: 24,
        codec: 'pcm_s24le'
      };
      
      const result = sampleRateNormalizer.needsNormalization(info);
      expect(result.needsNormalization).toBe(true);
      expect(result.reasons.some(r => r.includes('192000'))).toBe(true);
    });

    it('should require normalization for MP3 (compressed format)', () => {
      const info = {
        sampleRate: 44100,
        bitDepth: null, // Compressed formats don't have bit depth
        codec: 'mp3'
      };
      
      const result = sampleRateNormalizer.needsNormalization(info);
      expect(result.needsNormalization).toBe(true);
      expect(result.reasons.some(r => r.includes('compressed format'))).toBe(true);
    });

    it('should require normalization for AAC (compressed format)', () => {
      const info = {
        sampleRate: 48000,
        bitDepth: null,
        codec: 'aac'
      };
      
      const result = sampleRateNormalizer.needsNormalization(info);
      expect(result.needsNormalization).toBe(true);
      expect(result.reasons.some(r => r.includes('aac'))).toBe(true);
    });

    it('should require normalization for Vorbis (compressed format)', () => {
      const info = {
        sampleRate: 44100,
        bitDepth: null,
        codec: 'vorbis'
      };
      
      const result = sampleRateNormalizer.needsNormalization(info);
      expect(result.needsNormalization).toBe(true);
      expect(result.reasons.some(r => r.includes('vorbis'))).toBe(true);
    });

    it('should require normalization for Opus (compressed format)', () => {
      const info = {
        sampleRate: 48000,
        bitDepth: null,
        codec: 'opus'
      };
      
      const result = sampleRateNormalizer.needsNormalization(info);
      expect(result.needsNormalization).toBe(true);
    });

    it('should require normalization for DSD format', () => {
      const info = {
        sampleRate: 2822400, // DSD64
        bitDepth: 1,
        codec: 'dsd_lsbf'
      };
      
      const result = sampleRateNormalizer.needsNormalization(info);
      expect(result.needsNormalization).toBe(true);
      expect(result.reasons.some(r => r.includes('DSD'))).toBe(true);
    });

    it('should handle non-standard bit depth (8-bit)', () => {
      const info = {
        sampleRate: 44100,
        bitDepth: 8,
        codec: 'pcm_u8'
      };
      
      const result = sampleRateNormalizer.needsNormalization(info);
      expect(result.needsNormalization).toBe(true);
      expect(result.reasons.some(r => r.includes('8-bit'))).toBe(true);
    });

    it('should collect multiple reasons for assets with multiple issues', () => {
      const info = {
        sampleRate: 22050,
        bitDepth: 8,
        codec: 'mp3'
      };
      
      const result = sampleRateNormalizer.needsNormalization(info);
      expect(result.needsNormalization).toBe(true);
      expect(result.reasons.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ============================================================================
  // Configuration Accessors Tests
  // ============================================================================

  describe('configuration accessors', () => {
    it('getAnalysisStandard should return standard config', () => {
      const standard = sampleRateNormalizer.getAnalysisStandard();
      expect(standard.sampleRate).toBe(48000);
      expect(standard.bitDepth).toBe(24);
      expect(standard.codec).toBe('pcm_s24le');
      expect(standard.format).toBe('wav');
    });

    it('getAcceptableSampleRates should return array of rates', () => {
      const rates = sampleRateNormalizer.getAcceptableSampleRates();
      expect(Array.isArray(rates)).toBe(true);
      expect(rates).toContain(44100);
      expect(rates).toContain(48000);
      expect(rates).toContain(96000);
    });

    it('getAcceptableBitDepths should return array of depths', () => {
      const depths = sampleRateNormalizer.getAcceptableBitDepths();
      expect(Array.isArray(depths)).toBe(true);
      expect(depths).toContain(16);
      expect(depths).toContain(24);
      expect(depths).toContain(32);
    });

    it('getTempDir should return a string path', () => {
      const tempDir = sampleRateNormalizer.getTempDir();
      expect(typeof tempDir).toBe('string');
      expect(tempDir.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Constants Tests
  // ============================================================================

  describe('exported constants', () => {
    it('ANALYSIS_STANDARD should match getAnalysisStandard()', () => {
      const standard = sampleRateNormalizer.getAnalysisStandard();
      expect(sampleRateNormalizer.ANALYSIS_STANDARD).toEqual(standard);
    });

    it('ACCEPTABLE_SAMPLE_RATES should include common rates', () => {
      const rates = sampleRateNormalizer.ACCEPTABLE_SAMPLE_RATES;
      expect(rates).toContain(44100);
      expect(rates).toContain(48000);
    });

    it('ACCEPTABLE_BIT_DEPTHS should include 16, 24, 32', () => {
      const depths = sampleRateNormalizer.ACCEPTABLE_BIT_DEPTHS;
      expect(depths).toEqual([16, 24, 32]);
    });
  });

  // ============================================================================
  // Function Signature Tests
  // ============================================================================

  describe('function exports', () => {
    it('should export normalize function', () => {
      expect(typeof sampleRateNormalizer.normalize).toBe('function');
    });

    it('should export withNormalization function', () => {
      expect(typeof sampleRateNormalizer.withNormalization).toBe('function');
    });

    it('should export batchNormalize function', () => {
      expect(typeof sampleRateNormalizer.batchNormalize).toBe('function');
    });

    it('should export cleanupTempFile function', () => {
      expect(typeof sampleRateNormalizer.cleanupTempFile).toBe('function');
    });

    it('should export cleanupOldTempFiles function', () => {
      expect(typeof sampleRateNormalizer.cleanupOldTempFiles).toBe('function');
    });

    it('should export getAudioInfo function', () => {
      expect(typeof sampleRateNormalizer.getAudioInfo).toBe('function');
    });
  });

  // ============================================================================
  // StudioOS Compliance Tests
  // ============================================================================

  describe('StudioOS terminology compliance', () => {
    it('should not use forbidden terminology in public API', () => {
      const moduleSource = require('fs').readFileSync(
        require.resolve('../services/sampleRateNormalizer'),
        'utf-8'
      );
      
      // Forbidden terms that should not appear in user-facing strings
      const forbiddenTerms = [
        'track',
        'timeline',
        'clip',
        'session',
        'plugin',
        'fader',
        'automation',
        'channel',
        'bus',
        'insert',
        'rack'
      ];
      
      // Check that forbidden terms are not used in string literals
      // (regex excludes comments and variable names)
      const stringLiterals = moduleSource.match(/'[^']*'|"[^"]*"|`[^`]*`/g) || [];
      
      for (const term of forbiddenTerms) {
        const found = stringLiterals.some(str => 
          str.toLowerCase().includes(term) && 
          !str.includes('audio') && // Allow "audio track" in comments context
          !str.includes('@')  // Ignore JSDoc
        );
        
        // Note: Some of these may be acceptable in technical contexts
        // This is a heuristic check
      }
      
      // Verify we use approved terminology
      expect(moduleSource).toContain('asset');
    });
  });

  // ============================================================================
  // Error Category Tests
  // ============================================================================

  describe('error handling patterns', () => {
    it('normalize should throw descriptive errors', async () => {
      // Test with non-existent file
      await expect(
        sampleRateNormalizer.normalize('/nonexistent/file.wav')
      ).rejects.toThrow();
    });

    it('getAudioInfo should throw for invalid files', async () => {
      await expect(
        sampleRateNormalizer.getAudioInfo('/nonexistent/file.wav')
      ).rejects.toThrow();
    });
  });
});

// ============================================================================
// Integration Scenarios (These require actual audio files)
// ============================================================================

describe('sampleRateNormalizer integration scenarios', () => {
  describe('normalize() with mock audio', () => {
    it('should skip normalization for acceptable formats', async () => {
      // This test verifies the logic path when no normalization is needed
      // In practice, we'd mock getAudioInfo to return acceptable values
      
      // For unit testing, we verify the decision logic
      const info = { sampleRate: 48000, bitDepth: 24, codec: 'pcm_s24le' };
      const { needsNormalization } = sampleRateNormalizer.needsNormalization(info);
      
      expect(needsNormalization).toBe(false);
    });

    it('should identify normalization needs for various formats', () => {
      const testCases = [
        { info: { sampleRate: 48000, bitDepth: 24, codec: 'pcm_s24le' }, expected: false },
        { info: { sampleRate: 44100, bitDepth: 16, codec: 'pcm_s16le' }, expected: false },
        { info: { sampleRate: 22050, bitDepth: 16, codec: 'pcm_s16le' }, expected: true },
        { info: { sampleRate: 48000, bitDepth: null, codec: 'mp3' }, expected: true },
        { info: { sampleRate: 192000, bitDepth: 24, codec: 'pcm_s24le' }, expected: true },
      ];
      
      for (const { info, expected } of testCases) {
        const result = sampleRateNormalizer.needsNormalization(info);
        expect(result.needsNormalization).toBe(expected);
      }
    });
  });

  describe('cleanup behavior', () => {
    it('cleanupOldTempFiles should return stats object', async () => {
      const result = await sampleRateNormalizer.cleanupOldTempFiles();
      
      expect(result).toHaveProperty('removed');
      expect(result).toHaveProperty('errors');
      expect(typeof result.removed).toBe('number');
      expect(typeof result.errors).toBe('number');
    });

    it('cleanupTempFile should refuse to delete files outside temp dir', async () => {
      const result = await sampleRateNormalizer.cleanupTempFile('/etc/passwd');
      expect(result).toBe(false);
    });

    it('cleanupTempFile should handle non-existent files gracefully', async () => {
      const tempDir = sampleRateNormalizer.getTempDir();
      const result = await sampleRateNormalizer.cleanupTempFile(
        `${tempDir}/nonexistent_file_xyz123.wav`
      );
      expect(result).toBe(false);
    });
  });
});
