/**
 * Dashboard One - History View
 * 
 * View job history, reports, and rerun failed jobs.
 * Per STUDIOOS_FUNCTIONAL_SPECS.md Section 4.7
 * 
 * Features real-time SSE updates for job progress.
 */

import { useEffect, useState } from 'react';
import { useProjects, useJobs, useJobProgress, studioOS } from '../../api';
import type { Job, Report, JobProgressEvent } from '../../api';

interface HistoryViewProps {
  projectId?: number | null;
  role: 'BASIC' | 'STANDARD' | 'ADVANCED';
}

export function HistoryView({ projectId: _projectId, role }: HistoryViewProps) {
  const { data: projectsResponse, loading: loadingProjects } = useProjects();
  const projects = projectsResponse?.data || [];
  
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [stateFilter, setStateFilter] = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
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

  // Refetch jobs on completion/failure events
  useEffect(() => {
    if (latestEvent?.type === 'job:completed' || latestEvent?.type === 'job:failed') {
      refetchJobs();
    }
  }, [latestEvent, refetchJobs]);

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

  const selectJob = (job: Job) => {
    setSelectedJob(job);
    if (job.state === 'COMPLETED') {
      fetchJobReport(job.id);
    }
  };

  const getStateColor = (state: Job['state']) => {
    switch (state) {
      case 'QUEUED': return '#6c757d';
      case 'RUNNING': return '#007bff';
      case 'COMPLETED': return '#28a745';
      case 'FAILED': return '#dc3545';
      default: return '#6c757d';
    }
  };

  // Get real-time progress for a job
  const getJobProgress = (jobId: number): JobProgressEvent | null => {
    if (latestEvent?.jobId === jobId) {
      return latestEvent;
    }
    return null;
  };

  const loading = loadingProjects;

  if (loading) {
    return <div className="view-loading">Loading...</div>;
  }

  return (
    <div className="history-view">
      <div className="history-header">
        <h2>History</h2>
        <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? '● Live Updates' : '○ Disconnected'}
        </span>
      </div>

      {/* Controls */}
      <div className="controls">
        <select 
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

        <select 
          value={stateFilter} 
          onChange={(e) => setStateFilter(e.target.value)}
        >
          <option value="">All States</option>
          <option value="QUEUED">Queued</option>
          <option value="RUNNING">Running</option>
          <option value="COMPLETED">Completed</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>

      {error && <div className="view-error">{error}</div>}
      {success && <div className="view-success">{success}</div>}

      {/* Job List */}
      <div className="job-list">
        <h3>Jobs ({jobs.length}) {loadingJobs && '(refreshing...)'}</h3>
        {jobs.length === 0 ? (
          <p>No jobs found.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Preset</th>
                <th>State</th>
                <th>Progress</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => {
                const progress = getJobProgress(job.id);
                return (
                  <tr key={job.id} className={`${selectedJob?.id === job.id ? 'selected' : ''} ${progress ? 'active' : ''}`}>
                    <td>{job.id}</td>
                    <td>{job.preset}</td>
                    <td>
                      <span 
                        className="state-badge" 
                        style={{ backgroundColor: getStateColor(job.state) }}
                      >
                        {job.state}
                      </span>
                    </td>
                    <td>
                      {progress ? (
                        <div className="progress-cell">
                          <div className="progress-bar">
                            <div 
                              className="progress-fill" 
                              style={{ width: `${progress.progress || 0}%` }}
                            />
                          </div>
                          <span className="progress-message">{progress.message || `${progress.progress}%`}</span>
                        </div>
                      ) : job.state === 'COMPLETED' ? '100%' : '-'}
                    </td>
                    <td>{new Date(job.createdAt).toLocaleString()}</td>
                    <td>
                      <button onClick={() => selectJob(job)}>Details</button>
                      {job.state === 'FAILED' && canRerun && (
                        <button 
                          onClick={() => handleRerun(job.id)}
                          disabled={submitting}
                        >
                          Rerun
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Job Details Panel */}
      {selectedJob && (
        <div className="job-details">
          <h3>Job Details: {selectedJob.preset}</h3>
          
          <div className="detail-grid">
            <div className="detail">
              <strong>State:</strong> {selectedJob.state}
            </div>
            <div className="detail">
              <strong>Created:</strong> {new Date(selectedJob.createdAt).toLocaleString()}
            </div>
            {selectedJob.startedAt && (
              <div className="detail">
                <strong>Started:</strong> {new Date(selectedJob.startedAt).toLocaleString()}
              </div>
            )}
            {selectedJob.completedAt && (
              <div className="detail">
                <strong>Completed:</strong> {new Date(selectedJob.completedAt).toLocaleString()}
              </div>
            )}
          </div>

          {/* Error Info */}
          {selectedJob.state === 'FAILED' && (
            <div className="error-info">
              <h4>Error Details</h4>
              <p><strong>Category:</strong> {selectedJob.errorCategory || 'Unknown'}</p>
              <p><strong>Message:</strong> {selectedJob.errorMessage || 'No details available'}</p>
              {canRerun && (
                <button onClick={() => handleRerun(selectedJob.id)} disabled={submitting}>
                  Rerun This Job
                </button>
              )}
            </div>
          )}

          {/* Processing Reports (Transparency) */}
          <div className="reports">
            <h4>Processing Reports</h4>
            {reports.length === 0 ? (
              <p>No reports available.</p>
            ) : (
              reports.map((report, index) => (
                <div key={index} className="report-card">
                  <h5>{report.type}</h5>
                  <div className="report-section">
                    <strong>Summary:</strong>
                    <p>{report.summary}</p>
                  </div>
                  <div className="report-section">
                    <strong>Changes Applied:</strong>
                    <p>{report.changesApplied}</p>
                  </div>
                  <div className="report-section">
                    <strong>Rationale:</strong>
                    <p>{report.rationale}</p>
                  </div>
                  <div className="report-section">
                    <strong>Impact Assessment:</strong>
                    <p>{report.impactAssessment}</p>
                  </div>
                  <div className="report-section">
                    <strong>Confidence:</strong>
                    <p>{report.confidence}</p>
                  </div>
                  {report.limitations && (
                    <div className="report-section">
                      <strong>Limitations:</strong>
                      <p>{report.limitations}</p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {!hasFullAudit && (
            <p className="role-notice">
              Some audit details are only available to Advanced users.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
