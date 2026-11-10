//! Only explicit, reviewed data reaches this boundary. No model can call it directly.
use crate::{LocalStore, Result, StorageError};
use rusqlite::{params, OptionalExtension};
use rust_decimal::Decimal as D;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use uuid::Uuid;
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpectedLine {
    pub description: String,
    pub unit: String,
    pub quantity: D,
    pub unit_cost: D,
    pub analysis_id: Option<Uuid>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceUpdate {
    pub line_id: Uuid,
    pub expected: ExpectedLine,
    pub unit_price: D,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub unit: Option<String>,
    #[serde(default)]
    pub quantity: Option<D>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Deletion {
    pub line_id: Uuid,
    pub expected: ExpectedLine,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewLine {
    pub id: Uuid,
    pub description: String,
    pub unit: String,
    pub quantity: D,
    pub unit_price: D,
    pub section: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewEstimate {
    pub project_id: Uuid,
    pub title: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewedBatch {
    pub id: Uuid,
    pub estimate_id: Uuid,
    pub currency: String,
    #[serde(default)]
    pub new_estimate: Option<NewEstimate>,
    pub updates: Vec<PriceUpdate>,
    pub creates: Vec<NewLine>,
    #[serde(default)]
    pub deletes: Vec<Deletion>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub acus: Vec<crate::assisted_acu::AcuChange>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchResult {
    pub updated: usize,
    pub created: usize,
    pub deleted: usize,
    #[serde(default)]
    pub composed: usize,
}
fn invalid(text: &str) -> StorageError {
    StorageError::InvalidValue(text.into())
}
impl LocalStore {
    pub fn apply_reviewed_budget_batch(&mut self, batch: &ReviewedBatch) -> Result<BatchResult> {
        if batch.updates.len() + batch.creates.len() + batch.deletes.len() + batch.acus.len() == 0
            || batch.updates.len() + batch.creates.len() + batch.deletes.len() + batch.acus.len()
                > 1000
        {
            return Err(invalid("Seleccioná entre 1 y 1000 partidas"));
        }
        let request = serde_json::to_string(batch)?;
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        if let Some((old, result)) = tx
            .query_row(
                "SELECT request_json,result_json FROM assisted_budget_batches WHERE id=?1",
                [batch.id.to_string()],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
            )
            .optional()?
        {
            if old != request {
                return Err(invalid("La solicitud ya fue aplicada con otros datos"));
            }
            return Ok(serde_json::from_str(&result)?);
        }
        if let Some(new) = &batch.new_estimate {
            if new.title.trim().is_empty()
                || new.title.len() > 500
                || (!batch.updates.is_empty() || !batch.deletes.is_empty())
            {
                return Err(invalid("Datos del presupuesto nuevo inválidos"));
            }
            let own:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM projects p WHERE p.id=?1 AND p.currency=?2 AND NOT EXISTS(SELECT 1 FROM entity_archives a WHERE a.kind='project' AND a.entity_id=p.id) AND NOT EXISTS(SELECT 1 FROM project_organizations po JOIN organizations o ON o.id=po.organization_id WHERE po.project_id=p.id AND o.ownership='external'))",params![new.project_id.to_string(),batch.currency],|r|r.get(0))?;
            if !own {
                return Err(invalid(
                    "El proyecto no existe, fue dado de baja o es de solo lectura",
                ));
            }
            tx.execute(
                "INSERT INTO estimates(id,project_id,title,currency) VALUES(?1,?2,?3,?4)",
                params![
                    batch.estimate_id.to_string(),
                    new.project_id.to_string(),
                    new.title.trim(),
                    batch.currency
                ],
            )?;
        }
        let allowed:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM estimates e WHERE e.id=?1 AND e.status='draft' AND e.currency=?2 AND NOT EXISTS(SELECT 1 FROM entity_archives a WHERE (a.kind='estimate' AND a.entity_id=e.id) OR (a.kind='project' AND a.entity_id=e.project_id)) AND NOT EXISTS(SELECT 1 FROM project_organizations po JOIN organizations o ON o.id=po.organization_id WHERE po.project_id=e.project_id AND o.ownership='external'))",params![batch.estimate_id.to_string(),batch.currency],|r|r.get(0))?;
        if !allowed {
            return Err(invalid("Elegí un presupuesto vigente, propio y en elaboración, con la misma moneda de la propuesta"));
        }
        crate::assisted_acu::validate_changes(&tx, batch)?;
        let mut ids = HashSet::new();
        for update in &batch.updates {
            if !ids.insert(update.line_id) || update.unit_price < D::ZERO {
                return Err(invalid(
                    "Precios negativos o partidas repetidas en la selección",
                ));
            }
            let previous:Option<(String,String,String,String,Option<String>)>=tx.query_row("SELECT description,unit,quantity,unit_cost_snapshot,analysis_id FROM estimate_lines WHERE id=?1 AND estimate_id=?2",params![update.line_id.to_string(),batch.estimate_id.to_string()],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))).optional()?;
            let Some((description, unit, quantity, price, analysis)) = previous else {
                return Err(invalid("Una partida fue eliminada o pertenece a otro presupuesto. Generá otra vista previa"));
            };
            let quantity =
                D::from_str_exact(&quantity).map_err(|_| invalid("Cantidad guardada inválida"))?;
            let price =
                D::from_str_exact(&price).map_err(|_| invalid("Precio guardado inválido"))?;
            if description != update.expected.description
                || unit != update.expected.unit
                || quantity != update.expected.quantity
                || price != update.expected.unit_cost
                || analysis != update.expected.analysis_id.map(|id| id.to_string())
            {
                return Err(invalid("El presupuesto cambió desde la vista previa. No se aplicó ningún cambio; revisá otra vez"));
            }
            let new_description = update.description.as_deref().unwrap_or(&description).trim();
            let new_unit = update.unit.as_deref().unwrap_or(&unit).trim();
            let new_quantity = update.quantity.unwrap_or(quantity);
            if new_description.is_empty()
                || new_description.len() > 2000
                || new_unit.is_empty()
                || new_unit.len() > 100
                || new_quantity < D::ZERO
                || new_quantity.checked_mul(update.unit_price).is_none()
            {
                return Err(invalid("Datos de edición inválidos"));
            }
            let manual = price != update.unit_price || unit != new_unit;
            tx.execute("UPDATE estimate_lines SET description=?1,unit=?2,quantity=?3,unit_cost_snapshot=?4,analysis_id=CASE WHEN ?5 THEN NULL ELSE analysis_id END WHERE id=?6",params![new_description,new_unit,new_quantity.to_string(),update.unit_price.to_string(),manual,update.line_id.to_string()])?;
            if manual {
                tx.execute(
                    "DELETE FROM line_analysis_sources WHERE line_id=?1",
                    [update.line_id.to_string()],
                )?;
            }
        }
        for deletion in &batch.deletes {
            if !ids.insert(deletion.line_id) {
                return Err(invalid(
                    "Una partida está repetida entre las ediciones y eliminaciones",
                ));
            }
            let e = &deletion.expected;
            let current:Option<(String,String,String,String,Option<String>)>=tx.query_row("SELECT description,unit,quantity,unit_cost_snapshot,analysis_id FROM estimate_lines WHERE id=?1 AND estimate_id=?2",params![deletion.line_id.to_string(),batch.estimate_id.to_string()],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))).optional()?;
            let Some((description, unit, quantity, price, analysis)) = current else {
                return Err(invalid(
                    "La partida a eliminar ya no existe en el presupuesto",
                ));
            };
            if description != e.description
                || unit != e.unit
                || D::from_str_exact(&quantity).ok() != Some(e.quantity)
                || D::from_str_exact(&price).ok() != Some(e.unit_cost)
                || analysis != e.analysis_id.map(|id| id.to_string())
            {
                return Err(invalid("La partida a eliminar cambió desde la vista previa. No se aplicó ningún cambio"));
            }
            crate::estimates::delete_line_in(&tx, batch.estimate_id, deletion.line_id)?;
        }
        let mut position: i64 = tx.query_row(
            "SELECT COALESCE(MAX(position),-1)+1 FROM estimate_lines WHERE estimate_id=?1",
            [batch.estimate_id.to_string()],
            |r| r.get(0),
        )?;
        for line in &batch.creates {
            if !ids.insert(line.id)
                || line.description.trim().is_empty()
                || line.description.len() > 2000
                || line.unit.trim().is_empty()
                || line.unit.len() > 100
                || line.quantity < D::ZERO
                || line.unit_price < D::ZERO
                || line.quantity.checked_mul(line.unit_price).is_none()
                || line.section.as_ref().is_some_and(|s| s.len() > 300)
            {
                return Err(invalid("Datos de partida inválidos"));
            }
            tx.execute("INSERT INTO estimate_lines(id,estimate_id,position,description,unit,quantity,unit_cost_snapshot) VALUES(?1,?2,?3,?4,?5,?6,?7)",params![line.id.to_string(),batch.estimate_id.to_string(),position,line.description.trim(),line.unit.trim(),line.quantity.to_string(),line.unit_price.to_string()])?;
            position += 1;
            if let Some(title) = line
                .section
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
            {
                let sections:Vec<String>=tx.prepare("SELECT id FROM budget_sections WHERE estimate_id=?1 AND trim(title)=?2 COLLATE NOCASE")?.query_map(params![batch.estimate_id.to_string(),title],|r|r.get(0))?.collect::<std::result::Result<_,_>>()?;
                if sections.len() > 1 {
                    return Err(invalid("Hay rubros con el mismo nombre. Diferencialos antes de aplicar la propuesta"));
                }
                let section = if let Some(id) = sections.first() {
                    id.clone()
                } else {
                    let id = Uuid::new_v4().to_string();
                    let section_position:i64=tx.query_row("SELECT COALESCE(MAX(position),-1)+1 FROM budget_sections WHERE estimate_id=?1",[batch.estimate_id.to_string()],|r|r.get(0))?;
                    let code = crate::project_dashboard::next_code(
                        &tx,
                        &format!("section:{}", batch.estimate_id),
                        "REG-",
                    )?;
                    tx.execute("INSERT INTO budget_sections(id,estimate_id,code,title,position) VALUES(?1,?2,?3,?4,?5)",params![id,batch.estimate_id.to_string(),code,title,section_position])?;
                    id
                };
                tx.execute(
                    "INSERT INTO estimate_line_sections(line_id,section_id) VALUES(?1,?2)",
                    params![line.id.to_string(), section],
                )?;
            }
        }
        crate::assisted_acu::apply_changes(&tx, batch)?;
        crate::estimates::checked_budget_total(&tx, batch.estimate_id)?;
        let result = BatchResult {
            updated: batch.updates.len(),
            created: batch.creates.len(),
            deleted: batch.deletes.len(),
            composed: batch.acus.len(),
        };
        tx.execute("INSERT INTO assisted_budget_batches(id,estimate_id,request_json,result_json) VALUES(?1,?2,?3,?4)",params![batch.id.to_string(),batch.estimate_id.to_string(),request,serde_json::to_string(&result)?])?;
        tx.commit()?;
        Ok(result)
    }
}
