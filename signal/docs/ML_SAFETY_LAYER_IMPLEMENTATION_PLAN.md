# ML Safety Layer Implementation Plan

**Version:** 1.0.0  
**Status:** PLANNING  
**Date:** 2024-12-31

---

## Overview

This document defines the implementation plan for four ML safety components that ensure reliable, fail-safe ML behavior in StudioOS.

Per **STUDIOOS_ML_INVESTMENT_CHARTER.md**:
> "ML exists to inform and constrain, not to create or guess."
> "ML that increases confusion or ambiguity is a failure."

These safety layers enforce that principle at runtime.

---

## Component Summary

| Component | Purpose | Failure Mode |
|-----------|---------|--------------|
| **Model Confidence Calibration Layer** | Prevent overconfident ML outputs | Reduces confidence to reflect true accuracy |
| **Signal Drift Detector** | Detect audio diverging from training norms | Flags out-of-distribution signals |
| **Cross-Signal Consistency Checker** | Flag contradictory ML conclusions | Blocks contradictory outputs |
| **Inference Failure Escalation Handler** | Ensure fail-closed behavior | Escalates gracefully, never fails silently |

---

## 1. Model Confidence Calibration Layer

### Purpose
Prevents ML models from reporting confidence scores that don't match their actual accuracy. Per the V2 Manifest, confidence calibration must be within **±10% of actual success rate**.

### Problem Statement
An ML model reporting 90% confidence but only achieving 70% accuracy misleads downstream decisions. This layer recalibrates raw model confidence to match empirical accuracy.

### Key Concepts

**Calibration Error**: The difference between predicted confidence and actual success rate.
```
calibration_error = |predicted_confidence - actual_accuracy|
```

**Expected Calibration Error (ECE)**: Average calibration error across confidence buckets.

**Temperature Scaling**: A post-hoc calibration technique that scales logits to improve calibration.

### Constants

```javascript
const CalibrationStatus = Object.freeze({
  WELL_CALIBRATED: 'WELL_CALIBRATED',     // Error < 5%
  SLIGHTLY_MISCALIBRATED: 'SLIGHTLY_MISCALIBRATED', // Error 5-10%
  MISCALIBRATED: 'MISCALIBRATED',         // Error 10-20%
  SEVERELY_MISCALIBRATED: 'SEVERELY_MISCALIBRATED'  // Error > 20%
});

const CALIBRATION_THRESHOLDS = Object.freeze({
  WELL_CALIBRATED: 0.05,
  SLIGHTLY_MISCALIBRATED: 0.10,
  MISCALIBRATED: 0.20,
  MAX_ALLOWED_OVERCONFIDENCE: 0.10,  // Per V2 Manifest
  MIN_CONFIDENCE_FLOOR: 0.35,        // Never report below this
  MAX_CONFIDENCE_CEILING: 0.95       // Never report above this
});

// Historical accuracy by confidence bucket (updated periodically)
const CALIBRATION_BUCKETS = Object.freeze({
  '0.90-1.00': { expectedAccuracy: 0.85, samples: 0 },
  '0.80-0.90': { expectedAccuracy: 0.78, samples: 0 },
  '0.70-0.80': { expectedAccuracy: 0.72, samples: 0 },
  '0.60-0.70': { expectedAccuracy: 0.65, samples: 0 },
  '0.50-0.60': { expectedAccuracy: 0.55, samples: 0 },
  '0.40-0.50': { expectedAccuracy: 0.45, samples: 0 },
  '0.00-0.40': { expectedAccuracy: 0.30, samples: 0 }
});
```

### Functions

| Function | Description | Inputs | Output |
|----------|-------------|--------|--------|
| `calibrateConfidence` | Apply calibration to raw confidence | `rawConfidence`, `modelId`, `context` | `{ calibrated, adjustment, status }` |
| `calculateCalibrationError` | Compute ECE for a model | `predictions[]`, `outcomes[]` | `{ ece, perBucket, status }` |
| `applyTemperatureScaling` | Scale logits for better calibration | `logits`, `temperature` | `calibratedProbabilities` |
| `updateCalibrationStats` | Update historical accuracy | `prediction`, `actualOutcome` | Updated bucket stats |
| `getModelCalibrationStatus` | Get current calibration health | `modelId` | `{ ece, status, recommendations }` |
| `quickCheck` | Fast calibration check | `rawConfidence`, `modelId` | `{ calibrated, wasAdjusted }` |
| `analyze` | Full calibration analysis | `modelId`, `recentPredictions` | Complete analysis |

