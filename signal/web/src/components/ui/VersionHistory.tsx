/**
 * VersionHistory - Version list with current marker
 * 
 * Immutable versioning component always visible.
 */

import React from 'react';
import { StatusDot } from './StatusBadge';
import type { StatusType } from './StatusBadge';
import './VersionHistory.css';

export interface Version {
  id: string;
  version: string;
  label?: string;
  createdAt: Date | string;
  createdBy: string;
  isCurrent?: boolean;
  status?: StatusType;
  size?: string;
}

interface VersionHistoryProps {
  versions: Version[];
  currentVersionId?: string;
  onVersionSelect?: (version: Version) => void;
  onVersionDownload?: (version: Version) => void;
  maxItems?: number;
}

const formatDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const VersionHistory: React.FC<VersionHistoryProps> = ({
  versions,
  currentVersionId,
  onVersionSelect,
  onVersionDownload,
  maxItems
}) => {
  const displayVersions = maxItems ? versions.slice(0, maxItems) : versions;

  if (versions.length === 0) {
    return (
      <div className="version-history empty">
        <p className="version-history-empty">No versions yet</p>
      </div>
    );
  }

  return (
    <div className="version-history">
      <ul className="version-list" role="list">
        {displayVersions.map(version => {
          const isCurrent = version.isCurrent || version.id === currentVersionId;
          
          return (
            <li 
              key={version.id} 
              className={`version-item ${isCurrent ? 'current' : ''}`}
            >
              <div className="version-item-main">
                <div className="version-item-header">
                  <span className="version-number">{version.version}</span>
                  {isCurrent && (
                    <span className="version-current-badge">Current</span>
                  )}
                  {version.status && (
                    <StatusDot status={version.status} size="sm" />
                  )}
                </div>
                
                {version.label && (
                  <span className="version-label">{version.label}</span>
                )}
                
                <div className="version-meta">
                  <span className="version-author">{version.createdBy}</span>
                  <span className="version-separator">•</span>
                  <time className="version-date">{formatDate(version.createdAt)}</time>
                  {version.size && (
                    <>
                      <span className="version-separator">•</span>
                      <span className="version-size">{version.size}</span>
                    </>
                  )}
                </div>
              </div>
              
              <div className="version-item-actions">
                {onVersionSelect && !isCurrent && (
                  <button
                    className="version-action"
                    onClick={() => onVersionSelect(version)}
                    aria-label={`Select version ${version.version}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M7 1V13M1 7H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                )}
                {onVersionDownload && (
                  <button
                    className="version-action"
                    onClick={() => onVersionDownload(version)}
                    aria-label={`Download version ${version.version}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M7 1V10M7 10L4 7M7 10L10 7M1 13H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default VersionHistory;
