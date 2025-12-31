/**
 * Macro-Dynamics Shape Classifier
 * 
 * Analyzes the overall energy arc of audio files to detect
 * structural patterns like crescendo, arc, plateau, etc.
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Analysis provides actionable
 * metrics for transformation parameter selection.
 * 
 * This focuses on the OVERALL ENERGY ARC, not arrangement details.
 * Uses EBU R128 short-term loudness for perceptual accuracy.
 * 
 * Use cases:
 * - Understanding overall energy trajectory
 * - Matching content to playlist contexts
 * - Identifying anthem vs ambient content
 * - Informing loudness normalization strategy
 */

const { spawn } = require('child_process');

// ============================================================================
// Configuration
// ============================================================================

const FFMPEG_PATH = 'ffmpeg';

/**
 * Macro-dynamics shape classifications
 */
const MacroDynamicsShape = {
  // Basic shapes
  FLAT: 'FLAT',                     // Consistent energy throughout
  CRESCENDO: 'CRESCENDO',           // Energy rises throughout
  DECRESCENDO: 'DECRESCENDO',       // Energy falls throughout
  
  // Arc shapes
  ARC: 'ARC',                       // Builds to peak, then decays
  INVERTED_ARC: 'INVERTED_ARC',     // Starts high, dips, returns
  
  // Multi-phase shapes
  DOUBLE_ARC: 'DOUBLE_ARC',         // Two peaks (verse-chorus pattern)
  STEPPED_UP: 'STEPPED_UP',         // Plateaus at increasing levels
  STEPPED_DOWN: 'STEPPED_DOWN',     // Plateaus at decreasing levels
  
  // Special patterns
  BOOKEND: 'BOOKEND',               // Low intro/outro, high middle
  FRONT_LOADED: 'FRONT_LOADED',     // High energy early, fades
  BACK_LOADED: 'BACK_LOADED',       // Builds to end (anthem style)
  
  // Irregular
  FLUCTUATING: 'FLUCTUATING',       // High variance, no clear pattern
  UNKNOWN: 'UNKNOWN'
};

/**
 * Human-readable descriptions for each shape
 */
const SHAPE_DESCRIPTIONS = {
  FLAT: 'Consistent energy level throughout - typical of heavily mastered or electronic content',
  CRESCENDO: 'Energy builds progressively from start to end - creates forward momentum',
  DECRESCENDO: 'Energy decreases progressively - creates sense of resolution or fade',
  ARC: 'Energy builds to a central peak then resolves - classic narrative structure',
  INVERTED_ARC: 'Starts and ends with energy, quieter middle section',
  DOUBLE_ARC: 'Two distinct energy peaks - typical verse-chorus-verse-chorus structure',
  STEPPED_UP: 'Energy increases in distinct steps/plateaus - builds excitement incrementally',
  STEPPED_DOWN: 'Energy decreases in distinct steps - controlled energy release',
  BOOKEND: 'Quiet intro and outro with energetic middle - dramatic framing',
  FRONT_LOADED: 'Highest energy at the start - attention-grabbing opener',
  BACK_LOADED: 'Energy builds toward the end - anthem or climactic structure',
  FLUCTUATING: 'Highly variable energy with no clear overall shape',
  UNKNOWN: 'Unable to determine macro-dynamics shape'
};

/**
 * Window sizes for macro analysis (in seconds)
 */
const MACRO_WINDOW_SIZES = {
  SHORT: 8,       // 8 seconds - more detailed
  MEDIUM: 16,     // 16 seconds - balanced (recommended)
  LONG: 30        // 30 seconds - very high-level
};

/**
 * Default window size for macro analysis
 */
const DEFAULT_MACRO_WINDOW = MACRO_WINDOW_SIZES.MEDIUM;

/**
 * Classification thresholds (in dB/LUFS)
 */
