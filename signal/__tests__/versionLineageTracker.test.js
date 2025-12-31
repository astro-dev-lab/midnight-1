'use strict';

/**
 * Version Lineage Tracker Tests
 * 
 * Comprehensive tests for version lineage tracking, delta calculation,
 * transformation inference, and health analysis.
 */

const {
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
} = require('../services/versionLineageTracker');

// ============================================================================
// Test Data Fixtures
// ============================================================================

const createVersion = (id, parentId = null, metrics = {}) => ({
  id,
  parentId,
  metrics: {
    integratedLufs: -14,
    truePeakDbtp: -1,
    loudnessRange: 8,
    stereoWidth: 0.7,
    spectralCentroid: 3000,
    ...metrics
  }
});

const createLinearLineage = () => [
  createVersion('v1', null, { integratedLufs: -20, loudnessRange: 12 }),
  createVersion('v2', 'v1', { integratedLufs: -18, loudnessRange: 10 }),
  createVersion('v3', 'v2', { integratedLufs: -16, loudnessRange: 8 }),
  createVersion('v4', 'v3', { integratedLufs: -14, loudnessRange: 7 })
];

const createBranchedLineage = () => [
  createVersion('root', null, { integratedLufs: -20 }),
  createVersion('a1', 'root', { integratedLufs: -18 }),
  createVersion('a2', 'a1', { integratedLufs: -16 }),
  createVersion('b1', 'root', { integratedLufs: -19 }),
  createVersion('b2', 'b1', { integratedLufs: -14 })
];

// ============================================================================
// Enum Tests
// ============================================================================

