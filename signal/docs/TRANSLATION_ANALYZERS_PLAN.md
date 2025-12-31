# Translation System Analyzers - Research & Implementation Plan

> **High-leverage analyzers for platform positioning** - These analyzers predict how audio will perform across different playback environments before delivery, preventing client issues and reducing revision cycles.

## Overview

| Analyzer | Purpose | FFmpeg Filter Stack | Complexity |
|----------|---------|---------------------|------------|
| Small Speaker Translation Estimator | Predict bass loss on phones/laptops | `highpass`/`lowpass` + `astats` | Medium |
| Car System Translation Risk | Low-mid buildup + limiter stress | `bandpass` + sliding RMS | Medium |
| Club System Stress Estimator | Sustained sub-bass thermal risk | `lowpass` + exponential RMS | Medium |
| Streaming Codec Stress Test | Predict MP3/AAC artifacts | Transient + HF + stereo analysis | High |
| Mono Fold-Down Simulation | Phase cancellation detection | `stereotools` + correlation | Medium |

---

## 1. Small Speaker Translation Estimator

### Concept
Small speakers (phones, laptops, tablets) have physical high-pass characteristics that cut frequencies below 150-200Hz. Good translation depends on harmonic content in the "survival zone" (150-400Hz) that suggests the missing bass.

### Typical Small Speaker Response
```
Phone speakers:   -3dB @ 200Hz, -12dB @ 100Hz, -24dB @ 60Hz
Laptop speakers:  -3dB @ 150Hz, -12dB @ 80Hz,  -20dB @ 50Hz
Tablet speakers:  -3dB @ 120Hz, -10dB @ 80Hz,  -18dB @ 50Hz
```

### Analysis Bands
| Band | Range | Weight | Description |
|------|-------|--------|-------------|
| `LOST` | 20-80 Hz | 0.0 | Completely inaudible on small speakers |
| `AT_RISK` | 80-150 Hz | 0.2 | Mostly lost, fundamentals disappear |
| `SURVIVAL` | 150-400 Hz | 1.0 | **Translation zone** - harmonics that suggest bass |
| `PRESERVED` | 400-1000 Hz | 1.0 | Fully preserved body |

### Key Metrics
```javascript
const SmallSpeakerMetrics = {
  lostEnergyRatio: 0,      // E(20-80Hz) / E(total) - energy that disappears
  atRiskRatio: 0,          // E(80-150Hz) / E(total) - mostly lost
  survivalRatio: 0,        // E(150-400Hz) / E(total) - what carries the bass
  perceivedBassLossDb: 0,  // Estimated loudness reduction
  translationScore: 0,     // 0-100 score for translation quality
  harmonicDensity: 0       // Ratio of harmonic content vs fundamental
};
```

### FFmpeg Filter Chain
```bash
ffmpeg -i input.wav -af "
  asplit=4[lost][risk][survive][full],
  [lost]highpass=f=20,lowpass=f=80,astats=metadata=1:reset=1[lost_stats];
  [risk]highpass=f=80,lowpass=f=150,astats=metadata=1:reset=1[risk_stats];
  [survive]highpass=f=150,lowpass=f=400,astats=metadata=1:reset=1[survive_stats];
  [full]astats=metadata=1:reset=1[full_stats]
" -f null -
```

### Classification Logic
```javascript
function classifyTranslation(metrics) {
  const { lostEnergyRatio, survivalRatio } = metrics;
  
  if (lostEnergyRatio < 0.15 && survivalRatio > 0.25) return 'EXCELLENT';
  if (lostEnergyRatio < 0.25 && survivalRatio > 0.20) return 'GOOD';
  if (lostEnergyRatio < 0.35 && survivalRatio > 0.15) return 'FAIR';
  if (lostEnergyRatio < 0.45 && survivalRatio > 0.10) return 'POOR';
  return 'CRITICAL'; // Mix will sound empty on small speakers
}
```

### Risk Status Enum
```javascript
const SmallSpeakerStatus = {
  EXCELLENT: 'EXCELLENT',  // Translates well, harmonics carry the bass
  GOOD: 'GOOD',            // Minor thinning on phones
  FAIR: 'FAIR',            // Noticeable bass loss
  POOR: 'POOR',            // Significant translation issues
  CRITICAL: 'CRITICAL'     // Mix sounds empty/thin
};
```

