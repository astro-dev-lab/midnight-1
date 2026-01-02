/**
 * IssuesBlock - Plain issues list with single escalation path
 * 
 * Issues surfaced plainly with "View Fixes" button, not multiple tweak options.
 */

import React from 'react';
import { StatusDot } from './StatusBadge';
import type { StatusType } from './StatusBadge';
import './IssuesBlock.css';

export interface Issue {
  id: string;
  title: string;
  description?: string;
  severity: 'error' | 'warning' | 'info';
  category?: string;
  fixAvailable?: boolean;
}

interface IssuesBlockProps {
  issues: Issue[];
  title?: string;
  onViewFixes?: (issue: Issue) => void;
  emptyMessage?: string;
}

const severityToStatus: Record<Issue['severity'], StatusType> = {
  error: 'fail',
  warning: 'pending',
  info: 'info'
};

export const IssuesBlock: React.FC<IssuesBlockProps> = ({
  issues,
  title = 'Issues Detected',
  onViewFixes,
  emptyMessage = 'No issues detected'
}) => {
  if (issues.length === 0) {
    return (
      <div className="issues-block empty">
        <div className="issues-block-empty">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{emptyMessage}</span>
        </div>
      </div>
    );
  }

  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  return (
    <div className="issues-block">
      <header className="issues-block-header">
        <h3 className="issues-block-title">{title}</h3>
        <div className="issues-block-counts">
          {errorCount > 0 && (
            <span className="issue-count error">{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
          )}
          {warningCount > 0 && (
            <span className="issue-count warning">{warningCount} warning{warningCount !== 1 ? 's' : ''}</span>
          )}
        </div>
      </header>
      
      <ul className="issues-list" role="list">
        {issues.map(issue => (
          <li key={issue.id} className={`issue-item severity-${issue.severity}`}>
            <div className="issue-item-content">
              <StatusDot status={severityToStatus[issue.severity]} size="sm" />
              <div className="issue-item-text">
                <span className="issue-item-title">{issue.title}</span>
                {issue.description && (
                  <span className="issue-item-description">{issue.description}</span>
                )}
              </div>
            </div>
            
            {issue.fixAvailable && onViewFixes && (
              <button
                className="issue-view-fixes"
                onClick={() => onViewFixes(issue)}
              >
                View Fixes
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default IssuesBlock;
