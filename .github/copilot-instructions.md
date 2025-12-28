# Copilot Instructions for Midnight

- **Repo shape**: Root package [@andrewitsover/midnight](README.md) (Node ESM ORM targeting SQLite/Turso); sample Express service in [signal](signal/README.md); Vite React demo in [signal/web](signal/web/README.md). Library code lives in [src](src), exported via [index.js](index.js) with type definitions in [index.d.ts](index.d.ts).
- **Build/run**: Library bundles to CJS with `npm run build` (esbuild). SQLite engine expects Node ≥22.13.1. Signal server: `npm install && npm start` in [signal](signal). Web: `npm install && npm run dev` in [signal/web](signal/web).
- **Table definitions**: Define schema by extending `Table`/`FTSTable`/`ExternalFTSTable` in user code; property names become column names (default type Text). Column helpers and modifiers are symbols generated in [src/tables.js](src/tables.js). `Index`/`Unique`/`Check`/`Cascade`/`References`/`Null` set constraints; computed columns are method calls (see `computeMethods` in [src/methods.js](src/methods.js)) returning symbols. `Attributes()` can declare multi-column indexes/checks after `ReplaceFields()`; FTS tokenizers via `Unicode61`/`Ascii`/`Trigram`.
- **Client creation**: `Database.getClient({ TableClass1, ... })` processes classes (`process` in [src/tables.js](src/tables.js)) into `schema` and returns a proxied client (`makeClient` in [src/proxy.js](src/proxy.js)). Table proxies expose CRUD (`insert`, `insertMany`, `update`, `upsert`, `delete`, `get`, `many`) plus aggregates, `groupBy`, `exists`, `query`, `first`, and FTS `match`.
- **Query expressions**: Complex queries use `db.query(c => ({ ... }))` where `c.table.column` yields symbols from [src/symbols.js](src/symbols.js). Supports `select`, `distinct`, `omit`, `join`, `where` (supports `and`/`or`, operator functions from [src/methods.js](src/methods.js)), `groupBy`, `having`, ordering, limits, window functions, CTE-style `subquery`/`use`. Computed columns get expanded via `addAlias` to qualify expressions.
- **Type handling**: Built-in converters registered in [src/db.js](src/db.js) map boolean/date/json to SQLite-friendly storage; additional types register via `registerTypes`. JSON columns serialize to blob and auto-parse during mapping; parser hooks derive from `columns` metadata in `db.columns` and `db.computed`.
- **Execution layers**: SQLite implementation ([src/sqlite.js](src/sqlite.js)) keeps read/write handles and a writer lock; `begin/commit/rollback` return proxied tx objects; `batch` executes collected statements in one transaction; `insertMany` uses JSON bulk insert unless blobs detected. Turso adapter ([src/turso.js](src/turso.js)) expects `props.db` with `execute/batch` APIs and supports `sync`.
- **Migrations**: `getSchema()` returns processed table metadata; `diff(previousSchema)` builds SQL via [src/migrate.js](src/migrate.js), recreating tables when constraints change or columns drop/alter; `SQLiteDatabase.migrate(sql)` wraps DDL in deferred-foreign-key transaction. `toSql`/`indexToSql` live in [src/tables.js](src/tables.js).
- **Mapping/results**: Query assembly lives in [src/queries.js](src/queries.js) and request processing in [src/requests.js](src/requests.js); rows are mapped through `parse/mapOne/mapMany` ([src/map.js](src/map.js)), auto-returning scalar values when only one column is selected. Placeholders use `$p_n` from [src/utils.js](src/utils.js); `nameToSql` escapes reserved words ([src/reserved.js](src/reserved.js)).
- **JSON/expressions**: `expressionHandler` in [src/utils.js](src/utils.js) builds SQL fragments for computed `set` clauses or order by; JSON comparison uses `json_extract` paths and `jsonb(...)` casting for inserts/updates. Operator functions like `c => c.not([1,2])` translate to `not in` clauses.
- **FTS specifics**: `FTSTable` defaults to `rowid` primary key and `unicode61` tokenizer; `ExternalFTSTable` links to a base table and auto-creates triggers to mirror content unless columns are contentless. Avoid empty FTS definitions; at least one column required.
- **Concurrency/locking**: Write operations on SQLite obtain a single-writer lock (`getWriter` in [src/sqlite.js](src/sqlite.js)); batch/tx paths set `tx.isBatch` to defer execution until commit. Prefer `db.batch` or `insertMany` for heavy writes to reduce lock churn.
- **Error/debug**: `SQLiteDatabase.getError(sql)` prepares statements to surface syntax errors; `Database.needsParsing` can signal if type conversions are required. When adding new compute/compare/window functions, update [src/methods.js](src/methods.js) and return types in [src/types.js](src/types.js).
- **Non-library subprojects**: `signal` is a bare Express health check; `signal/web` is untouched Vite/React starter. Keep changes minimal unless intentionally extending the sample. **For StudioOS behavior/UI/API in `signal/**`, follow StudioOS specs (7 views in Dashboard One, 5 in Dashboard Two) and do not add views/features outside the docs.**
- **Style/conventions**: Modules use ES module syntax; keep exports wired through [index.js](index.js). Preserve ASCII column/table names and validation patterns in `verify` in [src/queries.js](src/queries.js). Tests are absent; validate changes via targeted scripts and, for SQLite, small repros using `db.getError` or `db.query`.

