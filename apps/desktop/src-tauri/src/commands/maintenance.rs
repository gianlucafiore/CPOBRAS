use crate::{BackupDirectory, Db};
use uuid::Uuid;

use crate::backups::{BackupSettings, BackupStatus, BackupView, Backups};
#[tauri::command]
pub(crate) fn get_backup_settings(
    backups: tauri::State<'_, Backups>,
) -> Result<BackupStatus, String> {
    Ok(backups.lock().map_err(|e| e.to_string())?.status())
}
#[tauri::command]
pub(crate) fn save_backup_settings(
    backups: tauri::State<'_, Backups>,
    settings: BackupSettings,
) -> Result<BackupStatus, String> {
    backups
        .lock()
        .map_err(|e| e.to_string())?
        .configure(settings)
}
#[tauri::command]
pub(crate) fn verify_database(db: tauri::State<'_, Db>) -> Result<(), String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .verify_integrity()
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn create_backup(
    db: tauri::State<'_, Db>,
    backups: tauri::State<'_, Backups>,
) -> Result<String, String> {
    backups
        .lock()
        .map_err(|e| e.to_string())?
        .create(&db, "manual", crate::backups::now())
}
#[tauri::command]
pub(crate) fn list_backups(backups: tauri::State<'_, Backups>) -> Result<Vec<BackupView>, String> {
    backups.lock().map_err(|e| e.to_string())?.list()
}
#[tauri::command]
pub(crate) fn restore_backup(
    db: tauri::State<'_, Db>,
    backups: tauri::State<'_, Backups>,
    id: String,
) -> Result<String, String> {
    let id = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    let mut manager = backups.lock().map_err(|e| e.to_string())?;
    let source = manager.source(id)?;
    // Safety snapshot must succeed before the active database is changed.
    let mut store = db.lock().map_err(|e| e.to_string())?;
    let safety = manager.create_from_store(&store, "antes-de-restaurar", crate::backups::now())?;
    store.restore_from(source).map_err(|e| e.to_string())?;
    Ok(safety)
}
#[tauri::command]
pub(crate) fn open_backup_folder(backups: tauri::State<'_, Backups>) -> Result<(), String> {
    let folder = backups
        .lock()
        .map_err(|e| e.to_string())?
        .folder()
        .to_path_buf();
    if !folder.is_dir() {
        return Err("La carpeta de respaldo no está disponible".into());
    }
    #[cfg(target_os = "linux")]
    let mut command = {
        let mut c = std::process::Command::new("gio");
        c.arg("open");
        c
    };
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(target_os = "windows")]
    let mut command = std::process::Command::new("explorer.exe");
    let status = command
        .arg(folder)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|e| format!("No se pudo abrir la carpeta: {e}"))?;
    if !status.success() {
        return Err("El sistema no pudo abrir la carpeta de respaldos".into());
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn write_export(
    directory: tauri::State<'_, BackupDirectory>,
    name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    if bytes.len() > 50_000_000
        || name.len() > 200
        || name.starts_with('.')
        || name.is_empty()
        || !name
            .chars()
            .all(|c| c.is_alphanumeric() || " ._-".contains(c))
        || !name
            .rsplit('.')
            .next()
            .is_some_and(|ext| ["csv", "xlsx", "pdf", "json"].contains(&ext))
    {
        return Err("Nombre o tamaño de exportación inválido".into());
    }
    let export_dir = directory
        .0
        .parent()
        .ok_or("Directorio de datos inválido")?
        .join("exports");
    std::fs::create_dir_all(&export_dir).map_err(|e| e.to_string())?;
    let path = export_dir.join(format!("{}-{name}", Uuid::new_v4()));
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into())
}

#[tauri::command]
pub(crate) async fn choose_backup_folder<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    current_directory: Option<String>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = window
            .dialog()
            .file()
            .set_title("Elegir carpeta de respaldos")
            .set_parent(&window);
        if let Some(path) = current_directory
            .map(std::path::PathBuf::from)
            .filter(|p| p.is_absolute() && p.is_dir())
        {
            dialog = dialog.set_directory(path);
        }
        dialog
            .blocking_pick_folder()
            .map(|p| {
                p.into_path()
                    .map(|p| p.to_string_lossy().into_owned())
                    .map_err(|e| e.to_string())
            })
            .transpose()
    })
    .await
    .map_err(|e| e.to_string())?
}