### Recommendations
| Status | Recommendation |
|--------|----------------|
| EXCELLENT | No action needed |
| GOOD | Consider slight upper-bass boost (150-250Hz) |
| FAIR | Add harmonic saturation to bass; boost 200-400Hz |
| POOR | Re-evaluate bass instrument choices; add harmonics |
| CRITICAL | Bass relies entirely on sub; needs fundamental redesign |

### Implementation Notes
- Use `astats` RMS values for band energy
- Normalize to total energy for ratio calculation
- Perceived bass loss = `-10 * log10(survivalEnergy / (lostEnergy + 1e-10))`
- Timeline mode: analyze in 1-second windows for temporal mapping

---

## 2. Car System Translation Risk

### Concept
Car interiors are small resonant spaces with low-mid buildup (80-300Hz). Factory car systems have aggressive limiters that pump on sustained energy. This analyzer predicts boominess and limiter stress.

### Car Audio Characteristics
```
Problematic Zones:
- 80-120 Hz:  Cabin boom resonance
- 120-200 Hz: Mud accumulation
- 200-300 Hz: Boxiness, masks clarity

Limiter Behavior:
- Threshold: -3 to -6 dBFS sustained
- Attack: 10-50ms (slower than studio limiters)
- Release: 100-500ms
- Pumping occurs: sustained energy > 500ms above threshold
```

### Analysis Configuration
```javascript
const CAR_CONFIG = {
  resonanceZone: { low: 80, high: 300 },
  boomZone: { low: 80, high: 120 },
  mudZone: { low: 120, high: 200 },
  boxZone: { low: 200, high: 300 },
  windowSizeMs: 100,
  sustainedThresholdDb: -6,
  sustainedDurationMs: 500,
  crestFactorWarning: 8,    // dB
  crestFactorDanger: 6      // dB
};
```

### Key Metrics
```javascript
const CarTranslationMetrics = {
  resonanceZoneRatio: 0,       // Energy in 80-300Hz vs total
  boomZoneRatio: 0,            // Energy in 80-120Hz (cabin resonance)
  crestFactor: 0,              // Peak/RMS in resonance zone (dB)
  maxSustainedDurationMs: 0,   // Longest continuous high-energy section
  sustainedRatio: 0,           // % of time above sustained threshold
  limiterStressIndex: 0,       // Combined metric: density × duration
  resonanceScore: 0            // 0-100 overall score
};
```

### FFmpeg Filter Chain
```bash
# Resonance zone crest factor + sustained energy
ffmpeg -i input.wav -af "
  highpass=f=80,lowpass=f=300,
  asetnsamples=n=4410,
  astats=metadata=1:reset=1:measure_perchannel=Peak_level+RMS_level+Crest_factor
" -f null -
```

### Sustained Energy Detection
```javascript
function analyzeSustainedEnergy(rmsFrames, config) {
  let consecutiveFrames = 0;
  let maxSustained = 0;
  let totalSustained = 0;
  
  for (const frame of rmsFrames) {
    const rmsDb = 20 * Math.log10(frame.rms + 1e-10);
    
    if (rmsDb > config.sustainedThresholdDb) {
      consecutiveFrames++;
      totalSustained += config.windowSizeMs;
    } else {
      maxSustained = Math.max(maxSustained, consecutiveFrames * config.windowSizeMs);
      consecutiveFrames = 0;
    }
  }
  
  return {
    maxSustainedMs: maxSustained,
    totalSustainedMs: totalSustained,
    sustainedRatio: totalSustained / totalDuration
  };
}
```

### Limiter Stress Index
```javascript
function calculateLimiterStress(crestFactor, sustainedRatio, maxSustainedMs) {
  // Low crest + high sustained = maximum limiter stress
  const crestPenalty = Math.max(0, (10 - crestFactor) / 10);  // 0-1, higher = worse
  const sustainedPenalty = sustainedRatio;                      // 0-1
  const durationPenalty = Math.min(1, maxSustainedMs / 2000);   // Caps at 2 seconds
  
  return (crestPenalty * 0.4 + sustainedPenalty * 0.3 + durationPenalty * 0.3);
}
```

