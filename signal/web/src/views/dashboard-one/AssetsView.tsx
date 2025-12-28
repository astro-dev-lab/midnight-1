/**
 * Dashboard One - Assets View
 * 
 * Displays and manages project assets with lineage tracking.
 * Per STUDIOOS_FUNCTIONAL_SPECS.md Section 4.2
 */

import { useEffect, useState } from 'react';
import { useProjects, useAssets } from '../../api';
import type { Asset } from '../../api';

interface AssetsViewProps {
  projectId?: number | null;
  role: 'BASIC' | 'STANDARD' | 'ADVANCED';
  onNavigate: (view: string, id?: number) => void;
}

export function AssetsView({ projectId: _projectId, role: _role, onNavigate }: AssetsViewProps) {
  const { data: projectsResponse, loading: loadingProjects } = useProjects();
  const projects = projectsResponse?.data || [];
  
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [error, setError] = useState('');

  // Fetch assets for selected project
  const { data: assetsResponse, loading: loadingAssets } = useAssets(selectedProjectId);
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

  const formatSize = (bytes: string) => {
    const num = parseInt(bytes);
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading && projects.length === 0) {
    return <div className="view-loading">Loading assets...</div>;
  }

  return (
    <div className="assets-view">
      <h2>Assets</h2>

      {/* Project Selector */}
      <div className="controls">
        <select 
          value={selectedProjectId || ''} 
          onChange={(e) => setSelectedProjectId(parseInt(e.target.value))}
        >
          <option value="">Select Project</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <select 
          value={categoryFilter} 
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All Categories</option>
          <option value="RAW">Raw</option>
          <option value="DERIVED">Derived</option>
          <option value="FINAL">Final</option>
        </select>

        <button onClick={() => onNavigate('create')}>Upload Asset</button>
      </div>

      {error && <div className="view-error">{error}</div>}

      {/* Asset List */}
      <div className="asset-list">
        {assets.length === 0 ? (
          <p>No assets found. Upload assets to get started.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Type</th>
                <th>Size</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assets.map(asset => (
                <tr key={asset.id}>
                  <td>{asset.name}</td>
                  <td>
                    <span 
                      className="category-badge" 
                      style={{ backgroundColor: getCategoryColor(asset.category) }}
                    >
                      {asset.category}
                    </span>
                  </td>
                  <td>{asset.mimeType}</td>
                  <td>{formatSize(asset.sizeBytes)}</td>
                  <td>{new Date(asset.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button onClick={() => onNavigate('review')}>Review</button>
                    {asset.category === 'DERIVED' && (
                      <button onClick={() => onNavigate('review')}>Approve</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Lineage Info */}
      <div className="lineage-info">
        <h3>Asset Lineage</h3>
        <p>
          Assets flow through categories: <strong>Raw → Derived → Final</strong>
        </p>
        <ul>
          <li><strong>Raw:</strong> Original uploaded assets</li>
          <li><strong>Derived:</strong> Outputs from processing jobs</li>
          <li><strong>Final:</strong> Approved assets ready for delivery</li>
        </ul>
      </div>
    </div>
  );
}
