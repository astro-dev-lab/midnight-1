/**
 * ============================================================================
 * STUDIOOS DASHBOARD TWO — Operations / Reviewer Workspace
 * ============================================================================
 * 
 * PHASE 1: Information Architecture
 * ---------------------------------
 * 
 * PRIMARY PERSONA: Operations / Internal Reviewer
 * - Cares about throughput, failures, retries
 * - Needs monitoring and auditability
 * - Focused on approval/rejection workflows
 * 
 * DASHBOARD PURPOSE:
 * Approval and quality control for finalized outputs.
 * Focus on REVIEW, APPROVE/REJECT, and AUDIT — not creation or configuration.
 * 
 * VIEW HIERARCHY (5 Views):
 * 
 * 1. QUEUE      → "What needs my attention?"
 *    Components: JobManager (filtered to pending review)
 *    Persona: Approver
 * 
 * 2. REVIEW     → "What does this output look like?"
 *    Components: ProcessingReport, AudioComparison, AudioVisualization
 *    Persona: Approver
 * 
 * 3. SEARCH     → "Find specific assets or jobs"
 *    Components: SmartSearch
 *    Persona: Viewer/Approver
 * 
 * 4. DELIVERIES → "What's been sent out?"
 *    Components: DeliveryManager, DeliveryTracking
 *    Persona: Approver
 * 
 * 5. AUDIT      → "What's the full history?"
 *    Components: JobManager (full history mode)
 *    Persona: Approver
 * 
 * RBAC:
 * - Viewer: Can view, cannot approve/reject/download
 * - Approver: Full access to approve, reject, download
 * 
 * ============================================================================
 */

import { useState } from 'react';
import {
  ProcessingReport,
  JobManager,
  SmartSearch,
  DeliveryManager,
  DeliveryTracking,
  AudioVisualization,
  AudioComparison,
} from '../components/core';
import './DashboardTwo.css';

// ============================================================================
// Types
// ============================================================================

type View = 'queue' | 'review' | 'search' | 'deliveries' | 'audit';

interface DashboardTwoProps {
  onLogout: () => void;
  userRole?: 'viewer' | 'approver';
}

interface ReviewItem {
  id: string;
  jobId: string;
  assetName: string;
  submittedBy: string;
  submittedAt: number;
  status: 'pending' | 'approved' | 'rejected';
}

// ============================================================================
// Main Dashboard Component
// ============================================================================

