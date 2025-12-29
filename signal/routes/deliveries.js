/**
 * StudioOS Delivery Routes
 * 
 * Implements delivery operations for final outputs.
 * Aligns with Dashboard One (Deliver view).
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const { validateRequest } = require('../middleware/error.js');

const router = express.Router();

// Legacy StudioOS routes (preserved for compatibility)
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

  // ============================================================================
  // Enhanced Distribution API Routes (New Platform Distribution System)
  // ============================================================================

  // Mock distribution manager for testing
  const mockDistributionManager = {
    async getDeliveries(options) {
      return { deliveries: [], total: 0 };
    },
    async validateAsset(asset) {
      return { valid: true, errors: [] };
    },
    async createDelivery(config) {
      return { id: 'mock_' + Date.now(), ...config, status: 'pending' };
    },
    async getDeliveryById(id) {
      return null;
    },
    async cancelDelivery(id) {
      return [];
    },
    async retryDelivery(id, platforms) {
      return { id, platforms, status: 'pending' };
    }
  };

  /**
   * GET /api/deliveries
   * List all delivery jobs with filtering and pagination
   */
  router.get('/api', [
    query('status')
      .optional()
      .isIn(['pending', 'validating', 'processing', 'uploading', 'delivered', 'failed'])
      .withMessage('Invalid status filter'),
    query('platform')
      .optional()
      .isIn(['spotify', 'apple_music', 'youtube_music', 'tidal', 'amazon_music', 'bandcamp'])
      .withMessage('Invalid platform filter'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
  ], validateRequest, async (req, res) => {
    try {
      const { status, platform, page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      const filters = {};
      if (status) filters.status = status;
      if (platform) filters.platform = platform;

      const { deliveries, total } = await mockDistributionManager.getDeliveries({
        filters,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({
        success: true,
        deliveries,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Failed to fetch deliveries:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch deliveries',
        details: error.message
      });
    }
  });

  /**
   * POST /api/deliveries
   * Create a new delivery job
   */
  router.post('/api', [
    body('title')
      .notEmpty()
      .isLength({ min: 1, max: 200 })
      .withMessage('Title is required and must be 1-200 characters'),
    body('assets')
      .isArray({ min: 1 })
      .withMessage('At least one asset is required'),
    body('platforms')
      .isArray({ min: 1 })
      .withMessage('At least one platform is required'),
    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object'),
    body('priority')
      .optional()
      .isIn(['low', 'normal', 'high', 'urgent', 'critical'])
      .withMessage('Invalid priority level')
  ], validateRequest, async (req, res) => {
    try {
      const { title, assets, platforms, metadata, priority = 'normal' } = req.body;

      // Create delivery job
      const deliveryConfig = {
        title,
        assets,
        platforms,
        metadata: metadata || {},
        priority
      };

      const delivery = await mockDistributionManager.createDelivery(deliveryConfig);

      res.status(201).json({
        success: true,
        delivery,
        message: 'Delivery created successfully'
      });
    } catch (error) {
      console.error('Failed to create delivery:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create delivery',
        details: error.message
      });
    }
  });

  /**
   * POST /api/deliveries/:id/cancel
   * Cancel a pending or in-progress delivery
   */
  router.post('/api/:id/cancel', [
    param('id')
      .notEmpty()
      .withMessage('Delivery ID is required')
  ], validateRequest, async (req, res) => {
    try {
      const { id } = req.params;
      
      const delivery = await mockDistributionManager.getDeliveryById(id);
      
      if (!delivery) {
        return res.status(404).json({
          success: false,
          error: 'Delivery not found'
        });
      }

      const cancelledJobs = await mockDistributionManager.cancelDelivery(id);

      res.json({
        success: true,
        message: 'Delivery cancelled successfully',
        cancelledJobs: cancelledJobs.length
      });
    } catch (error) {
      console.error('Failed to cancel delivery:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to cancel delivery',
        details: error.message
      });
    }
  });

  /**
   * POST /api/deliveries/:id/retry
   * Retry a failed delivery
   */
  router.post('/api/:id/retry', [
    param('id')
      .notEmpty()
      .withMessage('Delivery ID is required'),
    body('platforms')
      .optional()
      .isArray()
      .withMessage('Platforms must be an array')
  ], validateRequest, async (req, res) => {
    try {
      const { id } = req.params;
      const { platforms } = req.body;
      
      const delivery = await mockDistributionManager.getDeliveryById(id);
      
      if (!delivery) {
        return res.status(404).json({
          success: false,
          error: 'Delivery not found'
        });
      }

      const retryPlatforms = platforms || delivery.platforms;
      const retriedDelivery = await mockDistributionManager.retryDelivery(id, retryPlatforms);

      res.json({
        success: true,
        delivery: retriedDelivery,
        message: 'Delivery retry initiated successfully'
      });
    } catch (error) {
      console.error('Failed to retry delivery:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retry delivery',
        details: error.message
      });
    }
  });

  return router;
}

// WebSocket setup for real-time delivery updates (placeholder)
function setupDeliveryWebSocket(io) {
  console.log('WebSocket setup for deliveries (placeholder implementation)');
  return (deliveryId, update) => {
    console.log(`Delivery update: ${deliveryId}`, update);
  };
}

module.exports = createDeliveryRoutes;
