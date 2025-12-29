import EventEmitter from 'events';
import { jobQueue, PRIORITY, JOB_TYPE } from './jobQueue.js';

/**
 * Platform configurations for music distribution
 */
export const PLATFORMS = {
  SPOTIFY: {
    id: 'spotify',
    name: 'Spotify',
    requirements: {
      formats: ['wav', 'flac'],
      minBitDepth: 16,
      minSampleRate: 44100,
      maxFileSize: 1024 * 1024 * 1024, // 1GB
      loudness: { target: -14, tolerance: 2 },
      metadata: ['title', 'artist', 'album', 'isrc', 'genre']
    },
    delivery: {
      endpoint: 'https://api.spotify.com/v1/upload',
      auth: 'oauth2',
      batchSize: 50
    }
  },
  APPLE_MUSIC: {
    id: 'apple_music',
    name: 'Apple Music',
    requirements: {
      formats: ['wav', 'aiff'],
      minBitDepth: 16,
      minSampleRate: 44100,
      maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB
      loudness: { target: -16, tolerance: 1 },
      metadata: ['title', 'artist', 'album', 'isrc', 'genre', 'copyright']
    },
    delivery: {
      endpoint: 'https://itunespartner.apple.com/api',
      auth: 'jwt',
      batchSize: 25
    }
  },
  YOUTUBE_MUSIC: {
    id: 'youtube_music',
    name: 'YouTube Music',
    requirements: {
      formats: ['wav', 'mp3'],
      minBitDepth: 16,
      minSampleRate: 44100,
      maxFileSize: 512 * 1024 * 1024, // 512MB
      loudness: { target: -13, tolerance: 3 },
      metadata: ['title', 'artist', 'album', 'genre']
    },
    delivery: {
      endpoint: 'https://www.googleapis.com/youtube/v3',
      auth: 'oauth2',
      batchSize: 100
    }
  },
  TIDAL: {
    id: 'tidal',
    name: 'Tidal',
    requirements: {
      formats: ['flac', 'wav'],
      minBitDepth: 16,
      minSampleRate: 44100,
      maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB
      loudness: { target: -18, tolerance: 1 },
      metadata: ['title', 'artist', 'album', 'isrc', 'genre', 'credits']
    },
    delivery: {
      endpoint: 'https://api.tidal.com/v1/content',
      auth: 'bearer',
      batchSize: 20
    }
  },
  AMAZON_MUSIC: {
    id: 'amazon_music',
    name: 'Amazon Music',
    requirements: {
      formats: ['wav', 'flac'],
      minBitDepth: 16,
      minSampleRate: 44100,
      maxFileSize: 1024 * 1024 * 1024, // 1GB
      loudness: { target: -14, tolerance: 2 },
      metadata: ['title', 'artist', 'album', 'isrc', 'genre', 'asin']
    },
    delivery: {
      endpoint: 'https://music.amazon.com/api/distributor',
      auth: 'aws_signature',
      batchSize: 30
    }
  },
  BANDCAMP: {
    id: 'bandcamp',
    name: 'Bandcamp',
    requirements: {
      formats: ['wav', 'flac', 'mp3'],
      minBitDepth: 16,
      minSampleRate: 44100,
      maxFileSize: 500 * 1024 * 1024, // 500MB
      loudness: { target: -16, tolerance: 4 },
      metadata: ['title', 'artist', 'album', 'genre', 'tags']
    },
    delivery: {
      endpoint: 'https://bandcamp.com/api/upload',
      auth: 'api_key',
      batchSize: 10
    }
  }
};

/**
 * Delivery status types
 */
export const DELIVERY_STATUS = {
  PENDING: 'pending',
  VALIDATING: 'validating',
  PROCESSING: 'processing',
  UPLOADING: 'uploading',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  REJECTED: 'rejected'
};

/**
 * Distribution and delivery management service
 */
