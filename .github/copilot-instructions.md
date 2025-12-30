# Copilot Instructions for Midnight

## Architecture Overview

**Midnight** is a Node.js ESM ORM for SQLite/Turso with TypeScript support. No code generation—complex SQL is written directly in JavaScript.

| Component | Path | Purpose |
|-----------|------|---------|
| ORM Library | `src/` | Core ORM exported via `index.js` |
| Types | `index.d.ts` | Full TypeScript definitions |
| Signal API | `signal/` | Express service using Prisma (StudioOS backend) |
| Web Demo | `signal/web/` | Vite/React starter |
| Test Scripts | `scripts/` | Manual validation scripts (no test runner) |

## Build & Run Commands

```bash
# Library (root): Build CJS bundle
npm run build    # → esbuild → index.cjs

# Signal server
cd signal && npm install && npm start
npm test         # Jest tests (run with --runInBand)

# Web frontend
cd signal/web && npm install && npm run dev
```

**Requirements**: Node ≥22.13.1 for SQLite engine

## Core Patterns

### Table Definitions
Extend `Table` (or `SoftDeleteTable`/`FTSTable`/`ExternalFTSTable`). Property names become columns (default: Text):

```js
class Items extends Table {
  name;                              // Text column
  count = this.Default(0);           // Int with default
  price = this.Null(this.Real);      // Nullable Real
  forestId = this.Cascade(Forests);  // FK with cascade delete
  computed = this.Concat(this.name, ' - ', this.status);  // Computed column
}
```

Modifiers: `Index`, `Unique`, `Check`, `Cascade`, `References`, `Null`, `Primary`

### Client API
```js
const db = database.getClient({ Items, Categories });
const sql = db.diff();        // Generate migration SQL
await db.migrate(sql);        // Apply migration

// Table-level CRUD
await db.items.insert({ name: 'foo' });
await db.items.get({ id: 1 });
await db.items.many({ status: 'active' });
await db.items.update({ values: {...}, where: {...} });
await db.items.delete({ id: 1 });

// Complex queries
await db.query(c => ({
  select: { ...c.items, category: c.categories.name },
  join: [c.items.categoryId, c.categories.id],
  where: { [c.items.id]: [1, 2, 3] }
}));
```

### Full-Text Search (FTS)
```js
// Standalone FTS table
class Emails extends FTSTable {
  subject;
  body;
  tokenizer = this.Unicode61({ removeDiacritics: true });
}

// External FTS (mirrors a base table with triggers)
class ForestSearches extends ExternalFTSTable {
  base = Forests;
  name;  // Columns to index from base table
}

// Querying FTS
const results = await db.emails.match('search term');
```

Tokenizers: `Unicode61`, `Ascii`, `Trigram`

### JSON Columns
```js
class Settings extends Table {
  config = this.Json;  // Stored as blob, auto-parsed on read
}

// Query with json_extract
await db.query(c => ({
  select: { value: c.Extract(c.settings.config, '$.theme') },
  where: c => c.config.nested.key.eq('value')  // Deep path access
}));
```

JSON uses `jsonb()` for inserts/updates and `json_extract()` for queries.

### Turso/libSQL Support
```js
import { TursoDatabase } from '@andrewitsover/midnight';

const db = new TursoDatabase({
  db: tursoClient,  // libSQL client with execute/batch APIs
});
await db.sync();  // Sync with remote
```

## Key Files Reference
- `src/tables.js` — Table class, column modifiers, schema processing
- `src/proxy.js` — `makeClient()`, CRUD method wiring
- `src/queries.js` — SQL generation, query building
- `src/methods.js` — `computeMethods`/`compareMethods`/`windowMethods`
- `src/sqlite.js` — SQLite implementation with writer lock
- `src/turso.js` — Turso/libSQL adapter
- `src/migrate.js` — Schema diff and migration generation

## Testing & Validation

**ORM Library** — No test runner; use scripts in `scripts/`:
```bash
node scripts/crud-test.js       # Core CRUD operations
node scripts/fts-test.js        # Full-text search
node scripts/migrate-test.js    # Schema migrations
node scripts/joins-test.js      # Complex joins
node scripts/transaction-test.js # Transactions and batching
```

Use `db.getError(sql)` to validate SQL syntax during development.

**Signal API** — Jest tests in `signal/__tests__/`:
```bash
cd signal && npm test
```
Key test files: `auth.test.js`, `rbac.test.js`, `stateMachine.test.js`, `jobEngine.test.js`

## Concurrency
SQLite uses single-writer lock (`getWriter` in sqlite.js). For heavy writes:
- Use `db.batch()` for transactional writes
- Prefer `insertMany()` over loops

---

## StudioOS Guardrails (signal/** only)

**Applies to:** All UI strings, assistant output, and API responses in `signal/**`.

### Document Authority

Specification lives in `signal/docs/STUDIOOS_*.md`. Precedence:
1. `STUDIOOS_ASSISTANT_HANDBOOK.md`
2. Functional Specs → RBAC → State/Lifecycle → Interaction → Transparency → Error docs → Language

**Closed-World Rule**: If not defined in specs, it does not exist. When uncertain, deny with:
> "This action is not defined in the current StudioOS architecture."

### Forbidden vs Approved Terminology

**NEVER use** (hard ban):
```
track, timeline, clip, session, plugin, fader, automation, 
channel, bus, insert, rack, meter, tweak, adjust, dial in, fine-tune
```

**ALWAYS use**:
```
asset, job, transformation, output, version, report, preset, 
parameter, workflow, delivery, approval, review, lineage, audit
```

### State Machine Compliance

| Entity | Valid States |
|--------|--------------|
| Project | Draft → Processing → Ready → Delivered |
| Asset | Raw → Derived → Final |
| Job | Queued → Running → Completed \| Failed |

Never suggest invalid state transitions.

### Gating Checklist (before any `signal/**` action)
1. **Functional Specs** — Is action defined?
2. **RBAC** — Allowed for this role?
3. **State** — Valid for current entity state?
4. **Language** — Uses approved terminology?

If any "no" → **deny**.
