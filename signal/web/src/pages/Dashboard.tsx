import { useEffect, useState } from 'react';
import {
  BatchUploader,
  QualityPresets,
  ProcessingReport,
  JobManager,
  SmartSearch,
  PlatformExports,
  DeliveryManager,
  DeliveryTracking,
  AudioVisualization
} from '../components/core';
import './Dashboard.css';

interface DashboardProps {
  onLogout: () => void;
}

interface Job {
  id: number;
  type: string;
  status: string;
  asset: string;
}

interface Asset {
  id: number;
  name: string;
  type: string;
  status: string;
}

export function Dashboard({ onLogout }: DashboardProps) {
  const [activeView, setActiveView] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError('');
    try {
      // Mock data for development
      setJobs([{ id: 1, type: 'transform', status: 'running', asset: 'demo.wav' }]);
      setAssets([{ id: 1, name: 'demo.wav', type: 'audio', status: 'ready' }]);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleViewChange = (view: string) => {
    setActiveView(view);
  };

  const renderActiveView = () => {
    switch (activeView) {
      case 'overview':
        return (
          <div className="overview-view">
            <h2>Project Overview</h2>
            <div className="project-stats">
              <div className="stat-card">
                <h3>Active Jobs</h3>
                <p className="stat-value">{jobs.filter((j) => j.status === 'running').length}</p>
              </div>
              <div className="stat-card">
                <h3>Ready Assets</h3>
                <p className="stat-value">{assets.filter((a) => a.status === 'ready').length}</p>
              </div>
              <div className="stat-card">
                <h3>Project Status</h3>
                <p className="stat-value">Active</p>
              </div>
            </div>
            <JobManager />
          </div>
        );
      case 'assets':
        return (
          <div className="assets-view">
            <h2>Assets</h2>
            <SmartSearch onSelect={(result) => console.log('Selected:', result)} />
            <div className="asset-grid">
              {assets.map((asset) => (
                <div key={asset.id} className="asset-card">
                  <h3>{asset.name}</h3>
                  <p>Type: {asset.type}</p>
                  <p>Status: {asset.status}</p>
                </div>
              ))}
            </div>
          </div>
        );
      case 'create':
        return (
          <div className="create-view">
            <h2>Create</h2>
            <BatchUploader onUploadComplete={(files) => { console.log('Uploaded:', files); fetchDashboardData(); }} />
          </div>
        );
      case 'transform':
        return (
          <div className="transform-view">
            <h2>Transform</h2>
            <QualityPresets onPresetChange={(preset, config) => console.log('Preset:', preset, config)} />
            <AudioVisualization type="spectrum" />
          </div>
        );
      case 'review':
        return (
          <div className="review-view">
            <h2>Review</h2>
            <ProcessingReport />
          </div>
        );
      case 'deliver':
        return (
          <div className="deliver-view">
            <h2>Deliver</h2>
            <PlatformExports onStartExport={(configs) => console.log('Export:', configs)} />
            <DeliveryManager onCreateDelivery={(config) => console.log('Delivery:', config)} />
          </div>
        );
      case 'history':
        return (
          <div className="history-view">
            <h2>History</h2>
            <DeliveryTracking deliveryId="demo-delivery-1" />
          </div>
        );
      default:
        return (
          <div className="overview-view">
            <h2>Project Overview</h2>
            <JobManager />
          </div>
        );
    }
  };

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="dashboard-title">
          <h1>StudioOS Dashboard One</h1>
          <span className="user-role">Standard User</span>
        </div>
        <button onClick={onLogout} className="logout-btn">
          Logout
        </button>
      </div>

      <nav className="dashboard-nav">
        {['overview', 'assets', 'create', 'transform', 'review', 'deliver', 'history'].map((view) => (
          <button
            key={view}
            className={`nav-btn ${activeView === view ? 'active' : ''}`}
            onClick={() => handleViewChange(view)}
          >
            {view.charAt(0).toUpperCase() + view.slice(1)}
          </button>
        ))}
      </nav>

      <div className="dashboard-content">
        {error && (
          <div className="error-banner">
            <p>{error}</p>
            <button onClick={() => setError('')}>×</button>
          </div>
        )}

        {loading ? (
          <div className="loading-spinner">
            <p>Loading dashboard...</p>
          </div>
        ) : (
          renderActiveView()
        )}
      </div>
    </div>
  );
}