/**
 * StudioOS API Module
 * 
 * Exports all API types, clients, and utilities for the StudioOS frontend.
 */

// Types
export * from './types';

// HTTP Client - New StudioOS client
export { studioOS } from './client';

// Legacy API client (for old pages like Login, Dashboard)
export { api } from './legacy';
export type { 
  RegisterPayload, 
  LoginPayload, 
  AuthResponse, 
  Ping, 
  CreatePingPayload, 
  UpdatePingPayload 
} from './legacy';

// SSE Events
export { subscribeToJobEvents, JobEventsClient, jobEvents } from './events';

// React Hooks
export {
  useProjects,
  useProject,
  useAssets,
  useAsset,
  useAssetLineage,
  useJobs,
  useJob,
  usePresets,
  useSubmitJob,
  useJobProgress,
  useAuth,
} from './hooks';
