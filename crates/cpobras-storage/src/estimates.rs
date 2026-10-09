//! Estimate drafts and immutable issued snapshots.
use super::{LocalStore, Result, StorageError};
use cpobras_core::{Currency, EstimateLine};
use rusqlite::{params, OptionalExtension};
use rust_decimal::Decimal;
use std::str::FromStr;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Estimate {
    pub id: Uuid,
    pub project_id: Uuid,
    pub title: String,
    pub currency: Currency,
    pub issued: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
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

impl LocalStore {
    pub fn create_estimate(&mut self, estimate: &Estimate) -> Result<()> {
        if estimate.title.trim().is_empty() || estimate.issued {
            return Err(StorageError::InvalidValue(
                "new estimate must have a title and start as draft".into(),
            ));
        }
        self.conn.execute(
            "INSERT INTO estimates(id, project_id, title, currency) VALUES (?1, ?2, ?3, ?4)",
            params![
                estimate.id.to_string(),
                estimate.project_id.to_string(),
                estimate.title,
                currency_code(estimate.currency),
            ],
        )?;
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
        {
            return Err(StorageError::InvalidValue("invalid estimate line".into()));
        }
        self.conn.execute(
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
        Ok(())
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

    pub fn issue_estimate(&mut self, id: Uuid) -> Result<()> {
        let changed = self.conn.execute(
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
}
