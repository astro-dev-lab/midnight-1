/**
 * Dashboard One - Create View
 * 
 * Create new projects and upload assets.
 * Per STUDIOOS_FUNCTIONAL_SPECS.md Section 4.3
 */

import { useState } from 'react';
import type { Project } from '../../types';

interface CreateViewProps {
  role: 'BASIC' | 'STANDARD' | 'ADVANCED';
  onNavigate: (view: string, id?: number) => void;
}

export function CreateView({ role: _role, onNavigate }: CreateViewProps) {
  const [projectName, setProjectName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<Project | null>(null);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) {
      setError('Project name is required.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess(null);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: projectName.trim() })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create project');
      }

      const project: Project = await response.json();
      setSuccess(project);
      setProjectName('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setSubmitting(false);
    }
  };

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
              disabled={submitting}
            />
          </div>

          {error && <div className="form-error">{error}</div>}
          
          {success && (
            <div className="form-success">
              Project "{success.name}" created successfully!
              <button 
                type="button" 
                onClick={() => onNavigate('assets')}
                style={{ marginLeft: '10px' }}
              >
                Add Assets
              </button>
            </div>
          )}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Project'}
          </button>
        </form>
      </div>

      {/* Upload Assets Section */}
      <div className="create-section">
        <h3>Upload Assets</h3>
        <p>
          To upload assets, first select an existing project or create one above.
        </p>
        <div className="upload-info">
          <h4>Supported Formats</h4>
          <ul>
            <li>Audio: WAV, FLAC, AIFF, MP3</li>
            <li>Project files as archives: ZIP</li>
          </ul>
          <h4>Asset Categories</h4>
          <ul>
            <li><strong>Raw:</strong> Uploaded assets start as Raw</li>
            <li><strong>Derived:</strong> Job outputs become Derived assets</li>
            <li><strong>Final:</strong> Approved assets become Final</li>
          </ul>
        </div>
        <button onClick={() => onNavigate('assets')} disabled={!success}>
          Go to Assets
        </button>
      </div>

      {/* Quick Navigation */}
      <div className="quick-nav">
        <h3>Next Steps</h3>
        <ul>
          <li>
            <button onClick={() => onNavigate('transform')}>
              Submit a Transform Job
            </button>
          </li>
          <li>
            <button onClick={() => onNavigate('overview')}>
              Return to Overview
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
