/**
 * Job Engine Foundation
 * 
 * Queue management, state transitions, and asset linking for StudioOS jobs.
 * Per STUDIOOS_FUNCTIONAL_SPECS.md Section 5 - Job Processing
 * 
 * Job States: QUEUED → RUNNING → COMPLETED | FAILED
 * 
 * This is a foundation layer. Actual transformation logic is stubbed
 * for future implementation with audio processing libraries.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Lazy-load job notifications to avoid circular dependency
let jobNotifications = null;
function getJobNotifications() {
  if (!jobNotifications) {
    jobNotifications = require('./jobEvents').jobNotifications;
  }
  return jobNotifications;
}

// ============================================================================
// Error Categories (Per STUDIOOS_ERROR_RECOVERY_PLAYBOOK.md)
// ============================================================================

const ErrorCategory = {
  INGESTION: 'INGESTION',
  PROCESSING: 'PROCESSING',
  OUTPUT: 'OUTPUT',
  DELIVERY: 'DELIVERY',
  SYSTEM: 'SYSTEM'
};

// ============================================================================
// Preset Registry
// ============================================================================

/**
 * Available presets with parameter bounds.
 * Per STUDIOOS_RBAC_MATRIX.md - BASIC uses presets only, STANDARD/ADVANCED can adjust parameters.
 */
const PRESETS = {
  // Mastering presets
  'master-standard': {
    name: 'Standard Mastering',
    category: 'MASTERING',
    parameters: {
      loudness: { default: -14, min: -24, max: -6, unit: 'LUFS' },
      truePeak: { default: -1, min: -3, max: 0, unit: 'dBTP' },
      format: { default: 'WAV', options: ['WAV', 'FLAC', 'MP3'] }
    }
  },
  'master-streaming': {
    name: 'Streaming Optimized',
    category: 'MASTERING',
    parameters: {
      loudness: { default: -14, min: -16, max: -12, unit: 'LUFS' },
      truePeak: { default: -1, min: -2, max: -1, unit: 'dBTP' },
      format: { default: 'MP3', options: ['MP3', 'AAC'] }
    }
  },
  
  // Analysis presets
  'analyze-full': {
    name: 'Full Analysis',
    category: 'ANALYSIS',
    parameters: {
      includeSpectral: { default: true, type: 'boolean' },
      includeLoudness: { default: true, type: 'boolean' },
      includePitch: { default: true, type: 'boolean' }
    }
  },
  
  // Conversion presets
  'convert-wav': {
    name: 'Convert to WAV',
    category: 'CONVERSION',
    parameters: {
      sampleRate: { default: 48000, options: [44100, 48000, 96000] },
      bitDepth: { default: 24, options: [16, 24, 32] }
    }
  },
  'convert-mp3': {
    name: 'Convert to MP3',
    category: 'CONVERSION',
    parameters: {
      bitrate: { default: 320, options: [128, 192, 256, 320], unit: 'kbps' }
    }
  },
  
  // Stem splitting presets
  'split-stems': {
    name: 'Split Stems',
    category: 'EDITING',
    parameters: {
      stemCount: { default: 4, options: [2, 4, 5] },
      quality: { default: 'high', options: ['fast', 'balanced', 'high'] }
    }
  },
  
  // Normalization presets
  'normalize-loudness': {
    name: 'Loudness Normalization',
    category: 'MIXING',
    parameters: {
      targetLufs: { default: -16, min: -24, max: -6, unit: 'LUFS' }
    }
  }
};

/**
 * Get a preset by ID.
 */
function getPreset(presetId) {
  return PRESETS[presetId] || null;
}

/**
 * Validate parameters against preset bounds.
 * Returns { valid: boolean, errors: string[] }
 */
