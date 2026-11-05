CREATE TABLE line_analysis_snapshots (
 analysis_id TEXT PRIMARY KEY NOT NULL REFERENCES analyses(id) ON DELETE RESTRICT
);
CREATE TRIGGER immutable_line_analysis_update BEFORE UPDATE ON analyses
WHEN EXISTS(SELECT 1 FROM line_analysis_snapshots WHERE analysis_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'line resource snapshot is immutable; save a new snapshot'); END;
CREATE TRIGGER immutable_line_analysis_delete BEFORE DELETE ON analyses
WHEN EXISTS(SELECT 1 FROM line_analysis_snapshots WHERE analysis_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'line resource snapshot is immutable'); END;
