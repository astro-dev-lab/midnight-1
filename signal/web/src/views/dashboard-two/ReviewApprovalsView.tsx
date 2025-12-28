/**
 * Dashboard Two - Review & Approvals View
 * 
 * External approval workflow for deliverables.
 * Per STUDIOOS_DASHBOARD_TWO_FUNCTIONAL_SPECS.md Section 4.3
 */

import { useEffect, useState } from 'react';
import type { Asset, ExternalRole, Approval } from '../../types';

interface PendingReview {
  asset: Asset;
  requestedAt: string;
  requestedBy: string;
}

interface ReviewApprovalsViewProps {
  role: ExternalRole;
}

export function ReviewApprovalsView({ role }: ReviewApprovalsViewProps) {
  const [pending, setPending] = useState<PendingReview[]>([]);
  const [history, setHistory] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<number | null>(null);

  useEffect(() => {
    fetchReviews();
  }, []);

  const fetchReviews = async () => {
    try {
      const token = localStorage.getItem('token');
      
      const [pendingRes, historyRes] = await Promise.all([
        fetch('/api/deliveries/external/pending', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/deliveries/external/history', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      
      if (!pendingRes.ok || !historyRes.ok) {
        throw new Error('Failed to load reviews');
      }
      
      const pendingData = await pendingRes.json();
      const historyData = await historyRes.json();
      
      setPending(pendingData.data);
      setHistory(historyData.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (assetId: number, action: 'APPROVE' | 'REJECT') => {
    if (role !== 'APPROVER') {
      setError('Approval requires APPROVER role');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/deliveries/${assetId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          decision: action,
          comment: comment || undefined
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Approval failed');
      }

      setComment('');
      setSelectedAsset(null);
      fetchReviews();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    }
  };

  if (loading) {
    return <div className="view-loading">Loading reviews...</div>;
  }

  if (error) {
    return <div className="view-error">{error}</div>;
  }

  return (
    <div className="review-approvals-view">
      <h2>Review & Approvals</h2>
      
      {role !== 'APPROVER' && (
        <div className="role-notice-banner">
          You have VIEWER access. Approval actions require APPROVER role.
        </div>
      )}
      
      <section className="pending-reviews">
        <h3>Pending Review ({pending.length})</h3>
        
        {pending.length === 0 ? (
          <p>No items awaiting your review.</p>
        ) : (
          <div className="review-cards">
            {pending.map(item => (
              <div key={item.asset.id} className="review-card">
                <h4>{item.asset.name}</h4>
                <p>Category: {item.asset.category}</p>
                <p>Requested: {new Date(item.requestedAt).toLocaleString()}</p>
                <p>By: {item.requestedBy}</p>
                
                {role === 'APPROVER' && (
                  <div className="approval-actions">
                    {selectedAsset === item.asset.id ? (
                      <>
                        <textarea
                          value={comment}
                          onChange={e => setComment(e.target.value)}
                          placeholder="Optional comment..."
                          rows={2}
                        />
                        <div className="action-buttons">
                          <button 
                            className="approve-btn"
                            onClick={() => handleApproval(item.asset.id, 'APPROVE')}
                          >
                            Approve
                          </button>
                          <button 
                            className="reject-btn"
                            onClick={() => handleApproval(item.asset.id, 'REJECT')}
                          >
                            Reject
                          </button>
                          <button onClick={() => setSelectedAsset(null)}>Cancel</button>
                        </div>
                      </>
                    ) : (
                      <button onClick={() => setSelectedAsset(item.asset.id)}>
                        Review
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
      
      <section className="approval-history">
        <h3>Your Approval History</h3>
        
        {history.length === 0 ? (
          <p>No approval history.</p>
        ) : (
          <table className="history-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Decision</th>
                <th>Comment</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {history.map(approval => (
                <tr key={approval.id}>
                  <td>{approval.asset?.name ?? 'Unknown'}</td>
                  <td>
                    <span className={`decision-${approval.decision.toLowerCase()}`}>
                      {approval.decision}
                    </span>
                  </td>
                  <td>{approval.comment ?? '-'}</td>
                  <td>{new Date(approval.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