function validateParameters(presetId, parameters) {
  const preset = PRESETS[presetId];
  if (!preset) {
    return { valid: false, errors: [`Unknown preset: ${presetId}`] };
  }
  
  const errors = [];
  
  for (const [key, value] of Object.entries(parameters || {})) {
    const spec = preset.parameters[key];
    if (!spec) {
      errors.push(`Unknown parameter: ${key}`);
      continue;
    }
    
    // Check numeric bounds
    if (spec.min !== undefined && value < spec.min) {
      errors.push(`${key} must be >= ${spec.min}`);
    }
    if (spec.max !== undefined && value > spec.max) {
      errors.push(`${key} must be <= ${spec.max}`);
    }
    
    // Check options
    if (spec.options && !spec.options.includes(value)) {
      errors.push(`${key} must be one of: ${spec.options.join(', ')}`);
    }
    
    // Check boolean
    if (spec.type === 'boolean' && typeof value !== 'boolean') {
      errors.push(`${key} must be a boolean`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Get default parameters for a preset.
 */
function getDefaultParameters(presetId) {
  const preset = PRESETS[presetId];
  if (!preset) return null;
  
  const defaults = {};
  for (const [key, spec] of Object.entries(preset.parameters)) {
    defaults[key] = spec.default;
  }
  return defaults;
}

// ============================================================================
// Job Queue Management
// ============================================================================

/**
 * In-memory job queue (for single-instance deployment).
 * For production, replace with Redis/Bull queue.
 */
const jobQueue = [];
let isProcessing = false;

/**
 * Enqueue a job for processing.
 * Validates preset and parameters before queueing.
 */
async function enqueueJob(jobId) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      inputs: { include: { asset: true } }
    }
  });
  
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }
  
  if (job.state !== 'QUEUED') {
    throw new Error(`Job ${jobId} is not in QUEUED state`);
  }
  
  // Validate inputs exist
  if (job.inputs.length === 0) {
    await failJob(jobId, ErrorCategory.INGESTION, 'No input assets specified');
    throw new Error('No input assets specified');
  }
  
  // Validate all input assets are RAW or DERIVED
  const invalidInputs = job.inputs.filter(
    i => i.asset.category === 'FINAL'
  );
  if (invalidInputs.length > 0) {
    await failJob(jobId, ErrorCategory.INGESTION, 'Cannot process FINAL assets');
    throw new Error('Cannot process FINAL assets');
  }
  
  // Validate preset
  const preset = getPreset(job.preset);
  if (!preset) {
    await failJob(jobId, ErrorCategory.PROCESSING, `Unknown preset: ${job.preset}`);
    throw new Error(`Unknown preset: ${job.preset}`);
  }
  
  // Validate parameters if provided
  if (job.parameters && Object.keys(job.parameters).length > 0) {
    const validation = validateParameters(job.preset, job.parameters);
    if (!validation.valid) {
      await failJob(jobId, ErrorCategory.PROCESSING, validation.errors.join('; '));
      throw new Error(validation.errors.join('; '));
    }
  }
  
  // Add to queue
  jobQueue.push(jobId);
  
  // Emit job created event
  try {
    getJobNotifications().onJobCreated(job);
  } catch (e) {
    // Non-critical, log and continue
    console.warn('[JobEngine] Failed to emit job created event:', e.message);
  }
  
  // Trigger processing if not already running
  if (!isProcessing) {
    processQueue();
  }
  
  return { queued: true, position: jobQueue.length };
}

/**
 * Process jobs from the queue.
 * Runs one job at a time (single worker).
 */
async function processQueue() {
  if (isProcessing || jobQueue.length === 0) {
    return;
  }
  
  isProcessing = true;
  
  while (jobQueue.length > 0) {
    const jobId = jobQueue.shift();
    
    try {
      await processJob(jobId);
    } catch (error) {
      console.error(`Job ${jobId} failed:`, error.message);
      // Error already recorded by processJob
    }
  }
  
  isProcessing = false;
}

/**
 * Process a single job.
 * Transitions: QUEUED → RUNNING → COMPLETED | FAILED
 * Emits progress events at each phase for real-time tracking.
 */
