use cpobras_core::{Client, Currency, Project};
use cpobras_storage::{estimates::{Estimate, EstimateItem}, LocalStore};
use rust_decimal::Decimal;
use std::str::FromStr;
use std::sync::Mutex;
use tauri::Manager;
use uuid::Uuid;

type Db = Mutex<LocalStore>;

#[tauri::command]
fn list_clients(db: tauri::State<'_, Db>) -> Result<Vec<Client>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .list_clients()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn create_client(
    db: tauri::State<'_, Db>,
    client_name: String,
    cuit: Option<String>,
) -> Result<Client, String> {
    if client_name.trim().is_empty() {
        return Err("El nombre es obligatorio".into());
    }
    let client = Client {
        id: Uuid::new_v4(),
        name: client_name.trim().to_owned(),
        cuit: cuit.filter(|value| !value.trim().is_empty()),
    };
    db.lock()
        .map_err(|e| e.to_string())?
        .save_client(&client)
        .map_err(|e| e.to_string())?;
    Ok(client)
}

#[derive(serde::Serialize)]
struct LineView {
    id: String,
    description: String,
    unit: String,
    quantity: String,
    unit_cost: String,
    total: String,
}

impl From<EstimateItem> for LineView {
    fn from(line: EstimateItem) -> Self {
        Self {
            id: line.id.to_string(),
            description: line.description,
            unit: line.unit,
            quantity: line.quantity.to_string(),
            unit_cost: line.unit_cost_snapshot.to_string(),
            total: line.total().to_string(),
        }
    }
}

#[tauri::command]
fn list_estimate_lines(db: tauri::State<'_, Db>, estimate_id: String) -> Result<Vec<LineView>, String> {
    let id = Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?;
    let store = db.lock().map_err(|e| e.to_string())?;
    if store.get_estimate(id).map_err(|e| e.to_string())?.is_none() {
        return Err("El presupuesto no existe".into());
    }
    let lines = store.estimate_items(id).map_err(|e| e.to_string())?;
    Ok(lines.into_iter().map(LineView::from).collect())
}

#[tauri::command]
fn add_estimate_line(
    db: tauri::State<'_, Db>,
    estimate_id: String,
    description: String,
    unit: String,
    quantity: String,
    unit_cost: String,
) -> Result<LineView, String> {
    let estimate_id = Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?;
    let quantity = Decimal::from_str(&quantity.replace(',', ".")).map_err(|e| e.to_string())?;
    let unit_cost_snapshot = Decimal::from_str(&unit_cost.replace(',', ".")).map_err(|e| e.to_string())?;
    let mut store = db.lock().map_err(|e| e.to_string())?;
    let estimate = store.get_estimate(estimate_id).map_err(|e| e.to_string())?
        .ok_or("El presupuesto no existe")?;
    if estimate.issued {
        return Err("El presupuesto ya fue emitido".into());
    }
    let lines = store.estimate_items(estimate_id).map_err(|e| e.to_string())?;
    let position = lines.last().map_or(0, |line| line.position + 1);
    let line = EstimateItem {
        id: Uuid::new_v4(),
        estimate_id,
        position,
        analysis_id: None,
        description: description.trim().to_owned(),
        unit: unit.trim().to_owned(),
        quantity,
        unit_cost_snapshot,
    };
    store.add_estimate_item(&line).map_err(|e| e.to_string())?;
    Ok(LineView::from(line))
}

#[tauri::command]
fn list_project_estimates(
    db: tauri::State<'_, Db>,
    project_id: String,
) -> Result<Vec<EstimateView>, String> {
    let id = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    let store = db.lock().map_err(|e| e.to_string())?;
    let entries = store
        .list_project_estimates(id)
        .map_err(|e| e.to_string())?;
    Ok(entries.into_iter().map(EstimateView::from).collect())
}

#[derive(serde::Serialize)]
struct EstimateView {
    id: String,
    title: String,
    currency: String,
    issued: bool,
}

impl From<Estimate> for EstimateView {
    fn from(value: Estimate) -> Self {
        Self {
            id: value.id.to_string(),
            title: value.title,
            currency: match value.currency {
                Currency::Ars => "ARS".into(),
                Currency::Usd => "USD".into(),
            },
            issued: value.issued,
        }
    }
}

#[tauri::command]
fn create_estimate(
    db: tauri::State<'_, Db>,
    project_id: String,
    title: String,
) -> Result<EstimateView, String> {
    if title.trim().is_empty() {
        return Err("El título del presupuesto es obligatorio".into());
    }
    let project_id = Uuid::parse_str(&project_id).map_err(|e| e.to_string())?;
    let mut store = db.lock().map_err(|e| e.to_string())?;
    let project = store
        .get_project(project_id)
        .map_err(|e| e.to_string())?
        .ok_or("La obra no existe")?;
    let estimate = Estimate {
        id: Uuid::new_v4(),
        project_id,
        title: title.trim().to_owned(),
        currency: project.currency,
        issued: false,
    };
    store
        .create_estimate(&estimate)
        .map_err(|e| e.to_string())?;
    Ok(EstimateView::from(estimate))
}

#[tauri::command]
fn update_project(
    db: tauri::State<'_, Db>,
    project_id: String,
    project_name: String,
    client_id: String,
    currency: String,
) -> Result<Project, String> {
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
    store.save_project(&project).map_err(|e| e.to_string())?;
    Ok(project)
}

#[tauri::command]
fn list_projects(db: tauri::State<'_, Db>) -> Result<Vec<Project>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .list_projects()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn create_project(
    db: tauri::State<'_, Db>,
    project_name: String,
    client_id: String,
    currency: String,
) -> Result<Project, String> {
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
    db.lock()
        .map_err(|e| e.to_string())?
        .save_project(&project)
        .map_err(|e| e.to_string())?;
    Ok(project)
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            let store = LocalStore::open(directory.join("cpobras.sqlite"))
                .map_err(|e| -> Box<dyn std::error::Error> { Box::new(e) })?;
            app.manage(Mutex::new(store));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_clients,
            create_client,
            list_projects,
            create_project,
            update_project,
            list_project_estimates,
            create_estimate,
            list_estimate_lines,
            add_estimate_line
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar CPOBRAS");
}
