//! Cash forecasts are projections, never ledger entries or automatic certificates.
use crate::operations::{Operation, RecurringExpense};
use crate::{LocalStore, Result, StorageError};
use chrono::{Datelike, Duration, NaiveDate};
use rust_decimal::Decimal as D;
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;
fn err(s: &str) -> StorageError {
    StorageError::InvalidValue(s.into())
}
fn add(a: D, b: D) -> Result<D> {
    a.checked_add(b)
        .ok_or_else(|| err("Importe financiero fuera de rango"))
}
fn sub(a: D, b: D) -> Result<D> {
    add(a, -b)
}
fn mul(a: D, b: D) -> Result<D> {
    a.checked_mul(b)
        .ok_or_else(|| err("Importe financiero fuera de rango"))
}
fn div(a: D, b: D) -> Result<D> {
    a.checked_div(b)
        .ok_or_else(|| err("División financiera inválida"))
}
fn sum(mut v: impl Iterator<Item = D>) -> Result<D> {
    v.try_fold(D::ZERO, add)
}
fn date(s: &str) -> Result<NaiveDate> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|_| err("Fecha financiera inválida"))
}
fn percent(v: D, p: D) -> Result<D> {
    div(mul(v, p)?, D::from(100))
}
#[derive(Debug, Serialize)]
pub struct FundingEvent {
    pub date: String,
    pub description: String,
    pub kind: String,
    pub income: D,
    pub expense: D,
    pub balance: D,
}
#[derive(Debug, Serialize)]
pub struct PeriodMaterial {
    pub resource_id: Uuid,
    pub description: String,
    pub unit: String,
    pub required: D,
    pub from_stock: D,
    pub pending_order: D,
    pub purchase: D,
    pub cost: D,
}
#[derive(Debug, Serialize)]
pub struct FundingPeriod {
    pub start: String,
    pub end: String,
    pub gross: D,
    pub advance: D,
    pub retention: D,
    pub net: D,
    pub collection_date: String,
    pub materials: Vec<PeriodMaterial>,
    pub expenses: D,
    pub receipts: D,
    pub additional_cash: D,
}
#[derive(Debug, Serialize)]
pub struct FinancialProjection {
    pub currency: String,
    pub as_of: String,
    pub periods: Vec<FundingPeriod>,
    pub events: Vec<FundingEvent>,
    pub opening_cash: D,
    pub additional_cash: D,
    pub warnings: Vec<String>,
}
fn payday(day: NaiveDate, frequency: &str) -> NaiveDate {
    let last = || {
        let next = if day.month() == 12 {
            NaiveDate::from_ymd_opt(day.year() + 1, 1, 1)
        } else {
            NaiveDate::from_ymd_opt(day.year(), day.month() + 1, 1)
        }
        .unwrap();
        next - Duration::days(1)
    };
    match frequency {
        "fortnight" if day.day() <= 15 => day.with_day(15).unwrap(),
        "fortnight" | "monthly" => last(),
        _ => day + Duration::days((4 + 7 - i64::from(day.weekday().num_days_from_monday())) % 7),
    }
}
impl LocalStore {
    pub(crate) fn financial_projection(
        &self,
        project_id: Uuid,
        estimate_id: Option<Uuid>,
        as_of: &str,
        rentals: &[RecurringExpense],
    ) -> Result<Option<FinancialProjection>> {
        let (Some(saved), Some(eid)) = (self.project_plan(project_id)?, estimate_id) else {
            return Ok(None);
        };
        let plan = saved.plan;
        let schedule = plan.schedule(as_of).map_err(StorageError::InvalidValue)?;
        let estimate = self
            .get_estimate(eid)?
            .ok_or_else(|| err("Presupuesto inexistente"))?;
        let currency = match estimate.currency {
            cpobras_core::Currency::Ars => "ARS",
            cpobras_core::Currency::Usd => "USD",
        }
        .to_string();
        let today = date(as_of)?;
        let first = (today + Duration::days(1)).max(date(&plan.calendar.start_date)?);
        let mut warnings = BTreeSet::<String>::new();
        let physical_docs: Vec<Operation> = self
            .operation_documents(Some(project_id))?
            .into_iter()
            .filter(|o| o.date.as_str() <= as_of)
            .collect();
        let docs: Vec<Operation> = physical_docs
            .iter()
            .filter(|o| o.currency == currency)
            .cloned()
            .collect();
        if physical_docs.iter().any(|o| {
            o.currency != currency
                && matches!(
                    o.kind.as_str(),
                    "payable" | "receivable" | "purchase_order" | "service_order" | "subcontract"
                )
        }) {
            warnings.insert("Hay compromisos o facturas en otra moneda: sus importes no se incluyen ni se convierten en esta previsión".into());
        }
        let lines: BTreeMap<_, _> = self
            .estimate_items(eid)?
            .into_iter()
            .map(|l| (l.id, l))
            .collect();
        let mut cuts = plan.finance.cut_dates.clone();
        cuts.sort();
        if cuts.is_empty() {
            warnings.insert("Definí cortes de certificación en Planificación para prever los cobros del comitente".into());
        }
        if cuts.last().is_some_and(|c| c < &schedule.finish) {
            warnings.insert("Hay tareas posteriores al último corte de certificación".into());
        }
        let sale = self.priced_estimate_total(eid)?.total;
        let direct = self.estimate_total(eid)?;
        let factor = if direct > D::ZERO {
            div(sale, direct)?
        } else {
            D::ZERO
        };
        let opening_cash = if plan.finance.opening_cash > D::ZERO
            && plan.finance.cash_currency.as_deref() != Some(currency.as_str())
        {
            warnings.insert("La caja declarada está en otra moneda o no tiene moneda: se usa cero en esta previsión".into());
            D::ZERO
        } else {
            plan.finance.opening_cash
        };
        let mut events = Vec::<FundingEvent>::new();
        let mut event = |day: String, description: String, kind: &str, income: D, expense: D| {
            events.push(FundingEvent {
                date: day,
                description,
                kind: kind.into(),
                income,
                expense,
                balance: D::ZERO,
            });
        };
        // Only unpaid balances: invoices supersede certificates and settlements remove outstanding debt.
        for o in &docs {
            let incoming = matches!(
                o.kind.as_str(),
                "receivable" | "certificate" | "retention_receivable"
            );
            let outgoing = matches!(
                o.kind.as_str(),
                "payable" | "subcertificate" | "retention_payable"
            );
            if !incoming && !outgoing {
                continue;
            }
            let settled = sum(docs
                .iter()
                .filter(|p| {
                    p.reference_id == Some(o.id)
                        && p.kind == if incoming { "collection" } else { "payment" }
                })
                .map(|p| p.amount))?;
            let billed = sum(docs
                .iter()
                .filter(|p| {
                    p.reference_id == Some(o.id)
                        && matches!(p.kind.as_str(), "payable" | "receivable")
                })
                .map(|p| p.amount))?;
            let open = sub(sub(o.amount, settled)?, billed)?.max(D::ZERO);
            if open == D::ZERO {
                continue;
            }
            let due = if o.due_date.is_empty() {
                o.date.clone()
            } else {
                o.due_date.clone()
            };
            event(
                due.max(first.to_string()),
                format!(
                    "{} · {}",
                    if incoming { "Por cobrar" } else { "Por pagar" },
                    o.number
                ),
                "obligation",
                if incoming { open } else { D::ZERO },
                if outgoing { open } else { D::ZERO },
            );
        }
        // Uninvoiced commitments retain their own expected payment date. Quantities below also prevent buying them twice.
        for o in docs.iter().filter(|o| {
            matches!(
                o.kind.as_str(),
                "purchase_order" | "service_order" | "subcontract"
            )
        }) {
            let children: BTreeSet<_> = docs
                .iter()
                .filter(|p| p.reference_id == Some(o.id))
                .map(|p| p.id)
                .collect();
            let billed = sum(docs
                .iter()
                .filter(|p| {
                    p.kind == "payable"
                        && (p.reference_id == Some(o.id)
                            || p.reference_id.is_some_and(|id| children.contains(&id)))
                })
                .map(|p| p.amount))?;
            let certified = sum(docs
                .iter()
                .filter(|p| p.kind == "subcertificate" && p.reference_id == Some(o.id))
                .map(|p| p.calculated.get("gross").copied().unwrap_or(p.amount)))?;
            let advances = sum(docs
                .iter()
                .filter(|p| p.kind == "advance_paid" && p.reference_id == Some(o.id))
                .map(|p| p.amount))?;
            let recovered = sum(docs
                .iter()
                .filter(|p| p.kind == "subcertificate" && p.reference_id == Some(o.id))
                .map(|p| p.advance))?;
            let remaining = sub(
                sub(o.amount, billed.max(certified))?,
                sub(advances, recovered)?.max(D::ZERO),
            )?
            .max(D::ZERO);
            if remaining > D::ZERO {
                let due = if o.due_date.is_empty() {
                    warnings.insert(format!(
                        "{} no tiene fecha de pago: se prevé al inicio del próximo período",
                        o.number
                    ));
                    first.to_string()
                } else {
                    o.due_date.clone().max(first.to_string())
                };
                event(
                    due,
                    format!("Compromiso pendiente · {}", o.number),
                    "commitment",
                    D::ZERO,
                    remaining,
                );
            }
        }
        for r in rentals
            .iter()
            .filter(|r| r.currency == currency && r.unbilled > D::ZERO)
        {
            event(
                r.due_date.clone().max(first.to_string()),
                format!("Alquiler · {} · {}", r.description, r.period_start),
                "rental",
                D::ZERO,
                r.unbilled,
            );
        }
        let warehouses: BTreeSet<_> = self
            .operation_warehouses()?
            .iter()
            .filter(|w| w.project_id == project_id)
            .map(|w| w.id)
            .collect();
        let mut stock = BTreeMap::<Uuid, D>::new();
        for b in self
            .operation_stock(as_of)?
            .into_iter()
            .filter(|b| warehouses.contains(&b.warehouse_id))
        {
            let old = stock.entry(b.resource_id).or_default();
            *old = add(*old, b.quantity)?;
        }
        let mut pending = BTreeMap::<Uuid, D>::new();
        for o in physical_docs.iter().filter(|o| o.kind == "purchase_order") {
            for l in &o.lines {
                if let Some(id) = l.resource_id {
                    let old = pending.entry(id).or_default();
                    *old = add(*old, l.quantity)?;
                }
            }
            let ids: BTreeSet<_> = o.lines.iter().filter_map(|l| l.resource_id).collect();
            for id in ids {
                let received = sum(physical_docs
                    .iter()
                    .filter(|d| d.kind == "receipt" && d.reference_id == Some(o.id))
                    .flat_map(|d| &d.lines)
                    .filter(|x| x.resource_id == Some(id))
                    .map(|x| x.quantity))?;
                let old = pending.entry(id).or_default();
                *old = sub(*old, received)?.max(D::ZERO);
            }
        }
        if lines.values().any(|l| {
            l.quantity > D::ZERO && !plan.tasks.iter().any(|t| t.estimate_line_id == Some(l.id))
        }) {
            warnings.insert("Hay partidas sin tareas vinculadas: sus costos y cobros no están distribuidos en esta previsión".into());
        }
        if docs.iter().any(|o| {
            o.kind == "payable"
                && o.reference_id.is_none()
                && o.price_cost.is_none()
                && o.period_start.is_empty()
        }) {
            warnings.insert("Hay facturas sin origen ni período de cuadrilla: verificá si reemplazan algún gasto aún previsto".into());
        }
        let mut materials = BTreeMap::<(String, Uuid), (D, D)>::new();
        let mut daily_cost = BTreeMap::<(String, Uuid), D>::new();
        let mut contracted = BTreeMap::<Uuid, D>::new();
        for o in docs
            .iter()
            .filter(|o| matches!(o.kind.as_str(), "service_order" | "subcontract"))
        {
            for l in &o.lines {
                if let Some(id) = l.line_id {
                    let v = contracted.entry(id).or_default();
                    *v = add(*v, mul(l.quantity, l.unit_price)?)?;
                }
            }
        }
        let mut wages = BTreeMap::<(String, Uuid, Uuid), D>::new();
        let mut crew_terms = BTreeMap::new();
        let mut planned_sale = BTreeMap::<String, D>::new();
        for t in &plan.tasks {
            let Some(line) = t.estimate_line_id.and_then(|id| lines.get(&id)) else {
                continue;
            };
            let Some(s) = schedule.tasks.iter().find(|s| s.id == t.id) else {
                continue;
            };
            let start = date(&s.start)?;
            let finish = date(&s.finish)?;
            let mut days = vec![];
            let mut day = start;
            while day <= finish {
                if plan.calendar.working(day) {
                    days.push(day);
                }
                day += Duration::days(1);
            }
            if days.is_empty() || t.duration_days == 0 {
                continue;
            }
            if finish < first && t.actual_progress < D::from(100) {
                warnings.insert(format!(
                    "{}: plazo pasado con avance incompleto; reprogramá para incluir el saldo",
                    t.name
                ));
            }
            days.retain(|d| *d >= first);
            if days.is_empty() || t.actual_progress == D::from(100) {
                continue;
            }
            let remaining_percent = sub(D::from(100), t.actual_progress)?;
            let remaining_budget = percent(t.budget, remaining_percent)?;
            let allocation = plan.segments.get(&t.id).map_or(D::from(100), |p| p.percent);
            let units = div(
                percent(percent(line.quantity, allocation)?, remaining_percent)?,
                D::from(days.len()),
            )?;
            let analysis = if let Some(id) = line.analysis_id {
                self.get_analysis(id)?
            } else {
                None
            };
            let mut priced_crews = vec![];
            for a in t.assignments.iter().filter(|a| a.kind == "crew") {
                if let Some(c) = self.management_record(a.resource_id)? {
                    let rate = c
                        .attributes
                        .get("daily_rate")
                        .and_then(|s| s.parse::<D>().ok())
                        .unwrap_or_default();
                    let ccy = c
                        .attributes
                        .get("pay_currency")
                        .map(String::as_str)
                        .unwrap_or("ARS");
                    if rate <= D::ZERO || ccy != currency {
                        warnings.insert(format!(
                            "{}: falta jornada de cuadrilla en {}",
                            c.name, currency
                        ));
                        continue;
                    }
                    let frequency = c
                        .attributes
                        .get("pay_frequency")
                        .cloned()
                        .unwrap_or_else(|| "weekly".into());
                    let recovery = c
                        .attributes
                        .get("advance_recovery_percent")
                        .and_then(|s| s.parse::<D>().ok())
                        .unwrap_or_default();
                    priced_crews.push((c.id, rate, a.units_per_day, frequency.clone()));
                    crew_terms.insert(c.id, (c.name, recovery, frequency.clone()));
                }
            }
            for day in days.iter().filter(|d| **d >= first) {
                let iso = day.to_string();
                let old = planned_sale.entry(iso.clone()).or_default();
                *old = add(
                    *old,
                    div(mul(remaining_budget, factor)?, D::from(days.len()))?,
                )?;
                if let Some(a) = &analysis {
                    for c in &a.components {
                        let qty = mul(units, c.quantity_per_unit)?;
                        if c.kind == cpobras_core::ResourceKind::Material {
                            let old = materials.entry((iso.clone(), c.resource_id)).or_default();
                            old.0 = add(old.0, qty)?;
                            old.1 = c.unit_price;
                        } else if c.kind != cpobras_core::ResourceKind::Labor
                            || priced_crews.is_empty()
                        {
                            let old = daily_cost.entry((iso.clone(), line.id)).or_default();
                            *old = add(*old, mul(qty, c.unit_price)?)?;
                        }
                    }
                } else {
                    warnings.insert(format!(
                        "{}: sin ACU, se prevé su costo manual pero no sus materiales",
                        t.name
                    ));
                    let old = daily_cost.entry((iso.clone(), line.id)).or_default();
                    *old = add(*old, div(remaining_budget, D::from(days.len()))?)?;
                }
                if analysis.is_some() {
                    for (id, rate, units, _frequency) in &priced_crews {
                        let old = wages.entry((day.to_string(), *id, line.id)).or_default();
                        *old = add(*old, mul(*rate, *units)?)?;
                    }
                }
            }
        }
        for ((day, id), cost) in daily_cost {
            let covered = contracted.entry(id).or_default();
            let used = cost.min(*covered);
            *covered = sub(*covered, used)?;
            let uncontracted = sub(cost, used)?;
            if uncontracted > D::ZERO {
                event(
                    day,
                    "Servicios / mano de obra aún no contratados".into(),
                    "planned_cost",
                    D::ZERO,
                    uncontracted,
                );
            }
        }
        let mut crew_advance = BTreeMap::<Uuid, D>::new();
        for (id, (name, recovery, _)) in &crew_terms {
            let paid = sum(docs
                .iter()
                .filter(|o| o.kind == "advance_paid" && o.partner_id == Some(*id))
                .map(|o| o.amount))?;
            let recovered = sum(docs
                .iter()
                .filter(|o| {
                    o.partner_id == Some(*id)
                        && matches!(o.kind.as_str(), "subcertificate" | "payable")
                })
                .map(|o| o.advance))?;
            crew_advance.insert(*id, sub(paid, recovered)?.max(D::ZERO));
            if *recovery > D::from(100) || *recovery < D::ZERO {
                return Err(err(&format!("{}: recuperación de anticipo inválida", name)));
            }
        }
        let mut liquidated = BTreeMap::<(String, Uuid), D>::new();
        for o in docs.iter().filter(|o| {
            o.kind == "payable"
                && o.partner_id.is_some_and(|id| crew_terms.contains_key(&id))
                && !o.period_start.is_empty()
                && !o.period_end.is_empty()
        }) {
            let mut days = vec![];
            let mut d = date(&o.period_start)?;
            let end = date(&o.period_end)?;
            if (end - d).num_days() > 3660 {
                return Err(err("Liquidación de cuadrilla demasiado extensa"));
            }
            while d <= end {
                if plan.calendar.working(d) {
                    days.push(d);
                }
                d += Duration::days(1);
            }
            if days.is_empty() {
                continue;
            }
            let daily = div(
                o.calculated.get("gross").copied().unwrap_or(o.amount),
                D::from(days.len()),
            )?;
            for d in days {
                let v = liquidated
                    .entry((d.to_string(), o.partner_id.unwrap()))
                    .or_default();
                *v = add(*v, daily)?;
            }
        }
        let mut grouped = BTreeMap::<(String, Uuid), D>::new();
        for ((day, id, line), gross) in wages {
            let covered = contracted.entry(line).or_default();
            let used = gross.min(*covered);
            *covered = sub(*covered, used)?;
            let uncontracted = sub(gross, used)?;
            let already = liquidated.entry((day.clone(), id)).or_default();
            let billed = uncontracted.min(*already);
            *already = sub(*already, billed)?;
            let v = grouped
                .entry((payday(date(&day)?, &crew_terms[&id].2).to_string(), id))
                .or_default();
            *v = add(*v, sub(uncontracted, billed)?)?;
        }
        for ((day, id), remaining) in grouped {
            let (name, recovery, _) = &crew_terms[&id];
            let balance = crew_advance.entry(id).or_default();
            let deducted = percent(remaining, *recovery)?.min(*balance);
            *balance = sub(*balance, deducted)?;
            event(
                day,
                format!(
                    "Cuadrilla {} · bruto {} · anticipo {}",
                    name, remaining, deducted
                ),
                "crew",
                D::ZERO,
                sub(remaining, deducted)?,
            );
        }
        let mut material_days = Vec::new();
        for ((day, id), (required, price)) in materials {
            let available = stock.entry(id).or_default();
            let from_stock = required.min(*available);
            *available = sub(*available, from_stock)?;
            let balance = sub(required, from_stock)?;
            let ordered = pending.entry(id).or_default();
            let pending_order = balance.min(*ordered);
            *ordered = sub(*ordered, pending_order)?;
            let purchase = sub(balance, pending_order)?;
            let cost = mul(purchase, price)?;
            let r = self.get_resource(id)?;
            let description = r
                .as_ref()
                .map_or_else(|| id.to_string(), |r| r.description.clone());
            let unit = r.as_ref().map_or_else(String::new, |r| r.unit.clone());
            if pending_order > D::ZERO {
                warnings.insert("Hay materiales comprados pendientes de recepción: verificá su entrega antes de iniciar las tareas".into());
            }
            if cost > D::ZERO {
                event(
                    day.clone(),
                    format!("Compra prevista · {}", description),
                    "material",
                    D::ZERO,
                    cost,
                );
            }
            material_days.push((
                day,
                PeriodMaterial {
                    resource_id: id,
                    description,
                    unit,
                    required,
                    from_stock,
                    pending_order,
                    purchase,
                    cost,
                },
            ));
        }
        let mut advance = sum(docs
            .iter()
            .filter(|o| o.kind == "advance_received")
            .map(|o| o.amount))?;
        advance = sub(
            advance,
            sum(docs
                .iter()
                .filter(|o| o.kind == "certificate")
                .map(|o| o.advance))?,
        )?
        .max(D::ZERO);
        let mut periods = vec![];
        let mut previous = date(&plan.calendar.start_date)?;
        for cut in cuts {
            let end = date(&cut)?;
            let start = previous;
            previous = end + Duration::days(1);
            if end < first {
                continue;
            }
            let start = start.max(first);
            let start_iso = start.to_string();
            let mut gross = sum(planned_sale
                .iter()
                .filter(|(d, _)| d.as_str() >= start_iso.as_str() && d.as_str() <= cut.as_str())
                .map(|(_, v)| *v))?;
            let actual_certified = sum(docs
                .iter()
                .filter(|o| {
                    o.kind == "certificate"
                        && o.estimate_id == Some(eid)
                        && o.period_start >= start_iso
                        && o.period_end <= cut
                })
                .map(|o| o.calculated.get("gross").copied().unwrap_or(o.amount)))?;
            gross = sub(gross, actual_certified)?.max(D::ZERO);
            let recovery = percent(gross, plan.finance.advance_recovery_percent)?.min(advance);
            advance = sub(advance, recovery)?;
            let retention = percent(gross, plan.finance.retention_percent)?;
            let net = sub(sub(gross, recovery)?, retention)?;
            if net < D::ZERO {
                return Err(err(
                    "La recuperación y el reparo previstos superan el certificado",
                ));
            }
            let collection =
                (end + Duration::days(i64::from(plan.finance.collection_delay_days))).to_string();
            event(
                collection.clone(),
                format!("Cobro estimado del corte {}", cut),
                "planned_certificate",
                net,
                D::ZERO,
            );
            let mut by_resource = BTreeMap::<Uuid, PeriodMaterial>::new();
            for (_, m) in material_days
                .iter()
                .filter(|(d, _)| d >= &start_iso && d <= &cut)
            {
                let v = by_resource.entry(m.resource_id).or_insert(PeriodMaterial {
                    resource_id: m.resource_id,
                    description: m.description.clone(),
                    unit: m.unit.clone(),
                    required: D::ZERO,
                    from_stock: D::ZERO,
                    pending_order: D::ZERO,
                    purchase: D::ZERO,
                    cost: D::ZERO,
                });
                v.required = add(v.required, m.required)?;
                v.from_stock = add(v.from_stock, m.from_stock)?;
                v.pending_order = add(v.pending_order, m.pending_order)?;
                v.purchase = add(v.purchase, m.purchase)?;
                v.cost = add(v.cost, m.cost)?;
            }
            periods.push(FundingPeriod {
                start: start_iso,
                end: cut,
                gross,
                advance: recovery,
                retention,
                net,
                collection_date: collection,
                materials: by_resource.into_values().collect(),
                expenses: D::ZERO,
                receipts: D::ZERO,
                additional_cash: D::ZERO,
            });
        }
        // Expenses precede uncertain receipts on the same day: conservative working-capital requirement.
        events.sort_by(|a, b| a.date.cmp(&b.date).then_with(|| b.expense.cmp(&a.expense)));
        let mut balance = opening_cash;
        let mut minimum = balance;
        for e in &mut events {
            balance = add(sub(balance, e.expense)?, e.income)?;
            minimum = minimum.min(balance);
            e.balance = balance;
        }
        for p in &mut periods {
            let relevant = events
                .iter()
                .filter(|e| e.date >= p.start && e.date <= p.end)
                .collect::<Vec<_>>();
            p.expenses = sum(relevant.iter().map(|e| e.expense))?;
            p.receipts = sum(relevant.iter().map(|e| e.income))?;
            p.additional_cash = -relevant
                .iter()
                .map(|e| e.balance)
                .min()
                .unwrap_or(D::ZERO)
                .min(D::ZERO);
        }
        Ok(Some(FinancialProjection {
            currency,
            as_of: as_of.into(),
            periods,
            events,
            opening_cash,
            additional_cash: -minimum.min(D::ZERO),
            warnings: warnings.into_iter().collect(),
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn argentina_pay_dates_keep_fridays_half_months_and_leap_month_ends() {
        assert_eq!(
            payday(date("2026-11-09").unwrap(), "weekly").to_string(),
            "2026-11-13"
        );
        assert_eq!(
            payday(date("2026-11-13").unwrap(), "weekly").to_string(),
            "2026-11-13"
        );
        assert_eq!(
            payday(date("2026-11-14").unwrap(), "weekly").to_string(),
            "2026-11-20"
        );
        assert_eq!(
            payday(date("2024-02-14").unwrap(), "fortnight").to_string(),
            "2024-02-15"
        );
        assert_eq!(
            payday(date("2024-02-16").unwrap(), "fortnight").to_string(),
            "2024-02-29"
        );
        assert_eq!(
            payday(date("2026-12-01").unwrap(), "monthly").to_string(),
            "2026-12-31"
        );
    }
}
