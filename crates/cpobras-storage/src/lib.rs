//! SQLite local-first persistence layer. Never open a shared network database.
use cpobras_core::{Client, Currency, Project, UnitCostAnalysis};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use uuid::Uuid;

pub mod adjustments;
pub mod advanced_costing;
pub mod budget_patterns;
pub mod budget_pricing;
pub mod budget_sections;
pub mod budget_tools;
pub mod construction_workflow;
pub mod estimate_comparison;
pub mod estimate_resource_prices;
pub mod estimates;
pub mod financial_planning;
pub mod line_workflows;
pub mod maintenance;
pub mod management;
pub mod operations;
pub mod organizations;
pub mod persons;
pub mod planning;
pub mod price_determination;
pub mod printing;
pub mod procurement;
pub mod quotation_edits;
pub mod quotation_workflow;
pub mod resource_catalog;
pub mod sharing;
pub mod site_book;
pub mod supplier_logistics;
pub mod system_settings;
pub mod takeoffs;

const INITIAL_MIGRATION: &str = include_str!("../migrations/0001_initial.sql");
const RESOURCES_MIGRATION: &str = include_str!("../migrations/0002_resources.sql");
const ESTIMATES_MIGRATION: &str = include_str!("../migrations/0003_estimates.sql");
const SECTIONS_MIGRATION: &str = include_str!("../migrations/0004_budget_sections.sql");
const PRICING_MIGRATION: &str = include_str!("../migrations/0005_pricing.sql");
const TAKEOFFS_MIGRATION: &str = include_str!("../migrations/0006_takeoffs.sql");

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("filesystem: {0}")]
    Io(#[from] std::io::Error),
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

    fn initialize(mut conn: Connection) -> Result<Self> {
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        conn.execute_batch("CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")?;
        let migrations = [
            INITIAL_MIGRATION,
            RESOURCES_MIGRATION,
            ESTIMATES_MIGRATION,
            SECTIONS_MIGRATION,
            PRICING_MIGRATION,
            TAKEOFFS_MIGRATION,
            include_str!("../migrations/0007_management.sql"),
            include_str!("../migrations/0008_planning.sql"),
            include_str!("../migrations/0009_budget_tools.sql"),
            include_str!("../migrations/0010_advanced_costing.sql"),
            include_str!("../migrations/0011_financing.sql"),
            include_str!("../migrations/0012_formula_consistency.sql"),
            include_str!("../migrations/0013_plan_references.sql"),
            include_str!("../migrations/0014_line_resource_snapshots.sql"),
            include_str!("../migrations/0015_operations.sql"),
            include_str!("../migrations/0016_deleted_line_history.sql"),
            include_str!("../migrations/0017_estimate_resource_prices.sql"),
            include_str!("../migrations/0018_price_determination.sql"),
            include_str!("../migrations/0019_print_profile.sql"),
            include_str!("../migrations/0020_organizations.sql"),
            include_str!("../migrations/0021_persons.sql"),
            include_str!("../migrations/0022_reopen_estimates.sql"),
            include_str!("../migrations/0023_project_dashboard.sql"),
            include_str!("../migrations/0024_task_segments.sql"),
            include_str!("../migrations/0025_calendar_exceptions.sql"),
            include_str!("../migrations/0026_financial_planning.sql"),
            include_str!("../migrations/0027_calendar_and_certificates.sql"),
            include_str!("../migrations/0028_construction_workflow.sql"),
            include_str!("../migrations/0029_site_book_and_procurement.sql"),
            include_str!("../migrations/0030_quotation_edits.sql"),
            include_str!("../migrations/0031_supplier_logistics.sql"),
        ];
        let latest: i64 = conn.query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |r| r.get(0),
        )?;
        if latest > migrations.len() as i64 {
            return Err(StorageError::InvalidValue(
                "La base pertenece a una versión más nueva de CPOBRAS".into(),
            ));
        }
        for (index, sql) in migrations.iter().enumerate() {
            let version = index as i64 + 1;
            let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
            let applied: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=?1)",
                [version],
                |r| r.get(0),
            )?;
            if !applied {
                tx.execute_batch(sql)?;
                tx.execute(
                    "INSERT INTO schema_migrations(version) VALUES (?1)",
                    [version],
                )?;
            }
            tx.commit()?;
        }
        let store = Self { conn };
        store.initialize_persons()?;
        store.initialize_organizations()?;
        store.install_audit_triggers()?;
        store.reconcile_draft_prices()?;
        Ok(store)
    }

    pub fn list_clients(&self) -> Result<Vec<Client>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, cuit FROM clients ORDER BY name, id")?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })?;
        let mut clients = Vec::new();
        for row in rows {
            let (id, name, cuit) = row?;
            clients.push(Client {
                id: Uuid::parse_str(&id)?,
                name,
                cuit,
            });
        }
        Ok(clients)
    }

    pub fn list_projects(&self) -> Result<Vec<Project>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id FROM projects ORDER BY name, id")?;
        let ids = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut projects = Vec::new();
        for id in ids {
            let parsed = Uuid::parse_str(&id?)?;
            if let Some(project) = self.get_project(parsed)? {
                projects.push(project);
            }
        }
        Ok(projects)
    }

    pub fn save_client(&mut self, client: &Client) -> Result<()> {
        self.save_client_person(client)
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

    pub fn save_project(&self, project: &Project) -> Result<()> {
        if self.get_client(project.client_id)?.is_none() {
            return Err(StorageError::InvalidValue(
                "Seleccioná una persona habilitada como cliente".into(),
            ));
        }
        if project.name.trim().is_empty() || project.name.len() > 500 {
            return Err(StorageError::InvalidValue("Nombre de obra inválido".into()));
        }
        if let Some(old) = self.get_project(project.id)? {
            if self.project_organization(project.id)?.ownership != "own" {
                return Err(StorageError::InvalidValue(
                    "La obra externa es de solo lectura".into(),
                ));
            }
            if old.currency != project.currency
                && !self.list_project_estimates(project.id)?.is_empty()
            {
                return Err(StorageError::InvalidValue(
                    "La moneda base no se cambia cuando la obra ya tiene presupuestos".into(),
                ));
            }
        }
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
        if analysis.code.trim().is_empty()
            || analysis.description.trim().is_empty()
            || analysis.unit.trim().is_empty()
        {
            return Err(StorageError::InvalidValue(
                "incomplete cost analysis".into(),
            ));
        }
        analysis
            .direct_unit_cost()
            .map_err(|e| StorageError::InvalidValue(e.to_string()))?;
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

    pub fn list_analyses(&self) -> Result<Vec<UnitCostAnalysis>> {
        let mut stmt = self
            .conn
            .prepare("SELECT snapshot_json FROM analyses WHERE NOT EXISTS(SELECT 1 FROM line_analysis_snapshots s WHERE s.analysis_id=analyses.id) ORDER BY code, id")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut analyses = Vec::new();
        for json in rows {
            analyses.push(serde_json::from_str(&json?)?);
        }
        Ok(analyses)
    }

    /// Reprices an ACU from recorded ARS observations on or before the requested date.
    /// Estimate line unit-cost snapshots are never rewritten.
    pub fn reprice_analysis_at(&mut self, id: Uuid, as_of: &str) -> Result<UnitCostAnalysis> {
        let mut analysis = self
            .get_analysis(id)?
            .ok_or_else(|| StorageError::InvalidValue("analysis not found".into()))?;
        for component in &mut analysis.components {
            let price = self
                .resource_price_as_of(component.resource_id, Currency::Ars, as_of)?
                .ok_or_else(|| StorageError::InvalidValue("price missing as of date".into()))?;
            component.unit_price = price.amount;
        }
        analysis
            .direct_unit_cost()
            .map_err(|e| StorageError::InvalidValue(e.to_string()))?;
        self.save_analysis(&analysis)?;
        Ok(analysis)
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
    fn repricing_acu_preserves_original_budget_price_snapshot() {
        use crate::estimates::{Estimate, EstimateItem};
        use crate::resource_catalog::{Resource, ResourcePrice};

        let mut db = LocalStore::in_memory().unwrap();
        let resource = Resource {
            id: Uuid::new_v4(),
            code: "MAT-01".into(),
            description: "Acero".into(),
            unit: "kg".into(),
            kind: ResourceKind::Material,
            active: true,
        };
        db.save_resource(&resource).unwrap();
        for (date, amount) in [("2026-01-01", 10), ("2026-02-01", 15)] {
            db.add_resource_price(&ResourcePrice {
                id: Uuid::new_v4(),
                resource_id: resource.id,
                amount: Decimal::new(amount, 0),
                currency: Currency::Ars,
                effective_date: date.into(),
                source: None,
            })
            .unwrap();
        }
        let analysis = UnitCostAnalysis {
            id: Uuid::new_v4(),
            code: "ACU-01".into(),
            description: "Estructura".into(),
            unit: "kg".into(),
            components: vec![ResourcePriceSnapshot {
                resource_id: resource.id,
                description: resource.description.clone(),
                kind: ResourceKind::Material,
                quantity_per_unit: Decimal::new(2, 0),
                unit_price: Decimal::new(10, 0),
            }],
        };
        db.save_analysis(&analysis).unwrap();
        let client = Client {
            id: Uuid::new_v4(),
            name: "Cliente".into(),
            cuit: None,
        };
        db.save_client(&client).unwrap();
        let project = Project {
            id: Uuid::new_v4(),
            client_id: client.id,
            name: "Obra".into(),
            currency: Currency::Ars,
        };
        db.save_project(&project).unwrap();
        let estimate = Estimate {
            id: Uuid::new_v4(),
            project_id: project.id,
            title: "Cotización".into(),
            currency: Currency::Ars,
            issued: false,
        };
        db.create_estimate(&estimate).unwrap();
        db.add_estimate_item(&EstimateItem {
            id: Uuid::new_v4(),
            estimate_id: estimate.id,
            position: 0,
            analysis_id: Some(analysis.id),
            description: "Estructura".into(),
            unit: "kg".into(),
            quantity: Decimal::new(3, 0),
            unit_cost_snapshot: Decimal::new(20, 0),
        })
        .unwrap();
        assert_eq!(
            db.reprice_analysis_at(analysis.id, "2026-02-28")
                .unwrap()
                .direct_unit_cost()
                .unwrap(),
            Decimal::new(30, 0)
        );
        assert_eq!(db.estimate_total(estimate.id).unwrap(), Decimal::new(60, 0));
        assert_eq!(
            db.reprice_analysis_at(analysis.id, "2026-01-31")
                .unwrap()
                .direct_unit_cost()
                .unwrap(),
            Decimal::new(20, 0)
        );
        assert_eq!(db.estimate_total(estimate.id).unwrap(), Decimal::new(60, 0));
    }

    #[test]
    fn project_requires_existing_client() {
        let db = LocalStore::in_memory().unwrap();
        let project = Project {
            id: Uuid::new_v4(),
            client_id: Uuid::new_v4(),
            name: "Sin cliente".into(),
            currency: Currency::Ars,
        };
        assert!(db.save_project(&project).is_err());
    }
}

#[cfg(test)]
mod workflow_tests;

pub mod project_dashboard;
