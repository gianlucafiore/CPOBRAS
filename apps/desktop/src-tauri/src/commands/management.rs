use crate::Db;
use cpobras_storage::management::{ChangeEvent, ManagementRecord};
use uuid::Uuid;
#[tauri::command]
pub(crate) fn list_management_records(
    db: tauri::State<'_, Db>,
    kind: String,
    project_id: Option<String>,
) -> Result<Vec<ManagementRecord>, String> {
    let project_id = project_id
        .map(|id| Uuid::parse_str(&id))
        .transpose()
        .map_err(|e| e.to_string())?;
    db.lock()
        .map_err(|e| e.to_string())?
        .management_records(&kind, project_id)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn save_management_record(
    db: tauri::State<'_, Db>,
    record: ManagementRecord,
) -> Result<ManagementRecord, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .save_management_record(&record)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn list_change_events(
    db: tauri::State<'_, Db>,
    after: i64,
) -> Result<Vec<ChangeEvent>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .change_events(after)
        .map_err(|e| e.to_string())
}
