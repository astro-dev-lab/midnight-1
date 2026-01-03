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
import { useProjects, useAssets, useJob, studioOS } from '../../api';
import type { Asset } from '../../api';
import { AudioComparison, ProcessingReport } from '../../components/core';

// =============================================================================
// Confidence Score Card - Prominent ML Confidence Display
// =============================================================================
function ConfidenceScoreCard({ jobId }: { jobId?: number }) {
  const { data: job, loading } = useJob(jobId || 0);
  
  if (!jobId) {
    return null;
  }

  if (loading) {
    return (
      <div className="card" style={{ marginBottom: 'var(--space-4)', background: 'var(--color-gray-800)' }}>
        <div className="card__body" style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
          <span style={{ color: 'var(--color-gray-400)' }}>Loading confidence...</span>
        </div>
      </div>
    );
  }

  // Extract confidence from job report
  const confidence = job?.report?.confidence 
    ? (typeof job.report.confidence === 'string' 
        ? parseFloat(job.report.confidence) 
        : job.report.confidence)
    : null;

  // If no confidence data, show placeholder
  if (confidence === null) {
    return (
      <div className="card" style={{ marginBottom: 'var(--space-4)', background: 'var(--color-gray-800)', border: '1px solid var(--color-gray-700)' }}>
        <div className="card__body" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4)' }}>
          <div style={{ 
            width: '64px', 
            height: '64px', 
            borderRadius: '50%', 
            background: 'var(--color-gray-700)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 'var(--font-size-lg)',
            color: 'var(--color-gray-500)'
          }}>
            ?
          </div>
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--space-1)' }}>
              ML Confidence
            </div>
            <div style={{ color: 'var(--color-gray-400)', fontSize: 'var(--font-size-sm)' }}>
              No confidence data available
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Normalize confidence (handle both 0-1 and 0-100 scales)
  const normalizedConfidence = confidence > 1 ? confidence : confidence * 100;
  
  // Determine confidence level and color
  let level: string;
  let color: string;
  let bgColor: string;
  let description: string;

  if (normalizedConfidence >= 95) {
    level = 'HIGH';
    color = '#22c55e';
    bgColor = 'rgba(34, 197, 94, 0.15)';
    description = 'Processing completed with high accuracy. Ready for approval.';
  } else if (normalizedConfidence >= 85) {
    level = 'GOOD';
    color = '#84cc16';
    bgColor = 'rgba(132, 204, 22, 0.15)';
    description = 'Processing completed successfully. Minor variations possible.';
  } else if (normalizedConfidence >= 70) {
    level = 'MEDIUM';
    color = '#f59e0b';
    bgColor = 'rgba(245, 158, 11, 0.15)';
    description = 'Review recommended. Some processing decisions may need verification.';
  } else {
    level = 'LOW';
    color = '#ef4444';
    bgColor = 'rgba(239, 68, 68, 0.15)';
    description = 'Careful review required. Consider re-processing with different parameters.';
  }

  return (
    <div className="card" style={{ 
      marginBottom: 'var(--space-4)', 
      background: bgColor,
      border: `1px solid ${color}40`
    }}>
      <div className="card__body" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)', padding: 'var(--space-5)' }}>
        {/* Large Confidence Score */}
        <div style={{ 
          position: 'relative',
          width: '80px', 
          height: '80px', 
          flexShrink: 0
        }}>
          {/* Background circle */}
          <svg width="80" height="80" style={{ position: 'absolute', top: 0, left: 0 }}>
            <circle 
              cx="40" cy="40" r="36" 
              fill="none" 
              stroke="var(--color-gray-700)" 
              strokeWidth="6"
            />
            <circle 
              cx="40" cy="40" r="36" 
              fill="none" 
              stroke={color}
              strokeWidth="6"
              strokeDasharray={`${(normalizedConfidence / 100) * 226.2} 226.2`}
              strokeLinecap="round"
              transform="rotate(-90 40 40)"
              style={{ transition: 'stroke-dasharray 0.5s ease' }}
            />
          </svg>
          {/* Center text */}
          <div style={{ 
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center'
          }}>
            <div style={{ 
              fontSize: '1.5rem', 
              fontWeight: 700, 
              color: color,
              lineHeight: 1
            }}>
              {Math.round(normalizedConfidence)}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--color-gray-400)' }}>%</div>
          </div>
        </div>

        {/* Confidence Details */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
            <span style={{ 
              fontSize: 'var(--font-size-xs)', 
              color: 'var(--color-gray-400)', 
              textTransform: 'uppercase', 
              letterSpacing: '0.5px'
            }}>
              ML Confidence
            </span>
            <span style={{ 
              padding: '2px 8px',
              borderRadius: '4px',
              background: color,
              color: 'white',
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              {level}
            </span>
          </div>
          <p style={{ 
            margin: 0, 
            color: 'var(--color-gray-300)', 
            fontSize: 'var(--font-size-sm)',
            lineHeight: 1.5
          }}>
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

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
  const [selectedForBulk, setSelectedForBulk] = useState<Set<number>>(new Set());
  const [approvalComment, setApprovalComment] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
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
      setShowRejectForm(false);
      refetchAssets();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to approve asset');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!selectedAsset) return;
    if (!rejectionReason.trim()) {
      setError('Please provide a reason for rejection.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      await studioOS.approveAsset(selectedAsset.id, { 
        approved: false,
        comments: rejectionReason.trim()
      });

      setSuccess(`Asset "${selectedAsset.name}" rejected. Changes requested.`);
      setSelectedAsset(null);
      setRejectionReason('');
      setShowRejectForm(false);
      refetchAssets();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reject asset');
    } finally {
      setSubmitting(false);
    }
  };

  const cancelReview = () => {
    setSelectedAsset(null);
    setApprovalComment('');
    setRejectionReason('');
    setShowRejectForm(false);
  };

  // Bulk selection handlers
  const toggleBulkSelect = (assetId: number) => {
    setSelectedForBulk(prev => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  const selectAllForBulk = () => {
    if (selectedForBulk.size === assets.length) {
      setSelectedForBulk(new Set());
    } else {
      setSelectedForBulk(new Set(assets.map(a => a.id)));
    }
  };

  const handleBulkApprove = async () => {
    if (selectedForBulk.size === 0) return;

    setSubmitting(true);
    setError('');
    setSuccess('');
    setBulkProgress({ current: 0, total: selectedForBulk.size });

    const assetIds = Array.from(selectedForBulk);
    let approved = 0;
    let failed = 0;

    for (let i = 0; i < assetIds.length; i++) {
      setBulkProgress({ current: i + 1, total: assetIds.length });
      try {
        await studioOS.approveAsset(assetIds[i], { approved: true });
        approved++;
      } catch {
        failed++;
      }
    }

    setBulkProgress(null);
    setSubmitting(false);
    setSelectedForBulk(new Set());
    refetchAssets();

    if (failed === 0) {
      setSuccess(`${approved} asset${approved > 1 ? 's' : ''} approved and promoted to Final.`);
    } else {
      setError(`Approved ${approved}, failed ${failed}. Some assets could not be approved.`);
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

      {/* Bulk Progress */}
      {bulkProgress && (
        <div style={{ padding: 'var(--space-4)', background: 'rgba(59, 130, 246, 0.1)', borderRadius: 'var(--border-radius)', marginBottom: 'var(--space-4)', border: '1px solid var(--color-primary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span style={{ color: 'var(--color-primary)' }}>Processing...</span>
            <span style={{ color: 'var(--color-white)', fontWeight: 500 }}>{bulkProgress.current} / {bulkProgress.total}</span>
          </div>
          <div style={{ marginTop: 'var(--space-2)', height: '4px', background: 'var(--color-gray-700)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--color-primary)', width: `${(bulkProgress.current / bulkProgress.total) * 100}%`, transition: 'width 0.2s' }} />
          </div>
        </div>
      )}

      {/* Pending Review List */}
      <section className="section">
        <div className="section__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <h3 className="section__title" style={{ margin: 0 }}>
              Pending Review ({assets.length})
            </h3>
            {loadingAssets && <span className="badge badge--neutral">Loading...</span>}
          </div>
          
          {/* Bulk Actions */}
          {canApprove && assets.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <button 
                onClick={selectAllForBulk}
                className="btn btn--secondary btn--sm"
                disabled={submitting}
              >
                {selectedForBulk.size === assets.length ? 'Deselect All' : 'Select All'}
              </button>
              {selectedForBulk.size > 0 && (
                <>
                  <span style={{ color: 'var(--color-gray-400)', fontSize: 'var(--font-size-sm)' }}>
                    {selectedForBulk.size} selected
                  </span>
                  <button 
                    onClick={handleBulkApprove}
                    className="btn btn--primary btn--sm"
                    disabled={submitting}
                  >
                    {submitting ? 'Approving...' : `Approve All (${selectedForBulk.size})`}
                  </button>
                  <button 
                    onClick={() => setSelectedForBulk(new Set())}
                    className="btn btn--secondary btn--sm"
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          )}
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
                className={`card card--interactive ${selectedAsset?.id === asset.id ? 'card--selected' : ''} ${selectedForBulk.has(asset.id) ? 'card--bulk-selected' : ''}`}
                onClick={() => selectAsset(asset)}
                style={selectedForBulk.has(asset.id) ? { borderColor: 'var(--color-primary)', boxShadow: '0 0 0 1px var(--color-primary)' } : undefined}
              >
                <div className="card__body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-3)' }}>
                    {/* Bulk checkbox */}
                    {canApprove && assets.length > 1 && (
                      <label 
                        style={{ display: 'flex', alignItems: 'center', marginRight: 'var(--space-2)' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedForBulk.has(asset.id)}
                          onChange={() => toggleBulkSelect(asset.id)}
                          disabled={submitting}
                          style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary)' }}
                        />
                      </label>
                    )}
                    <span style={{ fontWeight: 500, color: 'var(--color-white)', flex: 1 }}>{asset.name}</span>
                    <span className="badge badge--warning">DERIVED</span>
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-400)' }}>
                    Created: {new Date(asset.createdAt).toLocaleDateString()}
                  </div>
                  <button 
                    className="btn btn--secondary btn--sm" 
                    style={{ marginTop: 'var(--space-3)', width: '100%' }} 
                    onClick={(e) => { e.stopPropagation(); selectAsset(asset); }}
                  >
                    Review Details
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
          
          {/* Version Lineage */}
          <div className="card" style={{ marginBottom: 'var(--space-4)', background: 'var(--color-gray-800)', border: '1px solid var(--color-gray-700)' }}>
            <div className="card__header" style={{ borderBottom: '1px solid var(--color-gray-700)', padding: 'var(--space-3) var(--space-4)' }}>
              <h4 style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-gray-300)', fontWeight: 500 }}>
                📊 Asset Lineage
              </h4>
            </div>
            <div className="card__body" style={{ padding: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                {/* Source/Parent Asset */}
                {selectedAsset.parent ? (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 'var(--space-3)',
                    padding: 'var(--space-3)',
                    background: 'var(--color-gray-900)',
                    borderRadius: 'var(--border-radius)',
                    border: '1px solid var(--color-gray-700)'
                  }}>
                    <span style={{ fontSize: '1.25rem' }}>📁</span>
                    <div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-500)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Source</div>
                      <div style={{ fontWeight: 500, color: 'var(--color-white)' }}>{selectedAsset.parent.name}</div>
                      <span className="badge badge--neutral" style={{ marginTop: 'var(--space-1)', fontSize: '10px' }}>{selectedAsset.parent.category}</span>
                    </div>
                  </div>
                ) : selectedAsset.parentId ? (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 'var(--space-3)',
                    padding: 'var(--space-3)',
                    background: 'var(--color-gray-900)',
                    borderRadius: 'var(--border-radius)',
                    border: '1px dashed var(--color-gray-600)'
                  }}>
                    <span style={{ fontSize: '1.25rem', opacity: 0.5 }}>📁</span>
                    <div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-500)' }}>Source</div>
                      <div style={{ color: 'var(--color-gray-400)' }}>Asset #{selectedAsset.parentId}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ 
                    padding: 'var(--space-3)',
                    background: 'var(--color-gray-900)',
                    borderRadius: 'var(--border-radius)',
                    border: '1px dashed var(--color-gray-600)',
                    color: 'var(--color-gray-500)',
                    fontSize: 'var(--font-size-sm)'
                  }}>
                    No parent asset (original upload)
                  </div>
                )}

                {/* Arrow */}
                {(selectedAsset.parent || selectedAsset.parentId) && (
                  <span style={{ color: 'var(--color-gray-500)', fontSize: '1.25rem' }}>→</span>
                )}

                {/* Current Asset */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3)',
                  background: 'rgba(59, 130, 246, 0.1)',
                  borderRadius: 'var(--border-radius)',
                  border: '1px solid var(--color-primary)'
                }}>
                  <span style={{ fontSize: '1.25rem' }}>🎵</span>
                  <div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Current (Under Review)</div>
                    <div style={{ fontWeight: 500, color: 'var(--color-white)' }}>{selectedAsset.name}</div>
                    <span className="badge badge--warning" style={{ marginTop: 'var(--space-1)', fontSize: '10px' }}>{selectedAsset.category}</span>
                  </div>
                </div>

                {/* Arrow to Final (if approved) */}
                <span style={{ color: 'var(--color-gray-600)', fontSize: '1.25rem' }}>→</span>

                {/* Potential Final State */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3)',
                  background: 'var(--color-gray-900)',
                  borderRadius: 'var(--border-radius)',
                  border: '1px dashed var(--color-gray-600)',
                  opacity: 0.6
                }}>
                  <span style={{ fontSize: '1.25rem' }}>✅</span>
                  <div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-500)' }}>If Approved</div>
                    <div style={{ color: 'var(--color-gray-400)' }}>Promoted to FINAL</div>
                  </div>
                </div>
              </div>

              {/* Transformation Info */}
              {selectedAsset.outputJobId && (
                <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-gray-700)' }}>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-500)' }}>
                    Transformation Job: #{selectedAsset.outputJobId}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ML Confidence Score - Prominent Display */}
          <ConfidenceScoreCard jobId={selectedAsset.outputJobId} />

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

          {/* Approval/Reject Form */}
          {canApprove ? (
            <div className="card">
              <div className="card__body">
                {!showRejectForm ? (
                  <>
                    {/* Approval Mode */}
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

                    <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                      <button 
                        onClick={handleApprove} 
                        disabled={submitting}
                        className="btn btn--primary"
                      >
                        {submitting ? 'Approving...' : '✓ Approve (Promote to Final)'}
                      </button>
                      <button 
                        onClick={() => setShowRejectForm(true)}
                        disabled={submitting}
                        className="btn btn--secondary"
                        style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
                      >
                        ✕ Request Changes
                      </button>
                      <button 
                        onClick={cancelReview}
                        className="btn btn--secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Rejection Mode */}
                    <div style={{ 
                      padding: 'var(--space-3)', 
                      background: 'rgba(239, 68, 68, 0.1)', 
                      borderRadius: 'var(--border-radius)', 
                      marginBottom: 'var(--space-4)',
                      border: '1px solid rgba(239, 68, 68, 0.3)'
                    }}>
                      <span style={{ color: 'var(--color-danger)', fontWeight: 500 }}>⚠ Requesting Changes</span>
                      <p style={{ color: 'var(--color-gray-300)', fontSize: 'var(--font-size-sm)', margin: 'var(--space-2) 0 0' }}>
                        This asset will be flagged for revision. The creator will be notified.
                      </p>
                    </div>

                    <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                      <label className="form-label">
                        Reason for Changes <span style={{ color: 'var(--color-danger)' }}>*</span>
                      </label>
                      <textarea
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Describe what needs to be changed and why..."
                        rows={4}
                        className="form-input"
                        style={{ width: '100%', resize: 'vertical' }}
                        required
                      />
                      <p style={{ color: 'var(--color-gray-500)', fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-2)' }}>
                        Be specific: mention timing, levels, artifacts, or other issues.
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                      <button 
                        onClick={handleReject} 
                        disabled={submitting || !rejectionReason.trim()}
                        className="btn"
                        style={{ 
                          background: 'var(--color-danger)', 
                          color: 'white',
                          opacity: (!rejectionReason.trim() || submitting) ? 0.5 : 1
                        }}
                      >
                        {submitting ? 'Submitting...' : 'Submit Request for Changes'}
                      </button>
                      <button 
                        onClick={() => {
                          setShowRejectForm(false);
                          setRejectionReason('');
                        }}
                        disabled={submitting}
                        className="btn btn--secondary"
                      >
                        Back to Review
                      </button>
                    </div>
                  </>
                )}
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