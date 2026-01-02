# Copilot Instructions for Midnight

## Architecture Overview

**Midnight** is a monorepo with two distinct systems:

| Component | Path | Stack | Purpose |
|-----------|------|-------|---------|
| ORM Library | `src/`, `index.js` | ESM, SQLite/Turso | Core ORM—no codegen, SQL in JS |
| Signal API | `signal/` | Express, Prisma, PostgreSQL | StudioOS backend service |
| Web Demo | `signal/web/` | Vite, React | Frontend starter |

**Key distinction**: The ORM library (`src/`) uses the Midnight ORM itself. The Signal API (`signal/`) uses Prisma with PostgreSQL—these are separate systems.

## Build & Run Commands

```bash
# ORM Library (root)
npm run build              # esbuild → index.cjs
node scripts/crud-test.js  # Manual validation (no test runner)

# Signal API
cd signal
npm install
npx prisma generate && npx prisma db push  # Required before first run
npm start                  # Production
npm run dev                # Development with pretty logs
npm test                   # Jest (always use --runInBand, configured in jest.config.js)
```

**Requirements**: Node ≥22.13.1 (ORM), Node ≥18 (Signal)

## ORM Library Patterns (`src/`)

### Table Definitions
```js
class Items extends Table {
  name;                              // Text (default type)
  count = this.Default(0);           // Int with default
  price = this.Null(this.Real);      // Nullable Real
  forestId = this.Cascade(Forests);  // FK with cascade delete
  computed = this.Concat(this.name, ' - ', this.status);
}
```

Types: `Int`, `Real`, `Text`, `Blob`, `Json`, `Date`, `Bool`  
Modifiers: `Index`, `Unique`, `Check`, `Cascade`, `References`, `Null`, `Primary`, `Default`

### Client API
```js
const db = database.getClient({ Items });
await db.migrate(db.diff());         // Schema diff + apply

await db.items.insert({ name: 'x' });
await db.items.get({ id: 1 });
await db.items.many({ status: 'active' });
await db.items.update({ values: {...}, where: {...} });
```

### Key Files
- [src/tables.js](src/tables.js) — Table class, column modifiers
- [src/proxy.js](src/proxy.js) — `makeClient()`, CRUD wiring
- [src/queries.js](src/queries.js) — SQL generation
- [src/sqlite.js](src/sqlite.js) — SQLite with single-writer lock

## Signal API Patterns (`signal/`)

### Route Factory Pattern
Routes are factory functions receiving `prisma` client (see [signal/routes/projects.js](signal/routes/projects.js)):
```js
function createProjectRoutes(prisma) {
  router.get('/', requireAuth(), requireInternalRole(), async (req, res, next) => {
    const projects = await prisma.project.findMany({ where: { ownerId: req.user.sub } });
    res.json({ data: projects, count: projects.length });
  });
  return router;
}
```

### Middleware Composition
Routes compose auth → role → capability checks:
```js
router.patch('/:id/state', 
  requireAuth(), 
  requireInternalRole('ADVANCED'),  // Minimum role
  async (req, res, next) => { ... }
);
```

RBAC middleware exports: `requireAuth`, `requireInternalRole`, `requireExternalRole`, `blockProhibited`

### State Machine Enforcement
State transitions validated via [signal/middleware/stateMachine.js](signal/middleware/stateMachine.js):
```js
const result = validateProjectTransition(project.state, nextState);
if (!result.valid) return res.status(400).json({ error: result.error });
```

### Data Model (Prisma)
See [signal/prisma/schema.prisma](signal/prisma/schema.prisma) for enums and relations:
- **Users**: `internalRole` (BASIC/STANDARD/ADVANCED) OR `externalRole` (VIEWER/APPROVER)
- **Projects**: state machine (DRAFT→PROCESSING→READY→DELIVERED)
- **Assets**: immutable categories (RAW→DERIVED→FINAL)
- **Jobs**: QUEUED→RUNNING→COMPLETED|FAILED

