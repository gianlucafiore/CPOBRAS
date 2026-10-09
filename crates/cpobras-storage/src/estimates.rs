//! Estimate drafts and immutable issued snapshots.
use super::{LocalStore, Result, StorageError};
use cpobras_core::{Currency, EstimateLine};
use rusqlite::{params, OptionalExtension};
use rust_decimal::Decimal;
use std::collections::{HashMap, HashSet};
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

    /// Edits an existing draft line; issued estimate triggers enforce immutability.
    pub fn update_estimate_item(&mut self, item: &EstimateItem) -> Result<()> {
        if item.description.trim().is_empty()
            || item.unit.trim().is_empty()
            || item.quantity < Decimal::ZERO
            || item.unit_cost_snapshot < Decimal::ZERO
            || item.position < 0
        {
            return Err(StorageError::InvalidValue("invalid estimate line".into()));
        }
        let changed = self.conn.execute(
            "UPDATE estimate_lines SET description=?1, unit=?2, quantity=?3, unit_cost_snapshot=?4
             WHERE id=?5 AND estimate_id=?6",
            params![
                item.description,
                item.unit,
                item.quantity.to_string(),
                item.unit_cost_snapshot.to_string(),
                item.id.to_string(),
                item.estimate_id.to_string(),
            ],
        )?;
        if changed != 1 {
            return Err(StorageError::InvalidValue("estimate line not found".into()));
        }
        Ok(())
    }

    pub fn delete_estimate_item(&mut self, estimate_id: Uuid, item_id: Uuid) -> Result<()> {
        let changed = self.conn.execute(
            "DELETE FROM estimate_lines WHERE id=?1 AND estimate_id=?2",
            params![item_id.to_string(), estimate_id.to_string()],
        )?;
        if changed != 1 {
            return Err(StorageError::InvalidValue("estimate line not found".into()));
        }
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
            if let Some(section_id) = assignments.get(&entry.id) {
                transaction.execute(
                    "INSERT INTO estimate_line_sections(line_id, section_id) VALUES (?1, ?2)",
                    params![new_line_id.to_string(), section_ids[section_id].to_string()],
                )?;
            }
        }
        transaction.execute(
            "INSERT INTO estimate_pricing (
                estimate_id, general_expenses_percent, profit_percent, discount_percent, tax_percent)
             SELECT ?1, general_expenses_percent, profit_percent, discount_percent, tax_percent
             FROM estimate_pricing WHERE estimate_id=?2",
            params![copy.id.to_string(), source_id.to_string()],
        )?;
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
}