const THRESHOLDS = {
  FLAT_RANGE: 3,          // Maximum range to be considered "flat"
  SLOPE_SIGNIFICANT: 0.3, // dB/window to be considered trending
  SECTION_DIFF: 2,        // dB difference between sections to be significant
  HIGH_VARIANCE: 5,       // StdDev threshold for "fluctuating"
  PLATEAU_VARIANCE: 1.5   // Max variance within a section for "stepped"
};

// ============================================================================
// FFmpeg Execution
// ============================================================================

function execCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, options);
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(command + ' exited with code ' + code + ': ' + stderr));
      }
    });
    
    proc.on('error', (err) => {
      reject(new Error('Failed to spawn ' + command + ': ' + err.message));
    });
  });
}

// ============================================================================
// Core Analysis Functions
// ============================================================================

/**
 * Get audio duration using FFmpeg
 */
async function getAudioDuration(filePath) {
  const args = ['-i', filePath, '-f', 'null', '-'];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    if (durationMatch) {
      return parseInt(durationMatch[1]) * 3600 + 
             parseInt(durationMatch[2]) * 60 + 
             parseFloat(durationMatch[3]);
    }
    return 0;
  } catch (error) {
    console.error('[MacroDynamicsClassifier] Duration detection failed:', error.message);
    return 0;
  }
}

/**
 * Get EBU R128 short-term loudness timeline
 * Short-term = 3 second sliding window, reported every 100ms
 */
async function getShortTermLoudnessTimeline(filePath) {
  const args = [
    '-i', filePath,
    '-af', 'ebur128=metadata=1',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    const readings = [];
    // Parse: t: 1.2 TARGET:-23 LUFS M: -18.2 S: -16.5 I: -20.1 LUFS LRA: 8.5 LU
    const regex = /t:\s*([\d.]+)\s+.*?M:\s*([-\d.]+)\s+S:\s*([-\d.]+)/g;
    
    let match;
    while ((match = regex.exec(stderr)) !== null) {
      const time = parseFloat(match[1]);
      const momentary = parseFloat(match[2]);
      const shortTerm = parseFloat(match[3]);
      
      // Filter out -inf values (silence)
      if (isFinite(shortTerm) && shortTerm > -70) {
        readings.push({
          time,
          momentary,
          shortTerm
        });
      }
    }
    
    return readings;
  } catch (error) {
    console.error('[MacroDynamicsClassifier] Loudness timeline failed:', error.message);
    return [];
  }
}

/**
 * Aggregate short-term readings into macro windows
 * @param {Array} readings - Short-term loudness readings
 * @param {number} windowSize - Macro window size in seconds
 * @param {number} duration - Total audio duration
 */
function aggregateToMacroWindows(readings, windowSize, duration) {
  if (!readings || readings.length === 0) {
    return [];
  }
  
  // Infer duration from readings if not provided
  const inferredDuration = duration || (readings.length > 0 
    ? Math.max(...readings.map(r => r.time || 0)) + 3 // Add 3s for last reading
    : 0);
  
  if (inferredDuration <= 0) {
    return [];
  }
  
  const macroWindows = [];
  let windowStart = 0;
  
  while (windowStart < inferredDuration) {
    const windowEnd = Math.min(windowStart + windowSize, inferredDuration);
    
    // Get all readings within this window
    // Support both { time, shortTerm } and { time, loudness } formats
    const windowReadings = readings.filter(
      r => r.time >= windowStart && r.time < windowEnd
    );
    
    if (windowReadings.length > 0) {
      const shortTermValues = windowReadings.map(r => r.shortTerm !== undefined ? r.shortTerm : r.loudness);
      const avg = shortTermValues.reduce((a, b) => a + b, 0) / shortTermValues.length;
      const min = Math.min(...shortTermValues);
      const max = Math.max(...shortTermValues);
      
      macroWindows.push({
        startTime: parseFloat(windowStart.toFixed(2)),
        endTime: parseFloat(windowEnd.toFixed(2)),
        avgLoudness: parseFloat(avg.toFixed(1)),
        minLoudness: parseFloat(min.toFixed(1)),
        maxLoudness: parseFloat(max.toFixed(1)),
        range: parseFloat((max - min).toFixed(1)),
        readingCount: windowReadings.length
      });
    }
    
    windowStart = windowEnd;
  }
  
  return macroWindows;
}

