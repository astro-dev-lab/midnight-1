/**
 * Gain Reduction Distribution Mapper
 * 
 * Maps where and how often compression/limiting occurs throughout
 * an audio file by analyzing dynamics metrics in windowed segments.
 * 
 * Per STUDIOOS_FUNCTIONAL_SPECS.md - Analysis provides actionable
 * metrics for transformation parameter selection.
 * 
 * Metrics tracked per segment:
 * - Crest factor (peak-to-RMS ratio)
 * - Flat factor (waveform flatness from limiting)
 * - RMS level consistency
 * - Compression intensity classification
 * 
 * Use cases:
 * - Visualizing where compression is applied in a mix
 * - Detecting uneven mastering (verse vs chorus)
 * - Identifying over-processed sections
 * - Understanding mastering decisions
 */

const { spawn } = require('child_process');

// ============================================================================
// Configuration
// ============================================================================

const FFMPEG_PATH = 'ffmpeg';

/**
 * Window sizes for analysis granularity
 */
const WINDOW_SIZES = {
  MICRO: 0.1,     // 100ms - transient-level
  BEAT: 0.4,      // 400ms - beat-level (ebur128 momentary)
  PHRASE: 2.0,    // 2s - phrase-level
  SECTION: 8.0    // 8s - section-level
};

/**
 * Default window size in seconds
 */
const DEFAULT_WINDOW_SIZE = WINDOW_SIZES.BEAT;

/**
 * Compression intensity classifications based on crest factor
 */
const CompressionIntensity = {
  EXTREME: 'EXTREME',           // Crest < 4 dB
  HEAVY: 'HEAVY',               // 4-6 dB
  MODERATE: 'MODERATE',         // 6-10 dB
  LIGHT: 'LIGHT',               // 10-14 dB
  MINIMAL: 'MINIMAL',           // 14-18 dB
  NONE: 'NONE'                  // > 18 dB
};

/**
 * Crest factor thresholds for classification (in dB)
 */
const CREST_THRESHOLDS = {
  EXTREME: 4,
  HEAVY: 6,
  MODERATE: 10,
  LIGHT: 14,
  MINIMAL: 18
  // Above 18 = NONE
};

/**
 * Distribution pattern classifications
 */
