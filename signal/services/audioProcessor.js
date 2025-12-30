/**
 * Audio Processor Service
 * 
 * Wraps FFmpeg/ffprobe for real audio analysis and transformation.
 * Per STUDIOOS_FUNCTIONAL_SPECS.md Section 5 - Job Processing
 * 
 * Provides:
 * - Audio analysis (loudness, duration, format, peaks)
 * - Format conversion (WAV, MP3, FLAC)
 * - Loudness normalization
 * - Basic mastering operations
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

// Sample rate normalizer for pre-analysis
const sampleRateNormalizer = require('./sampleRateNormalizer');

// Channel topology detector
const channelTopologyDetector = require('./channelTopologyDetector');

// DC offset detector
const dcOffsetDetector = require('./dcOffsetDetector');

// Headroom estimator
const headroomEstimator = require('./headroomEstimator');

// Crest factor analyzer
const crestFactorAnalyzer = require('./crestFactorAnalyzer');

// Loudness analyzer (momentary/short-term/integrated LUFS)
const loudnessAnalyzer = require('./loudnessAnalyzer');

// Temporal density mapper (hook vs verse detection)
const temporalDensityMapper = require('./temporalDensityMapper');

// Transient sharpness index (blunted vs spiky detection)
const transientSharpnessIndex = require('./transientSharpnessIndex');

// Low-end mono compatibility checker (sub-120Hz phase correlation)
const lowEndMonoChecker = require('./lowEndMonoChecker');

// Spectral balance analyzer (deviation from reference curves)
const spectralBalanceAnalyzer = require('./spectralBalanceAnalyzer');

// Limiter stress index (measures how hard the limiter is working)
const limiterStressIndex = require('./limiterStressIndex');

// Gain reduction distribution mapper (where and how often compression occurs)
const gainReductionMapper = require('./gainReductionMapper');

// ============================================================================
// Configuration
// ============================================================================

const FFPROBE_PATH = 'ffprobe';
const FFMPEG_PATH = 'ffmpeg';

const STORAGE_BASE = process.env.STORAGE_PATH || path.join(__dirname, '..', 'storage');

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * Execute a command and return stdout/stderr
 */
function execCommand(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args);
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

/**
 * Get basic audio file information using ffprobe
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} - Audio metadata
 */
async function getAudioInfo(filePath) {
  const args = [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath
  ];
  
  const { stdout } = await execCommand(FFPROBE_PATH, args);
  const data = JSON.parse(stdout);
  
  const audioStream = data.streams?.find(s => s.codec_type === 'audio') || {};
  const format = data.format || {};
  
  return {
    duration: parseFloat(format.duration) || 0,
    bitRate: parseInt(format.bit_rate) || 0,
    sampleRate: parseInt(audioStream.sample_rate) || 0,
    channels: audioStream.channels || 0,
    codec: audioStream.codec_name || 'unknown',
    codecLong: audioStream.codec_long_name || 'unknown',
    bitDepth: audioStream.bits_per_raw_sample ? parseInt(audioStream.bits_per_raw_sample) : null,
    fileSize: parseInt(format.size) || 0,
    formatName: format.format_name || 'unknown'
  };
}

/**
 * Analyze loudness using the loudnorm filter (EBU R128)
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} - Loudness metrics
 */
async function analyzeLoudness(filePath) {
  // First pass: measure loudness
  const args = [
    '-i', filePath,
    '-af', 'loudnorm=print_format=json',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse the JSON output from loudnorm filter
    const jsonMatch = stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
    if (jsonMatch) {
      const metrics = JSON.parse(jsonMatch[0]);
      return {
        integratedLoudness: parseFloat(metrics.input_i) || null,
        truePeak: parseFloat(metrics.input_tp) || null,
        loudnessRange: parseFloat(metrics.input_lra) || null,
        threshold: parseFloat(metrics.input_thresh) || null,
        targetOffset: parseFloat(metrics.target_offset) || null
      };
    }
    
    // Fallback if loudnorm output not found
    return {
      integratedLoudness: null,
      truePeak: null,
      loudnessRange: null,
      threshold: null,
      targetOffset: null,
      warning: 'Could not parse loudness metrics'
    };
  } catch (error) {
    console.error('[AudioProcessor] Loudness analysis failed:', error.message);
    return {
      integratedLoudness: null,
      truePeak: null,
      error: error.message
    };
  }
}

