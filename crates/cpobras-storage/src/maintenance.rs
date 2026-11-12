//! Consistent SQLite snapshots; never copy a live database file directly.
use crate::{LocalStore, Result, StorageError};
use rusqlite::{backup::Backup, Connection, DatabaseName, OpenFlags};
use std::{fs::OpenOptions, path::Path, time::Duration};

fn verify(conn: &Connection) -> Result<()> {
    let integrity: String = conn.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
    if integrity != "ok" {
        return Err(StorageError::InvalidValue(format!(
            "Integridad SQLite: {integrity}"
        )));
    }
    let mut statement = conn.prepare("PRAGMA foreign_key_check")?;
    if statement.query([])?.next()?.is_some() {
        return Err(StorageError::InvalidValue(
            "Hay referencias inválidas en la base".into(),
        ));
    }
    Ok(())
}

impl LocalStore {
    pub(crate) fn schema(&self, include_views: bool) -> Result<Vec<(String, String, String)>> {
        Ok(self.conn.prepare("SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name<>'schema_migrations' AND (type IN ('table','index','trigger') OR (?1 AND type='view')) AND sql IS NOT NULL ORDER BY type,name")?
            .query_map([include_views], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
            .collect::<std::result::Result<_, _>>()?)
    }

    pub fn verify_integrity(&self) -> Result<()> {
        verify(&self.conn)
    }

    /// Refuses to overwrite an existing backup. SQLite's backup API includes WAL pages.
    pub fn backup_to(&self, path: impl AsRef<Path>) -> Result<()> {
        self.verify_integrity()?;
        let path = path.as_ref();
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        drop(options.open(path)?);
        let result = self
            .conn
            .backup(DatabaseName::Main, path, None)
            .map_err(StorageError::from)
            .and_then(|_| {
                verify(&Connection::open_with_flags(
                    path,
                    OpenFlags::SQLITE_OPEN_READ_ONLY,
                )?)
            });
        if result.is_err() {
            let _ = std::fs::remove_file(path);
        }
        result
    }

    /// Validate before altering the live connection. A safety snapshot is the caller's responsibility.
    pub fn restore_from(&mut self, path: impl AsRef<Path>) -> Result<()> {
        let source = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        verify(&source)?;
        let current: i64 =
            self.conn
                .query_row("SELECT MAX(version) FROM schema_migrations", [], |r| {
                    r.get(0)
                })?;
        let candidate: i64 =
            source.query_row("SELECT MAX(version) FROM schema_migrations", [], |r| {
                r.get(0)
            })?;
        if candidate < 1 || candidate > current {
            return Err(StorageError::InvalidValue(
                "La copia pertenece a una versión no admitida".into(),
            ));
        }
        // Migrate an isolated in-memory clone. Neither the original backup nor the live database
        // is changed until the candidate has passed migrations and schema validation.
        let mut cloned = Connection::open_in_memory()?;
        Backup::new(&source, &mut cloned)?.run_to_completion(
            100,
            Duration::from_millis(10),
            None,
        )?;
        let migrated = LocalStore::initialize(cloned, false)?;
        migrated.verify_integrity()?;
        let source = &migrated.conn;
        let tables: Vec<String> = self
            .conn
            .prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
            )?
            .query_map([], |r| r.get(0))?
            .collect::<std::result::Result<_, _>>()?;
        for table in tables {
            let exists: bool = source.query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
                [table],
                |r| r.get(0),
            )?;
            if !exists {
                return Err(StorageError::InvalidValue(
                    "La copia no es una base completa de CPOBRAS".into(),
                ));
            }
        }
        if migrated.schema(false)? != self.schema(false)? {
            return Err(StorageError::InvalidValue(
                "La estructura de la copia no coincide con la base actual".into(),
            ));
        }
        Backup::new(source, &mut self.conn)?.run_to_completion(
            100,
            Duration::from_millis(10),
            None,
        )?;
        self.verify_integrity()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use cpobras_core::Client;
    use uuid::Uuid;

