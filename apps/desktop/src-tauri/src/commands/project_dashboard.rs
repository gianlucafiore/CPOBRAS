use crate::{BackupDirectory, Db};
use cpobras_storage::project_dashboard::AttachmentInfo;
use uuid::Uuid;
#[tauri::command]
pub(crate) fn list_measured_lines(
    db: tauri::State<'_, Db>,
    estimate_id: String,
) -> Result<Vec<Uuid>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .measured_lines(Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn list_project_attachments(
    db: tauri::State<'_, Db>,
    project_id: String,
) -> Result<Vec<AttachmentInfo>, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .project_attachments(Uuid::parse_str(&project_id).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) async fn add_project_attachment<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    project_id: String,
    description: String,
) -> Result<Option<Uuid>, String> {
    use tauri::Manager;
    use tauri_plugin_dialog::DialogExt;
    tauri::async_runtime::spawn_blocking(move || {
        let file = window
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("Agregar archivo al legajo de la obra")
            .add_filter(
                "Documentos y planos",
                &[
                    "pdf", "png", "jpg", "jpeg", "webp", "txt", "csv", "doc", "docx", "xls",
                    "xlsx", "odt", "ods", "dwg", "dxf", "zip",
                ],
            )
            .blocking_pick_file();
        let Some(file) = file else { return Ok(None) };
        let path = file.into_path().map_err(|e| e.to_string())?;
        use std::io::Read;
        let file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
        let mut bytes = Vec::new();
        file.take(20 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        let db = window.state::<Db>();
        let store = db.lock().map_err(|e| e.to_string())?;
        store
            .attach_project_file(
                Uuid::parse_str(&project_id).map_err(|e| e.to_string())?,
                path.file_name()
                    .and_then(|n| n.to_str())
                    .ok_or("Nombre inválido")?,
                &description,
                &bytes,
            )
            .map(Some)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) fn remove_project_attachment(
    db: tauri::State<'_, Db>,
    project_id: String,
    id: String,
) -> Result<(), String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .remove_project_attachment(
            Uuid::parse_str(&project_id).map_err(|e| e.to_string())?,
            Uuid::parse_str(&id).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn open_project_attachment(
    db: tauri::State<'_, Db>,
    directory: tauri::State<'_, BackupDirectory>,
    project_id: String,
    id: String,
) -> Result<(), String> {
    let (name, bytes) = db
        .lock()
        .map_err(|e| e.to_string())?
        .project_attachment_content(
            Uuid::parse_str(&project_id).map_err(|e| e.to_string())?,
            Uuid::parse_str(&id).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
    let root = directory
        .0
        .parent()
        .ok_or("Directorio inválido")?
        .join("attachment-previews")
        .join(Uuid::new_v4().to_string());
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let path = root.join(name);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    #[cfg(target_os = "linux")]
    let mut cmd = {
        let mut c = crate::system_open::command("gio");
        c.arg("open");
        c
    };
    #[cfg(target_os = "macos")]
    let mut cmd = crate::system_open::command("open");
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = crate::system_open::command("rundll32.exe");
        c.arg("url.dll,FileProtocolHandler");
        c
    };
    if !cmd.arg(path).status().map_err(|e| e.to_string())?.success() {
        return Err("No se pudo abrir el archivo con su aplicación predeterminada".into());
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn get_estimate_metadata(
    db: tauri::State<'_, Db>,
    estimate_id: String,
) -> Result<serde_json::Value, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .estimate_metadata(Uuid::parse_str(&estimate_id).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn open_quote_file(
    db: tauri::State<'_, Db>,
    directory: tauri::State<'_, BackupDirectory>,
    project_id: String,
    id: String,
) -> Result<(), String> {
    let (name, bytes) = db
        .lock()
        .map_err(|e| e.to_string())?
        .quote_file_content(
            Uuid::parse_str(&project_id).map_err(|e| e.to_string())?,
            Uuid::parse_str(&id).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
    let root = directory
        .0
        .parent()
        .ok_or("Directorio inválido")?
        .join("attachment-previews")
        .join(Uuid::new_v4().to_string());
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let path = root.join(name);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    #[cfg(target_os = "linux")]
    let mut cmd = {
        let mut c = crate::system_open::command("gio");
        c.arg("open");
        c
    };
    #[cfg(target_os = "macos")]
    let mut cmd = crate::system_open::command("open");
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = crate::system_open::command("rundll32.exe");
        c.arg("url.dll,FileProtocolHandler");
        c
    };
    if !cmd.arg(path).status().map_err(|e| e.to_string())?.success() {
        return Err("No se pudo abrir el archivo con su aplicación predeterminada".into());
    }
    Ok(())
}
