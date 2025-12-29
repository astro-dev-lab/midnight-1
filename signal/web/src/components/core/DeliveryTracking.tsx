import React, { useState, useEffect } from 'react';
import { FormField } from '../FormField';
import { studioOS } from '../../api/client';
import type { Delivery as ApiDelivery } from '../../api/types';
import './DeliveryTracking.css';

interface TrackingEvent {
  id: string;
  timestamp: number;
  type: string;
  message: string;
  details?: any;
  platform?: string;
  status?: string;
}

interface DeliveryStatus {
  deliveryId: string;
  title: string;
  status: string;
  platforms: Array<{
    id: string;
    name: string;
    status: string;
    progress: number;
    url?: string;
    error?: string;
  }>;
  events: TrackingEvent[];
  createdAt: number;
  updatedAt: number;
  estimatedCompletion?: number;
}

interface DeliveryTrackingProps {
  deliveryId: string;
  onStatusChange?: (status: DeliveryStatus) => void;
  realTimeUpdates?: boolean;
}

const STATUS_ICONS: Record<string, string> = {
  pending: '⏳',
  validating: '🔍',
  processing: '⚙️',
  uploading: '⬆️',
  delivered: '✅',
  failed: '❌',
  cancelled: '🚫'
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#6b7280',
  validating: '#f59e0b',
  processing: '#3b82f6',
  uploading: '#8b5cf6',
  delivered: '#22c55e',
  failed: '#ef4444',
  cancelled: '#9ca3af'
};

const PLATFORM_ICONS = {
  spotify: '🎵',
  apple_music: '🍎',
  youtube_music: '📺',
  tidal: '🌊',
  amazon_music: '📦',
  bandcamp: '🎪'
};