### Integration Points

- Hook into `subgenreHeuristicsV2.js` at classification output
- Hook into `confidenceRecovery.js` before tier assignment
- Integrate with `decisionEngine.js` confidence scoring
- Add calibration metadata to ProcessingReport

### Output Structure

```javascript
{
  rawConfidence: 0.92,
  calibratedConfidence: 0.84,
  adjustment: -0.08,
  status: 'WELL_CALIBRATED',
  bucket: '0.90-1.00',
  expectedAccuracy: 0.85,
  wasClipped: false,
  calibrationMethod: 'historical_bucket',
  modelId: 'subgenre_v2',
  warnings: []
}
```

---

## 2. Signal Drift Detector

### Purpose
Detects when incoming audio signals diverge significantly from the training distribution of ML models. Out-of-distribution (OOD) inputs produce unreliable predictions.

### Problem Statement
Models trained on specific audio profiles (e.g., rap subgenres) may encounter inputs outside their training distribution (classical music, spoken word, heavily corrupted audio). These inputs produce unreliable classifications that should be flagged.

### Key Concepts

**Distribution Drift**: Statistical shift between training data and inference data.

**Mahalanobis Distance**: Measures how far a sample is from the training distribution center.

**Feature Space Monitoring**: Track signal features against expected ranges.

### Constants

```javascript
const DriftStatus = Object.freeze({
  IN_DISTRIBUTION: 'IN_DISTRIBUTION',       // Within expected range
  MINOR_DRIFT: 'MINOR_DRIFT',               // Slightly outside norms
  SIGNIFICANT_DRIFT: 'SIGNIFICANT_DRIFT',   // Clearly outside norms
  OUT_OF_DISTRIBUTION: 'OUT_OF_DISTRIBUTION' // Should not trust ML
});

const DRIFT_THRESHOLDS = Object.freeze({
  MINOR: 1.5,         // Standard deviations
  SIGNIFICANT: 2.5,   // Standard deviations
  OOD: 4.0            // Standard deviations
});

// Training distribution statistics (per model)
const TRAINING_DISTRIBUTION = Object.freeze({
  subgenre_v2: {
    signals: {
      bpm: { mean: 125, std: 25, min: 60, max: 200 },
      subBassEnergy: { mean: 0.55, std: 0.18, min: 0, max: 1 },
      transientDensity: { mean: 0.55, std: 0.20, min: 0, max: 1 },
      dynamicRange: { mean: 7, std: 3.5, min: 0, max: 20 },
      stereoWidth: { mean: 0.55, std: 0.18, min: 0, max: 1 },
      duration: { mean: 200, std: 60, min: 30, max: 600 },
      sampleRate: { expected: [44100, 48000, 88200, 96000] }
    },
    expectedGenres: ['rap', 'hiphop', 'trap', 'drill'],
    trainingSize: 10000,
    version: '2.0.0'
  }
});

// Signals that indicate severe OOD
const OOD_INDICATORS = Object.freeze({
  SILENCE: { maxRms: -60 },           // Effectively silent
  NOISE_ONLY: { minCrestFactor: 1 },  // Pure noise
  EXTREME_DURATION: { min: 5, max: 1800 }, // 5s - 30min
  MONO_SUM_CANCELLATION: { correlation: -0.9 }
});
```

### Functions

| Function | Description | Inputs | Output |
|----------|-------------|--------|--------|
| `detectDrift` | Full drift analysis | `signals`, `modelId` | `{ status, distances, oodSignals }` |
| `calculateMahalanobis` | Distance from distribution | `signal`, `mean`, `std` | `distance` (std devs) |
| `checkSignalBounds` | Check against hard limits | `signals` | `{ inBounds, violations }` |
| `detectOODIndicators` | Check for severe OOD signs | `audioMetrics` | `{ isOOD, indicators }` |
| `getExpectedDistribution` | Get training stats for model | `modelId` | Distribution stats |
| `quickCheck` | Fast drift assessment | `signals`, `modelId` | `{ status, shouldTrustML }` |
| `analyze` | Full drift analysis | `signals`, `modelId` | Complete analysis |

