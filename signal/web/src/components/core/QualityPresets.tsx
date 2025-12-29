import React, { useState, useEffect } from 'react';
import { FormField } from './FormField';
import './QualityPresets.css';

interface QualityConfig {
  name: string;
  description: string;
  targets: {
    loudness: number; // LUFS
    truePeak: number; // dBTP
    lra: number; // LU (Loudness Range)
    dynamicRange: number; // DR
  };
  processing: {
    normalize: boolean;
    limitTruePeak: boolean;
    gating: 'ebu' | 'rms' | 'peak';
    dithering: boolean;
    fadeIn: number; // ms
    fadeOut: number; // ms
  };
  export: {
    format: 'wav' | 'aiff' | 'mp3' | 'flac';
    bitDepth: 16 | 24 | 32;
    sampleRate: number;
    compression?: {
      algorithm: string;
      quality: number;
    };
  };
}

interface QualityPresetsProps {
  selectedPreset?: string;
  customConfig?: Partial<QualityConfig>;
  onPresetChange?: (preset: string, config: QualityConfig) => void;
  onCustomChange?: (config: Partial<QualityConfig>) => void;
  disabled?: boolean;
}

const BUILTIN_PRESETS: Record<string, QualityConfig> = {
  'streaming-loud': {
    name: 'Streaming (Loud)',
    description: 'Optimized for streaming platforms with competitive loudness',
    targets: {
      loudness: -14,
      truePeak: -1,
      lra: 7,
      dynamicRange: 8
    },
    processing: {
      normalize: true,
      limitTruePeak: true,
      gating: 'ebu',
      dithering: true,
      fadeIn: 0,
      fadeOut: 500
    },
    export: {
      format: 'wav',
      bitDepth: 24,
      sampleRate: 44100
    }
  },
  'streaming-dynamic': {
    name: 'Streaming (Dynamic)',
    description: 'Preserves dynamics for audiophile streaming',
    targets: {
      loudness: -16,
      truePeak: -1,
      lra: 12,
      dynamicRange: 14
    },
    processing: {
      normalize: true,
      limitTruePeak: true,
      gating: 'ebu',
      dithering: true,
      fadeIn: 0,
      fadeOut: 500
    },
    export: {
      format: 'flac',
      bitDepth: 24,
      sampleRate: 48000
    }
  },
  'broadcast-tv': {
    name: 'Broadcast TV',
    description: 'EBU R128 compliant for television broadcast',
    targets: {
      loudness: -23,
      truePeak: -1,
      lra: 20,
      dynamicRange: 15
    },
    processing: {
      normalize: true,
      limitTruePeak: true,
      gating: 'ebu',
      dithering: true,
      fadeIn: 100,
      fadeOut: 1000
    },
    export: {
      format: 'wav',
      bitDepth: 24,
      sampleRate: 48000
    }
  },
  'podcast': {
    name: 'Podcast',
    description: 'Speech-optimized with consistent loudness',
    targets: {
      loudness: -19,
      truePeak: -1,
      lra: 8,
      dynamicRange: 10
    },
    processing: {
      normalize: true,
      limitTruePeak: true,
      gating: 'rms',
      dithering: true,
      fadeIn: 0,
      fadeOut: 2000
    },
    export: {
      format: 'mp3',
      bitDepth: 16,
      sampleRate: 44100,
      compression: {
        algorithm: 'mp3',
        quality: 320
      }
    }
  },
  'mastering': {
    name: 'Mastering Reference',
    description: 'High-resolution reference for mastering',
    targets: {
      loudness: -18,
      truePeak: -0.1,
      lra: 15,
      dynamicRange: 18
    },
    processing: {
      normalize: false,
      limitTruePeak: false,
      gating: 'ebu',
      dithering: false,
      fadeIn: 0,
      fadeOut: 0
    },
    export: {
      format: 'wav',
      bitDepth: 32,
      sampleRate: 96000
    }
  },
  'vinyl-prep': {
    name: 'Vinyl Preparation',
    description: 'Optimized for vinyl cutting with phase coherence',
    targets: {
      loudness: -20,
      truePeak: -3,
      lra: 10,
      dynamicRange: 12
    },
    processing: {
      normalize: true,
      limitTruePeak: true,
      gating: 'peak',
      dithering: true,
      fadeIn: 500,
      fadeOut: 3000
    },
    export: {
      format: 'wav',
      bitDepth: 24,
      sampleRate: 44100
    }
  }
};

