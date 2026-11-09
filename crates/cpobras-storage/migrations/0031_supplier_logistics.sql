CREATE TABLE supplier_movements (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES operation_documents(id),
 project_id TEXT NOT NULL REFERENCES projects(id), kind TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(json_valid(payload)), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX supplier_movements_order ON supplier_movements(order_id);
CREATE TRIGGER supplier_movements_no_update BEFORE UPDATE ON supplier_movements BEGIN SELECT RAISE(ABORT,'supplier history is immutable'); END;
CREATE TRIGGER supplier_movements_no_delete BEFORE DELETE ON supplier_movements BEGIN SELECT RAISE(ABORT,'supplier history is immutable'); END;
CREATE TABLE operation_files (
 id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES operation_documents(id), name TEXT NOT NULL, content BLOB NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER operation_files_no_update BEFORE UPDATE ON operation_files BEGIN SELECT RAISE(ABORT,'proof is immutable'); END;
CREATE TRIGGER operation_files_no_delete BEFORE DELETE ON operation_files BEGIN SELECT RAISE(ABORT,'proof is immutable'); END;
