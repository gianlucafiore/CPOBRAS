//! Database-scoped reminders with local calendar dates.
use crate::{LocalStore, Result, StorageError};
use chrono::{Datelike, Days, NaiveDate};
use rusqlite::{params, OptionalExtension};
use rust_decimal::Decimal;
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub certificate: Option<CertificateReminder>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CertificateReminder {
    estimate_id: Uuid,
    operation_id: Option<Uuid>,
    contract_id: Option<Uuid>,
    draft_id: Option<Uuid>,
    start: String,
    end: String,
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
        certificate: None,
    })
}
const SELECT: &str = "SELECT r.id,r.title,r.due_date,r.kind,r.project_id,r.person_id,r.notes,r.completed,r.revision,COALESCE(p.name,r.project_name),COALESCE(c.name,r.person_name) FROM reminders r LEFT JOIN projects p ON p.id=r.project_id LEFT JOIN persons c ON c.id=r.person_id";
impl LocalStore {
    pub fn reminders(&self, today: &str, page: u32) -> Result<ReminderPage> {
        self.reminders_with_certificates(today, page, 3)
    }

    pub fn reminders_with_certificates(
        &self,
        today: &str,
        page: u32,
        lead: u32,
    ) -> Result<ReminderPage> {
        date(today)?;
        let today_date =
            NaiveDate::parse_from_str(today, "%Y-%m-%d").map_err(|_| invalid("Fecha inválida"))?;
        let until = today_date
            .checked_add_days(Days::new(u64::from(lead.min(90))))
            .unwrap_or(today_date)
            .to_string();
        let mut items: Vec<Reminder> = self
            .conn
            .prepare(SELECT)?
            .query_map([], row)?
            .collect::<std::result::Result<_, _>>()?;
        items.extend(self.certificate_reminders(&until)?);
        items.sort_by(|a, b| {
            let rank = |r: &Reminder| {
                if r.data.completed {
                    2
                } else if r.data.due_date.as_str() < today {
                    1
                } else {
                    0
                }
            };
            let left = rank(a);
            left.cmp(&rank(b))
                .then_with(|| {
                    if left == 0 {
                        a.data.due_date.cmp(&b.data.due_date)
                    } else {
                        b.data.due_date.cmp(&a.data.due_date)
                    }
                })
                .then(a.data.id.cmp(&b.data.id))
        });
        let total = items.len() as u32;
        let page = page.min(total.saturating_sub(1) / 20);
        Ok(ReminderPage {
            items: items
                .into_iter()
                .skip(page as usize * 20)
                .take(20)
                .collect(),
            total,
            page,
            page_size: 20,
        })
    }

