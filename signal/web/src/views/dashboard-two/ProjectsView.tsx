/**
 * Dashboard Two - Projects View
 * 
 * View shared projects for external users.
 * Per STUDIOOS_DASHBOARD_TWO_FUNCTIONAL_SPECS.md Section 4.1
 */

import { useEffect, useState } from 'react';
import type { Project, ListResponse } from '../../types';

interface ProjectsViewProps {
  onNavigate: (view: string, projectId?: number) => void;
}

export function ProjectsView({ onNavigate }: ProjectsViewProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/projects/external', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to load projects');
      const data: ListResponse<Project> = await response.json();
      setProjects(data.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const getStateColor = (state: Project['state']) => {
    switch (state) {
      case 'DRAFT': return '#6c757d';
      case 'PROCESSING': return '#007bff';
      case 'READY': return '#28a745';
      case 'DELIVERED': return '#17a2b8';
      default: return '#6c757d';
    }
  };

  if (loading) {
    return <div className="view-loading">Loading projects...</div>;
  }

  if (error) {
    return <div className="view-error">{error}</div>;
  }

  return (
    <div className="projects-view">
      <h2>Your Projects</h2>
      
      {projects.length === 0 ? (
        <p>No projects shared with you yet.</p>
      ) : (
        <div className="project-cards">
          {projects.map(project => (
            <div key={project.id} className="project-card">
              <h3>{project.name}</h3>
              <span 
                className="state-badge" 
                style={{ backgroundColor: getStateColor(project.state) }}
              >
                {project.state}
              </span>
              <p>Assets: {project._count?.assets ?? 0}</p>
              <p>Updated: {new Date(project.updatedAt).toLocaleDateString()}</p>
              <div className="card-actions">
                <button onClick={() => onNavigate('deliverables', project.id)}>
                  View Deliverables
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
