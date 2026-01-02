# Infrastructure Validators Implementation Plan

## Overview

Five infrastructure validators to ensure processing reliability, determinism, and resource awareness in the StudioOS audio processing pipeline.

**Target**: ~350 tests total across 5 validators

---

## 1. Processing Determinism Verifier

### Purpose
Ensures repeatability across runs. Per STUDIOOS_ML_INVESTMENT_CHARTER.md Section 6:
> "Same input + same parameters + same model version = same result"

### Current Gap
- Jobs are *stated* as deterministic but never validated
- No hash-based verification of input/output consistency
- Random values exist in mock mode without fixed seeds

### Architecture

```
signal/services/processingDeterminismVerifier.js
```

#### Enums & Constants

```javascript
const DeterminismStatus = {
  DETERMINISTIC: 'DETERMINISTIC',       // Outputs match across runs
  NON_DETERMINISTIC: 'NON_DETERMINISTIC', // Outputs differ
  UNVERIFIED: 'UNVERIFIED',             // Not enough data
  EXEMPT: 'EXEMPT'                      // Explicitly non-deterministic operation
};

const NonDeterminismCause = {
  RANDOM_SEED_MISSING: 'RANDOM_SEED_MISSING',
  TIMESTAMP_IN_OUTPUT: 'TIMESTAMP_IN_OUTPUT',
  FLOATING_POINT_DRIFT: 'FLOATING_POINT_DRIFT',
  EXTERNAL_DEPENDENCY: 'EXTERNAL_DEPENDENCY',
  PARALLEL_RACE: 'PARALLEL_RACE',
  ENVIRONMENT_VARIANCE: 'ENVIRONMENT_VARIANCE',
  UNKNOWN: 'UNKNOWN'
};

const TOLERANCE_THRESHOLDS = {
  LOUDNESS_LUFS: 0.01,      // Acceptable drift in LUFS
  PEAK_DB: 0.001,           // Acceptable drift in dB
  DURATION_MS: 1,           // Acceptable drift in milliseconds
  GENERIC_FLOAT: 1e-6       // Generic floating point tolerance
};
```

#### Core Functions

| Function | Purpose |
|----------|---------|
| `hashInput(filePath, params)` | Generate deterministic hash of input + params |
| `hashOutput(result)` | Generate hash of output (excluding timestamps) |
| `verifyDeterminism(inputHash, outputHash)` | Check against known hashes |
| `compareOutputs(output1, output2)` | Deep compare with tolerance |
| `detectNonDeterminism(outputs[])` | Analyze differences to identify cause |
| `sanitizeOutput(output)` | Remove non-deterministic fields (timestamps, random IDs) |
| `recordVerification(inputHash, outputHash)` | Store for future verification |
| `quickCheck(filePath, params, output)` | Fast determinism check |
| `analyze(processHistory)` | Full determinism analysis |

#### Integration Points
- Pre/post job execution in `jobEngine.js`
- Wraps `audioProcessor.analyze()` calls
- Stores verification records in processing history

#### Test Categories (~70 tests)
1. Hash generation (input hashing, output hashing, param normalization)
2. Output comparison (tolerance handling, deep equality, array comparison)
3. Non-determinism detection (cause identification, diff analysis)
4. Sanitization (timestamp removal, ID normalization)
5. Verification workflow (record/verify cycle)
6. Edge cases (empty inputs, null values, circular references)

---

## 2. Latency Budget Monitor

### Purpose
Tracks processing time per stage and alerts when budgets are exceeded.

### Current Gap
- Individual analyzer timing exists but no aggregate budget tracking
- No warnings when processing exceeds expectations
- No stage-by-stage breakdown visible to job layer

### Architecture

```
signal/services/latencyBudgetMonitor.js
```

#### Enums & Constants

