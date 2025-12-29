# StudioOS Machine Learning Investment Charter

**Crafted by Demetrius LLC**

---

## 1. Purpose

This charter defines the permitted scope, constraints, and non-negotiable boundaries for all Machine Learning (ML) and advanced DSP investments within StudioOS.

The intent is to ensure ML:

- Increases trust
- Improves decision quality
- Preserves determinism
- Avoids creative ambiguity
- Never undermines the "Glass Box" principle

**ML exists to inform and constrain, not to create or guess.**

---

## 2. Core Principle (Non-Negotiable)

> Machine Learning in StudioOS may observe, evaluate, predict, and recommend — but may not autonomously create, modify, or invent audio outcomes without deterministic DSP execution and explicit justification.

**ML does not replace engineering judgment.**
**ML augments it.**

---

## 3. Allowed ML Domains (Explicitly Approved)

### 3.1 Signal Analysis & Diagnosis

ML may be used to analyze audio signals to detect conditions that are difficult or impractical to encode via deterministic rules alone.

**Allowed use cases:**

- Vocal intelligibility risk detection
- Frequency masking identification
- Sibilance severity estimation
- Over-compression and pumping detection
- Clipping risk prediction prior to limiting
- Phase incoherence probability estimation
- Translation risk prediction across playback systems

**Constraints:**

- ML outputs must be numerical or categorical
- Outputs must be traceable to input signals
- No generative behavior permitted

### 3.2 Decision Support & Scoring

ML may influence decisions, not directly apply transformations.

**Allowed use cases:**

- Confidence score computation
- Conflict severity weighting (e.g., loudness vs dynamics)
- Risk classification (low / medium / high)
- Determining when automation confidence must be lowered
- Flagging cases that require human review or explicit warning

**Constraints:**

- Final decisions must remain deterministic
- ML outputs must be visible in ProcessingReport
- ML may never silently override DSP logic

### 3.3 Context Classification

ML may classify audio to improve downstream decision logic.

**Allowed use cases:**

- Genre likelihood estimation (rap subgenre classification)
- Vocal-dominant vs beat-dominant mix detection
- Energy profile classification (aggressive / balanced / dynamic)
- Recording quality tier estimation

**Constraints:**

- Classification must be probabilistic, not absolute
- Results must be expressed as confidence-weighted signals
- Classification must never auto-route users without disclosure

### 3.4 Analysis-Only Source Awareness (Pre-Stem Phase)

ML may estimate source presence without performing separation.

**Allowed use cases:**

- Vocal presence estimation
- Instrumental density estimation
- Overlap risk between vocals and bass
- Hook vs verse energy differentiation

**Constraints:**

- No audio separation at this phase
- No per-source DSP application
- Analysis only; execution remains full-mix DSP

---

## 4. Forbidden ML Domains (Explicitly Prohibited)

### 4.1 Generative Audio

ML must not generate, synthesize, hallucinate, or invent audio content.

**Prohibited:**

- Generating new sounds
- Creating harmonies
- Adding effects creatively
- Replacing or enhancing vocals artificially
- "AI mastering" that alters audio without explainable DSP

### 4.2 Black-Box Processing

ML must not directly manipulate audio samples in opaque ways.

**Prohibited:**

- End-to-end neural audio processing
- Unexplainable latent-space transformations
- Models that cannot surface interpretable signals
- "Magic" improvements without traceable logic

### 4.3 Creative Decision-Making

ML must not make creative judgments.

**Prohibited:**

- Style matching
- Taste-based decisions
- Trend-based aesthetic optimization
- "Make it sound like X" behavior

**StudioOS does not encode taste.**

### 4.4 User Replacement

ML must not replace the artist's agency or intent.

**Prohibited:**

- Automatically rewriting creative choices
- Silently correcting artistic decisions
- Overriding explicit user intent
- Hiding trade-offs from users

---

## 5. Transparency & Explainability Mandate

All ML-driven signals must adhere to the following:

- Every ML output must be explainable in plain language
- Every ML output must be surfaced in the ProcessingReport
- Every ML-driven decision must be traceable
- Every ML limitation must be disclosed

**If a model cannot meet these criteria, it cannot be deployed.**

---

## 6. Determinism Guarantee

**ML must never break determinism.**

- Same input + same parameters + same model version = same result
- No stochastic inference at runtime without fixed seeds
- Model versioning must be explicit and immutable

---

## 7. Build vs Buy Policy

**Allowed:**

- Pretrained audio embedding models
- Open-source MIR models
- Lightweight inference services
- Offline model evaluation pipelines

**Forbidden (initially):**

- Training proprietary models from scratch
- Heavy GPU-bound inference in core workflows
- Research-grade experimentation in production paths

**StudioOS invests in judgment orchestration, not ML research.**

---

## 8. Governance & Versioning

Every ML model must have:

- Version number
- Training source disclosure
- Input/output schema
- Known failure modes

**Model changes must be treated as engine changes.**

Old jobs must remain reproducible under prior model versions.

---

## 9. Success Criteria for ML Investment

ML investment is considered successful if it:

- Reduces mastering errors
- Improves consistency across outputs
- Increases confidence score accuracy
- Reduces need for manual intervention
- Improves user trust without increasing complexity

**ML that increases confusion or ambiguity is a failure.**

---

## 10. Final Statement

> StudioOS does not use Machine Learning to be impressive.
> StudioOS uses Machine Learning to be correct, accountable, and trustworthy.

**This charter is binding.**

Any ML initiative that violates it is out of scope by definition.
