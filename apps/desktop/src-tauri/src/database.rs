use cpobras_storage::LocalStore;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};

type Result<T> = std::result::Result<T, String>;

pub(crate) struct DatabaseSession {
    path: PathBuf,
    config: PathBuf,
    warning: Option<String>,
    is_default: bool,
    switching: Mutex<bool>,
}

#[derive(Serialize)]
pub(crate) struct DatabaseInfo {
    pub(crate) path: String,
    name: String,
    scope: Option<String>,
    warning: Option<String>,
}

impl DatabaseSession {
    pub(crate) fn load(directory: &Path) -> Result<(Self, LocalStore)> {
        let config = directory.join("active-database.json");
        let default = directory.join("cpobras.sqlite");
        let selected = (|| -> Result<Option<(PathBuf, LocalStore)>> {
            let bytes = match fs::read(&config) {
                Ok(bytes) => bytes,
                Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
                Err(error) => return Err(error.to_string()),
            };
            let path: PathBuf = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
            let path = existing_file(&path)?;
            let store = LocalStore::open_existing(&path).map_err(|e| e.to_string())?;
            Ok(Some((path, store)))
        })();
        let (path, store, warning) = match selected {
            Ok(Some((path, store))) => (path, store, None),
            other => {
                let warning = other.err().map(|error| {
                    format!("No se pudo abrir la última base de datos. Se abrió la base original. {error}")
                });
                let store = LocalStore::open(&default).map_err(|e| e.to_string())?;
                let path = default.canonicalize().map_err(|e| e.to_string())?;
                (path, store, warning)
            }
        };
        let is_default = default
            .canonicalize()
            .is_ok_and(|original| original == path);
        Ok((
            Self {
                path,
                config,
                warning,
                is_default,
                switching: Mutex::new(false),
            },
            store,
        ))
    }

    fn scope(&self) -> Option<String> {
        (!self.is_default).then(|| {
            format!(
                "{:x}",
                Sha256::digest(self.path.as_os_str().as_encoded_bytes())
            )
        })
    }

    pub(crate) fn services_directory(&self, directory: &Path) -> PathBuf {
        match self.scope() {
            Some(scope) => directory.join("databases").join(scope),
            None => directory.to_path_buf(),
        }
    }

    pub(crate) fn info(&self) -> DatabaseInfo {
        DatabaseInfo {
            path: self.path.to_string_lossy().into_owned(),
            name: self
                .path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            scope: self.scope(),
            warning: self.warning.clone(),
        }
    }

    pub(crate) fn select(&self, db: &crate::Db, path: PathBuf, create: bool) -> Result<bool> {
        let mut switching = self.switching.lock().map_err(|e| e.to_string())?;
        if *switching {
            return Err("Ya se está cambiando la base de datos".into());
        }
        let mut preference = tempfile::NamedTempFile::new_in(
            self.config
                .parent()
                .ok_or("Carpeta de configuración inválida")?,
        )
        .map_err(|e| e.to_string())?;

        let path = if create {
            create_database(path)?
        } else {
            let path = existing_file(&path)?;
            if path == self.path {
                if self.warning.is_none() {
                    return Ok(false);
                }
            } else {
                LocalStore::open_existing(&path).map_err(|e| e.to_string())?;
            }
            path
        };
        serde_json::to_writer(&mut preference, &path).map_err(|e| e.to_string())?;
        preference.flush().map_err(|e| e.to_string())?;
        preference.as_file().sync_all().map_err(|e| e.to_string())?;

        // Drain any command already using the connection. The old process never
        // opens the selected database for application commands.
        let mut store = db.lock().map_err(|e| e.to_string())?;
        store
            .disconnect_after(|| {
                preference
                    .persist(&self.config)
                    .map(|_| ())
                    .map_err(|e| e.error)
            })
            .map_err(|e| e.to_string())?;
        *switching = true;
        Ok(true)
    }
}

fn existing_file(path: &Path) -> Result<PathBuf> {
    if !path.is_absolute() || !path.is_file() {
        return Err(format!(
            "El archivo de base de datos no está disponible: {}",
            path.display()
        ));
    }
    path.canonicalize().map_err(|e| e.to_string())
}

