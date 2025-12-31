'use strict';

/**
 * Version Lineage Tracker
 * 
 * Tracks DSP transformation deltas across asset versions using parentId lineage.
 * Monitors how audio characteristics evolve through processing chains and ensures
 * version relationships maintain expected quality trajectories.
 * 
 * StudioOS Terminology:
 * - asset: Audio file being tracked
 * - version: Iteration of an asset with parentId link
 * - lineage: Chain of versions from original to final
 * - delta: Measured difference between versions
 * - transformation: DSP operation applied between versions
 */

// ============================================================================
// Enums (Frozen Objects)
// ============================================================================

/**
 * Version state in the lineage
 */
const VersionState = Object.freeze({
  RAW: 'RAW',
  DERIVED: 'DERIVED',
  FINAL: 'FINAL'
});

/**
 * Relationship between versions
 */
const Relationship = Object.freeze({
  PARENT: 'PARENT',
  CHILD: 'CHILD',
  SIBLING: 'SIBLING',
  ANCESTOR: 'ANCESTOR',
  DESCENDANT: 'DESCENDANT',
  UNRELATED: 'UNRELATED'
});

/**
 * Delta severity classification
 */
const DeltaSeverity = Object.freeze({
  NONE: 'NONE',
  MINOR: 'MINOR',
  MODERATE: 'MODERATE',
  MAJOR: 'MAJOR',
  CRITICAL: 'CRITICAL'
});

/**
 * Transformation type indicators
 */
const TransformationType = Object.freeze({
  LEVEL_CHANGE: 'LEVEL_CHANGE',
  DYNAMICS: 'DYNAMICS',
  EQ: 'EQ',
  REVERB: 'REVERB',
  STEREO: 'STEREO',
  FORMAT: 'FORMAT',
  RESTORATION: 'RESTORATION',
  MIXED: 'MIXED',
  UNKNOWN: 'UNKNOWN'
});

/**
 * Lineage health status
 */
const LineageHealth = Object.freeze({
  HEALTHY: 'HEALTHY',
  DEGRADED: 'DEGRADED',
  CONCERNING: 'CONCERNING',
  CRITICAL: 'CRITICAL',
  UNKNOWN: 'UNKNOWN'
});

/**
 * Confidence level for analysis
 */
const Confidence = Object.freeze({
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  ESTIMATED: 'ESTIMATED'
});

// ============================================================================
// Constants
// ============================================================================

/**
 * Thresholds for delta classification
 */
const DELTA_THRESHOLDS = Object.freeze({
  lufs: {
    minor: 1,
    moderate: 3,
    major: 6,
    critical: 12
  },
  truePeak: {
    minor: 0.5,
    moderate: 1,
    major: 2,
    critical: 3
  },
  dynamicRange: {
    minor: 1,
    moderate: 2,
    major: 4,
    critical: 8
  },
  stereoWidth: {
    minor: 0.05,
    moderate: 0.15,
    major: 0.30,
    critical: 0.50
  },
  spectralBalance: {
    minor: 1,
    moderate: 3,
    major: 6,
    critical: 10
  }
});

/**
 * Expected transformation patterns
 */
const TRANSFORMATION_PATTERNS = Object.freeze({
  [TransformationType.LEVEL_CHANGE]: {
    expectedMetrics: ['lufs', 'truePeak'],
    preservedMetrics: ['dynamicRange', 'stereoWidth', 'spectralBalance'],
    description: 'Gain/level adjustment without dynamic processing'
  },
  [TransformationType.DYNAMICS]: {
    expectedMetrics: ['dynamicRange', 'lufs', 'truePeak'],
    preservedMetrics: ['stereoWidth', 'spectralBalance'],
    description: 'Compression, limiting, or expansion'
  },
  [TransformationType.EQ]: {
    expectedMetrics: ['spectralBalance'],
    preservedMetrics: ['lufs', 'dynamicRange', 'stereoWidth'],
    description: 'Equalization or tonal adjustments'
  },
  [TransformationType.REVERB]: {
    expectedMetrics: ['dynamicRange', 'stereoWidth'],
    preservedMetrics: ['lufs'],
    description: 'Reverb, delay, or spatial effects'
  },
  [TransformationType.STEREO]: {
    expectedMetrics: ['stereoWidth', 'stereoCorrelation'],
    preservedMetrics: ['lufs', 'dynamicRange', 'spectralBalance'],
    description: 'Stereo width, pan, or imaging changes'
  },
  [TransformationType.FORMAT]: {
    expectedMetrics: ['sampleRate', 'bitDepth'],
    preservedMetrics: ['lufs', 'dynamicRange'],
    description: 'Sample rate or bit depth conversion'
  },
  [TransformationType.RESTORATION]: {
    expectedMetrics: ['noiseFloor', 'artifactCount'],
    preservedMetrics: ['lufs'],
    description: 'Noise reduction, de-click, or restoration'
  }
});

