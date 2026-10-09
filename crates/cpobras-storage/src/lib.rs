//! SQLite local-first persistence layer. Never open a shared network database.
use cpobras_core::{Client, Currency, Project, UnitCostAnalysis};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use uuid::Uuid;

pub mod estimates;
pub mod resource_catalog;

const INITIAL_MIGRATION: &str = include_str!("../migrations/0001_initial.sql");
const RESOURCES_MIGRATION: &str = include_str!("../migrations/0002_resources.sql");
const ESTIMATES_MIGRATION: &str = include_str!("../migrations/0003_estimates.sql");

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("sqlite: {0}")]
    Sql(#[from] rusqlite::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("uuid: {0}")]
    Uuid(#[from] uuid::Error),
    #[error("invalid currency code: {0}")]
    Currency(String),
    #[error("invalid value: {0}")]
    InvalidValue(String),
}

pub type Result<T> = std::result::Result<T, StorageError>;

pub struct LocalStore {
    conn: Connection,
}

impl LocalStore {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let conn = Connection::open(path)?;
        Self::initialize(conn)
    }

    pub fn in_memory() -> Result<Self> {
        Self::initialize(Connection::open_in_memory()?)
    }

    fn initialize(conn: Connection) -> Result<Self> {
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        conn.execute_batch(INITIAL_MIGRATION)?;
        conn.execute(
            "INSERT OR IGNORE INTO schema_migrations(version) VALUES (1)",
            [],
        )?;
        let applied: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=2)",
            [],
            |row| row.get(0),
        )?;
        if !applied {
            conn.execute_batch("BEGIN IMMEDIATE")?;
            let result = conn.execute_batch(RESOURCES_MIGRATION).and_then(|_| {
                conn.execute("INSERT INTO schema_migrations(version) VALUES (2)", [])?;
                Ok(())
            });
            if let Err(err) = result {
                let _ = conn.execute_batch("ROLLBACK");
                return Err(err.into());
            }
            conn.execute_batch("COMMIT")?;
        }
        let applied: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=3)",
            [],
            |row| row.get(0),
        )?;
        if !applied {
            conn.execute_batch("BEGIN IMMEDIATE")?;
            let result = conn.execute_batch(ESTIMATES_MIGRATION).and_then(|_| {
                conn.execute("INSERT INTO schema_migrations(version) VALUES (3)", [])?;
                Ok(())
            });
            if let Err(err) = result {
                let _ = conn.execute_batch("ROLLBACK");
                return Err(err.into());
            }
            conn.execute_batch("COMMIT")?;
        }
        Ok(Self { conn })
    }

    pub fn save_client(&mut self, client: &Client) -> Result<()> {
        self.conn.execute(
            "INSERT INTO clients(id, name, cuit) VALUES (?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, cuit=excluded.cuit",
            params![client.id.to_string(), client.name, client.cuit],
        )?;
        Ok(())
    }

    pub fn get_client(&self, id: Uuid) -> Result<Option<Client>> {
        let row = self
            .conn
            .query_row(
                "SELECT name, cuit FROM clients WHERE id=?1",
                [id.to_string()],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
            )
            .optional()?;
        Ok(row.map(|(name, cuit)| Client { id, name, cuit }))
    }

    pub fn save_project(&mut self, project: &Project) -> Result<()> {
        let currency = match project.currency {
            Currency::Ars => "ARS",
            Currency::Usd => "USD",
        };
        self.conn.execute(
            "INSERT INTO projects(id, client_id, name, currency) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET client_id=excluded.client_id,
               name=excluded.name, currency=excluded.currency",
            params![
                project.id.to_string(),
                project.client_id.to_string(),
                project.name,
                currency
            ],
        )?;
        Ok(())
    }

    pub fn get_project(&self, id: Uuid) -> Result<Option<Project>> {
        let row = self
            .conn
            .query_row(
                "SELECT client_id, name, currency FROM projects WHERE id=?1",
                [id.to_string()],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .optional()?;
        match row {
            None => Ok(None),
            Some((client_id, name, currency)) => Ok(Some(Project {
                id,
                client_id: Uuid::parse_str(&client_id)?,
                name,
                currency: match currency.as_str() {
                    "ARS" => Currency::Ars,
                    "USD" => Currency::Usd,
                    _ => return Err(StorageError::Currency(currency)),
                },
            })),
        }
    }

    /// Stores an ACU together with its component price snapshots.
    pub fn save_analysis(&mut self, analysis: &UnitCostAnalysis) -> Result<()> {
        let json = serde_json::to_string(analysis)?;
        self.conn.execute(
            "INSERT INTO analyses(id, code, description, unit, snapshot_json)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET code=excluded.code,
             description=excluded.description, unit=excluded.unit,
             snapshot_json=excluded.snapshot_json, updated_at=CURRENT_TIMESTAMP",
            params![
                analysis.id.to_string(),
                analysis.code,
                analysis.description,
                analysis.unit,
                json
            ],
        )?;
        Ok(())
    }

    pub fn get_analysis(&self, id: Uuid) -> Result<Option<UnitCostAnalysis>> {
        let json: Option<String> = self
            .conn
            .query_row(
                "SELECT snapshot_json FROM analyses WHERE id=?1",
                [id.to_string()],
                |row| row.get(0),
            )
            .optional()?;
        json.map(|value| serde_json::from_str(&value).map_err(StorageError::from))
            .transpose()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use cpobras_core::{ResourceKind, ResourcePriceSnapshot};
    use rust_decimal::Decimal;

    #[test]
    fn roundtrip_client_project_and_analysis() {
        let mut db = LocalStore::in_memory().unwrap();
        let client = Client {
            id: Uuid::new_v4(),
            name: "Cliente de prueba".into(),
            cuit: None,
        };
        db.save_client(&client).unwrap();
        assert_eq!(db.get_client(client.id).unwrap(), Some(client.clone()));

        let project = Project {
            id: Uuid::new_v4(),
            client_id: client.id,
            name: "Vivienda".into(),
            currency: Currency::Ars,
        };
        db.save_project(&project).unwrap();
        assert_eq!(db.get_project(project.id).unwrap(), Some(project));

        let analysis = UnitCostAnalysis {
            id: Uuid::new_v4(),
            code: "01".into(),
            description: "Hormigón".into(),
            unit: "m3".into(),
            components: vec![ResourcePriceSnapshot {
                resource_id: Uuid::new_v4(),
                description: "Cemento".into(),
                kind: ResourceKind::Material,
                quantity_per_unit: Decimal::new(2, 0),
                unit_price: Decimal::new(12550, 2),
            }],
        };
        db.save_analysis(&analysis).unwrap();
        let restored = db.get_analysis(analysis.id).unwrap().unwrap();
        assert_eq!(
            restored.direct_unit_cost().unwrap(),
            analysis.direct_unit_cost().unwrap()
        );
    }

    #[test]
    fn project_requires_existing_client() {
        let mut db = LocalStore::in_memory().unwrap();
        let project = Project {
            id: Uuid::new_v4(),
            client_id: Uuid::new_v4(),
            name: "Sin cliente".into(),
            currency: Currency::Ars,
        };
        assert!(db.save_project(&project).is_err());
    }
}
