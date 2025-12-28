/**
 * Dashboard One - Create View
 * 
 * Create new projects and upload assets.
 * Per STUDIOOS_FUNCTIONAL_SPECS.md Section 4.3
 */

import { useState, useRef, useCallback } from 'react';
import { studioOS, useProjects } from '../../api';
import type { Project, Asset } from '../../api';

interface CreateViewProps {
  role: 'BASIC' | 'STANDARD' | 'ADVANCED';
  onNavigate: (view: string, id?: number) => void;
}

interface UploadProgress {
  file: File;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  progress: number;
  asset?: Asset;
  error?: string;
}

const ACCEPTED_AUDIO_TYPES = [
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
  'audio/x-flac',
  'audio/aiff',
  'audio/x-aiff',
  'audio/mpeg',
  'audio/mp3',
  'application/zip',
];

const ACCEPTED_EXTENSIONS = ['.wav', '.flac', '.aiff', '.aif', '.mp3', '.zip'];

export function CreateView({ role: _role, onNavigate }: CreateViewProps) {
  // Project creation state
  const [projectName, setProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectError, setProjectError] = useState('');
  const [createdProject, setCreatedProject] = useState<Project | null>(null);

  // File upload state
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setSelectedProjectId(project.id);
      refetchProjects();
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreatingProject(false);
    }
  };

  // ==========================================================================
  // File Upload
  // ==========================================================================

  const validateFile = (file: File): string | null => {
    // Check file type
    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(extension) && !ACCEPTED_AUDIO_TYPES.includes(file.type)) {
      return `Unsupported file type: ${file.name}. Accepted: WAV, FLAC, AIFF, MP3, ZIP`;
    }

    // Check file size (max 500MB)
    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      return `File too large: ${file.name}. Maximum size is 500MB.`;
    }

    return null;
  };

  const uploadFile = useCallback(async (file: File, index: number, projectId: number) => {
    // Mark as uploading
    setUploads(prev => prev.map((u, i) => 
      i === index ? { ...u, status: 'uploading' as const, progress: 10 } : u
    ));

    try {
      // Simulate progress (since axios doesn't report FormData progress easily)
      const progressInterval = setInterval(() => {
        setUploads(prev => prev.map((u, i) => 
          i === index && u.status === 'uploading' && u.progress < 90
            ? { ...u, progress: u.progress + 10 }
            : u
        ));
      }, 200);

      const asset = await studioOS.uploadAsset(projectId, file);

      clearInterval(progressInterval);

      setUploads(prev => prev.map((u, i) => 
        i === index ? { ...u, status: 'completed' as const, progress: 100, asset } : u
      ));
    } catch (err) {
      setUploads(prev => prev.map((u, i) => 
        i === index ? { 
          ...u, 
          status: 'failed' as const, 
          progress: 0,
          error: err instanceof Error ? err.message : 'Upload failed'
        } : u
      ));
    }
  }, []);

  const handleFilesSelected = useCallback((files: FileList | File[]) => {
    if (!selectedProjectId) {
      return;
    }

    const fileArray = Array.from(files);
    const newUploads: UploadProgress[] = [];

    for (const file of fileArray) {
      const error = validateFile(file);
      if (error) {
        newUploads.push({
          file,
          status: 'failed',
          progress: 0,
          error,
        });
      } else {
        newUploads.push({
          file,
          status: 'pending',
          progress: 0,
        });
      }
    }

    const currentLength = uploads.length;
    setUploads(prev => [...prev, ...newUploads]);

    // Start uploading pending files
    newUploads.forEach((upload, index) => {
      if (upload.status === 'pending') {
        const globalIndex = currentLength + index;
        uploadFile(upload.file, globalIndex, selectedProjectId);
      }
    });
  }, [selectedProjectId, uploads.length, uploadFile]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (!selectedProjectId) {
      return;
    }

    handleFilesSelected(e.dataTransfer.files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFilesSelected(e.target.files);
      e.target.value = ''; // Reset for re-selection
    }
  };

  const clearUploads = () => {
    setUploads([]);
  };

  const completedUploads = uploads.filter(u => u.status === 'completed');
  const failedUploads = uploads.filter(u => u.status === 'failed');
  const activeUploads = uploads.filter(u => u.status === 'uploading' || u.status === 'pending');

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div className="create-view">
      <h2>Create</h2>

      {/* Create Project Form */}
      <div className="create-section">
        <h3>New Project</h3>
        <form onSubmit={handleCreateProject}>
          <div className="form-group">
            <label htmlFor="projectName">Project Name</label>
            <input
              id="projectName"
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Enter project name"
              disabled={creatingProject}
            />
          </div>

          {projectError && <div className="form-error">{projectError}</div>}
          
          {createdProject && (
            <div className="form-success">
              ✓ Project "{createdProject.name}" created successfully!
            </div>
          )}

          <button type="submit" disabled={creatingProject || !projectName.trim()}>
            {creatingProject ? 'Creating...' : 'Create Project'}
          </button>
        </form>
      </div>

      {/* Upload Assets Section */}
      <div className="create-section">
        <h3>Upload Assets</h3>
        
        {/* Project selector */}
        <div className="form-group">
          <label htmlFor="uploadProject">Select Project</label>
          <select
            id="uploadProject"
            value={selectedProjectId || ''}
            onChange={(e) => setSelectedProjectId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Choose a project...</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.state})
              </option>
            ))}
          </select>
        </div>

        {/* Drop zone */}
        {selectedProjectId && (
          <>
            <div 
              className={`drop-zone ${isDragging ? 'dragging' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_EXTENSIONS.join(',')}
                onChange={handleFileInputChange}
                style={{ display: 'none' }}
              />
              <div className="drop-zone-content">
                <span className="drop-icon">📁</span>
                <p>Drag & drop audio files here</p>
                <p className="drop-hint">or click to browse</p>
                <p className="drop-formats">WAV, FLAC, AIFF, MP3, ZIP (max 500MB)</p>
              </div>
            </div>

            {/* Upload progress */}
            {uploads.length > 0 && (
              <div className="upload-list">
                <div className="upload-header">
                  <h4>Uploads ({completedUploads.length}/{uploads.length} completed)</h4>
                  {activeUploads.length === 0 && (
                    <button className="btn-small" onClick={clearUploads}>Clear</button>
                  )}
                </div>
                
                {uploads.map((upload, index) => (
                  <div key={index} className={`upload-item ${upload.status}`}>
                    <span className="upload-name">{upload.file.name}</span>
                    <span className="upload-size">
                      {(upload.file.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                    {upload.status === 'uploading' && (
                      <div className="upload-progress">
                        <div 
                          className="upload-progress-bar" 
                          style={{ width: `${upload.progress}%` }}
                        />
                      </div>
                    )}
                    {upload.status === 'completed' && (
                      <span className="upload-status success">✓</span>
                    )}
                    {upload.status === 'failed' && (
                      <span className="upload-status error" title={upload.error}>✗</span>
                    )}
                    {upload.status === 'pending' && (
                      <span className="upload-status pending">⋯</span>
                    )}
                  </div>
                ))}

                {failedUploads.length > 0 && (
                  <div className="upload-errors">
                    {failedUploads.map((upload, index) => (
                      <p key={index} className="error-text">{upload.error}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!selectedProjectId && (
          <div className="upload-info">
            <p>Select or create a project above to upload assets.</p>
          </div>
        )}
      </div>

      {/* Quick Navigation */}
      <div className="quick-nav">
        <h3>Next Steps</h3>
        <div className="nav-buttons">
          {completedUploads.length > 0 && (
            <button onClick={() => onNavigate('transform')}>
              → Submit Transform Job
            </button>
          )}
          <button onClick={() => onNavigate('assets')}>
            View All Assets
          </button>
          <button onClick={() => onNavigate('overview')}>
            Return to Overview
          </button>
        </div>
      </div>

      <style>{`
        .create-view {
          padding: 20px;
          max-width: 800px;
        }

        .create-section {
          background: #f8f9fa;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
        }

        .create-section h3 {
          margin-top: 0;
          margin-bottom: 15px;
          color: #333;
        }

        .form-group {
          margin-bottom: 15px;
        }

        .form-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: 500;
        }

        .form-group input,
        .form-group select {
          width: 100%;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
        }

        .form-error {
          background: #fee;
          color: #c00;
          padding: 10px;
          border-radius: 4px;
          margin-bottom: 15px;
        }

        .form-success {
          background: #efe;
          color: #060;
          padding: 10px;
          border-radius: 4px;
          margin-bottom: 15px;
        }

        button {
          padding: 10px 20px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }

        button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        button:hover:not(:disabled) {
          background: #0056b3;
        }

        .drop-zone {
          border: 2px dashed #ccc;
          border-radius: 8px;
          padding: 40px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
          background: white;
        }

        .drop-zone:hover,
        .drop-zone.dragging {
          border-color: #007bff;
          background: #f0f7ff;
        }

        .drop-zone-content {
          color: #666;
        }

        .drop-icon {
          font-size: 48px;
          display: block;
          margin-bottom: 10px;
        }

        .drop-hint {
          font-size: 12px;
          color: #999;
        }

        .drop-formats {
          font-size: 11px;
          color: #aaa;
          margin-top: 10px;
        }

        .upload-list {
          margin-top: 20px;
          background: white;
          border-radius: 4px;
          padding: 15px;
        }

        .upload-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }

        .upload-header h4 {
          margin: 0;
        }

        .btn-small {
          padding: 5px 10px;
          font-size: 12px;
        }

        .upload-item {
          display: flex;
          align-items: center;
          padding: 10px;
          border-bottom: 1px solid #eee;
          gap: 10px;
        }

        .upload-item:last-child {
          border-bottom: none;
        }

        .upload-name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .upload-size {
          color: #999;
          font-size: 12px;
        }

        .upload-progress {
          width: 100px;
          height: 6px;
          background: #eee;
          border-radius: 3px;
          overflow: hidden;
        }

        .upload-progress-bar {
          height: 100%;
          background: #007bff;
          transition: width 0.2s;
        }

        .upload-status {
          font-size: 18px;
        }

        .upload-status.success { color: #28a745; }
        .upload-status.error { color: #dc3545; }
        .upload-status.pending { color: #999; }

        .upload-errors {
          margin-top: 10px;
          padding: 10px;
          background: #fee;
          border-radius: 4px;
        }

        .error-text {
          color: #c00;
          font-size: 12px;
          margin: 5px 0;
        }

        .upload-info {
          padding: 20px;
          background: white;
          border-radius: 4px;
          text-align: center;
          color: #666;
        }

        .quick-nav {
          background: #f8f9fa;
          border-radius: 8px;
          padding: 20px;
        }

        .quick-nav h3 {
          margin-top: 0;
        }

        .nav-buttons {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .nav-buttons button {
          background: #6c757d;
        }

        .nav-buttons button:first-child {
          background: #28a745;
        }

        .nav-buttons button:hover {
          opacity: 0.9;
        }
      `}</style>
    </div>
  );
}
