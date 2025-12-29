/**
 * Dashboard One - History View
 * 
 * ============================================================================
 * PERSONA: Producer/Engineer
 * ============================================================================
 * 
 * PRIMARY QUESTION: "What happened to my jobs? Can I track deliveries?"
 * 
 * SUCCESS CONDITION: User understands job/delivery status with real-time updates
 * 
 * COMPONENT USAGE:
 * - JobManager: View job history with real-time progress
 * - DeliveryTracking: Track delivery status with live updates
 * 
 * SSE INTEGRATION:
 * - Real-time job progress events
 * - Automatic refetch on completion/failure
 * 
 * ============================================================================
 */

import { useMemo, useEffect, useState } from 'react';
import { useProjects, useJobs, useJobProgress, studioOS } from '../../api';
import type { Job, Report, Delivery } from '../../api';
import { JobManager } from '../../components/core/JobManager';
import { DeliveryManager } from '../../components/core/DeliveryManager';
import './HistoryView.css';

interface HistoryViewProps {
  projectId?: number | null;
  role: 'BASIC' | 'STANDARD' | 'ADVANCED';
}

export function HistoryView({ projectId, role }: HistoryViewProps) {
  const { data: projectsResponse, loading: loadingProjects } = useProjects();
  const projects = useMemo(() => projectsResponse?.data || [], [projectsResponse]);
  
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(projectId || null);
  const [stateFilter, setStateFilter] = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [activeTab, setActiveTab] = useState<'jobs' | 'deliveries'>('jobs');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch jobs for selected project
  const { data: jobsResponse, loading: loadingJobs, refetch: refetchJobs } = useJobs(
    selectedProjectId, 
    stateFilter || undefined
  );
  const jobs = jobsResponse?.data || [];
  
  // Real-time job progress via SSE
  const { latestEvent, isConnected } = useJobProgress(selectedProjectId);

  // Role-based rerun access
  const canRerun = role === 'STANDARD' || role === 'ADVANCED';
  const hasFullAudit = role === 'ADVANCED';

  // Select first project by default
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  // Fetch deliveries when project changes
  useEffect(() => {
    if (selectedProjectId) {
      fetchDeliveries(selectedProjectId);
    }
  }, [selectedProjectId]);

  // Refetch jobs on completion/failure events
  useEffect(() => {
    if (latestEvent?.type === 'job:completed' || latestEvent?.type === 'job:failed') {
      refetchJobs();
    }
  }, [latestEvent, refetchJobs]);

  const fetchDeliveries = async (projectId: number) => {
    try {
      const response = await studioOS.getDeliveries(projectId);
      setDeliveries(response.data);
    } catch {
      // Ignore delivery fetch errors
    }
  };

  const fetchJobReport = async (jobId: number) => {
    try {
      const report = await studioOS.getJobReport(jobId);
      setReports(report ? [report] : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    }
  };

  const handleRerun = async (jobId: number) => {
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      await studioOS.rerunJob({ originalJobId: jobId });
      setSuccess('Job rerun initiated successfully!');
      refetchJobs();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to rerun job');
    } finally {
      setSubmitting(false);
    }
  };

  const selectJob = (job: Job | null) => {
    setSelectedJob(job);
    if (job && job.state === 'COMPLETED') {
      fetchJobReport(job.id);
    } else {
      setReports([]);
    }
  };

  const loading = loadingProjects;

  if (loading) {
    return <div className="view-loading">Loading...</div>;
  }

  return (
    <div className="history-view">
      <header className="view-header">
        <div className="header-content">
          <h2 className="view-title">History</h2>
          <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '● Live Updates' : '○ Disconnected'}
          </span>
        </div>
        <p className="view-subtitle">Track jobs and deliveries with real-time status updates</p>
      </header>

      {/* Project Selection */}
      <section className="controls-section">
        <select 
          className="project-select"
          value={selectedProjectId || ''} 
          onChange={(e) => {
            setSelectedProjectId(parseInt(e.target.value));
            setSelectedJob(null);
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

      {/* Tab Navigation */}
      <nav className="tab-nav">
        <button 
          className={`tab-btn ${activeTab === 'jobs' ? 'active' : ''}`}
          onClick={() => setActiveTab('jobs')}
        >
          Jobs ({jobs.length})
        </button>
        <button 
          className={`tab-btn ${activeTab === 'deliveries' ? 'active' : ''}`}
          onClick={() => setActiveTab('deliveries')}
        >
          Deliveries ({deliveries.length})
        </button>
      </nav>

      {/* Jobs Tab — Component: JobManager */}
      {activeTab === 'jobs' && (
        <section className="jobs-section">
          <div className="filter-bar">
            <select 
              className="state-filter"
              value={stateFilter} 
              onChange={(e) => setStateFilter(e.target.value)}
            >
              <option value="">All States</option>
              <option value="QUEUED">Queued</option>
              <option value="RUNNING">Running</option>
              <option value="COMPLETED">Completed</option>
              <option value="FAILED">Failed</option>
            </select>
            {loadingJobs && <span className="loading-badge">Refreshing...</span>}
          </div>

          <div className="component-container">
            <JobManager
              projectId={projectId || undefined}
              onJobSelect={(job) => selectJob(job as Job | null)}
            />
          </div>

          {/* Selected Job Details */}
          {selectedJob && (
            <div className="job-details">
              <h4 className="section-subtitle">Job Details: {selectedJob.preset}</h4>
              
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="label">State:</span>
                  <span className={`value state-${selectedJob.state.toLowerCase()}`}>
                    {selectedJob.state}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="label">Created:</span>
                  <span className="value">{new Date(selectedJob.createdAt).toLocaleString()}</span>
                </div>
                {selectedJob.startedAt && (
                  <div className="detail-item">
                    <span className="label">Started:</span>
                    <span className="value">{new Date(selectedJob.startedAt).toLocaleString()}</span>
                  </div>
                )}
                {selectedJob.completedAt && (
                  <div className="detail-item">
                    <span className="label">Completed:</span>
                    <span className="value">{new Date(selectedJob.completedAt).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Error Info */}
              {selectedJob.state === 'FAILED' && (
                <div className="error-info">
                  <h5>Error Details</h5>
                  <p><strong>Category:</strong> {selectedJob.errorCategory || 'Unknown'}</p>
                  <p><strong>Message:</strong> {selectedJob.errorMessage || 'No details available'}</p>
                  {canRerun && (
                    <button 
                      className="btn-rerun"
                      onClick={() => handleRerun(selectedJob.id)} 
                      disabled={submitting}
                    >
                      Rerun This Job
                    </button>
                  )}
                </div>
              )}

              {/* Processing Reports */}
              {reports.length > 0 && (
                <div className="reports-section">
                  <h5>Processing Reports</h5>
                  {reports.map((report, index) => (
                    <div key={index} className="report-card">
                      <div className="report-header">{report.type}</div>
                      <div className="report-field">
                        <strong>Summary:</strong> {report.summary}
                      </div>
                      <div className="report-field">
                        <strong>Changes Applied:</strong> {report.changesApplied}
                      </div>
                      <div className="report-field">
                        <strong>Rationale:</strong> {report.rationale}
                      </div>
                      <div className="report-field">
                        <strong>Confidence:</strong> {report.confidence}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!hasFullAudit && (
                <p className="role-notice">
                  Some audit details are only available to Advanced users.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* Deliveries Tab — Component: DeliveryManager */}
      {activeTab === 'deliveries' && (
        <section className="deliveries-section">
          <div className="component-container">
            <DeliveryManager
              projectId={projectId || undefined}
            />
          </div>
        </section>
      )}
    </div>
  );
}