---

## StudioOS Guardrails (Mandatory)

**Applies to:** UI strings, assistant responses, API request/response payloads in `signal/**`.

### Document Authority & Precedence

The complete StudioOS specification lives in `signal/docs/STUDIOOS_*.md`. When implementing or suggesting features, resolve conflicts using this precedence order:

1. `STUDIOOS_ASSISTANT_HANDBOOK.md`
2. Functional Specs (Dashboard-specific)
3. State & Lifecycle Specs
4. RBAC Matrices
5. Interaction & Approval Contracts
6. Transparency Charters
7. Error & Support Docs
8. Language Usage

### Closed-World Rule

**If a feature, view, action, or behavior is not explicitly defined in `signal/docs/STUDIOOS_*.md`, it does not exist and must not be implemented.**

When uncertain, deny. When ambiguous, choose the most restrictive interpretation.

Required phrasing when denying:
> "This action is not defined in the current StudioOS architecture."

### Forbidden Terminology (Hard Ban)

The following terms **must not appear** in UI strings, assistant output, or API responses:

```
track, timeline, clip, session, plugin, fader, automation, 
channel, bus, insert, rack, meter (when implying manipulation),
tweak, adjust live, play with, dial in, fine-tune manually,
drag and drop (for audio manipulation), scrub (outside playback-only review)
```

### Approved Terminology

Use only these terms for user-facing content:

```
asset, job, transformation, output, version, report, preset, 
parameter, workflow, delivery, approval, review, lineage, audit,
confidence, analyze, generate, prepare, normalize, convert, 
split, deliver, re-run, approve, reject
```

### Mandatory Gating Checklist

Before suggesting or implementing any action in `signal/**`, verify in order:

1. **Functional Specs** — Is this action defined?
2. **RBAC** — Is it allowed for this role?
3. **State** — Is it valid for the current entity state?
4. **Interaction Rules** — Is the interaction pattern permitted?
5. **Language Compliance** — Does it use approved terminology only?

If any answer is "no" or "undefined" → **deny**.

### State Machine Compliance

All entity states must follow the canonical models:

| Entity | Valid States | Invalid Transitions |
|--------|--------------|---------------------|
| Project | Draft → Processing → Ready → Delivered | Draft → Delivered (bypassing Processing) |
| Asset | Raw → Derived → Final | Raw → Final (must go through Derived) |
| Job | Queued → Running → Completed \| Failed | Any mutation after Completed |

Assistants **must not** suggest invalid state transitions.

### Error & Recovery Language

When surfacing errors in UI or assistant responses:

- Name the canonical error category (Ingestion, Processing, Output, Delivery, System)
- State impact plainly
- Offer only permitted recovery actions from `STUDIOOS_ERROR_RECOVERY_PLAYBOOK.md`

**Forbidden patterns:**
- "Try again later"
- "Something went wrong"
- "We're not sure why…"

**Required pattern:**
- "The job failed due to [category]. You may [permitted recovery action]."

### Transparency & Report Grounding

- Ground all explanations in processing reports, not speculation
- Explain *what* and *why*, never *how to tweak*
- Do not translate reports into DAW language
- Do not guess internal processing or invent unseen steps

### RBAC Enforcement

Respect role permissions at all times:

| Dashboard One | Basic | Standard | Advanced |
|---------------|-------|----------|----------|
| Transform | Preset only | Bounded params | Full params |
| Approve | ✖ | ✔ | ✔ |
| Rerun Jobs | ✖ | Limited | ✔ |

| Dashboard Two | Viewer | Approver |
|---------------|--------|----------|
| Approve/Reject | ✖ | ✔ |
| Download | ✖ | ✔ |

Do not suggest actions outside the user's role. Do not imply hidden capabilities.

---

If any section is unclear or missing context you need, tell me which parts to refine.