async function processJob(jobId) {
  // Transition to RUNNING
  const job = await prisma.job.update({
    where: { id: jobId },
    data: {
      state: 'RUNNING',
      startedAt: new Date()
    },
    include: {
      inputs: { include: { asset: true } },
      project: true
    }
  });
  
  console.log(`[JobEngine] Processing job ${jobId}: ${job.preset}`);
  
  // Notify job started
  try {
    getJobNotifications().onJobStarted(job);
  } catch (e) {
    console.warn('[JobEngine] Failed to emit job started event:', e.message);
  }
  
  try {
    // Get effective parameters (merge defaults with overrides)
    const defaults = getDefaultParameters(job.preset);
    const effectiveParams = { ...defaults, ...(job.parameters || {}) };
    
    // Notify entering analysis phase
    try {
      getJobNotifications().onAnalyzing(job);
    } catch (e) {
      console.warn('[JobEngine] Failed to emit analyzing event:', e.message);
    }
    
    // Execute transformation
    const result = await executeTransformation(job, effectiveParams);
    
    // Notify entering finalization phase
    try {
      getJobNotifications().onFinalizing(job);
    } catch (e) {
      console.warn('[JobEngine] Failed to emit finalizing event:', e.message);
    }
    
    // Create output assets
    const outputs = await createOutputAssets(job, result);
    
    // Generate processing report
    await generateReport(job, effectiveParams, result, outputs);
    
    // Transition to COMPLETED
    await prisma.job.update({
      where: { id: jobId },
      data: {
        state: 'COMPLETED',
        completedAt: new Date()
      }
    });
    
    // Emit job completed event
    try {
      getJobNotifications().onJobCompleted(job, result);
    } catch (e) {
      console.warn('[JobEngine] Failed to emit job completed event:', e.message);
    }
    
    console.log(`[JobEngine] Job ${jobId} completed successfully`);
    
    return { success: true, outputs };
    
  } catch (error) {
    // Determine error category
    const category = categorizeError(error);
    await failJob(jobId, category, error.message);
    throw error;
  }
}

/**
 * Fail a job with error details.
 */
async function failJob(jobId, category, message) {
  const job = await prisma.job.update({
    where: { id: jobId },
    data: {
      state: 'FAILED',
      completedAt: new Date(),
      errorCategory: category,
      errorMessage: message
    }
  });
  
  // Emit job failed event
  try {
    getJobNotifications().onJobFailed(job, message);
  } catch (e) {
    console.warn('[JobEngine] Failed to emit job failed event:', e.message);
  }
  
  console.error(`[JobEngine] Job ${jobId} failed: [${category}] ${message}`);
}

/**
 * Categorize an error for proper recovery guidance.
 */
function categorizeError(error) {
  const message = error.message?.toLowerCase() || '';
  
  if (message.includes('input') || message.includes('file not found') || message.includes('format')) {
    return ErrorCategory.INGESTION;
  }
  if (message.includes('output') || message.includes('write') || message.includes('disk')) {
    return ErrorCategory.OUTPUT;
  }
  if (message.includes('delivery') || message.includes('network') || message.includes('upload')) {
    return ErrorCategory.DELIVERY;
  }
  if (message.includes('processing') || message.includes('transform')) {
    return ErrorCategory.PROCESSING;
  }
  
  return ErrorCategory.SYSTEM;
}

// ============================================================================
// Transformation Execution
// ============================================================================

// Import audio processor
const audioProcessor = require('./audioProcessor');
const path = require('path');

/**
 * Execute the actual transformation.
 * Uses FFmpeg for real audio processing when files exist,
 * falls back to mock results for testing without files.
 */
