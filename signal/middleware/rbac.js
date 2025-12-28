/**
 * StudioOS RBAC Middleware
 * 
 * Enforces role-based access control per STUDIOOS_RBAC_MATRIX.md and
 * STUDIOOS_DASHBOARD_TWO_RBAC.md.
 * 
 * Dashboard One (Internal): Basic, Standard, Advanced
 * Dashboard Two (External): Viewer, Approver
 */

// ============================================================================
// Role Constants
// ============================================================================

const INTERNAL_ROLES = ['BASIC', 'STANDARD', 'ADVANCED'];
const EXTERNAL_ROLES = ['VIEWER', 'APPROVER'];

// ============================================================================
// Dashboard One (Internal) Capability Matrices
// ============================================================================

/**
 * Asset capabilities per internal role
 */
const ASSET_CAPABILITIES = {
  BASIC: {
    upload: true,
    editMetadata: false, // Limited
    viewLineage: true,
    modifyInPlace: false
  },
  STANDARD: {
    upload: true,
    editMetadata: true,
    viewLineage: true,
    modifyInPlace: false
  },
  ADVANCED: {
    upload: true,
    editMetadata: true,
    viewLineage: true,
    modifyInPlace: false // Never permitted per spec
  }
};

/**
 * Transform capabilities per internal role
 */
const TRANSFORM_CAPABILITIES = {
  BASIC: {
    presetSelection: true,
    parameterAdjustment: 'none',
    jobChaining: false,
    batchProcessing: false,
    customPipelines: false
  },
  STANDARD: {
    presetSelection: true,
    parameterAdjustment: 'bounded',
    jobChaining: false,
    batchProcessing: true,
    customPipelines: false
  },
  ADVANCED: {
    presetSelection: true,
    parameterAdjustment: 'full',
    jobChaining: true,
    batchProcessing: true,
    customPipelines: true
  }
};

/**
 * Review & History capabilities per internal role
 */
const REVIEW_CAPABILITIES = {
  BASIC: {
    playback: true,
    compare: true,
    comment: false,
    approve: false,
    rerun: false,
    fullAudit: false
  },
  STANDARD: {
    playback: true,
    compare: true,
    comment: true,
    approve: true,
    rerun: 'limited',
    fullAudit: false
  },
  ADVANCED: {
    playback: true,
    compare: true,
    comment: true,
    approve: true,
    rerun: true,
    fullAudit: true
  }
};

/**
 * Deliver capabilities per internal role
 */
const DELIVER_CAPABILITIES = {
  BASIC: {
    downloadStandard: true,
    configureFormats: false,
    manageDestinations: false,
    batchDelivery: false,
    customProfiles: false
  },
  STANDARD: {
    downloadStandard: true,
    configureFormats: true,
    manageDestinations: true,
    batchDelivery: false,
    customProfiles: false
  },
  ADVANCED: {
    downloadStandard: true,
    configureFormats: true,
    manageDestinations: true,
    batchDelivery: true,
    customProfiles: true
  }
};

// ============================================================================
// Dashboard Two (External) Capability Matrices
// ============================================================================

/**
 * Deliverable capabilities per external role
 */
const EXTERNAL_DELIVERABLE_CAPABILITIES = {
  VIEWER: {
    view: true,
    playAudio: true,
    compareVersions: true,
    approve: false,
    reject: false,
    download: false
  },
  APPROVER: {
    view: true,
    playAudio: true,
    compareVersions: true,
    approve: true,
    reject: true,
    download: true
  }
};

/**
 * Comment capabilities per external role
 */
const EXTERNAL_COMMENT_CAPABILITIES = {
  VIEWER: {
    viewComments: true,
    addNonBinding: true,
    submitBinding: false
  },
  APPROVER: {
    viewComments: true,
    addNonBinding: true,
    submitBinding: true
  }
};

/**
 * Project capabilities per external role
 */
const EXTERNAL_PROJECT_CAPABILITIES = {
  VIEWER: {
    viewList: true,
    viewStatus: true,
    modifyConfig: false,
    delete: false
  },
  APPROVER: {
    viewList: true,
    viewStatus: true,
    modifyConfig: false,
    delete: false
  }
};

// ============================================================================
// Cross-Cutting Restrictions (Never Permitted)
// ============================================================================

const UNIVERSALLY_PROHIBITED = [
  'accessTimelines',
  'trackBasedEditing',
  'pluginManagement',
  'realtimeParameterManipulation',
  'bypassJobEngine',
  'directAssetMutation',
  'manualSignalRouting'
];

// ============================================================================
// Role Checking Functions
// ============================================================================

/**
 * Check if user has internal role
 * @param {object} user - User object with internalRole field
 * @returns {boolean}
 */
function isInternalUser(user) {
  return user && INTERNAL_ROLES.includes(user.internalRole);
}

