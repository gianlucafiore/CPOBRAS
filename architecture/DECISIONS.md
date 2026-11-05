# Architecture decisions

- Domain logic lives in Rust, with decimal values for costs and quantities.
- The local-first persisted datastore is SQLite; no shared/network SQLite writes.
- Synchronization will use an explicit application server and PostgreSQL.
- IDs are UUIDs to support offline entity creation.
- Financial documents must store immutable price snapshots and revision history.
- All edits from AI tools will require an explicit human review before persistence.
- SQLite storage and an initial Tauri desktop frontend are implemented. Gantt,
  certification, authentication and AI remain in the development roadmap.
- Monetary and measured-quantity values cross IPC as decimal strings. Frontend
  subtotals use scaled BigInt arithmetic and round only when formatting.
- Invalid monetary display values are shown as unavailable, never silently as zero.
- The development scope and validation status are tracked in docs/AUDIT_PLAN.md.
- Do not copy licensed source from IngePresupuestos into this repository without a license review.

## Development stages 1–5

- Desktop IPC is grouped by function under `apps/desktop/src-tauri/src/commands`.
  The explicit workspace permission is limited to the local `main` window.
  Remote origins and auxiliary windows are denied by the native integration test.
- Frontend startup, state, selectors, services, renderers and actions are separate
  modules. Desktop-only file writes are confined to generated export names in the
  application's own data directory.
- Management records keep normalized company/parent/project/client references,
  typed kinds and optimistic revisions; optional business fields use validated JSON.
- Ordered SQLite migrations run in immediate transactions. Change events store
  before/after values; financial documents, plan baselines and revision history
  have immutable storage guards. Current plan links use SQL foreign keys.
- Core planning calculates working-day CPM with FS/SS/FF/SF relations, holidays,
  constraints, float and exact valued cashflow. Assignments do not imply automatic
  resource leveling. Historical plans/baselines retain their snapshots.
- Formula evaluation is bounded decimal arithmetic with named variables, never
  JavaScript evaluation. Nested ACU graphs reject cycles and excessive expansion.
- Price lists specify supplier, zone, currency and validity. Price observations
  and FX quotes are append-only. FX direction, date, source and rate are explicit.
- Pricing order: general expenses on direct cost, financing on direct + general,
  profit on that base, then discount and tax. Existing budgets keep stored rates.
- Backup uses SQLite's online backup API. Restoration validates a migrated clone
  in memory before altering the live connection; the UI creates a safety snapshot.
- A narrowly scoped, verified upstream GLib security fix is carried under `vendor`;
  see vendor/README.md for provenance and the criterion for removing the backport.
