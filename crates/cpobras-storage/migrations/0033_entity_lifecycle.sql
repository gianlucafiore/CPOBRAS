CREATE TABLE entity_archives(kind TEXT NOT NULL,entity_id TEXT NOT NULL,archived_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(kind,entity_id));
CREATE TRIGGER inactive_client_new_project BEFORE INSERT ON projects
WHEN EXISTS(SELECT 1 FROM entity_archives WHERE kind='person:client' AND entity_id=NEW.client_id)
BEGIN SELECT RAISE(ABORT,'El cliente está dado de baja'); END;
CREATE TRIGGER inactive_client_change_project BEFORE UPDATE OF client_id ON projects
WHEN NEW.client_id<>OLD.client_id AND EXISTS(SELECT 1 FROM entity_archives WHERE kind='person:client' AND entity_id=NEW.client_id)
BEGIN SELECT RAISE(ABORT,'El cliente está dado de baja'); END;
CREATE TRIGGER inactive_supplier_new_offer BEFORE INSERT ON quotation_responses
WHEN EXISTS(SELECT 1 FROM management_records m JOIN entity_archives a ON a.entity_id=m.person_id AND a.kind='person:supplier' WHERE m.id=NEW.supplier_id)
BEGIN SELECT RAISE(ABORT,'El proveedor está dado de baja'); END;
-- Supplemental links keep original advance documents immutable.
CREATE TABLE advance_agreement_links(document_id TEXT PRIMARY KEY REFERENCES operation_documents(id),estimate_id TEXT NOT NULL REFERENCES estimates(id));
INSERT INTO advance_agreement_links(document_id,estimate_id)
 SELECT d.id,(SELECT MIN(e.id) FROM estimates e WHERE e.project_id=d.project_id AND e.currency=json_extract(d.payload,'$.currency'))
 FROM operation_documents d WHERE d.kind='advance_received' AND json_extract(d.payload,'$.estimate_id') IS NULL
 AND (SELECT COUNT(*) FROM estimates e WHERE e.project_id=d.project_id AND e.currency=json_extract(d.payload,'$.currency'))=1;