export class DistributionManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.deliveries = new Map();
    this.platforms = { ...PLATFORMS };
    this.stats = {
      totalDeliveries: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      platformStats: {}
    };

    // Initialize platform stats
    Object.keys(this.platforms).forEach(platform => {
      this.stats.platformStats[platform] = {
        delivered: 0,
        failed: 0,
        pending: 0
      };
    });
  }

  /**
   * Create new delivery job
   */
  async createDelivery(config) {
    const delivery = {
      id: this.generateDeliveryId(),
      title: config.title || 'Untitled Delivery',
      assets: config.assets || [],
      platforms: config.platforms || [],
      metadata: config.metadata || {},
      options: config.options || {},
      status: DELIVERY_STATUS.PENDING,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      progress: 0,
      logs: [],
      platformDeliveries: {},
      errors: []
    };

    // Initialize platform deliveries
    for (const platformId of delivery.platforms) {
      delivery.platformDeliveries[platformId] = {
        status: DELIVERY_STATUS.PENDING,
        progress: 0,
        uploadId: null,
        url: null,
        error: null,
        validationResults: null,
        startedAt: null,
        completedAt: null
      };
    }

    this.deliveries.set(delivery.id, delivery);
    this.stats.totalDeliveries++;

    this.emit('delivery:created', delivery);
    
    // Start delivery process
    this.processDelivery(delivery.id);
    
    return delivery.id;
  }

  /**
   * Get delivery by ID
   */
  getDelivery(deliveryId) {
    return this.deliveries.get(deliveryId);
  }

  /**
   * Get all deliveries with filtering
   */
  getDeliveries(filter = {}) {
    let deliveries = Array.from(this.deliveries.values());

    if (filter.status) {
      deliveries = deliveries.filter(d => d.status === filter.status);
    }

    if (filter.platform) {
      deliveries = deliveries.filter(d => 
        d.platforms.includes(filter.platform)
      );
    }

    if (filter.limit) {
      deliveries = deliveries.slice(0, filter.limit);
    }

    return deliveries.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Cancel delivery
   */
  async cancelDelivery(deliveryId) {
    const delivery = this.deliveries.get(deliveryId);
    if (!delivery || delivery.status === DELIVERY_STATUS.DELIVERED) {
      return false;
    }

    delivery.status = DELIVERY_STATUS.FAILED;
    delivery.updatedAt = Date.now();
    delivery.errors.push('Delivery cancelled by user');

    this.emit('delivery:cancelled', delivery);
    return true;
  }

  /**
   * Process delivery workflow
   */
  async processDelivery(deliveryId) {
    const delivery = this.deliveries.get(deliveryId);
    if (!delivery) return;

    try {
      // Step 1: Validate assets and metadata
      await this.validateDelivery(delivery);
      
      // Step 2: Process assets for each platform
      await this.processAssets(delivery);
      
      // Step 3: Upload to platforms
      await this.uploadToPlatforms(delivery);
      
      // Mark as delivered
      delivery.status = DELIVERY_STATUS.DELIVERED;
      delivery.progress = 100;
      delivery.updatedAt = Date.now();
      
      this.stats.successfulDeliveries++;
      this.emit('delivery:completed', delivery);

    } catch (error) {
      delivery.status = DELIVERY_STATUS.FAILED;
      delivery.errors.push(error.message);
      delivery.updatedAt = Date.now();
      
      this.stats.failedDeliveries++;
      this.emit('delivery:failed', delivery);
    }
  }

  /**
   * Validate delivery against platform requirements
   */
  async validateDelivery(delivery) {
    delivery.status = DELIVERY_STATUS.VALIDATING;
    delivery.progress = 10;
    this.emit('delivery:progress', delivery);

    this.addLog(delivery, 'Starting validation process');

    for (const platformId of delivery.platforms) {
      const platform = this.platforms[platformId];
      if (!platform) {
        throw new Error(`Unknown platform: ${platformId}`);
      }

      const platformDelivery = delivery.platformDeliveries[platformId];
      platformDelivery.status = DELIVERY_STATUS.VALIDATING;

      // Validate metadata
      const missingMetadata = platform.requirements.metadata.filter(
        field => !delivery.metadata[field]
      );

      if (missingMetadata.length > 0) {
        platformDelivery.error = `Missing required metadata: ${missingMetadata.join(', ')}`;
        platformDelivery.status = DELIVERY_STATUS.FAILED;
        continue;
      }

      // Validate assets
      for (const asset of delivery.assets) {
        const validationResult = this.validateAsset(asset, platform);
        if (!validationResult.valid) {
          platformDelivery.error = validationResult.error;
          platformDelivery.status = DELIVERY_STATUS.FAILED;
          break;
        }
      }

      if (platformDelivery.status !== DELIVERY_STATUS.FAILED) {
        platformDelivery.status = DELIVERY_STATUS.PENDING;
        platformDelivery.validationResults = { valid: true };
        this.addLog(delivery, `${platform.name}: Validation passed`);
      } else {
        this.addLog(delivery, `${platform.name}: Validation failed - ${platformDelivery.error}`);
      }
    }

    delivery.progress = 25;
    this.emit('delivery:progress', delivery);
  }

  /**
   * Validate individual asset against platform
   */
  validateAsset(asset, platform) {
    const req = platform.requirements;

    // Check file format
    if (!req.formats.includes(asset.format)) {
      return {
        valid: false,
        error: `Format ${asset.format} not supported. Supported: ${req.formats.join(', ')}`
      };
    }

    // Check file size
    if (asset.fileSize > req.maxFileSize) {
      return {
        valid: false,
        error: `File size ${(asset.fileSize / 1024 / 1024).toFixed(1)}MB exceeds limit of ${(req.maxFileSize / 1024 / 1024).toFixed(1)}MB`
      };
    }

    // Check audio quality
    if (asset.bitDepth < req.minBitDepth) {
      return {
        valid: false,
        error: `Bit depth ${asset.bitDepth} below minimum ${req.minBitDepth}`
      };
    }

    if (asset.sampleRate < req.minSampleRate) {
      return {
        valid: false,
        error: `Sample rate ${asset.sampleRate}Hz below minimum ${req.minSampleRate}Hz`
      };
    }

    // Check loudness
    if (req.loudness && asset.loudness) {
      const diff = Math.abs(asset.loudness - req.loudness.target);
      if (diff > req.loudness.tolerance) {
        return {
          valid: false,
          error: `Loudness ${asset.loudness} LUFS outside tolerance (${req.loudness.target}±${req.loudness.tolerance} LUFS)`
        };
      }
    }

    return { valid: true };
  }

  /**
   * Process assets for platform-specific requirements
   */
  async processAssets(delivery) {
    delivery.status = DELIVERY_STATUS.PROCESSING;
    delivery.progress = 50;
    this.emit('delivery:progress', delivery);

    this.addLog(delivery, 'Processing assets for platforms');

    for (const platformId of delivery.platforms) {
      const platformDelivery = delivery.platformDeliveries[platformId];
      
      if (platformDelivery.status === DELIVERY_STATUS.FAILED) {
        continue;
      }

      platformDelivery.status = DELIVERY_STATUS.PROCESSING;
      platformDelivery.progress = 0;

      // Create processing job for each asset
      for (let i = 0; i < delivery.assets.length; i++) {
        const asset = delivery.assets[i];
        const platform = this.platforms[platformId];

        // Check if asset needs processing for this platform
        const needsProcessing = this.assetNeedsProcessing(asset, platform);
        
        if (needsProcessing) {
          const jobConfig = {
            type: JOB_TYPE.PROCESS,
            priority: PRIORITY.HIGH,
            data: {
              inputPath: asset.path,
              outputPath: `${asset.path}_${platformId}`,
              platformId: platformId,
              requirements: platform.requirements
            }
          };

          const jobId = jobQueue.addJob(jobConfig);
          this.addLog(delivery, `${platform.name}: Started processing job ${jobId} for ${asset.filename}`);
          
          // Wait for job completion (simplified for demo)
          await this.waitForJob(jobId);
        }

        platformDelivery.progress = ((i + 1) / delivery.assets.length) * 100;
      }

      platformDelivery.status = DELIVERY_STATUS.PENDING;
      this.addLog(delivery, `${platform.name}: Asset processing completed`);
    }

    delivery.progress = 75;
    this.emit('delivery:progress', delivery);
  }

  /**
   * Check if asset needs processing for platform
   */
  assetNeedsProcessing(asset, platform) {
    const req = platform.requirements;
    
    // Check if format conversion needed
    if (!req.formats.includes(asset.format)) {
      return true;
    }

    // Check if loudness adjustment needed
    if (req.loudness && asset.loudness) {
      const diff = Math.abs(asset.loudness - req.loudness.target);
      if (diff > 0.1) { // Needs adjustment
        return true;
      }
    }

    return false;
  }

  /**
   * Upload to platforms
   */
  async uploadToPlatforms(delivery) {
    delivery.status = DELIVERY_STATUS.UPLOADING;
    this.emit('delivery:progress', delivery);

    this.addLog(delivery, 'Starting uploads to platforms');

    for (const platformId of delivery.platforms) {
      const platformDelivery = delivery.platformDeliveries[platformId];
      
      if (platformDelivery.status === DELIVERY_STATUS.FAILED) {
        continue;
      }

      try {
        await this.uploadToPlatform(delivery, platformId);
        
        platformDelivery.status = DELIVERY_STATUS.DELIVERED;
        platformDelivery.completedAt = Date.now();
        
        this.stats.platformStats[platformId].delivered++;
        this.addLog(delivery, `${this.platforms[platformId].name}: Upload completed successfully`);

      } catch (error) {
        platformDelivery.status = DELIVERY_STATUS.FAILED;
        platformDelivery.error = error.message;
        
        this.stats.platformStats[platformId].failed++;
        this.addLog(delivery, `${this.platforms[platformId].name}: Upload failed - ${error.message}`);
      }
    }

    delivery.progress = 100;
    this.emit('delivery:progress', delivery);
  }

  /**
   * Upload to specific platform
   */
  async uploadToPlatform(delivery, platformId) {
    const platform = this.platforms[platformId];
    const platformDelivery = delivery.platformDeliveries[platformId];
    
    platformDelivery.status = DELIVERY_STATUS.UPLOADING;
    platformDelivery.startedAt = Date.now();

    // Simulate upload process
    await this.sleep(2000 + Math.random() * 3000);

    // Simulate upload success/failure
    if (Math.random() > 0.9) { // 10% failure rate for demo
      throw new Error('Network timeout during upload');
    }

    // Generate mock upload response
    platformDelivery.uploadId = `${platformId}_${Date.now()}`;
    platformDelivery.url = `https://${platformId}.example.com/release/${platformDelivery.uploadId}`;
    platformDelivery.progress = 100;
  }

  /**
   * Wait for job completion (simplified for demo)
   */
  async waitForJob(jobId) {
    return new Promise((resolve) => {
      const checkJob = () => {
        const job = jobQueue.getJob(jobId);
        if (!job || job.state === 'completed' || job.state === 'failed') {
          resolve(job);
        } else {
          setTimeout(checkJob, 1000);
        }
      };
      checkJob();
    });
  }

  /**
   * Add log entry to delivery
   */
  addLog(delivery, message) {
    delivery.logs.push({
      timestamp: Date.now(),
      message
    });
  }

  /**
   * Get delivery statistics
   */
  getStats() {
    return {
      ...this.stats,
      totalPending: Array.from(this.deliveries.values())
        .filter(d => d.status === DELIVERY_STATUS.PENDING).length,
      totalInProgress: Array.from(this.deliveries.values())
        .filter(d => [DELIVERY_STATUS.VALIDATING, DELIVERY_STATUS.PROCESSING, DELIVERY_STATUS.UPLOADING]
          .includes(d.status)).length
    };
  }

  /**
   * Generate unique delivery ID
   */
  generateDeliveryId() {
    return `delivery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Utility sleep function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const distributionManager = new DistributionManager();