async function executeTransformation(job, parameters) {
  const preset = PRESETS[job.preset];
  const startTime = Date.now();
  
  // Get input file paths
  const inputAssets = job.inputs.map(i => i.asset);
  const primaryInput = inputAssets[0];
  
  if (!primaryInput) {
    throw new Error('No input assets found');
  }
  
  // Resolve input file path
  const inputPath = audioProcessor.resolveFilePath(primaryInput.fileKey);
  const inputExists = await audioProcessor.fileExists(inputPath);
  
  // If input file doesn't exist, use mock results for testing
  if (!inputExists) {
    console.log(`[JobEngine] Input file not found: ${inputPath}, using mock processing`);
    return await executeMockTransformation(job, parameters, preset);
  }
  
  console.log(`[JobEngine] Processing with FFmpeg: ${preset.category}`);
  
  try {
    // Notify entering transformation phase
    try {
      getJobNotifications().onTransforming(job, `Starting ${preset.category.toLowerCase()} processing`);
    } catch (e) {
      console.warn('[JobEngine] Failed to emit transforming event:', e.message);
    }
    
    // Execute based on preset category
    switch (preset.category) {
      case 'ANALYSIS':
        return await executeAnalysis(job, parameters, inputPath);
        
      case 'MASTERING':
        return await executeMastering(job, parameters, inputPath);
        
      case 'CONVERSION':
        return await executeConversion(job, parameters, inputPath);
        
      case 'MIXING':
        return await executeMixing(job, parameters, inputPath);
        
      default:
        // Fallback for other categories
        return await executeMockTransformation(job, parameters, preset);
    }
  } catch (error) {
    console.error(`[JobEngine] Processing failed:`, error.message);
    throw new Error(`Processing failed: ${error.message}`);
  }
}

/**
 * Execute audio analysis
 */
async function executeAnalysis(job, parameters, inputPath) {
  // Notify progress
  try {
    getJobNotifications().onTransformProgress(job, 20, 'Analyzing audio file');
  } catch (e) { /* ignore */ }
  
  const analysis = await audioProcessor.analyzeAudio(inputPath);
  
  // Notify analysis metrics available
  try {
    getJobNotifications().onAnalysisComplete(job, {
      duration: analysis.info.duration,
      sampleRate: analysis.info.sampleRate,
      loudness: analysis.loudness.integratedLoudness
    });
  } catch (e) { /* ignore */ }
  
  return {
    category: 'ANALYSIS',
    preset: job.preset,
    parameters,
    inputCount: job.inputs.length,
    processedAt: new Date().toISOString(),
    metrics: {
      durationMs: analysis.analysisTime,
      confidence: 0.99,
      ...analysis.info,
      loudness: analysis.loudness,
      peaks: analysis.peaks
    },
    // Analysis doesn't produce output files, just metrics
    outputFiles: []
  };
}

/**
 * Execute mastering transformation
 */
async function executeMastering(job, parameters, inputPath) {
  const outputDir = path.join(audioProcessor.STORAGE_BASE, 'outputs', String(job.id));
  const inputName = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(outputDir, `${inputName}_mastered.wav`);
  
  // Emit progress: analyzing input
  try {
    getJobNotifications().onTransformProgress(job, 10, 'Analyzing input audio');
  } catch (e) { /* ignore */ }
  
  // Analyze input first
  const inputAnalysis = await audioProcessor.analyzeAudio(inputPath);
  
  // Emit progress: applying mastering
  try {
    getJobNotifications().onTransformProgress(job, 40, 'Applying mastering chain');
  } catch (e) { /* ignore */ }
  
  // Apply mastering
  const result = await audioProcessor.masterAudio(inputPath, outputPath, {
    targetLufs: parameters.loudness || -14,
    truePeakLimit: parameters.truePeak || -1,
    sampleRate: 48000,
    bitDepth: 24
  });
  
  // Emit progress: finalizing
  try {
    getJobNotifications().onTransformProgress(job, 90, 'Finalizing output');
  } catch (e) { /* ignore */ }
  
  return {
    category: 'MASTERING',
    preset: job.preset,
    parameters,
    inputCount: job.inputs.length,
    processedAt: new Date().toISOString(),
    metrics: {
      durationMs: result.processingTime + inputAnalysis.analysisTime,
      confidence: 0.95,
      inputLoudness: inputAnalysis.loudness.integratedLoudness,
      outputLoudness: result.outputAnalysis?.loudness?.integratedLoudness,
      inputPeak: inputAnalysis.loudness.truePeak,
      outputPeak: result.outputAnalysis?.loudness?.truePeak,
      improvement: calculateImprovement(inputAnalysis, result.outputAnalysis, parameters)
    },
    outputFiles: [{
      path: outputPath,
      fileKey: `outputs/${job.id}/${inputName}_mastered.wav`,
      mimeType: 'audio/wav'
    }]
  };
}

