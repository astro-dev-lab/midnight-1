/**
 * Dashboard One - Deliver View
 * 
 * ============================================================================
 * PERSONA: Independent Rap Artist
 * ============================================================================
 * 
 * PRIMARY QUESTION: "How do I get my finished work out to platforms?"
 * 
 * SUCCESS CONDITION: User initiates export with confidence in destinations
 * 
 * COMPONENT USAGE:
 * - PlatformExports: Configure and initiate platform deliveries
 * - DeliveryManager: Monitor and manage active deliveries
 * 
 * RBAC ENFORCEMENT:
 * - Basic/Standard: Single asset delivery only
 * - Advanced: Batch delivery + custom destinations
 * 
 * ============================================================================
 */

import { useMemo, useEffect, useState } from 'react';
import { useProjects, studioOS } from '../../api';
import type { Asset } from '../../api';
import { PlatformExports, DeliveryManager } from '../../components/core';

interface DeliverViewProps {
  projectId?: number | null;
  role: 'BASIC' | 'STANDARD' | 'ADVANCED';
  onNavigate: (view: string, id?: number) => void;
}

export function DeliverView({ projectId, role, onNavigate }: DeliverViewProps) {
  const { data: projectsResponse, loading: loadingProjects } = useProjects();
  const projects = useMemo(() => projectsResponse?.data || [], [projectsResponse]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(projectId || null);
  const [finalAssets, setFinalAssets] = useState<Asset[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loadingAssets, setLoadingAssets] = useState(false);

  // Role-based delivery access
  const canBatchDeliver = role === 'ADVANCED';
  const loading = loadingProjects || loadingAssets;

  // Set first project as selected when projects load
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId) {
      fetchFinalAssets(selectedProjectId);
    }
  }, [selectedProjectId]);

  const fetchFinalAssets = async (projectId: number) => {
    setLoadingAssets(true);
    try {
      const response = await studioOS.getAssets(projectId);
      // Filter to only FINAL category assets
      const finals = response.data.filter(a => a.category === 'FINAL');
      setFinalAssets(finals);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load assets');
    } finally {
      setLoadingAssets(false);
    }
  };

  const handleAssetToggle = (assetId: number) => {
    // Basic/Standard can only select one
    if (!canBatchDeliver && selectedAssetIds.length >= 1 && !selectedAssetIds.includes(assetId)) {
      return;
    }
    
    setSelectedAssetIds(prev => 
      prev.includes(assetId) 
        ? prev.filter(id => id !== assetId)
        : [...prev, assetId]
    );
  };

  const handleStartExport = async (destination: string) => {
    if (!selectedProjectId || selectedAssetIds.length === 0) {
      setError('Please select at least one asset for delivery.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      await studioOS.createDelivery({
        projectId: selectedProjectId,
        destination,
        assetIds: selectedAssetIds
      });

      setSuccess('Delivery initiated successfully!');
      setSelectedAssetIds([]);
      // Deliveries are now handled by DeliveryManager component
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create delivery');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="view">
      {/* Header */}
      <header className="view__header">
        <h2 className="view__title">Deliver</h2>
        <p className="view__subtitle">Export final assets to platforms and destinations</p>
      </header>

      {/* Project Selection */}
      <section className="section">
        <div className="form-group">
          <label className="form-label">Project</label>
          <select 
            className="form-select"
            style={{ minWidth: '240px' }}
            value={selectedProjectId || ''} 
            onChange={(e) => {
              setSelectedProjectId(parseInt(e.target.value));
              setSelectedAssetIds([]);
            }}
          >
            <option value="">Select Project</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.state})</option>
            ))}
          </select>
        </div>
      </section>

      {error && <div className="error-message">{error}</div>}
      {success && <div style={{ padding: 'var(--space-4)', background: 'rgba(34, 197, 94, 0.1)', borderRadius: 'var(--border-radius)', color: 'var(--color-success)', marginBottom: 'var(--space-4)' }}>{success}</div>}

      {/* Asset Selection */}
      <section className="section">
        <h3 className="section__title">
          Select Final Assets ({selectedAssetIds.length} of {finalAssets.length})
        </h3>
        
        {finalAssets.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__icon">📦</span>
            <p className="empty-state__title">No final assets available</p>
            <p className="empty-state__description">Approve derived assets first.</p>
            <button className="btn btn--secondary" onClick={() => onNavigate('review')}>
              Go to Review →
            </button>
          </div>
        ) : (
          <div className="card">
            <div className="card__body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {finalAssets.map(asset => (
                <label 
                  key={asset.id} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 'var(--space-3)', 
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--border-radius)',
                    background: selectedAssetIds.includes(asset.id) ? 'var(--color-gray-800)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background-color 0.15s'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedAssetIds.includes(asset.id)}
                    onChange={() => handleAssetToggle(asset.id)}
                    disabled={!canBatchDeliver && selectedAssetIds.length >= 1 && !selectedAssetIds.includes(asset.id)}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span style={{ flex: 1, color: 'var(--color-white)' }}>{asset.name}</span>
                  <span className="badge badge--success">FINAL</span>
                </label>
              ))}
            </div>
          </div>
        )}
        
        {!canBatchDeliver && finalAssets.length > 1 && (
          <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--font-size-sm)', color: 'var(--color-gray-400)' }}>
            Basic/Standard role: Select one asset at a time. Upgrade to Advanced for batch delivery.
          </p>
        )}
      </section>

      {/* Platform Exports */}
      <section className="section">
        <h3 className="section__title">Export Options</h3>
        <PlatformExports
          selectedAssets={selectedAssetIds.map(id => String(id))}
          onStartExport={(configs) => {
            if (configs.length > 0) {
              handleStartExport(configs[0].platformId);
            }
          }}
          disabled={submitting || selectedAssetIds.length === 0}
        />
      </section>

      {/* Delivery Manager */}
      <section className="section">
        <h3 className="section__title">Active Deliveries</h3>
        <DeliveryManager
          projectId={selectedProjectId || undefined}
        />
      </section>

      {/* Quick Navigation */}
      <section className="section section--bordered">
        <button className="action-card" onClick={() => onNavigate('history')}>
          <span className="action-card__icon">📜</span>
          <span className="action-card__content">
            <span className="action-card__label">View Full History</span>
            <span className="action-card__description">See all jobs and deliveries</span>
          </span>
        </button>
      </section>
    </div>
  );
}