### Integration Points

- Run BEFORE classification in `subgenreHeuristicsV2.js`
- Gate ML confidence if OOD detected
- Add drift metadata to ProcessingReport
- Integrate with `confidenceRecovery.js` for recovery paths

### Output Structure

```javascript
{
  status: 'SIGNIFICANT_DRIFT',
  shouldTrustML: false,
  distances: {
    bpm: { value: 45, zScore: 3.2, status: 'SIGNIFICANT_DRIFT' },
    subBassEnergy: { value: 0.95, zScore: 2.2, status: 'MINOR_DRIFT' }
  },
  aggregateDistance: 2.8,
  oodIndicators: [],
  recommendations: [
    'Consider manual classification',
    'ML confidence has been reduced'
  ],
  modelId: 'subgenre_v2',
  trainingVersion: '2.0.0'
}
```

---

## 3. Cross-Signal Consistency Checker

### Purpose
Detects when multiple ML models or signal analyzers produce contradictory conclusions that cannot both be true.

### Problem Statement
If subgenre classification says "lofi" (low transients, vinyl noise) but transient analysis says "extremely sharp transients", these signals are inconsistent. Such contradictions indicate at least one analysis is wrong.

### Key Concepts

**Signal Consistency**: Logical coherence between related signals.

**Contradiction Detection**: Identify mutually exclusive conclusions.

**Consistency Score**: Aggregate measure of cross-signal agreement.

### Constants

```javascript
const ConsistencyStatus = Object.freeze({
  CONSISTENT: 'CONSISTENT',           // All signals agree
  MINOR_INCONSISTENCY: 'MINOR_INCONSISTENCY', // Small disagreements
  INCONSISTENT: 'INCONSISTENT',       // Significant contradictions
  CONTRADICTORY: 'CONTRADICTORY'      // Mutually exclusive conclusions
});

const ConsistencySeverity = Object.freeze({
  NONE: 'NONE',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
});

// Consistency rules: pairs of signals that must agree
const CONSISTENCY_RULES = Object.freeze([
  {
    id: 'LOFI_TRANSIENT',
    signals: ['subgenreClassification', 'transientSharpness'],
    rule: 'If subgenre is lofi, transients should be soft (< 0.5)',
    check: (subgenre, transientSharpness) => {
      if (subgenre === 'lofi' && transientSharpness > 0.6) {
        return { consistent: false, severity: 'MEDIUM' };
      }
      return { consistent: true };
    }
  },
  {
    id: 'DRILL_BASS',
    signals: ['subgenreClassification', 'subBassEnergy'],
    rule: 'If subgenre is drill, sub-bass should be high (> 0.5)',
    check: (subgenre, subBassEnergy) => {
      if (subgenre === 'drill' && subBassEnergy < 0.4) {
        return { consistent: false, severity: 'LOW' };
      }
      return { consistent: true };
    }
  },
  {
    id: 'DYNAMIC_COMPRESSION',
    signals: ['dynamicRange', 'crestFactor', 'limiterStress'],
    rule: 'Dynamic range, crest factor, and limiter stress must correlate',
    check: (dr, crest, limiter) => {
      // Low DR + high crest = impossible
      if (dr < 4 && crest > 15) {
        return { consistent: false, severity: 'HIGH' };
      }
      return { consistent: true };
    }
  },
  {
    id: 'LOUDNESS_PEAK',
    signals: ['integratedLoudness', 'truePeak'],
    rule: 'Loudness and peak must be physically consistent',
    check: (lufs, peak) => {
      // Peak cannot be lower than integrated loudness
      if (peak < lufs) {
        return { consistent: false, severity: 'CRITICAL' };
      }
      return { consistent: true };
    }
  },
  {
    id: 'BPM_ENERGY',
    signals: ['bpm', 'transientDensity', 'temporalDensity'],
    rule: 'High BPM should correlate with transient presence',
    check: (bpm, transients, temporal) => {
      if (bpm > 150 && transients < 0.2) {
        return { consistent: false, severity: 'LOW' };
      }
      return { consistent: true };
    }
  },
  {
    id: 'STEREO_MONO',
    signals: ['stereoWidth', 'phaseCorrelation', 'channelTopology'],
    rule: 'Stereo metrics must agree with channel topology',
    check: (width, phase, topology) => {
      if (topology === 'DUAL_MONO' && width > 0.1) {
        return { consistent: false, severity: 'MEDIUM' };
      }
      return { consistent: true };
    }
  },
  {
    id: 'CLASSIFICATION_CONFIDENCE',
    signals: ['subgenreConfidence', 'hybridProbability'],
    rule: 'High single-genre confidence excludes hybrid',
    check: (confidence, hybridProb) => {
      if (confidence > 0.85 && hybridProb > 0.5) {
        return { consistent: false, severity: 'MEDIUM' };
      }
      return { consistent: true };
    }
  }
]);
```