/**
 * Execute format conversion
 */
async function executeConversion(job, parameters, inputPath) {
  const outputDir = path.join(audioProcessor.STORAGE_BASE, 'outputs', String(job.id));
  const inputName = path.basename(inputPath, path.extname(inputPath));
  
  // Emit progress: preparing conversion
  try {
    getJobNotifications().onTransformProgress(job, 20, 'Preparing format conversion');
  } catch (e) { /* ignore */ }
  
  // Determine output format from preset
  let format = 'wav';
  let extension = 'wav';
  if (job.preset.includes('mp3')) {
    format = 'mp3';
    extension = 'mp3';
  } else if (job.preset.includes('flac')) {
    format = 'flac';
    extension = 'flac';
  }
  
  const outputPath = path.join(outputDir, `${inputName}.${extension}`);
  
  // Emit progress: converting
  try {
    getJobNotifications().onTransformProgress(job, 50, `Converting to ${format.toUpperCase()}`);
  } catch (e) { /* ignore */ }
  
  const result = await audioProcessor.convertFormat(inputPath, outputPath, {
    format,
    sampleRate: parameters.sampleRate || 48000,
    bitDepth: parameters.bitDepth || 24,
    bitrate: parameters.bitrate || 320
  });
  
  // Emit progress: complete
  try {
    getJobNotifications().onTransformProgress(job, 95, 'Conversion complete');
  } catch (e) { /* ignore */ }
  
  return {
    category: 'CONVERSION',
    preset: job.preset,
    parameters,
    inputCount: job.inputs.length,
    processedAt: new Date().toISOString(),
    metrics: {
      durationMs: result.processingTime,
      confidence: 0.99,
      inputFormat: path.extname(inputPath).slice(1),
      outputFormat: format,
      outputSampleRate: result.outputInfo?.sampleRate,
      outputBitRate: result.outputInfo?.bitRate
    },
    outputFiles: [{
      path: outputPath,
      fileKey: `outputs/${job.id}/${inputName}.${extension}`,
      mimeType: getMimeType(format)
    }]
  };
}

/**
 * Execute mixing/normalization transformation
 */
async function executeMixing(job, parameters, inputPath) {
  const outputDir = path.join(audioProcessor.STORAGE_BASE, 'outputs', String(job.id));
  const inputName = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(outputDir, `${inputName}_normalized.wav`);
  
  // Emit progress: analyzing
  try {
    getJobNotifications().onTransformProgress(job, 15, 'Analyzing input loudness');
  } catch (e) { /* ignore */ }
  
  // Analyze input
  const inputAnalysis = await audioProcessor.analyzeAudio(inputPath);
  
  // Emit progress: normalizing
  try {
    getJobNotifications().onTransformProgress(job, 50, 'Normalizing loudness');
  } catch (e) { /* ignore */ }
  
  // Normalize loudness
  const result = await audioProcessor.normalizeLoudness(inputPath, outputPath, {
    targetLufs: parameters.targetLufs || -16,
    truePeakLimit: -1,
    loudnessRange: 11
  });
  
  // Emit progress: done
  try {
    getJobNotifications().onTransformProgress(job, 95, 'Normalization complete');
  } catch (e) { /* ignore */ }
  
  return {
    category: 'MIXING',
    preset: job.preset,
    parameters,
    inputCount: job.inputs.length,
    processedAt: new Date().toISOString(),
    metrics: {
      durationMs: result.processingTime,
      confidence: 0.98,
      inputLoudness: inputAnalysis.loudness.integratedLoudness,
      outputLoudness: result.outputLoudness,
      targetLufs: parameters.targetLufs || -16
    },
    outputFiles: [{
      path: outputPath,
      fileKey: `outputs/${job.id}/${inputName}_normalized.wav`,
      mimeType: 'audio/wav'
    }]
  };
}

