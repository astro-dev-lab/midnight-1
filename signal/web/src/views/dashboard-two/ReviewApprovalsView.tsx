/**
 * Dashboard Two - Review & Approvals View
 * 
 * ============================================================================
 * PERSONA: Operations / Reviewer (Approver role required)
 * ============================================================================
 * 
 * PRIMARY QUESTION: "What needs my approval decision?"
 * 
 * SUCCESS CONDITION: User approves/rejects with confidence based on reports
 * 
 * COMPONENT USAGE:
 * - ProcessingReport: Show processing details for informed decisions
 * - AudioComparison: Before/after comparison for review
 * - AudioVisualization: Visual audio analysis
 * 
 * RBAC:
 * - Viewer: Can view pending items only
 * - Approver: Can approve, reject, and add comments
 * 
 * ============================================================================
 */

import { useEffect, useState } from 'react';
import type { Asset, ExternalRole, Approval } from '../../types';
import { ProcessingReport, AudioComparison, AudioVisualization } from '../../components/core';

interface PendingReview {
  asset: Asset;
  requestedAt: string;
  requestedBy: string;
  report?: {
    type: string;
    summary: string;
    confidence: string;
    changesApplied: string;
  };
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
  const [selectedItem, setSelectedItem] = useState<PendingReview | null>(null);

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
      setSelectedItem(null);
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
      <header className="view-header">
        <h2 className="view-title">Review & Approvals</h2>
        <p className="view-subtitle">Pending approval decisions and history</p>
      </header>
      
      {role !== 'APPROVER' && (
        <div className="role-notice-banner">
          You have VIEWER access. Approval actions require APPROVER role.
        </div>
      )}
      
      {/* Pending Reviews Queue */}
      <section className="pending-reviews">
        <h3 className="section-title">Pending Review ({pending.length})</h3>
        
        {pending.length === 0 ? (
          <div className="empty-state">
            <p>No items awaiting your review.</p>
          </div>
        ) : (
          <div className="review-cards">
            {pending.map(item => (
              <div 
                key={item.asset.id} 
                className={`review-card ${selectedItem?.asset.id === item.asset.id ? 'selected' : ''}`}
              >
                <div className="card-header">
                  <h4 className="asset-name">{item.asset.name}</h4>
                  <span className="category-badge">{item.asset.category}</span>
                </div>
                
                <div className="card-meta">
                  <p>Requested: {new Date(item.requestedAt).toLocaleString()}</p>
                  <p>By: {item.requestedBy}</p>
                </div>
                
                {role === 'APPROVER' && (
                  <button 
                    className="btn-review"
                    onClick={() => setSelectedItem(item)}
                  >
                    Review Details
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Review Detail Panel — Components: ProcessingReport, AudioComparison, AudioVisualization */}
      {selectedItem && (
        <section className="review-detail-panel">
          <div className="panel-header">
            <h3 className="panel-title">Review: {selectedItem.asset.name}</h3>
            <button className="btn-close" onClick={() => setSelectedItem(null)}>×</button>
          </div>

          {/* Audio Analysis — Component: AudioVisualization */}
          <div className="analysis-section">
            <h4 className="section-subtitle">Audio Analysis</h4>
            <div className="visualization-grid">
              <AudioVisualization type="waveform" height={100} showLabels />
              <AudioVisualization type="spectrum" height={100} showLabels />
            </div>
          </div>

          {/* Processing Report — Component: ProcessingReport */}
          <div className="report-section">
            <h4 className="section-subtitle">Processing Report</h4>
            <ProcessingReport 
              report={selectedItem.report || null}
              isLive={false}
            />
          </div>

          {/* Audio Comparison — Component: AudioComparison */}
          <div className="comparison-section">
            <h4 className="section-subtitle">Before / After</h4>
            <AudioComparison 
              inputAsset={selectedItem.asset.parent || null}
              outputAsset={selectedItem.asset}
            />
          </div>

          {/* Approval Actions */}
          {role === 'APPROVER' && (
            <div className="approval-form">
              <label className="form-label">Comment (optional)</label>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Add notes about your decision..."
                rows={3}
                className="approval-textarea"
              />
              
              <div className="approval-actions">
                <button 
                  className="btn-approve"
                  onClick={() => handleApproval(selectedItem.asset.id, 'APPROVE')}
                >
                  Approve
                </button>
                <button 
                  className="btn-reject"
                  onClick={() => handleApproval(selectedItem.asset.id, 'REJECT')}
                >
                  Reject
                </button>
                <button 
                  className="btn-cancel"
                  onClick={() => setSelectedItem(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}
      
      {/* Approval History */}
      <section className="approval-history">
        <h3 className="section-title">Your Approval History</h3>
        
        {history.length === 0 ? (
          <div className="empty-state">
            <p>No approval history.</p>
          </div>
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
                    <span className={`decision-badge decision-${approval.decision.toLowerCase()}`}>
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
