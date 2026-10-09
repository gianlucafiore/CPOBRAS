//! Dimension-based takeoffs. Decimal arithmetic and immutable issued budgets.
use super::{LocalStore, Result, StorageError};
use rusqlite::{params, OptionalExtension};
use rust_decimal::Decimal;
use std::str::FromStr;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TakeoffRow {
    pub id: Uuid,
    pub estimate_id: Uuid,
    pub line_id: Uuid,
    pub note: String,
    pub factor: Decimal,
    pub length: Decimal,
    pub width: Decimal,
    pub height: Decimal,
    pub sign: i64,
    pub position: i64,
}

impl TakeoffRow {
    pub fn measured_quantity(&self) -> Result<Decimal> {
        if self.factor < Decimal::ZERO
            || self.length < Decimal::ZERO
            || self.width < Decimal::ZERO
            || self.height < Decimal::ZERO
            || ![-1, 1].contains(&self.sign)
            || self.position < 0
        {
            return Err(StorageError::InvalidValue(
                "invalid takeoff dimensions".into(),
            ));
        }
        let sign = Decimal::new(self.sign, 0);
        self.factor
            .checked_mul(self.length)
            .and_then(|value| value.checked_mul(self.width))
            .and_then(|value| value.checked_mul(self.height))
            .and_then(|value| value.checked_mul(sign))
            .ok_or_else(|| StorageError::InvalidValue("takeoff arithmetic overflow".into()))
    }
}

fn parse_decimal(value: String) -> Result<Decimal> {
    Decimal::from_str(&value)
        .map_err(|_| StorageError::InvalidValue("invalid stored takeoff number".into()))
}

impl LocalStore {
    pub fn save_takeoff_row(&mut self, row: &TakeoffRow) -> Result<()> {
        row.measured_quantity()?;
        self.conn.execute(
            "INSERT INTO takeoff_rows(
               id,estimate_id,line_id,note,factor,length,width,height,sign,position
             ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
             ON CONFLICT(id) DO UPDATE SET
               note=excluded.note,factor=excluded.factor,length=excluded.length,
               width=excluded.width,height=excluded.height,sign=excluded.sign,
               position=excluded.position",
            params![
                row.id.to_string(),
                row.estimate_id.to_string(),
                row.line_id.to_string(),
                row.note,
                row.factor.to_string(),
                row.length.to_string(),
                row.width.to_string(),
                row.height.to_string(),
                row.sign,
                row.position,
            ],
        )?;
        Ok(())
    }

