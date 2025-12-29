/**
 * StudioOS API Types
 * 
 * TypeScript interfaces matching the Prisma schema and API responses.
 * Following StudioOS approved terminology only.
 */

// =============================================================================
// Enums - Canonical States & Roles
// =============================================================================

/** Internal roles (Dashboard One) */
export type InternalRole = 'BASIC' | 'STANDARD' | 'ADVANCED';

/** External roles (Dashboard Two - Client Portal) */
export type ExternalRole = 'VIEWER' | 'APPROVER';

/** Project states: Draft → Processing → Ready → Delivered */
export type ProjectState = 'DRAFT' | 'PROCESSING' | 'READY' | 'DELIVERED';

/** Asset categories: Raw → Derived → Final */
export type AssetCategory = 'RAW' | 'DERIVED' | 'FINAL';

/** Job states: Queued → Running → Completed | Failed */
export type JobState = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

/** Report types (closed set per STUDIOOS_TRANSPARENCY_CHARTER.md) */
export type ReportType = 'ANALYSIS' | 'MIXING' | 'EDITING' | 'MASTERING' | 'CONVERSION' | 'DELIVERY';

/** Error categories (closed set per STUDIOOS_ERROR_RECOVERY_PLAYBOOK.md) */
export type ErrorCategory = 'INGESTION' | 'PROCESSING' | 'OUTPUT' | 'DELIVERY' | 'SYSTEM';

/** Preset categories for job transformation */
export type PresetCategory = 'ANALYSIS' | 'MASTERING' | 'MIXING' | 'EDITING' | 'CONVERSION';

// =============================================================================
// Users
// =============================================================================

export interface User {
  id: number;
  email: string;
  internalRole?: InternalRole;
  externalRole?: ExternalRole;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: number;
    email: string;
    internalRole?: InternalRole;
    externalRole?: ExternalRole;
  };
}

// =============================================================================
// Projects
// =============================================================================

export interface Project {
  id: number;
  name: string;
  state: ProjectState;
  createdAt: string;
  updatedAt: string;
  ownerId: number;
  _count?: {
    assets: number;
    jobs: number;
  };
  assets?: Asset[];
  jobs?: Job[];
  deliveries?: Delivery[];
}

export interface CreateProjectPayload {
  name: string;
}

export interface UpdateProjectPayload {
  name?: string;
  state?: ProjectState;
}

// =============================================================================
// Assets
// =============================================================================