// ============================================================================
// Shape Classification Functions
// ============================================================================

/**
 * Calculate linear regression slope
 * @param {Array<number>} values - Array of loudness values
 * @returns {number} Slope in dB per index
 */
function calculateSlope(values) {
  if (!values || values.length < 2) return 0;
  
  const n = values.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  
  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return 0;
  
  return (n * sumXY - sumX * sumY) / denominator;
}

/**
 * Calculate standard deviation
 */
function calculateStdDev(values) {
  if (!values || values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Find peak locations (local maxima)
 * @param {Array<number>} values - Loudness values
 * @returns {Array<number>} Indices of peaks
 */
function findPeakLocations(values) {
  if (!values || values.length < 3) return [];
  
  const peaks = [];
  for (let i = 1; i < values.length - 1; i++) {
    if (values[i] > values[i - 1] && values[i] > values[i + 1]) {
      // Only count significant peaks (at least 1.5dB above neighbors)
      const minNeighbor = Math.min(values[i - 1], values[i + 1]);
      if (values[i] - minNeighbor >= 1.5) {
        peaks.push(i);
      }
    }
  }
  
  // Also check if first or last are global peaks
  const globalMax = Math.max(...values);
  if (values[0] === globalMax && values[0] > values[1] + 1.5) {
    peaks.unshift(0);
  }
  if (values[values.length - 1] === globalMax && values[values.length - 1] > values[values.length - 2] + 1.5) {
    peaks.push(values.length - 1);
  }
  
  return peaks;
}

/**
 * Classify the macro-dynamics shape based on window analysis
 * @param {Array} macroWindows - Aggregated macro windows (objects with avgLoudness) or raw number array
 * @returns {Object} Shape classification with confidence
 */
function classifyMacroShape(macroWindows) {
  if (!macroWindows || macroWindows.length < 3) {
    return { 
      shape: MacroDynamicsShape.UNKNOWN, 
      confidence: 0,
      reason: 'Insufficient data for shape analysis'
    };
  }
  
  // Support both raw number arrays and window objects
  const loudnessValues = typeof macroWindows[0] === 'number' 
    ? macroWindows 
    : macroWindows.map(w => w.avgLoudness);
  const n = loudnessValues.length;
  
  // Basic statistics
  const mean = loudnessValues.reduce((a, b) => a + b, 0) / n;
  const stdDev = calculateStdDev(loudnessValues);
  const range = Math.max(...loudnessValues) - Math.min(...loudnessValues);
  const slope = calculateSlope(loudnessValues);
  
  // Segment analysis (thirds)
  const thirdSize = Math.max(1, Math.floor(n / 3));
  const firstThird = loudnessValues.slice(0, thirdSize);
  const middleThird = loudnessValues.slice(thirdSize, thirdSize * 2);
  const lastThird = loudnessValues.slice(-thirdSize);
  
  const firstMean = firstThird.reduce((a, b) => a + b, 0) / firstThird.length;
  const middleMean = middleThird.reduce((a, b) => a + b, 0) / middleThird.length;
  const lastMean = lastThird.reduce((a, b) => a + b, 0) / lastThird.length;
  
  // Section variances for plateau detection
  const firstStdDev = calculateStdDev(firstThird);
  const middleStdDev = calculateStdDev(middleThird);
  const lastStdDev = calculateStdDev(lastThird);
  
  // Peak analysis
  const peaks = findPeakLocations(loudnessValues);
  const peakCount = peaks.length;
  
  // Find global max location
  const globalMaxIdx = loudnessValues.indexOf(Math.max(...loudnessValues));
  const peakPosition = globalMaxIdx / (n - 1); // 0 to 1
  
  // ========== Classification Logic ==========
  
  // FLAT: Very low range
  if (range < THRESHOLDS.FLAT_RANGE) {
    return {
      shape: MacroDynamicsShape.FLAT,
      confidence: 0.9,
      reason: 'Range of ' + range.toFixed(1) + ' dB indicates consistent energy'
    };
  }
  
  // CRESCENDO: Consistent upward slope, last section higher
  if (slope > THRESHOLDS.SLOPE_SIGNIFICANT && 
      lastMean > firstMean + THRESHOLDS.SECTION_DIFF &&
      lastMean > middleMean) {
    const conf = Math.min(0.9, 0.6 + (slope * 0.3));
    return {
      shape: MacroDynamicsShape.CRESCENDO,
      confidence: parseFloat(conf.toFixed(2)),
      reason: 'Upward slope of ' + slope.toFixed(2) + ' dB/window with final section ' + (lastMean - firstMean).toFixed(1) + ' dB higher'
    };
  }
  
  // DECRESCENDO: Consistent downward slope, first section higher
  if (slope < -THRESHOLDS.SLOPE_SIGNIFICANT && 
      firstMean > lastMean + THRESHOLDS.SECTION_DIFF &&
      firstMean > middleMean) {
    const conf = Math.min(0.9, 0.6 + (Math.abs(slope) * 0.3));
    return {
      shape: MacroDynamicsShape.DECRESCENDO,
      confidence: parseFloat(conf.toFixed(2)),
      reason: 'Downward slope of ' + slope.toFixed(2) + ' dB/window with initial section ' + (firstMean - lastMean).toFixed(1) + ' dB higher'
    };
  }
  
  // ARC: Middle higher than both ends
  if (middleMean > firstMean + THRESHOLDS.SECTION_DIFF && 
      middleMean > lastMean + THRESHOLDS.SECTION_DIFF &&
      peakPosition > 0.25 && peakPosition < 0.75) {
    return {
      shape: MacroDynamicsShape.ARC,
      confidence: 0.85,
      reason: 'Middle section ' + (middleMean - Math.min(firstMean, lastMean)).toFixed(1) + ' dB higher than edges, peak at ' + (peakPosition * 100).toFixed(0) + '%'
    };
  }
  
  // INVERTED_ARC: Middle lower than both ends
  if (middleMean < firstMean - THRESHOLDS.SECTION_DIFF && 
      middleMean < lastMean - THRESHOLDS.SECTION_DIFF) {
    return {
      shape: MacroDynamicsShape.INVERTED_ARC,
      confidence: 0.8,
      reason: 'Middle section ' + (Math.max(firstMean, lastMean) - middleMean).toFixed(1) + ' dB lower than edges'
    };
  }
  
  // DOUBLE_ARC: Two distinct peaks
  if (peakCount === 2) {
    // Check if peaks are reasonably separated
    const peakDist = Math.abs(peaks[1] - peaks[0]) / n;
    if (peakDist > 0.25) {
      return {
        shape: MacroDynamicsShape.DOUBLE_ARC,
        confidence: 0.75,
        reason: 'Two distinct energy peaks at ' + ((peaks[0] / n) * 100).toFixed(0) + '% and ' + ((peaks[1] / n) * 100).toFixed(0) + '%'
      };
    }
  }
  
  // BOOKEND: Low first/last, high middle
  if (firstMean < mean - THRESHOLDS.SECTION_DIFF && 
      lastMean < mean - THRESHOLDS.SECTION_DIFF && 
      middleMean > mean) {
    return {
      shape: MacroDynamicsShape.BOOKEND,
      confidence: 0.8,
      reason: 'Intro and outro ' + (mean - Math.min(firstMean, lastMean)).toFixed(1) + ' dB below average'
    };
  }
  
  // FRONT_LOADED: High first, lower later
  if (firstMean > middleMean + THRESHOLDS.SECTION_DIFF && 
      firstMean > lastMean + THRESHOLDS.SECTION_DIFF &&
      peakPosition < 0.35) {
    return {
      shape: MacroDynamicsShape.FRONT_LOADED,
      confidence: 0.75,
      reason: 'Opening section ' + (firstMean - lastMean).toFixed(1) + ' dB higher than ending'
    };
  }
  
  // BACK_LOADED: Low first, builds to end
  if (lastMean > firstMean + THRESHOLDS.SECTION_DIFF && 
      lastMean > middleMean &&
      peakPosition > 0.65) {
    return {
      shape: MacroDynamicsShape.BACK_LOADED,
      confidence: 0.75,
      reason: 'Final section ' + (lastMean - firstMean).toFixed(1) + ' dB higher than opening'
    };
  }
  
  // STEPPED patterns: Check for plateaus with distinct levels
  const allSectionsStable = firstStdDev < THRESHOLDS.PLATEAU_VARIANCE && 
                            middleStdDev < THRESHOLDS.PLATEAU_VARIANCE && 
                            lastStdDev < THRESHOLDS.PLATEAU_VARIANCE;
  
  if (allSectionsStable && range > THRESHOLDS.FLAT_RANGE) {
    // STEPPED_UP: Ascending plateaus
    if (firstMean < middleMean - 1 && middleMean < lastMean - 1) {
      return {
        shape: MacroDynamicsShape.STEPPED_UP,
        confidence: 0.7,
        reason: 'Three distinct plateaus ascending from ' + firstMean.toFixed(1) + ' to ' + lastMean.toFixed(1) + ' LUFS'
      };
    }
    // STEPPED_DOWN: Descending plateaus
    if (firstMean > middleMean + 1 && middleMean > lastMean + 1) {
      return {
        shape: MacroDynamicsShape.STEPPED_DOWN,
        confidence: 0.7,
        reason: 'Three distinct plateaus descending from ' + firstMean.toFixed(1) + ' to ' + lastMean.toFixed(1) + ' LUFS'
      };
    }
  }
  
  // FLUCTUATING: High variance without clear pattern
  if (stdDev > THRESHOLDS.HIGH_VARIANCE) {
    return {
      shape: MacroDynamicsShape.FLUCTUATING,
      confidence: 0.65,
      reason: 'High energy variance (+/-' + stdDev.toFixed(1) + ' dB) without clear directional trend'
    };
  }
  
  // Default to FLAT with lower confidence
  return {
    shape: MacroDynamicsShape.FLAT,
    confidence: 0.5,
    reason: 'No strong shape pattern detected (range: ' + range.toFixed(1) + ' dB, slope: ' + slope.toFixed(2) + ')'
  };
}

/**
 * Generate recommendation based on shape
 */
function generateRecommendation(shape, metrics) {
  const recommendations = {
    FLAT: 'Content maintains consistent energy. Safe for loudness normalization. Works well in shuffle playlists where transitions should be seamless.',
    CRESCENDO: 'Energy builds throughout. Consider for workout build-up sections or motivational content. Preserve the dynamic journey in processing.',
    DECRESCENDO: 'Energy winds down progressively. Natural for endings or cool-down content. Avoid aggressive normalization that flattens the decay.',
    ARC: 'Classic narrative structure with rising and falling action. Ideal for emotional storytelling playlists. Preserve the peak-to-end ratio.',
    INVERTED_ARC: 'Unique structure with energy bookends. May benefit from sectional normalization. Consider for attention-grabbing content.',
    DOUBLE_ARC: 'Two-peak structure suggests verse-chorus dynamics. Common in pop/rock. Consider for active listening playlists.',
    STEPPED_UP: 'Energy increases in stages. Great for progressive build-up contexts. Each plateau provides a stable energy reference.',
    STEPPED_DOWN: 'Energy decreases in stages. Natural for extended endings or meditation transitions.',
    BOOKEND: 'Quiet intro/outro frames energetic core. Preserve the framing for maximum impact. Good for featured or highlight placements.',
    FRONT_LOADED: 'High energy opening. Effective as playlist openers or attention-grabbers. Watch for listening fatigue.',
    BACK_LOADED: 'Anthem structure building to climax. Classic for live performance endings. Preserve the build for emotional payoff.',
    FLUCTUATING: 'Highly dynamic content. May need per-section analysis. Consider sectional loudness balancing.',
    UNKNOWN: 'Unable to determine optimal processing strategy. Manual review recommended.'
  };
  
  return recommendations[shape] || recommendations.UNKNOWN;
}

/**
 * Suggest playlist contexts based on shape
 */
function suggestContexts(shape) {
  const contexts = {
    FLAT: ['Background listening', 'Study/focus playlists', 'Ambient environments'],
    CRESCENDO: ['Workout build-up', 'Motivational content', 'Morning routines'],
    DECRESCENDO: ['Wind-down playlists', 'Sleep preparation', 'Cool-down periods'],
    ARC: ['Emotional storytelling', 'Cinematic playlists', 'Active listening sessions'],
    INVERTED_ARC: ['Transitional tracks', 'Attention reset content'],
    DOUBLE_ARC: ['Pop/rock playlists', 'Active listening', 'Party mixes'],
    STEPPED_UP: ['Progressive build playlists', 'Energy escalation sequences'],
    STEPPED_DOWN: ['Extended outros', 'Meditation transitions'],
    BOOKEND: ['Featured/highlight placements', 'Album openers/closers'],
    FRONT_LOADED: ['Playlist openers', 'Attention-grabbers', 'Intro tracks'],
    BACK_LOADED: ['Climactic moments', 'Workout finishers', 'Anthem placements'],
    FLUCTUATING: ['Active listening only', 'Manual curation required'],
    UNKNOWN: []
  };
  
  return contexts[shape] || [];
}

// ============================================================================
// Main Analysis Functions
// ============================================================================

/**
 * Full macro-dynamics analysis
 * @param {string} filePath - Path to audio file
 * @param {Object} options - Analysis options
 * @returns {Object} Complete analysis results
 */
async function analyzeMacroDynamics(filePath, options = {}) {
  const windowSize = options.windowSize || DEFAULT_MACRO_WINDOW;
  const includeWindows = options.includeWindows !== false;
  
  const startTime = Date.now();
  
  // Get duration and loudness timeline in parallel
  const [duration, readings] = await Promise.all([
    getAudioDuration(filePath),
    getShortTermLoudnessTimeline(filePath)
  ]);
  
  // Aggregate to macro windows
  const macroWindows = aggregateToMacroWindows(readings, windowSize, duration);
  
  // Classify shape
  const classification = classifyMacroShape(macroWindows);
  
  // Calculate metrics
  const loudnessValues = macroWindows.map(w => w.avgLoudness);
  const n = loudnessValues.length;
  
  let metrics = {
    overallMean: null,
    overallRange: null,
    overallStdDev: null,
    firstThirdMean: null,
    middleThirdMean: null,
    lastThirdMean: null,
    linearSlope: null,
    peakCount: 0,
    peakLocation: null,
    peakValue: null
  };
  
  if (n > 0) {
    const mean = loudnessValues.reduce((a, b) => a + b, 0) / n;
    const stdDev = calculateStdDev(loudnessValues);
    const range = Math.max(...loudnessValues) - Math.min(...loudnessValues);
    const slope = calculateSlope(loudnessValues);
    const peaks = findPeakLocations(loudnessValues);
    const globalMaxIdx = loudnessValues.indexOf(Math.max(...loudnessValues));
    
    const thirdSize = Math.max(1, Math.floor(n / 3));
    const firstThird = loudnessValues.slice(0, thirdSize);
    const middleThird = loudnessValues.slice(thirdSize, thirdSize * 2);
    const lastThird = loudnessValues.slice(-thirdSize);
    
    metrics = {
      overallMean: parseFloat(mean.toFixed(1)),
      overallRange: parseFloat(range.toFixed(1)),
      overallStdDev: parseFloat(stdDev.toFixed(2)),
      firstThirdMean: parseFloat((firstThird.reduce((a, b) => a + b, 0) / firstThird.length).toFixed(1)),
      middleThirdMean: parseFloat((middleThird.reduce((a, b) => a + b, 0) / middleThird.length).toFixed(1)),
      lastThirdMean: parseFloat((lastThird.reduce((a, b) => a + b, 0) / lastThird.length).toFixed(1)),
      linearSlope: parseFloat(slope.toFixed(3)),
      peakCount: peaks.length,
      peakLocation: parseFloat((globalMaxIdx / Math.max(1, n - 1)).toFixed(2)),
      peakValue: parseFloat(Math.max(...loudnessValues).toFixed(1))
    };
  }
  
  const processingTimeMs = Date.now() - startTime;
  
  const result = {
    duration: parseFloat(duration.toFixed(2)),
    windowSizeSeconds: windowSize,
    windowCount: macroWindows.length,
    
    // Classification
    shape: classification.shape,
    shapeDescription: SHAPE_DESCRIPTIONS[classification.shape],
    confidence: classification.confidence,
    classificationReason: classification.reason,
    
    // Metrics
    metrics,
    
    // Recommendations
    recommendation: generateRecommendation(classification.shape, metrics),
    suggestedContexts: suggestContexts(classification.shape),
    
    processingTimeMs
  };
  
  if (includeWindows) {
    result.macroWindows = macroWindows;
  }
  
  return result;
}

/**
 * Quick check for macro-dynamics shape
 * @param {string} filePath - Path to audio file
 * @returns {Object} Basic shape classification
 */
async function quickCheck(filePath) {
  const startTime = Date.now();
  
  const [duration, readings] = await Promise.all([
    getAudioDuration(filePath),
    getShortTermLoudnessTimeline(filePath)
  ]);
  
  // Use larger windows for faster processing
  const macroWindows = aggregateToMacroWindows(readings, MACRO_WINDOW_SIZES.LONG, duration);
  const classification = classifyMacroShape(macroWindows);
  
  const processingTimeMs = Date.now() - startTime;
  
  // Calculate basic metrics
  const loudnessValues = macroWindows.map(w => w.avgLoudness);
  let overallRange = null;
  let peakLocation = null;
  
  if (loudnessValues.length > 0) {
    overallRange = parseFloat((Math.max(...loudnessValues) - Math.min(...loudnessValues)).toFixed(1));
    const globalMaxIdx = loudnessValues.indexOf(Math.max(...loudnessValues));
    peakLocation = parseFloat((globalMaxIdx / Math.max(1, loudnessValues.length - 1)).toFixed(2));
  }
  
  return {
    shape: classification.shape,
    confidence: classification.confidence,
    overallRange,
    peakLocation,
    windowCount: macroWindows.length,
    processingTimeMs
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Main functions
  analyzeMacroDynamics,
  quickCheck,
  
  // Core functions
  getShortTermLoudnessTimeline,
  getAudioDuration,
  aggregateToMacroWindows,
  classifyMacroShape,
  
  // Utility functions
  calculateSlope,
  calculateStdDev,
  findPeakLocations,
  generateRecommendation,
  suggestContexts,
  
  // Constants
  MacroDynamicsShape,
  SHAPE_DESCRIPTIONS,
  MACRO_WINDOW_SIZES,
  DEFAULT_MACRO_WINDOW,
  THRESHOLDS
};
