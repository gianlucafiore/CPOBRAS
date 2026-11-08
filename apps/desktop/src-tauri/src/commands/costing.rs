use crate::Db;
use cpobras_core::costing::{CostResult, FxQuote, NestedAnalysis};
use cpobras_storage::advanced_costing::{PriceList, ScopedPrice, StoredFxQuote};
use rust_decimal::Decimal;
use std::collections::BTreeMap;
use uuid::Uuid;
#[tauri::command]
pub(crate) fn list_price_lists(db: tauri::State<'_, Db>) -> Result<Vec<PriceList>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .price_lists()
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn create_price_list(db: tauri::State<'_, Db>, list: PriceList) -> Result<(), String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .create_price_list(&list)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn register_scoped_price(
    db: tauri::State<'_, Db>,
    price: ScopedPrice,
) -> Result<(), String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .register_scoped_price(&price)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn scoped_price_history(
    db: tauri::State<'_, Db>,
    list_id: String,
    resource_id: String,
) -> Result<Vec<ScopedPrice>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .scoped_price_history(
            Uuid::parse_str(&list_id).map_err(|e| e.to_string())?,
            Uuid::parse_str(&resource_id).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn list_nested_analyses(
    db: tauri::State<'_, Db>,
) -> Result<Vec<NestedAnalysis>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .nested_analyses()
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn save_nested_analysis(
    db: tauri::State<'_, Db>,
    mut analysis: NestedAnalysis,
) -> Result<(), String> {
    let mut store = db.lock().map_err(|e| e.to_string())?;
    if analysis.code.trim().is_empty() {
        analysis.code = store
            .automatic_code("analysis")
            .map_err(|e| e.to_string())?;
    }
    store
        .save_nested_analysis(&analysis)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn calculate_nested_cost(
    db: tauri::State<'_, Db>,
    analysis_id: String,
    list_id: String,
    as_of: String,
    changes: BTreeMap<Uuid, Decimal>,
) -> Result<CostResult, String> {
    let library = db
        .lock()
        .map_err(|e| e.to_string())?
        .cost_library(
            Uuid::parse_str(&list_id).map_err(|e| e.to_string())?,
            &as_of,
        )
        .map_err(|e| e.to_string())?;
    library.sensitivity(
        Uuid::parse_str(&analysis_id).map_err(|e| e.to_string())?,
        &changes,
    )
}
#[tauri::command]
pub(crate) fn save_fx_quote(db: tauri::State<'_, Db>, quote: FxQuote) -> Result<String, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .save_fx_quote(&quote)
        .map(|id| id.to_string())
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn list_fx_quotes(db: tauri::State<'_, Db>) -> Result<Vec<StoredFxQuote>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .fx_quotes()
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn convert_currency(
    db: tauri::State<'_, Db>,
    quote_id: String,
    amount: String,
) -> Result<String, String> {
    let id = Uuid::parse_str(&quote_id).map_err(|e| e.to_string())?;
    let store = db.lock().map_err(|e| e.to_string())?;
    let saved = store
        .fx_quotes()
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|q| q.id == id)
        .ok_or("Cotización inexistente")?;
    saved
        .quote
        .convert(
            amount.parse().map_err(|_| "Importe inválido")?,
            &saved.quote.from,
            &saved.quote.to,
        )
        .map(|value| value.to_string())
}
#[tauri::command]
pub(crate) fn reprice_analysis_selective(
    db: tauri::State<'_, Db>,
    analysis_id: String,
    list_id: String,
    as_of: String,
    resource_ids: Vec<String>,
) -> Result<(), String> {
    let mut store = db.lock().map_err(|e| e.to_string())?;
    let list_id = Uuid::parse_str(&list_id).map_err(|e| e.to_string())?;
    let lists = store.price_lists().map_err(|e| e.to_string())?;
    if !lists
        .iter()
        .any(|list| list.id == list_id && list.currency == "ARS")
    {
        return Err("El ACU base usa ARS; seleccioná una lista ARS".into());
    }
    let library = store
        .cost_library(list_id, &as_of)
        .map_err(|e| e.to_string())?;
    let mut analysis = store
        .get_analysis(Uuid::parse_str(&analysis_id).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?
        .ok_or("ACU inexistente")?;
    let ids: Vec<Uuid> = resource_ids
        .iter()
        .map(|id| Uuid::parse_str(id))
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;
    for component in &mut analysis.components {
        if ids.is_empty() || ids.contains(&component.resource_id) {
            component.unit_price = *library
                .prices
                .get(&component.resource_id)
                .ok_or("Falta precio vigente en la lista")?;
        }
    }
    store.save_analysis(&analysis).map_err(|e| e.to_string())
}