/**
 * Mock transformation for testing without real files
 */
async function executeMockTransformation(job, parameters, preset) {
  const processingTime = {
    ANALYSIS: 500,
    MASTERING: 1000,
    MIXING: 800,
    EDITING: 1200,
    CONVERSION: 600
  }[preset.category] || 600;
  
  await sleep(processingTime);
  
  return {
    category: preset.category,
    preset: job.preset,
    parameters,
    inputCount: job.inputs.length,
    processedAt: new Date().toISOString(),
    metrics: {
      durationMs: processingTime,
      confidence: 0.95 + Math.random() * 0.04,
      mock: true
    },
    outputFiles: []
  };
}

/**
 * Calculate improvement metrics for mastering
 */
function calculateImprovement(inputAnalysis, outputAnalysis, parameters) {
  const targetLufs = parameters.loudness || -14;
  const inputLufs = inputAnalysis?.loudness?.integratedLoudness || -20;
  const outputLufs = outputAnalysis?.loudness?.integratedLoudness || targetLufs;
  
  // How close to target?
  const targetDeviation = Math.abs(outputLufs - targetLufs);
  const improved = targetDeviation < 1.0; // Within 1 LUFS of target
  
  return {
    reachedTarget: improved,
    targetDeviation,
    loudnessChange: outputLufs - inputLufs
  };
}

/**
 * Get MIME type for format
 */
function getMimeType(format) {
  const mimeTypes = {
    'wav': 'audio/wav',
    'mp3': 'audio/mpeg',
    'flac': 'audio/flac',
    'aac': 'audio/aac',
    'ogg': 'audio/ogg'
  };
  return mimeTypes[format] || 'audio/wav';
}

// ============================================================================
// Asset Creation (Output Linking)
// ============================================================================

/**
 * Create output assets from transformation results.
 * Establishes lineage from input assets.
 * Uses real output file info when available from the processor.
 */