### Testing (Signal)
Jest tests in `signal/__tests__/` follow pattern:
```js
const { requireAuth } = require('../middleware/rbac');
function mockReq(overrides = {}) { return { user: null, ...overrides }; }
function mockRes() { return { status(c) { this.statusCode = c; return this; }, json(d) { this.jsonData = d; } }; }
```
Key tests: `rbac.test.js`, `stateMachine.test.js`, `jobEngine.test.js`

## StudioOS Dashboard UI (`signal/web/`)

The dashboard is a **release-grade control surface**, not a creative workspace. Visual language is dark, restrained, and enterprise-calm.

### Layout Structure
Three vertical zones:
1. **Left navigation rail** — Projects, Uploads, Analysis, Audit Trail, Compliance (functional domains, not tools)
2. **Central decision panel** — Current project context, confidence score, compliance status, tasks due, version info ("Is it ready?" surface)
3. **Right audit/history column** — Version history and immutable audit trail with timestamps

### Color Tokens (from [signal/web/src/styles/design-system.css](signal/web/src/styles/design-system.css))
```css
--color-success: #22c55e;   /* green = pass */
--color-warning: #f59e0b;   /* amber = pending */
--color-danger: #ef4444;    /* red = risk/fail */
```
Use semantic colors **for state only** — never decoratively.

### Visual Rules
- **Dark theme default**, neutral color palette, strict spacing grid
- **Color for state only**: green = pass, amber = pending, red = risk
- **Card-based layout** with status badges and expandable rows
- **Confidence score** as first-class UI element (large numeric display)
- **Typography hierarchy**: large scores → concise labels → de-emphasized metadata

### Interaction Principles
- **No knobs, sliders, or playful controls** — this is not a DAW
- **Actions are decisions**: Upload, View Fixes, Approve, Download
- **Single escalation paths**: Issues show "View Fixes" button, not multiple tweak options
- **Immutable versioning and audit components always visible**
- **Intake → Evaluation → Decision flow** — upload modal visually detached from analysis

### Key Component Files
```
signal/web/src/components/core/
├── BatchUploader.tsx       # Drag-and-drop asset intake
├── JobManager.tsx          # Job queue display
├── ProcessingReport.tsx    # Analysis results card
├── DeliveryTracking.tsx    # Delivery status
├── QualityPresets.tsx      # Preset selection (no sliders)
└── MetadataEditor.tsx      # Structured metadata form
```

### Dashboard Two (Client Portal)
External users see a **subset** of Dashboard One with stricter constraints (see [STUDIOOS_DASHBOARD_TWO_FUNCTIONAL_SPECS.md](signal/docs/STUDIOOS_DASHBOARD_TWO_FUNCTIONAL_SPECS.md)):
- **5 views only**: Projects, Deliverables, Review & Approvals, Versions, Account & Usage
- **Read-oriented and decision-oriented** — no creation, transformation, or processing
- **VIEWER role**: playback + download only
- **APPROVER role**: playback + download + approve/reject + comment
- Same visual language as Dashboard One (dark, restrained, card-based)

---

## StudioOS Guardrails (signal/** only)

**Specification Authority**: `signal/docs/STUDIOOS_*.md`. If not in specs, it doesn't exist.

### Forbidden Terminology (Hard Ban)
```
track, timeline, clip, session, plugin, fader, automation, 
channel, bus, insert, rack, meter, tweak, adjust, dial in, fine-tune
```

### Required Terminology
```
asset, job, transformation, output, version, report, preset, 
parameter, workflow, delivery, approval, review, lineage, audit
```

### State Machine Compliance
| Entity | States |
|--------|--------|
| Project | Draft → Processing → Ready → Delivered |
| Asset | Raw → Derived → Final (immutable) |
| Job | Queued → Running → Completed \| Failed |

### Pre-Action Checklist
Before any `signal/**` change:
1. **Functional Specs** — Is action defined in `STUDIOOS_FUNCTIONAL_SPECS.md`?
2. **RBAC** — Role permitted in `STUDIOOS_RBAC_MATRIX.md`?
3. **State** — Valid transition per `STUDIOOS_STATE_LIFECYCLE_SPECS.md`?
4. **Language** — Uses approved terminology from `STUDIOOS_LANGUAGE_USAGE.md`?

If any fails → deny with canonical error message.