### Functions

| Function | Description | Inputs | Output |
|----------|-------------|--------|--------|
| `checkConsistency` | Run all consistency rules | `signals` | `{ status, violations, score }` |
| `checkRule` | Check single rule | `ruleId`, `signals` | `{ consistent, severity, message }` |
| `aggregateConsistency` | Combine rule results | `ruleResults[]` | `{ overallStatus, score }` |
| `explainInconsistency` | Human-readable explanation | `violation` | `{ explanation, recommendation }` |
| `getContradictoryPairs` | Find mutually exclusive | `signals` | `{ pairs, severity }` |
| `quickCheck` | Fast consistency scan | `signals` | `{ consistent, worstViolation }` |
| `analyze` | Full consistency analysis | `signals` | Complete analysis |

### Integration Points

- Run AFTER all analyzers complete in `audioProcessor.js`
- Gate final confidence if contradictions found
- Add to `identifyProblems()` output
- Integrate with ProcessingReport

### Output Structure

```javascript
{
  status: 'INCONSISTENT',
  consistencyScore: 0.72,
  violations: [
    {
      ruleId: 'LOFI_TRANSIENT',
      severity: 'MEDIUM',
      signals: { subgenre: 'lofi', transientSharpness: 0.78 },
      explanation: 'Classified as lo-fi but transients are sharp',
      recommendation: 'Verify subgenre classification or check for sample artifacts'
    }
  ],
  passedRules: ['DRILL_BASS', 'LOUDNESS_PEAK', 'BPM_ENERGY'],
  failedRules: ['LOFI_TRANSIENT'],
  overallReliability: 'REDUCED',
  recommendations: [
    'Manual review recommended due to signal inconsistencies'
  ]
}
```

---

## 4. Inference Failure Escalation Handler

### Purpose
Ensures ML inference failures result in safe, deterministic behavior rather than silent failures or undefined states. Implements **fail-closed** behavior.

### Problem Statement
When ML inference fails (timeout, exception, NaN outputs, etc.), the system must:
1. Never produce undefined/null output
2. Fall back to safe defaults
3. Log the failure
4. Escalate if repeated
5. Never silently continue with bad data

### Key Concepts

**Fail-Closed**: When uncertain, deny/restrict rather than allow.

**Graceful Degradation**: Provide reduced functionality rather than no functionality.

**Escalation Ladder**: Progressive severity triggers progressive response.

### Constants

```javascript
const FailureType = Object.freeze({
  TIMEOUT: 'TIMEOUT',
  EXCEPTION: 'EXCEPTION',
  NAN_OUTPUT: 'NAN_OUTPUT',
  NULL_OUTPUT: 'NULL_OUTPUT',
  INVALID_SHAPE: 'INVALID_SHAPE',
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  CONFIDENCE_COLLAPSE: 'CONFIDENCE_COLLAPSE',
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE'
});

const EscalationLevel = Object.freeze({
  NONE: 'NONE',           // No action needed
  LOG: 'LOG',             // Log only
  FALLBACK: 'FALLBACK',   // Use fallback, log
  ALERT: 'ALERT',         // Fallback + alert ops
  CIRCUIT_BREAK: 'CIRCUIT_BREAK', // Disable ML temporarily
  CRITICAL: 'CRITICAL'    // Full escalation, block processing
});

const FallbackStrategy = Object.freeze({
  USE_DEFAULT: 'USE_DEFAULT',       // Return safe default
  USE_CACHED: 'USE_CACHED',         // Use last good result
  USE_CONSERVATIVE: 'USE_CONSERVATIVE', // Most conservative option
  SKIP_ML: 'SKIP_ML',               // Bypass ML entirely
  REJECT: 'REJECT'                  // Cannot proceed
});

const ESCALATION_THRESHOLDS = Object.freeze({
  LOG_AFTER: 1,           // Log on first failure
  FALLBACK_AFTER: 1,      // Fallback on first failure
  ALERT_AFTER: 3,         // Alert after 3 failures in window
  CIRCUIT_BREAK_AFTER: 5, // Break after 5 failures
  CIRCUIT_BREAK_DURATION: 60000, // 1 minute cooldown
  FAILURE_WINDOW: 300000  // 5 minute sliding window
});

// Default fallbacks per model/function
const FALLBACK_DEFAULTS = Object.freeze({
  subgenre_classification: {
    subgenre: 'hybrid',
    confidence: 0.35,
    probabilities: {},
    fallbackReason: 'inference_failure'
  },
  confidence_score: {
    confidence: 0.40,
    tier: 'LOW',
    fallbackReason: 'inference_failure'
  },
  risk_assessment: {
    riskLevel: 'UNKNOWN',
    risks: {},
    fallbackReason: 'inference_failure'
  }
});
```

