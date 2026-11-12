//! One canonical person identity, with independent client/supplier views and stable legacy links.
use crate::{management::ManagementRecord, LocalStore, Result, StorageError};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, deny_unknown_fields)]
pub struct PersonInput {
    pub name: String,
    pub cuit: Option<String>,
    pub code: String,
    pub email: String,
    pub phone: String,
    pub address: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Person {
    pub id: Uuid,
    pub role: String,
    pub revision: u32,
    #[serde(flatten)]
    pub data: PersonInput,
    pub supplier_record_id: Option<Uuid>,
    pub client_active: bool,
    pub supplier_active: bool,
}
#[derive(Debug, Serialize)]
pub struct PersonMatch {
    pub person: Person,
    pub score: u32,
    pub reason: String,
}
fn invalid(s: &str) -> StorageError {
    StorageError::InvalidValue(s.into())
}
pub fn tax_key(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .flat_map(char::to_uppercase)
        .collect()
}
fn normalize(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .map(|c| match c {
            'á' | 'à' | 'ä' => 'a',
            'é' | 'è' | 'ë' => 'e',
            'í' | 'ì' | 'ï' => 'i',
            'ó' | 'ò' | 'ö' => 'o',
            'ú' | 'ù' | 'ü' => 'u',
            'ñ' => 'n',
            c if c.is_alphanumeric() => c,
            _ => ' ',
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}
fn has(role: &str, wanted: &str) -> bool {
    role == wanted || role == "both"
}
fn union(a: &str, b: &str) -> String {
    if a == b {
        a.into()
    } else {
        "both".into()
    }
}
fn valid_role(role: &str) -> Result<()> {
    if !["client", "supplier", "both"].contains(&role) {
        Err(invalid("Función de persona inválida"))
    } else {
        Ok(())
    }
}
fn validate(p: &PersonInput) -> Result<()> {
    if p.name.trim().is_empty()
        || p.name.len() > 500
        || p.cuit.as_ref().is_some_and(|v| v.len() > 50)
        || p.code.len() > 100
        || [&p.email, &p.phone, &p.address]
            .iter()
            .any(|s| s.len() > 1000)
    {
        return Err(invalid("Revisá nombre y longitud de los datos de contacto"));
    }
    Ok(())
}
fn row_person(r: &rusqlite::Row<'_>) -> rusqlite::Result<Person> {
    let parse = |s: String| {
        Uuid::parse_str(&s).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e))
        })
    };
    Ok(Person {
        id: parse(r.get(0)?)?,
        data: PersonInput {
            name: r.get(1)?,
            cuit: r.get(2)?,
            code: r.get(3)?,
            email: r.get(4)?,
            phone: r.get(5)?,
            address: r.get(6)?,
        },
        role: r.get(7)?,
        revision: r.get(8)?,
        supplier_record_id: r.get::<_, Option<String>>(9)?.map(parse).transpose()?,
        client_active: r.get(10)?,
        supplier_active: r.get(11)?,
    })
}
const SELECT:&str="SELECT p.id,p.name,p.cuit,p.code,p.email,p.phone,p.address,p.role,p.revision,(SELECT m.id FROM management_records m WHERE m.kind='supplier' AND m.person_id=p.id ORDER BY m.id LIMIT 1),NOT EXISTS(SELECT 1 FROM entity_archives a WHERE a.kind='person:client' AND a.entity_id=p.id),NOT EXISTS(SELECT 1 FROM entity_archives a WHERE a.kind='person:supplier' AND a.entity_id=p.id) FROM persons p";
fn write_person(
    conn: &rusqlite::Connection,
    id: Uuid,
    role: &str,
    revision: u32,
    p: &PersonInput,
) -> Result<()> {
    valid_role(role)?;
    let key = tax_key(p.cuit.as_deref().unwrap_or(""));
    if !key.is_empty()
        && conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM persons WHERE tax_key=?1 AND id!=?2)",
            params![key, id.to_string()],
            |r| r.get::<_, bool>(0),
        )?
    {
        return Err(invalid(
            "Ya existe una persona con ese CUIT. Incorporala desde Clientes o Proveedores",
        ));
    }
    conn.execute("INSERT INTO persons(id,name,cuit,code,email,phone,address,role,revision,tax_key) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) ON CONFLICT(id) DO UPDATE SET name=excluded.name,cuit=excluded.cuit,code=excluded.code,email=excluded.email,phone=excluded.phone,address=excluded.address,role=excluded.role,revision=excluded.revision,tax_key=excluded.tax_key",params![id.to_string(),p.name.trim(),p.cuit.as_ref().filter(|s|!s.trim().is_empty()).map(|s|s.trim()),p.code.trim(),p.email.trim(),p.phone.trim(),p.address.trim(),role,revision,key])?;
    Ok(())
}
fn ensure_supplier(conn: &rusqlite::Connection, id: Uuid) -> Result<Option<Uuid>> {
    if conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM management_records WHERE kind='supplier' AND person_id=?1)",
        [id.to_string()],
        |r| r.get::<_, bool>(0),
    )? {
        return Ok(None);
    }
    let alias = if conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM management_records WHERE id=?1)",
        [id.to_string()],
        |r| r.get::<_, bool>(0),
    )? {
        Uuid::new_v4()
    } else {
        id
    };
    conn.execute("INSERT INTO management_records(id,kind,name,code,attributes_json,revision,person_id) VALUES(?1,'supplier','Persona','','{}',1,?2)",params![alias.to_string(),id.to_string()])?;
    Ok(Some(alias))
}
fn merge_legacy_person(conn: &rusqlite::Connection, from: Uuid, to: Uuid) -> Result<()> {
    if from == to {
        return Ok(());
    }
    conn.execute(
        "UPDATE projects SET client_id=?1 WHERE client_id=?2",
        params![to.to_string(), from.to_string()],
    )?;
    conn.execute(
        "UPDATE management_records SET client_id=?1 WHERE client_id=?2",
        params![to.to_string(), from.to_string()],
    )?;
    conn.execute(
        "UPDATE management_records SET person_id=?1 WHERE person_id=?2",
        params![to.to_string(), from.to_string()],
    )?;
    conn.execute(
        "UPDATE person_legacy_links SET person_id=?1 WHERE person_id=?2",
        params![to.to_string(), from.to_string()],
    )?;
    conn.execute("DELETE FROM persons WHERE id=?1", [from.to_string()])?;
    Ok(())
}
impl LocalStore {
    pub(crate) fn initialize_persons(&self) -> Result<()> {
        let conn = &self.conn;
        if conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM people_migration_state)",
            [],
            |r| r.get::<_, bool>(0),
        )? {
            return Ok(());
        }
        let clients: Vec<(String, String, Option<String>)> = conn
            .prepare("SELECT id,name,cuit FROM persons ORDER BY id")?
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
            .collect::<std::result::Result<_, _>>()?;
        let mut taxes = BTreeMap::<String, String>::new();
        for (id, name, cuit) in clients {
            let key = tax_key(cuit.as_deref().unwrap_or(""));
            let canonical = if !key.is_empty() {
                taxes.get(&key).cloned()
            } else {
                None
            };
            let target = canonical.clone().unwrap_or_else(|| id.clone());
            conn.execute("INSERT INTO person_legacy_links(id,source,legacy_id,person_id,original_json) VALUES(?1,'client',?2,?3,?4)",params![format!("client:{id}"),id,target,serde_json::json!({"id":id,"name":name,"cuit":cuit}).to_string()])?;
            if canonical.is_some() {
                conn.execute(
                    "UPDATE projects SET client_id=?1 WHERE client_id=?2",
                    params![target, id],
                )?;
                conn.execute(
                    "UPDATE management_records SET client_id=?1 WHERE client_id=?2",
                    params![target, id],
                )?;
                conn.execute("DELETE FROM persons WHERE id=?1", [id])?;
            } else {
                conn.execute(
                    "UPDATE persons SET tax_key=?1 WHERE id=?2",
                    params![key, id],
                )?;
                if !key.is_empty() {
                    taxes.insert(key, id);
                }
            }
        }
        let profile_ids:Vec<String>=conn.prepare("SELECT id FROM management_records WHERE kind='client_profile' AND client_id IS NOT NULL ORDER BY id")?.query_map([],|r|r.get(0))?.collect::<std::result::Result<_,_>>()?;
        for alias in profile_ids {
            let (client, name, code, json): (String, String, String, String) = conn.query_row(
                "SELECT client_id,name,code,attributes_json FROM management_records WHERE id=?1",
                [&alias],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
            )?;
            let attrs: BTreeMap<String, String> = serde_json::from_str(&json)?;
            let original=serde_json::json!({"id":alias,"client_id":client,"name":name,"code":code,"attributes":attrs}).to_string();
            let mut id = Uuid::parse_str(&client)?;
            let mut person = self
                .person(id)?
                .ok_or_else(|| invalid("Ficha antigua sin cliente"))?;
            if person
                .data
                .cuit
                .as_ref()
                .is_none_or(|s| s.trim().is_empty())
            {
                if let Some(cuit) = attrs.get("cuit").filter(|s| !tax_key(s).is_empty()) {
                    let key = tax_key(cuit);
                    if let Some(target) = taxes.get(&key).filter(|s| *s != &id.to_string()) {
                        let target = Uuid::parse_str(target)?;
                        merge_legacy_person(conn, id, target)?;
                        id = target;
                        person = self
                            .person(id)?
                            .ok_or_else(|| invalid("Cliente unificado inexistente"))?;
                    } else {
                        person.data.cuit = Some(cuit.clone());
                        taxes.insert(key, id.to_string());
                    }
                }
            }
            if person.data.code.is_empty() {
                person.data.code = code;
            }
            for (key, target) in [
                ("email", &mut person.data.email),
                ("phone", &mut person.data.phone),
                ("address", &mut person.data.address),
            ] {
                if target.is_empty() {
                    *target = attrs.get(key).cloned().unwrap_or_default();
                }
            }
            write_person(conn, id, &person.role, person.revision, &person.data)?;
            conn.execute("INSERT INTO person_legacy_links(id,source,legacy_id,person_id,original_json) VALUES(?1,'client_profile',?2,?3,?4)",params![format!("client_profile:{alias}"),alias,id.to_string(),original])?;
            conn.execute("UPDATE management_records SET person_id=?1,name='Persona',code='',attributes_json=json_remove(attributes_json,'$.cuit','$.email','$.phone','$.address') WHERE id=?2",params![id.to_string(),alias])?;
        }
        let suppliers:Vec<(String,String,String,String)>=conn.prepare("SELECT id,name,code,attributes_json FROM management_records WHERE kind='supplier' ORDER BY id")?.query_map([],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?)))?.collect::<std::result::Result<_,_>>()?;
        for (id, name, code, json) in suppliers {
            let a: BTreeMap<String, String> = serde_json::from_str(&json)?;
            let cuit = a.get("cuit").filter(|v| !v.trim().is_empty()).cloned();
            let key = tax_key(cuit.as_deref().unwrap_or(""));
            let found = if !key.is_empty() {
                taxes.get(&key).cloned()
            } else {
                None
            };
            let person_id = if let Some(found) = found {
                Uuid::parse_str(&found)?
            } else {
                let proposed = Uuid::parse_str(&id)?;
                if self.person(proposed)?.is_some() {
                    Uuid::new_v4()
                } else {
                    proposed
                }
            };
            let old = self.person(person_id)?;
            let mut data = old.as_ref().map(|p| p.data.clone()).unwrap_or(PersonInput {
                name: name.clone(),
                cuit,
                ..Default::default()
            });
            if data.code.is_empty() {
                data.code = code.clone();
            }
            for (key, target) in [
                ("email", &mut data.email),
                ("phone", &mut data.phone),
                ("address", &mut data.address),
            ] {
                if target.is_empty() {
                    *target = a.get(key).cloned().unwrap_or_default();
                }
            }
            let role = old
                .as_ref()
                .map_or("supplier".into(), |p| union(&p.role, "supplier"));
            write_person(conn, person_id, &role, old.map_or(1, |p| p.revision), &data)?;
            conn.execute("INSERT INTO person_legacy_links(id,source,legacy_id,person_id,original_json) VALUES(?1,'supplier',?2,?3,?4)",params![format!("supplier:{id}"),id,person_id.to_string(),serde_json::json!({"id":id,"name":name,"code":code,"attributes":a}).to_string()])?;
            conn.execute("UPDATE management_records SET person_id=?1,name='Persona',code='',attributes_json=json_remove(attributes_json,'$.cuit','$.email','$.phone','$.address') WHERE id=?2",params![person_id.to_string(),id])?;
            if !key.is_empty() {
                taxes.insert(key, person_id.to_string());
            }
        }
        conn.execute(
            "INSERT INTO people_migration_state(id) VALUES('initialized')",
            [],
        )?;
        Ok(())
    }
    pub fn person(&self, id: Uuid) -> Result<Option<Person>> {
        Ok(self
            .conn
            .query_row(
                &format!("{SELECT} WHERE p.id=?1"),
                [id.to_string()],
                row_person,
            )
            .optional()?)
    }
    pub fn persons(&self, role: &str) -> Result<Vec<Person>> {
        valid_role(role)?;
        let sql = if role == "both" {
            format!("{SELECT} WHERE p.role='both' ORDER BY p.name,p.id")
        } else {
            format!("{SELECT} WHERE p.role IN (?1,'both') ORDER BY p.name,p.id")
        };
        let mut q = self.conn.prepare(&sql)?;
        let result = if role == "both" {
            q.query_map([], row_person)?
                .collect::<std::result::Result<Vec<_>, _>>()?
        } else {
            q.query_map([role], row_person)?
                .collect::<std::result::Result<Vec<_>, _>>()?
        };
        Ok(result)
    }
    pub fn save_person(
        &mut self,
        id: Option<Uuid>,
        revision: u32,
        role: &str,
        data: &PersonInput,
    ) -> Result<Person> {
        valid_role(role)?;
        validate(data)?;
        let tx = rusqlite::Transaction::new_unchecked(
            &self.conn,
            rusqlite::TransactionBehavior::Immediate,
        )?;
        let id = id.unwrap_or_else(Uuid::new_v4);
        let old = self.person(id)?;
        if old.as_ref().map_or(0, |p| p.revision) != revision {
            return Err(invalid("El contacto cambió. Recargá antes de guardar"));
        }
        let role = old.as_ref().map_or(role.into(), |p| union(&p.role, role));
        let next = revision
            .checked_add(1)
            .ok_or_else(|| invalid("Revisión fuera de rango"))?;
        let mut data = data.clone();
        if old.is_none() && data.code.trim().is_empty() {
            data.code = crate::project_dashboard::next_code(&tx, "person", "PER-")?;
        }
        write_person(&tx, id, &role, next, &data)?;
        let created = if has(&role, "supplier") {
            ensure_supplier(&tx, id)?
        } else {
            None
        };
        tx.execute("UPDATE management_records SET revision=revision+1 WHERE kind IN ('supplier','client_profile') AND person_id=?1 AND id!=?2",params![id.to_string(),created.map(|i|i.to_string()).unwrap_or_default()])?;
        let saved = self
            .person(id)?
            .ok_or_else(|| invalid("Contacto inexistente"))?;
        tx.commit()?;
        Ok(saved)
    }
    pub fn add_person_role(&mut self, id: Uuid, revision: u32, role: &str) -> Result<Person> {
        let old = self
            .person(id)?
            .ok_or_else(|| invalid("Contacto inexistente"))?;
        self.save_person(Some(id), revision, role, &old.data)
    }
    pub(crate) fn save_client_person(&mut self, c: &cpobras_core::Client) -> Result<()> {
        let old = self.person(c.id)?;
        let mut data = old.as_ref().map(|p| p.data.clone()).unwrap_or_default();
        data.name = c.name.clone();
        data.cuit = c.cuit.clone();
        self.save_person(Some(c.id), old.map_or(0, |p| p.revision), "client", &data)?;
        Ok(())
    }
    pub(crate) fn save_supplier_person_record(
        &mut self,
        r: &ManagementRecord,
    ) -> Result<ManagementRecord> {
        let tx = rusqlite::Transaction::new_unchecked(
            &self.conn,
            rusqlite::TransactionBehavior::Immediate,
        )?;
        let alias: Option<(Option<String>, u32)> = tx
            .query_row(
                "SELECT person_id,revision FROM management_records WHERE id=?1",
                [r.id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        if alias.as_ref().map_or(0, |a| a.1) != r.revision {
            return Err(invalid("La ficha cambió; recargá antes de guardar"));
        }
        let linked = alias
            .and_then(|a| a.0)
            .map(|s| Uuid::parse_str(&s))
            .transpose()?;
        let key = tax_key(r.attributes.get("cuit").map(String::as_str).unwrap_or(""));
        let matched: Option<String> = if linked.is_none() && !key.is_empty() {
            tx.query_row("SELECT id FROM persons WHERE tax_key=?1", [key], |r| {
                r.get(0)
            })
            .optional()?
        } else {
            None
        };
        let linked = if r.kind == "client_profile" {
            r.client_id
        } else {
            linked
        };
        let id = linked
            .or(matched.map(|s| Uuid::parse_str(&s)).transpose()?)
            .unwrap_or(r.id);
        let old = self.person(id)?;
        let data = PersonInput {
            name: if r.kind == "client_profile" {
                old.as_ref()
                    .map(|p| p.data.name.clone())
                    .unwrap_or_else(|| r.name.clone())
            } else {
                r.name.clone()
            },
            cuit: if r.attributes.contains_key("cuit") {
                r.attributes.get("cuit").filter(|s| !s.is_empty()).cloned()
            } else {
                old.as_ref().and_then(|p| p.data.cuit.clone())
            },
            code: r.code.clone(),
            email: r.attributes.get("email").cloned().unwrap_or_else(|| {
                old.as_ref()
                    .map(|p| p.data.email.clone())
                    .unwrap_or_default()
            }),
            phone: r.attributes.get("phone").cloned().unwrap_or_else(|| {
                old.as_ref()
                    .map(|p| p.data.phone.clone())
                    .unwrap_or_default()
            }),
            address: r.attributes.get("address").cloned().unwrap_or_else(|| {
                old.as_ref()
                    .map(|p| p.data.address.clone())
                    .unwrap_or_default()
            }),
        };
        validate(&data)?;
        let wanted = if r.kind == "client_profile" {
            "client"
        } else {
            "supplier"
        };
        let role = old
            .as_ref()
            .map_or(wanted.into(), |p| union(&p.role, wanted));
        write_person(&tx, id, &role, old.map_or(1, |p| p.revision + 1), &data)?;
        let mut attrs = r.attributes.clone();
        for key in [
            "cuit",
            "email",
            "phone",
            "address",
            "person_id",
            "person_primary",
        ] {
            attrs.remove(key);
        }
        tx.execute("INSERT INTO management_records(id,kind,name,code,company_id,parent_id,project_id,client_id,attributes_json,revision,person_id) VALUES(?1,?9,'Persona','',?2,?3,?4,?5,?6,?7,?8) ON CONFLICT(id) DO UPDATE SET name='Persona',code='',company_id=excluded.company_id,parent_id=excluded.parent_id,project_id=excluded.project_id,client_id=excluded.client_id,attributes_json=excluded.attributes_json,revision=excluded.revision,person_id=excluded.person_id",params![r.id.to_string(),r.company_id.map(|x|x.to_string()),r.parent_id.map(|x|x.to_string()),r.project_id.map(|x|x.to_string()),r.client_id.map(|x|x.to_string()),serde_json::to_string(&attrs)?,r.revision+1,id.to_string(),r.kind])?;
        tx.execute("UPDATE management_records SET revision=revision+1 WHERE kind IN ('supplier','client_profile') AND person_id=?1 AND id!=?2",params![id.to_string(),r.id.to_string()])?;
        let saved = self
            .management_record(r.id)?
            .ok_or_else(|| invalid("Proveedor inexistente"))?;
        tx.commit()?;
        Ok(saved)
    }
    pub fn project_suppliers(&self, project: Uuid) -> Result<Vec<Uuid>> {
        let ids: Vec<String> = self
            .conn
            .prepare(
                "SELECT person_id FROM project_suppliers WHERE project_id=?1 ORDER BY person_id",
            )?
            .query_map([project.to_string()], |r| r.get(0))?
            .collect::<std::result::Result<_, _>>()?;
        ids.into_iter()
            .map(|s| Uuid::parse_str(&s).map_err(Into::into))
            .collect()
    }
    pub fn save_project_parties(
        &mut self,
        project: &cpobras_core::Project,
        organization: Uuid,
        suppliers: &[Uuid],
    ) -> Result<()> {
        if suppliers.len() > 1000
            || suppliers.iter().collect::<BTreeSet<_>>().len() != suppliers.len()
        {
            return Err(invalid("Selección de proveedores inválida"));
        }
        let tx = rusqlite::Transaction::new_unchecked(
            &self.conn,
            rusqlite::TransactionBehavior::Immediate,
        )?;
        if !self
            .person(project.client_id)?
            .is_some_and(|p| has(&p.role, "client"))
        {
            return Err(invalid("Seleccioná una persona habilitada como cliente"));
        }
        for id in suppliers {
            if !self.person(*id)?.is_some_and(|p| has(&p.role, "supplier")) {
                return Err(invalid("Seleccioná personas habilitadas como proveedoras"));
            }
        }
        for id in suppliers {
            let allowed:bool=tx.query_row("SELECT NOT EXISTS(SELECT 1 FROM entity_archives WHERE kind='person:supplier' AND entity_id=?1) OR EXISTS(SELECT 1 FROM project_suppliers WHERE project_id=?2 AND person_id=?1)",params![id.to_string(),project.id.to_string()],|r|r.get(0))?;
            if !allowed {
                return Err(invalid(
                    "El proveedor está dado de baja para nuevas vinculaciones",
                ));
            }
        }
        self.save_project_organization_inner(project, organization)?;
        tx.execute(
            "DELETE FROM project_suppliers WHERE project_id=?1",
            [project.id.to_string()],
        )?;
        for id in suppliers {
            tx.execute(
                "INSERT INTO project_suppliers(project_id,person_id) VALUES(?1,?2)",
                params![project.id.to_string(), id.to_string()],
            )?;
        }
        tx.commit()?;
        Ok(())
    }
    pub fn similar_persons(
        &self,
        input: &PersonInput,
        exclude: Option<Uuid>,
    ) -> Result<Vec<PersonMatch>> {
        if input.name.len() > 500
            || input.cuit.as_ref().is_some_and(|v| v.len() > 50)
            || input.email.len() > 1000
            || input.phone.len() > 1000
        {
            return Err(invalid("Búsqueda de contacto demasiado extensa"));
        }
        let all: Vec<Person> = self
            .conn
            .prepare(&format!("{SELECT} ORDER BY p.name,p.id"))?
            .query_map([], row_person)?
            .collect::<std::result::Result<_, _>>()?;
        let name = normalize(&input.name);
        let tax = tax_key(input.cuit.as_deref().unwrap_or(""));
        let email = input.email.trim().to_lowercase();
        let phone = tax_key(&input.phone);
        let mut out = vec![];
        for p in all {
            if Some(p.id) == exclude {
                continue;
            }
            let other = normalize(&p.data.name);
            let (score, reason) = if !tax.is_empty()
                && tax == tax_key(p.data.cuit.as_deref().unwrap_or(""))
            {
                (100, "Mismo CUIT")
            } else if !email.is_empty() && email == p.data.email.trim().to_lowercase() {
                (95, "Mismo correo")
            } else if phone.len() >= 6 && phone == tax_key(&p.data.phone) {
                (90, "Mismo teléfono")
            } else if name.len() >= 3 && name == other {
                (88, "Nombre coincidente")
            } else if name.len() >= 4 && other.len() >= 4 {
                let a: Vec<char> = name.chars().collect();
                let b: Vec<char> = other.chars().collect();
                let mut row: Vec<usize> = (0..=b.len()).collect();
                for (i, x) in a.iter().enumerate() {
                    let mut next = vec![i + 1];
                    for (j, y) in b.iter().enumerate() {
                        next.push(
                            (row[j + 1] + 1)
                                .min(next[j] + 1)
                                .min(row[j] + usize::from(x != y)),
                        );
                    }
                    row = next;
                }
                let similarity = 100usize.saturating_sub(row[b.len()] * 100 / a.len().max(b.len()));
                let at: BTreeSet<_> = name.split_whitespace().collect();
                let bt: BTreeSet<_> = other.split_whitespace().collect();
                let tokens = at.intersection(&bt).count() * 100 / at.union(&bt).count().max(1);
                let score = similarity.max(tokens);
                if score >= 72 {
                    (score as u32, "Nombre parecido")
                } else {
                    (0, "")
                }
            } else {
                (0, "")
            };
            if score > 0 {
                out.push(PersonMatch {
                    person: p,
                    score,
                    reason: reason.into(),
                });
            }
        }
        out.sort_by(|a, b| {
            b.score
                .cmp(&a.score)
                .then(a.person.data.name.cmp(&b.person.data.name))
        });
        out.truncate(8);
        Ok(out)
    }
}
