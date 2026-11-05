CREATE TABLE line_origins (
 line_id TEXT PRIMARY KEY REFERENCES estimate_lines(id) ON DELETE CASCADE,
 origin_id TEXT NOT NULL
);
INSERT INTO line_origins(line_id,origin_id) SELECT id,id FROM estimate_lines;
CREATE TRIGGER assign_line_origin AFTER INSERT ON estimate_lines
BEGIN INSERT INTO line_origins(line_id,origin_id) VALUES(NEW.id,NEW.id); END;
CREATE TRIGGER protect_issued_origin_update BEFORE UPDATE ON line_origins
WHEN (SELECT e.status FROM estimates e JOIN estimate_lines l ON l.estimate_id=e.id WHERE l.id=OLD.line_id)='issued'
BEGIN SELECT RAISE(ABORT,'issued line identity is immutable'); END;
CREATE TABLE budget_templates (
 id TEXT PRIMARY KEY NOT NULL,
 name TEXT NOT NULL CHECK(length(trim(name))>0),
 document_json TEXT NOT NULL CHECK(json_valid(document_json)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE line_formulas (
 line_id TEXT PRIMARY KEY REFERENCES estimate_lines(id) ON DELETE CASCADE,
 expression TEXT NOT NULL,
 variables_json TEXT NOT NULL CHECK(json_valid(variables_json))
);
CREATE TRIGGER protect_issued_formula_insert BEFORE INSERT ON line_formulas
WHEN (SELECT e.status FROM estimates e JOIN estimate_lines l ON l.estimate_id=e.id WHERE l.id=NEW.line_id)='issued'
BEGIN SELECT RAISE(ABORT,'issued line formula is immutable'); END;
CREATE TRIGGER protect_issued_formula_update BEFORE UPDATE ON line_formulas
WHEN (SELECT e.status FROM estimates e JOIN estimate_lines l ON l.estimate_id=e.id WHERE l.id=OLD.line_id)='issued'
BEGIN SELECT RAISE(ABORT,'issued line formula is immutable'); END;
CREATE TRIGGER protect_issued_formula_delete BEFORE DELETE ON line_formulas
WHEN (SELECT e.status FROM estimates e JOIN estimate_lines l ON l.estimate_id=e.id WHERE l.id=OLD.line_id)='issued'
BEGIN SELECT RAISE(ABORT,'issued line formula is immutable'); END;
