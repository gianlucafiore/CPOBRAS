//! Optional resource-units per working day. Budget snapshots never follow later library edits.
use crate::{
    resource_catalog::{Resource, ResourcePrice},
    LocalStore, Result, StorageError,
};
use rusqlite::{params, OptionalExtension};
use rust_decimal::Decimal;
use uuid::Uuid;
fn invalid(message: &str) -> StorageError {
    StorageError::InvalidValue(message.into())
}
pub fn parse_daily_output(value: &str) -> Result<Option<Decimal>> {
    if value.trim().is_empty() {
        return Ok(None);
    }
    let value: Decimal = value
        .trim()
        .replace(',', ".")
        .parse()
        .map_err(|_| invalid("Rendimiento diario inválido"))?;
    if value <= Decimal::ZERO {
        return Err(invalid(
            "El rendimiento por día hábil debe ser mayor que cero; dejalo vacío si no lo conocés",
        ));
    }
    Ok(Some(value))
}
pub(crate) fn seed_daily_output(
    conn: &rusqlite::Connection,
    id: Uuid,
    value: Decimal,
) -> Result<()> {
    if value <= Decimal::ZERO {
        return Err(invalid("Rendimiento diario inválido"));
    }
    conn.execute("INSERT INTO resource_productivities(resource_id,daily_output) VALUES(?1,?2) ON CONFLICT(resource_id) DO UPDATE SET daily_output=excluded.daily_output WHERE resource_productivities.daily_output IS NULL",params![id.to_string(),value.to_string()])?;
    Ok(())
}
pub(crate) fn daily_output_for(conn: &rusqlite::Connection, id: Uuid) -> Result<Option<Decimal>> {
    let row: Option<Option<String>> = conn
        .query_row(
            "SELECT daily_output FROM resource_productivities WHERE resource_id=?1",
            [id.to_string()],
            |r| r.get(0),
        )
        .optional()?;
    row.flatten()
        .map(|v| {
            v.parse()
                .map_err(|_| invalid("Rendimiento diario guardado inválido"))
        })
        .transpose()
}
impl LocalStore {
    pub fn resource_daily_output(&self, id: Uuid) -> Result<Option<Decimal>> {
        daily_output_for(&self.conn, id)
    }
    pub fn save_resource_with_productivity(
        &mut self,
        resource: &Resource,
        price: Option<&ResourcePrice>,
        daily: Option<Option<Decimal>>,
    ) -> Result<()> {
        if daily.flatten().is_some_and(|v| v <= Decimal::ZERO) {
            return Err(invalid("Rendimiento diario inválido"));
        }
        self.conn
            .execute_batch("SAVEPOINT resource_with_productivity")?;
        let result: Result<()> = (|| {
            if let Some(price) = price {
                self.create_resource_with_initial_price(resource, price)?;
            } else {
                self.save_resource(resource)?;
            }
            if let Some(value) = daily {
                self.conn.execute("INSERT INTO resource_productivities(resource_id,daily_output) VALUES(?1,?2) ON CONFLICT(resource_id) DO UPDATE SET daily_output=excluded.daily_output",params![resource.id.to_string(),value.map(|v|v.to_string())])?;
            }
            Ok(())
        })();
        if let Err(error) = result {
            self.conn.execute_batch(
                "ROLLBACK TO resource_with_productivity;RELEASE resource_with_productivity",
            )?;
            return Err(error);
        }
        self.conn
            .execute_batch("RELEASE resource_with_productivity")?;
        Ok(())
    }
}
