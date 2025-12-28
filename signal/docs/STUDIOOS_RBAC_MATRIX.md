This document defines the complete and closed architecture of StudioOS.
No components, services, workflows, or interfaces may be added unless explicitly defined here.

# Dashboard One – RBAC & Capability Matrix
## StudioOS Production Workspace

---

## 1. Document Purpose

This document defines the **Role-Based Access Control (RBAC)** model for **Dashboard One: Production Workspace**.

It establishes:
- Who may access which views
- Which actions are permitted per role
- How capability gating is enforced
- What is explicitly forbidden at each level

This document is **authoritative** and must be enforced consistently across:
- UI
- API
- Job Engine
- Assistant behavior

---

## 2. RBAC Design Principles

The RBAC model for StudioOS is governed by the following principles:

- **Least Privilege:** Users are granted only the minimum capabilities required.
- **Capability Gating, Not UI Forking:** All roles share the same dashboard and views.
- **Deterministic Permissions:** Permissions are explicit, static, and non-inferential.
- **No Implicit Escalation:** Higher roles do not bypass system constraints.
- **Closed Role Set:** Only roles defined here may exist.

---

## 3. Canonical Roles (Internal)

StudioOS defines **exactly three (3)** internal roles:

1. **Basic**
2. **Standard**
3. **Advanced**

No additional internal roles are permitted.

---

## 4. Role Definitions

### 4.1 Basic

#### Role Intent
Guided creation and completion with maximum guardrails.

#### Characteristics
- Preset-driven
- Outcome-oriented
- Minimal configuration exposure

#### Prohibited Behaviors
- Parameter-level control
- Job chaining
- Batch processing
- Reruns beyond predefined retries

---

### 4.2 Standard

#### Role Intent
Semi-professional control with bounded flexibility.

#### Characteristics
- Limited parameter access
- Template selection
- Controlled reprocessing

#### Prohibited Behaviors
- Custom pipelines
- Free-form parameter ranges
- System-level overrides

---

### 4.3 Advanced

#### Role Intent
Power user and internal engineering-grade usage.

#### Characteristics
- Full parameter access (within system limits)
- Job chaining
- Batch processing
- Full audit visibility

#### Prohibited Behaviors
- Circumventing Job Engine
- Real-time DSP control
- Introducing new workflows

---

## 5. View Access Matrix

| View       | Basic | Standard | Advanced |
|------------|-------|----------|----------|
| Overview   | Read  | Read     | Read     |
| Assets     | Write (Limited) | Write | Write |
| Create     | Write | Write    | Write    |
| Transform  | Execute (Preset) | Execute (Bounded) | Execute (Full) |
| Review     | Read  | Read/Approve | Read/Approve |
| Deliver    | Execute (Standard) | Execute (Configurable) | Execute (Custom) |
| History    | Read  | Read/Rerun (Limited) | Read/Rerun |

Legend:
- **Read**: View-only
- **Write**: Create or modify allowed data
- **Execute**: Trigger jobs or actions

---

## 6. Capability Gating by Role

### 6.1 Asset Capabilities

| Capability | Basic | Standard | Advanced |
|-----------|-------|----------|----------|
| Upload Assets | ✔ | ✔ | ✔ |
| Edit Metadata | Limited | ✔ | ✔ |
| View Lineage | ✔ | ✔ | ✔ |
| Modify Assets In-Place | ✖ | ✖ | ✖ |

---

### 6.2 Transform Capabilities

| Capability | Basic | Standard | Advanced |
|-----------|-------|----------|----------|
| Preset Selection | ✔ | ✔ | ✔ |
| Parameter Adjustment | ✖ | Bounded | Full |
| Job Chaining | ✖ | ✖ | ✔ |
| Batch Processing | ✖ | ✔ | ✔ |
| Custom Pipelines | ✖ | ✖ | ✔ |

---

### 6.3 Review & History Capabilities

| Capability | Basic | Standard | Advanced |
|-----------|-------|----------|----------|
| Playback & Compare | ✔ | ✔ | ✔ |
| Comment | ✖ | ✔ | ✔ |
| Approve Outputs | ✖ | ✔ | ✔ |
| Rerun Jobs | ✖ | Limited | ✔ |
| Full Audit Access | ✖ | ✖ | ✔ |

---

### 6.4 Deliver Capabilities

| Capability | Basic | Standard | Advanced |
|-----------|-------|----------|----------|
| Download Standard Exports | ✔ | ✔ | ✔ |
| Configure Export Formats | ✖ | ✔ | ✔ |
| Manage Destinations | ✖ | ✔ | ✔ |
| Batch Delivery | ✖ | ✖ | ✔ |
| Custom Delivery Profiles | ✖ | ✖ | ✔ |

---

## 7. Cross-Cutting Restrictions (All Roles)

Regardless of role, the following actions are **never permitted**:

- Access to timelines
- Track-based editing
- Plugin selection or management
- Realtime parameter manipulation
- Bypassing the Job Engine
- Direct asset mutation
- Manual signal routing

---

## 8. Assistant Behavior Constraints

AI assistants operating within Dashboard One:

- MUST respect RBAC permissions exactly
- MUST NOT suggest actions outside the user’s role
- MUST NOT imply hidden capabilities
- MUST degrade suggestions gracefully based on role

---

## 9. Enforcement Requirements

RBAC enforcement MUST occur at:
- UI rendering layer
- API authorization layer
- Job submission layer
- Assistant response logic

Failure at any layer constitutes a security defect.

---

## 10. Compliance Statement

Any capability, permission, or role not explicitly defined in this document is **out of scope** and **must not be implemented**.
