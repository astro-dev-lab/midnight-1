import React, { useState, useEffect } from 'react';
import { FormField } from '../FormField';
import { studioOS } from '../../api/client';
import { jobEvents } from '../../api/events';
import type { Job as ApiJob, JobProgressEvent } from '../../api/types';
import './JobManager.css';

interface Job {
  id: string;
  type: string;
  priority: number;
  state: string;
  progress: {
    phase: string;
    percent: number;
    message: string;
  };
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  attempts: number;
  maxAttempts: number;
  error?: string;
}

interface QueueStats {
  processed: number;
  failed: number;
  retries: number;
  queued: number;
  running: number;
  avgProcessingTime: number;
  queueCounts: Record<number, number>;
}

interface JobManagerProps {
  projectId?: number;
  onJobSelect?: (job: Job | null) => void;
}

const PRIORITY_NAMES: Record<number, string> = {
  0: 'Critical',
  1: 'High', 
  2: 'Normal',
  3: 'Low',
  4: 'Bulk'
};

const STATE_COLORS: Record<string, string> = {
  queued: 'var(--color-border)',
  running: 'var(--color-primary)',
  completed: '#22c55e',
  failed: '#ef4444',
  cancelled: '#6b7280',
  retrying: '#f59e0b'
};

export const JobManager: React.FC<JobManagerProps> = ({
  projectId,
  onJobSelect
}) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Convert API job to component format
  const mapApiJob = (apiJob: ApiJob): Job => ({
    id: String(apiJob.id),
    type: apiJob.preset.split('-')[0] || 'process',
    priority: 2, // Default to Normal priority
    state: apiJob.state.toLowerCase(),
    progress: {
      phase: apiJob.state === 'RUNNING' ? 'processing' : apiJob.state.toLowerCase(),
      percent: apiJob.state === 'COMPLETED' ? 100 : apiJob.state === 'RUNNING' ? 50 : 0,
      message: apiJob.errorMessage || getPhaseMessage(apiJob.state)
    },
    createdAt: new Date(apiJob.createdAt).getTime(),
    startedAt: apiJob.startedAt ? new Date(apiJob.startedAt).getTime() : undefined,
    completedAt: apiJob.completedAt ? new Date(apiJob.completedAt).getTime() : undefined,
    attempts: 1,
    maxAttempts: 3,
    error: apiJob.errorMessage
  });

  const getPhaseMessage = (state: string): string => {
    switch (state) {
      case 'QUEUED': return 'Waiting in queue';
      case 'RUNNING': return 'Processing audio data';
      case 'COMPLETED': return 'Processing complete';
      case 'FAILED': return 'Processing failed';
      default: return 'Unknown state';
    }
  };

  useEffect(() => {
    if (!projectId || projectId <= 0) {
      setIsLoading(false);
      return;
    }

    const loadJobs = async () => {
      try {
        const response = await studioOS.getJobs(projectId);
        const mappedJobs = response.data.map(mapApiJob);
        setJobs(mappedJobs);
        
        // Calculate stats from real data
        setStats({
          processed: mappedJobs.filter(j => j.state === 'completed').length,
          failed: mappedJobs.filter(j => j.state === 'failed').length,
          retries: 0,
          queued: mappedJobs.filter(j => j.state === 'queued').length,
          running: mappedJobs.filter(j => j.state === 'running').length,
          avgProcessingTime: calculateAvgProcessingTime(mappedJobs),
          queueCounts: { 0: 0, 1: 0, 2: mappedJobs.filter(j => j.state === 'queued').length, 3: 0, 4: 0 }
        });
      } catch (error) {
        console.error('Failed to load jobs:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadJobs();

    // Connect to SSE for real-time updates
    jobEvents.connect(projectId);
    setIsConnected(true);

    const unsubscribe = jobEvents.on('*', (event: JobProgressEvent) => {
      setJobs(prev => prev.map(job => {
        if (job.id === String(event.jobId)) {
          return {
            ...job,
            state: event.phase || job.state,
            progress: {
              phase: event.phase || job.progress.phase,
              percent: event.progress || job.progress.percent,
              message: event.message || job.progress.message
            },
            error: event.error
          };
        }
        return job;
      }));
    });

    return () => {
      unsubscribe();
      jobEvents.disconnect();
      setIsConnected(false);
    };
  }, [projectId]);

  const calculateAvgProcessingTime = (jobs: Job[]): number => {
    const completedJobs = jobs.filter(j => j.completedAt && j.startedAt);
    if (completedJobs.length === 0) return 0;
    const total = completedJobs.reduce((sum, j) => sum + ((j.completedAt || 0) - (j.startedAt || 0)), 0);
    return total / completedJobs.length;
  };

  const cancelJob = async (jobId: string) => {
    try {
      await studioOS.cancelJob(parseInt(jobId));
      setJobs(prev => prev.map(job => 
        job.id === jobId ? { ...job, state: 'cancelled' } : job
      ));
    } catch (error) {
      console.error('The job cancellation failed due to System error. You may retry the cancellation.', error);
    }
  };

  const retryJob = async (jobId: string) => {
    try {
      const rerunPayload = { originalJobId: parseInt(jobId) };
      await studioOS.rerunJob(rerunPayload);
      setJobs(prev => prev.map(job => 
        job.id === jobId ? { 
          ...job, 
          state: 'queued', 
          attempts: 0, 
          error: undefined 
        } : job
      ));
    } catch (error) {
      console.error('The job rerun failed due to Processing error. You may check job state and retry.', error);
    }
  };

  const filteredJobs = jobs.filter(job => {
    if (filter === 'all') return true;
    return job.state === filter;
  });

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatTimestamp = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  };

  const getJobIcon = (type: string) => {
    const icons: Record<string, string> = {
      analyze: '📊',
      process: '⚙️',
      export: '📤',
      validate: '✅',
      metadata: '🏷️'
    };
    return icons[type] || '📄';
  };

  return (
    <div className="job-manager">
      <div className="manager-header">
        <div className="header-info">
          <h3 className="text-heading">Job Queue Manager</h3>
          <div className="connection-status">
            <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`} />
            {isConnected ? 'Live updates enabled' : 'Disconnected'}
          </div>
        </div>
        
        {stats && (
          <div className="queue-stats">
            <div className="stat-item">
              <span className="stat-value">{stats.queued}</span>
              <span className="stat-label">Queued</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{stats.running}</span>
              <span className="stat-label">Running</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{stats.processed}</span>
              <span className="stat-label">Processed</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{formatDuration(stats.avgProcessingTime)}</span>
              <span className="stat-label">Avg Time</span>
            </div>
          </div>
        )}
      </div>

      <div className="manager-controls">
        <div className="filter-controls">
          <FormField label="Filter by State">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All Jobs</option>
              <option value="queued">Queued</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="retrying">Retrying</option>
            </select>
          </FormField>
        </div>
        
        <div className="queue-priorities">
          <h4>Priority Queues</h4>
          <div className="priority-grid">
            {stats && Object.entries(stats.queueCounts).map(([priority, count]) => (
              <div key={priority} className="priority-item">
                <span className="priority-name">{PRIORITY_NAMES[parseInt(priority)]}</span>
                <span className="priority-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="job-list">
        {filteredJobs.map(job => (
          <div 
            key={job.id}
            className={`job-item ${job.state} ${selectedJob === job.id ? 'selected' : ''}`}
            onClick={() => {
              const newSelection = selectedJob === job.id ? null : job.id;
              setSelectedJob(newSelection);
              onJobSelect?.(newSelection ? job : null);
            }}
            style={{ '--state-color': STATE_COLORS[job.state] } as React.CSSProperties}
          >
            <div className="job-header">
              <div className="job-info">
                <span className="job-icon">{getJobIcon(job.type)}</span>
                <div className="job-details">
                  <span className="job-id">{job.id}</span>
                  <span className="job-type">{job.type.toUpperCase()}</span>
                  <span className="job-priority">{PRIORITY_NAMES[job.priority]}</span>
                </div>
              </div>
              
              <div className="job-status">
                <span className="job-state">{job.state.toUpperCase()}</span>
                <span className="job-time">{formatTimestamp(job.createdAt)}</span>
                {job.attempts > 0 && (
                  <span className="job-attempts">
                    Attempt {job.attempts}/{job.maxAttempts}
                  </span>
                )}
              </div>
            </div>

            {(job.state === 'running' || job.state === 'retrying') && (
              <div className="job-progress">
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ width: `${job.progress.percent}%` }}
                  />
                </div>
                <div className="progress-info">
                  <span className="progress-phase">{job.progress.phase}</span>
                  <span className="progress-message">{job.progress.message}</span>
                  <span className="progress-percent">{job.progress.percent}%</span>
                </div>
              </div>
            )}

            {job.error && (
              <div className="job-error">
                <span className="error-icon">⚠️</span>
                <span className="error-message">{job.error}</span>
              </div>
            )}

            {selectedJob === job.id && (
              <div className="job-actions">
                {(job.state === 'queued' || job.state === 'running') && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      cancelJob(job.id);
                    }}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                )}
                
                {job.state === 'failed' && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      retryJob(job.id);
                    }}
                    className="btn-primary"
                  >
                    Retry
                  </button>
                )}
                
                <button 
                  onClick={(e) => e.stopPropagation()}
                  className="btn-secondary"
                >
                  View Details
                </button>
              </div>
            )}
          </div>
        ))}

        {filteredJobs.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <div className="empty-text">No jobs found</div>
            <div className="empty-subtext">
              {filter === 'all' ? 'No jobs in queue' : `No ${filter} jobs`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};