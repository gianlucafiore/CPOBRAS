//! Insumos y registro histórico de precios; los precios registrados no se sobrescriben.
use super::{LocalStore, Result, StorageError};
use cpobras_core::{Currency, ResourceKind};
use rusqlite::{params, OptionalExtension};
use rust_decimal::Decimal;
use std::str::FromStr;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Resource {
    pub id: Uuid,
    pub code: String,
    pub description: String,
    pub unit: String,
    pub kind: ResourceKind,
    pub active: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResourcePrice {
    pub id: Uuid,
    pub resource_id: Uuid,
    pub amount: Decimal,
    pub currency: Currency,
    /// ISO 8601 date (YYYY-MM-DD).
    pub effective_date: String,
    pub source: Option<String>,
}

fn kind_to_db(kind: ResourceKind) -> &'static str {
    match kind {
        ResourceKind::Material => "material",
        ResourceKind::Labor => "labor",
        ResourceKind::Equipment => "equipment",
        ResourceKind::Subcontract => "subcontract",
    }
}

fn kind_from_db(value: &str) -> Result<ResourceKind> {
    match value {
        "material" => Ok(ResourceKind::Material),
        "labor" => Ok(ResourceKind::Labor),
        "equipment" => Ok(ResourceKind::Equipment),
        "subcontract" => Ok(ResourceKind::Subcontract),
        _ => Err(StorageError::InvalidValue(format!(
            "unknown resource kind: {value}"
        ))),
    }
}

fn currency_to_db(value: Currency) -> &'static str {
    match value {
        Currency::Ars => "ARS",
        Currency::Usd => "USD",
    }
}

fn currency_from_db(value: &str) -> Result<Currency> {
    match value {
        "ARS" => Ok(Currency::Ars),
        "USD" => Ok(Currency::Usd),
        _ => Err(StorageError::Currency(value.to_string())),
    }
}

fn parse_price(
    record: (String, String, String, String, String, Option<String>),
) -> Result<ResourcePrice> {
    Ok(ResourcePrice {
        id: Uuid::parse_str(&record.0)?,
        resource_id: Uuid::parse_str(&record.1)?,
        amount: Decimal::from_str(&record.2)
            .map_err(|_| StorageError::InvalidValue("invalid persisted price".into()))?,
        currency: currency_from_db(&record.3)?,
        effective_date: record.4,
        source: record.5,
    })
}

impl LocalStore {
    pub fn save_resource(&mut self, resource: &Resource) -> Result<()> {
        if resource.code.trim().is_empty()
            || resource.description.trim().is_empty()
            || resource.unit.trim().is_empty()
        {
            return Err(StorageError::InvalidValue(
                "resource code, description and unit must not be empty".into(),
            ));
        }
        self.conn.execute(
            "INSERT INTO resources(id, code, description, unit, kind, active)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET code=excluded.code,
             description=excluded.description, unit=excluded.unit,
             kind=excluded.kind, active=excluded.active",
            params![
                resource.id.to_string(),
                resource.code,
                resource.description,
                resource.unit,
                kind_to_db(resource.kind),
                resource.active,
            ],
        )?;
        Ok(())
    }

    /// Persist the first price together with the new resource or neither.
    pub fn create_resource_with_initial_price(
        &mut self,
        resource: &Resource,
        price: &ResourcePrice,
    ) -> Result<()> {
        if resource.id != price.resource_id {
            return Err(StorageError::InvalidValue(
                "initial price references a different resource".into(),
            ));
        }
        self.conn.execute_batch("SAVEPOINT create_resource_initial_price")?;
        let result = (|| {
            self.save_resource(resource)?;
            self.add_resource_price(price)?;
            Ok(())
        })();
        if let Err(error) = result {
            self.conn.execute_batch(
                "ROLLBACK TO create_resource_initial_price;
                 RELEASE create_resource_initial_price",
            )?;
            return Err(error);
        }
        self.conn.execute_batch("RELEASE create_resource_initial_price")?;
        Ok(())
    }

