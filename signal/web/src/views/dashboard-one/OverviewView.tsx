/**
 * Dashboard One - Overview View
 * 
 * Displays project status, recent activity, and quick navigation.
 * Per STUDIOOS_FUNCTIONAL_SPECS.md Section 4.1
 */

import { useProjects } from '../../api';
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
      <h2>Overview</h2>
      
      {/* Status Summary */}
      <div className="status-cards">
        <div className="status-card">
          <h3>Total Projects</h3>
          <span className="count">{projects.length}</span>
        </div>
        <div className="status-card processing">
          <h3>Processing</h3>
          <span className="count">{activeProjects.length}</span>
        </div>
        <div className="status-card ready">
          <h3>Ready for Review</h3>
          <span className="count">{readyProjects.length}</span>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        <h3>Quick Actions</h3>
        <button onClick={() => onNavigate('create')}>Create New Project</button>
        <button onClick={() => onNavigate('assets')}>Manage Assets</button>
        <button onClick={() => onNavigate('history')}>View History</button>
      </div>

      {/* Recent Projects */}
      <div className="recent-projects">
        <h3>Recent Projects</h3>
        {recentProjects.length === 0 ? (
          <p>No projects yet. Create your first project to get started.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>State</th>
                <th>Assets</th>
                <th>Jobs</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {recentProjects.map(project => (
                <tr key={project.id}>
                  <td>{project.name}</td>
                  <td>
                    <span 
                      className="state-badge" 
                      style={{ backgroundColor: getStateColor(project.state) }}
                    >
                      {project.state}
                    </span>
                  </td>
                  <td>{project._count?.assets ?? 0}</td>
                  <td>{project._count?.jobs ?? 0}</td>
                  <td>{new Date(project.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
