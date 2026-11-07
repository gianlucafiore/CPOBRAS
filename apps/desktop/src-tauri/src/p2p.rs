//! Authenticated read-only project replication over iroh's encrypted QUIC and relay fallback.
use crate::{backups::now, Db};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use iroh::{endpoint::presets, Endpoint, EndpointAddr, SecretKey};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};
use tauri::Manager;
use uuid::Uuid;
type Result<T> = std::result::Result<T, String>;
const ALPN: &[u8] = b"cpobras/read-only-project/1";
const MAX_SNAPSHOT: usize = 32 * 1024 * 1024;
#[derive(Clone, Serialize, Deserialize)]
struct Grant {
    id: Uuid,
    project_id: Uuid,
    label: String,
    token_hash: String,
    peer: Option<String>,
    revoked: bool,
    last_seen: Option<u64>,
}
#[derive(Clone, Serialize, Deserialize)]
struct Subscription {
    id: Uuid,
    ticket: Ticket,
    name: String,
    last_sync: Option<u64>,
    last_checked: Option<u64>,
    error: Option<String>,
    revoked: bool,
    revision: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
struct Saved {
    key: [u8; 32],
    enabled: bool,
    grants: Vec<Grant>,
    subscriptions: Vec<Subscription>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Ticket {
    version: u32,
    owner: EndpointAddr,
    project_id: Uuid,
    grant_id: Uuid,
    token: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    version: u32,
    grant_id: Uuid,
    token: String,
    known: Option<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
enum Response {
    Snapshot { revision: String, data: Value },
    Unchanged,
    Denied,
    Failed { message: String },
}
#[derive(Serialize, Deserialize)]
struct Cached {
    owner: String,
    project_id: Uuid,
    revision: String,
    received_at: u64,
    data: Value,
}
pub(crate) struct P2p {
    #[cfg(test)]
    local_only: bool,
    #[cfg(test)]
    relay: Option<iroh::RelayUrl>,
    root: PathBuf,
    saved: Mutex<Saved>,
    endpoint: tokio::sync::Mutex<Option<Endpoint>>,
    sync: tokio::sync::Mutex<()>,
    network_error: Mutex<Option<String>>,
}
fn hash(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}
fn atomic_json(path: &Path, value: &impl Serialize) -> Result<()> {
    use std::io::Write;
    let mut file = tempfile::Builder::new()
        .prefix(".p2p-")
        .tempfile_in(path.parent().ok_or("Carpeta inválida")?)
        .map_err(|e| e.to_string())?;
    serde_json::to_writer(&mut file, value).map_err(|e| e.to_string())?;
    file.flush().map_err(|e| e.to_string())?;
    file.as_file().sync_all().map_err(|e| e.to_string())?;
    file.persist(path).map_err(|e| e.to_string())?;
    Ok(())
}
fn lock<T>(m: &Mutex<T>) -> Result<std::sync::MutexGuard<'_, T>> {
    m.lock().map_err(|e| e.to_string())
}
impl P2p {
    pub fn load(root: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(root.join("received")).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700))
                .map_err(|e| e.to_string())?;
        }
        let path = root.join("connections.json");
        let saved = if path.exists() {
            serde_json::from_slice(&std::fs::read(&path).map_err(|e|e.to_string())?).map_err(|_|"No se pudo leer la configuración P2P. Conservá la carpeta de datos para recuperar las vinculaciones".to_string())?
        } else {
            let saved = Saved {
                key: SecretKey::generate().to_bytes(),
                enabled: false,
                grants: vec![],
                subscriptions: vec![],
            };
            atomic_json(&path, &saved)?;
            saved
        };
        Ok(Self {
            #[cfg(test)]
            local_only: false,
            #[cfg(test)]
            relay: None,
            root,
            saved: Mutex::new(saved),
            endpoint: tokio::sync::Mutex::new(None),
            sync: tokio::sync::Mutex::new(()),
            network_error: Mutex::new(None),
        })
    }
    fn persist(&self, s: &Saved) -> Result<()> {
        atomic_json(&self.root.join("connections.json"), s)
    }
    fn cache_path(&self, id: Uuid) -> PathBuf {
        self.root.join("received").join(format!("{id}.json"))
    }
    pub fn status(&self) -> Result<Value> {
        let saved = lock(&self.saved)?;
        Ok(
            json!({"enabled":saved.enabled,"peer_id":SecretKey::from_bytes(&saved.key).public().to_string(),"network_error":*lock(&self.network_error)?,"shares":saved.grants.iter().map(|g|json!({"id":g.id,"project_id":g.project_id,"label":g.label,"peer":g.peer,"revoked":g.revoked,"last_seen":g.last_seen})).collect::<Vec<_>>(),"subscriptions":saved.subscriptions.iter().map(|s|json!({"id":s.id,"name":s.name,"owner":s.ticket.owner.id.to_string(),"project_id":s.ticket.project_id,"last_sync":s.last_sync,"last_checked":s.last_checked,"error":s.error,"revoked":s.revoked,"has_snapshot":self.cache_path(s.id).is_file()})).collect::<Vec<_>>()}),
        )
    }
    pub async fn set_enabled<R: tauri::Runtime>(
        &self,
        app: &tauri::AppHandle<R>,
        enabled: bool,
    ) -> Result<Value> {
        {
            let mut saved = lock(&self.saved)?;
            let mut next = saved.clone();
            next.enabled = enabled;
            self.persist(&next)?;
            *saved = next;
        }
        if enabled {
            self.endpoint(app).await?;
        } else {
            if let Some(ep) = self.endpoint.lock().await.take() {
                ep.close().await;
            }
        }
        self.status()
    }
    async fn endpoint<R: tauri::Runtime>(&self, app: &tauri::AppHandle<R>) -> Result<Endpoint> {
        let mut slot = self.endpoint.lock().await;
        if let Some(e) = slot.as_ref() {
            return Ok(e.clone());
        }
        let key = lock(&self.saved)?.key;
        let builder = Endpoint::builder(presets::N0);
        #[cfg(test)]
        let builder = if self.local_only {
            Endpoint::builder(presets::Minimal).relay_mode(iroh::RelayMode::Disabled)
        } else {
            builder
        };
        #[cfg(test)]
        let builder = if let Some(relay) = self.relay.clone() {
            Endpoint::builder(presets::Minimal)
                .clear_ip_transports()
                .relay_mode(iroh::RelayMode::custom([relay]))
        } else {
            builder
        };
        let endpoint = builder
            .secret_key(SecretKey::from_bytes(&key))
            .alpns(vec![ALPN.to_vec()])
            .bind()
            .await
            .map_err(|e| format!("No se pudo iniciar la conexión P2P: {e}"))?;
        let listener = endpoint.clone();
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let slots = std::sync::Arc::new(tokio::sync::Semaphore::new(8));
            while let Some(incoming) = listener.accept().await {
                let Ok(permit) = slots.clone().try_acquire_owned() else {
                    incoming.refuse();
                    continue;
                };
                let handle = handle.clone();
                tauri::async_runtime::spawn(async move {
                    let _permit = permit;
                    let _ = tokio::time::timeout(Duration::from_secs(40), async {
                        let connection = incoming.await.map_err(|e| e.to_string())?;
                        let (mut send, mut recv) =
                            connection.accept_bi().await.map_err(|e| e.to_string())?;
                        let bytes = recv.read_to_end(4096).await.map_err(|e| e.to_string())?;
                        let req: Request =
                            serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
                        let p2p = handle.state::<P2p>();
                        let response =
                            p2p.respond(&handle, connection.remote_id().to_string(), req);
                        let bytes = serde_json::to_vec(&response).map_err(|e| e.to_string())?;
                        send.write_all(&bytes).await.map_err(|e| e.to_string())?;
                        send.finish().map_err(|e| e.to_string())?;
                        let _ = tokio::time::timeout(Duration::from_secs(10), connection.closed())
                            .await;
                        Ok::<(), String>(())
                    })
                    .await;
                });
            }
        });
        *slot = Some(endpoint.clone());
        Ok(endpoint)
    }
    fn respond<R: tauri::Runtime>(
        &self,
        app: &tauri::AppHandle<R>,
        peer: String,
        req: Request,
    ) -> Response {
        match self.authorized_snapshot(app, &peer, &req) {
            Ok(Some((revision, data))) => Response::Snapshot { revision, data },
            Ok(None) => Response::Unchanged,
            Err(e) if e == "denied" => Response::Denied,
            Err(message) => Response::Failed { message },
        }
    }
    fn authorized_snapshot<R: tauri::Runtime>(
        &self,
        app: &tauri::AppHandle<R>,
        peer: &str,
        req: &Request,
    ) -> Result<Option<(String, Value)>> {
        // Hold the grant lock until the response is prepared: revocation cannot race with authorization.
        let mut saved = lock(&self.saved)?;
        if !saved.enabled || req.version != 1 || req.token.len() != 64 {
            return Err("denied".into());
        }
        let grant = saved
            .grants
            .iter_mut()
            .find(|g| g.id == req.grant_id && !g.revoked)
            .ok_or("denied")?;
        if grant.token_hash != hash(req.token.as_bytes())
            || grant.peer.as_deref().is_some_and(|p| p != peer)
        {
            return Err("denied".into());
        }
        let date = chrono::DateTime::from_timestamp(now() as i64, 0)
            .ok_or("Fecha inválida")?
            .format("%Y-%m-%d")
            .to_string();
        let data = app
            .state::<Db>()
            .lock()
            .map_err(|e| e.to_string())?
            .shared_project_document(grant.project_id, &date)
            .map_err(|e| e.to_string())?;
        let bytes = serde_json::to_vec(&data).map_err(|e| e.to_string())?;
        if bytes.len() > MAX_SNAPSHOT - 1024 {
            return Err("La obra supera el tamaño admitido para compartir (32 MB)".into());
        }
        let revision = hash(&bytes);
        grant.peer = Some(peer.into());
        grant.last_seen = Some(now());
        self.persist(&saved)?;
        Ok((req.known.as_deref() != Some(&revision)).then_some((revision, data)))
    }
    pub async fn invite<R: tauri::Runtime>(
        &self,
        app: &tauri::AppHandle<R>,
        project_id: Uuid,
        label: String,
    ) -> Result<Value> {
        if label.trim().is_empty() || label.len() > 200 {
            return Err("Indicá para quién es la invitación".into());
        }
        {
            let db = app.state::<Db>();
            let store = db.lock().map_err(|e| e.to_string())?;
            if store
                .get_project(project_id)
                .map_err(|e| e.to_string())?
                .is_none()
                || store
                    .project_organization(project_id)
                    .map_err(|e| e.to_string())?
                    .ownership
                    != "own"
            {
                return Err("Elegí una obra propia".into());
            }
        }
        self.set_enabled(app, true).await?;
        let endpoint = self.endpoint(app).await?;
        // A relay address is needed for a ticket to work from a different network.
        tokio::time::timeout(Duration::from_secs(15), endpoint.online())
            .await
            .map_err(|_| {
                "No se pudo contactar el relay de Internet. Revisá la conexión e intentá nuevamente"
                    .to_string()
            })?;
        let owner = endpoint.addr();
        if owner.relay_urls().next().is_none() {
            return Err(
                "Todavía no hay una dirección de relay disponible. Volvé a intentar".into(),
            );
        }
        let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        let grant = Grant {
            id: Uuid::new_v4(),
            project_id,
            label: label.trim().into(),
            token_hash: hash(token.as_bytes()),
            peer: None,
            revoked: false,
            last_seen: None,
        };
        let ticket = Ticket {
            version: 1,
            owner,
            project_id,
            grant_id: grant.id,
            token,
        };
        let invitation = encode_ticket(&ticket)?;
        let mut saved = lock(&self.saved)?;
        if saved.grants.len() >= 1000 {
            return Err("Se alcanzó el límite de invitaciones".into());
        }
        let mut next = saved.clone();
        next.grants.push(grant);
        self.persist(&next)?;
        *saved = next;
        Ok(json!({"invitation":invitation}))
    }
    pub async fn join<R: tauri::Runtime>(
        &self,
        app: &tauri::AppHandle<R>,
        invitation: &str,
    ) -> Result<Value> {
        let ticket = parse_ticket(invitation)?;
        let id = {
            let mut saved = lock(&self.saved)?;
            if ticket.owner.id == SecretKey::from_bytes(&saved.key).public() {
                return Err("Esta invitación pertenece a este mismo equipo".into());
            }
            if saved.subscriptions.iter().any(|s| {
                s.ticket.owner.id == ticket.owner.id && s.ticket.grant_id == ticket.grant_id
            }) {
                return Err("La invitación ya está vinculada".into());
            }
            if saved.subscriptions.len() >= 100 {
                return Err("Se alcanzó el límite de obras vinculadas".into());
            }
            let id = Uuid::new_v4();
            let mut next = saved.clone();
            next.subscriptions.push(Subscription {
                id,
                ticket,
                name: "Obra pendiente de recibir".into(),
                last_sync: None,
                last_checked: None,
                error: None,
                revoked: false,
                revision: None,
            });
            next.enabled = true;
            self.persist(&next)?;
            *saved = next;
            id
        };
        self.endpoint(app).await?;
        let _guard = self.sync.lock().await;
        self.sync_one(app, id).await;
        self.status()
    }
    pub fn revoke(&self, id: Uuid) -> Result<Value> {
        let mut saved = lock(&self.saved)?;
        let mut next = saved.clone();
        next.grants
            .iter_mut()
            .find(|g| g.id == id)
            .ok_or("Invitación inexistente")?
            .revoked = true;
        self.persist(&next)?;
        *saved = next;
        drop(saved);
        self.status()
    }
    pub fn forget(&self, id: Uuid) -> Result<Value> {
        let mut saved = lock(&self.saved)?;
        let mut next = saved.clone();
        next.subscriptions.retain(|s| s.id != id);
        self.persist(&next)?;
        *saved = next;
        let path = self.cache_path(id);
        if path.exists() {
            std::fs::remove_file(path).map_err(|e| e.to_string())?;
        }
        drop(saved);
        self.status()
    }
    pub fn read(&self, id: Uuid) -> Result<Value> {
        let saved = lock(&self.saved)?;
        let sub = saved
            .subscriptions
            .iter()
            .find(|s| s.id == id)
            .ok_or("Vinculación inexistente")?;
        let bytes = std::fs::read(self.cache_path(id)).map_err(|_| {
            "La obra todavía no se recibió. Actualizá cuando el propietario esté conectado"
                .to_string()
        })?;
        if bytes.len() > MAX_SNAPSHOT {
            return Err("Copia recibida demasiado grande".into());
        }
        let cached: Cached = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        if cached.owner != sub.ticket.owner.id.to_string()
            || cached.project_id != sub.ticket.project_id
        {
            return Err("Origen de la copia inválido".into());
        }
        Ok(
            json!({"data":cached.data,"received_at":cached.received_at,"owner":cached.owner,"read_only":true,"revoked":sub.revoked,"error":sub.error}),
        )
    }
    pub async fn sync_all<R: tauri::Runtime>(&self, app: &tauri::AppHandle<R>) -> Result<Value> {
        let _guard = self
            .sync
            .try_lock()
            .map_err(|_| "Ya hay una actualización en curso")?;
        if !lock(&self.saved)?.enabled {
            return self.status();
        }
        self.endpoint(app).await?;
        let ids = lock(&self.saved)?
            .subscriptions
            .iter()
            .filter(|s| !s.revoked)
            .map(|s| s.id)
            .collect::<Vec<_>>();
        // Each connection has its own timeout; cached copies remain available throughout.
        for id in ids {
            self.sync_one(app, id).await;
        }
        self.status()
    }
    async fn sync_one<R: tauri::Runtime>(&self, app: &tauri::AppHandle<R>, id: Uuid) {
        let sub = match lock(&self.saved)
            .ok()
            .and_then(|s| s.subscriptions.iter().find(|s| s.id == id).cloned())
        {
            Some(s) => s,
            None => return,
        };
        let result = tokio::time::timeout(Duration::from_secs(25), self.fetch(app, &sub))
            .await
            .unwrap_or_else(|_| {
                Err(
                    "El propietario no está disponible. Se conserva la última copia recibida"
                        .into(),
                )
            });
        if let Ok(mut saved) = lock(&self.saved) {
            if let Some(s) = saved.subscriptions.iter_mut().find(|s| s.id == id) {
                s.last_checked = Some(now());
                match result {
                    Ok(Some((revision, name))) => {
                        s.last_sync = Some(now());
                        s.revision = Some(revision);
                        s.name = name;
                        s.error = None;
                    }
                    Ok(None) => s.error = None,
                    Err(error) => {
                        if error == "Acceso revocado o invitación utilizada por otro equipo" {
                            s.revoked = true;
                        }
                        s.error = Some(error);
                    }
                }
                let _ = self.persist(&saved);
            }
        }
    }
    async fn fetch<R: tauri::Runtime>(
        &self,
        app: &tauri::AppHandle<R>,
        sub: &Subscription,
    ) -> Result<Option<(String, String)>> {
        let endpoint = self.endpoint(app).await?;
        let connection = endpoint
            .connect(sub.ticket.owner.clone(), ALPN)
            .await
            .map_err(|_| {
                "No se pudo conectar con el propietario. Se conserva la última copia recibida"
                    .to_string()
            })?;
        let (mut send, mut recv) = connection.open_bi().await.map_err(|e| e.to_string())?;
        let request = Request {
            version: 1,
            grant_id: sub.ticket.grant_id,
            token: sub.ticket.token.clone(),
            known: sub.revision.clone(),
        };
        send.write_all(&serde_json::to_vec(&request).map_err(|e| e.to_string())?)
            .await
            .map_err(|e| e.to_string())?;
        send.finish().map_err(|e| e.to_string())?;
        let bytes = recv
            .read_to_end(MAX_SNAPSHOT)
            .await
            .map_err(|e| e.to_string())?;
        let response: Response = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        connection.close(0u32.into(), b"received");
        match response {
            Response::Denied => {
                Err("Acceso revocado o invitación utilizada por otro equipo".into())
            }
            Response::Failed { message } => Err(message),
            Response::Unchanged => Ok(None),
            Response::Snapshot { revision, data } => {
                validate_snapshot(&data, sub.ticket.project_id)?;
                if revision != hash(&serde_json::to_vec(&data).map_err(|e| e.to_string())?) {
                    return Err("La copia recibida no coincide con su revisión".into());
                }
                let name = data["project"]["name"]
                    .as_str()
                    .ok_or("Falta el nombre de la obra")?
                    .to_string();
                // Imported content is isolated from editable projects. Only the public organization is mirrored.
                let org: cpobras_storage::organizations::Organization =
                    serde_json::from_value(data["organization"].clone())
                        .map_err(|e| e.to_string())?;
                let mut profile = org.profile;
                if profile.company_name.trim().is_empty()
                    && profile.professional_name.trim().is_empty()
                {
                    profile.company_name = org.name.clone();
                }
                let owner = sub.ticket.owner.id.to_string();
                let local_id = external_org_id(&owner, org.id);
                {
                    let db = app.state::<Db>();
                    let mut store = db.lock().map_err(|e| e.to_string())?;
                    let revision = org.revision.checked_add(1).ok_or("Revisión inválida")?;
                    if store
                        .organizations()
                        .map_err(|e| e.to_string())?
                        .iter()
                        .find(|o| o.id == local_id)
                        .is_none_or(|o| o.revision < revision)
                    {
                        store
                            .apply_external_organization_snapshot(
                                local_id, &owner, revision, &org.name, &profile,
                            )
                            .map_err(|e| e.to_string())?;
                    }
                }
                let saved = lock(&self.saved)?;
                if !saved.enabled || !saved.subscriptions.iter().any(|s| s.id == sub.id) {
                    return Err("Vinculación eliminada o pausada".into());
                }
                atomic_json(
                    &self.cache_path(sub.id),
                    &Cached {
                        owner,
                        project_id: sub.ticket.project_id,
                        revision: revision.clone(),
                        received_at: now(),
                        data,
                    },
                )?;
                Ok(Some((revision, name)))
            }
        }
    }
}
fn encode_ticket(ticket: &Ticket) -> Result<String> {
    Ok(format!(
        "cpobras1:{}",
        URL_SAFE_NO_PAD.encode(serde_json::to_vec(ticket).map_err(|e| e.to_string())?)
    ))
}
fn parse_ticket(invitation: &str) -> Result<Ticket> {
    if invitation.len() > 16000 {
        return Err("Invitación demasiado larga".into());
    }
    let bytes = URL_SAFE_NO_PAD
        .decode(
            invitation
                .trim()
                .strip_prefix("cpobras1:")
                .ok_or("Pegá una invitación de CPOBRAS")?,
        )
        .map_err(|_| "Invitación inválida")?;
    let ticket: Ticket =
        serde_json::from_slice(&bytes).map_err(|_| "Invitación inválida".to_string())?;
    if ticket.version != 1
        || ticket.token.len() != 64
        || !ticket.token.bytes().all(|b| b.is_ascii_hexdigit())
        || ticket.owner.addrs.len() > 16
    {
        return Err("Versión o datos de invitación no admitidos".into());
    }
    Ok(ticket)
}
fn validate_snapshot(data: &Value, project_id: Uuid) -> Result<()> {
    if data["version"] != 1
        || data["project"]["id"] != project_id.to_string()
        || data["project"]["name"]
            .as_str()
            .is_none_or(|s| s.is_empty() || s.len() > 500)
    {
        return Err("La copia recibida no corresponde a la obra invitada".into());
    }
    for field in [
        "budgets",
        "records",
        "operations",
        "parties",
        "warehouses",
        "stock",
    ] {
        if data[field].as_array().is_none_or(|a| a.len() > 100000) {
            return Err("Contenido de obra inválido".into());
        }
    }
    for budget in data["budgets"].as_array().unwrap() {
        if budget["estimate"]["project_id"] != project_id.to_string() {
            return Err("El presupuesto pertenece a otra obra".into());
        }
    }
    let _: cpobras_storage::organizations::Organization =
        serde_json::from_value(data["organization"].clone()).map_err(|e| e.to_string())?;
    Ok(())
}
fn external_org_id(owner: &str, id: Uuid) -> Uuid {
    let b = Sha256::digest(format!("cpobras-org:{owner}:{id}").as_bytes());
    let mut bytes: [u8; 16] = b[..16].try_into().unwrap();
    bytes[6] = (bytes[6] & 15) | 0x50;
    bytes[8] = (bytes[8] & 63) | 0x80;
    Uuid::from_bytes(bytes)
}
pub(crate) fn start_worker<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    tauri::async_runtime::spawn(async move {
        loop {
            let p = app.state::<P2p>();
            if lock(&p.saved).map(|s| s.enabled).unwrap_or(false) {
                let result = p.sync_all(&app).await;
                if let Ok(mut e) = lock(&p.network_error) {
                    *e = result.err();
                }
            }
            tokio::time::sleep(Duration::from_secs(30)).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use cpobras_core::{Client, Currency, Project};
    use cpobras_storage::LocalStore;
    fn app() -> (
        tempfile::TempDir,
        tauri::App<tauri::test::MockRuntime>,
        Project,
    ) {
        app_with_relay(None)
    }
    fn app_with_relay(
        relay: Option<iroh::RelayUrl>,
    ) -> (
        tempfile::TempDir,
        tauri::App<tauri::test::MockRuntime>,
        Project,
    ) {
        let temp = tempfile::tempdir().unwrap();
        let mut store = LocalStore::in_memory().unwrap();
        let c = Client {
            id: Uuid::new_v4(),
            name: "Comitente".into(),
            cuit: None,
        };
        store.save_client(&c).unwrap();
        let project = Project {
            id: Uuid::new_v4(),
            client_id: c.id,
            name: "Obra compartida".into(),
            currency: Currency::Ars,
        };
        store.save_project(&project).unwrap();
        let mut p = P2p::load(temp.path().join("p2p")).unwrap();
        p.local_only = true;
        p.relay = relay;
        let app = crate::configure(tauri::test::mock_builder())
            .manage(Mutex::new(store))
            .manage(p)
            .build(tauri::generate_context!())
            .unwrap();
        (temp, app, project)
    }
    #[test]
    fn encrypted_read_only_replication_pairs_revokes_and_keeps_an_offline_copy() {
        let (_temp, owner, project) = app();
        let (_temp2, observer, _) = app();
        let (_temp3, other, _) = app();
        tauri::async_runtime::block_on(async {
            let o = owner.state::<P2p>();
            let p = observer.state::<P2p>();
            o.set_enabled(owner.handle(), true).await.unwrap();
            let ep = o.endpoint(owner.handle()).await.unwrap();
            let socket = ep
                .bound_sockets()
                .into_iter()
                .find(|a| a.is_ipv4())
                .unwrap();
            let owner_addr = EndpointAddr::new(ep.id())
                .with_ip_addr(std::net::SocketAddr::from(([127, 0, 0, 1], socket.port())));
            let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
            let grant_id = Uuid::new_v4();
            {
                let mut s = lock(&o.saved).unwrap();
                s.grants.push(Grant {
                    id: grant_id,
                    project_id: project.id,
                    label: "Observador".into(),
                    token_hash: hash(token.as_bytes()),
                    peer: None,
                    revoked: false,
                    last_seen: None,
                });
                o.persist(&s).unwrap();
            }
            let ticket = Ticket {
                version: 1,
                owner: owner_addr,
                project_id: project.id,
                grant_id,
                token,
            };
            let invitation = encode_ticket(&ticket).unwrap();
            p.join(observer.handle(), &invitation).await.unwrap();
            let sub = lock(&p.saved).unwrap().subscriptions[0].clone();
            assert!(sub.error.is_none(), "{:?}", sub.error);
            assert!(sub.last_sync.is_some());
            let first = p.read(sub.id).unwrap();
            assert_eq!(first["data"]["project"]["name"], "Obra compartida");
            assert_eq!(first["read_only"], true);
            assert!(observer
                .state::<Db>()
                .lock()
                .unwrap()
                .get_project(project.id)
                .unwrap()
                .is_none());
            assert!(observer
                .state::<Db>()
                .lock()
                .unwrap()
                .organizations()
                .unwrap()
                .iter()
                .any(|o| o.ownership == "external"));
            let current = lock(&o.saved).unwrap().grants[0].clone();
            assert_eq!(
                current.peer,
                Some(
                    SecretKey::from_bytes(&lock(&p.saved).unwrap().key)
                        .public()
                        .to_string()
                )
            );
            // Same invitation cannot be claimed by a second device.
            let outsider = other.state::<P2p>();
            outsider.join(other.handle(), &invitation).await.unwrap();
            assert!(lock(&outsider.saved).unwrap().subscriptions[0].revoked);
            {
                let db = owner.state::<Db>();
                let s = db.lock().unwrap();
                s.save_project(&Project {
                    name: "Obra actualizada".into(),
                    ..project.clone()
                })
                .unwrap();
            }
            p.sync_all(observer.handle()).await.unwrap();
            assert_eq!(
                p.read(sub.id).unwrap()["data"]["project"]["name"],
                "Obra actualizada"
            );
            let path = p.cache_path(sub.id);
            let modified = std::fs::metadata(&path).unwrap().modified().unwrap();
            p.sync_all(observer.handle()).await.unwrap();
            assert_eq!(
                std::fs::metadata(&path).unwrap().modified().unwrap(),
                modified
            );
            o.revoke(grant_id).unwrap();
            p.sync_all(observer.handle()).await.unwrap();
            assert!(p.read(sub.id).unwrap()["revoked"].as_bool().unwrap());
            {
                let db = owner.state::<Db>();
                db.lock()
                    .unwrap()
                    .save_project(&Project {
                        name: "Cambio después de revocar".into(),
                        ..project.clone()
                    })
                    .unwrap();
            }
            p.sync_all(observer.handle()).await.unwrap();
            assert_eq!(
                p.read(sub.id).unwrap()["data"]["project"]["name"],
                "Obra actualizada"
            );
            o.set_enabled(owner.handle(), false).await.unwrap();
            p.set_enabled(observer.handle(), false).await.unwrap();
            outsider.set_enabled(other.handle(), false).await.unwrap();
            let reopened = P2p::load(p.root.clone()).unwrap();
            assert_eq!(
                reopened.read(sub.id).unwrap()["data"]["project"]["name"],
                "Obra actualizada"
            );
            p.forget(sub.id).unwrap();
            assert!(!path.exists());
            assert!(p.read(sub.id).is_err());
        });
    }
    #[test]
    fn invitation_and_replication_work_through_a_relay_without_direct_ip_connections() {
        tauri::async_runtime::block_on(async {
            let mut config = iroh_relay::server::ServerConfig::default();
            config.relay = Some(iroh_relay::server::RelayConfig::new(
                std::net::SocketAddr::from(([127, 0, 0, 1], 0)),
            ));
            let server = iroh_relay::server::Server::spawn(config).await.unwrap();
            let url: iroh::RelayUrl = format!("http://{}", server.http_addr().unwrap())
                .parse()
                .unwrap();
            let (_a, owner, project) = app_with_relay(Some(url.clone()));
            let (_b, observer, _) = app_with_relay(Some(url));
            let o = owner.state::<P2p>();
            let p = observer.state::<P2p>();
            let invitation = o
                .invite(owner.handle(), project.id, "Observador por relay".into())
                .await
                .unwrap();
            assert!(o
                .endpoint(owner.handle())
                .await
                .unwrap()
                .bound_sockets()
                .is_empty());
            p.join(
                observer.handle(),
                invitation["invitation"].as_str().unwrap(),
            )
            .await
            .unwrap();
            let sub = lock(&p.saved).unwrap().subscriptions[0].clone();
            assert!(sub.error.is_none(), "{:?}", sub.error);
            assert_eq!(
                p.read(sub.id).unwrap()["data"]["project"]["name"],
                "Obra compartida"
            );
            assert!(p
                .endpoint(observer.handle())
                .await
                .unwrap()
                .bound_sockets()
                .is_empty());
            o.set_enabled(owner.handle(), false).await.unwrap();
            p.set_enabled(observer.handle(), false).await.unwrap();
            server.shutdown().await.unwrap();
        });
    }
    #[test]
    fn tickets_and_remote_snapshots_reject_invalid_versions_and_cross_project_content() {
        assert!(parse_ticket("not a ticket").is_err());
        assert!(parse_ticket(&"x".repeat(17000)).is_err());
        let (_tmp, app, project) = app();
        let mut document = app
            .state::<Db>()
            .lock()
            .unwrap()
            .shared_project_document(project.id, "2026-11-07")
            .unwrap();
        assert!(validate_snapshot(&document, project.id).is_ok());
        assert!(validate_snapshot(&document, Uuid::new_v4()).is_err());
        document["budgets"] = json!([{"estimate":{"project_id":Uuid::new_v4()}}]);
        assert!(validate_snapshot(&document, project.id).is_err());
    }
    #[test]
    fn status_never_discloses_tokens_or_private_keys_and_read_only_changes_are_not_supported() {
        let (_temp, app, project) = app();
        let p = app.state::<P2p>();
        let req = Request {
            version: 1,
            grant_id: Uuid::new_v4(),
            token: "0".repeat(64),
            known: None,
        };
        assert!(matches!(
            p.respond(app.handle(), "intruder".into(), req),
            Response::Denied
        ));
        assert!(serde_json::from_value::<Request>(json!({"version":1,"grant_id":Uuid::new_v4(),"token":"0".repeat(64),"known":null,"edit_project":project})).is_err());
        let status = p.status().unwrap();
        assert!(status.get("key").is_none());
        assert!(status.get("token").is_none());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(p.root.join("connections.json"))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
    }
}
