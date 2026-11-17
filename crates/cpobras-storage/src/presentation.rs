//! Budget presentation and private organization cost plans. Revision checks prevent lost edits.
use crate::{LocalStore, Result, StorageError};
use cpobras_core::Currency;
use rusqlite::{params, OptionalExtension};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct BudgetPresentation {
    pub memory: String,
    pub print_options: PrintOptions,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct PrintOptions {
    pub mode: String,
    pub format: String,
    pub title: String,
    pub reference: String,
    pub date: String,
    pub notes: String,
    pub landscape: bool,
    pub layout: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedPresentation {
    pub revision: u32,
    pub data: BudgetPresentation,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IndirectCost {
    pub id: Uuid,
    pub description: String,
    pub amount: Decimal,
    pub periodicity: String,
    pub periods: Decimal,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IndirectCostPlan {
    pub currency: Currency,
    pub items: Vec<IndirectCost>,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct SavedIndirectCosts {
    pub revision: u32,
    pub data: IndirectCostPlan,
}
fn invalid(message: &str) -> StorageError { StorageError::InvalidValue(message.into()) }
impl BudgetPresentation {
    pub fn validate(&self) -> Result<()> {
        let p = &self.print_options;
        if self.memory.len() > 100_000 || p.title.len() > 1200 || p.reference.len() > 400 || p.notes.len() > 20_000
            || !["", "client", "internal", "incidences"].contains(&p.mode.as_str())
            || !["", "pdf", "xlsx"].contains(&p.format.as_str())
            || !["", "sheet_price", "memory_sheet_price", "memory_price"].contains(&p.layout.as_str())
            || (!p.date.is_empty() && chrono::NaiveDate::parse_from_str(&p.date, "%Y-%m-%d").is_err()) {
            return Err(invalid("Datos de impresión o memoria descriptiva inválidos"));
        }
        Ok(())
    }
}
impl LocalStore {
    pub fn budget_presentation(&self, id: Uuid) -> Result<SavedPresentation> {
        if self.get_estimate(id)?.is_none() { return Err(invalid("Presupuesto inexistente")); }
        let row: Option<(u32, String)> = self.conn.query_row("SELECT revision,data_json FROM budget_presentations WHERE estimate_id=?1", [id.to_string()], |r| Ok((r.get(0)?,r.get(1)?))).optional()?;
        match row {
            Some((revision,json)) => Ok(SavedPresentation { revision, data: serde_json::from_str(&json)? }),
            None => Ok(SavedPresentation { revision: 0, data: BudgetPresentation::default() }),
        }
    }
    pub fn save_budget_presentation(&mut self, id: Uuid, revision: u32, data: &BudgetPresentation) -> Result<SavedPresentation> {
        data.validate()?;
        let tx = self.conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let issued: bool = tx.query_row("SELECT status='issued' FROM estimates WHERE id=?1", [id.to_string()], |r| r.get(0))?;
        let old: Option<(u32,String)> = tx.query_row("SELECT revision,data_json FROM budget_presentations WHERE estimate_id=?1",[id.to_string()],|r| Ok((r.get(0)?,r.get(1)?))).optional()?;
        if old.as_ref().map(|r| r.0).unwrap_or(0) != revision { return Err(invalid("La presentación cambió en otra ventana. Se conserva tu borrador; volvé a abrir para revisar.")); }
        let old_data = old.map(|r| serde_json::from_str::<BudgetPresentation>(&r.1)).transpose()?.unwrap_or_default();
        if issued && old_data.memory != data.memory { return Err(invalid("La memoria de un presupuesto emitido no se modifica. Creá una revisión.")); }
        let next = revision.checked_add(1).ok_or_else(|| invalid("Revisión fuera de rango"))?;
        tx.execute("INSERT INTO budget_presentations(estimate_id,revision,data_json) VALUES(?1,?2,?3) ON CONFLICT(estimate_id) DO UPDATE SET revision=excluded.revision,data_json=excluded.data_json",params![id.to_string(),next,serde_json::to_string(data)?])?;
        tx.commit()?;
        Ok(SavedPresentation { revision: next, data: data.clone() })
    }
    pub fn organization_indirect_costs(&self, id: Uuid) -> Result<SavedIndirectCosts> {
        let org = self.organization(id)?;
        if org.ownership != "own" { return Err(invalid("Los gastos internos de una organización externa no están disponibles")); }
        let row: Option<(u32,String)> = self.conn.query_row("SELECT revision,data_json FROM organization_indirect_costs WHERE organization_id=?1",[id.to_string()],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
        match row {
            Some((revision,json)) => Ok(SavedIndirectCosts {revision,data:serde_json::from_str(&json)?}),
            None => Ok(SavedIndirectCosts {revision:0,data:IndirectCostPlan {currency:Currency::Ars,items:vec![]}}),
        }
    }
    pub fn save_organization_indirect_costs(&mut self, id: Uuid, revision: u32, data: &IndirectCostPlan) -> Result<SavedIndirectCosts> {
        self.organization_indirect_costs(id)?;
        let mut ids = std::collections::BTreeSet::new();
        let mut total = Decimal::ZERO;
        if data.items.len() > 1000 { return Err(invalid("Demasiados gastos indirectos")); }
        for item in &data.items {
            if !ids.insert(item.id) || item.description.trim().is_empty() || item.description.len() > 2000 || item.amount < Decimal::ZERO
                || item.periods <= Decimal::ZERO || item.periods > Decimal::from(1200)
                || !["once", "monthly", "yearly"].contains(&item.periodicity.as_str())
                || (item.periodicity == "once" && item.periods != Decimal::ONE) { return Err(invalid("Revisá la descripción, importe y períodos de cada gasto indirecto")); }
            total = item.amount.checked_mul(item.periods).and_then(|v| total.checked_add(v)).ok_or_else(|| invalid("Importe de gastos indirectos fuera de rango"))?;
        }
        let next = revision.checked_add(1).ok_or_else(|| invalid("Revisión fuera de rango"))?;
        let tx = self.conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let current: Option<u32> = tx.query_row("SELECT revision FROM organization_indirect_costs WHERE organization_id=?1",[id.to_string()],|r|r.get(0)).optional()?;
        if current.unwrap_or(0) != revision { return Err(invalid("Los gastos de la organización cambiaron. Volvé a abrirlos antes de guardar.")); }
        tx.execute("INSERT INTO organization_indirect_costs(organization_id,revision,data_json) VALUES(?1,?2,?3) ON CONFLICT(organization_id) DO UPDATE SET revision=excluded.revision,data_json=excluded.data_json",params![id.to_string(),next,serde_json::to_string(data)?])?;
        tx.commit()?;
        Ok(SavedIndirectCosts {revision:next,data:data.clone()})
    }
}
