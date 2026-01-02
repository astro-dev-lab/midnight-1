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

  if (loading) {
    return <div className="loading">Loading overview...</div>;
  }

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  const activeProjects = projects.filter(p => p.state === 'PROCESSING');
  const readyProjects = projects.filter(p => p.state === 'READY');
  const recentProjects = projects.slice(0, 5);

  const getStateBadgeClass = (state: Project['state']) => {
    switch (state) {
      case 'DRAFT': return 'badge badge--state-draft';
      case 'PROCESSING': return 'badge badge--state-processing';
      case 'READY': return 'badge badge--state-ready';
      case 'DELIVERED': return 'badge badge--state-delivered';
      default: return 'badge badge--neutral';
    }
  };

  return (
    <div className="view">
      {/* Header */}
      <header className="view__header">
        <h2 className="view__title">Overview</h2>
        <p className="view__subtitle">Current status of your production workspace</p>
      </header>
      
      {/* Status Summary */}
      <section className="section">
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-card__value">{projects.length}</span>
            <span className="stat-card__label">Total Projects</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__value stat-card__value--primary">{activeProjects.length}</span>
            <span className="stat-card__label">Processing</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__value stat-card__value--success">{readyProjects.length}</span>
            <span className="stat-card__label">Ready for Review</span>
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="section">
        <h3 className="section__title">Quick Actions</h3>
        <div className="actions-grid">
          <button className="action-card" onClick={() => onNavigate('create')}>
            <span className="action-card__icon">📁</span>
            <span className="action-card__content">
              <span className="action-card__label">Upload Assets</span>
              <span className="action-card__description">Add new audio files</span>
            </span>
          </button>
          <button className="action-card" onClick={() => onNavigate('transform')}>
            <span className="action-card__icon">⚙️</span>
            <span className="action-card__content">
              <span className="action-card__label">Start Processing</span>
              <span className="action-card__description">Run transformations</span>
            </span>
          </button>
          <button className="action-card" onClick={() => onNavigate('deliver')}>
            <span className="action-card__icon">📤</span>
            <span className="action-card__content">
              <span className="action-card__label">Prepare Delivery</span>
              <span className="action-card__description">Export final outputs</span>
            </span>
          </button>
        </div>
      </section>

      {/* Job Activity */}
      <section className="section">
        <h3 className="section__title">Job Activity</h3>
        <JobManager />
      </section>

      {/* Recent Projects */}
      <section className="section">
        <h3 className="section__title">Recent Projects</h3>
        {recentProjects.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__icon">📁</span>
            <p className="empty-state__title">No projects yet</p>
            <p className="empty-state__description">Upload assets to create your first project.</p>
          </div>
        ) : (
          <div className="card">
            <div className="table-header" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr' }}>
              <span>Name</span>
              <span>State</span>
              <span>Assets</span>
              <span>Jobs</span>
              <span>Updated</span>
            </div>
            <div className="table-rows">
              {recentProjects.map(project => (
                <div key={project.id} className="table-row" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr' }}>
                  <span style={{ color: 'var(--color-white)', fontWeight: 500 }}>{project.name}</span>
                  <span>
                    <span className={getStateBadgeClass(project.state)}>
                      {project.state}
                    </span>
                  </span>
                  <span>{project._count?.assets ?? 0}</span>
                  <span>{project._count?.jobs ?? 0}</span>
                  <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
