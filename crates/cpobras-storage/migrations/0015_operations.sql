CREATE TABLE operation_documents (
 id TEXT PRIMARY KEY NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
 kind TEXT NOT NULL,
 partner_id TEXT REFERENCES management_records(id) ON DELETE RESTRICT,
 estimate_id TEXT REFERENCES estimates(id) ON DELETE RESTRICT,
 warehouse_id TEXT REFERENCES operation_warehouses(id) ON DELETE RESTRICT,
 destination_id TEXT REFERENCES operation_warehouses(id) ON DELETE RESTRICT,
 date TEXT NOT NULL,
 reference_id TEXT REFERENCES operation_documents(id) ON DELETE RESTRICT,
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX operation_project_date ON operation_documents(project_id,date,id);
CREATE TABLE operation_links (
 document_id TEXT NOT NULL REFERENCES operation_documents(id) ON DELETE RESTRICT,
 position INTEGER NOT NULL,
 resource_id TEXT REFERENCES resources(id) ON DELETE RESTRICT,
 line_id TEXT REFERENCES estimate_lines(id) ON DELETE RESTRICT,
 center_id TEXT REFERENCES management_records(id) ON DELETE RESTRICT,
 PRIMARY KEY(document_id,position)
);
CREATE TABLE operation_warehouses (
 id TEXT PRIMARY KEY NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
 name TEXT NOT NULL,
 location TEXT NOT NULL,
 UNIQUE(project_id,name,location)
);
CREATE TABLE operation_stock (
 document_id TEXT NOT NULL REFERENCES operation_documents(id) ON DELETE RESTRICT,
 position INTEGER NOT NULL,
 warehouse_id TEXT NOT NULL REFERENCES operation_warehouses(id) ON DELETE RESTRICT,
 resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
 quantity TEXT NOT NULL,
 value TEXT NOT NULL,
 currency TEXT NOT NULL CHECK(currency IN ('ARS','USD')),
 PRIMARY KEY(document_id,position,warehouse_id)
);
CREATE INDEX operation_stock_balance ON operation_stock(warehouse_id,resource_id,currency);
CREATE TRIGGER operation_documents_no_update BEFORE UPDATE ON operation_documents BEGIN SELECT RAISE(ABORT,'operation is immutable'); END;
CREATE TRIGGER operation_documents_no_delete BEFORE DELETE ON operation_documents BEGIN SELECT RAISE(ABORT,'operation is immutable'); END;
CREATE TRIGGER operation_stock_no_update BEFORE UPDATE ON operation_stock BEGIN SELECT RAISE(ABORT,'stock ledger is immutable'); END;
CREATE TRIGGER operation_stock_no_delete BEFORE DELETE ON operation_stock BEGIN SELECT RAISE(ABORT,'stock ledger is immutable'); END;
CREATE TRIGGER operation_links_no_update BEFORE UPDATE ON operation_links BEGIN SELECT RAISE(ABORT,'operation links are immutable'); END;
CREATE TRIGGER operation_links_no_delete BEFORE DELETE ON operation_links BEGIN SELECT RAISE(ABORT,'operation links are immutable'); END;
