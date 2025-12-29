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
    return <div className="view-loading">Loading...</div>;
  }

  return (
    <div className="deliver-view">
      <header className="view-header">
        <h2 className="view-title">Deliver</h2>
        <p className="view-subtitle">Export final assets to platforms and destinations</p>
      </header>

      {/* Project Selection */}
      <section className="project-section">
        <label className="section-label">Project</label>
        <select 
          className="project-select"
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
      </section>

      {error && <div className="view-error">{error}</div>}
      {success && <div className="view-success">{success}</div>}

      {/* Asset Selection */}
      <section className="assets-section">
        <h3 className="section-title">
          Select Final Assets ({selectedAssetIds.length} of {finalAssets.length})
        </h3>
        
        {finalAssets.length === 0 ? (
          <div className="empty-state">
            <p>No final assets available for delivery.</p>
            <button className="btn-secondary" onClick={() => onNavigate('review')}>
              Approve derived assets first →
            </button>
          </div>
        ) : (
          <div className="asset-grid">
            {finalAssets.map(asset => (
              <label 
                key={asset.id} 
                className={`asset-card ${selectedAssetIds.includes(asset.id) ? 'selected' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selectedAssetIds.includes(asset.id)}
                  onChange={() => handleAssetToggle(asset.id)}
                  disabled={!canBatchDeliver && selectedAssetIds.length >= 1 && !selectedAssetIds.includes(asset.id)}
                />
                <span className="asset-name">{asset.name}</span>
                <span className="category-badge">FINAL</span>
              </label>
            ))}
          </div>
        )}
        
        {!canBatchDeliver && finalAssets.length > 1 && (
          <p className="role-notice">
            Basic/Standard role: Select one asset at a time. Upgrade to Advanced for batch delivery.
          </p>
        )}
      </section>

      {/* Platform Exports — Component: PlatformExports */}
      <section className="export-section">
        <h3 className="section-title">Export Options</h3>
        <div className="component-container">
          <PlatformExports
            selectedAssets={selectedAssetIds.map(id => String(id))}
            onStartExport={(configs) => {
              // Transform export configs and start delivery
              if (configs.length > 0) {
                handleStartExport(configs[0].platformId);
              }
            }}
            disabled={submitting || selectedAssetIds.length === 0}
          />
        </div>
      </section>

      {/* Delivery Manager — Component: DeliveryManager */}
      <section className="deliveries-section">
        <h3 className="section-title">Active Deliveries</h3>
        <div className="component-container">
          <DeliveryManager
            projectId={selectedProjectId || undefined}
          />
        </div>
      </section>

      {/* Quick Navigation */}
      <footer className="view-footer">
        <button className="btn-secondary" onClick={() => onNavigate('history')}>
          View Full Delivery History →
        </button>
      </footer>
    </div>
  );
}