```javascript
const BudgetStatus = {
  WITHIN_BUDGET: 'WITHIN_BUDGET',
  WARNING: 'WARNING',           // 75-100% of budget
  EXCEEDED: 'EXCEEDED',         // > 100% of budget
  CRITICAL: 'CRITICAL'          // > 150% of budget
};

const ProcessingStage = {
  INGESTION: 'INGESTION',
  VALIDATION: 'VALIDATION',
  ANALYSIS: 'ANALYSIS',
  TRANSFORMATION: 'TRANSFORMATION',
  OUTPUT: 'OUTPUT',
  TOTAL: 'TOTAL'
};

const BUDGET_MS = {
  // Quick operations
  VALIDATION: 500,
  INGESTION: 1000,
  
  // Analysis (per second of audio)
  ANALYSIS_PER_SECOND: 150,
  ANALYSIS_BASE: 2000,
  ANALYSIS_MAX: 30000,
  
  // Transformation
  MASTERING_PER_SECOND: 200,
  MASTERING_BASE: 3000,
  CONVERSION_PER_SECOND: 100,
  
  // Total job budgets
  QUICK_CHECK: 1000,
  STANDARD_ANALYSIS: 10000,
  FULL_MASTERING: 30000
};

const BUDGET_WARNING_THRESHOLD = 0.75;  // 75% = warning
const BUDGET_CRITICAL_THRESHOLD = 1.5;  // 150% = critical
```

#### Core Functions

| Function | Purpose |
|----------|---------|
| `startTimer(stage, context)` | Begin timing a stage |
| `endTimer(timerId)` | End timing and record duration |
| `getBudget(stage, audioDuration)` | Calculate budget for stage |
| `checkBudget(stage, elapsed, budget)` | Compare elapsed vs budget |
| `calculateRemaining(totalBudget, elapsed)` | Time remaining in budget |
| `recordLatency(stage, duration, context)` | Store latency record |
| `getStageBreakdown(jobId)` | Get per-stage timing for job |
| `analyze(timings)` | Full latency analysis with recommendations |
| `predictBudget(preset, audioDuration)` | Estimate budget before execution |
| `quickCheck(jobId)` | Fast budget status check |

#### Integration Points
- Wraps each analyzer in `audioProcessor.js`
- Reports to job engine on completion
- Provides data for `processingCostEstimator`

#### Test Categories (~70 tests)
1. Timer operations (start/stop, nested timers, concurrent timers)
2. Budget calculation (per-second scaling, base + variable)
3. Status thresholds (within, warning, exceeded, critical)
4. Stage tracking (individual stages, rollup)
5. Predictions (accuracy, edge cases)
6. Integration scenarios (multi-stage jobs)

---

## 3. DSP Capability Negotiator

### Purpose
Enables/limits features based on environment (CPU, FFmpeg build, memory).

### Current Gap
- No detection of available FFmpeg features, codecs, or hardware
- Features used blindly without verification
- No graceful degradation when capabilities missing

### Architecture

```
signal/services/dspCapabilityNegotiator.js
```

#### Enums & Constants

```javascript
const CapabilityLevel = {
  FULL: 'FULL',             // All features available
  STANDARD: 'STANDARD',     // Common codecs, no HW accel
  MINIMAL: 'MINIMAL',       // Basic only (WAV, basic analysis)
  UNAVAILABLE: 'UNAVAILABLE'
};

const FeatureCategory = {
  CODEC: 'CODEC',
  FILTER: 'FILTER',
  FORMAT: 'FORMAT',
  HARDWARE: 'HARDWARE',
  ANALYSIS: 'ANALYSIS'
};

const REQUIRED_FEATURES = {
  CORE: ['ffmpeg', 'ffprobe'],
  
  CODECS: {
    REQUIRED: ['pcm_s16le', 'pcm_s24le', 'pcm_f32le'],  // WAV
    STANDARD: ['libmp3lame', 'aac', 'flac', 'libvorbis'],
    ADVANCED: ['libopus', 'alac']
  },
  
  FILTERS: {
    REQUIRED: ['loudnorm', 'astats'],
    STANDARD: ['aspectralstats', 'aphasemeter', 'aresample'],
    ADVANCED: ['adeclick', 'adenorm', 'afftdn']
  },
  
  FORMATS: {
    REQUIRED: ['wav'],
    STANDARD: ['mp3', 'flac', 'ogg', 'mp4'],
    ADVANCED: ['opus', 'caf', 'w64']
  }
};

const FALLBACK_OPTIONS = {
  // When feature unavailable, what to use instead
  'libmp3lame': { fallback: null, message: 'MP3 encoding unavailable' },
  'aspectralstats': { fallback: 'astats', message: 'Using basic stats' },
  'loudnorm': { fallback: null, critical: true }
};
```