fn create_database(mut path: PathBuf) -> Result<PathBuf> {
    match path.extension().and_then(|extension| extension.to_str()) {
        None if path.extension().is_none() => {
            path.set_extension("sqlite");
        }
        Some(extension)
            if ["sqlite", "sqlite3", "db"]
                .iter()
                .any(|valid| extension.eq_ignore_ascii_case(valid)) => {}
        _ => return Err("Usá la extensión .sqlite, .sqlite3 o .db".into()),
    }
    let name = path.file_name().ok_or("Nombre de archivo inválido")?;
    let directory = path
        .parent()
        .ok_or("Carpeta inválida")?
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let target = directory.join(name);
    for suffix in ["-wal", "-shm", "-journal"] {
        let mut sidecar = target.as_os_str().to_os_string();
        sidecar.push(suffix);
        match fs::symlink_metadata(sidecar) {
            Ok(_) => {
                return Err(
                    "Hay archivos auxiliares de SQLite con ese nombre. Elegí otro nombre.".into(),
                )
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    let temporary = tempfile::NamedTempFile::new_in(&directory).map_err(|e| e.to_string())?;
    // Initialize and close SQLite before publishing the file at its final path.
    drop(LocalStore::open(temporary.path()).map_err(|e| e.to_string())?);
    temporary.as_file().sync_all().map_err(|e| e.to_string())?;
    temporary.persist_noclobber(&target).map_err(|error| {
        if error.error.kind() == io::ErrorKind::AlreadyExists {
            "Ya existe un archivo con ese nombre. Elegí otro nombre o usá Abrir base de datos."
                .into()
        } else {
            error.to_string()
        }
    })?;
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;
    use cpobras_core::Client;

    #[test]
    fn creates_empty_database_and_reopens_each_file_with_its_own_data() {
        let directory = tempfile::tempdir().unwrap();
        let (original, mut store) = DatabaseSession::load(directory.path()).unwrap();
        let client = Client {
            id: uuid::Uuid::new_v4(),
            name: "Cliente original".into(),
            cuit: None,
        };
        store.save_client(&client).unwrap();
        let db = Mutex::new(store);

        let chosen = directory.path().join("Obra nueva");
        assert!(original.select(&db, chosen, true).unwrap());
        assert!(db.lock().unwrap().list_clients().is_err());

        let (empty, store) = DatabaseSession::load(directory.path()).unwrap();
        assert_eq!(empty.info().name, "Obra nueva.sqlite");
        assert!(empty.scope().is_some());
        assert_ne!(
            empty.services_directory(directory.path()),
            original.services_directory(directory.path()),
        );
        assert!(store.list_clients().unwrap().is_empty());
        assert_eq!(store.organizations().unwrap().len(), 1);
        assert!(empty
            .select(&Mutex::new(store), original.path, false)
            .unwrap());

        let (original, store) = DatabaseSession::load(directory.path()).unwrap();
        assert!(original.scope().is_none());
        assert_eq!(store.list_clients().unwrap(), vec![client]);
    }

    #[test]
    fn cancellation_equivalent_and_errors_leave_active_connection_usable() {
        let directory = tempfile::tempdir().unwrap();
        let (session, store) = DatabaseSession::load(directory.path()).unwrap();
        let db = Mutex::new(store);
        let invalid = directory.path().join("invalid.sqlite");
        fs::write(&invalid, b"no es sqlite").unwrap();
        assert!(session.select(&db, invalid.clone(), false).is_err());
        assert!(session.select(&db, invalid.clone(), true).is_err());
        assert_eq!(fs::read(invalid).unwrap(), b"no es sqlite");
        assert!(!session.select(&db, session.path.clone(), false).unwrap());
        assert!(!session.config.exists());
        assert!(db.lock().unwrap().list_clients().is_ok());

        let candidate = create_database(directory.path().join("other.sqlite")).unwrap();
        // Force the atomic preference replacement to fail after validation.
        fs::create_dir(&session.config).unwrap();
        assert!(session.select(&db, candidate, false).is_err());
        assert!(db.lock().unwrap().list_clients().is_ok());
    }

    #[test]
    fn missing_last_database_falls_back_without_recreating_it() {
        let directory = tempfile::tempdir().unwrap();
        let (session, store) = DatabaseSession::load(directory.path()).unwrap();
        let missing = directory.path().join("desconectada.sqlite");
        fs::write(&session.config, serde_json::to_vec(&missing).unwrap()).unwrap();
        drop(store);
        let (fallback, _) = DatabaseSession::load(directory.path()).unwrap();
        assert_eq!(fallback.path, session.path);
        assert!(fallback.info().warning.is_some());
        assert!(!missing.exists());
    }
}
