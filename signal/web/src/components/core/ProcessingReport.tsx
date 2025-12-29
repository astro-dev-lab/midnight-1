import React, { useState, useEffect } from 'react';
import { studioOS } from '../../api/client';
import { jobEvents } from '../../api/events';
import type { FormattedReport, JobProgressEvent } from '../../api/types';
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
  jobId?: number;
  steps?: ProcessingStep[];
  isLive?: boolean;
  onStepClick?: (step: ProcessingStep) => void;
}

export const ProcessingReport: React.FC<ProcessingReportProps> = ({
  jobId,
  steps = [],
  isLive = false,
  onStepClick
}) => {
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [liveSteps, setLiveSteps] = useState<ProcessingStep[]>(steps);
  const [report, setReport] = useState<FormattedReport | null>(null);
  const [isLoading, setIsLoading] = useState(!!jobId);

  // Load report data from API
  useEffect(() => {
    if (!jobId || jobId <= 0) {
      setIsLoading(false);
      return;
    }

    const loadReport = async () => {
      try {
        const formattedReport = await studioOS.getFormattedReport(jobId);
        setReport(formattedReport);
        
        // Convert report sections to processing steps
        const stepsFromReport: ProcessingStep[] = formattedReport.sections.map((section, index) => ({
          id: `step_${index}`,
          name: section.title,
          status: 'completed' as const,
          details: typeof section.content === 'string' ? section.content : JSON.stringify(section.content),
          confidence: formattedReport.confidence,
          metrics: typeof section.content === 'object' ? {
            before: null,
            after: section.content,
            delta: null
          } : undefined
        }));
        
        setLiveSteps(stepsFromReport);
      } catch (error) {
        console.error('The processing report failed to load due to System error.', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadReport();

    // Subscribe to SSE for live updates
    if (isLive) {
      jobEvents.connect(0); // Would need project ID for proper connection
      
      const unsubscribe = jobEvents.on('*', (event: JobProgressEvent) => {
        if (event.jobId === jobId) {
          // Update steps based on SSE events
          setLiveSteps(prev => {
            const updated = [...prev];
            const currentStep = updated.find(s => s.status === 'running');
            if (currentStep && event.phase) {
              currentStep.status = event.type === 'job:completed' ? 'completed' : 
                                   event.type === 'job:failed' ? 'error' : 'running';
              currentStep.details = event.message;
            }
            return updated;
          });
        }
      });

      return () => {
        unsubscribe();
      };
    }
  }, [jobId, isLive]);

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
  const progressPercent = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  if (isLoading) {
    return (
      <div className="processing-report loading">
        <div className="loading-spinner">Loading report...</div>
      </div>
    );
  }

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
            {report && (
              <span className="report-confidence">
                 • Confidence: {(report.confidence * 100).toFixed(0)}%
              </span>
            )}
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