export interface Asset {
  id: number;
  name: string;
  category: AssetCategory;
  fileKey: string;
  mimeType: string;
  sizeBytes: string | number; // BigInt serialized as string
  parentId?: number;
  parent?: Asset;
  derivatives?: Asset[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  projectId: number;
  outputJobId?: number;
  approvals?: Approval[];
}

export interface CreateAssetPayload {
  name: string;
  fileKey: string;
  mimeType: string;
  sizeBytes: number;
  category?: AssetCategory;
  parentId?: number;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Jobs
// =============================================================================

export interface JobInput {
  id: number;
  jobId: number;
  assetId: number;
  asset?: Asset;
}

export interface Job {
  id: number;
  state: JobState;
  preset: string;
  parameters?: Record<string, unknown>;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  createdById: number;
  createdBy?: { id: number; email: string };
  projectId: number;
  inputs?: JobInput[];
  outputs?: Asset[];
  report?: Report;
  errorCategory?: ErrorCategory;
  errorMessage?: string;
  _count?: {
    inputs: number;
    outputs: number;
  };
}

export interface CreateJobPayload {
  projectId: number;
  preset: string;
  assetIds: number[];
  parameters?: Record<string, unknown>;
}

export interface RerunJobPayload {
  originalJobId: number;
  parameters?: Record<string, unknown>;
}

// =============================================================================
// Reports - Processing transparency
// =============================================================================

export interface Report {
  id: number;
  type: ReportType;
  summary: string;
  changesApplied: string;
  rationale: string;
  impactAssessment: string;
  confidence: string;
  limitations?: string;
  createdAt: string;
  jobId: number;
}

export interface FormattedReport {
  summary: string;
  sections: ReportSection[];
  confidence: number;
  lineage?: string[];
}

export interface ReportSection {
  title: string;
  content: string | Record<string, unknown>;
}

// =============================================================================
// Deliveries
// =============================================================================

export interface Delivery {
  id: number;
  destination: string;
  status: 'pending' | 'completed' | 'failed';
  projectId: number;
  createdAt: string;
  completedAt?: string;
  assets?: DeliveryAsset[];
}

export interface DeliveryAsset {
  id: number;
  deliveryId: number;
  assetId: number;
  asset?: Asset;
}

export interface CreateDeliveryPayload {
  projectId: number;
  destination: string;
  assetIds?: number[];
}

// =============================================================================
// Approvals
// =============================================================================

export interface Approval {
  id: number;
  approved: boolean;
  comments?: string;
  createdAt: string;
  assetId: number;
  userId: number;
  user?: { id: number; email: string };
}

export interface CreateApprovalPayload {
  approved: boolean;
  comments?: string;
}

// =============================================================================
// Presets
// =============================================================================

export interface Preset {
  id: string;
  name: string;
  category: PresetCategory;
  description: string;
  parameters: PresetParameter[];
  requiredRole: InternalRole;
}

export interface PresetParameter {
  name: string;
  type: 'number' | 'string' | 'boolean' | 'select';
  default: unknown;
  min?: number;
  max?: number;
  options?: string[];
  description?: string;
}

// =============================================================================
// Job Progress (SSE Events)
// =============================================================================

export interface JobProgressEvent {
  type: 'job:started' | 'job:analyzing' | 'job:analysis_complete' | 'job:transforming' | 
        'job:progress' | 'job:finalizing' | 'job:completed' | 'job:failed';
  jobId: number;
  phase?: string;
  progress?: number;
  message?: string;
  metrics?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  timestamp: string;
}

// =============================================================================
// API Response Wrappers
// =============================================================================

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  total?: number;
  offset?: number;
  limit?: number;
}

export interface ApiError {
  error: string;
  category?: ErrorCategory;
  recoveryActions?: string[];
}

// =============================================================================
// Audio Analysis
// =============================================================================

export interface AudioAnalysisResult {
  filename: string;
  duration: number;
  bitrate: number;
  sampleRate: number;
  channels: number;
  loudness: number;
  truePeak: number;
  lra: number;
  spectrum?: SpectrumData;
  stereoWidth?: number;
  phaseCorrelation?: number;
  problems?: AudioProblem[];
  timestamp: string;
}

export interface SpectrumData {
  frequencies: number[];
  magnitudes: number[];
  peaks?: { frequency: number; magnitude: number }[];
}

export interface AudioProblem {
  type: 'clipping' | 'dc_offset' | 'low_end_buildup' | 'phase_issues' | 'silence';
  severity: 'low' | 'medium' | 'high';
  description: string;
  timestamp?: number;
}

// =============================================================================
// Search
// =============================================================================

export interface SearchRequest {
  query: string;
  filters?: SearchFilter[];
  maxResults?: number;
  fuzzy?: boolean;
  facets?: boolean;
}

export interface SearchFilter {
  field: string;
  operator: 'equals' | 'contains' | 'greaterThan' | 'lessThan' | 'between';
  value: unknown;
}

export interface SearchResponse {
  query: string;
  total: number;
  maxResults: number;
  results: SearchResult[];
  facets?: SearchFacets;
  searchTime: number;
}

export interface SearchResult {
  id: string;
  type: 'asset' | 'project' | 'job';
  title: string;
  description: string;
  metadata: Record<string, unknown>;
  score: number;
  highlights?: string[];
}

export interface SearchFacets {
  types: { value: string; count: number }[];
  genres?: { value: string; count: number }[];
  years?: { value: number; count: number }[];
}

// =============================================================================
// Platform Exports
// =============================================================================

export interface ExportConfig {
  platformId: string;
  format: string;
  bitDepth: number;
  sampleRate: number;
  loudnessTarget: number;
  metadata: Record<string, string>;
  enabled: boolean;
}

export interface ExportValidationRequest {
  platformId: string;
  assetId: number;
  format: string;
  bitDepth: number;
  sampleRate: number;
  loudnessTarget: number;
}

export interface ExportValidationResult {
  platformId: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
}
