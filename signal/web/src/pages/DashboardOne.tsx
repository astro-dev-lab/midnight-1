/**
 * ============================================================================
 * STUDIOOS DASHBOARD ONE — Artist/Creator Workspace
 * ============================================================================
 * 
 * PHASE 1: Information Architecture
 * ---------------------------------
 * 
 * PRIMARY PERSONA: Independent Rap Artist
 * - Low patience for complexity
 * - Cares about "is it ready?"
 * - Wants confidence, not control
 * 
 * SECONDARY PERSONA: Producer/Engineer (limited use)
 * - Process visibility when needed
 * - Before/after comparison
 * - Repeatability
 * 
 * DASHBOARD PURPOSE:
 * End-to-end workflow from asset ingestion to delivery.
 * Focus on STATUS, PROGRESS, and COMPLETION — not technical parameters.
 * 
 * VIEW HIERARCHY (7 Views):
 * 
 * 1. OVERVIEW    → "What's the status of my project?"
 *    Components: JobManager (summary mode)
 *    Persona: Artist
 * 
 * 2. ASSETS      → "What files do I have?"
 *    Components: SmartSearch, MetadataEditor
 *    Persona: Artist/Producer
 * 
 * 3. CREATE      → "How do I add new files?"
 *    Components: BatchUploader
 *    Persona: Artist
 * 
 * 4. TRANSFORM   → "What processing do I want?"
 *    Components: QualityPresets, AudioVisualization
 *    Persona: Producer
 * 
 * 5. REVIEW      → "What did the system do to my audio?"
 *    Components: ProcessingReport, AudioComparison
 *    Persona: Producer
 * 
 * 6. DELIVER     → "How do I get my files to platforms?"
 *    Components: PlatformExports, DeliveryManager
 *    Persona: Artist
 * 
 * 7. HISTORY     → "What happened and when?"
 *    Components: DeliveryTracking
 *    Persona: Artist/Producer
 * 
 * ============================================================================
 * 
 * PHASE 2: View Design (Embedded in View Components)
 * 
 * ============================================================================
 */

import { useState, useEffect } from 'react';
import {
  BatchUploader,
  QualityPresets,
  ProcessingReport,
  JobManager,
  SmartSearch,
  PlatformExports,
  DeliveryManager,
  DeliveryTracking,
  AudioVisualization,
  MetadataEditor,
  AudioComparison,
} from '../components/core';
import './DashboardOne.css';

// ============================================================================
// Types
// ============================================================================

type View = 'overview' | 'assets' | 'create' | 'transform' | 'review' | 'deliver' | 'history';

interface DashboardOneProps {
  onLogout: () => void;
  userRole?: 'basic' | 'standard' | 'advanced';
}

interface Asset {
  id: string;
  name: string;
  url?: string;
  category: 'RAW' | 'DERIVED' | 'FINAL';
  metadata?: {
    title?: string;
    artist?: string;
    album?: string;
    isrc?: string;
    bpm?: number;
    key?: string;
    genre?: string;
    tags?: string;
    notes?: string;
    copyright?: string;
  };
}

// ============================================================================
// Main Dashboard Component
// ============================================================================

