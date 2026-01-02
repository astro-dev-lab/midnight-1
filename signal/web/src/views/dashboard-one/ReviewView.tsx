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
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="view">
      {/* Header */}
      <header className="view__header">
        <h2 className="view__title">Review</h2>
        <p className="view__subtitle">Evaluate derived assets and approve for delivery</p>
      </header>

      {/* Project Selection */}
      <section className="section">
        <div className="form-group">
          <label className="form-label">Project</label>
          <select 
            className="form-select"
            style={{ minWidth: '240px' }}
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
        </div>
      </section>

      {error && <div className="error-message">{error}</div>}
      {success && <div style={{ padding: 'var(--space-4)', background: 'rgba(34, 197, 94, 0.1)', borderRadius: 'var(--border-radius)', color: 'var(--color-success)', marginBottom: 'var(--space-4)' }}>{success}</div>}

      {/* Pending Review List */}
      <section className="section">
        <div className="section__header">
          <h3 className="section__title">
            Pending Review ({assets.length})
          </h3>
          {loadingAssets && <span className="badge badge--neutral">Loading...</span>}
        </div>
        
        {assets.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__icon">📋</span>
            <p className="empty-state__title">No derived assets pending review</p>
            <p className="empty-state__description">Transform assets to create derived outputs.</p>
            <button className="btn btn--secondary" onClick={() => onNavigate('transform')}>
              Go to Transform →
            </button>
          </div>
        ) : (
          <div className="cards-grid">
            {assets.map(asset => (
              <div 
                key={asset.id} 
                className={`card card--interactive ${selectedAsset?.id === asset.id ? 'card--selected' : ''}`}
                onClick={() => selectAsset(asset)}
              >
                <div className="card__body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
                    <span style={{ fontWeight: 500, color: 'var(--color-white)' }}>{asset.name}</span>
                    <span className="badge badge--warning">DERIVED</span>
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-400)' }}>
                    Created: {new Date(asset.createdAt).toLocaleDateString()}
                  </div>
                  <button className="btn btn--secondary btn--sm" style={{ marginTop: 'var(--space-3)', width: '100%' }} onClick={() => selectAsset(asset)}>
                    Review
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Review Panel */}
      {selectedAsset && (
        <section className="section section--bordered">
          <h3 className="section__title">Review: {selectedAsset.name}</h3>
          
          {/* Asset Details */}
          <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="card__body">
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 'var(--space-2) var(--space-4)', fontSize: 'var(--font-size-sm)' }}>
                <span style={{ color: 'var(--color-gray-400)' }}>Category:</span>
                <span style={{ color: 'var(--color-white)' }}>{selectedAsset.category}</span>
                <span style={{ color: 'var(--color-gray-400)' }}>Type:</span>
                <span style={{ color: 'var(--color-white)' }}>{selectedAsset.mimeType}</span>
                <span style={{ color: 'var(--color-gray-400)' }}>Created:</span>
                <span style={{ color: 'var(--color-white)' }}>{new Date(selectedAsset.createdAt).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Processing Report */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <h4 className="section__title" style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-3)' }}>Processing Report</h4>
            <ProcessingReport 
              jobId={selectedAsset.outputJobId || undefined}
              isLive={false}
            />
          </div>

          {/* Audio Comparison */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <h4 className="section__title" style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-3)' }}>Before / After Comparison</h4>
            <AudioComparison 
              inputAsset={selectedAsset.parent || null}
              outputAsset={selectedAsset}
            />
          </div>

          {/* Approval Form */}
          {canApprove ? (
            <div className="card">
              <div className="card__body">
                <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                  <label className="form-label">Approval Comment (optional)</label>
                  <textarea
                    value={approvalComment}
                    onChange={(e) => setApprovalComment(e.target.value)}
                    placeholder="Add notes about this approval..."
                    rows={3}
                    className="form-input"
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                  <button 
                    onClick={handleApprove} 
                    disabled={submitting}
                    className="btn btn--primary"
                  >
                    {submitting ? 'Approving...' : 'Approve (Promote to Final)'}
                  </button>
                  <button 
                    onClick={() => setSelectedAsset(null)}
                    className="btn btn--secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card__body" style={{ color: 'var(--color-gray-400)', fontSize: 'var(--font-size-sm)' }}>
                Basic role: You can review assets but cannot approve. Contact a Standard or Advanced user for approval.
              </div>
            </div>
          )}
        </section>
      )}

      {/* Quick Navigation */}
      <section className="section section--bordered">
        <button className="action-card" onClick={() => onNavigate('deliver')}>
          <span className="action-card__icon">📤</span>
          <span className="action-card__content">
            <span className="action-card__label">Go to Deliver</span>
            <span className="action-card__description">Export final assets to platforms</span>
          </span>
        </button>
      </section>
    </div>
  );
}