#### Core Functions

| Function | Purpose |
|----------|---------|
| `detectCapabilities()` | Probe environment for all capabilities |
| `checkFeature(feature, category)` | Check if specific feature available |
| `getCapabilityLevel()` | Determine overall capability level |
| `negotiateFeatures(required)` | Get available subset of required features |
| `getFallback(feature)` | Get fallback for unavailable feature |
| `canProcess(preset, features)` | Check if preset can run with current caps |
| `getUnavailableFeatures()` | List features that are missing |
| `buildCapabilityReport()` | Full capability audit |
| `quickCheck()` | Fast capability status |
| `cacheCapabilities()` | Cache detected capabilities (startup) |

#### Integration Points
- Called at server startup (cache results)
- Checked before job creation in `jobEngine.js`
- Informs `processingCostEstimator` about available paths

#### Test Categories (~70 tests)
1. Detection (mock FFmpeg outputs, version parsing)
2. Feature checking (codecs, filters, formats)
3. Capability levels (classification logic)
4. Fallback handling (degradation paths)
5. Negotiation (required vs available)
6. Caching (invalidation, refresh)

---

## 4. Binary Dependency Verifier

### Purpose
Confirms FFmpeg/ffprobe capabilities at runtime.

### Current Gap
- FFmpeg assumed present, no validation
- No version checking
- No codec availability verification

### Architecture

```
signal/services/binaryDependencyVerifier.js
```

#### Enums & Constants

```javascript
const DependencyStatus = {
  AVAILABLE: 'AVAILABLE',
  MISSING: 'MISSING',
  VERSION_MISMATCH: 'VERSION_MISMATCH',
  PARTIAL: 'PARTIAL',           // Some features missing
  ERROR: 'ERROR'                // Check failed
};

const DependencyType = {
  REQUIRED: 'REQUIRED',
  RECOMMENDED: 'RECOMMENDED',
  OPTIONAL: 'OPTIONAL'
};

const BINARIES = {
  ffmpeg: {
    command: 'ffmpeg',
    versionArg: '-version',
    minVersion: '4.0.0',
    type: DependencyType.REQUIRED
  },
  ffprobe: {
    command: 'ffprobe',
    versionArg: '-version',
    minVersion: '4.0.0',
    type: DependencyType.REQUIRED
  }
};

const VERSION_REGEX = {
  ffmpeg: /ffmpeg version (\d+\.\d+(?:\.\d+)?)/i,
  ffprobe: /ffprobe version (\d+\.\d+(?:\.\d+)?)/i
};

const CODEC_CHECK_COMMANDS = {
  encoders: ['-encoders'],
  decoders: ['-decoders'],
  filters: ['-filters']
};
```

#### Core Functions

| Function | Purpose |
|----------|---------|
| `checkBinary(name)` | Verify binary exists and is executable |
| `getVersion(name)` | Parse version from binary output |
| `compareVersions(actual, required)` | Semantic version comparison |
| `checkCodec(codecName)` | Verify specific codec available |
| `checkFilter(filterName)` | Verify specific filter available |
| `getAvailableEncoders()` | List all available encoders |
| `getAvailableDecoders()` | List all available decoders |
| `getAvailableFilters()` | List all available filters |
| `verifyAll()` | Complete dependency verification |
| `quickCheck()` | Fast availability check |
| `buildDependencyReport()` | Full dependency audit |

