-- Dimension-based takeoff rows linked to individual estimate lines.
CREATE TABLE takeoff_rows (
  id TEXT PRIMARY KEY,
  estimate_id TEXT NOT NULL REFERENCES estimates(id) ON DELETE RESTRICT,
  line_id TEXT NOT NULL REFERENCES estimate_lines(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  factor TEXT NOT NULL,
  length TEXT NOT NULL,
  width TEXT NOT NULL,
  height TEXT NOT NULL,
  sign INTEGER NOT NULL CHECK(sign IN (-1,1)),
  position INTEGER NOT NULL CHECK(position>=0)
);
CREATE INDEX idx_takeoff_line ON takeoff_rows(line_id,position,id);
CREATE TRIGGER takeoff_row_line_consistency_insert BEFORE INSERT ON takeoff_rows
WHEN (SELECT estimate_id FROM estimate_lines WHERE id=NEW.line_id) IS NOT NEW.estimate_id
BEGIN SELECT RAISE(ABORT,'takeoff line must belong to estimate'); END;
CREATE TRIGGER takeoff_row_line_consistency_update BEFORE UPDATE ON takeoff_rows
WHEN (SELECT estimate_id FROM estimate_lines WHERE id=NEW.line_id) IS NOT NEW.estimate_id
BEGIN SELECT RAISE(ABORT,'takeoff line must belong to estimate'); END;
CREATE TRIGGER takeoff_row_issued_insert BEFORE INSERT ON takeoff_rows
WHEN (SELECT status FROM estimates WHERE id=NEW.estimate_id)='issued'
BEGIN SELECT RAISE(ABORT,'issued estimate is immutable'); END;
CREATE TRIGGER takeoff_row_issued_update BEFORE UPDATE ON takeoff_rows
WHEN (SELECT status FROM estimates WHERE id=OLD.estimate_id)='issued'
 OR (SELECT status FROM estimates WHERE id=NEW.estimate_id)='issued'
BEGIN SELECT RAISE(ABORT,'issued estimate is immutable'); END;
CREATE TRIGGER takeoff_row_issued_delete BEFORE DELETE ON takeoff_rows
WHEN (SELECT status FROM estimates WHERE id=OLD.estimate_id)='issued'
BEGIN SELECT RAISE(ABORT,'issued estimate is immutable'); END;
