/**
 * Temporal Density Mapper
 * 
 * Analyzes how audio energy changes over time to detect structural sections
 * like hooks, verses, choruses, drops, and transitions. This is critical for:
 * 
 * - Section-aware processing (different parameters for verse vs chorus)
 * - Hook detection for playlist placement optimization
 * - Drop/build-up detection for EDM content
 * - Intro/outro identification for seamless mixing
 * - Energy curve analysis for mastering decisions
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Analysis provides actionable
 * metrics for transformation parameter selection.
 */

const { spawn } = require('child_process');

// ============================================================================
// Configuration
// ============================================================================

const FFMPEG_PATH = 'ffmpeg';

/**
 * Default analysis window sizes (in seconds)
 */
const WINDOW_SIZES = {
  MICRO: 0.1,    // 100ms - for transient detection
  SHORT: 0.5,    // 500ms - for beat-level energy
  MEDIUM: 2.0,   // 2s - for phrase-level energy
  LONG: 8.0      // 8s - for section-level energy
};

/**
 * Section type classifications
 */
const SectionType = {
  INTRO: 'INTRO',
  VERSE: 'VERSE',
  PRE_CHORUS: 'PRE_CHORUS',
  CHORUS: 'CHORUS',
  HOOK: 'HOOK',
  DROP: 'DROP',
  BRIDGE: 'BRIDGE',
  BREAKDOWN: 'BREAKDOWN',
  BUILD_UP: 'BUILD_UP',
  OUTRO: 'OUTRO',
  TRANSITION: 'TRANSITION',
  UNKNOWN: 'UNKNOWN'
};

/**
 * Energy level classifications
 */
const EnergyLevel = {
  VERY_LOW: 'VERY_LOW',     // < 20th percentile
  LOW: 'LOW',               // 20-40th percentile
  MEDIUM: 'MEDIUM',         // 40-60th percentile
  HIGH: 'HIGH',             // 60-80th percentile
  VERY_HIGH: 'VERY_HIGH'    // > 80th percentile
};

/**
 * Trend classifications
 */
const EnergyTrend = {
  RISING: 'RISING',
  FALLING: 'FALLING',
  STABLE: 'STABLE',
  FLUCTUATING: 'FLUCTUATING'
};

/**
 * Energy thresholds for section detection
 */
const ENERGY_THRESHOLDS = {
  SILENCE: -60,      // Below this is silence
  VERY_LOW: -40,     // Very quiet section
  LOW: -24,          // Quiet section (verse-like)
  MEDIUM: -16,       // Average energy
  HIGH: -10,         // Loud section (chorus-like)
  VERY_HIGH: -6      // Peak energy (hook/drop)
};

// ============================================================================
// FFmpeg Execution
// ============================================================================

