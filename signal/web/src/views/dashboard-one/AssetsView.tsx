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

  const getCategoryColor = (category: Asset['category']) => {
    switch (category) {
      case 'RAW': return '#6c757d';
      case 'DERIVED': return '#ffc107';
      case 'FINAL': return '#28a745';
      default: return '#6c757d';
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
    return <div className="view-loading">Loading assets...</div>;
  }

  return (
    <div className="assets-view">
      <header className="view-header">
        <h2 className="view-title">Assets</h2>
        <p className="view-subtitle">Browse and manage your audio files</p>
      </header>

      {/* Search — Component: SmartSearch */}
      <section className="search-section">
        <SmartSearch
          onSelect={handleSearchSelect}
          placeholder="Search assets by name, artist, or metadata..."
        />
      </section>

      {/* Controls */}
      <section className="controls-section">
        <select 
          value={selectedProjectId || ''} 
          onChange={(e) => {
            setSelectedProjectId(parseInt(e.target.value));
            setSelectedAsset(null);
          }}
          className="project-select"
        >
          <option value="">Select Project</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <select 
          value={categoryFilter} 
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="category-filter"
        >
          <option value="">All Categories</option>
          <option value="RAW">Raw</option>
          <option value="DERIVED">Derived</option>
          <option value="FINAL">Final</option>
        </select>

        <button onClick={() => onNavigate('create')} className="btn-upload">
          Upload Asset
        </button>
      </section>

      <div className="assets-layout">
        {/* Asset List */}
        <section className="asset-list-section">
          <h3 className="section-title">Assets ({assets.length})</h3>
          {assets.length === 0 ? (
            <p className="empty-message">No assets found. Upload assets to get started.</p>
          ) : (
            <div className="asset-grid">
              {assets.map((asset: Asset) => (
                <button
                  key={asset.id}
                  className={`asset-card ${selectedAsset?.id === asset.id ? 'selected' : ''}`}
                  onClick={() => setSelectedAsset(asset)}
                >
                  <span className="asset-icon">🎵</span>
                  <div className="asset-info">
                    <span className="asset-name">{asset.name}</span>
                    <span 
                      className="category-badge" 
                      style={{ backgroundColor: getCategoryColor(asset.category) }}
                    >
                      {asset.category}
                    </span>
                    <span className="asset-meta">
                      {asset.mimeType} • {formatSize(asset.sizeBytes)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Metadata Editor — Component: MetadataEditor */}
        {selectedAsset && (
          <section className="metadata-section">
            <h3 className="section-title">Metadata</h3>
            <MetadataEditor
              asset={selectedAsset}
              onUpdate={handleMetadataUpdate}
              onCancel={() => setSelectedAsset(null)}
            />
          </section>
        )}
      </div>

      {/* Lineage Info */}
      <section className="lineage-info">
        <h3 className="section-title">Asset Lineage</h3>
        <p>
          Assets flow through categories: <strong>Raw → Derived → Final</strong>
        </p>
        <div className="lineage-stages">
          <div className="stage">
            <span className="stage-badge raw">RAW</span>
            <span>Original uploaded assets</span>
          </div>
          <span className="arrow">→</span>
          <div className="stage">
            <span className="stage-badge derived">DERIVED</span>
            <span>Outputs from processing</span>
          </div>
          <span className="arrow">→</span>
          <div className="stage">
            <span className="stage-badge final">FINAL</span>
            <span>Approved for delivery</span>
          </div>
        </div>
      </section>
    </div>
  );
}
