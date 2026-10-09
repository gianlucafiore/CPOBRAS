use cpobras_core::{
    Client, Currency, PricingRates, Project, ResourceKind, ResourcePriceSnapshot, UnitCostAnalysis,
};
use cpobras_storage::budget_sections::BudgetSection;
use cpobras_storage::resource_catalog::{Resource, ResourcePrice};
use cpobras_storage::{
    estimates::{Estimate, EstimateItem},
    LocalStore,
};
use rust_decimal::Decimal;
use std::str::FromStr;
use std::sync::Mutex;
use tauri::Manager;
use uuid::Uuid;

type Db = Mutex<LocalStore>;

#[derive(serde::Serialize)]
struct EstimateComparisonLineView {
    description: String,
    unit: String,
    baseline_quantity: String,
    revised_quantity: String,
    baseline_cost: String,
    revised_cost: String,
    difference: String,
}

#[derive(serde::Serialize)]
struct EstimateComparisonView {
    baseline_id: String,
    revised_id: String,
    baseline_total: String,
    revised_total: String,
    difference: String,
    lines: Vec<EstimateComparisonLineView>,
}

#[tauri::command]
fn compare_estimates(
    db: tauri::State<'_, Db>,
    baseline_id: String,
    revised_id: String,
) -> Result<EstimateComparisonView, String> {
    let baseline_id = Uuid::parse_str(&baseline_id).map_err(|e| e.to_string())?;
    let revised_id = Uuid::parse_str(&revised_id).map_err(|e| e.to_string())?;
    let delta = db
        .lock()
        .map_err(|e| e.to_string())?
        .compare_estimates(baseline_id, revised_id)
        .map_err(|e| e.to_string())?;
    Ok(EstimateComparisonView {
        baseline_id: delta.baseline_id.to_string(),
        revised_id: delta.revised_id.to_string(),
        baseline_total: delta.baseline_total.to_string(),
        revised_total: delta.revised_total.to_string(),
        difference: delta.difference.to_string(),
        lines: delta
            .lines
            .into_iter()
            .map(|line| EstimateComparisonLineView {
                description: line.description,
                unit: line.unit,
                baseline_quantity: line.baseline_quantity.to_string(),
                revised_quantity: line.revised_quantity.to_string(),
                baseline_cost: line.baseline_cost.to_string(),
                revised_cost: line.revised_cost.to_string(),
                difference: line.difference.to_string(),
            })
            .collect(),
    })
}

#[derive(serde::Serialize)]
struct PricingView {
    direct: String,
    general_expenses: String,
    profit: String,
    discount: String,
    taxable_subtotal: String,
    taxes: String,
    total: String,
}

#[derive(serde::Serialize)]
struct PricingRatesView {
    general_expenses_percent: String,
    profit_percent: String,
    discount_percent: String,
    tax_percent: String,
}

fn pricing_rates_view(rates: PricingRates) -> PricingRatesView {
    PricingRatesView {
        general_expenses_percent: rates.general_expenses_percent.to_string(),
        profit_percent: rates.profit_percent.to_string(),
        discount_percent: rates.discount_percent.to_string(),
        tax_percent: rates.tax_percent.to_string(),
    }
}

#[tauri::command]
fn get_estimate_pricing(
    db: tauri::State<'_, Db>,
    estimate_id: String,
) -> Result<PricingRatesView, String> {
    let id = Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?;
    let store = db.lock().map_err(|e| e.to_string())?;
    if store.get_estimate(id).map_err(|e| e.to_string())?.is_none() {
        return Err("Presupuesto inexistente".into());
    }
    let rates = store.get_estimate_pricing(id).map_err(|e| e.to_string())?;
    Ok(pricing_rates_view(rates))
}

#[tauri::command]
fn save_estimate_pricing(
    db: tauri::State<'_, Db>,
    estimate_id: String,
    general_expenses_percent: String,
    profit_percent: String,
    discount_percent: String,
    tax_percent: String,
) -> Result<PricingRatesView, String> {
    let id = Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?;
    let parse =
        |value: String| Decimal::from_str(&value.replace(',', ".")).map_err(|e| e.to_string());
    let rates = PricingRates {
        general_expenses_percent: parse(general_expenses_percent)?,
        profit_percent: parse(profit_percent)?,
        discount_percent: parse(discount_percent)?,
        tax_percent: parse(tax_percent)?,
    };
    db.lock()
        .map_err(|e| e.to_string())?
        .save_estimate_pricing(id, rates)
        .map_err(|e| e.to_string())?;
    Ok(pricing_rates_view(rates))
}

