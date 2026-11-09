CREATE TABLE site_book_entries (
 id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),number TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),confirmed_at TEXT,
 description TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,UNIQUE(project_id,number)
);
CREATE INDEX site_book_project ON site_book_entries(project_id,created_at DESC);
CREATE TRIGGER site_book_identity BEFORE UPDATE ON site_book_entries WHEN NEW.id<>OLD.id OR NEW.project_id<>OLD.project_id OR NEW.number<>OLD.number OR NEW.created_at<>OLD.created_at OR OLD.confirmed_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'confirmed records and identity cannot be changed');END;
CREATE TRIGGER site_book_no_delete BEFORE DELETE ON site_book_entries BEGIN SELECT RAISE(ABORT,'site book records cannot be deleted');END;
CREATE TABLE quotation_responses (
 id TEXT PRIMARY KEY,request_id TEXT NOT NULL REFERENCES quotation_requests(id),supplier_id TEXT NOT NULL REFERENCES management_records(id),revision INTEGER NOT NULL,payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),UNIQUE(request_id,supplier_id)
);
CREATE TABLE quotation_response_files (
 id TEXT PRIMARY KEY,response_id TEXT NOT NULL REFERENCES quotation_responses(id),name TEXT NOT NULL,content BLOB NOT NULL,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE quotation_awards (
 id TEXT PRIMARY KEY,request_id TEXT NOT NULL REFERENCES quotation_requests(id),response_id TEXT NOT NULL REFERENCES quotation_responses(id),document_id TEXT NOT NULL UNIQUE REFERENCES operation_documents(id),row_id TEXT NOT NULL,quantity TEXT NOT NULL,price TEXT NOT NULL
);
CREATE TRIGGER quotation_awards_no_update BEFORE UPDATE ON quotation_awards BEGIN SELECT RAISE(ABORT,'award is immutable');END;
CREATE TRIGGER quotation_awards_no_delete BEFORE DELETE ON quotation_awards BEGIN SELECT RAISE(ABORT,'award is immutable');END;

-- Preserve previously registered daily reports as confirmed historical book entries.
INSERT INTO site_book_entries(id,project_id,number,created_at,confirmed_at,description,revision)
SELECT id,project_id,'HIST-'||substr(replace(id,'-',''),1,16),replace(created_at,' ','T')||'Z',replace(created_at,' ','T')||'Z',
 'Parte anterior: '||COALESCE(json_extract(payload,'$.number'),'')||char(10)||
 COALESCE(json_extract(payload,'$.notes'),'')||char(10)||COALESCE(json_extract(payload,'$.incidents'),'')||char(10)||
 COALESCE((SELECT group_concat(COALESCE(json_extract(j.value,'$.description'),'')||' · Cantidad: '||COALESCE(json_extract(j.value,'$.quantity'),'')||' · Horas: '||COALESCE(json_extract(j.value,'$.hours'),''),char(10)) FROM json_each(operation_documents.payload,'$.lines') j),''),1
FROM operation_documents WHERE kind='daily';
