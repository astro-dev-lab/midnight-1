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
    <div className="create-view">
      <header className="view-header">
        <h2 className="view-title">Create Assets</h2>
        <p className="view-subtitle">Upload files or record vocals for your project</p>
      </header>

      {/* Create Project Form */}
      <section className="create-section project-creation">
        <h3 className="section-title">New Project</h3>
        <form onSubmit={handleCreateProject} className="project-form">
          <div className="form-row">
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Enter project name"
              disabled={creatingProject}
              className="project-name-input"
            />
            <button 
              type="submit" 
              disabled={creatingProject || !projectName.trim()}
              className="btn-create"
            >
              {creatingProject ? 'Creating...' : 'Create Project'}
            </button>
          </div>

          {projectError && <div className="form-error">{projectError}</div>}
          
          {createdProject && (
            <div className="form-success">
              ✓ Project "{createdProject.name}" created successfully!
            </div>
          )}
        </form>
      </section>

      {/* Existing Projects */}
      {projects.length > 0 && (
        <section className="create-section projects-list">
          <h3 className="section-title">Existing Projects ({projects.length})</h3>
          <div className="project-chips">
            {projects.slice(0, 5).map(p => (
              <span key={p.id} className={`project-chip state-${p.state.toLowerCase()}`}>
                {p.name}
              </span>
            ))}
            {projects.length > 5 && (
              <span className="project-chip more">+{projects.length - 5} more</span>
            )}
          </div>
        </section>
      )}

      {/* Upload Section — Component: BatchUploader */}
      <section className="create-section upload-section">
        <h3 className="section-title">Upload Files</h3>
        <div className="component-container">
          <BatchUploader
            onUploadComplete={handleUploadComplete}
            maxFileSize={500 * 1024 * 1024}
            acceptedFormats={['.wav', '.mp3', '.aiff', '.flac', '.ogg']}
            maxFiles={50}
          />
        </div>
      </section>

      {/* Record Vocals Section — Component: VocalRecorder */}
      <section className="create-section record-section">
        <h3 className="section-title">Record Vocals</h3>
        <div className="component-container">
          <VocalRecorder
            onRecordingComplete={handleRecordingComplete}
            maxDuration={600}
            sampleRate={48000}
          />
        </div>
      </section>

      {/* Quick Navigation */}
      {uploadComplete && (
        <section className="create-section next-steps">
          <h3 className="section-title">Next Steps</h3>
          <div className="nav-buttons">
            <button onClick={() => onNavigate('transform')} className="btn-primary">
              → Start Processing
            </button>
            <button onClick={() => onNavigate('assets')} className="btn-secondary">
              View All Assets
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