export function DashboardOne({ onLogout, userRole = 'standard' }: DashboardOneProps) {
  const [activeView, setActiveView] = useState<View>('overview');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

  // Mock assets for demo
  const [assets, setAssets] = useState<Asset[]>([
    {
      id: 'asset_001',
      name: 'summer_nights_final.wav',
      url: '/audio/demo.wav',
      category: 'RAW',
      metadata: {
        title: 'Summer Nights',
        artist: 'Demo Artist',
        genre: 'Hip Hop',
      },
    },
  ]);

  const handleAssetSelect = (result: { id: string; title: string }) => {
    const asset = assets.find((a) => a.id === result.id);
    if (asset) {
      setSelectedAsset(asset);
    }
  };

  return (
    <div className="dashboard-one">
      {/* ================================================================
          HEADER
          Purpose: Identify workspace, show user context, provide logout
          ================================================================ */}
      <header className="dashboard-header">
        <div className="dashboard-identity">
          <h1 className="dashboard-title">StudioOS</h1>
          <span className="dashboard-context">Production Workspace</span>
        </div>
        <div className="dashboard-user">
          <span className="user-role-badge">{userRole.toUpperCase()}</span>
          <button onClick={onLogout} className="btn-logout">
            Logout
          </button>
        </div>
      </header>

      {/* ================================================================
          NAVIGATION
          7 views matching StudioOS canonical architecture
          ================================================================ */}
      <nav className="dashboard-nav">
        {(['overview', 'assets', 'create', 'transform', 'review', 'deliver', 'history'] as View[]).map((view) => (
          <button
            key={view}
            className={`nav-item ${activeView === view ? 'active' : ''}`}
            onClick={() => setActiveView(view)}
          >
            <span className="nav-icon">{getViewIcon(view)}</span>
            <span className="nav-label">{view.charAt(0).toUpperCase() + view.slice(1)}</span>
          </button>
        ))}
      </nav>

      {/* ================================================================
          MAIN CONTENT
          Renders active view with appropriate components
          ================================================================ */}
      <main className="dashboard-main">
        <ViewRouter
          view={activeView}
          userRole={userRole}
          assets={assets}
          selectedAsset={selectedAsset}
          onAssetSelect={handleAssetSelect}
          onAssetUpdate={(updated) => {
            setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
            setSelectedAsset(updated);
          }}
          onNavigate={setActiveView}
          onUploadComplete={(files) => {
            const newAssets: Asset[] = files.map((f: { id: string; name: string }) => ({
              id: f.id,
              name: f.name,
              category: 'RAW' as const,
              metadata: {},
            }));
            setAssets((prev) => [...prev, ...newAssets]);
          }}
        />
      </main>
    </div>
  );
}

// ============================================================================
// View Router
// ============================================================================

interface ViewRouterProps {
  view: View;
  userRole: 'basic' | 'standard' | 'advanced';
  assets: Asset[];
  selectedAsset: Asset | null;
  onAssetSelect: (result: { id: string; title: string }) => void;
  onAssetUpdate: (asset: Asset) => void;
  onNavigate: (view: View) => void;
}

function ViewRouter({
  view,
  userRole,
  assets,
  selectedAsset,
  onAssetSelect,
  onAssetUpdate,
  onNavigate,
}: ViewRouterProps) {
  switch (view) {
    case 'overview':
      return <OverviewView onNavigate={onNavigate} />;
    case 'assets':
      return (
        <AssetsView
          assets={assets}
          selectedAsset={selectedAsset}
          onAssetSelect={onAssetSelect}
          onAssetUpdate={onAssetUpdate}
        />
      );
    case 'create':
      return <CreateView onNavigate={onNavigate} />;
    case 'transform':
      return <TransformView userRole={userRole} />;
    case 'review':
      return <ReviewView selectedAsset={selectedAsset} />;
    case 'deliver':
      return <DeliverView assets={assets} />;
    case 'history':
      return <HistoryView />;
    default:
      return <OverviewView onNavigate={onNavigate} />;
  }
}

// ============================================================================
// OVERVIEW VIEW
// ============================================================================
/**
 * PHASE 2 Design:
 * 
 * PRIMARY QUESTION: "What's the status of my project?"
 * 
 * SUCCESS CONDITION: User understands project state in < 5 seconds
 * 
 * PERSONA: Independent Rap Artist
 * - Wants immediate clarity on what's done, what's running, what needs attention
 * - No desire to dig into details unless something is wrong
 * 
 * COMPONENT MAPPING:
 * - JobManager: Shows active/queued/failed jobs
 *   Justification: Answers "is anything running?" and "did anything fail?"
 * 
 * WHAT THIS VIEW IS NOT:
 * - Not a detailed job configuration screen
 * - Not a place to edit parameters
 */

interface OverviewViewProps {
  onNavigate: (view: View) => void;
}

