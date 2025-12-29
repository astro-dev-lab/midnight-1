/**
 * Dashboard Two - Projects View
 * 
 * ============================================================================
 * PERSONA: Operations / Reviewer (Viewer or Approver)
 * ============================================================================
 * 
 * PRIMARY QUESTION: "What projects are shared with me?"
 * 
 * SUCCESS CONDITION: User quickly identifies projects requiring attention
 * 
 * COMPONENT USAGE:
 * - SmartSearch: Filter and find projects quickly
 * - JobManager: Show pending jobs per project (queue count)
 * 
 * RBAC:
 * - Viewer: Can view project list, cannot take action
 * - Approver: Can view and navigate to deliverables/approvals
 * 
 * ============================================================================
 */

import { useEffect, useState } from 'react';
import type { Project, ListResponse } from '../../types';
import { SmartSearch } from '../../components/core';

interface ProjectsViewProps {
  onNavigate: (view: string, projectId?: number) => void;
}

export function ProjectsView({ onNavigate }: ProjectsViewProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      setFilteredProjects(
        projects.filter(p => 
          p.name.toLowerCase().includes(query) ||
          p.state.toLowerCase().includes(query)
        )
      );
    } else {
      setFilteredProjects(projects);
    }
  }, [searchQuery, projects]);

  const fetchProjects = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/projects/external', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to load projects');
      const data: ListResponse<Project> = await response.json();
      setProjects(data.data);
      setFilteredProjects(data.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
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
      <header className="view-header">
        <h2 className="view-title">Your Projects</h2>
        <p className="view-subtitle">Projects shared with you for review</p>
      </header>

      {/* Search — Component: SmartSearch */}
      <section className="search-section">
        <SmartSearch
          placeholder="Search projects by name or state..."
          onSearch={(query) => setSearchQuery(query)}
          value={searchQuery}
        />
      </section>
      
      {/* Project Grid */}
      <section className="projects-grid">
        {filteredProjects.length === 0 ? (
          <div className="empty-state">
            <p>No projects match your search.</p>
          </div>
        ) : (
          <div className="project-cards">
            {filteredProjects.map(project => (
              <div key={project.id} className="project-card">
                <div className="card-header">
                  <h3 className="project-name">{project.name}</h3>
                  <span className={`state-badge state-${project.state.toLowerCase()}`}>
                    {project.state}
                  </span>
                </div>
                
                <div className="card-meta">
                  <div className="meta-item">
                    <span className="label">Assets:</span>
                    <span className="value">{project._count?.assets ?? 0}</span>
                  </div>
                  <div className="meta-item">
                    <span className="label">Updated:</span>
                    <span className="value">{new Date(project.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                
                <div className="card-actions">
                  <button 
                    className="btn-primary"
                    onClick={() => onNavigate('deliverables', project.id)}
                  >
                    View Deliverables
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
