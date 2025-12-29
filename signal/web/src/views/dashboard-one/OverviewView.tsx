/**
 * Dashboard One - Overview View
 * 
 * ============================================================================
 * PERSONA: Independent Rap Artist
 * ============================================================================
 * 
 * PRIMARY QUESTION: "What's the status of my project?"
 * 
 * SUCCESS CONDITION: User understands project state in < 5 seconds
 * 
 * COMPONENT USAGE:
 * - JobManager: Shows active/queued/failed jobs
 *   Answers "is anything running?" and "did anything fail?"
 * 
 * ============================================================================
 */

import { useProjects } from '../../api';
import { JobManager } from '../../components/core';
import type { Project } from '../../api';

interface OverviewViewProps {
  role: 'BASIC' | 'STANDARD' | 'ADVANCED';
  onNavigate: (view: string, id?: number) => void;
}

export function OverviewView({ role: _role, onNavigate }: OverviewViewProps) {
  const { data: projectsResponse, loading, error } = useProjects();
  const projects = projectsResponse?.data || [];

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
    return <div className="view-loading">Loading overview...</div>;
  }

  if (error) {
    return <div className="view-error">{error}</div>;
  }

  const activeProjects = projects.filter(p => p.state === 'PROCESSING');
  const readyProjects = projects.filter(p => p.state === 'READY');
  const recentProjects = projects.slice(0, 5);

  return (
    <div className="overview-view">
      <header className="view-header">
        <h2 className="view-title">Overview</h2>
        <p className="view-subtitle">Current status of your production workspace</p>
      </header>
      
      {/* Status Summary — Artist: "what's the quick picture?" */}
      <section className="status-summary">
        <div className="stat-card">
          <span className="stat-value">{projects.length}</span>
          <span className="stat-label">Total Projects</span>
        </div>
        <div className="stat-card processing">
          <span className="stat-value">{activeProjects.length}</span>
          <span className="stat-label">Processing</span>
        </div>
        <div className="stat-card ready">
          <span className="stat-value">{readyProjects.length}</span>
          <span className="stat-label">Ready for Review</span>
        </div>
      </section>

      {/* Quick Actions — Artist: fast paths to common tasks */}
      <section className="quick-actions">
        <h3 className="section-title">Quick Actions</h3>
        <div className="action-buttons">
          <button className="action-btn" onClick={() => onNavigate('create')}>
            <span className="action-icon">📁</span>
            <span className="action-label">Upload Assets</span>
          </button>
          <button className="action-btn" onClick={() => onNavigate('transform')}>
            <span className="action-icon">⚙️</span>
            <span className="action-label">Start Processing</span>
          </button>
          <button className="action-btn" onClick={() => onNavigate('deliver')}>
            <span className="action-icon">📤</span>
            <span className="action-label">Prepare Delivery</span>
          </button>
        </div>
      </section>

      {/* Job Activity — Primary component: JobManager */}
      <section className="job-activity">
        <h3 className="section-title">Job Activity</h3>
        <div className="component-container">
          <JobManager />
        </div>
      </section>

      {/* Recent Projects — Quick reference list */}
      <section className="recent-projects">
        <h3 className="section-title">Recent Projects</h3>
        {recentProjects.length === 0 ? (
          <p className="empty-message">No projects yet. Upload assets to create your first project.</p>
        ) : (
          <div className="project-table">
            <div className="table-header">
              <span>Name</span>
              <span>State</span>
              <span>Assets</span>
              <span>Jobs</span>
              <span>Updated</span>
            </div>
            {recentProjects.map(project => (
              <div key={project.id} className="table-row">
                <span className="project-name">{project.name}</span>
                <span>
                  <span 
                    className="state-badge" 
                    style={{ backgroundColor: getStateColor(project.state) }}
                  >
                    {project.state}
                  </span>
                </span>
                <span>{project._count?.assets ?? 0}</span>
                <span>{project._count?.jobs ?? 0}</span>
                <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
