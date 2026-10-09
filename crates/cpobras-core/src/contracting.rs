//! Compare alternative ways to execute a unit-cost analysis without changing saved estimates.
use crate::{DomainError, ResourceKind, ResourcePriceSnapshot, UnitCostAnalysis};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContractingScenario {
    pub name: String,
    /// Cost breakdown expressed as quantities per unit of the work item.
    pub components: Vec<ResourcePriceSnapshot>,
    /// Additional indirect cost that applies to this particular execution mode.
    pub additional_cost_per_unit: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ContractingComparison {
    pub own_cost_per_unit: Decimal,
    pub subcontract_cost_per_unit: Decimal,
    /// Positive amount indicates subcontracting is more expensive.
    pub subcontract_premium_per_unit: Decimal,
    pub quantity: Decimal,
    pub own_total: Decimal,
    pub subcontract_total: Decimal,
    pub difference_total: Decimal,
}

impl ContractingScenario {
    pub fn direct_cost_per_unit(&self) -> Result<Decimal, DomainError> {
        if self.additional_cost_per_unit < Decimal::ZERO {
            return Err(DomainError::NegativeValue);
        }
        let analysis = UnitCostAnalysis {
            id: uuid::Uuid::nil(),
            code: String::new(),
            description: self.name.clone(),
            unit: String::new(),
            components: self.components.clone(),
        };
        Ok(analysis.direct_unit_cost()? + self.additional_cost_per_unit)
    }
}

pub fn compare_contracting_modes(
    own: &ContractingScenario,
    subcontract: &ContractingScenario,
    quantity: Decimal,
) -> Result<ContractingComparison, DomainError> {
    if quantity < Decimal::ZERO {
        return Err(DomainError::NegativeValue);
    }
    let own_cost_per_unit = own.direct_cost_per_unit()?;
    let subcontract_cost_per_unit = subcontract.direct_cost_per_unit()?;
    let own_total = own_cost_per_unit * quantity;
    let subcontract_total = subcontract_cost_per_unit * quantity;
    Ok(ContractingComparison {
        own_cost_per_unit,
        subcontract_cost_per_unit,
        subcontract_premium_per_unit: subcontract_cost_per_unit - own_cost_per_unit,
        quantity,
        own_total,
        subcontract_total,
        difference_total: subcontract_total - own_total,
    })
}

/// A helper for a scenario based exclusively on a quoted subcontract price.
pub fn quoted_subcontract(
    description: &str,
    resource_id: uuid::Uuid,
    quoted_price_per_unit: Decimal,
) -> ContractingScenario {
    ContractingScenario {
        name: description.to_owned(),
        components: vec![ResourcePriceSnapshot {
            resource_id,
            description: description.to_owned(),
            kind: ResourceKind::Subcontract,
            quantity_per_unit: Decimal::ONE,
            unit_price: quoted_price_per_unit,
        }],
        additional_cost_per_unit: Decimal::ZERO,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn scenarios_account_for_crew_equipment_and_subcontract_quote() {
        let own = ContractingScenario {
            name: "Montaje propio".into(),
            components: vec![
                ResourcePriceSnapshot {
                    resource_id: Uuid::new_v4(),
                    description: "Oficial".into(),
                    kind: ResourceKind::Labor,
                    quantity_per_unit: Decimal::new(2, 0),
                    unit_price: Decimal::new(1000, 0),
                },
                ResourcePriceSnapshot {
                    resource_id: Uuid::new_v4(),
                    description: "Hidroelevador".into(),
                    kind: ResourceKind::Equipment,
                    quantity_per_unit: Decimal::ONE,
                    unit_price: Decimal::new(500, 0),
                },
            ],
            additional_cost_per_unit: Decimal::new(100, 0),
        };
        let subcontract =
            quoted_subcontract("Montaje contratado", Uuid::new_v4(), Decimal::new(3000, 0));
        let result = compare_contracting_modes(&own, &subcontract, Decimal::new(10, 0)).unwrap();
        assert_eq!(result.own_cost_per_unit, Decimal::new(2600, 0));
        assert_eq!(result.subcontract_cost_per_unit, Decimal::new(3000, 0));
        assert_eq!(result.own_total, Decimal::new(26000, 0));
        assert_eq!(result.subcontract_total, Decimal::new(30000, 0));
        assert_eq!(result.difference_total, Decimal::new(4000, 0));
    }

    #[test]
    fn negative_values_and_empty_scenarios_are_rejected() {
        let subcontract = quoted_subcontract("Subcontrato", Uuid::new_v4(), Decimal::ONE);
        assert!(
            compare_contracting_modes(&subcontract, &subcontract, Decimal::NEGATIVE_ONE).is_err()
        );
        let empty = ContractingScenario {
            name: "Vacío".into(),
            components: Vec::new(),
            additional_cost_per_unit: Decimal::ZERO,
        };
        assert_eq!(
            empty.direct_cost_per_unit(),
            Err(DomainError::EmptyAnalysis)
        );
    }
}
