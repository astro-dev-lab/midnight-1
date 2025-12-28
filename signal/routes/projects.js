/**
 * StudioOS Project Routes
 * 
 * Implements project CRUD operations with state machine and RBAC enforcement.
 * Aligns with Dashboard One (Overview view) and Dashboard Two (Projects view).
 */

const express = require('express');
const router = express.Router();
const { validateProjectTransition, validateProjectInvariants } = require('../middleware/stateMachine');
const { requireAuth, requireInternalRole, requireExternalRole, blockProhibited } = require('../middleware/rbac');

/**
 * Create router with Prisma client
 * @param {import('@prisma/client').PrismaClient} prisma 
 */
function createProjectRoutes(prisma) {
  // Block universally prohibited actions
  router.use(blockProhibited());

  // ============================================================================
  // Dashboard One (Internal) Routes
  // ============================================================================

  /**
   * GET /projects
   * List all projects for the authenticated user
   * View: Dashboard One - Overview
   */
  router.get('/', requireAuth(), requireInternalRole(), async (req, res, next) => {
    try {
      const projects = await prisma.project.findMany({
        where: { ownerId: req.user.sub },
        include: {
          _count: {
            select: { assets: true, jobs: true }
          }
        },
        orderBy: { updatedAt: 'desc' }
      });

      res.json({
        data: projects,
        count: projects.length
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /projects/:id
   * Get project details including assets and jobs
   * View: Dashboard One - Overview
   */
  router.get('/:id', requireAuth(), requireInternalRole(), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid project ID.' });
      }

      const project = await prisma.project.findFirst({
        where: { id, ownerId: req.user.sub },
        include: {
          assets: {
            include: { parent: true },
            orderBy: { createdAt: 'desc' }
          },
          jobs: {
            include: { report: true },
            orderBy: { createdAt: 'desc' }
          },
          deliveries: true
        }
      });

      if (!project) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      res.json(project);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /projects
   * Create a new project
   * View: Dashboard One - Create
   */
  router.post('/', requireAuth(), requireInternalRole(), async (req, res, next) => {
    try {
      const { name } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: 'Project name is required.' });
      }

      const project = await prisma.project.create({
        data: {
          name: name.trim(),
          state: 'DRAFT',
          ownerId: req.user.sub
        }
      });

      res.status(201).json(project);
    } catch (err) {
      next(err);
    }
  });

  /**
   * PATCH /projects/:id
   * Update project (name only - state changes happen via job completion)
   * View: Dashboard One - Overview
   */
  router.patch('/:id', requireAuth(), requireInternalRole(), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid project ID.' });
      }

      const project = await prisma.project.findFirst({
        where: { id, ownerId: req.user.sub }
      });

      if (!project) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      // Only allow name updates - state is managed by job engine
      const { name } = req.body;
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'Project name is required.' });
      }

      const updated = await prisma.project.update({
        where: { id },
        data: { name: name.trim() }
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  /**
   * PATCH /projects/:id/state
   * Update project state (internal use, validates state machine)
   * This is typically called by the job engine, not directly by users
   */
  router.patch('/:id/state', requireAuth(), requireInternalRole('ADVANCED'), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid project ID.' });
      }

      const project = await prisma.project.findFirst({
        where: { id, ownerId: req.user.sub },
        include: {
          jobs: true,
          assets: true
        }
      });

      if (!project) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      const { state: nextState } = req.body;
      if (!nextState) {
        return res.status(400).json({ error: 'State is required.' });
      }

      // Validate state transition
      const transitionResult = validateProjectTransition(project.state, nextState);
      if (!transitionResult.valid) {
        return res.status(400).json({
          error: transitionResult.error,
          category: 'STATE_TRANSITION',
          currentState: project.state,
          requestedState: nextState
        });
      }

      // Validate invariants
      const invariantResult = validateProjectInvariants(project, project.jobs, project.assets);
      if (!invariantResult.valid) {
        return res.status(400).json({
          error: invariantResult.error,
          category: 'STATE_INVARIANT'
        });
      }

      const updated = await prisma.project.update({
        where: { id },
        data: { state: nextState }
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  // ============================================================================
  // Dashboard Two (External) Routes
  // ============================================================================

  /**
   * GET /projects/external
   * List projects shared with external user
   * View: Dashboard Two - Projects
   */
  router.get('/external', requireAuth(), requireExternalRole(), async (req, res, next) => {
    try {
      const access = await prisma.projectAccess.findMany({
        where: { userId: req.user.sub },
        include: {
          project: {
            include: {
              _count: {
                select: { assets: true, deliveries: true }
              }
            }
          }
        }
      });

      const projects = access.map(a => a.project);

      res.json({
        data: projects,
        count: projects.length
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /projects/external/:id
   * Get project details for external user (read-only)
   * View: Dashboard Two - Projects
   */
  router.get('/external/:id', requireAuth(), requireExternalRole(), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid project ID.' });
      }

      // Verify user has access
      const access = await prisma.projectAccess.findFirst({
        where: { projectId: id, userId: req.user.sub }
      });

      if (!access) {
        return res.status(403).json({ error: 'Access denied to this project.' });
      }

      const project = await prisma.project.findUnique({
        where: { id },
        include: {
          assets: {
            where: { category: 'FINAL' }, // External users only see Final assets
            orderBy: { createdAt: 'desc' }
          },
          deliveries: true
        }
      });

      if (!project) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      res.json(project);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = createProjectRoutes;
