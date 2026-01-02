/**
 * AuditTrail - Immutable audit trail with timestamps
 * 
 * timestamp + action + actor (immutable) - reinforces trust and traceability.
 */

import React from 'react';
import './AuditTrail.css';

export interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  timestamp: Date | string;
  details?: string;
  type?: 'create' | 'update' | 'approve' | 'reject' | 'deliver' | 'system';
}

interface AuditTrailProps {
  entries: AuditEntry[];
  maxItems?: number;
  onViewAll?: () => void;
}

const typeIcons: Record<NonNullable<AuditEntry['type']>, string> = {
  create: '➕',
  update: '✏️',
  approve: '✅',
  reject: '❌',
  deliver: '📤',
  system: '⚙️'
};

const formatTimestamp = (timestamp: Date | string): string => {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  // Less than a minute
  if (diff < 60000) {
    return 'Just now';
  }
  
  // Less than an hour
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins}m ago`;
  }
  
  // Less than a day
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  }
  
  // Less than a week
  if (diff < 604800000) {
    const days = Math.floor(diff / 86400000);
    return `${days}d ago`;
  }
  
  // Format as date
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
};

export const AuditTrail: React.FC<AuditTrailProps> = ({
  entries,
  maxItems = 10,
  onViewAll
}) => {
  const displayEntries = entries.slice(0, maxItems);
  const hasMore = entries.length > maxItems;

  if (entries.length === 0) {
    return (
      <div className="audit-trail empty">
        <p className="audit-trail-empty">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="audit-trail">
      <ol className="audit-trail-list" role="list">
        {displayEntries.map((entry, index) => (
          <li key={entry.id} className="audit-entry">
            <div className="audit-entry-line">
              <span className="audit-entry-dot" aria-hidden="true" />
              {index < displayEntries.length - 1 && (
                <span className="audit-entry-connector" aria-hidden="true" />
              )}
            </div>
            
            <div className="audit-entry-content">
              <div className="audit-entry-header">
                <span className="audit-entry-icon">
                  {entry.type ? typeIcons[entry.type] : '•'}
                </span>
                <span className="audit-entry-action">{entry.action}</span>
              </div>
              <div className="audit-entry-meta">
                <span className="audit-entry-actor">{entry.actor}</span>
                <span className="audit-entry-separator">•</span>
                <time 
                  className="audit-entry-timestamp"
                  dateTime={typeof entry.timestamp === 'string' ? entry.timestamp : entry.timestamp.toISOString()}
                >
                  {formatTimestamp(entry.timestamp)}
                </time>
              </div>
              {entry.details && (
                <p className="audit-entry-details">{entry.details}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
      
      {hasMore && onViewAll && (
        <button className="audit-trail-view-all" onClick={onViewAll}>
          View all activity ({entries.length})
        </button>
      )}
    </div>
  );
};

export default AuditTrail;