/**
 * Status descriptions for reporting
 */
const STATUS_DESCRIPTIONS = Object.freeze({
  [LineageHealth.HEALTHY]: 'All versions maintain expected quality relationships',
  [LineageHealth.DEGRADED]: 'Minor deviations detected in version lineage',
  [LineageHealth.CONCERNING]: 'Significant quality changes requiring review',
  [LineageHealth.CRITICAL]: 'Critical quality issues detected in lineage',
  [LineageHealth.UNKNOWN]: 'Unable to assess lineage health'
});

// ============================================================================
// Core Tracking Functions
// ============================================================================

/**
 * Build lineage tree from a collection of versions
 * 
 * @param {Object[]} versions - Array of version objects with id and parentId
 * @returns {Object} Lineage tree structure
 */
function buildLineageTree(versions) {
  if (!Array.isArray(versions) || versions.length === 0) {
    return {
      success: false,
      error: 'No versions provided',
      tree: null
    };
  }

  const nodeMap = new Map();
  const roots = [];

  // First pass: create all nodes
  for (const version of versions) {
    if (!version || !version.id) continue;
    
    nodeMap.set(version.id, {
      id: version.id,
      version,
      parentId: version.parentId || null,
      children: [],
      depth: 0,
      state: version.state || VersionState.DERIVED
    });
  }

  // Second pass: build relationships
  for (const [id, node] of nodeMap) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      const parent = nodeMap.get(node.parentId);
      parent.children.push(node);
      node.depth = parent.depth + 1;
    } else if (!node.parentId) {
      roots.push(node);
      node.state = VersionState.RAW;
    }
  }

  // Calculate max depth
  let maxDepth = 0;
  for (const [, node] of nodeMap) {
    maxDepth = Math.max(maxDepth, node.depth);
  }

  // Mark leaf nodes as FINAL
  for (const [, node] of nodeMap) {
    if (node.children.length === 0 && node.depth > 0) {
      node.state = VersionState.FINAL;
    }
  }

  return {
    success: true,
    tree: {
      roots,
      nodeMap,
      totalVersions: versions.length,
      maxDepth,
      branchCount: roots.length
    }
  };
}

/**
 * Calculate delta between two versions
 * 
 * @param {Object} fromVersion - Source version with metrics
 * @param {Object} toVersion - Target version with metrics
 * @returns {Object} Delta analysis
 */
