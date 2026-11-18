CREATE TABLE resource_productivities (
 resource_id TEXT PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
 daily_output TEXT
);
