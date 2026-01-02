/**
 * StatusBadge - Pass/Pending/Fail state indicator
 * 
 * Color for state only - green = pass, amber = pending, red = risk
 */

import React from 'react';
import './StatusBadge.css';

export type StatusType = 'pass' | 'pending' | 'fail' | 'neutral' | 'info';

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'solid' | 'outline' | 'subtle';
  icon?: React.ReactNode;
}

const defaultLabels: Record<StatusType, string> = {
  pass: 'Pass',
  pending: 'Pending',
  fail: 'Fail',
  neutral: 'Unknown',
  info: 'Info'
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  size = 'md',
  variant = 'subtle',
  icon
}) => {
  const displayLabel = label ?? defaultLabels[status];

  return (
    <span className={`status-badge status-${status} size-${size} variant-${variant}`}>
      {icon && <span className="status-badge-icon">{icon}</span>}
      <span className="status-badge-label">{displayLabel}</span>
    </span>
  );
};

/**
 * StatusDot - Minimal status indicator (just the dot)
 */
interface StatusDotProps {
  status: StatusType;
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
}

export const StatusDot: React.FC<StatusDotProps> = ({
  status,
  size = 'md',
  pulse = false
}) => {
  return (
    <span 
      className={`status-dot status-${status} size-${size} ${pulse ? 'pulse' : ''}`}
      aria-label={defaultLabels[status]}
    />
  );
};

export default StatusBadge;
