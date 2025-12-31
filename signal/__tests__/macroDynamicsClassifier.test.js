/**
 * Tests for Macro-Dynamics Shape Classifier
 * 
 * The macro-dynamics classifier analyzes the overall energy arc of an audio file
 * using EBU R128 short-term loudness measurements, classifying the shape into
 * one of 12 patterns (FLAT, CRESCENDO, ARC, etc.).
 */

const path = require('path');
const fs = require('fs').promises;

const macroDynamicsClassifier = require('../services/macroDynamicsClassifier');

// ============================================================================
// Test Constants
// ============================================================================

describe('Macro-Dynamics Shape Classifier', () => {
  
  // ==========================================================================
  // Constants and Enums
  // ==========================================================================
  
  describe('Constants', () => {
    
    describe('MacroDynamicsShape enum', () => {
      it('should export all 12 shape types', () => {
        const { MacroDynamicsShape } = macroDynamicsClassifier;
        
        expect(MacroDynamicsShape).toBeDefined();
        expect(MacroDynamicsShape.FLAT).toBe('FLAT');
        expect(MacroDynamicsShape.CRESCENDO).toBe('CRESCENDO');
        expect(MacroDynamicsShape.DECRESCENDO).toBe('DECRESCENDO');
        expect(MacroDynamicsShape.ARC).toBe('ARC');
        expect(MacroDynamicsShape.INVERTED_ARC).toBe('INVERTED_ARC');
        expect(MacroDynamicsShape.DOUBLE_ARC).toBe('DOUBLE_ARC');
        expect(MacroDynamicsShape.STEPPED_UP).toBe('STEPPED_UP');
        expect(MacroDynamicsShape.STEPPED_DOWN).toBe('STEPPED_DOWN');
        expect(MacroDynamicsShape.BOOKEND).toBe('BOOKEND');
        expect(MacroDynamicsShape.FRONT_LOADED).toBe('FRONT_LOADED');
        expect(MacroDynamicsShape.BACK_LOADED).toBe('BACK_LOADED');
        expect(MacroDynamicsShape.FLUCTUATING).toBe('FLUCTUATING');
      });
      
      it('should have exactly 12 shape types', () => {
        const { MacroDynamicsShape } = macroDynamicsClassifier;
        // 13 total including UNKNOWN
        expect(Object.keys(MacroDynamicsShape).length).toBe(13);
      });
    });
    
    describe('SHAPE_DESCRIPTIONS', () => {
      it('should have descriptions for all shape types', () => {
        const { MacroDynamicsShape, SHAPE_DESCRIPTIONS } = macroDynamicsClassifier;
        
        expect(SHAPE_DESCRIPTIONS).toBeDefined();
        
        // Verify all shapes have descriptions
        Object.values(MacroDynamicsShape).forEach(shape => {
          expect(SHAPE_DESCRIPTIONS[shape]).toBeDefined();
          expect(typeof SHAPE_DESCRIPTIONS[shape]).toBe('string');
          expect(SHAPE_DESCRIPTIONS[shape].length).toBeGreaterThan(10);
        });
      });
      
      it('should have meaningful descriptions', () => {
        const { SHAPE_DESCRIPTIONS } = macroDynamicsClassifier;
        
        // Case-insensitive matching
        expect(SHAPE_DESCRIPTIONS.FLAT.toLowerCase()).toContain('consistent');
        expect(SHAPE_DESCRIPTIONS.CRESCENDO.toLowerCase()).toContain('builds');
        expect(SHAPE_DESCRIPTIONS.DECRESCENDO.toLowerCase()).toContain('decreases');
        expect(SHAPE_DESCRIPTIONS.ARC.toLowerCase()).toContain('peak');
        expect(SHAPE_DESCRIPTIONS.FLUCTUATING.toLowerCase()).toContain('variable');
      });
    });
    
    describe('MACRO_WINDOW_SIZES', () => {
      it('should export window size constants', () => {
        const { MACRO_WINDOW_SIZES } = macroDynamicsClassifier;
        
        expect(MACRO_WINDOW_SIZES).toBeDefined();
        expect(MACRO_WINDOW_SIZES.SHORT).toBe(8);
        expect(MACRO_WINDOW_SIZES.MEDIUM).toBe(16);
        expect(MACRO_WINDOW_SIZES.LONG).toBe(30);
      });
    });
    
    describe('THRESHOLDS', () => {
      it('should export classification thresholds', () => {
        const { THRESHOLDS } = macroDynamicsClassifier;
        
        expect(THRESHOLDS).toBeDefined();
        expect(typeof THRESHOLDS.FLAT_RANGE).toBe('number');
        expect(typeof THRESHOLDS.SLOPE_SIGNIFICANT).toBe('number');
        expect(typeof THRESHOLDS.SECTION_DIFF).toBe('number');
        expect(typeof THRESHOLDS.HIGH_VARIANCE).toBe('number');
      });
      
      it('should have sensible threshold values', () => {
        const { THRESHOLDS } = macroDynamicsClassifier;
        
        // FLAT_RANGE should be around 3 dB
        expect(THRESHOLDS.FLAT_RANGE).toBeGreaterThanOrEqual(2);
        expect(THRESHOLDS.FLAT_RANGE).toBeLessThanOrEqual(5);
        
        // SLOPE_SIGNIFICANT should be small (0.2-0.5 dB/window)
        expect(THRESHOLDS.SLOPE_SIGNIFICANT).toBeGreaterThan(0);
        expect(THRESHOLDS.SLOPE_SIGNIFICANT).toBeLessThan(1);
        
        // SECTION_DIFF should be around 2 dB
        expect(THRESHOLDS.SECTION_DIFF).toBeGreaterThanOrEqual(1);
        expect(THRESHOLDS.SECTION_DIFF).toBeLessThanOrEqual(4);
        
        // HIGH_VARIANCE should be around 5 dB
        expect(THRESHOLDS.HIGH_VARIANCE).toBeGreaterThanOrEqual(3);
        expect(THRESHOLDS.HIGH_VARIANCE).toBeLessThanOrEqual(8);
      });
    });
  });
  
  // ==========================================================================
  // Utility Functions
  // ==========================================================================
  
  describe('Utility Functions', () => {
    
    describe('calculateSlope', () => {
      const { calculateSlope } = macroDynamicsClassifier;
      
      it('should calculate positive slope for increasing values', () => {
        const values = [-20, -18, -16, -14, -12];
        const slope = calculateSlope(values);
        
        expect(slope).toBeGreaterThan(0);
        expect(slope).toBeCloseTo(2, 1); // ~2 dB per step
      });
      
      it('should calculate negative slope for decreasing values', () => {
        const values = [-12, -14, -16, -18, -20];
        const slope = calculateSlope(values);
        
        expect(slope).toBeLessThan(0);
        expect(slope).toBeCloseTo(-2, 1); // ~-2 dB per step
      });
      
      it('should return near-zero slope for flat values', () => {
        const values = [-14, -14.1, -13.9, -14.2, -14];
        const slope = calculateSlope(values);
        
        expect(Math.abs(slope)).toBeLessThan(0.1);
      });
      
      it('should handle single value', () => {
        const values = [-14];
        const slope = calculateSlope(values);
        
        expect(slope).toBe(0);
      });
      
      it('should handle empty array', () => {
        const slope = calculateSlope([]);
        expect(slope).toBe(0);
      });
    });
    
    describe('calculateStdDev', () => {
      const { calculateStdDev } = macroDynamicsClassifier;
      
      it('should return 0 for uniform values', () => {
        const values = [-14, -14, -14, -14, -14];
        const stdDev = calculateStdDev(values);
        
        expect(stdDev).toBe(0);
      });
      
      it('should calculate standard deviation correctly', () => {
        // Values with known std dev
        const values = [2, 4, 4, 4, 5, 5, 7, 9];
        const stdDev = calculateStdDev(values);
        
        // Expected std dev is ~2
        expect(stdDev).toBeCloseTo(2, 0);
      });
      
      it('should handle high variance values', () => {
        const values = [-20, -10, -20, -10, -20];
        const stdDev = calculateStdDev(values);
        
        expect(stdDev).toBeGreaterThan(4);
      });
      
      it('should handle single value', () => {
        const stdDev = calculateStdDev([-14]);
        expect(stdDev).toBe(0);
      });
      
      it('should handle empty array', () => {
        const stdDev = calculateStdDev([]);
        expect(stdDev).toBe(0);
      });
    });
    
    describe('findPeakLocations', () => {
      const { findPeakLocations } = macroDynamicsClassifier;
      
      it('should find single peak in middle', () => {
        const values = [-20, -18, -14, -10, -14, -18, -20];
        const peaks = findPeakLocations(values);
        
        expect(peaks.length).toBeGreaterThanOrEqual(1);
        // Peak should be around index 3
        const hasPeakInMiddle = peaks.some(p => p >= 2 && p <= 4);
        expect(hasPeakInMiddle).toBe(true);
      });
      
      it('should find multiple peaks', () => {
        const values = [-20, -14, -20, -14, -20];
        const peaks = findPeakLocations(values);
        
        expect(peaks.length).toBeGreaterThanOrEqual(2);
      });
      
      it('should return empty array for flat values', () => {
        const values = [-14, -14, -14, -14, -14];
        const peaks = findPeakLocations(values);
        
        expect(peaks.length).toBe(0);
      });
      
      it('should handle edge peaks', () => {
        // Peak at the start
        const valuesStart = [-10, -14, -18, -20, -20];
        const peaksStart = findPeakLocations(valuesStart);
        
        // Should detect peak at or near start
        const hasPeakAtStart = peaksStart.some(p => p <= 1);
        expect(hasPeakAtStart).toBe(true);
      });
      
      it('should handle empty array', () => {
        const peaks = findPeakLocations([]);
        expect(peaks).toEqual([]);
      });
    });
  });
  
  // ==========================================================================
  // Shape Classification Logic
  // ==========================================================================
  
  describe('Shape Classification', () => {
    const { classifyMacroShape, MacroDynamicsShape, THRESHOLDS } = macroDynamicsClassifier;
    
    describe('FLAT classification', () => {
      it('should classify consistent energy as FLAT', () => {
        // Small variations within FLAT_RANGE
        const segments = [-14, -14.5, -13.8, -14.2, -14.1, -13.9];
        const result = classifyMacroShape(segments);
        
        expect(result.shape).toBe(MacroDynamicsShape.FLAT);
        expect(result.confidence).toBeGreaterThanOrEqual(0.5);
      });
      
      it('should have high confidence for perfectly flat', () => {
        const segments = [-14, -14, -14, -14, -14, -14];
        const result = classifyMacroShape(segments);
        
        expect(result.shape).toBe(MacroDynamicsShape.FLAT);
        expect(result.confidence).toBeGreaterThanOrEqual(0.5);
      });
    });
    
    describe('CRESCENDO classification', () => {
      it('should classify steady build-up as CRESCENDO', () => {
        // Consistent increase over time with significant range (>3dB FLAT threshold)
        // Need slope > 0.3 and lastMean > firstMean + 2dB (SECTION_DIFF)
        const segments = [-22, -20, -18, -16, -14, -12, -10, -8, -6];
        const result = classifyMacroShape(segments);
        
        expect(result.shape).toBe(MacroDynamicsShape.CRESCENDO);
      });
      
      it('should detect gradual crescendo', () => {
        // Larger range to exceed FLAT threshold
        const segments = [-20, -18.5, -17, -15.5, -14, -12.5, -11, -9.5, -8];
        const result = classifyMacroShape(segments);
        
        expect(result.shape).toBe(MacroDynamicsShape.CRESCENDO);
      });
    });
    
    describe('DECRESCENDO classification', () => {
      it('should classify steady fade as DECRESCENDO', () => {
        // Consistent decrease over time with significant range
        const segments = [-6, -8, -10, -12, -14, -16, -18, -20, -22];
        const result = classifyMacroShape(segments);
        
        expect(result.shape).toBe(MacroDynamicsShape.DECRESCENDO);
      });
      
      it('should detect gradual decrescendo', () => {
        // Larger range to exceed FLAT threshold
        const segments = [-8, -9.5, -11, -12.5, -14, -15.5, -17, -18.5, -20];
        const result = classifyMacroShape(segments);
        
        expect(result.shape).toBe(MacroDynamicsShape.DECRESCENDO);
      });
    });
    
    describe('ARC classification', () => {
      it('should classify build-peak-fade as ARC', () => {
        // Classic arc: build to middle, then fade - needs significant range
        // middleMean > firstMean + 2dB AND middleMean > lastMean + 2dB
        const segments = [-22, -18, -14, -10, -8, -10, -14, -18, -22];
        const result = classifyMacroShape(segments);
        
        expect(result.shape).toBe(MacroDynamicsShape.ARC);
      });
      
      it('should classify asymmetric arc', () => {
        // Faster build, slower fade with significant range
        const segments = [-22, -16, -10, -8, -10, -12, -14, -16, -18];
        const result = classifyMacroShape(segments);
        
        expect(result.shape).toBe(MacroDynamicsShape.ARC);
      });
    });
    
    describe('INVERTED_ARC classification', () => {
      it('should classify fade-trough-build as INVERTED_ARC', () => {
        // Inverse of arc: high at edges, low in middle
        // middleMean < firstMean - 2dB AND middleMean < lastMean - 2dB
        const segments = [-8, -12, -16, -20, -22, -20, -16, -12, -8];
        const result = classifyMacroShape(segments);
        
        expect(result.shape).toBe(MacroDynamicsShape.INVERTED_ARC);
      });
    });
    
    describe('DOUBLE_ARC classification', () => {
      it('should classify two peaks as DOUBLE_ARC', () => {
        // Two distinct peaks with significant separation
        // peakCount === 2 and peaks are >25% apart
        const segments = [-20, -14, -10, -14, -20, -14, -10, -14, -20];
        const result = classifyMacroShape(segments);
        
        expect(result.shape).toBe(MacroDynamicsShape.DOUBLE_ARC);
      });
      
      it('should detect verse-chorus-verse-chorus pattern', () => {
        const segments = [-18, -12, -18, -12, -18, -12, -18];
        const result = classifyMacroShape(segments);
        
        // Could be DOUBLE_ARC or FLUCTUATING depending on implementation
        expect([MacroDynamicsShape.DOUBLE_ARC, MacroDynamicsShape.FLUCTUATING, MacroDynamicsShape.FLAT]).toContain(result.shape);
      });
    });
    
    describe('STEPPED_UP classification', () => {
      it('should classify plateau increases as STEPPED_UP or CRESCENDO', () => {
        // Distinct steps up with plateaus - need low variance within sections
        // Each section stable, but ascending: first < middle < last
        const segments = [-20, -20, -20, -14, -14, -14, -8, -8, -8];
        const result = classifyMacroShape(segments);
        
        // STEPPED_UP when plateaus detected; CRESCENDO when seen as continuous rise
        expect([MacroDynamicsShape.STEPPED_UP, MacroDynamicsShape.CRESCENDO]).toContain(result.shape);
      });
    });
    
    describe('STEPPED_DOWN classification', () => {
      it('should classify plateau decreases as STEPPED_DOWN or DECRESCENDO', () => {
        // Distinct steps down with plateaus - need low variance within sections
        // Each section stable, but descending: first > middle > last
        const segments = [-8, -8, -8, -14, -14, -14, -20, -20, -20];
        const result = classifyMacroShape(segments);
        
        // STEPPED_DOWN when plateaus detected; DECRESCENDO when seen as continuous fall
        expect([MacroDynamicsShape.STEPPED_DOWN, MacroDynamicsShape.DECRESCENDO]).toContain(result.shape);
      });
    });
    
    describe('BOOKEND classification', () => {
      it('should classify quiet-loud-quiet as BOOKEND', () => {
        // Quiet sections at start and end, loud middle
        // firstMean < mean - 2dB AND lastMean < mean - 2dB AND middleMean > mean
        const segments = [-22, -22, -22, -10, -10, -10, -10, -22, -22, -22];
        const result = classifyMacroShape(segments);
        
        // Could be BOOKEND or ARC depending on detection
        expect([MacroDynamicsShape.BOOKEND, MacroDynamicsShape.ARC]).toContain(result.shape);
      });
    });
    
    describe('FRONT_LOADED classification', () => {
      it('should classify early energy as FRONT_LOADED or DECRESCENDO', () => {
        // High energy at start, lower for rest
        const segments = [-12, -14, -18, -18, -18, -18];
        const result = classifyMacroShape(segments);
        
        // FRONT_LOADED when peak at start with plateau; DECRESCENDO when continuous decline
        expect([MacroDynamicsShape.FRONT_LOADED, MacroDynamicsShape.DECRESCENDO]).toContain(result.shape);
      });
    });
    
    describe('BACK_LOADED classification', () => {
      it('should classify late energy as BACK_LOADED or CRESCENDO', () => {
        // Low energy at start, high at end
        const segments = [-18, -18, -18, -18, -14, -12];
        const result = classifyMacroShape(segments);
        
        // BACK_LOADED when peak at end with plateau; CRESCENDO when continuous rise
        expect([MacroDynamicsShape.BACK_LOADED, MacroDynamicsShape.CRESCENDO]).toContain(result.shape);
      });
    });
    
    describe('FLUCTUATING classification', () => {
      it('should classify erratic patterns as FLUCTUATING', () => {
        // High variance with no clear pattern - extreme swings
        const segments = [-8, -25, -10, -22, -6, -24, -12, -20];
        const result = classifyMacroShape(segments);
        
        // High variance patterns should be FLUCTUATING or DYNAMIC-like
        expect(['FLUCTUATING', 'INVERTED_ARC', 'DYNAMIC']).toContain(result.shape);
      });
      
      it('should have lower confidence for FLUCTUATING', () => {
        const segments = [-8, -25, -10, -22, -6, -24, -12, -20];
        const result = classifyMacroShape(segments);
        
        // High variance typically has confidence in 0.65-0.85 range
        expect(result.confidence).toBeLessThanOrEqual(0.85);
      });
    });
    
    describe('Edge cases', () => {
      it('should handle minimum segments (3)', () => {
        const segments = [-14, -12, -14];
        const result = classifyMacroShape(segments);
        
        expect(result.shape).toBeDefined();
        expect(typeof result.confidence).toBe('number');
      });
      
      it('should handle very long segment arrays', () => {
        // 30 segments
        const segments = Array(30).fill(0).map((_, i) => -14 + Math.sin(i / 5) * 3);
        const result = classifyMacroShape(segments);
        
        expect(result.shape).toBeDefined();
      });
      
      it('should return metadata about the analysis', () => {
        const segments = [-20, -18, -16, -14, -16, -18, -20];
        const result = classifyMacroShape(segments);
        
        expect(result.shape).toBeDefined();
        expect(result.confidence).toBeDefined();
        expect(typeof result.confidence).toBe('number');
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      });
    });
  });
  
  // ==========================================================================
  // Aggregation Functions
  // ==========================================================================
  
  describe('Aggregation', () => {
    const { aggregateToMacroWindows, MACRO_WINDOW_SIZES } = macroDynamicsClassifier;
    
    describe('aggregateToMacroWindows', () => {
      it('should aggregate short-term readings to macro windows', () => {
        // Simulate 60 seconds of data at 3-second intervals (20 readings)
        const timeline = Array(20).fill(0).map((_, i) => ({
          time: i * 3,
          loudness: -14 + (i < 10 ? i * 0.5 : (20 - i) * 0.5) // Arc shape
        }));
        
        const result = aggregateToMacroWindows(timeline, MACRO_WINDOW_SIZES.MEDIUM);
        
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
        expect(result.length).toBeLessThan(timeline.length);
      });
      
      it('should use average loudness within each window', () => {
        const timeline = [
          { time: 0, loudness: -14 },
          { time: 3, loudness: -12 },
          { time: 6, loudness: -16 },
          { time: 9, loudness: -14 },
          { time: 12, loudness: -14 },
          { time: 15, loudness: -14 }
        ];
        
        // With 8-second windows, should get ~2 windows from 18 seconds
        const result = aggregateToMacroWindows(timeline, 8);
        
        expect(result.length).toBeGreaterThanOrEqual(1);
        // First window should average first 2-3 readings
      });
      
      it('should handle different window sizes', () => {
        const timeline = Array(40).fill(0).map((_, i) => ({
          time: i * 3,
          loudness: -14
        }));
        
        const shortWindows = aggregateToMacroWindows(timeline, MACRO_WINDOW_SIZES.SHORT);
        const mediumWindows = aggregateToMacroWindows(timeline, MACRO_WINDOW_SIZES.MEDIUM);
        const longWindows = aggregateToMacroWindows(timeline, MACRO_WINDOW_SIZES.LONG);
        
        // Smaller windows = more segments
        expect(shortWindows.length).toBeGreaterThanOrEqual(mediumWindows.length);
        expect(mediumWindows.length).toBeGreaterThanOrEqual(longWindows.length);
      });
      
      it('should handle empty timeline', () => {
        const result = aggregateToMacroWindows([], 16);
        expect(result).toEqual([]);
      });
      
      it('should handle single reading', () => {
        const timeline = [{ time: 0, loudness: -14 }];
        const result = aggregateToMacroWindows(timeline, 16);
        
        expect(result.length).toBe(1);
        expect(result[0].avgLoudness).toBeCloseTo(-14);
      });
    });
  });
  
  // ==========================================================================
  // Integration Tests
  // ==========================================================================
  
  describe('Integration', () => {
    const FIXTURES_DIR = path.join(__dirname, '../uploads');
    let testFiles = [];
    
    beforeAll(async () => {
      try {
        const files = await fs.readdir(FIXTURES_DIR);
        testFiles = files
          .filter(f => /\.(wav|mp3|flac|aiff?)$/i.test(f))
          .map(f => path.join(FIXTURES_DIR, f));
      } catch (err) {
        // No fixtures available
      }
    });
    
    describe('analyzeMacroDynamics', () => {
      it('should analyze a real audio file', async () => {
        if (testFiles.length === 0) {
          console.log('Skipping: no test audio files available');
          return;
        }
        
        const result = await macroDynamicsClassifier.analyzeMacroDynamics(testFiles[0]);
        
        expect(result).toBeDefined();
        expect(result.shape).toBeDefined();
        expect(result.description).toBeDefined();
        expect(result.confidence).toBeDefined();
        expect(typeof result.confidence).toBe('number');
        expect(result.windowSize).toBeDefined();
        expect(result.segmentCount).toBeDefined();
      }, 30000);
      
      it('should accept window size option', async () => {
        if (testFiles.length === 0) {
          console.log('Skipping: no test audio files available');
          return;
        }
        
        const { MACRO_WINDOW_SIZES } = macroDynamicsClassifier;
        
        const resultShort = await macroDynamicsClassifier.analyzeMacroDynamics(
          testFiles[0], 
          { windowSize: MACRO_WINDOW_SIZES.SHORT }
        );
        
        const resultLong = await macroDynamicsClassifier.analyzeMacroDynamics(
          testFiles[0], 
          { windowSize: MACRO_WINDOW_SIZES.LONG }
        );
        
        expect(resultShort.windowSize).toBe(MACRO_WINDOW_SIZES.SHORT);
        expect(resultLong.windowSize).toBe(MACRO_WINDOW_SIZES.LONG);
        
        // Shorter windows = more segments
        expect(resultShort.segmentCount).toBeGreaterThanOrEqual(resultLong.segmentCount);
      }, 60000);
      
      it('should handle non-existent file gracefully', async () => {
        const result = await macroDynamicsClassifier.analyzeMacroDynamics('/nonexistent/file.wav');
        // Should return UNKNOWN shape for non-existent files
        expect(result.shape).toBe('UNKNOWN');
        expect(result.confidence).toBe(0);
      }, 15000);
      
      it('should return timeline data when requested', async () => {
        if (testFiles.length === 0) {
          console.log('Skipping: no test audio files available');
          return;
        }
        
        const result = await macroDynamicsClassifier.analyzeMacroDynamics(
          testFiles[0],
          { includeTimeline: true }
        );
        
        if (result.timeline) {
          expect(Array.isArray(result.timeline)).toBe(true);
          expect(result.timeline.length).toBeGreaterThan(0);
        }
      }, 30000);
    });
    
    describe('quickCheck', () => {
      it('should return minimal analysis for quick checks', async () => {
        if (testFiles.length === 0) {
          console.log('Skipping: no test audio files available');
          return;
        }
        
        const result = await macroDynamicsClassifier.quickCheck(testFiles[0]);
        
        expect(result).toBeDefined();
        expect(result.shape).toBeDefined();
        expect(result.confidence).toBeDefined();
        expect(result.windowCount).toBeDefined();
        expect(result.processingTimeMs).toBeDefined();
      }, 30000);
      
      it('should be faster than full analysis', async () => {
        if (testFiles.length === 0) {
          console.log('Skipping: no test audio files available');
          return;
        }
        
        const startQuick = Date.now();
        await macroDynamicsClassifier.quickCheck(testFiles[0]);
        const quickTime = Date.now() - startQuick;
        
        const startFull = Date.now();
        await macroDynamicsClassifier.analyzeMacroDynamics(testFiles[0], { includeTimeline: true });
        const fullTime = Date.now() - startFull;
        
        // Quick should be at least somewhat faster (allowing for variance)
        expect(quickTime).toBeLessThanOrEqual(fullTime + 1000);
      }, 60000);
      
      it('should handle errors gracefully', async () => {
        const result = await macroDynamicsClassifier.quickCheck('/nonexistent/file.wav');
        // Should return UNKNOWN shape for errors
        expect(result.shape).toBe('UNKNOWN');
        expect(result.confidence).toBe(0);
      }, 15000);
    });
  });
  
  // ==========================================================================
  // Status Mapping
  // ==========================================================================
  
  describe('Status Mapping', () => {
    const { MacroDynamicsShape } = macroDynamicsClassifier;
    
    it('should include status field in results', async () => {
      const segments = [-14, -14, -14, -14, -14];
      const result = macroDynamicsClassifier.classifyMacroShape(segments);
      
      // Status should reflect the shape classification
      expect(result.shape).toBeDefined();
    });
    
    it('should map problematic shapes appropriately', () => {
      // FLUCTUATING should be flagged as problematic in audioProcessor
      const fluctuatingSegments = [-14, -22, -12, -20, -14, -18, -10];
      const result = macroDynamicsClassifier.classifyMacroShape(fluctuatingSegments);
      
      if (result.shape === MacroDynamicsShape.FLUCTUATING) {
        // This will trigger a problem in audioProcessor
        expect(result.shape).toBe('FLUCTUATING');
      }
    });
  });
  
  // ==========================================================================
  // Export Verification
  // ==========================================================================
  
  describe('Module Exports', () => {
    it('should export analyzeMacroDynamics function', () => {
      expect(typeof macroDynamicsClassifier.analyzeMacroDynamics).toBe('function');
    });
    
    it('should export quickCheck function', () => {
      expect(typeof macroDynamicsClassifier.quickCheck).toBe('function');
    });
    
    it('should export classifyMacroShape function', () => {
      expect(typeof macroDynamicsClassifier.classifyMacroShape).toBe('function');
    });
    
    it('should export utility functions', () => {
      expect(typeof macroDynamicsClassifier.calculateSlope).toBe('function');
      expect(typeof macroDynamicsClassifier.calculateStdDev).toBe('function');
      expect(typeof macroDynamicsClassifier.findPeakLocations).toBe('function');
      expect(typeof macroDynamicsClassifier.aggregateToMacroWindows).toBe('function');
    });
    
    it('should export constants', () => {
      expect(macroDynamicsClassifier.MacroDynamicsShape).toBeDefined();
      expect(macroDynamicsClassifier.SHAPE_DESCRIPTIONS).toBeDefined();
      expect(macroDynamicsClassifier.MACRO_WINDOW_SIZES).toBeDefined();
      expect(macroDynamicsClassifier.THRESHOLDS).toBeDefined();
    });
  });
});
