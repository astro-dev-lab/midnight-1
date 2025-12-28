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
 * Full audio analysis combining all metrics
 * @param {string} filePath - Path to audio file
 * @returns {Promise<Object>} - Complete analysis
 */
async function analyzeAudio(filePath) {
  const startTime = Date.now();
  
  // Run all analyses in parallel
  const [info, loudness, peaks] = await Promise.all([
    getAudioInfo(filePath),
    analyzeLoudness(filePath),
    detectPeaks(filePath)
  ]);
  
  const analysisTime = Date.now() - startTime;
  
  return {
    info,
    loudness,
    peaks,
    analysisTime,
    analyzedAt: new Date().toISOString()
  };
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
  
  // Helpers
  resolveFilePath,
  fileExists,
  
  // Constants
  STORAGE_BASE
};
