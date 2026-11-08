CREATE TABLE automatic_codes(scope TEXT PRIMARY KEY,last_value INTEGER NOT NULL CHECK(last_value>=0));
CREATE TABLE measured_lines(line_id TEXT PRIMARY KEY REFERENCES estimate_lines(id) ON DELETE CASCADE,source TEXT NOT NULL CHECK(source IN ('takeoff','formula')));
CREATE TRIGGER clear_measured_quantity AFTER UPDATE OF quantity,unit ON estimate_lines
WHEN NEW.quantity IS NOT OLD.quantity OR NEW.unit IS NOT OLD.unit
BEGIN DELETE FROM measured_lines WHERE line_id=NEW.id; END;
CREATE TABLE project_attachments(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,name TEXT NOT NULL,description TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,content BLOB NOT NULL CHECK(length(content)<=20971520));
CREATE INDEX project_attachment_scope ON project_attachments(project_id);
