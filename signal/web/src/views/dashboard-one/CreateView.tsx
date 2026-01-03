/**
 * Dashboard One - Create View
 * 
 * ============================================================================
 * PERSONA: Independent Rap Artist
 * ============================================================================
 * 
 * PRIMARY QUESTION: "How do I add new files to my project?"
 * 
 * SUCCESS CONDITION: User uploads files and sees confirmation in < 30 seconds
 * 
 * COMPONENT USAGE:
 * - BatchUploader: Multi-file drag-drop with progress
 *   Does one thing well: drag, drop, upload, confirm
 * - VocalRecorder: Microphone capture for vocal recording
 *   Raw capture only - no effects, no processing
 * - MetadataEditor: Assign metadata to uploaded assets
 * 
 * ============================================================================
 */

import { useState } from 'react';
import { studioOS, useProjects } from '../../api';
import { BatchUploader, VocalRecorder, MetadataEditor } from '../../components/core';
import type { AssetMetadata } from '../../components/core';
import type { Project, Asset } from '../../api';

interface UploadedFile {
  id: string;
  file: File;
  status: string;
  assetId?: number;
}

interface CreateViewProps {
  role: 'BASIC' | 'STANDARD' | 'ADVANCED';
  onNavigate: (view: string, id?: number) => void;
}