### Classification
```javascript
const CarTranslationStatus = {
  EXCELLENT: 'EXCELLENT',  // Clean playback, no issues
  GOOD: 'GOOD',            // Minor limiting possible
  FAIR: 'FAIR',            // Some pumping likely
  POOR: 'POOR',            // Noticeable pumping/boominess
  CRITICAL: 'CRITICAL'     // Severe limiting, distortion likely
};

function classifyCarRisk(metrics) {
  if (metrics.limiterStressIndex < 0.2 && metrics.crestFactor > 10) return 'EXCELLENT';
  if (metrics.limiterStressIndex < 0.4 && metrics.crestFactor > 8) return 'GOOD';
  if (metrics.limiterStressIndex < 0.6 && metrics.crestFactor > 6) return 'FAIR';
  if (metrics.limiterStressIndex < 0.8) return 'POOR';
  return 'CRITICAL';
}
```

### Recommendations
| Status | Recommendation |
|--------|----------------|
| EXCELLENT | No action needed |
| GOOD | Monitor low-mid during loud sections |
| FAIR | Consider multiband compression 80-300Hz |
| POOR | Reduce sustained low-mid energy; add dynamics |
| CRITICAL | Significant low-mid cut needed; check bass arrangement |

---

## 3. Club System Stress Estimator

### Concept
Club/PA systems handle massive sub-bass, but **sustained** low-frequency content creates thermal stress on drivers. Transient bass is safer than sustained bass at the same peak level. This analyzer predicts protection circuit engagement.

### Thermal Stress Model
```
Speaker Thermal Behavior:
- Voice coil heats with power (I²R)
- Thermal time constant: 2-10 seconds
- Continuous power handling << Peak power handling
- Protection engages at thermal threshold

Safe: Transient hits with cooling gaps
Dangerous: Sustained sub-bass drones
```

### Analysis Configuration
```javascript
const CLUB_CONFIG = {
  subBassRange: { low: 20, high: 80 },
  punchRange: { low: 80, high: 120 },
  thermalTimeConstantMs: 5000,    // 5-second thermal model
  windowSizeMs: 50,
  stressThresholdDb: -12,         // RMS above this = stress
  dangerThresholdDb: -6,          // RMS above this = danger
  sustainedDangerMs: 3000         // 3 seconds sustained = problem
};
```

### Key Metrics
```javascript
const ClubStressMetrics = {
  subBassRmsDb: 0,              // Average sub-bass RMS
  subBassPeakDb: 0,             // Peak sub-bass level
  crestFactor: 0,               // Peak/RMS ratio (transient vs sustained)
  thermalStressIndex: 0,        // Exponential-weighted accumulator (0-1)
  maxThermalStress: 0,          // Peak thermal stress reached
  sustainedDurationMs: 0,       // Max continuous high-energy
  excursionRisk: false,         // Peak levels that risk driver damage
  protectionRisk: 'LOW'         // Likelihood of protection engagement
};
```

### Thermal Stress Calculation
```javascript
function calculateThermalStress(rmsValues, config) {
  // Exponential moving average models physical heating/cooling
  const alpha = config.windowSizeMs / config.thermalTimeConstantMs;
  
  let thermalAccumulator = 0;
  let maxThermal = 0;
  const history = [];
  
  for (const rms of rmsValues) {
    // Power is proportional to RMS squared
    const power = rms * rms;
    
    // Heating (accumulation) and cooling (decay)
    thermalAccumulator = (1 - alpha) * thermalAccumulator + alpha * power;
    
    maxThermal = Math.max(maxThermal, thermalAccumulator);
    history.push(thermalAccumulator);
  }
  
  // Normalize to 0-1 scale (1 = theoretical max continuous power)
  const normalizedMax = maxThermal / (1.0);  // Assuming 0dBFS = 1.0 RMS
  
  return {
    thermalStressIndex: average(history),
    maxThermalStress: normalizedMax,
    thermalHistory: history
  };
}
```

