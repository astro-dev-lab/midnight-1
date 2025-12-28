This document defines the complete and closed architecture of StudioOS.
No components, services, workflows, or interfaces may be added unless explicitly defined here.

# Dashboard Two – Interaction & Approval Contract
## StudioOS Client Portal

---

## 1. Document Purpose

This document defines the **authorized interaction patterns, approval mechanics, and behavioral constraints** for **Dashboard Two: Client Portal**.

It establishes:
- How external users interact with StudioOS
- How reviews and approvals are conducted
- What actions trigger state changes
- What actions are explicitly forbidden
- How assistants must guide and constrain client behavior

This document is **binding** for:
- UI interactions
- Approval workflows
- Assistant responses
- Backend enforcement

---

## 2. Core Interaction Philosophy

Dashboard Two is governed by a **Review → Decide → Receive** model.

External users:
- Do not create
- Do not modify
- Do not process
- Do not experiment

They **observe outputs**, **make decisions**, and **receive results**.

No interaction in Dashboard Two may resemble production or editing behavior.

---

## 3. Canonical Interaction Types (Allowed)

Only the interaction types defined in this section are permitted.

---

### 3.1 Navigation & Exploration

#### Definition
Users move between views to understand project context and deliverables.

#### Permitted Actions
- Navigate between Projects, Deliverables, Review & Approvals, Versions, Account & Usage
- Select projects or deliverables
- Expand or collapse informational panels

#### Constraints
- Navigation never changes system state
- Navigation never implies approval or delivery

---

### 3.2 Playback & Comparison

#### Definition
Users listen to deliverables and compare versions.

#### Permitted Actions
- Play audio
- Pause and resume playback
- Compare current and previous versions

#### Constraints
- Playback is strictly non-interactive
- No waveform manipulation
- No playback-linked controls that imply editability

---

### 3.3 Review & Commentary

#### Definition
Users provide qualitative feedback on deliverables.

#### Permitted Actions
- Add comments
- View system-generated summaries
- Read prior comments

#### Constraints
- Comments do not trigger processing
- Comments do not alter assets
- Comments are informational unless paired with approval or rejection

---

### 3.4 Approval Decision

#### Definition
Authorized users formally accept or reject a deliverable.

#### Permitted Actions
- Approve deliverable
- Reject deliverable with optional commentary

#### Constraints
- Approval and rejection are explicit actions
- Decisions are irreversible per version
- Decisions must be attributable to a user and timestamped

---

### 3.5 Delivery & Receipt

#### Definition
Approved deliverables are received by the client.

#### Permitted Actions
- Download approved assets
- Initiate delivery to predefined destinations (if enabled)

#### Constraints
- Delivery requires prior approval
- Delivery does not modify assets
- Delivery actions are logged

---

## 4. Forbidden Interaction Patterns (Global)

The following interaction patterns are **explicitly prohibited**:

- Editing audio
- Requesting or initiating processing
- Adjusting parameters
- Uploading assets
- Managing versions
- Reverting approvals
- Triggering internal workflows
- Viewing internal system states or jobs

Any UI element or assistant suggestion enabling these patterns is invalid.

---

## 5. Approval Mechanics

### 5.1 Approval Preconditions

A deliverable may only be approved if:
- It is in a Pending Review state
- It has an associated version
- It has passed internal readiness checks

---

### 5.2 Approval Effects

Upon approval:
- The deliverable is marked Approved
- The approval is logged with user identity and timestamp
- The deliverable becomes eligible for delivery

Approval does **not**:
- Modify the asset
- Trigger reprocessing
- Create new versions

---

### 5.3 Rejection Effects

Upon rejection:
- The deliverable is marked Rejected
- Commentary is captured (if provided)
- The deliverable is returned to internal workflow

Rejection does **not**:
- Delete the deliverable
- Modify prior versions
- Automatically request changes

---

## 6. Interaction Timing Rules

### 6.1 Immediate Interactions

- Navigation
- Playback
- Viewing summaries and comments

### 6.2 State-Changing Interactions

- Approval
- Rejection
- Delivery

State-changing interactions must:
- Require explicit confirmation
- Provide clear feedback
- Be logged immutably

---

## 7. Assistant Interaction Rules

AI assistants operating in Dashboard Two:

- MUST guide users within permitted interactions
- MUST explain approval consequences clearly
- MUST NOT suggest processing changes or internal actions
- MUST avoid DAW or production metaphors
- MUST redirect out-of-scope requests to internal contacts or processes

Assistants act as **explainers and guides**, not operators.

---

## 8. Error & Invalid Action Handling

If a user attempts a forbidden interaction:
- The system must block the action
- A clear explanation must be shown
- No partial state change may occur

Assistants must explain:
- Why the action is not available
- What actions are permitted instead

---

## 9. Cross-View Interaction Rules

- Approvals may only occur in Review & Approvals
- Deliveries may only occur after approval
- Comments may not substitute for approval decisions
- No interaction in one view may implicitly affect another

---

## 10. Compliance Statement

Any interaction pattern, approval behavior, or assistant guidance not explicitly defined in this document is **out of scope** and **must not be implemented** for Dashboard Two.