function OverviewView({ onNavigate }: OverviewViewProps) {
  return (
    <div className="view view-overview">
      <header className="view-header">
        <h2 className="view-title">Project Overview</h2>
        <p className="view-subtitle">Current status of your production workspace</p>
      </header>

      {/* Quick Actions — for Artist who wants fast paths */}
      <section className="quick-actions">
        <button className="action-card" onClick={() => onNavigate('create')}>
          <span className="action-icon">📁</span>
          <span className="action-label">Upload Assets</span>
        </button>
        <button className="action-card" onClick={() => onNavigate('transform')}>
          <span className="action-icon">⚙️</span>
          <span className="action-label">Start Processing</span>
        </button>
        <button className="action-card" onClick={() => onNavigate('deliver')}>
          <span className="action-icon">📤</span>
          <span className="action-label">Prepare Delivery</span>
        </button>
      </section>

      {/* Job Status — answers "is anything running/failed?" */}
      <section className="job-status-section">
        <h3 className="section-title">Job Activity</h3>
        <JobManager />
      </section>
    </div>
  );
}

// ============================================================================
// ASSETS VIEW
// ============================================================================
/**
 * PHASE 2 Design:
 * 
 * PRIMARY QUESTION: "What files do I have and what's their status?"
 * 
 * SUCCESS CONDITION: User can find and inspect any asset in < 10 seconds
 * 
 * PERSONA: Artist/Producer hybrid
 * - Artist: "Do I have everything uploaded?"
 * - Producer: "What metadata is attached? Is ISRC set?"
 * 
 * COMPONENT MAPPING:
 * - SmartSearch: Find assets by name, metadata, or type
 *   Justification: Large projects need search; small projects can scroll
 * - MetadataEditor: View/edit asset metadata
 *   Justification: Producer needs to verify metadata before delivery
 */

interface AssetsViewProps {
  assets: Asset[];
  selectedAsset: Asset | null;
  onAssetSelect: (result: { id: string; title: string }) => void;
  onAssetUpdate: (asset: Asset) => void;
}

