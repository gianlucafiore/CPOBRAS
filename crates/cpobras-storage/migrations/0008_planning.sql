CREATE TABLE project_plans (
 project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL CHECK(revision>0),
 plan_json TEXT NOT NULL CHECK(json_valid(plan_json)),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE plan_baselines (
 id TEXT PRIMARY KEY NOT NULL,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
 name TEXT NOT NULL CHECK(length(trim(name))>0),
 plan_revision INTEGER NOT NULL,
 plan_json TEXT NOT NULL CHECK(json_valid(plan_json)),
 schedule_json TEXT NOT NULL CHECK(json_valid(schedule_json)),
 as_of TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER prevent_baseline_update BEFORE UPDATE ON plan_baselines
BEGIN SELECT RAISE(ABORT,'baseline is immutable'); END;
CREATE TRIGGER prevent_baseline_delete BEFORE DELETE ON plan_baselines
BEGIN SELECT RAISE(ABORT,'baseline is immutable'); END;
CREATE TABLE plan_revisions (
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL,
 plan_json TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(project_id,revision)
);
CREATE TRIGGER prevent_plan_revision_update BEFORE UPDATE ON plan_revisions
BEGIN SELECT RAISE(ABORT,'plan history is immutable'); END;
CREATE TRIGGER prevent_plan_revision_delete BEFORE DELETE ON plan_revisions
BEGIN SELECT RAISE(ABORT,'plan history is immutable'); END;
