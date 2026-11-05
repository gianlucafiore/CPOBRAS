use crate::{BackupDirectory, Db};
use uuid::Uuid;

#[derive(serde::Serialize)]
pub(crate) struct BackupView {
    pub id: String,
    pub bytes: u64,
    pub created_at: u64,
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
    directory: tauri::State<'_, BackupDirectory>,
) -> Result<String, String> {
    let id = Uuid::new_v4();
    db.lock()
        .map_err(|e| e.to_string())?
        .backup_to(directory.0.join(format!("{id}.sqlite")))
        .map_err(|e| e.to_string())?;
    Ok(id.to_string())
}

#[tauri::command]
pub(crate) fn list_backups(
    directory: tauri::State<'_, BackupDirectory>,
) -> Result<Vec<BackupView>, String> {
    let mut result = Vec::new();
    for entry in std::fs::read_dir(&directory.0).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_file() {
            continue;
        }
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("sqlite") {
            continue;
        }
        let Some(id) = path
            .file_stem()
            .and_then(|s| s.to_str())
            .and_then(|s| Uuid::parse_str(s).ok())
        else {
            continue;
        };
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let created_at = metadata
            .modified()
            .map_err(|e| e.to_string())?
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_secs();
        result.push(BackupView {
            id: id.to_string(),
            bytes: metadata.len(),
            created_at,
        });
    }
    result.sort_by_key(|entry| std::cmp::Reverse(entry.created_at));
    Ok(result)
}

#[tauri::command]
pub(crate) fn restore_backup(
    db: tauri::State<'_, Db>,
    directory: tauri::State<'_, BackupDirectory>,
    id: String,
) -> Result<String, String> {
    let id = Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    let source = directory.0.join(format!("{id}.sqlite"));
    if !source.is_file() || source.is_symlink() {
        return Err("Copia inexistente".into());
    }
    let mut store = db.lock().map_err(|e| e.to_string())?;
    let safety = Uuid::new_v4();
    store
        .backup_to(directory.0.join(format!("{safety}.sqlite")))
        .map_err(|e| e.to_string())?;
    store.restore_from(source).map_err(|e| e.to_string())?;
    Ok(safety.to_string())
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
