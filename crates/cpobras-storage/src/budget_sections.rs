//! Hierarchical budget sections, with immutable issued estimates.
use super::{LocalStore, Result, StorageError};
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct BudgetSection {
    pub id: Uuid,
    pub estimate_id: Uuid,
    pub parent_id: Option<Uuid>,
    pub code: String,
    pub title: String,
    pub position: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct SectionEdit {
    pub action: String,
    #[serde(default)]
    pub section_id: Option<Uuid>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub code: Option<String>,
    #[serde(default)]
    pub expected_title: Option<String>,
    #[serde(default)]
    pub expected_lines: Option<i64>,
    #[serde(default)]
    pub expected_children: Option<i64>,
}

#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct SectionEditResult {
    pub created: usize,
    pub updated: usize,
    pub deleted: usize,
    pub preserved_lines: i64,
    pub reparented_subsections: i64,
}

impl LocalStore {
    /// Apply conversational rubro changes atomically. Deleting a rubro never
    /// deletes a budget line: assigned lines become ungrouped, and subrubros
    /// move to the deleted rubro's parent. Stale confirmations are rejected.
    pub fn apply_budget_section_edits(
        &mut self,
        estimate_id: Uuid,
        edits: &[SectionEdit],
    ) -> Result<SectionEditResult> {
        if edits.is_empty() || edits.len() > 20 {
            return Err(StorageError::InvalidValue(
                "invalid section plan size".into(),
            ));
        }
        let tx = self.conn.transaction()?;
        let state: Option<String> = tx
            .query_row(
                "SELECT status FROM estimates WHERE id=?1",
                [estimate_id.to_string()],
                |row| row.get(0),
            )
            .optional()?;
        if state.as_deref() != Some("draft") {
            return Err(StorageError::InvalidValue(
                "estimate is not an editable draft".into(),
            ));
        }
        let mut summary = SectionEditResult::default();
        for edit in edits {
            match edit.action.as_str() {
                "create" => {
                    let title = edit.title.as_deref().unwrap_or("").trim();
                    if title.is_empty() || title.chars().count() > 100 {
                        return Err(StorageError::InvalidValue("invalid section title".into()));
                    }
                    let duplicate: i64 = tx.query_row(
                        "SELECT COUNT(*) FROM budget_sections WHERE estimate_id=?1 AND lower(title)=lower(?2)",
                        params![estimate_id.to_string(), title], |row| row.get(0),
                    )?;
                    if duplicate > 0 {
                        return Err(StorageError::InvalidValue("section already exists".into()));
                    }
                    let mut code_number = 1;
                    let code = loop {
                        if code_number > 9999 {
                            return Err(StorageError::InvalidValue(
                                "no section code available".into(),
                            ));
                        }
                        let candidate = format!("{code_number:02}");
                        let taken: i64 = tx.query_row(
                            "SELECT COUNT(*) FROM budget_sections WHERE estimate_id=?1 AND code=?2",
                            params![estimate_id.to_string(), candidate],
                            |row| row.get(0),
                        )?;
                        if taken == 0 {
                            break candidate;
                        }
                        code_number += 1;
                    };
                    let position: i64 = tx.query_row(
                        "SELECT COALESCE(MAX(position),-1)+1 FROM budget_sections WHERE estimate_id=?1",
                        [estimate_id.to_string()], |row| row.get(0),
                    )?;
                    tx.execute(
                        "INSERT INTO budget_sections(id,estimate_id,parent_id,code,title,position) VALUES(?1,?2,NULL,?3,?4,?5)",
                        params![Uuid::new_v4().to_string(), estimate_id.to_string(), code, title, position],
                    )?;
                    summary.created += 1;
                }
                "update" | "delete" => {
                    let id = edit
                        .section_id
                        .ok_or_else(|| StorageError::InvalidValue("missing section ID".into()))?;
                    let previous: Option<(String, Option<String>, String)> = tx.query_row(
                        "SELECT title,parent_id,code FROM budget_sections WHERE id=?1 AND estimate_id=?2",
                        params![id.to_string(), estimate_id.to_string()],
                        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                    ).optional()?;
                    let (previous_title, parent_id, previous_code) = previous.ok_or_else(|| {
                        StorageError::InvalidValue(
                            "section no longer exists in this estimate".into(),
                        )
                    })?;
                    if edit.expected_title.as_deref() != Some(previous_title.as_str()) {
                        return Err(StorageError::InvalidValue(
                            "section was modified since preview".into(),
                        ));
                    }
                    if edit.action == "update" {
                        let title = edit.title.as_deref().unwrap_or(&previous_title).trim();
                        let code = edit.code.as_deref().unwrap_or(&previous_code).trim();
                        if title.is_empty()
                            || title.chars().count() > 100
                            || code.is_empty()
                            || code.chars().count() > 30
                        {
                            return Err(StorageError::InvalidValue(
                                "invalid section title or code".into(),
                            ));
                        }
                        tx.execute(
                            "UPDATE budget_sections SET title=?1,code=?2 WHERE id=?3 AND estimate_id=?4",
                            params![title, code, id.to_string(), estimate_id.to_string()],
                        )?;
                        summary.updated += 1;
                    } else {
                        let assigned: i64 = tx.query_row(
                            "SELECT COUNT(*) FROM estimate_line_sections WHERE section_id=?1",
                            [id.to_string()],
                            |row| row.get(0),
                        )?;
                        let children: i64 = tx.query_row(
                            "SELECT COUNT(*) FROM budget_sections WHERE parent_id=?1",
                            [id.to_string()],
                            |row| row.get(0),
                        )?;
                        if edit.expected_lines != Some(assigned)
                            || edit.expected_children != Some(children)
                        {
                            return Err(StorageError::InvalidValue(
                                "section membership changed since preview".into(),
                            ));
                        }
                        tx.execute(
                            "DELETE FROM estimate_line_sections WHERE section_id=?1",
                            [id.to_string()],
                        )?;
                        tx.execute(
                            "UPDATE budget_sections SET parent_id=?1 WHERE parent_id=?2 AND estimate_id=?3",
                            params![parent_id, id.to_string(), estimate_id.to_string()],
                        )?;
                        tx.execute(
                            "DELETE FROM budget_sections WHERE id=?1 AND estimate_id=?2",
                            params![id.to_string(), estimate_id.to_string()],
                        )?;
                        summary.deleted += 1;
                        summary.preserved_lines += assigned;
                        summary.reparented_subsections += children;
                    }
                }
                _ => return Err(StorageError::InvalidValue("unknown section action".into())),
            }
        }
        tx.commit()?;
        Ok(summary)
    }

