use crate::Db;
use cpobras_core::price_determination::{PriceDefinition, PriceResult};
use cpobras_storage::price_determination::{PriceTemplate, SavedPriceDefinition};
use uuid::Uuid;
#[tauri::command]
pub(crate) fn get_price_definition(
    db: tauri::State<'_, Db>,
    estimate_id: Uuid,
) -> Result<SavedPriceDefinition, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .get_price_definition(estimate_id)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn calculate_price_definition(
    db: tauri::State<'_, Db>,
    estimate_id: Uuid,
    definition: PriceDefinition,
) -> Result<PriceResult, String> {
    let store = db.lock().map_err(|e| e.to_string())?;
    if store
        .get_estimate(estimate_id)
        .map_err(|e| e.to_string())?
        .is_none()
    {
        return Err("Presupuesto inexistente".into());
    }
    definition.calculate(
        store
            .estimate_total(estimate_id)
            .map_err(|e| e.to_string())?,
    )
}
#[tauri::command]
pub(crate) fn save_price_definition(
    db: tauri::State<'_, Db>,
    estimate_id: Uuid,
    revision: u32,
    definition: PriceDefinition,
) -> Result<SavedPriceDefinition, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .save_price_definition(estimate_id, revision, &definition)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn list_price_templates(db: tauri::State<'_, Db>) -> Result<Vec<PriceTemplate>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .price_templates()
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn save_price_template(
    db: tauri::State<'_, Db>,
    name: String,
    currency: String,
    scope: String,
    definition: PriceDefinition,
) -> Result<PriceTemplate, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .save_price_template(&name, &currency, &scope, &definition)
        .map_err(|e| e.to_string())
}
