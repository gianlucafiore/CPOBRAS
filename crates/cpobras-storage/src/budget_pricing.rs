//! Per-estimate price adjustments; emitted versions are immutable.
use super::{LocalStore, Result, StorageError};
use cpobras_core::{price_estimate, PricingBreakdown, PricingRates};
use rusqlite::{params, OptionalExtension};
use rust_decimal::Decimal;
use std::str::FromStr;
use uuid::Uuid;

impl LocalStore {
    pub fn get_estimate_pricing(&self, estimate_id: Uuid) -> Result<PricingRates> {
        let row = self
            .conn
            .query_row(
                "SELECT general_expenses_percent, profit_percent, discount_percent, tax_percent
             FROM estimate_pricing WHERE estimate_id=?1",
                [estimate_id.to_string()],
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
        let parse = |value: &str| {
            Decimal::from_str(value)
                .map_err(|_| StorageError::InvalidValue("invalid persisted pricing rate".into()))
        };
        match row {
            Some((general, profit, discount, tax)) => Ok(PricingRates {
                general_expenses_percent: parse(&general)?,
                profit_percent: parse(&profit)?,
                discount_percent: parse(&discount)?,
                tax_percent: parse(&tax)?,
            }),
            None => Ok(PricingRates::default()),
        }
    }

    pub fn save_estimate_pricing(&mut self, estimate_id: Uuid, rates: PricingRates) -> Result<()> {
        price_estimate(Decimal::ZERO, rates)
            .map_err(|err| StorageError::InvalidValue(err.to_string()))?;
        if self.get_estimate(estimate_id)?.is_none() {
            return Err(StorageError::InvalidValue("estimate not found".into()));
        }
        self.conn.execute(
            "INSERT INTO estimate_pricing (
                 estimate_id, general_expenses_percent, profit_percent,
                 discount_percent, tax_percent)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(estimate_id) DO UPDATE SET
                 general_expenses_percent=excluded.general_expenses_percent,
                 profit_percent=excluded.profit_percent,
                 discount_percent=excluded.discount_percent,
                 tax_percent=excluded.tax_percent",
            params![
                estimate_id.to_string(),
                rates.general_expenses_percent.to_string(),
                rates.profit_percent.to_string(),
                rates.discount_percent.to_string(),
                rates.tax_percent.to_string(),
            ],
        )?;
        Ok(())
    }

    pub fn priced_estimate_total(&self, estimate_id: Uuid) -> Result<PricingBreakdown> {
        if self.get_estimate(estimate_id)?.is_none() {
            return Err(StorageError::InvalidValue("estimate not found".into()));
        }
        let direct = self.estimate_total(estimate_id)?;
        let rates = self.get_estimate_pricing(estimate_id)?;
        price_estimate(direct, rates).map_err(|err| StorageError::InvalidValue(err.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::estimates::{Estimate, EstimateItem};
    use cpobras_core::{Client, Currency, Project};

    #[test]
    fn persisted_pricing_is_exact_and_issued_budget_is_immutable() {
        let mut db = LocalStore::in_memory().unwrap();
        let client = Client {
            id: Uuid::new_v4(),
            name: "Cliente".into(),
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
            title: "Cotización".into(),
            currency: Currency::Ars,
            issued: false,
        };
        db.create_estimate(&estimate).unwrap();
        db.add_estimate_item(&EstimateItem {
            id: Uuid::new_v4(),
            estimate_id: estimate.id,
            position: 0,
            analysis_id: None,
            description: "Acero".into(),
            unit: "kg".into(),
            quantity: Decimal::new(10, 0),
            unit_cost_snapshot: Decimal::new(10, 0),
        })
        .unwrap();
        let rates = PricingRates {
            general_expenses_percent: Decimal::new(10, 0),
            profit_percent: Decimal::new(20, 0),
            discount_percent: Decimal::new(5, 0),
            tax_percent: Decimal::new(21, 0),
        };
        db.save_estimate_pricing(estimate.id, rates).unwrap();
        assert_eq!(db.get_estimate_pricing(estimate.id).unwrap(), rates);
        assert_eq!(
            db.priced_estimate_total(estimate.id).unwrap().total,
            Decimal::from_str("151.734").unwrap()
        );
        let copy = db.duplicate_estimate(estimate.id, "Duplicado").unwrap();
        assert_eq!(db.get_estimate_pricing(copy.id).unwrap(), rates);
        db.issue_estimate(estimate.id).unwrap();
        assert!(db
            .save_estimate_pricing(estimate.id, PricingRates::default())
            .is_err());
        assert_eq!(
            db.priced_estimate_total(estimate.id).unwrap().total,
            Decimal::from_str("151.734").unwrap()
        );
    }
}