    pub fn save_budget_section(&mut self, section: &BudgetSection) -> Result<()> {
        if section.code.trim().is_empty() || section.title.trim().is_empty() || section.position < 0
        {
            return Err(StorageError::InvalidValue("invalid section".into()));
        }
        let existing_estimate: Option<String> = self
            .conn
            .query_row(
                "SELECT estimate_id FROM budget_sections WHERE id=?1",
                [section.id.to_string()],
                |row| row.get(0),
            )
            .optional()?;
        if existing_estimate.is_some_and(|id| id != section.estimate_id.to_string()) {
            return Err(StorageError::InvalidValue(
                "cannot move section to another estimate".into(),
            ));
        }
        if section.parent_id == Some(section.id) {
            return Err(StorageError::InvalidValue(
                "section cannot be its own parent".into(),
            ));
        }
        if let Some(parent_id) = section.parent_id {
            let parent_estimate: Option<String> = self
                .conn
                .query_row(
                    "SELECT estimate_id FROM budget_sections WHERE id=?1",
                    [parent_id.to_string()],
                    |row| row.get(0),
                )
                .optional()?;
            let expected_estimate = section.estimate_id.to_string();
            if parent_estimate.as_deref() != Some(expected_estimate.as_str()) {
                return Err(StorageError::InvalidValue(
                    "parent belongs to another estimate".into(),
                ));
            }
            let mut ancestor = Some(parent_id);
            while let Some(id) = ancestor {
                if id == section.id {
                    return Err(StorageError::InvalidValue("section hierarchy cycle".into()));
                }
                let row: Option<Option<String>> = self
                    .conn
                    .query_row(
                        "SELECT parent_id FROM budget_sections WHERE id=?1",
                        [id.to_string()],
                        |row| row.get(0),
                    )
                    .optional()?;
                ancestor = row
                    .flatten()
                    .map(|value| Uuid::parse_str(&value))
                    .transpose()?;
            }
        }
        self.conn.execute(
            "INSERT INTO budget_sections(id, estimate_id, parent_id, code, title, position)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET parent_id=excluded.parent_id,
             code=excluded.code, title=excluded.title, position=excluded.position",
            params![
                section.id.to_string(),
                section.estimate_id.to_string(),
                section.parent_id.map(|id| id.to_string()),
                section.code,
                section.title,
                section.position,
            ],
        )?;
        Ok(())
    }

