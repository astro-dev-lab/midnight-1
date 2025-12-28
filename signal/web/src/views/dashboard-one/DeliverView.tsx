/**
 * Dashboard One - Deliver View
 * 
 * Deliver final assets to destinations.
 * Per STUDIOOS_FUNCTIONAL_SPECS.md Section 4.6
 */

import { useEffect, useState } from 'react';
import { useProjects, studioOS } from '../../api';
import type { Asset, Delivery } from '../../api';

interface DeliverViewProps {
  projectId?: number | null;
  role: 'BASIC' | 'STANDARD' | 'ADVANCED';
  onNavigate: (view: string, id?: number) => void;
}

// Delivery destinations (would come from API in production)
const DESTINATIONS = [
  { id: 'download', name: 'Direct Download', description: 'Download files directly' },
  { id: 's3', name: 'S3 Bucket', description: 'Upload to AWS S3' },
  { id: 'gcs', name: 'Google Cloud Storage', description: 'Upload to GCS' },
  { id: 'ftp', name: 'FTP Server', description: 'Transfer via FTP' }
];

export function DeliverView({ projectId: _projectId, role, onNavigate: _onNavigate }: DeliverViewProps) {
  const { data: projectsResponse, loading: loadingProjects } = useProjects();
  const projects = projectsResponse?.data || [];
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [finalAssets, setFinalAssets] = useState<Asset[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<number[]>([]);
  const [destination, setDestination] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loadingAssets, setLoadingAssets] = useState(false);

  // Role-based delivery access
  const canBatchDeliver = role === 'ADVANCED';
  const canConfigureDestinations = role === 'STANDARD' || role === 'ADVANCED';
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
      fetchDeliveries(selectedProjectId);
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

  const fetchDeliveries = async (projectId: number) => {
    try {
      const response = await studioOS.getDeliveries(projectId);
      setDeliveries(response.data);
    } catch (err: unknown) {
      // Ignore delivery fetch errors
    }
  };

  const handleAssetToggle = (assetId: number) => {
    setSelectedAssetIds(prev => 
      prev.includes(assetId) 
        ? prev.filter(id => id !== assetId)
        : [...prev, assetId]
    );
  };

  const handleDeliver = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedProjectId || !destination) {
      setError('Please select a destination.');
      return;
    }

    // Basic role can only do single asset deliveries
    if (!canBatchDeliver && selectedAssetIds.length > 1) {
      setError('Batch delivery requires Advanced role. Select only one asset.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      await studioOS.createDelivery({
        projectId: selectedProjectId,
        destination,
        assetIds: selectedAssetIds.length > 0 ? selectedAssetIds : undefined
      });

      setSuccess('Delivery initiated successfully!');
      setSelectedAssetIds([]);
      setDestination('');
      
      // Refresh deliveries
      if (selectedProjectId) {
        fetchDeliveries(selectedProjectId);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create delivery');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status: Delivery['status']) => {
    switch (status) {
      case 'pending': return '#ffc107';
      case 'completed': return '#28a745';
      case 'failed': return '#dc3545';
      default: return '#6c757d';
    }
  };

  if (loading) {
    return <div className="view-loading">Loading...</div>;
  }

  return (
    <div className="deliver-view">
      <h2>Deliver</h2>

      {/* Project Selection */}
      <div className="form-group">
        <label>Project</label>
        <select 
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

      {error && <div className="view-error">{error}</div>}
      {success && <div className="view-success">{success}</div>}

      {/* Final Assets */}
      <div className="final-assets">
        <h3>Final Assets ({finalAssets.length})</h3>
        {finalAssets.length === 0 ? (
          <p>No final assets available for delivery. Approve derived assets first.</p>
        ) : (
          <div className="asset-checkboxes">
            {finalAssets.map(asset => (
              <label key={asset.id} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={selectedAssetIds.includes(asset.id)}
                  onChange={() => handleAssetToggle(asset.id)}
                  disabled={!canBatchDeliver && selectedAssetIds.length >= 1 && !selectedAssetIds.includes(asset.id)}
                />
                {asset.name}
              </label>
            ))}
          </div>
        )}
        {!canBatchDeliver && finalAssets.length > 1 && (
          <p className="role-notice">
            Basic/Standard role: Select one asset at a time. Upgrade to Advanced for batch delivery.
          </p>
        )}
      </div>

      {/* Delivery Form */}
      <form onSubmit={handleDeliver}>
        <div className="form-group">
          <label>Destination</label>
          {canConfigureDestinations ? (
            <select value={destination} onChange={(e) => setDestination(e.target.value)}>
              <option value="">Select Destination</option>
              {DESTINATIONS.map(dest => (
                <option key={dest.id} value={dest.id}>
                  {dest.name} - {dest.description}
                </option>
              ))}
            </select>
          ) : (
            <>
              <select value="download" disabled>
                <option value="download">Direct Download</option>
              </select>
              <input type="hidden" value="download" />
              <p className="role-notice">
                Basic role: Standard delivery only. Upgrade for custom destinations.
              </p>
            </>
          )}
        </div>

        <button 
          type="submit" 
          disabled={submitting || finalAssets.length === 0}
        >
          {submitting ? 'Initiating...' : 'Initiate Delivery'}
        </button>
      </form>

      {/* Delivery History */}
      <div className="delivery-history">
        <h3>Delivery History</h3>
        {deliveries.length === 0 ? (
          <p>No deliveries yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Destination</th>
                <th>Status</th>
                <th>Created</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map(delivery => (
                <tr key={delivery.id}>
                  <td>{delivery.destination}</td>
                  <td>
                    <span 
                      className="status-badge" 
                      style={{ backgroundColor: getStatusColor(delivery.status) }}
                    >
                      {delivery.status}
                    </span>
                  </td>
                  <td>{new Date(delivery.createdAt).toLocaleDateString()}</td>
                  <td>
                    {delivery.completedAt 
                      ? new Date(delivery.completedAt).toLocaleDateString() 
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
