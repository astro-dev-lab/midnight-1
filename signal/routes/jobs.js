/**
 * StudioOS Job Routes
 * 
 * Implements job submission and monitoring with state machine enforcement.
 * Aligns with Dashboard One (Transform, History views).
 */

const express = require('express');
const router = express.Router();
const { validateJobTransition, validateAssetDerivation } = require('../middleware/stateMachine');
const { 
  requireAuth, 
  requireInternalRole, 
  requireCapability,
  validateParameterBounds,
  blockProhibited 
} = require('../middleware/rbac');
const jobEngine = require('../services/jobEngine');
const { formatReportForDisplay } = require('../services/reports');

// Default parameter bounds for Standard role
const DEFAULT_PARAMETER_BOUNDS = {
  gain: { min: -12, max: 12 },
  compression: { min: 0, max: 100 },
  normalization: { min: -24, max: 0 }
};

/**
 * Create router with Prisma client
 * @param {import('@prisma/client').PrismaClient} prisma 
 */
function createJobRoutes(prisma) {
  // Block universally prohibited actions
  router.use(blockProhibited());

  // ============================================================================
  // Dashboard One (Internal) Routes
  // ============================================================================

  /**
   * GET /jobs
   * List jobs for a project
   * View: Dashboard One - History
   */
  router.get('/', requireAuth(), requireInternalRole(), async (req, res, next) => {
    try {
      const { projectId, state } = req.query;

      if (!projectId) {
        return res.status(400).json({ error: 'projectId query parameter is required.' });
      }

      const pid = parseInt(projectId);
      if (isNaN(pid)) {
        return res.status(400).json({ error: 'Invalid projectId.' });
      }

      // Verify ownership
      const project = await prisma.project.findFirst({
        where: { id: pid, ownerId: req.user.sub }
      });

      if (!project) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      const where = { projectId: pid };
      if (state && ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'].includes(state)) {
        where.state = state;
      }

      const jobs = await prisma.job.findMany({
        where,
        include: {
          createdBy: { select: { id: true, email: true } },
          inputs: {
            include: { asset: { select: { id: true, name: true, category: true } } }
          },
          outputs: { select: { id: true, name: true, category: true } },
          report: true,
          _count: {
            select: { inputs: true, outputs: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json({
        data: jobs,
        count: jobs.length
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /jobs/presets
   * List available presets
   * View: Dashboard One - Transform
   * NOTE: Must be defined before /:id to avoid being matched as a job ID
   */
  router.get('/presets', requireAuth(), requireInternalRole(), (req, res) => {
    const presets = Object.entries(jobEngine.PRESETS).map(([id, preset]) => ({
      id,
      name: preset.name,
      category: preset.category,
      parameters: Object.entries(preset.parameters).map(([key, spec]) => ({
        key,
        default: spec.default,
        min: spec.min,
        max: spec.max,
        options: spec.options,
        unit: spec.unit,
        type: spec.type || 'number'
      }))
    }));

    res.json({ data: presets, count: presets.length });
  });

  /**
   * GET /jobs/:id
   * Get job details with full report
   * View: Dashboard One - History
   */
  router.get('/:id', requireAuth(), requireInternalRole(), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid job ID.' });
      }

      const job = await prisma.job.findUnique({
        where: { id },
        include: {
          project: true,
          createdBy: { select: { id: true, email: true } },
          inputs: {
            include: { asset: true }
          },
          outputs: {
            include: { parent: true }
          },
          report: true,
          comments: {
            include: { user: { select: { id: true, email: true } } },
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      if (!job) {
        return res.status(404).json({ error: 'Job not found.' });
      }

      // Verify ownership
      if (job.project.ownerId !== req.user.sub) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      res.json(job);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /jobs
   * Submit a new job for processing
   * View: Dashboard One - Transform
   */
  router.post('/', 
    requireAuth(), 
    requireInternalRole(), 
    requireCapability('transform', 'presetSelection'),
    requireCapability('transform', 'parameterAdjustment'),
    validateParameterBounds(DEFAULT_PARAMETER_BOUNDS),
    async (req, res, next) => {
      try {
        const { projectId, preset, parameters, inputAssetIds } = req.body;

        // Validate required fields
        if (!projectId || !preset || !inputAssetIds || !Array.isArray(inputAssetIds)) {
          return res.status(400).json({
            error: 'Required fields: projectId, preset, inputAssetIds (array).'
          });
        }

        const pid = parseInt(projectId);
        if (isNaN(pid)) {
          return res.status(400).json({ error: 'Invalid projectId.' });
        }

        // Verify ownership
        const project = await prisma.project.findFirst({
          where: { id: pid, ownerId: req.user.sub }
        });

        if (!project) {
          return res.status(404).json({ error: 'Project not found.' });
        }

        // Validate input assets exist and are not Final (per state machine)
        const inputIds = inputAssetIds.map(id => parseInt(id)).filter(id => !isNaN(id));
        const inputAssets = await prisma.asset.findMany({
          where: { 
            id: { in: inputIds },
            projectId: pid
          }
        });

        if (inputAssets.length !== inputIds.length) {
          return res.status(400).json({ error: 'One or more input assets not found.' });
        }

        // Check that no Final assets are used as inputs
        for (const asset of inputAssets) {
          const derivationResult = validateAssetDerivation(asset.category, 'DERIVED');
          if (!derivationResult.valid) {
            return res.status(400).json({
              error: derivationResult.error,
              category: 'STATE_INVARIANT',
              assetId: asset.id,
              assetName: asset.name
            });
          }
        }

        // Create job and job inputs in transaction
        const job = await prisma.$transaction(async (tx) => {
          const newJob = await tx.job.create({
            data: {
              preset: preset.trim(),
              parameters: parameters || null,
              state: 'QUEUED',
              projectId: pid,
              createdById: req.user.sub
            }
          });

          // Create job inputs
          await tx.jobInput.createMany({
            data: inputIds.map(assetId => ({
              jobId: newJob.id,
              assetId
            }))
          });

          // Update project state to Processing if it was Draft
          if (project.state === 'DRAFT') {
            await tx.project.update({
              where: { id: pid },
              data: { state: 'PROCESSING' }
            });
          }

          return newJob;
        });

        const result = await prisma.job.findUnique({
          where: { id: job.id },
          include: {
            inputs: { include: { asset: { select: { id: true, name: true } } } }
          }
        });

        // Enqueue job for processing
        try {
          await jobEngine.enqueueJob(job.id);
        } catch (enqueueErr) {
          // Job created but failed to enqueue - return with warning
          return res.status(201).json({
            ...result,
            warning: 'Job created but failed to enqueue: ' + enqueueErr.message
          });
        }

        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * GET /jobs/:id/status
   * Get job status with queue position
   * View: Dashboard One - Transform (progress tracking)
   */
  router.get('/:id/status', requireAuth(), requireInternalRole(), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid job ID.' });
      }

      const status = await jobEngine.getJobStatus(id);
      if (!status) {
        return res.status(404).json({ error: 'Job not found.' });
      }

      // Verify ownership
      const project = await prisma.project.findFirst({
        where: { id: status.projectId, ownerId: req.user.sub }
      });

      if (!project) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      res.json({
        id: status.id,
        state: status.state,
        preset: status.preset,
        queuePosition: status.queuePosition,
        queueLength: status.queueLength,
        createdAt: status.createdAt,
        startedAt: status.startedAt,
        completedAt: status.completedAt,
        inputCount: status.inputs?.length || 0,
        outputCount: status.outputs?.length || 0,
        hasReport: !!status.report,
        ...(status.state === 'FAILED' ? {
          errorCategory: status.errorCategory,
          errorMessage: status.errorMessage
        } : {})
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /jobs/:id/cancel
   * Cancel a queued job
   * View: Dashboard One - Transform
   */
  router.post('/:id/cancel', requireAuth(), requireInternalRole(), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid job ID.' });
      }

      // Verify job exists and ownership
      const job = await prisma.job.findUnique({
        where: { id },
        include: { project: true }
      });

      if (!job) {
        return res.status(404).json({ error: 'Job not found.' });
      }

      if (job.project.ownerId !== req.user.sub) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      const result = await jobEngine.cancelJob(id);
      res.json({ success: true, cancelled: result.cancelled });
    } catch (err) {
      if (err.message.includes('Cannot cancel')) {
        return res.status(400).json({ error: err.message, category: 'STATE_INVARIANT' });
      }
      next(err);
    }
  });

  /**
   * POST /jobs/:id/rerun
   * Rerun a failed job (creates new job with same parameters)
   * View: Dashboard One - History
   */
  router.post('/:id/rerun', requireAuth(), requireInternalRole('STANDARD', 'ADVANCED'), requireCapability('review', 'rerun'), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid job ID.' });
      }

      const originalJob = await prisma.job.findUnique({
        where: { id },
        include: {
          project: true,
          inputs: true
        }
      });

      if (!originalJob) {
        return res.status(404).json({ error: 'Job not found.' });
      }

      // Verify ownership
      if (originalJob.project.ownerId !== req.user.sub) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      // Only failed jobs can be rerun
      if (originalJob.state !== 'FAILED') {
        return res.status(400).json({
          error: 'Only failed jobs can be rerun.',
          category: 'STATE_INVARIANT',
          currentState: originalJob.state
        });
      }

      // Check rerun limits for Standard role
      if (req.rerunLevel === 'limited') {
        const recentReruns = await prisma.job.count({
          where: {
            projectId: originalJob.projectId,
            createdById: req.user.sub,
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
          }
        });

        if (recentReruns >= 5) {
          return res.status(429).json({
            error: 'Rerun limit reached. Standard role permits 5 reruns per 24 hours.',
            category: 'RBAC'
          });
        }
      }

      // Create new job with same parameters using job engine
      const newJob = await jobEngine.retryJob(id, req.user.sub);

      const result = await prisma.job.findUnique({
        where: { id: newJob.id },
        include: {
          inputs: { include: { asset: { select: { id: true, name: true } } } }
        }
      });

      res.status(201).json({
        ...result,
        originalJobId: id
      });
    } catch (err) {
      if (err.message.includes('FAILED')) {
        return res.status(400).json({ error: err.message, category: 'STATE_INVARIANT' });
      }
      next(err);
    }
  });

  /**
   * GET /jobs/:id/report
   * Get detailed processing report
   * View: Dashboard One - History (transparency)
   */
  router.get('/:id/report', requireAuth(), requireInternalRole(), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid job ID.' });
      }

      const job = await prisma.job.findUnique({
        where: { id },
        include: {
          project: true,
          report: true
        }
      });

      if (!job) {
        return res.status(404).json({ error: 'Job not found.' });
      }

      // Verify ownership
      if (job.project.ownerId !== req.user.sub) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      // Full audit access shows additional details
      const includeFullAudit = req.user.internalRole === 'ADVANCED';

      res.json({
        jobId: job.id,
        state: job.state,
        preset: job.preset,
        report: job.report ? (() => {
          const formatted = formatReportForDisplay(job.report);
          return {
            ...formatted,
            ...(includeFullAudit ? {} : { id: undefined })
          };
        })() : null,
        ...(job.state === 'FAILED' ? {
          errorCategory: job.errorCategory,
          errorMessage: job.errorMessage,
          recoveryActions: getRecoveryActions(job.errorCategory)
        } : {})
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Get recovery actions based on error category
   * Per STUDIOOS_ERROR_RECOVERY_PLAYBOOK.md
   */
  function getRecoveryActions(category) {
    const actions = {
      INGESTION: ['Verify input file format is supported', 'Re-upload the source asset', 'Check file is not corrupted'],
      PROCESSING: ['Review preset parameters', 'Try a different preset', 'Re-run with default parameters'],
      OUTPUT: ['Check available storage', 'Re-run the job'],
      DELIVERY: ['Verify destination is accessible', 'Check network connectivity', 'Re-attempt delivery'],
      SYSTEM: ['Wait and retry', 'Contact support if issue persists']
    };
    return actions[category] || actions.SYSTEM;
  }

  return router;
}

module.exports = createJobRoutes;
