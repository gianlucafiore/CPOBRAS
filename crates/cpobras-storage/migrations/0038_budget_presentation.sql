CREATE TABLE budget_presentations (
 estimate_id TEXT PRIMARY KEY REFERENCES estimates(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL CHECK(revision > 0),
 data_json TEXT NOT NULL CHECK(json_valid(data_json))
);
CREATE TABLE organization_indirect_costs (
 organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL CHECK(revision > 0),
 data_json TEXT NOT NULL CHECK(json_valid(data_json))
);
