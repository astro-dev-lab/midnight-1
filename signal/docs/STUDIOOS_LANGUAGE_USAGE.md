This document defines the complete and closed architecture of StudioOS.
No components, services, workflows, or interfaces may be added unless explicitly defined here.

# Dashboard One – Language & Terminology Guide
## StudioOS Production Workspace

---

## 1. Document Purpose

This document defines the **mandatory language, terminology, tone, and vocabulary constraints** for **Dashboard One: Production Workspace**.

It ensures:
- Conceptual integrity of the post-DAW architecture
- Consistent communication across UI, assistants, logs, and reports
- Elimination of legacy DAW metaphors
- Prevention of cognitive drift toward timeline- or plugin-based thinking

This document is **binding** for:
- UI copy
- System messages
- Processing reports
- Error messages
- AI assistant responses
- Internal developer-facing strings exposed to users

---

## 2. Language Design Principles

All language within StudioOS must adhere to the following principles:

- **Outcome-Oriented**: Focus on results, not mechanics
- **Declarative**: State what happened, not how to manipulate it
- **Deterministic**: Avoid speculative or probabilistic phrasing
- **Non-Performative**: No “tweaking,” “playing,” or “adjusting”
- **System-First**: The system acts; users decide and review

Language is a **control surface**.  
Improper language introduces improper expectations.

---

## 3. Canonical Terminology (Approved Vocabulary)

The following terms are **explicitly approved** and may be used freely.

### 3.1 Core Concepts
- Asset
- Job
- Transformation
- Output
- Version
- Report
- Preset
- Parameter
- Workflow
- Delivery
- Approval
- Review
- Lineage
- Audit
- Confidence

---

### 3.2 Actions
- Analyze
- Generate
- Prepare
- Normalize
- Convert
- Split
- Deliver
- Re-run
- Approve
- Reject

---

### 3.3 States
- Draft
- Processing
- Ready
- Delivered
- Queued
- Running
- Completed
- Failed

---

## 4. Prohibited Terminology (Hard Ban)

The following terms are **explicitly forbidden** in all user-facing contexts.

### 4.1 DAW-Derived Terms
- Track
- Timeline
- Clip
- Session
- Plugin
- Fader
- Automation
- Channel
- Bus
- Insert
- Rack
- Meter (when implying manipulation)

---

### 4.2 Interaction Metaphors
- Tweak
- Adjust live
- Play with
- Dial in
- Fine-tune manually
- Drag and drop (for audio manipulation)
- Scrub (outside of playback-only review)

Any appearance of these terms constitutes a **language defect**.

---

## 5. Tone & Voice Requirements

### 5.1 System Voice

The system voice must be:
- Calm
- Confident
- Neutral
- Explanatory

Examples:
- “The system detected imbalance and applied correction.”
- “This output meets the selected delivery profile.”

---

### 5.2 Assistant Voice

AI assistants must:
- Speak as system guides, not collaborators
- Avoid creative or anthropomorphic phrasing
- Avoid apologetic or speculative language

Disallowed examples:
- “Let’s try tweaking this…”
- “I think this might sound better if…”

Required framing:
- “The system applied…”
- “You may choose to re-run with…”

---

## 6. Explanation vs Instruction Boundary

StudioOS language must distinguish clearly between:

### 6.1 Explanations (Permitted)
- Describing what occurred
- Explaining why a decision was made
- Summarizing impact

### 6.2 Instructions (Restricted)
- Only allowed when describing **next valid system actions**
- Must reference existing jobs, presets, or workflows
- Must never imply manual control

---

## 7. Error & Failure Language Rules

Error messaging must:
- Name the error category
- State impact plainly
- Offer valid next actions only

Forbidden patterns:
- “Try again later”
- “Something went wrong”
- “We’re not sure why…”

Required pattern:
- “The job failed due to [category]. You may [permitted recovery action].”

---

## 8. Language Consistency Enforcement

The following components MUST enforce this guide:

- UI copy review
- Assistant prompt constraints
- Report templates
- Error message catalogs
- Developer linting for user-facing strings

Any string violating this guide must be corrected before release.

---

## 9. Anti-Patterns (Explicitly Disallowed)

- DAW metaphor leakage
- Casual or playful language
- Feature marketing language inside operational UI
- Ambiguous verbs implying manual control
- Language that suggests hidden capabilities

---

## 10. Compliance Statement

Any terminology, phrasing, or language pattern not explicitly permitted in this document is **out of scope** and **must not be implemented**.
