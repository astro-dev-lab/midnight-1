This document defines the complete and closed architecture of StudioOS.
No components, services, workflows, or interfaces may be added unless explicitly defined here.

# Dashboard One – State & Lifecycle Specification
## StudioOS Production Workspace

---

## 1. Document Purpose

This document defines the **authoritative state models and lifecycle rules** governing all entities within **Dashboard One: Production Workspace**.

It establishes:
- Valid states for projects, assets, and jobs
- Permitted state transitions
- Prohibited transitions
- System invariants related to state
- Enforcement expectations across UI, backend, and assistants

This document is **foundational**.  
All logic, workflows, and assistant behavior must align with these state definitions.

---

## 2. State Management Principles

StudioOS state management adheres to the following principles:

- **Explicit State Only**: No implicit or inferred states are allowed
- **Deterministic Transitions**: State changes occur only through defined actions
- **Immutability by Default**: State history is preserved; rollback occurs via re-execution
- **Single Source of Truth**: State is authoritative at the system level, not the UI
- **No Hidden States**: If a state exists, it must be defined here

---

## 3. Entity State Models

StudioOS defines state models for **exactly three (3)** entity types:

1. Project  
2. Asset  
3. Job  

No additional stateful entities are permitted.

---

## 4. Project State Model

### 4.1 Valid Project States

| State | Definition |
|-----|-----------|
| Draft | Project initialized; assets incomplete |
| Processing | One or more jobs are active |
| Ready | Outputs generated and pending review |
| Delivered | Final outputs exported or delivered |

---

### 4.2 Permitted Project Transitions

| From | To | Trigger |
|----|----|--------|
| Draft | Processing | Job submitted |
| Processing | Ready | All active jobs completed |
| Ready | Processing | New job submitted |
| Ready | Delivered | Delivery executed |
| Delivered | Processing | New job submitted |

---

### 4.3 Prohibited Project Transitions

- Draft → Delivered (without processing)
- Delivered → Draft
- Any transition bypassing job completion

---

### 4.4 Project State Invariants

- A project may not be *Ready* if any job is active
- A project may not be *Delivered* without approved outputs
- Project state reflects aggregate job and asset states

---

## 5. Asset State Model

### 5.1 Asset Categories

Assets fall into one of the following immutable categories:
- Raw
- Derived
- Final

---

### 5.2 Valid Asset States

| State | Definition |
|-----|-----------|
| Raw | Original ingested content |
| Derived | Output of one or more jobs |
| Final | Approved asset intended for delivery |

---

### 5.3 Asset State Transitions

| From | To | Trigger |
|----|----|--------|
| Raw | Derived | Job completion |
| Derived | Derived | Subsequent job |
| Derived | Final | Explicit approval |
| Raw | Final | Not permitted |

---

### 5.4 Asset Invariants

- Assets are immutable once created
- State changes create **new assets**, not modifications
- All derived assets maintain lineage references
- Final assets may only originate from Derived assets

---

## 6. Job State Model

### 6.1 Valid Job States

| State | Definition |
|-----|-----------|
| Queued | Job accepted, awaiting execution |
| Running | Job actively executing |
| Completed | Job finished successfully |
| Failed | Job terminated with error |

---

### 6.2 Job State Transitions

| From | To | Trigger |
|----|----|--------|
| Queued | Running | Execution started |
| Running | Completed | Successful completion |
| Running | Failed | Error encountered |
| Failed | Queued | Explicit rerun request |

---

### 6.3 Job Invariants

- Jobs are immutable once submitted
- Jobs reference specific asset versions
- Jobs cannot be edited after submission
- Completed jobs cannot be retroactively altered
- Failed jobs preserve logs and context

---

## 7. Cross-Entity State Rules

- Project state is derived from job aggregation
- Asset states advance only via job completion or approval
- No job may target a Final asset as input
- No delivery may occur unless assets are Final

---

## 8. Rerun and Recovery Rules

- Reruns create **new jobs**
- Reruns do not mutate prior job records
- Reruns reference original inputs unless explicitly overridden
- Rollback is achieved via re-execution, not reversal

---

## 9. Assistant State Awareness Requirements

AI assistants operating within Dashboard One:

- MUST reference current entity states before suggesting actions
- MUST NOT propose invalid transitions
- MUST explain state implications when relevant
- MUST not imply hidden or future states

---

## 10. Prohibited State Concepts

The following concepts are explicitly disallowed:

- Partial states
- Temporary UI-only states
- Unsaved states
- Session-based states
- Draft assets with destructive edits

---

## 11. Compliance Statement

Any state, transition, or lifecycle behavior not explicitly defined in this document is **invalid** and **must not be implemented**.
