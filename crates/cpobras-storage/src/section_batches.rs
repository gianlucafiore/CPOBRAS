//! Reviewed, atomic mutations of budget sections ("rubros") from the IA chat.
//! These are never arbitrary model writes: every ID is resolved from the local
//! budget and all previous values are checked again inside the transaction.
use crate::assisted_budget::ExpectedLine;
use crate::{LocalStore, Result, StorageError};
use rusqlite::{params, OptionalExtension, TransactionBehavior};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use uuid::Uuid;

fn invalid(message: &str) -> StorageError {
    StorageError::InvalidValue(message.into())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
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
    #[serde(default)]
    pub code: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SectionDeletion {
    pub id: Uuid,
    pub expected: ExpectedSection,
    pub expected_lines: usize,
    pub expected_children: usize,
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
    pub fn apply_reviewed_section_batch(
        &mut self,
        batch: &ReviewedSectionBatch,
    ) -> Result<ReviewedSectionResult> {
        let size =
            batch.creates.len() + batch.renames.len() + batch.deletes.len() + batch.converts.len();
        if size == 0 || size > 150 {
            return Err(invalid("La revisión debe contener entre 1 y 150 cambios"));
        }
        let request_json = serde_json::to_string(batch)?;
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)?;
        if let Some((old, result)) = tx
            .query_row(
                "SELECT request_json,result_json FROM assisted_budget_batches WHERE id=?1",
                [batch.id.to_string()],
                |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
            )
            .optional()?
        {
            if old != request_json {
                return Err(invalid(
                    "Este identificador ya fue aplicado a otra solicitud",
                ));
            }
            return Ok(serde_json::from_str(&result)?);
        }
        let permitted:bool=tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM estimates e WHERE e.id=?1 AND e.status='draft'
             AND NOT EXISTS(SELECT 1 FROM entity_archives a WHERE (a.kind='estimate' AND a.entity_id=e.id) OR (a.kind='project' AND a.entity_id=e.project_id))
             AND NOT EXISTS(SELECT 1 FROM project_organizations po JOIN organizations o ON po.organization_id=o.id WHERE po.project_id=e.project_id AND o.ownership='external'))",
            [batch.estimate_id.to_string()], |r|r.get(0)
        )?;
        if !permitted {
            return Err(invalid(
                "Solo se pueden modificar rubros en un presupuesto propio en elaboración",
            ));
        }
        let mut section_ids = HashSet::new();
        let mut codes = HashSet::new();
        let mut titles = HashSet::new();
        let mut existing_ids = HashSet::new();
        {
            let mut stmt=tx.prepare("SELECT id,lower(trim(title)),lower(trim(code)) FROM budget_sections WHERE estimate_id=?1")?;
            let rows = stmt.query_map([batch.estimate_id.to_string()], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })?;
            for row in rows {
                let (id, title, code) = row?;
                existing_ids.insert(id);
                titles.insert(title);
                codes.insert(code);
            }
        }
        for create in &batch.creates {
            let title = create.title.trim();
            let code = if create.code.trim().is_empty() {
                format!("AI-{}", &create.id.simple().to_string()[..8])
            } else {
                create.code.trim().to_owned()
            };
            if create.parent_id.is_some()
                || title.is_empty()
                || title.len() > 100
                || code.len() > 64
                || create.position < 0
                || !section_ids.insert(create.id)
                || existing_ids.contains(&create.id.to_string())
                || !titles.insert(title.to_lowercase())
                || !codes.insert(code.to_lowercase())
            {
                return Err(invalid(
                    "Rubro nuevo inválido, duplicado o ya existente; no se aplicó ningún cambio",
                ));
            }
        }
        let snapshot = |id: Uuid| -> Result<ExpectedSection> {
            let section:Option<(String,String,Option<String>,i64)>=tx.query_row(
                "SELECT code,title,parent_id,position FROM budget_sections WHERE id=?1 AND estimate_id=?2",
                params![id.to_string(),batch.estimate_id.to_string()],
                |r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))
            ).optional()?;
            let Some((code, title, parent, position)) = section else {
                return Err(invalid("El rubro cambió o pertenece a otro presupuesto"));
            };
            Ok(ExpectedSection {
                code,
                title,
                parent_id: parent.map(|s| Uuid::parse_str(&s)).transpose()?,
                position,
            })
        };
        // Preflight every modification before the first INSERT or DELETE.
        let mut section_changes = HashSet::new();
        for edit in &batch.renames {
            if !section_changes.insert(edit.id)
                || snapshot(edit.id)? != edit.expected
                || edit.title.trim().is_empty()
                || edit.title.len() > 100
            {
                return Err(invalid(
                    "No se puede renombrar el rubro: cambió la vista o el nombre es inválido",
                ));
            }
            if edit.expected.title.to_lowercase() != edit.title.trim().to_lowercase()
                && !titles.insert(edit.title.trim().to_lowercase())
            {
                return Err(invalid("Ya hay un rubro con ese nombre"));
            }
            if let Some(ref code) = edit.code {
                if code.trim().is_empty() || code.len() > 64 {
                    return Err(invalid("Código de rubro inválido"));
                }
                if edit.expected.code.to_lowercase() != code.to_lowercase()
                    && !codes.insert(code.to_lowercase())
                {
                    return Err(invalid("Ya existe un rubro con ese código"));
                }
            }
        }
        for deletion in &batch.deletes {
            if !section_changes.insert(deletion.id) || snapshot(deletion.id)? != deletion.expected {
                return Err(invalid(
                    "El rubro a borrar cambió o ya fue usado por otra operación",
                ));
            }
            let actual_lines: i64 = tx.query_row(
                "SELECT COUNT(*) FROM estimate_line_sections WHERE section_id=?1",
                [deletion.id.to_string()],
                |r| r.get(0),
            )?;
            let actual_children: i64 = tx.query_row(
                "SELECT COUNT(*) FROM budget_sections WHERE parent_id=?1",
                [deletion.id.to_string()],
                |r| r.get(0),
            )?;
            if actual_lines < 0
                || actual_children < 0
                || actual_lines as usize != deletion.expected_lines
                || actual_children as usize != deletion.expected_children
            {
                return Err(invalid(
                    "El contenido del rubro cambió desde la vista previa; no se borró nada",
                ));
            }
        }
        let mut converted = HashSet::new();
        for item in &batch.converts {
            if !converted.insert(item.line_id)
                || !batch
                    .creates
                    .iter()
                    .any(|section| section.id == item.section_id)
                    && !existing_ids.contains(&item.section_id.to_string())
            {
                return Err(invalid(
                    "La conversión no tiene un rubro de destino válido o repite una partida",
                ));
            }
            let old:Option<(String,String,String,String,Option<String>)>=tx.query_row(
                "SELECT description,unit,quantity,unit_cost_snapshot,analysis_id FROM estimate_lines WHERE id=?1 AND estimate_id=?2",
                params![item.line_id.to_string(),batch.estimate_id.to_string()],
                |r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))
            ).optional()?;
            let Some((description, unit, quantity, price, analysis)) = old else {
                return Err(invalid("Una partida a convertir ya no existe"));
            };
            let e = &item.expected;
            if description != e.description
                || unit != e.unit
                || Decimal::from_str_exact(&quantity).ok() != Some(e.quantity)
                || Decimal::from_str_exact(&price).ok() != Some(e.unit_cost)
                || analysis != e.analysis_id.map(|id| id.to_string())
            {
                return Err(invalid(
                    "Cambió una partida desde la vista previa; se canceló toda la conversión",
                ));
            }
            let title = batch
                .creates
                .iter()
                .find(|c| c.id == item.section_id)
                .map(|c| c.title.clone())
                .or_else(|| {
                    tx.query_row(
                        "SELECT title FROM budget_sections WHERE id=?1 AND estimate_id=?2",
                        params![item.section_id.to_string(), batch.estimate_id.to_string()],
                        |r| r.get(0),
                    )
                    .optional()
                    .ok()
                    .flatten()
                })
                .unwrap_or_default();
            let linked: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM takeoff_rows WHERE line_id=?1)
                    OR EXISTS(SELECT 1 FROM estimate_line_sections WHERE line_id=?1)
                    OR EXISTS(SELECT 1 FROM line_analysis_sources WHERE line_id=?1)
                    OR EXISTS(SELECT 1 FROM plan_task_references WHERE line_id=?1)
                    OR EXISTS(SELECT 1 FROM operation_links WHERE line_id=?1)",
                [item.line_id.to_string()],
                |r| r.get(0),
            )?;
            if !description.trim().eq_ignore_ascii_case(title.trim())
                || e.analysis_id.is_some()
                || e.unit_cost != Decimal::ZERO
                || linked
            {
                return Err(invalid("La partida tiene costo, ACU, metrado o vínculos; no puede eliminarse automáticamente como rubro. Conservala y revisá su reasignación."));
            }
        }
        // All changes below are one transaction; any failure rolls them all back.
        for item in &batch.creates {
            let code = if item.code.trim().is_empty() {
                format!("AI-{}", &item.id.simple().to_string()[..8])
            } else {
                item.code.trim().to_owned()
            };
            tx.execute("INSERT INTO budget_sections(id,estimate_id,parent_id,code,title,position) VALUES (?1,?2,NULL,?3,?4,?5)",
                params![item.id.to_string(),batch.estimate_id.to_string(),code,item.title.trim(),item.position])?;
        }
        for item in &batch.renames {
            tx.execute("UPDATE budget_sections SET title=?1,code=COALESCE(?2,code) WHERE id=?3 AND estimate_id=?4",
                params![item.title.trim(),item.code.as_ref().map(|s|s.trim()),item.id.to_string(),batch.estimate_id.to_string()])?;
        }
        for item in &batch.converts {
            crate::estimates::delete_line_in(&tx, batch.estimate_id, item.line_id)?;
        }
        for item in &batch.deletes {
            // Deleting a rubro is not deleting its work: unassign contained
            // partidas and move child rubros to its parent atomically.
            tx.execute(
                "DELETE FROM estimate_line_sections WHERE section_id=?1",
                [item.id.to_string()],
            )?;
            tx.execute(
                "UPDATE budget_sections SET parent_id=?1 WHERE parent_id=?2",
                params![
                    item.expected.parent_id.map(|id| id.to_string()),
                    item.id.to_string()
                ],
            )?;
            tx.execute(
                "DELETE FROM budget_sections WHERE id=?1 AND estimate_id=?2",
                params![item.id.to_string(), batch.estimate_id.to_string()],
            )?;
        }
        crate::estimates::checked_budget_total(&tx, batch.estimate_id)?;
        let result = ReviewedSectionResult {
            created: batch.creates.len(),
            renamed: batch.renames.len(),
            deleted: batch.deletes.len(),
            converted: batch.converts.len(),
        };
        tx.execute("INSERT INTO assisted_budget_batches(id,estimate_id,request_json,result_json) VALUES (?1,?2,?3,?4)",
            params![batch.id.to_string(),batch.estimate_id.to_string(),request_json,serde_json::to_string(&result)?])?;
        tx.commit()?;
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::budget_sections::BudgetSection;
    use crate::estimates::{Estimate, EstimateItem};
    use cpobras_core::{Client, Currency, Project};

    fn sample() -> (LocalStore, Uuid) {
        let mut store = LocalStore::in_memory().unwrap();
        let client = Client {
            id: Uuid::new_v4(),
            name: "Cliente".into(),
            cuit: None,
        };
        store.save_client(&client).unwrap();
        let project = Project {
            id: Uuid::new_v4(),
            client_id: client.id,
            name: "Obra".into(),
            currency: Currency::Ars,
        };
        store.save_project(&project).unwrap();
        let estimate = Estimate {
            id: Uuid::new_v4(),
            project_id: project.id,
            title: "Antepresupuesto".into(),
            currency: Currency::Ars,
            issued: false,
        };
        store.create_estimate(&estimate).unwrap();
        (store, estimate.id)
    }

    fn line(
        store: &mut LocalStore,
        estimate_id: Uuid,
        name: &str,
        position: i64,
        cost: i64,
    ) -> EstimateItem {
        let item = EstimateItem {
            id: Uuid::new_v4(),
            estimate_id,
            position,
            analysis_id: None,
            description: name.into(),
            unit: "gl".into(),
            quantity: Decimal::ONE,
            unit_cost_snapshot: Decimal::from(cost),
        };
        store.add_estimate_item(&item).unwrap();
        item
    }

    fn expectation(item: &EstimateItem) -> ExpectedLine {
        ExpectedLine {
            description: item.description.clone(),
            unit: item.unit.clone(),
            quantity: item.quantity,
            unit_cost: item.unit_cost_snapshot,
            analysis_id: item.analysis_id,
        }
    }

    #[test]
    fn reviewed_section_conversion_is_atomic_idempotent_and_archived() {
        let (mut store, estimate_id) = sample();
        let dummy = line(&mut store, estimate_id, "Fundaciones", 0, 0);
        let other = line(&mut store, estimate_id, "Cubiertas", 1, 0);
        let first = Uuid::new_v4();
        let second = Uuid::new_v4();
        let batch = ReviewedSectionBatch {
            id: Uuid::new_v4(),
            estimate_id,
            creates: vec![
                SectionCreation {
                    id: first,
                    title: "Fundaciones".into(),
                    code: String::new(),
                    position: 0,
                    parent_id: None,
                },
                SectionCreation {
                    id: second,
                    title: "Cubiertas".into(),
                    code: String::new(),
                    position: 1,
                    parent_id: None,
                },
            ],
            renames: vec![],
            deletes: vec![],
            converts: vec![
                SectionLineConversion {
                    line_id: dummy.id,
                    expected: expectation(&dummy),
                    section_id: first,
                },
                SectionLineConversion {
                    line_id: other.id,
                    expected: expectation(&other),
                    section_id: second,
                },
            ],
        };
        let result = store.apply_reviewed_section_batch(&batch).unwrap();
        assert_eq!(
            result,
            ReviewedSectionResult {
                created: 2,
                renamed: 0,
                deleted: 0,
                converted: 2
            }
        );
        assert_eq!(store.list_budget_sections(estimate_id).unwrap().len(), 2);
        assert!(store.estimate_items(estimate_id).unwrap().is_empty());
        assert_eq!(store.apply_reviewed_section_batch(&batch).unwrap(), result);
        let duplicate = ReviewedSectionBatch {
            id: Uuid::new_v4(),
            converts: vec![],
            ..batch.clone()
        };
        assert!(store.apply_reviewed_section_batch(&duplicate).is_err());
        assert_eq!(store.list_budget_sections(estimate_id).unwrap().len(), 2);
    }

    #[test]
    fn reviewed_section_delete_keeps_lines_and_reparents_subsections() {
        let (mut store, estimate_id) = sample();
        let root = BudgetSection {
            id: Uuid::new_v4(),
            estimate_id,
            parent_id: None,
            code: "01".into(),
            title: "Fundaciones".into(),
            position: 0,
        };
        let child = BudgetSection {
            id: Uuid::new_v4(),
            parent_id: Some(root.id),
            code: "01.01".into(),
            title: "Zapatas".into(),
            position: 1,
            ..root.clone()
        };
        store.save_budget_section(&root).unwrap();
        store.save_budget_section(&child).unwrap();
        let task = line(&mut store, estimate_id, "Excavación", 0, 1000);
        store
            .assign_line_section(estimate_id, task.id, root.id)
            .unwrap();
        let expected = ExpectedSection {
            code: root.code.clone(),
            title: root.title.clone(),
            parent_id: None,
            position: 0,
        };
        let batch = ReviewedSectionBatch {
            id: Uuid::new_v4(),
            estimate_id,
            creates: vec![],
            renames: vec![],
            converts: vec![],
            deletes: vec![SectionDeletion {
                id: root.id,
                expected: expected.clone(),
                expected_lines: 1,
                expected_children: 1,
            }],
        };
        let stale = ReviewedSectionBatch {
            id: Uuid::new_v4(),
            deletes: vec![SectionDeletion {
                expected_lines: 0,
                ..batch.deletes[0].clone()
            }],
            ..batch.clone()
        };
        assert!(store.apply_reviewed_section_batch(&stale).is_err());
        let result = store.apply_reviewed_section_batch(&batch).unwrap();
        assert_eq!(result.deleted, 1);
        assert_eq!(store.estimate_items(estimate_id).unwrap().len(), 1);
        assert!(store.list_line_sections(estimate_id).unwrap().is_empty());
        let sections = store.list_budget_sections(estimate_id).unwrap();
        assert_eq!(sections.len(), 1);
        assert_eq!(sections[0].id, child.id);
        assert_eq!(sections[0].parent_id, None);
    }

    #[test]
    fn reviewed_conversion_refuses_priced_lines_without_creating_any_sections() {
        let (mut store, estimate_id) = sample();
        let priced = line(&mut store, estimate_id, "Instalación", 0, 500);
        let section = SectionCreation {
            id: Uuid::new_v4(),
            title: "Instalación".into(),
            code: String::new(),
            position: 0,
            parent_id: None,
        };
        let batch = ReviewedSectionBatch {
            id: Uuid::new_v4(),
            estimate_id,
            creates: vec![section.clone()],
            renames: vec![],
            deletes: vec![],
            converts: vec![SectionLineConversion {
                line_id: priced.id,
                expected: expectation(&priced),
                section_id: section.id,
            }],
        };
        assert!(store.apply_reviewed_section_batch(&batch).is_err());
        assert!(store.list_budget_sections(estimate_id).unwrap().is_empty());
        assert_eq!(store.estimate_items(estimate_id).unwrap().len(), 1);
    }
}
