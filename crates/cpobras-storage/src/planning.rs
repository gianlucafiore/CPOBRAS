use crate::{LocalStore, Result, StorageError};
use cpobras_core::planning::{Plan, Schedule};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
#[derive(Debug, Serialize, Deserialize)]
pub struct SavedPlan {
    pub project_id: Uuid,
    pub revision: u32,
    pub plan: Plan,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct Baseline {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub revision: u32,
    pub plan: Plan,
    pub schedule: Schedule,
    pub as_of: String,
}
impl LocalStore {
    pub fn project_plan(&self, project_id: Uuid) -> Result<Option<SavedPlan>> {
        let row: Option<(u32, String)> = self
            .conn
            .query_row(
                "SELECT revision,plan_json FROM project_plans WHERE project_id=?1",
                [project_id.to_string()],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        row.map(|(revision, json)| {
            let mut plan: Plan = serde_json::from_str(&json)?;
            self.apply_general_calendar(&mut plan)?;
            crate::construction_workflow::apply_progress(&self.conn, project_id, &mut plan, false)?;
            Ok(SavedPlan {
                project_id,
                revision,
                plan,
            })
        })
        .transpose()
    }
    pub fn save_project_plan(
        &mut self,
        project_id: Uuid,
        revision: u32,
        mut plan: Plan,
        as_of: &str,
    ) -> Result<SavedPlan> {
        if self.get_project(project_id)?.is_none() {
            return Err(StorageError::InvalidValue("Obra inexistente".into()));
        }
        self.apply_general_calendar(&mut plan)?;
        crate::construction_workflow::apply_progress(&self.conn, project_id, &mut plan, false)?;
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let mut allocated = std::collections::BTreeMap::<
            (bool, Uuid),
            (rust_decimal::Decimal, rust_decimal::Decimal),
        >::new();
        for task in &mut plan.tasks {
            if let Some(line_id) = task.estimate_line_id {
                let values:Option<(String,String)>=tx.query_row("SELECT l.quantity,l.unit_cost_snapshot FROM estimate_lines l JOIN estimates e ON e.id=l.estimate_id WHERE l.id=?1 AND e.project_id=?2",params![line_id.to_string(),project_id.to_string()],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
                let (quantity, cost) = values.ok_or_else(|| {
                    StorageError::InvalidValue(
                        "La partida vinculada no pertenece a esta obra".into(),
                    )
                })?;
                let full_budget = quantity
                    .parse::<rust_decimal::Decimal>()
                    .map_err(|e| StorageError::InvalidValue(e.to_string()))?
                    .checked_mul(
                        cost.parse::<rust_decimal::Decimal>()
                            .map_err(|e| StorageError::InvalidValue(e.to_string()))?,
                    )
                    .ok_or_else(|| {
                        StorageError::InvalidValue(
                            "El costo de la tarea excede el rango decimal".into(),
                        )
                    })?;
                let percent = plan
                    .segments
                    .get(&task.id)
                    .map_or(rust_decimal::Decimal::from(100), |p| p.percent);
                if let Some(part) = plan.segments.get_mut(&task.id) {
                    part.base_budget = full_budget;
                }
                let accumulated = allocated.entry((true, line_id)).or_default();
                accumulated.0 = accumulated.0.checked_add(percent).ok_or_else(|| {
                    StorageError::InvalidValue("Porcentaje fuera de rango".into())
                })?;
                task.budget = if accumulated.0 == rust_decimal::Decimal::from(100) {
                    full_budget.checked_sub(accumulated.1)
                } else {
                    full_budget
                        .checked_mul(percent)
                        .and_then(|v| v.checked_div(rust_decimal::Decimal::from(100)))
                }
                .ok_or_else(|| StorageError::InvalidValue("Costo fuera de rango".into()))?;
                accumulated.1 = accumulated
                    .1
                    .checked_add(task.budget)
                    .ok_or_else(|| StorageError::InvalidValue("Costo fuera de rango".into()))?;
            } else if let Some(part) = plan.segments.get(&task.id) {
                let accumulated = allocated.entry((false, part.group_id)).or_default();
                accumulated.0 = accumulated.0.checked_add(part.percent).ok_or_else(|| {
                    StorageError::InvalidValue("Porcentaje fuera de rango".into())
                })?;
                task.budget = if accumulated.0 == rust_decimal::Decimal::from(100) {
                    part.base_budget.checked_sub(accumulated.1)
                } else {
                    part.base_budget
                        .checked_mul(part.percent)
                        .and_then(|v| v.checked_div(rust_decimal::Decimal::from(100)))
                }
                .ok_or_else(|| StorageError::InvalidValue("Costo fuera de rango".into()))?;
                accumulated.1 = accumulated
                    .1
                    .checked_add(task.budget)
                    .ok_or_else(|| StorageError::InvalidValue("Costo fuera de rango".into()))?;
            }
            for assignment in &task.assignments {
                let query=match assignment.kind.as_str(){
                    "crew"=>"SELECT EXISTS(SELECT 1 FROM management_records WHERE id=?1 AND kind='crew')",
                    "equipment"=>"SELECT EXISTS(SELECT 1 FROM resources WHERE id=?1 AND kind='equipment')",
                    "resource"=>"SELECT EXISTS(SELECT 1 FROM resources WHERE id=?1)",
                    _=>return Err(StorageError::InvalidValue("Tipo de asignación inválido".into()))
                };
                let exists: bool =
                    tx.query_row(query, [assignment.resource_id.to_string()], |r| r.get(0))?;
                if !exists {
                    return Err(StorageError::InvalidValue(
                        "Recurso o cuadrilla inexistente".into(),
                    ));
                }
            }
        }
        plan.schedule(as_of).map_err(StorageError::InvalidValue)?;
        let current: Option<u32> = tx
            .query_row(
                "SELECT revision FROM project_plans WHERE project_id=?1",
                [project_id.to_string()],
                |r| r.get(0),
            )
            .optional()?;
        if current.unwrap_or(0) != revision {
            return Err(StorageError::InvalidValue(
                "El plan cambió; recargá antes de guardar".into(),
            ));
        }
        let saved = SavedPlan {
            project_id,
            revision: revision + 1,
            plan,
        };
        let json = serde_json::to_string(&saved.plan)?;
        tx.execute("INSERT INTO project_plans(project_id,revision,plan_json) VALUES (?1,?2,?3) ON CONFLICT(project_id) DO UPDATE SET revision=excluded.revision,plan_json=excluded.plan_json,updated_at=CURRENT_TIMESTAMP",params![project_id.to_string(),saved.revision,json])?;
        tx.execute(
            "INSERT INTO plan_revisions(project_id,revision,plan_json) VALUES (?1,?2,?3)",
            params![project_id.to_string(), saved.revision, json],
        )?;
        tx.execute(
            "DELETE FROM plan_task_references WHERE project_id=?1",
            [project_id.to_string()],
        )?;
        for task in &saved.plan.tasks {
            tx.execute(
                "INSERT INTO plan_task_references(project_id,task_id,line_id) VALUES (?1,?2,?3)",
                params![
                    project_id.to_string(),
                    task.id.to_string(),
                    task.estimate_line_id.map(|id| id.to_string())
                ],
            )?;
            for (position, assignment) in task.assignments.iter().enumerate() {
                let resource = if assignment.kind == "crew" {
                    None
                } else {
                    Some(assignment.resource_id.to_string())
                };
                let crew = if assignment.kind == "crew" {
                    Some(assignment.resource_id.to_string())
                } else {
                    None
                };
                tx.execute("INSERT INTO plan_assignment_references(project_id,task_id,position,resource_id,crew_id) VALUES (?1,?2,?3,?4,?5)",params![project_id.to_string(),task.id.to_string(),position as i64,resource,crew])?;
            }
        }
        tx.commit()?;
        Ok(saved)
    }
    pub fn create_plan_baseline(
        &mut self,
        project_id: Uuid,
        name: &str,
        as_of: &str,
    ) -> Result<Baseline> {
        if name.trim().is_empty() || name.len() > 500 {
            return Err(StorageError::InvalidValue(
                "Nombre de línea base inválido".into(),
            ));
        }
        let saved = self.project_plan(project_id)?.ok_or_else(|| {
            StorageError::InvalidValue("Guardá el cronograma antes de crear una línea base".into())
        })?;
        let baseline = Baseline {
            id: Uuid::new_v4(),
            project_id,
            name: name.trim().into(),
            revision: saved.revision,
            schedule: saved
                .plan
                .schedule(as_of)
                .map_err(StorageError::InvalidValue)?,
            plan: saved.plan,
            as_of: as_of.into(),
        };
        self.conn.execute("INSERT INTO plan_baselines(id,project_id,name,plan_revision,plan_json,schedule_json,as_of) VALUES (?1,?2,?3,?4,?5,?6,?7)",params![baseline.id.to_string(),project_id.to_string(),baseline.name,baseline.revision,serde_json::to_string(&baseline.plan)?,serde_json::to_string(&baseline.schedule)?,as_of])?;
        Ok(baseline)
    }
    pub fn plan_baselines(&self, project_id: Uuid) -> Result<Vec<Baseline>> {
        let records:Vec<(String,String,u32,String,String,String)>=self.conn.prepare("SELECT id,name,plan_revision,plan_json,schedule_json,as_of FROM plan_baselines WHERE project_id=?1 ORDER BY created_at,id")?.query_map([project_id.to_string()],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?)))?.collect::<std::result::Result<_,_>>()?;
        records
            .into_iter()
            .map(|(id, name, revision, plan, schedule, as_of)| {
                Ok(Baseline {
                    id: Uuid::parse_str(&id)?,
                    project_id,
                    name,
                    revision,
                    plan: serde_json::from_str(&plan)?,
                    schedule: serde_json::from_str(&schedule)?,
                    as_of,
                })
            })
            .collect()
    }
}

impl LocalStore {
    pub fn plan_revisions(&self, project_id: Uuid) -> Result<Vec<SavedPlan>> {
        let rows:Vec<(u32,String)>=self.conn.prepare("SELECT revision,plan_json FROM plan_revisions WHERE project_id=?1 ORDER BY revision DESC LIMIT 1000")?
            .query_map([project_id.to_string()],|r|Ok((r.get(0)?,r.get(1)?)))?.collect::<std::result::Result<_,_>>()?;
        rows.into_iter()
            .map(|(revision, json)| {
                Ok(SavedPlan {
                    project_id,
                    revision,
                    plan: serde_json::from_str(&json)?,
                })
            })
            .collect()
    }
}
