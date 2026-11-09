//! All-or-nothing additions to the resource library; existing resources and prices are preserved.
use crate::{
    resource_catalog::{Resource, ResourcePrice},
    LocalStore, Result, StorageError,
};
use cpobras_core::{Currency, ResourceKind};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use uuid::Uuid;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ResourceImportRow {
    #[serde(default)]
    pub code: String,
    pub description: String,
    pub unit: String,
    pub kind: String,
    pub price: Option<Decimal>,
}
#[derive(Debug, Serialize)]
pub struct ResourceImportResult {
    pub created: usize,
    pub resource_ids: Vec<Uuid>,
}
fn invalid(message: impl Into<String>) -> StorageError {
    StorageError::InvalidValue(message.into())
}
fn key(description: &str, unit: &str, kind: &str) -> (String, String, String) {
    (
        description.trim().to_lowercase(),
        unit.trim().to_lowercase(),
        kind.to_owned(),
    )
}
fn kind_name(kind: ResourceKind) -> &'static str {
    match kind {
        ResourceKind::Material => "material",
        ResourceKind::Labor => "labor",
        ResourceKind::Equipment => "equipment",
        ResourceKind::Subcontract => "subcontract",
    }
}
impl LocalStore {
    pub fn import_resources(
        &mut self,
        rows: &[ResourceImportRow],
        effective_date: &str,
        source: &str,
    ) -> Result<ResourceImportResult> {
        if rows.is_empty() || rows.len() > 5000 {
            return Err(invalid("La planilla debe contener entre 1 y 5000 insumos"));
        }
        if chrono::NaiveDate::parse_from_str(effective_date, "%Y-%m-%d").is_err()
            || effective_date.len() != 10
        {
            return Err(invalid("Fecha de precios inválida"));
        }
        if source.len() > 500 {
            return Err(invalid("La referencia de importación es demasiado larga"));
        }
        self.conn.execute_batch("SAVEPOINT import_resource_library; UPDATE automatic_codes SET last_value=last_value WHERE 0")?;
        let result = (|| {
            let existing = self.list_resources()?;
            let mut codes: BTreeSet<String> = existing
                .iter()
                .map(|r| r.code.trim().to_lowercase())
                .collect();
            let mut descriptions: BTreeSet<_> = existing
                .iter()
                .map(|r| key(&r.description, &r.unit, kind_name(r.kind)))
                .collect();
            let mut reserved = BTreeSet::new();
            for (i, row) in rows.iter().enumerate() {
                if !row.code.trim().is_empty()
                    && (!reserved.insert(row.code.trim().to_lowercase())
                        || codes.contains(&row.code.trim().to_lowercase()))
                {
                    return Err(invalid(format!(
                        "Fila {}: el código ya existe o está repetido",
                        i + 2
                    )));
                }
            }
            let mut ids = Vec::with_capacity(rows.len());
            for (i, row) in rows.iter().enumerate() {
                let kind = match row.kind.as_str() {
                    "material" => ResourceKind::Material,
                    "labor" => ResourceKind::Labor,
                    "equipment" => ResourceKind::Equipment,
                    "subcontract" => ResourceKind::Subcontract,
                    _ => return Err(invalid(format!("Fila {}: tipo inválido", i + 2))),
                };
                if row.description.trim().is_empty()
                    || row.description.chars().count() > 500
                    || row.unit.trim().is_empty()
                    || row.unit.chars().count() > 50
                    || row.code.chars().count() > 100
                    || row.price.is_some_and(|p| p < Decimal::ZERO)
                {
                    return Err(invalid(format!(
                        "Fila {}: descripción, unidad o precio inválido",
                        i + 2
                    )));
                }
                let identity = key(&row.description, &row.unit, &row.kind);
                if row.code.trim().is_empty() && descriptions.contains(&identity) {
                    return Err(invalid(format!(
                        "Fila {}: el insumo ya existe o está repetido",
                        i + 2
                    )));
                }
                let code = if row.code.trim().is_empty() {
                    loop {
                        let candidate = self.automatic_code("resource")?;
                        let normalized = candidate.to_lowercase();
                        if !codes.contains(&normalized) && !reserved.contains(&normalized) {
                            break candidate;
                        }
                    }
                } else {
                    row.code.trim().to_owned()
                };
                codes.insert(code.to_lowercase());
                descriptions.insert(identity);
                let resource = Resource {
                    id: Uuid::new_v4(),
                    code,
                    description: row.description.trim().to_owned(),
                    unit: row.unit.trim().to_owned(),
                    kind,
                    active: true,
                };
                self.save_resource(&resource)?;
                if let Some(amount) = row.price {
                    self.add_resource_price(&ResourcePrice {
                        id: Uuid::new_v4(),
                        resource_id: resource.id,
                        amount,
                        currency: Currency::Ars,
                        effective_date: effective_date.to_owned(),
                        source: Some(source.to_owned()),
                    })?;
                }
                ids.push(resource.id);
            }
            Ok(ResourceImportResult {
                created: ids.len(),
                resource_ids: ids,
            })
        })();
        match result {
            Ok(value) => {
                self.conn.execute_batch("RELEASE import_resource_library")?;
                Ok(value)
            }
            Err(error) => {
                self.conn.execute_batch(
                    "ROLLBACK TO import_resource_library; RELEASE import_resource_library",
                )?;
                Err(error)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn row(code: &str, description: &str, kind: &str, price: Option<Decimal>) -> ResourceImportRow {
        ResourceImportRow {
            code: code.into(),
            description: description.into(),
            kind: kind.into(),
            unit: "h".into(),
            price,
        }
    }
    #[test]
    fn library_import_preserves_optional_and_zero_prices_and_automatic_codes() {
        let mut db = LocalStore::in_memory().unwrap();
        let result = db
            .import_resources(
                &[
                    row("", "Oficial", "labor", None),
                    row("INS-0001", "Arena", "material", Some(Decimal::ZERO)),
                    row(
                        "MAT-1",
                        "Cemento",
                        "material",
                        Some(Decimal::from_str_exact("9007199254740993.01").unwrap()),
                    ),
                ],
                "2026-11-09",
                "Planilla.xlsx",
            )
            .unwrap();
        assert_eq!(result.created, 3);
        assert_eq!(
            db.get_resource(result.resource_ids[0])
                .unwrap()
                .unwrap()
                .code,
            "INS-0002"
        );
        assert!(db
            .resource_price_history(result.resource_ids[0])
            .unwrap()
            .is_empty());
        assert_eq!(
            db.resource_price_history(result.resource_ids[1]).unwrap()[0].amount,
            Decimal::ZERO
        );
        assert_eq!(
            db.resource_price_history(result.resource_ids[2]).unwrap()[0].amount,
            Decimal::from_str_exact("9007199254740993.01").unwrap()
        );
        let again = db.import_resources(
            &[row("", "Oficial", "labor", Some(100.into()))],
            "2026-11-09",
            "Repetida",
        );
        assert!(again.is_err());
        assert_eq!(db.list_resources().unwrap().len(), 3);
        assert!(db
            .resource_price_history(result.resource_ids[0])
            .unwrap()
            .is_empty());
    }
    #[test]
    fn library_import_rolls_back_resources_prices_and_code_sequence_on_invalid_later_row() {
        let mut db = LocalStore::in_memory().unwrap();
        let bad = [
            row("", "Nuevo", "labor", Some(10.into())),
            row("MAT-1", "Inválido", "material", Some((-1).into())),
        ];
        assert!(db.import_resources(&bad, "2026-11-09", "Planilla").is_err());
        assert!(db.list_resources().unwrap().is_empty());
        assert_eq!(db.automatic_code("resource").unwrap(), "INS-0001");
        let mut bad = bad.to_vec();
        bad[1].price = None;
        bad[1].code = "DUP".into();
        bad[0].code = "dup".into();
        assert!(db.import_resources(&bad, "2026-11-09", "Planilla").is_err());
        assert!(db.list_resources().unwrap().is_empty());
        assert!(db
            .import_resources(&[row("", "A", "labor", None)], "2026-02-30", "Planilla")
            .is_err());
    }
}
