import express from 'express';
import { jobQueue, PRIORITY, JOB_TYPE, JOB_STATE } from '../services/jobQueue.js';

const router = express.Router();

/**
 * Get all jobs with optional filtering
 * GET /api/jobs
 */
router.get('/', async (req, res) => {
  try {
    const { 
      state, 
      type, 
      priority, 
      limit = 50, 
      offset = 0 
    } = req.query;

    // Get all jobs from queue manager
    const allJobs = [];
    for (const [jobId, job] of jobQueue.jobs) {
      allJobs.push(job);
    }

    // Apply filters
    let filteredJobs = allJobs;
    
    if (state) {
      filteredJobs = filteredJobs.filter(job => job.state === state);
    }
    
    if (type) {
      filteredJobs = filteredJobs.filter(job => job.type === type);
    }
    
    if (priority !== undefined) {
      filteredJobs = filteredJobs.filter(job => job.priority === parseInt(priority));
    }

    // Sort by creation time (newest first)
    filteredJobs.sort((a, b) => b.createdAt - a.createdAt);

    // Apply pagination
    const startIndex = parseInt(offset);
    const endIndex = startIndex + parseInt(limit);
    const paginatedJobs = filteredJobs.slice(startIndex, endIndex);

    res.json({
      jobs: paginatedJobs,
      total: filteredJobs.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Failed to get jobs:', error);
    res.status(500).json({
      error: 'Failed to retrieve jobs',
      category: 'System'
    });
  }
});

/**
 * Get specific job by ID
 * GET /api/jobs/:jobId
 */
router.get('/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = jobQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        error: 'Job not found',
        category: 'System'
      });
    }

    res.json(job);

  } catch (error) {
    console.error('Failed to get job:', error);
    res.status(500).json({
      error: 'Failed to retrieve job',
      category: 'System'
    });
  }
});

/**
 * Create new job
 * POST /api/jobs
 */
router.post('/', async (req, res) => {
  try {
    const {
      type,
      priority = PRIORITY.NORMAL,
      data = {},
      config = {}
    } = req.body;

    // Validate job type
    if (!Object.values(JOB_TYPE).includes(type)) {
      return res.status(400).json({
        error: `Invalid job type: ${type}`,
        category: 'Processing'
      });
    }

    // Validate priority
    if (!Object.values(PRIORITY).includes(priority)) {
      return res.status(400).json({
        error: `Invalid priority: ${priority}`,
        category: 'Processing'
      });
    }

    // Create job
    const jobId = jobQueue.addJob({
      type,
      priority,
      data,
      config
    });

    const job = jobQueue.getJob(jobId);

    res.status(201).json({
      jobId,
      job,
      message: 'Job created and queued for processing'
    });

  } catch (error) {
    console.error('Failed to create job:', error);
    res.status(500).json({
      error: 'Failed to create job',
      category: 'Processing'
    });
  }
});

/**
 * Cancel job
 * POST /api/jobs/:jobId/cancel
 */
router.post('/:jobId/cancel', async (req, res) => {
  try {
    const { jobId } = req.params;
    const success = jobQueue.cancelJob(jobId);

    if (!success) {
      return res.status(400).json({
        error: 'Job cannot be cancelled (not found or already completed)',
        category: 'Processing'
      });
    }

    const job = jobQueue.getJob(jobId);
    res.json({
      message: 'Job cancelled successfully',
      job
    });

  } catch (error) {
    console.error('Failed to cancel job:', error);
    res.status(500).json({
      error: 'Failed to cancel job',
      category: 'Processing'
    });
  }
});

/**
 * Retry failed job
 * POST /api/jobs/:jobId/retry
 */
router.post('/:jobId/retry', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = jobQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        error: 'Job not found',
        category: 'System'
      });
    }

    if (job.state !== JOB_STATE.FAILED) {
      return res.status(400).json({
        error: 'Only failed jobs can be retried',
        category: 'Processing'
      });
    }

    // Reset job state and attempts
    job.state = JOB_STATE.QUEUED;
    job.attempts = 0;
    job.error = null;
    job.progress = {
      phase: 'queued',
      percent: 0,
      message: 'Job queued for retry'
    };

    // Re-add to appropriate priority queue
    jobQueue.queues.get(job.priority).push(job);

    res.json({
      message: 'Job queued for retry',
      job
    });

  } catch (error) {
    console.error('Failed to retry job:', error);
    res.status(500).json({
      error: 'Failed to retry job',
      category: 'Processing'
    });
  }
});