const DistributionPattern = {
  UNIFORM: 'UNIFORM',
  VERSE_CHORUS_VARIANCE: 'VERSE_CHORUS_VARIANCE',
  ESCALATING: 'ESCALATING',
  DE_ESCALATING: 'DE_ESCALATING',
  DYNAMIC: 'DYNAMIC',
  SPARSE: 'SPARSE'
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
        reject(new Error(`${command} exited with code ${code}: ${stderr}`));
      }
    });
    
    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ${command}: ${err.message}`));
    });
  });
}

// ============================================================================
// Windowed Analysis
// ============================================================================

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
    console.error('[GainReductionMapper] Duration detection failed:', error.message);
    return 0;
  }
}

async function getWindowedMetrics(filePath, windowSize = DEFAULT_WINDOW_SIZE) {
  const resetFrames = Math.floor(windowSize * 10);
  
  const args = [
    '-i', filePath,
    '-af', `astats=metadata=1:measure_overall=all:reset=${resetFrames}`,
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    const segments = [];
    const blocks = stderr.split(/\[Parsed_astats_\d+ @ [^\]]+\] Overall/);
    
    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      
      const peakMatch = block.match(/Peak level dB:\s*([-\d.]+)/i);
      const rmsMatch = block.match(/RMS level dB:\s*([-\d.]+)/i);
      const crestMatch = block.match(/Crest factor:\s*([\d.]+)/i);
      const flatMatch = block.match(/Flat factor:\s*([\d.]+)/i);
      
      if (peakMatch || rmsMatch) {
        const peakDb = peakMatch ? parseFloat(peakMatch[1]) : null;
        const rmsDb = rmsMatch ? parseFloat(rmsMatch[1]) : null;
        
        let crestFactorDb = null;
        if (crestMatch) {
          const linearCrest = parseFloat(crestMatch[1]);
          crestFactorDb = linearCrest > 0 ? 20 * Math.log10(linearCrest) : null;
        } else if (peakDb !== null && rmsDb !== null) {
          crestFactorDb = peakDb - rmsDb;
        }
        
        const startTime = (i - 1) * windowSize;
        
        segments.push({
          index: i - 1,
          startTime: parseFloat(startTime.toFixed(2)),
          endTime: parseFloat((startTime + windowSize).toFixed(2)),
          peakDb,
          rmsDb,
          crestFactorDb,
          flatFactor: flatMatch ? parseFloat(flatMatch[1]) : null
        });
      }
    }
    
    return segments;
  } catch (error) {
    console.error('[GainReductionMapper] Windowed analysis failed:', error.message);
    return [];
  }
}

async function getMomentaryLoudnessTimeline(filePath) {
  const args = ['-i', filePath, '-af', 'ebur128=metadata=1', '-f', 'null', '-'];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    const readings = [];
    const regex = /t:\s*([\d.]+)\s+M:\s*([-\d.]+)\s+S:\s*([-\d.]+)/g;
    
    let match;
    while ((match = regex.exec(stderr)) !== null) {
      readings.push({
        time: parseFloat(match[1]),
        momentary: parseFloat(match[2]),
        shortTerm: parseFloat(match[3]),
        msDelta: Math.abs(parseFloat(match[2]) - parseFloat(match[3]))
      });
    }
    
    return readings;
  } catch (error) {
    console.error('[GainReductionMapper] Momentary loudness analysis failed:', error.message);
    return [];
  }
}

// ============================================================================
// Classification Functions
// ============================================================================

function classifyCompression(crestFactorDb) {
  if (crestFactorDb === null || isNaN(crestFactorDb)) {
    return 'UNKNOWN';
  }
  if (crestFactorDb < CREST_THRESHOLDS.EXTREME) {
    return CompressionIntensity.EXTREME;
  }
  if (crestFactorDb < CREST_THRESHOLDS.HEAVY) {
    return CompressionIntensity.HEAVY;
  }
  if (crestFactorDb < CREST_THRESHOLDS.MODERATE) {
    return CompressionIntensity.MODERATE;
  }
  if (crestFactorDb < CREST_THRESHOLDS.LIGHT) {
    return CompressionIntensity.LIGHT;
  }
  if (crestFactorDb < CREST_THRESHOLDS.MINIMAL) {
    return CompressionIntensity.MINIMAL;
  }
  return CompressionIntensity.NONE;
}

function calculateCompressionScore(crestFactorDb) {
  if (crestFactorDb === null || isNaN(crestFactorDb)) return 0;
  const score = Math.max(0, Math.min(100, (20 - crestFactorDb) * 5));
  return parseFloat(score.toFixed(1));
}

function identifyPattern(segments) {
  if (!segments || segments.length === 0) {
    return { pattern: 'UNKNOWN', description: 'Insufficient data for pattern analysis' };
  }
  
  const scores = segments
    .map(s => calculateCompressionScore(s.crestFactorDb))
    .filter(s => !isNaN(s));
  
  if (scores.length < 3) {
    return { pattern: 'UNKNOWN', description: 'Insufficient segments for pattern analysis' };
  }
  
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);
  const range = Math.max(...scores) - Math.min(...scores);
  
  const firstThird = scores.slice(0, Math.floor(scores.length / 3));
  const lastThird = scores.slice(-Math.floor(scores.length / 3));
  const firstThirdMean = firstThird.length > 0 ? firstThird.reduce((a, b) => a + b, 0) / firstThird.length : 0;
  const lastThirdMean = lastThird.length > 0 ? lastThird.reduce((a, b) => a + b, 0) / lastThird.length : 0;
  const escalationDelta = lastThirdMean - firstThirdMean;
  
  const midpoint = Math.floor(scores.length / 2);
  const firstHalf = scores.slice(0, midpoint);
  const secondHalf = scores.slice(midpoint);
  const firstHalfMean = firstHalf.length > 0 ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length : 0;
  const secondHalfMean = secondHalf.length > 0 ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length : 0;
  
  if (mean < 20 && stdDev < 5) {
    return { pattern: DistributionPattern.SPARSE, description: 'Very little compression detected throughout the asset' };
  }
  
  if (stdDev < 8) {
    return { pattern: DistributionPattern.UNIFORM, description: 'Consistent compression applied throughout the asset' };
  }
  
  if (escalationDelta > 15) {
    return { pattern: DistributionPattern.ESCALATING, description: 'Compression intensity increases toward the end of the asset' };
  }
  
  if (escalationDelta < -15) {
    return { pattern: DistributionPattern.DE_ESCALATING, description: 'Compression intensity decreases toward the end of the asset' };
  }
  
  if (Math.abs(firstHalfMean - secondHalfMean) > 10 || range > 40) {
    return { pattern: DistributionPattern.VERSE_CHORUS_VARIANCE, description: 'Compression varies between sections (e.g., verse vs. chorus)' };
  }
  
  if (stdDev > 15) {
    return { pattern: DistributionPattern.DYNAMIC, description: 'Highly variable compression throughout the asset' };
  }
  
  return { pattern: DistributionPattern.UNIFORM, description: 'Relatively consistent compression with minor variations' };
}

function calculateDistribution(segments) {
  if (!segments || segments.length === 0) {
    return { extreme: 0, heavy: 0, moderate: 0, light: 0, minimal: 0, none: 0 };
  }
  
  const counts = { extreme: 0, heavy: 0, moderate: 0, light: 0, minimal: 0, none: 0, unknown: 0 };
  
  segments.forEach(seg => {
    const intensity = classifyCompression(seg.crestFactorDb);
    const key = intensity.toLowerCase();
    if (counts.hasOwnProperty(key)) {
      counts[key]++;
    }
  });
  
  const total = segments.length;
  
  return {
    extreme: parseFloat((counts.extreme / total * 100).toFixed(1)),
    heavy: parseFloat((counts.heavy / total * 100).toFixed(1)),
    moderate: parseFloat((counts.moderate / total * 100).toFixed(1)),
    light: parseFloat((counts.light / total * 100).toFixed(1)),
    minimal: parseFloat((counts.minimal / total * 100).toFixed(1)),
    none: parseFloat((counts.none / total * 100).toFixed(1))
  };
}

function calculateStatistics(segments) {
  if (!segments || segments.length === 0) {
    return {
      meanCrestFactor: null, crestFactorStdDev: null, minCrestFactor: null,
      maxCrestFactor: null, meanCompressionScore: null, levelConsistency: null,
      heavyCompressionCount: 0, heavyCompressionDensity: 0
    };
  }
  
  const crestFactors = segments.map(s => s.crestFactorDb).filter(c => c !== null && !isNaN(c));
  const rmsLevels = segments.map(s => s.rmsDb).filter(r => r !== null && !isNaN(r));
  const compressionScores = segments.map(s => calculateCompressionScore(s.crestFactorDb)).filter(s => !isNaN(s));
  
  if (crestFactors.length === 0) {
    return {
      meanCrestFactor: null, crestFactorStdDev: null, minCrestFactor: null,
      maxCrestFactor: null, meanCompressionScore: null, levelConsistency: null,
      heavyCompressionCount: 0, heavyCompressionDensity: 0
    };
  }
  
  const meanCrest = crestFactors.reduce((a, b) => a + b, 0) / crestFactors.length;
  const variance = crestFactors.reduce((sum, c) => sum + Math.pow(c - meanCrest, 2), 0) / crestFactors.length;
  const stdDev = Math.sqrt(variance);
  
  const meanScore = compressionScores.length > 0
    ? compressionScores.reduce((a, b) => a + b, 0) / compressionScores.length
    : null;
  
  const levelConsistency = rmsLevels.length > 1
    ? Math.max(...rmsLevels) - Math.min(...rmsLevels)
    : null;
  
  const heavyCount = segments.filter(s => {
    const intensity = classifyCompression(s.crestFactorDb);
    return intensity === 'EXTREME' || intensity === 'HEAVY';
  }).length;
  
  return {
    meanCrestFactor: parseFloat(meanCrest.toFixed(1)),
    crestFactorStdDev: parseFloat(stdDev.toFixed(2)),
    minCrestFactor: parseFloat(Math.min(...crestFactors).toFixed(1)),
    maxCrestFactor: parseFloat(Math.max(...crestFactors).toFixed(1)),
    meanCompressionScore: meanScore !== null ? parseFloat(meanScore.toFixed(1)) : null,
    levelConsistency: levelConsistency !== null ? parseFloat(levelConsistency.toFixed(1)) : null,
    heavyCompressionCount: heavyCount,
    heavyCompressionDensity: parseFloat((heavyCount / segments.length).toFixed(3))
  };
}

function generateRecommendation(analysis) {
  const { statistics, distribution, pattern } = analysis;
  
  if (!statistics || statistics.meanCrestFactor === null) {
    return 'Insufficient data to generate recommendations.';
  }
  
  const heavyPercent = (distribution?.extreme || 0) + (distribution?.heavy || 0);
  
  if (heavyPercent > 30) {
    return `${heavyPercent.toFixed(0)}% of asset has heavy/extreme compression. Asset may sound fatiguing. Consider using a less processed source.`;
  }
  
  if (pattern?.pattern === DistributionPattern.VERSE_CHORUS_VARIANCE) {
    return 'Compression varies between sections. This is typical of mastered content. Monitor loudness consistency if further processing is needed.';
  }
  
  if (pattern?.pattern === DistributionPattern.ESCALATING) {
    return 'Compression increases toward the end. This may be intentional for build-up effect, but watch for listener fatigue.';
  }
  
  if (statistics.heavyCompressionDensity > 0.5) {
    return 'Over 50% of segments show heavy compression. Avoid additional limiting to prevent artifacts.';
  }
  
  if (statistics.crestFactorStdDev > 4) {
    return 'High variance in compression levels. Consider applying gentle bus compression for more consistent dynamics.';
  }
  
  if (heavyPercent < 5 && statistics.meanCrestFactor > 12) {
    return 'Asset has healthy dynamics with minimal compression. Safe for additional processing if needed.';
  }
  
  return 'Compression levels are within normal range for mastered content.';
}

// ============================================================================
// Main Analysis Functions
// ============================================================================

async function analyzeGainReduction(filePath, options = {}) {
  const { windowSize = DEFAULT_WINDOW_SIZE, includeSegments = true } = options;
  
  const startTime = Date.now();
  
  const [duration, segments] = await Promise.all([
    getAudioDuration(filePath),
    getWindowedMetrics(filePath, windowSize)
  ]);
  
  const enhancedSegments = segments.map(seg => ({
    ...seg,
    compressionIntensity: classifyCompression(seg.crestFactorDb),
    compressionScore: calculateCompressionScore(seg.crestFactorDb)
  }));
  
  const statistics = calculateStatistics(enhancedSegments);
  const distribution = calculateDistribution(enhancedSegments);
  const patternInfo = identifyPattern(enhancedSegments);
  
  const processingTimeMs = Date.now() - startTime;
  
  const result = {
    duration,
    windowSize,
    segmentCount: enhancedSegments.length,
    statistics,
    distribution,
    pattern: patternInfo.pattern,
    patternDescription: patternInfo.description,
    processingTimeMs
  };
  
  if (includeSegments) {
    result.segments = enhancedSegments;
  }
  
  result.recommendation = generateRecommendation(result);
  
  return result;
}

async function quickCheck(filePath) {
  const startTime = Date.now();
  
  const segments = await getWindowedMetrics(filePath, WINDOW_SIZES.PHRASE);
  
  const processingTimeMs = Date.now() - startTime;
  
  const crestFactors = segments.map(s => s.crestFactorDb).filter(c => c !== null && !isNaN(c));
  
  if (crestFactors.length === 0) {
    return { status: 'UNKNOWN', meanCrestFactor: null, pattern: 'UNKNOWN', segmentCount: 0, processingTimeMs };
  }
  
  const meanCrest = crestFactors.reduce((a, b) => a + b, 0) / crestFactors.length;
  const distribution = calculateDistribution(segments);
  const heavyPercent = distribution.extreme + distribution.heavy;
  const patternInfo = identifyPattern(segments);
  
  let status;
  if (heavyPercent > 30) {
    status = 'OVER_COMPRESSED';
  } else if (heavyPercent > 15) {
    status = 'HEAVILY_COMPRESSED';
  } else if (distribution.moderate > 50) {
    status = 'MODERATELY_COMPRESSED';
  } else if (meanCrest > 14) {
    status = 'DYNAMIC';
  } else {
    status = 'BALANCED';
  }
  
  return {
    status,
    meanCrestFactor: parseFloat(meanCrest.toFixed(1)),
    heavyCompressionPercent: parseFloat(heavyPercent.toFixed(1)),
    pattern: patternInfo.pattern,
    segmentCount: segments.length,
    processingTimeMs
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  analyzeGainReduction,
  quickCheck,
  getWindowedMetrics,
  getMomentaryLoudnessTimeline,
  getAudioDuration,
  classifyCompression,
  calculateCompressionScore,
  identifyPattern,
  calculateDistribution,
  calculateStatistics,
  generateRecommendation,
  CompressionIntensity,
  CREST_THRESHOLDS,
  DistributionPattern,
  WINDOW_SIZES,
  DEFAULT_WINDOW_SIZE
};