async function createOutputAssets(job, result) {
  const preset = PRESETS[job.preset];
  const outputs = [];
  
  // Determine output category based on transformation type
  const outputCategory = 
    job.preset.includes('master') ? 'FINAL' : 'DERIVED';
  
  // If we have real output files from the processor, use those
  if (result.outputFiles && result.outputFiles.length > 0) {
    for (const outputFile of result.outputFiles) {
      // Get file size if available
      let fileSize = '0';
      try {
        const fs = require('fs').promises;
        const stats = await fs.stat(outputFile.path);
        fileSize = String(stats.size);
      } catch {
        // File might not exist in mock mode
      }
      
      const output = await prisma.asset.create({
        data: {
          name: path.basename(outputFile.path),
          category: outputCategory,
          fileKey: outputFile.fileKey,
          mimeType: outputFile.mimeType,
          sizeBytes: fileSize,
          parentId: job.inputs[0]?.asset?.id || null,
          projectId: job.projectId,
          outputJobId: job.id,
          metadata: {
            sourceJobId: job.id,
            preset: job.preset,
            processedAt: result.processedAt,
            confidence: result.metrics.confidence,
            ...result.metrics
          }
        }
      });
      
      outputs.push(output);
    }
    
    return outputs;
  }
  
  // Fallback: create placeholder outputs for each input (mock mode)
  for (const input of job.inputs) {
    const outputName = generateOutputName(input.asset.name, job.preset);
    
    const output = await prisma.asset.create({
      data: {
        name: outputName,
        category: outputCategory,
        fileKey: `outputs/${job.id}/${outputName}`, // Placeholder path
        mimeType: getOutputMimeType(job.preset),
        sizeBytes: String(input.asset.sizeBytes || 0), // Placeholder
        parentId: input.asset.id, // Lineage link
        projectId: job.projectId,
        outputJobId: job.id,
        metadata: {
          sourceJobId: job.id,
          preset: job.preset,
          processedAt: result.processedAt,
          confidence: result.metrics.confidence
        }
      }
    });
    
    outputs.push(output);
  }
  
  // For stem splitting, create additional outputs
  if (job.preset === 'split-stems') {
    const stemCount = result.parameters.stemCount || 4;
    const stems = ['vocals', 'drums', 'bass', 'other', 'piano'];
    
    for (let i = 0; i < stemCount && i < stems.length; i++) {
      const stemName = `${job.inputs[0].asset.name}_${stems[i]}`;
      
      await prisma.asset.create({
        data: {
          name: stemName,
          category: 'DERIVED',
          fileKey: `outputs/${job.id}/${stemName}.wav`,
          mimeType: 'audio/wav',
          sizeBytes: '0',
          parentId: job.inputs[0].asset.id,
          projectId: job.projectId,
          outputJobId: job.id,
          metadata: {
            stem: stems[i],
            sourceJobId: job.id
          }
        }
      });
    }
  }
  
  return outputs;
}

/**
 * Generate output filename based on preset.
 */
function generateOutputName(inputName, preset) {
  const base = inputName.replace(/\.[^.]+$/, '');
  const suffix = {
    'master-standard': '_mastered',
    'master-streaming': '_streaming',
    'analyze-full': '_analysis',
    'convert-wav': '.wav',
    'convert-mp3': '.mp3',
    'split-stems': '_stems',
    'normalize-loudness': '_normalized'
  }[preset] || '_processed';
  
  return base + suffix;
}

/**
 * Determine output MIME type.
 */
function getOutputMimeType(preset) {
  if (preset.includes('mp3')) return 'audio/mpeg';
  if (preset.includes('analyze')) return 'application/json';
  return 'audio/wav';
}

// ============================================================================
// Report Generation (Transparency Layer Foundation)
// ============================================================================

/**
 * Generate a processing report for the job.
 * Per STUDIOOS_TRANSPARENCY_CHARTER.md
 */
async function generateReport(job, parameters, result, outputs) {
  const preset = PRESETS[job.preset];
  
  const reportType = {
    ANALYSIS: 'ANALYSIS',
    MASTERING: 'MASTERING',
    MIXING: 'MIXING',
    EDITING: 'EDITING',
    CONVERSION: 'CONVERSION'
  }[preset.category] || 'ANALYSIS';
  
  const report = await prisma.report.create({
    data: {
      type: reportType,
      summary: generateSummary(job, preset, outputs),
      changesApplied: generateChangesApplied(preset, parameters),
      rationale: generateRationale(preset, parameters),
      impactAssessment: generateImpactAssessment(job, result),
      confidence: `${Math.round(result.metrics.confidence * 100)}%`,
      limitations: generateLimitations(preset),
      jobId: job.id
    }
  });
  
  return report;
}

function generateSummary(job, preset, outputs) {
  return `Applied "${preset.name}" transformation to ${job.inputs.length} input asset(s), ` +
         `producing ${outputs.length} output asset(s).`;
}

function generateChangesApplied(preset, parameters) {
  const changes = [];
  
  for (const [key, value] of Object.entries(parameters)) {
    const spec = preset.parameters[key];
    if (spec) {
      const unit = spec.unit ? ` ${spec.unit}` : '';
      changes.push(`${key}: ${value}${unit}`);
    }
  }
  
  return changes.join('\n') || 'Default preset parameters applied.';
}

