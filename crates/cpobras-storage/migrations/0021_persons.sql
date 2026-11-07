DROP TRIGGER IF EXISTS audit_clients_insert;
DROP TRIGGER IF EXISTS audit_clients_update;
DROP TRIGGER IF EXISTS audit_clients_delete;
ALTER TABLE clients RENAME TO persons;
ALTER TABLE persons ADD COLUMN role TEXT NOT NULL DEFAULT 'client' CHECK(role IN ('client','supplier','both'));
ALTER TABLE persons ADD COLUMN code TEXT NOT NULL DEFAULT '';
ALTER TABLE persons ADD COLUMN email TEXT NOT NULL DEFAULT '';
ALTER TABLE persons ADD COLUMN phone TEXT NOT NULL DEFAULT '';
ALTER TABLE persons ADD COLUMN address TEXT NOT NULL DEFAULT '';
ALTER TABLE persons ADD COLUMN tax_key TEXT NOT NULL DEFAULT '';
ALTER TABLE persons ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0);
CREATE UNIQUE INDEX person_tax_identity ON persons(tax_key) WHERE tax_key!='';
ALTER TABLE management_records ADD COLUMN person_id TEXT REFERENCES persons(id) ON DELETE RESTRICT;
CREATE INDEX supplier_person_link ON management_records(person_id);
CREATE TABLE person_legacy_links (
 id TEXT PRIMARY KEY,
 source TEXT NOT NULL CHECK(source IN ('client','supplier','client_profile')),
 legacy_id TEXT NOT NULL,
 person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
 original_json TEXT NOT NULL CHECK(json_valid(original_json)),
 UNIQUE(source,legacy_id)
);
CREATE TABLE people_migration_state(id TEXT PRIMARY KEY CHECK(id='initialized'));
CREATE TABLE project_suppliers (
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
 person_id TEXT NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
 PRIMARY KEY(project_id,person_id)
);
CREATE VIEW clients AS SELECT id,name,cuit FROM persons WHERE role IN ('client','both');
CREATE TRIGGER clients_compat_insert INSTEAD OF INSERT ON clients BEGIN
 INSERT INTO persons(id,name,cuit,role,tax_key) VALUES(NEW.id,NEW.name,NEW.cuit,'client',upper(replace(replace(replace(COALESCE(NEW.cuit,''),'-',''),' ',''),'.','')))
 ON CONFLICT(id) DO UPDATE SET name=excluded.name,cuit=excluded.cuit,tax_key=excluded.tax_key,role=CASE WHEN persons.role='supplier' THEN 'both' ELSE persons.role END,revision=persons.revision+1;
END;
