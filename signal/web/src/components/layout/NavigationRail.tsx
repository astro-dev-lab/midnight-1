/**
 * NavigationRail - Left vertical navigation for StudioOS Dashboard
 * 
 * Functional domains, not tools. Enterprise-calm visual language.
 */

import React from 'react';
import './NavigationRail.css';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  badge?: number;
}

interface NavigationRailProps {
  items: NavItem[];
  activeItem: string;
  onNavigate: (item: NavItem) => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

export const NavigationRail: React.FC<NavigationRailProps> = ({
  items,
  activeItem,
  onNavigate,
  header,
  footer
}) => {
  return (
    <nav className="navigation-rail" role="navigation" aria-label="Main navigation">
      {header && (
        <div className="nav-rail-header">
          {header}
        </div>
      )}
      
      <ul className="nav-rail-items" role="list">
        {items.map(item => (
          <li key={item.id} role="listitem">
            <button
              className={`nav-rail-item ${activeItem === item.id ? 'active' : ''}`}
              onClick={() => onNavigate(item)}
              aria-current={activeItem === item.id ? 'page' : undefined}
            >
              <span className="nav-rail-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="nav-rail-label">{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="nav-rail-badge" aria-label={`${item.badge} notifications`}>
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      
      {footer && (
        <div className="nav-rail-footer">
          {footer}
        </div>
      )}
    </nav>
  );
};

export default NavigationRail;
