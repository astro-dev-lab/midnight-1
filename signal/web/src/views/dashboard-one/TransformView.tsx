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
    return <div className="loading">Loading...</div>;
  }

  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case 'RAW': return 'badge badge--neutral';
      case 'DERIVED': return 'badge badge--warning';
      case 'FINAL': return 'badge badge--success';
      default: return 'badge badge--neutral';
    }
  };

  return (
    <div className="view">
      {/* Header */}
      <header className="view__header">
        <h2 className="view__title">Transform</h2>
        <p className="view__subtitle">Configure processing parameters for your assets</p>
      </header>

      {/* Audio Analysis */}
      <section className="section">
        <h3 className="section__title">Audio Analysis</h3>
        <div className="layout-two-col">
          <div className="card">
            <div className="card__body">
              <AudioVisualization type="spectrum" height={140} showLabels />
            </div>
          </div>
          <div className="card">
            <div className="card__body">
              <AudioVisualization type="levels" height={140} showLabels />
            </div>
          </div>
        </div>
      </section>

      <form onSubmit={handleSubmit}>
        {/* Project Selection */}
        <section className="section">
          <h3 className="section__title">1. Select Project</h3>
          <select 
            value={selectedProjectId || ''} 
            onChange={(e) => {
              setSelectedProjectId(parseInt(e.target.value));
              setSelectedAssetIds([]);
            }}
            className="form-select"
            style={{ minWidth: '240px' }}
          >
            <option value="">Select Project</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </section>

        {/* Asset Selection */}
        <section className="section">
          <h3 className="section__title">2. Select Assets ({selectedAssetIds.length} selected)</h3>
          {loadingAssets ? (
            <div className="loading loading--inline">Loading assets...</div>
          ) : assets.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state__icon">🎵</span>
              <p className="empty-state__title">No processable assets</p>
              <p className="empty-state__description">Upload assets first to start processing.</p>
            </div>
          ) : (
            <div className="card">
              <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {assets.map(asset => (
                  <label key={asset.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2)', borderRadius: 'var(--border-radius)', cursor: 'pointer', transition: 'background-color 0.15s' }}>
                    <input
                      type="checkbox"
                      checked={selectedAssetIds.includes(asset.id)}
                      onChange={() => handleAssetToggle(asset.id)}
                      style={{ width: '16px', height: '16px' }}
                    />
                    <span style={{ flex: 1, color: 'var(--color-white)' }}>{asset.name}</span>
                    <span className={getCategoryBadgeClass(asset.category)}>
                      {asset.category}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Preset Selection */}
        <section className="section">
          <h3 className="section__title">3. Select Processing Preset</h3>
          <QualityPresets
            selectedPreset={selectedPreset}
            onPresetChange={(preset) => setSelectedPreset(preset)}
            disabled={false}
          />
          
          {!canAdjustParameters && (
            <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--font-size-sm)', color: 'var(--color-gray-400)' }}>
              Basic role: Using preset defaults. Upgrade to Standard for parameter control.
            </p>
          )}
        </section>

        {/* Submit */}
        <section className="section">
          {error && <div className="error-message">{error}</div>}
          
          {success && (
            <div style={{ padding: 'var(--space-4)', background: 'rgba(34, 197, 94, 0.1)', borderRadius: 'var(--border-radius)', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
              <span>✓ Job submitted successfully!</span>
              <button 
                type="button" 
                onClick={() => onNavigate('history')}
                className="btn btn--ghost"
                style={{ marginLeft: 'auto' }}
              >
                View in History →
              </button>
            </div>
          )}

          <button 
            type="submit" 
            disabled={submitting || !selectedPreset || selectedAssetIds.length === 0}
            className="btn btn--primary btn--lg"
          >
            {submitting ? 'Submitting...' : 'Submit Processing Job'}
          </button>
        </section>
      </form>
    </div>
  );
}
