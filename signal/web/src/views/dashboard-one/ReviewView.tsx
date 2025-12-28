/**
 * Dashboard One - Review View
 * 
 * Review and approve derived assets with confidence indicators.
 * Per STUDIOOS_FUNCTIONAL_SPECS.md Section 4.5
 */

import { useEffect, useState } from 'react';
import { useProjects, useAssets, studioOS } from '../../api';
import type { Asset, Report } from '../../api';
import { AudioComparison } from '../../components';
import '../../components/AudioComparison.css';

interface ReviewViewProps {
  projectId?: number | null;
  role: 'BASIC' | 'STANDARD' | 'ADVANCED';
  onNavigate: (view: string, id?: number) => void;
}

// Confidence level thresholds
const CONFIDENCE_LEVELS = {
  HIGH: { min: 0.9, color: '#4ade80', label: 'High' },
  MEDIUM: { min: 0.75, color: '#fbbf24', label: 'Medium' },
  LOW: { min: 0, color: '#f87171', label: 'Low' }
};

function getConfidenceLevel(confidence: number) {
  if (confidence >= CONFIDENCE_LEVELS.HIGH.min) return CONFIDENCE_LEVELS.HIGH;
  if (confidence >= CONFIDENCE_LEVELS.MEDIUM.min) return CONFIDENCE_LEVELS.MEDIUM;
  return CONFIDENCE_LEVELS.LOW;
}

export function ReviewView({ projectId: _projectId, role, onNavigate }: ReviewViewProps) {
  const { data: projectsResponse, loading: loadingProjects } = useProjects();
  const projects = projectsResponse?.data || [];
  
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [assetReport, setAssetReport] = useState<Report | null>(null);
  const [approvalComment, setApprovalComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch assets for selected project
  const { data: assetsResponse, loading: loadingAssets, refetch: refetchAssets } = useAssets(selectedProjectId);
  const allAssets = assetsResponse?.data || [];
  // Only show Derived assets (those needing approval)
  const assets = allAssets.filter((a: Asset) => a.category === 'DERIVED');

  // Role-based approval access
  const canApprove = role === 'STANDARD' || role === 'ADVANCED';

  // Select first project by default
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  // Load report when asset selected
  const loadAssetReport = async (asset: Asset) => {
    if (asset.outputJobId) {
      try {
        const report = await studioOS.getJobReport(asset.outputJobId);
        setAssetReport(report);
      } catch {
        setAssetReport(null);
      }
    } else {
      setAssetReport(null);
    }
  };

  const selectAsset = (asset: Asset) => {
    setSelectedAsset(asset);
    loadAssetReport(asset);
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
      setAssetReport(null);
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
      <h2>Review</h2>

      {/* Project Selection */}
      <div className="form-group">
        <label>Project</label>
        <select 
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

      {error && <div className="view-error">{error}</div>}
      {success && <div className="view-success">{success}</div>}

      {/* Pending Review List */}
      <div className="review-list">
        <h3>Pending Review ({assets.length}) {loadingAssets && '(loading...)'}</h3>
        {assets.length === 0 ? (
          <p>No derived assets pending review.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assets.map(asset => (
                <tr key={asset.id} className={selectedAsset?.id === asset.id ? 'selected' : ''}>
                  <td>{asset.name}</td>
                  <td>{new Date(asset.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button onClick={() => selectAsset(asset)}>
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Review Panel */}
      {selectedAsset && (
        <div className="review-panel">
          <h3>Review: {selectedAsset.name}</h3>
          
          <div className="asset-details">
            <p><strong>Category:</strong> {selectedAsset.category}</p>
            <p><strong>Type:</strong> {selectedAsset.mimeType}</p>
            <p><strong>Created:</strong> {new Date(selectedAsset.createdAt).toLocaleString()}</p>
          </div>

          {/* Confidence Indicator */}
          {assetReport && (
            <div className="confidence-section">
              <h4>Processing Confidence</h4>
              <ConfidenceIndicator confidence={assetReport.confidence} />
              {assetReport.summary && (
                <p className="report-summary">{assetReport.summary}</p>
              )}
            </div>
          )}

          {/* Audio Comparison - Before/After */}
          <AudioComparison 
            inputAsset={selectedAsset.parent || null}
            outputAsset={selectedAsset}
          />

          {/* Approval Form */}
          {canApprove ? (
            <div className="approval-form">
              <div className="form-group">
                <label>Approval Comment (optional)</label>
                <textarea
                  value={approvalComment}
                  onChange={(e) => setApprovalComment(e.target.value)}
                  placeholder="Add notes about this approval..."
                  rows={3}
                />
              </div>

              <div className="approval-actions">
                <button 
                  onClick={handleApprove} 
                  disabled={submitting}
                  className="approve-btn"
                >
                  {submitting ? 'Approving...' : 'Approve (Promote to Final)'}
                </button>
                <button 
                  onClick={() => setSelectedAsset(null)}
                  className="cancel-btn"
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
        </div>
      )}

      {/* Navigation */}
      <div className="quick-nav">
        <button onClick={() => onNavigate('deliver')}>
          Go to Deliver (for Final assets)
        </button>
      </div>
    </div>
  );
}
/**
 * Confidence Indicator Component
 * 
 * Displays confidence score with visual gauge and interpretation.
 */
function ConfidenceIndicator({ confidence }: { confidence: number }) {
  const level = getConfidenceLevel(confidence);
  const percentage = Math.round(confidence * 100);

  return (
    <div className="confidence-indicator">
      <div className="confidence-gauge">
        <div 
          className="confidence-fill" 
          style={{ 
            width: `${percentage}%`,
            backgroundColor: level.color 
          }}
        />
      </div>
      <div className="confidence-details">
        <span className="confidence-value">{percentage}%</span>
        <span 
          className="confidence-label"
          style={{ color: level.color }}
        >
          {level.label} Confidence
        </span>
      </div>
      <p className="confidence-explanation">
        {percentage >= 90 
          ? 'Processing completed with high accuracy. Results closely match target specifications.'
          : percentage >= 75
          ? 'Processing completed with acceptable accuracy. Minor deviations from target may exist.'
          : 'Processing completed with lower confidence. Review results carefully before approval.'}
      </p>
    </div>
  );
}