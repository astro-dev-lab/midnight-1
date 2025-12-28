/**
 * RBAC Middleware Tests
 * 
 * Tests role-based access control per STUDIOOS_RBAC_MATRIX.md and
 * STUDIOOS_DASHBOARD_TWO_RBAC.md
 */

const {
  INTERNAL_ROLES,
  EXTERNAL_ROLES,
  UNIVERSALLY_PROHIBITED,
  isInternalUser,
  isExternalUser,
  getEffectiveRole,
  canAsset,
  canTransform,
  canReview,
  canDeliver,
  canExternalDeliverable,
  canExternalComment,
  canExternalProject,
  requireAuth,
  requireInternalRole,
  requireExternalRole,
  requireCapability,
  blockProhibited
} = require('../middleware/rbac');

// ============================================================================
// Helper for testing middleware
// ============================================================================

function mockReq(overrides = {}) {
  return {
    user: null,
    body: {},
    query: {},
    params: {},
    ...overrides
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    jsonData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    }
  };
  return res;
}

function mockNext() {
  const fn = jest.fn();
  return fn;
}

// ============================================================================
// Role Constants Tests
// ============================================================================

describe('RBAC - Role Constants', () => {
  test('Internal roles are exactly: BASIC, STANDARD, ADVANCED', () => {
    expect(INTERNAL_ROLES).toEqual(['BASIC', 'STANDARD', 'ADVANCED']);
    expect(INTERNAL_ROLES).toHaveLength(3);
  });

  test('External roles are exactly: VIEWER, APPROVER', () => {
    expect(EXTERNAL_ROLES).toEqual(['VIEWER', 'APPROVER']);
    expect(EXTERNAL_ROLES).toHaveLength(2);
  });

  test('Universally prohibited actions exist', () => {
    expect(UNIVERSALLY_PROHIBITED).toContain('accessTimelines');
    expect(UNIVERSALLY_PROHIBITED).toContain('pluginManagement');
    expect(UNIVERSALLY_PROHIBITED).toContain('directAssetMutation');
  });
});

// ============================================================================
// Role Detection Tests
// ============================================================================

describe('RBAC - Role Detection', () => {
  test('isInternalUser detects internal roles', () => {
    expect(isInternalUser({ internalRole: 'BASIC' })).toBe(true);
    expect(isInternalUser({ internalRole: 'STANDARD' })).toBe(true);
    expect(isInternalUser({ internalRole: 'ADVANCED' })).toBe(true);
  });

  test('isInternalUser rejects external roles', () => {
    expect(isInternalUser({ externalRole: 'VIEWER' })).toBe(false);
    expect(isInternalUser(null)).toBeFalsy();
  });

  test('isExternalUser detects external roles', () => {
    expect(isExternalUser({ externalRole: 'VIEWER' })).toBe(true);
    expect(isExternalUser({ externalRole: 'APPROVER' })).toBe(true);
  });

  test('isExternalUser rejects internal roles', () => {
    expect(isExternalUser({ internalRole: 'BASIC' })).toBe(false);
    expect(isExternalUser(null)).toBeFalsy();
  });

  test('getEffectiveRole returns correct role type', () => {
    expect(getEffectiveRole({ internalRole: 'ADVANCED' })).toEqual({
      type: 'internal',
      role: 'ADVANCED'
    });
    expect(getEffectiveRole({ externalRole: 'APPROVER' })).toEqual({
      type: 'external',
      role: 'APPROVER'
    });
    expect(getEffectiveRole(null)).toBe(null);
  });
});

// ============================================================================
// Internal Asset Capabilities Tests
// ============================================================================

describe('RBAC - Asset Capabilities', () => {
  test('All roles can upload assets', () => {
    expect(canAsset('BASIC', 'upload')).toBe(true);
    expect(canAsset('STANDARD', 'upload')).toBe(true);
    expect(canAsset('ADVANCED', 'upload')).toBe(true);
  });

  test('Only Standard and Advanced can edit metadata', () => {
    expect(canAsset('BASIC', 'editMetadata')).toBe(false);
    expect(canAsset('STANDARD', 'editMetadata')).toBe(true);
    expect(canAsset('ADVANCED', 'editMetadata')).toBe(true);
  });

  test('No role can modify assets in place', () => {
    expect(canAsset('BASIC', 'modifyInPlace')).toBe(false);
    expect(canAsset('STANDARD', 'modifyInPlace')).toBe(false);
    expect(canAsset('ADVANCED', 'modifyInPlace')).toBe(false);
  });

  test('All roles can view lineage', () => {
    expect(canAsset('BASIC', 'viewLineage')).toBe(true);
    expect(canAsset('STANDARD', 'viewLineage')).toBe(true);
    expect(canAsset('ADVANCED', 'viewLineage')).toBe(true);
  });
});

