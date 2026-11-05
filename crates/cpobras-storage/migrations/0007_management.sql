CREATE TABLE management_records (
 id TEXT PRIMARY KEY NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('company','establishment','user','supplier','subcontractor','contact','project_profile','client_profile','contract','cost_center','unit','category','trade','document','crew')),
 name TEXT NOT NULL CHECK(length(trim(name))>0),
 code TEXT NOT NULL,
 company_id TEXT REFERENCES management_records(id) ON DELETE RESTRICT,
 parent_id TEXT REFERENCES management_records(id) ON DELETE RESTRICT,
 project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
 client_id TEXT REFERENCES clients(id) ON DELETE RESTRICT,
 attributes_json TEXT NOT NULL CHECK(json_valid(attributes_json)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0)
);
CREATE INDEX idx_management_kind ON management_records(kind, company_id, project_id);
CREATE UNIQUE INDEX one_project_profile ON management_records(project_id) WHERE kind='project_profile';
CREATE UNIQUE INDEX one_client_profile ON management_records(client_id) WHERE kind='client_profile';
CREATE TABLE change_events (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
 operation TEXT NOT NULL CHECK(operation IN ('insert','update','delete')),
 old_json TEXT, new_json TEXT,
 occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER protect_change_events_update BEFORE UPDATE ON change_events
BEGIN SELECT RAISE(ABORT,'change history is immutable'); END;
CREATE TRIGGER protect_change_events_delete BEFORE DELETE ON change_events
BEGIN SELECT RAISE(ABORT,'change history is immutable'); END;
