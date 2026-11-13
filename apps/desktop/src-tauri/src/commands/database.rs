use crate::{
    database::{DatabaseInfo, DatabaseSession},
    Db,
};
use tauri::{Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub(crate) fn active_database(session: tauri::State<'_, DatabaseSession>) -> DatabaseInfo {
    session.info()
}

#[tauri::command]
pub(crate) async fn switch_database<R: tauri::Runtime>(
    window: WebviewWindow<R>,
    create: bool,
) -> Result<&'static str, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let app = window.app_handle();
        let session = app.state::<DatabaseSession>();
        let info = session.info();
        let mut dialog = window
            .dialog()
            .file()
            .set_parent(&window)
            .add_filter("Bases SQLite", &["sqlite", "sqlite3", "db"]);
        if let Some(parent) = std::path::Path::new(&info.path).parent() {
            dialog = dialog.set_directory(parent);
        }
        let selected = if create {
            dialog
                .set_title("Nueva base de datos de CPOBRAS")
                .set_file_name("nueva-base.sqlite")
                .blocking_save_file()
        } else {
            dialog
                .set_title("Abrir base de datos de CPOBRAS")
                .add_filter("Todos los archivos", &["*"])
                .blocking_pick_file()
        };
        if let Some(selected) = selected {
            let path = selected
                .into_path()
                .map_err(|e| format!("No se pudo interpretar la ruta seleccionada: {e}"))?;
            if session
                .select(&app.state::<Db>(), path.clone(), create)
                .map_err(|error| format!("Archivo seleccionado: {}. {error}", path.display()))?
            {
                app.restart();
            }
            return Ok("unchanged");
        }
        Ok("cancelled")
    })
    .await
    .map_err(|e| e.to_string())?
}
