//! Mutable certificate drafts and immutable emission, physical origins and print snapshots.
use crate::{
    operations::{Operation, OperationLine},
    LocalStore, Result, StorageError,
};
use cpobras_core::planning::Plan;
use rusqlite::{params, Connection, OptionalExtension};
use rust_decimal::Decimal as D;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;
pub(crate) fn invalid(s: &str) -> StorageError {
    StorageError::InvalidValue(s.into())
}
pub(crate) fn add(a: D, b: D) -> Result<D> {
    a.checked_add(b)
        .ok_or_else(|| invalid("Importe fuera de rango"))
}
pub(crate) fn mul(a: D, b: D) -> Result<D> {
    a.checked_mul(b)
        .ok_or_else(|| invalid("Importe fuera de rango"))
}
pub(crate) fn div(a: D, b: D) -> Result<D> {
    a.checked_div(b).ok_or_else(|| invalid("División inválida"))
}
pub(crate) fn pct(a: D, p: D) -> Result<D> {
    div(mul(a, p)?, 100.into())
}
pub(crate) fn sum(mut values: impl Iterator<Item = D>) -> Result<D> {
    values.try_fold(D::ZERO, add)
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct CertificateTerms {
    pub advance_recovery_percent: D,
    pub retention_percent: D,
    pub collection_delay_days: u32,
}
impl CertificateTerms {
    pub fn validate(&self) -> Result<()> {
        if self.advance_recovery_percent < D::ZERO
            || self.advance_recovery_percent > D::from(100)
            || self.retention_percent < D::ZERO
            || self.retention_percent > D::from(100)
            || self.collection_delay_days > 365
        {
            return Err(invalid("Condiciones de certificación inválidas"));
        }
        Ok(())
    }
}
pub(crate) fn terms(conn: &Connection, estimate: Uuid) -> Result<CertificateTerms> {
    let saved: Option<String> = conn
        .query_row(
            "SELECT terms_json FROM estimate_adjustment_agreements WHERE estimate_id=?1",
            [estimate.to_string()],
            |r| r.get(0),
        )
        .optional()?;
    if let Some(json) = saved.filter(|s| s != "{}") {
        return Ok(serde_json::from_str(&json)?);
    }
    let json:Option<String>=conn.query_row("SELECT p.plan_json FROM project_plans p JOIN estimates e ON e.project_id=p.project_id WHERE e.id=?1",[estimate.to_string()],|r|r.get(0)).optional()?;
    if let Some(j) = json {
        let v: serde_json::Value = serde_json::from_str(&j)?;
        let f = &v["finance"];
        return Ok(CertificateTerms {
            advance_recovery_percent: f["advance_recovery_percent"]
                .as_str()
                .unwrap_or("0")
                .parse()
                .map_err(|_| invalid("Recuperación inválida"))?,
            retention_percent: f["retention_percent"]
                .as_str()
                .unwrap_or("0")
                .parse()
                .map_err(|_| invalid("Reparo inválido"))?,
            collection_delay_days: f["collection_delay_days"].as_u64().unwrap_or(0) as u32,
        });
    }
    Ok(CertificateTerms::default())
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct ContractTerms {
    pub ceiling: D,
    pub forecast_units: D,
    pub method: String,
    pub frequency: String,
    pub rate: D,
    pub start: String,
    pub end: String,
    pub scope: String,
    pub contributes_progress: bool,
    pub payment_delay_days: u32,
    pub advance_recovery_percent: D,
    pub retention_percent: D,
}
impl Default for ContractTerms {
    fn default() -> Self {
        Self {
            ceiling: D::ZERO,
            forecast_units: D::ONE,
            method: "quantity".into(),
            frequency: "by_progress".into(),
            rate: D::ZERO,
            start: String::new(),
            end: String::new(),
            scope: "Mano de obra".into(),
            contributes_progress: true,
            payment_delay_days: 0,
            advance_recovery_percent: D::ZERO,
            retention_percent: D::ZERO,
        }
    }
}
impl ContractTerms {
    pub fn validate(&self) -> Result<()> {
        if !["quantity", "percent", "fixed", "daily", "hourly"].contains(&self.method.as_str())
            || !["weekly", "fortnight", "monthly", "by_progress"].contains(&self.frequency.as_str())
            || self.rate < D::ZERO
            || self.scope.trim().is_empty()
            || self.scope.len() > 4000
        {
            return Err(invalid(
                "Revisá alcance, modalidad y frecuencia del contrato",
            ));
        }
        CertificateTerms {
            advance_recovery_percent: self.advance_recovery_percent,
            retention_percent: self.retention_percent,
            collection_delay_days: self.payment_delay_days,
        }
        .validate()?;
        for s in [&self.start, &self.end] {
            if !s.is_empty() {
                chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d")
                    .map_err(|_| invalid("Fecha contractual inválida"))?;
            }
        }
        if self.end < self.start
            || (!matches!(self.method.as_str(), "quantity" | "percent")
                && (self.rate <= D::ZERO
                    || self.ceiling <= D::ZERO
                    || self.frequency == "by_progress"
                    || self.forecast_units <= D::ZERO
                    || self.start.is_empty()
                    || self.end.is_empty()))
        {
            return Err(invalid(
                "La modalidad requiere tarifa y período de contratación",
            ));
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProgressSource {
    pub source_id: Uuid,
    pub line_id: Uuid,
    pub quantity: D,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AvailableProgress {
    pub source_id: Uuid,
    pub number: String,
    pub line_id: Uuid,
    pub quantity: D,
    pub description: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProgressInput {
    pub line_id: Uuid,
    pub accumulated_percent: D,
    #[serde(default = "yes")]
    pub use_approved: bool,
}
fn yes() -> bool {
    true
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CertificateDraft {
    pub id: Uuid,
    pub project_id: Uuid,
    pub estimate_id: Uuid,
    pub revision: u32,
    pub kind: String,
    pub operation: Operation,
    pub progress: Vec<ProgressInput>,
    pub issued_id: Option<Uuid>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CertificateRow {
    pub line_id: Uuid,
    pub item: String,
    pub section: String,
    pub description: String,
    pub unit: String,
    pub quantity: D,
    pub unit_price: D,
    pub previous: D,
    pub current: D,
    pub accumulated: D,
    pub remaining: D,
    pub previous_percent: D,
    pub current_percent: D,
    pub accumulated_percent: D,
    pub remaining_percent: D,
    pub period_amount: D,
    pub contract_total: D,
    pub incidence: D,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CertificateSheet {
    pub preliminary: bool,
    pub project_name: String,
    pub budget_title: String,
    pub client_name: String,
    pub profile: serde_json::Value,
    pub operation: Operation,
    pub rows: Vec<CertificateRow>,
    pub total_base: D,
    pub physical_percent: D,
}
pub(crate) fn available(
    conn: &Connection,
    project: Uuid,
    estimate: Uuid,
) -> Result<Vec<AvailableProgress>> {
    let docs = crate::operations::documents(conn, Some(project))?;
    let mut out = vec![];
    for source in docs
        .iter()
        .filter(|o| o.kind == "subcertificate" && o.estimate_id == Some(estimate))
    {
        let contract = source
            .reference_id
            .and_then(|id| docs.iter().find(|o| o.id == id));
        if contract
            .and_then(|c| c.contract_terms.as_ref())
            .is_some_and(|t| !t.contributes_progress)
        {
            continue;
        }
        for l in &source.lines {
            if let Some(id) = l.line_id {
                let used = sum(docs
                    .iter()
                    .flat_map(|o| &o.progress_sources)
                    .filter(|s| s.source_id == source.id && s.line_id == id)
                    .map(|s| s.quantity))?;
                let q = add(l.quantity, -used)?.max(D::ZERO);
                if q > D::ZERO {
                    out.push(AvailableProgress {
                        source_id: source.id,
                        number: source.number.clone(),
                        line_id: id,
                        quantity: q,
                        description: l.description.clone(),
                    });
                }
            }
        }
    }
    Ok(out)
}
pub(crate) fn certified(conn: &Connection, project: Uuid) -> Result<BTreeMap<Uuid, D>> {
    let mut out = BTreeMap::new();
    for o in crate::operations::documents(conn, Some(project))?
        .iter()
        .filter(|o| o.kind == "certificate")
    {
        for l in &o.lines {
            if let Some(id) = l.line_id {
                let v = out.entry(id).or_default();
                *v = add(*v, l.quantity)?;
            }
        }
    }
    Ok(out)
}
pub(crate) fn apply_progress(
    conn: &Connection,
    project: Uuid,
    plan: &mut Plan,
    pending: bool,
) -> Result<()> {
    let mut quantities = certified(conn, project)?;
    if pending {
        let estimates: Vec<String> = conn
            .prepare("SELECT id FROM estimates WHERE project_id=?1")?
            .query_map([project.to_string()], |r| r.get(0))?
            .collect::<std::result::Result<_, _>>()?;
        for e in estimates {
            for s in available(conn, project, e.parse()?)? {
                let v = quantities.entry(s.line_id).or_default();
                *v = add(*v, s.quantity)?;
            }
        }
    }
    let schedule = plan
        .schedule(&plan.calendar.start_date)
        .map_err(StorageError::InvalidValue)?;
    let order: BTreeMap<_, _> = schedule
        .tasks
        .iter()
        .map(|t| (t.id, t.start.clone()))
        .collect();
    let mut indices: Vec<usize> = (0..plan.tasks.len()).collect();
    indices.sort_by_key(|i| {
        (
            order.get(&plan.tasks[*i].id).cloned().unwrap_or_default(),
            *i,
        )
    });
    let mut allocated = BTreeMap::<Uuid, D>::new();
    for index in indices {
        let t = &mut plan.tasks[index];
        t.actual_progress = D::ZERO;
        if let Some(id) = t.estimate_line_id {
            let q: Option<String> = conn
                .query_row(
                    "SELECT quantity FROM estimate_lines WHERE id=?1",
                    [id.to_string()],
                    |r| r.get(0),
                )
                .optional()?;
            let q = q
                .unwrap_or_else(|| "0".into())
                .parse::<D>()
                .map_err(|_| invalid("Cantidad inválida"))?;
            let share = plan.segments.get(&t.id).map_or(D::from(100), |s| s.percent);
            let portion = pct(q, share)?;
            let preceding = allocated.entry(id).or_default();
            let done = add(
                quantities.get(&id).copied().unwrap_or_default(),
                -*preceding,
            )?
            .max(D::ZERO)
            .min(portion);
            t.actual_progress = if portion > D::ZERO {
                mul(div(done, portion)?, 100.into())?
            } else {
                D::ZERO
            };
            *preceding = add(*preceding, portion)?;
        }
    }
    Ok(())
}
pub(crate) fn rows(conn: &Connection, op: &Operation) -> Result<Vec<CertificateRow>> {
    let estimate = op
        .estimate_id
        .ok_or_else(|| invalid("Seleccioná presupuesto"))?;
    let project: Option<String> = conn
        .query_row(
            "SELECT project_id FROM estimates WHERE id=?1",
            [estimate.to_string()],
            |r| r.get(0),
        )
        .optional()?;
    if project.as_deref() != Some(op.project_id.to_string().as_str()) {
        return Err(invalid("Presupuesto ajeno a la obra"));
    }
    let all = crate::operations::documents(conn, Some(op.project_id))?;
    let prior: Vec<_> = all
        .iter()
        .filter(|p| {
            p.kind == op.kind
                && p.id != op.id
                && p.period_end < op.period_start
                && p.estimate_id == op.estimate_id
                && (op.kind != "subcertificate" || p.reference_id == op.reference_id)
        })
        .collect();
    let direct = crate::estimates::checked_budget_total(conn, estimate)?;
    let sale = crate::price_determination::calculate_price(conn, estimate)?
        .breakdown
        .total;
    let factor = if direct > D::ZERO {
        div(sale, direct)?
    } else {
        D::ONE
    };
    let values=conn.prepare("SELECT l.id,l.position,l.description,l.unit,l.quantity,l.unit_cost_snapshot,COALESCE(s.code,''),COALESCE(s.title,'') FROM estimate_lines l LEFT JOIN estimate_line_sections a ON a.line_id=l.id LEFT JOIN budget_sections s ON s.id=a.section_id WHERE l.estimate_id=?1 ORDER BY l.position,l.id")?.query_map([estimate.to_string()],|r|Ok((r.get::<_,String>(0)?,r.get::<_,i64>(1)?,r.get::<_,String>(2)?,r.get::<_,String>(3)?,r.get::<_,String>(4)?,r.get::<_,String>(5)?,r.get::<_,String>(6)?,r.get::<_,String>(7)?)))?.collect::<std::result::Result<Vec<_>,_>>()?;
    let contract = op
        .reference_id
        .and_then(|id| all.iter().find(|c| c.id == id && c.kind == "subcontract"));
    let mut out = vec![];
    for (id, position, description, unit, q, cost, code, section) in values {
        let id: Uuid = id.parse()?;
        let mut quantity = q.parse::<D>().map_err(|_| invalid("Cantidad inválida"))?;
        let mut price = mul(
            cost.parse::<D>().map_err(|_| invalid("Precio inválido"))?,
            factor,
        )?;
        if op.kind == "subcertificate" {
            let Some(line) = contract.and_then(|c| c.lines.iter().find(|l| l.line_id == Some(id)))
            else {
                continue;
            };
            quantity = line.quantity;
            price = line.unit_price;
        }
        let previous = sum(prior
            .iter()
            .flat_map(|p| &p.lines)
            .filter(|l| l.line_id == Some(id))
            .map(|l| l.quantity))?;
        let current = sum(op
            .lines
            .iter()
            .filter(|l| l.line_id == Some(id))
            .map(|l| l.quantity))?;
        let accumulated = add(previous, current)?;
        let percent = |n| {
            if quantity > D::ZERO {
                mul(div(n, quantity)?, 100.into())
            } else {
                Ok(D::ZERO)
            }
        };
        let contract_total = mul(quantity, price)?;
        out.push(CertificateRow {
            line_id: id,
            item: if code.is_empty() {
                format!("{:02}", position + 1)
            } else {
                format!("{}.{:02}", code, position + 1)
            },
            section,
            description,
            unit,
            quantity,
            unit_price: price,
            previous,
            current,
            accumulated,
            remaining: add(quantity, -accumulated)?.max(D::ZERO),
            previous_percent: percent(previous)?,
            current_percent: percent(current)?,
            accumulated_percent: percent(accumulated)?,
            remaining_percent: percent(add(quantity, -accumulated)?.max(D::ZERO))?,
            period_amount: mul(current, price)?,
            contract_total,
            incidence: if sale > D::ZERO {
                mul(div(contract_total, sale)?, 100.into())?
            } else {
                D::ZERO
            },
        });
    }
    Ok(out)
}
pub(crate) fn sheet(
    conn: &Connection,
    op: &Operation,
    preliminary: bool,
) -> Result<CertificateSheet> {
    let rows = rows(conn, op)?;
    let project_name: String = conn.query_row(
        "SELECT name FROM projects WHERE id=?1",
        [op.project_id.to_string()],
        |r| r.get(0),
    )?;
    let budget_title: String = conn.query_row(
        "SELECT title FROM estimates WHERE id=?1",
        [op.estimate_id.unwrap().to_string()],
        |r| r.get(0),
    )?;
    let client_name: String = conn.query_row(
        "SELECT p.name FROM persons p JOIN projects o ON o.client_id=p.id WHERE o.id=?1",
        [op.project_id.to_string()],
        |r| r.get(0),
    )?;
    let profile:Option<String>=conn.query_row("SELECT o.profile_json FROM organizations o JOIN project_organizations p ON p.organization_id=o.id WHERE p.project_id=?1",[op.project_id.to_string()],|r|r.get(0)).optional()?;
    let total_base = sum(rows.iter().map(|r| r.contract_total))?;
    let executed = sum(rows
        .iter()
        .map(|r| mul(r.accumulated, r.unit_price))
        .collect::<Result<Vec<_>>>()?
        .into_iter())?;
    let physical_percent = if total_base > D::ZERO {
        mul(div(executed, total_base)?, 100.into())?
    } else {
        D::ZERO
    };
    Ok(CertificateSheet {
        preliminary,
        project_name,
        budget_title,
        client_name,
        profile: serde_json::from_str(profile.as_deref().unwrap_or("{}"))?,
        operation: op.clone(),
        rows,
        total_base,
        physical_percent,
    })
}
impl LocalStore {
    pub fn available_progress(
        &self,
        project: Uuid,
        estimate: Uuid,
    ) -> Result<Vec<AvailableProgress>> {
        available(&self.conn, project, estimate)
    }
    pub fn certificate_drafts(
        &self,
        project: Uuid,
        estimate: Uuid,
    ) -> Result<Vec<CertificateDraft>> {
        let rows=self.conn.prepare("SELECT payload_json FROM certificate_drafts WHERE project_id=?1 AND estimate_id=?2 ORDER BY updated_at,id")?.query_map(params![project.to_string(),estimate.to_string()],|r|r.get::<_,String>(0))?.collect::<std::result::Result<Vec<_>,_>>()?;
        rows.into_iter()
            .map(|j| serde_json::from_str(&j).map_err(Into::into))
            .collect()
    }
    pub fn open_certificate_draft(
        &mut self,
        project: Uuid,
        estimate: Uuid,
        contract: Option<Uuid>,
        start: &str,
        end: &str,
    ) -> Result<CertificateDraft> {
        for d in [start, end] {
            chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d")
                .map_err(|_| invalid("Fecha de certificado inválida"))?;
        }
        if start > end {
            return Err(invalid("Período invertido"));
        }
        let kind = if contract.is_some() {
            "subcertificate"
        } else {
            "certificate"
        };
        let scope = contract.map_or("client".into(), |id| id.to_string());
        let existing:Option<String>=self.conn.query_row("SELECT payload_json FROM certificate_drafts WHERE project_id=?1 AND estimate_id=?2 AND scope=?3 AND issued_id IS NULL",params![project.to_string(),estimate.to_string(),scope],|r|r.get(0)).optional()?;
        if let Some(j) = existing {
            return Ok(serde_json::from_str(&j)?);
        }
        let e = self
            .get_estimate(estimate)?
            .ok_or_else(|| invalid("Presupuesto inexistente"))?;
        if e.project_id != project {
            return Err(invalid("Presupuesto ajeno"));
        }
        let terms = terms(&self.conn, estimate)?;
        let mut operation = Operation {
            project_id: project,
            estimate_id: Some(estimate),
            kind: kind.into(),
            period_start: start.into(),
            period_end: end.into(),
            date: end.into(),
            due_date: end.into(),
            currency: match e.currency {
                cpobras_core::Currency::Ars => "ARS",
                cpobras_core::Currency::Usd => "USD",
            }
            .into(),
            advance_before_index: true,
            advance_percent: Some(terms.advance_recovery_percent),
            retention_percent: terms.retention_percent,
            ..Default::default()
        };
        if let Some(id) = contract {
            let c = self
                .operation_documents(Some(project))?
                .into_iter()
                .find(|o| o.id == id && o.kind == "subcontract" && o.estimate_id == Some(estimate))
                .ok_or_else(|| invalid("Contrato ajeno al presupuesto"))?;
            operation.partner_id = c.partner_id;
            operation.reference_id = Some(id);
            if let Some(t) = c.contract_terms {
                operation.advance_percent = Some(t.advance_recovery_percent);
                operation.retention_percent = t.retention_percent;
            }
        }
        let rr = rows(&self.conn, &operation)?;
        let progress = rr
            .iter()
            .map(|r| ProgressInput {
                line_id: r.line_id,
                accumulated_percent: r.previous_percent,
                use_approved: true,
            })
            .collect();
        let draft = CertificateDraft {
            id: Uuid::new_v4(),
            project_id: project,
            estimate_id: estimate,
            revision: 0,
            kind: kind.into(),
            operation,
            progress,
            issued_id: None,
        };
        self.conn.execute("INSERT INTO certificate_drafts(id,project_id,estimate_id,scope,kind,revision,payload_json) VALUES(?1,?2,?3,?4,?5,0,?6)",params![draft.id.to_string(),project.to_string(),estimate.to_string(),scope,kind,serde_json::to_string(&draft)?])?;
        Ok(draft)
    }
    pub fn save_certificate_draft(&mut self, input: &CertificateDraft) -> Result<CertificateDraft> {
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let old: String = tx.query_row(
            "SELECT payload_json FROM certificate_drafts WHERE id=?1 AND issued_id IS NULL",
            [input.id.to_string()],
            |r| r.get(0),
        )?;
        let mut d: CertificateDraft = serde_json::from_str(&old)?;
        if d.revision != input.revision
            || d.project_id != input.project_id
            || d.estimate_id != input.estimate_id
            || d.kind != input.kind
            || d.operation.reference_id != input.operation.reference_id
        {
            return Err(invalid(
                "El borrador cambió o pertenece a otro contexto. Recargá antes de guardar",
            ));
        }
        let mut op = input.operation.clone();
        op.id = d.operation.id;
        op.kind = d.kind.clone();
        op.project_id = d.project_id;
        op.estimate_id = Some(d.estimate_id);
        op.index_snapshot = None;
        op.calculated.clear();
        op.progress_sources.clear();
        op.reconciliations.clear();
        op.lines.clear();
        let rr = rows(&tx, &op)?;
        let avail = available(&tx, d.project_id, d.estimate_id)?;
        let mut seen = BTreeSet::new();
        for input in &input.progress {
            if !seen.insert(input.line_id)
                || input.accumulated_percent < D::ZERO
                || input.accumulated_percent > D::from(100)
            {
                return Err(invalid("Porcentaje acumulado inválido o partida repetida"));
            }
            let r = rr
                .iter()
                .find(|r| r.line_id == input.line_id)
                .ok_or_else(|| invalid("Partida ajena al certificado"))?;
            let quantity = pct(r.quantity, input.accumulated_percent)?;
            let amount = add(quantity, -r.previous)?;
            if amount < D::ZERO {
                return Err(invalid(
                    "El acumulado no puede ser menor a lo certificado anteriormente",
                ));
            }
            if amount > D::ZERO {
                op.lines.push(OperationLine {
                    line_id: Some(r.line_id),
                    description: r.description.clone(),
                    quantity: amount,
                    unit_price: r.unit_price,
                    ..Default::default()
                });
                if d.kind == "certificate" && input.use_approved {
                    let mut remaining = amount;
                    for source in avail.iter().filter(|s| s.line_id == r.line_id) {
                        let qty = remaining.min(source.quantity);
                        if qty > D::ZERO {
                            op.progress_sources.push(ProgressSource {
                                source_id: source.source_id,
                                line_id: r.line_id,
                                quantity: qty,
                            });
                            remaining = add(remaining, -qty)?;
                        }
                    }
                }
            }
        }
        d.operation = op;
        d.progress = input.progress.clone();
        d.revision = d
            .revision
            .checked_add(1)
            .ok_or_else(|| invalid("Revisión fuera de rango"))?;
        tx.execute("UPDATE certificate_drafts SET revision=?1,payload_json=?2,updated_at=CURRENT_TIMESTAMP WHERE id=?3",params![d.revision,serde_json::to_string(&d)?,d.id.to_string()])?;
        tx.commit()?;
        Ok(d)
    }
    pub fn preview_certificate_draft(&mut self, id: Uuid) -> Result<CertificateSheet> {
        let j: String = self.conn.query_row(
            "SELECT payload_json FROM certificate_drafts WHERE id=?1",
            [id.to_string()],
            |r| r.get(0),
        )?;
        let d: CertificateDraft = serde_json::from_str(&j)?;
        if let Some(id) = d.issued_id {
            return self.issued_certificate_sheet(id);
        }
        let mut op = d.operation;
        let known = op.date.clone();
        if op.date < op.period_end {
            op.date = op.period_end.clone();
        }
        op.due_date = op.due_date.clone().max(op.date.clone());
        let monetary_contract = op
            .reference_id
            .and_then(|id| {
                self.operation_documents(Some(op.project_id))
                    .ok()?
                    .into_iter()
                    .find(|r| r.id == id)
            })
            .and_then(|r| r.contract_terms)
            .is_some_and(|t| ["fixed", "daily", "hourly"].contains(&t.method.as_str()));
        let mut calculated = if !monetary_contract
            && op.lines.is_empty()
            && op.extras.is_empty()
            && op.reconcile_ids.is_empty()
        {
            op
        } else {
            self.post_operation_mode(&op, true, None, Some(&known))?
        };
        {
            calculated.date = known;
            sheet(&self.conn, &calculated, true)
        }
    }
    pub fn issue_certificate_draft(
        &mut self,
        id: Uuid,
        revision: u32,
        issue_date: &str,
    ) -> Result<Operation> {
        let j: String = self.conn.query_row(
            "SELECT payload_json FROM certificate_drafts WHERE id=?1 AND issued_id IS NULL",
            [id.to_string()],
            |r| r.get(0),
        )?;
        let d: CertificateDraft = serde_json::from_str(&j)?;
        if d.revision != revision {
            return Err(invalid(
                "El borrador cambió; revisá el preliminar actualizado",
            ));
        }
        let mut op = d.operation;
        op.date = issue_date.into();
        let terms = terms(&self.conn, d.estimate_id)?;
        let date = chrono::NaiveDate::parse_from_str(issue_date, "%Y-%m-%d")
            .map_err(|_| invalid("Fecha de emisión inválida"))?;
        op.due_date =
            (date + chrono::Duration::days(i64::from(terms.collection_delay_days))).to_string();
        if op.kind == "certificate" {
            op.advance_percent = Some(terms.advance_recovery_percent);
            op.retention_percent = terms.retention_percent;
        }
        self.post_operation_mode(&op, false, Some((id, revision)), None)
    }
    pub fn issued_certificate_sheet(&self, id: Uuid) -> Result<CertificateSheet> {
        let json: Option<String> = self
            .conn
            .query_row(
                "SELECT sheet_json FROM certificate_sheets WHERE operation_id=?1",
                [id.to_string()],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(j) = json {
            return Ok(serde_json::from_str(&j)?);
        }
        let op = self
            .operation_documents(None)?
            .into_iter()
            .find(|o| o.id == id && ["certificate", "subcertificate"].contains(&o.kind.as_str()))
            .ok_or_else(|| invalid("Certificado inexistente"))?;
        sheet(&self.conn, &op, false)
    }
}

pub(crate) fn pay_date(day: &str, frequency: &str) -> Result<String> {
    use chrono::Datelike;
    let d = chrono::NaiveDate::parse_from_str(day, "%Y-%m-%d")
        .map_err(|_| invalid("Fecha de pago inválida"))?;
    let last = || {
        let n = if d.month() == 12 {
            chrono::NaiveDate::from_ymd_opt(d.year() + 1, 1, 1)
        } else {
            chrono::NaiveDate::from_ymd_opt(d.year(), d.month() + 1, 1)
        }
        .unwrap();
        n - chrono::Duration::days(1)
    };
    Ok(match frequency {
        "weekly" => {
            d + chrono::Duration::days((11 - i64::from(d.weekday().num_days_from_monday())) % 7)
        }
        "fortnight" if d.day() <= 15 => d.with_day(15).unwrap(),
        "fortnight" | "monthly" => last(),
        _ => d,
    }
    .to_string())
}
