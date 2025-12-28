/**
 * Dashboard Two - Account & Usage View
 * 
 * Account settings and usage information for external users.
 * Per STUDIOOS_DASHBOARD_TWO_FUNCTIONAL_SPECS.md Section 4.5
 */

import { useEffect, useState } from 'react';
import type { ExternalRole } from '../../types';

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
      <h2>Account & Usage</h2>
      
      <section className="account-info">
        <h3>Account Information</h3>
        <dl>
          <dt>Email</dt>
          <dd>{account.email}</dd>
          
          <dt>Name</dt>
          <dd>{account.name ?? 'Not set'}</dd>
          
          <dt>Role</dt>
          <dd>
            <span className="role-badge">{account.externalRole}</span>
            <p className="role-description">
              {account.externalRole === 'APPROVER' 
                ? 'You can view, download, and approve deliverables.'
                : 'You can view shared projects and deliverables.'}
            </p>
          </dd>
          
          <dt>Member Since</dt>
          <dd>{new Date(account.createdAt).toLocaleDateString()}</dd>
        </dl>
      </section>
      
      <section className="usage-stats">
        <h3>Usage This Month</h3>
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
      
      <section className="account-actions">
        <h3>Actions</h3>
        <button 
          className="logout-btn"
          onClick={onLogout}
        >
          Sign Out
        </button>
      </section>
    </div>
  );
}