/**
 * Execute a command and return stdout/stderr
 */
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
        reject(new Error(`${command} exited with code ${code}: ${stderr}`));
      }
    });
    
    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ${command}: ${err.message}`));
    });
  });
}

// ============================================================================
// Core Analysis Functions
// ============================================================================

/**
 * Get RMS energy values over time using astats filter
 * @param {string} filePath - Path to audio file
 * @param {number} windowSize - Analysis window size in seconds
 * @returns {Promise<Object>} Energy timeline data
 */
async function getEnergyTimeline(filePath, windowSize = WINDOW_SIZES.MEDIUM) {
  // Use astats with reset to get energy over time windows
  const resetFrames = Math.floor(windowSize * 100); // Assuming 100 measurements per second
  
  const args = [
    '-i', filePath,
    '-af', `astats=metadata=1:reset=${resetFrames},ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-`,
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stdout, stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse RMS values from output
    const energyValues = [];
    const rmsMatches = stdout.matchAll(/lavfi\.astats\.Overall\.RMS_level=([-\d.]+)/g);
    
    for (const match of rmsMatches) {
      const value = parseFloat(match[1]);
      if (!isNaN(value) && isFinite(value)) {
        energyValues.push(value);
      }
    }
    
    // Also try stderr for metadata
    if (energyValues.length === 0) {
      const stderrMatches = stderr.matchAll(/RMS_level=([-\d.]+)/g);
      for (const match of stderrMatches) {
        const value = parseFloat(match[1]);
        if (!isNaN(value) && isFinite(value)) {
          energyValues.push(value);
        }
      }
    }
    
    return {
      windowSize,
      values: energyValues,
      count: energyValues.length
    };
  } catch (error) {
    console.error('[TemporalDensityMapper] Energy timeline extraction failed:', error.message);
    return {
      windowSize,
      values: [],
      count: 0,
      error: error.message
    };
  }
}

/**
 * Get comprehensive audio statistics using volumedetect and astats
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Audio statistics
 */
async function getAudioStats(filePath) {
  const args = [
    '-i', filePath,
    '-af', 'astats=metadata=1:measure_perchannel=none:measure_overall=all',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse overall stats
    const rmsMatch = stderr.match(/RMS level dB:\s*([-\d.]+)/);
    const peakMatch = stderr.match(/Peak level dB:\s*([-\d.]+)/);
    const dynamicMatch = stderr.match(/Dynamic range:\s*([-\d.]+)/);
    const flatMatch = stderr.match(/Flat factor:\s*([-\d.]+)/);
    const crestMatch = stderr.match(/Crest factor:\s*([-\d.]+)/);
    
    return {
      rmsLevel: rmsMatch ? parseFloat(rmsMatch[1]) : null,
      peakLevel: peakMatch ? parseFloat(peakMatch[1]) : null,
      dynamicRange: dynamicMatch ? parseFloat(dynamicMatch[1]) : null,
      flatFactor: flatMatch ? parseFloat(flatMatch[1]) : null,
      crestFactor: crestMatch ? parseFloat(crestMatch[1]) : null
    };
  } catch (error) {
    console.error('[TemporalDensityMapper] Audio stats extraction failed:', error.message);
    return {
      rmsLevel: null,
      peakLevel: null,
      dynamicRange: null,
      flatFactor: null,
      crestFactor: null,
      error: error.message
    };
  }
}

/**
 * Analyze energy using silencedetect to find quiet/loud sections
 * @param {string} filePath - Path to audio file
 * @param {number} threshold - Silence threshold in dB
 * @param {number} duration - Minimum duration for silence detection
 * @returns {Promise<Object>} Silence/energy section data
 */
async function detectEnergySections(filePath, threshold = -30, duration = 0.5) {
  const args = [
    '-i', filePath,
    '-af', `silencedetect=noise=${threshold}dB:d=${duration}`,
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse silence periods
    const silenceStarts = [];
    const silenceEnds = [];
    
    const startMatches = stderr.matchAll(/silence_start:\s*([\d.]+)/g);
    for (const match of startMatches) {
      silenceStarts.push(parseFloat(match[1]));
    }
    
    const endMatches = stderr.matchAll(/silence_end:\s*([\d.]+)/g);
    for (const match of endMatches) {
      silenceEnds.push(parseFloat(match[1]));
    }
    
    // Build silence periods
    const silencePeriods = [];
    for (let i = 0; i < silenceStarts.length; i++) {
      silencePeriods.push({
        start: silenceStarts[i],
        end: silenceEnds[i] || null,
        duration: silenceEnds[i] ? silenceEnds[i] - silenceStarts[i] : null
      });
    }
    
    return {
      threshold,
      silencePeriods,
      silenceCount: silencePeriods.length
    };
  } catch (error) {
    console.error('[TemporalDensityMapper] Silence detection failed:', error.message);
    return {
      threshold,
      silencePeriods: [],
      silenceCount: 0,
      error: error.message
    };
  }
}

/**
 * Get loudness over time using ebur128 filter
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Loudness timeline
 */
async function getLoudnessTimeline(filePath) {
  const args = [
    '-i', filePath,
    '-af', 'ebur128=metadata=1',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse momentary loudness over time
    const momentaryValues = [];
    const shortTermValues = [];
    const timepoints = [];
    
    // Match ebur128 output pattern
    const matches = stderr.matchAll(/t:\s*([\d.]+)\s+TARGET:.*?M:\s*([-\d.]+)\s+S:\s*([-\d.]+)/g);
    
    for (const match of matches) {
      const time = parseFloat(match[1]);
      const momentary = parseFloat(match[2]);
      const shortTerm = parseFloat(match[3]);
      
      if (!isNaN(time) && !isNaN(momentary)) {
        timepoints.push(time);
        momentaryValues.push(momentary);
        if (!isNaN(shortTerm)) {
          shortTermValues.push(shortTerm);
        }
      }
    }
    
    return {
      timepoints,
      momentary: momentaryValues,
      shortTerm: shortTermValues,
      sampleCount: momentaryValues.length
    };
  } catch (error) {
    console.error('[TemporalDensityMapper] Loudness timeline extraction failed:', error.message);
    return {
      timepoints: [],
      momentary: [],
      shortTerm: [],
      sampleCount: 0,
      error: error.message
    };
  }
}

// ============================================================================
// Energy Analysis Functions
// ============================================================================

/**
 * Calculate energy percentiles from values
 * @param {number[]} values - Array of energy values
 * @returns {Object} Percentile values
 */
function calculatePercentiles(values) {
  if (!values || values.length === 0) {
    return { p20: null, p40: null, p50: null, p60: null, p80: null };
  }
  
  const sorted = [...values].filter(v => v > -100).sort((a, b) => a - b);
  
  if (sorted.length === 0) {
    return { p20: null, p40: null, p50: null, p60: null, p80: null };
  }
  
  const getPercentile = (arr, p) => {
    const index = Math.floor(arr.length * p);
    return arr[Math.min(index, arr.length - 1)];
  };
  
  return {
    p20: getPercentile(sorted, 0.2),
    p40: getPercentile(sorted, 0.4),
    p50: getPercentile(sorted, 0.5),
    p60: getPercentile(sorted, 0.6),
    p80: getPercentile(sorted, 0.8)
  };
}

/**
 * Classify energy level based on percentiles
 * @param {number} value - Energy value
 * @param {Object} percentiles - Percentile thresholds
 * @returns {string} EnergyLevel value
 */
function classifyEnergyLevel(value, percentiles) {
  if (value === null || !isFinite(value)) {
    return EnergyLevel.MEDIUM;
  }
  
  if (percentiles.p20 === null) {
    return EnergyLevel.MEDIUM;
  }
  
  if (value < percentiles.p20) {
    return EnergyLevel.VERY_LOW;
  } else if (value < percentiles.p40) {
    return EnergyLevel.LOW;
  } else if (value < percentiles.p60) {
    return EnergyLevel.MEDIUM;
  } else if (value < percentiles.p80) {
    return EnergyLevel.HIGH;
  } else {
    return EnergyLevel.VERY_HIGH;
  }
}

/**
 * Detect energy trend in a segment
 * @param {number[]} values - Array of energy values
 * @returns {string} EnergyTrend value
 */
function detectTrend(values) {
  if (!values || values.length < 3) {
    return EnergyTrend.STABLE;
  }
  
  const valid = values.filter(v => v !== null && isFinite(v) && v > -100);
  if (valid.length < 3) {
    return EnergyTrend.STABLE;
  }
  
  // Calculate linear regression slope
  const n = valid.length;
  const xMean = (n - 1) / 2;
  const yMean = valid.reduce((a, b) => a + b, 0) / n;
  
  let numerator = 0;
  let denominator = 0;
  
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (valid[i] - yMean);
    denominator += (i - xMean) * (i - xMean);
  }
  
  const slope = denominator !== 0 ? numerator / denominator : 0;
  
  // Calculate variance to detect fluctuation
  const variance = valid.reduce((sum, v) => sum + Math.pow(v - yMean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  
  // Threshold for trend detection (dB per sample)
  const trendThreshold = 0.5;
  const fluctuationThreshold = 6; // High standard deviation indicates fluctuation
  
  if (stdDev > fluctuationThreshold && Math.abs(slope) < trendThreshold) {
    return EnergyTrend.FLUCTUATING;
  } else if (slope > trendThreshold) {
    return EnergyTrend.RISING;
  } else if (slope < -trendThreshold) {
    return EnergyTrend.FALLING;
  } else {
    return EnergyTrend.STABLE;
  }
}

/**
 * Segment energy values into coherent sections
 * @param {number[]} values - Array of energy values
 * @param {number} windowSize - Window size in seconds
 * @param {Object} percentiles - Percentile thresholds
 * @returns {Array<Object>} Array of sections
 */
function segmentByEnergy(values, windowSize, percentiles) {
  if (!values || values.length === 0) {
    return [];
  }
  
  const sections = [];
  let currentSection = null;
  
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    const level = classifyEnergyLevel(value, percentiles);
    const timeStart = i * windowSize;
    
    if (!currentSection || currentSection.level !== level) {
      // Close previous section
      if (currentSection) {
        currentSection.endTime = timeStart;
        currentSection.duration = currentSection.endTime - currentSection.startTime;
        currentSection.trend = detectTrend(currentSection.values);
        sections.push(currentSection);
      }
      
      // Start new section
      currentSection = {
        startTime: timeStart,
        endTime: null,
        level,
        values: [value],
        avgEnergy: value,
        peakEnergy: value,
        minEnergy: value
      };
    } else {
      // Continue current section
      currentSection.values.push(value);
      currentSection.avgEnergy = currentSection.values.reduce((a, b) => a + b, 0) / currentSection.values.length;
      currentSection.peakEnergy = Math.max(currentSection.peakEnergy, value);
      currentSection.minEnergy = Math.min(currentSection.minEnergy, value);
    }
  }
  
  // Close final section
  if (currentSection) {
    currentSection.endTime = values.length * windowSize;
    currentSection.duration = currentSection.endTime - currentSection.startTime;
    currentSection.trend = detectTrend(currentSection.values);
    // Remove raw values to reduce payload size
    delete currentSection.values;
    sections.push(currentSection);
  }
  
  return sections;
}

/**
 * Merge very short sections into neighbors
 * @param {Array<Object>} sections - Array of sections
 * @param {number} minDuration - Minimum section duration
 * @returns {Array<Object>} Merged sections
 */
function mergeSections(sections, minDuration = 2.0) {
  if (!sections || sections.length < 2) {
    return sections;
  }
  
  const merged = [];
  let current = { ...sections[0] };
  
  for (let i = 1; i < sections.length; i++) {
    const next = sections[i];
    
    if (current.duration < minDuration) {
      // Merge with next section
      current.endTime = next.endTime;
      current.duration = current.endTime - current.startTime;
      current.avgEnergy = (current.avgEnergy + next.avgEnergy) / 2;
      current.peakEnergy = Math.max(current.peakEnergy, next.peakEnergy);
      current.minEnergy = Math.min(current.minEnergy, next.minEnergy);
      current.level = classifyEnergyByValue((current.avgEnergy + next.avgEnergy) / 2);
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  
  merged.push(current);
  return merged;
}

/**
 * Classify energy by absolute value
 * @param {number} value - Energy value in dB
 * @returns {string} EnergyLevel value
 */
function classifyEnergyByValue(value) {
  if (value < ENERGY_THRESHOLDS.SILENCE) {
    return EnergyLevel.VERY_LOW;
  } else if (value < ENERGY_THRESHOLDS.LOW) {
    return EnergyLevel.LOW;
  } else if (value < ENERGY_THRESHOLDS.MEDIUM) {
    return EnergyLevel.MEDIUM;
  } else if (value < ENERGY_THRESHOLDS.HIGH) {
    return EnergyLevel.HIGH;
  } else {
    return EnergyLevel.VERY_HIGH;
  }
}

// ============================================================================
// Section Classification Functions
// ============================================================================

/**
 * Classify sections by structural role (intro, verse, chorus, etc.)
 * @param {Array<Object>} sections - Array of energy sections
 * @param {number} totalDuration - Total audio duration
 * @returns {Array<Object>} Sections with type classification
 */
function classifySections(sections, totalDuration) {
  if (!sections || sections.length === 0) {
    return [];
  }
  
  // Calculate global stats for relative comparisons
  const avgEnergies = sections.map(s => s.avgEnergy).filter(e => e !== null && isFinite(e));
  const globalAvg = avgEnergies.length > 0 
    ? avgEnergies.reduce((a, b) => a + b, 0) / avgEnergies.length 
    : -20;
  
  const classified = sections.map((section, index) => {
    const isFirst = index === 0;
    const isLast = index === sections.length - 1;
    const relativePosition = section.startTime / totalDuration;
    const relativeEnergy = section.avgEnergy - globalAvg;
    
    let type = SectionType.UNKNOWN;
    let confidence = 0.5;
    
    // Intro detection: first section, usually lower energy or building
    if (isFirst && section.duration > 2) {
      if (section.level === EnergyLevel.LOW || section.level === EnergyLevel.VERY_LOW) {
        type = SectionType.INTRO;
        confidence = 0.8;
      } else if (section.trend === EnergyTrend.RISING) {
        type = SectionType.INTRO;
        confidence = 0.7;
      }
    }
    
    // Outro detection: last section, usually lower energy or falling
    else if (isLast && section.duration > 2) {
      if (section.level === EnergyLevel.LOW || section.level === EnergyLevel.VERY_LOW) {
        type = SectionType.OUTRO;
        confidence = 0.8;
      } else if (section.trend === EnergyTrend.FALLING) {
        type = SectionType.OUTRO;
        confidence = 0.7;
      }
    }
    
    // Build-up detection: rising trend before high energy section
    else if (section.trend === EnergyTrend.RISING && index < sections.length - 1) {
      const nextSection = sections[index + 1];
      if (nextSection.level === EnergyLevel.HIGH || nextSection.level === EnergyLevel.VERY_HIGH) {
        type = SectionType.BUILD_UP;
        confidence = 0.75;
      }
    }
    
    // Drop/Hook detection: very high energy, especially after build-up
    else if (section.level === EnergyLevel.VERY_HIGH) {
      const prevSection = index > 0 ? sections[index - 1] : null;
      if (prevSection && prevSection.trend === EnergyTrend.RISING) {
        type = SectionType.DROP;
        confidence = 0.8;
      } else {
        type = SectionType.HOOK;
        confidence = 0.7;
      }
    }
    
    // Chorus detection: high energy, stable
    else if (section.level === EnergyLevel.HIGH && section.trend === EnergyTrend.STABLE) {
      type = SectionType.CHORUS;
      confidence = 0.7;
    }
    
    // Breakdown detection: low energy after high energy
    else if ((section.level === EnergyLevel.LOW || section.level === EnergyLevel.VERY_LOW) && index > 0) {
      const prevSection = sections[index - 1];
      if (prevSection.level === EnergyLevel.HIGH || prevSection.level === EnergyLevel.VERY_HIGH) {
        type = SectionType.BREAKDOWN;
        confidence = 0.75;
      }
    }
    
    // Verse detection: medium or low energy, stable
    else if ((section.level === EnergyLevel.MEDIUM || section.level === EnergyLevel.LOW) && 
             section.trend === EnergyTrend.STABLE) {
      type = SectionType.VERSE;
      confidence = 0.6;
    }
    
    // Bridge detection: different energy in later part of asset
    else if (relativePosition > 0.5 && section.trend === EnergyTrend.FLUCTUATING) {
      type = SectionType.BRIDGE;
      confidence = 0.5;
    }
    
    // Transition detection: very short duration between different levels
    else if (section.duration < 4) {
      type = SectionType.TRANSITION;
      confidence = 0.6;
    }
    
    return {
      ...section,
      type,
      confidence,
      relativeEnergy
    };
  });
  
  return classified;
}

/**
 * Find the hook section (highest energy, most "impactful" moment)
 * @param {Array<Object>} sections - Classified sections
 * @returns {Object|null} Hook section or null
 */
function findHook(sections) {
  if (!sections || sections.length === 0) {
    return null;
  }
  
  // Look for explicit hook/drop sections first
  const hooks = sections.filter(s => s.type === SectionType.HOOK || s.type === SectionType.DROP);
  if (hooks.length > 0) {
    // Return the one with highest energy
    return hooks.reduce((best, current) => 
      current.peakEnergy > best.peakEnergy ? current : best
    );
  }
  
  // Fall back to chorus sections
  const choruses = sections.filter(s => s.type === SectionType.CHORUS);
  if (choruses.length > 0) {
    return choruses.reduce((best, current) => 
      current.peakEnergy > best.peakEnergy ? current : best
    );
  }
  
  // Fall back to highest energy section
  const validSections = sections.filter(s => 
    s.type !== SectionType.INTRO && 
    s.type !== SectionType.OUTRO &&
    s.avgEnergy !== null
  );
  
  if (validSections.length > 0) {
    return validSections.reduce((best, current) => 
      current.avgEnergy > best.avgEnergy ? current : best
    );
  }
  
  return null;
}

/**
 * Calculate energy curve statistics
 * @param {number[]} values - Energy values over time
 * @returns {Object} Energy curve statistics
 */
function calculateEnergyCurve(values) {
  if (!values || values.length === 0) {
    return {
      mean: null,
      stdDev: null,
      range: null,
      dynamicContrast: null
    };
  }
  
  const valid = values.filter(v => v !== null && isFinite(v) && v > -100);
  if (valid.length === 0) {
    return {
      mean: null,
      stdDev: null,
      range: null,
      dynamicContrast: null
    };
  }
  
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const variance = valid.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / valid.length;
  const stdDev = Math.sqrt(variance);
  const max = Math.max(...valid);
  const min = Math.min(...valid);
  const range = max - min;
  
  // Dynamic contrast: ratio of high to low energy sections
  const dynamicContrast = range > 0 ? stdDev / range : 0;
  
  return {
    mean,
    stdDev,
    range,
    max,
    min,
    dynamicContrast
  };
}

/**
 * Assess overall energy profile
 * @param {Object} curve - Energy curve statistics
 * @returns {Object} Energy profile assessment
 */
function assessEnergyProfile(curve) {
  if (!curve || curve.mean === null) {
    return {
      profile: 'UNKNOWN',
      description: 'Unable to assess energy profile'
    };
  }
  
  let profile;
  let description;
  
  if (curve.range < 6) {
    profile = 'FLAT';
    description = 'Very consistent energy throughout - typical of heavily processed or electronic content';
  } else if (curve.range < 12) {
    profile = 'MODERATE';
    description = 'Moderate energy variation - typical of pop or rock content';
  } else if (curve.range < 20) {
    profile = 'DYNAMIC';
    description = 'Dynamic energy variation - typical of orchestral or acoustic content';
  } else {
    profile = 'HIGHLY_DYNAMIC';
    description = 'Extreme energy variation - may benefit from section-specific processing';
  }
  
  return {
    profile,
    description,
    recommendation: getProfileRecommendation(profile)
  };
}

/**
 * Get processing recommendation based on energy profile
 * @param {string} profile - Energy profile type
 * @returns {string} Processing recommendation
 */
function getProfileRecommendation(profile) {
  const recommendations = {
    FLAT: 'Asset has consistent energy. Standard normalization should work well.',
    MODERATE: 'Asset has natural dynamics. Use gentle compression if needed.',
    DYNAMIC: 'Asset has significant dynamics. Consider multi-band processing to preserve character.',
    HIGHLY_DYNAMIC: 'Asset has extreme dynamics. Consider section-specific gain staging before normalization.',
    UNKNOWN: 'Unable to determine recommendation without energy data.'
  };
  
  return recommendations[profile] || recommendations.UNKNOWN;
}

// ============================================================================
// Main Analysis Functions
// ============================================================================

/**
 * Perform comprehensive temporal density analysis
 * @param {string} filePath - Path to audio file
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Complete temporal density analysis
 */
async function analyzeTemporalDensity(filePath, options = {}) {
  const startTime = Date.now();
  const { 
    windowSize = WINDOW_SIZES.MEDIUM,
    minSectionDuration = 2.0
  } = options;
  
  // Get duration first
  const durationResult = await getDuration(filePath);
  const duration = durationResult.duration || 0;
  
  // Run analyses in parallel
  const [energyData, loudnessData, silenceData, statsData] = await Promise.all([
    getEnergyTimeline(filePath, windowSize),
    getLoudnessTimeline(filePath),
    detectEnergySections(filePath),
    getAudioStats(filePath)
  ]);
  
  // Calculate percentiles for relative classification
  const percentiles = calculatePercentiles(energyData.values);
  
  // Segment into sections
  let sections = segmentByEnergy(energyData.values, windowSize, percentiles);
  sections = mergeSections(sections, minSectionDuration);
  sections = classifySections(sections, duration);
  
  // Find the hook
  const hook = findHook(sections);
  
  // Calculate energy curve
  const energyCurve = calculateEnergyCurve(energyData.values);
  const energyProfile = assessEnergyProfile(energyCurve);
  
  // Overall trend
  const overallTrend = detectTrend(energyData.values);
  
  return {
    filePath,
    duration,
    
    // Sections
    sections,
    sectionCount: sections.length,
    
    // Hook detection
    hook: hook ? {
      startTime: hook.startTime,
      endTime: hook.endTime,
      duration: hook.duration,
      type: hook.type,
      energy: hook.avgEnergy,
      confidence: hook.confidence
    } : null,
    
    // Energy statistics
    energyCurve,
    energyProfile,
    
    // Percentiles for reference
    percentiles,
    
    // Overall characteristics
    overallTrend,
    silencePeriods: silenceData.silencePeriods,
    
    // Loudness timeline (sampled)
    loudnessTimeline: loudnessData.momentary.length > 50 
      ? sampleArray(loudnessData.momentary, 50) 
      : loudnessData.momentary,
    
    // Global stats
    globalStats: statsData,
    
    // Analysis metadata
    windowSize,
    analysisTimeMs: Date.now() - startTime
  };
}

/**
 * Quick section detection (faster, less detail)
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Quick section analysis
 */
async function quickSectionDetection(filePath) {
  const startTime = Date.now();
  
  // Use silence detection as a proxy for section boundaries
  const silenceData = await detectEnergySections(filePath, -35, 0.3);
  const statsData = await getAudioStats(filePath);
  
  // Build sections from silence gaps
  const sections = [];
  let lastEnd = 0;
  
  for (const silence of silenceData.silencePeriods) {
    if (silence.start > lastEnd) {
      sections.push({
        startTime: lastEnd,
        endTime: silence.start,
        duration: silence.start - lastEnd,
        type: SectionType.UNKNOWN,
        hasSilenceAfter: true
      });
    }
    lastEnd = silence.end || silence.start + 0.5;
  }
  
  // Add final section if needed
  if (sections.length === 0 || lastEnd < (statsData.duration || 0)) {
    sections.push({
      startTime: lastEnd,
      endTime: null,
      duration: null,
      type: SectionType.UNKNOWN,
      hasSilenceAfter: false
    });
  }
  
  return {
    sections,
    sectionCount: sections.length,
    silenceCount: silenceData.silenceCount,
    globalStats: statsData,
    analysisTimeMs: Date.now() - startTime
  };
}

/**
 * Get audio duration
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} Duration info
 */
async function getDuration(filePath) {
  const args = [
    '-i', filePath,
    '-show_entries', 'format=duration',
    '-v', 'quiet',
    '-of', 'csv=p=0'
  ];
  
  try {
    const { stdout } = await execCommand('ffprobe', args);
    const duration = parseFloat(stdout.trim());
    return { duration: isNaN(duration) ? null : duration };
  } catch (error) {
    return { duration: null, error: error.message };
  }
}

/**
 * Sample array to reduce size
 * @param {number[]} arr - Array to sample
 * @param {number} targetSize - Target number of samples
 * @returns {number[]} Sampled array
 */
function sampleArray(arr, targetSize) {
  if (arr.length <= targetSize) return arr;
  
  const step = arr.length / targetSize;
  const sampled = [];
  
  for (let i = 0; i < targetSize; i++) {
    sampled.push(arr[Math.floor(i * step)]);
  }
  
  return sampled;
}

/**
 * Get section type description
 * @param {string} type - SectionType value
 * @returns {string} Human-readable description
 */
function getSectionDescription(type) {
  const descriptions = {
    [SectionType.INTRO]: 'Introduction - typically lower energy, may build',
    [SectionType.VERSE]: 'Verse - moderate energy, storytelling section',
    [SectionType.PRE_CHORUS]: 'Pre-Chorus - building energy toward chorus',
    [SectionType.CHORUS]: 'Chorus - high energy, memorable section',
    [SectionType.HOOK]: 'Hook - peak energy moment, most impactful',
    [SectionType.DROP]: 'Drop - sudden high energy after build-up',
    [SectionType.BRIDGE]: 'Bridge - contrasting section, often after second chorus',
    [SectionType.BREAKDOWN]: 'Breakdown - low energy after peak',
    [SectionType.BUILD_UP]: 'Build-Up - rising energy toward drop/chorus',
    [SectionType.OUTRO]: 'Outro - ending section, typically fading',
    [SectionType.TRANSITION]: 'Transition - brief connecting passage',
    [SectionType.UNKNOWN]: 'Unknown section type'
  };
  
  return descriptions[type] || descriptions[SectionType.UNKNOWN];
}

/**
 * Check if a timestamp is in a hook section
 * @param {number} timestamp - Time in seconds
 * @param {Object} hook - Hook section data
 * @returns {boolean} Whether timestamp is in hook
 */
function isInHook(timestamp, hook) {
  if (!hook || hook.startTime === null) {
    return false;
  }
  
  return timestamp >= hook.startTime && timestamp <= (hook.endTime || hook.startTime);
}

/**
 * Get the section at a specific timestamp
 * @param {number} timestamp - Time in seconds
 * @param {Array<Object>} sections - Array of sections
 * @returns {Object|null} Section at timestamp or null
 */
function getSectionAtTime(timestamp, sections) {
  if (!sections || sections.length === 0) {
    return null;
  }
  
  return sections.find(s => 
    timestamp >= s.startTime && 
    (s.endTime === null || timestamp <= s.endTime)
  ) || null;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Main functions
  analyzeTemporalDensity,
  quickSectionDetection,
  
  // Core analysis
  getEnergyTimeline,
  getLoudnessTimeline,
  detectEnergySections,
  getAudioStats,
  
  // Section analysis
  segmentByEnergy,
  classifySections,
  findHook,
  mergeSections,
  
  // Energy analysis
  calculatePercentiles,
  classifyEnergyLevel,
  classifyEnergyByValue,
  detectTrend,
  calculateEnergyCurve,
  assessEnergyProfile,
  
  // Utilities
  getSectionDescription,
  isInHook,
  getSectionAtTime,
  getDuration,
  
  // Constants
  SectionType,
  EnergyLevel,
  EnergyTrend,
  WINDOW_SIZES,
  ENERGY_THRESHOLDS
};
