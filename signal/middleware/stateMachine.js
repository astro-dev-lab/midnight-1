/**
 * StudioOS State Machine Enforcement Middleware
 * 
 * Enforces canonical state transitions per STUDIOOS_STATE_LIFECYCLE_SPECS.md:
 * - Project: Draft → Processing → Ready → Delivered
 * - Asset: Raw → Derived → Final (immutable categories)
 * - Job: Queued → Running → Completed | Failed
 * 
 * Invalid transitions are denied with canonical error messages.
 */

// ============================================================================
// Valid State Transitions
// ============================================================================

const PROJECT_TRANSITIONS = {
  DRAFT: ['PROCESSING'],
  PROCESSING: ['READY'],
  READY: ['PROCESSING', 'DELIVERED'],
  DELIVERED: ['PROCESSING']
};

const ASSET_TRANSITIONS = {
  RAW: ['DERIVED'],
  DERIVED: ['DERIVED', 'FINAL'],
  FINAL: [] // Terminal state - no further transitions
};

const JOB_TRANSITIONS = {
  QUEUED: ['RUNNING'],
  RUNNING: ['COMPLETED', 'FAILED'],
  COMPLETED: [], // Terminal state
  FAILED: ['QUEUED'] // Rerun creates new job, but can re-queue
};

// ============================================================================
// Transition Validators
// ============================================================================

/**
 * Validate a project state transition
 * @param {string} currentState - Current ProjectState enum value
 * @param {string} nextState - Requested ProjectState enum value
 * @returns {{ valid: boolean, error?: string }}
 */
function validateProjectTransition(currentState, nextState) {
  if (currentState === nextState) {
    return { valid: true }; // No-op is allowed
  }

  const allowed = PROJECT_TRANSITIONS[currentState];
  if (!allowed) {
    return {
      valid: false,
      error: `Invalid project state: ${currentState}`
    };
  }

  if (!allowed.includes(nextState)) {
    // Specific prohibited transition messages per spec
    if (currentState === 'DRAFT' && nextState === 'DELIVERED') {
      return {
        valid: false,
        error: 'Project cannot transition from Draft to Delivered without processing.'
      };
    }
    if (currentState === 'DELIVERED' && nextState === 'DRAFT') {
      return {
        valid: false,
        error: 'Project cannot transition from Delivered back to Draft.'
      };
    }
    return {
      valid: false,
      error: `Project cannot transition from ${currentState} to ${nextState}. Valid transitions: ${allowed.join(', ') || 'none'}.`
    };
  }

  return { valid: true };
}

/**
 * Validate an asset category transition (asset states are immutable categories)
 * Note: Assets don't change state - new assets are created. This validates
 * that a derived asset is created from valid parent category.
 * @param {string} parentCategory - Parent asset's category (RAW, DERIVED, FINAL)
 * @param {string} newCategory - New asset's category
 * @returns {{ valid: boolean, error?: string }}
 */
function validateAssetDerivation(parentCategory, newCategory) {
  // Raw can produce Derived
  // Derived can produce Derived or Final
  // Final cannot be used as input (per spec)
  
  if (parentCategory === 'FINAL') {
    return {
      valid: false,
      error: 'Final assets cannot be used as job inputs. Assets are immutable once finalized.'
    };
  }

  if (parentCategory === 'RAW' && newCategory === 'FINAL') {
    return {
      valid: false,
      error: 'Raw assets cannot directly become Final. Must go through Derived state first.'
    };
  }

  const allowed = ASSET_TRANSITIONS[parentCategory];
  if (!allowed || !allowed.includes(newCategory)) {
    return {
      valid: false,
      error: `Asset cannot derive ${newCategory} from ${parentCategory}.`
    };
  }

  return { valid: true };
}

/**
 * Validate a job state transition
 * @param {string} currentState - Current JobState enum value
 * @param {string} nextState - Requested JobState enum value
 * @returns {{ valid: boolean, error?: string }}
 */
function validateJobTransition(currentState, nextState) {
  if (currentState === nextState) {
    return { valid: true }; // No-op is allowed
  }

  const allowed = JOB_TRANSITIONS[currentState];
  if (!allowed) {
    return {
      valid: false,
      error: `Invalid job state: ${currentState}`
    };
  }

  if (!allowed.includes(nextState)) {
    // Completed jobs are immutable
    if (currentState === 'COMPLETED') {
      return {
        valid: false,
        error: 'Completed jobs are immutable and cannot be altered. Create a new job instead.'
      };
    }
    return {
      valid: false,
      error: `Job cannot transition from ${currentState} to ${nextState}. Valid transitions: ${allowed.join(', ') || 'none'}.`
    };
  }

  return { valid: true };
}

