import React, { useState, useEffect } from 'react';
import { FormField } from '../FormField';
import './PlatformExports.css';

interface Platform {
  id: string;
  name: string;
  requirements: {
    formats: string[];
    minBitDepth: number;
    minSampleRate: number;
    maxFileSize: number;
    loudness: {
      target: number;
      tolerance: number;
    };
    metadata: string[];
  };
}

interface ExportConfig {
  platformId: string;
  format: string;
  bitDepth: number;
  sampleRate: number;
  loudnessTarget: number;
  metadata: Record<string, string>;
  enabled: boolean;
}

interface PlatformExportsProps {
  selectedAssets?: string[];
  onExportConfigChange?: (configs: ExportConfig[]) => void;
  onStartExport?: (configs: ExportConfig[]) => void;
  disabled?: boolean;
}

const PLATFORMS: Record<string, Platform> = {
  spotify: {
    id: 'spotify',
    name: 'Spotify',
    requirements: {
      formats: ['wav', 'flac'],
      minBitDepth: 16,
      minSampleRate: 44100,
      maxFileSize: 1024 * 1024 * 1024,
      loudness: { target: -14, tolerance: 2 },
      metadata: ['title', 'artist', 'album', 'isrc', 'genre']
    }
  },
  apple_music: {
    id: 'apple_music',
    name: 'Apple Music',
    requirements: {
      formats: ['wav', 'aiff'],
      minBitDepth: 16,
      minSampleRate: 44100,
      maxFileSize: 2 * 1024 * 1024 * 1024,
      loudness: { target: -16, tolerance: 1 },
      metadata: ['title', 'artist', 'album', 'isrc', 'genre', 'copyright']
    }
  },
  youtube_music: {
    id: 'youtube_music',
    name: 'YouTube Music',
    requirements: {
      formats: ['wav', 'mp3'],
      minBitDepth: 16,
      minSampleRate: 44100,
      maxFileSize: 512 * 1024 * 1024,
      loudness: { target: -13, tolerance: 3 },
      metadata: ['title', 'artist', 'album', 'genre']
    }
  },
  tidal: {
    id: 'tidal',
    name: 'Tidal',
    requirements: {
      formats: ['flac', 'wav'],
      minBitDepth: 16,
      minSampleRate: 44100,
      maxFileSize: 2 * 1024 * 1024 * 1024,
      loudness: { target: -18, tolerance: 1 },
      metadata: ['title', 'artist', 'album', 'isrc', 'genre', 'credits']
    }
  },
  amazon_music: {
    id: 'amazon_music',
    name: 'Amazon Music',
    requirements: {
      formats: ['wav', 'flac'],
      minBitDepth: 16,
      minSampleRate: 44100,
      maxFileSize: 1024 * 1024 * 1024,
      loudness: { target: -14, tolerance: 2 },
      metadata: ['title', 'artist', 'album', 'isrc', 'genre', 'asin']
    }
  },
  bandcamp: {
    id: 'bandcamp',
    name: 'Bandcamp',
    requirements: {
      formats: ['wav', 'flac', 'mp3'],
      minBitDepth: 16,
      minSampleRate: 44100,
      maxFileSize: 500 * 1024 * 1024,
      loudness: { target: -16, tolerance: 4 },
      metadata: ['title', 'artist', 'album', 'genre', 'tags']
    }
  }
};

const SAMPLE_RATES = [44100, 48000, 88200, 96000, 192000];
const BIT_DEPTHS = [16, 24, 32];