function calculateDelta(fromVersion, toVersion) {
  if (!fromVersion?.metrics || !toVersion?.metrics) {
    return {
      success: false,
      error: 'Both versions must have metrics',
      delta: null
    };
  }

  const from = fromVersion.metrics;
  const to = toVersion.metrics;
  const deltas = {};
  const severities = [];

  // Calculate metric deltas
  const metricPairs = [
    ['lufs', 'integratedLufs'],
    ['truePeak', 'truePeakDbtp'],
    ['dynamicRange', 'loudnessRange'],
    ['stereoWidth', 'stereoWidth'],
    ['spectralBalance', 'spectralCentroid']
  ];

  for (const [key, metricKey] of metricPairs) {
    const fromVal = from[metricKey] ?? from[key];
    const toVal = to[metricKey] ?? to[key];
    
    if (fromVal !== undefined && toVal !== undefined) {
      const diff = toVal - fromVal;
      const absDiff = Math.abs(diff);
      const thresholds = DELTA_THRESHOLDS[key];
      
      let severity = DeltaSeverity.NONE;
      if (thresholds) {
        if (absDiff >= thresholds.critical) {
          severity = DeltaSeverity.CRITICAL;
        } else if (absDiff >= thresholds.major) {
          severity = DeltaSeverity.MAJOR;
        } else if (absDiff >= thresholds.moderate) {
          severity = DeltaSeverity.MODERATE;
        } else if (absDiff >= thresholds.minor) {
          severity = DeltaSeverity.MINOR;
        }
      }

      deltas[key] = {
        from: fromVal,
        to: toVal,
        delta: Math.round(diff * 1000) / 1000,
        absChange: Math.round(absDiff * 1000) / 1000,
        percentChange: fromVal !== 0 ? Math.round((diff / Math.abs(fromVal)) * 10000) / 100 : null,
        severity
      };
      
      severities.push(severity);
    }
  }

  // Determine overall severity
  const severityOrder = [DeltaSeverity.NONE, DeltaSeverity.MINOR, DeltaSeverity.MODERATE, DeltaSeverity.MAJOR, DeltaSeverity.CRITICAL];
  const overallSeverity = severities.reduce((max, s) => {
    return severityOrder.indexOf(s) > severityOrder.indexOf(max) ? s : max;
  }, DeltaSeverity.NONE);

  return {
    success: true,
    fromId: fromVersion.id,
    toId: toVersion.id,
    deltas,
    overallSeverity,
    metricCount: Object.keys(deltas).length,
    summary: generateDeltaSummary(deltas, overallSeverity)
  };
}

/**
 * Infer transformation type from observed deltas
 * 
 * @param {Object} delta - Delta analysis result
 * @returns {Object} Transformation inference
 */
function inferTransformation(delta) {
  if (!delta?.success || !delta.deltas) {
    return {
      success: false,
      error: 'Invalid delta input',
      transformation: TransformationType.UNKNOWN
    };
  }

  const changedMetrics = [];
  const unchangedMetrics = [];

  for (const [metric, info] of Object.entries(delta.deltas)) {
    if (info.severity !== DeltaSeverity.NONE) {
      changedMetrics.push({ metric, ...info });
    } else {
      unchangedMetrics.push(metric);
    }
  }

  // Match against known patterns
  let bestMatch = TransformationType.UNKNOWN;
  let bestScore = 0;
  const matches = [];

  for (const [type, pattern] of Object.entries(TRANSFORMATION_PATTERNS)) {
    let score = 0;
    const expectedHits = changedMetrics.filter(m => 
      pattern.expectedMetrics.includes(m.metric)
    ).length;
    const preservedHits = unchangedMetrics.filter(m =>
      pattern.preservedMetrics.includes(m)
    ).length;
    
    score = expectedHits * 2 + preservedHits;
    
    // Penalty for unexpected changes
    const unexpectedChanges = changedMetrics.filter(m =>
      pattern.preservedMetrics.includes(m.metric)
    ).length;
    score -= unexpectedChanges * 3;

    if (score > 0) {
      matches.push({ type, score, pattern });
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = type;
    }
  }

  // Check for mixed transformations
  if (matches.length > 1 && matches[0].score - matches[1].score < 2) {
    bestMatch = TransformationType.MIXED;
  }

  return {
    success: true,
    transformation: bestMatch,
    confidence: bestScore >= 4 ? Confidence.HIGH : bestScore >= 2 ? Confidence.MEDIUM : Confidence.LOW,
    changedMetrics: changedMetrics.map(m => m.metric),
    preservedMetrics: unchangedMetrics,
    description: TRANSFORMATION_PATTERNS[bestMatch]?.description || 'Unknown transformation applied',
    matches: matches.slice(0, 3).map(m => ({ type: m.type, score: m.score }))
  };
}

/**
 * Trace complete lineage path for a version
 * 
 * @param {Object} tree - Lineage tree from buildLineageTree
 * @param {string} versionId - ID of version to trace
 * @returns {Object} Complete lineage path
 */
