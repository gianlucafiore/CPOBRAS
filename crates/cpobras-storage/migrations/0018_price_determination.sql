CREATE TABLE estimate_price_definitions (
 estimate_id TEXT PRIMARY KEY NOT NULL REFERENCES estimates(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL CHECK(revision>0),
 definition_json TEXT NOT NULL CHECK(json_valid(definition_json))
);
CREATE TABLE price_definition_templates (
 id TEXT PRIMARY KEY NOT NULL,
 name TEXT NOT NULL,
 currency TEXT NOT NULL CHECK(currency IN ('ARS','USD')),
 scope TEXT NOT NULL CHECK(scope IN ('definition','detail')),
 definition_json TEXT NOT NULL CHECK(json_valid(definition_json)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER protect_issued_definition_insert BEFORE INSERT ON estimate_price_definitions
WHEN (SELECT status FROM estimates WHERE id=NEW.estimate_id)='issued'
BEGIN SELECT RAISE(ABORT,'issued estimate is immutable'); END;
CREATE TRIGGER protect_issued_definition_update BEFORE UPDATE ON estimate_price_definitions
WHEN (SELECT status FROM estimates WHERE id=OLD.estimate_id)='issued' OR (SELECT status FROM estimates WHERE id=NEW.estimate_id)='issued'
BEGIN SELECT RAISE(ABORT,'issued estimate is immutable'); END;
CREATE TRIGGER protect_issued_definition_delete BEFORE DELETE ON estimate_price_definitions
WHEN (SELECT status FROM estimates WHERE id=OLD.estimate_id)='issued'
BEGIN SELECT RAISE(ABORT,'issued estimate is immutable'); END;
