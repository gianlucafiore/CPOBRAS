use crate::Db;
use cpobras_core::adjustments::{AdjustmentAgreement, AdjustmentSnapshot, IndexPoint};
use cpobras_storage::{
    adjustments::{CertificateDifference, CertificationOverview, SavedAgreement},
    system_settings::GeneralCalendar,
};
use uuid::Uuid;
#[tauri::command]
pub(crate) fn get_general_calendar(db: tauri::State<'_, Db>) -> Result<GeneralCalendar, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .general_calendar()
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn save_general_calendar(
    db: tauri::State<'_, Db>,
    calendar: GeneralCalendar,
) -> Result<GeneralCalendar, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .save_general_calendar(&calendar)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn list_index_points(db: tauri::State<'_, Db>) -> Result<Vec<IndexPoint>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .index_points()
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn save_index_point(
    db: tauri::State<'_, Db>,
    point: IndexPoint,
) -> Result<IndexPoint, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .save_index_point(&point)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn get_adjustment_agreement(
    db: tauri::State<'_, Db>,
    estimate_id: Uuid,
) -> Result<SavedAgreement, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .adjustment_agreement(estimate_id)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn save_adjustment_agreement(
    db: tauri::State<'_, Db>,
    estimate_id: Uuid,
    revision: u32,
    definition: Option<AdjustmentAgreement>,
    terms: Option<cpobras_storage::construction_workflow::CertificateTerms>,
) -> Result<SavedAgreement, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .save_adjustment_agreement_with_terms(estimate_id, revision, definition, terms)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn certificate_index_preview(
    db: tauri::State<'_, Db>,
    estimate_id: Uuid,
    cut: String,
    as_of: String,
) -> Result<Option<AdjustmentSnapshot>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .certificate_index_preview(estimate_id, &cut, &as_of)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn pending_adjustment_differences(
    db: tauri::State<'_, Db>,
    project_id: Uuid,
    as_of: String,
) -> Result<Vec<CertificateDifference>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .pending_adjustment_differences(project_id, &as_of)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn certification_overview(
    db: tauri::State<'_, Db>,
    project_id: Uuid,
    estimate_id: Uuid,
    as_of: String,
) -> Result<Vec<CertificationOverview>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .certification_overview(project_id, estimate_id, &as_of)
        .map_err(|e| e.to_string())
}
