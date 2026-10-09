use cpobras_core::{Client, Currency, Project};
use cpobras_storage::LocalStore;
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
            update_project
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar CPOBRAS");
}