// ============================================================================
// Internal Transform Capabilities Tests
// ============================================================================

describe('RBAC - Transform Capabilities', () => {
  test('All roles can select presets', () => {
    expect(canTransform('BASIC', 'presetSelection')).toBe(true);
    expect(canTransform('STANDARD', 'presetSelection')).toBe(true);
    expect(canTransform('ADVANCED', 'presetSelection')).toBe(true);
  });

  test('Parameter adjustment follows role hierarchy', () => {
    expect(canTransform('BASIC', 'parameterAdjustment')).toBe('none');
    expect(canTransform('STANDARD', 'parameterAdjustment')).toBe('bounded');
    expect(canTransform('ADVANCED', 'parameterAdjustment')).toBe('full');
  });

  test('Only Advanced can use job chaining', () => {
    expect(canTransform('BASIC', 'jobChaining')).toBe(false);
    expect(canTransform('STANDARD', 'jobChaining')).toBe(false);
    expect(canTransform('ADVANCED', 'jobChaining')).toBe(true);
  });

  test('Standard and Advanced can batch process', () => {
    expect(canTransform('BASIC', 'batchProcessing')).toBe(false);
    expect(canTransform('STANDARD', 'batchProcessing')).toBe(true);
    expect(canTransform('ADVANCED', 'batchProcessing')).toBe(true);
  });

  test('Only Advanced can use custom pipelines', () => {
    expect(canTransform('BASIC', 'customPipelines')).toBe(false);
    expect(canTransform('STANDARD', 'customPipelines')).toBe(false);
    expect(canTransform('ADVANCED', 'customPipelines')).toBe(true);
  });
});

// ============================================================================
// Internal Review Capabilities Tests
// ============================================================================

describe('RBAC - Review Capabilities', () => {
  test('All roles can playback and compare', () => {
    expect(canReview('BASIC', 'playback')).toBe(true);
    expect(canReview('BASIC', 'compare')).toBe(true);
    expect(canReview('STANDARD', 'playback')).toBe(true);
    expect(canReview('ADVANCED', 'compare')).toBe(true);
  });

  test('Only Standard and Advanced can comment', () => {
    expect(canReview('BASIC', 'comment')).toBe(false);
    expect(canReview('STANDARD', 'comment')).toBe(true);
    expect(canReview('ADVANCED', 'comment')).toBe(true);
  });

  test('Only Standard and Advanced can approve', () => {
    expect(canReview('BASIC', 'approve')).toBe(false);
    expect(canReview('STANDARD', 'approve')).toBe(true);
    expect(canReview('ADVANCED', 'approve')).toBe(true);
  });

  test('Rerun follows role hierarchy', () => {
    expect(canReview('BASIC', 'rerun')).toBe(false);
    expect(canReview('STANDARD', 'rerun')).toBe('limited');
    expect(canReview('ADVANCED', 'rerun')).toBe(true);
  });

  test('Only Advanced has full audit access', () => {
    expect(canReview('BASIC', 'fullAudit')).toBe(false);
    expect(canReview('STANDARD', 'fullAudit')).toBe(false);
    expect(canReview('ADVANCED', 'fullAudit')).toBe(true);
  });
});

// ============================================================================
// Internal Deliver Capabilities Tests
// ============================================================================

describe('RBAC - Deliver Capabilities', () => {
  test('All roles can download standard exports', () => {
    expect(canDeliver('BASIC', 'downloadStandard')).toBe(true);
    expect(canDeliver('STANDARD', 'downloadStandard')).toBe(true);
    expect(canDeliver('ADVANCED', 'downloadStandard')).toBe(true);
  });

  test('Only Standard and Advanced can configure formats', () => {
    expect(canDeliver('BASIC', 'configureFormats')).toBe(false);
    expect(canDeliver('STANDARD', 'configureFormats')).toBe(true);
    expect(canDeliver('ADVANCED', 'configureFormats')).toBe(true);
  });

  test('Only Advanced can batch deliver', () => {
    expect(canDeliver('BASIC', 'batchDelivery')).toBe(false);
    expect(canDeliver('STANDARD', 'batchDelivery')).toBe(false);
    expect(canDeliver('ADVANCED', 'batchDelivery')).toBe(true);
  });
});

