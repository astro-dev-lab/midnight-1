/**
 * Dashboard Two - Versions View
 * 
 * ============================================================================
 * PERSONA: Operations / Reviewer (Approver role for downloads)
 * ============================================================================
 * 
 * PRIMARY QUESTION: "What's the delivery history for this project?"
 * 
 * SUCCESS CONDITION: User can track all versions and download packages
 * 
 * COMPONENT USAGE:
 * - DeliveryTracking: Track delivery history with timeline
 * - JobManager: View processing jobs that created each version
 * 
 * RBAC:
 * - Viewer: Can view version timeline only
 * - Approver: Can download delivery packages
 * 
 * ============================================================================
 */

import { useEffect, useState } from 'react';
import type { Delivery, ExternalRole } from '../../types';
import { DeliveryTracking } from '../../components/core';

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

  if (!projectId) {
    return (
      <div className="versions-view">
        <header className="view-header">
          <h2 className="view-title">Versions & History</h2>
          <p className="view-subtitle">Select a project to view delivery history</p>
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
    return <div className="view-loading">Loading versions...</div>;
  }

  if (error) {
    return <div className="view-error">{error}</div>;
  }

  return (
    <div className="versions-view">
      <header className="view-header">
        <button className="btn-back" onClick={() => onNavigate('projects')}>
          ← Back to Projects
        </button>
        <h2 className="view-title">Versions & Delivery History</h2>
        <p className="view-subtitle">Complete delivery timeline for this project</p>
      </header>

      {role !== 'APPROVER' && (
        <div className="role-notice-banner">
          You have VIEWER access. Download requires APPROVER role.
        </div>
      )}
      
      {/* Delivery Tracking — Component: DeliveryTracking */}
      <section className="tracking-section">
        <DeliveryTracking
          deliveries={deliveries}
          realTimeUpdates={false}
          onRefresh={fetchVersions}
        />
      </section>

      {/* Version Timeline */}
      <section className="timeline-section">
        <h3 className="section-title">Version Timeline</h3>
        
        {deliveries.length === 0 ? (
          <div className="empty-state">
            <p>No deliveries for this project yet.</p>
          </div>
        ) : (
          <div className="version-timeline">
            {deliveries.map((delivery, index) => (
              <div key={delivery.id} className="version-entry">
                <div className="version-marker">
                  <span className="version-number">v{deliveries.length - index}</span>
                  <div className={`status-indicator status-${delivery.status.toLowerCase()}`} />
                </div>
                
                <div className="version-details">
                  <div className="version-header">
                    <span className="destination">{delivery.destination}</span>
                    <span className={`status-badge status-${delivery.status.toLowerCase()}`}>
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
                        <li key={asset.id}>
                          {asset.name} 
                          <span className="category-badge">{asset.category}</span>
                        </li>
                      )) ?? <li>No asset details available</li>}
                    </ul>
                  </div>
                  
                  {role === 'APPROVER' && delivery.status === 'COMPLETED' && (
                    <button 
                      className="btn-download"
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
      </section>
    </div>
  );
}