/**
 * Detect peak levels in audio
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} - Peak information
 */
async function detectPeaks(filePath) {
  const args = [
    '-i', filePath,
    '-af', 'astats=metadata=1:reset=1',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse peak level from astats output
    const peakMatch = stderr.match(/Peak level dB:\s*([-\d.]+)/);
    const rmsMatch = stderr.match(/RMS level dB:\s*([-\d.]+)/);
    const dynamicRangeMatch = stderr.match(/Dynamic range:\s*([\d.]+)/);
    
    return {
      peakDb: peakMatch ? parseFloat(peakMatch[1]) : null,
      rmsDb: rmsMatch ? parseFloat(rmsMatch[1]) : null,
      dynamicRange: dynamicRangeMatch ? parseFloat(dynamicRangeMatch[1]) : null
    };
  } catch (error) {
    console.error('[AudioProcessor] Peak detection failed:', error.message);
    return {
      peakDb: null,
      rmsDb: null,
      error: error.message
    };
  }
}

/**
 * Analyze spectral characteristics of audio
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} - Spectral analysis data
 */
async function analyzeSpectrum(filePath) {
  const args = [
    '-i', filePath,
    '-af', 'aspectralstats=measure=all:reset=1',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse spectral statistics
    const centroidMatch = stderr.match(/Spectral centroid:\s*([\d.]+)/);
    const spreadMatch = stderr.match(/Spectral spread:\s*([\d.]+)/);
    const rolloffMatch = stderr.match(/Spectral rolloff:\s*([\d.]+)/);
    const flatnessMatch = stderr.match(/Spectral flatness:\s*([\d.]+)/);
    const crestMatch = stderr.match(/Spectral crest:\s*([\d.]+)/);
    
    return {
      centroid: centroidMatch ? parseFloat(centroidMatch[1]) : null,
      spread: spreadMatch ? parseFloat(spreadMatch[1]) : null,
      rolloff: rolloffMatch ? parseFloat(rolloffMatch[1]) : null,
      flatness: flatnessMatch ? parseFloat(flatnessMatch[1]) : null,
      crest: crestMatch ? parseFloat(crestMatch[1]) : null
    };
  } catch (error) {
    console.error('[AudioProcessor] Spectral analysis failed:', error.message);
    return {
      centroid: null,
      spread: null,
      rolloff: null,
      flatness: null,
      crest: null,
      error: error.message
    };
  }
}

/**
 * Analyze stereo width and imaging
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} - Stereo analysis data
 */
async function analyzeStereoWidth(filePath) {
  const args = [
    '-i', filePath,
    '-af', 'astats=metadata=1:measure_overall=Overall_level',
    '-map', '0:a',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse stereo characteristics
    const leftMatch = stderr.match(/Left channel level:\s*([-\d.]+)/);
    const rightMatch = stderr.match(/Right channel level:\s*([-\d.]+)/);
    const balanceMatch = stderr.match(/Stereo balance:\s*([-\d.]+)/);
    
    const leftLevel = leftMatch ? parseFloat(leftMatch[1]) : 0;
    const rightLevel = rightMatch ? parseFloat(rightMatch[1]) : 0;
    const balance = balanceMatch ? parseFloat(balanceMatch[1]) : 0;
    
    // Calculate stereo width (simplified metric)
    const width = Math.abs(leftLevel - rightLevel) / Math.max(Math.abs(leftLevel), Math.abs(rightLevel), 1);
    
    return {
      leftLevel,
      rightLevel,
      balance,
      width: Math.min(width * 2, 2.0), // Normalize to 0-2 range
      monoCompatible: Math.abs(balance) < 0.3
    };
  } catch (error) {
    console.error('[AudioProcessor] Stereo analysis failed:', error.message);
    return {
      leftLevel: null,
      rightLevel: null,
      balance: null,
      width: null,
      monoCompatible: null,
      error: error.message
    };
  }
}