export function CreateView({ role: _role, onNavigate }: CreateViewProps) {
  // Project creation state
  const [projectName, setProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectError, setProjectError] = useState('');
  const [createdProject, setCreatedProject] = useState<Project | null>(null);
  
  // Target project for uploads
  const [targetProjectId, setTargetProjectId] = useState<number | null>(null);
  
  // Upload state
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [selectedUploadedFile, setSelectedUploadedFile] = useState<UploadedFile | null>(null);
  const [uploadComplete, setUploadComplete] = useState(false);

  // Existing projects for upload target
  const { data: projectsResponse, refetch: refetchProjects } = useProjects();
  const projects = projectsResponse?.data || [];
  
  // Auto-select newly created project as target
  const handleProjectCreated = (project: Project) => {
    setCreatedProject(project);
    setTargetProjectId(project.id);
    setProjectName('');
    refetchProjects();
  };

  // ==========================================================================
  // Project Creation
  // ==========================================================================

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) {
      setProjectError('Project name is required.');
      return;
    }

    setCreatingProject(true);
    setProjectError('');
    setCreatedProject(null);

    try {
      const project = await studioOS.createProject({ name: projectName.trim() });
      handleProjectCreated(project);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreatingProject(false);
    }
  };

  // ==========================================================================
  // Upload Completion Handler
  // ==========================================================================

  const handleUploadComplete = (files: Array<{ id: string; file: File; status: string }>) => {
    console.log('Upload complete:', files.length, 'files');
    setUploadedFiles(files);
    setUploadComplete(true);
    // Auto-select first file for metadata editing
    if (files.length > 0) {
      setSelectedUploadedFile(files[0]);
    }
  };

  // ==========================================================================
  // Metadata Update Handler
  // ==========================================================================

  const handleMetadataUpdate = async (metadata: AssetMetadata) => {
    if (!selectedUploadedFile) return;
    
    console.log('Updating metadata for:', selectedUploadedFile.file.name, metadata);
    // In real implementation, this would call the API to update asset metadata
    // await studioOS.updateAssetMetadata(selectedUploadedFile.assetId, metadata);
    
    // Move to next file if available
    const currentIndex = uploadedFiles.findIndex(f => f.id === selectedUploadedFile.id);
    if (currentIndex < uploadedFiles.length - 1) {
      setSelectedUploadedFile(uploadedFiles[currentIndex + 1]);
    } else {
      setSelectedUploadedFile(null);
    }
  };

  // ==========================================================================
  // Recording Completion Handler
  // ==========================================================================

  const handleRecordingComplete = async (file: File, metadata: { duration: number; sampleRate: number }) => {
    console.log('Recording complete:', file.name, metadata);
    // Upload the recorded file via the API
    try {
      await studioOS.uploadAndAnalyze(file);
      const newFile: UploadedFile = {
        id: `recording-${Date.now()}`,
        file,
        status: 'complete'
      };
      setUploadedFiles(prev => [...prev, newFile]);
      setSelectedUploadedFile(newFile);
      setUploadComplete(true);
    } catch (err) {
      console.error('Failed to upload recording:', err);
    }
  };

  // Create a mock asset object for MetadataEditor
  const createMockAssetFromFile = (uploadedFile: UploadedFile): Asset => ({
    id: uploadedFile.assetId || parseInt(uploadedFile.id.replace(/\D/g, '')) || 1,
    projectId: createdProject?.id || projects[0]?.id || 1,
    name: uploadedFile.file.name,
    category: 'RAW' as const,
    mimeType: uploadedFile.file.type || 'audio/wav',
    sizeBytes: String(uploadedFile.file.size),
    fileKey: `uploads/${uploadedFile.id}`,
    createdAt: new Date().toISOString(),
    metadata: {}
  });

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div className="view">
      {/* Header */}
      <header className="view__header">
        <h2 className="view__title">Create Assets</h2>
        <p className="view__subtitle">Upload files or record vocals for your project</p>
      </header>

      {/* Create Project Form */}
      <section className="section">
        <h3 className="section__title">New Project</h3>
        <div className="card">
          <form onSubmit={handleCreateProject} className="card__body">
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Enter project name"
                  disabled={creatingProject}
                  className="form-input"
                  style={{ width: '100%' }}
                />
              </div>
              <button 
                type="submit" 
                disabled={creatingProject || !projectName.trim()}
                className="btn btn--primary"
              >
                {creatingProject ? 'Creating...' : 'Create Project'}
              </button>
            </div>

            {projectError && <div className="error-message" style={{ marginTop: 'var(--space-3)' }}>{projectError}</div>}
            
            {createdProject && (
              <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', background: 'rgba(34, 197, 94, 0.1)', borderRadius: 'var(--border-radius)', color: 'var(--color-success)' }}>
                ✓ Project "{createdProject.name}" created successfully!
              </div>
            )}

            {/* Dev-only quick start: register + create project */}
            {process.env.NODE_ENV !== 'production' && (
              <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      // Generate quick credentials
                      const email = `quick+${Date.now()}@example.com`;
                      const password = 'Password123!';
                      // Register and set token in client
                      await studioOS.register(email, password);
                      // Create a sample project
                      const project = await studioOS.createProject({ name: `Quick Project ${new Date().toLocaleTimeString()}` });
                      handleProjectCreated(project);
                    } catch (err) {
                      setProjectError(err instanceof Error ? err.message : 'Quick start failed');
                    }
                  }}
                  className="btn btn--tertiary"
                >
                  Quick Start: Register & Create Project
                </button>
                <small style={{ color: 'var(--color-gray-500)' }}>Dev only — creates a temporary account</small>
              </div>
            )}
          </form>
        </div>
      </section>

      {/* Target Project Selection */}
      <section className="section">
        <h3 className="section__title">Target Project</h3>
        <p className="section__subtitle" style={{ color: 'var(--color-gray-400)', marginBottom: 'var(--space-4)' }}>
          Select or create a project for your uploads
        </p>
        
        <div className="card">
          <div className="card__body">
            {/* Project Selector */}
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <select
                value={targetProjectId || ''}
                onChange={(e) => setTargetProjectId(e.target.value ? parseInt(e.target.value) : null)}
                className="form-select"
                style={{ flex: 1 }}
              >
                <option value="">Select existing project...</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.state})
                  </option>
                ))}
              </select>
              <span style={{ color: 'var(--color-gray-500)', fontSize: 'var(--font-size-sm)' }}>or</span>
            </div>
            
            {/* Create New Project */}
            <form onSubmit={handleCreateProject} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Create new project..."
                  disabled={creatingProject}
                  className="form-input"
                  style={{ width: '100%' }}
                />
              </div>
              <button 
                type="submit" 
                disabled={creatingProject || !projectName.trim()}
                className="btn btn--secondary"
              >
                {creatingProject ? 'Creating...' : 'Create'}
              </button>
            </form>

            {projectError && <div className="error-message" style={{ marginTop: 'var(--space-3)' }}>{projectError}</div>}
            
            {createdProject && (
              <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', background: 'rgba(34, 197, 94, 0.1)', borderRadius: 'var(--border-radius)', color: 'var(--color-success)' }}>
                ✓ Project "{createdProject.name}" created and selected!
              </div>
            )}
            
            {/* Selected Project Indicator */}
            {targetProjectId && (
              <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-4)', background: 'var(--color-gray-800)', borderRadius: 'var(--border-radius)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <span style={{ fontSize: '1.5rem' }}>📁</span>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--color-white)' }}>
                    {projects.find(p => p.id === targetProjectId)?.name || createdProject?.name}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-400)' }}>
                    Uploads will be added to this project
                  </div>
                </div>
                <button 
                  onClick={() => setTargetProjectId(null)} 
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--color-gray-500)', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Upload Section */}
      <section className="section">
        <h3 className="section__title">Upload Files</h3>
        {!targetProjectId ? (
          <div className="empty-state" style={{ padding: 'var(--space-8)', background: 'var(--color-gray-900)', borderRadius: 'var(--border-radius-lg)', border: '1px dashed var(--color-gray-700)' }}>
            <span className="empty-state__icon">📁</span>
            <p className="empty-state__title">Select a project first</p>
            <p className="empty-state__description">Choose or create a project above to start uploading files.</p>
          </div>
        ) : (
          <BatchUploader
            projectId={targetProjectId}
            onUploadComplete={handleUploadComplete}
            maxFileSize={500 * 1024 * 1024}
            acceptedFormats={['.wav', '.mp3', '.aiff', '.flac', '.ogg']}
            maxFiles={50}
          />
        )}
      </section>

      {/* Record Vocals Section */}
      <section className="section">
        <h3 className="section__title">Record Vocals</h3>
        <VocalRecorder
          onRecordingComplete={handleRecordingComplete}
          maxDuration={600}
          sampleRate={48000}
        />
      </section>

      {/* Metadata Assignment Section - Shows after upload */}
      {uploadComplete && uploadedFiles.length > 0 && (
        <section className="section">
          <h3 className="section__title">Assign Metadata</h3>
          <p className="section__subtitle" style={{ color: 'var(--color-gray-400)', marginBottom: 'var(--space-4)' }}>
            Add metadata to your uploaded assets for better organization and distribution
          </p>
          
          <div className="layout-sidebar" style={{ gap: 'var(--space-6)' }}>
            {/* File List */}
            <div className="card" style={{ flex: '0 0 280px' }}>
              <div className="card__header">
                <h4 className="card__title">Uploaded Files ({uploadedFiles.length})</h4>
              </div>
              <div className="card__body" style={{ padding: 0 }}>
                {uploadedFiles.map((uf) => (
                  <button
                    key={uf.id}
                    onClick={() => setSelectedUploadedFile(uf)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                      padding: 'var(--space-3) var(--space-4)',
                      background: selectedUploadedFile?.id === uf.id ? 'var(--color-gray-800)' : 'transparent',
                      border: 'none',
                      borderBottom: '1px solid var(--color-gray-800)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: 'var(--color-gray-200)',
                      transition: 'background var(--duration-150) var(--ease-out)'
                    }}
                  >
                    <span style={{ fontSize: '1.25rem' }}>🎵</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ 
                        fontSize: 'var(--font-size-sm)', 
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {uf.file.name}
                      </div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-500)' }}>
                        {(uf.file.size / 1024 / 1024).toFixed(1)} MB
                      </div>
                    </div>
                    <span className="badge badge--success" style={{ fontSize: '10px' }}>✓</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Metadata Editor */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {selectedUploadedFile ? (
                <MetadataEditor
                  asset={createMockAssetFromFile(selectedUploadedFile)}
                  onUpdate={handleMetadataUpdate}
                  onCancel={() => setSelectedUploadedFile(null)}
                />
              ) : (
                <div className="empty-state">
                  <span className="empty-state__icon">📝</span>
                  <p className="empty-state__title">All metadata assigned</p>
                  <p className="empty-state__description">Select a file to edit its metadata, or proceed to processing.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Quick Navigation */}
      {uploadComplete && (
        <section className="section">
          <h3 className="section__title">Next Steps</h3>
          <div className="actions-grid">
            <button onClick={() => onNavigate('transform')} className="action-card">
              <span className="action-card__icon">⚙️</span>
              <span className="action-card__content">
                <span className="action-card__label">Start Processing</span>
              </span>
            </button>
            <button onClick={() => onNavigate('assets')} className="action-card">
              <span className="action-card__icon">📁</span>
              <span className="action-card__content">
                <span className="action-card__label">View All Assets</span>
              </span>
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