function traceLineage(tree, versionId) {
  if (!tree?.success || !tree.tree?.nodeMap) {
    return {
      success: false,
      error: 'Invalid lineage tree',
      path: []
    };
  }

  const nodeMap = tree.tree.nodeMap;
  if (!nodeMap.has(versionId)) {
    return {
      success: false,
      error: `Version ${versionId} not found in lineage`,
      path: []
    };
  }

  // Trace ancestors (up to root)
  const ancestors = [];
  let current = nodeMap.get(versionId);
  while (current.parentId && nodeMap.has(current.parentId)) {
    const parent = nodeMap.get(current.parentId);
    ancestors.unshift(parent);
    current = parent;
  }

  // Build path
  const node = nodeMap.get(versionId);
  const path = [...ancestors, node];

  // Trace descendants
  const descendants = [];
  const queue = [...node.children];
  while (queue.length > 0) {
    const child = queue.shift();
    descendants.push(child);
    queue.push(...child.children);
  }

  return {
    success: true,
    versionId,
    ancestors: ancestors.map(n => ({ id: n.id, state: n.state, depth: n.depth })),
    current: { id: node.id, state: node.state, depth: node.depth },
    descendants: descendants.map(n => ({ id: n.id, state: n.state, depth: n.depth })),
    path: path.map(n => n.id),
    depth: node.depth,
    root: ancestors.length > 0 ? ancestors[0].id : node.id,
    isRoot: ancestors.length === 0,
    isLeaf: node.children.length === 0
  };
}

/**
 * Determine relationship between two versions
 * 
 * @param {Object} tree - Lineage tree
 * @param {string} versionIdA - First version ID
 * @param {string} versionIdB - Second version ID
 * @returns {Object} Relationship analysis
 */
function getRelationship(tree, versionIdA, versionIdB) {
  if (!tree?.success || !tree.tree?.nodeMap) {
    return {
      success: false,
      error: 'Invalid lineage tree',
      relationship: Relationship.UNRELATED
    };
  }

  const nodeMap = tree.tree.nodeMap;
  if (!nodeMap.has(versionIdA) || !nodeMap.has(versionIdB)) {
    return {
      success: false,
      error: 'One or both versions not found',
      relationship: Relationship.UNRELATED
    };
  }

  if (versionIdA === versionIdB) {
    return {
      success: true,
      relationship: Relationship.UNRELATED,
      note: 'Same version'
    };
  }

  const lineageA = traceLineage(tree, versionIdA);
  const lineageB = traceLineage(tree, versionIdB);

  // Check parent-child
  const nodeA = nodeMap.get(versionIdA);
  const nodeB = nodeMap.get(versionIdB);

  if (nodeA.parentId === versionIdB) {
    return {
      success: true,
      relationship: Relationship.PARENT,
      note: `${versionIdB} is parent of ${versionIdA}`,
      distance: 1
    };
  }

  if (nodeB.parentId === versionIdA) {
    return {
      success: true,
      relationship: Relationship.CHILD,
      note: `${versionIdB} is child of ${versionIdA}`,
      distance: 1
    };
  }

  // Check ancestor-descendant
  if (lineageA.path.includes(versionIdB)) {
    return {
      success: true,
      relationship: Relationship.ANCESTOR,
      note: `${versionIdB} is ancestor of ${versionIdA}`,
      distance: lineageA.path.indexOf(versionIdB) - lineageA.path.length + 1
    };
  }

  if (lineageB.path.includes(versionIdA)) {
    return {
      success: true,
      relationship: Relationship.DESCENDANT,
      note: `${versionIdB} is descendant of ${versionIdA}`,
      distance: lineageB.path.indexOf(versionIdA) - lineageB.path.length + 1
    };
  }

  // Check sibling (same parent)
  if (nodeA.parentId && nodeA.parentId === nodeB.parentId) {
    return {
      success: true,
      relationship: Relationship.SIBLING,
      note: 'Versions share the same parent',
      commonParent: nodeA.parentId
    };
  }

  // Check for common ancestor
  const commonAncestor = lineageA.path.find(id => lineageB.path.includes(id));
  if (commonAncestor) {
    return {
      success: true,
      relationship: Relationship.SIBLING,
      note: 'Versions share a common ancestor',
      commonAncestor
    };
  }

  return {
    success: true,
    relationship: Relationship.UNRELATED,
    note: 'No lineage relationship found'
  };
}

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * Analyze lineage health across all versions
 * 
 * @param {Object[]} versions - Array of versions with metrics
 * @returns {Object} Lineage health analysis
 */