export function DashboardTwo({ onLogout, userRole = 'approver' }: DashboardTwoProps) {
  const [activeView, setActiveView] = useState<View>('queue');
  const [selectedItem, setSelectedItem] = useState<ReviewItem | null>(null);

  // Mock review queue
  const [reviewQueue] = useState<ReviewItem[]>([
    {
      id: 'review_001',
      jobId: 'job_001',
      assetName: 'summer_nights_final.wav',
      submittedBy: 'artist@example.com',
      submittedAt: Date.now() - 3600000,
      status: 'pending',
    },
    {
      id: 'review_002',
      jobId: 'job_002',
      assetName: 'intro_mastered.wav',
      submittedBy: 'producer@example.com',
      submittedAt: Date.now() - 7200000,
      status: 'pending',
    },
  ]);

  const canApprove = userRole === 'approver';

  return (
    <div className="dashboard-two">
      {/* ================================================================
          HEADER
          ================================================================ */}
      <header className="dashboard-header">
        <div className="dashboard-identity">
          <h1 className="dashboard-title">StudioOS</h1>
          <span className="dashboard-context">Review Console</span>
        </div>
        <div className="dashboard-user">
          <span className={`user-role-badge role-${userRole}`}>
            {userRole.toUpperCase()}
          </span>
          <button onClick={onLogout} className="btn-logout">
            Logout
          </button>
        </div>
      </header>

      {/* ================================================================
          NAVIGATION
          5 views for operations/review workflow
          ================================================================ */}
      <nav className="dashboard-nav">
        {(['queue', 'review', 'search', 'deliveries', 'audit'] as View[]).map((view) => (
          <button
            key={view}
            className={`nav-item ${activeView === view ? 'active' : ''}`}
            onClick={() => setActiveView(view)}
          >
            <span className="nav-icon">{getViewIcon(view)}</span>
            <span className="nav-label">{getViewLabel(view)}</span>
          </button>
        ))}
      </nav>

      {/* ================================================================
          MAIN CONTENT
          ================================================================ */}
      <main className="dashboard-main">
        <ViewRouter
          view={activeView}
          userRole={userRole}
          canApprove={canApprove}
          reviewQueue={reviewQueue}
          selectedItem={selectedItem}
          onSelectItem={setSelectedItem}
          onNavigate={setActiveView}
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
  userRole: 'viewer' | 'approver';
  canApprove: boolean;
  reviewQueue: ReviewItem[];
  selectedItem: ReviewItem | null;
  onSelectItem: (item: ReviewItem | null) => void;
  onNavigate: (view: View) => void;
}

function ViewRouter({
  view,
  userRole,
  canApprove,
  reviewQueue,
  selectedItem,
  onSelectItem,
  onNavigate,
}: ViewRouterProps) {
  switch (view) {
    case 'queue':
      return (
        <QueueView
          reviewQueue={reviewQueue}
          onSelectItem={(item) => {
            onSelectItem(item);
            onNavigate('review');
          }}
        />
      );
    case 'review':
      return <ReviewView selectedItem={selectedItem} canApprove={canApprove} />;
    case 'search':
      return <SearchView />;
    case 'deliveries':
      return <DeliveriesView />;
    case 'audit':
      return <AuditView />;
    default:
      return <QueueView reviewQueue={reviewQueue} onSelectItem={onSelectItem} />;
  }
}

// ============================================================================
// QUEUE VIEW
// ============================================================================
/**
 * PHASE 2 Design:
 * 
 * PRIMARY QUESTION: "What needs my attention right now?"
 * 
 * SUCCESS CONDITION: Reviewer sees pending items and can triage in < 10 seconds
 * 
 * PERSONA: Operations / Internal Reviewer
 * - Needs to see pending queue count
 * - Wants to prioritize by age or submitter
 * - Quick access to review detail
 * 
 * COMPONENT MAPPING:
 * - Custom queue list (not JobManager) for approval-specific workflow
 *   Justification: JobManager shows job state, not approval state
 */

interface QueueViewProps {
  reviewQueue: ReviewItem[];
  onSelectItem: (item: ReviewItem) => void;
}

function QueueView({ reviewQueue, onSelectItem }: QueueViewProps) {
  const pendingItems = reviewQueue.filter((item) => item.status === 'pending');

  return (
    <div className="view view-queue">
      <header className="view-header">
        <h2 className="view-title">Review Queue</h2>
        <p className="view-subtitle">
          {pendingItems.length} item{pendingItems.length !== 1 ? 's' : ''} awaiting review
        </p>
      </header>

      {/* Queue Stats */}
      <section className="queue-stats">
        <div className="stat-card">
          <span className="stat-value">{pendingItems.length}</span>
          <span className="stat-label">Pending</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">
            {reviewQueue.filter((i) => i.status === 'approved').length}
          </span>
          <span className="stat-label">Approved Today</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">
            {reviewQueue.filter((i) => i.status === 'rejected').length}
          </span>
          <span className="stat-label">Rejected Today</span>
        </div>
      </section>

      {/* Queue List */}
      <section className="queue-list">
        <h3 className="section-title">Pending Reviews</h3>
        {pendingItems.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">✅</span>
            <p>All caught up! No items pending review.</p>
          </div>
        ) : (
          <div className="queue-items">
            {pendingItems.map((item) => (
              <button
                key={item.id}
                className="queue-item"
                onClick={() => onSelectItem(item)}
              >
                <div className="item-info">
                  <span className="item-name">{item.assetName}</span>
                  <span className="item-meta">
                    Submitted by {item.submittedBy} • {formatTimeAgo(item.submittedAt)}
                  </span>
                </div>
                <span className="item-action">Review →</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ============================================================================
// REVIEW VIEW
// ============================================================================
/**
 * PHASE 2 Design:
 * 
 * PRIMARY QUESTION: "Does this output meet quality standards?"
 * 
 * SUCCESS CONDITION: Reviewer can make approve/reject decision with confidence
 * 
 * PERSONA: Operations / Internal Reviewer
 * - Needs to see processing report
 * - Needs to hear before/after
 * - Needs visualization of output characteristics
 * - Needs clear approve/reject actions
 * 
 * COMPONENT MAPPING:
 * - ProcessingReport: What processing was applied
 * - AudioComparison: Before/after listening
 * - AudioVisualization: Output characteristics
 * 
 * RBAC:
 * - Viewer: Can see all, approve/reject buttons hidden
 * - Approver: Full access
 */

interface ReviewViewProps {
  selectedItem: ReviewItem | null;
  canApprove: boolean;
}

function ReviewView({ selectedItem, canApprove }: ReviewViewProps) {
  const [decision, setDecision] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [notes, setNotes] = useState('');

  const handleApprove = () => {
    setDecision('approved');
    console.log('Approved:', selectedItem?.id, 'Notes:', notes);
  };

  const handleReject = () => {
    setDecision('rejected');
    console.log('Rejected:', selectedItem?.id, 'Notes:', notes);
  };

  if (!selectedItem) {
    return (
      <div className="view view-review">
        <header className="view-header">
          <h2 className="view-title">Review</h2>
          <p className="view-subtitle">Select an item from the queue to review</p>
        </header>
        <div className="empty-state">
          <span className="empty-icon">🔍</span>
          <p>No item selected. Go to Queue to select an item.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="view view-review">
      <header className="view-header">
        <h2 className="view-title">Review: {selectedItem.assetName}</h2>
        <p className="view-subtitle">
          Job ID: {selectedItem.jobId} • Submitted by {selectedItem.submittedBy}
        </p>
      </header>

      <div className="review-layout">
        {/* Processing Report — what was done */}
        <section className="review-report">
          <h3 className="section-title">Processing Report</h3>
          <ProcessingReport jobId={selectedItem.jobId} isLive={false} />
        </section>

        {/* Audio Analysis — output characteristics */}
        <section className="review-analysis">
          <h3 className="section-title">Output Analysis</h3>
          <div className="analysis-grid">
            <div className="analysis-panel">
              <AudioVisualization type="spectrum" height={120} showLabels />
            </div>
            <div className="analysis-panel">
              <AudioVisualization type="levels" height={120} showLabels />
            </div>
            <div className="analysis-panel">
              <AudioVisualization type="phase" height={120} showLabels />
            </div>
          </div>
        </section>

        {/* Audio Comparison — before/after */}
        <section className="review-comparison">
          <h3 className="section-title">Before / After</h3>
          <AudioComparison
            inputAsset={{
              id: `${selectedItem.id}_input`,
              name: 'Original',
              url: '/audio/demo-input.wav',
            }}
            outputAsset={{
              id: `${selectedItem.id}_output`,
              name: 'Processed',
              url: '/audio/demo-output.wav',
            }}
          />
        </section>

        {/* Decision Panel */}
        <section className="review-decision">
          <h3 className="section-title">Decision</h3>

          {decision !== 'pending' ? (
            <div className={`decision-result decision-${decision}`}>
              <span className="decision-icon">
                {decision === 'approved' ? '✅' : '❌'}
              </span>
              <span className="decision-text">
                {decision === 'approved' ? 'Approved' : 'Rejected'}
              </span>
            </div>
          ) : (
            <>
              <div className="decision-notes">
                <label htmlFor="review-notes">Notes (optional)</label>
                <textarea
                  id="review-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes about this review..."
                  rows={3}
                />
              </div>

              {canApprove ? (
                <div className="decision-actions">
                  <button className="btn-reject" onClick={handleReject}>
                    Reject
                  </button>
                  <button className="btn-approve" onClick={handleApprove}>
                    Approve
                  </button>
                </div>
              ) : (
                <p className="role-notice">
                  You have Viewer access. Approval actions require Approver role.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

// ============================================================================
// SEARCH VIEW
// ============================================================================
/**
 * PHASE 2 Design:
 * 
 * PRIMARY QUESTION: "Where is that specific asset/job?"
 * 
 * SUCCESS CONDITION: Reviewer finds target item in < 15 seconds
 * 
 * PERSONA: Operations / Internal Reviewer
 * - Needs to search across all assets, jobs, deliveries
 * - Needs advanced filters for audit purposes
 * 
 * COMPONENT MAPPING:
 * - SmartSearch: Full search with filters
 */

function SearchView() {
  return (
    <div className="view view-search">
      <header className="view-header">
        <h2 className="view-title">Search</h2>
        <p className="view-subtitle">Find assets, jobs, and deliveries</p>
      </header>

      <section className="search-section">
        <SmartSearch
          onSelect={(result) => {
            console.log('Selected search result:', result);
          }}
          placeholder="Search by name, artist, job ID, or delivery ID..."
          maxResults={50}
        />
      </section>
    </div>
  );
}

// ============================================================================
// DELIVERIES VIEW
// ============================================================================
/**
 * PHASE 2 Design:
 * 
 * PRIMARY QUESTION: "What's been sent out and what's the status?"
 * 
 * SUCCESS CONDITION: Reviewer sees all deliveries and can drill into details
 * 
 * PERSONA: Operations / Internal Reviewer
 * - Needs to monitor delivery pipeline
 * - Needs to see failures and retry status
 * - Needs platform-by-platform breakdown
 * 
 * COMPONENT MAPPING:
 * - DeliveryManager: List of all deliveries
 * - DeliveryTracking: Detail view for selected delivery
 */

function DeliveriesView() {
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);

  return (
    <div className="view view-deliveries">
      <header className="view-header">
        <h2 className="view-title">Deliveries</h2>
        <p className="view-subtitle">Monitor platform distribution status</p>
      </header>

      <div className="deliveries-layout">
        {/* Delivery List */}
        <section className="deliveries-list">
          <h3 className="section-title">All Deliveries</h3>
          <DeliveryManager
            onCreateDelivery={(config) => {
              console.log('Create delivery:', config);
            }}
            onCancelDelivery={(id) => {
              console.log('Cancel delivery:', id);
            }}
          />
        </section>

        {/* Delivery Detail */}
        {selectedDeliveryId && (
          <section className="deliveries-detail">
            <h3 className="section-title">Delivery Detail</h3>
            <DeliveryTracking
              deliveryId={selectedDeliveryId}
              realTimeUpdates={true}
              onStatusChange={(status) => {
                console.log('Status update:', status);
              }}
            />
          </section>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// AUDIT VIEW
// ============================================================================
/**
 * PHASE 2 Design:
 * 
 * PRIMARY QUESTION: "What's the full history of system activity?"
 * 
 * SUCCESS CONDITION: Reviewer can trace any action back through time
 * 
 * PERSONA: Operations / Internal Reviewer
 * - Needs comprehensive job history
 * - Needs to filter by status, date, type
 * - Needs export capability (future)
 * 
 * COMPONENT MAPPING:
 * - JobManager: Full history mode with all filters
 */

function AuditView() {
  return (
    <div className="view view-audit">
      <header className="view-header">
        <h2 className="view-title">Audit Log</h2>
        <p className="view-subtitle">Complete history of all jobs and system activity</p>
      </header>

      <section className="audit-section">
        <JobManager />
      </section>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function getViewIcon(view: View): string {
  const icons: Record<View, string> = {
    queue: '📥',
    review: '🔍',
    search: '🔎',
    deliveries: '📤',
    audit: '📋',
  };
  return icons[view];
}

function getViewLabel(view: View): string {
  const labels: Record<View, string> = {
    queue: 'Queue',
    review: 'Review',
    search: 'Search',
    deliveries: 'Deliveries',
    audit: 'Audit',
  };
  return labels[view];
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default DashboardTwo;
