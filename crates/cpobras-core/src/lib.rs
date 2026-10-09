//! CPOBRAS domain logic: deterministic quantities and money (never f32/f64).
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
                Ok(total + item.quantity_per_unit * item.unit_price)
            })
    }
}

pub fn estimate_total(lines: &[EstimateLine]) -> Result<Decimal, DomainError> {
    lines.iter().try_fold(Decimal::ZERO, |total, line| {
        if line.quantity < Decimal::ZERO || line.unit_cost_snapshot < Decimal::ZERO {
            return Err(DomainError::NegativeValue);
        }
        Ok(total + line.quantity * line.unit_cost_snapshot)
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