function AssetsView({ assets, selectedAsset, onAssetSelect, onAssetUpdate }: AssetsViewProps) {
  return (
    <div className="view view-assets">
      <header className="view-header">
        <h2 className="view-title">Assets</h2>
        <p className="view-subtitle">Browse and manage your audio files</p>
      </header>

      <div className="assets-layout">
        {/* Search Panel */}
        <section className="assets-search">
          <SmartSearch
            onSelect={(result) => onAssetSelect({ id: result.id, title: result.title })}
            placeholder="Search assets by name, artist, or metadata..."
          />
        </section>

        {/* Asset List */}
        <section className="assets-list">
          <h3 className="section-title">All Assets ({assets.length})</h3>
          <div className="asset-grid">
            {assets.map((asset) => (
              <button
                key={asset.id}
                className={`asset-card ${selectedAsset?.id === asset.id ? 'selected' : ''}`}
                onClick={() => onAssetSelect({ id: asset.id, title: asset.name })}
              >
                <span className="asset-icon">🎵</span>
                <span className="asset-name">{asset.name}</span>
                <span className={`asset-category category-${asset.category.toLowerCase()}`}>
                  {asset.category}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Metadata Panel */}
        {selectedAsset && (
          <section className="assets-metadata">
            <h3 className="section-title">Metadata</h3>
            <MetadataEditor
              asset={{
                id: selectedAsset.id,
                name: selectedAsset.name,
                metadata: selectedAsset.metadata || {},
              }}
              onUpdate={async (metadata) => {
                onAssetUpdate({ ...selectedAsset, metadata });
              }}
              onCancel={() => {}}
            />
          </section>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// CREATE VIEW
// ============================================================================
/**
 * PHASE 2 Design:
 * 
 * PRIMARY QUESTION: "How do I add new files to my project?"
 * 
 * SUCCESS CONDITION: User uploads files and sees confirmation in < 30 seconds
 * 
 * PERSONA: Independent Rap Artist
 * - Wants drag-and-drop simplicity
 * - Needs clear progress indication
 * - Wants batch upload for albums/EPs
 * 
 * COMPONENT MAPPING:
 * - BatchUploader: Multi-file drag-drop with progress
 *   Justification: Only component needed; does one thing well
 */

interface CreateViewProps {
  onNavigate: (view: View) => void;
}

function CreateView({ onNavigate }: CreateViewProps) {
  return (
    <div className="view view-create">
      <header className="view-header">
        <h2 className="view-title">Upload Assets</h2>
        <p className="view-subtitle">Add audio files to your project for processing</p>
      </header>

      <section className="upload-section">
        <BatchUploader
          onUploadComplete={() => {
            // Navigate to assets after successful upload
            setTimeout(() => onNavigate('assets'), 1500);
          }}
          maxFileSize={200 * 1024 * 1024}
          acceptedFormats={['.wav', '.mp3', '.aiff', '.flac']}
          maxFiles={50}
        />
      </section>
    </div>
  );
}

// ============================================================================
// TRANSFORM VIEW
// ============================================================================
/**
 * PHASE 2 Design:
 * 
 * PRIMARY QUESTION: "What processing should be applied to my audio?"
 * 
 * SUCCESS CONDITION: User selects a preset and submits job confidently
 * 
 * PERSONA: Producer/Engineer
 * - Needs to understand what each preset does
 * - Wants to see current audio characteristics
 * - Advanced users want parameter access
 * 
 * COMPONENT MAPPING:
 * - QualityPresets: Select processing configuration
 *   Justification: Core transform selection; role-gated access to custom mode
 * - AudioVisualization: Show current audio state
 *   Justification: Producer needs visual reference before processing
 * 
 * RBAC ENFORCEMENT:
 * - Basic: Preset only (custom disabled)
 * - Standard: Bounded parameters
 * - Advanced: Full parameter access
 */

interface TransformViewProps {
  userRole: 'basic' | 'standard' | 'advanced';
}

function TransformView({ userRole }: TransformViewProps) {
  const [selectedPreset, setSelectedPreset] = useState<string | undefined>(undefined);

  // RBAC: Basic users cannot access custom mode
  const allowCustom = userRole !== 'basic';

  return (
    <div className="view view-transform">
      <header className="view-header">
        <h2 className="view-title">Transform</h2>
        <p className="view-subtitle">Configure processing parameters for your assets</p>
      </header>

      <div className="transform-layout">
        {/* Visualization — shows current audio state */}
        <section className="transform-visualization">
          <h3 className="section-title">Audio Analysis</h3>
          <div className="visualization-grid">
            <div className="viz-panel">
              <AudioVisualization type="spectrum" height={150} showLabels />
            </div>
            <div className="viz-panel">
              <AudioVisualization type="levels" height={150} showLabels />
            </div>
          </div>
        </section>

        {/* Preset Selection */}
        <section className="transform-presets">
          <h3 className="section-title">Processing Preset</h3>
          <QualityPresets
            selectedPreset={selectedPreset}
            onPresetChange={(preset) => setSelectedPreset(preset)}
            disabled={false}
          />
          {!allowCustom && (
            <p className="role-notice">
              Custom parameters require Standard or Advanced role.
            </p>
          )}
        </section>

        {/* Submit Action */}
        <section className="transform-submit">
          <button
            className="btn-primary btn-submit-job"
            disabled={!selectedPreset}
          >
            Submit Processing Job
          </button>
        </section>
      </div>
    </div>
  );
}

// ============================================================================
// REVIEW VIEW
// ============================================================================
/**
 * PHASE 2 Design:
 * 
 * PRIMARY QUESTION: "What did the system do to my audio?"
 * 
 * SUCCESS CONDITION: User understands processing steps and can compare before/after
 * 
 * PERSONA: Producer/Engineer
 * - Needs transparency (Glass Box principle)
 * - Wants to hear before/after
 * - Needs confidence scores and metrics
 * 
 * COMPONENT MAPPING:
 * - ProcessingReport: Step-by-step processing breakdown
 *   Justification: Core transparency component; shows what happened
 * - AudioComparison: A/B comparison of input vs output
 *   Justification: Producer needs to verify processing result
 * 
 * FORBIDDEN:
 * - No DAW-style controls
 * - No "tweak" or "adjust" actions
 * - No speculative explanations
 */

interface ReviewViewProps {
  selectedAsset: Asset | null;
}

function ReviewView({ selectedAsset }: ReviewViewProps) {
  return (
    <div className="view view-review">
      <header className="view-header">
        <h2 className="view-title">Review</h2>
        <p className="view-subtitle">Inspect processing results and compare outputs</p>
      </header>

      <div className="review-layout">
        {/* Processing Report */}
        <section className="review-report">
          <h3 className="section-title">Processing Report</h3>
          <ProcessingReport isLive={false} />
        </section>

        {/* Audio Comparison */}
        <section className="review-comparison">
          <h3 className="section-title">Before / After Comparison</h3>
          {selectedAsset ? (
            <AudioComparison
              inputAsset={selectedAsset.parent || null}
              outputAsset={selectedAsset}
            />
          ) : (
            <div className="empty-state">
              <p>Select an asset from the Assets view to compare.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ============================================================================
// DELIVER VIEW
// ============================================================================
/**
 * PHASE 2 Design:
 * 
 * PRIMARY QUESTION: "How do I get my finished files to streaming platforms?"
 * 
 * SUCCESS CONDITION: User configures and initiates delivery with confidence
 * 
 * PERSONA: Independent Rap Artist
 * - Wants to reach Spotify, Apple Music, etc.
 * - Needs simple platform selection
 * - Wants to see what's required (metadata, format)
 * 
 * COMPONENT MAPPING:
 * - PlatformExports: Configure export settings per platform
 *   Justification: Core delivery configuration; shows requirements
 * - DeliveryManager: Track active deliveries
 *   Justification: Shows what's in progress/completed
 */

interface DeliverViewProps {
  assets: Asset[];
}

function DeliverView({ assets }: DeliverViewProps) {
  const finalAssets = assets.filter((a) => a.category === 'FINAL');
  const selectedAssetIds = finalAssets.map((a) => a.id);

  return (
    <div className="view view-deliver">
      <header className="view-header">
        <h2 className="view-title">Deliver</h2>
        <p className="view-subtitle">Distribute your finished assets to platforms</p>
      </header>

      <div className="deliver-layout">
        {/* Platform Configuration */}
        <section className="deliver-platforms">
          <h3 className="section-title">Platform Distribution</h3>
          <PlatformExports
            selectedAssets={selectedAssetIds}
            onStartExport={(configs) => {
              console.log('Starting export with configs:', configs);
            }}
          />
        </section>

        {/* Active Deliveries */}
        <section className="deliver-manager">
          <h3 className="section-title">Delivery Status</h3>
          <DeliveryManager
            onCreateDelivery={(config) => {
              console.log('Creating delivery:', config);
            }}
          />
        </section>
      </div>
    </div>
  );
}

// ============================================================================
// HISTORY VIEW
// ============================================================================
/**
 * PHASE 2 Design:
 * 
 * PRIMARY QUESTION: "What happened and when?"
 * 
 * SUCCESS CONDITION: User can trace any delivery from start to completion
 * 
 * PERSONA: Artist/Producer hybrid
 * - Artist: "Did my release go live?"
 * - Producer: "What was the timeline? Any issues?"
 * 
 * COMPONENT MAPPING:
 * - DeliveryTracking: Detailed delivery timeline and status
 *   Justification: Single-delivery deep dive; shows platform-by-platform status
 */

function HistoryView() {
  const [selectedDeliveryId] = useState('demo-delivery-001');

  return (
    <div className="view view-history">
      <header className="view-header">
        <h2 className="view-title">History</h2>
        <p className="view-subtitle">Track delivery progress and view past activity</p>
      </header>

      <section className="history-tracking">
        <DeliveryTracking
          deliveryId={selectedDeliveryId}
          realTimeUpdates={true}
          onStatusChange={(status) => {
            console.log('Delivery status changed:', status);
          }}
        />
      </section>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function getViewIcon(view: View): string {
  const icons: Record<View, string> = {
    overview: '📊',
    assets: '🎵',
    create: '📁',
    transform: '⚙️',
    review: '🔍',
    deliver: '📤',
    history: '📋',
  };
  return icons[view];
}

export default DashboardOne;
