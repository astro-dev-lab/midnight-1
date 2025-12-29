# StudioOS Subgenre Heuristics v1 — Version Manifest

## Document Purpose

This manifest formally locks **v1** of the Subgenre Heuristics system.
All scope is frozen at this specification. Extensions require a new version.

---

## Version Information

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Lock Date | 2024-12-29 |
| Status | FROZEN |
| Stability | Experimental |
| Breaking Changes | Expected in v2 |

---

## Scope Definition

### What v1 INCLUDES

#### Subgenre Buckets (5)
| Bucket | Status |
|--------|--------|
| `trap` | ✅ Implemented |
| `drill` | ✅ Implemented |
| `melodic` | ✅ Implemented |
| `boomBap` | ✅ Implemented |
| `hybrid` | ✅ Implemented (fallback) |

#### Signal Types (6)
| Signal | Source | Status |
|--------|--------|--------|
| `bpm` | Not implemented (requires beat detection) | ⚠️ Deferred |
| `subBassEnergy` | Derived from spectral centroid | ✅ Proxy |
| `transientDensity` | Derived from crest factor | ✅ Proxy |
| `dynamicRange` | From loudness analysis | ✅ Direct |
| `stereoWidth` | From stereo analysis | ✅ Direct |
| `mixBalance` | Inferred heuristic | ✅ Proxy |

#### Risk Types (6)
| Risk | Calculation | Status |
|------|-------------|--------|
| `maskingRisk` | Spectral flatness inversion | ✅ Implemented |
| `clippingRisk` | True peak headroom | ✅ Implemented |
| `translationRisk` | Stereo width + mono compatibility | ✅ Implemented |
| `phaseCollapseRisk` | Phase correlation | ✅ Implemented |
| `overCompressionRisk` | Loudness range threshold | ✅ Implemented |
| `vocalIntelligibilityRisk` | Derived from masking | ✅ Proxy |

#### Decision Rules (19)
| Category | Rules | Status |
|----------|-------|--------|
| Loudness | LOUD_001, LOUD_002, LOUD_003 | ✅ Implemented |
| Low-End | LOW_001, LOW_002, LOW_003 | ✅ Implemented |
| Vocal | VOC_001, VOC_002 | ✅ Implemented |
| Stereo/Phase | STER_001, STER_002 | ✅ Implemented |
| Dynamics | DYN_001, DYN_002, DYN_003 | ✅ Implemented |
| Translation | TRANS_001 | ✅ Implemented |
| Uncertainty | UNC_001, UNC_002, UNC_003 | ✅ Implemented |

#### Recovery Paths (8 Issue Types)
| Issue Type | Actions | Status |
|------------|---------|--------|
| `uncertain_classification` | 2 | ✅ Implemented |
| `conflicting_signals` | 2 | ✅ Implemented |
| `high_clipping_risk` | 2 | ✅ Implemented |
| `high_masking_risk` | 2 | ✅ Implemented |
| `high_translation_risk` | 2 | ✅ Implemented |
| `high_phase_risk` | 2 | ✅ Implemented |
| `high_compression_risk` | 2 | ✅ Implemented |
| `extraction_errors` | 3 | ✅ Implemented |
| `low_confidence` | 3 | ✅ Implemented |

---

### What v1 EXPLICITLY EXCLUDES

#### Subgenre Buckets NOT Supported
- `lofi` — Deferred to v2
- `phonk` — Deferred to v2
- `cloud_rap` — Deferred to v2
- `conscious` — Deferred to v2
- `southern` — Deferred to v2
- `uk_rap` — Deferred to v2
- `spanish_rap` — Deferred to v2
- `afrobeats` — Out of domain (not rap)
- Any genre outside hip-hop/rap — Out of scope

#### Signal Types NOT Implemented
- `bpm` — Requires beat detection ML
- `vocalPresence` — Requires vocal separation
- `harmonicContent` — Requires harmonic analysis
- `sampleDensity` — Requires transient detection
- `808Character` — Requires instrument classification

#### Features NOT Implemented
- Real-time classification
- User-provided genre hints
- Learning from feedback
- Cross-reference with metadata
- Reference track comparison
- Artist history weighting
- Playlist context

#### Integration NOT Implemented
- Preset auto-selection (EXPLICITLY FORBIDDEN)
- Parameter auto-adjustment (EXPLICITLY FORBIDDEN)
- UI genre display (EXPLICITLY FORBIDDEN by design)

---

## Implementation Files (Frozen)

