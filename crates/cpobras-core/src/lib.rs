//! CPOBRAS domain logic: deterministic quantities and money (never f32/f64).
pub mod contracting;
pub mod costing;
pub mod planning;

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum Currency {
    Ars,
    Usd,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Client {
    pub id: Uuid,
    pub name: String,
    pub cuit: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Project {
    pub id: Uuid,
    pub client_id: Uuid,
    pub name: String,
    pub currency: Currency,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ResourceKind {
    Material,
    Labor,
    Equipment,
    Subcontract,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourcePriceSnapshot {
    pub resource_id: Uuid,
    pub description: String,
    pub kind: ResourceKind,
    pub quantity_per_unit: Decimal,
    pub unit_price: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnitCostAnalysis {
    pub id: Uuid,
    pub code: String,
    pub description: String,
    pub unit: String,
    pub components: Vec<ResourcePriceSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EstimateLine {
    pub analysis_id: Uuid,
    pub quantity: Decimal,
    pub unit_cost_snapshot: Decimal,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum DomainError {
    #[error("decimal arithmetic overflow")]
    Overflow,
    #[error("quantity or price cannot be negative")]
    NegativeValue,
    #[error("cost analysis has no components")]
    EmptyAnalysis,
}

impl UnitCostAnalysis {
    pub fn direct_unit_cost(&self) -> Result<Decimal, DomainError> {
        if self.components.is_empty() {
            return Err(DomainError::EmptyAnalysis);
        }
        self.components
            .iter()
            .try_fold(Decimal::ZERO, |total, item| {
                if item.quantity_per_unit < Decimal::ZERO || item.unit_price < Decimal::ZERO {
                    return Err(DomainError::NegativeValue);
                }
                item.quantity_per_unit
                    .checked_mul(item.unit_price)
                    .and_then(|value| total.checked_add(value))
                    .ok_or(DomainError::Overflow)
            })
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct PricingRates {
    #[serde(default)]
    pub financial_expenses_percent: Decimal,
    pub general_expenses_percent: Decimal,
    pub profit_percent: Decimal,
    pub discount_percent: Decimal,
    pub tax_percent: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PricingBreakdown {
    pub financial_expenses: Decimal,
    pub direct: Decimal,
    pub general_expenses: Decimal,
    pub profit: Decimal,
    pub discount: Decimal,
    pub taxable_subtotal: Decimal,
    pub taxes: Decimal,
    pub total: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct CostBreakdown {
    pub materials: Decimal,
    pub labor: Decimal,
    pub equipment: Decimal,
    pub subcontract: Decimal,
    pub total: Decimal,
}

/// Percentages are applied in order: general expenses on direct cost;
/// profit on direct + general; discount on that subtotal;
/// tax on the discounted amount. All calculations use Decimal.
pub fn price_estimate(
    direct: Decimal,
    rates: PricingRates,
) -> Result<PricingBreakdown, DomainError> {
    let values = [
        direct,
        rates.general_expenses_percent,
        rates.financial_expenses_percent,
        rates.profit_percent,
        rates.discount_percent,
        rates.tax_percent,
    ];
    if values.iter().any(|value| *value < Decimal::ZERO)
        || rates.discount_percent > Decimal::new(100, 0)
    {
        return Err(DomainError::NegativeValue);
    }
    let hundred = Decimal::new(100, 0);
    let percent = |amount: Decimal, rate: Decimal| {
        amount
            .checked_mul(rate)
            .and_then(|value| value.checked_div(hundred))
            .ok_or(DomainError::Overflow)
    };
    let add = |a: Decimal, b: Decimal| a.checked_add(b).ok_or(DomainError::Overflow);
    let general_expenses = percent(direct, rates.general_expenses_percent)?;
    let financial_expenses = percent(
        add(direct, general_expenses)?,
        rates.financial_expenses_percent,
    )?;
    let base = add(add(direct, general_expenses)?, financial_expenses)?;
    let profit = percent(base, rates.profit_percent)?;
    let subtotal = add(base, profit)?;
    let discount = percent(subtotal, rates.discount_percent)?;
    let taxable_subtotal = subtotal
        .checked_sub(discount)
        .ok_or(DomainError::Overflow)?;
    let taxes = percent(taxable_subtotal, rates.tax_percent)?;
    Ok(PricingBreakdown {
        financial_expenses,
        direct,
        general_expenses,
        profit,
        discount,
        taxable_subtotal,
        taxes,
        total: add(taxable_subtotal, taxes)?,
    })
}

impl UnitCostAnalysis {
    pub fn cost_breakdown(&self) -> Result<CostBreakdown, DomainError> {
        if self.components.is_empty() {
            return Err(DomainError::EmptyAnalysis);
        }
        let mut breakdown = CostBreakdown::default();
        for item in &self.components {
            if item.quantity_per_unit < Decimal::ZERO || item.unit_price < Decimal::ZERO {
                return Err(DomainError::NegativeValue);
            }
            let amount = item
                .quantity_per_unit
                .checked_mul(item.unit_price)
                .ok_or(DomainError::Overflow)?;
            match item.kind {
                ResourceKind::Material => {
                    breakdown.materials = breakdown
                        .materials
                        .checked_add(amount)
                        .ok_or(DomainError::Overflow)?
                }
                ResourceKind::Labor => {
                    breakdown.labor = breakdown
                        .labor
                        .checked_add(amount)
                        .ok_or(DomainError::Overflow)?
                }
                ResourceKind::Equipment => {
                    breakdown.equipment = breakdown
                        .equipment
                        .checked_add(amount)
                        .ok_or(DomainError::Overflow)?
                }
                ResourceKind::Subcontract => {
                    breakdown.subcontract = breakdown
                        .subcontract
                        .checked_add(amount)
                        .ok_or(DomainError::Overflow)?
                }
            }
            breakdown.total = breakdown
                .total
                .checked_add(amount)
                .ok_or(DomainError::Overflow)?;
        }
        Ok(breakdown)
    }
}

pub fn estimate_total(lines: &[EstimateLine]) -> Result<Decimal, DomainError> {
    lines.iter().try_fold(Decimal::ZERO, |total, line| {
        if line.quantity < Decimal::ZERO || line.unit_cost_snapshot < Decimal::ZERO {
            return Err(DomainError::NegativeValue);
        }
        line.quantity
            .checked_mul(line.unit_cost_snapshot)
            .and_then(|value| total.checked_add(value))
            .ok_or(DomainError::Overflow)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal::Decimal;
    use std::str::FromStr;

    #[test]
    fn computes_decimal_cost_without_floating_point() {
        let item = UnitCostAnalysis {
            id: Uuid::new_v4(),
            code: "01".into(),
            description: "Mampostería".into(),
            unit: "m2".into(),
            components: vec![ResourcePriceSnapshot {
                resource_id: Uuid::new_v4(),
                description: "Ladrillo".into(),
                kind: ResourceKind::Material,
                quantity_per_unit: Decimal::from_str("2.5").unwrap(),
                unit_price: Decimal::from_str("10.20").unwrap(),
            }],
        };
        assert_eq!(
            item.direct_unit_cost().unwrap(),
            Decimal::from_str("25.50").unwrap()
        );
    }

    #[test]
    fn breakdown_separates_categories_without_double_counting() {
        let analysis = UnitCostAnalysis {
            id: Uuid::new_v4(),
            code: "01".into(),
            description: "Metal".into(),
            unit: "kg".into(),
            components: vec![
                ResourcePriceSnapshot {
                    resource_id: Uuid::new_v4(),
                    description: "Acero".into(),
                    kind: ResourceKind::Material,
                    quantity_per_unit: Decimal::new(2, 0),
                    unit_price: Decimal::new(10, 0),
                },
                ResourcePriceSnapshot {
                    resource_id: Uuid::new_v4(),
                    description: "Soldador".into(),
                    kind: ResourceKind::Labor,
                    quantity_per_unit: Decimal::new(1, 0),
                    unit_price: Decimal::new(15, 0),
                },
                ResourcePriceSnapshot {
                    resource_id: Uuid::new_v4(),
                    description: "Grúa".into(),
                    kind: ResourceKind::Equipment,
                    quantity_per_unit: Decimal::new(1, 0),
                    unit_price: Decimal::new(5, 0),
                },
                ResourcePriceSnapshot {
                    resource_id: Uuid::new_v4(),
                    description: "Montaje".into(),
                    kind: ResourceKind::Subcontract,
                    quantity_per_unit: Decimal::new(1, 0),
                    unit_price: Decimal::new(8, 0),
                },
            ],
        };
        let breakdown = analysis.cost_breakdown().unwrap();
        assert_eq!(breakdown.materials, Decimal::new(20, 0));
        assert_eq!(breakdown.labor, Decimal::new(15, 0));
        assert_eq!(breakdown.equipment, Decimal::new(5, 0));
        assert_eq!(breakdown.subcontract, Decimal::new(8, 0));
        assert_eq!(breakdown.total, Decimal::new(48, 0));
        assert_eq!(analysis.direct_unit_cost().unwrap(), breakdown.total);
    }

    #[test]
    fn indirect_costs_profit_discount_and_tax_use_exact_decimal_math() {
        let rates = PricingRates {
            general_expenses_percent: Decimal::new(10, 0),
            financial_expenses_percent: Decimal::ZERO,
            profit_percent: Decimal::new(20, 0),
            discount_percent: Decimal::new(5, 0),
            tax_percent: Decimal::new(21, 0),
        };
        let result = price_estimate(Decimal::new(100, 0), rates).unwrap();
        assert_eq!(result.general_expenses, Decimal::new(10, 0));
        assert_eq!(result.profit, Decimal::new(22, 0));
        assert_eq!(result.discount, Decimal::from_str("6.6").unwrap());
        assert_eq!(result.taxable_subtotal, Decimal::from_str("125.4").unwrap());
        assert_eq!(result.taxes, Decimal::from_str("26.334").unwrap());
        assert_eq!(result.total, Decimal::from_str("151.734").unwrap());
        assert!(price_estimate(
            Decimal::ONE,
            PricingRates {
                discount_percent: Decimal::new(101, 0),
                ..rates
            }
        )
        .is_err());
    }

    #[test]
    fn rejects_negative_prices() {
        let item = UnitCostAnalysis {
            id: Uuid::new_v4(),
            code: "01".into(),
            description: "Prueba".into(),
            unit: "u".into(),
            components: vec![ResourcePriceSnapshot {
                resource_id: Uuid::new_v4(),
                description: "Insumo".into(),
                kind: ResourceKind::Material,
                quantity_per_unit: Decimal::ONE,
                unit_price: Decimal::NEGATIVE_ONE,
            }],
        };
        assert_eq!(item.direct_unit_cost(), Err(DomainError::NegativeValue));
    }
}

#[cfg(test)]
mod arithmetic_regressions {
    use super::*;
    #[test]
    fn extreme_financial_values_return_errors_instead_of_panicking() {
        let rates = PricingRates {
            general_expenses_percent: Decimal::from(10),
            financial_expenses_percent: Decimal::from(5),
            profit_percent: Decimal::from(20),
            discount_percent: Decimal::from(10),
            tax_percent: Decimal::from(21),
        };
        assert_eq!(
            price_estimate(Decimal::from(100), rates).unwrap().total,
            Decimal::new(1509354, 4)
        );

        assert_eq!(
            price_estimate(
                Decimal::MAX,
                PricingRates {
                    general_expenses_percent: Decimal::from(100),
                    ..PricingRates::default()
                }
            ),
            Err(DomainError::Overflow)
        );
        let analysis = UnitCostAnalysis {
            id: Uuid::new_v4(),
            code: "X".into(),
            description: "Extremo".into(),
            unit: "u".into(),
            components: vec![ResourcePriceSnapshot {
                resource_id: Uuid::new_v4(),
                description: "Insumo".into(),
                kind: ResourceKind::Material,
                quantity_per_unit: Decimal::MAX,
                unit_price: Decimal::from(2),
            }],
        };
        assert_eq!(analysis.direct_unit_cost(), Err(DomainError::Overflow));
        assert!(analysis.cost_breakdown().is_err());
    }
}
