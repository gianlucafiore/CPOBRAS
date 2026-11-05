use crate::Db;
use cpobras_storage::operations::{Operation, ProjectOperationsReport, StockBalance, Warehouse};
use uuid::Uuid;
#[tauri::command]
pub(crate) fn list_operations(
    db: tauri::State<'_, Db>,
    project_id: Option<Uuid>,
) -> Result<Vec<Operation>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .operation_documents(project_id)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn post_operation(
    db: tauri::State<'_, Db>,
    operation: Operation,
) -> Result<Operation, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .post_operation(&operation)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn list_warehouses(db: tauri::State<'_, Db>) -> Result<Vec<Warehouse>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .operation_warehouses()
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn create_warehouse(
    db: tauri::State<'_, Db>,
    warehouse: Warehouse,
) -> Result<Warehouse, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .create_operation_warehouse(&warehouse)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn stock_balances(
    db: tauri::State<'_, Db>,
    as_of: String,
) -> Result<Vec<StockBalance>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .operation_stock(&as_of)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn operations_report(
    db: tauri::State<'_, Db>,
    project_id: Uuid,
    estimate_id: Option<Uuid>,
    as_of: String,
) -> Result<ProjectOperationsReport, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .operations_report(project_id, estimate_id, &as_of)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn operations_portfolio(
    db: tauri::State<'_, Db>,
    as_of: String,
) -> Result<Vec<ProjectOperationsReport>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .operations_portfolio(&as_of)
        .map_err(|e| e.to_string())
}
