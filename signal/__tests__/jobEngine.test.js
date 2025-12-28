/**
 * Job Engine Tests
 * 
 * Tests for services/jobEngine.js
 */

const {
  PRESETS,
  getPreset,
  validateParameters,
  getDefaultParameters,
  ErrorCategory,
  _clearQueue,
  _getQueue
} = require('../services/jobEngine');

describe('Job Engine', () => {
  beforeEach(() => {
    _clearQueue();
  });

  describe('Preset Registry', () => {
    it('should have all required presets', () => {
      expect(PRESETS['master-standard']).toBeDefined();
      expect(PRESETS['master-streaming']).toBeDefined();
      expect(PRESETS['analyze-full']).toBeDefined();
      expect(PRESETS['convert-wav']).toBeDefined();
      expect(PRESETS['convert-mp3']).toBeDefined();
      expect(PRESETS['split-stems']).toBeDefined();
      expect(PRESETS['normalize-loudness']).toBeDefined();
    });

    it('should get preset by ID', () => {
      const preset = getPreset('master-standard');
      expect(preset).toBeDefined();
      expect(preset.name).toBe('Standard Mastering');
      expect(preset.category).toBe('MASTERING');
    });

    it('should return null for unknown preset', () => {
      const preset = getPreset('unknown-preset');
      expect(preset).toBeNull();
    });

    it('should have parameters with bounds for numeric values', () => {
      const preset = PRESETS['master-standard'];
      expect(preset.parameters.loudness.min).toBe(-24);
      expect(preset.parameters.loudness.max).toBe(-6);
      expect(preset.parameters.loudness.default).toBe(-14);
    });

    it('should have options for enum values', () => {
      const preset = PRESETS['master-standard'];
      expect(preset.parameters.format.options).toContain('WAV');
      expect(preset.parameters.format.options).toContain('FLAC');
      expect(preset.parameters.format.options).toContain('MP3');
    });
  });

  describe('Parameter Validation', () => {
    it('should validate valid parameters', () => {
      const result = validateParameters('master-standard', {
        loudness: -14,
        truePeak: -1,
        format: 'WAV'
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject parameter below minimum', () => {
      const result = validateParameters('master-standard', {
        loudness: -30 // min is -24
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('loudness must be >= -24');
    });

    it('should reject parameter above maximum', () => {
      const result = validateParameters('master-standard', {
        loudness: 0 // max is -6
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('loudness must be <= -6');
    });

    it('should reject invalid option value', () => {
      const result = validateParameters('master-standard', {
        format: 'OGG' // not in options
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('format must be one of');
    });

    it('should reject unknown parameters', () => {
      const result = validateParameters('master-standard', {
        unknownParam: 42
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unknown parameter: unknownParam');
    });

    it('should reject unknown preset', () => {
      const result = validateParameters('unknown-preset', {});
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Unknown preset');
    });

    it('should validate boolean parameters', () => {
      const result = validateParameters('analyze-full', {
        includeSpectral: 'yes' // should be boolean
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('includeSpectral must be a boolean');
    });

    it('should allow valid boolean parameters', () => {
      const result = validateParameters('analyze-full', {
        includeSpectral: true,
        includeLoudness: false
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('Default Parameters', () => {
    it('should return defaults for valid preset', () => {
      const defaults = getDefaultParameters('master-standard');
      expect(defaults).toEqual({
        loudness: -14,
        truePeak: -1,
        format: 'WAV'
      });
    });

    it('should return null for unknown preset', () => {
      const defaults = getDefaultParameters('unknown');
      expect(defaults).toBeNull();
    });

    it('should return all parameters with defaults', () => {
      const defaults = getDefaultParameters('analyze-full');
      expect(defaults.includeSpectral).toBe(true);
      expect(defaults.includeLoudness).toBe(true);
      expect(defaults.includePitch).toBe(true);
    });
  });

  describe('Error Categories', () => {
    it('should define all required error categories', () => {
      expect(ErrorCategory.INGESTION).toBe('INGESTION');
      expect(ErrorCategory.PROCESSING).toBe('PROCESSING');
      expect(ErrorCategory.OUTPUT).toBe('OUTPUT');
      expect(ErrorCategory.DELIVERY).toBe('DELIVERY');
      expect(ErrorCategory.SYSTEM).toBe('SYSTEM');
    });
  });

  describe('Queue Management', () => {
    it('should start with empty queue', () => {
      expect(_getQueue()).toHaveLength(0);
    });

    it('should clear queue', () => {
      // Simulate adding to queue
      _clearQueue();
      expect(_getQueue()).toHaveLength(0);
    });
  });

  describe('Preset Categories', () => {
    it('should categorize mastering presets correctly', () => {
      expect(PRESETS['master-standard'].category).toBe('MASTERING');
      expect(PRESETS['master-streaming'].category).toBe('MASTERING');
    });

    it('should categorize analysis presets correctly', () => {
      expect(PRESETS['analyze-full'].category).toBe('ANALYSIS');
    });

    it('should categorize conversion presets correctly', () => {
      expect(PRESETS['convert-wav'].category).toBe('CONVERSION');
      expect(PRESETS['convert-mp3'].category).toBe('CONVERSION');
    });

    it('should categorize editing presets correctly', () => {
      expect(PRESETS['split-stems'].category).toBe('EDITING');
    });

    it('should categorize mixing presets correctly', () => {
      expect(PRESETS['normalize-loudness'].category).toBe('MIXING');
    });
  });

  describe('Parameter Bounds for RBAC', () => {
    // These tests verify the bounds exist for STANDARD role parameter validation
    
    it('should have bounded loudness parameters for mastering', () => {
      const preset = PRESETS['master-standard'];
      expect(preset.parameters.loudness.min).toBeDefined();
      expect(preset.parameters.loudness.max).toBeDefined();
      expect(preset.parameters.loudness.min).toBeLessThan(preset.parameters.loudness.max);
    });

    it('should have bounded target LUFS for normalization', () => {
      const preset = PRESETS['normalize-loudness'];
      expect(preset.parameters.targetLufs.min).toBeDefined();
      expect(preset.parameters.targetLufs.max).toBeDefined();
    });

    it('should have bounded truePeak parameters', () => {
      const preset = PRESETS['master-standard'];
      expect(preset.parameters.truePeak.min).toBe(-3);
      expect(preset.parameters.truePeak.max).toBe(0);
    });

    it('should specify units where applicable', () => {
      expect(PRESETS['master-standard'].parameters.loudness.unit).toBe('LUFS');
      expect(PRESETS['master-standard'].parameters.truePeak.unit).toBe('dBTP');
      expect(PRESETS['convert-mp3'].parameters.bitrate.unit).toBe('kbps');
    });
  });
});
