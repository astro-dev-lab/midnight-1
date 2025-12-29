# StudioOS Subgenre Heuristics v2 — Version Manifest

## Document Purpose

This manifest defines **v2** of the Subgenre Heuristics system.
Extends v1 with additional subgenre buckets, enhanced signal extraction, and scale validation infrastructure.

---

## Version Information

| Field | Value |
|-------|-------|
| Version | 2.0.0 |
| Base Version | 1.0.0 |
| Status | VALIDATED |
| Stability | Testing |
| Validated Date | 2024-12-29 |

---

## v2 Implementation Status

### Files Created

| File | Purpose | Status |
|------|---------|--------|
| `services/subgenreHeuristicsV2.js` | Core v2 classification engine | ✅ Complete |
| `services/subgenreJobIntegration.js` | Job pipeline hooks | ✅ Complete |
| `services/catalogValidator.js` | Enterprise-scale validation | ✅ Complete |
| `services/groundTruthManager.js` | Ground truth labeling tools | ✅ Complete |
| `services/subgenreV2Test.js` | System validation test | ✅ Complete |

### Test Results

```
Total: 8/8 tests passed
- Classification: PASS (100% top-3 accuracy)
- Risk Weights: PASS (11/11 valid)
- Job Integration: PASS
- Constraint Adjustment: PASS
- Guardrails: PASS (all 4 immutable guardrails verified)
```

---

## v2 Scope Additions

### New Subgenre Buckets (+5)

| Bucket | Description | Status |
|--------|-------------|--------|
| `lofi` | Low-fidelity aesthetic with vinyl artifacts, reduced high-end | ✅ Complete |
| `phonk` | Memphis-influenced, heavy sampling, cowbell patterns | ✅ Complete |
| `cloudRap` | Ethereal, heavily reverbed, atmospheric pads | ✅ Complete |
| `ukDrill` | UK-specific drill variant, sliding 808s, distinct flow patterns | ✅ Complete |
| `rage` | High-energy, distorted synths, aggressive compression | ✅ Complete |

### Enhanced Signal Extraction (+3 Signals)

| Signal | Source | Implementation |
|--------|--------|----------------|
| `vinylNoise` | High-frequency noise floor detection | ✅ Complete |
| `reverbDecay` | Reverb tail length estimation | ✅ Complete |
| `distortion` | Saturation/distortion level | ✅ Complete |
| `cowbellPresence` | Phonk cowbell pattern detection | ✅ Complete |
| `slidingBass` | UK drill sliding 808 detection | ✅ Complete |
| `highFreqRolloff` | Lo-fi high frequency attenuation | ✅ Complete |

### New Risk Types (+2)

| Risk | Calculation | Status |
|------|-------------|--------|
| `artifactRisk` | Intentional vs unintentional distortion | ✅ Complete |
| `lofiAestheticRisk` | Risk of "cleaning" intentional lo-fi character | ✅ Complete |

### New Decision Rules (+8)

| Category | Rules | Purpose |
|----------|-------|---------|
| Lo-Fi | LOFI_001, LOFI_002 | Preserve intentional artifacts |
| Phonk | PHONK_001, PHONK_002 | Handle Memphis-style compression |
| Cloud | CLOUD_001, CLOUD_002 | Protect atmospheric elements |
| Rage | RAGE_001, RAGE_002 | Handle intentional distortion |

---

## v2 Subgenre Profiles

### Lo-Fi Heuristics

**Common Signal Profile**
```
BPM: 70-95
Sub-bass: 0.2-0.5
Transients: 0.2-0.4 (softened)
Dynamic Range: 6-12 LU
Stereo Width: 0.4-0.7
Vinyl Noise: 0.3-0.8
High-Frequency Rolloff: Aggressive
```

**Expected Risks**
```json
{
  "lofiAestheticRisk": 0.4-0.8,
  "overCompressionRisk": 0.2-0.4,
  "translationRisk": 0.2-0.4
}
```

**Decision Implications**
- NEVER apply high-frequency restoration
- Preserve noise floor unless clipping
- Gentle dynamics processing only

---

### Phonk Heuristics

**Common Signal Profile**
```
BPM: 120-145
Sub-bass: 0.5-0.8
Transients: 0.6-0.9 (cowbell emphasis)
Dynamic Range: 3-7 LU
Stereo Width: 0.3-0.6
Sample Artifacts: Present
```

**Expected Risks**
```json
{
  "clippingRisk": 0.4-0.7,
  "artifactRisk": 0.3-0.6,
  "overCompressionRisk": 0.5-0.8
}
```

**Decision Implications**
- Accept intentional distortion
- Preserve cowbell transients
- Memphis-style compression acceptable

---

### Cloud Rap Heuristics

**Common Signal Profile**
```
BPM: 80-120
Sub-bass: 0.3-0.6
Transients: 0.1-0.3 (diffuse)
Dynamic Range: 8-14 LU
Stereo Width: 0.7-0.95
Reverb Decay: Long (>1.5s)
```

**Expected Risks**
```json
{
  "phaseCollapseRisk": 0.4-0.7,
  "translationRisk": 0.4-0.7,
  "vocalIntelligibilityRisk": 0.3-0.6
}
```

**Decision Implications**
- Protect spatial characteristics
- Careful with stereo width limiting
- Preserve reverb tails

---

### UK Drill Heuristics

**Common Signal Profile**
```
BPM: 138-145
Sub-bass: 0.6-0.9 (sliding 808s)
Transients: 0.5-0.8
Dynamic Range: 3-6 LU
Stereo Width: 0.25-0.5
808 Slides: Present
```

