use serde::{Deserialize, Serialize};
use std::{path::Path, time::Duration};

const RELEASE_API: &str = "https://api.github.com/repos/gianlucafiore/CPOBRAS/releases?per_page=20";
const RELEASE_PAGE: &str = "https://github.com/gianlucafiore/CPOBRAS/releases/tag/";

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    draft: bool,
    prerelease: bool,
}

#[derive(Serialize)]
pub(crate) struct AvailableRelease {
    tag: String,
}

fn version(value: &str) -> Option<(u32, u32, u32)> {
    let mut parts = value.split('.');
    let mut component = || {
        let value = parts.next()?;
        if !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit()) {
            value.parse::<u32>().ok()
        } else {
            None
        }
    };
    let result = (component()?, component()?, component()?);
    parts.next().is_none().then_some(result)
}

fn release_version(tag: &str) -> Option<(u32, u32, u32)> {
    let raw = tag.strip_prefix('v')?;
    if let Some(windows) = raw.strip_suffix("-windows") {
        return if cfg!(target_os = "windows") {
            version(windows)
        } else {
            None
        };
    }
    version(raw)
}

#[tauri::command]
pub(crate) async fn available_release<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Option<AvailableRelease> {
    let current = app.package_info().version.to_string();
    let current = version(&current)?;
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(7))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("CPOBRAS desktop")
        .build()
        .ok()?;
    let releases: Vec<Release> = client
        .get(RELEASE_API)
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?
        .json()
        .await
        .ok()?;
    releases
        .into_iter()
        .filter(|release| !release.draft && !release.prerelease)
        .filter_map(|release| {
            let release_version = release_version(&release.tag_name)?;
            (release_version > current).then_some((release_version, release.tag_name))
        })
        .max_by_key(|(numbers, tag)| (*numbers, !tag.ends_with("-windows")))
        .map(|(_, tag)| AvailableRelease { tag })
}

#[tauri::command]
pub(crate) async fn open_release(tag: String) -> Result<(), String> {
    if release_version(&tag).is_none() {
        return Err("La versión indicada es inválida".into());
    }
    open_browser(format!("{RELEASE_PAGE}{tag}")).await
}

#[tauri::command]
pub(crate) async fn open_project_link(link: String) -> Result<(), String> {
    let url = match link.as_str() {
        "repository" => "https://github.com/gianlucafiore/CPOBRAS",
        "issues" => "https://github.com/gianlucafiore/CPOBRAS/issues",
        "support" => "https://gianlucafiore.github.io/CPOBRAS/#patrocinio",
        _ => return Err("El enlace no pertenece a CP Obras".into()),
    };
    open_browser(url.into()).await
}

pub(crate) async fn open_browser(url: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let status = crate::system_open::file_command(Path::new(&url))
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() {
            Ok(())
        } else {
            Err("No se pudo abrir el navegador predeterminado".into())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
