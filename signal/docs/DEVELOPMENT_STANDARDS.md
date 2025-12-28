# Development Standards & Assistant Operating Contract
## Midnight Signal · Codespace Copilot Instructions

---

## 1. Document Purpose

This document defines the **mandatory operating standards** for any AI assistant (Codespace Copilot) working within this repository.

It establishes:
- How the assistant must behave during development sessions
- Required verification and validation patterns
- Code quality and consistency standards
- Anti-drift, anti-hallucination, and scope control rules
- Orchestration patterns derived from established workflows

**This document is authoritative for development behavior.**  
The `STUDIOOS_*.md` files are authoritative for application behavior.

---

## 2. Orchestration Philosophy

### 2.1 Core Operating Model

```
Instruction → Understand → Execute → Verify → Commit → Report
```

The assistant:
- Receives clear instructions
- Gathers context before acting (never assumes)
- Executes precisely what was requested
- Verifies outcomes (run tests, check errors, validate)
- Commits cleanly with descriptive messages
- Reports completion concisely

### 2.2 Communication Style

**Required:**
- Direct, concise responses
- Action-first, explanation-minimal
- Status updates only when meaningful
- No preamble or filler language

**Forbidden:**
- Verbose explanations before action
- Asking permission for obvious next steps
- Summarizing what was just done unless requested
- Marketing or enthusiasm language

---

## 3. Development Workflow Standards

### 3.1 Before Writing Code

1. **Gather Context First**
   - Read relevant files before modifying
   - Search for existing patterns in codebase
   - Verify API behaviors through exploration, not assumption
   - Check for existing tests or examples

2. **Never Assume**
   - If uncertain about an API, test it
   - If uncertain about a pattern, search the codebase
   - If uncertain about intent, ask once, clearly

### 3.2 During Development

1. **Follow Existing Patterns**
   - Match code style of surrounding files
   - Use established naming conventions
   - Replicate test structure from existing tests
   - Maintain consistency over personal preference

2. **Test-Driven Verification**
   - Write tests alongside implementation
   - Run tests after writing them
   - Fix failures before proceeding
   - Never leave broken tests uncommitted

3. **Incremental Progress**
   - Work in phases when scope is large
   - Verify each phase before proceeding
   - Commit at logical checkpoints
   - Don't batch too much unverified work

### 3.3 After Development

1. **Verification Required**
   - Run all relevant tests
   - Check for errors in affected files
   - Validate changes work as expected
   - Confirm no regressions introduced

2. **Clean Commits**
   - Stage only relevant files
   - Write descriptive commit messages
   - Push to origin when instructed
   - Never leave uncommitted work without acknowledgment

---

## 4. Code Quality Standards

### 4.1 General Rules

| Requirement | Standard |
|-------------|----------|
| Language | JavaScript (ES Modules) for core library |
| Node Version | ≥22.13.1 |
| Module System | ESM (`import`/`export`) |
| Style | Match existing file patterns exactly |
| Comments | Minimal; code should be self-documenting |
| Error Handling | Explicit; no silent failures |

### 4.2 Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Files | lowercase, hyphenated | `edge-cases-test.js` |
| Classes | PascalCase | `SoftDeleteTable` |
| Functions | camelCase | `getClient` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_RETRIES` |
| Test IDs | Category-Number | `D-01`, `STR-05`, `NULL-03` |

### 4.3 Test Standards

| Requirement | Standard |
|-------------|----------|
| Test Framework | Custom async harness in `/scripts` |
| Test ID Format | `CATEGORY-XX` (e.g., `CRUD-01`, `FTS-12`) |
| Assertion Style | `assert()`, `assertEquals()`, `assertThrows()` |
| Isolation | Each test creates/destroys its own database |
| Naming | Descriptive action + expected outcome |

### 4.4 Commit Message Format

```
<type>: <concise description>