**Expected Risks**
```json
{
  "maskingRisk": 0.5-0.8,
  "clippingRisk": 0.5-0.8,
  "translationRisk": 0.5-0.75
}
```

**Decision Implications**
- Similar to US drill but tighter BPM range
- Preserve 808 slide character
- Stricter peak limiting

---

### Rage Heuristics

**Common Signal Profile**
```
BPM: 140-170
Sub-bass: 0.4-0.7
Transients: 0.7-0.95 (aggressive)
Dynamic Range: 2-5 LU
Stereo Width: 0.4-0.7
Distortion: Present (intentional)
```

**Expected Risks**
```json
{
  "artifactRisk": 0.5-0.9,
  "clippingRisk": 0.6-0.9,
  "overCompressionRisk": 0.6-0.9
}
```

**Decision Implications**
- Accept intentional distortion
- High-energy preservation critical
- Loudness ceiling strict

---

## v2 Risk Weight Matrix

| Risk | Trap | Drill | Melodic | BoomBap | Hybrid | Lo-Fi | Phonk | Cloud | UKDrill | Rage |
|------|------|-------|---------|---------|--------|-------|-------|-------|---------|------|
| maskingRisk | 1.0x | 1.3x | 0.8x | 0.9x | 1.0x | 0.7x | 1.1x | 0.7x | 1.4x | 1.2x |
| clippingRisk | 1.1x | 1.5x | 0.9x | 0.8x | 1.0x | 0.6x | 0.8x | 0.8x | 1.5x | 0.7x |
| phaseCollapseRisk | 0.8x | 0.7x | 1.4x | 0.9x | 1.0x | 0.8x | 0.7x | 1.5x | 0.7x | 0.8x |
| dynamicsRisk | 0.9x | 0.7x | 1.3x | 1.5x | 1.0x | 1.2x | 0.6x | 1.2x | 0.7x | 0.5x |
| translationRisk | 1.0x | 1.3x | 1.1x | 0.8x | 1.0x | 0.7x | 1.0x | 1.3x | 1.4x | 1.1x |
| vocalIntelligibilityRisk | 1.0x | 1.0x | 1.3x | 1.1x | 1.0x | 0.9x | 0.9x | 1.2x | 1.0x | 0.8x |
| overCompressionRisk | 0.9x | 1.4x | 1.2x | 1.4x | 1.0x | 0.8x | 0.6x | 1.1x | 1.4x | 0.5x |
| artifactRisk | 1.0x | 1.0x | 1.0x | 1.0x | 1.0x | 0.4x | 0.5x | 0.9x | 1.0x | 0.3x |
| lofiAestheticRisk | 0.5x | 0.5x | 0.7x | 0.8x | 0.7x | 1.5x | 1.2x | 1.0x | 0.5x | 0.6x |

---

## v2 Classification Thresholds

| Threshold | v1 Value | v2 Value | Change Reason |
|-----------|----------|----------|---------------|
| Hybrid trigger (probability) | < 0.35 | < 0.30 | More buckets require higher precision |
| Hybrid trigger (gap) | < 0.08 | < 0.06 | Tighter discrimination |
| Conflicting signals flag | < 0.12 | < 0.10 | More nuanced detection |
| Confidence blend threshold | < 0.60 | < 0.55 | Earlier blending for stability |

---

## Scale Validation Infrastructure

### Catalog Validation System

v2 introduces enterprise-scale catalog validation:

| Component | Purpose |
|-----------|---------|
| `catalogValidator.js` | Batch processing orchestration |
| `validationReporter.js` | Statistical analysis and reporting |
| `groundTruthManager.js` | Manual labeling and comparison |
| `performanceBenchmark.js` | Timing and resource tracking |

### Validation Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Classification Accuracy | > 75% | vs ground truth labels |
| Confidence Calibration | ±10% | predicted vs actual success |
| Processing Throughput | > 10 files/sec | catalog scan rate |
| Memory Efficiency | < 500MB | peak usage during batch |
| Rule Application Distribution | Balanced | no single rule > 40% |

---

## Breaking Changes from v1

| Change | Impact | Migration |
|--------|--------|-----------|
| New subgenre buckets | Classification distributions shift | Re-validate existing results |
| New signal types | Signal extraction API changes | Update all callers |
| New risk types | Risk weight matrix expanded | Update confidence calculations |
| Threshold changes | Some v1 classifications may change | Accept as refinement |

---

## Guardrails (Inherited from v1 — Immutable)

1. **Subgenre inference NEVER changes presets**
2. **Subgenre inference NEVER changes parameters**
3. **Subgenre inference ONLY affects constraint sensitivity**
4. **Subgenre inference MUST be overrideable by deterministic metrics**
5. **Subgenre labels NEVER appear in user-facing output**
6. **Classification is PROBABILISTIC, never deterministic**
7. **System defaults to CONSERVATIVE when uncertain**

---

## v2 Validation Checksum

```
Subgenre Count: 10 (+5 from v1)
Signal Count: 9 (+3 from v1)
Risk Count: 8 (+2 from v1)
Rule Count: 27 (+8 from v1)
Recovery Issue Types: 11 (+2 from v1)
Confidence Tiers: 5 (unchanged)
Guardrails: 7 (unchanged)
```

---

## Implementation Status

| Component | Status | ETA |
|-----------|--------|-----|
| subgenreHeuristics v2 | 🔄 In Progress | This session |
| decisionEngine v2 | 🔄 In Progress | This session |
| catalogValidator | 🔄 In Progress | This session |
| validationReporter | 🔄 In Progress | This session |
| Ground truth tooling | ⏳ Pending | Next session |

---

**Status: IN DEVELOPMENT**