### FFmpeg Filter Chain
```bash
# Sub-bass energy with 50ms windows
ffmpeg -i input.wav -af "
  highpass=f=20,lowpass=f=80,
  asetnsamples=n=2205,
  astats=metadata=1:reset=1:measure_perchannel=RMS_level+Peak_level+Crest_factor
" -f null -
```

### Protection Risk Assessment
```javascript
const ClubStressStatus = {
  LOW: 'LOW',             // Normal club playback
  MODERATE: 'MODERATE',   // Extended sub moments, acceptable
  HIGH: 'HIGH',           // Protection may engage on some systems
  CRITICAL: 'CRITICAL'    // Protection likely, system stress
};

function assessProtectionRisk(metrics) {
  const { thermalStressIndex, maxSustainedMs, crestFactor, subBassPeakDb } = metrics;
  
  // Excursion risk from peak levels
  if (subBassPeakDb > -3) {
    return { status: 'CRITICAL', reason: 'Peak sub-bass exceeds safe excursion limits' };
  }
  
  // Thermal risk from sustained energy
  if (thermalStressIndex > 0.75 || maxSustainedMs > 5000) {
    return { status: 'CRITICAL', reason: 'Sustained sub-bass will trigger thermal protection' };
  }
  
  if (thermalStressIndex > 0.5 || maxSustainedMs > 3000) {
    return { status: 'HIGH', reason: 'Extended sub-bass may stress system' };
  }
  
  if (thermalStressIndex > 0.3 || crestFactor < 8) {
    return { status: 'MODERATE', reason: 'Higher than typical sub-bass density' };
  }
  
  return { status: 'LOW', reason: 'Sub-bass within normal club levels' };
}
```

### Recommendations
| Status | Recommendation |
|--------|----------------|
| LOW | No action needed |
| MODERATE | Consider adding gaps in sustained sub sections |
| HIGH | Reduce 808/sub-bass tail lengths; add sidechain breathing |
| CRITICAL | Sustained sub-bass is dangerous; restructure low-end |

---

## 4. Streaming Codec Stress Test (Simulated)

### Concept
Lossy codecs (MP3, AAC, Opus) use psychoacoustic masking to remove "inaudible" content. Certain audio characteristics stress these codecs, causing audible artifacts. This analyzer **predicts** artifact risk without actual encoding.

### Artifact Sources
```
1. PRE-ECHO: Sharp transient after quiet section
   - Codec's transform window "smears" energy backward
   - Most audible: drum hits, plucks, consonants

2. HIGH-FREQUENCY ARTIFACTS: HF content heavily quantized
   - Hi-hats, cymbals, sibilance affected
   - "Swirly" or "underwater" sound

3. STEREO ARTIFACTS: Wide stereo in M/S encoding
   - Complex Side channel = more artifacts
   - Spatial "collapse" or "phasiness"

4. SPECTRAL FLUX: Rapid timbral changes stress codec
   - Abrupt transitions between sparse/dense sections
```

### Analysis Configuration
```javascript
const CODEC_CONFIG = {
  windowSizeMs: 23,             // ~MP3 frame size
  preEchoLookbackFrames: 2,     // Check 2 frames before transient
  quietThresholdDb: -40,        // Quiet enough for pre-echo audibility
  transientJumpDb: 20,          // dB increase = transient
  hfBand: { low: 10000, high: 20000 },
  sibilanceBand: { low: 5000, high: 10000 },
  stereoComplexityThreshold: 0.5  // Side/Mid ratio
};
```

### Key Metrics
```javascript
const CodecStressMetrics = {
  preEchoRiskEvents: 0,        // Count of quiet→loud transients
  preEchoRiskScore: 0,         // Weighted severity (0-1)
  hfEnergyRatio: 0,            // Energy above 10kHz vs total
  sibilanceRatio: 0,           // Energy 5-10kHz (problematic zone)
  stereoComplexity: 0,         // Side/Mid energy ratio
  spectralFlux: 0,             // Rate of spectral change
  overallCodecStress: 0,       // Combined metric (0-1)
  predictedArtifactLevel: ''   // NONE, MINOR, AUDIBLE, SEVERE
};
```

