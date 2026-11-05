use crate::Db;
use cpobras_core::{Currency, ResourceKind, ResourcePriceSnapshot, UnitCostAnalysis};
use rust_decimal::Decimal;
use std::str::FromStr;
use uuid::Uuid;

#[derive(serde::Serialize)]
pub(crate) struct AnalysisComponentView {
    resource_id: String,
    description: String,
    kind: String,
    quantity: String,
    unit_price: String,
    total: String,
}

#[derive(serde::Serialize)]
pub(crate) struct AnalysisDetailView {
    is_line_owned: bool,
    code: String,
    description: String,
    unit: String,
    unit_cost: String,
    components: Vec<AnalysisComponentView>,
}

#[tauri::command]
pub(crate) fn get_analysis_details(
    db: tauri::State<'_, Db>,
    analysis_id: String,
) -> Result<AnalysisDetailView, String> {
    let id = Uuid::parse_str(&analysis_id).map_err(|e| e.to_string())?;
    let store = db.lock().map_err(|e| e.to_string())?;
    let analysis = store
        .get_analysis(id)
        .map_err(|e| e.to_string())?
        .ok_or("ACU inexistente")?;
    let unit_cost = analysis.direct_unit_cost().map_err(|e| e.to_string())?;
    let components = analysis
        .components
        .into_iter()
        .map(|component| AnalysisComponentView {
            resource_id: component.resource_id.to_string(),
            description: component.description,
            kind: match component.kind {
                ResourceKind::Material => "material",
                ResourceKind::Labor => "labor",
                ResourceKind::Equipment => "equipment",
                ResourceKind::Subcontract => "subcontract",
            }
            .to_owned(),
            total: (component.quantity_per_unit * component.unit_price).to_string(),
            quantity: component.quantity_per_unit.to_string(),
            unit_price: component.unit_price.to_string(),
        })
        .collect();
    Ok(AnalysisDetailView {
        is_line_owned: store.is_line_analysis(id).map_err(|e| e.to_string())?,
        code: analysis.code,
        description: analysis.description,
        unit: analysis.unit,
        unit_cost: unit_cost.to_string(),
        components,
    })
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ScenarioComponentInput {
    resource_id: String,
    quantity: String,
}

#[derive(serde::Serialize)]
pub(crate) struct ContractingComparisonView {
    own_cost_per_unit: String,
    subcontract_cost_per_unit: String,
    subcontract_premium_per_unit: String,
    quantity: String,
    own_total: String,
    subcontract_total: String,
    difference_total: String,
}

#[tauri::command]
pub(crate) fn compare_contracting(
    db: tauri::State<'_, Db>,
    own_components: Vec<ScenarioComponentInput>,
    own_extra_per_unit: String,
    subcontract_price_per_unit: String,
    quantity: String,
) -> Result<ContractingComparisonView, String> {
    use cpobras_core::contracting::{
        compare_contracting_modes, quoted_subcontract, ContractingScenario,
    };
    let parse =
        |value: String| Decimal::from_str(&value.replace(',', ".")).map_err(|err| err.to_string());
    let quantity = parse(quantity)?;
    let store = db.lock().map_err(|err| err.to_string())?;
    let mut components = Vec::new();
    for input in own_components {
        let resource_id = Uuid::parse_str(&input.resource_id).map_err(|err| err.to_string())?;
        let quantity_per_unit = parse(input.quantity)?;
        let resource = store
            .get_resource(resource_id)
            .map_err(|err| err.to_string())?
            .ok_or("Insumo inexistente")?;
        let price = store
            .resource_price_as_of(resource_id, Currency::Ars, "9999-12-31")
            .map_err(|err| err.to_string())?
            .ok_or("Falta precio ARS del insumo")?;
        components.push(ResourcePriceSnapshot {
            resource_id,
            description: resource.description,
            kind: resource.kind,
            quantity_per_unit,
            unit_price: price.amount,
        });
    }
    let own = ContractingScenario {
        name: "Ejecución propia".into(),
        components,
        additional_cost_per_unit: parse(own_extra_per_unit)?,
    };
    let subcontract = quoted_subcontract(
        "Subcontratación",
        Uuid::nil(),
        parse(subcontract_price_per_unit)?,
    );
    let result =
        compare_contracting_modes(&own, &subcontract, quantity).map_err(|err| err.to_string())?;
    Ok(ContractingComparisonView {
        own_cost_per_unit: result.own_cost_per_unit.to_string(),
        subcontract_cost_per_unit: result.subcontract_cost_per_unit.to_string(),
        subcontract_premium_per_unit: result.subcontract_premium_per_unit.to_string(),
        quantity: result.quantity.to_string(),
        own_total: result.own_total.to_string(),
        subcontract_total: result.subcontract_total.to_string(),
        difference_total: result.difference_total.to_string(),
    })
}

#[derive(serde::Serialize)]
pub(crate) struct AnalysisBreakdownView {
    materials: String,
    labor: String,
    equipment: String,
    subcontract: String,
    total: String,
}

#[tauri::command]
pub(crate) fn analysis_cost_breakdown(
    db: tauri::State<'_, Db>,
    analysis_id: String,
) -> Result<AnalysisBreakdownView, String> {
    let id = Uuid::parse_str(&analysis_id).map_err(|e| e.to_string())?;
    let store = db.lock().map_err(|e| e.to_string())?;
    let analysis = store
        .get_analysis(id)
        .map_err(|e| e.to_string())?
        .ok_or("ACU inexistente")?;
    let costs = analysis.cost_breakdown().map_err(|e| e.to_string())?;
    Ok(AnalysisBreakdownView {
        materials: costs.materials.to_string(),
        labor: costs.labor.to_string(),
        equipment: costs.equipment.to_string(),
        subcontract: costs.subcontract.to_string(),
        total: costs.total.to_string(),
    })
}

#[tauri::command]
pub(crate) fn reprice_analysis(
    db: tauri::State<'_, Db>,
    analysis_id: String,
    effective_date: String,
) -> Result<AnalysisView, String> {
    let id = Uuid::parse_str(&analysis_id).map_err(|e| e.to_string())?;
    let mut store = db.lock().map_err(|e| e.to_string())?;
    let analysis = store
        .reprice_analysis_at(id, &effective_date)
        .map_err(|e| e.to_string())?;
    analysis_view(analysis)
}

#[derive(serde::Serialize)]
pub(crate) struct AnalysisView {
    id: String,
    code: String,
    description: String,
    unit: String,
    unit_cost: String,
}

pub(crate) fn analysis_view(analysis: UnitCostAnalysis) -> Result<AnalysisView, String> {
    let cost = analysis.direct_unit_cost().map_err(|e| e.to_string())?;
    Ok(AnalysisView {
        id: analysis.id.to_string(),
        code: analysis.code,
        description: analysis.description,
        unit: analysis.unit,
        unit_cost: cost.to_string(),
    })
}

#[tauri::command]
pub(crate) fn list_analyses(db: tauri::State<'_, Db>) -> Result<Vec<AnalysisView>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .list_analyses()
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(analysis_view)
        .collect()
}

#[tauri::command]
pub(crate) fn create_analysis(
    db: tauri::State<'_, Db>,
    code: String,
    description: String,
    unit: String,
    components: Vec<AnalysisComponentInput>,
) -> Result<AnalysisView, String> {
    if code.trim().is_empty()
        || description.trim().is_empty()
        || unit.trim().is_empty()
        || components.is_empty()
    {
        return Err("Completá los datos y al menos un componente".into());
    }
    let mut store = db.lock().map_err(|e| e.to_string())?;
    let mut snapshots = Vec::new();
    for component in components {
        let id = Uuid::parse_str(&component.resource_id).map_err(|e| e.to_string())?;
        let quantity =
            Decimal::from_str(&component.quantity.replace(',', ".")).map_err(|e| e.to_string())?;
        let resource = store
            .get_resource(id)
            .map_err(|e| e.to_string())?
            .ok_or("Insumo inexistente")?;
        let unit_price = if let Some(value) = component.unit_price {
            Decimal::from_str(&value.replace(',', ".")).map_err(|e| e.to_string())?
        } else {
            store
                .resource_price_as_of(id, Currency::Ars, "9999-12-31")
                .map_err(|e| e.to_string())?
                .ok_or("Insumo sin precio en ARS")?
                .amount
        };
        snapshots.push(ResourcePriceSnapshot {
            resource_id: id,
            description: resource.description,
            kind: resource.kind,
            quantity_per_unit: quantity,
            unit_price,
        });
    }
    let analysis = UnitCostAnalysis {
        id: Uuid::new_v4(),
        code: code.trim().to_owned(),
        description: description.trim().to_owned(),
        unit: unit.trim().to_owned(),
        components: snapshots,
    };
    let view = analysis_view(analysis.clone())?;
    store.save_analysis(&analysis).map_err(|e| e.to_string())?;
    Ok(view)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EditedAnalysisComponent {
    resource_id: String,
    quantity: String,
    unit_price: String,
}

#[tauri::command]
pub(crate) fn update_analysis(
    db: tauri::State<'_, Db>,
    analysis_id: String,
    code: String,
    description: String,
    unit: String,
    components: Vec<EditedAnalysisComponent>,
) -> Result<AnalysisView, String> {
    let id = Uuid::parse_str(&analysis_id).map_err(|e| e.to_string())?;
    if components.is_empty()
        || code.trim().is_empty()
        || description.trim().is_empty()
        || unit.trim().is_empty()
    {
        return Err("El ACU requiere datos completos y al menos un insumo".into());
    }
    let mut store = db.lock().map_err(|e| e.to_string())?;
    if store.get_analysis(id).map_err(|e| e.to_string())?.is_none() {
        return Err("ACU inexistente".into());
    }
    let mut snapshots = Vec::new();
    for component in components {
        let resource_id = Uuid::parse_str(&component.resource_id).map_err(|e| e.to_string())?;
        let quantity =
            Decimal::from_str(&component.quantity.replace(',', ".")).map_err(|e| e.to_string())?;
        let price = Decimal::from_str(&component.unit_price.replace(',', "."))
            .map_err(|e| e.to_string())?;
        let resource = store
            .get_resource(resource_id)
            .map_err(|e| e.to_string())?
            .ok_or("Insumo inexistente")?;
        if quantity < Decimal::ZERO || price < Decimal::ZERO {
            return Err("Los rendimientos y precios deben ser positivos o cero".into());
        }
        snapshots.push(ResourcePriceSnapshot {
            resource_id,
            description: resource.description,
            kind: resource.kind,
            quantity_per_unit: quantity,
            unit_price: price,
        });
    }
    let analysis = UnitCostAnalysis {
        id,
        code: code.trim().into(),
        description: description.trim().into(),
        unit: unit.trim().into(),
        components: snapshots,
    };
    let result = analysis_view(analysis.clone())?;
    store.save_analysis(&analysis).map_err(|e| e.to_string())?;
    Ok(result)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AnalysisComponentInput {
    resource_id: String,
    quantity: String,
    unit_price: Option<String>,
}
