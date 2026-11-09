use crate::{construction_workflow::invalid, LocalStore, Result};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiteEntry {
    pub id: Uuid,
    pub project_id: Uuid,
    pub number: String,
    pub created_at: String,
    pub confirmed_at: Option<String>,
    pub description: String,
    pub revision: u32,
}
#[derive(Serialize)]
pub struct SitePage {
    pub entries: Vec<SiteEntry>,
    pub total: u32,
    pub page: u32,
}
fn row(r: &rusqlite::Row<'_>) -> rusqlite::Result<SiteEntry> {
    Ok(SiteEntry {
        id: r.get::<_, String>(0)?.parse().map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
        })?,
        project_id: r.get::<_, String>(1)?.parse().map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(1, rusqlite::types::Type::Text, Box::new(e))
        })?,
        number: r.get(2)?,
        created_at: r.get(3)?,
        confirmed_at: r.get(4)?,
        description: r.get(5)?,
        revision: r.get(6)?,
    })
}
const COLUMNS: &str = "id,project_id,number,created_at,confirmed_at,description,revision";
impl LocalStore {
    pub fn shared_site_entries(&self, project: Uuid) -> Result<Vec<SiteEntry>> {
        Ok(self.conn.prepare(&format!("SELECT {COLUMNS} FROM site_book_entries WHERE project_id=?1 AND confirmed_at IS NOT NULL ORDER BY created_at DESC,rowid DESC LIMIT 10000"))?.query_map([project.to_string()],row)?.collect::<std::result::Result<Vec<_>,_>>()?)
    }
    pub fn site_entries(&self, project: Uuid, page: u32) -> Result<SitePage> {
        let total: u32 = self.conn.query_row(
            "SELECT count(*) FROM site_book_entries WHERE project_id=?1",
            [project.to_string()],
            |r| r.get(0),
        )?;
        let page = page.min(total.saturating_sub(1) / 30);
        let entries=self.conn.prepare(&format!("SELECT {COLUMNS} FROM site_book_entries WHERE project_id=?1 ORDER BY created_at DESC,rowid DESC LIMIT 30 OFFSET ?2"))?.query_map(params![project.to_string(),u64::from(page)*30],row)?.collect::<std::result::Result<Vec<_>,_>>()?;
        Ok(SitePage {
            entries,
            total,
            page,
        })
    }
    pub fn save_site_entry(
        &mut self,
        project: Uuid,
        id: Option<Uuid>,
        revision: u32,
        description: &str,
    ) -> Result<SiteEntry> {
        let text = description.trim();
        if text.is_empty() || text.len() > 20000 {
            return Err(invalid("Describí el parte (hasta 20.000 caracteres)"));
        }
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let id = if let Some(id) = id {
            let n=tx.execute("UPDATE site_book_entries SET description=?1,revision=revision+1 WHERE id=?2 AND project_id=?3 AND revision=?4 AND confirmed_at IS NULL",params![text,id.to_string(),project.to_string(),revision])?;
            if n != 1 {
                return Err(invalid("El parte se confirmó o cambió. Recargá la lista"));
            }
            id
        } else {
            if revision != 0 {
                return Err(invalid("Revisión inicial inválida"));
            }
            let id = Uuid::new_v4();
            let number =
                crate::project_dashboard::next_code(&tx, &format!("book:{project}"), "PAR-")?;
            tx.execute("INSERT INTO site_book_entries(id,project_id,number,description) VALUES(?1,?2,?3,?4)",params![id.to_string(),project.to_string(),number,text])?;
            id
        };
        let entry = tx.query_row(
            &format!("SELECT {COLUMNS} FROM site_book_entries WHERE id=?1"),
            [id.to_string()],
            row,
        )?;
        tx.commit()?;
        Ok(entry)
    }
    pub fn confirm_site_entry(
        &mut self,
        project: Uuid,
        id: Uuid,
        revision: u32,
    ) -> Result<SiteEntry> {
        let n=self.conn.execute("UPDATE site_book_entries SET confirmed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),revision=revision+1 WHERE id=?1 AND project_id=?2 AND revision=?3 AND confirmed_at IS NULL",params![id.to_string(),project.to_string(),revision])?;
        if n != 1 {
            return Err(invalid("El parte se confirmó o cambió. Recargá la lista"));
        }
        Ok(self.conn.query_row(
            &format!("SELECT {COLUMNS} FROM site_book_entries WHERE id=?1"),
            [id.to_string()],
            row,
        )?)
    }
    pub fn print_site_entries(
        &self,
        project: Uuid,
        from: &str,
        to: &str,
        first: &str,
        last: &str,
    ) -> Result<Vec<SiteEntry>> {
        for date in [from, to] {
            if !date.is_empty() {
                chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d")
                    .map_err(|_| invalid("Fecha inválida"))?;
            }
        }
        if (!to.is_empty() && from > to) || (!last.is_empty() && first > last) {
            return Err(invalid("Rango invertido"));
        }
        let rows=self.conn.prepare(&format!("SELECT {COLUMNS} FROM site_book_entries WHERE project_id=?1 AND confirmed_at IS NOT NULL AND (?2='' OR substr(created_at,1,10)>=?2) AND (?3='' OR substr(created_at,1,10)<=?3) AND (?4='' OR number>=?4) AND (?5='' OR number<=?5) ORDER BY created_at,rowid LIMIT 3001"))?.query_map(params![project.to_string(),from,to,first,last],row)?.collect::<std::result::Result<Vec<_>,_>>()?;
        if rows.is_empty() || rows.len() > 3000 {
            return Err(invalid(
                "Elegí un rango de entre 1 y 3.000 partes confirmados",
            ));
        }
        Ok(rows)
    }
    pub fn open_next_client_certificate(
        &mut self,
        project: Uuid,
        estimate: Uuid,
    ) -> Result<crate::construction_workflow::CertificateDraft> {
        if let Some(d) = self
            .certificate_drafts(project, estimate)?
            .into_iter()
            .find(|d| d.kind == "certificate" && d.issued_id.is_none())
        {
            return Ok(d);
        }
        let plan = self
            .project_plan(project)?
            .ok_or_else(|| invalid("Programá los cortes de certificación en el Gantt"))?;
        let docs = self.operation_documents(Some(project))?;
        let latest = docs
            .iter()
            .filter(|o| o.kind == "certificate" && o.estimate_id == Some(estimate))
            .map(|o| o.period_end.as_str())
            .max();
        let mut cuts = plan.plan.finance.cut_dates;
        cuts.sort();
        let cut = cuts
            .iter()
            .find(|cut| latest.is_none_or(|end| cut.as_str() > end))
            .ok_or_else(|| invalid("No hay cortes pendientes. Agregalos en el Gantt"))?;
        let start = if let Some(end) = latest {
            (chrono::NaiveDate::parse_from_str(end, "%Y-%m-%d")
                .map_err(|_| invalid("Período inválido"))?
                + chrono::Duration::days(1))
            .to_string()
        } else {
            plan.plan.calendar.start_date
        };
        self.open_certificate_draft(project, estimate, None, &start, cut)
    }
}
