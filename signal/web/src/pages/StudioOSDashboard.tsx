/**
 * StudioOS Dashboard
 * 
 * Main dashboard component with 7 canonical views:
 * 1. Overview - Project status snapshot
 * 2. Assets - Asset inventory
 * 3. Create - Asset ingestion
 * 4. Transform - Job submission
 * 5. Review - Output review
 * 6. Deliver - Delivery management
 * 7. History - Job history
 */

import { useState, useEffect } from 'react';
import { 
  useProjects, 
  useProject, 
  useAssets, 
  useJobs, 
  usePresets,
  useJobProgress,
  studioOS 
} from '../api';
import type { 
  Project, 
  Asset, 
  Job, 
  Preset,
  JobProgressEvent 
} from '../api';
import './StudioOSDashboard.css';

type View = 'overview' | 'assets' | 'create' | 'transform' | 'review' | 'deliver' | 'history';

interface StudioOSDashboardProps {
  onLogout: () => void;
}

export function StudioOSDashboard({ onLogout }: StudioOSDashboardProps) {
  const [currentView, setCurrentView] = useState<View>('overview');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  
  // Data fetching
  const { data: projectsResponse, loading: loadingProjects, refetch: refetchProjects } = useProjects();
  const projects = projectsResponse?.data || [];
  
  // Select first project by default
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  return (
    <div className="studioos-dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="logo">
          <h1>StudioOS</h1>
          <span className="tagline">Production Workspace</span>
        </div>
        
        {/* Project Selector */}
        <div className="project-selector">
          <select 
            value={selectedProjectId || ''} 
            onChange={(e) => setSelectedProjectId(Number(e.target.value))}
            disabled={loadingProjects}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        
        <button onClick={onLogout} className="logout-btn">
          Logout
        </button>
      </header>

      {/* Navigation */}
      <nav className="dashboard-nav">
        {(['overview', 'assets', 'create', 'transform', 'review', 'deliver', 'history'] as View[]).map((view) => (
          <button
            key={view}
            className={`nav-btn ${currentView === view ? 'active' : ''}`}
            onClick={() => setCurrentView(view)}
          >
            {view.charAt(0).toUpperCase() + view.slice(1)}
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <main className="dashboard-main">
        {selectedProjectId ? (
          <ViewContent 
            view={currentView} 
            projectId={selectedProjectId}
            onNavigate={setCurrentView}
            onRefreshProjects={refetchProjects}
          />
        ) : (
          <div className="empty-state">
            {loadingProjects ? 'Loading projects...' : 'No projects found. Create one to get started.'}
          </div>
        )}
      </main>
    </div>
  );
}

// =============================================================================
// View Router
// =============================================================================

interface ViewContentProps {
  view: View;
  projectId: number;
  onNavigate: (view: View) => void;
  onRefreshProjects: () => void;
}

function ViewContent({ view, projectId, onNavigate, onRefreshProjects }: ViewContentProps) {
  switch (view) {
    case 'overview':
      return <OverviewView projectId={projectId} onNavigate={onNavigate} />;
    case 'assets':
      return <AssetsView projectId={projectId} />;
    case 'create':
      return <CreateView projectId={projectId} onNavigate={onNavigate} />;
    case 'transform':
      return <TransformView projectId={projectId} onNavigate={onNavigate} />;
    case 'review':
      return <ReviewView projectId={projectId} />;
    case 'deliver':
      return <DeliverView projectId={projectId} />;
    case 'history':
      return <HistoryView projectId={projectId} />;
    default:
      return <div>Unknown view</div>;
  }
}

// =============================================================================
// Overview View
// =============================================================================

function OverviewView({ projectId, onNavigate }: { projectId: number; onNavigate: (v: View) => void }) {
  const { data: project, loading } = useProject(projectId);
  const { data: assetsResponse } = useAssets(projectId);
  const { data: jobsResponse } = useJobs(projectId);
  
  const assets = assetsResponse?.data || [];
  const jobs = jobsResponse?.data || [];

  if (loading || !project) {
    return <div className="loading">Loading project...</div>;
  }

  const rawAssets = assets.filter(a => a.category === 'RAW').length;
  const derivedAssets = assets.filter(a => a.category === 'DERIVED').length;
  const finalAssets = assets.filter(a => a.category === 'FINAL').length;
  
  const activeJobs = jobs.filter(j => j.state === 'RUNNING' || j.state === 'QUEUED').length;
  const completedJobs = jobs.filter(j => j.state === 'COMPLETED').length;
  const failedJobs = jobs.filter(j => j.state === 'FAILED').length;

  return (
    <div className="view overview-view">
      <h2>Project Overview</h2>
      
      {/* Project Status */}
      <section className="status-card">
        <h3>{project.name}</h3>
        <span className={`state-badge state-${project.state.toLowerCase()}`}>
          {project.state}
        </span>
      </section>

      {/* Asset Summary */}
      <section className="summary-grid">
        <div className="summary-card" onClick={() => onNavigate('assets')}>
          <h4>Assets</h4>
          <div className="summary-stats">
            <div className="stat">
              <span className="value">{rawAssets}</span>
              <span className="label">Raw</span>
            </div>
            <div className="stat">
              <span className="value">{derivedAssets}</span>
              <span className="label">Derived</span>
            </div>
            <div className="stat">
              <span className="value">{finalAssets}</span>
              <span className="label">Final</span>
            </div>
          </div>
        </div>

        {/* Job Summary */}
        <div className="summary-card" onClick={() => onNavigate('history')}>
          <h4>Jobs</h4>
          <div className="summary-stats">
            <div className="stat">
              <span className="value">{activeJobs}</span>
              <span className="label">Active</span>
            </div>
            <div className="stat">
              <span className="value">{completedJobs}</span>
              <span className="label">Completed</span>
            </div>
            <div className="stat">
              <span className="value">{failedJobs}</span>
              <span className="label">Failed</span>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="quick-actions">
        <h4>Quick Actions</h4>
        <div className="action-buttons">
          <button onClick={() => onNavigate('create')}>Upload Asset</button>
          <button onClick={() => onNavigate('transform')}>Submit Job</button>
          <button onClick={() => onNavigate('deliver')}>Prepare Delivery</button>
        </div>
      </section>
    </div>
  );
}

// =============================================================================
// Assets View
// =============================================================================

function AssetsView({ projectId }: { projectId: number }) {
  const { data: assetsResponse, loading, refetch } = useAssets(projectId);
  const assets = assetsResponse?.data || [];
  const [filter, setFilter] = useState<'ALL' | 'RAW' | 'DERIVED' | 'FINAL'>('ALL');

  const filteredAssets = filter === 'ALL' 
    ? assets 
    : assets.filter(a => a.category === filter);

  return (
    <div className="view assets-view">
      <div className="view-header">
        <h2>Assets</h2>
        <div className="filter-tabs">
          {(['ALL', 'RAW', 'DERIVED', 'FINAL'] as const).map((cat) => (
            <button 
              key={cat}
              className={filter === cat ? 'active' : ''}
              onClick={() => setFilter(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading assets...</div>
      ) : filteredAssets.length === 0 ? (
        <div className="empty-state">No assets found</div>
      ) : (
        <div className="assets-grid">
          {filteredAssets.map((asset) => (
            <AssetCard key={asset.id} asset={asset} />
          ))}
        </div>
      )}
    </div>
  );
}

function AssetCard({ asset }: { asset: Asset }) {
  const sizeKB = Math.round(Number(asset.sizeBytes) / 1024);
  const sizeMB = (sizeKB / 1024).toFixed(1);
  
  return (
    <div className="asset-card">
      <div className="asset-icon">🎵</div>
      <div className="asset-info">
        <h4>{asset.name}</h4>
        <span className={`category-badge cat-${asset.category.toLowerCase()}`}>
          {asset.category}
        </span>
        <div className="asset-meta">
          <span>{asset.mimeType}</span>
          <span>{sizeKB > 1024 ? `${sizeMB} MB` : `${sizeKB} KB`}</span>
        </div>
      </div>
      {asset.parentId && (
        <div className="lineage-indicator" title="Derived from parent asset">
          ↳
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Create View (Asset Ingestion)
// =============================================================================

function CreateView({ projectId, onNavigate }: { projectId: number; onNavigate: (v: View) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setSuccess(false);

    try {
      await studioOS.uploadAsset(projectId, file);
      setSuccess(true);
      setTimeout(() => onNavigate('assets'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="view create-view">
      <h2>Create / Ingest Asset</h2>
      
      <div className="upload-zone">
        <input 
          type="file" 
          id="file-upload"
          accept="audio/*"
          onChange={handleUpload}
          disabled={uploading}
        />
        <label htmlFor="file-upload" className="upload-label">
          {uploading ? (
            <span>Uploading...</span>
          ) : (
            <>
              <span className="upload-icon">📁</span>
              <span>Drop audio file here or click to browse</span>
              <span className="upload-hint">Supports WAV, MP3, FLAC, AIFF</span>
            </>
          )}
        </label>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">Asset created successfully!</div>}
    </div>
  );
}

// =============================================================================
// Transform View (Job Submission)
// =============================================================================

function TransformView({ projectId, onNavigate }: { projectId: number; onNavigate: (v: View) => void }) {
  const { data: assetsResponse } = useAssets(projectId);
  const { data: presets, loading: loadingPresets } = usePresets();
  const assets = assetsResponse?.data || [];
  
  const [selectedAssets, setSelectedAssets] = useState<number[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [parameters, setParameters] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter to raw and derived assets (can be transformed)
  const transformableAssets = assets.filter(a => a.category !== 'FINAL');

  const handleSubmit = async () => {
    if (!selectedPreset || selectedAssets.length === 0) return;

    setSubmitting(true);
    setError(null);

    try {
      await studioOS.submitJob({
        projectId,
        preset: selectedPreset,
        assetIds: selectedAssets,
        parameters,
      });
      onNavigate('history');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Job submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleAsset = (id: number) => {
    setSelectedAssets((prev) => 
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  return (
    <div className="view transform-view">
      <h2>Transform</h2>

      {/* Asset Selection */}
      <section className="transform-section">
        <h3>1. Select Assets</h3>
        {transformableAssets.length === 0 ? (
          <div className="empty-state">No assets available for transformation</div>
        ) : (
          <div className="asset-selector">
            {transformableAssets.map((asset) => (
              <label key={asset.id} className="asset-checkbox">
                <input
                  type="checkbox"
                  checked={selectedAssets.includes(asset.id)}
                  onChange={() => toggleAsset(asset.id)}
                />
                <span>{asset.name}</span>
                <span className={`category-badge cat-${asset.category.toLowerCase()}`}>
                  {asset.category}
                </span>
              </label>
            ))}
          </div>
        )}
      </section>

      {/* Preset Selection */}
      <section className="transform-section">
        <h3>2. Select Preset</h3>
        {loadingPresets ? (
          <div className="loading">Loading presets...</div>
        ) : (
          <div className="preset-grid">
            {(presets || []).map((preset) => (
              <div 
                key={preset.id}
                className={`preset-card ${selectedPreset === preset.id ? 'selected' : ''}`}
                onClick={() => setSelectedPreset(preset.id)}
              >
                <h4>{preset.name}</h4>
                <p>{preset.description}</p>
                <span className="preset-category">{preset.category}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Submit */}
      <section className="transform-section">
        <button 
          onClick={handleSubmit}
          disabled={submitting || !selectedPreset || selectedAssets.length === 0}
          className="submit-job-btn"
        >
          {submitting ? 'Submitting...' : 'Submit Job'}
        </button>
        {error && <div className="error-message">{error}</div>}
      </section>
    </div>
  );
}

// =============================================================================
// Review View
// =============================================================================

function ReviewView({ projectId }: { projectId: number }) {
  const { data: jobsResponse, loading } = useJobs(projectId, 'COMPLETED');
  const jobs = jobsResponse?.data || [];

  return (
    <div className="view review-view">
      <h2>Review</h2>
      <p className="view-description">Review completed job outputs and reports.</p>

      {loading ? (
        <div className="loading">Loading completed jobs...</div>
      ) : jobs.length === 0 ? (
        <div className="empty-state">No completed jobs to review</div>
      ) : (
        <div className="jobs-list">
          {jobs.map((job) => (
            <JobReviewCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}

function JobReviewCard({ job }: { job: Job }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="job-review-card">
      <div className="job-header" onClick={() => setExpanded(!expanded)}>
        <span className="job-preset">{job.preset}</span>
        <span className="job-date">{new Date(job.completedAt || job.createdAt).toLocaleString()}</span>
        <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
      </div>
      
      {expanded && (
        <div className="job-details">
          <div className="job-outputs">
            <h5>Outputs</h5>
            {job.outputs && job.outputs.length > 0 ? (
              <ul>
                {job.outputs.map((output) => (
                  <li key={output.id}>{output.name}</li>
                ))}
              </ul>
            ) : (
              <span>No output files</span>
            )}
          </div>
          
          {job.report && (
            <div className="job-report">
              <h5>Report</h5>
              <span className="confidence">
                Confidence: {(job.report.confidence * 100).toFixed(0)}%
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Deliver View
// =============================================================================

function DeliverView({ projectId }: { projectId: number }) {
  const { data: assetsResponse } = useAssets(projectId);
  const assets = assetsResponse?.data || [];
  const finalAssets = assets.filter(a => a.category === 'FINAL');

  return (
    <div className="view deliver-view">
      <h2>Deliver</h2>
      <p className="view-description">Prepare and execute deliveries of final assets.</p>

      <section className="final-assets">
        <h3>Final Assets Ready for Delivery</h3>
        {finalAssets.length === 0 ? (
          <div className="empty-state">
            No final assets ready. Complete jobs to generate deliverables.
          </div>
        ) : (
          <div className="assets-grid">
            {finalAssets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// =============================================================================
// History View
// =============================================================================

function HistoryView({ projectId }: { projectId: number }) {
  const { data: jobsResponse, loading, refetch } = useJobs(projectId);
  const { latestEvent, isConnected } = useJobProgress(projectId);
  const jobs = jobsResponse?.data || [];

  // Refetch when we get job completion events
  useEffect(() => {
    if (latestEvent?.type === 'job:completed' || latestEvent?.type === 'job:failed') {
      refetch();
    }
  }, [latestEvent, refetch]);

  return (
    <div className="view history-view">
      <div className="view-header">
        <h2>Job History</h2>
        <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? '● Live' : '○ Disconnected'}
        </span>
      </div>

      {loading ? (
        <div className="loading">Loading job history...</div>
      ) : jobs.length === 0 ? (
        <div className="empty-state">No jobs yet</div>
      ) : (
        <div className="jobs-table">
          <div className="table-header">
            <span>Preset</span>
            <span>State</span>
            <span>Created</span>
            <span>Duration</span>
          </div>
          {jobs.map((job) => (
            <JobHistoryRow key={job.id} job={job} latestEvent={latestEvent} />
          ))}
        </div>
      )}
    </div>
  );
}

function JobHistoryRow({ job, latestEvent }: { job: Job; latestEvent: JobProgressEvent | null }) {
  // Check if this job has a live update
  const isActive = latestEvent?.jobId === job.id;
  const progress = isActive && latestEvent?.progress ? latestEvent.progress : null;

  const duration = job.completedAt && job.startedAt
    ? Math.round((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000)
    : null;

  return (
    <div className={`table-row ${isActive ? 'active' : ''}`}>
      <span className="job-preset">{job.preset}</span>
      <span className={`state-badge state-${job.state.toLowerCase()}`}>
        {job.state}
        {progress !== null && ` (${progress}%)`}
      </span>
      <span className="job-date">{new Date(job.createdAt).toLocaleString()}</span>
      <span className="job-duration">
        {duration !== null ? `${duration}s` : '-'}
      </span>
    </div>
  );
}

export default StudioOSDashboard;
