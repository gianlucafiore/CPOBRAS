use crate::Db;
use cpobras_core::{Currency, Project};
use uuid::Uuid;
#[derive(serde::Serialize)]
pub(crate) struct ProjectView {
    #[serde(flatten)]
    project: Project,
    organization_id: Uuid,
    organization_name: String,
    organization_locked: bool,
    read_only: bool,
    supplier_ids: Vec<Uuid>,
}
fn view(store: &cpobras_storage::LocalStore, project: Project) -> Result<ProjectView, String> {
    let o = store
        .project_organization(project.id)
        .map_err(|e| e.to_string())?;
    let locked = !store
        .list_project_estimates(project.id)
        .map_err(|e| e.to_string())?
        .is_empty();
    let suppliers = store
        .project_suppliers(project.id)
        .map_err(|e| e.to_string())?;
    Ok(ProjectView {
        supplier_ids: suppliers,
        project,
        organization_id: o.id,
        organization_name: o.name,
        organization_locked: locked,
        read_only: o.ownership != "own",
    })
}

#[tauri::command]
pub(crate) fn update_project(
    db: tauri::State<'_, Db>,
    project_id: String,
    project_name: String,
    client_id: String,
    currency: String,
    organization_id: Option<Uuid>,
    supplier_ids: Option<Vec<Uuid>>,
) -> Result<ProjectView, String> {
    if project_name.trim().is_empty() {
        return Err("El nombre de la obra es obligatorio".into());
    }
    let id = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    let client_id = Uuid::parse_str(&client_id).map_err(|e| e.to_string())?;
    let currency = match currency.as_str() {
        "ARS" => Currency::Ars,
        "USD" => Currency::Usd,
        _ => return Err("Moneda desconocida".into()),
    };
    let mut store = db.lock().map_err(|e| e.to_string())?;
    if store.get_project(id).map_err(|e| e.to_string())?.is_none() {
        return Err("La obra no existe".into());
    }
    let project = Project {
        id,
        client_id,
        name: project_name.trim().to_owned(),
        currency,
    };
    let org = match organization_id {
        Some(id) => id,
        None => {
            store
                .project_organization(id)
                .map_err(|e| e.to_string())?
                .id
        }
    };
    let suppliers = match supplier_ids {
        Some(ids) => ids,
        None => store
            .project_suppliers(project.id)
            .map_err(|e| e.to_string())?,
    };
    store
        .save_project_parties(&project, org, &suppliers)
        .map_err(|e| e.to_string())?;
    view(&store, project)
}

#[tauri::command]
pub(crate) fn list_projects(db: tauri::State<'_, Db>) -> Result<Vec<ProjectView>, String> {
    let store = db.lock().map_err(|e| e.to_string())?;
    store
        .list_projects()
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|p| view(&store, p))
        .collect()
}

#[tauri::command]
pub(crate) fn create_project(
    db: tauri::State<'_, Db>,
    project_name: String,
    client_id: String,
    currency: String,
    organization_id: Option<Uuid>,
    supplier_ids: Option<Vec<Uuid>>,
) -> Result<ProjectView, String> {
    if project_name.trim().is_empty() {
        return Err("El nombre de la obra es obligatorio".into());
    }
    let currency = match currency.as_str() {
        "ARS" => Currency::Ars,
        "USD" => Currency::Usd,
        _ => return Err("Moneda desconocida".into()),
    };
    let project = Project {
        id: Uuid::new_v4(),
        client_id: Uuid::parse_str(&client_id).map_err(|e| e.to_string())?,
        name: project_name.trim().to_owned(),
        currency,
    };
    let mut store = db.lock().map_err(|e| e.to_string())?;
    let org = match organization_id {
        Some(id) => id,
        None => store.default_organization().map_err(|e| e.to_string())?.id,
    };
    let suppliers = match supplier_ids {
        Some(ids) => ids,
        None => store
            .project_suppliers(project.id)
            .map_err(|e| e.to_string())?,
    };
    store
        .save_project_parties(&project, org, &suppliers)
        .map_err(|e| e.to_string())?;
    view(&store, project)
}