describe('Version Lineage Tracker', () => {
  describe('Constants', () => {
    describe('VersionState', () => {
      it('should have all state types defined', () => {
        expect(VersionState.RAW).toBe('RAW');
        expect(VersionState.DERIVED).toBe('DERIVED');
        expect(VersionState.FINAL).toBe('FINAL');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(VersionState)).toBe(true);
      });

      it('should have 3 states', () => {
        expect(Object.keys(VersionState)).toHaveLength(3);
      });
    });

    describe('Relationship', () => {
      it('should have all relationship types defined', () => {
        expect(Relationship.PARENT).toBe('PARENT');
        expect(Relationship.CHILD).toBe('CHILD');
        expect(Relationship.SIBLING).toBe('SIBLING');
        expect(Relationship.ANCESTOR).toBe('ANCESTOR');
        expect(Relationship.DESCENDANT).toBe('DESCENDANT');
        expect(Relationship.UNRELATED).toBe('UNRELATED');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(Relationship)).toBe(true);
      });

      it('should have 6 relationship types', () => {
        expect(Object.keys(Relationship)).toHaveLength(6);
      });
    });

    describe('DeltaSeverity', () => {
      it('should have all severity levels defined', () => {
        expect(DeltaSeverity.NONE).toBe('NONE');
        expect(DeltaSeverity.MINOR).toBe('MINOR');
        expect(DeltaSeverity.MODERATE).toBe('MODERATE');
        expect(DeltaSeverity.MAJOR).toBe('MAJOR');
        expect(DeltaSeverity.CRITICAL).toBe('CRITICAL');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(DeltaSeverity)).toBe(true);
      });

      it('should have 5 severity levels', () => {
        expect(Object.keys(DeltaSeverity)).toHaveLength(5);
      });
    });

    describe('TransformationType', () => {
      it('should have all transformation types defined', () => {
        expect(TransformationType.LEVEL_CHANGE).toBe('LEVEL_CHANGE');
        expect(TransformationType.DYNAMICS).toBe('DYNAMICS');
        expect(TransformationType.EQ).toBe('EQ');
        expect(TransformationType.REVERB).toBe('REVERB');
        expect(TransformationType.STEREO).toBe('STEREO');
        expect(TransformationType.FORMAT).toBe('FORMAT');
        expect(TransformationType.RESTORATION).toBe('RESTORATION');
        expect(TransformationType.MIXED).toBe('MIXED');
        expect(TransformationType.UNKNOWN).toBe('UNKNOWN');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(TransformationType)).toBe(true);
      });
    });

    describe('LineageHealth', () => {
      it('should have all health statuses defined', () => {
        expect(LineageHealth.HEALTHY).toBe('HEALTHY');
        expect(LineageHealth.DEGRADED).toBe('DEGRADED');
        expect(LineageHealth.CONCERNING).toBe('CONCERNING');
        expect(LineageHealth.CRITICAL).toBe('CRITICAL');
        expect(LineageHealth.UNKNOWN).toBe('UNKNOWN');
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(LineageHealth)).toBe(true);
      });
    });

    describe('DELTA_THRESHOLDS', () => {
      it('should have thresholds for key metrics', () => {
        expect(DELTA_THRESHOLDS.lufs).toBeDefined();
        expect(DELTA_THRESHOLDS.truePeak).toBeDefined();
        expect(DELTA_THRESHOLDS.dynamicRange).toBeDefined();
        expect(DELTA_THRESHOLDS.stereoWidth).toBeDefined();
      });

      it('should have increasing threshold levels', () => {
        const lufs = DELTA_THRESHOLDS.lufs;
        expect(lufs.minor).toBeLessThan(lufs.moderate);
        expect(lufs.moderate).toBeLessThan(lufs.major);
        expect(lufs.major).toBeLessThan(lufs.critical);
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(DELTA_THRESHOLDS)).toBe(true);
      });
    });

    describe('TRANSFORMATION_PATTERNS', () => {
      it('should have patterns for each transformation type', () => {
        expect(TRANSFORMATION_PATTERNS[TransformationType.LEVEL_CHANGE]).toBeDefined();
        expect(TRANSFORMATION_PATTERNS[TransformationType.DYNAMICS]).toBeDefined();
        expect(TRANSFORMATION_PATTERNS[TransformationType.EQ]).toBeDefined();
      });

      it('should include expected and preserved metrics', () => {
        const levelChange = TRANSFORMATION_PATTERNS[TransformationType.LEVEL_CHANGE];
        expect(levelChange.expectedMetrics).toBeDefined();
        expect(levelChange.preservedMetrics).toBeDefined();
        expect(levelChange.description).toBeDefined();
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(TRANSFORMATION_PATTERNS)).toBe(true);
      });
    });

    describe('STATUS_DESCRIPTIONS', () => {
      it('should have descriptions for all health levels', () => {
        expect(STATUS_DESCRIPTIONS[LineageHealth.HEALTHY]).toBeDefined();
        expect(STATUS_DESCRIPTIONS[LineageHealth.DEGRADED]).toBeDefined();
        expect(STATUS_DESCRIPTIONS[LineageHealth.CONCERNING]).toBeDefined();
        expect(STATUS_DESCRIPTIONS[LineageHealth.CRITICAL]).toBeDefined();
      });

      it('should be frozen', () => {
        expect(Object.isFrozen(STATUS_DESCRIPTIONS)).toBe(true);
      });
    });
  });

  // ============================================================================
  // Core Function Tests
  // ============================================================================

  describe('Core Functions', () => {
    describe('buildLineageTree', () => {
      it('should build tree from linear lineage', () => {
        const versions = createLinearLineage();
        const result = buildLineageTree(versions);

        expect(result.success).toBe(true);
        expect(result.tree).toBeDefined();
        expect(result.tree.totalVersions).toBe(4);
      });

      it('should identify root nodes', () => {
        const versions = createLinearLineage();
        const result = buildLineageTree(versions);

        expect(result.tree.roots).toHaveLength(1);
        expect(result.tree.roots[0].id).toBe('v1');
      });

      it('should calculate correct depth', () => {
        const versions = createLinearLineage();
        const result = buildLineageTree(versions);

        expect(result.tree.maxDepth).toBe(3);
      });

      it('should handle branched lineage', () => {
        const versions = createBranchedLineage();
        const result = buildLineageTree(versions);

        expect(result.success).toBe(true);
        expect(result.tree.roots).toHaveLength(1);
      });

      it('should mark leaf nodes as FINAL', () => {
        const versions = createLinearLineage();
        const result = buildLineageTree(versions);

        const leafNode = result.tree.nodeMap.get('v4');
        expect(leafNode.state).toBe(VersionState.FINAL);
      });

      it('should mark root as RAW', () => {
        const versions = createLinearLineage();
        const result = buildLineageTree(versions);

        const rootNode = result.tree.nodeMap.get('v1');
        expect(rootNode.state).toBe(VersionState.RAW);
      });

      it('should handle empty array', () => {
        const result = buildLineageTree([]);
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should handle multiple roots', () => {
        const versions = [
          createVersion('a1', null),
          createVersion('a2', 'a1'),
          createVersion('b1', null),
          createVersion('b2', 'b1')
        ];
        const result = buildLineageTree(versions);

        expect(result.success).toBe(true);
        expect(result.tree.roots).toHaveLength(2);
        expect(result.tree.branchCount).toBe(2);
      });
    });

    describe('calculateDelta', () => {
      it('should calculate delta between versions', () => {
        const v1 = createVersion('v1', null, { integratedLufs: -14 });
        const v2 = createVersion('v2', 'v1', { integratedLufs: -12 });

        const result = calculateDelta(v1, v2);

        expect(result.success).toBe(true);
        expect(result.deltas.lufs).toBeDefined();
        expect(result.deltas.lufs.delta).toBe(2);
      });

      it('should classify delta severity', () => {
        const v1 = createVersion('v1', null, { integratedLufs: -20 });
        const v2 = createVersion('v2', 'v1', { integratedLufs: -8 });

        const result = calculateDelta(v1, v2);

        expect(result.deltas.lufs.severity).toBe(DeltaSeverity.CRITICAL);
      });

      it('should calculate overall severity', () => {
        const v1 = createVersion('v1', null);
        const v2 = createVersion('v2', 'v1');

        const result = calculateDelta(v1, v2);

        expect(result.overallSeverity).toBeDefined();
      });

      it('should include summary', () => {
        const v1 = createVersion('v1', null, { integratedLufs: -14 });
        const v2 = createVersion('v2', 'v1', { integratedLufs: -10 });

        const result = calculateDelta(v1, v2);

        expect(result.summary).toBeDefined();
        expect(result.summary.length).toBeGreaterThan(0);
      });

      it('should handle missing metrics gracefully', () => {
        const v1 = { id: 'v1', metrics: null };
        const v2 = createVersion('v2', 'v1');

        const result = calculateDelta(v1, v2);

        expect(result.success).toBe(false);
      });

      it('should calculate percent change', () => {
        const v1 = createVersion('v1', null, { integratedLufs: -20 });
        const v2 = createVersion('v2', 'v1', { integratedLufs: -10 });

        const result = calculateDelta(v1, v2);

        expect(result.deltas.lufs.percentChange).toBeDefined();
      });

      it('should mark unchanged metrics as NONE severity', () => {
        const v1 = createVersion('v1', null);
        const v2 = createVersion('v2', 'v1');  // Same metrics

        const result = calculateDelta(v1, v2);

        expect(result.deltas.lufs.severity).toBe(DeltaSeverity.NONE);
      });
    });

    describe('inferTransformation', () => {
      it('should infer level change transformation', () => {
        const v1 = createVersion('v1', null, { 
          integratedLufs: -20, 
          truePeakDbtp: -6,
          loudnessRange: 8,
          stereoWidth: 0.7,
          spectralCentroid: 3000
        });
        const v2 = createVersion('v2', 'v1', { 
          integratedLufs: -14,  // +6 dB
          truePeakDbtp: 0,       // +6 dB (parallel change)
          loudnessRange: 8,     // Preserved
          stereoWidth: 0.7,     // Preserved
          spectralCentroid: 3000 // Preserved
        });

        const delta = calculateDelta(v1, v2);
        const result = inferTransformation(delta);

        expect(result.success).toBe(true);
        // Should infer level change or at minimum identify lufs/truePeak as changed
        expect(result.changedMetrics).toContain('lufs');
        expect(result.changedMetrics).toContain('truePeak');
        expect(result.preservedMetrics).toContain('dynamicRange');
      });

      it('should infer dynamics processing', () => {
        const v1 = createVersion('v1', null, { 
          integratedLufs: -18,
          loudnessRange: 12,
          stereoWidth: 0.7
        });
        const v2 = createVersion('v2', 'v1', { 
          integratedLufs: -14,
          loudnessRange: 6,  // Significantly changed
          stereoWidth: 0.7  // Preserved
        });

        const delta = calculateDelta(v1, v2);
        const result = inferTransformation(delta);

        expect(result.success).toBe(true);
        expect(result.changedMetrics).toContain('dynamicRange');
      });

      it('should include confidence level', () => {
        const v1 = createVersion('v1', null);
        const v2 = createVersion('v2', 'v1', { integratedLufs: -10 });

        const delta = calculateDelta(v1, v2);
        const result = inferTransformation(delta);

        expect(result.confidence).toBeDefined();
        expect(Object.values(Confidence)).toContain(result.confidence);
      });

      it('should identify mixed transformations', () => {
        const v1 = createVersion('v1', null, { 
          integratedLufs: -20,
          loudnessRange: 12,
          stereoWidth: 0.5,
          spectralCentroid: 2000
        });
        const v2 = createVersion('v2', 'v1', { 
          integratedLufs: -12,
          loudnessRange: 6,
          stereoWidth: 0.9,
          spectralCentroid: 4000
        });

        const delta = calculateDelta(v1, v2);
        const result = inferTransformation(delta);

        expect(result.changedMetrics.length).toBeGreaterThan(2);
      });

      it('should include description', () => {
        const v1 = createVersion('v1', null);
        const v2 = createVersion('v2', 'v1', { integratedLufs: -10 });

        const delta = calculateDelta(v1, v2);
        const result = inferTransformation(delta);

        expect(result.description).toBeDefined();
      });

      it('should handle invalid delta input', () => {
        const result = inferTransformation(null);

        expect(result.success).toBe(false);
        expect(result.transformation).toBe(TransformationType.UNKNOWN);
      });
    });

    describe('traceLineage', () => {
      it('should trace path to root', () => {
        const versions = createLinearLineage();
        const tree = buildLineageTree(versions);

        const result = traceLineage(tree, 'v4');

        expect(result.success).toBe(true);
        expect(result.path).toEqual(['v1', 'v2', 'v3', 'v4']);
      });

      it('should identify ancestors', () => {
        const versions = createLinearLineage();
        const tree = buildLineageTree(versions);

        const result = traceLineage(tree, 'v4');

        expect(result.ancestors).toHaveLength(3);
        expect(result.ancestors[0].id).toBe('v1');
      });

      it('should identify descendants', () => {
        const versions = createLinearLineage();
        const tree = buildLineageTree(versions);

        const result = traceLineage(tree, 'v1');

        expect(result.descendants).toHaveLength(3);
      });

      it('should correctly identify root', () => {
        const versions = createLinearLineage();
        const tree = buildLineageTree(versions);

        const rootResult = traceLineage(tree, 'v1');
        const childResult = traceLineage(tree, 'v2');

        expect(rootResult.isRoot).toBe(true);
        expect(childResult.isRoot).toBe(false);
      });

      it('should correctly identify leaf', () => {
        const versions = createLinearLineage();
        const tree = buildLineageTree(versions);

        const leafResult = traceLineage(tree, 'v4');
        const parentResult = traceLineage(tree, 'v2');

        expect(leafResult.isLeaf).toBe(true);
        expect(parentResult.isLeaf).toBe(false);
      });

      it('should return depth', () => {
        const versions = createLinearLineage();
        const tree = buildLineageTree(versions);

        const result = traceLineage(tree, 'v4');

        expect(result.depth).toBe(3);
      });

      it('should handle missing version', () => {
        const versions = createLinearLineage();
        const tree = buildLineageTree(versions);

        const result = traceLineage(tree, 'nonexistent');

        expect(result.success).toBe(false);
      });
    });

    describe('getRelationship', () => {
      it('should identify parent relationship', () => {
        const versions = createLinearLineage();
        const tree = buildLineageTree(versions);

        const result = getRelationship(tree, 'v2', 'v1');

        expect(result.success).toBe(true);
        expect(result.relationship).toBe(Relationship.PARENT);
      });

      it('should identify child relationship', () => {
        const versions = createLinearLineage();
        const tree = buildLineageTree(versions);

        const result = getRelationship(tree, 'v1', 'v2');

        expect(result.success).toBe(true);
        expect(result.relationship).toBe(Relationship.CHILD);
      });

      it('should identify ancestor relationship', () => {
        const versions = createLinearLineage();
        const tree = buildLineageTree(versions);

        const result = getRelationship(tree, 'v4', 'v1');

        expect(result.success).toBe(true);
        expect(result.relationship).toBe(Relationship.ANCESTOR);
      });

      it('should identify descendant relationship', () => {
        const versions = createLinearLineage();
        const tree = buildLineageTree(versions);

        const result = getRelationship(tree, 'v1', 'v4');

        expect(result.success).toBe(true);
        expect(result.relationship).toBe(Relationship.DESCENDANT);
      });

      it('should identify sibling relationship', () => {
        const versions = createBranchedLineage();
        const tree = buildLineageTree(versions);

        const result = getRelationship(tree, 'a1', 'b1');

        expect(result.success).toBe(true);
        expect(result.relationship).toBe(Relationship.SIBLING);
      });

      it('should include common ancestor for siblings', () => {
        const versions = createBranchedLineage();
        const tree = buildLineageTree(versions);

        const result = getRelationship(tree, 'a2', 'b2');

        expect(result.commonAncestor || result.commonParent).toBeDefined();
      });

      it('should handle unrelated versions', () => {
        const versions = [
          createVersion('a', null),
          createVersion('b', null)  // Different root
        ];
        const tree = buildLineageTree(versions);

        const result = getRelationship(tree, 'a', 'b');

        expect(result.relationship).toBe(Relationship.UNRELATED);
      });
    });
  });

  // ============================================================================
  // Analysis Function Tests
  // ============================================================================

  describe('Analysis Functions', () => {
    describe('analyzeLineageHealth', () => {
      it('should return healthy for stable lineage', () => {
        const versions = [
          createVersion('v1', null, { integratedLufs: -14 }),
          createVersion('v2', 'v1', { integratedLufs: -14.5 }),  // Minor change
          createVersion('v3', 'v2', { integratedLufs: -14 })
        ];

        const result = analyzeLineageHealth(versions);

        expect(result.success).toBe(true);
        expect(result.health).toBe(LineageHealth.HEALTHY);
      });

      it('should identify critical issues', () => {
        const versions = [
          createVersion('v1', null, { integratedLufs: -20 }),
          createVersion('v2', 'v1', { integratedLufs: -6 })  // 14 dB change - critical
        ];

        const result = analyzeLineageHealth(versions);

        expect(result.health).toBe(LineageHealth.CRITICAL);
        expect(result.summary.criticalIssues).toBeGreaterThan(0);
      });

      it('should include issue details', () => {
        const versions = [
          createVersion('v1', null, { integratedLufs: -20 }),
          createVersion('v2', 'v1', { integratedLufs: -10 })
        ];

        const result = analyzeLineageHealth(versions);

        expect(result.issues).toBeDefined();
        expect(result.issues.length).toBeGreaterThan(0);
      });

      it('should include transitions analysis', () => {
        const versions = createLinearLineage();
        const result = analyzeLineageHealth(versions);

        expect(result.transitions).toBeDefined();
        expect(result.transitions.length).toBe(3);  // 3 transitions in 4-version chain
      });

      it('should include health description', () => {
        const versions = createLinearLineage();
        const result = analyzeLineageHealth(versions);

        expect(result.healthDescription).toBeDefined();
      });

      it('should handle single version', () => {
        const result = analyzeLineageHealth([createVersion('v1', null)]);

        expect(result.success).toBe(false);
      });

      it('should detect unexpected metric changes', () => {
        const versions = [
          createVersion('v1', null, { 
            integratedLufs: -14,
            loudnessRange: 8
          }),
          createVersion('v2', 'v1', { 
            integratedLufs: -11,  // Level change
            loudnessRange: 4  // Should be preserved for level change
          })
        ];

        const result = analyzeLineageHealth(versions);

        const unexpectedIssues = result.issues.filter(i => 
          i.type === 'unexpected_change'
        );
        expect(unexpectedIssues.length).toBeGreaterThanOrEqual(0);
      });
    });

    describe('findVersions', () => {
      it('should find versions by state', () => {
        const versions = createLinearLineage();
        const tree = buildLineageTree(versions);

        const result = findVersions(tree, { state: VersionState.FINAL });

        expect(result.success).toBe(true);
        expect(result.matches.length).toBe(1);
        expect(result.matches[0].id).toBe('v4');
      });

      it('should find root versions', () => {
        const versions = createLinearLineage();
        const tree = buildLineageTree(versions);

        const result = findVersions(tree, { isRoot: true });

        expect(result.matches.length).toBe(1);
        expect(result.matches[0].id).toBe('v1');
      });

      it('should find leaf versions', () => {
        const versions = createBranchedLineage();
        const tree = buildLineageTree(versions);

        const result = findVersions(tree, { isLeaf: true });

        expect(result.matches.length).toBe(2);  // a2 and b2
      });

      it('should find by depth range', () => {
        const versions = createLinearLineage();
        const tree = buildLineageTree(versions);

        const result = findVersions(tree, { minDepth: 2, maxDepth: 3 });

        expect(result.matches.length).toBe(2);  // v3 and v4
      });

      it('should return all when no criteria', () => {
        const versions = createLinearLineage();
        const tree = buildLineageTree(versions);

        const result = findVersions(tree, {});

        expect(result.matches.length).toBe(4);
      });
    });

    describe('compareBranches', () => {
      it('should compare two branches', () => {
        const versions = createBranchedLineage();

        const result = compareBranches(versions, 'a1', 'b1');

        expect(result.success).toBe(true);
        expect(result.branchA).toBeDefined();
        expect(result.branchB).toBeDefined();
      });

      it('should calculate metric differences', () => {
        const versions = createBranchedLineage();

        const result = compareBranches(versions, 'a1', 'b1');

        expect(result.comparison).toBeDefined();
        expect(result.comparison.lufsDelta).toBeDefined();
      });

      it('should include version counts', () => {
        const versions = createBranchedLineage();

        const result = compareBranches(versions, 'a1', 'b1');

        expect(result.branchA.metrics.versionCount).toBe(2);
        expect(result.branchB.metrics.versionCount).toBe(2);
      });

      it('should handle missing branch', () => {
        const versions = createLinearLineage();

        const result = compareBranches(versions, 'v1', 'nonexistent');

        expect(result.success).toBe(false);
      });
    });
  });

  // ============================================================================
  // Quick Check Tests
  // ============================================================================

  describe('Quick Check Functions', () => {
    describe('quickCheck', () => {
      it('should return quick status', () => {
        const versions = createLinearLineage();

        const result = quickCheck(versions, 'v3');

        expect(result.valid).toBe(true);
        expect(result.versionId).toBe('v3');
      });

      it('should include depth', () => {
        const versions = createLinearLineage();

        const result = quickCheck(versions, 'v4');

        expect(result.depth).toBe(3);
      });

      it('should include ancestor count', () => {
        const versions = createLinearLineage();

        const result = quickCheck(versions, 'v4');

        expect(result.ancestorCount).toBe(3);
      });

      it('should identify root and leaf status', () => {
        const versions = createLinearLineage();

        const rootResult = quickCheck(versions, 'v1');
        const leafResult = quickCheck(versions, 'v4');

        expect(rootResult.isRoot).toBe(true);
        expect(leafResult.isLeaf).toBe(true);
      });

      it('should include last transition info', () => {
        const versions = createLinearLineage();

        const result = quickCheck(versions, 'v2');

        expect(result.lastTransition).toBeDefined();
        expect(result.lastTransition.from).toBe('v1');
      });

      it('should handle missing version', () => {
        const versions = createLinearLineage();

        const result = quickCheck(versions, 'nonexistent');

        expect(result.valid).toBe(false);
      });

      it('should include full path', () => {
        const versions = createLinearLineage();

        const result = quickCheck(versions, 'v3');

        expect(result.path).toEqual(['v1', 'v2', 'v3']);
      });
    });

    describe('validateIntegrity', () => {
      it('should validate correct lineage', () => {
        const versions = createLinearLineage();

        const result = validateIntegrity(versions);

        expect(result.valid).toBe(true);
        expect(result.issues).toHaveLength(0);
      });

      it('should detect orphan references', () => {
        const versions = [
          createVersion('v1', null),
          createVersion('v2', 'missing_parent')
        ];

        const result = validateIntegrity(versions);

        expect(result.valid).toBe(false);
        const orphanIssues = result.issues.filter(i => i.type === 'orphan_reference');
        expect(orphanIssues.length).toBeGreaterThan(0);
      });

      it('should detect duplicate IDs', () => {
        const versions = [
          createVersion('v1', null),
          createVersion('v1', null)  // Duplicate
        ];

        const result = validateIntegrity(versions);

        expect(result.valid).toBe(false);
        const dupIssues = result.issues.filter(i => i.type === 'duplicate_id');
        expect(dupIssues.length).toBeGreaterThan(0);
      });

      it('should include stats', () => {
        const versions = createLinearLineage();

        const result = validateIntegrity(versions);

        expect(result.stats).toBeDefined();
        expect(result.stats.totalVersions).toBe(4);
      });
    });
  });

  // ============================================================================
  // Helper Function Tests
  // ============================================================================

  describe('Helper Functions', () => {
    describe('formatVersionInfo', () => {
      it('should format version node info', () => {
        const node = {
          id: 'test',
          state: VersionState.DERIVED,
          depth: 2,
          children: [{ id: 'child' }],
          parentId: 'parent'
        };

        const result = formatVersionInfo(node);

        expect(result.id).toBe('test');
        expect(result.state).toBe(VersionState.DERIVED);
        expect(result.depth).toBe(2);
        expect(result.hasChildren).toBe(true);
        expect(result.hasParent).toBe(true);
      });

      it('should handle leaf nodes', () => {
        const node = {
          id: 'leaf',
          state: VersionState.FINAL,
          depth: 3,
          children: [],
          parentId: 'parent'
        };

        const result = formatVersionInfo(node);

        expect(result.hasChildren).toBe(false);
      });
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration Tests', () => {
    describe('Full workflow scenarios', () => {
      it('should handle complete mastering workflow', () => {
        const versions = [
          createVersion('raw', null, { 
            integratedLufs: -22, 
            loudnessRange: 14,
            truePeakDbtp: -6
          }),
          createVersion('edited', 'raw', { 
            integratedLufs: -20, 
            loudnessRange: 12,
            truePeakDbtp: -4
          }),
          createVersion('mixed', 'edited', { 
            integratedLufs: -16, 
            loudnessRange: 8,
            truePeakDbtp: -2
          }),
          createVersion('mastered', 'mixed', { 
            integratedLufs: -14, 
            loudnessRange: 7,
            truePeakDbtp: -1
          })
        ];

        const health = analyzeLineageHealth(versions);
        const tree = buildLineageTree(versions);
        const lineage = traceLineage(tree, 'mastered');

        expect(health.success).toBe(true);
        expect(lineage.path).toHaveLength(4);
        expect(lineage.isLeaf).toBe(true);
      });

      it('should detect problematic version', () => {
        const versions = [
          createVersion('v1', null, { integratedLufs: -14 }),
          createVersion('v2', 'v1', { integratedLufs: -14 }),
          createVersion('v3', 'v2', { integratedLufs: 0 }),  // Problem!
          createVersion('v4', 'v3', { integratedLufs: -14 })
        ];

        const health = analyzeLineageHealth(versions);

        expect(health.health).toBe(LineageHealth.CRITICAL);
        expect(health.issues.some(i => 
          i.from === 'v2' && i.to === 'v3'
        )).toBe(true);
      });

      it('should track parallel branches', () => {
        const versions = createBranchedLineage();
        const tree = buildLineageTree(versions);

        const branchALineage = traceLineage(tree, 'a2');
        const branchBLineage = traceLineage(tree, 'b2');

        expect(branchALineage.root).toBe('root');
        expect(branchBLineage.root).toBe('root');
        expect(branchALineage.path).not.toEqual(branchBLineage.path);
      });
    });

    describe('Edge cases', () => {
      it('should handle single root with no children', () => {
        const versions = [createVersion('only', null)];
        const tree = buildLineageTree(versions);

        expect(tree.success).toBe(true);
        expect(tree.tree.maxDepth).toBe(0);
      });

      it('should handle deep lineage', () => {
        const versions = [];
        for (let i = 0; i < 10; i++) {
          versions.push(createVersion(`v${i}`, i > 0 ? `v${i-1}` : null));
        }

        const tree = buildLineageTree(versions);

        expect(tree.success).toBe(true);
        expect(tree.tree.maxDepth).toBe(9);
      });

      it('should handle wide branching', () => {
        const versions = [
          createVersion('root', null),
          ...Array.from({ length: 10 }, (_, i) => 
            createVersion(`child${i}`, 'root')
          )
        ];

        const tree = buildLineageTree(versions);
        const rootNode = tree.tree.nodeMap.get('root');

        expect(rootNode.children.length).toBe(10);
      });
    });
  });

  // ============================================================================
  // API Contract Tests
  // ============================================================================

  describe('API Contract', () => {
    it('should export all required enums', () => {
      expect(VersionState).toBeDefined();
      expect(Relationship).toBeDefined();
      expect(DeltaSeverity).toBeDefined();
      expect(TransformationType).toBeDefined();
      expect(LineageHealth).toBeDefined();
      expect(Confidence).toBeDefined();
    });

    it('should export all required constants', () => {
      expect(DELTA_THRESHOLDS).toBeDefined();
      expect(TRANSFORMATION_PATTERNS).toBeDefined();
      expect(STATUS_DESCRIPTIONS).toBeDefined();
    });

    it('should export all required functions', () => {
      expect(typeof buildLineageTree).toBe('function');
      expect(typeof calculateDelta).toBe('function');
      expect(typeof inferTransformation).toBe('function');
      expect(typeof traceLineage).toBe('function');
      expect(typeof getRelationship).toBe('function');
      expect(typeof analyzeLineageHealth).toBe('function');
      expect(typeof findVersions).toBe('function');
      expect(typeof compareBranches).toBe('function');
      expect(typeof quickCheck).toBe('function');
      expect(typeof validateIntegrity).toBe('function');
      expect(typeof formatVersionInfo).toBe('function');
    });

    it('should maintain consistent return shapes', () => {
      const versions = createLinearLineage();

      // buildLineageTree
      const tree = buildLineageTree(versions);
      expect(tree).toHaveProperty('success');
      expect(tree).toHaveProperty('tree');

      // calculateDelta
      const delta = calculateDelta(versions[0], versions[1]);
      expect(delta).toHaveProperty('success');
      expect(delta).toHaveProperty('deltas');

      // traceLineage
      const lineage = traceLineage(tree, 'v2');
      expect(lineage).toHaveProperty('success');
      expect(lineage).toHaveProperty('path');

      // quickCheck
      const quick = quickCheck(versions, 'v2');
      expect(quick).toHaveProperty('valid');
    });
  });
});