### Functions

| Function | Description | Inputs | Output |
|----------|-------------|--------|--------|
| `handleInferenceFailure` | Primary failure handler | `modelId`, `error`, `context` | `{ fallback, escalation, logged }` |
| `classifyFailure` | Categorize failure type | `error` | `FailureType` |
| `determineEscalation` | Calculate escalation level | `modelId`, `failureCount` | `EscalationLevel` |
| `getFallback` | Get safe fallback value | `modelId`, `strategy` | Fallback value |
| `recordFailure` | Track failure for patterns | `modelId`, `failure` | Updated stats |
| `checkCircuitBreaker` | Is model circuit-broken? | `modelId` | `{ broken, remainingMs }` |
| `resetCircuitBreaker` | Manual reset | `modelId` | Success/failure |
| `wrapInference` | Safe wrapper for ML calls | `fn`, `modelId` | Wrapped function |
| `getFailureStats` | Get failure statistics | `modelId`, `window` | Stats object |
| `quickCheck` | Fast health check | `modelId` | `{ healthy, failureRate }` |
| `analyze` | Full failure analysis | `modelId` | Complete analysis |

### Integration Points

- Wrap all ML inference calls in `subgenreHeuristicsV2.js`
- Wrap confidence calculations
- Integrate with `jobEngine.js` retry logic
- Add to `confidenceRecovery.js` as recovery path
- Report in ProcessingReport

### Output Structure

```javascript
{
  // Failure event
  failure: {
    type: 'TIMEOUT',
    modelId: 'subgenre_v2',
    error: 'Inference exceeded 5000ms timeout',
    timestamp: '2024-12-31T00:00:00Z'
  },
  
  // Response
  escalation: {
    level: 'FALLBACK',
    action: 'Using conservative default',
    alertSent: false,
    circuitBroken: false
  },
  
  // Fallback used
  fallback: {
    subgenre: 'hybrid',
    confidence: 0.35,
    fallbackReason: 'inference_failure'
  },
  
  // Stats
  stats: {
    failuresInWindow: 2,
    windowDuration: 300000,
    failureRate: 0.02,
    lastSuccess: '2024-12-31T00:00:00Z'
  },
  
  // Recommendations
  recommendations: [
    'Monitor for additional failures',
    'Consider increasing timeout if pattern continues'
  ]
}
```

---

## Integration Architecture

