CREATE TABLE plan_task_references (
 project_id TEXT NOT NULL REFERENCES project_plans(project_id) ON DELETE CASCADE,
 task_id TEXT NOT NULL,
 line_id TEXT REFERENCES estimate_lines(id) ON DELETE RESTRICT,
 PRIMARY KEY(project_id,task_id)
);
CREATE TABLE plan_assignment_references (
 project_id TEXT NOT NULL,
 task_id TEXT NOT NULL,
 position INTEGER NOT NULL,
 resource_id TEXT REFERENCES resources(id) ON DELETE RESTRICT,
 crew_id TEXT REFERENCES management_records(id) ON DELETE RESTRICT,
 CHECK((resource_id IS NULL) <> (crew_id IS NULL)),
 PRIMARY KEY(project_id,task_id,position),
 FOREIGN KEY(project_id,task_id) REFERENCES plan_task_references(project_id,task_id) ON DELETE CASCADE
);
INSERT INTO plan_task_references(project_id,task_id,line_id)
 SELECT p.project_id,json_extract(t.value,'$.id'),json_extract(t.value,'$.estimate_line_id')
 FROM project_plans p,json_each(p.plan_json,'$.tasks') t;
INSERT INTO plan_assignment_references(project_id,task_id,position,resource_id,crew_id)
 SELECT p.project_id,json_extract(t.value,'$.id'),CAST(a.key AS INTEGER),
 CASE WHEN json_extract(a.value,'$.kind')<>'crew' THEN json_extract(a.value,'$.resource_id') ELSE NULL END,
 CASE WHEN json_extract(a.value,'$.kind')='crew' THEN json_extract(a.value,'$.resource_id') ELSE NULL END
 FROM project_plans p,json_each(p.plan_json,'$.tasks') t,json_each(t.value,'$.assignments') a;
