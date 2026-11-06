//! Direct line composition and atomic drag/drop changes. Shared ACUs are never edited.
use crate::{estimates::checked_budget_total, LocalStore, Result, StorageError};
use cpobras_core::{ResourcePriceSnapshot, UnitCostAnalysis};
use rusqlite::{params, OptionalExtension};
use rust_decimal::Decimal;
use serde::Deserialize;
use uuid::Uuid;
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineResourceInput {
    pub resource_id: Uuid,
    pub quantity: Decimal,
    pub unit_price: Decimal,
}
fn invalid(message: &str) -> StorageError {
    StorageError::InvalidValue(message.into())
}
impl LocalStore {
    pub fn is_line_analysis(&self, id: Uuid) -> Result<bool> {
        Ok(self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM line_analysis_snapshots WHERE analysis_id=?1)",
            [id.to_string()],
            |r| r.get(0),
        )?)
    }
    pub fn save_line_resources(
        &mut self,
        estimate_id: Uuid,
        line_id: Uuid,
        inputs: &[LineResourceInput],
    ) -> Result<Uuid> {
        if inputs.is_empty() || inputs.len() > 1000 {
            return Err(invalid("Agregá entre 1 y 1000 insumos"));
        }
        let line = self
            .estimate_items(estimate_id)?
            .into_iter()
            .find(|line| line.id == line_id)
            .ok_or_else(|| invalid("Partida inexistente en este presupuesto"))?;
        let mut components = Vec::new();
        for input in inputs {
            let resource = self
                .get_resource(input.resource_id)?
                .ok_or_else(|| invalid("El insumo ya no existe en el catálogo"))?;
            if !resource.active {
                return Err(invalid("No se pueden asignar insumos inactivos"));
            }
            components.push(ResourcePriceSnapshot {
                resource_id: resource.id,
                description: resource.description,
                kind: resource.kind,
                quantity_per_unit: input.quantity,
                unit_price: input.unit_price,
            });
        }
        let analysis = UnitCostAnalysis {
            id: Uuid::new_v4(),
            code: format!("PART-{}", Uuid::new_v4()),
            description: line.description,
            unit: line.unit,
            components,
        };
        let cost = analysis
            .direct_unit_cost()
            .map_err(|e| invalid(&e.to_string()))?;
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let status: Option<String> = tx
            .query_row(
                "SELECT status FROM estimates WHERE id=?1",
                [estimate_id.to_string()],
                |r| r.get(0),
            )
            .optional()?;
        if status.as_deref() != Some("draft") {
            return Err(invalid(
                "Los insumos de un presupuesto emitido no se modifican",
            ));
        }
        tx.execute(
            "INSERT INTO analyses(id,code,description,unit,snapshot_json) VALUES (?1,?2,?3,?4,?5)",
            params![
                analysis.id.to_string(),
                analysis.code,
                analysis.description,
                analysis.unit,
                serde_json::to_string(&analysis)?
            ],
        )?;
        tx.execute(
            "INSERT INTO line_analysis_snapshots(analysis_id) VALUES (?1)",
            [analysis.id.to_string()],
        )?;
        let changed=tx.execute("UPDATE estimate_lines SET analysis_id=?1,unit_cost_snapshot=?2 WHERE id=?3 AND estimate_id=?4",params![analysis.id.to_string(),cost.to_string(),line_id.to_string(),estimate_id.to_string()])?;
        if changed != 1 {
            return Err(invalid("La partida ya no existe"));
        }
        let mut prices = std::collections::BTreeMap::new();
        for input in inputs {
            if let Some(old) = prices.insert(input.resource_id, input.unit_price) {
                if old != input.unit_price {
                    return Err(invalid(
                        "Un mismo insumo no puede tener dos precios en el presupuesto",
                    ));
                }
            }
        }
        crate::estimate_resource_prices::synchronize(&tx, estimate_id, &prices)?;
        checked_budget_total(&tx, estimate_id)?;
        tx.commit()?;
        Ok(analysis.id)
    }
    pub fn move_budget_line(
        &mut self,
        estimate_id: Uuid,
        line_id: Uuid,
        before_id: Option<Uuid>,
        section_id: Option<Uuid>,
    ) -> Result<()> {
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let status: Option<String> = tx
            .query_row(
                "SELECT status FROM estimates WHERE id=?1",
                [estimate_id.to_string()],
                |r| r.get(0),
            )
            .optional()?;
        if status.as_deref() != Some("draft") {
            return Err(invalid("Solo se reordenan presupuestos en borrador"));
        }
        let mut order: Vec<String> = tx
            .prepare("SELECT id FROM estimate_lines WHERE estimate_id=?1 ORDER BY position,id")?
            .query_map([estimate_id.to_string()], |r| r.get(0))?
            .collect::<std::result::Result<_, _>>()?;
        let line = line_id.to_string();
        if !order.contains(&line) {
            return Err(invalid("Partida ajena al presupuesto"));
        }
        if before_id == Some(line_id) {
            return Ok(());
        }
        if let Some(section) = section_id {
            let valid: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM budget_sections WHERE id=?1 AND estimate_id=?2)",
                params![section.to_string(), estimate_id.to_string()],
                |r| r.get(0),
            )?;
            if !valid {
                return Err(invalid("El rubro no pertenece a este presupuesto"));
            }
        }
        order.retain(|id| id != &line);
        let index = if let Some(before) = before_id {
            order
                .iter()
                .position(|id| id == &before.to_string())
                .ok_or_else(|| invalid("La partida de destino ya no existe"))?
        } else {
            order.len()
        };
        order.insert(index, line.clone());
        let maximum: i64 = tx.query_row(
            "SELECT COALESCE(MAX(position),0) FROM estimate_lines WHERE estimate_id=?1",
            [estimate_id.to_string()],
            |r| r.get(0),
        )?;
        let shift = maximum
            .checked_add(order.len() as i64 + 1)
            .ok_or_else(|| invalid("Orden fuera de rango"))?;
        maximum
            .checked_add(shift)
            .ok_or_else(|| invalid("Orden fuera de rango"))?;
        tx.execute(
            "UPDATE estimate_lines SET position=position+?1 WHERE estimate_id=?2",
            params![shift, estimate_id.to_string()],
        )?;
        for (position, id) in order.iter().enumerate() {
            tx.execute(
                "UPDATE estimate_lines SET position=?1 WHERE id=?2 AND estimate_id=?3",
                params![position as i64, id, estimate_id.to_string()],
            )?;
        }
        tx.execute(
            "DELETE FROM estimate_line_sections WHERE line_id=?1",
            [line.clone()],
        )?;
        if let Some(section) = section_id {
            tx.execute(
                "INSERT INTO estimate_line_sections(line_id,section_id) VALUES (?1,?2)",
                params![line, section.to_string()],
            )?;
        }
        tx.commit()?;
        Ok(())
    }
}
