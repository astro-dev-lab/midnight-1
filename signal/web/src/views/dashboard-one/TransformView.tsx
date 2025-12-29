/**
 * Dashboard One - Transform View
 * 
 * ============================================================================
 * PERSONA: Producer/Engineer
 * ============================================================================
 * 
 * PRIMARY QUESTION: "What processing should be applied to my audio?"
 * 
 * SUCCESS CONDITION: User selects a preset and submits job confidently
 * 
 * COMPONENT USAGE:
 * - QualityPresets: Select processing configuration
 *   Role-gated access to custom mode
 * - AudioVisualization: Show current audio state
 *   Visual reference before processing
 * 
 * RBAC ENFORCEMENT:
 * - Basic: Preset only (custom disabled)
 * - Standard: Bounded parameters
 * - Advanced: Full parameter access
 * 
 * ============================================================================
 */

import { useMemo, useEffect, useState } from 'react';
import { useProjects, useAssets, studioOS } from '../../api';
import { QualityPresets, AudioVisualization } from '../../components/core';
import type { Asset } from '../../api';

interface TransformViewProps {
  projectId?: number | null;
  role: 'BASIC' | 'STANDARD' | 'ADVANCED';
  onNavigate: (view: string, id?: number) => void;
}

export function TransformView({ projectId, role, onNavigate }: TransformViewProps) {
  const { data: projectsResponse, loading: loadingProjects } = useProjects();
  const projects = useMemo(() => projectsResponse?.data || [], [projectsResponse]);
  
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(projectId || null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<number[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  
  // Fetch assets for selected project
  const { data: assetsResponse, loading: loadingAssets } = useAssets(selectedProjectId);
  const allAssets = assetsResponse?.data || [];
  // Filter out Final assets - they cannot be used as job inputs
  const assets: Asset[] = allAssets.filter((a: Asset) => a.category !== 'FINAL');

  // Role-based access
  const canAdjustParameters = role === 'STANDARD' || role === 'ADVANCED';

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
        assetIds: selectedAssetIds
      });

      setSuccess(true);
      setSelectedAssetIds([]);
      setSelectedPreset('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit job');
    } finally {
      setSubmitting(false);
    }
  };

  const loading = loadingProjects;

  if (loading) {
    return <div className="view-loading">Loading...</div>;
  }

  return (
    <div className="transform-view">
      <header className="view-header">
        <h2 className="view-title">Transform</h2>
        <p className="view-subtitle">Configure processing parameters for your assets</p>
      </header>

      {/* Audio Analysis — Component: AudioVisualization */}
      <section className="analysis-section">
        <h3 className="section-title">Audio Analysis</h3>
        <div className="visualization-grid">
          <div className="viz-panel">
            <AudioVisualization type="spectrum" height={140} showLabels />
          </div>
          <div className="viz-panel">
            <AudioVisualization type="levels" height={140} showLabels />
          </div>
        </div>
      </section>

      <form onSubmit={handleSubmit}>
        {/* Project Selection */}
        <section className="form-section">
          <h3 className="section-title">1. Select Project</h3>
          <select 
            value={selectedProjectId || ''} 
            onChange={(e) => {
              setSelectedProjectId(parseInt(e.target.value));
              setSelectedAssetIds([]);
            }}
            className="project-select"
          >
            <option value="">Select Project</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </section>

        {/* Asset Selection */}
        <section className="form-section">
          <h3 className="section-title">2. Select Assets ({selectedAssetIds.length} selected)</h3>
          {loadingAssets ? (
            <p className="loading-text">Loading assets...</p>
          ) : assets.length === 0 ? (
            <p className="empty-message">No processable assets available.</p>
          ) : (
            <div className="asset-checkboxes">
              {assets.map(asset => (
                <label key={asset.id} className="asset-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedAssetIds.includes(asset.id)}
                    onChange={() => handleAssetToggle(asset.id)}
                  />
                  <span className="asset-name">{asset.name}</span>
                  <span className={`category-badge category-${asset.category.toLowerCase()}`}>
                    {asset.category}
                  </span>
                </label>
              ))}
            </div>
          )}
        </section>

        {/* Preset Selection — Component: QualityPresets */}
        <section className="form-section preset-section">
          <h3 className="section-title">3. Select Processing Preset</h3>
          <div className="component-container">
            <QualityPresets
              selectedPreset={selectedPreset}
              onPresetChange={(preset) => setSelectedPreset(preset)}
              disabled={false}
            />
          </div>
          
          {!canAdjustParameters && (
            <p className="role-notice">
              Basic role: Using preset defaults. Upgrade to Standard for parameter control.
            </p>
          )}
        </section>

        {/* Submit */}
        <section className="form-section submit-section">
          {error && <div className="form-error">{error}</div>}
          
          {success && (
            <div className="form-success">
              Job submitted successfully!
              <button 
                type="button" 
                onClick={() => onNavigate('history')}
                className="btn-link"
              >
                View in History →
              </button>
            </div>
          )}

          <button 
            type="submit" 
            disabled={submitting || !selectedPreset || selectedAssetIds.length === 0}
            className="btn-submit"
          >
            {submitting ? 'Submitting...' : 'Submit Processing Job'}
          </button>
        </section>
      </form>
    </div>
  );
}
