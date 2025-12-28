/**
 * State Machine Middleware Tests
 * 
 * Tests canonical state transitions per STUDIOOS_STATE_LIFECYCLE_SPECS.md
 */

const {
  validateProjectTransition,
  validateAssetDerivation,
  validateJobTransition,
  validateProjectInvariants,
  validateDeliveryPreconditions,
  PROJECT_TRANSITIONS,
  ASSET_TRANSITIONS,
  JOB_TRANSITIONS
} = require('../middleware/stateMachine');

describe('State Machine - Project Transitions', () => {
  test('Draft → Processing is valid', () => {
    const result = validateProjectTransition('DRAFT', 'PROCESSING');
    expect(result.valid).toBe(true);
  });

  test('Processing → Ready is valid', () => {
    const result = validateProjectTransition('PROCESSING', 'READY');
    expect(result.valid).toBe(true);
  });

  test('Ready → Processing is valid (new job)', () => {
    const result = validateProjectTransition('READY', 'PROCESSING');
    expect(result.valid).toBe(true);
  });

  test('Ready → Delivered is valid', () => {
    const result = validateProjectTransition('READY', 'DELIVERED');
    expect(result.valid).toBe(true);
  });

  test('Delivered → Processing is valid (new job)', () => {
    const result = validateProjectTransition('DELIVERED', 'PROCESSING');
    expect(result.valid).toBe(true);
  });

  test('Draft → Delivered is PROHIBITED', () => {
    const result = validateProjectTransition('DRAFT', 'DELIVERED');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Draft to Delivered without processing');
  });

  test('Delivered → Draft is PROHIBITED', () => {
    const result = validateProjectTransition('DELIVERED', 'DRAFT');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Delivered back to Draft');
  });

  test('Draft → Ready is PROHIBITED (must go through Processing)', () => {
    const result = validateProjectTransition('DRAFT', 'READY');
    expect(result.valid).toBe(false);
  });

  test('Same state transition is allowed (no-op)', () => {
    const result = validateProjectTransition('PROCESSING', 'PROCESSING');
    expect(result.valid).toBe(true);
  });
});

describe('State Machine - Asset Derivation', () => {
  test('Raw → Derived is valid', () => {
    const result = validateAssetDerivation('RAW', 'DERIVED');
    expect(result.valid).toBe(true);
  });

  test('Derived → Derived is valid (subsequent job)', () => {
    const result = validateAssetDerivation('DERIVED', 'DERIVED');
    expect(result.valid).toBe(true);
  });

  test('Derived → Final is valid (approval)', () => {
    const result = validateAssetDerivation('DERIVED', 'FINAL');
    expect(result.valid).toBe(true);
  });

  test('Raw → Final is PROHIBITED', () => {
    const result = validateAssetDerivation('RAW', 'FINAL');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Must go through Derived state');
  });

  test('Final as input is PROHIBITED', () => {
    const result = validateAssetDerivation('FINAL', 'DERIVED');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Final assets cannot be used as job inputs');
  });
});

describe('State Machine - Job Transitions', () => {
  test('Queued → Running is valid', () => {
    const result = validateJobTransition('QUEUED', 'RUNNING');
    expect(result.valid).toBe(true);
  });

  test('Running → Completed is valid', () => {
    const result = validateJobTransition('RUNNING', 'COMPLETED');
    expect(result.valid).toBe(true);
  });

  test('Running → Failed is valid', () => {
    const result = validateJobTransition('RUNNING', 'FAILED');
    expect(result.valid).toBe(true);
  });

  test('Failed → Queued is valid (rerun)', () => {
    const result = validateJobTransition('FAILED', 'QUEUED');
    expect(result.valid).toBe(true);
  });

  test('Completed → any state is PROHIBITED', () => {
    const result = validateJobTransition('COMPLETED', 'RUNNING');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Completed jobs are immutable');
  });

  test('Queued → Completed is PROHIBITED (must go through Running)', () => {
    const result = validateJobTransition('QUEUED', 'COMPLETED');
    expect(result.valid).toBe(false);
  });

  test('Same state transition is allowed (no-op)', () => {
    const result = validateJobTransition('RUNNING', 'RUNNING');
    expect(result.valid).toBe(true);
  });
});

describe('State Machine - Project Invariants', () => {
  test('Ready project with active jobs is invalid', () => {
    const project = { state: 'READY' };
    const activeJobs = [{ state: 'RUNNING' }];
    const result = validateProjectInvariants(project, activeJobs, []);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('jobs are still active');
  });

  test('Ready project with completed jobs only is valid', () => {
    const project = { state: 'READY' };
    const activeJobs = [{ state: 'COMPLETED' }];
    const result = validateProjectInvariants(project, activeJobs, []);
    expect(result.valid).toBe(true);
  });

  test('Delivered project without Final assets is invalid', () => {
    const project = { state: 'DELIVERED' };
    const assets = [{ category: 'DERIVED' }];
    const result = validateProjectInvariants(project, [], assets);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('without Final');
  });

  test('Delivered project with Final assets is valid', () => {
    const project = { state: 'DELIVERED' };
    const assets = [{ category: 'FINAL' }];
    const result = validateProjectInvariants(project, [], assets);
    expect(result.valid).toBe(true);
  });
});

describe('State Machine - Delivery Preconditions', () => {
  test('Delivery with all Final assets is valid', () => {
    const assets = [
      { category: 'FINAL' },
      { category: 'FINAL' }
    ];
    const result = validateDeliveryPreconditions(assets);
    expect(result.valid).toBe(true);
  });

  test('Delivery with non-Final assets is invalid', () => {
    const assets = [
      { category: 'FINAL' },
      { category: 'DERIVED' }
    ];
    const result = validateDeliveryPreconditions(assets);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('all assets to be in Final state');
  });

  test('Delivery with only Derived assets is invalid', () => {
    const assets = [{ category: 'DERIVED' }];
    const result = validateDeliveryPreconditions(assets);
    expect(result.valid).toBe(false);
  });
});

describe('State Transition Maps - Completeness', () => {
  test('All project states have transition definitions', () => {
    expect(PROJECT_TRANSITIONS).toHaveProperty('DRAFT');
    expect(PROJECT_TRANSITIONS).toHaveProperty('PROCESSING');
    expect(PROJECT_TRANSITIONS).toHaveProperty('READY');
    expect(PROJECT_TRANSITIONS).toHaveProperty('DELIVERED');
  });

  test('All asset categories have transition definitions', () => {
    expect(ASSET_TRANSITIONS).toHaveProperty('RAW');
    expect(ASSET_TRANSITIONS).toHaveProperty('DERIVED');
    expect(ASSET_TRANSITIONS).toHaveProperty('FINAL');
  });

  test('All job states have transition definitions', () => {
    expect(JOB_TRANSITIONS).toHaveProperty('QUEUED');
    expect(JOB_TRANSITIONS).toHaveProperty('RUNNING');
    expect(JOB_TRANSITIONS).toHaveProperty('COMPLETED');
    expect(JOB_TRANSITIONS).toHaveProperty('FAILED');
  });
});
