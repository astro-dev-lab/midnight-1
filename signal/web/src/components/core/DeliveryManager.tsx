import React, { useState, useEffect } from 'react';
import { FormField } from '../FormField';
import './DeliveryManager.css';

interface Delivery {
  id: string;
  title: string;
  assets: Array<{
    filename: string;
    path: string;
    format: string;
    fileSize: number;
  }>;
  platforms: string[];
  status: string;
  progress: number;
  createdAt: number;
  updatedAt: number;
  logs: Array<{
    timestamp: number;
    message: string;
  }>;
  platformDeliveries: Record<string, {
    status: string;
    progress: number;
    url?: string;
    error?: string;
  }>;
  errors: string[];
}

interface DeliveryManagerProps {
  onCreateDelivery?: (config: any) => void;
  onCancelDelivery?: (deliveryId: string) => void;
}

const PLATFORM_NAMES: Record<string, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  youtube_music: 'YouTube Music',
  tidal: 'Tidal',
  amazon_music: 'Amazon Music',
  bandcamp: 'Bandcamp'
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'var(--color-border)',
  validating: '#f59e0b',
  processing: 'var(--color-primary)',
  uploading: 'var(--color-primary)',
  delivered: '#22c55e',
  failed: '#ef4444',
  rejected: '#ef4444'
};

