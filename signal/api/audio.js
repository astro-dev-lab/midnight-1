const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const { analyzeAudio, analyzeSpectrum, analyzeStereoWidth, analyzePhaseCorrelation, identifyProblems } = require('../services/audioProcessor.js');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 200 * 1024 * 1024 // 200MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.wav', '.aiff', '.mp3', '.flac', '.m4a'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}`));
    }
  }
});

/**
 * Upload and analyze audio file
 * POST /api/upload-and-analyze
 */
router.post('/upload-and-analyze', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No audio file provided',
        category: 'Ingestion'
      });
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname;
    
    // Basic audio analysis
    const basicAnalysis = await analyzeAudio(filePath);
    
    // Advanced analysis
    const [
      spectrumData,
      stereoWidth,
      phaseCorrelation,
      problems
    ] = await Promise.all([
      analyzeSpectrum(filePath),
      analyzeStereoWidth(filePath),
      analyzePhaseCorrelation(filePath),
      identifyProblems(filePath)
    ]);

    // Cleanup uploaded file
    await fs.unlink(filePath);

    // Extract nested analysis data
    const info = basicAnalysis.info || {};
    const loudnessData = basicAnalysis.loudness || {};

    // Determine format normalization requirements
    const ext = path.extname(originalName).toLowerCase();
    const formatInfo = {
      originalFormat: ext.replace('.', '').toUpperCase(),
      codec: info.codec || 'unknown',
      bitDepth: info.bitDepth || null,
      sampleRate: info.sampleRate || 0,
      channels: info.channels || 0
    };

    // Check if format needs normalization for processing
    // StudioOS normalizes to WAV 48kHz/24-bit for internal processing
    const targetFormat = { format: 'WAV', sampleRate: 48000, bitDepth: 24 };
    const needsNormalization = 
      formatInfo.originalFormat !== 'WAV' ||
      formatInfo.sampleRate !== targetFormat.sampleRate ||
      (formatInfo.bitDepth && formatInfo.bitDepth !== targetFormat.bitDepth);

    const normalization = {
      required: needsNormalization,
      original: formatInfo,
      target: targetFormat,
      actions: []
    };

    if (formatInfo.originalFormat !== 'WAV') {
      normalization.actions.push(`Convert ${formatInfo.originalFormat} → WAV`);
    }
    if (formatInfo.sampleRate && formatInfo.sampleRate !== targetFormat.sampleRate) {
      normalization.actions.push(`Resample ${formatInfo.sampleRate / 1000}kHz → ${targetFormat.sampleRate / 1000}kHz`);
    }
    if (formatInfo.bitDepth && formatInfo.bitDepth !== targetFormat.bitDepth) {
      normalization.actions.push(`Convert ${formatInfo.bitDepth}-bit → ${targetFormat.bitDepth}-bit`);
    }

    // Return comprehensive analysis
    res.json({
      filename: originalName,
      duration: info.duration || 0,
      bitrate: info.bitRate || 0,
      sampleRate: info.sampleRate || 0,
      channels: info.channels || 0,
      loudness: loudnessData.integratedLoudness || 0,
      truePeak: loudnessData.truePeak || 0,
      lra: loudnessData.loudnessRange || 0,
      format: formatInfo.originalFormat,
      codec: formatInfo.codec,
      bitDepth: formatInfo.bitDepth,
      normalization: normalization,
      spectrum: spectrumData,
      stereoWidth: stereoWidth,
      phaseCorrelation: phaseCorrelation,
      problems: problems,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Upload and analysis error:', error);
    
    // Cleanup file if it exists
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    }

    res.status(500).json({
      error: error.message || 'Analysis failed',
      category: 'Processing'
    });
  }
});

/**
 * Process audio with quality preset
 * POST /api/process-audio
 */
router.post('/process-audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No audio file provided',
        category: 'Ingestion'
      });
    }

    const { preset, customConfig } = req.body;
    
    if (!preset && !customConfig) {
      return res.status(400).json({
        error: 'No processing configuration provided',
        category: 'Processing'
      });
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname;
    
    // Process the audio file
    const processedPath = await processWithPreset(filePath, preset, customConfig);
    
    // Analyze processed result
    const processedAnalysis = await analyzeAudio(processedPath);
    
    // Generate download filename
    const baseName = path.parse(originalName).name;
    const extension = preset?.export?.format || 'wav';
    const downloadName = `${baseName}_processed.${extension}`;
    
    // Return processed file info
    res.json({
      processedFile: downloadName,
      originalAnalysis: await analyzeAudio(filePath),
      processedAnalysis: processedAnalysis,
      preset: preset,
      downloadUrl: `/api/download/${path.basename(processedPath)}`
    });

    // Cleanup original file
    await fs.unlink(filePath);

  } catch (error) {
    console.error('Processing error:', error);
    
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
    }

    res.status(500).json({
      error: error.message || 'Processing failed',
      category: 'Processing'
    });
  }
});

