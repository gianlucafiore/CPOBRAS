//! Reviewed, atomic mutations of budget sections ("rubros") from the IA chat.
//! These are never arbitrary model writes: every ID is resolved from the local
//! budget and all previous values are checked again inside the transaction.
use crate::{LocalStore, Result, StorageError};
use crate::assisted_budget::ExpectedLine;
use rusqlite::{params, OptionalExtension, TransactionBehavior};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use uuid::Uuid;

fn invalid(message: &str) -> StorageError { StorageError::InvalidValue(message.into()) }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpectedSection {
    pub code: String,
    pub title: String,
    pub parent_id: Option<Uuid>,
    pub position: i64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SectionCreation {
    pub id: Uuid,
    pub title: String,
    #[serde(default)]
    pub code: String,
    pub position: i64,
    #[serde(default)]
    pub parent_id: Option<Uuid>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SectionRename {
    pub id: Uuid,
    pub expected: ExpectedSection,
    pub title: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SectionDeletion {
    pub id: Uuid,
    pub expected: ExpectedSection,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SectionLineConversion {
    pub line_id: Uuid,
    pub expected: ExpectedLine,
    pub section_id: Uuid,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewedSectionBatch {
    pub id: Uuid,
    pub estimate_id: Uuid,
    #[serde(default)]
    pub creates: Vec<SectionCreation>,
    #[serde(default)]
    pub renames: Vec<SectionRename>,
    #[serde(default)]
    pub deletes: Vec<SectionDeletion>,
    #[serde(default)]
    pub converts: Vec<SectionLineConversion>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ReviewedSectionResult {
    pub created: usize,
    pub renamed: usize,
    pub deleted: usize,
    pub converted: usize,
}

impl LocalStore {
    pub fn apply_reviewed_section_batch(&mut self, batch: &ReviewedSectionBatch) -> Result<ReviewedSectionResult> {
        let size = batch.creates.len() + batch.renames.len() + batch.deletes.len() + batch.converts.len();
        if size == 0 || size > 150 { return Err(invalid("La revisión debe contener entre 1 y 150 cambios")); }
        let request_json = serde_json::to_string(batch)?;
        let tx = self.conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        if let Some((old,result)) = tx.query_row(
            "SELECT request_json,result_json FROM assisted_budget_batches WHERE id=?1",
            [batch.id.to_string()],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))
        ).optional()? {
            if old != request_json { return Err(invalid("Este identificador ya fue aplicado a otra solicitud")); }
            return Ok(serde_json::from_str(&result)?);
        }
        let permitted:bool=tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM estimates e WHERE e.id=?1 AND e.status='draft'
             AND NOT EXISTS(SELECT 1 FROM entity_archives a WHERE (a.kind='estimate' AND a.entity_id=e.id) OR (a.kind='project' AND a.entity_id=e.project_id))
             AND NOT EXISTS(SELECT 1 FROM project_organizations po JOIN organizations o ON po.organization_id=o.id WHERE po.project_id=e.project_id AND o.ownership='external'))",
            [batch.estimate_id.to_string()], |r|r.get(0)
        )?;
        if !permitted {return Err(invalid("Solo se pueden modificar rubros en un presupuesto propio en elaboración"));}
        let mut section_ids=HashSet::new();
        let mut codes=HashSet::new();
        let mut titles=HashSet::new();
        let mut existing_ids=HashSet::new();
        {
            let mut stmt=tx.prepare("SELECT id,lower(trim(title)),lower(trim(code)) FROM budget_sections WHERE estimate_id=?1")?;
            let rows=stmt.query_map([batch.estimate_id.to_string()],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?,r.get::<_,String>(2)?)))?;
            for row in rows {
                let (id,title,code)=row?;
                existing_ids.insert(id);
                titles.insert(title);
                codes.insert(code);
            }
        }
        for create in &batch.creates {
            let title=create.title.trim();
            let code=if create.code.trim().is_empty(){format!("AI-{}", &create.id.simple().to_string()[..8])}else{create.code.trim().to_owned()};
            if create.parent_id.is_some()||title.is_empty()||title.len()>100||code.len()>64||create.position<0
                ||!section_ids.insert(create.id)||existing_ids.contains(&create.id.to_string())
                ||!titles.insert(title.to_lowercase())||!codes.insert(code.to_lowercase()) {
                return Err(invalid("Rubro nuevo inválido, duplicado o ya existente; no se aplicó ningún cambio"));
            }
        }
        let snapshot=|id:Uuid| -> Result<ExpectedSection> {
            let section:Option<(String,String,Option<String>,i64)>=tx.query_row(
                "SELECT code,title,parent_id,position FROM budget_sections WHERE id=?1 AND estimate_id=?2",
                params![id.to_string(),batch.estimate_id.to_string()],
                |r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))
            ).optional()?;
            let Some((code,title,parent,position))=section else{return Err(invalid("El rubro cambió o pertenece a otro presupuesto"));};
            Ok(ExpectedSection{code,title,parent_id:parent.map(|s|Uuid::parse_str(&s)).transpose()?,position})
        };
        // Preflight every modification before the first INSERT or DELETE.
        let mut section_changes=HashSet::new();
        for edit in &batch.renames {
            if !section_changes.insert(edit.id)||snapshot(edit.id)? != edit.expected
                ||edit.title.trim().is_empty()||edit.title.len()>100 {
                return Err(invalid("No se puede renombrar el rubro: cambió la vista o el nombre es inválido"));
            }
            if edit.expected.title.to_lowercase()!=edit.title.trim().to_lowercase()
                && !titles.insert(edit.title.trim().to_lowercase()) {
                return Err(invalid("Ya hay un rubro con ese nombre"));
            }
        }
        for deletion in &batch.deletes {
            if !section_changes.insert(deletion.id)||snapshot(deletion.id)?!=deletion.expected {
                return Err(invalid("El rubro a borrar cambió o ya fue usado por otra operación"));
            }
            let occupied:bool=tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM budget_sections WHERE parent_id=?1)
                      OR EXISTS(SELECT 1 FROM estimate_line_sections WHERE section_id=?1)",
                [deletion.id.to_string()],|r|r.get(0)
            )?;
            if occupied{return Err(invalid("No se borra un rubro que contiene subrubros o partidas: reasigná primero su contenido"));}
        }
        let mut converted=HashSet::new();
        for item in &batch.converts {
            if !converted.insert(item.line_id)||!batch.creates.iter().any(|section|section.id==item.section_id)
                && !existing_ids.contains(&item.section_id.to_string()) {
                return Err(invalid("La conversión no tiene un rubro de destino válido o repite una partida"));
            }
            let old:Option<(String,String,String,String,Option<String>)>=tx.query_row(
                "SELECT description,unit,quantity,unit_cost_snapshot,analysis_id FROM estimate_lines WHERE id=?1 AND estimate_id=?2",
                params![item.line_id.to_string(),batch.estimate_id.to_string()],
                |r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))
            ).optional()?;
            let Some((description,unit,quantity,price,analysis))=old else{return Err(invalid("Una partida a convertir ya no existe"));};
            let e=&item.expected;
            if description!=e.description||unit!=e.unit
                ||Decimal::from_str_exact(&quantity).ok()!=Some(e.quantity)
                ||Decimal::from_str_exact(&price).ok()!=Some(e.unit_cost)
                ||analysis!=e.analysis_id.map(|id|id.to_string()) {
                return Err(invalid("Cambió una partida desde la vista previa; se canceló toda la conversión"));
            }
            let title= batch.creates.iter().find(|c|c.id==item.section_id).map(|c|c.title.clone())
                .or_else(||tx.query_row("SELECT title FROM budget_sections WHERE id=?1 AND estimate_id=?2",
                    params![item.section_id.to_string(),batch.estimate_id.to_string()],|r|r.get(0)).optional().ok().flatten()).unwrap_or_default();
            let linked:bool=tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM takeoff_rows WHERE line_id=?1)
                    OR EXISTS(SELECT 1 FROM estimate_line_sections WHERE line_id=?1)
                    OR EXISTS(SELECT 1 FROM line_analysis_sources WHERE line_id=?1)
                    OR EXISTS(SELECT 1 FROM plan_task_references WHERE line_id=?1)
                    OR EXISTS(SELECT 1 FROM operation_links WHERE line_id=?1)",
                [item.line_id.to_string()],|r|r.get(0)
            )?;
            if !description.trim().eq_ignore_ascii_case(title.trim())||e.analysis_id.is_some()
                ||e.unit_cost!=Decimal::ZERO||linked {
                return Err(invalid("La partida tiene costo, ACU, metrado o vínculos; no puede eliminarse automáticamente como rubro. Conservala y revisá su reasignación."));
            }
        }
        // All changes below are one transaction; any failure rolls them all back.
        for item in &batch.creates {
            let code=if item.code.trim().is_empty(){format!("AI-{}", &item.id.simple().to_string()[..8])}else{item.code.trim().to_owned()};
            tx.execute("INSERT INTO budget_sections(id,estimate_id,parent_id,code,title,position) VALUES (?1,?2,NULL,?3,?4,?5)",
                params![item.id.to_string(),batch.estimate_id.to_string(),code,item.title.trim(),item.position])?;
        }
        for item in &batch.renames {
            tx.execute("UPDATE budget_sections SET title=?1 WHERE id=?2 AND estimate_id=?3",
                params![item.title.trim(),item.id.to_string(),batch.estimate_id.to_string()])?;
        }
        for item in &batch.converts {crate::estimates::delete_line_in(&tx,batch.estimate_id,item.line_id)?;}
        for item in &batch.deletes {
            tx.execute("DELETE FROM budget_sections WHERE id=?1 AND estimate_id=?2",
                params![item.id.to_string(),batch.estimate_id.to_string()])?;
        }
        crate::estimates::checked_budget_total(&tx,batch.estimate_id)?;
        let result=ReviewedSectionResult{created:batch.creates.len(),renamed:batch.renames.len(),deleted:batch.deletes.len(),converted:batch.converts.len()};
        tx.execute("INSERT INTO assisted_budget_batches(id,estimate_id,request_json,result_json) VALUES (?1,?2,?3,?4)",
            params![batch.id.to_string(),batch.estimate_id.to_string(),request_json,serde_json::to_string(&result)?])?;
        tx.commit()?;
        Ok(result)
    }
}
