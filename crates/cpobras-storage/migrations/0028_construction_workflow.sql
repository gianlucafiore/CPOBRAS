ALTER TABLE estimate_adjustment_agreements ADD COLUMN terms_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(terms_json));
CREATE TABLE certificate_drafts (
 id TEXT PRIMARY KEY NOT NULL,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
 estimate_id TEXT NOT NULL REFERENCES estimates(id) ON DELETE RESTRICT,scope TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('certificate','subcertificate')), revision INTEGER NOT NULL,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), issued_id TEXT UNIQUE REFERENCES operation_documents(id) ON DELETE RESTRICT,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX one_open_certificate ON certificate_drafts(project_id,estimate_id,scope) WHERE issued_id IS NULL;
CREATE TABLE certificate_sheets (operation_id TEXT PRIMARY KEY REFERENCES operation_documents(id) ON DELETE RESTRICT,sheet_json TEXT NOT NULL CHECK(json_valid(sheet_json)));
CREATE TRIGGER certificate_sheets_no_update BEFORE UPDATE ON certificate_sheets BEGIN SELECT RAISE(ABORT,'issued certificate is immutable'); END;
CREATE TRIGGER certificate_sheets_no_delete BEFORE DELETE ON certificate_sheets BEGIN SELECT RAISE(ABORT,'issued certificate is immutable'); END;
CREATE TABLE certified_sources (
 document_id TEXT NOT NULL REFERENCES operation_documents(id) ON DELETE RESTRICT,
 source_id TEXT NOT NULL REFERENCES operation_documents(id) ON DELETE RESTRICT,line_id TEXT NOT NULL,quantity TEXT NOT NULL,
 PRIMARY KEY(document_id,source_id,line_id)
);
CREATE TRIGGER certified_sources_no_update BEFORE UPDATE ON certified_sources BEGIN SELECT RAISE(ABORT,'certified origin is immutable'); END;
CREATE TRIGGER certified_sources_no_delete BEFORE DELETE ON certified_sources BEGIN SELECT RAISE(ABORT,'certified origin is immutable'); END;
CREATE TABLE quotation_requests (id TEXT PRIMARY KEY REFERENCES operation_documents(id) ON DELETE RESTRICT,request_json TEXT NOT NULL CHECK(json_valid(request_json)));
CREATE TRIGGER quotation_requests_no_update BEFORE UPDATE ON quotation_requests BEGIN SELECT RAISE(ABORT,'quotation request is immutable'); END;
CREATE TRIGGER quotation_requests_no_delete BEFORE DELETE ON quotation_requests BEGIN SELECT RAISE(ABORT,'quotation request is immutable'); END;
