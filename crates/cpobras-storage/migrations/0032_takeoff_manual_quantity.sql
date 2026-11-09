-- Preserve the pre-takeoff quantity independently of the applied measurement.
ALTER TABLE measured_lines ADD COLUMN previous_quantity TEXT;
-- Older versions retained this badge after the last measurement was removed.
DELETE FROM measured_lines WHERE source='takeoff'
 AND NOT EXISTS(SELECT 1 FROM takeoff_rows t WHERE t.line_id=measured_lines.line_id);
