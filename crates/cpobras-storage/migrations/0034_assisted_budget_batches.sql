-- Reviewed batch results provide an audit trail and idempotent retries.
CREATE TABLE assisted_budget_batches(
 id TEXT PRIMARY KEY NOT NULL,
 estimate_id TEXT NOT NULL REFERENCES estimates(id) ON DELETE RESTRICT,
 request_json TEXT NOT NULL CHECK(json_valid(request_json)),
 result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER assisted_batches_no_update BEFORE UPDATE ON assisted_budget_batches
BEGIN SELECT RAISE(ABORT,'reviewed batch history is immutable'); END;
CREATE TRIGGER assisted_batches_no_delete BEFORE DELETE ON assisted_budget_batches
BEGIN SELECT RAISE(ABORT,'reviewed batch history is immutable'); END;
