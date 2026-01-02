/**
 * AuditColumn - Right audit and history column for StudioOS Dashboard
 * 
 * Displays version history and immutable audit trail with timestamps.
 * Reinforces trust and traceability.
 */

import React from 'react';
import './AuditColumn.css';

interface AuditColumnProps {
  children: React.ReactNode;
  title?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const AuditColumn: React.FC<AuditColumnProps> = ({
  children,
  title = 'History & Audit',
  collapsed = false,
  onToggleCollapse
}) => {
  return (
    <aside className={`audit-column ${collapsed ? 'collapsed' : ''}`}>
      <header className="audit-column-header">
        <h2 className="audit-column-title">{title}</h2>
        {onToggleCollapse && (
          <button
            className="audit-column-toggle"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d={collapsed ? 'M6 3L11 8L6 13' : 'M10 3L5 8L10 13'}
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </header>
      <div className="audit-column-content">
        {children}
      </div>
    </aside>
  );
};

/**
 * AuditSection - Section within the audit column
 */
interface AuditSectionProps {
  children: React.ReactNode;
  title: string;
  icon?: React.ReactNode;
}

export const AuditSection: React.FC<AuditSectionProps> = ({
  children,
  title,
  icon
}) => {
  return (
    <section className="audit-section">
      <header className="audit-section-header">
        {icon && <span className="audit-section-icon">{icon}</span>}
        <h3 className="audit-section-title">{title}</h3>
      </header>
      <div className="audit-section-content">
        {children}
      </div>
    </section>
  );
};

export default AuditColumn;