/**
 * Analyze phase correlation for mono compatibility
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} - Phase correlation data
 */
async function analyzePhaseCorrelation(filePath) {
  const args = [
    '-i', filePath,
    '-af', 'aphasemeter=rate=1:duration=0',
    '-f', 'null',
    '-'
  ];
  
  try {
    const { stderr } = await execCommand(FFMPEG_PATH, args);
    
    // Parse phase correlation
    const phaseMatch = stderr.match(/Phase:\s*([-\d.]+)/);
    const correlation = phaseMatch ? parseFloat(phaseMatch[1]) : null;
    
    let compatibility = 'unknown';
    if (correlation !== null) {
      if (correlation > 0.9) compatibility = 'excellent';
      else if (correlation > 0.7) compatibility = 'good';
      else if (correlation > 0.3) compatibility = 'fair';
      else compatibility = 'poor';
    }
    
    return {
      correlation,
      monoCompatibility: compatibility,
      hasPhaseIssues: correlation !== null && correlation < 0.3
    };
  } catch (error) {
    console.error('[AudioProcessor] Phase analysis failed:', error.message);
    return {
      correlation: null,
      monoCompatibility: 'unknown',
      hasPhaseIssues: false,
      error: error.message
    };
  }
}

/**
 * Full audio analysis combining all metrics
 * @param {string} filePath - Path to audio file
 * @param {Object} options - Analysis options
 * @param {boolean} options.skipNormalization - Skip pre-analysis normalization (default: false)
 * @returns {Promise<Object>} - Complete analysis
 */
async function analyzeAudio(filePath, options = {}) {
  const { skipNormalization = false } = options;
  const startTime = Date.now();
  
  // Use normalizer wrapper for consistent analysis across different formats
  if (!skipNormalization) {
    return await sampleRateNormalizer.withNormalization(
      filePath,
      async (normalizedPath) => {
        return await analyzeAudioInternal(normalizedPath, startTime);
      }
    ).then(({ analysisResult, normalization }) => {
      // Add normalization metadata to result
      analysisResult.normalization = {
        wasNormalized: normalization.wasNormalized,
        changes: normalization.changes,
        processingTimeMs: normalization.processingTimeMs,
        originalInfo: normalization.originalInfo
      };
      return analysisResult;
    });
  }
  
  return await analyzeAudioInternal(filePath, startTime);
}

/**
 * Internal analysis implementation (after normalization)
 * @private
 */
async function analyzeAudioInternal(filePath, startTime) {
  // Run all analyses in parallel
  const [info, loudness, peaks, spectral, stereo, phase, topology, dcOffset, headroom, crestFactor, loudnessDetail, temporalDensity, transientSharpness, lowEndMono, spectralBalance, limiterStress, gainReduction] = await Promise.all([
    getAudioInfo(filePath),
    analyzeLoudness(filePath),
    detectPeaks(filePath),
    analyzeSpectrum(filePath),
    analyzeStereoWidth(filePath),
    analyzePhaseCorrelation(filePath),
    channelTopologyDetector.detectTopology(filePath),
    dcOffsetDetector.detectDCOffset(filePath),
    headroomEstimator.estimateHeadroom(filePath, { includeTruePeak: false, includeRms: false }),
    crestFactorAnalyzer.quickCheck(filePath),
    loudnessAnalyzer.quickCheck(filePath),
    temporalDensityMapper.quickCheck(filePath),
    transientSharpnessIndex.quickCheck(filePath),
    lowEndMonoChecker.quickCheck(filePath),
    spectralBalanceAnalyzer.quickCheck(filePath),
    limiterStressIndex.quickCheck(filePath),
    gainReductionMapper.quickCheck(filePath)
  ]);
  
  const analysisTime = Date.now() - startTime;
  
  // Identify problems based on analysis
  const problems = identifyProblems({ info, loudness, peaks, spectral, stereo, phase, topology, dcOffset, headroom, crestFactor, loudnessDetail, temporalDensity, transientSharpness, lowEndMono, spectralBalance, limiterStress, gainReduction });
  
  return {
    info,
    loudness,
    peaks,
    spectral,
    stereo,
    phase,
    topology,
    dcOffset,
    headroom,
    crestFactor,
    loudnessDetail,
    temporalDensity,
    transientSharpness,
    lowEndMono,
    spectralBalance,
    limiterStress,
    gainReduction,
    problems,
    analysisTime,
    analyzedAt: new Date().toISOString()
  };
}

