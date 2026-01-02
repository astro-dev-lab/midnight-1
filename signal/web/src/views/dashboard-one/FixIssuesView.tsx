/**
 * Dashboard One - Fix Issues View
 * 
 * ============================================================================
 * PERSONA: Producer/Engineer
 * ============================================================================
 * 
 * PRIMARY QUESTION: "How do I resolve blockers to make this export-ready?"
 * 
 * SUCCESS CONDITION: User applies fix, creates new version, achieves export-ready state
 * 
 * COMPONENT USAGE:
 * - StatusBadge: Severity indicators (Blocker/Warning/Info)
 * - VersionHistory: Prior versions with state
 * - BatchUploader: File upload (if available)
 * - AudioComparison: A/B preview (if available)
 * 
 * RBAC ENFORCEMENT:
 * - Basic: View only, cannot apply fixes
 * - Standard: Can apply preset fixes
 * - Advanced: Full fix access
 * 
 * ============================================================================
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { studioOS, useProjects, useAssets } from '../../api';
import { StatusBadge } from '../../components/ui';
import type { Asset, Preset } from '../../api';
import './FixIssuesView.css';

// ============================================================================
// Types
// ============================================================================

interface AnalysisIssue {
  id: string;
  code: string;
  title: string;
  description: string;
  severity: 'blocker' | 'warning' | 'info';
  category: string;
  currentValue?: string | number;
  targetValue?: string | number;
  unit?: string;
  fixAvailable: boolean;
  fixPreset?: string;
}

interface VersionEntry {
  id: string;
  version: string;
  state: 'approved' | 'failed' | 'initial' | 'pending';
  createdAt: Date;
  createdBy: string;
  isCurrent: boolean;
}

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  blockers: number;
  warnings: number;
}

interface FixIssuesViewProps {
  projectId?: number | null;
  assetId?: number | null;
  role: 'BASIC' | 'STANDARD' | 'ADVANCED';
  onNavigate: (view: string, id?: number) => void;
}

// ============================================================================
// Icons
// ============================================================================

const Icons = {
  AlertCircle: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10 6V10M10 14H10.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  CheckCircle: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M7 10L9 12L13 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  ChevronDown: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Upload: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 16V4M12 4L8 8M12 4L16 8M4 16V18C4 19.1046 4.89543 20 6 20H18C19.1046 20 20 19.1046 20 18V16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  File: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 1H4C3.44772 1 3 1.44772 3 2V14C3 14.5523 3.44772 15 4 15H12C12.5523 15 13 14.5523 13 14V5M9 1L13 5M9 1V5H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Play: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 3L13 8L4 13V3Z" fill="currentColor"/>
    </svg>
  ),
  Shield: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 1L2 3V7C2 10.5 4.5 13.5 8 15C11.5 13.5 14 10.5 14 7V3L8 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6 8L7.5 9.5L10 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Plus: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  Warning: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 7V10M10 13H10.01M3.07 16H16.93C17.97 16 18.63 14.89 18.12 14L11.19 2C10.68 1.11 9.32 1.11 8.81 2L1.88 14C1.37 14.89 2.03 16 3.07 16Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};

// ============================================================================
// Utility Functions
// ============================================================================

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Convert dBTP value to meter percentage (0-100)
function dbToMeterPercent(db: number, minDb: number = -12, maxDb: number = 3): number {
  const range = maxDb - minDb;
  const normalized = (db - minDb) / range;
  return Math.max(0, Math.min(100, normalized * 100));
}

// ============================================================================
// Component
// ============================================================================

export function FixIssuesView({ projectId, assetId, role, onNavigate }: FixIssuesViewProps) {
  // API Data
  const { data: projectsResponse, loading: loadingProjects } = useProjects();
  const projects = useMemo(() => projectsResponse?.data || [], [projectsResponse]);
  
  // State
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(projectId || null);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(assetId || null);
  const [issues, setIssues] = useState<AnalysisIssue[]>([]);
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetsLoaded, setPresetsLoaded] = useState(false);
  const [applyingFix, setApplyingFix] = useState(false);
  const [creatingVersion, setCreatingVersion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [complianceProfile, setComplianceProfile] = useState('spotify');
  const [dragActive, setDragActive] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Fetch assets for selected project
  const { data: assetsResponse, loading: loadingAssets } = useAssets(selectedProjectId);
  const assets: Asset[] = useMemo(() => assetsResponse?.data || [], [assetsResponse]);

  // Select first project by default
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  // Select first asset when project changes
  useEffect(() => {
    if (assets.length > 0 && !selectedAssetId) {
      setSelectedAssetId(assets[0].id);
    }
  }, [assets, selectedAssetId]);

  // Fetch presets
  useEffect(() => {
    async function loadPresets() {
      try {
        const data = await studioOS.getPresets();
        setPresets(data);
        setPresetsLoaded(true);
      } catch (err) {
        console.warn('Failed to load presets:', err);
        setPresetsLoaded(true);
      }
    }
    loadPresets();
  }, []);

  // Generate mock issues based on asset (in production, fetch from API)
  useEffect(() => {
    if (selectedAssetId) {
      // Simulate analysis issues - in production, fetch from /api/audio/analyze
      const mockIssues: AnalysisIssue[] = [
        {
          id: '1',
          code: 'TRUE_PEAK_VIOLATION',
          title: 'True Peak Exceeds Target',
          description: 'True peak at +0.3 dBTP exceeds the -1.0 dBTP target for streaming platforms.',
          severity: 'blocker',
          category: 'Loudness',
          currentValue: 0.3,
          targetValue: -1.0,
          unit: 'dBTP',
          fixAvailable: true,
          fixPreset: 'normalize-loudness'
        },
        {
          id: '2',
          code: 'LOUDNESS_RANGE',
          title: 'Loudness Below Target',
          description: 'Integrated loudness at -16.2 LUFS is below the -14 LUFS streaming target.',
          severity: 'warning',
          category: 'Loudness',
          currentValue: -16.2,
          targetValue: -14,
          unit: 'LUFS',
          fixAvailable: true,
          fixPreset: 'normalize-loudness'
        },
        {
          id: '3',
          code: 'SAMPLE_RATE',
          title: 'Non-Standard Sample Rate',
          description: 'File uses 88.2kHz sample rate. Consider 44.1kHz or 48kHz for broader compatibility.',
          severity: 'info',
          category: 'Format',
          currentValue: '88.2kHz',
          targetValue: '44.1/48kHz',
          fixAvailable: false
        }
      ];
      setIssues(mockIssues);
      
      // Generate mock versions
      const mockVersions: VersionEntry[] = [
        { id: 'v1', version: 'v1.2', state: 'pending', createdAt: new Date(), createdBy: 'You', isCurrent: true },
        { id: 'v2', version: 'v1.1', state: 'failed', createdAt: new Date(Date.now() - 86400000), createdBy: 'You', isCurrent: false },
        { id: 'v3', version: 'v1.0', state: 'initial', createdAt: new Date(Date.now() - 172800000), createdBy: 'You', isCurrent: false },
      ];
      setVersions(mockVersions);
    }
  }, [selectedAssetId]);

  // Calculate derived state
  const blockerCount = issues.filter(i => i.severity === 'blocker').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const isExportReady = blockerCount === 0;
  
  // Find true peak issue
  const truePeakIssue = issues.find(i => i.code === 'TRUE_PEAK_VIOLATION');
  const currentTruePeak = truePeakIssue?.currentValue as number ?? 0;
  const targetTruePeak = truePeakIssue?.targetValue as number ?? -1;
  
  // Check if fix preset is available
  const normalizePreset = presets.find(p => p.name === 'normalize-loudness' || p.id === 'normalize-loudness');
  const fixAvailable = normalizePreset !== undefined;

  // Next version number
  const currentVersion = versions.find(v => v.isCurrent);
  const nextVersionNumber = currentVersion 
    ? `v${(parseFloat(currentVersion.version.replace('v', '')) + 0.1).toFixed(1)}`
    : 'v1.0';

  // Handlers
  const handleApplyFix = useCallback(async () => {
    if (!selectedProjectId || !selectedAssetId) {
      setError('No asset selected');
      return;
    }

    if (!fixAvailable) {
      console.warn('FIX_NOT_AVAILABLE: normalize-loudness preset not found');
      setError('Fix not available. Required preset is missing.');
      return;
    }

    if (role === 'BASIC') {
      setError('Insufficient permissions to apply fixes');
      return;
    }

    setApplyingFix(true);
    setError(null);
    setSuccess(null);

    try {
      await studioOS.submitJob({
        projectId: selectedProjectId,
        preset: 'normalize-loudness',
        assetIds: [selectedAssetId],
        parameters: {
          targetLufs: -14,
          truePeak: -1
        }
      });
      
      setSuccess('Fix applied successfully. Processing job submitted.');
      
      // Update the issue to show it's being processed
      setIssues(prev => prev.map(issue => 
        issue.code === 'TRUE_PEAK_VIOLATION' 
          ? { ...issue, severity: 'info' as const, title: 'True Peak Fix Applied (Processing)' }
          : issue
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply fix');
    } finally {
      setApplyingFix(false);
    }
  }, [selectedProjectId, selectedAssetId, fixAvailable, role]);

  const handleCreateVersion = useCallback(async () => {
    if (!selectedProjectId || !selectedAssetId) {
      setError('No asset selected');
      return;
    }

    setCreatingVersion(true);
    setError(null);
    setSuccess(null);

    try {
      // In production, this would call an asset versioning endpoint
      // For now, we show the confirmation and log the intent
      console.log('Creating new version:', {
        projectId: selectedProjectId,
        assetId: selectedAssetId,
        version: nextVersionNumber
      });

      // Simulate version creation
      const newVersion: VersionEntry = {
        id: `v-${Date.now()}`,
        version: nextVersionNumber,
        state: 'pending',
        createdAt: new Date(),
        createdBy: 'You',
        isCurrent: true
      };

      setVersions(prev => [
        newVersion,
        ...prev.map(v => ({ ...v, isCurrent: false }))
      ]);

      setSuccess(`Version ${nextVersionNumber} created successfully.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create version');
    } finally {
      setCreatingVersion(false);
    }
  }, [selectedProjectId, selectedAssetId, nextVersionNumber]);

  const handleFileUpload = useCallback((files: FileList | File[]) => {
    const newFiles: UploadedFile[] = Array.from(files).map((file, index) => ({
      id: `file-${Date.now()}-${index}`,
      name: file.name,
      size: file.size,
      blockers: Math.random() > 0.7 ? 1 : 0,
      warnings: Math.random() > 0.5 ? 1 : 0
    }));
    setUploadedFiles(prev => [...prev, ...newFiles]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    handleFileUpload(e.dataTransfer.files);
  }, [handleFileUpload]);

  const handleAnalyzeFiles = useCallback(() => {
    // Navigate to transform view for analysis
    onNavigate('transform', selectedProjectId ?? undefined);
  }, [onNavigate, selectedProjectId]);

  // Loading state
  if (loadingProjects) {
    return (
      <div className="fix-issues-view">
        <div className="view-loading">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Empty state
  if (projects.length === 0) {
    return (
      <div className="fix-issues-view">
        <div className="view-empty">
          <p>No projects available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fix-issues-view">
      {/* Status Banner */}
      <div className={`status-banner status-${isExportReady ? 'pass' : 'fail'}`}>
        <div className="status-banner-left">
          <div className="status-banner-icon">
            {isExportReady ? <Icons.CheckCircle /> : <Icons.AlertCircle />}
          </div>
          <div className="status-banner-text">
            <h2>{isExportReady ? 'Pass: Export Ready' : `Fail: ${blockerCount} Blocker${blockerCount !== 1 ? 's' : ''} Detected`}</h2>
            <p>
              {warningCount > 0 && `${warningCount} warning${warningCount !== 1 ? 's' : ''}`}
              {warningCount > 0 && issues.filter(i => i.severity === 'info').length > 0 && ' • '}
              {issues.filter(i => i.severity === 'info').length > 0 && `${issues.filter(i => i.severity === 'info').length} informational`}
            </p>
          </div>
        </div>
        <div className="status-banner-right">
          <div className="export-status">
            <span className="export-status-label">Export Ready:</span>
            <span className={`export-status-value ${isExportReady ? 'ready' : 'not-ready'}`}>
              {isExportReady ? 'Yes' : 'No'}
            </span>
          </div>
          <StatusBadge 
            status={isExportReady ? 'pass' : 'fail'} 
            label={isExportReady ? 'Compliant' : 'Non-Compliant'} 
          />
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="error-message">
          <Icons.AlertCircle />
          {error}
        </div>
      )}
      {success && (
        <div className="success-message">
          <Icons.CheckCircle />
          {success}
        </div>
      )}

      {/* Three Column Layout */}
      <div className="fix-issues-content">
        {/* Left Panel: Issues & Version History */}
        <div className="panel left-panel">
          {/* Project/Asset Selector */}
          <div className="panel-card">
            <div className="panel-card-header">
              <h3 className="panel-card-title">Context</h3>
            </div>
            <div className="panel-card-content">
              <select 
                value={selectedProjectId ?? ''} 
                onChange={(e) => {
                  setSelectedProjectId(parseInt(e.target.value));
                  setSelectedAssetId(null);
                }}
                style={{ width: '100%', marginBottom: '8px' }}
                className="compliance-selector"
              >
                <option value="">Select Project</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {loadingAssets ? (
                <p style={{ color: 'var(--color-gray-500)', fontSize: 'var(--font-size-sm)' }}>Loading assets...</p>
              ) : (
                <select 
                  value={selectedAssetId ?? ''} 
                  onChange={(e) => setSelectedAssetId(parseInt(e.target.value))}
                  style={{ width: '100%' }}
                  className="compliance-selector"
                >
                  <option value="">Select Asset</option>
                  {assets.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Analysis Issues */}
          <div className="panel-card">
            <div className="panel-card-header">
              <h3 className="panel-card-title">Analysis Issues</h3>
              <span className="panel-card-badge" style={{ 
                backgroundColor: blockerCount > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                color: blockerCount > 0 ? 'var(--color-danger)' : 'var(--color-success)'
              }}>
                {issues.length}
              </span>
            </div>
            <div className="panel-card-content">
              {issues.length === 0 ? (
                <div className="not-available">
                  <Icons.CheckCircle />
                  <p>No issues detected</p>
                </div>
              ) : (
                <ul className="issues-list">
                  {issues.map(issue => (
                    <li 
                      key={issue.id} 
                      className={`issue-item ${expandedIssue === issue.id ? 'expanded' : ''}`}
                      onClick={() => setExpandedIssue(expandedIssue === issue.id ? null : issue.id)}
                    >
                      <span className={`issue-severity ${issue.severity}`} />
                      <div className="issue-content">
                        <div className="issue-header">
                          <span className="issue-title">{issue.title}</span>
                          <span className={`issue-chip ${issue.severity}`}>
                            {issue.severity}
                          </span>
                        </div>
                        <p className="issue-description">{issue.description}</p>
                        
                        {expandedIssue === issue.id && (
                          <div className="issue-expanded-content">
                            {issue.currentValue !== undefined && (
                              <div className="issue-detail-row">
                                <span className="issue-detail-label">Current</span>
                                <span className="issue-detail-value">
                                  {issue.currentValue} {issue.unit}
                                </span>
                              </div>
                            )}
                            {issue.targetValue !== undefined && (
                              <div className="issue-detail-row">
                                <span className="issue-detail-label">Target</span>
                                <span className="issue-detail-value">
                                  {issue.targetValue} {issue.unit}
                                </span>
                              </div>
                            )}
                            <div className="issue-detail-row">
                              <span className="issue-detail-label">Fix Available</span>
                              <span className="issue-detail-value">
                                {issue.fixAvailable ? 'Yes' : 'No'}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                      <span className={`issue-chevron ${expandedIssue === issue.id ? 'expanded' : ''}`}>
                        <Icons.ChevronDown />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Version History */}
          <div className="panel-card">
            <div className="panel-card-header">
              <h3 className="panel-card-title">Version History</h3>
            </div>
            <div className="panel-card-content">
              {versions.length === 0 ? (
                <div className="not-available">
                  <p>No versions available</p>
                </div>
              ) : (
                <ul className="version-list">
                  {versions.map((version, index) => (
                    <li key={version.id} className="version-item">
                      <div className="version-marker">
                        <span className={`version-dot ${version.isCurrent ? 'current' : ''}`} />
                        {index < versions.length - 1 && <span className="version-line" />}
                      </div>
                      <div className="version-content">
                        <div className="version-header">
                          <span className="version-number">{version.version}</span>
                          <span className={`version-state-badge ${version.state}`}>
                            {version.state === 'approved' ? 'Approved' : 
                             version.state === 'failed' ? 'Review Failed' : 
                             version.state === 'initial' ? 'Initial Upload' : 'Pending'}
                          </span>
                        </div>
                        <div className="version-meta">
                          <span>{version.createdBy}</span>
                          <span>•</span>
                          <span>{formatDate(version.createdAt)}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Center Panel: Fix Controls */}
        <div className="panel fix-panel">
          {/* Fix True Peak Card */}
          <div className="fix-card">
            <div className="fix-card-header">
              <div className="fix-card-title">
                <Icons.Warning />
                <h3>Fix True Peak</h3>
              </div>
              <StatusBadge 
                status={truePeakIssue ? 'fail' : 'pass'} 
                label={truePeakIssue ? 'Action Required' : 'Pass'}
                size="sm"
              />
            </div>
            <div className="fix-card-content">
              {/* Severity Meter */}
              <div className="severity-meter">
                <div className="meter-labels">
                  <span className={`meter-label meter-current ${currentTruePeak > targetTruePeak ? 'over' : 'pass'}`}>
                    Current: {currentTruePeak > 0 ? '+' : ''}{currentTruePeak.toFixed(1)} dBTP
                  </span>
                  <span className="meter-label meter-target">
                    Target: {targetTruePeak} dBTP max
                  </span>
                </div>
                <div className="meter-bar">
                  <div 
                    className="meter-marker" 
                    style={{ left: `${dbToMeterPercent(currentTruePeak)}%` }}
                  />
                  <div 
                    className="meter-target-line" 
                    style={{ left: `${dbToMeterPercent(targetTruePeak)}%` }}
                  />
                </div>
              </div>

              {/* Waveform Preview */}
              <div className="waveform-preview">
                <div className="waveform-bars">
                  {Array.from({ length: 60 }).map((_, i) => (
                    <div 
                      key={i} 
                      className="waveform-bar" 
                      style={{ 
                        height: `${20 + Math.sin(i * 0.3) * 30 + Math.random() * 20}px` 
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Controls */}
              <div className="fix-controls">
                <button className="btn-preview" disabled>
                  <Icons.Play />
                  Preview A/B
                </button>
                <button 
                  className="btn-apply" 
                  onClick={handleApplyFix}
                  disabled={applyingFix || !fixAvailable || role === 'BASIC' || !truePeakIssue}
                >
                  {applyingFix ? 'Applying...' : 'Apply Fix'}
                </button>
              </div>

              {!fixAvailable && presetsLoaded && (
                <p style={{ 
                  marginTop: 'var(--space-3)', 
                  fontSize: 'var(--font-size-xs)', 
                  color: 'var(--color-gray-500)' 
                }}>
                  Fix not available: normalize-loudness preset not configured
                </p>
              )}

              {role === 'BASIC' && (
                <p style={{ 
                  marginTop: 'var(--space-3)', 
                  fontSize: 'var(--font-size-xs)', 
                  color: 'var(--color-warning)' 
                }}>
                  Standard or Advanced role required to apply fixes
                </p>
              )}
            </div>
          </div>

          {/* Create Version Card */}
          <div className="fix-card create-version-card">
            <div className="fix-card-header">
              <div className="fix-card-title">
                <Icons.Plus />
                <h3>Create {nextVersionNumber}</h3>
              </div>
            </div>
            <div className="fix-card-content">
              <div className="version-info">
                <span className="version-number-display">{nextVersionNumber}</span>
                <div className="version-details">
                  <p><strong>New version</strong> from current state</p>
                  <p>Previous: {currentVersion?.version || 'None'}</p>
                </div>
              </div>

              <div className="non-destructive-notice">
                <Icons.Shield />
                <p>
                  <strong>Non-destructive processing.</strong> Original asset is preserved. 
                  New version created as a derived asset with full lineage tracking.
                </p>
              </div>

              <button 
                className="btn-create-version"
                onClick={handleCreateVersion}
                disabled={creatingVersion || !isExportReady}
              >
                {creatingVersion ? 'Creating...' : `Create ${nextVersionNumber}`}
              </button>

              {!isExportReady && (
                <p style={{ 
                  marginTop: 'var(--space-3)', 
                  fontSize: 'var(--font-size-xs)', 
                  color: 'var(--color-warning)',
                  textAlign: 'center'
                }}>
                  Resolve all blockers before creating a new version
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel: Upload */}
        <div className="panel upload-panel">
          <div className="panel-card">
            <div className="panel-card-header">
              <h3 className="panel-card-title">Upload Audio Files</h3>
            </div>
            <div className="panel-card-content">
              {/* Compliance Profile Selector */}
              <div className="compliance-selector">
                <label>Compliance Profile</label>
                <select 
                  value={complianceProfile}
                  onChange={(e) => setComplianceProfile(e.target.value)}
                >
                  <option value="spotify">Spotify Standards</option>
                  <option value="apple">Apple Music</option>
                  <option value="youtube">YouTube Music</option>
                  <option value="broadcast">Broadcast (EBU R128)</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              {/* Upload Dropzone */}
              <div 
                className={`upload-dropzone ${dragActive ? 'drag-active' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  ref={fileInputRef}
                  type="file" 
                  multiple 
                  accept=".wav,.aiff,.mp3,.flac,.m4a"
                  style={{ display: 'none' }}
                  onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                />
                <div className="upload-icon">
                  <Icons.Upload />
                </div>
                <div className="upload-text">
                  <p><strong>Drop files</strong> or click to upload</p>
                  <span>WAV, AIFF, FLAC, MP3 up to 200MB</span>
                </div>
              </div>

              {/* File List */}
              {uploadedFiles.length > 0 && (
                <ul className="file-list">
                  {uploadedFiles.map(file => (
                    <li key={file.id} className="file-item">
                      <div className="file-info">
                        <span className="file-icon"><Icons.File /></span>
                        <div className="file-details">
                          <span className="file-name">{file.name}</span>
                          <span className="file-size">{formatFileSize(file.size)}</span>
                        </div>
                      </div>
                      <div className="file-flags">
                        {file.blockers > 0 && (
                          <span className="file-flag blocker">{file.blockers} Blocker</span>
                        )}
                        {file.warnings > 0 && (
                          <span className="file-flag warning">{file.warnings} Warning</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Analyze CTA */}
              <button 
                className="btn-analyze"
                onClick={handleAnalyzeFiles}
                disabled={uploadedFiles.length === 0}
              >
                Analyze Files
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FixIssuesView;
