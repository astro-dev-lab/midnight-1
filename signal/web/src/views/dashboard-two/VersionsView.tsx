/**
 * Dashboard Two - Versions View
 * 
 * View delivery history and asset versions.
 * Per STUDIOOS_DASHBOARD_TWO_FUNCTIONAL_SPECS.md Section 4.4
 */

import { useEffect, useState } from 'react';
import type { Delivery, ExternalRole } from '../../types';

interface VersionsViewProps {
  projectId?: number;
  role: ExternalRole;
  onNavigate: (view: string) => void;
}

export function VersionsView({ projectId, role, onNavigate }: VersionsViewProps) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (projectId) {
      fetchVersions();
    }
  }, [projectId]);

  const fetchVersions = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/deliveries/external/versions?projectId=${projectId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to load versions');
      const data = await response.json();
      setDeliveries(data.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load versions');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: Delivery['status']) => {
    switch (status) {
      case 'PENDING': return '#ffc107';
      case 'IN_PROGRESS': return '#007bff';
      case 'COMPLETED': return '#28a745';
      case 'FAILED': return '#dc3545';
      default: return '#6c757d';
    }
  };

  if (!projectId) {
    return (
      <div className="versions-view">
        <h2>Versions & History</h2>
        <p>Select a project first.</p>
        <button onClick={() => onNavigate('projects')}>View Projects</button>
      </div>
    );
  }

  if (loading) {
    return <div className="view-loading">Loading versions...</div>;
  }

  if (error) {
    return <div className="view-error">{error}</div>;
  }

  return (
    <div className="versions-view">
      <button className="back-btn" onClick={() => onNavigate('projects')}>
        ← Back to Projects
      </button>
      
      <h2>Versions & Delivery History</h2>
      
      {deliveries.length === 0 ? (
        <p>No deliveries for this project yet.</p>
      ) : (
        <div className="version-timeline">
          {deliveries.map((delivery, index) => (
            <div key={delivery.id} className="version-entry">
              <div className="version-marker">
                <span className="version-number">v{deliveries.length - index}</span>
                <div 
                  className="status-indicator"
                  style={{ backgroundColor: getStatusColor(delivery.status) }}
                />
              </div>
              
              <div className="version-details">
                <div className="version-header">
                  <span className="destination">{delivery.destination}</span>
                  <span 
                    className="status-badge"
                    style={{ backgroundColor: getStatusColor(delivery.status) }}
                  >
                    {delivery.status}
                  </span>
                </div>
                
                <p className="delivery-date">
                  {delivery.completedAt 
                    ? `Delivered: ${new Date(delivery.completedAt).toLocaleString()}`
                    : `Started: ${new Date(delivery.startedAt).toLocaleString()}`
                  }
                </p>
                
                <div className="assets-delivered">
                  <strong>Assets:</strong>
                  <ul>
                    {delivery.assets?.map(asset => (
                      <li key={asset.id}>{asset.name} ({asset.category})</li>
                    )) ?? <li>No asset details available</li>}
                  </ul>
                </div>
                
                {role === 'APPROVER' && delivery.status === 'COMPLETED' && (
                  <button 
                    className="download-btn"
                    onClick={() => window.open(`/api/deliveries/${delivery.id}/package`, '_blank')}
                  >
                    Download Package
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
