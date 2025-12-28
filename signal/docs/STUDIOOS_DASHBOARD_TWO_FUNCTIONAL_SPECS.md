This document defines the complete and closed architecture of StudioOS.
No components, services, workflows, or interfaces may be added unless explicitly defined here.

# Dashboard Two – Functional Specification
## StudioOS Client Portal

---

## 1. Document Purpose

This document formally defines the **functional scope, structure, constraints, and responsibilities** of **Dashboard Two: Client Portal** within StudioOS.

It is the **authoritative definition** of what the external-facing dashboard:
- Is
- Does
- Allows
- Explicitly does not do

All UI behavior, assistant behavior, and backend exposure for Dashboard Two **must conform** to this specification.

---

## 2. Dashboard Two Overview

### 2.1 Definition

**Dashboard Two (Client Portal)** is the only external-facing dashboard in StudioOS.

Its purpose is to allow external stakeholders (clients, collaborators, approvers) to:
- View shared projects
- Review deliverables
- Compare versions
- Approve or reject outputs
- Receive finalized assets
- Manage their own account context

Dashboard Two **does not** support creation, transformation, or processing of audio.

---

### 2.2 Global Invariants (Non-Negotiable)

The following rules apply to **all views** in Dashboard Two:

- No audio processing or transformation
- No asset creation or modification
- No access to jobs, pipelines, or parameters
- No timelines, tracks, plugins, or realtime controls
- No internal system diagnostics
- No implicit actions across views

Dashboard Two is **read-oriented and decision-oriented only**.

---

## 3. Canonical View Map

Dashboard Two contains **exactly five (5)** views:

1. Projects  
2. Deliverables  
3. Review & Approvals  
4. Versions  
5. Account & Usage  

No additional views are permitted.

---

## 4. View Specifications

---

### 4.1 Projects

#### Purpose  
Provide an overview of all projects shared with the external user.

#### Primary Responsibilities
- List shared projects
- Display high-level project status
- Enable navigation into deliverables

#### Allowed Actions
- View project list
- Navigate to Deliverables

#### Forbidden Actions
- Create projects
- Modify project configuration
- Delete projects

#### Inputs
- Shared project identifiers
- Project status metadata

#### Outputs
- Navigation events

#### Explicit Non-Responsibilities
- No asset visibility
- No approvals
- No downloads

---

### 4.2 Deliverables

#### Purpose  
Present all deliverable outputs associated with a selected project.

#### Primary Responsibilities
- List deliverable assets
- Display delivery and approval status
- Provide access to review and version history

#### Allowed Actions
- Select deliverables
- Navigate to Review & Approvals
- Navigate to Versions

#### Forbidden Actions
- Modify deliverables
- Upload assets
- Trigger processing

#### Inputs
- Approved and pending deliverable metadata

#### Outputs
- Navigation events

#### Explicit Non-Responsibilities
- No playback configuration
- No approvals
- No exports

---

### 4.3 Review & Approvals

#### Purpose  
Enable external users to evaluate deliverables and make approval decisions.

#### Primary Responsibilities
- Playback deliverables
- Present simplified transparency summaries
- Capture approval or rejection decisions
- Capture review comments

#### Allowed Actions
- Play audio
- Compare current vs previous versions
- Submit approval or rejection
- Add comments

#### Forbidden Actions
- Edit audio
- Request processing changes directly
- Adjust system behavior

#### Inputs
- Deliverable assets
- Transparency summaries
- Version references

#### Outputs
- Approval state changes
- Review annotations

#### Explicit Non-Responsibilities
- No reprocessing
- No export execution

---

### 4.4 Versions

#### Purpose  
Provide visibility into the version history of deliverables.

#### Primary Responsibilities
- Display chronological version list
- Show approval state per version
- Enable version comparison

#### Allowed Actions
- Select versions for comparison
- Navigate to Review & Approvals

#### Forbidden Actions
- Restore older versions
- Delete versions
- Mark versions as final

#### Inputs
- Version metadata
- Associated reports

#### Outputs
- Navigation events

#### Explicit Non-Responsibilities
- No state mutation
- No approvals

---

### 4.5 Account & Usage

#### Purpose  
Allow external users to manage their account context and view usage information.

#### Primary Responsibilities
- Display user profile details
- Display usage and access scope
- Display billing or entitlement summaries (if applicable)

#### Allowed Actions
- Update contact information
- View usage metrics
- Download billing artifacts (if enabled)

#### Forbidden Actions
- Modify access scope
- Manage other users
- Change system plans

#### Inputs
- Account metadata
- Usage records

#### Outputs
- Profile updates

#### Explicit Non-Responsibilities
- No project interaction
- No deliverable interaction

---

## 5. Cross-View Rules

- Navigation between views does not imply approval or delivery
- Approval decisions may only occur in Review & Approvals
- Downloads or delivery actions require prior approval
- No view may implicitly trigger system-side processing

---

## 6. Explicit Exclusions

Dashboard Two SHALL NOT include:

- Asset upload
- Asset editing
- Job initiation or monitoring
- Parameter configuration
- Detailed processing reports
- Internal system logs
- Administrative tooling

---

## 7. Terminology Constraints

### Approved Terms
- Project
- Deliverable
- Version
- Review
- Approval
- Comment
- Download
- Account

### Prohibited Terms
- Track
- Plugin
- Timeline
- Session
- Job
- Pipeline
- Parameter

---

## 8. Compliance Statement

Any feature, action, view, or behavior not explicitly defined in this document is **out of scope** and **must not be implemented** in Dashboard Two.