#### Integration Points
- Called at server startup
- Provides data to `dspCapabilityNegotiator`
- Health check endpoint

#### Test Categories (~70 tests)
1. Binary detection (path resolution, execution)
2. Version parsing (regex matching, edge cases)
3. Version comparison (semver logic)
4. Codec/filter enumeration (parsing -encoders output)
5. Error handling (missing binary, timeout, permission)
6. Report generation (comprehensive audit)

---

## 5. Processing Cost Estimator

### Purpose
Predicts compute cost before execution.

### Current Gap
- No prediction before execution
- Mock mode has hardcoded times but no real estimation
- No cost-based job prioritization

### Architecture

```
signal/services/processingCostEstimator.js
```

#### Enums & Constants

```javascript
const CostCategory = {
  TRIVIAL: 'TRIVIAL',         // < 1 second
  LIGHT: 'LIGHT',             // 1-5 seconds
  MODERATE: 'MODERATE',       // 5-15 seconds
  HEAVY: 'HEAVY',             // 15-60 seconds
  INTENSIVE: 'INTENSIVE'      // > 60 seconds
};

const ResourceType = {
  CPU: 'CPU',
  MEMORY: 'MEMORY',
  DISK_IO: 'DISK_IO',
  TIME: 'TIME'
};

const COST_FACTORS = {
  // Base cost per second of audio
  BASE_PER_SECOND: 0.1,
  
  // Multipliers by preset
  PRESET_MULTIPLIERS: {
    ANALYSIS: 1.0,
    MASTERING: 2.5,
    CONVERSION: 1.5,
    MIXING: 1.8
  },
  
  // Multipliers by quality
  QUALITY_MULTIPLIERS: {
    DRAFT: 0.5,
    STANDARD: 1.0,
    HIGH: 1.5,
    MAXIMUM: 2.0
  },
  
  // Fixed costs (ms)
  STARTUP_COST: 200,
  FFMPEG_SPAWN_COST: 50,
  
  // Per-analyzer costs (ms per second of audio)
  ANALYZER_COSTS: {
    loudnessAnalyzer: 50,
    spectralBalanceAnalyzer: 80,
    transientSharpnessIndex: 40,
    temporalDensityMapper: 60,
    monoFoldDownSimulator: 100,
    // ... etc
  }
};

const HISTORICAL_ACCURACY_THRESHOLD = 0.2; // 20% prediction accuracy target
```

#### Core Functions

| Function | Purpose |
|----------|---------|
| `estimateCost(preset, audioDuration, options)` | Predict total processing cost |
| `estimateTime(preset, audioDuration)` | Predict processing time in ms |
| `estimateResources(preset, audioDuration)` | Predict CPU/memory usage |
| `categorize(estimatedTime)` | Assign cost category |
| `compareToActual(estimated, actual)` | Calculate prediction accuracy |
| `recordActual(jobId, actualTime)` | Store actual for learning |
| `getAccuracyStats()` | Get prediction accuracy metrics |
| `adjustFactors(history)` | Tune factors based on history |
| `quickEstimate(preset, audioDuration)` | Fast cost estimate |
| `buildCostReport(jobs)` | Cost analysis for multiple jobs |

#### Integration Points
- Called before job creation in `jobEngine.js`
- Uses data from `latencyBudgetMonitor` for accuracy
- Informs queue priority decisions

#### Test Categories (~70 tests)
1. Time estimation (preset variations, duration scaling)
2. Resource estimation (CPU, memory predictions)
3. Cost categorization (threshold logic)
4. Accuracy tracking (actual vs predicted)
5. Factor adjustment (learning from history)
6. Edge cases (very short/long files, unknown presets)

---

## Implementation Order

