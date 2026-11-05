use crate::Db;
use cpobras_storage::{
    budget_tools::{BudgetDocument, BudgetTemplate, LineEdit},
    estimates::Estimate,
};
use rust_decimal::Decimal;
use std::collections::BTreeMap;
use uuid::Uuid;
#[tauri::command]
pub(crate) fn export_budget_document(
    db: tauri::State<'_, Db>,
    estimate_id: String,
) -> Result<BudgetDocument, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .export_budget(Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn import_budget_document(
    db: tauri::State<'_, Db>,
    project_id: String,
    document: BudgetDocument,
) -> Result<Estimate, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .import_budget(
            Uuid::parse_str(&project_id).map_err(|e| e.to_string())?,
            &document,
        )
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn save_budget_template(
    db: tauri::State<'_, Db>,
    estimate_id: String,
    name: String,
) -> Result<BudgetTemplate, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .save_budget_template(
            Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?,
            &name,
        )
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn list_budget_templates(
    db: tauri::State<'_, Db>,
) -> Result<Vec<BudgetTemplate>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .budget_templates()
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn edit_budget_lines(
    db: tauri::State<'_, Db>,
    estimate_id: String,
    changes: Vec<LineEdit>,
    order: Vec<Uuid>,
) -> Result<(), String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .edit_budget_lines(
            Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?,
            &changes,
            &order,
        )
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn duplicate_budget_line(
    db: tauri::State<'_, Db>,
    estimate_id: String,
    line_id: String,
) -> Result<String, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .duplicate_budget_line(
            Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?,
            Uuid::parse_str(&line_id).map_err(|e| e.to_string())?,
        )
        .map(|id| id.to_string())
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn set_line_formula(
    db: tauri::State<'_, Db>,
    estimate_id: String,
    line_id: String,
    expression: String,
    variables: BTreeMap<String, Decimal>,
) -> Result<String, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .set_line_formula(
            Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?,
            Uuid::parse_str(&line_id).map_err(|e| e.to_string())?,
            &expression,
            &variables,
        )
        .map(|value| value.to_string())
        .map_err(|e| e.to_string())
}
