# Architecture decisions

- Domain logic lives in Rust, with decimal values for costs and quantities.
- The local-first persisted datastore is SQLite; no shared/network SQLite writes.
- Synchronization will use an explicit application server and PostgreSQL.
- IDs are UUIDs to support offline entity creation.
- Financial documents must store immutable price snapshots and revision history.
- All edits from AI tools will require an explicit human review before persistence.
- This PR does not implement storage, Gantt, certification, authentication, Tauri or AI.
- Do not copy licensed source from IngePresupuestos into this repository without a license review.