export const QualityPresets: React.FC<QualityPresetsProps> = ({
  selectedPreset = '',
  customConfig,
  onPresetChange,
  onCustomChange,
  disabled = false
}) => {
  const [activePreset, setActivePreset] = useState(selectedPreset);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [config, setConfig] = useState<Partial<QualityConfig>>(customConfig || {});

  useEffect(() => {
    if (selectedPreset && BUILTIN_PRESETS[selectedPreset]) {
      setActivePreset(selectedPreset);
      setIsCustomMode(false);
    }
  }, [selectedPreset]);

  const handlePresetSelect = (presetKey: string) => {
    if (disabled) return;
    
    const preset = BUILTIN_PRESETS[presetKey];
    if (preset) {
      setActivePreset(presetKey);
      setIsCustomMode(false);
      if (onPresetChange) {
        onPresetChange(presetKey, preset);
      }
    }
  };

  const handleCustomMode = () => {
    if (disabled) return;
    
    setIsCustomMode(true);
    setActivePreset('');
    
    // Start with streaming-loud as base for custom
    const baseConfig = BUILTIN_PRESETS['streaming-loud'];
    setConfig(baseConfig);
    
    if (onCustomChange) {
      onCustomChange(baseConfig);
    }
  };

  const updateCustomConfig = (path: string[], value: any) => {
    if (disabled) return;
    
    const newConfig = { ...config };
    let current: any = newConfig;
    
    for (let i = 0; i < path.length - 1; i++) {
      if (!current[path[i]]) {
        current[path[i]] = {};
      }
      current = current[path[i]];
    }
    
    current[path[path.length - 1]] = value;
    setConfig(newConfig);
    
    if (onCustomChange) {
      onCustomChange(newConfig);
    }
  };

  const formatPresetStats = (preset: QualityConfig) => {
    return [
      `${preset.targets.loudness} LUFS`,
      `${preset.targets.truePeak} dBTP`,
      `DR${preset.targets.dynamicRange}`,
      `${preset.export.sampleRate / 1000}kHz/${preset.export.bitDepth}bit`
    ].join(' • ');
  };

  return (
    <div className="quality-presets">
      <div className="presets-header">
        <h3 className="text-heading">Quality Presets</h3>
        <p className="text-caption">
          Choose a preset optimized for your target platform
        </p>
      </div>

      <div className="preset-grid">
        {Object.entries(BUILTIN_PRESETS).map(([key, preset]) => (
          <div
            key={key}
            className={`preset-card ${activePreset === key ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
            onClick={() => handlePresetSelect(key)}
          >
            <div className="preset-name">{preset.name}</div>
            <div className="preset-description">{preset.description}</div>
            <div className="preset-stats">{formatPresetStats(preset)}</div>
          </div>
        ))}
        
        <div
          className={`preset-card custom ${isCustomMode ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
          onClick={handleCustomMode}
        >
          <div className="preset-name">Custom Settings</div>
          <div className="preset-description">Manual configuration for specific requirements</div>
          <div className="preset-stats">⚙️ Advanced</div>
        </div>
      </div>

      {isCustomMode && config && (
        <div className="custom-config">
          <div className="config-section">
            <h4>Loudness Targets</h4>
            <div className="config-grid">
              <FormField label="Target Loudness (LUFS)">
                <input
                  type="number"
                  step="0.1"
                  value={config.targets?.loudness || -14}
                  onChange={(e) => updateCustomConfig(['targets', 'loudness'], parseFloat(e.target.value))}
                  disabled={disabled}
                />
              </FormField>
              
              <FormField label="True Peak (dBTP)">
                <input
                  type="number"
                  step="0.1"
                  value={config.targets?.truePeak || -1}
                  onChange={(e) => updateCustomConfig(['targets', 'truePeak'], parseFloat(e.target.value))}
                  disabled={disabled}
                />
              </FormField>
              
              <FormField label="Loudness Range (LU)">
                <input
                  type="number"
                  step="0.1"
                  value={config.targets?.lra || 7}
                  onChange={(e) => updateCustomConfig(['targets', 'lra'], parseFloat(e.target.value))}
                  disabled={disabled}
                />
              </FormField>
              
              <FormField label="Dynamic Range (DR)">
                <input
                  type="number"
                  step="1"
                  value={config.targets?.dynamicRange || 8}
                  onChange={(e) => updateCustomConfig(['targets', 'dynamicRange'], parseInt(e.target.value))}
                  disabled={disabled}
                />
              </FormField>
            </div>
          </div>

          <div className="config-section">
            <h4>Processing Options</h4>
            <div className="config-grid">
              <FormField label="Normalization">
                <select
                  value={config.processing?.normalize ? 'true' : 'false'}
                  onChange={(e) => updateCustomConfig(['processing', 'normalize'], e.target.value === 'true')}
                  disabled={disabled}
                >
                  <option value="true">Enable</option>
                  <option value="false">Disable</option>
                </select>
              </FormField>
              
              <FormField label="Gating Method">
                <select
                  value={config.processing?.gating || 'ebu'}
                  onChange={(e) => updateCustomConfig(['processing', 'gating'], e.target.value)}
                  disabled={disabled}
                >
                  <option value="ebu">EBU R128</option>
                  <option value="rms">RMS</option>
                  <option value="peak">Peak</option>
                </select>
              </FormField>
              
              <FormField label="Fade In (ms)">
                <input
                  type="number"
                  step="100"
                  value={config.processing?.fadeIn || 0}
                  onChange={(e) => updateCustomConfig(['processing', 'fadeIn'], parseInt(e.target.value))}
                  disabled={disabled}
                />
              </FormField>
              
              <FormField label="Fade Out (ms)">
                <input
                  type="number"
                  step="100"
                  value={config.processing?.fadeOut || 500}
                  onChange={(e) => updateCustomConfig(['processing', 'fadeOut'], parseInt(e.target.value))}
                  disabled={disabled}
                />
              </FormField>
            </div>
          </div>

          <div className="config-section">
            <h4>Export Format</h4>
            <div className="config-grid">
              <FormField label="Format">
                <select
                  value={config.export?.format || 'wav'}
                  onChange={(e) => updateCustomConfig(['export', 'format'], e.target.value)}
                  disabled={disabled}
                >
                  <option value="wav">WAV</option>
                  <option value="aiff">AIFF</option>
                  <option value="flac">FLAC</option>
                  <option value="mp3">MP3</option>
                </select>
              </FormField>
              
              <FormField label="Sample Rate (Hz)">
                <select
                  value={config.export?.sampleRate || 44100}
                  onChange={(e) => updateCustomConfig(['export', 'sampleRate'], parseInt(e.target.value))}
                  disabled={disabled}
                >
                  <option value="44100">44.1 kHz</option>
                  <option value="48000">48 kHz</option>
                  <option value="88200">88.2 kHz</option>
                  <option value="96000">96 kHz</option>
                  <option value="192000">192 kHz</option>
                </select>
              </FormField>
              
              <FormField label="Bit Depth">
                <select
                  value={config.export?.bitDepth || 24}
                  onChange={(e) => updateCustomConfig(['export', 'bitDepth'], parseInt(e.target.value))}
                  disabled={disabled}
                >
                  <option value="16">16-bit</option>
                  <option value="24">24-bit</option>
                  <option value="32">32-bit Float</option>
                </select>
              </FormField>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};