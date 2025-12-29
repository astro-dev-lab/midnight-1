import React, { useState, useEffect } from 'react';
import { FormField } from '../FormField';
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
  wsUrl?: string;
}

const PRIORITY_NAMES = {
  0: 'Critical',
  1: 'High', 
  2: 'Normal',
  3: 'Low',
  4: 'Bulk'
};

const STATE_COLORS = {
  queued: 'var(--color-border)',
  running: 'var(--color-primary)',
  completed: '#22c55e',
  failed: '#ef4444',
  cancelled: '#6b7280',
  retrying: '#f59e0b'
};

export const JobManager: React.FC<JobManagerProps> = ({
  wsUrl = '/api/jobs/ws'
}) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // In a real implementation, this would connect to WebSocket
    // For demo, we'll simulate job updates
    const mockJobs = generateMockJobs();
    setJobs(mockJobs);
    
    const mockStats = {
      processed: 1247,
      failed: 23,
      retries: 56,
      queued: mockJobs.filter(j => j.state === 'queued').length,
      running: mockJobs.filter(j => j.state === 'running').length,
      avgProcessingTime: 12500,
      queueCounts: {
        0: 0, // Critical
        1: 2, // High
        2: 8, // Normal
        3: 4, // Low
        4: 1  // Bulk
      }
    };
    setStats(mockStats);
    setIsConnected(true);

    // Simulate live updates
    const interval = setInterval(() => {
      setJobs(prev => prev.map(job => {
        if (job.state === 'running' && Math.random() > 0.8) {
          return {
            ...job,
            progress: {
              ...job.progress,
              percent: Math.min(100, job.progress.percent + Math.random() * 20),
              message: getRandomProgressMessage(job.type)
            }
          };
        }
        return job;
      }));
    }, 2000);

    return () => clearInterval(interval);
  }, [wsUrl]);

  const generateMockJobs = (): Job[] => {
    const jobTypes = ['analyze', 'process', 'export', 'validate', 'metadata'];
    const states = ['queued', 'running', 'completed', 'failed', 'retrying'];
    
    return Array.from({ length: 15 }, (_, i) => ({
      id: `job_${Date.now()}_${i}`,
      type: jobTypes[Math.floor(Math.random() * jobTypes.length)],
      priority: Math.floor(Math.random() * 5),
      state: states[Math.floor(Math.random() * states.length)],
      progress: {
        phase: 'processing',
        percent: Math.floor(Math.random() * 100),
        message: 'Processing audio data'
      },
      createdAt: Date.now() - Math.random() * 3600000,
      startedAt: Date.now() - Math.random() * 1800000,
      attempts: Math.floor(Math.random() * 3),
      maxAttempts: 3,
      error: Math.random() > 0.8 ? 'Network timeout during analysis' : undefined
    }));
  };

  const getRandomProgressMessage = (type: string): string => {
    const messages = {
      analyze: ['Analyzing frequency spectrum', 'Calculating loudness', 'Detecting audio problems'],
      process: ['Applying normalization', 'Peak limiting', 'Rendering output'],
      export: ['Converting format', 'Compressing audio', 'Uploading to destination'],
      validate: ['Checking compliance', 'Validating metadata', 'Running quality tests'],
      metadata: ['Extracting metadata', 'Validating ISRC codes', 'Updating database']
    };
    
    const typeMessages = messages[type] || ['Processing'];
    return typeMessages[Math.floor(Math.random() * typeMessages.length)];
  };

  const cancelJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/cancel`, {
        method: 'POST'
      });
      
      if (response.ok) {
        setJobs(prev => prev.map(job => 
          job.id === jobId ? { ...job, state: 'cancelled' } : job
        ));
      }
    } catch (error) {
      console.error('Failed to cancel job:', error);
    }
  };

  const retryJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/retry`, {
        method: 'POST'
      });
      
      if (response.ok) {
        setJobs(prev => prev.map(job => 
          job.id === jobId ? { 
            ...job, 
            state: 'queued', 
            attempts: 0, 
            error: undefined 
          } : job
        ));
      }
    } catch (error) {
      console.error('Failed to retry job:', error);
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
    const icons = {
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
            onClick={() => setSelectedJob(selectedJob === job.id ? null : job.id)}
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