/**
 * StudioOS State Machine Utilities
 * 
 * Enforces valid state transitions per STUDIOOS_STATE_LIFECYCLE_MODELS.md:
 * - Project: DRAFT → PROCESSING → READY → DELIVERED
 * - Asset: RAW → DERIVED → FINAL
 * - Job: QUEUED → RUNNING → COMPLETED | FAILED
 * 
 * Invalid transitions are denied with explicit error messages.
 */

import type { ProjectState, AssetCategory, JobState } from './types';

// =============================================================================
// Valid Transitions
// =============================================================================

const PROJECT_TRANSITIONS: Record<ProjectState, ProjectState[]> = {
  DRAFT: ['PROCESSING'],
  PROCESSING: ['READY'],
  READY: ['DELIVERED'],
  DELIVERED: [] // Terminal state
};

const ASSET_TRANSITIONS: Record<AssetCategory, AssetCategory[]> = {
  RAW: ['DERIVED'],
  DERIVED: ['FINAL'],
  FINAL: [] // Terminal state
};

const JOB_TRANSITIONS: Record<JobState, JobState[]> = {
  QUEUED: ['RUNNING'],
  RUNNING: ['COMPLETED', 'FAILED'],
  COMPLETED: [], // Terminal state
  FAILED: ['QUEUED'] // Can be re-run
};

// =============================================================================
// Validation Functions
// =============================================================================

export interface TransitionResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate project state transition
 */
export function validateProjectTransition(
  currentState: ProjectState,
  targetState: ProjectState
): TransitionResult {
  if (currentState === targetState) {
    return { valid: true };
  }

  const validTargets = PROJECT_TRANSITIONS[currentState];
  
  if (validTargets.includes(targetState)) {
    return { valid: true };
  }

  // Per STUDIOOS guardrails: deny with specific message
  return {
    valid: false,
    error: `Invalid project transition: ${currentState} → ${targetState}. ` +
           `Valid transitions from ${currentState}: ${validTargets.join(', ') || 'none (terminal state)'}`
  };
}

/**
 * Validate asset category transition
 */
export function validateAssetTransition(
  currentCategory: AssetCategory,
  targetCategory: AssetCategory
): TransitionResult {
  if (currentCategory === targetCategory) {
    return { valid: true };
  }

  const validTargets = ASSET_TRANSITIONS[currentCategory];
  
  if (validTargets.includes(targetCategory)) {
    return { valid: true };
  }

  return {
    valid: false,
    error: `Invalid asset transition: ${currentCategory} → ${targetCategory}. ` +
           `Valid transitions from ${currentCategory}: ${validTargets.join(', ') || 'none (terminal state)'}`
  };
}

/**
 * Validate job state transition
 */
export function validateJobTransition(
  currentState: JobState,
  targetState: JobState
): TransitionResult {
  if (currentState === targetState) {
    return { valid: true };
  }

  const validTargets = JOB_TRANSITIONS[currentState];
  
  if (validTargets.includes(targetState)) {
    return { valid: true };
  }

  return {
    valid: false,
    error: `Invalid job transition: ${currentState} → ${targetState}. ` +
           `Valid transitions from ${currentState}: ${validTargets.join(', ') || 'none (terminal state)'}`
  };
}

// =============================================================================
// State Helpers
// =============================================================================

/**
 * Check if project can transition to target state
 */
export function canProjectTransitionTo(current: ProjectState, target: ProjectState): boolean {
  return validateProjectTransition(current, target).valid;
}

/**
 * Check if asset can transition to target category
 */
export function canAssetTransitionTo(current: AssetCategory, target: AssetCategory): boolean {
  return validateAssetTransition(current, target).valid;
}

/**
 * Check if job can transition to target state
 */
export function canJobTransitionTo(current: JobState, target: JobState): boolean {
  return validateJobTransition(current, target).valid;
}

/**
 * Get next valid states for a project
 */
export function getNextProjectStates(current: ProjectState): ProjectState[] {
  return PROJECT_TRANSITIONS[current];
}

/**
 * Get next valid categories for an asset
 */
export function getNextAssetCategories(current: AssetCategory): AssetCategory[] {
  return ASSET_TRANSITIONS[current];
}

/**
 * Get next valid states for a job
 */
export function getNextJobStates(current: JobState): JobState[] {
  return JOB_TRANSITIONS[current];
}

/**
 * Check if state is terminal (no further transitions allowed)
 */
export function isTerminalProjectState(state: ProjectState): boolean {
  return PROJECT_TRANSITIONS[state].length === 0;
}

export function isTerminalAssetCategory(category: AssetCategory): boolean {
  return ASSET_TRANSITIONS[category].length === 0;
}

export function isTerminalJobState(state: JobState): boolean {
  return JOB_TRANSITIONS[state].length === 0;
}
