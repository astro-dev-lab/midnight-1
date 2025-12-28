/**
 * StudioOS Dashboard Types
 * 
 * Type definitions aligned with STUDIOOS_FUNCTIONAL_SPECS.md
 */

// ============================================================================
// Entity Types
// ============================================================================

export interface User {
  id: number;
  email: string;
  internalRole?: 'BASIC' | 'STANDARD' | 'ADVANCED';
  externalRole?: 'VIEWER' | 'APPROVER';
}

export interface Project {
  id: number;
  name: string;
  state: 'DRAFT' | 'PROCESSING' | 'READY' | 'DELIVERED';
  createdAt: string;
  updatedAt: string;
  ownerId: number;
  _count?: {
    assets: number;
    jobs: number;
  };
}

export interface Asset {
  id: number;
  name: string;
  category: 'RAW' | 'DERIVED' | 'FINAL';
  fileKey: string;
  mimeType: string;
  sizeBytes: string;
  format?: string;
  parentId?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  projectId: number;
  outputJobId?: number;
  lineage?: Array<{
    id: number;
    name: string;
    category: string;
  }>;
}

export interface Job {
  id: number;
  state: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  preset: string;
  parameters?: Record<string, unknown>;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  createdById: number;
  projectId: number;
  errorCategory?: 'INGESTION' | 'PROCESSING' | 'OUTPUT' | 'DELIVERY' | 'SYSTEM';
  errorMessage?: string;
  inputs?: JobInput[];
  outputs?: Asset[];
  reports?: Report[];
}

export interface JobInput {
  id: number;
  jobId: number;
  assetId: number;
  asset?: Asset;
}

export interface Report {
  id: number;
  type: 'ANALYSIS' | 'MIXING' | 'EDITING' | 'MASTERING' | 'CONVERSION' | 'DELIVERY';
  summary: string;
  changesApplied: string;
  rationale: string;
  impactAssessment: string;
  confidence: string;
  limitations?: string;
  createdAt: string;
  jobId: number;
}

export interface Approval {
  id: number;
  decision: 'APPROVED' | 'REJECTED';
  comment?: string;
  createdAt: string;
  userId: number;
  assetId: number;
  user?: { id: number; email: string };
  asset?: Asset;
}

export interface Delivery {
  id: number;
  destination: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  startedAt: string;
  completedAt?: string;
  projectId: number;
  assets?: Asset[];
}

// ============================================================================
// Role Types
// ============================================================================

export type InternalRole = 'BASIC' | 'STANDARD' | 'ADVANCED';
export type ExternalRole = 'VIEWER' | 'APPROVER';

// ============================================================================
// Dashboard View Types
// ============================================================================

/**
 * Dashboard One Views (Internal Users)
 * Per STUDIOOS_FUNCTIONAL_SPECS.md Section 4
 */
export type DashboardOneView = 
  | 'overview'
  | 'assets'
  | 'create'
  | 'transform'
  | 'review'
  | 'deliver'
  | 'history';

/**
 * Dashboard Two Views (External Users)
 * Per STUDIOOS_DASHBOARD_TWO_FUNCTIONAL_SPECS.md
 */
export type DashboardTwoView =
  | 'projects'
  | 'deliverables'
  | 'review-approvals'
  | 'versions'
  | 'account';

// ============================================================================
// API Response Types
// ============================================================================

export interface ListResponse<T> {
  data: T[];
  count: number;
}

export interface ErrorResponse {
  error: string;
  category?: string;
  [key: string]: unknown;
}

// ============================================================================
// Form Types
// ============================================================================

export interface CreateProjectPayload {
  name: string;
}

export interface CreateAssetPayload {
  projectId: number;
  name: string;
  fileKey: string;
  mimeType: string;
  sizeBytes: number;
  metadata?: Record<string, unknown>;
}

export interface CreateJobPayload {
  projectId: number;
  preset: string;
  parameters?: Record<string, unknown>;
  inputAssetIds: number[];
}

export interface CreateDeliveryPayload {
  projectId: number;
  destination: string;
  assetIds?: number[];
}

export interface ApprovalPayload {
  comment?: string;
}