### Pre-Echo Detection
```javascript
function detectPreEchoRisks(audioFrames, config) {
  const risks = [];
  
  for (let i = 2; i < audioFrames.length; i++) {
    const current = audioFrames[i];
    const prev1 = audioFrames[i - 1];
    const prev2 = audioFrames[i - 2];
    
    // Check for quiet→loud transition
    const prevQuiet = prev1.rmsDb < config.quietThresholdDb &&
                      prev2.rmsDb < config.quietThresholdDb;
    const isTransient = current.peakDb > prev1.peakDb + config.transientJumpDb;
    
    if (prevQuiet && isTransient) {
      risks.push({
        timeMs: i * config.windowSizeMs,
        severity: current.peakDb - prev1.rmsDb,  // Larger = worse
        type: 'pre-echo'
      });
    }
  }
  
  return risks;
}
```

### Stereo Complexity Analysis
```javascript
function analyzeStereoComplexity(leftRms, rightRms, correlation) {
  // Calculate Mid/Side from L/R
  // M = (L+R)/2, S = (L-R)/2
  // High Side energy = complex stereo = codec stress
  
  // Approximate S/M ratio from correlation
  // Lower correlation = more Side energy
  const sideRatio = (1 - correlation) / 2;  // 0 = mono, 0.5 = fully decorrelated
  
  return {
    stereoComplexity: sideRatio,
    jointStereoStress: sideRatio > 0.3 ? 'HIGH' : sideRatio > 0.15 ? 'MEDIUM' : 'LOW'
  };
}
```

### Spectral Flux Calculation
```javascript
function calculateSpectralFlux(spectrumFrames) {
  let totalFlux = 0;
  
  for (let i = 1; i < spectrumFrames.length; i++) {
    let frameFlux = 0;
    for (let bin = 0; bin < spectrumFrames[i].length; bin++) {
      // Half-wave rectified difference (only increases)
      const diff = spectrumFrames[i][bin] - spectrumFrames[i - 1][bin];
      frameFlux += Math.max(0, diff);
    }
    totalFlux += frameFlux;
  }
  
  return totalFlux / spectrumFrames.length;
}
```

### FFmpeg Filter Chain
```bash
# High-frequency energy analysis
ffmpeg -i input.wav -af "
  asplit=3[full][hf][sib],
  [full]astats=metadata=1:reset=1[full_stats];
  [hf]highpass=f=10000,astats=metadata=1:reset=1[hf_stats];
  [sib]highpass=f=5000,lowpass=f=10000,astats=metadata=1:reset=1[sib_stats]
" -f null -

# Transient detection via envelope following
ffmpeg -i input.wav -af "
  asetnsamples=n=1024,
  astats=metadata=1:reset=1
" -f null -
```

### Classification
```javascript
const CodecStressStatus = {
  LOW: 'LOW',             // Clean encoding expected
  MODERATE: 'MODERATE',   // Minor artifacts at <192kbps
  HIGH: 'HIGH',           // Audible artifacts at <256kbps
  CRITICAL: 'CRITICAL'    // Artifacts even at high bitrates
};

function classifyCodecStress(metrics) {
  const { preEchoRiskScore, hfEnergyRatio, stereoComplexity, spectralFlux } = metrics;
  
  // Weighted combination
  const combined = preEchoRiskScore * 0.35 +
                   hfEnergyRatio * 0.25 +
                   stereoComplexity * 0.25 +
                   (spectralFlux / 100) * 0.15;
  
  if (combined < 0.2) return 'LOW';
  if (combined < 0.4) return 'MODERATE';
  if (combined < 0.6) return 'HIGH';
  return 'CRITICAL';
}
```

### Recommendations
| Status | Recommendation |
|--------|----------------|
| LOW | Safe for all streaming bitrates |
| MODERATE | Use 256kbps+ for best quality; consider limiting HF |
| HIGH | Recommend 320kbps or lossless; review transient density |
| CRITICAL | Pre-echo issues likely; add subtle fade-ins before hits |

---

## 5. Mono Fold-Down Simulation (Analysis-Only)