/**
 * Identify audio problems based on analysis data
 * @param {Object} analysis - Complete analysis data
 * @returns {Array<Object>} - List of identified problems
 */
function identifyProblems(analysis) {
  const problems = [];
  const { info, loudness, peaks, spectral, stereo, phase, topology, dcOffset, headroom, crestFactor, loudnessDetail, limiterStress, gainReduction } = analysis;
  
  // Loudness compliance issues
  if (loudness.integratedLoudness && loudness.integratedLoudness > -6) {
    problems.push({
      code: 'TOO_LOUD',
      severity: 'high',
      category: 'LOUDNESS',
      description: `Integrated loudness of ${loudness.integratedLoudness.toFixed(1)} LUFS exceeds streaming standards`,
      recommendation: 'Normalize to -14 LUFS for streaming compatibility'
    });
  }
  
  if (loudness.truePeak && loudness.truePeak > -1.0) {
    problems.push({
      code: 'TRUE_PEAK_VIOLATION',
      severity: 'high',
      category: 'PEAKS',
      description: `True peak at ${loudness.truePeak.toFixed(1)} dBTP risks digital clipping`,
      recommendation: 'Apply true peak limiting to -1.0 dBTP or lower'
    });
  }
  
  // Headroom issues
  if (headroom && headroom.status === 'CLIPPED') {
    problems.push({
      code: 'CLIPPING_DETECTED',
      severity: 'critical',
      category: 'HEADROOM',
      description: 'Asset appears to be clipping (peak at or above 0 dBFS)',
      recommendation: 'Use source with more headroom or apply de-clipping'
    });
  } else if (headroom && headroom.status === 'CRITICAL') {
    problems.push({
      code: 'CRITICAL_HEADROOM',
      severity: 'high',
      category: 'HEADROOM',
      description: `Only ${headroom.headroomDb?.toFixed(1)} dB headroom available`,
      recommendation: 'Apply limiting carefully to avoid clipping during processing'
    });
  } else if (headroom && headroom.status === 'EXCESSIVE') {
    problems.push({
      code: 'EXCESSIVE_HEADROOM',
      severity: 'low',
      category: 'HEADROOM',
      description: `Excessive headroom (${headroom.headroomDb?.toFixed(1)} dB) - asset may be too quiet`,
      recommendation: 'Consider normalizing to appropriate loudness level'
    });
  }
  
  // Spectral balance issues
  if (spectral.centroid && spectral.centroid < 1500) {
    problems.push({
      code: 'MUDDY_MIX',
      severity: 'medium',
      category: 'FREQUENCY',
      description: 'Low spectral centroid indicates muddy or dark mix',
      recommendation: 'Enhance upper midrange frequencies for clarity'
    });
  }
  
  if (spectral.flatness && spectral.flatness < 0.3) {
    problems.push({
      code: 'TONAL_IMBALANCE',
      severity: 'medium',
      category: 'FREQUENCY',
      description: 'Poor spectral flatness indicates frequency imbalance',
      recommendation: 'Apply corrective EQ to balance frequency response'
    });
  }
  
  // Stereo and phase issues
  if (phase.correlation !== null && phase.correlation < 0.3) {
    problems.push({
      code: 'MONO_INCOMPATIBLE',
      severity: 'critical',
      category: 'STEREO',
      description: `Phase correlation of ${phase.correlation.toFixed(2)} indicates severe mono incompatibility`,
      recommendation: 'Adjust stereo imaging to improve phase coherence'
    });
  }
  
  if (stereo.width && stereo.width < 0.3) {
    problems.push({
      code: 'NARROW_STEREO',
      severity: 'low',
      category: 'STEREO',
      description: 'Narrow stereo width may sound mono-like',
      recommendation: 'Consider subtle stereo enhancement for wider image'
    });
  }
  
  // Channel topology issues
  if (topology && topology.topology === 'DUAL_MONO') {
    problems.push({
      code: 'DUAL_MONO_DETECTED',
      severity: 'low',
      category: 'CHANNEL',
      description: 'Asset contains identical left and right channels (dual-mono)',
      recommendation: 'Convert to mono to reduce file size, or add stereo content'
    });
  }
  
  if (topology && topology.topology === 'MID_SIDE') {
    problems.push({
      code: 'MID_SIDE_ENCODING',
      severity: 'medium',
      category: 'CHANNEL',
      description: 'Asset appears to be Mid-Side encoded',
      recommendation: 'Decode to L/R stereo before distribution if not intended'
    });
  }
  
  // DC offset issues
  if (dcOffset && dcOffset.hasOffset) {
    const severityMap = {
      'MINOR': 'low',
      'MODERATE': 'medium',
      'SEVERE': 'high'
    };
    problems.push({
      code: 'DC_OFFSET_DETECTED',
      severity: severityMap[dcOffset.severity] || 'low',
      category: 'SIGNAL',
      description: `DC offset detected (${dcOffset.overallOffsetPercent || 'unknown'})`,
      recommendation: dcOffset.recommendation || 'Apply DC offset correction before processing'
    });
  }
  
  // Dynamic range issues
  if (peaks.dynamicRange && peaks.dynamicRange < 4) {
    problems.push({
      code: 'OVER_COMPRESSED',
      severity: 'medium',
      category: 'DYNAMICS',
      description: `Dynamic range of ${peaks.dynamicRange.toFixed(1)} DR indicates over-compression`,
      recommendation: 'Reduce compression or use parallel processing'
    });
  }
  
  // Crest factor issues
  if (crestFactor && crestFactor.status === 'SEVERELY_LIMITED') {
    problems.push({
      code: 'SEVERELY_LIMITED_DYNAMICS',
      severity: 'high',
      category: 'DYNAMICS',
      description: `Crest factor of ${crestFactor.crestFactorDb?.toFixed(1)} dB indicates severe limiting`,
      recommendation: 'Asset is over-processed. Avoid additional limiting to prevent distortion.'
    });
  } else if (crestFactor && crestFactor.status === 'HEAVILY_COMPRESSED') {
    problems.push({
      code: 'HEAVILY_COMPRESSED_DYNAMICS',
      severity: 'medium',
      category: 'DYNAMICS',
      description: `Crest factor of ${crestFactor.crestFactorDb?.toFixed(1)} dB indicates heavy compression`,
      recommendation: 'Use minimal limiting. Consider a less processed source if available.'
    });
  } else if (crestFactor && crestFactor.status === 'VERY_DYNAMIC') {
    problems.push({
      code: 'VERY_DYNAMIC_CONTENT',
      severity: 'low',
      category: 'DYNAMICS',
      description: `Crest factor of ${crestFactor.crestFactorDb?.toFixed(1)} dB indicates highly dynamic content`,
      recommendation: 'Consider multi-stage limiting for loudness targets.'
    });
  }
  
  // Momentary/Short-term loudness issues (from loudnessDetail)
  if (loudnessDetail && loudnessDetail.status === 'TOO_LOUD') {
    problems.push({
      code: 'LOUDNESS_TOO_HIGH',
      severity: 'high',
      category: 'LOUDNESS',
      description: `Integrated loudness of ${loudnessDetail.integrated?.toFixed(1)} LUFS exceeds platform target`,
      recommendation: `Reduce loudness by ${Math.abs(loudnessDetail.gainNeeded || 0).toFixed(1)} dB for compliance`
    });
  } else if (loudnessDetail && loudnessDetail.status === 'TOO_QUIET') {
    problems.push({
      code: 'LOUDNESS_TOO_LOW',
      severity: 'medium',
      category: 'LOUDNESS',
      description: `Integrated loudness of ${loudnessDetail.integrated?.toFixed(1)} LUFS is below platform target`,
      recommendation: `Increase loudness by ${Math.abs(loudnessDetail.gainNeeded || 0).toFixed(1)} dB for optimal playback`
    });
  }
  
  // Transient sharpness issues
  if (transientSharpness && transientSharpness.status === 'VERY_BLUNTED') {
    problems.push({
      code: 'TRANSIENTS_OVER_LIMITED',
      severity: 'high',
      category: 'DYNAMICS',
      description: 'Transients are severely blunted, indicating over-limiting',
      recommendation: 'Use a less processed source or reduce limiting intensity'
    });
  } else if (transientSharpness && transientSharpness.status === 'VERY_SPIKY') {
    problems.push({
      code: 'TRANSIENTS_UNCONTROLLED',
      severity: 'medium',
      category: 'DYNAMICS',
      description: 'Transients are very spiky and may cause harshness',
      recommendation: 'Apply gentle transient shaping or soft-knee limiting'
    });
  }
  
  // Low-end mono compatibility issues
  if (lowEndMono && lowEndMono.status === 'CRITICAL') {
    problems.push({
      code: 'LOW_END_PHASE_INVERSION',
      severity: 'critical',
      category: 'STEREO',
      description: `Sub-120Hz phase correlation of ${lowEndMono.correlation?.toFixed(2)} indicates bass cancellation`,
      recommendation: 'Convert bass elements to mono or correct phase alignment immediately'
    });
  } else if (lowEndMono && lowEndMono.status === 'POOR') {
    problems.push({
      code: 'LOW_END_PHASE_ISSUES',
      severity: 'high',
      category: 'STEREO',
      description: `Low-end phase correlation of ${lowEndMono.correlation?.toFixed(2)} risks bass loss on mono systems`,
      recommendation: 'Apply mono summing below 120 Hz for club/PA compatibility'
    });
  }
  
  // Spectral balance issues
  if (spectralBalance && spectralBalance.status === 'EXTREME') {
    problems.push({
      code: 'SPECTRAL_EXTREME_IMBALANCE',
      severity: 'high',
      category: 'FREQUENCY',
      description: `Extreme spectral imbalance in ${spectralBalance.imbalanceRegion} frequencies`,
      recommendation: spectralBalance.recommendation || 'Apply significant corrective EQ'
    });
  } else if (spectralBalance && spectralBalance.status === 'SIGNIFICANT') {
    problems.push({
      code: 'SPECTRAL_IMBALANCE',
      severity: 'medium',
      category: 'FREQUENCY',
      description: `Significant spectral deviation in ${spectralBalance.imbalanceRegion} frequencies`,
      recommendation: spectralBalance.recommendation || 'Consider corrective EQ'
    });
  }
  
  // Limiter stress issues
  if (limiterStress && limiterStress.status === 'EXTREME') {
    problems.push({
      code: 'LIMITER_CRITICALLY_STRESSED',
      severity: 'critical',
      category: 'DYNAMICS',
      description: `Limiter stress index of ${limiterStress.stressIndex} indicates extreme over-limiting`,
      recommendation: 'Asset is severely over-processed. Do not apply additional limiting. Request original pre-master.'
    });
  } else if (limiterStress && limiterStress.status === 'SEVERE') {
    problems.push({
      code: 'LIMITER_OVER_STRESSED',
      severity: 'high',
      category: 'DYNAMICS',
      description: `Limiter stress index of ${limiterStress.stressIndex} indicates severe limiting`,
      recommendation: 'Asset is at risk of distortion. Avoid additional limiting.'
    });
  } else if (limiterStress && limiterStress.status === 'HEAVY') {
    problems.push({
      code: 'LIMITER_HEAVILY_STRESSED',
      severity: 'medium',
      category: 'DYNAMICS',
      description: `Limiter stress index of ${limiterStress.stressIndex} indicates heavy limiting`,
      recommendation: 'Limit additional gain increase to prevent artifacts.'
    });
  }
  
  // Gain reduction distribution issues
  if (gainReduction && gainReduction.status === 'OVER_COMPRESSED') {
    problems.push({
      code: 'COMPRESSION_DISTRIBUTION_EXTREME',
      severity: 'high',
      category: 'DYNAMICS',
      description: `${gainReduction.heavyCompressionPercent}% of asset shows heavy/extreme compression`,
      recommendation: 'Asset is over-processed throughout. Consider using a less compressed source.'
    });
  } else if (gainReduction && gainReduction.status === 'HEAVILY_COMPRESSED') {
    problems.push({
      code: 'COMPRESSION_DISTRIBUTION_HEAVY',
      severity: 'medium',
      category: 'DYNAMICS',
      description: `${gainReduction.heavyCompressionPercent}% of asset shows heavy compression`,
      recommendation: 'Significant compression detected. Avoid additional limiting.'
    });
  }
  
  return problems;
}

