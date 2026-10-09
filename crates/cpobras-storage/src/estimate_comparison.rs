//! Compare two revisions of the same project's estimate without changing snapshots.
use super::{LocalStore, Result, StorageError};
use rust_decimal::Decimal;
use std::collections::BTreeMap;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EstimateDelta {
    pub baseline_id: Uuid,
    pub revised_id: Uuid,
    pub baseline_total: Decimal,
    pub revised_total: Decimal,
    pub difference: Decimal,
    pub lines: Vec<EstimateLineDelta>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EstimateLineDelta {
    pub description: String,
    pub unit: String,
    pub baseline_quantity: Decimal,
    pub revised_quantity: Decimal,
    pub baseline_cost: Decimal,
    pub revised_cost: Decimal,
    pub difference: Decimal,
}

impl LocalStore {
    /// Compare estimates from one project with identical currencies. Similar
    /// descriptions and units are grouped, without requiring shared line IDs.
    pub fn compare_estimates(&self, baseline_id: Uuid, revised_id: Uuid) -> Result<EstimateDelta> {
        let baseline = self
            .get_estimate(baseline_id)?
            .ok_or_else(|| StorageError::InvalidValue("baseline not found".into()))?;
        let revised = self
            .get_estimate(revised_id)?
            .ok_or_else(|| StorageError::InvalidValue("revised estimate not found".into()))?;
        if baseline.project_id != revised.project_id || baseline.currency != revised.currency {
            return Err(StorageError::InvalidValue(
                "estimates must belong to the same project and currency".into(),
            ));
        }
        let mut grouped: BTreeMap<(String, String), (Decimal, Decimal, Decimal, Decimal)> =
            BTreeMap::new();
        for line in self.estimate_items(baseline_id)? {
            let line_total = line.total();
            let entry = grouped.entry((line.description, line.unit)).or_insert((
                Decimal::ZERO,
                Decimal::ZERO,
                Decimal::ZERO,
                Decimal::ZERO,
            ));
            entry.0 += line.quantity;
            entry.2 += line_total;
        }
        for line in self.estimate_items(revised_id)? {
            let line_total = line.total();
            let entry = grouped.entry((line.description, line.unit)).or_insert((
                Decimal::ZERO,
                Decimal::ZERO,
                Decimal::ZERO,
                Decimal::ZERO,
            ));
            entry.1 += line.quantity;
            entry.3 += line_total;
        }
        let lines = grouped
            .into_iter()
            .map(
                |(
                    (description, unit),
                    (baseline_quantity, revised_quantity, baseline_cost, revised_cost),
                )| {
                    EstimateLineDelta {
                        description,
                        unit,
                        baseline_quantity,
                        revised_quantity,
                        baseline_cost,
                        revised_cost,
                        difference: revised_cost - baseline_cost,
                    }
                },
            )
            .collect();
        let baseline_total = self.estimate_total(baseline_id)?;
        let revised_total = self.estimate_total(revised_id)?;
        Ok(EstimateDelta {
            baseline_id,
            revised_id,
            baseline_total,
            revised_total,
            difference: revised_total - baseline_total,
            lines,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::estimates::{Estimate, EstimateItem};
    use cpobras_core::{Client, Currency, Project};

    #[test]
    fn comparison_tracks_added_removed_and_repriced_lines() {
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
        let original = Estimate {
            id: Uuid::new_v4(),
            project_id: project.id,
            title: "Base".into(),
            currency: Currency::Ars,
            issued: false,
        };
        db.create_estimate(&original).unwrap();
        let first = EstimateItem {
            id: Uuid::new_v4(),
            estimate_id: original.id,
            position: 0,
            analysis_id: None,
            description: "Acero".into(),
            unit: "kg".into(),
            quantity: Decimal::new(10, 0),
            unit_cost_snapshot: Decimal::new(20, 0),
        };
        db.add_estimate_item(&first).unwrap();
        let revised = db.duplicate_estimate(original.id, "Revisión").unwrap();
        let mut updated = db.estimate_items(revised.id).unwrap().remove(0);
        updated.quantity = Decimal::new(15, 0);
        db.update_estimate_item(&updated).unwrap();
        db.add_estimate_item(&EstimateItem {
            id: Uuid::new_v4(),
            estimate_id: revised.id,
            position: 1,
            analysis_id: None,
            description: "Soldadura".into(),
            unit: "h".into(),
            quantity: Decimal::new(2, 0),
            unit_cost_snapshot: Decimal::new(5, 0),
        })
        .unwrap();
        let diff = db.compare_estimates(original.id, revised.id).unwrap();
        assert_eq!(diff.baseline_total, Decimal::new(200, 0));
        assert_eq!(diff.revised_total, Decimal::new(310, 0));
        assert_eq!(diff.difference, Decimal::new(110, 0));
        assert_eq!(diff.lines.len(), 2);
        assert_eq!(
            db.estimate_total(original.id).unwrap(),
            Decimal::new(200, 0)
        );
    }

    #[test]
    fn comparisons_cannot_mix_projects() {
        let mut db = LocalStore::in_memory().unwrap();
        let client = Client {
            id: Uuid::new_v4(),
            name: "Cliente".into(),
            cuit: None,
        };
        db.save_client(&client).unwrap();
        let mut ids = Vec::new();
        for n in 0..2 {
            let project = Project {
                id: Uuid::new_v4(),
                client_id: client.id,
                name: format!("Obra {n}"),
                currency: Currency::Ars,
            };
            db.save_project(&project).unwrap();
            let estimate = Estimate {
                id: Uuid::new_v4(),
                project_id: project.id,
                title: "Estimación".into(),
                currency: Currency::Ars,
                issued: false,
            };
            db.create_estimate(&estimate).unwrap();
            ids.push(estimate.id);
        }
        assert!(db.compare_estimates(ids[0], ids[1]).is_err());
    }
}
