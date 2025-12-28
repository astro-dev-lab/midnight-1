This document defines the complete and closed architecture of StudioOS.
No components, services, workflows, or interfaces may be added unless explicitly defined here.

# Dashboard Two – Language & Transparency Rules
## StudioOS Client Portal

---

## 1. Document Purpose

This document defines the **mandatory language, transparency scope, and information disclosure rules** for  
**Dashboard Two: Client Portal**.

It ensures that:
- External users receive clarity without internal complexity
- Automated work is explained without exposing internals
- Language reinforces confidence, not control
- The Client Portal never drifts toward production or DAW metaphors

This document is **binding** for:
- UI copy
- Review summaries
- Approval messaging
- Error messaging
- AI assistant responses within Dashboard Two

---

## 2. Transparency Philosophy (Client-Facing)

Transparency in Dashboard Two is **outcome-oriented**, not technical.

The system explains:
- What was delivered
- Why it meets its purpose
- What decision is being requested

The system does **not** explain:
- How audio was processed internally
- What parameters were used
- What models or tools were involved
- How changes could be manually replicated

Transparency exists to support **decision-making**, not intervention.

---

## 3. Approved Transparency Surface

External users may see **only the following categories of information**:

### 3.1 Deliverable Summary
- Deliverable name
- Version identifier
- Creation timestamp
- Readiness status

---

### 3.2 High-Level Processing Summary
- Plain-language description of outcome  
  (e.g., “Prepared for streaming distribution”)
- Target context (platform, format, usage)
- Confirmation of internal completion

---

### 3.3 Change Summary (Descriptive Only)
- “Balance optimized for clarity”
- “Loudness normalized for platform consistency”
- “Artifacts reduced where detected”

No numeric values, curves, or technical metrics are exposed.

---

### 3.4 Confidence & Readiness Indicator
- Confidence expressed as: Low / Medium / High
- Readiness expressed as: Ready for Review / Approved / Delivered

---

## 4. Explicitly Prohibited Transparency

Dashboard Two MUST NOT expose:

- Processing parameters
- DSP terminology
- EQ, compression, or limiting details
- Plugin names or chains
- Internal job identifiers
- Model names or versions
- Signal flow explanations
- Internal reports from Dashboard One

If information is not understandable without audio-engineering knowledge, it does not belong here.

---

## 5. Language Design Principles

All language in Dashboard Two must be:

- **Clear** – understandable to non-technical users
- **Declarative** – stating outcomes, not processes
- **Neutral** – no sales, hype, or speculation
- **Finality-Oriented** – reinforcing completion and decision

Language must never imply that the user can or should “adjust” the work.

---

## 6. Approved Terminology (Client Portal)

### 6.1 Core Terms
- Project
- Deliverable
- Version
- Review
- Approval
- Comment
- Download
- Delivery
- Status

---

### 6.2 Action Verbs
- Review
- Approve
- Reject
- Compare
- Download
- Receive
- Confirm

---

## 7. Prohibited Terminology (Hard Ban)

The following terms MUST NOT appear in Dashboard Two:

- Track
- Timeline
- Plugin
- Session
- Mix
- Master (as a verb)
- Edit
- Adjust
- Tweak
- Parameter
- Job
- Pipeline
- Process (as an action the user can take)

If a term implies control or production, it is forbidden.

---

## 8. Approval & Decision Language Rules

Approval messaging must:
- Clearly state the consequence of approval
- Clearly state irreversibility per version
- Avoid urgency or pressure

Example (acceptable):
> “Approving this deliverable confirms it as the accepted version for delivery.”

Example (forbidden):
> “Looks good—let’s lock it in!”

---

## 9. Error & Limitation Language

When limitations or errors are surfaced to clients:

- State what cannot proceed
- State why at a high level
- State what will happen next

Forbidden patterns:
- “Something went wrong”
- “Try again later”
- “Contact support” without context

Required framing:
> “This deliverable cannot be downloaded until it is approved.”

---

## 10. Assistant Language Constraints (Client Portal)

AI assistants in Dashboard Two:

- MUST speak in client-appropriate language
- MUST avoid internal system references
- MUST not suggest production changes
- MUST redirect technical requests to internal workflows

Assistants act as **explainers of status**, not negotiators of process.

---

## 11. Consistency Enforcement

All client-facing strings MUST be validated against:
- This document
- `STUDIOOS_LANGUAGE_USAGE.md`

If a conflict exists, **the stricter constraint applies**.

---

## 12. Compliance Statement

Any language, transparency detail, or explanation not explicitly permitted in this document is **out of scope** and **must not be implemented** for Dashboard Two.
