use crate::Db;
use cpobras_core::{Currency, PricingRates};
use cpobras_storage::estimates::{Estimate, EstimateItem};
use rust_decimal::Decimal;
use std::str::FromStr;
use uuid::Uuid;

#[derive(serde::Serialize)]
pub(crate) struct EstimateComparisonLineView {
    description: String,
    unit: String,
    baseline_quantity: String,
    revised_quantity: String,
    baseline_cost: String,
    revised_cost: String,
    difference: String,
}

#[derive(serde::Serialize)]
pub(crate) struct EstimateComparisonView {
    baseline_id: String,
    revised_id: String,
    baseline_total: String,
    revised_total: String,
    difference: String,
    lines: Vec<EstimateComparisonLineView>,
}

#[tauri::command]
pub(crate) fn compare_estimates(
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
pub(crate) struct PricingView {
    rows: Vec<cpobras_core::price_determination::PriceRowResult>,
    financial_expenses: String,
    direct: String,
    general_expenses: String,
    profit: String,
    discount: String,
    taxable_subtotal: String,
    taxes: String,
    total: String,
}

#[derive(serde::Serialize)]
pub(crate) struct PricingRatesView {
    financial_expenses_percent: String,
    general_expenses_percent: String,
    profit_percent: String,
    discount_percent: String,
    tax_percent: String,
}

pub(crate) fn pricing_rates_view(rates: PricingRates) -> PricingRatesView {
    PricingRatesView {
        financial_expenses_percent: rates.financial_expenses_percent.to_string(),
        general_expenses_percent: rates.general_expenses_percent.to_string(),
        profit_percent: rates.profit_percent.to_string(),
        discount_percent: rates.discount_percent.to_string(),
        tax_percent: rates.tax_percent.to_string(),
    }
}

#[tauri::command]
pub(crate) fn get_estimate_pricing(
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
pub(crate) fn save_estimate_pricing(
    db: tauri::State<'_, Db>,
    estimate_id: String,
    general_expenses_percent: String,
    financial_expenses_percent: Option<String>,
    profit_percent: String,
    discount_percent: String,
    tax_percent: String,
) -> Result<PricingRatesView, String> {
    let id = Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?;
    let parse =
        |value: String| Decimal::from_str(&value.replace(',', ".")).map_err(|e| e.to_string());
    let rates = PricingRates {
        financial_expenses_percent: parse(
            financial_expenses_percent.unwrap_or_else(|| "0".into()),
        )?,
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
pub(crate) fn priced_estimate_total(
    db: tauri::State<'_, Db>,
    estimate_id: String,
) -> Result<PricingView, String> {
    let id = Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?;
    let store = db.lock().map_err(|e| e.to_string())?;
    let definition = store.get_price_definition(id).map_err(|e| e.to_string())?;
    let calculation = definition.calculation.ok_or_else(|| {
        definition
            .calculation_error
            .unwrap_or_else(|| "Determinación inválida".into())
    })?;
    let priced = calculation.breakdown;
    Ok(PricingView {
        rows: calculation.rows,
        financial_expenses: priced.financial_expenses.to_string(),
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
pub(crate) struct RefreshDraftView {
    updated_lines: usize,
    old_direct_total: String,
    new_direct_total: String,
}

#[tauri::command]
pub(crate) fn refresh_draft_analysis_costs(
    db: tauri::State<'_, Db>,
    estimate_id: String,
) -> Result<RefreshDraftView, String> {
    let id = Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?;
    let result = db
        .lock()
        .map_err(|e| e.to_string())?
        .refresh_draft_analysis_costs(id)
        .map_err(|e| e.to_string())?;
    Ok(RefreshDraftView {
        updated_lines: result.updated_lines,
        old_direct_total: result.old_direct_total.to_string(),
        new_direct_total: result.new_direct_total.to_string(),
    })
}

#[tauri::command]
pub(crate) fn add_line_from_analysis(
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
    let saved = store
        .estimate_items(estimate_id)
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|line| line.id == item.id)
        .ok_or("La partida no se guardó")?;
    Ok(LineView::from(saved))
}

#[derive(serde::Serialize)]
pub(crate) struct LineView {
    id: String,
    description: String,
    unit: String,
    quantity: String,
    unit_cost: String,
    total: String,
    analysis_id: Option<String>,
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
            analysis_id: line.analysis_id.map(|id| id.to_string()),
            total,
        }
    }
}

#[tauri::command]
pub(crate) fn list_estimate_lines(
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
pub(crate) fn add_estimate_line(
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
pub(crate) fn update_estimate_line(
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
pub(crate) fn delete_estimate_line(
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
pub(crate) fn estimate_total(
    db: tauri::State<'_, Db>,
    estimate_id: String,
) -> Result<String, String> {
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
pub(crate) fn duplicate_estimate(
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
pub(crate) fn issue_estimate(db: tauri::State<'_, Db>, estimate_id: String) -> Result<(), String> {
    let id = Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?;
    db.lock()
        .map_err(|e| e.to_string())?
        .issue_estimate(id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn list_project_estimates(
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
pub(crate) struct EstimateView {
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
pub(crate) fn create_estimate(
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
pub(crate) fn reopen_estimate(db: tauri::State<'_, Db>, estimate_id: String) -> Result<(), String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .reopen_estimate(Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn save_line_as_analysis(
    db: tauri::State<'_, Db>,
    estimate_id: String,
    line_id: String,
    code: String,
    description: String,
) -> Result<(), String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .save_line_as_analysis(
            Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?,
            Uuid::parse_str(&line_id).map_err(|e| e.to_string())?,
            &code,
            &description,
        )
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn apply_reviewed_budget_batch(
    db: tauri::State<'_, Db>,
    batch: cpobras_storage::assisted_budget::ReviewedBatch,
) -> Result<cpobras_storage::assisted_budget::BatchResult, String> {
    db.lock()
        .map_err(|_| "No se pudo abrir el presupuesto")?
        .apply_reviewed_budget_batch(&batch)
        .map_err(|e| e.to_string())
}
