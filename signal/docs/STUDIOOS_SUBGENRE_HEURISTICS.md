# StudioOS Subgenre Heuristics Specification

## Document Purpose

This specification defines how StudioOS uses ML-derived signal patterns to classify production risk profiles and adjust processing constraints. It is designed to integrate with the existing ProcessingReport, DecisionEngine, and confidence system.

---

## 1. Classification Philosophy

StudioOS does **NOT** classify subgenre to label artists.

It classifies **production risk profiles** that correlate with subgenre norms.

Subgenre inference is:

- **Probabilistic** — Outputs likelihood distributions, not hard labels
- **Advisory** — Informs constraint weighting, never controls presets
- **Never user-facing by default** — Framed as "production profile" in reports
- **Risk-focused** — Used only to tune risk weighting, not creative intent

---

## 2. Supported Subgenre Buckets

These are deliberately coarse to avoid false precision:

| Bucket | Description |
|--------|-------------|
| `trap` | Dense low-frequency content with prominent transients |
| `drill` | Heavily compressed low-mid content with limited dynamic range |
| `melodic` | Vocal-forward mix with wide stereo imaging |
| `boomBap` | Midrange-focused with natural dynamics |
| `hybrid` | Mixed production characteristics (fallback) |

---

## 3. Signal → Subgenre Heuristic Matrix

### Core Signals

| Signal | Description | Unit |
|--------|-------------|------|
| `bpm` | Tempo | BPM |
| `subBassEnergy` | Energy ratio 30-60 Hz | 0-1 |
| `transientDensity` | Transient event frequency | 0-1 |
| `dynamicRange` | Loudness range | LU |
| `stereoWidth` | Stereo correlation | 0-1 |
| `mixBalance` | Dominant element | enum |

### Expected Ranges by Subgenre

#### Trap
```
BPM: 120-150
Sub-bass: 0.5-0.9
Transients: 0.5-0.8
Dynamic Range: 4-10 LU
Stereo Width: 0.3-0.7
Mix Balance: balanced
```

#### Drill
```
BPM: 130-145
Sub-bass: 0.6-0.95
Transients: 0.6-0.9
Dynamic Range: 2-6 LU
Stereo Width: 0.2-0.5
Mix Balance: beat-dominant
```

#### Melodic
```
BPM: 90-130
Sub-bass: 0.3-0.6
Transients: 0.2-0.5
Dynamic Range: 8-14 LU
Stereo Width: 0.6-0.95
Mix Balance: vocal-dominant
```

#### Boom Bap
```
BPM: 85-100
Sub-bass: 0.1-0.4
Transients: 0.4-0.7
Dynamic Range: 10-16 LU
Stereo Width: 0.4-0.7
Mix Balance: vocal-dominant
```

---

## 4. Risk Weight Adjustments

Subgenre classification affects **risk sensitivity multipliers**, applied during confidence aggregation only.

| Risk Type | Trap | Drill | Melodic | Boom Bap | Hybrid |
|-----------|------|-------|---------|----------|--------|
| `maskingRisk` | 1.0x | 1.3x | 0.8x | 0.9x | 1.0x |
| `clippingRisk` | 1.1x | 1.5x | 0.9x | 0.8x | 1.0x |
| `phaseCollapseRisk` | 0.8x | 0.7x | 1.4x | 0.9x | 1.0x |
| `dynamicsRisk` | 0.9x | 0.7x | 1.3x | 1.5x | 1.0x |
| `translationRisk` | 1.0x | 1.3x | 1.1x | 0.8x | 1.0x |
| `vocalIntelligibilityRisk` | 1.0x | 1.0x | 1.3x | 1.1x | 1.0x |
| `overCompressionRisk` | 0.9x | 1.4x | 1.2x | 1.4x | 1.0x |

---

## 5. Decision Engine Rules

### Rule Categories

1. **Loudness Rules** — Control peak and loudness ceiling
2. **Low-End Rules** — Manage sub-bass and low-frequency stereo
3. **Vocal Rules** — Protect vocal presence and clarity
4. **Stereo/Phase Rules** — Monitor mono compatibility
5. **Dynamics Rules** — Preserve transients and dynamic range
6. **Translation Rules** — Flag playback compatibility issues
7. **Uncertainty Rules** — Handle ambiguous classifications

### Critical Rules by Subgenre

