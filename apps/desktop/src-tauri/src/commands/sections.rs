use crate::Db;
use cpobras_storage::budget_sections::BudgetSection;
use uuid::Uuid;

#[derive(serde::Serialize)]
pub(crate) struct LineSectionView {
    line_id: String,
    section_id: String,
}

#[tauri::command]
pub(crate) fn list_line_sections(
    db: tauri::State<'_, Db>,
    estimate_id: String,
) -> Result<Vec<LineSectionView>, String> {
    let id = Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?;
    let store = db.lock().map_err(|e| e.to_string())?;
    store
        .list_line_sections(id)
        .map_err(|e| e.to_string())
        .map(|rows| {
            rows.into_iter()
                .map(|(line_id, section_id)| LineSectionView {
                    line_id: line_id.to_string(),
                    section_id: section_id.to_string(),
                })
                .collect()
        })
}

#[derive(serde::Serialize)]
pub(crate) struct BudgetSectionView {
    id: String,
    estimate_id: String,
    parent_id: Option<String>,
    code: String,
    title: String,
    position: i64,
}

impl From<BudgetSection> for BudgetSectionView {
    fn from(section: BudgetSection) -> Self {
        Self {
            id: section.id.to_string(),
            estimate_id: section.estimate_id.to_string(),
            parent_id: section.parent_id.map(|id| id.to_string()),
            code: section.code,
            title: section.title,
            position: section.position,
        }
    }
}

#[tauri::command]
pub(crate) fn save_budget_section(
    db: tauri::State<'_, Db>,
    id: Option<String>,
    estimate_id: String,
    parent_id: Option<String>,
    code: String,
    title: String,
    position: i64,
) -> Result<BudgetSectionView, String> {
    let mut store = db.lock().map_err(|e| e.to_string())?;
    let code = if code.trim().is_empty() {
        store
            .automatic_code(&format!("section:{estimate_id}"))
            .map_err(|e| e.to_string())?
    } else {
        code
    };
    let section = BudgetSection {
        id: match id {
            Some(id) => Uuid::parse_str(&id).map_err(|e| e.to_string())?,
            None => Uuid::new_v4(),
        },
        estimate_id: Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?,
        parent_id: parent_id
            .map(|id| Uuid::parse_str(&id))
            .transpose()
            .map_err(|e| e.to_string())?,
        code,
        title,
        position,
    };
    store
        .save_budget_section(&section)
        .map_err(|e| e.to_string())?;
    Ok(BudgetSectionView::from(section))
}

#[tauri::command]
pub(crate) fn list_budget_sections(
    db: tauri::State<'_, Db>,
    estimate_id: String,
) -> Result<Vec<BudgetSectionView>, String> {
    let id = Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?;
    db.lock()
        .map_err(|e| e.to_string())?
        .list_budget_sections(id)
        .map_err(|e| e.to_string())
        .map(|sections| sections.into_iter().map(BudgetSectionView::from).collect())
}

#[tauri::command]
pub(crate) fn assign_line_section(
    db: tauri::State<'_, Db>,
    estimate_id: String,
    line_id: String,
    section_id: String,
) -> Result<(), String> {
    let estimate_id = Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?;
    let line_id = Uuid::parse_str(&line_id).map_err(|e| e.to_string())?;
    let section_id = Uuid::parse_str(&section_id).map_err(|e| e.to_string())?;
    db.lock()
        .map_err(|e| e.to_string())?
        .assign_line_section(estimate_id, line_id, section_id)
        .map_err(|e| e.to_string())
}
