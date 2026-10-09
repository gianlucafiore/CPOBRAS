CREATE TABLE resources (
    id TEXT PRIMARY KEY NOT NULL,
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    unit TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('material', 'labor', 'equipment', 'subcontract')),
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1))
);
CREATE INDEX idx_resources_code ON resources(code);
CREATE TABLE resource_prices (
    id TEXT PRIMARY KEY NOT NULL,
    resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE RESTRICT,
    amount TEXT NOT NULL,
    currency TEXT NOT NULL CHECK(currency IN ('ARS', 'USD')),
    effective_date TEXT NOT NULL,
    source TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_resource_prices_lookup ON resource_prices(resource_id, effective_date DESC, created_at DESC, id DESC);