### Processing Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Audio Analysis Pipeline                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. Raw Audio Input                                                      │
│         │                                                                │
│         ▼                                                                │
│  2. Signal Extraction (FFmpeg/FFprobe)                                  │
│         │                                                                │
│         ▼                                                                │
│  3. ┌──────────────────────────────┐                                    │
│     │   SIGNAL DRIFT DETECTOR      │◄─── Is input in-distribution?      │
│     └──────────────────────────────┘                                    │
│         │                                                                │
│         │ OOD? ──► Reduce ML confidence, flag for review                │
│         │                                                                │
│         ▼                                                                │
│  4. ML Inference (Subgenre, Classification, etc.)                       │
│         │                                                                │
│         │ Failure? ───┐                                                  │
│         │             ▼                                                  │
│         │   ┌──────────────────────────────────┐                        │
│         │   │ INFERENCE FAILURE ESCALATION     │                        │
│         │   │ - Classify failure               │                        │
│         │   │ - Apply fallback                 │                        │
│         │   │ - Escalate if needed             │                        │
│         │   └──────────────────────────────────┘                        │
│         │             │                                                  │
│         │◄────────────┘                                                  │
│         │                                                                │
│         ▼                                                                │
│  5. ┌──────────────────────────────┐                                    │
│     │ CONFIDENCE CALIBRATION LAYER │◄─── Adjust raw confidence          │
│     └──────────────────────────────┘                                    │
│         │                                                                │
│         ▼                                                                │
│  6. ┌──────────────────────────────┐                                    │
│     │ CROSS-SIGNAL CONSISTENCY     │◄─── Check for contradictions       │
│     └──────────────────────────────┘                                    │
│         │                                                                │
│         │ Contradictions? ──► Reduce confidence, flag issues            │
│         │                                                                │
│         ▼                                                                │
│  7. Final Aggregation & Decision Engine                                 │
│         │                                                                │
│         ▼                                                                │
│  8. ProcessingReport Output                                             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### File Structure

```
signal/services/
├── modelConfidenceCalibration.js      # Confidence calibration layer
├── modelConfidenceCalibration.test.js
├── signalDriftDetector.js             # Distribution drift detection
├── signalDriftDetector.test.js
├── crossSignalConsistencyChecker.js   # Contradiction detection
├── crossSignalConsistencyChecker.test.js
├── inferenceFailureHandler.js         # Fail-closed escalation
├── inferenceFailureHandler.test.js
└── mlSafetyLayer.js                   # Unified facade (optional)
```

---

## Test Coverage Estimates

| Component | Est. Tests | Coverage Focus |
|-----------|------------|----------------|
| Confidence Calibration | ~65 | Bucket accuracy, temperature scaling, edge cases |
| Signal Drift Detector | ~70 | OOD detection, Mahalanobis, feature bounds |
| Cross-Signal Consistency | ~60 | Rule validation, contradiction detection, severity |
| Inference Failure Handler | ~75 | Failure types, escalation, circuit breaker |
| **Total** | **~270** | |

---

## Implementation Order

1. **Inference Failure Handler** (foundation for safe ML calls)
2. **Signal Drift Detector** (gates ML before inference)
3. **Confidence Calibration Layer** (adjusts ML outputs)
4. **Cross-Signal Consistency Checker** (validates combined outputs)

---

## Success Criteria

Per **STUDIOOS_ML_INVESTMENT_CHARTER.md**:

- [ ] All ML outputs explainable in plain language
- [ ] All ML outputs surfaced in ProcessingReport
- [ ] All ML-driven decisions traceable
- [ ] All ML limitations disclosed
- [ ] Same input + same params + same model = same result
- [ ] Confidence calibration within ±10%
- [ ] Fail-closed behavior on all inference failures
- [ ] No silent failures or undefined states

---

## Dependencies

- Existing: `confidenceRecovery.js`, `subgenreHeuristicsV2.js`, `decisionEngine.js`
- New: None (self-contained)
- External: None

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Calibration data insufficient | Start with conservative priors, update with production data |
| False OOD positives | Tune thresholds conservatively, allow manual override |
| Consistency rules too strict | Start with obvious contradictions, expand gradually |
| Circuit breaker too aggressive | Long cooldown windows, manual reset available |

---

## Appendix: Existing Integration Points

### confidenceRecovery.js
- `RECOVERY_TIERS`: Add `CALIBRATION_REDUCED` tier
- `ISSUE_RECOVERY_PATHS`: Add `signal_drift`, `inference_failure`, `cross_signal_conflict`
- `getRecoveryTier()`: Accept calibrated confidence

### subgenreHeuristicsV2.js
- `classifySubgenre()`: Wrap with inference failure handler
- `calculateConfidence()`: Apply calibration layer
- Pre-classification: Run drift detection

### audioProcessor.js
- `analyzeAudioInternal()`: Add consistency check after all analyzers
- `identifyProblems()`: Add ML safety layer issues

### ProcessingReport
- Add sections: `mlSafety.calibration`, `mlSafety.drift`, `mlSafety.consistency`, `mlSafety.failures`
