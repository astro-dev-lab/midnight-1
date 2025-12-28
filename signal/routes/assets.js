/**
 * StudioOS Asset Routes
 * 
 * Implements asset CRUD operations with lineage tracking and state enforcement.
 * Aligns with Dashboard One (Assets view) and Dashboard Two (Deliverables view).
 */

const express = require('express');
const router = express.Router();
const { validateAssetDerivation } = require('../middleware/stateMachine');
const { 
  requireAuth, 
  requireInternalRole, 
  requireExternalRole,
  requireCapability,
  requireExternalCapability,
  blockProhibited 
} = require('../middleware/rbac');
const {
  uploadAudio,
  generateFileKey,
  storeFile,
  getFileStream,
  fileExists,
  generatePresignedUrl,
  verifyPresignedUrl,
  isAllowedMimeType
} = require('../services/storage');

/**
 * Create router with Prisma client
 * @param {import('@prisma/client').PrismaClient} prisma 
 */
function createAssetRoutes(prisma) {
  // Block universally prohibited actions
  router.use(blockProhibited());

  // ============================================================================
  // Dashboard One (Internal) Routes
  // ============================================================================

  /**
   * GET /assets
   * List assets for a project
   * View: Dashboard One - Assets
   */
  router.get('/', requireAuth(), requireInternalRole(), async (req, res, next) => {
    try {
      const { projectId, category } = req.query;

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
      if (category && ['RAW', 'DERIVED', 'FINAL'].includes(category)) {
        where.category = category;
      }

      const assets = await prisma.asset.findMany({
        where,
        include: {
          parent: true,
          outputFromJob: {
            select: { id: true, preset: true, state: true }
          },
          approvals: {
            include: { user: { select: { id: true, email: true } } }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json({
        data: assets,
        count: assets.length
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /assets/:id
   * Get asset details with full lineage
   * View: Dashboard One - Assets
   */
  router.get('/:id', requireAuth(), requireInternalRole(), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid asset ID.' });
      }

      const asset = await prisma.asset.findUnique({
        where: { id },
        include: {
          project: true,
          parent: true,
          derivatives: true,
          outputFromJob: {
            include: { report: true }
          },
          approvals: {
            include: { user: { select: { id: true, email: true } } }
          }
        }
      });

      if (!asset) {
        return res.status(404).json({ error: 'Asset not found.' });
      }

      // Verify ownership
      if (asset.project.ownerId !== req.user.sub) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      // Build lineage chain
      const lineage = [];
      let current = asset;
      while (current.parent) {
        lineage.unshift({
          id: current.parent.id,
          name: current.parent.name,
          category: current.parent.category
        });
        current = await prisma.asset.findUnique({
          where: { id: current.parent.id },
          include: { parent: true }
        });
        if (!current) break;
      }

      res.json({
        ...asset,
        lineage
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /assets
   * Upload/create a new asset (Raw only)
   * View: Dashboard One - Assets
   */
  router.post('/', requireAuth(), requireInternalRole(), requireCapability('asset', 'upload'), async (req, res, next) => {
    try {
      const { projectId, name, fileKey, mimeType, sizeBytes, metadata } = req.body;

      // Validate required fields
      if (!projectId || !name || !fileKey || !mimeType || sizeBytes === undefined) {
        return res.status(400).json({
          error: 'Required fields: projectId, name, fileKey, mimeType, sizeBytes.'
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

      const asset = await prisma.asset.create({
        data: {
          name: name.trim(),
          category: 'RAW', // New uploads are always Raw
          fileKey,
          mimeType,
          sizeBytes: BigInt(sizeBytes),
          metadata: metadata || null,
          projectId: pid
        }
      });

      res.status(201).json({
        ...asset,
        sizeBytes: asset.sizeBytes.toString() // BigInt to string for JSON
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * PATCH /assets/:id/metadata
   * Update asset metadata (not the asset itself - assets are immutable)
   * View: Dashboard One - Assets
   */
  router.patch('/:id/metadata', requireAuth(), requireInternalRole(), requireCapability('asset', 'editMetadata'), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid asset ID.' });
      }

      const asset = await prisma.asset.findUnique({
        where: { id },
        include: { project: true }
      });

      if (!asset) {
        return res.status(404).json({ error: 'Asset not found.' });
      }

      if (asset.project.ownerId !== req.user.sub) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      const { metadata } = req.body;
      if (!metadata) {
        return res.status(400).json({ error: 'Metadata object is required.' });
      }

      const updated = await prisma.asset.update({
        where: { id },
        data: { metadata }
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /assets/:id/approve
   * Approve an asset (Derived → Final)
   * View: Dashboard One - Review
   */
  router.post('/:id/approve', requireAuth(), requireInternalRole('STANDARD', 'ADVANCED'), requireCapability('review', 'approve'), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid asset ID.' });
      }

      const asset = await prisma.asset.findUnique({
        where: { id },
        include: { project: true }
      });

      if (!asset) {
        return res.status(404).json({ error: 'Asset not found.' });
      }

      if (asset.project.ownerId !== req.user.sub) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      // Validate derivation (can only approve Derived assets)
      const derivationResult = validateAssetDerivation(asset.category, 'FINAL');
      if (!derivationResult.valid) {
        return res.status(400).json({
          error: derivationResult.error,
          category: 'STATE_TRANSITION',
          currentCategory: asset.category
        });
      }

      const { comment } = req.body;

      // Create approval record and update asset category in transaction
      const [approval, updatedAsset] = await prisma.$transaction([
        prisma.approval.create({
          data: {
            approved: true,
            comment: comment || null,
            userId: req.user.sub,
            assetId: id
          }
        }),
        prisma.asset.update({
          where: { id },
          data: { category: 'FINAL' }
        })
      ]);

      res.json({
        asset: updatedAsset,
        approval
      });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================================
  // Dashboard Two (External) Routes
  // ============================================================================

  /**
   * GET /assets/external
   * List deliverables (Final assets) for external user
   * View: Dashboard Two - Deliverables
   */
  router.get('/external', requireAuth(), requireExternalRole(), async (req, res, next) => {
    try {
      const { projectId } = req.query;

      if (!projectId) {
        return res.status(400).json({ error: 'projectId query parameter is required.' });
      }

      const pid = parseInt(projectId);
      if (isNaN(pid)) {
        return res.status(400).json({ error: 'Invalid projectId.' });
      }

      // Verify access
      const access = await prisma.projectAccess.findFirst({
        where: { projectId: pid, userId: req.user.sub }
      });

      if (!access) {
        return res.status(403).json({ error: 'Access denied to this project.' });
      }

      // External users only see Final assets
      const assets = await prisma.asset.findMany({
        where: { 
          projectId: pid,
          category: 'FINAL'
        },
        include: {
          approvals: {
            where: { approved: true },
            select: { createdAt: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json({
        data: assets.map(a => ({
          ...a,
          sizeBytes: a.sizeBytes.toString()
        })),
        count: assets.length
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /assets/external/:id
   * Get deliverable details for external user
   * View: Dashboard Two - Deliverables
   */
  router.get('/external/:id', requireAuth(), requireExternalRole(), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid asset ID.' });
      }

      const asset = await prisma.asset.findUnique({
        where: { id },
        include: {
          project: true,
          comments: {
            include: { user: { select: { id: true, email: true } } },
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      if (!asset) {
        return res.status(404).json({ error: 'Asset not found.' });
      }

      // Verify access
      const access = await prisma.projectAccess.findFirst({
        where: { projectId: asset.projectId, userId: req.user.sub }
      });

      if (!access) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      // External users only see Final assets
      if (asset.category !== 'FINAL') {
        return res.status(404).json({ error: 'Asset not found.' });
      }

      res.json({
        ...asset,
        sizeBytes: asset.sizeBytes.toString()
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /assets/external/:id/approve
   * Approve a deliverable (external approval)
   * View: Dashboard Two - Review & Approvals
   */
  router.post('/external/:id/approve', requireAuth(), requireExternalRole('APPROVER'), requireExternalCapability('deliverable', 'approve'), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid asset ID.' });
      }

      const asset = await prisma.asset.findUnique({
        where: { id },
        include: { project: true }
      });

      if (!asset) {
        return res.status(404).json({ error: 'Asset not found.' });
      }

      // Verify access
      const access = await prisma.projectAccess.findFirst({
        where: { projectId: asset.projectId, userId: req.user.sub }
      });

      if (!access) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      // Only Final assets can be approved externally
      if (asset.category !== 'FINAL') {
        return res.status(400).json({ error: 'Only Final assets can be approved.' });
      }

      const { comment } = req.body;

      const approval = await prisma.approval.create({
        data: {
          approved: true,
          comment: comment || null,
          userId: req.user.sub,
          assetId: id
        }
      });

      res.status(201).json(approval);
    } catch (err) {
      next(err);
    }
  });

  /**
   * POST /assets/external/:id/reject
   * Reject a deliverable
   * View: Dashboard Two - Review & Approvals
   */
  router.post('/external/:id/reject', requireAuth(), requireExternalRole('APPROVER'), requireExternalCapability('deliverable', 'reject'), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid asset ID.' });
      }

      const asset = await prisma.asset.findUnique({
        where: { id },
        include: { project: true }
      });

      if (!asset) {
        return res.status(404).json({ error: 'Asset not found.' });
      }

      // Verify access
      const access = await prisma.projectAccess.findFirst({
        where: { projectId: asset.projectId, userId: req.user.sub }
      });

      if (!access) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      const { comment } = req.body;
      if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
        return res.status(400).json({ error: 'Rejection requires a comment explaining the reason.' });
      }

      const approval = await prisma.approval.create({
        data: {
          approved: false,
          comment: comment.trim(),
          userId: req.user.sub,
          assetId: id
        }
      });

      res.status(201).json(approval);
    } catch (err) {
      next(err);
    }
  });

  // ============================================================================
  // File Upload/Download Routes
  // ============================================================================

  /**
   * POST /assets/upload
   * Upload a file and create a new Raw asset
   * Multipart form: file (required), projectId (required), name (optional)
   * View: Dashboard One - Create
   */
  router.post('/upload', requireAuth(), requireInternalRole(), requireCapability('asset', 'upload'), uploadAudio.single('file'), async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided. Use form field "file".' });
      }

      const { projectId, name } = req.body;

      if (!projectId) {
        return res.status(400).json({ error: 'projectId is required.' });
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

      // Validate MIME type
      if (!isAllowedMimeType(req.file.mimetype)) {
        return res.status(400).json({ 
          error: 'Invalid file type. Only audio files are allowed.' 
        });
      }

      // Generate file key and store
      const assetName = name || req.file.originalname;
      const fileKey = generateFileKey(pid, req.file.originalname);
      
      await storeFile(fileKey, req.file.buffer);

      // Create asset record
      const asset = await prisma.asset.create({
        data: {
          name: assetName.trim(),
          category: 'RAW',
          fileKey,
          mimeType: req.file.mimetype,
          sizeBytes: BigInt(req.file.size),
          metadata: null,
          projectId: pid
        }
      });

      res.status(201).json({
        ...asset,
        sizeBytes: asset.sizeBytes.toString()
      });
    } catch (err) {
      // Handle multer errors
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File size exceeds maximum allowed (500 MB).' });
      }
      next(err);
    }
  });

  /**
   * GET /assets/:id/download-url
   * Generate a presigned download URL for an asset
   * View: Dashboard One - Assets, Dashboard Two - Deliverables
   */
  router.get('/:id/download-url', requireAuth(), async (req, res, next) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid asset ID.' });
      }

      const asset = await prisma.asset.findUnique({
        where: { id },
        include: { project: true }
      });

      if (!asset) {
        return res.status(404).json({ error: 'Asset not found.' });
      }

      // Check access - owner or shared user
      const isOwner = asset.project.ownerId === req.user.sub;
      const hasAccess = await prisma.projectAccess.findFirst({
        where: { projectId: asset.projectId, userId: req.user.sub }
      });

      if (!isOwner && !hasAccess) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      // External users can only download FINAL assets
      if (hasAccess && asset.category !== 'FINAL') {
        return res.status(403).json({ 
          error: 'External users can only access Final deliverables.' 
        });
      }

      // Check file exists
      const exists = await fileExists(asset.fileKey);
      if (!exists) {
        return res.status(404).json({ error: 'File not found in storage.' });
      }

      // Generate presigned URL
      const protocol = req.protocol;
      const host = req.get('host');
      const baseUrl = `${protocol}://${host}`;
      
      const { url, expiresAt } = generatePresignedUrl(asset.fileKey, baseUrl);

      res.json({
        url,
        expiresAt: expiresAt.toISOString(),
        filename: asset.name,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes.toString()
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /assets/download
   * Download a file using a presigned URL
   * Query params: key, expires, sig
   * Public endpoint - validated by signature
   */
  router.get('/download', async (req, res, next) => {
    try {
      const { key, expires, sig } = req.query;

      if (!key || !expires || !sig) {
        return res.status(400).json({ error: 'Missing required parameters: key, expires, sig.' });
      }

      const expiresNum = parseInt(expires);
      if (isNaN(expiresNum)) {
        return res.status(400).json({ error: 'Invalid expires parameter.' });
      }

      // Verify signature
      const verification = verifyPresignedUrl(key, expiresNum, sig);
      if (!verification.valid) {
        return res.status(403).json({ error: verification.reason });
      }

      // Check file exists
      const exists = await fileExists(key);
      if (!exists) {
        return res.status(404).json({ error: 'File not found.' });
      }

      // Get asset for metadata (optional, for content-type)
      const asset = await prisma.asset.findFirst({
        where: { fileKey: key }
      });

      // Set headers
      const filename = key.split('/').pop();
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      if (asset) {
        res.setHeader('Content-Type', asset.mimeType);
      } else {
        res.setHeader('Content-Type', 'application/octet-stream');
      }

      // Stream file to response
      const stream = getFileStream(key);
      stream.pipe(res);

      stream.on('error', (err) => {
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to read file.' });
        }
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = createAssetRoutes;
