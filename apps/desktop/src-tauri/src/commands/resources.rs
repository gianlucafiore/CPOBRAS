use crate::Db;
use cpobras_core::{Currency, ResourceKind};
use cpobras_storage::resource_catalog::{Resource, ResourcePrice};
use rust_decimal::Decimal;
use std::str::FromStr;
use uuid::Uuid;

#[derive(serde::Serialize)]
pub(crate) struct PriceHistoryView {
    id: String,
    amount: String,
    currency: String,
    effective_date: String,
    source: Option<String>,
}

pub(crate) fn history_view(price: ResourcePrice) -> PriceHistoryView {
    PriceHistoryView {
        id: price.id.to_string(),
        amount: price.amount.to_string(),
        currency: match price.currency {
            Currency::Ars => "ARS".into(),
            Currency::Usd => "USD".into(),
        },
        effective_date: price.effective_date,
        source: price.source,
    }
}

#[tauri::command]
pub(crate) fn list_price_history(
    db: tauri::State<'_, Db>,
    resource_id: String,
) -> Result<Vec<PriceHistoryView>, String> {
    let id = Uuid::parse_str(&resource_id).map_err(|e| e.to_string())?;
    let store = db.lock().map_err(|e| e.to_string())?;
    if store.get_resource(id).map_err(|e| e.to_string())?.is_none() {
        return Err("Insumo inexistente".into());
    }
    store
        .resource_price_history(id)
        .map_err(|e| e.to_string())
        .map(|prices| prices.into_iter().map(history_view).collect())
}

#[tauri::command]
pub(crate) fn register_resource_price(
    db: tauri::State<'_, Db>,
    resource_id: String,
    amount: String,
    currency: String,
    effective_date: String,
    source: Option<String>,
) -> Result<PriceHistoryView, String> {
    let id = Uuid::parse_str(&resource_id).map_err(|e| e.to_string())?;
    let amount = Decimal::from_str(&amount.replace(',', ".")).map_err(|e| e.to_string())?;
    let currency = match currency.as_str() {
        "ARS" => Currency::Ars,
        "USD" => Currency::Usd,
        _ => return Err("Moneda inválida".into()),
    };
    let mut store = db.lock().map_err(|e| e.to_string())?;
    if store.get_resource(id).map_err(|e| e.to_string())?.is_none() {
        return Err("Insumo inexistente".into());
    }
    let price = ResourcePrice {
        id: Uuid::new_v4(),
        resource_id: id,
        amount,
        currency,
        effective_date,
        source: source.filter(|value| !value.trim().is_empty()),
    };
    store
        .add_resource_price(&price)
        .map_err(|e| e.to_string())?;
    Ok(history_view(price))
}

#[derive(serde::Serialize)]
pub(crate) struct ResourceView {
    id: String,
    code: String,
    description: String,
    unit: String,
    kind: String,
    price: Option<String>,
    active: bool,
}

pub(crate) fn resource_kind(value: &str) -> Result<ResourceKind, String> {
    match value {
        "material" => Ok(ResourceKind::Material),
        "labor" => Ok(ResourceKind::Labor),
        "equipment" => Ok(ResourceKind::Equipment),
        "subcontract" => Ok(ResourceKind::Subcontract),
        _ => Err("Tipo de insumo inválido".into()),
    }
}

pub(crate) fn resource_view(resource: Resource, price: Option<String>) -> ResourceView {
    ResourceView {
        id: resource.id.to_string(),
        code: resource.code,
        description: resource.description,
        unit: resource.unit,
        kind: match resource.kind {
            ResourceKind::Material => "material",
            ResourceKind::Labor => "labor",
            ResourceKind::Equipment => "equipment",
            ResourceKind::Subcontract => "subcontract",
        }
        .to_owned(),
        price,
        active: resource.active,
    }
}

#[tauri::command]
pub(crate) fn list_resources(db: tauri::State<'_, Db>) -> Result<Vec<ResourceView>, String> {
    let store = db.lock().map_err(|e| e.to_string())?;
    let resources = store.list_resources().map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    for resource in resources {
        let price = store
            .resource_price_as_of(resource.id, Currency::Ars, "9999-12-31")
            .map_err(|e| e.to_string())?
            .map(|p| p.amount.to_string());
        result.push(resource_view(resource, price));
    }
    Ok(result)
}

#[tauri::command]
pub(crate) fn create_resource(
    db: tauri::State<'_, Db>,
    code: String,
    description: String,
    unit: String,
    kind: String,
    price: String,
    effective_date: String,
    source: Option<String>,
) -> Result<ResourceView, String> {
    let kind = resource_kind(&kind)?;
    let amount = Decimal::from_str(&price.replace(',', ".")).map_err(|e| e.to_string())?;
    if amount < Decimal::ZERO {
        return Err("El precio no puede ser negativo".into());
    }
    let mut store = db.lock().map_err(|e| e.to_string())?;
    let code = if code.trim().is_empty() {
        store
            .automatic_code("resource")
            .map_err(|e| e.to_string())?
    } else {
        code
    };
    let resource = Resource {
        id: Uuid::new_v4(),
        code: code.trim().to_owned(),
        description: description.trim().to_owned(),
        unit: unit.trim().to_owned(),
        kind,
        active: true,
    };
    let price_entry = ResourcePrice {
        id: Uuid::new_v4(),
        resource_id: resource.id,
        amount,
        currency: Currency::Ars,
        effective_date,
        source,
    };
    store
        .create_resource_with_initial_price(&resource, &price_entry)
        .map_err(|e| e.to_string())?;
    Ok(resource_view(resource, Some(amount.to_string())))
}

#[tauri::command]
pub(crate) fn update_resource(
    db: tauri::State<'_, Db>,
    resource_id: String,
    code: String,
    description: String,
    unit: String,
    kind: String,
    active: bool,
) -> Result<ResourceView, String> {
    let id = Uuid::parse_str(&resource_id).map_err(|e| e.to_string())?;
    let mut store = db.lock().map_err(|e| e.to_string())?;
    let mut resource = store
        .get_resource(id)
        .map_err(|e| e.to_string())?
        .ok_or("Insumo inexistente")?;
    resource.code = code.trim().into();
    resource.description = description.trim().into();
    resource.unit = unit.trim().into();
    resource.kind = resource_kind(&kind)?;
    resource.active = active;
    store.save_resource(&resource).map_err(|e| e.to_string())?;
    let price = store
        .resource_price_as_of(id, Currency::Ars, "9999-12-31")
        .map_err(|e| e.to_string())?
        .map(|price| price.amount.to_string());
    Ok(resource_view(resource, price))
}

#[tauri::command]
pub(crate) fn import_resources(
    db: tauri::State<'_, Db>,
    rows: Vec<cpobras_storage::resource_import::ResourceImportRow>,
    effective_date: String,
    source: String,
) -> Result<cpobras_storage::resource_import::ResourceImportResult, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .import_resources(&rows, &effective_date, &source)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn set_entity_archived(
    db: tauri::State<'_, Db>,
    kind: String,
    id: Uuid,
    archived: bool,
) -> Result<(), String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .set_entity_archived(&kind, id, archived)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn delete_unused_person(db: tauri::State<'_, Db>, id: Uuid) -> Result<(), String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .delete_unused_person(id)
        .map_err(|e| e.to_string())
}
