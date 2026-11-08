//! Estimate drafts and immutable issued snapshots.
use super::{LocalStore, Result, StorageError};
use cpobras_core::{Currency, EstimateLine};
use rusqlite::{params, OptionalExtension};
use rust_decimal::Decimal;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::str::FromStr;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Estimate {
    pub id: Uuid,
    pub project_id: Uuid,
    pub title: String,
    pub currency: Currency,
    pub issued: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct EstimateItem {
    pub id: Uuid,
    pub estimate_id: Uuid,
    pub position: i64,
    pub analysis_id: Option<Uuid>,
    pub description: String,
    pub unit: String,
    pub quantity: Decimal,
    pub unit_cost_snapshot: Decimal,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DraftRepriceResult {
    pub updated_lines: usize,
    pub old_direct_total: Decimal,
    pub new_direct_total: Decimal,
}

impl EstimateItem {
    pub fn total(&self) -> Decimal {
        self.quantity * self.unit_cost_snapshot
    }
}

fn currency_code(currency: Currency) -> &'static str {
    match currency {
        Currency::Ars => "ARS",
        Currency::Usd => "USD",
    }
}

pub(crate) fn checked_budget_total(conn: &rusqlite::Connection, id: Uuid) -> Result<Decimal> {
    let rows: Vec<(String, String)> = conn
        .prepare("SELECT quantity,unit_cost_snapshot FROM estimate_lines WHERE estimate_id=?1")?
        .query_map([id.to_string()], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<std::result::Result<_, _>>()?;
    rows.into_iter()
        .try_fold(Decimal::ZERO, |total, (quantity, cost)| {
            let quantity = quantity
                .parse::<Decimal>()
                .map_err(|_| StorageError::InvalidValue("Cantidad inválida".into()))?;
            let cost = cost
                .parse::<Decimal>()
                .map_err(|_| StorageError::InvalidValue("Precio inválido".into()))?;
            if quantity < Decimal::ZERO || cost < Decimal::ZERO {
                return Err(StorageError::InvalidValue(
                    "Valores negativos en presupuesto".into(),
                ));
            }
            quantity
                .checked_mul(cost)
                .and_then(|value| total.checked_add(value))
                .ok_or_else(|| {
                    StorageError::InvalidValue("El total excede el rango decimal".into())
                })
        })
}

impl LocalStore {
    pub fn list_project_estimates(&self, project_id: Uuid) -> Result<Vec<Estimate>> {
        let mut stmt = self.conn.prepare(
            "SELECT id FROM estimates WHERE project_id=?1 ORDER BY created_at DESC, id DESC",
        )?;
        let ids = stmt.query_map([project_id.to_string()], |row| row.get::<_, String>(0))?;
        let mut estimates = Vec::new();
        for id in ids {
            let id = Uuid::parse_str(&id?)?;
            if let Some(estimate) = self.get_estimate(id)? {
                estimates.push(estimate);
            }
        }
        Ok(estimates)
    }

    pub fn create_estimate(&mut self, estimate: &Estimate) -> Result<()> {
        if estimate.title.trim().is_empty() || estimate.issued {
            return Err(StorageError::InvalidValue(
                "new estimate must have a title and start as draft".into(),
            ));
        }
        let project = self
            .get_project(estimate.project_id)?
            .ok_or_else(|| StorageError::InvalidValue("Obra inexistente".into()))?;
        if project.currency != estimate.currency {
            return Err(StorageError::InvalidValue(
                "La moneda debe coincidir con la obra".into(),
            ));
        }
        let profile = self
            .management_records("project_profile", Some(project.id))?
            .into_iter()
            .next();
        let rate = |key: &str| -> Result<Decimal> {
            profile
                .as_ref()
                .and_then(|p| p.attributes.get(key))
                .filter(|v| !v.is_empty())
                .map(|v| {
                    v.parse().map_err(|_| {
                        StorageError::InvalidValue("Parámetro económico inválido".into())
                    })
                })
                .unwrap_or(Ok(Decimal::ZERO))
        };
        let rates = cpobras_core::PricingRates {
            general_expenses_percent: rate("general_expenses_percent")?,
            financial_expenses_percent: rate("financial_expenses_percent")?,
            profit_percent: rate("profit_percent")?,
            discount_percent: rate("discount_percent")?,
            tax_percent: rate("tax_percent")?,
        };
        cpobras_core::price_estimate(Decimal::ZERO, rates)
            .map_err(|e| StorageError::InvalidValue(e.to_string()))?;
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        tx.execute(
            "INSERT INTO estimates(id,project_id,title,currency) VALUES (?1,?2,?3,?4)",
            params![
                estimate.id.to_string(),
                estimate.project_id.to_string(),
                estimate.title,
                currency_code(estimate.currency)
            ],
        )?;
        tx.execute("INSERT INTO estimate_pricing(estimate_id,general_expenses_percent,financial_expenses_percent,profit_percent,discount_percent,tax_percent) VALUES (?1,?2,?3,?4,?5,?6)",params![estimate.id.to_string(),rates.general_expenses_percent.to_string(),rates.financial_expenses_percent.to_string(),rates.profit_percent.to_string(),rates.discount_percent.to_string(),rates.tax_percent.to_string()])?;
        tx.commit()?;
        Ok(())
    }

    pub fn get_estimate(&self, id: Uuid) -> Result<Option<Estimate>> {
        let result = self
            .conn
            .query_row(
                "SELECT project_id, title, currency, status FROM estimates WHERE id=?1",
                [id.to_string()],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                    ))
                },
            )
            .optional()?;
        match result {
            None => Ok(None),
            Some((project_id, title, currency, status)) => Ok(Some(Estimate {
                id,
                project_id: Uuid::parse_str(&project_id)?,
                title,
                currency: match currency.as_str() {
                    "ARS" => Currency::Ars,
                    "USD" => Currency::Usd,
                    _ => return Err(StorageError::Currency(currency)),
                },
                issued: status == "issued",
            })),
        }
    }

    /// Stores the ACU unit price as a value, rather than a live link.
    pub fn add_estimate_item(&mut self, item: &EstimateItem) -> Result<()> {
        if item.description.trim().is_empty()
            || item.unit.trim().is_empty()
            || item.quantity < Decimal::ZERO
            || item.unit_cost_snapshot < Decimal::ZERO
            || item.position < 0
            || item.quantity.checked_mul(item.unit_cost_snapshot).is_none()
        {
            return Err(StorageError::InvalidValue("invalid estimate line".into()));
        }
        let transaction = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        transaction.execute(
            "INSERT INTO estimate_lines(id, estimate_id, position, analysis_id,
             description, unit, quantity, unit_cost_snapshot)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                item.id.to_string(),
                item.estimate_id.to_string(),
                item.position,
                item.analysis_id.map(|id| id.to_string()),
                item.description,
                item.unit,
                item.quantity.to_string(),
                item.unit_cost_snapshot.to_string(),
            ],
        )?;
        crate::estimate_resource_prices::synchronize(
            &transaction,
            item.estimate_id,
            &BTreeMap::new(),
        )?;
        checked_budget_total(&transaction, item.estimate_id)?;
        transaction.commit()?;
        Ok(())
    }

    /// Edits an existing draft line; issued estimate triggers enforce immutability.
    pub fn update_estimate_item(&mut self, item: &EstimateItem) -> Result<()> {
        if item.description.trim().is_empty()
            || item.unit.trim().is_empty()
            || item.quantity < Decimal::ZERO
            || item.unit_cost_snapshot < Decimal::ZERO
            || item.position < 0
            || item.quantity.checked_mul(item.unit_cost_snapshot).is_none()
        {
            return Err(StorageError::InvalidValue("invalid estimate line".into()));
        }
        let transaction = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let previous: (String, String) = transaction.query_row(
            "SELECT unit,unit_cost_snapshot FROM estimate_lines WHERE id=?1 AND estimate_id=?2",
            params![item.id.to_string(), item.estimate_id.to_string()],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        let manual_override = previous.0 != item.unit
            || Decimal::from_str(&previous.1)
                .map_err(|e| StorageError::InvalidValue(e.to_string()))?
                != item.unit_cost_snapshot;
        let changed = transaction.execute(
            "UPDATE estimate_lines SET description=?1, unit=?2, quantity=?3, unit_cost_snapshot=?4, analysis_id=CASE WHEN ?7 THEN NULL ELSE analysis_id END
             WHERE id=?5 AND estimate_id=?6",
            params![
                item.description,
                item.unit,
                item.quantity.to_string(),
                item.unit_cost_snapshot.to_string(),
                item.id.to_string(),
                item.estimate_id.to_string(),
                manual_override,
            ],
        )?;
        if changed != 1 {
            return Err(StorageError::InvalidValue("estimate line not found".into()));
        }
        if manual_override {
            transaction.execute(
                "DELETE FROM line_analysis_sources WHERE line_id=?1",
                [item.id.to_string()],
            )?;
        }
        checked_budget_total(&transaction, item.estimate_id)?;
        transaction.commit()?;
        Ok(())
    }

    pub fn delete_estimate_item(&mut self, estimate_id: Uuid, item_id: Uuid) -> Result<()> {
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let existing:Option<(String,String,String,Option<String>)>=tx.query_row("SELECT e.status,e.project_id,e.currency,l.analysis_id FROM estimate_lines l JOIN estimates e ON e.id=l.estimate_id WHERE l.id=?1 AND l.estimate_id=?2",params![item_id.to_string(),estimate_id.to_string()],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional()?;
        let Some((status, project, currency, analysis_id)) = existing else {
            return Err(StorageError::InvalidValue(
                "La partida ya no existe en este presupuesto".into(),
            ));
        };
        if status != "draft" {
            return Err(StorageError::InvalidValue(
                "Las partidas de un presupuesto emitido no se eliminan".into(),
            ));
        }
        let line_json:String=tx.query_row("SELECT json_object('id',id,'estimate_id',estimate_id,'position',position,'analysis_id',analysis_id,'description',description,'unit',unit,'quantity',quantity,'unit_cost_snapshot',unit_cost_snapshot) FROM estimate_lines WHERE id=?1",[item_id.to_string()],|r|r.get(0))?;
        let analysis_json: Option<String> = if let Some(id) = &analysis_id {
            tx.query_row(
                "SELECT snapshot_json FROM analyses WHERE id=?1",
                [id],
                |r| r.get(0),
            )
            .optional()?
        } else {
            None
        };
        tx.execute("INSERT INTO deleted_estimate_lines(id,estimate_id,project_id,currency,line_json,analysis_json) VALUES (?1,?2,?3,?4,?5,?6)",params![item_id.to_string(),estimate_id.to_string(),project,currency,line_json,analysis_json])?;
        // A task keeps its valued scope, assignments and actual progress; only its live budget link is removed.
        let plans:Vec<(String,u32,String)>=tx.prepare("SELECT project_id,revision,plan_json FROM project_plans WHERE project_id IN (SELECT project_id FROM plan_task_references WHERE line_id=?1)")?.query_map([item_id.to_string()],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?)))?.collect::<std::result::Result<_,_>>()?;
        for (project, revision, json) in plans {
            let mut plan: cpobras_core::planning::Plan = serde_json::from_str(&json)?;
            for task in &mut plan.tasks {
                if task.estimate_line_id == Some(item_id) {
                    task.estimate_line_id = None;
                }
            }
            let json = serde_json::to_string(&plan)?;
            let revision = revision.checked_add(1).ok_or_else(|| {
                StorageError::InvalidValue("Revisión de planificación fuera de rango".into())
            })?;
            tx.execute("UPDATE project_plans SET revision=?1,plan_json=?2,updated_at=CURRENT_TIMESTAMP WHERE project_id=?3",params![revision,json,project])?;
            tx.execute(
                "INSERT INTO plan_revisions(project_id,revision,plan_json) VALUES (?1,?2,?3)",
                params![project, revision, json],
            )?;
        }
        tx.execute(
            "UPDATE plan_task_references SET line_id=NULL WHERE line_id=?1",
            [item_id.to_string()],
        )?;
        // The source payload remains untouched; the normalized link now points at the archived snapshot.
        tx.execute(
            "UPDATE operation_links SET archived_line_id=line_id,line_id=NULL WHERE line_id=?1",
            [item_id.to_string()],
        )?;
        tx.execute(
            "DELETE FROM estimate_lines WHERE id=?1 AND estimate_id=?2",
            params![item_id.to_string(), estimate_id.to_string()],
        )?;
        if let Some(id) = analysis_id {
            let private: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM line_analysis_snapshots WHERE analysis_id=?1)",
                [&id],
                |r| r.get(0),
            )?;
            let shared: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM estimate_lines WHERE analysis_id=?1)",
                [&id],
                |r| r.get(0),
            )?;
            if private && !shared {
                tx.execute(
                    "DELETE FROM line_analysis_snapshots WHERE analysis_id=?1",
                    [&id],
                )?;
                tx.execute("DELETE FROM analyses WHERE id=?1", [&id])?;
            }
        }
        checked_budget_total(&tx, estimate_id)?;
        tx.commit()?;
        Ok(())
    }

    pub fn duplicate_estimate(&mut self, source_id: Uuid, title: &str) -> Result<Estimate> {
        if title.trim().is_empty() {
            return Err(StorageError::InvalidValue("empty estimate title".into()));
        }
        let source = self
            .get_estimate(source_id)?
            .ok_or_else(|| StorageError::InvalidValue("estimate not found".into()))?;
        let entries = self.estimate_items(source_id)?;
        let sections = self.list_budget_sections(source_id)?;
        let mut assignments = HashMap::new();
        for entry in &entries {
            let section_id: Option<String> = self
                .conn
                .query_row(
                    "SELECT section_id FROM estimate_line_sections WHERE line_id=?1",
                    [entry.id.to_string()],
                    |row| row.get(0),
                )
                .optional()?;
            if let Some(section_id) = section_id {
                assignments.insert(entry.id, Uuid::parse_str(&section_id)?);
            }
        }
        let mut takeoffs = HashMap::new();
        for entry in &entries {
            let rows = self.list_takeoff_rows(source_id, entry.id)?;
            if !rows.is_empty() {
                takeoffs.insert(entry.id, rows);
            }
        }
        let copy = Estimate {
            id: Uuid::new_v4(),
            project_id: source.project_id,
            title: title.trim().to_owned(),
            currency: source.currency,
            issued: false,
        };
        let section_ids: HashMap<Uuid, Uuid> = sections
            .iter()
            .map(|section| (section.id, Uuid::new_v4()))
            .collect();
        let transaction = self.conn.transaction()?;
        transaction.execute(
            "INSERT INTO estimates(id, project_id, title, currency) VALUES (?1, ?2, ?3, ?4)",
            params![
                copy.id.to_string(),
                copy.project_id.to_string(),
                copy.title,
                currency_code(copy.currency),
            ],
        )?;
        let mut pending = sections;
        let mut inserted = HashSet::new();
        while !pending.is_empty() {
            let previous = pending.len();
            let mut waiting = Vec::new();
            for section in pending {
                if section
                    .parent_id
                    .is_some_and(|parent| !inserted.contains(&parent))
                {
                    waiting.push(section);
                    continue;
                }
                transaction.execute(
                    "INSERT INTO budget_sections(id, estimate_id, parent_id, code, title, position)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        section_ids[&section.id].to_string(),
                        copy.id.to_string(),
                        section.parent_id.map(|id| section_ids[&id].to_string()),
                        section.code,
                        section.title,
                        section.position,
                    ],
                )?;
                inserted.insert(section.id);
            }
            if waiting.len() == previous {
                return Err(StorageError::InvalidValue(
                    "invalid section hierarchy".into(),
                ));
            }
            pending = waiting;
        }
        for entry in entries {
            let new_line_id = Uuid::new_v4();
            transaction.execute(
                "INSERT INTO estimate_lines(id, estimate_id, position, analysis_id,
                 description, unit, quantity, unit_cost_snapshot)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    new_line_id.to_string(),
                    copy.id.to_string(),
                    entry.position,
                    entry.analysis_id.map(|id| id.to_string()),
                    entry.description,
                    entry.unit,
                    entry.quantity.to_string(),
                    entry.unit_cost_snapshot.to_string(),
                ],
            )?;
            transaction.execute("INSERT INTO line_analysis_sources(line_id,analysis_id) SELECT ?1,analysis_id FROM line_analysis_sources WHERE line_id=?2",params![new_line_id.to_string(),entry.id.to_string()])?;
            transaction.execute("UPDATE line_origins SET origin_id=(SELECT origin_id FROM line_origins WHERE line_id=?1) WHERE line_id=?2",params![entry.id.to_string(),new_line_id.to_string()])?;
            transaction.execute("INSERT INTO line_formulas(line_id,expression,variables_json) SELECT ?1,expression,variables_json FROM line_formulas WHERE line_id=?2",params![new_line_id.to_string(),entry.id.to_string()])?;
            if let Some(section_id) = assignments.get(&entry.id) {
                transaction.execute(
                    "INSERT INTO estimate_line_sections(line_id, section_id) VALUES (?1, ?2)",
                    params![new_line_id.to_string(), section_ids[section_id].to_string()],
                )?;
            }
            if let Some(rows) = takeoffs.get(&entry.id) {
                for row in rows {
                    transaction.execute(
                        "INSERT INTO takeoff_rows(
                            id,estimate_id,line_id,note,factor,length,width,height,sign,position
                         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                        params![
                            Uuid::new_v4().to_string(),
                            copy.id.to_string(),
                            new_line_id.to_string(),
                            row.note,
                            row.factor.to_string(),
                            row.length.to_string(),
                            row.width.to_string(),
                            row.height.to_string(),
                            row.sign,
                            row.position,
                        ],
                    )?;
                }
            }
        }
        transaction.execute(
            "INSERT INTO estimate_pricing (
                estimate_id, general_expenses_percent, profit_percent, discount_percent, tax_percent, financial_expenses_percent)
             SELECT ?1, general_expenses_percent, profit_percent, discount_percent, tax_percent, financial_expenses_percent
             FROM estimate_pricing WHERE estimate_id=?2",
            params![copy.id.to_string(), source_id.to_string()],
        )?;
        transaction.execute("INSERT INTO estimate_price_definitions(estimate_id,revision,definition_json) SELECT ?1,1,definition_json FROM estimate_price_definitions WHERE estimate_id=?2",params![copy.id.to_string(),source_id.to_string()])?;
        crate::estimate_resource_prices::synchronize(&transaction, copy.id, &BTreeMap::new())?;
        transaction.commit()?;
        Ok(copy)
    }

    pub fn estimate_items(&self, estimate_id: Uuid) -> Result<Vec<EstimateItem>> {
        let mut statement = self.conn.prepare(
            "SELECT id, position, analysis_id, description, unit, quantity, unit_cost_snapshot
             FROM estimate_lines WHERE estimate_id=?1 ORDER BY position, id",
        )?;
        let rows = statement.query_map([estimate_id.to_string()], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
            ))
        })?;
        let mut items = Vec::new();
        for row in rows {
            let (id, position, analysis_id, description, unit, quantity, unit_cost_snapshot) = row?;
            let parse_amount = |value: String| {
                Decimal::from_str(&value)
                    .map_err(|_| StorageError::InvalidValue("corrupt decimal".into()))
            };
            items.push(EstimateItem {
                id: Uuid::parse_str(&id)?,
                estimate_id,
                position,
                analysis_id: analysis_id
                    .map(|value| Uuid::parse_str(&value))
                    .transpose()?,
                description,
                unit,
                quantity: parse_amount(quantity)?,
                unit_cost_snapshot: parse_amount(unit_cost_snapshot)?,
            });
        }
        Ok(items)
    }

    pub fn estimate_total(&self, id: Uuid) -> Result<Decimal> {
        let lines: Vec<EstimateLine> = self
            .estimate_items(id)?
            .into_iter()
            .map(|item| EstimateLine {
                analysis_id: item.analysis_id.unwrap_or(Uuid::nil()),
                quantity: item.quantity,
                unit_cost_snapshot: item.unit_cost_snapshot,
            })
            .collect();
        cpobras_core::estimate_total(&lines)
            .map_err(|err| StorageError::InvalidValue(err.to_string()))
    }

    /// Explicitly refreshes *draft* line price snapshots from saved ACU costs.
    /// All new values are validated before the transaction is committed.
    pub fn refresh_draft_analysis_costs(
        &mut self,
        estimate_id: Uuid,
    ) -> Result<DraftRepriceResult> {
        let tx = rusqlite::Transaction::new_unchecked(
            &self.conn,
            rusqlite::TransactionBehavior::Immediate,
        )?;
        let estimate = self
            .get_estimate(estimate_id)?
            .ok_or_else(|| StorageError::InvalidValue("estimate not found".into()))?;
        if estimate.issued {
            return Err(StorageError::InvalidValue(
                "issued estimate is immutable".into(),
            ));
        }
        if estimate.currency != Currency::Ars {
            return Err(StorageError::InvalidValue(
                "ACU updates require an ARS estimate; currency conversion is not supported".into(),
            ));
        }
        let old_direct_total = self.estimate_total(estimate_id)?;
        let mut prices = BTreeMap::new();
        for line in self.estimate_items(estimate_id)? {
            let source: Option<String> = tx
                .query_row(
                    "SELECT analysis_id FROM line_analysis_sources WHERE line_id=?1",
                    [line.id.to_string()],
                    |r| r.get(0),
                )
                .optional()?;
            let source = source
                .map(|id| Uuid::parse_str(&id))
                .transpose()?
                .or(line.analysis_id);
            if let Some(id) = source {
                if self.is_line_analysis(id)? {
                    continue;
                }
                let analysis = self
                    .get_analysis(id)?
                    .ok_or_else(|| StorageError::InvalidValue("referenced ACU not found".into()))?;
                if analysis.unit != line.unit {
                    return Err(StorageError::InvalidValue(
                        "ACU unit no longer matches the budget item".into(),
                    ));
                }
                analysis
                    .direct_unit_cost()
                    .map_err(|e| StorageError::InvalidValue(e.to_string()))?;
                for c in analysis.components {
                    prices.entry(c.resource_id).or_insert(c.unit_price);
                }
            }
        }
        let updated_lines =
            crate::estimate_resource_prices::synchronize(&tx, estimate_id, &prices)?;
        let new_direct_total = checked_budget_total(&tx, estimate_id)?;
        tx.commit()?;
        Ok(DraftRepriceResult {
            updated_lines,
            old_direct_total,
            new_direct_total,
        })
    }

    /// Reopening preserves every quantity and price; only the editing state changes.
    pub fn reopen_estimate(&mut self, id: Uuid) -> Result<()> {
        let changed = self.conn.execute(
            "UPDATE estimates SET status='draft',issued_at=NULL WHERE id=?1 AND status='issued'",
            [id.to_string()],
        )?;
        if changed != 1 {
            return Err(StorageError::InvalidValue(
                "El presupuesto no existe o ya está en elaboración".into(),
            ));
        }
        Ok(())
    }

    /// Save an independent reusable ACU; never alter the source line or its prices.
    pub fn save_line_as_analysis(
        &mut self,
        estimate_id: Uuid,
        line_id: Uuid,
        code: &str,
        description: &str,
    ) -> Result<cpobras_core::UnitCostAnalysis> {
        let estimate = self
            .get_estimate(estimate_id)?
            .ok_or_else(|| StorageError::InvalidValue("Presupuesto inexistente".into()))?;
        if estimate.currency != Currency::Ars {
            return Err(StorageError::InvalidValue("La biblioteca de ACU usa precios en ARS; no se convierten automáticamente otras monedas".into()));
        }
        let line = self
            .estimate_items(estimate_id)?
            .into_iter()
            .find(|l| l.id == line_id)
            .ok_or_else(|| {
                StorageError::InvalidValue("Partida inexistente en este presupuesto".into())
            })?;
        let id = line.analysis_id.ok_or_else(|| {
            StorageError::InvalidValue("La partida todavía no tiene insumos".into())
        })?;
        let mut analysis = self
            .get_analysis(id)?
            .ok_or_else(|| StorageError::InvalidValue("Composición inexistente".into()))?;
        if analysis.components.is_empty() {
            return Err(StorageError::InvalidValue(
                "Agregá insumos antes de guardar el patrón".into(),
            ));
        }
        analysis.id = Uuid::new_v4();
        analysis.code = code.trim().into();
        analysis.description = description.trim().into();
        analysis.unit = line.unit;
        self.save_analysis(&analysis)?;
        Ok(analysis)
    }

    pub fn issue_estimate(&mut self, id: Uuid) -> Result<()> {
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        crate::price_determination::calculate_price(&tx, id)?;
        let changed = tx.execute(
            "UPDATE estimates SET status='issued', issued_at=CURRENT_TIMESTAMP
             WHERE id=?1 AND status='draft'
               AND EXISTS (SELECT 1 FROM estimate_lines WHERE estimate_id=?1)",
            [id.to_string()],
        )?;
        if changed != 1 {
            return Err(StorageError::InvalidValue(
                "estimate missing, already issued or without items".into(),
            ));
        }
        tx.commit()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use cpobras_core::{Client, Project};

    #[test]
    fn issued_estimate_keeps_prices_and_rejects_later_changes() {
        let mut db = LocalStore::in_memory().unwrap();
        let client = Client {
            id: Uuid::new_v4(),
            name: "Comitente".into(),
            cuit: None,
        };
        db.save_client(&client).unwrap();
        let project = Project {
            id: Uuid::new_v4(),
            client_id: client.id,
            name: "Obra".into(),
            currency: Currency::Ars,
        };
        db.save_project(&project).unwrap();
        let estimate = Estimate {
            id: Uuid::new_v4(),
            project_id: project.id,
            title: "Presupuesto inicial".into(),
            currency: Currency::Ars,
            issued: false,
        };
        db.create_estimate(&estimate).unwrap();
        let line = EstimateItem {
            id: Uuid::new_v4(),
            estimate_id: estimate.id,
            position: 0,
            analysis_id: None,
            description: "Mampostería".into(),
            unit: "m2".into(),
            quantity: Decimal::new(10, 0),
            unit_cost_snapshot: Decimal::new(12550, 2),
        };
        db.add_estimate_item(&line).unwrap();
        assert_eq!(
            db.estimate_total(estimate.id).unwrap(),
            Decimal::new(125500, 2)
        );
        db.issue_estimate(estimate.id).unwrap();
        assert!(db.get_estimate(estimate.id).unwrap().unwrap().issued);
        assert!(db
            .add_estimate_item(&EstimateItem {
                id: Uuid::new_v4(),
                position: 1,
                ..line
            })
            .is_err());
        assert_eq!(
            db.estimate_total(estimate.id).unwrap(),
            Decimal::new(125500, 2)
        );
    }
    #[test]
    fn draft_edit_delete_duplicate_and_issued_are_protected() {
        let mut db = LocalStore::in_memory().unwrap();
        let client = Client {
            id: Uuid::new_v4(),
            name: "Cliente prueba".into(),
            cuit: None,
        };
        db.save_client(&client).unwrap();
        let project = Project {
            id: Uuid::new_v4(),
            client_id: client.id,
            name: "Obra prueba".into(),
            currency: Currency::Ars,
        };
        db.save_project(&project).unwrap();
        let estimate = Estimate {
            id: Uuid::new_v4(),
            project_id: project.id,
            title: "Base".into(),
            currency: Currency::Ars,
            issued: false,
        };
        db.create_estimate(&estimate).unwrap();
        let mut line = EstimateItem {
            id: Uuid::new_v4(),
            estimate_id: estimate.id,
            position: 0,
            analysis_id: None,
            description: "Hormigón".into(),
            unit: "m3".into(),
            quantity: Decimal::new(2, 0),
            unit_cost_snapshot: Decimal::new(12550, 2),
        };
        db.add_estimate_item(&line).unwrap();
        line.quantity = Decimal::new(3, 0);
        db.update_estimate_item(&line).unwrap();
        assert_eq!(
            db.estimate_total(estimate.id).unwrap(),
            Decimal::new(37650, 2)
        );

        let copy = db.duplicate_estimate(estimate.id, "Revisión").unwrap();
        assert!(!copy.issued);
        assert_eq!(db.estimate_total(copy.id).unwrap(), Decimal::new(37650, 2));
        assert_ne!(db.estimate_items(copy.id).unwrap()[0].id, line.id);

        db.delete_estimate_item(estimate.id, line.id).unwrap();
        assert_eq!(db.estimate_total(estimate.id).unwrap(), Decimal::ZERO);
        assert_eq!(db.estimate_total(copy.id).unwrap(), Decimal::new(37650, 2));

        db.issue_estimate(copy.id).unwrap();
        let mut issued_line = db.estimate_items(copy.id).unwrap().remove(0);
        issued_line.quantity = Decimal::new(100, 0);
        assert!(db.update_estimate_item(&issued_line).is_err());
        assert!(db.delete_estimate_item(copy.id, issued_line.id).is_err());
        assert_eq!(db.estimate_total(copy.id).unwrap(), Decimal::new(37650, 2));
    }
    #[test]
    fn explicit_reprice_updates_only_drafts_and_keeps_issued_snapshots() {
        use cpobras_core::{ResourceKind, ResourcePriceSnapshot, UnitCostAnalysis};

        let mut db = LocalStore::in_memory().unwrap();
        let client = Client {
            id: Uuid::new_v4(),
            name: "Comitente".into(),
            cuit: None,
        };
        db.save_client(&client).unwrap();
        let project = Project {
            id: Uuid::new_v4(),
            client_id: client.id,
            name: "Obra".into(),
            currency: Currency::Ars,
        };
        db.save_project(&project).unwrap();
        let analysis = UnitCostAnalysis {
            id: Uuid::new_v4(),
            code: "01".into(),
            description: "Acero montado".into(),
            unit: "kg".into(),
            components: vec![ResourcePriceSnapshot {
                resource_id: Uuid::new_v4(),
                description: "Acero".into(),
                kind: ResourceKind::Material,
                quantity_per_unit: Decimal::ONE,
                unit_price: Decimal::new(1200, 0),
            }],
        };
        db.save_analysis(&analysis).unwrap();
        let issued = Estimate {
            id: Uuid::new_v4(),
            project_id: project.id,
            title: "Emitido".into(),
            currency: Currency::Ars,
            issued: false,
        };
        db.create_estimate(&issued).unwrap();
        let line = EstimateItem {
            id: Uuid::new_v4(),
            estimate_id: issued.id,
            position: 0,
            analysis_id: Some(analysis.id),
            description: analysis.description.clone(),
            unit: "kg".into(),
            quantity: Decimal::new(10, 0),
            unit_cost_snapshot: Decimal::new(1200, 0),
        };
        db.add_estimate_item(&line).unwrap();
        let draft = db.duplicate_estimate(issued.id, "Borrador nuevo").unwrap();
        db.issue_estimate(issued.id).unwrap();
        let mut revised = analysis.clone();
        revised.components[0].unit_price = Decimal::new(1500, 0);
        db.save_analysis(&revised).unwrap();
        let result = db.refresh_draft_analysis_costs(draft.id).unwrap();
        assert_eq!(result.updated_lines, 1);
        assert_eq!(result.old_direct_total, Decimal::new(12000, 0));
        assert_eq!(result.new_direct_total, Decimal::new(15000, 0));
        assert_eq!(
            db.refresh_draft_analysis_costs(draft.id)
                .unwrap()
                .updated_lines,
            0
        );
        assert!(db.refresh_draft_analysis_costs(issued.id).is_err());
        assert_eq!(
            db.estimate_total(issued.id).unwrap(),
            Decimal::new(12000, 0)
        );
        assert_eq!(db.estimate_total(draft.id).unwrap(), Decimal::new(15000, 0));
        revised.unit = "m2".into();
        db.save_analysis(&revised).unwrap();
        assert!(db.refresh_draft_analysis_costs(draft.id).is_err());
        assert_eq!(db.estimate_total(draft.id).unwrap(), Decimal::new(15000, 0));
    }
}