function analyzeLineageHealth(versions) {
  if (!Array.isArray(versions) || versions.length < 2) {
    return {
      success: false,
      error: 'At least 2 versions required for health analysis',
      health: LineageHealth.UNKNOWN
    };
  }

  const tree = buildLineageTree(versions);
  if (!tree.success) {
    return {
      success: false,
      error: tree.error,
      health: LineageHealth.UNKNOWN
    };
  }

  const versionMap = new Map(versions.map(v => [v.id, v]));
  const issues = [];
  const transitions = [];

  // Analyze each parent-child pair
  for (const [, node] of tree.tree.nodeMap) {
    if (!node.parentId) continue;

    const fromVersion = versionMap.get(node.parentId);
    const toVersion = versionMap.get(node.id);

    if (!fromVersion?.metrics || !toVersion?.metrics) continue;

    const delta = calculateDelta(fromVersion, toVersion);
    if (!delta.success) continue;

    const transformation = inferTransformation(delta);

    transitions.push({
      from: node.parentId,
      to: node.id,
      delta,
      transformation,
      severity: delta.overallSeverity
    });

    // Flag issues
    if (delta.overallSeverity === DeltaSeverity.CRITICAL) {
      issues.push({
        type: 'critical_delta',
        from: node.parentId,
        to: node.id,
        message: `Critical quality change detected between versions`,
        severity: 'high'
      });
    } else if (delta.overallSeverity === DeltaSeverity.MAJOR) {
      issues.push({
        type: 'major_delta',
        from: node.parentId,
        to: node.id,
        message: `Major quality change detected between versions`,
        severity: 'medium'
      });
    }

    // Check for unexpected metric changes
    if (transformation.transformation !== TransformationType.UNKNOWN) {
      const pattern = TRANSFORMATION_PATTERNS[transformation.transformation];
      if (pattern) {
        for (const preserved of pattern.preservedMetrics) {
          const deltaInfo = delta.deltas[preserved];
          if (deltaInfo && deltaInfo.severity !== DeltaSeverity.NONE) {
            issues.push({
              type: 'unexpected_change',
              from: node.parentId,
              to: node.id,
              metric: preserved,
              message: `${preserved} changed unexpectedly during ${transformation.transformation}`,
              severity: 'low'
            });
          }
        }
      }
    }
  }

  // Determine overall health
  let health = LineageHealth.HEALTHY;
  const criticalCount = issues.filter(i => i.severity === 'high').length;
  const mediumCount = issues.filter(i => i.severity === 'medium').length;
  const lowCount = issues.filter(i => i.severity === 'low').length;

  if (criticalCount > 0) {
    health = LineageHealth.CRITICAL;
  } else if (mediumCount >= 2 || (mediumCount >= 1 && lowCount >= 3)) {
    health = LineageHealth.CONCERNING;
  } else if (mediumCount > 0 || lowCount >= 2) {
    health = LineageHealth.DEGRADED;
  }

  return {
    success: true,
    health,
    healthDescription: STATUS_DESCRIPTIONS[health],
    summary: {
      totalVersions: versions.length,
      analyzedTransitions: transitions.length,
      issueCount: issues.length,
      criticalIssues: criticalCount,
      mediumIssues: mediumCount,
      lowIssues: lowCount
    },
    issues,
    transitions,
    tree: tree.tree
  };
}

/**
 * Find all versions matching specific criteria in lineage
 * 
 * @param {Object} tree - Lineage tree
 * @param {Object} criteria - Search criteria
 * @returns {Object} Matching versions
 */
function findVersions(tree, criteria = {}) {
  if (!tree?.success || !tree.tree?.nodeMap) {
    return {
      success: false,
      error: 'Invalid lineage tree',
      matches: []
    };
  }

  const matches = [];

  for (const [, node] of tree.tree.nodeMap) {
    let match = true;

    if (criteria.state && node.state !== criteria.state) {
      match = false;
    }
    if (criteria.minDepth !== undefined && node.depth < criteria.minDepth) {
      match = false;
    }
    if (criteria.maxDepth !== undefined && node.depth > criteria.maxDepth) {
      match = false;
    }
    if (criteria.isLeaf !== undefined && (node.children.length === 0) !== criteria.isLeaf) {
      match = false;
    }
    if (criteria.isRoot !== undefined && (!node.parentId) !== criteria.isRoot) {
      match = false;
    }

    if (match) {
      matches.push({
        id: node.id,
        state: node.state,
        depth: node.depth,
        childCount: node.children.length,
        parentId: node.parentId
      });
    }
  }

  return {
    success: true,
    matches,
    matchCount: matches.length,
    criteria
  };
}