export const DeliveryTracking: React.FC<DeliveryTrackingProps> = ({
  deliveryId,
  onStatusChange,
  realTimeUpdates = true
}) => {
  const [status, setStatus] = useState<DeliveryStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(realTimeUpdates);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);

  useEffect(() => {
    loadDeliveryStatus();
    
    let interval: ReturnType<typeof setInterval>;
    if (autoRefresh) {
      interval = setInterval(loadDeliveryStatus, 3000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [deliveryId, autoRefresh]);

  useEffect(() => {
    if (status && onStatusChange) {
      onStatusChange(status);
    }
  }, [status, onStatusChange]);

  const loadDeliveryStatus = async () => {
    try {
      setError(null);
      const apiDelivery = await studioOS.getDelivery(parseInt(deliveryId));
      
      // Map API response to component format
      const mappedStatus: DeliveryStatus = {
        deliveryId: String(apiDelivery.id),
        title: apiDelivery.destination,
        status: apiDelivery.status,
        platforms: [{
          id: apiDelivery.destination.toLowerCase().replace(/\s+/g, '_'),
          name: apiDelivery.destination,
          status: apiDelivery.status,
          progress: apiDelivery.status === 'completed' ? 100 : apiDelivery.status === 'pending' ? 0 : 50,
          url: apiDelivery.status === 'completed' ? undefined : undefined,
          error: apiDelivery.status === 'failed' ? 'Delivery failed' : undefined
        }],
        events: [
          {
            id: 'event_created',
            timestamp: new Date(apiDelivery.createdAt).getTime(),
            type: 'delivery_created',
            message: 'Delivery initiated',
            status: 'pending'
          },
          ...(apiDelivery.completedAt ? [{
            id: 'event_completed',
            timestamp: new Date(apiDelivery.completedAt).getTime(),
            type: apiDelivery.status === 'completed' ? 'delivery_completed' : 'delivery_failed',
            message: apiDelivery.status === 'completed' ? 'Delivery completed' : 'Delivery failed',
            status: apiDelivery.status
          }] : [])
        ],
        createdAt: new Date(apiDelivery.createdAt).getTime(),
        updatedAt: new Date(apiDelivery.completedAt || apiDelivery.createdAt).getTime()
      };
      
      setStatus(mappedStatus);
    } catch (err) {
      console.error('The delivery status failed to load due to System error.', err);
      setError(err instanceof Error ? err.message : 'Failed to load delivery status');
    } finally {
      setIsLoading(false);
    }
  };

  const formatTimestamp = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const getOverallProgress = (): number => {
    if (!status) return 0;
    
    const totalPlatforms = status.platforms.length;
    const completedPlatforms = status.platforms.filter(p => p.status === 'delivered').length;
    const progressSum = status.platforms.reduce((sum, p) => sum + p.progress, 0);
    
    return Math.round(progressSum / totalPlatforms);
  };

  const getEstimatedTimeRemaining = (): string | null => {
    if (!status?.estimatedCompletion) return null;
    
    const remaining = status.estimatedCompletion - Date.now();
    if (remaining <= 0) return 'Any moment now';
    
    const minutes = Math.floor(remaining / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `~${hours}h ${minutes % 60}m remaining`;
    }
    return `~${minutes}m remaining`;
  };

  const retryPlatform = async (platformId: string) => {
    try {
      const response = await fetch(`/api/deliveries/${deliveryId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platforms: [platformId] })
      });
      
      if (response.ok) {
        loadDeliveryStatus(); // Refresh status
      }
    } catch (error) {
      console.error('Failed to retry platform:', error);
    }
  };

  const cancelDelivery = async () => {
    try {
      const response = await fetch(`/api/deliveries/${deliveryId}/cancel`, {
        method: 'POST'
      });
      
      if (response.ok) {
        loadDeliveryStatus(); // Refresh status
      }
    } catch (error) {
      console.error('Failed to cancel delivery:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="delivery-tracking loading">
        <div className="loading-spinner">
          <div className="spinner" />
          <span>Loading delivery status...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="delivery-tracking error">
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          <div>
            <div className="error-title">Failed to load delivery</div>
            <div className="error-details">{error}</div>
          </div>
          <button onClick={loadDeliveryStatus} className="btn-secondary">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="delivery-tracking empty">
        <div className="empty-message">
          <span className="empty-icon">📭</span>
          <div>Delivery not found</div>
        </div>
      </div>
    );
  }

  const overallProgress = getOverallProgress();
  const timeRemaining = getEstimatedTimeRemaining();

  return (
    <div className="delivery-tracking">
      <div className="tracking-header">
        <div className="delivery-info">
          <h3 className="delivery-title">{status.title}</h3>
          <div className="delivery-meta">
            <span className="delivery-id">ID: {status.deliveryId}</span>
            <span className="delivery-created">Created {formatTimestamp(status.createdAt)}</span>
          </div>
        </div>
        
        <div className="delivery-controls">
          <div className="auto-refresh-toggle">
            <FormField label="">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
                Auto-refresh
              </label>
            </FormField>
          </div>
          
          {status.status === 'uploading' && (
            <button onClick={cancelDelivery} className="btn-secondary">
              Cancel Delivery
            </button>
          )}
        </div>
      </div>

      <div className="overall-status">
        <div className="status-info">
          <div className="status-badge" style={{ backgroundColor: STATUS_COLORS[status.status] }}>
            <span className="status-icon">{STATUS_ICONS[status.status]}</span>
            <span className="status-text">{status.status.toUpperCase()}</span>
          </div>
          
          <div className="progress-info">
            <span className="progress-text">{overallProgress}% Complete</span>
            {timeRemaining && (
              <span className="time-remaining">{timeRemaining}</span>
            )}
          </div>
        </div>

        {status.status !== 'delivered' && status.status !== 'failed' && (
          <div className="overall-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ 
                  width: `${overallProgress}%`,
                  backgroundColor: STATUS_COLORS[status.status]
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="platforms-section">
        <h4>Platform Status</h4>
        <div className="platforms-grid">
          {status.platforms.map(platform => (
            <div 
              key={platform.id}
              className={`platform-card ${platform.status} ${selectedPlatform === platform.id ? 'selected' : ''}`}
              onClick={() => setSelectedPlatform(
                selectedPlatform === platform.id ? null : platform.id
              )}
            >
              <div className="platform-header">
                <div className="platform-info">
                  <span className="platform-icon">
                    {PLATFORM_ICONS[platform.id as keyof typeof PLATFORM_ICONS] || '🎵'}
                  </span>
                  <span className="platform-name">{platform.name}</span>
                </div>
                
                <div className="platform-status">
                  <span 
                    className="status-indicator"
                    style={{ backgroundColor: STATUS_COLORS[platform.status] }}
                  />
                  <span className="status-text">{platform.status}</span>
                </div>
              </div>

              {platform.status === 'uploading' && (
                <div className="platform-progress">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill"
                      style={{ width: `${platform.progress}%` }}
                    />
                  </div>
                  <span className="progress-text">{platform.progress}%</span>
                </div>
              )}

              {platform.url && (
                <div className="platform-link">
                  <a 
                    href={platform.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View on {platform.name} ↗
                  </a>
                </div>
              )}

              {platform.error && (
                <div className="platform-error">
                  <span className="error-icon">⚠️</span>
                  <span className="error-text">{platform.error}</span>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      retryPlatform(platform.id);
                    }}
                    className="btn-retry"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="activity-timeline">
        <h4>Activity Timeline</h4>
        <div className="timeline">
          {status.events.map(event => (
            <div key={event.id} className="timeline-event">
              <div className="event-marker" style={{ 
                backgroundColor: STATUS_COLORS[event.status || 'pending'] 
              }} />
              
              <div className="event-content">
                <div className="event-header">
                  <span className="event-message">{event.message}</span>
                  <span className="event-time">{formatTimestamp(event.timestamp)}</span>
                </div>
                
                {event.platform && (
                  <div className="event-platform">
                    <span className="platform-icon">
                      {PLATFORM_ICONS[event.platform as keyof typeof PLATFORM_ICONS]}
                    </span>
                    <span className="platform-name">
                      {status.platforms.find(p => p.id === event.platform)?.name}
                    </span>
                  </div>
                )}
                
                {event.details && (
                  <div className="event-details">
                    {JSON.stringify(event.details, null, 2)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};