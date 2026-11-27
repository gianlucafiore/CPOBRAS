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
    #[serde(default)]
    pub price_pending: bool,
    #[serde(default)]
    pub daily_output: Option<String>,
    #[serde(default)]
    pub included: Option<bool>,
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
    /// Remove exactly the reviewed component; shared library analyses stay unchanged.
    pub fn remove_line_resource(
        &mut self,
        estimate_id: Uuid,
        line_id: Uuid,
        component_index: usize,
        resource_id: Uuid,
    ) -> Result<()> {
        let line = self
            .estimate_items(estimate_id)?
            .into_iter()
            .find(|line| line.id == line_id)
            .ok_or_else(|| invalid("Partida inexistente en este presupuesto"))?;
        let analysis = line
            .analysis_id
            .map(|id| self.get_analysis(id))
            .transpose()?
            .flatten()
            .ok_or_else(|| invalid("La partida ya no tiene composición"))?;
        if analysis
            .components
            .get(component_index)
            .map(|c| c.resource_id)
            != Some(resource_id)
        {
            return Err(invalid(
                "La composición cambió. Actualizá la vista antes de quitar el insumo",
            ));
        }
        let remaining: Vec<_> = analysis
            .components
            .iter()
            .enumerate()
            .filter(|(index, _)| *index != component_index)
            .map(|(_, c)| LineResourceInput {
                price_pending: c.price_pending,
                daily_output: Some(c.daily_output.map(|v| v.to_string()).unwrap_or_default()),
                included: Some(c.included),
                resource_id: c.resource_id,
                quantity: c.quantity_per_unit,
                unit_price: c.unit_price,
            })
            .collect();
        if !remaining.is_empty() {
            self.save_line_resources(estimate_id, line_id, &remaining)?;
            return Ok(());
        }
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let status: String = tx.query_row(
            "SELECT status FROM estimates WHERE id=?1",
            [estimate_id.to_string()],
            |r| r.get(0),
        )?;
        if status != "draft" {
            return Err(invalid(
                "Los insumos de un presupuesto emitido no se modifican",
            ));
        }
        tx.execute("UPDATE estimate_lines SET analysis_id=NULL,unit_cost_snapshot='0' WHERE id=?1 AND estimate_id=?2",
            params![line_id.to_string(), estimate_id.to_string()])?;
        tx.execute(
            "DELETE FROM line_analysis_sources WHERE line_id=?1",
            [line_id.to_string()],
        )?;
        checked_budget_total(&tx, estimate_id)?;
        tx.commit()?;
        Ok(())
    }
    pub fn set_line_components_included(
        &mut self,
        estimate_id: Uuid,
        line_id: Uuid,
        analysis_id: Uuid,
        indices: &[usize],
        included: bool,
    ) -> Result<()> {
        let line = self
            .estimate_items(estimate_id)?
            .into_iter()
            .find(|l| l.id == line_id)
            .ok_or_else(|| invalid("Partida inexistente"))?;
        if line.analysis_id != Some(analysis_id) {
            return Err(invalid(
                "El ACU cambió. Actualizá la vista antes de encender o apagar insumos",
            ));
        }
        let analysis = self
            .get_analysis(analysis_id)?
            .ok_or_else(|| invalid("ACU inexistente"))?;
        let selected: std::collections::BTreeSet<_> = indices.iter().copied().collect();
        if selected.is_empty()
            || selected.len() != indices.len()
            || selected.iter().any(|i| *i >= analysis.components.len())
        {
            return Err(invalid("Selección de insumos inválida"));
        }
        let inputs = analysis
            .components
            .iter()
            .enumerate()
            .map(|(i, c)| LineResourceInput {
                price_pending: c.price_pending,
                daily_output: Some(c.daily_output.map(|v| v.to_string()).unwrap_or_default()),
                included: Some(if selected.contains(&i) {
                    included
                } else {
                    c.included
                }),
                resource_id: c.resource_id,
                quantity: c.quantity_per_unit,
                unit_price: c.unit_price,
            })
            .collect::<Vec<_>>();
        self.save_line_resources_checked(estimate_id, line_id, &inputs, Some(analysis_id))?;
        Ok(())
    }
    pub fn save_line_resources(
        &mut self,
        estimate_id: Uuid,
        line_id: Uuid,
        inputs: &[LineResourceInput],
    ) -> Result<Uuid> {
        self.save_line_resources_checked(estimate_id, line_id, inputs, None)
    }
    fn save_line_resources_checked(
        &mut self,
        estimate_id: Uuid,
        line_id: Uuid,
        inputs: &[LineResourceInput],
        expected: Option<Uuid>,
    ) -> Result<Uuid> {
        if inputs.is_empty() || inputs.len() > 1000 {
            return Err(invalid("Agregá entre 1 y 1000 insumos"));
        }
        let line = self
            .estimate_items(estimate_id)?
            .into_iter()
            .find(|line| line.id == line_id)
            .ok_or_else(|| invalid("Partida inexistente en este presupuesto"))?;
        let previous = line
            .analysis_id
            .map(|id| self.get_analysis(id))
            .transpose()?
            .flatten();
        let mut components = Vec::new();
        for (index, input) in inputs.iter().enumerate() {
            let resource = self
                .get_resource(input.resource_id)?
                .ok_or_else(|| invalid("El insumo ya no existe en el catálogo"))?;
            if !resource.active && expected.is_none() {
                return Err(invalid("No se pueden asignar insumos inactivos"));
            }
            let old_component = previous.as_ref().and_then(|a| {
                a.components
                    .get(index)
                    .filter(|c| c.resource_id == input.resource_id)
                    .or_else(|| {
                        a.components
                            .iter()
                            .find(|c| c.resource_id == input.resource_id)
                    })
            });
            let daily_output = if let Some(value) = &input.daily_output {
                crate::resource_productivity::parse_daily_output(value)?
            } else if let Some(old) = old_component {
                old.daily_output
            } else {
                self.resource_daily_output(input.resource_id)?
            };
            components.push(ResourcePriceSnapshot {
                price_pending: input.price_pending,
                daily_output,
                included: input.included.unwrap_or_else(|| {
                    previous
                        .as_ref()
                        .and_then(|a| {
                            a.components
                                .get(index)
                                .filter(|c| c.resource_id == input.resource_id)
                                .or_else(|| {
                                    a.components
                                        .iter()
                                        .find(|c| c.resource_id == input.resource_id)
                                })
                        })
                        .map(|c| c.included)
                        .unwrap_or(true)
                }),
                resource_id: resource.id,
                description: resource.description,
                kind: resource.kind,
                quantity_per_unit: input.quantity,
                unit_price: if input.price_pending {
                    Decimal::ZERO
                } else {
                    input.unit_price
                },
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
        let changed=tx.execute("UPDATE estimate_lines SET analysis_id=?1,unit_cost_snapshot=?2 WHERE id=?3 AND estimate_id=?4 AND (?5 IS NULL OR analysis_id=?5)",params![analysis.id.to_string(),cost.to_string(),line_id.to_string(),estimate_id.to_string(),expected.map(|id|id.to_string())])?;
        if changed != 1 {
            return Err(invalid("La partida ya no existe"));
        }
        let mut prices = std::collections::BTreeMap::new();
        for input in inputs.iter().filter(|row| !row.price_pending) {
            if let Some(old) = prices.insert(input.resource_id, input.unit_price) {
                if old != input.unit_price {
                    return Err(invalid(
                        "Un mismo insumo no puede tener dos precios en el presupuesto",
                    ));
                }
            }
        }
        crate::estimate_resource_prices::synchronize(&tx, estimate_id, &prices)?;
        for (input, component) in inputs.iter().zip(&analysis.components) {
            if input.daily_output.is_some() {
                if let Some(value) = component.daily_output {
                    crate::resource_productivity::seed_daily_output(
                        &tx,
                        component.resource_id,
                        value,
                    )?;
                }
            }
        }
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