    pub fn list_budget_sections(&self, estimate_id: Uuid) -> Result<Vec<BudgetSection>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, parent_id, code, title, position
             FROM budget_sections WHERE estimate_id=?1 ORDER BY position, code",
        )?;
        let rows = stmt.query_map([estimate_id.to_string()], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
            ))
        })?;
        let mut sections = Vec::new();
        for row in rows {
            let (id, parent_id, code, title, position) = row?;
            sections.push(BudgetSection {
                id: Uuid::parse_str(&id)?,
                estimate_id,
                parent_id: parent_id.map(|id| Uuid::parse_str(&id)).transpose()?,
                code,
                title,
                position,
            });
        }
        Ok(sections)
    }

    /// Section assignment for each line in one estimate.
    pub fn list_line_sections(&self, estimate_id: Uuid) -> Result<Vec<(Uuid, Uuid)>> {
        let mut stmt = self.conn.prepare(
            "SELECT a.line_id, a.section_id FROM estimate_line_sections a
             JOIN estimate_lines l ON l.id=a.line_id WHERE l.estimate_id=?1",
        )?;
        let rows = stmt.query_map([estimate_id.to_string()], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut result = Vec::new();
        for row in rows {
            let (line_id, section_id) = row?;
            result.push((Uuid::parse_str(&line_id)?, Uuid::parse_str(&section_id)?));
        }
        Ok(result)
    }

    pub fn assign_line_section(
        &mut self,
        estimate_id: Uuid,
        line_id: Uuid,
        section_id: Uuid,
    ) -> Result<()> {
        let section_exists: bool = self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM budget_sections WHERE id=?1 AND estimate_id=?2)",
            params![section_id.to_string(), estimate_id.to_string()],
            |row| row.get(0),
        )?;
        let line_exists: bool = self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM estimate_lines WHERE id=?1 AND estimate_id=?2)",
            params![line_id.to_string(), estimate_id.to_string()],
            |row| row.get(0),
        )?;
        if !section_exists || !line_exists {
            return Err(StorageError::InvalidValue(
                "section and line must belong to same estimate".into(),
            ));
        }
        self.conn.execute(
            "INSERT INTO estimate_line_sections(line_id,section_id) VALUES (?1,?2)
             ON CONFLICT(line_id) DO UPDATE SET section_id=excluded.section_id",
            params![line_id.to_string(), section_id.to_string()],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::estimates::{Estimate, EstimateItem};
    use cpobras_core::{Client, Currency, Project};
    use rust_decimal::Decimal;

    #[test]
    fn sections_validate_hierarchy_and_freeze_on_issue() {
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
            title: "Cotización".into(),
            currency: Currency::Ars,
            issued: false,
        };
        store.create_estimate(&estimate).unwrap();
        let root = BudgetSection {
            id: Uuid::new_v4(),
            estimate_id: estimate.id,
            parent_id: None,
            code: "01".into(),
            title: "Estructura".into(),
            position: 0,
        };
        store.save_budget_section(&root).unwrap();
        let child = BudgetSection {
            id: Uuid::new_v4(),
            parent_id: Some(root.id),
            code: "01.01".into(),
            title: "Metal".into(),
            ..root.clone()
        };
        store.save_budget_section(&child).unwrap();
        assert_eq!(store.list_budget_sections(estimate.id).unwrap().len(), 2);
        let cycle = BudgetSection {
            parent_id: Some(child.id),
            ..root.clone()
        };
        assert!(store.save_budget_section(&cycle).is_err());
        let foreign = BudgetSection {
            parent_id: Some(Uuid::new_v4()),
            ..root.clone()
        };
        assert!(store.save_budget_section(&foreign).is_err());

        let line = EstimateItem {
            id: Uuid::new_v4(),
            estimate_id: estimate.id,
            position: 0,
            analysis_id: None,
            description: "Viga W".into(),
            unit: "kg".into(),
            quantity: Decimal::new(100, 0),
            unit_cost_snapshot: Decimal::new(12, 0),
        };
        store.add_estimate_item(&line).unwrap();
        store
            .assign_line_section(estimate.id, line.id, child.id)
            .unwrap();
        let copy = store.duplicate_estimate(estimate.id, "Copia").unwrap();
        let copy_sections = store.list_budget_sections(copy.id).unwrap();
        assert_eq!(copy_sections.len(), 2);
        let copy_child = copy_sections
            .iter()
            .find(|section| section.code == "01.01")
            .unwrap();
        let copy_root = copy_sections
            .iter()
            .find(|section| section.code == "01")
            .unwrap();
        assert_eq!(copy_child.parent_id, Some(copy_root.id));
        let copy_line = store.estimate_items(copy.id).unwrap().remove(0);
        let copied_section: String = store
            .conn
            .query_row(
                "SELECT section_id FROM estimate_line_sections WHERE line_id=?1",
                [copy_line.id.to_string()],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(copied_section, copy_child.id.to_string());

        store.issue_estimate(estimate.id).unwrap();
        let renamed = BudgetSection {
            title: "Modificado".into(),
            ..root
        };
        assert!(store.save_budget_section(&renamed).is_err());
        assert!(store
            .assign_line_section(estimate.id, line.id, child.id)
            .is_err());
    }

    #[test]
    fn conversational_section_crud_preserves_lines_children_and_rejects_stale_delete() {
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
            name: "Proyecto".into(),
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
        let edits = vec!["Fundaciones", "Estructuras", "Cubiertas"]
            .into_iter()
            .map(|title| SectionEdit {
                action: "create".into(),
                section_id: None,
                title: Some(title.into()),
                code: None,
                expected_title: None,
                expected_lines: None,
                expected_children: None,
            })
            .collect::<Vec<_>>();
        let created = store
            .apply_budget_section_edits(estimate.id, &edits)
            .unwrap();
        assert_eq!(created.created, 3);
        let sections = store.list_budget_sections(estimate.id).unwrap();
        assert_eq!(sections.len(), 3);
        let root = sections
            .iter()
            .find(|s| s.title == "Fundaciones")
            .unwrap()
            .clone();
        let child = BudgetSection {
            id: Uuid::new_v4(),
            parent_id: Some(root.id),
            code: "01.01".into(),
            title: "Zapatas".into(),
            position: 3,
            ..root.clone()
        };
        store.save_budget_section(&child).unwrap();
        let line = EstimateItem {
            id: Uuid::new_v4(),
            estimate_id: estimate.id,
            position: 0,
            analysis_id: None,
            description: "Excavación".into(),
            unit: "m³".into(),
            quantity: Decimal::new(10, 0),
            unit_cost_snapshot: Decimal::new(20, 0),
        };
        store.add_estimate_item(&line).unwrap();
        store
            .assign_line_section(estimate.id, line.id, root.id)
            .unwrap();
        let stale = SectionEdit {
            action: "delete".into(),
            section_id: Some(root.id),
            expected_title: Some("Fundaciones".into()),
            expected_lines: Some(0),
            expected_children: Some(1),
            title: None,
            code: None,
        };
        assert!(store
            .apply_budget_section_edits(estimate.id, &[stale.clone()])
            .is_err());
        assert_eq!(store.list_budget_sections(estimate.id).unwrap().len(), 4);
        let rename = SectionEdit {
            action: "update".into(),
            section_id: Some(root.id),
            title: Some("Movimiento de suelos".into()),
            code: Some("00".into()),
            expected_title: Some("Fundaciones".into()),
            expected_lines: None,
            expected_children: None,
        };
        assert_eq!(
            store
                .apply_budget_section_edits(estimate.id, &[rename])
                .unwrap()
                .updated,
            1
        );
        let mut valid = stale;
        valid.expected_title = Some("Movimiento de suelos".into());
        valid.expected_lines = Some(1);
        let removed = store
            .apply_budget_section_edits(estimate.id, &[valid])
            .unwrap();
        assert_eq!(removed.deleted, 1);
        assert_eq!(removed.preserved_lines, 1);
        assert_eq!(removed.reparented_subsections, 1);
        assert_eq!(store.estimate_items(estimate.id).unwrap().len(), 1);
        assert!(store.list_line_sections(estimate.id).unwrap().is_empty());
        let children = store.list_budget_sections(estimate.id).unwrap();
        assert!(children
            .iter()
            .any(|s| s.id == child.id && s.parent_id == None));
        store.issue_estimate(estimate.id).unwrap();
        assert!(store
            .apply_budget_section_edits(estimate.id, &edits[..1])
            .is_err());
    }
}