    pub fn list_resources(&self) -> Result<Vec<Resource>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id FROM resources ORDER BY code, id")?;
        let ids = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut resources = Vec::new();
        for id in ids {
            if let Some(resource) = self.get_resource(Uuid::parse_str(&id?)?)? {
                resources.push(resource);
            }
        }
        Ok(resources)
    }

    pub fn get_resource(&self, id: Uuid) -> Result<Option<Resource>> {
        let raw = self
            .conn
            .query_row(
                "SELECT code, description, unit, kind, active FROM resources WHERE id=?1",
                [id.to_string()],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, bool>(4)?,
                    ))
                },
            )
            .optional()?;
        raw.map(|(code, description, unit, kind, active)| {
            Ok(Resource {
                id,
                code,
                description,
                unit,
                kind: kind_from_db(&kind)?,
                active,
            })
        })
        .transpose()
    }

    /// Appends a new historical price. An existing price ID is never updated.
    pub fn add_resource_price(&mut self, price: &ResourcePrice) -> Result<()> {
        let date = &price.effective_date;
        let valid_date = date.len() == 10
            && date.as_bytes()[4] == b'-'
            && date.as_bytes()[7] == b'-'
            && date
                .chars()
                .enumerate()
                .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit());
        if price.amount < Decimal::ZERO || !valid_date {
            return Err(StorageError::InvalidValue(
                "price must be nonnegative and date must be YYYY-MM-DD".into(),
            ));
        }
        self.conn.execute(
            "INSERT INTO resource_prices(id, resource_id, amount, currency, effective_date, source)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                price.id.to_string(),
                price.resource_id.to_string(),
                price.amount.to_string(),
                currency_to_db(price.currency),
                price.effective_date,
                price.source,
            ],
        )?;
        Ok(())
    }

    /// Historical prices, newest first; never rewrites an earlier observation.
    pub fn resource_price_history(&self, resource_id: Uuid) -> Result<Vec<ResourcePrice>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, resource_id, amount, currency, effective_date, source
             FROM resource_prices WHERE resource_id=?1
             ORDER BY effective_date DESC, created_at DESC, id DESC",
        )?;
        let rows = stmt.query_map([resource_id.to_string()], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        })?;
        let mut prices = Vec::new();
        for row in rows {
            prices.push(parse_price(row?)?);
        }
        Ok(prices)
    }

    /// Latest effective price in the requested currency as of the given ISO date.
    pub fn resource_price_as_of(
        &self,
        resource_id: Uuid,
        currency: Currency,
        as_of: &str,
    ) -> Result<Option<ResourcePrice>> {
        let raw = self
            .conn
            .query_row(
                "SELECT id, resource_id, amount, currency, effective_date, source
             FROM resource_prices
             WHERE resource_id=?1 AND currency=?2 AND effective_date<=?3
             ORDER BY effective_date DESC, created_at DESC, id DESC LIMIT 1",
                params![resource_id.to_string(), currency_to_db(currency), as_of],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, Option<String>>(5)?,
                    ))
                },
            )
            .optional()?;
        raw.map(parse_price).transpose()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn history_retains_old_price_and_filters_by_date_and_currency() {
        let mut db = LocalStore::in_memory().unwrap();
        let resource = Resource {
            id: Uuid::new_v4(),
            code: "MAT-001".into(),
            description: "Cemento".into(),
            unit: "bolsa".into(),
            kind: ResourceKind::Material,
            active: true,
        };
        db.save_resource(&resource).unwrap();
        assert_eq!(
            db.get_resource(resource.id).unwrap(),
            Some(resource.clone())
        );
        let first = ResourcePrice {
            id: Uuid::new_v4(),
            resource_id: resource.id,
            amount: Decimal::new(8000, 0),
            currency: Currency::Ars,
            effective_date: "2026-01-01".into(),
            source: Some("Proveedor".into()),
        };
        let second = ResourcePrice {
            id: Uuid::new_v4(),
            amount: Decimal::new(8500, 0),
            effective_date: "2026-02-01".into(),
            ..first.clone()
        };
        db.add_resource_price(&first).unwrap();
        db.add_resource_price(&second).unwrap();
        let history = db.resource_price_history(resource.id).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].amount, second.amount);
        assert_eq!(history[1].amount, first.amount);
        assert_eq!(
            db.resource_price_as_of(resource.id, Currency::Ars, "2026-01-31")
                .unwrap(),
            Some(first.clone())
        );
        assert_eq!(
            db.resource_price_as_of(resource.id, Currency::Ars, "2026-02-28")
                .unwrap(),
            Some(second)
        );
        assert_eq!(
            db.resource_price_as_of(resource.id, Currency::Usd, "2026-02-28")
                .unwrap(),
            None
        );
        assert!(db.add_resource_price(&first).is_err());
    }

    #[test]
    fn catalog_lists_all_resources_and_keeps_latest_price() {
        let mut db = LocalStore::in_memory().unwrap();
        let material = Resource {
            id: Uuid::new_v4(),
            code: "MAT-001".into(),
            description: "Acero".into(),
            unit: "kg".into(),
            kind: ResourceKind::Material,
            active: true,
        };
        let labor = Resource {
            id: Uuid::new_v4(),
            code: "MO-001".into(),
            description: "Oficial".into(),
            unit: "h".into(),
            kind: ResourceKind::Labor,
            active: true,
        };
        db.save_resource(&material).unwrap();
        db.save_resource(&labor).unwrap();
        assert_eq!(db.list_resources().unwrap(), vec![material.clone(), labor]);
        for (date, amount) in [("2026-01-01", 100), ("2026-02-01", 125)] {
            db.add_resource_price(&ResourcePrice {
                id: Uuid::new_v4(),
                resource_id: material.id,
                amount: Decimal::new(amount, 0),
                currency: Currency::Ars,
                effective_date: date.into(),
                source: None,
            })
            .unwrap();
        }
        assert_eq!(
            db.resource_price_as_of(material.id, Currency::Ars, "9999-12-31")
                .unwrap()
                .unwrap()
                .amount,
            Decimal::new(125, 0)
        );
    }

    #[test]
    fn rejects_invalid_prices_and_missing_resources() {
        let mut db = LocalStore::in_memory().unwrap();
        let price = ResourcePrice {
            id: Uuid::new_v4(),
            resource_id: Uuid::new_v4(),
            amount: Decimal::new(1, 0),
            currency: Currency::Ars,
            effective_date: "2026-01-01".into(),
            source: None,
        };
        assert!(db.add_resource_price(&price).is_err());
        assert!(db
            .add_resource_price(&ResourcePrice {
                amount: Decimal::NEGATIVE_ONE,
                ..price
            })
            .is_err());
    }
    #[test]
    fn invalid_initial_price_does_not_leave_partial_resource() {
        let mut db = LocalStore::in_memory().unwrap();
        let resource = Resource {
            id: Uuid::new_v4(),
            code: "MAT-02".into(), description: "Perfiles".into(),
            unit: "kg".into(), kind: ResourceKind::Material, active: true,
        };
        let mut price = ResourcePrice {
            id: Uuid::new_v4(), resource_id: resource.id,
            amount: Decimal::new(1500, 0), currency: Currency::Ars,
            effective_date: "fecha inválida".into(), source: None,
        };
        assert!(db.create_resource_with_initial_price(&resource, &price).is_err());
        assert!(db.get_resource(resource.id).unwrap().is_none());
        price.effective_date = "2026-10-09".into();
        db.create_resource_with_initial_price(&resource, &price).unwrap();
        assert!(db.get_resource(resource.id).unwrap().is_some());
        assert_eq!(db.resource_price_history(resource.id).unwrap().len(), 1);
    }


}
