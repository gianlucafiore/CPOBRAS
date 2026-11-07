CREATE TABLE print_profiles (
 id TEXT PRIMARY KEY NOT NULL CHECK(id='default'),
 revision INTEGER NOT NULL CHECK(revision>0),
 profile_json TEXT NOT NULL CHECK(json_valid(profile_json))
);