<optional body with details>
- bullet points for multiple changes
- reference test counts when applicable
```

Types:
- `feat:` New functionality
- `fix:` Bug fixes
- `test:` Test additions/modifications
- `docs:` Documentation changes
- `refactor:` Code restructuring without behavior change
- `chore:` Maintenance tasks

---

## 5. Anti-Drift Rules

### 5.1 Scope Control

**The assistant MUST:**
- Only implement what is explicitly requested
- Ask before expanding scope
- Complete current task before suggesting additions
- Stay within the boundaries of the current phase

**The assistant MUST NOT:**
- Add unrequested features
- Refactor unrelated code
- Suggest architectural changes unprompted
- Introduce new dependencies without approval

### 5.2 Consistency Enforcement

**The assistant MUST:**
- Reference existing code patterns before creating new ones
- Maintain API consistency with established interfaces
- Preserve existing behavior unless explicitly changing it
- Follow the patterns established in early development phases

**The assistant MUST NOT:**
- Introduce new patterns when existing ones suffice
- Change working code to match personal preferences
- Optimize prematurely
- Abstract without clear benefit

---

## 6. Anti-Hallucination Rules

### 6.1 API Usage

**Required Behavior:**
- Verify API exists before using it
- Test API behavior if documentation is unclear
- Use patterns proven in existing tests
- When an API fails, investigate—don't guess alternatives

**Forbidden Behavior:**
- Assuming API methods exist
- Guessing parameter signatures
- Inventing configuration options
- Fabricating error messages or behaviors

### 6.2 Knowledge Boundaries

**The assistant MUST:**
- State uncertainty when uncertain
- Verify through code execution, not assumption
- Reference actual file contents, not memory
- Re-read files if context may have changed

**The assistant MUST NOT:**
- Claim features exist without verification
- Describe behavior without testing
- Fill gaps with plausible-sounding fiction
- Conflate similar but different APIs

---

## 7. Phased Development Protocol

When working on multi-step tasks:

### 7.1 Phase Structure

```
Phase N: [Name]
├── Define scope clearly
├── Implement incrementally
├── Test after each increment
├── Verify all tests pass
├── Commit with phase reference
└── Report completion
```

### 7.2 Phase Transitions

- Complete current phase fully before starting next
- Verify all tests pass at phase boundary
- Commit and push at phase boundary (if instructed)
- Report test counts and status

### 7.3 Progress Tracking

Use todo lists for complex multi-step work:
- Mark items in-progress before starting
- Mark items completed immediately after
- One item in-progress at a time
- Never batch completions

---

## 8. Application Specification Reference

### 8.1 StudioOS Documentation Set

The following documents define the **complete application specification**:

| Document | Authority |
|----------|-----------|
| `STUDIOOS_ASSISTANT_HANDBOOK.md` | AI behavior within the application |
| `STUDIOOS_FUNCTIONAL_SPECS.md` | Dashboard One views and capabilities |
| `STUDIOOS_RBAC_MATRIX.md` | Internal role permissions |
| `STUDIOOS_STATE_LIFECYCLE_SPECS.md` | Entity states and transitions |
| `STUDIOOS_TRANSPARENCY_CHARTER.md` | Reporting and explainability |
| `STUDIOOS_USER_INTERACTION.md` | Permitted interaction patterns |
| `STUDIOOS_LANGUAGE_USAGE.md` | Approved/forbidden terminology |
| `STUDIOOS_ERROR_RECOVERY_PLAYBOOK.md` | Internal error handling |
| `STUDIOOS_ERROR_SUPPORT.md` | Client-facing error handling |
| `STUDIOOS_CLIENT_PORTAL.md` | Dashboard Two specification |
| `STUDIOOS_DASHBOARD_TWO_FUNCTIONAL_SPECS.md` | External dashboard features |
| `STUDIOOS_DASHBOARD_TWO_RBAC.md` | External role permissions |
| `STUDIOOS_DASHBOARD_TWO_TRANSPARENCY_CHARTER.md` | Client-facing transparency |
| `STUDIOOS_INTERACTION_APPROVAL_CONTRACT.md` | Approval workflow mechanics |

### 8.2 Application Invariants

When implementing StudioOS features:

**Always:**
- Reference the canonical documentation
- Enforce RBAC at all layers
- Maintain state machine integrity
- Use approved terminology only
- Generate required reports

**Never:**
- Invent features not in specifications
- Bypass the job engine
- Expose forbidden terminology
- Allow invalid state transitions
- Assume DAW-like behavior

### 8.3 Specification Precedence

If conflicts arise, resolve using this order:
1. `STUDIOOS_ASSISTANT_HANDBOOK.md`
2. Functional Specs (Dashboard-specific)
3. State & Lifecycle Specs
4. RBAC Matrices
5. Interaction & Approval Contracts
6. Transparency Charters
7. Error & Support Docs
8. Language Usage

---

## 9. Repository Structure Awareness

### 9.1 Key Directories

| Path | Purpose |
|------|---------|
| `/src` | Core Midnight ORM library |
| `/scripts` | Test files (`*-test.js`) |
| `/signal` | Sample Express application |
| `/signal/web` | Vite React demo |
| `/signal/docs` | StudioOS specifications |
| `/signal/prisma` | Database schema and seeds |

### 9.2 Entry Points

| File | Purpose |
|------|---------|
| `index.js` | Library exports |
| `index.d.ts` | TypeScript definitions |
| `signal/index.js` | Express server entry |
| `signal/web/src/main.tsx` | React app entry |

### 9.3 Test Execution

```bash
# Run a specific test file
node scripts/<name>-test.js

# All tests should output:
# X passed, 0 failed
```

---

## 10. Git Workflow

### 10.1 Standard Operations

```bash
# Check status before committing
git status

# Stage all changes
git add -A

# Commit with descriptive message
git commit -m "type: description"

# Push to origin
git push origin main
```

### 10.2 Commit Discipline

- Commit at logical checkpoints
- Never commit failing tests
- Always push when instructed
- Verify push succeeded

### 10.3 When Instructed to Push

Execute without confirmation:
```bash
git add -A && git status
git commit -m "<appropriate message>"
git push origin main
```

Report success or failure.

---

## 11. Error Recovery Protocol

### 11.1 When Tests Fail

1. Read the error message carefully
2. Identify the failing test and assertion
3. Check if the API usage is correct
4. Fix the specific issue
5. Re-run the test
6. Repeat until passing

### 11.2 When Implementation Unclear

1. Search codebase for similar patterns
2. Read source files for the API in question
3. Write a minimal test to verify behavior
4. Proceed based on verified behavior

### 11.3 When Stuck

1. State what was attempted
2. State what failed
3. Ask for clarification
4. Do not guess repeatedly

---

## 12. Session Continuity

### 12.1 Context Preservation

- Reference conversation summary for prior work
- Don't repeat completed tasks
- Pick up where previous session ended
- Acknowledge prior phase completions

### 12.2 State Awareness

Track and maintain awareness of:
- Current phase of work
- Tests written and passing
- Files modified
- Uncommitted changes
- Outstanding tasks

---

## 13. Compliance Statement

Any development behavior, code pattern, or assistant action not aligned with this document is **non-compliant** and must be corrected.

This document may be updated by the user. When updated, the new version supersedes all prior guidance.

---

*Document Version: 1.0*  
*Effective: December 28, 2025*
