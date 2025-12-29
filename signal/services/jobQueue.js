import EventEmitter from 'events';
import { analyzeAudio, analyzeSpectrum, analyzeStereoWidth, analyzePhaseCorrelation, identifyProblems } from './audioProcessor.js';

/**
 * Priority levels for job processing
 */
export const PRIORITY = {
  CRITICAL: 0,    // Emergency reprocessing
  HIGH: 1,        // Live streaming preparation
  NORMAL: 2,      // Standard processing
  LOW: 3,         // Batch background work
  BULK: 4         // Mass import operations
};

/**
 * Job states following StudioOS state machine
 */
export const JOB_STATE = {
  QUEUED: 'queued',
  RUNNING: 'running', 
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  RETRYING: 'retrying'
};

/**
 * Job types for processing pipeline
 */
export const JOB_TYPE = {
  ANALYZE: 'analyze',
  PROCESS: 'process',
  EXPORT: 'export',
  VALIDATE: 'validate',
  METADATA: 'metadata'
};

/**
 * Advanced job queue manager with priority handling and worker pools
 */
export class JobQueueManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.maxWorkers = options.maxWorkers || 4;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 5000; // 5 seconds
    
    // Priority queues (lower number = higher priority)
    this.queues = new Map([
      [PRIORITY.CRITICAL, []],
      [PRIORITY.HIGH, []],
      [PRIORITY.NORMAL, []],
      [PRIORITY.LOW, []],
      [PRIORITY.BULK, []]
    ]);
    
    // Active workers and job tracking
    this.workers = new Map();
    this.jobs = new Map();
    this.stats = {
      processed: 0,
      failed: 0,
      retries: 0,
      avgProcessingTime: 0
    };
    
    // Start processing
    this.isRunning = true;
    this.startWorkers();
  }

  /**
   * Add job to queue with priority and configuration
   */
  addJob(jobConfig) {
    const job = {
      id: this.generateJobId(),
      type: jobConfig.type || JOB_TYPE.ANALYZE,
      priority: jobConfig.priority || PRIORITY.NORMAL,
      state: JOB_STATE.QUEUED,
      data: jobConfig.data || {},
      config: jobConfig.config || {},
      attempts: 0,
      maxAttempts: this.retryAttempts,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
      error: null,
      result: null,
      progress: {
        phase: 'queued',
        percent: 0,
        message: 'Job queued for processing'
      }
    };

    // Store job for tracking
    this.jobs.set(job.id, job);
    
    // Add to appropriate priority queue
    this.queues.get(job.priority).push(job);
    
    this.emit('job:queued', job);
    
    // Try to assign worker immediately
    this.assignWork();
    
    return job.id;
  }

  /**
   * Get job status and progress
   */
  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  /**
   * Cancel job if not yet started or mark for cancellation
   */
  cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.state === JOB_STATE.QUEUED) {
      // Remove from queue
      for (const queue of this.queues.values()) {
        const index = queue.findIndex(j => j.id === jobId);
        if (index !== -1) {
          queue.splice(index, 1);
          break;
        }
      }
      
      job.state = JOB_STATE.CANCELLED;
      job.completedAt = Date.now();
      this.emit('job:cancelled', job);
      return true;
    }

    if (job.state === JOB_STATE.RUNNING) {
      // Mark for cancellation - worker will check this flag
      job.state = JOB_STATE.CANCELLED;
      this.emit('job:cancelled', job);
      return true;
    }

    return false;
  }

  /**
   * Get queue statistics
   */
  getStats() {
    const queueCounts = {};
    let totalQueued = 0;
    
    for (const [priority, queue] of this.queues) {
      const count = queue.length;
      queueCounts[priority] = count;
      totalQueued += count;
    }

    return {
      ...this.stats,
      queued: totalQueued,
      running: this.workers.size,
      queueCounts,
      totalJobs: this.jobs.size
    };
  }

  /**
   * Start worker processes
   */
  startWorkers() {
    for (let i = 0; i < this.maxWorkers; i++) {
      this.createWorker(i);
    }
  }

  /**
   * Create individual worker
   */
  async createWorker(workerId) {
    const worker = {
      id: workerId,
      busy: false,
      currentJob: null,
      processed: 0
    };

    while (this.isRunning) {
      if (!worker.busy) {
        const job = this.getNextJob();
        if (job) {
          worker.busy = true;
          worker.currentJob = job;
          this.workers.set(workerId, worker);

          try {
            await this.processJob(job);
            worker.processed++;
            this.stats.processed++;
          } catch (error) {
            console.error(`Worker ${workerId} error:`, error);
            await this.handleJobFailure(job, error);
          } finally {
            worker.busy = false;
            worker.currentJob = null;
            this.workers.set(workerId, worker);
          }
        } else {
          // No jobs available, wait briefly
          await this.sleep(1000);
        }
      }
    }
  }

  /**
   * Get next job from priority queues
   */
  getNextJob() {
    for (const queue of this.queues.values()) {
      if (queue.length > 0) {
        return queue.shift();
      }
    }
    return null;
  }

  /**
   * Assign work if workers available
   */
  assignWork() {
    // This is handled by workers polling for work
    // Could be optimized with event-driven assignment
  }

  /**
   * Process individual job based on type
   */
  async processJob(job) {
    job.state = JOB_STATE.RUNNING;
    job.startedAt = Date.now();
    job.progress = { phase: 'starting', percent: 5, message: 'Initializing job' };
    
    this.emit('job:started', job);

    try {
      let result;

      switch (job.type) {
        case JOB_TYPE.ANALYZE:
          result = await this.processAnalyzeJob(job);
          break;
        case JOB_TYPE.PROCESS:
          result = await this.processAudioJob(job);
          break;
        case JOB_TYPE.EXPORT:
          result = await this.processExportJob(job);
          break;
        case JOB_TYPE.VALIDATE:
          result = await this.processValidateJob(job);
          break;
        case JOB_TYPE.METADATA:
          result = await this.processMetadataJob(job);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      // Job completed successfully
      job.state = JOB_STATE.COMPLETED;
      job.completedAt = Date.now();
      job.result = result;
      job.progress = { phase: 'completed', percent: 100, message: 'Job completed successfully' };

      this.updateProcessingStats(job);
      this.emit('job:completed', job);

    } catch (error) {
      throw error; // Let handleJobFailure handle retries
    }
  }

  /**
   * Process audio analysis job
   */
  async processAnalyzeJob(job) {
    const { filePath, analysisLevel = 'full' } = job.data;
    
    job.progress = { phase: 'analyzing', percent: 20, message: 'Starting audio analysis' };
    this.emit('job:progress', job);

    // Basic analysis
    const basicAnalysis = await analyzeAudio(filePath);
    
    job.progress = { phase: 'analyzing', percent: 40, message: 'Basic analysis complete' };
    this.emit('job:progress', job);

    if (analysisLevel === 'basic') {
      return basicAnalysis;
    }

    // Advanced analysis
    job.progress = { phase: 'analyzing', percent: 60, message: 'Running spectral analysis' };
    this.emit('job:progress', job);

    const [spectrum, stereoWidth, phaseCorrelation, problems] = await Promise.all([
      analyzeSpectrum(filePath),
      analyzeStereoWidth(filePath),
      analyzePhaseCorrelation(filePath),
      identifyProblems(filePath)
    ]);

    job.progress = { phase: 'analyzing', percent: 90, message: 'Finalizing analysis' };
    this.emit('job:progress', job);

    return {
      ...basicAnalysis,
      spectrum,
      stereoWidth,
      phaseCorrelation,
      problems,
      analysisLevel,
      confidence: this.calculateAnalysisConfidence(basicAnalysis, problems)
    };
  }

  /**
   * Process audio processing job
   */
  async processAudioJob(job) {
    const { inputPath, outputPath, preset, customConfig } = job.data;
    
    job.progress = { phase: 'processing', percent: 10, message: 'Preparing audio processing' };
    this.emit('job:progress', job);

    // This would integrate with actual audio processing pipeline
    // For now, simulate the processing steps
    
    const steps = [
      { name: 'Loading audio', percent: 20 },
      { name: 'Analyzing loudness', percent: 40 },
      { name: 'Applying normalization', percent: 60 },
      { name: 'Peak limiting', percent: 80 },
      { name: 'Rendering output', percent: 95 }
    ];

    for (const step of steps) {
      if (job.state === JOB_STATE.CANCELLED) {
        throw new Error('Job was cancelled');
      }
      
      job.progress = { 
        phase: 'processing', 
        percent: step.percent, 
        message: step.name 
      };
      this.emit('job:progress', job);
      
      // Simulate processing time
      await this.sleep(Math.random() * 2000 + 1000);
    }

    return {
      inputPath,
      outputPath,
      preset,
      processingTime: Date.now() - job.startedAt,
      finalAnalysis: await this.processAnalyzeJob({
        ...job,
        data: { filePath: outputPath, analysisLevel: 'basic' }
      })
    };
  }

  /**
   * Process export job
   */
  async processExportJob(job) {
    const { sourcePath, formats, destinations } = job.data;
    
    job.progress = { phase: 'exporting', percent: 10, message: 'Preparing export' };
    this.emit('job:progress', job);

    const results = [];
    const totalFormats = formats.length;
    
    for (let i = 0; i < formats.length; i++) {
      if (job.state === JOB_STATE.CANCELLED) {
        throw new Error('Job was cancelled');
      }
      
      const format = formats[i];
      const progress = 20 + (i / totalFormats) * 70;
      
      job.progress = { 
        phase: 'exporting', 
        percent: progress, 
        message: `Exporting ${format.name}` 
      };
      this.emit('job:progress', job);
      
      // Simulate export processing
      await this.sleep(Math.random() * 3000 + 2000);
      
      results.push({
        format: format.name,
        path: `${sourcePath}_${format.name}.${format.extension}`,
        size: Math.floor(Math.random() * 50000000) + 5000000 // Random file size
      });
    }

    return { exports: results, totalSize: results.reduce((sum, r) => sum + r.size, 0) };
  }

  /**
   * Process validation job
   */
  async processValidateJob(job) {
    const { filePath, standards } = job.data;
    
    job.progress = { phase: 'validating', percent: 30, message: 'Running validation checks' };
    this.emit('job:progress', job);

    // Simulate validation against different standards
    const validationResults = [];
    
    for (const standard of standards || ['EBU_R128', 'ATSC_A85']) {
      job.progress = { 
        phase: 'validating', 
        percent: 50, 
        message: `Checking ${standard} compliance` 
      };
      this.emit('job:progress', job);
      
      await this.sleep(1000);
      
      validationResults.push({
        standard,
        compliant: Math.random() > 0.2, // 80% pass rate
        issues: Math.random() > 0.5 ? [] : ['Loudness exceeds target by 0.3 LUFS']
      });
    }

    return { validations: validationResults };
  }

  /**
   * Process metadata job
   */
  async processMetadataJob(job) {
    const { filePath, metadata, operation } = job.data;
    
    job.progress = { phase: 'metadata', percent: 40, message: 'Processing metadata' };
    this.emit('job:progress', job);

    await this.sleep(500);

    switch (operation) {
      case 'extract':
        return { metadata: { title: 'Sample Track', artist: 'Unknown Artist' } };
      case 'update':
        return { updated: true, metadata };
      case 'validate':
        return { valid: true, warnings: [] };
      default:
        throw new Error(`Unknown metadata operation: ${operation}`);
    }
  }

  /**
   * Handle job failure and retry logic
   */
  async handleJobFailure(job, error) {
    job.attempts++;
    job.error = error.message;
    this.stats.failed++;

    if (job.attempts < job.maxAttempts && job.state !== JOB_STATE.CANCELLED) {
      // Retry job with exponential backoff
      job.state = JOB_STATE.RETRYING;
      const delay = this.retryDelay * Math.pow(2, job.attempts - 1);
      
      job.progress = { 
        phase: 'retrying', 
        percent: 0, 
        message: `Retrying in ${delay/1000}s (attempt ${job.attempts}/${job.maxAttempts})` 
      };
      
      this.emit('job:retry', job);
      this.stats.retries++;

      setTimeout(() => {
        if (job.state === JOB_STATE.RETRYING) {
          job.state = JOB_STATE.QUEUED;
          this.queues.get(job.priority).unshift(job); // Add to front for priority
        }
      }, delay);
    } else {
      // Max retries reached or cancelled
      job.state = JOB_STATE.FAILED;
      job.completedAt = Date.now();
      this.emit('job:failed', job);
    }
  }

  /**
   * Calculate confidence score for analysis results
   */
  calculateAnalysisConfidence(analysis, problems) {
    let confidence = 95;
    
    // Reduce confidence based on problems found
    if (problems.length > 0) {
      confidence -= problems.length * 5;
    }
    
    // Reduce confidence for extreme values
    if (analysis.loudness < -40 || analysis.loudness > 0) {
      confidence -= 10;
    }
    
    return Math.max(60, Math.min(98, confidence));
  }

  /**
   * Update processing time statistics
   */
  updateProcessingStats(job) {
    const processingTime = job.completedAt - job.startedAt;
    
    if (this.stats.avgProcessingTime === 0) {
      this.stats.avgProcessingTime = processingTime;
    } else {
      this.stats.avgProcessingTime = (this.stats.avgProcessingTime + processingTime) / 2;
    }
  }

  /**
   * Generate unique job ID
   */
  generateJobId() {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Utility sleep function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Shutdown queue gracefully
   */
  async shutdown() {
    this.isRunning = false;
    
    // Wait for active jobs to complete
    while (this.workers.size > 0) {
      const activeWorkers = Array.from(this.workers.values()).filter(w => w.busy);
      if (activeWorkers.length === 0) break;
      await this.sleep(100);
    }
    
    this.emit('queue:shutdown');
  }
}

// Export singleton instance
export const jobQueue = new JobQueueManager();