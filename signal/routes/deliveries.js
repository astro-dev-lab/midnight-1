/**
 * StudioOS Delivery Routes
 * 
 * Implements delivery operations for final outputs.
 * Aligns with Dashboard One (Deliver view).
 */

const express = require('express');
const router = express.Router();
const { validateDeliveryPreconditions } = require('../middleware/stateMachine');
const { 
  requireAuth, 
  requireInternalRole, 
  requireExternalRole,
  requireCapability,
  requireExternalCapability,
  blockProhibited 
} = require('../middleware/rbac');

/**
 * Create router with Prisma client
 * @param {import('@prisma/client').PrismaClient} prisma 
 */
function createDeliveryRoutes(prisma) {
  // Block universally prohibited actions
  router.use(blockProhibited());

  // ============================================================================
  // Dashboard One (Internal) Routes
  // ============================================================================

  /**
   * GET /deliveries
   * List deliveries for a project
   * View: Dashboard One - Deliver
   */
  router.get('/', requireAuth(), requireInternalRole(), async (req, res, next) => {
    try {
      const { projectId } = req.query;

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

      const deliveries = await prisma.delivery.findMany({
        where: { projectId: pid },
        orderBy: { createdAt: 'desc' }
      });

      res.json({
        data: deliveries,
        count: deliveries.length
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /deliveries/:id
   * Get delivery details
   * View: Dashboard One - Deliver
   */
  router.get('/:id', requireAuth(), requireInternalRole(), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid delivery ID.' });
      }

      const delivery = await prisma.delivery.findUnique({
        where: { id },
        include: {
          project: true
        }
      });

      if (!delivery) {
        return res.status(404).json({ error: 'Delivery not found.' });
      }

      // Verify ownership
      if (delivery.project.ownerId !== req.user.sub) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      res.json(delivery);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /deliveries
   * Create a new delivery (initiates delivery of final assets)
   * View: Dashboard One - Deliver
   */
  router.post('/', requireAuth(), requireInternalRole(), requireCapability('deliver', 'downloadStandard'), async (req, res, next) => {
    try {
      const { projectId, destination, assetIds } = req.body;

      // Validate required fields
      if (!projectId || !destination) {
        return res.status(400).json({
          error: 'Required fields: projectId, destination.'
        });
      }

      const pid = parseInt(projectId);
      if (isNaN(pid)) {
        return res.status(400).json({ error: 'Invalid projectId.' });
      }

      // Verify ownership
      const project = await prisma.project.findFirst({
        where: { id: pid, ownerId: req.user.sub },
        include: {
          assets: {
            where: { category: 'FINAL' }
          }
        }
      });

      if (!project) {
        return res.status(404).json({ error: 'Project not found.' });
      }

      // Determine which assets to deliver
      let assetsToDeliver = project.assets;
      if (assetIds && Array.isArray(assetIds)) {
        const ids = assetIds.map(id => parseInt(id)).filter(id => !isNaN(id));
        assetsToDeliver = project.assets.filter(a => ids.includes(a.id));
      }

      // Validate delivery preconditions
      const preconditionResult = validateDeliveryPreconditions(assetsToDeliver);
      if (!preconditionResult.valid) {
        return res.status(400).json({
          error: preconditionResult.error,
          category: 'STATE_INVARIANT'
        });
      }

      if (assetsToDeliver.length === 0) {
        return res.status(400).json({
          error: 'No Final assets available for delivery. Approve assets first.',
          category: 'STATE_INVARIANT'
        });
      }

      // Check batch delivery permission
      if (assetsToDeliver.length > 1 && !req.user.internalRole === 'ADVANCED') {
        const canBatch = require('../middleware/rbac').canDeliver(req.user.internalRole, 'batchDelivery');
        if (!canBatch) {
          return res.status(403).json({
            error: 'Batch delivery requires Advanced role.',
            category: 'RBAC'
          });
        }
      }

      // Create delivery record
      const delivery = await prisma.$transaction(async (tx) => {
        const newDelivery = await tx.delivery.create({
          data: {
            destination: destination.trim(),
            status: 'PENDING',
            projectId: pid
          }
        });

        // Update project state to Delivered if it was Ready
        if (project.state === 'READY') {
          await tx.project.update({
            where: { id: pid },
            data: { state: 'DELIVERED' }
          });
        }

        return newDelivery;
      });

      res.status(201).json({
        ...delivery,
        assetsCount: assetsToDeliver.length
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * PATCH /deliveries/:id/status
   * Update delivery status (internal use)
   */
  router.patch('/:id/status', requireAuth(), requireInternalRole('ADVANCED'), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid delivery ID.' });
      }

      const delivery = await prisma.delivery.findUnique({
        where: { id },
        include: { project: true }
      });

      if (!delivery) {
        return res.status(404).json({ error: 'Delivery not found.' });
      }

      if (delivery.project.ownerId !== req.user.sub) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      const { status } = req.body;
      if (!status || !['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'].includes(status)) {
        return res.status(400).json({
          error: 'Invalid status. Must be: PENDING, IN_PROGRESS, COMPLETED, or FAILED.'
        });
      }

      const updateData = { status };
      if (status === 'COMPLETED') {
        updateData.completedAt = new Date();
      }

      const updated = await prisma.delivery.update({
        where: { id },
        data: updateData
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  // ============================================================================
  // Dashboard Two (External) Routes - Download capability
  // ============================================================================

  /**
   * GET /deliveries/external/:projectId
   * List deliveries for external user
   * View: Dashboard Two - Versions (delivery history)
   */
  router.get('/external/:projectId', requireAuth(), requireExternalRole(), async (req, res, next) => {
    try {
      const pid = parseInt(req.params.projectId);
      if (isNaN(pid)) {
        return res.status(400).json({ error: 'Invalid project ID.' });
      }

      // Verify access
      const access = await prisma.projectAccess.findFirst({
        where: { projectId: pid, userId: req.user.sub }
      });

      if (!access) {
        return res.status(403).json({ error: 'Access denied to this project.' });
      }

      const deliveries = await prisma.delivery.findMany({
        where: { 
          projectId: pid,
          status: 'COMPLETED' // External users only see completed deliveries
        },
        orderBy: { completedAt: 'desc' }
      });

      res.json({
        data: deliveries,
        count: deliveries.length
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /deliveries/external/:id/download
   * Request download of a delivery (Approver only)
   * View: Dashboard Two - Deliverables
   */
  router.post('/external/:id/download', requireAuth(), requireExternalRole('APPROVER'), requireExternalCapability('deliverable', 'download'), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid delivery ID.' });
      }

      const delivery = await prisma.delivery.findUnique({
        where: { id },
        include: { project: true }
      });

      if (!delivery) {
        return res.status(404).json({ error: 'Delivery not found.' });
      }

      // Verify access
      const access = await prisma.projectAccess.findFirst({
        where: { projectId: delivery.projectId, userId: req.user.sub }
      });

      if (!access) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      if (delivery.status !== 'COMPLETED') {
        return res.status(400).json({
          error: 'Only completed deliveries can be downloaded.',
          category: 'STATE_INVARIANT'
        });
      }

      // In a real implementation, this would generate a signed URL or initiate download
      res.json({
        deliveryId: id,
        downloadReady: true,
        // downloadUrl would be generated here
        message: 'Download link will be sent to your registered email.'
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = createDeliveryRoutes;