#[tauri::command]
fn priced_estimate_total(
    db: tauri::State<'_, Db>,
    estimate_id: String,
) -> Result<PricingView, String> {
    let id = Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?;
    let priced = db
        .lock()
        .map_err(|e| e.to_string())?
        .priced_estimate_total(id)
        .map_err(|e| e.to_string())?;
    Ok(PricingView {
        direct: priced.direct.to_string(),
        general_expenses: priced.general_expenses.to_string(),
        profit: priced.profit.to_string(),
        discount: priced.discount.to_string(),
        taxable_subtotal: priced.taxable_subtotal.to_string(),
        taxes: priced.taxes.to_string(),
        total: priced.total.to_string(),
    })
}

#[derive(serde::Serialize)]
struct AnalysisBreakdownView {
    materials: String,
    labor: String,
    equipment: String,
    subcontract: String,
    total: String,
}

#[tauri::command]
fn analysis_cost_breakdown(
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
fn list_clients(db: tauri::State<'_, Db>) -> Result<Vec<Client>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .list_clients()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn create_client(
    db: tauri::State<'_, Db>,
    client_name: String,
    cuit: Option<String>,
) -> Result<Client, String> {
    if client_name.trim().is_empty() {
        return Err("El nombre es obligatorio".into());
    }
    let client = Client {
        id: Uuid::new_v4(),
        name: client_name.trim().to_owned(),
        cuit: cuit.filter(|value| !value.trim().is_empty()),
    };
    db.lock()
        .map_err(|e| e.to_string())?
        .save_client(&client)
        .map_err(|e| e.to_string())?;
    Ok(client)
}

#[derive(serde::Serialize)]
struct PriceHistoryView {
    id: String,
    amount: String,
    currency: String,
    effective_date: String,
    source: Option<String>,
}

fn history_view(price: ResourcePrice) -> PriceHistoryView {
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
fn list_price_history(
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
fn register_resource_price(
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

#[tauri::command]
fn reprice_analysis(
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
struct BudgetSectionView {
    id: String,
    estimate_id: String,
    parent_id: Option<String>,
    code: String,
    title: String,
    position: i64,
}

impl From<BudgetSection> for BudgetSectionView {
    fn from(section: BudgetSection) -> Self {
        Self {
            id: section.id.to_string(),
            estimate_id: section.estimate_id.to_string(),
            parent_id: section.parent_id.map(|id| id.to_string()),
            code: section.code,
            title: section.title,
            position: section.position,
        }
    }
}

#[tauri::command]
fn save_budget_section(
    db: tauri::State<'_, Db>,
    id: Option<String>,
    estimate_id: String,
    parent_id: Option<String>,
    code: String,
    title: String,
    position: i64,
) -> Result<BudgetSectionView, String> {
    let section = BudgetSection {
        id: match id {
            Some(id) => Uuid::parse_str(&id).map_err(|e| e.to_string())?,
            None => Uuid::new_v4(),
        },
        estimate_id: Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?,
        parent_id: parent_id
            .map(|id| Uuid::parse_str(&id))
            .transpose()
            .map_err(|e| e.to_string())?,
        code,
        title,
        position,
    };
    db.lock()
        .map_err(|e| e.to_string())?
        .save_budget_section(&section)
        .map_err(|e| e.to_string())?;
    Ok(BudgetSectionView::from(section))
}

#[tauri::command]
fn list_budget_sections(
    db: tauri::State<'_, Db>,
    estimate_id: String,
) -> Result<Vec<BudgetSectionView>, String> {
    let id = Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?;
    db.lock()
        .map_err(|e| e.to_string())?
        .list_budget_sections(id)
        .map_err(|e| e.to_string())
        .map(|sections| sections.into_iter().map(BudgetSectionView::from).collect())
}

#[tauri::command]
fn assign_line_section(
    db: tauri::State<'_, Db>,
    estimate_id: String,
    line_id: String,
    section_id: String,
) -> Result<(), String> {
    let estimate_id = Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?;
    let line_id = Uuid::parse_str(&line_id).map_err(|e| e.to_string())?;
    let section_id = Uuid::parse_str(&section_id).map_err(|e| e.to_string())?;
    db.lock()
        .map_err(|e| e.to_string())?
        .assign_line_section(estimate_id, line_id, section_id)
        .map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
struct ResourceView {
    id: String,
    code: String,
    description: String,
    unit: String,
    kind: String,
    price: Option<String>,
}

fn resource_kind(value: &str) -> Result<ResourceKind, String> {
    match value {
        "material" => Ok(ResourceKind::Material),
        "labor" => Ok(ResourceKind::Labor),
        "equipment" => Ok(ResourceKind::Equipment),
        "subcontract" => Ok(ResourceKind::Subcontract),
        _ => Err("Tipo de insumo inválido".into()),
    }
}

fn resource_view(resource: Resource, price: Option<String>) -> ResourceView {
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
    }
}

#[tauri::command]
fn list_resources(db: tauri::State<'_, Db>) -> Result<Vec<ResourceView>, String> {
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
fn create_resource(
    db: tauri::State<'_, Db>,
    code: String,
    description: String,
    unit: String,
    kind: String,
    price: String,
) -> Result<ResourceView, String> {
    let kind = resource_kind(&kind)?;
    let amount = Decimal::from_str(&price.replace(',', ".")).map_err(|e| e.to_string())?;
    if amount < Decimal::ZERO {
        return Err("El precio no puede ser negativo".into());
    }
    let resource = Resource {
        id: Uuid::new_v4(),
        code: code.trim().to_owned(),
        description: description.trim().to_owned(),
        unit: unit.trim().to_owned(),
        kind,
        active: true,
    };
    let mut store = db.lock().map_err(|e| e.to_string())?;
    store.save_resource(&resource).map_err(|e| e.to_string())?;
    let price_entry = ResourcePrice {
        id: Uuid::new_v4(),
        resource_id: resource.id,
        amount,
        currency: Currency::Ars,
        effective_date: "2026-10-09".into(),
        source: Some("Carga manual".into()),
    };
    store
        .add_resource_price(&price_entry)
        .map_err(|e| e.to_string())?;
    Ok(resource_view(resource, Some(amount.to_string())))
}

#[derive(serde::Serialize)]
struct AnalysisView {
    id: String,
    code: String,
    description: String,
    unit: String,
    unit_cost: String,
}

fn analysis_view(analysis: UnitCostAnalysis) -> Result<AnalysisView, String> {
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
fn list_analyses(db: tauri::State<'_, Db>) -> Result<Vec<AnalysisView>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .list_analyses()
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(analysis_view)
        .collect()
}

#[tauri::command]
fn create_analysis(
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
        let price = store
            .resource_price_as_of(id, Currency::Ars, "9999-12-31")
            .map_err(|e| e.to_string())?
            .ok_or("Insumo sin precio en ARS")?;
        snapshots.push(ResourcePriceSnapshot {
            resource_id: id,
            description: resource.description,
            kind: resource.kind,
            quantity_per_unit: quantity,
            unit_price: price.amount,
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
struct AnalysisComponentInput {
    resource_id: String,
    quantity: String,
}

#[tauri::command]
fn add_line_from_analysis(
    db: tauri::State<'_, Db>,
    estimate_id: String,
    analysis_id: String,
    quantity: String,
) -> Result<LineView, String> {
    let estimate_id = Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?;
    let analysis_id = Uuid::parse_str(&analysis_id).map_err(|e| e.to_string())?;
    let quantity = Decimal::from_str(&quantity.replace(',', ".")).map_err(|e| e.to_string())?;
    let mut store = db.lock().map_err(|e| e.to_string())?;
    let estimate = store
        .get_estimate(estimate_id)
        .map_err(|e| e.to_string())?
        .ok_or("Presupuesto inexistente")?;
    if estimate.issued {
        return Err("No se puede modificar un presupuesto emitido".into());
    }
    if estimate.currency != Currency::Ars {
        return Err("Los ACU actuales usan ARS. No se aplican a presupuestos USD".into());
    }
    let analysis = store
        .get_analysis(analysis_id)
        .map_err(|e| e.to_string())?
        .ok_or("ACU inexistente")?;
    let unit_cost_snapshot = analysis.direct_unit_cost().map_err(|e| e.to_string())?;
    let items = store
        .estimate_items(estimate_id)
        .map_err(|e| e.to_string())?;
    let item = EstimateItem {
        id: Uuid::new_v4(),
        estimate_id,
        position: items.last().map_or(0, |item| item.position + 1),
        analysis_id: Some(analysis_id),
        description: analysis.description,
        unit: analysis.unit,
        quantity,
        unit_cost_snapshot,
    };
    store.add_estimate_item(&item).map_err(|e| e.to_string())?;
    Ok(LineView::from(item))
}

#[derive(serde::Serialize)]
struct LineView {
    id: String,
    description: String,
    unit: String,
    quantity: String,
    unit_cost: String,
    total: String,
}

impl From<EstimateItem> for LineView {
    fn from(line: EstimateItem) -> Self {
        let total = line.total().to_string();
        Self {
            id: line.id.to_string(),
            description: line.description,
            unit: line.unit,
            quantity: line.quantity.to_string(),
            unit_cost: line.unit_cost_snapshot.to_string(),
            total,
        }
    }
}

#[tauri::command]
fn list_estimate_lines(
    db: tauri::State<'_, Db>,
    estimate_id: String,
) -> Result<Vec<LineView>, String> {
    let id = Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?;
    let store = db.lock().map_err(|e| e.to_string())?;
    if store.get_estimate(id).map_err(|e| e.to_string())?.is_none() {
        return Err("El presupuesto no existe".into());
    }
    let lines = store.estimate_items(id).map_err(|e| e.to_string())?;
    Ok(lines.into_iter().map(LineView::from).collect())
}

#[tauri::command]
fn add_estimate_line(
    db: tauri::State<'_, Db>,
    estimate_id: String,
    description: String,
    unit: String,
    quantity: String,
    unit_cost: String,
) -> Result<LineView, String> {
    let estimate_id = Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?;
    let quantity = Decimal::from_str(&quantity.replace(',', ".")).map_err(|e| e.to_string())?;
    let unit_cost_snapshot =
        Decimal::from_str(&unit_cost.replace(',', ".")).map_err(|e| e.to_string())?;
    let mut store = db.lock().map_err(|e| e.to_string())?;
    let estimate = store
        .get_estimate(estimate_id)
        .map_err(|e| e.to_string())?
        .ok_or("El presupuesto no existe")?;
    if estimate.issued {
        return Err("El presupuesto ya fue emitido".into());
    }
    let lines = store
        .estimate_items(estimate_id)
        .map_err(|e| e.to_string())?;
    let position = lines.last().map_or(0, |line| line.position + 1);
    let line = EstimateItem {
        id: Uuid::new_v4(),
        estimate_id,
        position,
        analysis_id: None,
        description: description.trim().to_owned(),
        unit: unit.trim().to_owned(),
        quantity,
        unit_cost_snapshot,
    };
    store.add_estimate_item(&line).map_err(|e| e.to_string())?;
    Ok(LineView::from(line))
}

#[tauri::command]
fn update_estimate_line(
    db: tauri::State<'_, Db>,
    estimate_id: String,
    line_id: String,
    description: String,
    unit: String,
    quantity: String,
    unit_cost: String,
) -> Result<LineView, String> {
    let estimate_id = Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?;
    let line_id = Uuid::parse_str(&line_id).map_err(|e| e.to_string())?;
    let quantity = Decimal::from_str(&quantity.replace(',', ".")).map_err(|e| e.to_string())?;
    let unit_cost_snapshot =
        Decimal::from_str(&unit_cost.replace(',', ".")).map_err(|e| e.to_string())?;
    let mut store = db.lock().map_err(|e| e.to_string())?;
    let mut line = store
        .estimate_items(estimate_id)
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|line| line.id == line_id)
        .ok_or("Partida inexistente")?;
    line.description = description.trim().to_owned();
    line.unit = unit.trim().to_owned();
    line.quantity = quantity;
    line.unit_cost_snapshot = unit_cost_snapshot;
    store
        .update_estimate_item(&line)
        .map_err(|e| e.to_string())?;
    Ok(LineView::from(line))
}

#[tauri::command]
fn delete_estimate_line(
    db: tauri::State<'_, Db>,
    estimate_id: String,
    line_id: String,
) -> Result<(), String> {
    let estimate_id = Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?;
    let line_id = Uuid::parse_str(&line_id).map_err(|e| e.to_string())?;
    db.lock()
        .map_err(|e| e.to_string())?
        .delete_estimate_item(estimate_id, line_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn estimate_total(db: tauri::State<'_, Db>, estimate_id: String) -> Result<String, String> {
    let estimate_id = Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?;
    let store = db.lock().map_err(|e| e.to_string())?;
    if store
        .get_estimate(estimate_id)
        .map_err(|e| e.to_string())?
        .is_none()
    {
        return Err("Presupuesto inexistente".into());
    }
    store
        .estimate_total(estimate_id)
        .map(|total| total.to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn duplicate_estimate(
    db: tauri::State<'_, Db>,
    estimate_id: String,
    title: String,
) -> Result<EstimateView, String> {
    let estimate_id = Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?;
    let result = db
        .lock()
        .map_err(|e| e.to_string())?
        .duplicate_estimate(estimate_id, &title)
        .map_err(|e| e.to_string())?;
    Ok(EstimateView::from(result))
}

#[tauri::command]
fn issue_estimate(db: tauri::State<'_, Db>, estimate_id: String) -> Result<(), String> {
    let id = Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?;
    db.lock()
        .map_err(|e| e.to_string())?
        .issue_estimate(id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn list_project_estimates(
    db: tauri::State<'_, Db>,
    project_id: String,
) -> Result<Vec<EstimateView>, String> {
    let id = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    let store = db.lock().map_err(|e| e.to_string())?;
    let entries = store
        .list_project_estimates(id)
        .map_err(|e| e.to_string())?;
    Ok(entries.into_iter().map(EstimateView::from).collect())
}

#[derive(serde::Serialize)]
struct EstimateView {
    id: String,
    title: String,
    currency: String,
    issued: bool,
}

impl From<Estimate> for EstimateView {
    fn from(value: Estimate) -> Self {
        Self {
            id: value.id.to_string(),
            title: value.title,
            currency: match value.currency {
                Currency::Ars => "ARS".into(),
                Currency::Usd => "USD".into(),
            },
            issued: value.issued,
        }
    }
}

#[tauri::command]
fn create_estimate(
    db: tauri::State<'_, Db>,
    project_id: String,
    title: String,
) -> Result<EstimateView, String> {
    if title.trim().is_empty() {
        return Err("El título del presupuesto es obligatorio".into());
    }
    let project_id = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    let mut store = db.lock().map_err(|e| e.to_string())?;
    let project = store
        .get_project(project_id)
        .map_err(|e| e.to_string())?
        .ok_or("La obra no existe")?;
    let estimate = Estimate {
        id: Uuid::new_v4(),
        project_id,
        title: title.trim().to_owned(),
        currency: project.currency,
        issued: false,
    };
    store
        .create_estimate(&estimate)
        .map_err(|e| e.to_string())?;
    Ok(EstimateView::from(estimate))
}

#[tauri::command]
fn update_project(
    db: tauri::State<'_, Db>,
    project_id: String,
    project_name: String,
    client_id: String,
    currency: String,
) -> Result<Project, String> {
    if project_name.trim().is_empty() {
        return Err("El nombre de la obra es obligatorio".into());
    }
    let id = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    let client_id = Uuid::parse_str(&client_id).map_err(|e| e.to_string())?;
    let currency = match currency.as_str() {
        "ARS" => Currency::Ars,
        "USD" => Currency::Usd,
        _ => return Err("Moneda desconocida".into()),
    };
    let mut store = db.lock().map_err(|e| e.to_string())?;
    if store.get_project(id).map_err(|e| e.to_string())?.is_none() {
        return Err("La obra no existe".into());
    }
    let project = Project {
        id,
        client_id,
        name: project_name.trim().to_owned(),
        currency,
    };
    store.save_project(&project).map_err(|e| e.to_string())?;
    Ok(project)
}

#[tauri::command]
fn list_projects(db: tauri::State<'_, Db>) -> Result<Vec<Project>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .list_projects()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn create_project(
    db: tauri::State<'_, Db>,
    project_name: String,
    client_id: String,
    currency: String,
) -> Result<Project, String> {
    if project_name.trim().is_empty() {
        return Err("El nombre de la obra es obligatorio".into());
    }
    let currency = match currency.as_str() {
        "ARS" => Currency::Ars,
        "USD" => Currency::Usd,
        _ => return Err("Moneda desconocida".into()),
    };
    let project = Project {
        id: Uuid::new_v4(),
        client_id: Uuid::parse_str(&client_id).map_err(|e| e.to_string())?,
        name: project_name.trim().to_owned(),
        currency,
    };
    db.lock()
        .map_err(|e| e.to_string())?
        .save_project(&project)
        .map_err(|e| e.to_string())?;
    Ok(project)
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            let store = LocalStore::open(directory.join("cpobras.sqlite"))
                .map_err(|e| -> Box<dyn std::error::Error> { Box::new(e) })?;
            app.manage(Mutex::new(store));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_clients,
            create_client,
            list_projects,
            create_project,
            update_project,
            list_project_estimates,
            create_estimate,
            list_estimate_lines,
            add_estimate_line,
            update_estimate_line,
            delete_estimate_line,
            estimate_total,
            duplicate_estimate,
            issue_estimate,
            list_resources,
            create_resource,
            list_analyses,
            create_analysis,
            add_line_from_analysis,
            list_price_history,
            register_resource_price,
            reprice_analysis,
            save_budget_section,
            list_budget_sections,
            assign_line_section,
            get_estimate_pricing,
            save_estimate_pricing,
            priced_estimate_total,
            analysis_cost_breakdown,
            compare_estimates
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar CPOBRAS");
}