/**
 * Check if user has external role
 * @param {object} user - User object with externalRole field
 * @returns {boolean}
 */
function isExternalUser(user) {
  return user && EXTERNAL_ROLES.includes(user.externalRole);
}

/**
 * Get user's effective role
 * @param {object} user - User object
 * @returns {{ type: 'internal'|'external', role: string }|null}
 */
function getEffectiveRole(user) {
  if (!user) return null;
  if (user.internalRole && INTERNAL_ROLES.includes(user.internalRole)) {
    return { type: 'internal', role: user.internalRole };
  }
  if (user.externalRole && EXTERNAL_ROLES.includes(user.externalRole)) {
    return { type: 'external', role: user.externalRole };
  }
  return null;
}

// ============================================================================
// Capability Checking Functions
// ============================================================================

/**
 * Check internal asset capability
 * @param {string} role - Internal role
 * @param {string} capability - Capability name
 * @returns {boolean}
 */
function canAsset(role, capability) {
  if (!INTERNAL_ROLES.includes(role)) return false;
  return ASSET_CAPABILITIES[role]?.[capability] === true;
}

/**
 * Check internal transform capability
 * @param {string} role - Internal role
 * @param {string} capability - Capability name
 * @returns {boolean|string}
 */
function canTransform(role, capability) {
  if (!INTERNAL_ROLES.includes(role)) return false;
  return TRANSFORM_CAPABILITIES[role]?.[capability];
}

/**
 * Check internal review capability
 * @param {string} role - Internal role
 * @param {string} capability - Capability name
 * @returns {boolean|string}
 */
function canReview(role, capability) {
  if (!INTERNAL_ROLES.includes(role)) return false;
  return REVIEW_CAPABILITIES[role]?.[capability];
}

/**
 * Check internal deliver capability
 * @param {string} role - Internal role
 * @param {string} capability - Capability name
 * @returns {boolean}
 */
function canDeliver(role, capability) {
  if (!INTERNAL_ROLES.includes(role)) return false;
  return DELIVER_CAPABILITIES[role]?.[capability] === true;
}

/**
 * Check external deliverable capability
 * @param {string} role - External role
 * @param {string} capability - Capability name
 * @returns {boolean}
 */
function canExternalDeliverable(role, capability) {
  if (!EXTERNAL_ROLES.includes(role)) return false;
  return EXTERNAL_DELIVERABLE_CAPABILITIES[role]?.[capability] === true;
}

/**
 * Check external comment capability
 * @param {string} role - External role
 * @param {string} capability - Capability name
 * @returns {boolean}
 */
function canExternalComment(role, capability) {
  if (!EXTERNAL_ROLES.includes(role)) return false;
  return EXTERNAL_COMMENT_CAPABILITIES[role]?.[capability] === true;
}

/**
 * Check external project capability
 * @param {string} role - External role
 * @param {string} capability - Capability name
 * @returns {boolean}
 */
function canExternalProject(role, capability) {
  if (!EXTERNAL_ROLES.includes(role)) return false;
  return EXTERNAL_PROJECT_CAPABILITIES[role]?.[capability] === true;
}

// ============================================================================
// Middleware Factories
// ============================================================================

/**
 * Require authenticated user
 */
function requireAuth() {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required.',
        category: 'AUTH'
      });
    }
    next();
  };
}

/**
 * Require internal role
 * @param {string[]} allowedRoles - List of allowed internal roles
 */
function requireInternalRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required.',
        category: 'AUTH'
      });
    }

    if (!req.user.internalRole) {
      return res.status(403).json({
        error: 'This action requires internal user access.',
        category: 'RBAC'
      });
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.internalRole)) {
      return res.status(403).json({
        error: `This action requires one of the following roles: ${allowedRoles.join(', ')}.`,
        category: 'RBAC',
        userRole: req.user.internalRole
      });
    }

    next();
  };
}

/**
 * Require external role
 * @param {string[]} allowedRoles - List of allowed external roles
 */
function requireExternalRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required.',
        category: 'AUTH'
      });
    }

    if (!req.user.externalRole) {
      return res.status(403).json({
        error: 'This action requires external user access.',
        category: 'RBAC'
      });
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.externalRole)) {
      return res.status(403).json({
        error: `This action requires one of the following roles: ${allowedRoles.join(', ')}.`,
        category: 'RBAC',
        userRole: req.user.externalRole
      });
    }

    next();
  };
}

/**
 * Require specific internal capability
 * @param {string} domain - 'asset' | 'transform' | 'review' | 'deliver'
 * @param {string} capability - Capability name within domain
 */