| File | Purpose | Lines | Hash |
|------|---------|-------|------|
| `services/subgenreHeuristics.js` | Classification engine | ~280 | v1 |
| `services/decisionEngine.js` | Rule system | ~350 | v1 |
| `services/confidenceSimulator.js` | Test scenarios | ~300 | v1 |
| `services/uxLanguage.js` | User-facing language | ~350 | v1 |
| `services/confidenceTester.js` | Pressure testing | ~450 | v1 |
| `services/confidenceRecovery.js` | Recovery paths | ~320 | v1 |
| `docs/STUDIOOS_SUBGENRE_HEURISTICS.md` | Specification | ~200 | v1 |

---

## Classification Thresholds (Frozen)

| Threshold | Value | Meaning |
|-----------|-------|---------|
| Hybrid trigger (probability) | < 0.35 | Top subgenre not dominant enough |
| Hybrid trigger (gap) | < 0.08 | Too close between top candidates |
| Conflicting signals flag | < 0.12 | Close race, but not hybrid |
| Confidence blend threshold | < 0.60 | Blend toward neutral weights |

---

## Risk Weight Matrix (Frozen)

| Risk | Trap | Drill | Melodic | Boom Bap | Hybrid |
|------|------|-------|---------|----------|--------|
| maskingRisk | 1.0x | 1.3x | 0.8x | 0.9x | 1.0x |
| clippingRisk | 1.1x | 1.5x | 0.9x | 0.8x | 1.0x |
| phaseCollapseRisk | 0.8x | 0.7x | 1.4x | 0.9x | 1.0x |
| dynamicsRisk | 0.9x | 0.7x | 1.3x | 1.5x | 1.0x |
| translationRisk | 1.0x | 1.3x | 1.1x | 0.8x | 1.0x |
| vocalIntelligibilityRisk | 1.0x | 1.0x | 1.3x | 1.1x | 1.0x |
| overCompressionRisk | 0.9x | 1.4x | 1.2x | 1.4x | 1.0x |

---

## Confidence Tiers (Frozen)

| Tier | Range | Recovery Status |
|------|-------|-----------------|
| HIGH | ≥ 85% | Nominal |
| GOOD | ≥ 70% | Informational |
| MODERATE | ≥ 55% | Advisory |
| LOW | ≥ 40% | Warning |
| VERY_LOW | < 40% | Critical |

---

## Test Scenarios (Frozen)

| Scenario | Expected Classification | Expected Tier |
|----------|------------------------|---------------|
| trapClean | trap or hybrid | GOOD+ |
| trapProblematic | trap | MODERATE |
| drillTypical | drill or hybrid | MODERATE |
| drillExtreme | drill | LOW |
| melodicClean | melodic | GOOD+ |
| melodicPhaseIssues | melodic | MODERATE |
| boomBapClassic | boomBap or hybrid | GOOD+ |
| boomBapCompressed | boomBap or hybrid | MODERATE |
| hybridAmbiguous | hybrid | MODERATE |
| hybridConflicting | hybrid | LOW |

---

## Guardrails (Immutable)

These guardrails are **PERMANENT** and will not change in any future version:

1. **Subgenre inference NEVER changes presets**
2. **Subgenre inference NEVER changes parameters**
3. **Subgenre inference ONLY affects constraint sensitivity**
4. **Subgenre inference MUST be overrideable by deterministic metrics**
5. **Subgenre labels NEVER appear in user-facing output**
6. **Classification is PROBABILISTIC, never deterministic**
7. **System defaults to CONSERVATIVE when uncertain**

---

## Breaking Change Policy

Changes to the following require a MAJOR version increment (v2.0.0):

- Adding new subgenre buckets
- Changing risk weight matrix values
- Modifying classification thresholds
- Adding new signal types
- Changing recovery tier thresholds
- Modifying UX language templates

Changes to the following require a MINOR version increment (v1.1.0):

- Adding new decision rules
- Adding new recovery actions
- Expanding test scenarios
- Bug fixes in calculations

---

## Validation Checksum

To verify implementation matches specification:

```
Subgenre Count: 5
Signal Count: 6
Risk Count: 6
Rule Count: 19
Recovery Issue Types: 9
Recovery Actions: 19
Confidence Tiers: 5
Guardrails: 7
```

---

## Sign-Off

This manifest freezes v1 scope. Any expansion requires explicit version increment and new manifest.

**Status: LOCKED**
**Effective: 2024-12-29**
