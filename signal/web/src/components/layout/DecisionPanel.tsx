/**
 * DecisionPanel - Central decision surface for StudioOS Dashboard
 * 
 * The "Is it ready?" surface showing project context, confidence score,
 * compliance status, tasks due, and version info.
 */

import React from 'react';
import './DecisionPanel.css';

interface DecisionPanelProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const DecisionPanel: React.FC<DecisionPanelProps> = ({
  children,
  title,
  subtitle,
  actions
}) => {
  return (
    <main className="decision-panel">
      {(title || actions) && (
        <header className="decision-panel-header">
          <div className="decision-panel-titles">
            {title && <h1 className="decision-panel-title">{title}</h1>}
            {subtitle && <p className="decision-panel-subtitle">{subtitle}</p>}
          </div>
          {actions && (
            <div className="decision-panel-actions">
              {actions}
            </div>
          )}
        </header>
      )}
      <div className="decision-panel-content">
        {children}
      </div>
    </main>
  );
};

/**
 * DecisionCard - Card container within the decision panel
 */
interface DecisionCardProps {
  children: React.ReactNode;
  title?: string;
  status?: 'pass' | 'pending' | 'fail' | 'neutral';
  expandable?: boolean;
  defaultExpanded?: boolean;
  onToggle?: (expanded: boolean) => void;
}

export const DecisionCard: React.FC<DecisionCardProps> = ({
  children,
  title,
  status = 'neutral',
  expandable = false,
  defaultExpanded = true,
  onToggle
}) => {
  const [expanded, setExpanded] = React.useState(defaultExpanded);

  const handleToggle = () => {
    const newState = !expanded;
    setExpanded(newState);
    onToggle?.(newState);
  };

  return (
    <article className={`decision-card status-${status}`}>
      {title && (
        <header className="decision-card-header">
          <div className="decision-card-title-row">
            <span className={`decision-card-indicator status-${status}`} aria-hidden="true" />
            <h2 className="decision-card-title">{title}</h2>
          </div>
          {expandable && (
            <button
              className="decision-card-toggle"
              onClick={handleToggle}
              aria-expanded={expanded}
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              <svg
                className={`toggle-icon ${expanded ? 'expanded' : ''}`}
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M5 7.5L10 12.5L15 7.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </header>
      )}
      {(!expandable || expanded) && (
        <div className="decision-card-content">
          {children}
        </div>
      )}
    </article>
  );
};

export default DecisionPanel;