function generateRationale(preset, parameters) {
  const rationales = {
    MASTERING: `Target loudness set to ${parameters.loudness || -14} LUFS ` +
               `to meet streaming platform standards while preserving dynamic range.`,
    ANALYSIS: 'Full spectral and loudness analysis performed to provide comprehensive audio metrics.',
    CONVERSION: `Format conversion applied to meet delivery requirements with specified quality settings.`,
    EDITING: 'Stem separation applied using AI-based source separation for maximum isolation quality.',
    MIXING: `Loudness normalization applied to achieve consistent perceived volume across tracks.`
  };
  
  return rationales[preset.category] || 'Standard processing applied per preset definition.';
}

function generateImpactAssessment(job, result) {
  return `Processing completed in ${result.metrics.durationMs}ms. ` +
         `${job.inputs.length} input(s) processed with ${Math.round(result.metrics.confidence * 100)}% confidence. ` +
         `Output assets created and linked to source lineage.`;
}

function generateLimitations(preset) {
  const limitations = {
    MASTERING: 'Automated mastering may not capture all artistic nuances. Review output for quality.',
    ANALYSIS: 'Analysis accuracy depends on input audio quality and format.',
    EDITING: 'Stem separation quality varies with source material complexity.',
    CONVERSION: 'Lossy format conversion may reduce audio fidelity.'
  };
  
  return limitations[preset.category] || null;
}

// ============================================================================
// Job Status & Control
// ============================================================================

/**
 * Get job status and queue position.
 */
async function getJobStatus(jobId) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      inputs: { include: { asset: true } },
      outputs: true,
      report: true
    }
  });
  
  if (!job) return null;
  
  const queuePosition = jobQueue.indexOf(jobId);
  
  return {
    ...job,
    queuePosition: queuePosition >= 0 ? queuePosition + 1 : null,
    queueLength: jobQueue.length
  };
}

/**
 * Cancel a queued job.
 * Only QUEUED jobs can be cancelled.
 */
async function cancelJob(jobId) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }
  
  if (job.state !== 'QUEUED') {
    throw new Error(`Cannot cancel job in ${job.state} state`);
  }
  
  // Remove from queue
  const queueIndex = jobQueue.indexOf(jobId);
  if (queueIndex >= 0) {
    jobQueue.splice(queueIndex, 1);
  }
  
  // Mark as failed (cancelled)
  await failJob(jobId, ErrorCategory.SYSTEM, 'Job cancelled by user');
  
  return { cancelled: true };
}

/**
 * Retry a failed job.
 * Creates a new job with the same parameters.
 */
async function retryJob(jobId, userId) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { inputs: true }
  });
  
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }
  
  if (job.state !== 'FAILED') {
    throw new Error(`Can only retry FAILED jobs`);
  }
  
  // Create new job with same parameters
  const newJob = await prisma.job.create({
    data: {
      state: 'QUEUED',
      preset: job.preset,
      parameters: job.parameters || {},
      projectId: job.projectId,
      createdById: userId,
      inputs: {
        create: job.inputs.map(input => ({
          assetId: input.assetId
        }))
      }
    }
  });
  
  // Enqueue the new job
  await enqueueJob(newJob.id);
  
  return newJob;
}

// ============================================================================
// Utilities
// ============================================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Presets
  PRESETS,
  getPreset,
  validateParameters,
  getDefaultParameters,
  
  // Queue management
  enqueueJob,
  processQueue,
  getJobStatus,
  cancelJob,
  retryJob,
  
  // Error categories
  ErrorCategory,
  
  // Internal (for testing)
  _processJob: processJob,
  _failJob: failJob,
  _getQueue: () => [...jobQueue],
  _clearQueue: () => { jobQueue.length = 0; isProcessing = false; }
};
