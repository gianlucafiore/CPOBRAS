PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    cuit TEXT
);
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY NOT NULL,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    currency TEXT NOT NULL CHECK(currency IN ('ARS', 'USD'))
);
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);
CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY NOT NULL,
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    unit TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_analyses_code ON analyses(code);
