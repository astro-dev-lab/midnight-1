/**
 * Dashboard Two - Deliverables View
 * 
 * View and download final deliverable assets.
 * Per STUDIOOS_DASHBOARD_TWO_FUNCTIONAL_SPECS.md Section 4.2
 */

import { useEffect, useState } from 'react';
import type { Asset, ListResponse, ExternalRole } from '../../types';

interface DeliverablesViewProps {
  projectId?: number;
  role: ExternalRole;
  onNavigate: (view: string) => void;
}

export function DeliverablesView({ projectId, role, onNavigate }: DeliverablesViewProps) {
  const [deliverables, setDeliverables] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (projectId) {
      fetchDeliverables();
    }
  }, [projectId]);

  const fetchDeliverables = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/deliveries/external?projectId=${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to load deliverables');
      const data: ListResponse<Asset> = await response.json();
      setDeliverables(data.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load deliverables');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (asset: Asset) => {
    if (role !== 'APPROVER') {
      setError('Download requires APPROVER role');
      return;
    }
    
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/deliveries/${asset.id}/download`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!response.ok) {
      setError('Download failed');
      return;
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = asset.name;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (!projectId) {
    return (
      <div className="deliverables-view">
        <h2>Deliverables</h2>
        <p>Select a project first.</p>
        <button onClick={() => onNavigate('projects')}>View Projects</button>
      </div>
    );
  }

  if (loading) {
    return <div className="view-loading">Loading deliverables...</div>;
  }

  if (error) {
    return <div className="view-error">{error}</div>;
  }

  return (
    <div className="deliverables-view">
      <button className="back-btn" onClick={() => onNavigate('projects')}>
        ← Back to Projects
      </button>
      
      <h2>Deliverables</h2>
      
      {deliverables.length === 0 ? (
        <p>No deliverables available yet.</p>
      ) : (
        <table className="deliverables-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Format</th>
              <th>Delivered</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {deliverables.map(asset => (
              <tr key={asset.id}>
                <td>{asset.name}</td>
                <td>{asset.category}</td>
                <td>{asset.format ?? 'Unknown'}</td>
                <td>{new Date(asset.updatedAt).toLocaleString()}</td>
                <td>
                  {role === 'APPROVER' ? (
                    <>
                      <button onClick={() => handleDownload(asset)}>Download</button>
                      <button onClick={() => onNavigate('approvals')}>Review</button>
                    </>
                  ) : (
                    <span className="role-notice">View Only</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