// ============================================================================
// Transformation Functions
// ============================================================================

/**
 * Normalize audio loudness to target LUFS
 * @param {string} inputPath - Source audio file
 * @param {string} outputPath - Destination path
 * @param {Object} options - Normalization options
 * @returns {Promise<Object>} - Transformation result
 */
async function normalizeLoudness(inputPath, outputPath, options = {}) {
  const {
    targetLufs = -14,
    truePeakLimit = -1,
    loudnessRange = 11
  } = options;
  
  // Ensure output directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  
  const args = [
    '-y',
    '-i', inputPath,
    '-af', `loudnorm=I=${targetLufs}:TP=${truePeakLimit}:LRA=${loudnessRange}:print_format=json`,
    '-ar', '48000',
    '-c:a', 'pcm_s24le',
    outputPath
  ];
  
  const startTime = Date.now();
  const { stderr } = await execCommand(FFMPEG_PATH, args);
  const processingTime = Date.now() - startTime;
  
  // Parse output loudness metrics
  let outputMetrics = {};
  const jsonMatch = stderr.match(/\{[\s\S]*?"output_i"[\s\S]*?\}/);
  if (jsonMatch) {
    const metrics = JSON.parse(jsonMatch[0]);
    outputMetrics = {
      outputLoudness: parseFloat(metrics.output_i),
      outputTruePeak: parseFloat(metrics.output_tp),
      outputThreshold: parseFloat(metrics.output_thresh)
    };
  }
  
  return {
    success: true,
    outputPath,
    processingTime,
    options: { targetLufs, truePeakLimit, loudnessRange },
    ...outputMetrics
  };
}

