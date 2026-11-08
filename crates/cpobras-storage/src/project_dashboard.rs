use crate::{LocalStore, Result, StorageError};
use rusqlite::{params, Connection};
use serde::Serialize;
use uuid::Uuid;
pub(crate) fn next_code(conn: &Connection, scope: &str, prefix: &str) -> Result<String> {
    let values: Vec<String> = match scope {
        "stock_opening" => conn.prepare("SELECT json_extract(payload,'$.number') FROM operation_documents WHERE kind='stock_opening'")?.query_map([],|r|r.get(0))?.collect::<std::result::Result<_,_>>()?,
        "resource" => conn
            .prepare("SELECT code FROM resources")?
            .query_map([], |r| r.get(0))?
            .collect::<std::result::Result<_, _>>()?,
        "analysis" => conn
            .prepare("SELECT code FROM analyses UNION ALL SELECT code FROM nested_analyses")?
            .query_map([], |r| r.get(0))?
            .collect::<std::result::Result<_, _>>()?,
        "person" => conn
            .prepare("SELECT code FROM persons")?
            .query_map([], |r| r.get(0))?
            .collect::<std::result::Result<_, _>>()?,
        _ => conn
            .prepare(
                "SELECT code FROM management_records UNION ALL SELECT code FROM budget_sections",
            )?
            .query_map([], |r| r.get(0))?
            .collect::<std::result::Result<_, _>>()?,
    };
    let seed = values
        .iter()
        .filter_map(|v| v.strip_prefix(prefix)?.parse::<i64>().ok())
        .max()
        .unwrap_or(0)
        .max(0);
    let n:i64=conn.query_row("INSERT INTO automatic_codes(scope,last_value) VALUES(?1,?2+1) ON CONFLICT(scope) DO UPDATE SET last_value=max(last_value,?2)+1 RETURNING last_value",params![scope,seed],|r|r.get(0))?;
    Ok(format!("{prefix}{n:04}"))
}
#[derive(Serialize)]
pub struct AttachmentInfo {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub description: String,
    pub created_at: String,
    pub bytes: i64,
}
impl LocalStore {
    pub fn estimate_metadata(&self, id: Uuid) -> Result<serde_json::Value> {
        let (created, issued): (String, Option<String>) = self.conn.query_row(
            "SELECT created_at,issued_at FROM estimates WHERE id=?1",
            [id.to_string()],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?;
        Ok(serde_json::json!({"created_at":created,"issued_at":issued}))
    }
    pub fn automatic_code(&self, scope: &str) -> Result<String> {
        let prefix = match scope {
            "resource" => "INS-",
            "analysis" => "ACU-",
            "person" => "PER-",
            _ => "REG-",
        };
        next_code(&self.conn, scope, prefix)
    }
    pub fn measured_lines(&self, estimate: Uuid) -> Result<Vec<Uuid>> {
        let ids:Vec<String>=self.conn.prepare("SELECT m.line_id FROM measured_lines m JOIN estimate_lines l ON l.id=m.line_id WHERE l.estimate_id=?1 ORDER BY l.position")?.query_map([estimate.to_string()],|r|r.get(0))?.collect::<std::result::Result<_,_>>()?;
        ids.into_iter()
            .map(|id| Uuid::parse_str(&id).map_err(Into::into))
            .collect()
    }
    pub fn attach_project_file(
        &self,
        project: Uuid,
        name: &str,
        description: &str,
        content: &[u8],
    ) -> Result<Uuid> {
        let extension = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
        if ![
            "pdf", "png", "jpg", "jpeg", "webp", "txt", "csv", "doc", "docx", "xls", "xlsx", "odt",
            "ods", "dwg", "dxf", "zip",
        ]
        .contains(&extension.as_str())
            || name.is_empty()
            || name.len() > 255
            || name.contains(['/', '\\'])
            || description.len() > 2000
            || content.len() > 20 * 1024 * 1024
            || content.is_empty()
        {
            return Err(StorageError::InvalidValue(
                "Archivo no admitido o mayor a 20 MB".into(),
            ));
        }
        let id = Uuid::new_v4();
        self.conn.execute("INSERT INTO project_attachments(id,project_id,name,description,content) VALUES(?1,?2,?3,?4,?5)",params![id.to_string(),project.to_string(),name,description,content])?;
        Ok(id)
    }
    pub fn project_attachments(&self, project: Uuid) -> Result<Vec<AttachmentInfo>> {
        let rows=self.conn.prepare("SELECT id,name,description,created_at,length(content) FROM project_attachments WHERE project_id=?1 ORDER BY created_at DESC,id")?.query_map([project.to_string()],|r|Ok((r.get::<_,String>(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?)))?.collect::<std::result::Result<Vec<_>,_>>()?;
        rows.into_iter()
            .map(|(id, name, description, created_at, bytes)| {
                Ok(AttachmentInfo {
                    id: Uuid::parse_str(&id)?,
                    project_id: project,
                    name,
                    description,
                    created_at,
                    bytes,
                })
            })
            .collect()
    }
    pub fn project_attachment_content(&self, project: Uuid, id: Uuid) -> Result<(String, Vec<u8>)> {
        Ok(self.conn.query_row(
            "SELECT name,content FROM project_attachments WHERE project_id=?1 AND id=?2",
            params![project.to_string(), id.to_string()],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )?)
    }
    pub fn remove_project_attachment(&self, project: Uuid, id: Uuid) -> Result<()> {
        self.conn.execute(
            "DELETE FROM project_attachments WHERE project_id=?1 AND id=?2",
            params![project.to_string(), id.to_string()],
        )?;
        Ok(())
    }
}
