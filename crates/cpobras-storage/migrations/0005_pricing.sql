CREATE TABLE estimate_pricing (
    estimate_id TEXT PRIMARY KEY NOT NULL REFERENCES estimates(id) ON DELETE RESTRICT,
    general_expenses_percent TEXT NOT NULL DEFAULT '0',
    profit_percent TEXT NOT NULL DEFAULT '0',
    discount_percent TEXT NOT NULL DEFAULT '0',
    tax_percent TEXT NOT NULL DEFAULT '0'
);
CREATE TRIGGER prevent_issued_pricing_insert BEFORE INSERT ON estimate_pricing
WHEN (SELECT status FROM estimates WHERE id=NEW.estimate_id)='issued'
BEGIN SELECT RAISE(ABORT, 'issued estimate is immutable'); END;
CREATE TRIGGER prevent_issued_pricing_update BEFORE UPDATE ON estimate_pricing
WHEN (SELECT status FROM estimates WHERE id=OLD.estimate_id)='issued'
 OR (SELECT status FROM estimates WHERE id=NEW.estimate_id)='issued'
BEGIN SELECT RAISE(ABORT, 'issued estimate is immutable'); END;
CREATE TRIGGER prevent_issued_pricing_delete BEFORE DELETE ON estimate_pricing
WHEN (SELECT status FROM estimates WHERE id=OLD.estimate_id)='issued'
BEGIN SELECT RAISE(ABORT, 'issued estimate is immutable'); END;