/**
 * Get queue statistics
 * GET /api/jobs/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = jobQueue.getStats();
    res.json(stats);

  } catch (error) {
    console.error('Failed to get queue stats:', error);
    res.status(500).json({
      error: 'Failed to retrieve queue statistics',
      category: 'System'
    });
  }
});

/**
 * WebSocket endpoint for real-time job updates
 * This would typically be handled by a WebSocket library
 * For demo purposes, we'll use Server-Sent Events (SSE)
 */
router.get('/events', (req, res) => {
  // Set headers for Server-Sent Events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Send initial connection message
  res.write('data: {"type":"connected","message":"Job queue monitoring started"}\n\n');

  // Listen to job queue events
  const eventHandlers = {
    'job:queued': (job) => {
      res.write(`data: ${JSON.stringify({
        type: 'job:queued',
        job
      })}\n\n`);
    },
    'job:started': (job) => {
      res.write(`data: ${JSON.stringify({
        type: 'job:started',
        job
      })}\n\n`);
    },
    'job:progress': (job) => {
      res.write(`data: ${JSON.stringify({
        type: 'job:progress',
        job
      })}\n\n`);
    },
    'job:completed': (job) => {
      res.write(`data: ${JSON.stringify({
        type: 'job:completed',
        job
      })}\n\n`);
    },
    'job:failed': (job) => {
      res.write(`data: ${JSON.stringify({
        type: 'job:failed',
        job
      })}\n\n`);
    },
    'job:cancelled': (job) => {
      res.write(`data: ${JSON.stringify({
        type: 'job:cancelled',
        job
      })}\n\n`);
    },
    'job:retry': (job) => {
      res.write(`data: ${JSON.stringify({
        type: 'job:retry',
        job
      })}\n\n`);
    }
  };

  // Register event listeners
  for (const [event, handler] of Object.entries(eventHandlers)) {
    jobQueue.on(event, handler);
  }

  // Handle client disconnect
  req.on('close', () => {
    for (const [event, handler] of Object.entries(eventHandlers)) {
      jobQueue.removeListener(event, handler);
    }
  });

  // Keep connection alive with periodic heartbeat
  const heartbeat = setInterval(() => {
    res.write('data: {"type":"heartbeat"}\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
  });
});

/**
 * Bulk operations for job management
 */

/**
 * Cancel multiple jobs
 * POST /api/jobs/bulk/cancel
 */
router.post('/bulk/cancel', async (req, res) => {
  try {
    const { jobIds } = req.body;

    if (!Array.isArray(jobIds)) {
      return res.status(400).json({
        error: 'jobIds must be an array',
        category: 'Processing'
      });
    }

    const results = jobIds.map(jobId => {
      const success = jobQueue.cancelJob(jobId);
      return { jobId, success };
    });

    const cancelled = results.filter(r => r.success).length;
    const failed = results.length - cancelled;

    res.json({
      message: `Bulk cancel completed`,
      cancelled,
      failed,
      results
    });

  } catch (error) {
    console.error('Failed to cancel jobs:', error);
    res.status(500).json({
      error: 'Failed to cancel jobs',
      category: 'Processing'
    });
  }
});

/**
 * Retry multiple failed jobs
 * POST /api/jobs/bulk/retry
 */
router.post('/bulk/retry', async (req, res) => {
  try {
    const { jobIds } = req.body;

    if (!Array.isArray(jobIds)) {
      return res.status(400).json({
        error: 'jobIds must be an array',
        category: 'Processing'
      });
    }

    const results = [];

    for (const jobId of jobIds) {
      const job = jobQueue.getJob(jobId);
      
      if (!job) {
        results.push({ jobId, success: false, reason: 'Job not found' });
        continue;
      }

      if (job.state !== JOB_STATE.FAILED) {
        results.push({ jobId, success: false, reason: 'Job not in failed state' });
        continue;
      }

      // Reset and re-queue
      job.state = JOB_STATE.QUEUED;
      job.attempts = 0;
      job.error = null;
      job.progress = {
        phase: 'queued',
        percent: 0,
        message: 'Job queued for retry'
      };

      jobQueue.queues.get(job.priority).push(job);
      results.push({ jobId, success: true });
    }

    const retried = results.filter(r => r.success).length;
    const failed = results.length - retried;

    res.json({
      message: 'Bulk retry completed',
      retried,
      failed,
      results
    });

  } catch (error) {
    console.error('Failed to retry jobs:', error);
    res.status(500).json({
      error: 'Failed to retry jobs',
      category: 'Processing'
    });
  }
});

export default router;