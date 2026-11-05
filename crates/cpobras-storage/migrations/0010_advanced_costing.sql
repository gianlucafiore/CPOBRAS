CREATE TABLE price_lists (
 id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL,
 supplier_id TEXT REFERENCES management_records(id) ON DELETE RESTRICT,
 currency TEXT NOT NULL CHECK(currency IN ('ARS','USD')),
 zone TEXT NOT NULL, valid_from TEXT NOT NULL, valid_until TEXT
);
CREATE TABLE scoped_prices (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 id TEXT UNIQUE NOT NULL, list_id TEXT NOT NULL REFERENCES price_lists(id) ON DELETE RESTRICT,
 resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
 effective_date TEXT NOT NULL, amount TEXT NOT NULL, source TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX lookup_scoped_prices ON scoped_prices(list_id,resource_id,effective_date DESC,sequence DESC);
CREATE TRIGGER protect_scoped_price_update BEFORE UPDATE ON scoped_prices
BEGIN SELECT RAISE(ABORT,'price history is immutable'); END;
CREATE TRIGGER protect_scoped_price_delete BEFORE DELETE ON scoped_prices
BEGIN SELECT RAISE(ABORT,'price history is immutable'); END;
CREATE TABLE nested_analyses (
 id TEXT PRIMARY KEY NOT NULL, code TEXT NOT NULL, analysis_json TEXT NOT NULL CHECK(json_valid(analysis_json))
);
CREATE TABLE fx_quotes (
 id TEXT PRIMARY KEY NOT NULL, quote_json TEXT NOT NULL CHECK(json_valid(quote_json)),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER protect_fx_update BEFORE UPDATE ON fx_quotes
BEGIN SELECT RAISE(ABORT,'fx history is immutable'); END;
CREATE TRIGGER protect_fx_delete BEFORE DELETE ON fx_quotes
BEGIN SELECT RAISE(ABORT,'fx history is immutable'); END;
