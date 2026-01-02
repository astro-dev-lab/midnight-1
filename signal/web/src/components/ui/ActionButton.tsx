/**
 * ActionButton - Decision-oriented action buttons
 * 
 * Actions are decisions: Upload, View Fixes, Approve, Download
 */

import React from 'react';
import './ActionButton.css';

interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  fullWidth?: boolean;
}

export const ActionButton: React.FC<ActionButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  fullWidth = false,
  disabled,
  className = '',
  ...props
}) => {
  return (
    <button
      className={`action-button variant-${variant} size-${size} ${fullWidth ? 'full-width' : ''} ${loading ? 'loading' : ''} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="action-button-spinner" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="32" strokeDashoffset="12" />
          </svg>
        </span>
      )}
      {!loading && icon && iconPosition === 'left' && (
        <span className="action-button-icon">{icon}</span>
      )}
      {children && <span className="action-button-label">{children}</span>}
      {!loading && icon && iconPosition === 'right' && (
        <span className="action-button-icon">{icon}</span>
      )}
    </button>
  );
};

export default ActionButton;