export const DeliveryManager: React.FC<DeliveryManagerProps> = ({
  onCreateDelivery,
  onCancelDelivery
}) => {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [selectedDelivery, setSelectedDelivery] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDeliveries();
    
    // Set up polling for live updates
    const interval = setInterval(loadDeliveries, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadDeliveries = async () => {
    try {
      const response = await fetch('/api/deliveries');
      if (response.ok) {
        const data = await response.json();
        setDeliveries(data.deliveries || []);
      }
    } catch (error) {
      console.error('Failed to load deliveries:', error);
      
      // Use mock data for demo
      setDeliveries(generateMockDeliveries());
    } finally {
      setIsLoading(false);
    }
  };

  const generateMockDeliveries = (): Delivery[] => {
    const statuses = ['pending', 'validating', 'processing', 'uploading', 'delivered', 'failed'];
    const platforms = ['spotify', 'apple_music', 'youtube_music', 'tidal'];
    
    return Array.from({ length: 8 }, (_, i) => {
      const status = statuses[Math.floor(Math.random() * statuses.length)];
      const selectedPlatforms = platforms.slice(0, Math.floor(Math.random() * 3) + 1);
      
      const delivery: Delivery = {
        id: `delivery_${Date.now()}_${i}`,
        title: [
          'Summer Album Release',
          'Podcast Episode Batch',
          'Single Track Distribution',
          'EP Collection Release',
          'Remix Package Upload'
        ][i % 5],
        assets: [
          {
            filename: `track_${i + 1}.wav`,
            path: `/uploads/track_${i + 1}.wav`,
            format: 'wav',
            fileSize: Math.floor(Math.random() * 100000000) + 20000000
          }
        ],
        platforms: selectedPlatforms,
        status,
        progress: status === 'delivered' ? 100 : 
                 status === 'failed' ? 0 : 
                 Math.floor(Math.random() * 90) + 10,
        createdAt: Date.now() - Math.random() * 86400000 * 7, // Within last week
        updatedAt: Date.now() - Math.random() * 3600000, // Within last hour
        logs: [
          {
            timestamp: Date.now() - 3600000,
            message: 'Delivery started'
          },
          {
            timestamp: Date.now() - 1800000,
            message: 'Validation completed successfully'
          }
        ],
        platformDeliveries: Object.fromEntries(
          selectedPlatforms.map(platform => [
            platform,
            {
              status: Math.random() > 0.8 ? 'failed' : status,
              progress: Math.floor(Math.random() * 100),
              url: status === 'delivered' ? `https://${platform}.example.com/release/123` : undefined,
              error: Math.random() > 0.9 ? 'Network timeout during upload' : undefined
            }
          ])
        ),
        errors: status === 'failed' ? ['Upload failed due to network error'] : []
      };

      return delivery;
    });
  };

  const cancelDelivery = async (deliveryId: string) => {
    try {
      const response = await fetch(`/api/deliveries/${deliveryId}/cancel`, {
        method: 'POST'
      });
      
      if (response.ok) {
        setDeliveries(prev => prev.map(d =>
          d.id === deliveryId ? { ...d, status: 'failed', errors: [...d.errors, 'Cancelled by user'] } : d
        ));
        
        if (onCancelDelivery) {
          onCancelDelivery(deliveryId);
        }
      }
    } catch (error) {
      console.error('Failed to cancel delivery:', error);
    }
  };

  const retryDelivery = async (deliveryId: string) => {
    try {
      const response = await fetch(`/api/deliveries/${deliveryId}/retry`, {
        method: 'POST'
      });
      
      if (response.ok) {
        setDeliveries(prev => prev.map(d =>
          d.id === deliveryId ? { 
            ...d, 
            status: 'pending', 
            progress: 0,
            errors: [],
            updatedAt: Date.now()
          } : d
        ));
      }
    } catch (error) {
      console.error('Failed to retry delivery:', error);
    }
  };

  const filteredDeliveries = deliveries.filter(delivery => {
    if (filter === 'all') return true;
    return delivery.status === filter;
  });

  const formatFileSize = (bytes: number): string => {
    const mb = bytes / 1024 / 1024;
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
  };

  const formatTimestamp = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'pending': return '⏳';
      case 'validating': return '🔍';
      case 'processing': return '⚙️';
      case 'uploading': return '⬆️';
      case 'delivered': return '✅';
      case 'failed': return '❌';
      case 'rejected': return '🚫';
      default: return '📄';
    }
  };

  const getPlatformIcon = (platformId: string): string => {
    const icons: Record<string, string> = {
      spotify: '🎵',
      apple_music: '🍎',
      youtube_music: '📺',
      tidal: '🌊',
      amazon_music: '📦',
      bandcamp: '🎪'
    };
    return icons[platformId] || '🎵';
  };

  if (isLoading) {
    return (
      <div className="delivery-manager loading">
        <div className="loading-spinner">Loading deliveries...</div>
      </div>
    );
  }

  return (
    <div className="delivery-manager">
      <div className="manager-header">
        <h3 className="text-heading">Delivery Management</h3>
        <p className="text-caption">
          Track and manage platform distributions
        </p>
      </div>

      <div className="manager-controls">
        <div className="filter-section">
          <FormField label="Filter by Status">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All Deliveries</option>
              <option value="pending">Pending</option>
              <option value="validating">Validating</option>
              <option value="processing">Processing</option>
              <option value="uploading">Uploading</option>
              <option value="delivered">Delivered</option>
              <option value="failed">Failed</option>
            </select>
          </FormField>
        </div>

        <div className="stats-section">
          <div className="stat-item">
            <span className="stat-value">{deliveries.filter(d => d.status === 'delivered').length}</span>
            <span className="stat-label">Delivered</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{deliveries.filter(d => ['processing', 'uploading', 'validating'].includes(d.status)).length}</span>
            <span className="stat-label">In Progress</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{deliveries.filter(d => d.status === 'failed').length}</span>
            <span className="stat-label">Failed</span>
          </div>
        </div>
      </div>

      <div className="delivery-list">
        {filteredDeliveries.map(delivery => (
          <div 
            key={delivery.id}
            className={`delivery-item ${delivery.status} ${selectedDelivery === delivery.id ? 'selected' : ''}`}
            onClick={() => setSelectedDelivery(selectedDelivery === delivery.id ? null : delivery.id)}
            style={{ '--status-color': STATUS_COLORS[delivery.status] } as React.CSSProperties}
          >
            <div className="delivery-header">
              <div className="delivery-info">
                <span className="delivery-icon">{getStatusIcon(delivery.status)}</span>
                <div className="delivery-details">
                  <span className="delivery-title">{delivery.title}</span>
                  <span className="delivery-meta">
                    {delivery.assets.length} asset(s) • {delivery.platforms.length} platform(s) • {formatTimestamp(delivery.createdAt)}
                  </span>
                </div>
              </div>
              
              <div className="delivery-status">
                <span className="status-text">{delivery.status.toUpperCase()}</span>
                {delivery.status !== 'failed' && delivery.status !== 'delivered' && (
                  <span className="progress-text">{delivery.progress}%</span>
                )}
              </div>
            </div>

            {(delivery.status === 'processing' || delivery.status === 'uploading' || delivery.status === 'validating') && (
              <div className="delivery-progress">
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ width: `${delivery.progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="platform-status">
              {delivery.platforms.map(platformId => {
                const platformDelivery = delivery.platformDeliveries[platformId];
                return (
                  <div key={platformId} className="platform-item">
                    <span className="platform-icon">{getPlatformIcon(platformId)}</span>
                    <span className="platform-name">{PLATFORM_NAMES[platformId]}</span>
                    <span 
                      className="platform-status-indicator"
                      style={{ backgroundColor: STATUS_COLORS[platformDelivery.status] }}
                    />
                  </div>
                );
              })}
            </div>

            {delivery.errors.length > 0 && (
              <div className="delivery-errors">
                {delivery.errors.map((error, index) => (
                  <div key={index} className="error-item">
                    ⚠️ {error}
                  </div>
                ))}
              </div>
            )}

            {selectedDelivery === delivery.id && (
              <div className="delivery-details-panel">
                <div className="details-section">
                  <h4>Assets</h4>
                  <div className="assets-list">
                    {delivery.assets.map((asset, index) => (
                      <div key={index} className="asset-item">
                        <span className="asset-name">{asset.filename}</span>
                        <span className="asset-format">{asset.format.toUpperCase()}</span>
                        <span className="asset-size">{formatFileSize(asset.fileSize)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="details-section">
                  <h4>Platform Details</h4>
                  <div className="platform-details">
                    {delivery.platforms.map(platformId => {
                      const platformDelivery = delivery.platformDeliveries[platformId];
                      return (
                        <div key={platformId} className="platform-detail-item">
                          <div className="platform-header">
                            <span className="platform-icon">{getPlatformIcon(platformId)}</span>
                            <span className="platform-name">{PLATFORM_NAMES[platformId]}</span>
                            <span 
                              className="platform-status-badge"
                              style={{ backgroundColor: STATUS_COLORS[platformDelivery.status] }}
                            >
                              {platformDelivery.status.toUpperCase()}
                            </span>
                          </div>
                          
                          {platformDelivery.url && (
                            <div className="platform-url">
                              <a href={platformDelivery.url} target="_blank" rel="noopener noreferrer">
                                View on {PLATFORM_NAMES[platformId]} ↗
                              </a>
                            </div>
                          )}
                          
                          {platformDelivery.error && (
                            <div className="platform-error">
                              ❌ {platformDelivery.error}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="details-section">
                  <h4>Activity Log</h4>
                  <div className="activity-log">
                    {delivery.logs.map((log, index) => (
                      <div key={index} className="log-item">
                        <span className="log-time">{formatTimestamp(log.timestamp)}</span>
                        <span className="log-message">{log.message}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="details-actions">
                  {(delivery.status === 'pending' || delivery.status === 'processing' || delivery.status === 'uploading') && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        cancelDelivery(delivery.id);
                      }}
                      className="btn-secondary"
                    >
                      Cancel Delivery
                    </button>
                  )}
                  
                  {delivery.status === 'failed' && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        retryDelivery(delivery.id);
                      }}
                      className="btn-primary"
                    >
                      Retry Delivery
                    </button>
                  )}
                  
                  <button 
                    onClick={(e) => e.stopPropagation()}
                    className="btn-secondary"
                  >
                    Download Report
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {filteredDeliveries.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <div className="empty-text">No deliveries found</div>
            <div className="empty-subtext">
              {filter === 'all' ? 'No deliveries yet' : `No ${filter} deliveries`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};