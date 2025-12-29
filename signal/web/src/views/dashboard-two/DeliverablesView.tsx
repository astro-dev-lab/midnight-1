/**
 * Dashboard Two - Deliverables View
 * 
 * ============================================================================
 * PERSONA: Operations / Reviewer (Approver role required for actions)
 * ============================================================================
 * 
 * PRIMARY QUESTION: "What final outputs are ready for me?"
 * 
 * SUCCESS CONDITION: User can view and download deliverables
 * 
 * COMPONENT USAGE:
 * - DeliveryManager: Display deliverable assets with status
 * - DeliveryTracking: Track delivery status in real-time
 * 
 * RBAC:
 * - Viewer: Can view deliverables list only
 * - Approver: Can download and trigger review
 * 
 * ============================================================================
 */

import { useEffect, useState } from 'react';
import type { Asset, ListResponse, ExternalRole } from '../../types';
import { DeliveryManager } from '../../components/core';

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
        <header className="view-header">
          <h2 className="view-title">Deliverables</h2>
          <p className="view-subtitle">Select a project to view deliverables</p>
        </header>
        <div className="empty-state">
          <button className="btn-primary" onClick={() => onNavigate('projects')}>
            View Projects
          </button>
        </div>
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
      <header className="view-header">
        <button className="btn-back" onClick={() => onNavigate('projects')}>
          ← Back to Projects
        </button>
        <h2 className="view-title">Deliverables</h2>
        <p className="view-subtitle">Final outputs ready for download</p>
      </header>

      {role !== 'APPROVER' && (
        <div className="role-notice-banner">
          You have VIEWER access. Download and approval require APPROVER role.
        </div>
      )}

      {/* Deliverables List — Component: DeliveryManager */}
      <section className="deliverables-section">
        <DeliveryManager
          deliveries={deliverables.map(asset => ({
            id: asset.id,
            destination: asset.category,
            status: 'completed' as const,
            createdAt: asset.createdAt,
            completedAt: asset.updatedAt
          }))}
          onRefresh={fetchDeliverables}
        />
      </section>

      {/* Asset Details Table */}
      <section className="assets-table-section">
        <h3 className="section-title">Asset Details</h3>
        {deliverables.length === 0 ? (
          <div className="empty-state">
            <p>No deliverables available yet.</p>
          </div>
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
                  <td className="asset-name">{asset.name}</td>
                  <td>
                    <span className={`category-badge category-${asset.category.toLowerCase()}`}>
                      {asset.category}
                    </span>
                  </td>
                  <td>{asset.format ?? 'Unknown'}</td>
                  <td>{new Date(asset.updatedAt).toLocaleString()}</td>
                  <td className="actions-cell">
                    {role === 'APPROVER' ? (
                      <>
                        <button className="btn-download" onClick={() => handleDownload(asset)}>
                          Download
                        </button>
                        <button className="btn-review" onClick={() => onNavigate('approvals')}>
                          Review
                        </button>
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
      </section>
    </div>
  );
}