### Concept
When stereo is summed to mono, phase differences cause interference. Frequencies with opposite phase cancel. This analyzer measures mono compatibility **without creating a mono file**.

### Phase Relationship Basics
```
Correlation Interpretation:
+1.0:      Identical (perfect mono)
+0.7-1.0:  Highly correlated (mono-safe)
+0.3-0.7:  Moderate stereo width
 0.0-0.3:  Wide stereo, cancellation risk
-0.3-0.0:  Significant cancellation
-1.0-(-0.3): Severe phase issues

Mono Sum: L_mono = (L + R) / 2
- 180° out of phase = complete cancellation
- 90° out of phase = -3dB reduction
- In phase = no loss
```

### Analysis Bands
```javascript
const MONO_BANDS = [
  { name: 'subBass',   low: 20,    high: 80,    critical: true },
  { name: 'bass',      low: 80,    high: 250,   critical: true },
  { name: 'lowMid',    low: 250,   high: 500,   critical: false },
  { name: 'mid',       low: 500,   high: 2000,  critical: false },
  { name: 'upperMid',  low: 2000,  high: 6000,  critical: false },
  { name: 'high',      low: 6000,  high: 20000, critical: false }
];
```

### Key Metrics
```javascript
const MonoFoldDownMetrics = {
  overallCorrelation: 0,       // Full-spectrum L-R correlation (-1 to +1)
  monoGainChangeDb: 0,         // Level difference: stereo vs mono
  bandCorrelations: [],        // Per-band correlation values
  bandGainChanges: [],         // Per-band mono gain changes
  worstBand: null,             // Band with worst cancellation
  cancellationSeverity: '',    // NONE, MINOR, MODERATE, SEVERE
  bassCorrelation: 0,          // Sub-bass + bass combined (critical)
  estimatedTimbreChange: ''    // Description of tonal shift
};
```

### Correlation Calculation
```javascript
function calculateCorrelation(leftSamples, rightSamples) {
  const n = leftSamples.length;
  const meanL = leftSamples.reduce((a, b) => a + b, 0) / n;
  const meanR = rightSamples.reduce((a, b) => a + b, 0) / n;
  
  let numerator = 0, denomL = 0, denomR = 0;
  
  for (let i = 0; i < n; i++) {
    const diffL = leftSamples[i] - meanL;
    const diffR = rightSamples[i] - meanR;
    numerator += diffL * diffR;
    denomL += diffL * diffL;
    denomR += diffR * diffR;
  }
  
  return numerator / Math.sqrt(denomL * denomR);
}
```

### Mono Gain Change Estimation
```javascript
function estimateMonoGainChange(correlation) {
  // Mathematical relationship between correlation and mono sum gain
  // Mono RMS = sqrt((L² + R² + 2*L*R*correlation) / 4)
  // For equal L/R levels: gain change ≈ 10*log10((1 + correlation) / 2)
  
  if (correlation >= 1) return 3.0;   // Perfect sum: +3dB
  if (correlation <= -1) return -Infinity;  // Complete cancellation
  
  const gainFactor = (1 + correlation) / 2;
  return 10 * Math.log10(gainFactor + 1e-10);
}
```

### FFmpeg Filter Chain
```bash
# Stereo analysis via stereotools + astats
ffmpeg -i input.wav -af "
  astats=metadata=1:reset=1:measure_overall=none
" -f null - 2>&1

# Per-band correlation (requires splitting and analyzing)
ffmpeg -i input.wav -af "
  asplit=2[bass_in][full_in],
  [bass_in]highpass=f=20,lowpass=f=250,astats=metadata=1:reset=1[bass_out]
" -f null -

# Note: FFmpeg's astats doesn't directly report L-R correlation
# Need to extract samples and calculate in code, or use aphasemeter
ffmpeg -i input.wav -af "aphasemeter=video=0" -f null - 2>&1
```

