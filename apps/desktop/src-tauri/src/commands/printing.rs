use crate::{BackupDirectory, Db};
use cpobras_storage::printing::{BudgetPrintData, PrintProfile, SavedPrintProfile};
#[tauri::command]
pub(crate) fn get_print_profile(db: tauri::State<'_, Db>) -> Result<SavedPrintProfile, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .get_print_profile()
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn save_print_profile(
    db: tauri::State<'_, Db>,
    revision: u32,
    profile: PrintProfile,
) -> Result<SavedPrintProfile, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .save_print_profile(revision, &profile)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn get_budget_print_data(
    db: tauri::State<'_, Db>,
    estimate_id: uuid::Uuid,
) -> Result<BudgetPrintData, String> {
    db.lock()
        .map_err(|e| e.to_string())?
        .budget_print_data(estimate_id)
        .map_err(|e| e.to_string())
}
fn owned_pdf(
    exports: &std::path::Path,
    path: &std::path::Path,
) -> Result<std::path::PathBuf, String> {
    use std::io::Read;
    if path.is_symlink() || path.extension().and_then(|s| s.to_str()) != Some("pdf") {
        return Err("Seleccioná un PDF generado por CPOBRAS".into());
    }
    let root = exports.canonicalize().map_err(|e| e.to_string())?;
    let path = path.canonicalize().map_err(|e| e.to_string())?;
    if path.parent() != Some(root.as_path()) || !path.is_file() {
        return Err("El PDF no pertenece al directorio de exportaciones".into());
    }
    let mut file = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut magic = [0; 5];
    file.read_exact(&mut magic).map_err(|e| e.to_string())?;
    if &magic != b"%PDF-" {
        return Err("El archivo no es un PDF válido".into());
    }
    Ok(path)
}
#[tauri::command]
pub(crate) fn open_export_pdf(
    directory: tauri::State<'_, BackupDirectory>,
    path: String,
) -> Result<(), String> {
    let root = directory
        .0
        .parent()
        .ok_or("Directorio de datos inválido")?
        .join("exports");
    let path = owned_pdf(&root, std::path::Path::new(&path))?;
    let mut command = pdf_command(&path);
    let status = command
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|e| {
            format!(
                "No se pudo iniciar el lector PDF predeterminado: {e}. El archivo quedó guardado."
            )
        })?;
    if !status.success() {
        return Err("El sistema no pudo abrir el PDF. Configurá una aplicación predeterminada para PDF. El archivo quedó guardado.".into());
    }
    Ok(())
}
fn pdf_command(path: &std::path::Path) -> std::process::Command {
    #[cfg(target_os = "linux")]
    let mut command = {
        let mut c = std::process::Command::new("gio");
        c.arg("open");
        c
    };
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut c = std::process::Command::new("rundll32.exe");
        c.arg("url.dll,FileProtocolHandler");
        c
    };
    command.arg(path);
    command
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pdf_open_is_confined_to_owned_exports_and_uses_no_shell() {
        let root = std::env::temp_dir().join(format!("cpobras-reader-{}", uuid::Uuid::new_v4()));
        let exports = root.join("exports");
        std::fs::create_dir_all(&exports).unwrap();
        let pdf = exports.join("presupuesto con espacios.pdf");
        std::fs::write(&pdf, b"%PDF-1.4\n").unwrap();
        assert_eq!(owned_pdf(&exports, &pdf).unwrap(), pdf);
        let outside = root.join("otro.pdf");
        std::fs::write(&outside, b"%PDF-1.4\n").unwrap();
        assert!(owned_pdf(&exports, &outside).is_err());
        let invalid = exports.join("invalido.pdf");
        std::fs::write(&invalid, b"texto").unwrap();
        assert!(owned_pdf(&exports, &invalid).is_err());
        #[cfg(unix)]
        {
            let link = exports.join("enlace.pdf");
            std::os::unix::fs::symlink(&pdf, &link).unwrap();
            assert!(owned_pdf(&exports, &link).is_err());
        }
        let command = pdf_command(&pdf);
        assert_eq!(command.get_args().last().unwrap(), pdf.as_os_str());
        assert_ne!(command.get_program(), "sh");
        std::fs::remove_dir_all(root).unwrap();
    }
    #[cfg(target_os = "linux")]
    #[test]
    fn linux_opens_pdf_in_the_configured_default_reader_with_spaces_in_path() {
        use std::os::unix::fs::PermissionsExt;
        let root =
            std::env::temp_dir().join(format!("cpobras-default-pdf-{}", uuid::Uuid::new_v4()));
        let apps = root.join("data/applications");
        let config = root.join("config");
        std::fs::create_dir_all(&apps).unwrap();
        std::fs::create_dir_all(&config).unwrap();
        let script = root.join("reader.sh");
        std::fs::write(
            &script,
            b"#!/bin/sh\nprintf '%s' \"$1\" > \"$CPOBRAS_PRINT_CAPTURE\"\n",
        )
        .unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        std::fs::write(apps.join("cpobras-test-reader.desktop"),format!("[Desktop Entry]\nType=Application\nName=CPOBRAS test reader\nExec={} %f\nMimeType=application/pdf;\nTerminal=false\nStartupNotify=false\n",script.display())).unwrap();
        std::fs::write(
            config.join("mimeapps.list"),
            b"[Default Applications]\napplication/pdf=cpobras-test-reader.desktop;\n",
        )
        .unwrap();
        let pdf = root.join("presupuesto para cliente.pdf");
        std::fs::write(&pdf, b"%PDF-1.4\n").unwrap();
        let capture = root.join("received.txt");
        let output = pdf_command(&pdf)
            .env("XDG_DATA_HOME", root.join("data"))
            .env("XDG_CONFIG_HOME", &config)
            .env("CPOBRAS_PRINT_CAPTURE", &capture)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        for _ in 0..100 {
            if capture.is_file() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        assert_eq!(
            std::fs::read_to_string(capture).unwrap(),
            pdf.to_string_lossy()
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
