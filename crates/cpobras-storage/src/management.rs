//! Company and project directories. Relations are normalized; optional business fields use JSON.
use crate::{LocalStore, Result, StorageError};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;

pub const KINDS: &[&str] = &[
    "company",
    "establishment",
    "user",
    "supplier",
    "subcontractor",
    "contact",
    "project_profile",
    "client_profile",
    "contract",
    "cost_center",
    "unit",
    "category",
    "trade",
    "document",
    "crew",
];
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManagementRecord {
    pub id: Uuid,
    pub kind: String,
    pub name: String,
    pub code: String,
    pub company_id: Option<Uuid>,
    pub parent_id: Option<Uuid>,
    pub project_id: Option<Uuid>,
    pub client_id: Option<Uuid>,
    pub attributes: BTreeMap<String, String>,
    pub revision: u32,
}
#[derive(Debug, Serialize)]
pub struct ChangeEvent {
    pub sequence: i64,
    pub entity_type: String,
    pub entity_id: String,
    pub operation: String,
    pub old_json: Option<String>,
    pub new_json: Option<String>,
    pub occurred_at: String,
}
fn invalid(message: &str) -> StorageError {
    StorageError::InvalidValue(message.into())
}
const RECORD_SELECT:&str="SELECT m.id,m.kind,CASE WHEN m.kind IN ('supplier','client_profile') AND p.id IS NOT NULL THEN p.name ELSE m.name END,CASE WHEN m.kind IN ('supplier','client_profile') AND p.id IS NOT NULL THEN p.code ELSE m.code END,m.company_id,m.parent_id,m.project_id,m.client_id,CASE WHEN m.kind IN ('supplier','client_profile') AND p.id IS NOT NULL THEN json_set(m.attributes_json,'$.cuit',COALESCE(p.cuit,''),'$.email',p.email,'$.phone',p.phone,'$.address',p.address,'$.person_id',p.id,'$.person_active',CASE WHEN EXISTS(SELECT 1 FROM entity_archives a WHERE a.kind='person:supplier' AND a.entity_id=p.id) THEN 'false' ELSE 'true' END,'$.person_primary',CASE WHEN m.id=(SELECT a.id FROM management_records a WHERE a.kind='supplier' AND a.person_id=p.id ORDER BY a.id LIMIT 1) THEN 'true' ELSE 'false' END) ELSE m.attributes_json END,m.revision FROM management_records m LEFT JOIN persons p ON p.id=m.person_id";
fn row_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<ManagementRecord> {
    let decode = |index| -> rusqlite::Result<Option<Uuid>> {
        let value: Option<String> = row.get(index)?;
        value
            .map(|s| {
                Uuid::parse_str(&s).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        index,
                        rusqlite::types::Type::Text,
                        Box::new(e),
                    )
                })
            })
            .transpose()
    };
    let id: String = row.get(0)?;
    let json: String = row.get(8)?;
    Ok(ManagementRecord {
        id: Uuid::parse_str(&id).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
        })?,
        kind: row.get(1)?,
        name: row.get(2)?,
        code: row.get(3)?,
        company_id: decode(4)?,
        parent_id: decode(5)?,
        project_id: decode(6)?,
        client_id: decode(7)?,
        attributes: serde_json::from_str(&json).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(8, rusqlite::types::Type::Text, Box::new(e))
        })?,
        revision: row.get(9)?,
    })
}
impl LocalStore {
    pub fn management_record(&self, id: Uuid) -> Result<Option<ManagementRecord>> {
        Ok(self
            .conn
            .query_row(
                &format!("{RECORD_SELECT} WHERE m.id=?1"),
                [id.to_string()],
                row_record,
            )
            .optional()?)
    }
    pub fn management_records(
        &self,
        kind: &str,
        project: Option<Uuid>,
    ) -> Result<Vec<ManagementRecord>> {
        if !KINDS.contains(&kind) {
            return Err(invalid("Tipo de ficha desconocido"));
        }
        Ok(self.conn.prepare(&format!("{RECORD_SELECT} WHERE m.kind=?1 AND (?2 IS NULL OR m.project_id=?2) ORDER BY 3,m.id"))?.query_map(params![kind,project.map(|id|id.to_string())],row_record)?.collect::<std::result::Result<_,_>>()?)
    }
    pub fn save_management_record(
        &mut self,
        record: &ManagementRecord,
    ) -> Result<ManagementRecord> {
        if !KINDS.contains(&record.kind.as_str())
            || record.name.trim().is_empty()
            || record.name.len() > 500
            || record.code.len() > 100
            || record.attributes.len() > 50
            || record
                .attributes
                .iter()
                .any(|(k, v)| k.len() > 100 || v.len() > 20_000)
        {
            return Err(invalid("Datos de ficha inválidos"));
        }
        if record.kind == "crew" {
            for (key, max) in [
                ("daily_rate", None),
                (
                    "advance_recovery_percent",
                    Some(rust_decimal::Decimal::from(100)),
                ),
            ] {
                if let Some(s) = record.attributes.get(key).filter(|s| !s.is_empty()) {
                    let v = s
                        .parse::<rust_decimal::Decimal>()
                        .map_err(|_| invalid("Importe de cuadrilla inválido"))?;
                    if v < rust_decimal::Decimal::ZERO || max.is_some_and(|m| v > m) {
                        return Err(invalid(
                            "Importe o recuperación de cuadrilla fuera de rango",
                        ));
                    }
                }
            }
            if record.attributes.get("pay_frequency").is_some_and(|s| {
                !s.is_empty() && !["weekly", "fortnight", "monthly"].contains(&s.as_str())
            }) {
                return Err(invalid("Frecuencia de pago inválida"));
            }
            if record
                .attributes
                .get("pay_currency")
                .is_some_and(|s| !s.is_empty() && !["ARS", "USD"].contains(&s.as_str()))
            {
                return Err(invalid("Moneda de cuadrilla inválida"));
            }
        }
        let existing = self.management_record(record.id)?;
        for company in [
            Some(record.id),
            record.company_id,
            existing.as_ref().and_then(|r| r.company_id),
        ]
        .into_iter()
        .flatten()
        {
            let external:bool=self.conn.query_row("SELECT EXISTS(SELECT 1 FROM organizations WHERE company_id=?1 AND ownership='external')",[company.to_string()],|r|r.get(0))?;
            if external {
                return Err(invalid("La organización externa es de solo lectura"));
            }
        }

        if let Some(old) = &existing {
            if old.kind != record.kind || old.revision != record.revision {
                return Err(invalid("La ficha cambió; recargá antes de guardar"));
            }
        } else if record.revision != 0 {
            return Err(invalid("La revisión inicial debe ser cero"));
        }
        if record.kind == "company" && record.company_id.is_some() {
            return Err(invalid("Una empresa no puede depender de otra empresa"));
        }
        if let Some(id) = record.company_id {
            if self
                .management_record(id)?
                .filter(|r| r.kind == "company")
                .is_none()
            {
                return Err(invalid("Empresa inexistente"));
            }
        } else if ["establishment", "user", "cost_center", "crew"].contains(&record.kind.as_str()) {
            return Err(invalid("Seleccioná una empresa"));
        }
        if let Some(id) = record.project_id {
            if self.get_project(id)?.is_none() {
                return Err(invalid("Obra inexistente"));
            }
        }
        if ["project_profile", "contract", "document"].contains(&record.kind.as_str())
            && record.project_id.is_none()
        {
            return Err(invalid("Seleccioná una obra"));
        }
        if let Some(id) = record.client_id {
            if !self.list_clients()?.iter().any(|c| c.id == id) {
                return Err(invalid("Cliente inexistente"));
            }
        }
        if record.kind == "client_profile" && record.client_id.is_none() {
            return Err(invalid("Seleccioná un cliente"));
        }
        if let Some(parent) = record.parent_id {
            let mut visited = BTreeSet::new();
            let mut next = Some(parent);
            while let Some(id) = next {
                if id == record.id || !visited.insert(id) {
                    return Err(invalid("La jerarquía contiene un ciclo"));
                }
                let item = self
                    .management_record(id)?
                    .ok_or_else(|| invalid("Referencia superior inexistente"))?;
                if item.company_id != record.company_id && record.kind == "cost_center" {
                    return Err(invalid("El centro superior pertenece a otra empresa"));
                }
                if record.kind == "cost_center"
                    && (item.kind != "cost_center" || item.project_id != record.project_id)
                {
                    return Err(invalid(
                        "El centro superior debe pertenecer a la misma obra",
                    ));
                }
                next = item.parent_id;
            }
        }
        if record.kind == "user"
            && !record.attributes.get("role").is_some_and(|role| {
                ["admin", "estimator", "planner", "viewer"].contains(&role.as_str())
            })
        {
            return Err(invalid("Rol de usuario inválido"));
        }
        for key in [
            "general_expenses_percent",
            "financial_expenses_percent",
            "profit_percent",
            "discount_percent",
            "tax_percent",
        ] {
            if let Some(value) = record.attributes.get(key).filter(|value| !value.is_empty()) {
                let rate = value
                    .parse::<rust_decimal::Decimal>()
                    .map_err(|_| invalid("Porcentaje económico inválido"))?;
                if rate < rust_decimal::Decimal::ZERO
                    || (key == "discount_percent" && rate > rust_decimal::Decimal::from(100))
                {
                    return Err(invalid("Porcentaje económico fuera de rango"));
                }
            }
        }
        for (key, limit) in [("latitude", 90), ("longitude", 180)] {
            if let Some(value) = record.attributes.get(key).filter(|value| !value.is_empty()) {
                let coordinate = value
                    .parse::<rust_decimal::Decimal>()
                    .map_err(|_| invalid("Coordenada inválida"))?;
                if coordinate.abs() > rust_decimal::Decimal::from(limit) {
                    return Err(invalid("Coordenada fuera de rango"));
                }
            }
        }
        for key in ["start_date", "end_date"] {
            if let Some(value) = record.attributes.get(key).filter(|value| !value.is_empty()) {
                chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
                    .map_err(|_| invalid("Fecha de ficha inválida"))?;
            }
        }
        if let (Some(start), Some(end)) = (
            record.attributes.get("start_date"),
            record.attributes.get("end_date"),
        ) {
            if !start.is_empty() && !end.is_empty() && end < start {
                return Err(invalid("El fin no puede ser anterior al inicio"));
            }
        }
        for (field, kind) in [
            ("responsible_id", "user"),
            ("establishment_id", "establishment"),
            ("classification_id", "category"),
        ] {
            if let Some(value) = record
                .attributes
                .get(field)
                .filter(|value| !value.is_empty())
            {
                let id = Uuid::parse_str(value)
                    .map_err(|_| invalid("Identificador de referencia inválido"))?;
                let related = self
                    .management_record(id)?
                    .ok_or_else(|| invalid("La referencia de la ficha no existe"))?;
                if related.kind != kind
                    || (related.company_id.is_some() && related.company_id != record.company_id)
                {
                    return Err(invalid(
                        "La referencia debe corresponder al tipo y empresa de la ficha",
                    ));
                }
            }
        }
        if record.kind == "contract" {
            for key in ["start_date", "end_date"] {
                if let Some(value) = record.attributes.get(key).filter(|v| !v.is_empty()) {
                    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
                        .map_err(|_| invalid("Fecha contractual inválida"))?;
                }
            }
            if let (Some(start), Some(end)) = (
                record.attributes.get("start_date"),
                record.attributes.get("end_date"),
            ) {
                if !end.is_empty() && end < start {
                    return Err(invalid("El fin no puede ser anterior al inicio"));
                }
            }
            if !record
                .attributes
                .get("currency")
                .is_some_and(|v| ["ARS", "USD"].contains(&v.as_str()))
            {
                return Err(invalid("Moneda contractual inválida"));
            }
            if let Some(value) = record.attributes.get("amount").filter(|v| !v.is_empty()) {
                let amount = value
                    .parse::<rust_decimal::Decimal>()
                    .map_err(|_| invalid("Importe contractual inválido"))?;
                if amount < rust_decimal::Decimal::ZERO {
                    return Err(invalid("Importe contractual negativo"));
                }
            }
        }
        if ["supplier", "client_profile"].contains(&record.kind.as_str()) {
            return self.save_supplier_person_record(record);
        }
        let mut saved = record.clone();
        saved.name = saved.name.trim().into();
        if existing.is_none() && saved.code.trim().is_empty() && saved.kind != "unit" {
            saved.code = self.automatic_code(&format!("management:{}", saved.kind))?;
        }
        saved.revision = existing.as_ref().map_or(1, |old| old.revision + 1);
        let args = params![
            saved.id.to_string(),
            saved.kind,
            saved.name,
            saved.code,
            saved.company_id.map(|v| v.to_string()),
            saved.parent_id.map(|v| v.to_string()),
            saved.project_id.map(|v| v.to_string()),
            saved.client_id.map(|v| v.to_string()),
            serde_json::to_string(&saved.attributes)?,
            saved.revision
        ];
        let changed = self.conn.execute("INSERT INTO management_records(id,kind,name,code,company_id,parent_id,project_id,client_id,attributes_json,revision) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) ON CONFLICT(id) DO UPDATE SET name=excluded.name,code=excluded.code,company_id=excluded.company_id,parent_id=excluded.parent_id,project_id=excluded.project_id,client_id=excluded.client_id,attributes_json=excluded.attributes_json,revision=excluded.revision WHERE management_records.revision=excluded.revision-1",args)?;
        if changed != 1 {
            return Err(invalid("La ficha cambió; recargá antes de guardar"));
        }
        Ok(saved)
    }
    pub fn change_events(&self, after: i64) -> Result<Vec<ChangeEvent>> {
        Ok(self.conn.prepare("SELECT sequence,entity_type,entity_id,operation,old_json,new_json,occurred_at FROM change_events WHERE sequence>?1 ORDER BY sequence LIMIT 1000")?.query_map([after],|r|Ok(ChangeEvent{sequence:r.get(0)?,entity_type:r.get(1)?,entity_id:r.get(2)?,operation:r.get(3)?,old_json:r.get(4)?,new_json:r.get(5)?,occurred_at:r.get(6)?}))?.collect::<std::result::Result<_,_>>()?)
    }
    pub(crate) fn install_audit_triggers(&self) -> Result<()> {
        let tables: Vec<String> = self.conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('schema_migrations','change_events','automatic_codes')")?
            .query_map([], |r|r.get(0))?.collect::<std::result::Result<_,_>>()?;
        for table in tables {
            if !table.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
                return Err(invalid("Nombre de tabla inesperado"));
            }
            let exists: bool = self.conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
                [&table],
                |r| r.get(0),
            )?;
            if !exists {
                continue;
            }
            let fields: Vec<String> = self
                .conn
                .prepare(&format!("PRAGMA table_info({table})"))?
                .query_map([], |r| r.get(1))?
                .collect::<std::result::Result<_, _>>()?;
            let json = |alias: &str| {
                format!(
                    "json_object({})",
                    fields
                        .iter()
                        .map(|f| if f == "content" {
                            format!("'content_bytes',length({alias}.\"{f}\")")
                        } else {
                            format!("'{f}',{alias}.\"{f}\"")
                        })
                        .collect::<Vec<_>>()
                        .join(",")
                )
            };
            for op in ["insert", "update", "delete"] {
                let old = if op == "insert" {
                    "NULL".into()
                } else {
                    json("OLD")
                };
                let new = if op == "delete" {
                    "NULL".into()
                } else {
                    json("NEW")
                };
                let alias = if op == "delete" { "OLD" } else { "NEW" };
                let key = if fields.iter().any(|field| field == "id") {
                    "id"
                } else if fields.iter().any(|field| field == "entity_id") {
                    "entity_id"
                } else if fields.iter().any(|field| field == "operation_id") {
                    "operation_id"
                } else if fields.iter().any(|field| field == "document_id") {
                    "document_id"
                } else if fields.iter().any(|field| field == "project_id") {
                    "project_id"
                } else if fields.iter().any(|field| field == "line_id") {
                    "line_id"
                } else if fields.iter().any(|field| field == "analysis_id") {
                    "analysis_id"
                } else {
                    "estimate_id"
                };
                let id = format!("{alias}.{key}");
                self.conn.execute_batch(&format!("DROP TRIGGER IF EXISTS audit_{table}_{op}; CREATE TRIGGER audit_{table}_{op} AFTER {op} ON {table} BEGIN INSERT INTO change_events(entity_type,entity_id,operation,old_json,new_json) VALUES ('{table}',{id},'{op}',{old},{new}); END;"))?;
            }
        }
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn company() -> ManagementRecord {
        ManagementRecord {
            id: Uuid::new_v4(),
            kind: "company".into(),
            name: "Empresa".into(),
            code: "EMP".into(),
            company_id: None,
            parent_id: None,
            project_id: None,
            client_id: None,
            attributes: BTreeMap::new(),
            revision: 0,
        }
    }
    #[test]
    fn saves_related_records_checks_roles_and_tracks_changes() {
        let mut store = LocalStore::in_memory().unwrap();
        let company = store.save_management_record(&company()).unwrap();
        let mut user = ManagementRecord {
            kind: "user".into(),
            company_id: Some(company.id),
            ..company.clone()
        };
        user.id = Uuid::new_v4();
        user.revision = 0;
        assert!(store.save_management_record(&user).is_err());
        user.attributes.insert("role".into(), "planner".into());
        let saved = store.save_management_record(&user).unwrap();
        assert!(store.save_management_record(&user).is_err());
        assert_eq!(
            store.management_records("user", None).unwrap()[0].revision,
            saved.revision
        );
        assert_eq!(store.change_events(0).unwrap().len(), 2);
        store.verify_integrity().unwrap();
    }
}
