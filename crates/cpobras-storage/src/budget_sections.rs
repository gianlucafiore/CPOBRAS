//! Hierarchical budget sections, with immutable issued estimates.
use super::{LocalStore, Result, StorageError};
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BudgetSection {
    pub id: Uuid,
    pub estimate_id: Uuid,
    pub parent_id: Option<Uuid>,
    pub code: String,
    pub title: String,
    pub position: i64,
}

impl LocalStore {
    pub fn save_budget_section(&mut self, section: &BudgetSection) -> Result<()> {
        if section.code.trim().is_empty() || section.title.trim().is_empty() || section.position < 0 {
            return Err(StorageError::InvalidValue("invalid section".into()));
        }
        if section.parent_id == Some(section.id) {
            return Err(StorageError::InvalidValue("section cannot be its own parent".into()));
        }
        if let Some(parent_id) = section.parent_id {
            let parent_estimate: Option<String> = self.conn.query_row(
                "SELECT estimate_id FROM budget_sections WHERE id=?1",
                [parent_id.to_string()], |row| row.get(0),
            ).optional()?;
            if parent_estimate.as_deref() != Some(section.estimate_id.to_string().as_str()) {
                return Err(StorageError::InvalidValue("parent belongs to another estimate".into()));
            }
            let mut ancestor = Some(parent_id);
            while let Some(id) = ancestor {
                if id == section.id {
                    return Err(StorageError::InvalidValue("section hierarchy cycle".into()));
                }
                let row: Option<Option<String>> = self.conn.query_row(
                    "SELECT parent_id FROM budget_sections WHERE id=?1",
                    [id.to_string()], |row| row.get(0),
                ).optional()?;
                ancestor = row.flatten().map(|value| Uuid::parse_str(&value)).transpose()?;
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
                section.code, section.title, section.position,
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
                row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?,
                row.get::<_, String>(2)?, row.get::<_, String>(3)?,
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
                code, title, position,
            });
        }
        Ok(sections)
    }

    pub fn assign_line_section(&mut self, estimate_id: Uuid, line_id: Uuid, section_id: Uuid) -> Result<()> {
        let section_exists: bool = self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM budget_sections WHERE id=?1 AND estimate_id=?2)",
            params![section_id.to_string(), estimate_id.to_string()], |row| row.get(0),
        )?;
        let line_exists: bool = self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM estimate_lines WHERE id=?1 AND estimate_id=?2)",
            params![line_id.to_string(), estimate_id.to_string()], |row| row.get(0),
        )?;
        if !section_exists || !line_exists {
            return Err(StorageError::InvalidValue("section and line must belong to same estimate".into()));
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
    use cpobras_core::{Client, Currency, Project};
    use crate::estimates::{Estimate, EstimateItem};
    use rust_decimal::Decimal;

    #[test]
    fn sections_validate_hierarchy_and_freeze_on_issue() {
        let mut store = LocalStore::in_memory().unwrap();
        let client = Client { id: Uuid::new_v4(), name: "Cliente".into(), cuit: None };
        store.save_client(&client).unwrap();
        let project = Project { id: Uuid::new_v4(), client_id: client.id, name: "Obra".into(), currency: Currency::Ars };
        store.save_project(&project).unwrap();
        let estimate = Estimate { id: Uuid::new_v4(), project_id: project.id, title: "Cotización".into(), currency: Currency::Ars, issued: false };
        store.create_estimate(&estimate).unwrap();
        let root = BudgetSection { id: Uuid::new_v4(), estimate_id: estimate.id, parent_id: None, code: "01".into(), title: "Estructura".into(), position: 0 };
        store.save_budget_section(&root).unwrap();
        let child = BudgetSection { id: Uuid::new_v4(), parent_id: Some(root.id), code: "01.01".into(), title: "Metal".into(), ..root.clone() };
        store.save_budget_section(&child).unwrap();
        assert_eq!(store.list_budget_sections(estimate.id).unwrap().len(), 2);
        let cycle = BudgetSection { parent_id: Some(child.id), ..root.clone() };
        assert!(store.save_budget_section(&cycle).is_err());
        let foreign = BudgetSection { parent_id: Some(Uuid::new_v4()), ..root.clone() };
        assert!(store.save_budget_section(&foreign).is_err());

        let line = EstimateItem {
            id: Uuid::new_v4(), estimate_id: estimate.id, position: 0,
            analysis_id: None, description: "Viga W".into(), unit: "kg".into(),
            quantity: Decimal::new(100, 0), unit_cost_snapshot: Decimal::new(12, 0),
        };
        store.add_estimate_item(&line).unwrap();
        store.assign_line_section(estimate.id, line.id, child.id).unwrap();
        let copy = store.duplicate_estimate(estimate.id, "Copia").unwrap();
        let copy_sections = store.list_budget_sections(copy.id).unwrap();
        assert_eq!(copy_sections.len(), 2);
        let copy_child = copy_sections.iter().find(|section| section.code == "01.01").unwrap();
        let copy_root = copy_sections.iter().find(|section| section.code == "01").unwrap();
        assert_eq!(copy_child.parent_id, Some(copy_root.id));
        let copy_line = store.estimate_items(copy.id).unwrap().remove(0);
        let copied_section: String = store.conn.query_row(
            "SELECT section_id FROM estimate_line_sections WHERE line_id=?1",
            [copy_line.id.to_string()], |row| row.get(0),
        ).unwrap();
        assert_eq!(copied_section, copy_child.id.to_string());

        store.issue_estimate(estimate.id).unwrap();
        let renamed = BudgetSection { title: "Modificado".into(), ..root };
        assert!(store.save_budget_section(&renamed).is_err());
        assert!(store.assign_line_section(estimate.id, line.id, child.id).is_err());
    }
}
