-- Deleting a draft line removes its owned data while preserving immutable business history.
CREATE TABLE deleted_estimate_lines (
 id TEXT PRIMARY KEY NOT NULL,
 estimate_id TEXT NOT NULL REFERENCES estimates(id) ON DELETE RESTRICT,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
 currency TEXT NOT NULL CHECK(currency IN ('ARS','USD')),
 line_json TEXT NOT NULL CHECK(json_valid(line_json)),
 analysis_json TEXT CHECK(analysis_json IS NULL OR json_valid(analysis_json)),
 deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER deleted_line_history_no_update BEFORE UPDATE ON deleted_estimate_lines
BEGIN SELECT RAISE(ABORT,'deleted line history is immutable'); END;
CREATE TRIGGER deleted_line_history_no_delete BEFORE DELETE ON deleted_estimate_lines
BEGIN SELECT RAISE(ABORT,'deleted line history is immutable'); END;
ALTER TABLE operation_links ADD COLUMN archived_line_id TEXT REFERENCES deleted_estimate_lines(id) ON DELETE RESTRICT;
DROP TRIGGER operation_links_no_update;
CREATE TRIGGER operation_links_no_update BEFORE UPDATE ON operation_links
WHEN NOT (
 OLD.line_id IS NOT NULL AND NEW.line_id IS NULL
 AND OLD.archived_line_id IS NULL AND NEW.archived_line_id IS OLD.line_id
 AND NEW.document_id=OLD.document_id AND NEW.position=OLD.position
 AND NEW.resource_id IS OLD.resource_id AND NEW.center_id IS OLD.center_id
 AND EXISTS(SELECT 1 FROM deleted_estimate_lines WHERE id=OLD.line_id)
)
BEGIN SELECT RAISE(ABORT,'operation links are immutable'); END;