| Order | Component | Dependencies | Est. Tests |
|-------|-----------|--------------|------------|
| 1 | Binary Dependency Verifier | None | 70 |
| 2 | DSP Capability Negotiator | Binary Dependency Verifier | 70 |
| 3 | Latency Budget Monitor | None | 70 |
| 4 | Processing Cost Estimator | Latency Budget Monitor | 70 |
| 5 | Processing Determinism Verifier | None | 70 |

**Total: ~350 tests**

### Rationale

1. **Binary Dependency Verifier first** - Foundation for capability detection
2. **DSP Capability Negotiator second** - Uses binary verifier, needed for graceful degradation
3. **Latency Budget Monitor third** - Independent, provides data for cost estimator
4. **Processing Cost Estimator fourth** - Uses latency data for predictions
5. **Processing Determinism Verifier last** - Most complex, independent of others

---

## File Structure

```
signal/services/
├── binaryDependencyVerifier.js      # FFmpeg/ffprobe validation
├── dspCapabilityNegotiator.js       # Feature detection & fallbacks
├── latencyBudgetMonitor.js          # Per-stage timing & budgets
├── processingCostEstimator.js       # Pre-execution cost prediction
└── processingDeterminismVerifier.js # Repeatability verification

signal/__tests__/
├── binaryDependencyVerifier.test.js
├── dspCapabilityNegotiator.test.js
├── latencyBudgetMonitor.test.js
├── processingCostEstimator.test.js
└── processingDeterminismVerifier.test.js
```

---

## Cross-Component Integration

```
┌─────────────────────────────────────────────────────────────────┐
│                        Job Creation                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────┐    ┌─────────────────────────────────┐ │
│  │ Binary Dependency   │───▶│ DSP Capability Negotiator       │ │
│  │ Verifier            │    │ - Feature availability          │ │
│  │ - ffmpeg available  │    │ - Fallback selection            │ │
│  │ - version check     │    │ - Capability level              │ │
│  └─────────────────────┘    └─────────────────────────────────┘ │
│           │                              │                       │
│           ▼                              ▼                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Processing Cost Estimator                       ││
│  │              - Time prediction                               ││
│  │              - Resource prediction                           ││
│  │              - Cost categorization                           ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
└──────────────────────────────┼───────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Job Execution                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Latency Budget Monitor                          ││
│  │              - Per-stage timing                              ││
│  │              - Budget tracking                               ││
│  │              - Warning alerts                                ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │         Processing Determinism Verifier                      ││
│  │         - Hash input/output                                  ││
│  │         - Verify repeatability                               ││
│  │         - Detect non-determinism                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Spec Alignment

| Validator | Spec Reference | Requirement |
|-----------|----------------|-------------|
| Determinism Verifier | ML_INVESTMENT_CHARTER §6 | "Same input + same params = same result" |
| Latency Budget Monitor | FUNCTIONAL_SPECS §5 | "Jobs are asynchronous" (needs tracking) |
| DSP Capability Negotiator | TRANSPARENCY_CHARTER | "All capabilities must be explicit" |
| Binary Dependency Verifier | ERROR_RECOVERY_PLAYBOOK | "Fail-closed on missing dependencies" |
| Processing Cost Estimator | FUNCTIONAL_SPECS §4 | Job-driven architecture needs prediction |

---

## Success Criteria

1. **Binary Dependency Verifier**: Detect FFmpeg 4.x+ with codec enumeration
2. **DSP Capability Negotiator**: Graceful degradation when features missing
3. **Latency Budget Monitor**: < 5% overhead on timing instrumentation
4. **Processing Cost Estimator**: ±20% accuracy on time predictions
5. **Determinism Verifier**: Detect non-determinism with specific cause identification

---

## Notes

- All validators follow existing patterns from ML safety validators
- Mock mode support for testing without FFmpeg
- Comprehensive error handling with categorized error types
- Full export of enums, constants, and functions for testing
