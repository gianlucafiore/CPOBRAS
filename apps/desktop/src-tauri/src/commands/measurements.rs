use crate::Db;
use rust_decimal::Decimal;
use std::str::FromStr;
use uuid::Uuid;

#[derive(serde::Serialize)]
pub(crate) struct TakeoffView {
    id: String,
    estimate_id: String,
    line_id: String,
    note: String,
    factor: String,
    length: String,
    width: String,
    height: String,
    sign: i64,
    position: i64,
    quantity: String,
}

pub(crate) fn takeoff_view(
    row: cpobras_storage::takeoffs::TakeoffRow,
) -> Result<TakeoffView, String> {
    let quantity = row.measured_quantity().map_err(|e| e.to_string())?;
    Ok(TakeoffView {
        id: row.id.to_string(),
        estimate_id: row.estimate_id.to_string(),
        line_id: row.line_id.to_string(),
        note: row.note,
        factor: row.factor.to_string(),
        length: row.length.to_string(),
        width: row.width.to_string(),
        height: row.height.to_string(),
        sign: row.sign,
        position: row.position,
        quantity: quantity.to_string(),
    })
}

#[tauri::command]
pub(crate) fn save_takeoff(
    db: tauri::State<'_, Db>,
    id: Option<String>,
    estimate_id: String,
    line_id: String,
    note: String,
    factor: String,
    length: String,
    width: String,
    height: String,
    sign: i64,
    position: i64,
) -> Result<TakeoffView, String> {
    let parse = |number: String| {
        Decimal::from_str(&number.replace(',', ".")).map_err(|error| error.to_string())
    };
    let row = cpobras_storage::takeoffs::TakeoffRow {
        id: id
            .map(|value| Uuid::parse_str(&value))
            .transpose()
            .map_err(|e| e.to_string())?
            .unwrap_or_else(Uuid::new_v4),
        estimate_id: Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?,
        line_id: Uuid::parse_str(&line_id).map_err(|e| e.to_string())?,
        note,
        factor: parse(factor)?,
        length: parse(length)?,
        width: parse(width)?,
        height: parse(height)?,
        sign,
        position,
    };
    let result = takeoff_view(row.clone())?;
    db.lock()
        .map_err(|e| e.to_string())?
        .save_takeoff_row(&row)
        .map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub(crate) fn list_takeoffs(
    db: tauri::State<'_, Db>,
    estimate_id: String,
    line_id: String,
) -> Result<Vec<TakeoffView>, String> {
    let estimate_id = Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?;
    let line_id = Uuid::parse_str(&line_id).map_err(|e| e.to_string())?;
    let rows = db
        .lock()
        .map_err(|e| e.to_string())?
        .list_takeoff_rows(estimate_id, line_id)
        .map_err(|e| e.to_string())?;
    rows.into_iter().map(takeoff_view).collect()
}

#[tauri::command]
pub(crate) fn apply_takeoff(
    db: tauri::State<'_, Db>,
    estimate_id: String,
    line_id: String,
) -> Result<String, String> {
    let estimate_id = Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?;
    let line_id = Uuid::parse_str(&line_id).map_err(|e| e.to_string())?;
    db.lock()
        .map_err(|e| e.to_string())?
        .apply_takeoff_to_line(estimate_id, line_id)
        .map(|value| value.to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn delete_takeoff(db: tauri::State<'_, Db>, id: String) -> Result<(), String> {
    let id = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    db.lock()
        .map_err(|e| e.to_string())?
        .delete_takeoff_row(id)
        .map_err(|e| e.to_string())
}
