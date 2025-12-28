/**
 * Dashboard One - Transform View
 * 
 * Submit processing jobs with preset selection and parameter configuration.
 * Per STUDIOOS_FUNCTIONAL_SPECS.md Section 4.4
 */

import { useEffect, useState } from 'react';
import { useProjects, useAssets, usePresets, studioOS } from '../../api';
import type { Asset, Preset } from '../../api';

interface TransformViewProps {
  projectId?: number | null;
  role: 'BASIC' | 'STANDARD' | 'ADVANCED';
  onNavigate: (view: string, id?: number) => void;
}

export function TransformView({ projectId: _projectId, role, onNavigate }: TransformViewProps) {
  const { data: projectsResponse, loading: loadingProjects } = useProjects();
  const { data: presetsData, loading: loadingPresets } = usePresets();
  const projects = projectsResponse?.data || [];
  const presets: Preset[] = presetsData || [];
  
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<number[]>([]);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [parameters, setParameters] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  // Fetch assets for selected project
  const { data: assetsResponse, loading: loadingAssets } = useAssets(selectedProjectId);
  const allAssets = assetsResponse?.data || [];
  // Filter out Final assets - they cannot be used as job inputs
  const assets: Asset[] = allAssets.filter((a: Asset) => a.category !== 'FINAL');

  // Role-based parameter access
  const canAdjustParameters = role === 'STANDARD' || role === 'ADVANCED';
  const hasFullParameters = role === 'ADVANCED';

  // Select first project by default
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const handleAssetToggle = (assetId: number) => {
    setSelectedAssetIds(prev => 
      prev.includes(assetId) 
        ? prev.filter(id => id !== assetId)
        : [...prev, assetId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedProjectId || !selectedPreset || selectedAssetIds.length === 0) {
      setError('Please select a project, preset, and at least one asset.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess(false);

    try {
      await studioOS.submitJob({
        projectId: selectedProjectId,
        preset: selectedPreset,
        parameters: canAdjustParameters ? parameters : undefined,
        assetIds: selectedAssetIds
      });

      setSuccess(true);
      setSelectedAssetIds([]);
      setSelectedPreset('');
      setParameters({});
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit job');
    } finally {
      setSubmitting(false);
    }
  };

  const loading = loadingProjects || loadingPresets;

  if (loading) {
    return <div className="view-loading">Loading...</div>;
  }

  return (
    <div className="transform-view">
      <h2>Transform</h2>

      <form onSubmit={handleSubmit}>
        {/* Project Selection */}
        <div className="form-group">
          <label>Project</label>
          <select 
            value={selectedProjectId || ''} 
            onChange={(e) => {
              setSelectedProjectId(parseInt(e.target.value));
              setSelectedAssetIds([]);
            }}
          >
            <option value="">Select Project</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Asset Selection */}
        <div className="form-group">
          <label>Input Assets</label>
          <p className="help-text">
            Select assets to process. Final assets cannot be used as inputs.
          </p>
          <div className="asset-checkboxes">
            {assets.length === 0 ? (
              <p>No processable assets available.</p>
            ) : (
              assets.map(asset => (
                <label key={asset.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedAssetIds.includes(asset.id)}
                    onChange={() => handleAssetToggle(asset.id)}
                  />
                  {asset.name} ({asset.category})
                </label>
              ))
            )}
          </div>
        </div>

        {/* Preset Selection */}
        <div className="form-group">
          <label>Preset</label>
          {loadingPresets ? (
            <p>Loading presets...</p>
          ) : (
            <select 
              value={selectedPreset} 
              onChange={(e) => setSelectedPreset(e.target.value)}
            >
              <option value="">Select Preset</option>
              {presets.map(preset => (
                <option key={preset.id} value={preset.id}>
                  {preset.name} - {preset.description}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Parameter Controls (role-gated) */}
        {canAdjustParameters && (
          <div className="form-group parameters">
            <label>Parameters</label>
            {!hasFullParameters && (
              <p className="help-text">
                Standard role: parameters are bounded within safe ranges.
              </p>
            )}
            
            <div className="parameter-sliders">
              <div className="parameter">
                <label>Gain (dB): {parameters.gain || 0}</label>
                <input
                  type="range"
                  min={hasFullParameters ? -24 : -12}
                  max={hasFullParameters ? 24 : 12}
                  value={parameters.gain || 0}
                  onChange={(e) => setParameters({...parameters, gain: parseInt(e.target.value)})}
                />
              </div>
              
              <div className="parameter">
                <label>Compression: {parameters.compression || 0}%</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={parameters.compression || 0}
                  onChange={(e) => setParameters({...parameters, compression: parseInt(e.target.value)})}
                />
              </div>

              <div className="parameter">
                <label>Target Level (LUFS): {parameters.normalization || -14}</label>
                <input
                  type="range"
                  min={hasFullParameters ? -24 : -18}
                  max="0"
                  value={parameters.normalization || -14}
                  onChange={(e) => setParameters({...parameters, normalization: parseInt(e.target.value)})}
                />
              </div>
            </div>
          </div>
        )}

        {!canAdjustParameters && (
          <p className="role-notice">
            Basic role: Using preset defaults. Upgrade to Standard for parameter control.
          </p>
        )}

        {error && <div className="form-error">{error}</div>}
        
        {success && (
          <div className="form-success">
            Job submitted successfully!
            <button 
              type="button" 
              onClick={() => onNavigate('history')}
              style={{ marginLeft: '10px' }}
            >
              View in History
            </button>
          </div>
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Submitting...' : 'Submit Job'}
        </button>
      </form>
    </div>
  );
}
