This document defines the complete and closed architecture of StudioOS.
No components, services, workflows, or interfaces may be added unless explicitly defined here.

# Dashboard Two – Client Portal Specification
## StudioOS External Workspace

---

## 1. Document Purpose

This document defines the **complete, closed specification** for **Dashboard Two: Client Portal**.  

It covers:
- The scope and intent of the external-facing dashboard
- The structure and responsibilities of each view
- The permitted and forbidden actions for external users
- The minimal RBAC model for clients
- Interaction patterns, states, transparency rules, and error handling

This document is **authoritative**.  
No feature or behavior outside its bounds may be implemented in the Client Portal.

---

## 2. Dashboard Two Overview

### 2.1 Definition

**Dashboard Two (Client Portal)** is the sole external-facing interface in StudioOS.  
It allows clients or stakeholders to:
- Access projects shared with them
- Review and approve deliverables
- Compare versions
- Download or receive finalized assets
- Manage their account and usage

It does **not** allow creation, mixing, editing, mastering, or any other transformation of audio.

---

### 2.2 Global Invariants

The following rules apply to all views within the Client Portal:

- Users cannot modify or process audio
- Users cannot see or access internal job engines
- All interactions are read-only or approval-oriented
- No timelines, tracks, plugins, or real-time controls
- No hidden features, settings, or advanced modes

---

## 3. Canonical View Map

Dashboard Two contains **exactly five (5)** primary views:

1. **Projects** – List of shared projects  
2. **Deliverables** – List of deliverable assets per project  
3. **Review & Approvals** – Playback and decision page  
4. **Versions** – Version history and comparisons  
5. **Account & Usage** – Client account, billing, and usage metrics  

No additional views are allowed.

---

## 4. View Specifications

### 4.1 Projects View

#### Purpose
Provide an overview of all projects shared with the client.

#### Responsibilities
- Display project names and identifiers
- Show high-level status: Ready for Review / In Review / Delivered
- Provide access to the Deliverables view for each project

#### Allowed Actions
- Navigate to Deliverables

#### Forbidden Actions
- View or edit project settings
- Create new projects
- Delete projects

---

### 4.2 Deliverables View

#### Purpose
Present all deliverable assets associated with a selected project.

#### Responsibilities
- List deliverables (mixes, masters, stems, exports)
- Show delivery status (Pending Approval / Approved / Delivered)
- Provide access to Review & Approvals and Versions views

#### Allowed Actions
- Select a deliverable
- Initiate review
- Initiate download or external delivery after approval

#### Forbidden Actions
- Modify deliverables
- Re-run processing
- Upload new assets

---

### 4.3 Review & Approvals View

#### Purpose
Allow clients to listen to deliverables and make approval decisions.

#### Responsibilities
- Stream or download playback of deliverables
- Offer A/B comparison with previous versions
- Display summaries from transparency reports
- Capture client comments and approvals/rejections

#### Allowed Actions
- Play audio
- Compare versions
- Add comments
- Approve or reject deliverables

#### Forbidden Actions
- Edit audio
- Access processing parameters
- Request new processing

---

### 4.4 Versions View

#### Purpose
Provide a history of revisions for a deliverable.

#### Responsibilities
- List all versions in chronological order
- Display differences or summary changes
- Show timestamps and approval status

#### Allowed Actions
- Select versions for comparison
- View the corresponding Review & Approvals page

#### Forbidden Actions
- Delete versions
- Restore previous versions as “final”

---

### 4.5 Account & Usage View

#### Purpose
Manage client account information and view usage metrics.

#### Responsibilities
- Display client profile details (name, organization, contact info)
- Show usage statistics (projects, deliverables, storage usage)
- Show billing details and plan status (if applicable)

#### Allowed Actions
- Update contact information
- Download invoices (if integrated)
- View usage reports

#### Forbidden Actions
- Modify internal subscription plans
- Access internal administrative settings

---

## 5. Client RBAC Model

The Client Portal uses a simplified RBAC model with **two (2)** roles:

1. **Viewer** – read-only access  
2. **Approver** – can approve/reject deliverables and initiate downloads

No other client roles are allowed.

### 5.1 View Access Matrix

| View              | Viewer | Approver |
|------------------|--------|---------|
| Projects         | Read   | Read    |
| Deliverables     | Read   | Read    |
| Review & Approvals | Read   | Approve/Reject |
| Versions         | Read   | Read    |
| Account & Usage  | Read   | Read    |

### 5.2 Capability Differences

- **Viewer:** may only play audio, comment, and view reports  
- **Approver:** may additionally submit approval decisions and initiate downloads or external deliveries

---

## 6. Interaction Contract

### 6.1 Permitted Interactions

- Navigate through views
- Read and play back deliverables
- Compare versions
- Post comments
- Approve or reject deliverables (Approver role only)
- Download or receive approved assets (Approver role only)
- Update contact information
- View usage and billing data

### 6.2 Forbidden Interactions

- Modifying assets or metadata
- Initiating or altering jobs
- Creating or deleting projects
- Adjusting processing parameters
- Viewing internal job or system logs

### 6.3 Feedback & System Responses

- Deliverables must show current approval status
- Approvals trigger notifications and state changes
- Errors must provide clear messages and next steps (e.g., contact support)

---

## 7. State & Lifecycle in the Client Portal

### 7.1 Deliverable States

| State          | Description                             |
|---------------|-----------------------------------------|
| Pending Review | Ready for client review                 |
| Approved       | Approved by an Approver                 |
| Rejected       | Rejected and returned for revision      |
| Delivered      | Final asset delivered/downloaded        |

### 7.2 Transition Rules

- **Pending Review → Approved**: Approver approves deliverable
- **Pending Review → Rejected**: Approver rejects deliverable
- **Approved → Delivered**: Asset downloaded or sent to external integration
- **Rejected → Pending Review**: New revision uploaded by internal team

---

## 8. Transparency Requirements

- Each deliverable must include a **summary report** with:
  - What was delivered (file name, version)
  - When it was processed
  - High-level processing notes (no technical details)
- Clients must be able to see which jobs led to which versions but not the underlying parameters

---

## 9. Error Handling & Support

- Errors must state the error category (e.g., Delivery Error, System Error)
- Clients must receive clear next steps (e.g., retry download, contact support)
- No automated recovery actions are exposed to clients
- All error events are logged in system history

---

## 10. Language & Terminology

The Client Portal must adhere to **STUDIOOS_LANGUAGE_USAGE.md**:

- Use approved terms (Project, Deliverable, Version, Approval)
- Avoid prohibited terms (Track, Plugin, Timeline, Session)
- Tone must remain professional and outcome-focused
- No internal or system jargon exposed

---

## 11. Compliance Statement

Any feature, view, action, or terminology not explicitly defined in this specification is **out of scope** and **must not be implemented** in Dashboard Two.  
The Client Portal must remain minimalist, controlled, and aligned with the two-dashboard architecture principle.