export const PlatformExports: React.FC<PlatformExportsProps> = ({
  selectedAssets = [],
  onExportConfigChange,
  onStartExport,
  disabled = false
}) => {
  const [exportConfigs, setExportConfigs] = useState<ExportConfig[]>([]);
  const [globalMetadata, setGlobalMetadata] = useState<Record<string, string>>({
    title: '',
    artist: '',
    album: '',
    genre: '',
    isrc: '',
    copyright: '',
    credits: '',
    asin: '',
    tags: ''
  });
  const [presetMode, setPresetMode] = useState<'streaming' | 'broadcast' | 'custom'>('streaming');

  useEffect(() => {
    // Initialize export configs based on preset mode
    initializeConfigs();
  }, [presetMode]);

  useEffect(() => {
    if (onExportConfigChange) {
      onExportConfigChange(exportConfigs);
    }
  }, [exportConfigs, onExportConfigChange]);

  const initializeConfigs = () => {
    const configs: ExportConfig[] = Object.values(PLATFORMS).map(platform => {
      let config: ExportConfig;

      switch (presetMode) {
        case 'streaming':
          config = {
            platformId: platform.id,
            format: platform.requirements.formats.includes('wav') ? 'wav' : platform.requirements.formats[0],
            bitDepth: 24,
            sampleRate: 48000,
            loudnessTarget: platform.requirements.loudness.target,
            metadata: { ...globalMetadata },
            enabled: ['spotify', 'apple_music', 'youtube_music'].includes(platform.id)
          };
          break;

        case 'broadcast':
          config = {
            platformId: platform.id,
            format: platform.requirements.formats.includes('wav') ? 'wav' : platform.requirements.formats[0],
            bitDepth: 24,
            sampleRate: 48000,
            loudnessTarget: -23, // EBU R128 standard
            metadata: { ...globalMetadata },
            enabled: false
          };
          break;

        case 'custom':
        default:
          config = {
            platformId: platform.id,
            format: platform.requirements.formats[0],
            bitDepth: platform.requirements.minBitDepth,
            sampleRate: platform.requirements.minSampleRate,
            loudnessTarget: platform.requirements.loudness.target,
            metadata: { ...globalMetadata },
            enabled: false
          };
      }

      return config;
    });

    setExportConfigs(configs);
  };

  const updateConfig = (platformId: string, updates: Partial<ExportConfig>) => {
    setExportConfigs(prev => prev.map(config =>
      config.platformId === platformId ? { ...config, ...updates } : config
    ));
  };

  const updateGlobalMetadata = (field: string, value: string) => {
    const updated = { ...globalMetadata, [field]: value };
    setGlobalMetadata(updated);

    // Update all configs with new metadata
    setExportConfigs(prev => prev.map(config => ({
      ...config,
      metadata: { ...config.metadata, [field]: value }
    })));
  };

  const togglePlatform = (platformId: string) => {
    updateConfig(platformId, { 
      enabled: !exportConfigs.find(c => c.platformId === platformId)?.enabled 
    });
  };

  const validateConfig = (config: ExportConfig) => {
    const platform = PLATFORMS[config.platformId];
    const issues = [];

    // Check format support
    if (!platform.requirements.formats.includes(config.format)) {
      issues.push(`Format ${config.format} not supported`);
    }

    // Check bit depth
    if (config.bitDepth < platform.requirements.minBitDepth) {
      issues.push(`Bit depth ${config.bitDepth} below minimum ${platform.requirements.minBitDepth}`);
    }

    // Check sample rate
    if (config.sampleRate < platform.requirements.minSampleRate) {
      issues.push(`Sample rate ${config.sampleRate}Hz below minimum ${platform.requirements.minSampleRate}Hz`);
    }

    // Check loudness target
    const diff = Math.abs(config.loudnessTarget - platform.requirements.loudness.target);
    if (diff > platform.requirements.loudness.tolerance) {
      issues.push(`Loudness target outside tolerance (${platform.requirements.loudness.target}±${platform.requirements.loudness.tolerance} LUFS)`);
    }

    // Check required metadata
    const missingMetadata = platform.requirements.metadata.filter(
      field => !config.metadata[field]?.trim()
    );
    if (missingMetadata.length > 0) {
      issues.push(`Missing metadata: ${missingMetadata.join(', ')}`);
    }

    return issues;
  };

  const handleStartExport = () => {
    const enabledConfigs = exportConfigs.filter(c => c.enabled);
    
    if (enabledConfigs.length === 0) {
      alert('Please select at least one platform for export');
      return;
    }

    const invalidConfigs = enabledConfigs.filter(c => validateConfig(c).length > 0);
    if (invalidConfigs.length > 0) {
      const platformNames = invalidConfigs.map(c => PLATFORMS[c.platformId].name).join(', ');
      alert(`Please fix validation issues for: ${platformNames}`);
      return;
    }

    if (onStartExport) {
      onStartExport(enabledConfigs);
    }
  };

  const enabledCount = exportConfigs.filter(c => c.enabled).length;
  const formatFileSize = (bytes: number) => {
    const mb = bytes / 1024 / 1024;
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
  };

  const getPlatformIcon = (platformId: string) => {
    const icons: Record<string, string> = {
      spotify: '🎵',
      apple_music: '🍎',
      youtube_music: '📺',
      tidal: '🌊',
      amazon_music: '📦',
      bandcamp: '🎪'
    };
    return icons[platformId] || '🎵';
  };

  return (
    <div className="platform-exports">
      <div className="exports-header">
        <h3 className="text-heading">Platform Distribution</h3>
        <p className="text-caption">
          Configure exports for {selectedAssets.length} selected asset(s)
        </p>
      </div>

      <div className="preset-selector">
        <div className="preset-options">
          <button
            className={`preset-option ${presetMode === 'streaming' ? 'active' : ''}`}
            onClick={() => setPresetMode('streaming')}
            disabled={disabled}
          >
            🎵 Streaming Optimized
          </button>
          <button
            className={`preset-option ${presetMode === 'broadcast' ? 'active' : ''}`}
            onClick={() => setPresetMode('broadcast')}
            disabled={disabled}
          >
            📺 Broadcast Standard
          </button>
          <button
            className={`preset-option ${presetMode === 'custom' ? 'active' : ''}`}
            onClick={() => setPresetMode('custom')}
            disabled={disabled}
          >
            ⚙️ Custom Configuration
          </button>
        </div>
      </div>

      <div className="global-metadata">
        <h4>Global Metadata</h4>
        <div className="metadata-grid">
          <FormField label="Title">
            <input
              type="text"
              value={globalMetadata.title}
              onChange={(e) => updateGlobalMetadata('title', e.target.value)}
              disabled={disabled}
            />
          </FormField>

          <FormField label="Artist">
            <input
              type="text"
              value={globalMetadata.artist}
              onChange={(e) => updateGlobalMetadata('artist', e.target.value)}
              disabled={disabled}
            />
          </FormField>

          <FormField label="Album">
            <input
              type="text"
              value={globalMetadata.album}
              onChange={(e) => updateGlobalMetadata('album', e.target.value)}
              disabled={disabled}
            />
          </FormField>

          <FormField label="Genre">
            <input
              type="text"
              value={globalMetadata.genre}
              onChange={(e) => updateGlobalMetadata('genre', e.target.value)}
              disabled={disabled}
            />
          </FormField>

          <FormField label="ISRC Code">
            <input
              type="text"
              value={globalMetadata.isrc}
              onChange={(e) => updateGlobalMetadata('isrc', e.target.value.toUpperCase())}
              placeholder="US-ABC-12-34567"
              disabled={disabled}
            />
          </FormField>

          <FormField label="Copyright">
            <input
              type="text"
              value={globalMetadata.copyright}
              onChange={(e) => updateGlobalMetadata('copyright', e.target.value)}
              disabled={disabled}
            />
          </FormField>
        </div>
      </div>

      <div className="platform-configs">
        <div className="configs-header">
          <h4>Platform Configurations</h4>
          <div className="summary">
            {enabledCount} of {Object.keys(PLATFORMS).length} platforms selected
          </div>
        </div>

        <div className="platform-list">
          {exportConfigs.map(config => {
            const platform = PLATFORMS[config.platformId];
            const validationIssues = validateConfig(config);
            const hasIssues = validationIssues.length > 0;

            return (
              <div 
                key={config.platformId}
                className={`platform-item ${config.enabled ? 'enabled' : 'disabled'} ${hasIssues ? 'invalid' : 'valid'}`}
              >
                <div className="platform-header">
                  <div className="platform-info">
                    <span className="platform-icon">{getPlatformIcon(config.platformId)}</span>
                    <span className="platform-name">{platform.name}</span>
                    <div className="platform-toggle">
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={config.enabled}
                          onChange={() => togglePlatform(config.platformId)}
                          disabled={disabled}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                  </div>

                  {config.enabled && (
                    <div className="platform-summary">
                      {config.format.toUpperCase()} • {config.sampleRate / 1000}kHz/{config.bitDepth}bit • {config.loudnessTarget} LUFS
                    </div>
                  )}
                </div>

                {config.enabled && (
                  <div className="platform-details">
                    <div className="config-grid">
                      <FormField label="Format">
                        <select
                          value={config.format}
                          onChange={(e) => updateConfig(config.platformId, { format: e.target.value })}
                          disabled={disabled}
                        >
                          {platform.requirements.formats.map(format => (
                            <option key={format} value={format}>
                              {format.toUpperCase()}
                            </option>
                          ))}
                        </select>
                      </FormField>

                      <FormField label="Sample Rate">
                        <select
                          value={config.sampleRate}
                          onChange={(e) => updateConfig(config.platformId, { sampleRate: parseInt(e.target.value) })}
                          disabled={disabled}
                        >
                          {SAMPLE_RATES.filter(sr => sr >= platform.requirements.minSampleRate).map(rate => (
                            <option key={rate} value={rate}>
                              {(rate / 1000).toFixed(1)} kHz
                            </option>
                          ))}
                        </select>
                      </FormField>

                      <FormField label="Bit Depth">
                        <select
                          value={config.bitDepth}
                          onChange={(e) => updateConfig(config.platformId, { bitDepth: parseInt(e.target.value) })}
                          disabled={disabled}
                        >
                          {BIT_DEPTHS.filter(bd => bd >= platform.requirements.minBitDepth).map(depth => (
                            <option key={depth} value={depth}>
                              {depth}-bit
                            </option>
                          ))}
                        </select>
                      </FormField>

                      <FormField label="Loudness Target">
                        <input
                          type="number"
                          step="0.1"
                          value={config.loudnessTarget}
                          onChange={(e) => updateConfig(config.platformId, { loudnessTarget: parseFloat(e.target.value) })}
                          disabled={disabled}
                        />
                      </FormField>
                    </div>

                    <div className="platform-requirements">
                      <span className="requirements-label">Requirements:</span>
                      <span className="requirements-text">
                        Max {formatFileSize(platform.requirements.maxFileSize)} • 
                        {platform.requirements.loudness.target}±{platform.requirements.loudness.tolerance} LUFS •
                        Min {platform.requirements.minSampleRate / 1000}kHz/{platform.requirements.minBitDepth}bit
                      </span>
                    </div>

                    {hasIssues && (
                      <div className="validation-issues">
                        <div className="issues-header">⚠️ Validation Issues:</div>
                        <ul className="issues-list">
                          {validationIssues.map((issue, index) => (
                            <li key={index}>{issue}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="export-actions">
        <div className="export-summary">
          <span className="summary-text">
            Ready to export to {enabledCount} platform(s)
          </span>
        </div>
        <button
          onClick={handleStartExport}
          disabled={disabled || enabledCount === 0}
          className="btn-primary export-btn"
        >
          Start Distribution
        </button>
      </div>
    </div>
  );
};