    fn certificate_reminders(&self, until: &str) -> Result<Vec<Reminder>> {
        let mut reminders = Vec::new();
        for project in self.list_projects()? {
            let docs = self.operation_documents(Some(project.id))?;
            let plan = self.project_plan(project.id)?.map(|saved| saved.plan);
            let client = self
                .get_client(project.client_id)?
                .map(|client| client.name)
                .unwrap_or_default();
            let mut push = |title: String,
                            kind: &str,
                            due: &str,
                            contact: String,
                            target: CertificateReminder,
                            notes: String| {
                if due.is_empty() || due > until {
                    return;
                }
                reminders.push(Reminder {
                    data: ReminderInput {
                        id: target
                            .operation_id
                            .or(target.draft_id)
                            .or(target.contract_id)
                            .or(Some(target.estimate_id)),
                        revision: 0,
                        title,
                        due_date: due.into(),
                        kind: kind.into(),
                        project_id: Some(project.id),
                        person_id: None,
                        notes,
                        completed: false,
                    },
                    project_name: project.name.clone(),
                    person_name: contact,
                    certificate: Some(target),
                });
            };
            let partner_name = |id: Option<Uuid>| -> Result<String> {
                Ok(match id {
                    Some(id) => match self.management_record(id)? {
                        Some(record) => record.name,
                        None => self
                            .person(id)?
                            .map(|person| person.data.name)
                            .unwrap_or_default(),
                    },
                    None => String::new(),
                })
            };
            let estimates = self.list_project_estimates(project.id)?;
            let primary = estimates
                .iter()
                .find(|estimate| estimate.issued)
                .or_else(|| estimates.first())
                .map(|estimate| estimate.id);
            for estimate in estimates {
                let relevant = |operation: &&crate::operations::Operation| {
                    operation.estimate_id == Some(estimate.id)
                };
                let drafts = self.certificate_drafts(project.id, estimate.id)?;
                let target = |start: &str, end: &str| CertificateReminder {
                    estimate_id: estimate.id,
                    operation_id: None,
                    contract_id: None,
                    draft_id: None,
                    start: start.into(),
                    end: end.into(),
                };
                let issued = docs
                    .iter()
                    .filter(relevant)
                    .filter(|doc| doc.kind == "certificate")
                    .collect::<Vec<_>>();
                let last = issued
                    .iter()
                    .map(|doc| doc.period_end.as_str())
                    .max()
                    .unwrap_or("");
                let client_draft = drafts
                    .iter()
                    .find(|draft| draft.kind == "certificate" && draft.issued_id.is_none());
                if let Some(draft) = client_draft {
                    let op = &draft.operation;
                    let mut link = target(&op.period_start, &op.period_end);
                    link.draft_id = Some(draft.id);
                    push(
                        "Emitir certificado al comitente".into(),
                        "client_certificate",
                        &op.period_end,
                        client.clone(),
                        link,
                        String::new(),
                    );
                } else if let Some(plan) = plan
                    .as_ref()
                    .filter(|_| Some(estimate.id) == primary || !issued.is_empty())
                {
                    if let Some(cut) = plan
                        .finance
                        .cut_dates
                        .iter()
                        .filter(|cut| cut.as_str() > last)
                        .min()
                    {
                        push(
                            "Emitir certificado al comitente".into(),
                            "client_certificate",
                            cut,
                            client.clone(),
                            target(
                                &NaiveDate::parse_from_str(last, "%Y-%m-%d")
                                    .ok()
                                    .and_then(|day| day.succ_opt())
                                    .map(|day| day.to_string())
                                    .unwrap_or_else(|| plan.calendar.start_date.clone()),
                                cut,
                            ),
                            String::new(),
                        );
                    }
                }
                for contract in docs
                    .iter()
                    .filter(relevant)
                    .filter(|doc| doc.kind == "subcontract")
                {
                    let draft = drafts.iter().find(|draft| {
                        draft.issued_id.is_none()
                            && draft.operation.reference_id == Some(contract.id)
                    });
                    let period = if let Some(draft) = draft {
                        Some((
                            draft.operation.period_start.clone(),
                            draft.operation.period_end.clone(),
                            Some(draft.id),
                        ))
                    } else if let Some(terms) = contract
                        .contract_terms
                        .as_ref()
                        .filter(|terms| terms.frequency != "by_progress")
                    {
                        let previous = docs
                            .iter()
                            .filter(|doc| {
                                doc.kind == "subcertificate"
                                    && doc.reference_id == Some(contract.id)
                            })
                            .map(|doc| doc.period_end.as_str())
                            .max();
                        let start = previous
                            .and_then(|day| {
                                NaiveDate::parse_from_str(day, "%Y-%m-%d")
                                    .ok()?
                                    .succ_opt()
                                    .map(|date| date.to_string())
                            })
                            .unwrap_or_else(|| {
                                if terms.start.is_empty() {
                                    contract.date.clone()
                                } else {
                                    terms.start.clone()
                                }
                            });
                        if start.is_empty() || (!terms.end.is_empty() && start > terms.end) {
                            None
                        } else {
                            let cut =
                                crate::construction_workflow::pay_date(&start, &terms.frequency)?;
                            let end = if terms.end.is_empty() {
                                cut
                            } else {
                                cut.min(terms.end.clone())
                            };
                            Some((start, end, None))
                        }
                    } else {
                        None
                    };
                    if let Some((start, end, draft_id)) = period {
                        let mut link = target(&start, &end);
                        link.contract_id = Some(contract.id);
                        link.draft_id = draft_id;
                        push(
                            format!("Emitir certificado del contratista {}", contract.number),
                            "contractor_certificate",
                            &end,
                            partner_name(contract.partner_id)?,
                            link,
                            String::new(),
                        );
                    }
                }
                for doc in docs
                    .iter()
                    .filter(relevant)
                    .filter(|doc| matches!(doc.kind.as_str(), "certificate" | "subcertificate"))
                {
                    let incoming = doc.kind == "certificate";
                    let movement = if incoming { "collection" } else { "payment" };
                    let invoice = if incoming { "receivable" } else { "payable" };
                    let settled = crate::construction_workflow::sum(
                        docs.iter()
                            .filter(|row| {
                                row.kind == movement
                                    && (row.reference_id == Some(doc.id)
                                        || docs.iter().any(|bill| {
                                            bill.kind == invoice
                                                && bill.reference_id == Some(doc.id)
                                                && Some(bill.id) == row.reference_id
                                        }))
                            })
                            .map(|row| row.amount),
                    )?;
                    let balance = crate::construction_workflow::add(doc.amount, -settled)?;
                    if balance <= Decimal::ZERO {
                        continue;
                    }
                    let due = if doc.due_date.is_empty() {
                        &doc.date
                    } else {
                        &doc.due_date
                    };
                    let mut link = target(&doc.period_start, &doc.period_end);
                    link.operation_id = Some(doc.id);
                    link.contract_id = doc.reference_id;
                    let (verb, kind, contact) = if incoming {
                        ("Cobrar", "client_certificate", client.clone())
                    } else {
                        (
                            "Pagar",
                            "contractor_certificate",
                            partner_name(doc.partner_id)?,
                        )
                    };
                    push(
                        format!("{verb} certificado {}", doc.number),
                        kind,
                        due,
                        contact,
                        link,
                        format!("Saldo pendiente {} {}", doc.currency, balance.normalize()),
                    );
                }
            }
        }
        Ok(reminders)
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
            .execute_batch("DROP TABLE resource_productivities;DROP TABLE budget_presentations;DROP TABLE organization_indirect_costs;DROP TABLE reminders;DELETE FROM schema_migrations WHERE version>=35;")
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