/**
 * Compare two branches in the lineage
 * 
 * @param {Object[]} versions - All versions with metrics
 * @param {string} branchARoot - Root version ID for branch A
 * @param {string} branchBRoot - Root version ID for branch B
 * @returns {Object} Branch comparison
 */
function compareBranches(versions, branchARoot, branchBRoot) {
  if (!Array.isArray(versions)) {
    return {
      success: false,
      error: 'Versions array required',
      comparison: null
    };
  }

  const tree = buildLineageTree(versions);
  if (!tree.success) {
    return tree;
  }

  const versionMap = new Map(versions.map(v => [v.id, v]));

  // Get all versions in each branch
  const getBranchVersions = (rootId) => {
    const result = [];
    const queue = [tree.tree.nodeMap.get(rootId)];
    while (queue.length > 0) {
      const node = queue.shift();
      if (node) {
        result.push(node.id);
        queue.push(...node.children);
      }
    }
    return result;
  };

  const branchA = getBranchVersions(branchARoot);
  const branchB = getBranchVersions(branchBRoot);

  if (branchA.length === 0 || branchB.length === 0) {
    return {
      success: false,
      error: 'One or both branches not found',
      comparison: null
    };
  }

  // Calculate aggregate metrics for each branch
  const calculateBranchMetrics = (branchIds) => {
    const metrics = { lufs: [], dynamicRange: [], truePeak: [] };
    for (const id of branchIds) {
      const v = versionMap.get(id);
      if (v?.metrics) {
        if (v.metrics.integratedLufs !== undefined) metrics.lufs.push(v.metrics.integratedLufs);
        if (v.metrics.loudnessRange !== undefined) metrics.dynamicRange.push(v.metrics.loudnessRange);
        if (v.metrics.truePeakDbtp !== undefined) metrics.truePeak.push(v.metrics.truePeakDbtp);
      }
    }
    return {
      avgLufs: metrics.lufs.length > 0 ? metrics.lufs.reduce((a, b) => a + b, 0) / metrics.lufs.length : null,
      avgDynamicRange: metrics.dynamicRange.length > 0 ? metrics.dynamicRange.reduce((a, b) => a + b, 0) / metrics.dynamicRange.length : null,
      maxTruePeak: metrics.truePeak.length > 0 ? Math.max(...metrics.truePeak) : null,
      versionCount: branchIds.length
    };
  };

  const metricsA = calculateBranchMetrics(branchA);
  const metricsB = calculateBranchMetrics(branchB);

  return {
    success: true,
    branchA: {
      root: branchARoot,
      versions: branchA,
      metrics: metricsA
    },
    branchB: {
      root: branchBRoot,
      versions: branchB,
      metrics: metricsB
    },
    comparison: {
      lufsDelta: metricsA.avgLufs !== null && metricsB.avgLufs !== null 
        ? Math.round((metricsB.avgLufs - metricsA.avgLufs) * 100) / 100 : null,
      dynamicRangeDelta: metricsA.avgDynamicRange !== null && metricsB.avgDynamicRange !== null
        ? Math.round((metricsB.avgDynamicRange - metricsA.avgDynamicRange) * 100) / 100 : null,
      truePeakDelta: metricsA.maxTruePeak !== null && metricsB.maxTruePeak !== null
        ? Math.round((metricsB.maxTruePeak - metricsA.maxTruePeak) * 100) / 100 : null
    }
  };
}

// ============================================================================
// Quick Check Functions
// ============================================================================

/**
 * Quick lineage check for a version
 * 
 * @param {Object[]} versions - All versions
 * @param {string} versionId - Version to check
 * @returns {Object} Quick status
 */
