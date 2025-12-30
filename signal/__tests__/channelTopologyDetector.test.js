/**
 * Channel Topology Detector Tests
 * 
 * Tests the channel topology detection service that identifies
 * Mono / Stereo / Dual-mono / Mid-Side configurations.
 */

const channelTopologyDetector = require('../services/channelTopologyDetector');

const {
  ChannelTopology,
  Confidence,
  THRESHOLDS,
  detectDualMono,
  detectMidSide,
  detectTrueStereo,
  isMonoCompatible,
  getTopologyDescription
} = channelTopologyDetector;

// ============================================================================
// ChannelTopology Constants Tests
// ============================================================================

describe('channelTopologyDetector', () => {
  describe('ChannelTopology constants', () => {
    it('should define all topology types', () => {
      expect(ChannelTopology.MONO).toBe('MONO');
      expect(ChannelTopology.STEREO).toBe('STEREO');
      expect(ChannelTopology.DUAL_MONO).toBe('DUAL_MONO');
      expect(ChannelTopology.MID_SIDE).toBe('MID_SIDE');
      expect(ChannelTopology.MULTICHANNEL).toBe('MULTICHANNEL');
      expect(ChannelTopology.UNKNOWN).toBe('UNKNOWN');
    });

    it('should have 6 topology types', () => {
      expect(Object.keys(ChannelTopology)).toHaveLength(6);
    });
  });

  describe('Confidence constants', () => {
    it('should define all confidence levels', () => {
      expect(Confidence.HIGH).toBe('HIGH');
      expect(Confidence.MEDIUM).toBe('MEDIUM');
      expect(Confidence.LOW).toBe('LOW');
    });

    it('should have 3 confidence levels', () => {
      expect(Object.keys(Confidence)).toHaveLength(3);
    });
  });

  describe('THRESHOLDS configuration', () => {
    it('should define dual-mono correlation threshold', () => {
      expect(THRESHOLDS.DUAL_MONO_CORRELATION).toBeGreaterThan(0.99);
    });

    it('should define mid-side thresholds', () => {
      expect(THRESHOLDS.MID_SIDE_SIDE_LEVEL_THRESHOLD).toBeLessThan(0);
      expect(Array.isArray(THRESHOLDS.MID_SIDE_CORRELATION_RANGE)).toBe(true);
      expect(THRESHOLDS.MID_SIDE_CORRELATION_RANGE).toHaveLength(2);
    });

    it('should define stereo width minimum', () => {
      expect(THRESHOLDS.STEREO_WIDTH_MINIMUM).toBeGreaterThan(0);
      expect(THRESHOLDS.STEREO_WIDTH_MINIMUM).toBeLessThan(1);
    });

    it('should define phase correlation thresholds', () => {
      expect(THRESHOLDS.PHASE_CORRELATION_MONO_THRESHOLD).toBeGreaterThan(0.9);
      expect(THRESHOLDS.PHASE_CORRELATION_STEREO_THRESHOLD).toBeLessThan(0.5);
    });
  });

  // ============================================================================
  // Detection Logic Tests
  // ============================================================================

  describe('detectDualMono', () => {
    it('should detect dual-mono with silent difference signal (HIGH confidence)', () => {
      const analysis = {
        diff: { diffPeakDb: -100, diffRmsDb: -100 },
        correlation: { correlation: 1.0 }
      };
      
      const result = detectDualMono(analysis);
      expect(result.isDualMono).toBe(true);
      expect(result.confidence).toBe(Confidence.HIGH);
    });

    it('should detect dual-mono with very low difference RMS (HIGH confidence)', () => {
      const analysis = {
        diff: { diffPeakDb: -70, diffRmsDb: -65 },
        correlation: { correlation: 0.999 }
      };
      
      const result = detectDualMono(analysis);
      expect(result.isDualMono).toBe(true);
      expect(result.confidence).toBe(Confidence.HIGH);
    });

    it('should detect dual-mono with moderately low difference (MEDIUM confidence)', () => {
      const analysis = {
        diff: { diffPeakDb: -55, diffRmsDb: -50 },
        correlation: { correlation: 0.98 }
      };
      
      const result = detectDualMono(analysis);
      expect(result.isDualMono).toBe(true);
      expect(result.confidence).toBe(Confidence.MEDIUM);
    });

    it('should NOT detect dual-mono with significant difference', () => {
      const analysis = {
        diff: { diffPeakDb: -20, diffRmsDb: -25 },
        correlation: { correlation: 0.8 }
      };
      
      const result = detectDualMono(analysis);
      expect(result.isDualMono).toBe(false);
    });

    it('should handle null values gracefully', () => {
      const analysis = {
        diff: { diffPeakDb: null, diffRmsDb: null },
        correlation: { correlation: null }
      };
      
      const result = detectDualMono(analysis);
      expect(result.isDualMono).toBe(false);
    });
  });

  describe('detectMidSide', () => {
    it('should detect M/S with quiet channel and low correlation', () => {
      const analysis = {
        channels: { leftRmsDb: -10, rightRmsDb: -25 },
        correlation: { correlation: 0.1 },
        sum: {},
        diff: {}
      };
      
      const result = detectMidSide(analysis);
      expect(result.isMidSide).toBe(true);
      expect(result.details).not.toBeNull();
      expect(result.details.levelDifference).toBeGreaterThan(10);
    });

    it('should detect M/S with low correlation and moderate level difference', () => {
      const analysis = {
        channels: { leftRmsDb: -12, rightRmsDb: -20 },
        correlation: { correlation: 0.0 },
        sum: {},
        diff: {}
      };
      
      const result = detectMidSide(analysis);
      expect(result.isMidSide).toBe(true);
      expect(result.confidence).toBe(Confidence.LOW);
    });

    it('should NOT detect M/S with high correlation', () => {
      const analysis = {
        channels: { leftRmsDb: -10, rightRmsDb: -25 },
        correlation: { correlation: 0.9 },
        sum: {},
        diff: {}
      };
      
      const result = detectMidSide(analysis);
      expect(result.isMidSide).toBe(false);
    });

    it('should NOT detect M/S with similar channel levels', () => {
      const analysis = {
        channels: { leftRmsDb: -12, rightRmsDb: -13 },
        correlation: { correlation: 0.1 },
        sum: {},
        diff: {}
      };
      
      const result = detectMidSide(analysis);
      expect(result.isMidSide).toBe(false);
    });

    it('should handle null values gracefully', () => {
      const analysis = {
        channels: { leftRmsDb: null, rightRmsDb: null },
        correlation: { correlation: null },
        sum: {},
        diff: {}
      };
      
      const result = detectMidSide(analysis);
      expect(result.isMidSide).toBe(false);
    });
  });

  describe('detectTrueStereo', () => {
    it('should detect true stereo with width and moderate correlation', () => {
      const analysis = {
        diff: { diffRmsDb: -15 },
        sum: { sumRmsDb: -10 },
        correlation: { correlation: 0.7 }
      };
      
      const result = detectTrueStereo(analysis);
      expect(result.isTrueStereo).toBe(true);
      expect(result.stereoWidth).toBeGreaterThan(0);
      expect(result.confidence).toBe(Confidence.HIGH);
    });

    it('should detect stereo with width but missing correlation (MEDIUM confidence)', () => {
      const analysis = {
        diff: { diffRmsDb: -12 },
        sum: { sumRmsDb: -6 },
        correlation: { correlation: null }
      };
      
      const result = detectTrueStereo(analysis);
      expect(result.isTrueStereo).toBe(true);
      expect(result.confidence).toBe(Confidence.MEDIUM);
    });

    it('should NOT detect stereo with very low width', () => {
      const analysis = {
        diff: { diffRmsDb: -60 },
        sum: { sumRmsDb: -10 },
        correlation: { correlation: 0.99 }
      };
      
      const result = detectTrueStereo(analysis);
      expect(result.isTrueStereo).toBe(false);
      expect(result.stereoWidth).toBeLessThan(THRESHOLDS.STEREO_WIDTH_MINIMUM);
    });

    it('should calculate stereo width correctly', () => {
      // -20dB diff, -10dB sum => linear ratio should be 0.316
      const analysis = {
        diff: { diffRmsDb: -20 },
        sum: { sumRmsDb: -10 },
        correlation: { correlation: 0.5 }
      };
      
      const result = detectTrueStereo(analysis);
      expect(result.stereoWidth).toBeCloseTo(0.316, 2);
    });

    it('should handle null values gracefully', () => {
      const analysis = {
        diff: { diffRmsDb: null },
        sum: { sumRmsDb: null },
        correlation: { correlation: null }
      };
      
      const result = detectTrueStereo(analysis);
      expect(result.stereoWidth).toBe(0);
    });
  });

  // ============================================================================
  // Helper Functions Tests
  // ============================================================================

  describe('isMonoCompatible', () => {
    it('should return true for MONO', () => {
      expect(isMonoCompatible(ChannelTopology.MONO)).toBe(true);
    });

    it('should return true for DUAL_MONO', () => {
      expect(isMonoCompatible(ChannelTopology.DUAL_MONO)).toBe(true);
    });

    it('should return false for STEREO', () => {
      expect(isMonoCompatible(ChannelTopology.STEREO)).toBe(false);
    });

    it('should return false for MID_SIDE', () => {
      expect(isMonoCompatible(ChannelTopology.MID_SIDE)).toBe(false);
    });

    it('should return false for MULTICHANNEL', () => {
      expect(isMonoCompatible(ChannelTopology.MULTICHANNEL)).toBe(false);
    });
  });

  describe('getTopologyDescription', () => {
    it('should return description for MONO', () => {
      const desc = getTopologyDescription(ChannelTopology.MONO);
      expect(desc).toContain('Mono');
      expect(desc).toContain('single channel');
    });

    it('should return description for STEREO', () => {
      const desc = getTopologyDescription(ChannelTopology.STEREO);
      expect(desc).toContain('Stereo');
      expect(desc).toContain('left/right');
    });

    it('should return description for DUAL_MONO', () => {
      const desc = getTopologyDescription(ChannelTopology.DUAL_MONO);
      expect(desc).toContain('Dual-mono');
      expect(desc).toContain('identical');
    });

    it('should return description for MID_SIDE', () => {
      const desc = getTopologyDescription(ChannelTopology.MID_SIDE);
      expect(desc).toContain('Mid-Side');
    });

    it('should return description for MULTICHANNEL', () => {
      const desc = getTopologyDescription(ChannelTopology.MULTICHANNEL);
      expect(desc).toContain('Multichannel');
      expect(desc).toContain('surround');
    });

    it('should return unknown description for invalid topology', () => {
      const desc = getTopologyDescription('INVALID');
      expect(desc).toContain('Unknown');
    });
  });

  // ============================================================================
  // Function Exports Tests
  // ============================================================================

  describe('function exports', () => {
    it('should export detectTopology function', () => {
      expect(typeof channelTopologyDetector.detectTopology).toBe('function');
    });

    it('should export quickCheck function', () => {
      expect(typeof channelTopologyDetector.quickCheck).toBe('function');
    });

    it('should export getChannelInfo function', () => {
      expect(typeof channelTopologyDetector.getChannelInfo).toBe('function');
    });

    it('should export analyzeChannelDifference function', () => {
      expect(typeof channelTopologyDetector.analyzeChannelDifference).toBe('function');
    });

    it('should export analyzeChannelSum function', () => {
      expect(typeof channelTopologyDetector.analyzeChannelSum).toBe('function');
    });

    it('should export analyzeIndividualChannels function', () => {
      expect(typeof channelTopologyDetector.analyzeIndividualChannels).toBe('function');
    });

    it('should export analyzePhaseCorrelation function', () => {
      expect(typeof channelTopologyDetector.analyzePhaseCorrelation).toBe('function');
    });
  });

  // ============================================================================
  // StudioOS Compliance Tests
  // ============================================================================

  describe('StudioOS terminology compliance', () => {
    it('should use approved terminology in descriptions', () => {
      // All topology descriptions should use approved terms
      const descriptions = Object.values(ChannelTopology).map(t => 
        getTopologyDescription(t)
      );
      
      // Should NOT contain forbidden terms
      const forbiddenTerms = ['track', 'channel strip', 'bus', 'fader'];
      
      for (const desc of descriptions) {
        for (const term of forbiddenTerms) {
          expect(desc.toLowerCase()).not.toContain(term);
        }
      }
    });

    it('should not use forbidden terminology in module source', () => {
      const moduleSource = require('fs').readFileSync(
        require.resolve('../services/channelTopologyDetector'),
        'utf-8'
      );
      
      // Check string literals don't contain DAW terminology
      const stringLiterals = moduleSource.match(/'[^']*'|"[^"]*"/g) || [];
      
      const daw_terms = ['fader', 'automation', 'plugin', 'rack'];
      
      for (const literal of stringLiterals) {
        for (const term of daw_terms) {
          // Allow technical terms in comments
          if (!literal.includes('//') && !literal.includes('*')) {
            expect(literal.toLowerCase()).not.toContain(term);
          }
        }
      }
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    it('detectTopology should throw for non-existent file', async () => {
      await expect(
        channelTopologyDetector.detectTopology('/nonexistent/file.wav')
      ).rejects.toThrow();
    }, 15000); // Extended timeout for multiple FFmpeg calls

    it('quickCheck should throw for non-existent file', async () => {
      await expect(
        channelTopologyDetector.quickCheck('/nonexistent/file.wav')
      ).rejects.toThrow();
    });

    it('getChannelInfo should throw for non-existent file', async () => {
      await expect(
        channelTopologyDetector.getChannelInfo('/nonexistent/file.wav')
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // Integration Scenario Tests
  // ============================================================================

  describe('topology detection scenarios', () => {
    it('should correctly classify analysis data as dual-mono', () => {
      // Simulate dual-mono detection flow
      const analysis = {
        diff: { diffPeakDb: -90, diffRmsDb: -90 },
        sum: { sumPeakDb: -6, sumRmsDb: -10 },
        channels: { leftRmsDb: -10, rightRmsDb: -10 },
        correlation: { correlation: 1.0 }
      };
      
      // Check detection order
      const dualMono = detectDualMono(analysis);
      expect(dualMono.isDualMono).toBe(true);
    });

    it('should correctly classify analysis data as M/S', () => {
      // Simulate M/S detection flow
      const analysis = {
        diff: { diffPeakDb: -10, diffRmsDb: -15 },
        sum: { sumPeakDb: -6, sumRmsDb: -10 },
        channels: { leftRmsDb: -8, rightRmsDb: -22 },
        correlation: { correlation: 0.05 }
      };
      
      const dualMono = detectDualMono(analysis);
      expect(dualMono.isDualMono).toBe(false);
      
      const midSide = detectMidSide(analysis);
      expect(midSide.isMidSide).toBe(true);
    });

    it('should correctly classify analysis data as true stereo', () => {
      // Simulate stereo detection flow
      const analysis = {
        diff: { diffPeakDb: -12, diffRmsDb: -18 },
        sum: { sumPeakDb: -6, sumRmsDb: -10 },
        channels: { leftRmsDb: -10, rightRmsDb: -11 },
        correlation: { correlation: 0.75 }
      };
      
      const dualMono = detectDualMono(analysis);
      expect(dualMono.isDualMono).toBe(false);
      
      const midSide = detectMidSide(analysis);
      expect(midSide.isMidSide).toBe(false);
      
      const stereo = detectTrueStereo(analysis);
      expect(stereo.isTrueStereo).toBe(true);
    });
  });
});
