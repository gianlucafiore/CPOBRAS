CREATE TABLE organizations (
 id TEXT PRIMARY KEY NOT NULL,
 name TEXT NOT NULL CHECK(length(trim(name))>0),
 ownership TEXT NOT NULL CHECK(ownership IN ('own','external')),
 owner_peer_id TEXT,
 company_id TEXT UNIQUE REFERENCES management_records(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL CHECK(revision>=0),
 profile_json TEXT NOT NULL CHECK(json_valid(profile_json)),
 CHECK((ownership='own' AND owner_peer_id IS NULL) OR (ownership='external' AND length(trim(owner_peer_id))>0))
);
CREATE TABLE organization_preferences (
 id TEXT PRIMARY KEY CHECK(id='default'),
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT
);
CREATE TABLE project_organizations (
 project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE RESTRICT,
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT
);
CREATE TRIGGER new_project_organization AFTER INSERT ON projects
BEGIN INSERT INTO project_organizations(project_id,organization_id) SELECT NEW.id,organization_id FROM organization_preferences WHERE id='default'; END;
CREATE TRIGGER protect_project_organization BEFORE UPDATE ON project_organizations
WHEN OLD.organization_id!=NEW.organization_id AND EXISTS(SELECT 1 FROM estimates WHERE project_id=OLD.project_id)
BEGIN SELECT RAISE(ABORT,'No se cambia la organización de una obra con presupuestos'); END;
CREATE TRIGGER own_default_organization_insert BEFORE INSERT ON organization_preferences
WHEN (SELECT ownership FROM organizations WHERE id=NEW.organization_id)!='own'
BEGIN SELECT RAISE(ABORT,'La organización predeterminada debe ser propia'); END;
CREATE TRIGGER own_default_organization_update BEFORE UPDATE ON organization_preferences
WHEN (SELECT ownership FROM organizations WHERE id=NEW.organization_id)!='own'
BEGIN SELECT RAISE(ABORT,'La organización predeterminada debe ser propia'); END;
CREATE TRIGGER external_company_readonly_update BEFORE UPDATE ON management_records
WHEN EXISTS(SELECT 1 FROM organizations WHERE ownership='external' AND company_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'Organización externa de solo lectura'); END;
CREATE TRIGGER external_company_readonly_delete BEFORE DELETE ON management_records
WHEN EXISTS(SELECT 1 FROM organizations WHERE ownership='external' AND company_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'Organización externa de solo lectura'); END;
