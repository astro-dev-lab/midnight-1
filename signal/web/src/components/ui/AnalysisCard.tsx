/**
 * AnalysisCard - Expandable analysis result card
 * 
 * Pass/fail indicator with expandable detail for loudness, peak level,
 * stereo balance, technical compliance, etc.
 */

import React, { useState } from 'react';
import { StatusDot } from './StatusBadge';
import type { StatusType } from './StatusBadge';
import './AnalysisCard.css';

interface AnalysisMetric {
  label: string;
  value: string | number;
  unit?: string;
  status?: StatusType;
}

interface AnalysisCardProps {
  title: string;
  status: StatusType;
  summary?: string;
  metrics?: AnalysisMetric[];
  details?: React.ReactNode;
  defaultExpanded?: boolean;
  onAction?: () => void;
  actionLabel?: string;
}

export const AnalysisCard: React.FC<AnalysisCardProps> = ({
  title,
  status,
  summary,
  metrics,
  details,
  defaultExpanded = false,
  onAction,
  actionLabel
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasExpandableContent = metrics || details;

  return (
    <article className={`analysis-card status-${status}`}>
      <header 
        className="analysis-card-header"
        onClick={() => hasExpandableContent && setExpanded(!expanded)}
        role={hasExpandableContent ? 'button' : undefined}
        aria-expanded={hasExpandableContent ? expanded : undefined}
        tabIndex={hasExpandableContent ? 0 : undefined}
        onKeyDown={(e) => {
          if (hasExpandableContent && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        <div className="analysis-card-title-row">
          <StatusDot status={status} size="md" />
          <h3 className="analysis-card-title">{title}</h3>
        </div>
        
        <div className="analysis-card-header-right">
          {summary && <span className="analysis-card-summary">{summary}</span>}
          {hasExpandableContent && (
            <svg
              className={`analysis-card-chevron ${expanded ? 'expanded' : ''}`}
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4 6L8 10L12 6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      </header>

      {expanded && hasExpandableContent && (
        <div className="analysis-card-content">
          {metrics && metrics.length > 0 && (
            <div className="analysis-card-metrics">
              {metrics.map((metric, index) => (
                <div key={index} className="analysis-metric">
                  <span className="analysis-metric-label">{metric.label}</span>
                  <span className="analysis-metric-value">
                    {metric.status && <StatusDot status={metric.status} size="sm" />}
                    {metric.value}
                    {metric.unit && <span className="analysis-metric-unit">{metric.unit}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
          
          {details && (
            <div className="analysis-card-details">
              {details}
            </div>
          )}
          
          {onAction && actionLabel && (
            <div className="analysis-card-actions">
              <button className="analysis-card-action" onClick={onAction}>
                {actionLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
};

export default AnalysisCard;
