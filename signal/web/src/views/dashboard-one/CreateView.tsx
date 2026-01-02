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
 * 
 * ============================================================================
 */

import { useState } from 'react';
import { studioOS, useProjects } from '../../api';
import { BatchUploader, VocalRecorder } from '../../components/core';
import type { Project } from '../../api';

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
  const [uploadComplete, setUploadComplete] = useState(false);

  // Existing projects for upload target
  const { data: projectsResponse, refetch: refetchProjects } = useProjects();
  const projects = projectsResponse?.data || [];

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
      setCreatedProject(project);
      setProjectName('');
      refetchProjects();
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
    setUploadComplete(true);
  };

  // ==========================================================================
  // Recording Completion Handler
  // ==========================================================================

  const handleRecordingComplete = async (file: File, metadata: { duration: number; sampleRate: number }) => {
    console.log('Recording complete:', file.name, metadata);
    // Upload the recorded file via the API
    try {
      await studioOS.uploadAndAnalyze(file);
      setUploadComplete(true);
    } catch (err) {
      console.error('Failed to upload recording:', err);
    }
  };

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
          </form>
        </div>
      </section>

      {/* Existing Projects */}
      {projects.length > 0 && (
        <section className="section">
          <h3 className="section__title">Existing Projects ({projects.length})</h3>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {projects.slice(0, 5).map(p => (
              <span key={p.id} className={`badge badge--state-${p.state.toLowerCase()}`}>
                {p.name}
              </span>
            ))}
            {projects.length > 5 && (
              <span className="badge badge--neutral">+{projects.length - 5} more</span>
            )}
          </div>
        </section>
      )}

      {/* Upload Section */}
      <section className="section">
        <h3 className="section__title">Upload Files</h3>
        <BatchUploader
          onUploadComplete={handleUploadComplete}
          maxFileSize={500 * 1024 * 1024}
          acceptedFormats={['.wav', '.mp3', '.aiff', '.flac', '.ogg']}
          maxFiles={50}
        />
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
