//! Organization identity is persistent per project; defaults apply only to new projects.
use crate::{
    printing::{PrintProfile, SavedPrintProfile},
    LocalStore, Result, StorageError,
};
use cpobras_core::Project;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Organization {
    pub id: Uuid,
    pub name: String,
    pub ownership: String,
    pub owner_peer_id: Option<String>,
    pub company_id: Option<Uuid>,
    pub revision: u32,
    pub profile: PrintProfile,
    pub is_default: bool,
}
fn invalid(s: &str) -> StorageError {
    StorageError::InvalidValue(s.into())
}
impl LocalStore {
    pub(crate) fn initialize_organizations(&self) -> Result<()> {
        let conn = &self.conn;
        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM organization_preferences WHERE id='default')",
            [],
            |r| r.get(0),
        )?;
        if !exists {
            let companies: Vec<(String, String)> = conn
                .prepare(
                    "SELECT id,name FROM management_records WHERE kind='company' ORDER BY name,id",
                )?
                .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
                .collect::<std::result::Result<_, _>>()?;
            for (id, name) in &companies {
                let p = PrintProfile {
                    company_name: name.clone(),
                    ..Default::default()
                };
                conn.execute("INSERT INTO organizations(id,name,ownership,company_id,revision,profile_json) VALUES (?1,?2,'own',?1,0,?3)",params![id,name,serde_json::to_string(&p)?])?;
            }
            let legacy: Option<(u32, String)> = conn
                .query_row(
                    "SELECT revision,profile_json FROM print_profiles WHERE id='default'",
                    [],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()?;
            let (revision, profile) = match legacy {
                Some((r, j)) => (r, serde_json::from_str::<PrintProfile>(&j)?),
                None => (0, PrintProfile::default()),
            };
            let issuer = [
                &profile.company_name,
                &profile.trade_name,
                &profile.professional_name,
            ]
            .into_iter()
            .find(|s| !s.trim().is_empty())
            .cloned();
            let matched = issuer.as_ref().and_then(|name| {
                companies
                    .iter()
                    .find(|(_, n)| n.trim().to_lowercase() == name.trim().to_lowercase())
            });
            let id = if let Some((id, _)) = matched {
                conn.execute(
                    "UPDATE organizations SET profile_json=?1,revision=?2 WHERE id=?3",
                    params![serde_json::to_string(&profile)?, revision, id],
                )?;
                id.clone()
            } else if issuer.is_none() && !companies.is_empty() {
                companies[0].0.clone()
            } else {
                let id = Uuid::new_v4().to_string();
                conn.execute("INSERT INTO organizations(id,name,ownership,revision,profile_json) VALUES (?1,?2,'own',?3,?4)",params![id,issuer.unwrap_or_else(||"Mi organización".into()),revision,serde_json::to_string(&profile)?])?;
                id
            };
            conn.execute(
                "INSERT INTO organization_preferences(id,organization_id) VALUES ('default',?1)",
                [id],
            )?;
        }
        // Migration only fills missing associations; opening the app never reassigns existing projects.
        conn.execute("INSERT OR IGNORE INTO project_organizations(project_id,organization_id) SELECT p.id,(SELECT organization_id FROM organization_preferences WHERE id='default') FROM projects p",[])?;
        Ok(())
    }
    pub fn organizations(&self) -> Result<Vec<Organization>> {
        let rows:Vec<(String,String,String,Option<String>,Option<String>,u32,String,bool)>=self.conn.prepare("SELECT o.id,o.name,o.ownership,o.owner_peer_id,o.company_id,o.revision,o.profile_json,EXISTS(SELECT 1 FROM organization_preferences p WHERE p.organization_id=o.id) FROM organizations o ORDER BY o.name,o.id")?.query_map([],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?,r.get(7)?)))?.collect::<std::result::Result<_,_>>()?;
        rows.into_iter()
            .map(
                |(id, name, ownership, owner_peer_id, company_id, revision, json, is_default)| {
                    Ok(Organization {
                        id: Uuid::parse_str(&id)?,
                        name,
                        ownership,
                        owner_peer_id,
                        company_id: company_id.map(|s| Uuid::parse_str(&s)).transpose()?,
                        revision,
                        profile: serde_json::from_str(&json)?,
                        is_default,
                    })
                },
            )
            .collect()
    }
    pub fn organization(&self, id: Uuid) -> Result<Organization> {
        self.organizations()?
            .into_iter()
            .find(|o| o.id == id)
            .ok_or_else(|| invalid("Organización inexistente"))
    }
    pub fn default_organization(&self) -> Result<Organization> {
        self.organizations()?
            .into_iter()
            .find(|o| o.is_default)
            .ok_or_else(|| invalid("No hay organización predeterminada"))
    }
    pub fn project_organization(&self, project: Uuid) -> Result<Organization> {
        let id: String = self.conn.query_row(
            "SELECT organization_id FROM project_organizations WHERE project_id=?1",
            [project.to_string()],
            |r| r.get(0),
        )?;
        self.organization(Uuid::parse_str(&id)?)
    }
    pub fn create_organization(&mut self, name: &str) -> Result<Organization> {
        if name.trim().is_empty() || name.len() > 500 {
            return Err(invalid("Nombre de organización inválido"));
        }
        let id = Uuid::new_v4();
        let profile = PrintProfile {
            company_name: name.trim().into(),
            ..Default::default()
        };
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        tx.execute("INSERT INTO management_records(id,kind,name,code,attributes_json,revision) VALUES (?1,'company',?2,'','{}',1)",params![id.to_string(),name.trim()])?;
        tx.execute("INSERT INTO organizations(id,name,ownership,company_id,revision,profile_json) VALUES (?1,?2,'own',?1,1,?3)",params![id.to_string(),name.trim(),serde_json::to_string(&profile)?])?;
        tx.commit()?;
        self.organization(id)
    }
    pub fn save_organization(
        &mut self,
        id: Uuid,
        revision: u32,
        name: &str,
        profile: &PrintProfile,
    ) -> Result<Organization> {
        if name.trim().is_empty() || name.len() > 500 {
            return Err(invalid("Nombre de organización inválido"));
        }
        profile.validate()?;
        let tx = rusqlite::Transaction::new_unchecked(
            &self.conn,
            rusqlite::TransactionBehavior::Immediate,
        )?;
        let old = self.organization(id)?;
        if old.ownership != "own" {
            return Err(invalid("La organización externa es de solo lectura"));
        }
        if old.revision != revision {
            return Err(invalid("La organización cambió. Recargá antes de guardar"));
        }
        let next = revision
            .checked_add(1)
            .ok_or_else(|| invalid("Revisión fuera de rango"))?;
        let company = old.company_id.unwrap_or(id);
        tx.execute("INSERT INTO management_records(id,kind,name,code,attributes_json,revision) VALUES (?1,'company',?2,'','{}',1) ON CONFLICT(id) DO UPDATE SET name=excluded.name,revision=management_records.revision+1",params![company.to_string(),name.trim()])?;
        tx.execute("UPDATE organizations SET name=?1,company_id=?2,profile_json=?3,revision=?4 WHERE id=?5",params![name.trim(),company.to_string(),serde_json::to_string(profile)?,next,id.to_string()])?;
        tx.commit()?;
        self.organization(id)
    }
    pub fn set_default_organization(&self, id: Uuid) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        if self.organization(id)?.ownership != "own" {
            return Err(invalid(
                "Una organización externa no puede ser predeterminada",
            ));
        }
        tx.execute(
            "UPDATE organization_preferences SET organization_id=?1 WHERE id='default'",
            [id.to_string()],
        )?;
        tx.commit()?;
        Ok(())
    }
    pub fn save_project_for_organization(
        &mut self,
        project: &Project,
        organization: Uuid,
    ) -> Result<()> {
        let tx = rusqlite::Transaction::new_unchecked(
            &self.conn,
            rusqlite::TransactionBehavior::Immediate,
        )?;
        self.save_project_organization_inner(project, organization)?;
        tx.commit()?;
        Ok(())
    }
    pub(crate) fn save_project_organization_inner(
        &self,
        project: &Project,
        organization: Uuid,
    ) -> Result<()> {
        if self.organization(organization)?.ownership != "own" {
            return Err(invalid(
                "Las obras nuevas deben pertenecer a una organización propia",
            ));
        }
        if self.get_project(project.id)?.is_some()
            && self.project_organization(project.id)?.ownership != "own"
        {
            return Err(invalid("La obra externa es de solo lectura"));
        }
        let owner = self.organization(organization)?;
        if owner.company_id.is_none() {
            self.conn.execute("INSERT INTO management_records(id,kind,name,code,attributes_json,revision) VALUES (?1,'company',?2,'','{}',1)",params![owner.id.to_string(),owner.name])?;
            self.conn.execute(
                "UPDATE organizations SET company_id=id WHERE id=?1",
                [owner.id.to_string()],
            )?;
        }
        self.save_project(project)?;
        self.conn.execute("INSERT INTO project_organizations(project_id,organization_id) VALUES (?1,?2) ON CONFLICT(project_id) DO UPDATE SET organization_id=excluded.organization_id",params![project.id.to_string(),organization.to_string()])?;
        Ok(())
    }
    /// Storage boundary for a future authenticated sync transport; deliberately not exposed over IPC.
    pub fn apply_external_organization_snapshot(
        &mut self,
        id: Uuid,
        peer: &str,
        revision: u32,
        name: &str,
        profile: &PrintProfile,
    ) -> Result<()> {
        if peer.trim().is_empty()
            || peer.len() > 200
            || revision == 0
            || name.trim().is_empty()
            || name.len() > 500
        {
            return Err(invalid("Origen o datos externos inválidos"));
        }
        profile.validate()?;
        let tx = self
            .conn
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let old: Option<(String, Option<String>, u32)> = tx
            .query_row(
                "SELECT ownership,owner_peer_id,revision FROM organizations WHERE id=?1",
                [id.to_string()],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()?;
        if let Some((ownership, owner, version)) = old {
            if ownership != "external" || owner.as_deref() != Some(peer) || revision <= version {
                return Err(invalid("Origen externo distinto o revisión anterior"));
            }
        }
        tx.execute("INSERT INTO organizations(id,name,ownership,owner_peer_id,revision,profile_json) VALUES (?1,?2,'external',?3,?4,?5) ON CONFLICT(id) DO UPDATE SET name=excluded.name,revision=excluded.revision,profile_json=excluded.profile_json",params![id.to_string(),name.trim(),peer,revision,serde_json::to_string(profile)?])?;
        tx.commit()?;
        Ok(())
    }
    pub fn organization_print_profile(&self) -> Result<SavedPrintProfile> {
        let o = self.default_organization()?;
        Ok(SavedPrintProfile {
            revision: o.revision,
            profile: o.profile,
        })
    }
}
