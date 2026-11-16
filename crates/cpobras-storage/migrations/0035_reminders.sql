CREATE TABLE reminders (
 id TEXT PRIMARY KEY NOT NULL,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 300),
 due_date TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('general','materials','client_certificate','contractor_certificate','client_quote')),
 project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
 person_id TEXT REFERENCES persons(id) ON DELETE SET NULL,
 project_name TEXT NOT NULL DEFAULT '',
 person_name TEXT NOT NULL DEFAULT '',
 notes TEXT NOT NULL DEFAULT '',
 completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0)
);
CREATE INDEX reminders_due ON reminders(completed,due_date,id);
