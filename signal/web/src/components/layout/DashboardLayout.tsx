/**
 * DashboardLayout - Three-zone layout for StudioOS Dashboard
 * 
 * Left navigation rail | Central decision panel | Right audit column
 */

import React from 'react';
import { NavigationRail } from './NavigationRail';
import type { NavItem } from './NavigationRail';
import { DecisionPanel } from './DecisionPanel';
import { AuditColumn, AuditSection } from './AuditColumn';
import './DashboardLayout.css';

interface DashboardLayoutProps {
  navItems: NavItem[];
  activeNavItem: string;
  onNavigate: (item: NavItem) => void;
  navHeader?: React.ReactNode;
  navFooter?: React.ReactNode;
  
  pageTitle?: string;
  pageSubtitle?: string;
  pageActions?: React.ReactNode;
  children: React.ReactNode;
  
  auditContent?: React.ReactNode;
  showAuditColumn?: boolean;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  navItems,
  activeNavItem,
  onNavigate,
  navHeader,
  navFooter,
  pageTitle,
  pageSubtitle,
  pageActions,
  children,
  auditContent,
  showAuditColumn = true
}) => {
  const [auditCollapsed, setAuditCollapsed] = React.useState(false);

  return (
    <div className="dashboard-layout-container">
      <NavigationRail
        items={navItems}
        activeItem={activeNavItem}
        onNavigate={onNavigate}
        header={navHeader}
        footer={navFooter}
      />
      
      <DecisionPanel
        title={pageTitle}
        subtitle={pageSubtitle}
        actions={pageActions}
      >
        {children}
      </DecisionPanel>
      
      {showAuditColumn && (
        <AuditColumn
          collapsed={auditCollapsed}
          onToggleCollapse={() => setAuditCollapsed(!auditCollapsed)}
        >
          {auditContent}
        </AuditColumn>
      )}
    </div>
  );
};

export { AuditSection };
export default DashboardLayout;
