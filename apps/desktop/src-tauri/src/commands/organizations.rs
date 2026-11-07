use crate::Db;
use cpobras_storage::{organizations::Organization, printing::PrintProfile};
use uuid::Uuid;
#[tauri::command]
pub(crate) fn list_organizations(db: tauri::State<'_, Db>) -> Result<Vec<Organization>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .organizations()
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn get_organization(
    db: tauri::State<'_, Db>,
    organization_id: Uuid,
) -> Result<Organization, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .organization(organization_id)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn create_organization(
    db: tauri::State<'_, Db>,
    name: String,
) -> Result<Organization, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .create_organization(&name)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn save_organization(
    db: tauri::State<'_, Db>,
    organization_id: Uuid,
    revision: u32,
    name: String,
    profile: PrintProfile,
) -> Result<Organization, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .save_organization(organization_id, revision, &name, &profile)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn set_default_organization(
    db: tauri::State<'_, Db>,
    organization_id: Uuid,
) -> Result<(), String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .set_default_organization(organization_id)
        .map_err(|e| e.to_string())
}
