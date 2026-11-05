use crate::Db;
use cpobras_core::planning::{Plan, Schedule};
use cpobras_storage::planning::{Baseline, SavedPlan};
use uuid::Uuid;
#[tauri::command]
pub(crate) fn get_project_plan(
    db: tauri::State<'_, Db>,
    project_id: String,
) -> Result<Option<SavedPlan>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .project_plan(Uuid::parse_str(&project_id).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn save_project_plan(
    db: tauri::State<'_, Db>,
    project_id: String,
    revision: u32,
    plan: Plan,
    as_of: String,
) -> Result<SavedPlan, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .save_project_plan(
            Uuid::parse_str(&project_id).map_err(|e| e.to_string())?,
            revision,
            plan,
            &as_of,
        )
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn calculate_schedule(plan: Plan, as_of: String) -> Result<Schedule, String> {
    plan.schedule(&as_of)
}
#[tauri::command]
pub(crate) fn create_plan_baseline(
    db: tauri::State<'_, Db>,
    project_id: String,
    name: String,
    as_of: String,
) -> Result<Baseline, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .create_plan_baseline(
            Uuid::parse_str(&project_id).map_err(|e| e.to_string())?,
            &name,
            &as_of,
        )
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn list_plan_baselines(
    db: tauri::State<'_, Db>,
    project_id: String,
) -> Result<Vec<Baseline>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .plan_baselines(Uuid::parse_str(&project_id).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn list_plan_revisions(
    db: tauri::State<'_, Db>,
    project_id: String,
) -> Result<Vec<SavedPlan>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .plan_revisions(Uuid::parse_str(&project_id).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}