    pub fn list_takeoff_rows(&self, estimate_id: Uuid, line_id: Uuid) -> Result<Vec<TakeoffRow>> {
        let mut stmt = self.conn.prepare(
            "SELECT id,note,factor,length,width,height,sign,position
             FROM takeoff_rows WHERE estimate_id=?1 AND line_id=?2
             ORDER BY position,id",
        )?;
        let rows = stmt.query_map(
            params![estimate_id.to_string(), line_id.to_string()],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, i64>(7)?,
                ))
            },
        )?;
        let mut result = Vec::new();
        for row in rows {
            let (id, note, factor, length, width, height, sign, position) = row?;
            result.push(TakeoffRow {
                id: Uuid::parse_str(&id)?,
                estimate_id,
                line_id,
                note,
                factor: parse_decimal(factor)?,
                length: parse_decimal(length)?,
                width: parse_decimal(width)?,
                height: parse_decimal(height)?,
                sign,
                position,
            });
        }
        Ok(result)
    }

    pub fn measured_line_quantity(&self, estimate_id: Uuid, line_id: Uuid) -> Result<Decimal> {
        let rows = self.list_takeoff_rows(estimate_id, line_id)?;
        if rows.is_empty() {
            return Err(StorageError::InvalidValue(
                "line has no takeoff rows".into(),
            ));
        }
        rows.into_iter().try_fold(Decimal::ZERO, |sum, row| {
            sum.checked_add(row.measured_quantity()?)
                .ok_or_else(|| StorageError::InvalidValue("takeoff arithmetic overflow".into()))
        })
    }

    pub fn apply_takeoff_to_line(&mut self, estimate_id: Uuid, line_id: Uuid) -> Result<Decimal> {
        let quantity = self.measured_line_quantity(estimate_id, line_id)?;
        if quantity < Decimal::ZERO {
            return Err(StorageError::InvalidValue("negative net takeoff".into()));
        }
        let mut line = self
            .estimate_items(estimate_id)?
            .into_iter()
            .find(|entry| entry.id == line_id)
            .ok_or_else(|| StorageError::InvalidValue("estimate line not found".into()))?;
        line.quantity = quantity;
        self.update_estimate_item(&line)?;
        Ok(quantity)
    }

    pub fn delete_takeoff_row(&mut self, id: Uuid) -> Result<()> {
        let changed = self
            .conn
            .execute("DELETE FROM takeoff_rows WHERE id=?1", [id.to_string()])?;
        if changed == 0 {
            return Err(StorageError::InvalidValue("takeoff not found".into()));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::estimates::{Estimate, EstimateItem};
    use cpobras_core::{Client, Currency, Project};

    #[test]
    fn takeoffs_calculate_additions_and_deductions_and_freeze() {
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
            title: "Presupuesto".into(),
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
            quantity: Decimal::ZERO,
            unit_cost_snapshot: Decimal::new(100, 0),
        };
        db.add_estimate_item(&line).unwrap();
        let row = TakeoffRow {
            id: Uuid::new_v4(),
            estimate_id: estimate.id,
            line_id: line.id,
            note: "Paredes".into(),
            factor: Decimal::new(2, 0),
            length: Decimal::new(5, 0),
            width: Decimal::ONE,
            height: Decimal::new(3, 0),
            sign: 1,
            position: 0,
        };
        db.save_takeoff_row(&row).unwrap();
        db.save_takeoff_row(&TakeoffRow {
            id: Uuid::new_v4(),
            note: "Abertura".into(),
            factor: Decimal::ONE,
            length: Decimal::new(2, 0),
            height: Decimal::new(2, 0),
            sign: -1,
            position: 1,
            ..row.clone()
        })
        .unwrap();
        assert_eq!(
            db.apply_takeoff_to_line(estimate.id, line.id).unwrap(),
            Decimal::new(26, 0)
        );
        assert_eq!(
            db.estimate_total(estimate.id).unwrap(),
            Decimal::new(2600, 0)
        );
        let copy = db.duplicate_estimate(estimate.id, "Revisión").unwrap();
        let copied_line = db.estimate_items(copy.id).unwrap().remove(0);
        let copied_rows = db.list_takeoff_rows(copy.id, copied_line.id).unwrap();
        assert_eq!(copied_rows.len(), 2);
        assert_ne!(copied_rows[0].id, row.id);
        assert_eq!(
            db.measured_line_quantity(copy.id, copied_line.id).unwrap(),
            Decimal::new(26, 0)
        );

        db.issue_estimate(estimate.id).unwrap();
        assert!(db.delete_takeoff_row(row.id).is_err());
        assert!(db
            .save_takeoff_row(&TakeoffRow {
                note: "Cambió".into(),
                ..row
            })
            .is_err());
        assert!(db.apply_takeoff_to_line(estimate.id, line.id).is_err());
    }

    #[test]
    fn takeoffs_reject_negative_dimensions() {
        let row = TakeoffRow {
            id: Uuid::new_v4(),
            estimate_id: Uuid::new_v4(),
            line_id: Uuid::new_v4(),
            note: String::new(),
            factor: Decimal::ONE,
            length: Decimal::NEGATIVE_ONE,
            width: Decimal::ONE,
            height: Decimal::ONE,
            sign: 1,
            position: 0,
        };
        assert!(row.measured_quantity().is_err());
    }
}
