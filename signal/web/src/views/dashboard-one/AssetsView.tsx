/**
 * Dashboard One - Assets View
 * 
 * ============================================================================
 * PERSONA: Artist/Producer hybrid
 * ============================================================================
 * 
 * PRIMARY QUESTION: "What files do I have and what's their status?"
 * 
 * SUCCESS CONDITION: User can find and inspect any asset in < 10 seconds
 * 
 * COMPONENT USAGE:
 * - SmartSearch: Find assets by name, metadata, or type
 * - MetadataEditor: View/edit asset metadata
 * 
 * ============================================================================
 */

import { useMemo, useEffect, useState } from 'react';
import { useProjects, useAssets } from '../../api';
import { SmartSearch, MetadataEditor } from '../../components/core';
import type { AssetMetadata } from '../../components/core';
import type { Asset } from '../../api';

interface AssetsViewProps {
  projectId?: number | null;
  role: 'BASIC' | 'STANDARD' | 'ADVANCED';
  onNavigate: (view: string, id?: number) => void;
}

export function AssetsView({ projectId, role: _role, onNavigate }: AssetsViewProps) {
  const { data: projectsResponse, loading: loadingProjects } = useProjects();
  const projects = useMemo(() => projectsResponse?.data || [], [projectsResponse]);
  
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(projectId || null);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  // Fetch assets for selected project
  const { data: assetsResponse, loading: loadingAssets, refetch: refetchAssets } = useAssets(selectedProjectId);
  const allAssets = assetsResponse?.data || [];
  
  // Apply category filter client-side
  const assets = categoryFilter 
    ? allAssets.filter((a: Asset) => a.category === categoryFilter)
    : allAssets;

  const loading = loadingProjects || loadingAssets;

  // Select first project by default
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const getCategoryBadgeClass = (category: Asset['category']) => {
    switch (category) {
      case 'RAW': return 'badge badge--neutral';
      case 'DERIVED': return 'badge badge--warning';
      case 'FINAL': return 'badge badge--success';
      default: return 'badge badge--neutral';
    }
  };

  const formatSize = (bytes: string | number) => {
    const num = typeof bytes === 'number' ? bytes : parseInt(bytes);
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSearchSelect = (result: { id: string; title: string }) => {
    const asset = allAssets.find((a: Asset) => String(a.id) === result.id);
    if (asset) {
      setSelectedAsset(asset);
    }
  };

  const handleMetadataUpdate = async (metadata: AssetMetadata) => {
    // In real implementation, this would call the API
    console.log('Updating metadata:', metadata);
    refetchAssets();
  };

  if (loading && projects.length === 0) {
    return <div className="loading">Loading assets...</div>;
  }

  return (
    <div className="view">
      {/* Header */}
      <header className="view__header">
        <h2 className="view__title">Assets</h2>
        <p className="view__subtitle">Browse and manage your audio files</p>
      </header>

      {/* Search */}
      <section className="section">
        <SmartSearch
          onSelect={handleSearchSelect}
          placeholder="Search assets by name, artist, or metadata..."
        />
      </section>

      {/* Controls */}
      <section className="section">
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          <select 
            value={selectedProjectId || ''} 
            onChange={(e) => {
              setSelectedProjectId(parseInt(e.target.value));
              setSelectedAsset(null);
            }}
            className="form-select"
            style={{ minWidth: '200px' }}
          >
            <option value="">Select Project</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <select 
            value={categoryFilter} 
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="form-select"
            style={{ minWidth: '150px' }}
          >
            <option value="">All Categories</option>
            <option value="RAW">Raw</option>
            <option value="DERIVED">Derived</option>
            <option value="FINAL">Final</option>
          </select>

          <button onClick={() => onNavigate('create')} className="btn btn--primary">
            Upload Asset
          </button>
        </div>
      </section>

      <div className="layout-sidebar">
        {/* Asset List */}
        <section className="section">
          <h3 className="section__title">Assets ({assets.length})</h3>
          {assets.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state__icon">🎵</span>
              <p className="empty-state__title">No assets found</p>
              <p className="empty-state__description">Upload assets to get started.</p>
            </div>
          ) : (
            <div className="cards-grid">
              {assets.map((asset: Asset) => (
                <button
                  key={asset.id}
                  className={`card card--interactive ${selectedAsset?.id === asset.id ? 'card--selected' : ''}`}
                  onClick={() => setSelectedAsset(asset)}
                  style={{ textAlign: 'left', border: 'none', background: 'var(--color-gray-900)' }}
                >
                  <div className="card__body" style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '1.5rem' }}>🎵</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, color: 'var(--color-white)', marginBottom: 'var(--space-2)' }}>
                        {asset.name}
                      </div>
                      <span className={getCategoryBadgeClass(asset.category)}>
                        {asset.category}
                      </span>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-400)', marginTop: 'var(--space-2)' }}>
                        {asset.mimeType} • {formatSize(asset.sizeBytes)}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Metadata Editor */}
        {selectedAsset && (
          <section className="section">
            <h3 className="section__title">Metadata</h3>
            <MetadataEditor
              asset={selectedAsset}
              onUpdate={handleMetadataUpdate}
              onCancel={() => setSelectedAsset(null)}
            />
          </section>
        )}
      </div>

      {/* Lineage Info */}
      <section className="section section--bordered">
        <h3 className="section__title">Asset Lineage</h3>
        <div className="card">
          <div className="card__body">
            <p style={{ color: 'var(--color-gray-300)', marginBottom: 'var(--space-4)' }}>
              Assets flow through categories: <strong style={{ color: 'var(--color-white)' }}>Raw → Derived → Final</strong>
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span className="badge badge--neutral">RAW</span>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-gray-400)' }}>Original uploaded</span>
              </div>
              <span style={{ color: 'var(--color-gray-600)' }}>→</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span className="badge badge--warning">DERIVED</span>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-gray-400)' }}>From processing</span>
              </div>
              <span style={{ color: 'var(--color-gray-600)' }}>→</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span className="badge badge--success">FINAL</span>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-gray-400)' }}>Ready for delivery</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
