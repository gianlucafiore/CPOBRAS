//! Manual, database-scoped reminders. Expiration is a local calendar date, not a timestamp.
use crate::{LocalStore, Result, StorageError};
use chrono::{Datelike, NaiveDate};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReminderInput {
    pub id: Option<Uuid>,
    pub revision: u32,
    pub title: String,
    pub due_date: String,
    pub kind: String,
    pub project_id: Option<Uuid>,
    pub person_id: Option<Uuid>,
    pub notes: String,
    pub completed: bool,
}
#[derive(Debug, Clone, Serialize)]
pub struct Reminder {
    #[serde(flatten)]
    pub data: ReminderInput,
    pub project_name: String,
    pub person_name: String,
}
#[derive(Debug, Serialize)]
pub struct ReminderPage {
    pub items: Vec<Reminder>,
    pub page: u32,
    pub total: u32,
    pub page_size: u32,
}
fn invalid(message: &str) -> StorageError {
    StorageError::InvalidValue(message.into())
}
fn date(value: &str) -> Result<()> {
    let parsed = NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| invalid("Fecha de vencimiento inválida"))?;
    if parsed.to_string() != value || !(1..=9999).contains(&parsed.year()) {
        return Err(invalid("Fecha de vencimiento inválida"));
    }
    Ok(())
}
fn row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Reminder> {
    let uuid = |index| -> rusqlite::Result<Option<Uuid>> {
        r.get::<_, Option<String>>(index)?
            .map(|id| {
                Uuid::parse_str(&id).map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        index,
                        rusqlite::types::Type::Text,
                        Box::new(e),
                    )
                })
            })
            .transpose()
    };
    Ok(Reminder {
        data: ReminderInput {
            id: uuid(0)?,
            title: r.get(1)?,
            due_date: r.get(2)?,
            kind: r.get(3)?,
            project_id: uuid(4)?,
            person_id: uuid(5)?,
            notes: r.get(6)?,
            completed: r.get(7)?,
            revision: r.get(8)?,
        },
        project_name: r.get(9)?,
        person_name: r.get(10)?,
    })
}
const SELECT: &str = "SELECT r.id,r.title,r.due_date,r.kind,r.project_id,r.person_id,r.notes,r.completed,r.revision,COALESCE(p.name,r.project_name),COALESCE(c.name,r.person_name) FROM reminders r LEFT JOIN projects p ON p.id=r.project_id LEFT JOIN persons c ON c.id=r.person_id";
impl LocalStore {
    pub fn reminders(&self, today: &str, page: u32) -> Result<ReminderPage> {
        date(today)?;
        let total: u32 = self
            .conn
            .query_row("SELECT COUNT(*) FROM reminders", [], |r| r.get(0))?;
        let page = page.min(total.saturating_sub(1) / 20);
        let sql=format!("{SELECT} ORDER BY CASE WHEN r.completed=1 THEN 2 WHEN r.due_date<?1 THEN 1 ELSE 0 END, CASE WHEN r.completed=0 AND r.due_date>=?1 THEN r.due_date END ASC, CASE WHEN r.completed=1 OR r.due_date<?1 THEN r.due_date END DESC,r.id LIMIT 20 OFFSET ?2");
        let items = self
            .conn
            .prepare(&sql)?
            .query_map(params![today, i64::from(page) * 20], row)?
            .collect::<std::result::Result<_, _>>()?;
        Ok(ReminderPage {
            items,
            page,
            total,
            page_size: 20,
        })
    }
    pub fn save_reminder(&mut self, input: &ReminderInput) -> Result<Reminder> {
        date(&input.due_date)?;
        if input.title.trim().is_empty()
            || input.title.chars().count() > 300
            || input.notes.chars().count() > 5000
            || ![
                "general",
                "materials",
                "client_certificate",
                "contractor_certificate",
                "client_quote",
            ]
            .contains(&input.kind.as_str())
        {
            return Err(invalid("Revisá el título, tipo y notas del recordatorio"));
        }
        let tx = self.conn.transaction()?;
        let name = |table: &str, id: Option<Uuid>| -> Result<String> {
            if let Some(id) = id {
                tx.query_row(
                    &format!("SELECT name FROM {table} WHERE id=?1"),
                    [id.to_string()],
                    |r| r.get(0),
                )
                .optional()?
                .ok_or_else(|| invalid("La obra o el contacto ya no existe"))
            } else {
                Ok(String::new())
            }
        };
        let project_name = name("projects", input.project_id)?;
        let person_name = name("persons", input.person_id)?;
        let id = input.id.unwrap_or_else(Uuid::new_v4);
        let project_id = input.project_id.map(|v| v.to_string());
        let person_id = input.person_id.map(|v| v.to_string());
        if input.id.is_some() {
            let changed=tx.execute("UPDATE reminders SET title=?1,due_date=?2,kind=?3,project_id=?4,person_id=?5,notes=?6,completed=?7,project_name=?8,person_name=?9,revision=revision+1 WHERE id=?10 AND revision=?11",params![input.title.trim(),input.due_date,input.kind,project_id,person_id,input.notes,input.completed,project_name,person_name,id.to_string(),input.revision])?;
            if changed != 1 {
                return Err(invalid(
                    "El recordatorio cambió o fue eliminado. Actualizá la lista antes de editarlo",
                ));
            }
        } else {
            if input.revision != 0 {
                return Err(invalid("Revisión inicial inválida"));
            }
            tx.execute("INSERT INTO reminders(id,title,due_date,kind,project_id,person_id,notes,completed,project_name,person_name) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",params![id.to_string(),input.title.trim(),input.due_date,input.kind,project_id,person_id,input.notes,input.completed,project_name,person_name])?;
        }
        let saved = tx.query_row(&format!("{SELECT} WHERE r.id=?1"), [id.to_string()], row)?;
        tx.commit()?;
        Ok(saved)
    }
    pub fn delete_reminder(&mut self, id: Uuid, revision: u32) -> Result<()> {
        if self.conn.execute(
            "DELETE FROM reminders WHERE id=?1 AND revision=?2",
            params![id.to_string(), revision],
        )? != 1
        {
            return Err(invalid(
                "El recordatorio cambió o fue eliminado. Actualizá la lista",
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn input(title: &str, due_date: &str) -> ReminderInput {
        ReminderInput {
            id: None,
            revision: 0,
            title: title.into(),
            due_date: due_date.into(),
            kind: "client_quote".into(),
            project_id: None,
            person_id: None,
            notes: "Responder al cliente".into(),
            completed: false,
        }
    }
    #[test]
    fn pages_prioritize_upcoming_and_today_then_gray_history_without_losing_old_entries() {
        let mut s = LocalStore::in_memory().unwrap();
        s.save_reminder(&input("Vencido", "2026-01-01")).unwrap();
        for i in 1..=23 {
            s.save_reminder(&input(
                &format!("Pendiente {i}"),
                &format!("2026-11-{i:02}"),
            ))
            .unwrap();
        }
        let first = s.reminders("2026-11-01", 0).unwrap();
        assert_eq!(first.items.len(), 20);
        assert_eq!(first.total, 24);
        assert_eq!(first.items[0].data.due_date, "2026-11-01");
        let last = s.reminders("2026-11-01", 99).unwrap();
        assert_eq!(last.page, 1);
        assert_eq!(last.items.len(), 4);
        assert_eq!(last.items.last().unwrap().data.title, "Vencido");
        let next = s.reminders("2026-11-02", 0).unwrap();
        assert_eq!(next.items[0].data.due_date, "2026-11-02");
        let mut done = first.items[0].data.clone();
        done.completed = true;
        let saved = s.save_reminder(&done).unwrap();
        assert!(saved.data.completed);
        assert_eq!(
            s.reminders("2026-11-01", 1)
                .unwrap()
                .items
                .last()
                .unwrap()
                .data
                .title,
            done.title
        );
    }
    #[test]
    fn edits_validate_dates_references_and_revisions_and_survive_backups() {
        let mut s = LocalStore::in_memory().unwrap();
        for day in ["2026-02-30", "2026-2-01", "0000-01-01"] {
            assert!(s.save_reminder(&input("Inválido", day)).is_err());
        }
        let mut bad = input(" ", "2026-11-01");
        assert!(s.save_reminder(&bad).is_err());
        bad.title = "Comprar".into();
        bad.project_id = Some(Uuid::new_v4());
        assert!(s.save_reminder(&bad).is_err());
        let saved = s
            .save_reminder(&input("Cotizar obra", "2026-11-01"))
            .unwrap();
        let mut edit = saved.data.clone();
        edit.title = "Cotizar ampliación".into();
        let updated = s.save_reminder(&edit).unwrap();
        assert_eq!(updated.data.revision, 2);
        assert!(s.save_reminder(&edit).is_err());
        assert!(s.delete_reminder(edit.id.unwrap(), 1).is_err());
        let path =
            std::env::temp_dir().join(format!("cpobras-reminders-{}.sqlite", Uuid::new_v4()));
        s.backup_to(&path).unwrap();
        let restored = LocalStore::open_existing(&path).unwrap();
        assert_eq!(
            restored.reminders("2026-11-01", 0).unwrap().items[0]
                .data
                .title,
            "Cotizar ampliación"
        );
        drop(restored);
        std::fs::remove_file(path).unwrap();
        s.delete_reminder(updated.data.id.unwrap(), 2).unwrap();
        assert_eq!(s.reminders("2026-11-01", 5).unwrap().page, 0);
    }
    #[test]
    fn associations_are_local_and_schema_upgrade_keeps_existing_projects() {
        use cpobras_core::{Client, Currency, Project};
        let mut s = LocalStore::in_memory().unwrap();
        let client = Client {
            id: Uuid::new_v4(),
            name: "Comitente".into(),
            cuit: None,
        };
        s.save_client(&client).unwrap();
        let project = Project {
            id: Uuid::new_v4(),
            client_id: client.id,
            name: "Obra norte".into(),
            currency: Currency::Ars,
        };
        s.save_project(&project).unwrap();
        let mut item = input("Comprar caños", "2026-11-20");
        item.kind = "materials".into();
        item.project_id = Some(project.id);
        item.person_id = Some(client.id);
        let saved = s.save_reminder(&item).unwrap();
        assert_eq!(saved.project_name, "Obra norte");
        assert_eq!(saved.person_name, "Comitente");
        let mut other = LocalStore::in_memory().unwrap();
        assert_eq!(other.reminders("2026-11-16", 0).unwrap().total, 0);
        assert!(other.save_reminder(&saved.data).is_err());
        let path = std::env::temp_dir().join(format!(
            "cpobras-reminder-upgrade-{}.sqlite",
            Uuid::new_v4()
        ));
        s.backup_to(&path).unwrap();
        other.restore_from(&path).unwrap();
        assert_eq!(
            other.reminders("2026-11-16", 0).unwrap().items[0].person_name,
            "Comitente"
        );
        let legacy = rusqlite::Connection::open(&path).unwrap();
        legacy
            .execute_batch("DROP TABLE budget_presentations;DROP TABLE organization_indirect_costs;DROP TABLE reminders;DELETE FROM schema_migrations WHERE version>=35;")
            .unwrap();
        drop(legacy);
        let upgraded = LocalStore::open_existing(&path).unwrap();
        assert_eq!(upgraded.list_projects().unwrap()[0].id, project.id);
        assert_eq!(upgraded.reminders("2026-11-16", 0).unwrap().total, 0);
        upgraded.verify_integrity().unwrap();
        drop(upgraded);
        std::fs::remove_file(path).unwrap();
    }
}
