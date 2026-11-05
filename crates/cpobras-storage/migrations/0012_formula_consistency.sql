CREATE TRIGGER invalidate_changed_quantity_formula AFTER UPDATE OF quantity ON estimate_lines
WHEN NEW.quantity<>OLD.quantity
BEGIN DELETE FROM line_formulas WHERE line_id=NEW.id; END;
