/**
 * StudioOS Export Routes
 * 
 * Platform export validation and initiation.
 * Per STUDIOOS_FUNCTIONAL_SPECS.md Dashboard One - PlatformExports view
 */

const express = require('express');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Platform requirements for validation
 */
const PLATFORM_REQUIREMENTS = {
  spotify: {
    formats: ['wav', 'flac'],
    minBitDepth: 16,
    minSampleRate: 44100,
    maxFileSize: 1024 * 1024 * 1024,
    loudness: { target: -14, tolerance: 2 }
  },
  apple_music: {
    formats: ['wav', 'aiff'],
    minBitDepth: 16,
    minSampleRate: 44100,
    maxFileSize: 2 * 1024 * 1024 * 1024,
    loudness: { target: -16, tolerance: 1 }
  },
  youtube_music: {
    formats: ['wav', 'mp3'],
    minBitDepth: 16,
    minSampleRate: 44100,
    maxFileSize: 512 * 1024 * 1024,
    loudness: { target: -13, tolerance: 3 }
  },
  tidal: {
    formats: ['flac', 'wav'],
    minBitDepth: 16,
    minSampleRate: 44100,
    maxFileSize: 2 * 1024 * 1024 * 1024,
    loudness: { target: -18, tolerance: 1 }
  },
  amazon_music: {
    formats: ['wav', 'flac'],
    minBitDepth: 16,
    minSampleRate: 44100,
    maxFileSize: 1024 * 1024 * 1024,
    loudness: { target: -14, tolerance: 2 }
  },
  bandcamp: {
    formats: ['wav', 'flac', 'mp3'],
    minBitDepth: 16,
    minSampleRate: 44100,
    maxFileSize: 500 * 1024 * 1024,
    loudness: { target: -16, tolerance: 4 }
  }
};

/**
 * Create export routes
 * @param {Object} options - Route options
 * @returns {express.Router}
 */
function createExportRoutes(options = {}) {
  const router = express.Router();
  const { requireAuth, requireCapability } = options.middleware || {};

  /**
   * POST /exports/validate
   * Validate export configurations against platform requirements
   */
  router.post('/validate', requireAuth?.() || ((req, res, next) => next()), async (req, res) => {
    try {
      const { configs } = req.body;

      if (!Array.isArray(configs) || configs.length === 0) {
        return res.status(400).json({
          error: 'Export configurations required',
          category: 'PROCESSING'
        });
      }

      const results = configs.map(config => {
        const platform = PLATFORM_REQUIREMENTS[config.platformId];
        
        if (!platform) {
          return {
            platformId: config.platformId,
            valid: false,
            errors: [`Unknown platform: ${config.platformId}`],
            warnings: []
          };
        }

        const errors = [];
        const warnings = [];

        // Validate format
        if (!platform.formats.includes(config.format)) {
          errors.push(`Format '${config.format}' not supported. Use: ${platform.formats.join(', ')}`);
        }

        // Validate bit depth
        if (config.bitDepth < platform.minBitDepth) {
          errors.push(`Bit depth ${config.bitDepth} below minimum ${platform.minBitDepth}`);
        }

        // Validate sample rate
        if (config.sampleRate < platform.minSampleRate) {
          errors.push(`Sample rate ${config.sampleRate}Hz below minimum ${platform.minSampleRate}Hz`);
        }

        // Validate loudness target
        const loudnessDiff = Math.abs(config.loudnessTarget - platform.loudness.target);
        if (loudnessDiff > platform.loudness.tolerance) {
          warnings.push(
            `Loudness target ${config.loudnessTarget} LUFS is outside recommended range ` +
            `(${platform.loudness.target} ± ${platform.loudness.tolerance} LUFS)`
          );
        }

        return {
          platformId: config.platformId,
          valid: errors.length === 0,
          errors,
          warnings
        };
      });

      res.json({ results });

    } catch (error) {
      console.error('Export validation error:', error);
      res.status(500).json({
        error: 'Validation failed',
        category: 'SYSTEM'
      });
    }
  });

  /**
   * POST /exports/start
   * Initiate export jobs for validated configurations
   */
  router.post('/start', requireAuth?.() || ((req, res, next) => next()), async (req, res) => {
    try {
      const { configs } = req.body;

      if (!Array.isArray(configs) || configs.length === 0) {
        return res.status(400).json({
          error: 'Export configurations required',
          category: 'PROCESSING'
        });
      }

      // Validate all configs first
      const invalidConfigs = configs.filter(config => {
        const platform = PLATFORM_REQUIREMENTS[config.platformId];
        if (!platform) return true;
        if (!platform.formats.includes(config.format)) return true;
        if (config.bitDepth < platform.minBitDepth) return true;
        if (config.sampleRate < platform.minSampleRate) return true;
        return false;
      });

      if (invalidConfigs.length > 0) {
        return res.status(400).json({
          error: 'Invalid export configurations',
          invalidPlatforms: invalidConfigs.map(c => c.platformId),
          category: 'PROCESSING'
        });
      }

      // Generate export ID
      const exportId = `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // In production, this would create jobs for each platform
      // For now, return success with export ID
      res.json({
        exportId,
        status: 'queued',
        platforms: configs.map(c => c.platformId),
        message: `Export queued for ${configs.length} platform(s)`
      });

    } catch (error) {
      console.error('Export start error:', error);
      res.status(500).json({
        error: 'Failed to start export',
        category: 'SYSTEM'
      });
    }
  });

  /**
   * GET /exports/:id
   * Get export status
   */
  router.get('/:id', requireAuth?.() || ((req, res, next) => next()), async (req, res) => {
    try {
      const { id } = req.params;

      // In production, this would fetch from database
      // For now, return mock status
      res.json({
        exportId: id,
        status: 'processing',
        progress: 45,
        platforms: [
          { platformId: 'spotify', status: 'completed', progress: 100 },
          { platformId: 'apple_music', status: 'processing', progress: 60 },
          { platformId: 'youtube_music', status: 'queued', progress: 0 }
        ],
        createdAt: new Date().toISOString()
      });

    } catch (error) {
      console.error('Export status error:', error);
      res.status(500).json({
        error: 'Failed to get export status',
        category: 'SYSTEM'
      });
    }
  });

  return router;
}

module.exports = { createExportRoutes };