#### Drill-Specific
- `LOUD_001`: Hard-limit loudness increases (max 2 LU)
- `LOW_002`: Enforce -1.5 dBTP ceiling
- `TRANS_001`: Flag translation risk at 0.4 threshold

#### Melodic-Specific
- `VOC_002`: Weight vocal clarity 1.5x in confidence
- `DYN_001`: Limit gain reduction to 3 dB
- `STER_001`: Monitor phase correlation (0.7 threshold)
- `STER_002`: Cap stereo width at 0.85

#### Boom Bap-Specific
- `LOUD_002`: Preserve dynamics (minimal loudness normalization)
- `DYN_002`: Enable transient preservation (30ms attack)
- `DYN_003`: Increase compression artifact penalty 1.5x

#### Trap-Specific
- `LOW_001`: Apply -1.5 dB low-frequency attenuation
- `VOC_001`: Protect 2-5 kHz vocal presence
- `LOW_003`: Collapse lows to mono below 120 Hz

#### Uncertainty Rules (All Hybrid)
- `UNC_001`: Force conservative processing mode
- `UNC_002`: Apply 0.1 uncertainty penalty to confidence
- `UNC_003`: Require explanation in report

---

## 6. Classification Thresholds

### Hybrid Trigger Conditions
- Top subgenre probability < 0.35
- Top two subgenres within 0.08 probability

### Conflicting Signals Flag
- Top two subgenres within 0.12 probability
- Only set when NOT classified as hybrid

### Confidence Blending
When uncertain (< 0.6 confidence), risk weights blend toward neutral:
```
blendedWeight = 1.0 + (subgenreWeight - 1.0) * confidence
```

---

## 7. UX Language Impact

### Confidence Tiers

| Tier | Range | Label | Color |
|------|-------|-------|-------|
| HIGH | ≥ 0.85 | high | green |
| GOOD | ≥ 0.70 | good | blue |
| MODERATE | ≥ 0.55 | moderate | yellow |
| LOW | ≥ 0.40 | low | orange |
| VERY_LOW | < 0.40 | very low | red |

### Profile Description Templates

Subgenre is **NEVER** presented as identity. Framing:

**Trap:**
> "Production profile indicates elevated sub-bass energy with high transient density, typical of aggressive urban production styles."

**Drill:**
> "Production profile shows dense mid-low frequency region with aggressive limiting and narrow stereo field."

**Melodic:**
> "Production profile emphasizes vocal presence with spacious stereo effects and preserved dynamic range."

**Boom Bap:**
> "Production profile features strong midrange emphasis with wide dynamic range and minimal sub-bass."

**Hybrid:**
> "Production profile shows characteristics that span multiple production styles, suggesting a hybrid or experimental approach."

### Uncertainty Language

When classification confidence is low:
> "The production profile could not be confidently determined from the available signals. Processing will use conservative, genre-agnostic parameters to minimize risk."

When signals conflict:
> "Signal analysis detected conflicting characteristics. For example, the tempo and transient patterns suggest different production approaches."

---

## 8. Guardrails (Critical)

| Rule | Enforcement |
|------|-------------|
| Subgenre inference NEVER changes presets | Hard-coded |
| Subgenre inference NEVER changes parameters | Hard-coded |
| Subgenre inference ONLY affects constraint sensitivity | Architecture |
| Subgenre inference MUST be overrideable by deterministic metrics | Rule priority |
| Subgenre labels NEVER appear in user-facing output | Template enforcement |

---

## 9. Implementation Files

| File | Purpose |
|------|---------|
| `services/subgenreHeuristics.js` | Classification engine, risk weights |
| `services/decisionEngine.js` | Explicit rules, constraint aggregation |
| `services/confidenceSimulator.js` | Simulation scenarios, testing |
| `services/uxLanguage.js` | User-facing language generation |

---

## 10. Simulation Results Summary

Based on 10 test scenarios across all subgenres:

| Subgenre | Avg Confidence | Avg Delta | Key Rules |
|----------|----------------|-----------|-----------|
| Trap | 53% | -0.27% | LOW_001, VOC_001, LOW_003 |
| Drill | 34% | -2.32% | LOUD_001, LOW_002, TRANS_001 |
| Melodic | 69.5% | -0.54% | VOC_002, DYN_001, STER_001/002 |
| Hybrid | 67.7% | 0.00% | UNC_001, UNC_002 |

---

## One-Sentence Summary

**StudioOS uses subgenre inference to understand risk patterns, not to judge style—and only to protect artists from technical failure, not creative expression.**