/**
 * Convert audio to a different format
 * @param {string} inputPath - Source audio file
 * @param {string} outputPath - Destination path
 * @param {Object} options - Conversion options
 * @returns {Promise<Object>} - Transformation result
 */
async function convertFormat(inputPath, outputPath, options = {}) {
  const {
    format = 'wav',
    sampleRate = 48000,
    bitDepth = 24,
    bitrate = 320 // For lossy formats
  } = options;
  
  // Ensure output directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  
  let args = ['-y', '-i', inputPath];
  
  switch (format.toLowerCase()) {
    case 'wav':
      args.push(
        '-ar', String(sampleRate),
        '-c:a', bitDepth === 16 ? 'pcm_s16le' : bitDepth === 32 ? 'pcm_s32le' : 'pcm_s24le'
      );
      break;
      
    case 'flac':
      args.push(
        '-ar', String(sampleRate),
        '-c:a', 'flac',
        '-compression_level', '8'
      );
      break;
      
    case 'mp3':
      args.push(
        '-ar', String(sampleRate > 48000 ? 48000 : sampleRate),
        '-c:a', 'libmp3lame',
        '-b:a', `${bitrate}k`
      );
      break;
      
    case 'aac':
      args.push(
        '-ar', String(sampleRate > 48000 ? 48000 : sampleRate),
        '-c:a', 'aac',
        '-b:a', `${bitrate}k`
      );
      break;
      
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
  
  args.push(outputPath);
  
  const startTime = Date.now();
  await execCommand(FFMPEG_PATH, args);
  const processingTime = Date.now() - startTime;
  
  // Get output file info
  const outputInfo = await getAudioInfo(outputPath);
  
  return {
    success: true,
    outputPath,
    processingTime,
    options: { format, sampleRate, bitDepth, bitrate },
    outputInfo
  };
}

/**
 * Apply basic mastering chain
 * @param {string} inputPath - Source audio file
 * @param {string} outputPath - Destination path
 * @param {Object} options - Mastering options
 * @returns {Promise<Object>} - Transformation result
 */
async function masterAudio(inputPath, outputPath, options = {}) {
  const {
    targetLufs = -14,
    truePeakLimit = -1,
    format = 'wav',
    sampleRate = 48000,
    bitDepth = 24
  } = options;
  
  // Ensure output directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  
  // Build audio filter chain
  const filterChain = [
    // High-pass filter to remove DC offset and sub-bass rumble
    'highpass=f=30',
    // Gentle compression (for mastering, very subtle)
    'acompressor=threshold=-18dB:ratio=2:attack=20:release=250:makeup=2dB',
    // Loudness normalization
    `loudnorm=I=${targetLufs}:TP=${truePeakLimit}:LRA=11`,
    // Limiter to catch any peaks
    `alimiter=limit=${Math.pow(10, truePeakLimit/20)}:attack=0.1:release=50`
  ].join(',');
  
  const codecArgs = bitDepth === 16 ? 'pcm_s16le' : bitDepth === 32 ? 'pcm_s32le' : 'pcm_s24le';
  
  const args = [
    '-y',
    '-i', inputPath,
    '-af', filterChain,
    '-ar', String(sampleRate),
    '-c:a', codecArgs,
    outputPath
  ];
  
  const startTime = Date.now();
  await execCommand(FFMPEG_PATH, args);
  const processingTime = Date.now() - startTime;
  
  // Analyze output
  const outputAnalysis = await analyzeAudio(outputPath);
  
  return {
    success: true,
    outputPath,
    processingTime,
    options: { targetLufs, truePeakLimit, format, sampleRate, bitDepth },
    outputAnalysis
  };
}

// ============================================================================
// File Path Helpers
// ============================================================================

/**
 * Resolve file key to absolute path
 */
function resolveFilePath(fileKey) {
  // If it's already an absolute path, return as-is
  if (path.isAbsolute(fileKey)) {
    return fileKey;
  }
  // Otherwise, resolve relative to storage base
  return path.join(STORAGE_BASE, fileKey);
}

/**
 * Check if file exists
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Analysis
  getAudioInfo,
  analyzeLoudness,
  detectPeaks,
  analyzeAudio,
  
  // Transformations
  normalizeLoudness,
  convertFormat,
  masterAudio,
  
  // Enhanced Analysis Functions
  analyzeSpectrum,
  analyzeStereoWidth,
  analyzePhaseCorrelation,
  identifyProblems,
  
  // Helpers
  resolveFilePath,
  fileExists,
  
  // Pre-analysis normalization
  sampleRateNormalizer,
  
  // Channel topology detection
  channelTopologyDetector,
  
  // DC offset detection
  dcOffsetDetector,
  
  // Headroom estimation
  headroomEstimator,
  
  // Crest factor analysis
  crestFactorAnalyzer,
  
  // Loudness analysis (momentary/short-term/integrated LUFS)
  loudnessAnalyzer,
  
  // Temporal density mapping (hook vs verse detection)
  temporalDensityMapper,
  
  // Transient sharpness index (blunted vs spiky detection)
  transientSharpnessIndex,
  
  // Low-end mono compatibility checker
  lowEndMonoChecker,
  
  // Spectral balance analyzer
  spectralBalanceAnalyzer,
  
  // Limiter stress index
  limiterStressIndex,
  
  // Gain reduction distribution mapper
  gainReductionMapper,
  
  // Constants
  STORAGE_BASE
};
