-- Permit an explicit return to draft while keeping all issued contents protected.
DROP TRIGGER prevent_issued_estimate_update;
CREATE TRIGGER prevent_issued_estimate_update BEFORE UPDATE ON estimates
WHEN OLD.status='issued' AND NOT (
 NEW.status='draft' AND NEW.issued_at IS NULL
 AND NEW.id=OLD.id AND NEW.project_id=OLD.project_id
 AND NEW.title=OLD.title AND NEW.currency=OLD.currency
 AND NEW.created_at=OLD.created_at
)
BEGIN SELECT RAISE(ABORT, 'issued estimate is immutable; reopen before editing'); END;
