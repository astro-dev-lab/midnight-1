This document defines the complete and closed architecture of StudioOS.
No components, services, workflows, or interfaces may be added unless explicitly defined here.

# Dashboard Two – RBAC & Access Model
## StudioOS Client Portal

---

## 1. Document Purpose

This document defines the **Role-Based Access Control (RBAC)** and access boundaries for  
**Dashboard Two: Client Portal**.

It establishes:
- Which external roles exist
- What each role can see and do
- What is explicitly forbidden
- How access boundaries are enforced

This document is **authoritative** for all external access and must be enforced consistently across:
- UI rendering
- API authorization
- Assistant behavior
- Audit logging

---

## 2. RBAC Design Principles

Dashboard Two RBAC follows these principles:

- **Minimal Surface Area**: External users see only what is necessary
- **Explicit Authority**: Approval power is deliberate and limited
- **No Privilege Escalation**: External roles cannot gain internal capabilities
- **Read-First Orientation**: Most actions are observational, not operational
- **Closed Role Set**: Only roles defined here may exist

---

## 3. Canonical External Roles (Closed Set)

Dashboard Two defines **exactly two (2)** external roles:

1. **Viewer**
2. **Approver**

No additional external roles are permitted.

---

## 4. Role Definitions

### 4.1 Viewer

#### Role Intent
Provide visibility into shared projects and deliverables without decision authority.

#### Characteristics
- Read-only access
- Observation and playback only
- No state-changing actions

#### Prohibited Capabilities
- Approving or rejecting deliverables
- Initiating downloads or deliveries
- Posting binding comments
- Triggering any system-side action

---

### 4.2 Approver

#### Role Intent
Enable final decision-making on deliverables.

#### Characteristics
- All Viewer capabilities
- Explicit approval and rejection authority
- Delivery initiation after approval

#### Prohibited Capabilities
- Modifying deliverables
- Requesting or initiating processing
- Managing other users
- Accessing internal reports or jobs

---

## 5. View Access Matrix

| View                | Viewer | Approver |
|---------------------|--------|----------|
| Projects            | Read   | Read     |
| Deliverables        | Read   | Read     |
| Review & Approvals  | Read   | Execute (Approve/Reject) |
| Versions            | Read   | Read     |
| Account & Usage     | Read   | Read     |

Legend:
- **Read**: View-only access
- **Execute**: Perform explicit, state-changing action

---

## 6. Capability Matrix

### 6.1 Project-Level Capabilities

| Capability                     | Viewer | Approver |
|--------------------------------|--------|----------|
| View project list              | ✔      | ✔        |
| View project status            | ✔      | ✔        |
| Modify project configuration   | ✖      | ✖        |
| Delete project                 | ✖      | ✖        |

---

### 6.2 Deliverable Capabilities

| Capability                     | Viewer | Approver |
|--------------------------------|--------|----------|
| View deliverables              | ✔      | ✔        |
| Play audio                     | ✔      | ✔        |
| Compare versions               | ✔      | ✔        |
| Approve deliverable            | ✖      | ✔        |
| Reject deliverable             | ✖      | ✔        |
| Download approved deliverable  | ✖      | ✔        |

---

### 6.3 Commenting & Feedback

| Capability                     | Viewer | Approver |
|--------------------------------|--------|----------|
| View comments                  | ✔      | ✔        |
| Add non-binding comments       | ✔      | ✔        |
| Submit binding approval notes  | ✖      | ✔        |

---

### 6.4 Account Capabilities

| Capability                     | Viewer | Approver |
|--------------------------------|--------|----------|
| View account information       | ✔      | ✔        |
| Update own contact details     | ✔      | ✔        |
| View usage metrics             | ✔      | ✔        |
| Manage other users             | ✖      | ✖        |

---

## 7. Cross-Cutting Restrictions (All External Roles)

Regardless of role, the following actions are **never permitted**:

- Uploading assets
- Editing or modifying audio
- Initiating jobs or workflows
- Viewing internal job, state, or system logs
- Accessing processing parameters
- Managing roles or permissions
- Viewing internal transparency reports beyond summaries

---

## 8. Assistant Behavior Constraints

AI assistants operating in Dashboard Two:

- MUST respect external RBAC boundaries
- MUST NOT imply additional authority or hidden capabilities
- MUST NOT suggest contacting internal systems directly
- MUST frame all guidance within Viewer or Approver permissions

Assistants may explain outcomes, not enable operations.

---

## 9. Enforcement Requirements

RBAC enforcement MUST occur at:
- UI control visibility
- API authorization checks
- Approval and delivery endpoints
- Assistant suggestion logic

Any RBAC bypass constitutes a **security and compliance defect**.

---

## 10. Compliance Statement

Any role, permission, or access pattern not explicitly defined in this document is **out of scope** and **must not be implemented** for Dashboard Two.
