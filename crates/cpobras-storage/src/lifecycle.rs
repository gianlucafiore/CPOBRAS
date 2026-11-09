//! Removals preserve construction history; contacts may only be erased when unused.
use crate::{LocalStore, Result, StorageError};
use rusqlite::params;
use uuid::Uuid;
fn invalid(s: &str) -> StorageError {
    StorageError::InvalidValue(s.into())
}
impl LocalStore {
    pub fn set_entity_archived(&mut self, kind: &str, id: Uuid, archived: bool) -> Result<()> {
        let table = match kind {
            "project" => "projects",
            "estimate" => "estimates",
            "analysis" => "analyses",
            "nested_analysis" => "nested_analyses",
            "person:client" | "person:supplier" => "persons",
            _ => return Err(invalid("Tipo de registro inválido")),
        };
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        if !tx.query_row(
            &format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE id=?1)"),
            [id.to_string()],
            |r| r.get::<_, bool>(0),
        )? {
            return Err(invalid("Registro inexistente"));
        }
        if kind == "project" || kind == "estimate" {
            let project = if kind == "project" {
                id.to_string()
            } else {
                tx.query_row(
                    "SELECT project_id FROM estimates WHERE id=?1",
                    [id.to_string()],
                    |r| r.get::<_, String>(0),
                )?
            };
            let own:bool=tx.query_row("SELECT NOT EXISTS(SELECT 1 FROM project_organizations po JOIN organizations o ON o.id=po.organization_id WHERE po.project_id=?1 AND o.ownership='external')",[project],|r|r.get(0))?;
            if !own {
                return Err(invalid("La obra externa es de solo lectura"));
            }
        }
        if archived {
            tx.execute(
                "INSERT OR IGNORE INTO entity_archives(kind,entity_id) VALUES(?1,?2)",
                params![kind, id.to_string()],
            )?;
        } else {
            tx.execute(
                "DELETE FROM entity_archives WHERE kind=?1 AND entity_id=?2",
                params![kind, id.to_string()],
            )?;
        }
        tx.commit()?;
        Ok(())
    }
    pub fn delete_unused_person(&mut self, id: Uuid) -> Result<()> {
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let used:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM projects WHERE client_id=?1) OR EXISTS(SELECT 1 FROM management_records WHERE (person_id=?1 OR client_id=?1) AND (kind<>'supplier' OR project_id IS NOT NULL)) OR EXISTS(SELECT 1 FROM operation_documents WHERE json_extract(payload,'$.partner_id')=?1 OR json_extract(payload,'$.partner_id') IN (SELECT id FROM management_records WHERE person_id=?1)) OR EXISTS(SELECT 1 FROM project_suppliers WHERE person_id=?1) OR EXISTS(SELECT 1 FROM quotation_responses WHERE supplier_id IN (SELECT id FROM management_records WHERE person_id=?1))",[id.to_string()],|r|r.get(0))?;
        if used {
            return Err(invalid(
                "El contacto ya fue usado. Podés darlo de baja conservando su historial",
            ));
        }
        if tx
            .execute(
                "DELETE FROM management_records WHERE kind='supplier' AND person_id=?1",
                [id.to_string()],
            )
            .is_err()
        {
            return Err(invalid(
                "El contacto tiene registros vinculados. Usá Dar de baja",
            ));
        }
        // Imported legacy identity links are history, so never remove their contact.
        let legacy: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM person_legacy_links WHERE person_id=?1)",
            [id.to_string()],
            |r| r.get(0),
        )?;
        if legacy {
            return Err(invalid(
                "El contacto tiene antecedentes importados; usá Dar de baja",
            ));
        }
        if tx.execute("DELETE FROM persons WHERE id=?1", [id.to_string()])? == 0 {
            return Err(invalid("Contacto inexistente"));
        }
        tx.execute(
            "DELETE FROM entity_archives WHERE entity_id=?1 AND kind LIKE 'person:%'",
            [id.to_string()],
        )?;
        tx.commit()?;
        Ok(())
    }
}
