/**
 * Dashboard Two - Account & Usage View
 * 
 * ============================================================================
 * PERSONA: Operations / Reviewer (Any role)
 * ============================================================================
 * 
 * PRIMARY QUESTION: "What's my account status and usage?"
 * 
 * SUCCESS CONDITION: User understands their role and usage stats
 * 
 * COMPONENT USAGE:
 * - FormField: Display account information
 * - (No core workflow components - this is account management)
 * 
 * RBAC:
 * - Viewer: Can view own account info
 * - Approver: Can view own account info + enhanced stats
 * 
 * ============================================================================
 */

import { useEffect, useState } from 'react';
import type { ExternalRole } from '../../types';
import { FormField } from '../../components/core';

interface AccountData {
  id: number;
  email: string;
  name: string | null;
  externalRole: ExternalRole;
  createdAt: string;
  usage: {
    projectsAccessed: number;
    approvalsGiven: number;
    downloadsThisMonth: number;
  };
}

interface AccountViewProps {
  onLogout: () => void;
}

export function AccountView({ onLogout }: AccountViewProps) {
  const [account, setAccount] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAccount();
  }, []);

  const fetchAccount = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/users/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to load account');
      const data = await response.json();
      setAccount(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load account');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="view-loading">Loading account...</div>;
  }

  if (error) {
    return <div className="view-error">{error}</div>;
  }

  if (!account) {
    return <div className="view-error">Account not found</div>;
  }

  return (
    <div className="account-view">
      <header className="view-header">
        <h2 className="view-title">Account & Usage</h2>
        <p className="view-subtitle">Your account details and activity</p>
      </header>
      
      {/* Account Information — Component: FormField (read-only display) */}
      <section className="account-info">
        <h3 className="section-title">Account Information</h3>
        
        <div className="info-grid">
          <FormField
            label="Email"
            value={account.email}
            readOnly
          />
          
          <FormField
            label="Name"
            value={account.name ?? 'Not set'}
            readOnly
          />
          
          <div className="role-field">
            <label className="field-label">Role</label>
            <div className="role-display">
              <span className={`role-badge role-${account.externalRole.toLowerCase()}`}>
                {account.externalRole}
              </span>
              <p className="role-description">
                {account.externalRole === 'APPROVER' 
                  ? 'You can view, download, and approve deliverables.'
                  : 'You can view shared projects and deliverables.'}
              </p>
            </div>
          </div>
          
          <FormField
            label="Member Since"
            value={new Date(account.createdAt).toLocaleDateString()}
            readOnly
          />
        </div>
      </section>
      
      {/* Usage Stats */}
      <section className="usage-stats">
        <h3 className="section-title">Usage This Month</h3>
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-value">{account.usage.projectsAccessed}</span>
            <span className="stat-label">Projects Accessed</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{account.usage.approvalsGiven}</span>
            <span className="stat-label">Approvals Given</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{account.usage.downloadsThisMonth}</span>
            <span className="stat-label">Downloads</span>
          </div>
        </div>
      </section>
      
      {/* Account Actions */}
      <section className="account-actions">
        <h3 className="section-title">Actions</h3>
        <button 
          className="btn-logout"
          onClick={onLogout}
        >
          Sign Out
        </button>
      </section>
    </div>
  );
}
