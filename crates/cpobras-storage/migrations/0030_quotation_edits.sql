ALTER TABLE quotation_responses ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1));
CREATE TABLE quotation_request_revisions (
 id TEXT PRIMARY KEY,request_id TEXT NOT NULL REFERENCES quotation_requests(id),revision INTEGER NOT NULL,
 request_json TEXT NOT NULL CHECK(json_valid(request_json)),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(request_id,revision)
);
CREATE TRIGGER quotation_request_revisions_no_update BEFORE UPDATE ON quotation_request_revisions BEGIN SELECT RAISE(ABORT,'request revisions are immutable');END;
CREATE TRIGGER quotation_request_revisions_no_delete BEFORE DELETE ON quotation_request_revisions BEGIN SELECT RAISE(ABORT,'request revisions are immutable');END;
-- Bring older imported offers into the editable comparison, preserving their immutable ledger documents.
INSERT INTO quotation_responses(id,request_id,supplier_id,revision,payload_json)
SELECT o.id,o.reference_id,o.partner_id,1,json_object('id',o.id,'request_id',o.reference_id,'supplier_id',o.partner_id,'revision',1,'reference',COALESCE(json_extract(o.payload,'$.number'),''),'terms',COALESCE(json_extract(o.payload,'$.terms'),''),'prices',json((SELECT json_group_array(json_object('row_id',json_extract(i.value,'$.id'),'unit_price',(SELECT json_extract(l.value,'$.unit_price') FROM json_each(o.payload,'$.lines') l WHERE COALESCE(json_extract(l.value,'$.resource_id'),json_extract(l.value,'$.line_id'))=json_extract(i.value,'$.source_id') LIMIT 1),'notes','')) FROM json_each(r.request_json,'$.items') i)))
FROM operation_documents o JOIN quotation_requests r ON r.id=o.reference_id
WHERE o.kind='quote' AND o.partner_id IS NOT NULL
AND NOT EXISTS(SELECT 1 FROM quotation_responses p WHERE p.request_id=o.reference_id AND p.supplier_id=o.partner_id)
AND o.rowid=(SELECT MAX(x.rowid) FROM operation_documents x WHERE x.kind='quote' AND x.reference_id=o.reference_id AND x.partner_id=o.partner_id);
-- A supplier order contains several material rows; document_id must not be globally unique here.
DROP TRIGGER quotation_awards_no_update;
DROP TRIGGER quotation_awards_no_delete;
ALTER TABLE quotation_awards RENAME TO quotation_awards_v29;
CREATE TABLE quotation_awards (
 id TEXT PRIMARY KEY,request_id TEXT NOT NULL REFERENCES quotation_requests(id),response_id TEXT NOT NULL REFERENCES quotation_responses(id),document_id TEXT NOT NULL REFERENCES operation_documents(id),row_id TEXT NOT NULL,quantity TEXT NOT NULL,price TEXT NOT NULL,
 UNIQUE(document_id,row_id)
);
INSERT INTO quotation_awards SELECT * FROM quotation_awards_v29;
DROP TABLE quotation_awards_v29;
CREATE INDEX quotation_award_request ON quotation_awards(request_id);
CREATE TRIGGER quotation_awards_no_update BEFORE UPDATE ON quotation_awards BEGIN SELECT RAISE(ABORT,'award is immutable');END;
CREATE TRIGGER quotation_awards_no_delete BEFORE DELETE ON quotation_awards BEGIN SELECT RAISE(ABORT,'award is immutable');END;
