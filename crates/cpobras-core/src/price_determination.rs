//! Ordered, exact price determination. Bases depend only on preceding rows.
use crate::{PricingBreakdown, PricingRates};
use chrono::{Datelike, Duration, NaiveDate};
use rust_decimal::Decimal as D;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PriceKind {
    PercentDirect,
    PercentSubtotal,
    PercentProfit,
    Detailed,
    Fixed,
    Subtotal,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PriceRole {
    Overhead,
    Finance,
    Profit,
    Discount,
    Tax,
    Other,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DetailMode {
    Items,
    Manual,
    Reference,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PriceItem {
    pub id: Uuid,
    pub parent_id: Option<Uuid>,
    pub group: bool,
    pub description: String,
    pub unit: String,
    pub participation_percent: D,
    pub quantity: D,
    pub unit_price: D,
    #[serde(default)]
    pub periodic: Option<PeriodicCost>,
}
/// Monthly rentals use calendar months; partial months can be prorated by actual days.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PeriodicCost {
    pub start: String,
    pub end: String,
    pub payment_day: u32,
    pub prorate: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PeriodicPayment {
    pub period_start: String,
    pub period_end: String,
    pub due_date: String,
    pub amount: D,
}
impl PriceItem {
    pub fn payments(&self) -> Result<Vec<PeriodicPayment>, String> {
        let Some(p) = &self.periodic else {
            return Ok(vec![]);
        };
        let parse = |s: &str| {
            NaiveDate::parse_from_str(s, "%Y-%m-%d")
                .ok()
                .filter(|d| d.to_string() == s)
                .ok_or("Fecha de alquiler inválida")
        };
        let start = parse(&p.start)?;
        let end = parse(&p.end)?;
        if self.group
            || end < start
            || end.signed_duration_since(start).num_days() > 3660
            || !(1..=31).contains(&p.payment_day)
            || start.year() < 1
            || end.year() > 9998
        {
            return Err(
                "Revisá el período del alquiler (máximo 10 años) y el día de vencimiento".into(),
            );
        }
        let monthly = percent(
            mul(self.quantity, self.unit_price)?,
            self.participation_percent,
        )?;
        let mut month = start.with_day(1).unwrap();
        let mut payments = vec![];
        while month <= end {
            let next = if month.month() == 12 {
                NaiveDate::from_ymd_opt(month.year() + 1, 1, 1)
            } else {
                NaiveDate::from_ymd_opt(month.year(), month.month() + 1, 1)
            }
            .ok_or("Mes fuera de rango")?;
            let last = next - Duration::days(1);
            let from = start.max(month);
            let to = end.min(last);
            let days = D::from(to.signed_duration_since(from).num_days() + 1);
            let amount = if p.prorate {
                mul(monthly, days)?
                    .checked_div(D::from(last.day()))
                    .ok_or("Importe fuera de rango")?
            } else {
                monthly
            };
            // Never forecast a payment before the contract starts. Day 31 means last day in short months.
            let due = month
                .with_day(p.payment_day.min(last.day()))
                .unwrap()
                .max(from);
            payments.push(PeriodicPayment {
                period_start: from.to_string(),
                period_end: to.to_string(),
                due_date: due.to_string(),
                amount,
            });
            month = next;
        }
        Ok(payments)
    }
    pub fn total(&self) -> Result<D, String> {
        if self.periodic.is_some() {
            self.payments()?
                .iter()
                .try_fold(D::ZERO, |s, p| add(s, p.amount))
        } else {
            percent(
                mul(self.quantity, self.unit_price)?,
                self.participation_percent,
            )
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PriceRow {
    pub id: Uuid,
    pub label: String,
    pub enabled: bool,
    pub kind: PriceKind,
    pub role: PriceRole,
    pub subtract: bool,
    pub percent: D,
    pub amount: D,
    pub detail_mode: DetailMode,
    pub reference_percent: D,
    pub items: Vec<PriceItem>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(deny_unknown_fields)]
pub struct PriceDefinition {
    pub rows: Vec<PriceRow>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PriceRowResult {
    pub id: Uuid,
    pub label: String,
    pub enabled: bool,
    pub kind: PriceKind,
    pub role: PriceRole,
    pub base: D,
    pub amount: D,
    pub running_total: D,
    pub detail_total: D,
    pub reference_total: D,
    pub item_totals: BTreeMap<Uuid, D>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PriceResult {
    pub rows: Vec<PriceRowResult>,
    pub breakdown: PricingBreakdown,
}
fn add(a: D, b: D) -> Result<D, String> {
    a.checked_add(b)
        .ok_or_else(|| "Importe fuera del rango decimal".into())
}
fn mul(a: D, b: D) -> Result<D, String> {
    a.checked_mul(b)
        .ok_or_else(|| "Importe fuera del rango decimal".into())
}
fn percent(a: D, p: D) -> Result<D, String> {
    mul(a, p)?
        .checked_div(D::from(100))
        .ok_or_else(|| "Porcentaje fuera de rango".into())
}
impl PriceDefinition {
    pub fn from_rates(r: PricingRates) -> Self {
        let mut rows = vec![];
        let mut row = |label: &str, kind, role, value, subtract| {
            rows.push(PriceRow {
                // Legacy rows need stable identities across reads and P2P snapshots.
                id: Uuid::from_u128(rows.len() as u128 + 1),
                label: label.into(),
                enabled: true,
                kind,
                role,
                subtract,
                percent: value,
                amount: D::ZERO,
                detail_mode: DetailMode::Reference,
                reference_percent: value,
                items: vec![],
            });
        };
        row(
            "Gastos generales",
            PriceKind::Detailed,
            PriceRole::Overhead,
            r.general_expenses_percent,
            false,
        );
        row(
            "Gastos financieros",
            PriceKind::PercentSubtotal,
            PriceRole::Finance,
            r.financial_expenses_percent,
            false,
        );
        row(
            "Beneficio",
            PriceKind::PercentSubtotal,
            PriceRole::Profit,
            r.profit_percent,
            false,
        );
        row(
            "Descuento",
            PriceKind::PercentSubtotal,
            PriceRole::Discount,
            r.discount_percent,
            true,
        );
        row(
            "Subtotal",
            PriceKind::Subtotal,
            PriceRole::Other,
            D::ZERO,
            false,
        );
        row(
            "Impuestos",
            PriceKind::PercentSubtotal,
            PriceRole::Tax,
            r.tax_percent,
            false,
        );
        for name in ["Supervisión", "Expediente técnico", "Liquidación de obra"] {
            rows.insert(
                rows.len() - 1,
                PriceRow {
                    id: Uuid::from_u128(rows.len() as u128 + 1),
                    label: name.into(),
                    enabled: false,
                    kind: PriceKind::Detailed,
                    role: PriceRole::Other,
                    subtract: false,
                    percent: D::ZERO,
                    amount: D::ZERO,
                    detail_mode: DetailMode::Items,
                    reference_percent: D::ZERO,
                    items: vec![],
                },
            );
        }
        Self { rows }
    }
    pub fn fresh_ids(&self) -> Self {
        let mut copy = self.clone();
        for row in &mut copy.rows {
            row.id = Uuid::new_v4();
            let ids: BTreeMap<_, _> = row.items.iter().map(|i| (i.id, Uuid::new_v4())).collect();
            for i in &mut row.items {
                i.id = ids[&i.id];
                i.parent_id = i.parent_id.and_then(|id| ids.get(&id).copied());
            }
        }
        copy
    }
    pub fn validate_template(&self) -> Result<(), String> {
        if self.rows.len() > 200 || self.rows.iter().map(|r| r.items.len()).sum::<usize>() > 10000 {
            return Err("Plantilla demasiado grande".into());
        }
        let mut ids = BTreeSet::new();
        for row in &self.rows {
            if !ids.insert(row.id) {
                return Err("Línea duplicada en la plantilla".into());
            }
            if row.role == PriceRole::Discount && !row.subtract && row.kind != PriceKind::Subtotal {
                return Err("Una línea de descuento debe restar".into());
            }
            let mut row = row.clone();
            row.subtract = false;
            if row.role == PriceRole::Discount {
                row.role = PriceRole::Other;
            }
            Self { rows: vec![row] }.calculate(D::ZERO)?;
        }
        Ok(())
    }
    pub fn calculate(&self, direct: D) -> Result<PriceResult, String> {
        if direct < D::ZERO || self.rows.len() > 200 {
            return Err("Costo directo o cantidad de líneas inválidos".into());
        }
        let mut row_ids = BTreeSet::new();
        let mut total_items = 0;
        let (mut running, mut overhead, mut finance, mut profit, mut discount, mut taxes) =
            (direct, D::ZERO, D::ZERO, D::ZERO, D::ZERO, D::ZERO);
        let mut results = vec![];
        for row in &self.rows {
            if !row_ids.insert(row.id)
                || row.id.is_nil()
                || row.label.trim().is_empty()
                || row.label.len() > 300
                || row.percent < D::ZERO
                || row.percent > D::from(10000)
                || row.reference_percent < D::ZERO
                || row.reference_percent > D::from(10000)
                || row.amount < D::ZERO
            {
                return Err("Línea de determinación de precio inválida".into());
            }
            total_items += row.items.len();
            if total_items > 10000 {
                return Err("Demasiados ítems en la determinación de precio".into());
            }
            if row.role == PriceRole::Discount && !row.subtract && row.kind != PriceKind::Subtotal {
                return Err("Una línea clasificada como descuento debe restar".into());
            }
            let mut items = BTreeMap::new();
            for i in &row.items {
                if i.id.is_nil()
                    || items.insert(i.id, i).is_some()
                    || i.description.trim().is_empty()
                    || i.description.len() > 500
                    || (!i.group && (i.unit.trim().is_empty() || i.unit.len() > 50))
                    || i.quantity < D::ZERO
                    || i.unit_price < D::ZERO
                    || i.participation_percent < D::ZERO
                    || i.participation_percent > D::from(100)
                {
                    return Err("Detalle inválido: revisá descripción, unidad, cantidad, precio y participación".into());
                }
            }
            for i in &row.items {
                if i.periodic.is_some() {
                    i.payments()?;
                }
            }
            let mut item_totals = BTreeMap::new();
            let mut detail = D::ZERO;
            for i in &row.items {
                if !i.group {
                    let value = i.total()?;
                    item_totals.insert(i.id, value);
                    detail = add(detail, value)?;
                }
            }
            for i in &row.items {
                let mut seen = BTreeSet::new();
                seen.insert(i.id);
                let mut parent = i.parent_id;
                while let Some(id) = parent {
                    if !seen.insert(id) {
                        return Err("El detalle contiene un ciclo de grupos".into());
                    }
                    if seen.len() > 101 {
                        return Err("El detalle admite hasta 100 niveles de grupos".into());
                    }
                    let group = items.get(&id).ok_or("Grupo de detalle inexistente")?;
                    if !group.group {
                        return Err("Un ítem no puede contener otros ítems".into());
                    }
                    parent = group.parent_id;
                }
            }
            for i in row.items.iter().filter(|i| !i.group) {
                let value = item_totals[&i.id];
                let mut parent = i.parent_id;
                while let Some(id) = parent {
                    let old = item_totals.get(&id).copied().unwrap_or_default();
                    item_totals.insert(id, add(old, value)?);
                    parent = items[&id].parent_id;
                }
            }
            let reference = percent(direct, row.reference_percent)?;
            let base = match row.kind {
                PriceKind::PercentDirect => direct,
                PriceKind::PercentSubtotal | PriceKind::Subtotal => running,
                PriceKind::PercentProfit => profit.max(D::ZERO),
                _ => D::ZERO,
            };
            let raw = match row.kind {
                PriceKind::PercentDirect
                | PriceKind::PercentSubtotal
                | PriceKind::PercentProfit => percent(base, row.percent)?,
                PriceKind::Fixed => row.amount,
                PriceKind::Detailed => match row.detail_mode {
                    DetailMode::Items => detail,
                    DetailMode::Manual => row.amount,
                    DetailMode::Reference => reference,
                },
                PriceKind::Subtotal => running,
            };
            let amount = if !row.enabled {
                D::ZERO
            } else if row.subtract && row.kind != PriceKind::Subtotal {
                -raw
            } else {
                raw
            };
            if row.enabled && row.kind != PriceKind::Subtotal {
                running = add(running, amount)?;
                if running < D::ZERO {
                    return Err("Las deducciones superan el acumulado del presupuesto".into());
                }
                match row.role {
                    PriceRole::Overhead | PriceRole::Other => overhead = add(overhead, amount)?,
                    PriceRole::Finance => finance = add(finance, amount)?,
                    PriceRole::Profit => profit = add(profit, amount)?,
                    PriceRole::Discount => discount = add(discount, -amount)?,
                    PriceRole::Tax => taxes = add(taxes, amount)?,
                }
            }
            results.push(PriceRowResult {
                id: row.id,
                label: row.label.clone(),
                enabled: row.enabled,
                kind: row.kind,
                role: row.role,
                base,
                amount,
                running_total: running,
                detail_total: detail,
                reference_total: reference,
                item_totals,
            });
        }
        let taxable_subtotal = add(running, -taxes)?;
        Ok(PriceResult {
            rows: results,
            breakdown: PricingBreakdown {
                direct,
                general_expenses: overhead,
                financial_expenses: finance,
                profit,
                discount,
                taxable_subtotal,
                taxes,
                total: running,
            },
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn d(s: &str) -> D {
        s.parse().unwrap()
    }
    fn row(kind: PriceKind, role: PriceRole, value: &str) -> PriceRow {
        PriceRow {
            id: Uuid::new_v4(),
            label: "Concepto".into(),
            enabled: true,
            kind,
            role,
            subtract: false,
            percent: d(value),
            amount: d(value),
            detail_mode: DetailMode::Items,
            reference_percent: d(value),
            items: vec![],
        }
    }
    #[test]
    fn screenshot_direct_bases_and_iva_are_exact() {
        let mut gg = row(PriceKind::Detailed, PriceRole::Overhead, "10");
        gg.detail_mode = DetailMode::Reference;
        let definition = PriceDefinition {
            rows: vec![
                gg,
                row(PriceKind::PercentDirect, PriceRole::Profit, "15"),
                row(PriceKind::Subtotal, PriceRole::Other, "0"),
                row(PriceKind::PercentSubtotal, PriceRole::Tax, "21"),
            ],
        };
        let result = definition.calculate(d("12356539.73")).unwrap();
        assert_eq!(result.rows[2].amount, d("15445674.6625"));
        assert_eq!(result.breakdown.total, d("18689266.341625"));
    }
    #[test]
    fn legacy_conversion_preserves_every_component() {
        let rates = PricingRates {
            general_expenses_percent: d("10.5"),
            financial_expenses_percent: d("3"),
            profit_percent: d("15"),
            discount_percent: d("2.5"),
            tax_percent: d("21"),
        };
        let direct = d("987654.321");
        assert_eq!(
            PriceDefinition::from_rates(rates)
                .calculate(direct)
                .unwrap()
                .breakdown,
            crate::price_estimate(direct, rates).unwrap()
        );
    }
    #[test]
    fn order_profit_and_disabled_rows_use_only_previous_enabled_concepts() {
        let mut rows = vec![
            row(PriceKind::PercentProfit, PriceRole::Other, "50"),
            row(PriceKind::PercentDirect, PriceRole::Profit, "10"),
            row(PriceKind::PercentProfit, PriceRole::Other, "50"),
            row(PriceKind::PercentSubtotal, PriceRole::Tax, "20"),
        ];
        let result = PriceDefinition { rows: rows.clone() }
            .calculate(d("100"))
            .unwrap();
        assert_eq!(result.rows[0].amount, D::ZERO);
        assert_eq!(result.rows[2].amount, d("5"));
        assert_eq!(result.breakdown.total, d("138"));
        rows[1].enabled = false;
        assert_eq!(
            PriceDefinition { rows: rows.clone() }
                .calculate(d("100"))
                .unwrap()
                .breakdown
                .total,
            d("120")
        );
        rows[1].enabled = true;
        rows.swap(2, 3);
        assert_eq!(
            PriceDefinition { rows }
                .calculate(d("100"))
                .unwrap()
                .breakdown
                .total,
            d("137")
        );
    }
    #[test]
    fn nested_groups_participation_and_modes_never_double_count() {
        let root = Uuid::new_v4();
        let child = Uuid::new_v4();
        let leaf = Uuid::new_v4();
        let group = |id, parent_id| PriceItem {
            id,
            parent_id,
            group: true,
            description: "Grupo".into(),
            unit: "".into(),
            participation_percent: d("100"),
            quantity: D::ZERO,
            unit_price: D::ZERO,
            periodic: None,
        };
        let mut r = row(PriceKind::Detailed, PriceRole::Overhead, "10");
        r.amount = d("7");
        r.items = vec![
            group(root, None),
            group(child, Some(root)),
            PriceItem {
                id: leaf,
                parent_id: Some(child),
                group: false,
                description: "Equipo".into(),
                unit: "mes".into(),
                participation_percent: d("25"),
                quantity: d("2"),
                unit_price: d("100"),
                periodic: None,
            },
        ];
        let mut definition = PriceDefinition { rows: vec![r] };
        let result = definition.calculate(d("100")).unwrap();
        assert_eq!(result.breakdown.total, d("150"));
        for id in [root, child, leaf] {
            assert_eq!(result.rows[0].item_totals[&id], d("50"));
        }
        definition.rows[0].detail_mode = DetailMode::Manual;
        assert_eq!(
            definition.calculate(d("100")).unwrap().breakdown.total,
            d("107")
        );
        definition.rows[0].detail_mode = DetailMode::Reference;
        assert_eq!(
            definition.calculate(d("100")).unwrap().breakdown.total,
            d("110")
        );
        let copy = definition.fresh_ids();
        assert_ne!(copy.rows[0].id, definition.rows[0].id);
        assert_eq!(
            copy.calculate(d("100")).unwrap().rows[0].detail_total,
            d("50")
        );
        definition.rows[0].items[0].parent_id = Some(child);
        assert!(definition.calculate(d("100")).is_err());
        definition.rows[0].items[0].parent_id = Some(Uuid::new_v4());
        assert!(definition.validate_template().is_err());
    }
    #[test]
    fn invalid_deductions_duplicates_and_overflow_are_rejected() {
        let mut r = row(PriceKind::Fixed, PriceRole::Discount, "101");
        r.subtract = true;
        let mut definition = PriceDefinition { rows: vec![r] };
        assert!(definition.calculate(d("100")).is_err());
        assert!(definition.validate_template().is_ok());
        definition.rows[0].amount = d("1");
        definition.rows.push(definition.rows[0].clone());
        assert!(definition.calculate(d("100")).is_err());
        let definition = PriceDefinition {
            rows: vec![row(PriceKind::PercentDirect, PriceRole::Tax, "10000")],
        };
        assert!(definition.calculate(D::MAX).is_err());
    }
    #[test]
    fn monthly_contracts_prorate_leap_february_and_clamp_due_dates() {
        let mut item = PriceItem {
            id: Uuid::new_v4(),
            parent_id: None,
            group: false,
            description: "Alquiler".into(),
            unit: "un".into(),
            participation_percent: d("50"),
            quantity: d("2"),
            unit_price: d("290"),
            periodic: Some(PeriodicCost {
                start: "2024-02-15".into(),
                end: "2024-03-31".into(),
                payment_day: 31,
                prorate: true,
            }),
        };
        let payments = item.payments().unwrap();
        assert_eq!(payments[0].amount, d("150"));
        assert_eq!(payments[0].due_date, "2024-02-29");
        assert_eq!(payments[1].amount, d("290"));
        assert_eq!(item.total().unwrap(), d("440"));
        item.periodic.as_mut().unwrap().prorate = false;
        assert_eq!(item.total().unwrap(), d("580"));
        item.periodic.as_mut().unwrap().payment_day = 5;
        assert_eq!(item.payments().unwrap()[0].due_date, "2024-02-15");
        item.periodic.as_mut().unwrap().end = "2024-02-01".into();
        assert!(item.total().is_err());
        item.periodic.as_mut().unwrap().end = "2040-01-01".into();
        assert!(item.total().is_err());
    }
}