### Classification
```javascript
const MonoCompatibilityStatus = {
  EXCELLENT: 'EXCELLENT',    // Correlation > 0.8, < 1dB loss
  GOOD: 'GOOD',              // Correlation > 0.6, < 2dB loss
  FAIR: 'FAIR',              // Correlation > 0.4, < 3dB loss
  POOR: 'POOR',              // Correlation > 0.2, < 6dB loss
  CRITICAL: 'CRITICAL'       // Correlation < 0.2 or > 6dB loss
};

function classifyMonoCompatibility(metrics) {
  const { overallCorrelation, monoGainChangeDb, bassCorrelation } = metrics;
  
  // Bass cancellation is more critical
  if (bassCorrelation < 0.3) return 'CRITICAL';
  if (monoGainChangeDb < -6) return 'CRITICAL';
  
  if (overallCorrelation > 0.8 && monoGainChangeDb > -1) return 'EXCELLENT';
  if (overallCorrelation > 0.6 && monoGainChangeDb > -2) return 'GOOD';
  if (overallCorrelation > 0.4 && monoGainChangeDb > -3) return 'FAIR';
  if (overallCorrelation > 0.2) return 'POOR';
  
  return 'CRITICAL';
}
```

### Timbre Change Prediction
```javascript
function predictTimbreChanges(bandAnalysis) {
  const changes = [];
  
  for (const band of bandAnalysis) {
    if (band.monoGainChangeDb < -3) {
      const description = band.monoGainChangeDb < -6 
        ? `${band.name} will be significantly quieter (${band.monoGainChangeDb.toFixed(1)}dB)`
        : `${band.name} will lose ${Math.abs(band.monoGainChangeDb).toFixed(1)}dB`;
      
      changes.push({ band: band.name, change: description, severity: band.severity });
    }
  }
  
  return changes;
}
```

### Common Issues Detected
| Issue | Detection | Severity |
|-------|-----------|----------|
| Bass cancellation | bassCorrelation < 0.5 | CRITICAL |
| Vocal thinning | mid correlation < 0.6, gain < -2dB | HIGH |
| Reverb collapse | All bands moderate decorrelation | MEDIUM |
| Wide synth holes | Specific band correlation < 0.3 | HIGH |
| Stereo effect loss | High freq decorrelation | LOW |

### Recommendations
| Status | Recommendation |
|--------|----------------|
| EXCELLENT | Fully mono-compatible |
| GOOD | Minor stereo content, acceptable for most uses |
| FAIR | Check on mono systems; may need bass mono-ing |
| POOR | Use stereo-to-mono bass; reduce stereo widening |
| CRITICAL | Severe phase issues; mono bass required, review stereo plugins |

---

## Implementation Priority

| Priority | Analyzer | Reasoning |
|----------|----------|-----------|
| 1 | **Mono Fold-Down** | Leverages existing `lowEndMonoChecker` patterns; clear metrics |
| 2 | **Small Speaker Translation** | High client value; straightforward band analysis |
| 3 | **Club System Stress** | Clear thermal model; unique selling point |
| 4 | **Car System Translation** | Similar to club but different frequency focus |
| 5 | **Streaming Codec Stress** | Most complex; requires transient detection |

## File Naming Convention
Following existing pattern:
- `signal/services/smallSpeakerTranslator.js`
- `signal/services/carSystemTranslator.js`
- `signal/services/clubSystemStress.js`
- `signal/services/codecStressPredictor.js`
- `signal/services/monoFoldDownSimulator.js`

## API Pattern (Consistent with existing analyzers)
```javascript
// Full analysis
const result = await analyzer.analyze(filePath, options);

// Quick check for initial assessment
const quick = await analyzer.quickCheck(filePath);

// Direct analysis from pre-extracted data
const classification = analyzer.classify(extractedMetrics);

// Exports
module.exports = {
  analyze,
  quickCheck,
  classify,
  // Constants
  Status,
  Thresholds,
  // Utilities
  ...
};
```

## Integration Points
Each analyzer integrates into `audioProcessor.js`:
1. Import at top of file
2. Add to `Promise.all` in `analyzeAudioInternal()`
3. Add to return object
4. Add to `identifyProblems()` for issue detection
5. Add to exports

---

## Next Steps

1. **Select first analyzer** to implement (recommend Mono Fold-Down)
2. **Create service file** following existing patterns
3. **Create test file** with 50+ unit tests
4. **Integrate** into audioProcessor.js
5. **Repeat** for remaining analyzers
