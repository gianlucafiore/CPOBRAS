-- Budget sections form a hierarchy independent from immutable estimate snapshots.
CREATE TABLE budget_sections (
    id TEXT PRIMARY KEY NOT NULL,
    estimate_id TEXT NOT NULL REFERENCES estimates(id) ON DELETE RESTRICT,
    parent_id TEXT REFERENCES budget_sections(id) ON DELETE RESTRICT,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    position INTEGER NOT NULL CHECK(position >= 0),
    UNIQUE(estimate_id, code)
);
CREATE INDEX idx_budget_sections_estimate ON budget_sections(estimate_id, parent_id, position);
CREATE TRIGGER prevent_issued_section_insert BEFORE INSERT ON budget_sections
WHEN (SELECT status FROM estimates WHERE id=NEW.estimate_id)='issued'
BEGIN SELECT RAISE(ABORT, 'issued estimate is immutable'); END;
CREATE TRIGGER prevent_issued_section_update BEFORE UPDATE ON budget_sections
WHEN (SELECT status FROM estimates WHERE id=OLD.estimate_id)='issued'
 OR (SELECT status FROM estimates WHERE id=NEW.estimate_id)='issued'
BEGIN SELECT RAISE(ABORT, 'issued estimate is immutable'); END;
CREATE TRIGGER prevent_issued_section_delete BEFORE DELETE ON budget_sections
WHEN (SELECT status FROM estimates WHERE id=OLD.estimate_id)='issued'
BEGIN SELECT RAISE(ABORT, 'issued estimate is immutable'); END;
CREATE TABLE estimate_line_sections (
    line_id TEXT PRIMARY KEY REFERENCES estimate_lines(id) ON DELETE CASCADE,
    section_id TEXT NOT NULL REFERENCES budget_sections(id) ON DELETE RESTRICT
);
CREATE TRIGGER prevent_issued_section_assignment_insert BEFORE INSERT ON estimate_line_sections
WHEN (SELECT status FROM estimates WHERE id=(SELECT estimate_id FROM estimate_lines WHERE id=NEW.line_id))='issued'
BEGIN SELECT RAISE(ABORT, 'issued estimate is immutable'); END;
CREATE TRIGGER prevent_issued_section_assignment_update BEFORE UPDATE ON estimate_line_sections
WHEN (SELECT status FROM estimates WHERE id=(SELECT estimate_id FROM estimate_lines WHERE id=OLD.line_id))='issued'
 OR (SELECT status FROM estimates WHERE id=(SELECT estimate_id FROM estimate_lines WHERE id=NEW.line_id))='issued'
BEGIN SELECT RAISE(ABORT, 'issued estimate is immutable'); END;
CREATE TRIGGER prevent_issued_section_assignment_delete BEFORE DELETE ON estimate_line_sections
WHEN (SELECT status FROM estimates WHERE id=(SELECT estimate_id FROM estimate_lines WHERE id=OLD.line_id))='issued'
BEGIN SELECT RAISE(ABORT, 'issued estimate is immutable'); END;
