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
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="view">
      {/* Header */}
      <header className="view__header view__header--row">
        <div>
          <h2 className="view__title">History</h2>
          <p className="view__subtitle">Track jobs and deliveries with real-time status updates</p>
        </div>
        <span className={`badge ${isConnected ? 'badge--success' : 'badge--neutral'}`}>
          {isConnected ? '● Live Updates' : '○ Disconnected'}
        </span>
      </header>

      {/* Project Selection */}
      <section className="section">
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          <select 
            className="form-select"
            style={{ minWidth: '240px' }}
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
        </div>
      </section>

      {error && <div className="error-message">{error}</div>}
      {success && <div style={{ padding: 'var(--space-4)', background: 'rgba(34, 197, 94, 0.1)', borderRadius: 'var(--border-radius)', color: 'var(--color-success)', marginBottom: 'var(--space-4)' }}>{success}</div>}

      {/* Tab Navigation */}
      <section className="tabs">
        <div className="tabs__list">
          <button 
            className={`tabs__tab ${activeTab === 'jobs' ? 'tabs__tab--active' : ''}`}
            onClick={() => setActiveTab('jobs')}
          >
            Jobs ({jobs.length})
          </button>
          <button 
            className={`tabs__tab ${activeTab === 'deliveries' ? 'tabs__tab--active' : ''}`}
            onClick={() => setActiveTab('deliveries')}
          >
            Deliveries ({deliveries.length})
          </button>
        </div>

        {/* Jobs Tab */}
        {activeTab === 'jobs' && (
          <div className="tabs__panel tabs__panel--active">
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <select 
                className="form-select"
                style={{ minWidth: '150px' }}
                value={stateFilter} 
                onChange={(e) => setStateFilter(e.target.value)}
              >
                <option value="">All States</option>
                <option value="QUEUED">Queued</option>
                <option value="RUNNING">Running</option>
                <option value="COMPLETED">Completed</option>
                <option value="FAILED">Failed</option>
              </select>
              {loadingJobs && <span className="badge badge--neutral">Refreshing...</span>}
            </div>

            <JobManager
              projectId={projectId || undefined}
              onJobSelect={(job) => selectJob(job as Job | null)}
            />

            {/* Selected Job Details */}
            {selectedJob && (
              <div className="card" style={{ marginTop: 'var(--space-4)' }}>
                <div className="card__header">
                  <h4 className="card__title">Job Details: {selectedJob.preset}</h4>
                </div>
                <div className="card__body">
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 'var(--space-2) var(--space-4)', fontSize: 'var(--font-size-sm)' }}>
                    <span style={{ color: 'var(--color-gray-400)' }}>State:</span>
                    <span className={`badge badge--state-${selectedJob.state.toLowerCase()}`}>
                      {selectedJob.state}
                    </span>
                    <span style={{ color: 'var(--color-gray-400)' }}>Created:</span>
                    <span style={{ color: 'var(--color-white)' }}>{new Date(selectedJob.createdAt).toLocaleString()}</span>
                    {selectedJob.startedAt && (
                      <>
                        <span style={{ color: 'var(--color-gray-400)' }}>Started:</span>
                        <span style={{ color: 'var(--color-white)' }}>{new Date(selectedJob.startedAt).toLocaleString()}</span>
                      </>
                    )}
                    {selectedJob.completedAt && (
                      <>
                        <span style={{ color: 'var(--color-gray-400)' }}>Completed:</span>
                        <span style={{ color: 'var(--color-white)' }}>{new Date(selectedJob.completedAt).toLocaleString()}</span>
                      </>
                    )}
                  </div>

                  {/* Error Info */}
                  {selectedJob.state === 'FAILED' && (
                    <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-4)', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 'var(--border-radius)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                      <h5 style={{ margin: '0 0 var(--space-3)', color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)' }}>Error Details</h5>
                      <p style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--font-size-sm)', color: 'var(--color-gray-300)' }}>
                        <strong>Category:</strong> {selectedJob.errorCategory || 'Unknown'}
                      </p>
                      <p style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--font-size-sm)', color: 'var(--color-gray-300)' }}>
                        <strong>Message:</strong> {selectedJob.errorMessage || 'No details available'}
                      </p>
                      {canRerun && (
                        <button 
                          className="btn btn--primary btn--sm"
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
                    <div style={{ marginTop: 'var(--space-4)' }}>
                      <h5 style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--font-size-sm)', color: 'var(--color-gray-200)' }}>Processing Reports</h5>
                      {reports.map((report, index) => (
                        <div key={index} style={{ padding: 'var(--space-3)', background: 'var(--color-gray-800)', borderRadius: 'var(--border-radius)', fontSize: 'var(--font-size-sm)' }}>
                          <div style={{ fontWeight: 500, color: 'var(--color-white)', marginBottom: 'var(--space-2)' }}>{report.type}</div>
                          <div style={{ color: 'var(--color-gray-300)', marginBottom: 'var(--space-1)' }}>
                            <strong>Summary:</strong> {report.summary}
                          </div>
                          <div style={{ color: 'var(--color-gray-300)', marginBottom: 'var(--space-1)' }}>
                            <strong>Changes:</strong> {report.changesApplied}
                          </div>
                          <div style={{ color: 'var(--color-gray-300)', marginBottom: 'var(--space-1)' }}>
                            <strong>Rationale:</strong> {report.rationale}
                          </div>
                          <div style={{ color: 'var(--color-gray-300)' }}>
                            <strong>Confidence:</strong> {report.confidence}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {!hasFullAudit && (
                    <p style={{ marginTop: 'var(--space-4)', fontSize: 'var(--font-size-sm)', color: 'var(--color-gray-400)' }}>
                      Some audit details are only available to Advanced users.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Deliveries Tab */}
        {activeTab === 'deliveries' && (
          <div className="tabs__panel tabs__panel--active">
            <DeliveryManager
              projectId={projectId || undefined}
            />
          </div>
        )}
      </section>
    </div>
  );
}
