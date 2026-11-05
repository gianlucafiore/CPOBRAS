use crate::Db;
use cpobras_core::Client;
use uuid::Uuid;

#[tauri::command]
pub(crate) fn list_clients(db: tauri::State<'_, Db>) -> Result<Vec<Client>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .list_clients()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn create_client(
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
