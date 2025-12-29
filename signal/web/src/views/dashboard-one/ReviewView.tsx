/**
 * Dashboard One - Review View
 * 
 * ============================================================================
 * PERSONA: Independent Rap Artist / Producer
 * ============================================================================
 * 
 * PRIMARY QUESTION: "Does this sound right? Can I trust it?"
 * 
 * SUCCESS CONDITION: User approves with confidence based on report, not speculation
 * 
 * COMPONENT USAGE:
 * - ProcessingReport: Canonical explanation of what happened (isLive=false)
 * - AudioComparison: Before/after comparison with visual waveforms
 * 
 * TRANSPARENCY:
 * - Grounded in processing reports, never speculation
 * - Explains what and why, never how to tweak
 * 
 * ============================================================================
 */

import { useMemo, useEffect, useState } from 'react';
import { useProjects, useAssets, studioOS } from '../../api';
import type { Asset } from '../../api';
import { AudioComparison, ProcessingReport } from '../../components/core';

interface ReviewViewProps {
  projectId?: number | null;
  role: 'BASIC' | 'STANDARD' | 'ADVANCED';
  onNavigate: (view: string, id?: number) => void;
}

export function ReviewView({ projectId, role, onNavigate }: ReviewViewProps) {
  const { data: projectsResponse, loading: loadingProjects } = useProjects();
  const projects = useMemo(() => projectsResponse?.data || [], [projectsResponse]);
  
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(projectId || null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [approvalComment, setApprovalComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch assets for selected project
  const { data: assetsResponse, loading: loadingAssets, refetch: refetchAssets } = useAssets(selectedProjectId);
  const allAssets = assetsResponse?.data || [];
  // Only show Derived assets (those needing approval)
  const assets = allAssets.filter((a: Asset) => a.category === 'DERIVED');

  // Role-based approval access (Basic cannot approve)
  const canApprove = role === 'STANDARD' || role === 'ADVANCED';

  // Select first project by default
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const selectAsset = (asset: Asset) => {
    setSelectedAsset(asset);
  };

  const handleApprove = async () => {
    if (!selectedAsset) return;

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      await studioOS.approveAsset(selectedAsset.id, { 
        approved: true,
        comments: approvalComment || undefined 
      });

      setSuccess(`Asset "${selectedAsset.name}" approved and promoted to Final.`);
      setSelectedAsset(null);
      setApprovalComment('');
      refetchAssets();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to approve asset');
    } finally {
      setSubmitting(false);
    }
  };

  const loading = loadingProjects;

  if (loading) {
    return <div className="view-loading">Loading...</div>;
  }

  return (
    <div className="review-view">
      <header className="view-header">
        <h2 className="view-title">Review</h2>
        <p className="view-subtitle">Evaluate derived assets and approve for delivery</p>
      </header>

      {/* Project Selection */}
      <section className="project-section">
        <label className="section-label">Project</label>
        <select 
          className="project-select"
          value={selectedProjectId || ''} 
          onChange={(e) => {
            setSelectedProjectId(parseInt(e.target.value));
            setSelectedAsset(null);
          }}
        >
          <option value="">Select Project</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </section>

      {error && <div className="view-error">{error}</div>}
      {success && <div className="view-success">{success}</div>}

      {/* Pending Review List */}
      <section className="review-list">
        <h3 className="section-title">
          Pending Review ({assets.length})
          {loadingAssets && <span className="loading-badge">Loading...</span>}
        </h3>
        
        {assets.length === 0 ? (
          <div className="empty-state">
            <p>No derived assets pending review.</p>
            <button className="btn-secondary" onClick={() => onNavigate('transform')}>
              Transform assets to create derived outputs →
            </button>
          </div>
        ) : (
          <div className="review-grid">
            {assets.map(asset => (
              <div 
                key={asset.id} 
                className={`review-card ${selectedAsset?.id === asset.id ? 'selected' : ''}`}
                onClick={() => selectAsset(asset)}
              >
                <div className="card-header">
                  <span className="asset-name">{asset.name}</span>
                  <span className="category-badge">DERIVED</span>
                </div>
                <div className="card-meta">
                  <span>Created: {new Date(asset.createdAt).toLocaleDateString()}</span>
                </div>
                <button className="btn-review" onClick={() => selectAsset(asset)}>
                  Review
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Review Panel - Component: ProcessingReport + AudioComparison */}
      {selectedAsset && (
        <section className="review-panel">
          <h3 className="panel-title">Review: {selectedAsset.name}</h3>
          
          {/* Asset Details */}
          <div className="asset-details">
            <div className="detail-row">
              <span className="label">Category:</span>
              <span className="value">{selectedAsset.category}</span>
            </div>
            <div className="detail-row">
              <span className="label">Type:</span>
              <span className="value">{selectedAsset.mimeType}</span>
            </div>
            <div className="detail-row">
              <span className="label">Created:</span>
              <span className="value">{new Date(selectedAsset.createdAt).toLocaleString()}</span>
            </div>
          </div>

          {/* Processing Report — Component: ProcessingReport */}
          <div className="report-section">
            <h4 className="section-subtitle">Processing Report</h4>
            <ProcessingReport 
              jobId={selectedAsset.outputJobId || undefined}
              isLive={false}
            />
          </div>

          {/* Audio Comparison — Component: AudioComparison */}
          <div className="comparison-section">
            <h4 className="section-subtitle">Before / After Comparison</h4>
            <AudioComparison 
              inputAsset={selectedAsset.parent || null}
              outputAsset={selectedAsset}
            />
          </div>

          {/* Approval Form */}
          {canApprove ? (
            <div className="approval-form">
              <label className="form-label">Approval Comment (optional)</label>
              <textarea
                value={approvalComment}
                onChange={(e) => setApprovalComment(e.target.value)}
                placeholder="Add notes about this approval..."
                rows={3}
                className="approval-textarea"
              />

              <div className="approval-actions">
                <button 
                  onClick={handleApprove} 
                  disabled={submitting}
                  className="btn-approve"
                >
                  {submitting ? 'Approving...' : 'Approve (Promote to Final)'}
                </button>
                <button 
                  onClick={() => setSelectedAsset(null)}
                  className="btn-cancel"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="role-notice">
              Basic role: You can review assets but cannot approve. Contact a Standard or Advanced user for approval.
            </p>
          )}
        </section>
      )}

      {/* Quick Navigation */}
      <footer className="view-footer">
        <button className="btn-secondary" onClick={() => onNavigate('deliver')}>
          Go to Deliver (for Final assets) →
        </button>
      </footer>
    </div>
  );
}