function quickCheck(versions, versionId) {
  if (!Array.isArray(versions) || !versionId) {
    return {
      valid: false,
      error: 'Versions array and versionId required'
    };
  }

  const tree = buildLineageTree(versions);
  if (!tree.success) {
    return {
      valid: false,
      error: tree.error
    };
  }

  const lineage = traceLineage(tree, versionId);
  if (!lineage.success) {
    return {
      valid: false,
      error: lineage.error
    };
  }

  const version = versions.find(v => v.id === versionId);
  const parent = lineage.ancestors.length > 0 
    ? versions.find(v => v.id === lineage.ancestors[lineage.ancestors.length - 1].id)
    : null;

  let lastDelta = null;
  if (parent && version?.metrics && parent?.metrics) {
    lastDelta = calculateDelta(parent, version);
  }

  return {
    valid: true,
    versionId,
    state: lineage.current.state,
    depth: lineage.depth,
    isRoot: lineage.isRoot,
    isLeaf: lineage.isLeaf,
    ancestorCount: lineage.ancestors.length,
    descendantCount: lineage.descendants.length,
    lastTransition: lastDelta?.success ? {
      from: parent.id,
      severity: lastDelta.overallSeverity
    } : null,
    path: lineage.path
  };
}

/**
 * Validate lineage integrity
 * 
 * @param {Object[]} versions - All versions
 * @returns {Object} Integrity check result
 */
function validateIntegrity(versions) {
  if (!Array.isArray(versions)) {
    return {
      valid: false,
      error: 'Versions array required',
      issues: []
    };
  }

  const issues = [];
  const idSet = new Set(versions.map(v => v.id));

  // Check for orphaned references
  for (const version of versions) {
    if (version.parentId && !idSet.has(version.parentId)) {
      issues.push({
        type: 'orphan_reference',
        versionId: version.id,
        message: `Parent ${version.parentId} not found in versions`
      });
    }
  }

  // Check for cycles
  for (const version of versions) {
    const visited = new Set();
    let current = version;
    while (current && current.parentId) {
      if (visited.has(current.id)) {
        issues.push({
          type: 'cycle_detected',
          versionId: version.id,
          message: 'Circular reference detected in lineage'
        });
        break;
      }
      visited.add(current.id);
      current = versions.find(v => v.id === current.parentId);
    }
  }

  // Check for duplicate IDs
  const duplicates = versions.filter((v, i) => 
    versions.findIndex(v2 => v2.id === v.id) !== i
  );
  for (const dup of duplicates) {
    issues.push({
      type: 'duplicate_id',
      versionId: dup.id,
      message: 'Duplicate version ID found'
    });
  }

  return {
    valid: issues.length === 0,
    integrity: issues.length === 0 ? 'valid' : 'invalid',
    issues,
    stats: {
      totalVersions: versions.length,
      uniqueIds: idSet.size,
      issueCount: issues.length
    }
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate human-readable delta summary
 */
function generateDeltaSummary(deltas, severity) {
  const changes = Object.entries(deltas)
    .filter(([, info]) => info.severity !== DeltaSeverity.NONE)
    .map(([metric, info]) => `${metric}: ${info.delta > 0 ? '+' : ''}${info.delta}`);

  if (changes.length === 0) {
    return 'No significant changes detected';
  }

  const severityText = {
    [DeltaSeverity.MINOR]: 'Minor',
    [DeltaSeverity.MODERATE]: 'Moderate',
    [DeltaSeverity.MAJOR]: 'Major',
    [DeltaSeverity.CRITICAL]: 'Critical'
  };

  return `${severityText[severity] || 'Notable'} changes: ${changes.join(', ')}`;
}

/**
 * Format version info for display
 */
function formatVersionInfo(node) {
  return {
    id: node.id,
    state: node.state,
    depth: node.depth,
    hasChildren: node.children.length > 0,
    hasParent: !!node.parentId
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Enums
  VersionState,
  Relationship,
  DeltaSeverity,
  TransformationType,
  LineageHealth,
  Confidence,
  
  // Constants
  DELTA_THRESHOLDS,
  TRANSFORMATION_PATTERNS,
  STATUS_DESCRIPTIONS,
  
  // Core functions
  buildLineageTree,
  calculateDelta,
  inferTransformation,
  traceLineage,
  getRelationship,
  
  // Analysis functions
  analyzeLineageHealth,
  findVersions,
  compareBranches,
  
  // Quick check functions
  quickCheck,
  validateIntegrity,
  
  // Helpers
  formatVersionInfo
};