/**
 * Download processed file
 * GET /api/download/:filename
 */
router.get('/download/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join('processed', filename);
    
    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({
        error: 'File not found',
        category: 'Delivery'
      });
    }

    // Set download headers
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    
    // Stream file
    const fileStream = require('fs').createReadStream(filePath);
    fileStream.pipe(res);
    
    // Cleanup file after download (optional)
    fileStream.on('end', async () => {
      try {
        // Remove file after 1 hour
        setTimeout(async () => {
          try {
            await fs.unlink(filePath);
          } catch (error) {
            console.error('Cleanup error:', error);
          }
        }, 60 * 60 * 1000);
      } catch (error) {
        console.error('Cleanup scheduling error:', error);
      }
    });

  } catch (error) {
    console.error('Download error:', error);
    
    res.status(500).json({
      error: 'Download failed',
      category: 'Delivery'
    });
  }
});

/**
 * Process audio with quality preset configuration
 */
async function processWithPreset(inputPath, preset, customConfig) {
  // Implementation would use FFmpeg with specific filters
  // This is a placeholder for the actual processing logic
  
  const config = preset ? getPresetConfig(preset) : customConfig;
  const outputPath = path.join('processed', `processed_${Date.now()}.${config.export.format}`);
  
  // Ensure processed directory exists
  await fs.mkdir('processed', { recursive: true });
  
  // Build FFmpeg command based on configuration
  const ffmpegArgs = buildProcessingCommand(inputPath, outputPath, config);
  
  // Execute FFmpeg (placeholder)
  // await executeFFmpeg(ffmpegArgs);
  
  // For demo purposes, copy file
  await fs.copyFile(inputPath, outputPath);
  
  return outputPath;
}

/**
 * Get preset configuration
 */
function getPresetConfig(presetName) {
  const presets = {
    'streaming-loud': {
      targets: { loudness: -14, truePeak: -1 },
      export: { format: 'wav', bitDepth: 24, sampleRate: 44100 }
    },
    'streaming-dynamic': {
      targets: { loudness: -16, truePeak: -1 },
      export: { format: 'flac', bitDepth: 24, sampleRate: 48000 }
    },
    'broadcast-tv': {
      targets: { loudness: -23, truePeak: -1 },
      export: { format: 'wav', bitDepth: 24, sampleRate: 48000 }
    },
    'podcast': {
      targets: { loudness: -19, truePeak: -1 },
      export: { format: 'mp3', bitDepth: 16, sampleRate: 44100 }
    },
    'mastering': {
      targets: { loudness: -18, truePeak: -0.1 },
      export: { format: 'wav', bitDepth: 32, sampleRate: 96000 }
    },
    'vinyl-prep': {
      targets: { loudness: -20, truePeak: -3 },
      export: { format: 'wav', bitDepth: 24, sampleRate: 44100 }
    }
  };
  
  return presets[presetName] || presets['streaming-loud'];
}

/**
 * Build FFmpeg processing command
 */
function buildProcessingCommand(inputPath, outputPath, config) {
  const args = ['-i', inputPath];
  
  // Add loudness normalization
  if (config.targets?.loudness) {
    args.push('-af', `loudnorm=I=${config.targets.loudness}:TP=${config.targets.truePeak || -1}:LRA=${config.targets.lra || 7}`);
  }
  
  // Add format-specific options
  if (config.export?.format === 'mp3') {
    args.push('-c:a', 'libmp3lame');
    if (config.export.compression?.quality) {
      args.push('-b:a', `${config.export.compression.quality}k`);
    }
  } else if (config.export?.format === 'flac') {
    args.push('-c:a', 'flac');
  }
  
  // Add sample rate
  if (config.export?.sampleRate) {
    args.push('-ar', config.export.sampleRate.toString());
  }
  
  args.push(outputPath);
  return args;
}

module.exports = router;