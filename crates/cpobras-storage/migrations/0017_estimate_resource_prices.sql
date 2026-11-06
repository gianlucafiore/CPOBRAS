-- Resource identities in imported historical snapshots may not exist in today's catalog.
CREATE TABLE estimate_resource_prices (
 estimate_id TEXT NOT NULL REFERENCES estimates(id) ON DELETE RESTRICT,
 resource_id TEXT NOT NULL,
 amount TEXT NOT NULL,
 PRIMARY KEY(estimate_id,resource_id)
);
CREATE TABLE line_analysis_sources (
 line_id TEXT PRIMARY KEY REFERENCES estimate_lines(id) ON DELETE CASCADE,
 analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE RESTRICT
);
-- Existing conflicting drafts use the most recently stored composition as their initial price.
INSERT INTO estimate_resource_prices(estimate_id,resource_id,amount)
SELECT estimate_id,resource_id,amount FROM (
 SELECT l.estimate_id,json_extract(c.value,'$.resource_id') resource_id,
 json_extract(c.value,'$.unit_price') amount,
 ROW_NUMBER() OVER (PARTITION BY l.estimate_id,json_extract(c.value,'$.resource_id') ORDER BY a.updated_at DESC,a.rowid DESC,l.position,l.id) n
 FROM estimate_lines l JOIN analyses a ON a.id=l.analysis_id JOIN estimates e ON e.id=l.estimate_id,
 json_each(a.snapshot_json,'$.components') c WHERE e.status='draft' AND a.unit=l.unit
) WHERE n=1;
CREATE TRIGGER protect_issued_resource_price_insert BEFORE INSERT ON estimate_resource_prices
WHEN (SELECT status FROM estimates WHERE id=NEW.estimate_id)='issued'
BEGIN SELECT RAISE(ABORT,'issued estimate is immutable'); END;
CREATE TRIGGER protect_issued_resource_price_update BEFORE UPDATE ON estimate_resource_prices
WHEN (SELECT status FROM estimates WHERE id=OLD.estimate_id)='issued' OR (SELECT status FROM estimates WHERE id=NEW.estimate_id)='issued'
BEGIN SELECT RAISE(ABORT,'issued estimate is immutable'); END;
CREATE TRIGGER protect_issued_resource_price_delete BEFORE DELETE ON estimate_resource_prices
WHEN (SELECT status FROM estimates WHERE id=OLD.estimate_id)='issued'
BEGIN SELECT RAISE(ABORT,'issued estimate is immutable'); END;