function requireCapability(domain, capability) {
  return (req, res, next) => {
    if (!req.user || !req.user.internalRole) {
      return res.status(403).json({
        error: 'Internal role required for this capability.',
        category: 'RBAC'
      });
    }

    const role = req.user.internalRole;
    let allowed = false;

    switch (domain) {
      case 'asset':
        allowed = canAsset(role, capability);
        break;
      case 'transform':
        allowed = !!canTransform(role, capability);
        break;
      case 'review':
        allowed = !!canReview(role, capability);
        break;
      case 'deliver':
        allowed = canDeliver(role, capability);
        break;
      default:
        return res.status(500).json({
          error: `Unknown capability domain: ${domain}`,
          category: 'SYSTEM'
        });
    }

    if (!allowed) {
      return res.status(403).json({
        error: `The ${capability} capability in ${domain} is not available for your role.`,
        category: 'RBAC',
        domain,
        capability,
        userRole: role
      });
    }

    // Attach capability level for bounded checks
    if (domain === 'transform' && capability === 'parameterAdjustment') {
      req.parameterAdjustmentLevel = canTransform(role, capability);
    }
    if (domain === 'review' && capability === 'rerun') {
      req.rerunLevel = canReview(role, capability);
    }

    next();
  };
}

/**
 * Require specific external capability
 * @param {string} domain - 'deliverable' | 'comment' | 'project'
 * @param {string} capability - Capability name within domain
 */
function requireExternalCapability(domain, capability) {
  return (req, res, next) => {
    if (!req.user || !req.user.externalRole) {
      return res.status(403).json({
        error: 'External role required for this capability.',
        category: 'RBAC'
      });
    }

    const role = req.user.externalRole;
    let allowed = false;

    switch (domain) {
      case 'deliverable':
        allowed = canExternalDeliverable(role, capability);
        break;
      case 'comment':
        allowed = canExternalComment(role, capability);
        break;
      case 'project':
        allowed = canExternalProject(role, capability);
        break;
      default:
        return res.status(500).json({
          error: `Unknown external capability domain: ${domain}`,
          category: 'SYSTEM'
        });
    }

    if (!allowed) {
      return res.status(403).json({
        error: `The ${capability} capability in ${domain} is not available for your role.`,
        category: 'RBAC',
        domain,
        capability,
        userRole: role
      });
    }

    next();
  };
}

/**
 * Validate parameters against role constraints
 * Returns middleware that checks if parameters are within role bounds
 * @param {object} parameterBounds - Object defining max/min per parameter per level
 */
function validateParameterBounds(parameterBounds) {
  return (req, res, next) => {
    const level = req.parameterAdjustmentLevel;
    
    if (level === 'none') {
      // Check if any parameters were sent (other than preset)
      const { preset, ...otherParams } = req.body.parameters || {};
      if (Object.keys(otherParams).length > 0) {
        return res.status(403).json({
          error: 'Your role does not permit parameter adjustments. Use preset selection only.',
          category: 'RBAC'
        });
      }
      return next();
    }

    if (level === 'bounded' && parameterBounds) {
      const params = req.body.parameters || {};
      for (const [key, value] of Object.entries(params)) {
        if (key === 'preset') continue;
        
        const bounds = parameterBounds[key];
        if (bounds) {
          if (value < bounds.min || value > bounds.max) {
            return res.status(400).json({
              error: `Parameter "${key}" value ${value} is outside allowed bounds (${bounds.min}-${bounds.max}).`,
              category: 'PARAMETER_BOUNDS',
              parameter: key,
              value,
              allowedRange: bounds
            });
          }
        }
      }
    }

    // 'full' level has no restrictions
    next();
  };
}

/**
 * Block universally prohibited actions
 */
function blockProhibited() {
  return (req, res, next) => {
    const action = req.body.action || req.query.action;
    
    if (action && UNIVERSALLY_PROHIBITED.includes(action)) {
      return res.status(403).json({
        error: 'This action is not defined in the current StudioOS architecture.',
        category: 'PROHIBITED',
        action
      });
    }

    next();
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Constants
  INTERNAL_ROLES,
  EXTERNAL_ROLES,
  UNIVERSALLY_PROHIBITED,
  
  // Capability matrices
  ASSET_CAPABILITIES,
  TRANSFORM_CAPABILITIES,
  REVIEW_CAPABILITIES,
  DELIVER_CAPABILITIES,
  EXTERNAL_DELIVERABLE_CAPABILITIES,
  EXTERNAL_COMMENT_CAPABILITIES,
  EXTERNAL_PROJECT_CAPABILITIES,
  
  // Role checking
  isInternalUser,
  isExternalUser,
  getEffectiveRole,
  
  // Capability checking
  canAsset,
  canTransform,
  canReview,
  canDeliver,
  canExternalDeliverable,
  canExternalComment,
  canExternalProject,
  
  // Middleware
  requireAuth,
  requireInternalRole,
  requireExternalRole,
  requireCapability,
  requireExternalCapability,
  validateParameterBounds,
  blockProhibited
};
