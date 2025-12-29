import React, { useState, useEffect, useRef } from 'react';
import { FormField } from './FormField';
import './ProcessingReport.css';

interface ProcessingStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'warning' | 'error';
  duration?: number;
  details?: string;
  confidence?: number;
  metrics?: {
    before: any;
    after: any;
    delta: any;
  };
}

interface ProcessingReportProps {
  jobId?: string;
  steps?: ProcessingStep[];
  isLive?: boolean;
  onStepClick?: (step: ProcessingStep) => void;
}

const DEMO_STEPS: ProcessingStep[] = [
  {
    id: 'validation',
    name: 'Audio Validation',
    status: 'completed',
    duration: 127,
    details: 'File format validated, metadata extracted',
    confidence: 98,
    metrics: {
      before: { format: 'WAV', channels: 2, sampleRate: 44100 },
      after: { status: 'valid' },
      delta: null
    }
  },
  {
    id: 'analysis',
    name: 'Loudness Analysis',
    status: 'completed',
    duration: 341,
    details: 'EBU R128 analysis with gating',
    confidence: 96,
    metrics: {
      before: { loudness: -12.3, truePeak: 0.2, lra: 4.1 },
      after: { loudness: -12.3, truePeak: 0.2, lra: 4.1 },
      delta: { analyzed: true }
    }
  },
  {
    id: 'spectral',
    name: 'Spectral Analysis',
    status: 'completed',
    duration: 892,
    details: 'Frequency content analysis and problem detection',
    confidence: 94,
    metrics: {
      before: { spectrum: 'unknown' },
      after: { nyquist: 22050, dc_offset: -0.001 },
      delta: { problems: ['Low-end buildup below 40Hz'] }
    }
  },
  {
    id: 'normalize',
    name: 'Loudness Normalization',
    status: 'running',
    details: 'Normalizing to -14 LUFS target',
    confidence: null,
    metrics: null
  },
  {
    id: 'limiting',
    name: 'True Peak Limiting',
    status: 'pending',
    details: 'True peak limiting to -1 dBTP',
    confidence: null,
    metrics: null
  },
  {
    id: 'export',
    name: 'Export Processing',
    status: 'pending',
    details: 'Rendering final output',
    confidence: null,
    metrics: null
  }
];

export const ProcessingReport: React.FC<ProcessingReportProps> = ({
  jobId,
  steps = DEMO_STEPS,
  isLive = false,
  onStepClick
}) => {
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [liveSteps, setLiveSteps] = useState(steps);
  const intervalRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (isLive) {
      // Simulate live updates
      intervalRef.current = setInterval(() => {
        setLiveSteps(prev => {
          const runningIndex = prev.findIndex(s => s.status === 'running');
          if (runningIndex === -1) return prev;

          const updated = [...prev];
          const runningStep = updated[runningIndex];
          
          // Complete running step
          updated[runningIndex] = {
            ...runningStep,
            status: 'completed',
            duration: Math.floor(Math.random() * 800) + 200,
            confidence: Math.floor(Math.random() * 10) + 90,
            metrics: {
              before: { value: 'original' },
              after: { value: 'processed' },
              delta: { change: 'applied' }
            }
          };

          // Start next step
          if (runningIndex + 1 < updated.length) {
            updated[runningIndex + 1] = {
              ...updated[runningIndex + 1],
              status: 'running'
            };
          }

          return updated;
        });
      }, 2000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isLive]);

  const handleStepClick = (step: ProcessingStep) => {
    if (step.status === 'pending' || step.status === 'running') return;
    
    setExpandedStep(prev => prev === step.id ? null : step.id);
    
    if (onStepClick) {
      onStepClick(step);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'running': return '⚙️';
      case 'completed': return '✅';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      default: return '📄';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'var(--color-border)';
      case 'running': return 'var(--color-primary)';
      case 'completed': return '#22c55e';
      case 'warning': return '#f59e0b';
      case 'error': return '#ef4444';
      default: return 'var(--color-border)';
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatConfidence = (confidence: number) => {
    if (confidence >= 95) return 'High';
    if (confidence >= 85) return 'Medium';
    return 'Low';
  };

  const completedSteps = liveSteps.filter(s => s.status === 'completed').length;
  const totalSteps = liveSteps.length;
  const progressPercent = (completedSteps / totalSteps) * 100;

  return (
    <div className="processing-report">
      <div className="report-header">
        <h3 className="text-heading">Processing Report</h3>
        <div className="progress-summary">
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="progress-text">
            {completedSteps} of {totalSteps} steps completed
          </span>
        </div>
      </div>

      <div className="processing-timeline">
        {liveSteps.map((step, index) => (
          <div 
            key={step.id}
            className={`timeline-step ${step.status} ${expandedStep === step.id ? 'expanded' : ''}`}
            onClick={() => handleStepClick(step)}
            style={{ '--step-color': getStatusColor(step.status) } as React.CSSProperties}
          >
            <div className="step-connector">
              {index > 0 && <div className="connector-line" />}
              <div className="step-icon">
                {step.status === 'running' ? (
                  <div className="spinner">⚙️</div>
                ) : (
                  getStatusIcon(step.status)
                )}
              </div>
              {index < liveSteps.length - 1 && <div className="connector-line" />}
            </div>

            <div className="step-content">
              <div className="step-header">
                <div className="step-name">{step.name}</div>
                <div className="step-meta">
                  {step.duration && (
                    <span className="duration">{formatDuration(step.duration)}</span>
                  )}
                  {step.confidence && (
                    <span className={`confidence ${formatConfidence(step.confidence).toLowerCase()}`}>
                      {formatConfidence(step.confidence)} confidence
                    </span>
                  )}
                </div>
              </div>

              {step.details && (
                <div className="step-details">{step.details}</div>
              )}

              {expandedStep === step.id && step.metrics && (
                <div className="step-metrics">
                  <div className="metrics-grid">
                    {step.metrics.before && (
                      <div className="metric-section">
                        <h5>Before</h5>
                        <pre>{JSON.stringify(step.metrics.before, null, 2)}</pre>
                      </div>
                    )}
                    {step.metrics.after && (
                      <div className="metric-section">
                        <h5>After</h5>
                        <pre>{JSON.stringify(step.metrics.after, null, 2)}</pre>
                      </div>
                    )}
                    {step.metrics.delta && (
                      <div className="metric-section full-width">
                        <h5>Changes</h5>
                        <pre>{JSON.stringify(step.metrics.delta, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {jobId && (
        <div className="report-footer">
          <div className="job-id">
            Job ID: <code>{jobId}</code>
          </div>
          <div className="report-actions">
            <button className="btn-secondary">Download Report</button>
            <button className="btn-secondary">View Logs</button>
          </div>
        </div>
      )}
    </div>
  );
};