// ============================================================================
// External Deliverable Capabilities Tests
// ============================================================================

describe('RBAC - External Deliverable Capabilities', () => {
  test('Both roles can view and play', () => {
    expect(canExternalDeliverable('VIEWER', 'view')).toBe(true);
    expect(canExternalDeliverable('VIEWER', 'playAudio')).toBe(true);
    expect(canExternalDeliverable('APPROVER', 'view')).toBe(true);
    expect(canExternalDeliverable('APPROVER', 'playAudio')).toBe(true);
  });

  test('Only Approver can approve/reject', () => {
    expect(canExternalDeliverable('VIEWER', 'approve')).toBe(false);
    expect(canExternalDeliverable('VIEWER', 'reject')).toBe(false);
    expect(canExternalDeliverable('APPROVER', 'approve')).toBe(true);
    expect(canExternalDeliverable('APPROVER', 'reject')).toBe(true);
  });

  test('Only Approver can download', () => {
    expect(canExternalDeliverable('VIEWER', 'download')).toBe(false);
    expect(canExternalDeliverable('APPROVER', 'download')).toBe(true);
  });
});

// ============================================================================
// External Comment Capabilities Tests
// ============================================================================

describe('RBAC - External Comment Capabilities', () => {
  test('Both roles can view and add non-binding comments', () => {
    expect(canExternalComment('VIEWER', 'viewComments')).toBe(true);
    expect(canExternalComment('VIEWER', 'addNonBinding')).toBe(true);
    expect(canExternalComment('APPROVER', 'viewComments')).toBe(true);
    expect(canExternalComment('APPROVER', 'addNonBinding')).toBe(true);
  });

  test('Only Approver can submit binding notes', () => {
    expect(canExternalComment('VIEWER', 'submitBinding')).toBe(false);
    expect(canExternalComment('APPROVER', 'submitBinding')).toBe(true);
  });
});

// ============================================================================
// Middleware Tests
// ============================================================================

describe('RBAC - requireAuth Middleware', () => {
  test('Rejects unauthenticated request', () => {
    const req = mockReq();
    const res = mockRes();
    const next = mockNext();

    requireAuth()(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.jsonData.error).toContain('Authentication required');
    expect(next).not.toHaveBeenCalled();
  });

  test('Allows authenticated request', () => {
    const req = mockReq({ user: { id: 1 } });
    const res = mockRes();
    const next = mockNext();

    requireAuth()(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('RBAC - requireInternalRole Middleware', () => {
  test('Rejects external user', () => {
    const req = mockReq({ user: { externalRole: 'VIEWER' } });
    const res = mockRes();
    const next = mockNext();

    requireInternalRole()(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.jsonData.error).toContain('internal user access');
    expect(next).not.toHaveBeenCalled();
  });

  test('Allows any internal role when no specific roles required', () => {
    const req = mockReq({ user: { internalRole: 'BASIC' } });
    const res = mockRes();
    const next = mockNext();

    requireInternalRole()(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('Rejects role not in allowed list', () => {
    const req = mockReq({ user: { internalRole: 'BASIC' } });
    const res = mockRes();
    const next = mockNext();

    requireInternalRole('STANDARD', 'ADVANCED')(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.jsonData.error).toContain('STANDARD, ADVANCED');
    expect(next).not.toHaveBeenCalled();
  });

  test('Allows role in allowed list', () => {
    const req = mockReq({ user: { internalRole: 'ADVANCED' } });
    const res = mockRes();
    const next = mockNext();

    requireInternalRole('STANDARD', 'ADVANCED')(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('RBAC - blockProhibited Middleware', () => {
  test('Blocks universally prohibited actions', () => {
    const req = mockReq({ body: { action: 'pluginManagement' } });
    const res = mockRes();
    const next = mockNext();

    blockProhibited()(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.jsonData.error).toContain('not defined in the current StudioOS architecture');
    expect(next).not.toHaveBeenCalled();
  });

  test('Allows permitted actions', () => {
    const req = mockReq({ body: { action: 'submitJob' } });
    const res = mockRes();
    const next = mockNext();

    blockProhibited()(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
