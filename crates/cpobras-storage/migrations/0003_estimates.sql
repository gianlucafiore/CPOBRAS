CREATE TABLE estimates (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    currency TEXT NOT NULL CHECK(currency IN ('ARS','USD')),
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    issued_at TEXT
);
CREATE INDEX idx_estimates_project ON estimates(project_id);
CREATE TABLE estimate_lines (
    id TEXT PRIMARY KEY NOT NULL,
    estimate_id TEXT NOT NULL REFERENCES estimates(id) ON DELETE RESTRICT,
    position INTEGER NOT NULL CHECK(position>=0),
    analysis_id TEXT,
    description TEXT NOT NULL,
    unit TEXT NOT NULL,
    quantity TEXT NOT NULL,
    unit_cost_snapshot TEXT NOT NULL,
    UNIQUE(estimate_id, position)
);
CREATE INDEX idx_estimate_lines_estimate ON estimate_lines(estimate_id);
CREATE TRIGGER prevent_issued_estimate_update
BEFORE UPDATE ON estimates
WHEN OLD.status='issued'
BEGIN SELECT RAISE(ABORT, 'issued estimate is immutable'); END;
CREATE TRIGGER prevent_issued_estimate_delete
BEFORE DELETE ON estimates
WHEN OLD.status='issued'
BEGIN SELECT RAISE(ABORT, 'issued estimate is immutable'); END;
CREATE TRIGGER prevent_issued_line_insert
BEFORE INSERT ON estimate_lines
WHEN (SELECT status FROM estimates WHERE id=NEW.estimate_id)='issued'
BEGIN SELECT RAISE(ABORT, 'issued estimate is immutable'); END;
CREATE TRIGGER prevent_issued_line_update
BEFORE UPDATE ON estimate_lines
WHEN (SELECT status FROM estimates WHERE id=OLD.estimate_id)='issued'
   OR (SELECT status FROM estimates WHERE id=NEW.estimate_id)='issued'
BEGIN SELECT RAISE(ABORT, 'issued estimate is immutable'); END;
CREATE TRIGGER prevent_issued_line_delete
BEFORE DELETE ON estimate_lines
WHEN (SELECT status FROM estimates WHERE id=OLD.estimate_id)='issued'
BEGIN SELECT RAISE(ABORT, 'issued estimate is immutable'); END;
