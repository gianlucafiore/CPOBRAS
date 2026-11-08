CREATE TABLE system_calendar (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, calendar_json TEXT NOT NULL CHECK(json_valid(calendar_json)));
CREATE TABLE index_points (id TEXT PRIMARY KEY NOT NULL,series TEXT NOT NULL,period TEXT NOT NULL,value TEXT NOT NULL,publication_date TEXT NOT NULL,source TEXT NOT NULL);
CREATE INDEX index_publications ON index_points(series,period,publication_date);
CREATE TRIGGER index_points_no_update BEFORE UPDATE ON index_points BEGIN SELECT RAISE(ABORT,'index publication is immutable'); END;
CREATE TRIGGER index_points_no_delete BEFORE DELETE ON index_points BEGIN SELECT RAISE(ABORT,'index publication is immutable'); END;
CREATE TABLE estimate_adjustment_agreements (estimate_id TEXT PRIMARY KEY REFERENCES estimates(id) ON DELETE CASCADE, revision INTEGER NOT NULL, definition_json TEXT NOT NULL CHECK(json_valid(definition_json)));