    #[test]
    fn snapshot_restores_without_overwriting_backups() {
        let path = std::env::temp_dir().join(format!("cpobras-{}.sqlite", Uuid::new_v4()));
        let mut store = LocalStore::in_memory().unwrap();
        let client = Client {
            id: Uuid::new_v4(),
            name: "Cliente inicial".into(),
            cuit: None,
        };
        store.save_client(&client).unwrap();
        store.backup_to(&path).unwrap();
        assert!(store.backup_to(&path).is_err());
        store
            .save_client(&Client {
                id: Uuid::new_v4(),
                name: "Posterior".into(),
                cuit: None,
            })
            .unwrap();
        store.restore_from(&path).unwrap();
        assert_eq!(store.list_clients().unwrap(), vec![client]);
        store.verify_integrity().unwrap();
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn invalid_restore_preserves_live_data() {
        let path = std::env::temp_dir().join(format!("cpobras-{}.sqlite", Uuid::new_v4()));
        std::fs::write(&path, b"not sqlite").unwrap();
        let mut store = LocalStore::in_memory().unwrap();
        let client = Client {
            id: Uuid::new_v4(),
            name: "Conservar".into(),
            cuit: None,
        };
        store.save_client(&client).unwrap();
        assert!(store.restore_from(&path).is_err());
        assert_eq!(store.list_clients().unwrap(), vec![client]);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn opens_committed_wal_data_and_closes_without_losing_it() {
        let path = std::env::temp_dir().join(format!("cpobras-wal-{}.sqlite", Uuid::new_v4()));
        let mut writer = LocalStore::open(&path).unwrap();
        writer
            .conn
            .pragma_update(None, "journal_mode", "WAL")
            .unwrap();
        writer
            .conn
            .pragma_update(None, "wal_autocheckpoint", 0)
            .unwrap();
        let client = Client {
            id: Uuid::new_v4(),
            name: "Confirmado en WAL".into(),
            cuit: None,
        };
        writer.save_client(&client).unwrap();
        let reader = LocalStore::open_existing(&path).unwrap();
        assert_eq!(reader.list_clients().unwrap(), vec![client.clone()]);
        drop(reader);
        writer.disconnect_after(|| Ok(())).unwrap();
        let reopened = LocalStore::open_existing(&path).unwrap();
        assert_eq!(reopened.list_clients().unwrap(), vec![client]);
        drop(reopened);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn rejected_file_is_not_created_or_partially_migrated() {
        let path =
            std::env::temp_dir().join(format!("cpobras-incompatible-{}.sqlite", Uuid::new_v4()));
        assert!(LocalStore::open_existing(&path).is_err());
        assert!(!path.exists());
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(crate::INITIAL_MIGRATION).unwrap();
        conn.execute("INSERT INTO schema_migrations(version) VALUES (1)", [])
            .unwrap();
        // Migration 2 can succeed, but migration 3 will collide with this table.
        conn.execute("CREATE TABLE estimates (invalid TEXT)", [])
            .unwrap();
        drop(conn);
        assert!(LocalStore::open_existing(&path).is_err());
        let conn = Connection::open(&path).unwrap();
        assert_eq!(
            conn.query_row("SELECT MAX(version) FROM schema_migrations", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
        drop(conn);
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn rejects_future_schema_and_migrations_are_repeatable() {
        let path = std::env::temp_dir().join(format!("cpobras-{}.sqlite", Uuid::new_v4()));
        drop(LocalStore::open(&path).unwrap());
        drop(LocalStore::open(&path).unwrap());
        let conn = Connection::open(&path).unwrap();
        conn.execute("INSERT INTO schema_migrations(version) VALUES (9999)", [])
            .unwrap();
        drop(conn);
        assert!(LocalStore::open(&path).is_err());
        std::fs::remove_file(path).unwrap();
    }
}
