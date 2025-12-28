/**
 * StudioOS Job Events Service
 * 
 * Provides Server-Sent Events (SSE) for real-time job status updates.
 * Clients can subscribe to updates for specific jobs or all jobs in a project.
 * 
 * Progress Phases:
 * - queued: Job is waiting in queue
 * - analyzing: Examining input audio characteristics
 * - transforming: Applying processing operations
 * - finalizing: Writing output and generating report
 * - completed: Job finished successfully
 * - failed: Job encountered an error
 */

const EventEmitter = require('events');

/**
 * Job events emitter - singleton for broadcasting job updates
 */
const jobEvents = new EventEmitter();
jobEvents.setMaxListeners(100); // Allow many concurrent subscribers

/**
 * Valid processing phases
 */
const PHASES = {
  QUEUED: 'queued',
  ANALYZING: 'analyzing',
  TRANSFORMING: 'transforming',
  FINALIZING: 'finalizing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

/**
 * Broadcast a job status update
 * @param {Object} job - Job object with id, projectId, state, etc.
 * @param {string} eventType - Event type: 'created', 'progress', 'completed', 'failed', 'cancelled'
 */
function emitJobUpdate(job, eventType = 'progress') {
  const event = {
    type: eventType,
    jobId: job.id,
    projectId: job.projectId,
    state: job.state,
    phase: job.phase || PHASES.QUEUED,
    progress: job.progress || 0,
    preset: job.preset,
    message: job.message || null,
    metrics: job.metrics || null,
    timestamp: new Date().toISOString()
  };
  
  // Emit to job-specific channel
  jobEvents.emit(`job:${job.id}`, event);
  
  // Emit to project channel
  jobEvents.emit(`project:${job.projectId}`, event);
  
  // Emit to global channel (for admin monitoring)
  jobEvents.emit('jobs:all', event);
}

/**
 * Express middleware to create SSE endpoint for job updates
 * @param {import('@prisma/client').PrismaClient} prisma 
 * @returns {import('express').RequestHandler}
 */
function createJobEventsMiddleware(prisma) {
  return async (req, res, next) => {
    const { jobId, projectId } = req.query;
    
    if (!jobId && !projectId) {
      return res.status(400).json({ 
        error: 'Either jobId or projectId query parameter is required.' 
      });
    }

    // Verify access
    if (projectId) {
      const pid = parseInt(projectId);
      if (isNaN(pid)) {
        return res.status(400).json({ error: 'Invalid projectId.' });
      }

      const project = await prisma.project.findFirst({
        where: { 
          id: pid,
          OR: [
            { ownerId: req.user.sub },
            { sharedWith: { some: { userId: req.user.sub } } }
          ]
        }
      });

      if (!project) {
        return res.status(404).json({ error: 'Project not found or access denied.' });
      }
    }

    if (jobId) {
      const jid = parseInt(jobId);
      if (isNaN(jid)) {
        return res.status(400).json({ error: 'Invalid jobId.' });
      }

      const job = await prisma.job.findUnique({
        where: { id: jid },
        include: { project: true }
      });

      if (!job) {
        return res.status(404).json({ error: 'Job not found.' });
      }

      // Check access
      const hasAccess = job.project.ownerId === req.user.sub ||
        await prisma.projectAccess.findFirst({
          where: { projectId: job.projectId, userId: req.user.sub }
        });

      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied.' });
      }
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    
    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ 
      message: 'Connected to job updates',
      jobId: jobId || null,
      projectId: projectId || null
    })}\n\n`);

    // Setup heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      res.write(`:heartbeat ${Date.now()}\n\n`);
    }, 30000);

    // Event handler
    const handleEvent = (event) => {
      res.write(`event: job-update\ndata: ${JSON.stringify(event)}\n\n`);
    };

    // Subscribe to appropriate channel
    const channel = jobId ? `job:${jobId}` : `project:${projectId}`;
    jobEvents.on(channel, handleEvent);

    // Cleanup on client disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
      jobEvents.off(channel, handleEvent);
    });
  };
}

/**
 * Create Express router for SSE job events
 * @param {import('@prisma/client').PrismaClient} prisma 
 * @returns {import('express').Router}
 */
function createJobEventsRouter(prisma) {
  const express = require('express');
  const router = express.Router();
  const { requireAuth } = require('../middleware/rbac');

  /**
   * GET /events/jobs
   * SSE endpoint for job updates
   * Query params: jobId OR projectId (one required)
   */
  router.get('/', requireAuth(), createJobEventsMiddleware(prisma));

  return router;
}

/**
 * Integration helper to hook into job engine
 * Call these from jobEngine when job state changes
 */
const jobNotifications = {
  /**
   * Notify when a job is created/enqueued
   * @param {Object} job 
   */
  onJobCreated(job) {
    emitJobUpdate({
      ...job,
      phase: PHASES.QUEUED,
      progress: 0,
      message: 'Job queued for processing'
    }, 'created');
  },

  /**
   * Notify when job starts running
   * @param {Object} job 
   */
  onJobStarted(job) {
    emitJobUpdate({
      ...job,
      phase: PHASES.ANALYZING,
      progress: 5,
      message: 'Starting job processing'
    }, 'progress');
  },

  /**
   * Notify when job enters analysis phase
   * @param {Object} job 
   * @param {Object} metrics - Partial metrics discovered so far
   */
  onAnalyzing(job, metrics = null) {
    emitJobUpdate({
      ...job,
      phase: PHASES.ANALYZING,
      progress: 15,
      message: 'Analyzing input audio characteristics',
      metrics
    }, 'progress');
  },

  /**
   * Notify when analysis is complete
   * @param {Object} job 
   * @param {Object} metrics - Analysis results
   */
  onAnalysisComplete(job, metrics) {
    emitJobUpdate({
      ...job,
      phase: PHASES.ANALYZING,
      progress: 30,
      message: 'Analysis complete',
      metrics
    }, 'progress');
  },

  /**
   * Notify when job enters transformation phase
   * @param {Object} job 
   * @param {string} operation - What operation is being performed
   */
  onTransforming(job, operation = 'Processing') {
    emitJobUpdate({
      ...job,
      phase: PHASES.TRANSFORMING,
      progress: 40,
      message: operation
    }, 'progress');
  },

  /**
   * Update transformation progress
   * @param {Object} job 
   * @param {number} percent - Progress within transformation (0-100)
   * @param {string} message - Status message
   */
  onTransformProgress(job, percent, message = 'Processing') {
    // Map transformation progress (0-100) to overall progress (40-80)
    const overallProgress = 40 + Math.round(percent * 0.4);
    emitJobUpdate({
      ...job,
      phase: PHASES.TRANSFORMING,
      progress: overallProgress,
      message
    }, 'progress');
  },

  /**
   * Notify when job enters finalization phase
   * @param {Object} job 
   */
  onFinalizing(job) {
    emitJobUpdate({
      ...job,
      phase: PHASES.FINALIZING,
      progress: 85,
      message: 'Writing output and generating report'
    }, 'progress');
  },

  /**
   * Notify when job progress updates (generic)
   * @param {Object} job 
   * @param {number} progress - Overall progress 0-100
   * @param {string} message - Status message
   */
  onJobProgress(job, progress = 50, message = 'Processing') {
    emitJobUpdate({
      ...job,
      progress,
      message
    }, 'progress');
  },

  /**
   * Notify when job completes successfully
   * @param {Object} job 
   * @param {Object} result - Processing result with metrics
   */
  onJobCompleted(job, result = null) {
    emitJobUpdate({ 
      ...job, 
      state: 'COMPLETED',
      phase: PHASES.COMPLETED,
      progress: 100,
      message: 'Job completed successfully',
      metrics: result?.metrics || null
    }, 'completed');
  },

  /**
   * Notify when job fails
   * @param {Object} job 
   * @param {string} errorMessage 
   */
  onJobFailed(job, errorMessage) {
    emitJobUpdate({ 
      ...job, 
      state: 'FAILED',
      phase: PHASES.FAILED,
      progress: 0,
      message: errorMessage,
      error: errorMessage 
    }, 'failed');
  },

  /**
   * Notify when job is cancelled
   * @param {Object} job 
   */
  onJobCancelled(job) {
    emitJobUpdate({ 
      ...job, 
      state: 'CANCELLED',
      phase: 'cancelled',
      progress: 0,
      message: 'Job cancelled by user'
    }, 'cancelled');
  }
};

module.exports = {
  jobEvents,
  emitJobUpdate,
  createJobEventsRouter,
  createJobEventsMiddleware,
  jobNotifications,
  PHASES
};