// ============================================================================
// State Invariant Validators
// ============================================================================

/**
 * Validate project state invariants
 * @param {object} project - Project entity
 * @param {object[]} activeJobs - Active jobs for this project
 * @param {object[]} assets - Assets in this project
 * @returns {{ valid: boolean, error?: string }}
 */
function validateProjectInvariants(project, activeJobs = [], assets = []) {
  // A project may not be Ready if any job is active
  if (project.state === 'READY') {
    const hasActiveJobs = activeJobs.some(
      j => j.state === 'QUEUED' || j.state === 'RUNNING'
    );
    if (hasActiveJobs) {
      return {
        valid: false,
        error: 'Project cannot be Ready while jobs are still active.'
      };
    }
  }

  // A project may not be Delivered without approved outputs
  if (project.state === 'DELIVERED') {
    const hasFinalAssets = assets.some(a => a.category === 'FINAL');
    if (!hasFinalAssets) {
      return {
        valid: false,
        error: 'Project cannot be Delivered without Final (approved) assets.'
      };
    }
  }

  return { valid: true };
}

/**
 * Validate delivery preconditions
 * @param {object[]} assets - Assets to be delivered
 * @returns {{ valid: boolean, error?: string }}
 */
function validateDeliveryPreconditions(assets) {
  // No delivery may occur unless assets are Final
  const nonFinalAssets = assets.filter(a => a.category !== 'FINAL');
  if (nonFinalAssets.length > 0) {
    return {
      valid: false,
      error: 'Delivery requires all assets to be in Final state. Approve pending assets first.'
    };
  }

  return { valid: true };
}

// ============================================================================
// Express Middleware Factory
// ============================================================================

/**
 * Create middleware that validates state transitions before mutation
 * @param {string} entityType - 'project' | 'asset' | 'job'
 * @param {function} getEntityById - Async function to fetch current entity
 * @returns {function} Express middleware
 */
function createTransitionMiddleware(entityType, getEntityById) {
  return async (req, res, next) => {
    try {
      const id = req.params.id || req.body.id;
      if (!id) {
        return next(); // No ID means create, not update
      }

      const entity = await getEntityById(id);
      if (!entity) {
        return res.status(404).json({
          error: `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} not found.`
        });
      }

      const nextState = req.body.state;
      if (!nextState) {
        return next(); // No state change requested
      }

      let result;
      switch (entityType) {
        case 'project':
          result = validateProjectTransition(entity.state, nextState);
          break;
        case 'job':
          result = validateJobTransition(entity.state, nextState);
          break;
        default:
          return next();
      }

      if (!result.valid) {
        return res.status(400).json({
          error: result.error,
          category: 'STATE_TRANSITION',
          currentState: entity.state,
          requestedState: nextState
        });
      }

      req.stateTransition = {
        from: entity.state,
        to: nextState,
        entity
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware to validate job input assets (no Final assets as inputs)
 */
function validateJobInputs(getAssetsByIds) {
  return async (req, res, next) => {
    try {
      const inputAssetIds = req.body.inputAssetIds || req.body.inputs;
      if (!inputAssetIds || !Array.isArray(inputAssetIds)) {
        return next();
      }

      const assets = await getAssetsByIds(inputAssetIds);
      
      for (const asset of assets) {
        if (asset.category === 'FINAL') {
          return res.status(400).json({
            error: 'Final assets cannot be used as job inputs. Assets are immutable once finalized.',
            category: 'STATE_INVARIANT',
            assetId: asset.id,
            assetName: asset.name
          });
        }
      }

      req.validatedInputAssets = assets;
      next();
    } catch (err) {
      next(err);
    }
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Transition validators
  validateProjectTransition,
  validateAssetDerivation,
  validateJobTransition,
  
  // Invariant validators
  validateProjectInvariants,
  validateDeliveryPreconditions,
  
  // Middleware factories
  createTransitionMiddleware,
  validateJobInputs,
  
  // State maps (for testing/reference)
  PROJECT_TRANSITIONS,
  ASSET_TRANSITIONS,
  JOB_TRANSITIONS
};
