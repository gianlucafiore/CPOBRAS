//! Local scheduling and consistent snapshots. Cloud sync belongs to the user's folder client.
use crate::Db;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;
type Result<T> = std::result::Result<T, String>;
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct BackupSettings {
    pub directory: PathBuf,
    pub enabled: bool,
    pub interval_minutes: u32,
}
#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(default)]
struct History {
    last_success: Option<u64>,
    last_file: Option<String>,
    last_attempt: Option<u64>,
    last_error: Option<String>,
}
#[derive(Serialize, Deserialize)]
struct Saved {
    settings: BackupSettings,
    history: History,
}
#[derive(Serialize)]
pub(crate) struct BackupStatus {
    #[serde(flatten)]
    pub settings: BackupSettings,
    #[serde(flatten)]
    history: History,
    pub next_due: Option<u64>,
    pub internal_directory: PathBuf,
}
#[derive(Serialize)]
pub(crate) struct BackupView {
    pub id: String,
    pub name: String,
    pub directory: PathBuf,
    pub bytes: u64,
    pub created_at: u64,
}
pub(crate) struct BackupManager {
    internal: PathBuf,
    config: PathBuf,
    settings: BackupSettings,
    history: History,
}
pub(crate) type Backups = Mutex<BackupManager>;
pub(crate) fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn file_id(path: &Path) -> Option<Uuid> {
    if path.extension()?.to_str()? != "sqlite" {
        return None;
    }
    let stem = path.file_stem()?.to_str()?;
    if let Ok(id) = Uuid::parse_str(stem) {
        return Some(id);
    }
    if !stem.starts_with("cpobras-") {
        return None;
    }
    Uuid::parse_str(stem.get(stem.len().checked_sub(36)?..)?).ok()
}
impl BackupManager {
    pub fn load(internal: PathBuf) -> Result<Self> {
        let config = internal
            .parent()
            .ok_or("Directorio inválido")?
            .join("backup-settings.json");
        let loaded = (|| -> Result<Option<Saved>> {
            if !config.exists() {
                return Ok(None);
            }
            let saved: Saved =
                serde_json::from_slice(&fs::read(&config).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?;
            validate_settings(&saved.settings)?;
            Ok(Some(saved))
        })();
        let defaults = || {
            (
                BackupSettings {
                    directory: internal.clone(),
                    enabled: false,
                    interval_minutes: 60,
                },
                History::default(),
            )
        };
        let (settings, history) = match loaded {
            Ok(Some(saved)) => (saved.settings, saved.history),
            Ok(None) => defaults(),
            Err(e) => {
                let (s, mut h) = defaults();
                h.last_error = Some(format!(
                    "Revisá y guardá la configuración de respaldos: {e}"
                ));
                (s, h)
            }
        };
        Ok(Self {
            internal,
            config,
            settings,
            history,
        })
    }
    fn persist(&self, settings: &BackupSettings, history: &History) -> Result<()> {
        use std::io::Write;
        let mut temp = tempfile::Builder::new()
            .prefix(".backup-settings-")
            .tempfile_in(
                self.config
                    .parent()
                    .ok_or("Carpeta de configuración inválida")?,
            )
            .map_err(|e| e.to_string())?;
        temp.write_all(
            &serde_json::to_vec_pretty(&Saved {
                settings: settings.clone(),
                history: history.clone(),
            })
            .map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        temp.as_file().sync_all().map_err(|e| e.to_string())?;
        temp.persist(&self.config).map_err(|e| e.to_string())?;
        Ok(())
    }
    pub fn status(&self) -> BackupStatus {
        BackupStatus {
            settings: self.settings.clone(),
            history: self.history.clone(),
            next_due: self.settings.enabled.then(|| {
                self.history
                    .last_success
                    .map(|t| t.saturating_add(u64::from(self.settings.interval_minutes) * 60))
                    .unwrap_or_else(now)
                    .max(
                        self.history
                            .last_attempt
                            .map(|t| t.saturating_add(300))
                            .unwrap_or(0),
                    )
            }),
            internal_directory: self.internal.clone(),
        }
    }
    pub fn configure(&mut self, mut settings: BackupSettings) -> Result<BackupStatus> {
        validate_settings(&settings)?;
        if settings.enabled
            || settings.directory != self.settings.directory
            || settings.directory.is_dir()
        {
            fs::create_dir_all(&settings.directory)
                .map_err(|e| format!("No se pudo crear la carpeta: {e}"))?;
            settings.directory = settings
                .directory
                .canonicalize()
                .map_err(|e| e.to_string())?;
            // Probe without overwriting user files. A disconnected destination must not become active.
            let probe = settings
                .directory
                .join(format!(".cpobras-probe-{}", Uuid::new_v4()));
            let f = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&probe)
                .map_err(|e| format!("La carpeta no permite escribir: {e}"))?;
            drop(f);
            fs::remove_file(probe).map_err(|e| e.to_string())?;
        }
        let history = if settings.directory != self.settings.directory {
            History::default()
        } else {
            self.history.clone()
        };
        self.persist(&settings, &history)?;
        self.settings = settings;
        self.history = history;
        Ok(self.status())
    }
    fn roots(&self) -> Vec<PathBuf> {
        let mut roots = vec![self.settings.directory.clone()];
        if self.internal != self.settings.directory {
            roots.push(self.internal.clone());
        }
        roots
    }
    pub fn list(&self) -> Result<Vec<BackupView>> {
        let mut out = vec![];
        for root in self.roots() {
            // Report unavailable selected storage; never pretend there are no copies.
            for e in fs::read_dir(&root)
                .map_err(|e| format!("No se pudo leer {}: {e}", root.display()))?
            {
                let e = e.map_err(|e| e.to_string())?;
                if !e.file_type().map_err(|e| e.to_string())?.is_file() {
                    continue;
                }
                let Some(id) = file_id(&e.path()) else {
                    continue;
                };
                let meta = e.metadata().map_err(|e| e.to_string())?;
                out.push(BackupView {
                    id: id.to_string(),
                    name: e.file_name().to_string_lossy().into(),
                    directory: root.clone(),
                    bytes: meta.len(),
                    created_at: meta
                        .modified()
                        .map_err(|e| e.to_string())?
                        .duration_since(UNIX_EPOCH)
                        .map_err(|e| e.to_string())?
                        .as_secs(),
                });
            }
        }
        out.sort_by_key(|b| std::cmp::Reverse(b.created_at));
        Ok(out)
    }
    pub fn source(&self, id: Uuid) -> Result<PathBuf> {
        for root in self.roots() {
            let entries = match fs::read_dir(root) {
                Ok(e) => e,
                Err(_) => continue,
            };
            for e in entries {
                let e = e.map_err(|e| e.to_string())?;
                if e.file_type().map_err(|e| e.to_string())?.is_file()
                    && file_id(&e.path()) == Some(id)
                {
                    return Ok(e.path());
                }
            }
        }
        Err("Copia inexistente o carpeta no disponible".into())
    }
    pub fn create(&mut self, db: &Db, kind: &str, at: u64) -> Result<String> {
        let store = db.lock().map_err(|e| e.to_string())?;
        self.create_from_store(&store, kind, at)
    }
    pub fn create_from_store(
        &mut self,
        store: &cpobras_storage::LocalStore,
        kind: &str,
        at: u64,
    ) -> Result<String> {
        self.history.last_attempt = Some(at);
        let result = (|| {
            if !self.settings.directory.is_dir() {
                return Err("La carpeta de respaldo no está disponible".into());
            }
            let id = Uuid::new_v4();
            let date = chrono::DateTime::from_timestamp(at as i64, 0)
                .ok_or("Fecha inválida")?
                .format("%Y-%m-%d_%H-%M-%SZ");
            let name = format!("cpobras-{kind}-{date}-{id}.sqlite");
            let temp = self
                .settings
                .directory
                .join(format!(".cpobras-{id}.partial"));
            let target = self.settings.directory.join(&name);
            let write = (|| {
                store.backup_to(&temp).map_err(|e| e.to_string())?;
                // Windows FlushFileBuffers requires a writable file handle.
                fs::OpenOptions::new()
                    .write(true)
                    .open(&temp)
                    .map_err(|e| e.to_string())?
                    .sync_all()
                    .map_err(|e| e.to_string())?;
                fs::rename(&temp, &target).map_err(|e| e.to_string())?;
                Ok(())
            })();
            if let Err(e) = write {
                let _ = fs::remove_file(temp);
                return Err(e);
            }
            self.history.last_success = Some(at);
            self.history.last_file = Some(name);
            Ok(id.to_string())
        })();
        self.history.last_error = result.as_ref().err().cloned();
        if let Err(e) = self.persist(&self.settings, &self.history) {
            self.history.last_error =
                Some(format!("No se pudo guardar el estado de respaldos: {e}"));
            if result.is_ok() {
                return Err(self.history.last_error.clone().unwrap());
            }
        }
        result
    }
    pub fn tick(&mut self, db: &Db, at: u64) {
        let due = self.settings.enabled
            && self.history.last_success.is_none_or(|t| {
                at.saturating_sub(t) >= u64::from(self.settings.interval_minutes) * 60
            });
        let retry = self
            .history
            .last_attempt
            .is_none_or(|t| at.saturating_sub(t) >= 300);
        if due && retry {
            let _ = self.create(db, "auto", at);
        }
    }
    pub fn folder(&self) -> &Path {
        &self.settings.directory
    }
}
fn validate_settings(s: &BackupSettings) -> Result<()> {
    if !s.directory.is_absolute()
        || s.directory.as_os_str().len() > 4096
        || ![15, 60, 240, 1440].contains(&s.interval_minutes)
    {
        return Err("Elegí una ruta absoluta y una frecuencia válida".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use cpobras_core::Client;
    use cpobras_storage::LocalStore;
    fn fixture() -> (tempfile::TempDir, BackupManager, Db) {
        let temp = tempfile::tempdir().unwrap();
        let internal = temp.path().join("backups");
        fs::create_dir(&internal).unwrap();
        let manager = BackupManager::load(internal).unwrap();
        (temp, manager, Mutex::new(LocalStore::in_memory().unwrap()))
    }
    fn configured(manager: &mut BackupManager, dir: PathBuf) {
        manager
            .configure(BackupSettings {
                directory: dir,
                enabled: true,
                interval_minutes: 15,
            })
            .unwrap();
    }
    #[test]
    fn moved_backup_restores_after_writable_preventive_snapshot() {
        let (source_dir, mut source_manager, source) = fixture();
        let client = Client {
            id: Uuid::new_v4(),
            name: "Desde otra máquina".into(),
            cuit: None,
        };
        source.lock().unwrap().save_client(&client).unwrap();
        let id = source_manager.create(&source, "manual", 1000).unwrap();
        let (target_dir, mut target_manager, target) = fixture();
        let original = source_manager
            .source(Uuid::parse_str(&id).unwrap())
            .unwrap();
        let imported = target_manager.folder().join(original.file_name().unwrap());
        fs::copy(&original, &imported).unwrap();
        let bytes = fs::read(&imported).unwrap();
        let mut store = target.lock().unwrap();
        let safety = target_manager
            .create_from_store(&store, "antes-de-restaurar", 2000)
            .unwrap();
        store
            .restore_from(
                target_manager
                    .source(Uuid::parse_str(&id).unwrap())
                    .unwrap(),
            )
            .unwrap();
        assert_eq!(store.list_clients().unwrap(), vec![client]);
        let safety = target_manager
            .source(Uuid::parse_str(&safety).unwrap())
            .unwrap();
        assert!(LocalStore::open_existing(safety)
            .unwrap()
            .list_clients()
            .unwrap()
            .is_empty());
        assert_eq!(fs::read(&imported).unwrap(), bytes);
        drop((source_dir, target_dir));
    }

    #[test]
    fn scheduler_persists_restarts_and_produces_restorable_snapshots() {
        let (temp, mut m, db) = fixture();
        let client = Client {
            id: Uuid::new_v4(),
            name: "Contacto respaldado".into(),
            cuit: None,
        };
        db.lock().unwrap().save_client(&client).unwrap();
        configured(&mut m, temp.path().join("Nube personal/CPOBRAS"));
        m.tick(&db, 1000);
        assert_eq!(m.list().unwrap().len(), 1);
        assert_eq!(m.history.last_success, Some(1000));
        let copy = m.list().unwrap().remove(0);
        assert!(copy.name.starts_with("cpobras-auto-1970-01-01_00-16-40Z-"));
        assert_eq!(
            LocalStore::open(m.source(Uuid::parse_str(&copy.id).unwrap()).unwrap())
                .unwrap()
                .list_clients()
                .unwrap()[0]
                .name,
            client.name
        );
        m.tick(&db, 1899);
        assert_eq!(m.list().unwrap().len(), 1);
        let mut restarted = BackupManager::load(m.internal.clone()).unwrap();
        assert_eq!(restarted.settings.directory, m.settings.directory);
        restarted.tick(&db, 1900);
        assert_eq!(restarted.list().unwrap().len(), 2);
        restarted.create(&db, "manual", 2000).unwrap();
        restarted.tick(&db, 2800);
        assert_eq!(restarted.list().unwrap().len(), 3);
        restarted.settings.enabled = false;
        restarted.tick(&db, 10000);
        assert_eq!(restarted.list().unwrap().len(), 3);
        assert!(!fs::read_dir(&m.settings.directory).unwrap().any(|e| e
            .unwrap()
            .path()
            .extension()
            .is_some_and(|x| x == "partial")));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(m.settings.directory.join(copy.name))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
    }
    #[test]
    fn unavailable_folder_reports_failure_and_retries_without_fallback_or_incomplete_files() {
        let (temp, mut m, db) = fixture();
        let target = temp.path().join("cloud");
        configured(&mut m, target.clone());
        // Use the configured path, including the Windows verbatim prefix returned to the UI.
        let target = m.folder().to_path_buf();
        m.tick(&db, 1000);
        fs::rename(&target, temp.path().join("disconnected")).unwrap();
        m.tick(&db, 1900);
        assert!(m
            .history
            .last_error
            .as_ref()
            .unwrap()
            .contains("disponible"));
        assert!(!target.exists());
        assert_eq!(m.history.last_success, Some(1000));
        assert_eq!(fs::read_dir(&m.internal).unwrap().count(), 0);
        // Pausing must not recreate an unavailable folder.
        m.configure(BackupSettings {
            directory: target.clone(),
            enabled: false,
            interval_minutes: 15,
        })
        .unwrap();
        assert!(!target.exists());
        m.settings.enabled = true;

        fs::rename(temp.path().join("disconnected"), &target).unwrap();
        m.tick(&db, 2100);
        assert_eq!(m.list().unwrap().len(), 1);
        m.tick(&db, 2200);
        assert_eq!(m.list().unwrap().len(), 2);
        assert!(m.history.last_error.is_none());
    }
    #[test]
    fn invalid_settings_do_not_replace_working_config_and_broken_config_does_not_prevent_startup() {
        let (temp, mut m, _) = fixture();
        configured(&mut m, temp.path().join("cloud"));
        let original = fs::read(&m.config).unwrap();
        assert!(m
            .configure(BackupSettings {
                directory: PathBuf::from("relative"),
                enabled: true,
                interval_minutes: 15
            })
            .is_err());
        assert!(m
            .configure(BackupSettings {
                directory: temp.path().join("elsewhere"),
                enabled: true,
                interval_minutes: 0
            })
            .is_err());
        assert_eq!(fs::read(&m.config).unwrap(), original);
        fs::write(&m.config, b"broken").unwrap();
        let mut recovered = BackupManager::load(m.internal.clone()).unwrap();
        assert!(!recovered.settings.enabled);
        assert!(recovered.history.last_error.is_some());
        configured(&mut recovered, temp.path().join("new cloud"));
        assert!(
            BackupManager::load(m.internal.clone())
                .unwrap()
                .settings
                .enabled
        );
    }
    #[test]
    fn old_internal_copies_remain_available_and_symlinks_and_partial_files_are_excluded() {
        let (temp, mut m, db) = fixture();
        let old = Uuid::new_v4();
        db.lock()
            .unwrap()
            .backup_to(m.internal.join(format!("{old}.sqlite")))
            .unwrap();
        configured(&mut m, temp.path().join("cloud"));
        let id = m.create(&db, "manual", 1000).unwrap();
        fs::write(m.folder().join(".cpobras-incomplete.partial"), b"partial").unwrap();
        fs::write(m.folder().join("other.sqlite"), b"other").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(
            m.source(old).unwrap(),
            m.folder().join(format!("{}.sqlite", Uuid::new_v4())),
        )
        .unwrap();
        assert_eq!(m.list().unwrap().len(), 2);
        assert!(m.source(old).unwrap().starts_with(&m.internal));
        assert!(m
            .source(Uuid::parse_str(&id).unwrap())
            .unwrap()
            .starts_with(m.folder()));
        assert!(m.source(Uuid::new_v4()).is_err());
    }
}
