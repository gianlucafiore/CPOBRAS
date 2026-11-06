# Architecture decisions

- Domain logic lives in Rust, with decimal values for costs and quantities.
- The local-first persisted datastore is SQLite; no shared/network SQLite writes.
- Synchronization will use an explicit application server and PostgreSQL.
- IDs are UUIDs to support offline entity creation.
- Financial documents must store immutable price snapshots and revision history.
- All edits from AI tools will require an explicit human review before persistence.
- SQLite storage and the local Tauri desktop implement stages 1–10.
  Authentication, collaboration, AI and distribution remain in stages 11–12.
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
  have immutable storage guards. Current plan links use SQL foreign keys. Draft
  line deletion archives its original values, detaches current plan tasks in a
  new revision and preserves operational document links through migration 16.
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

## Development stages 6–10

- Construction operations live in `cpobras-storage::operations`; desktop IPC uses
  a dedicated commands module and the existing main-window permission boundary.
- Migration 15 stores immutable source documents, normalized foreign-key links,
  warehouses and an append-only stock ledger. Validation, reconciliation and
  posting share one immediate SQLite transaction; repeated document IDs fail.
- Stock uses weighted average per warehouse/resource/currency. Row allocations
  carry exact values; the final outflow/return carries the division remainder.
  Concurrent consumption is tested with two independent database connections.
- Receipts create inventory; consumption and service acceptance create real cost.
  Daily labor/equipment hours create their own cost. Financial invoices and
  certificates do not duplicate those physical costs. Attendance rows do not
  duplicate production quantities or equipment hours as labor hours.
- Certificates freeze issued-budget sale prices or subcontract prices, period
  quantities, accumulation, advances, retention and net amounts. Indices retain
  period, publication date and source URL; input-source verification is manual.
- Reports calculate at an explicit date, separate currencies and distinguish
  recognized result from cash. The projected remaining cost is an explicit latest
  forecast or a documented production-based budget estimate.
- Frontend operational drafts survive rerenders and require explicit discard on
  navigation. Quick resource creation uses an overlay above the existing dialog,
  preserving its DOM and values; the parent is inert until the child closes.

## Selective patterns and estimate resource prices

- `budget_patterns` selects subtrees or individual lines from authoritative
  budget/template snapshots and appends fresh entities in one immediate transaction.
  Ancestor scaffolding does not implicitly select sibling lines. Existing pricing
  rates stay in the destination. Quantities-only copies have zero prices and no ACU.
- Migration 17 keeps a resource price book scoped to an estimate. Snapshot recipes
  are copied on price changes, preserving yields and independent issued versions.
  Source library ACU links are retained separately for explicit repricing.
- Pattern application adopts existing destination resource prices. New resources
  seed the destination price book; no implicit FX conversion occurs.
