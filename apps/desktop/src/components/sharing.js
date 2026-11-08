import { e, field, select } from "./helpers.js";
import {permissionLabels,allPermissions} from "../services/remote-workspace.js";
const when = (t) =>
  t ? new Date(t * 1000).toLocaleString("es-AR") : "Todavía sin conexión";
const table = (heads, rows) =>
  `<div class="sharing-scroll"><table class="data-grid"><thead><tr>${heads.map((h) => `<th>${e(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${heads.length}">Sin registros.</td></tr>`}</tbody></table></div>`;
const cells = (values) =>
  `<tr>${values.map((v) => `<td>${e(v ?? "")}</td>`).join("")}</tr>`;
export function createSharing({
  invoke,
  state,
  render,
  document,
  window,
  FormData,
  loadCollections,
  openExternalProject,
  refreshExternalSession,
}) {
  const m = {
    status: { shares: [], subscriptions: [], enabled: false },
    invitation: "",
    copyMessage: "",
    access:null,
    error: "",
  };
  const permissionFields=(permissions)=>`<fieldset class="sharing-permissions"><legend>Podrá consultar (siempre solo lectura)</legend>${Object.entries(permissionLabels).map(([key,label])=>`<label><input type="checkbox" name="allow-${key}" ${permissions[key]!==false?'checked':''}>${e(label)}</label>`).join('')}</fieldset>`;
  const readPermissions=data=>Object.fromEntries(Object.keys(permissionLabels).map(k=>[k,data.get('allow-'+k)==='on']));
  function overview() {
    const s = m.status;
    return `<main class="feature-page sharing-page"><div class="feature-toolbar"><h1>Vinculación P2P</h1><button class="btn" data-action="share-refresh">Actualizar estado</button><button class="btn" data-action="share-sync">Buscar cambios</button><button class="btn" data-action="share-toggle">${s.enabled ? "Pausar conexiones" : "Activar conexiones"}</button></div>
  <p>Compartí una obra por Internet con un observador de solo lectura. Los dos equipos deben tener CPOBRAS abierto para recibir cambios. Si el propietario está desconectado, sigue disponible la última copia recibida.</p>
  <p><strong>Conexiones ${s.enabled ? "activas" : "pausadas"}</strong> · Actualización automática cada 30 segundos. La conexión está cifrada y permite vincular equipos de redes distintas.</p>${s.network_error ? `<p class="feature-error" role="status">${e(s.network_error)}</p>` : ""}
  <div class="sharing-columns"><section class="feature-editor"><h2>Compartir una obra propia</h2><form id="p2p-invite-form">${select(
    "Obra para compartir",
    "shareProject",
    (state.projects || [])
      .filter((p) => !p.read_only)
      .map((p) => [p.id, p.name]),
  )}${field("Nombre del observador", "shareLabel", "", 'required maxlength="200" placeholder="Ej.: Arquitecta María"')}${permissionFields(allPermissions())}<p>La invitación sirve para un equipo. Se vincula al primer equipo que la utiliza; podés revocar su acceso en cualquier momento.</p><button class="btn primary" type="submit" ${(state.projects || []).some((p) => !p.read_only) ? "" : "disabled"}>Crear invitación</button><p class="feature-error" role="alert"></p></form>
  ${m.invitation ? `<div class="sharing-invitation"><label>Invitación para enviar<textarea readonly id="p2p-invitation" rows="4">${e(m.invitation)}</textarea></label><button class="btn" data-action="share-copy">Copiar invitación</button><span class="sharing-copy-status" role="status">${e(m.copyMessage)}</span><button class="btn" data-action="share-clear-invitation">Ocultar invitación</button><p>Enviásela al observador por tu medio habitual. Da acceso únicamente a los apartados que autorizaste.</p></div>` : ""}</section>
  <section class="feature-editor"><h2>Recibir una obra</h2><form id="p2p-join-form"><label>Invitación del propietario<textarea name="invitation" required maxlength="16000" rows="5" placeholder="Pegá aquí la invitación que recibiste"></textarea></label><p>La obra se guarda como una copia externa de solo lectura. Tus obras y contactos propios se conservan.</p><button class="btn primary" type="submit">Vincular obra</button><p class="feature-error" role="alert"></p></form></section></div>
  ${m.access?`<section class="feature-editor"><h2>Permisos de ${e(m.access.label)}</h2><form id="p2p-access-form">${permissionFields({...allPermissions(),...m.access.permissions})}<p>Los cambios se aplican a las futuras actualizaciones. No borran información que el observador ya recibió.</p><button type="submit" class="btn primary">Guardar permisos</button> <button type="button" class="btn" data-action="share-cancel-access">Cancelar</button><p class="feature-error" role="alert"></p></form></section>`:''}
  <h2>Obras que compartís</h2>${table(
    ["Obra", "Observador", "Acceso", "Última consulta", ""],
    s.shares.map(
      (g) =>
        `<tr><td>${e(state.projects.find((p) => p.id === g.project_id)?.name || "Obra")}</td><td>${e(g.label)}${g.peer ? `<small class="sharing-peer">Equipo ${e(g.peer.slice(0, 12))}…</small>` : ""}</td><td>${g.revoked ? "Revocado" : g.peer ? "Vinculado · Solo lectura" : "Invitación pendiente"}</td><td>${e(when(g.last_seen))}</td><td>${g.revoked ? "" : `<button class="btn" data-action="share-edit-access" data-id="${g.id}">Permisos</button> <button class="btn" data-action="share-revoke" data-id="${g.id}">Revocar acceso</button>`}</td></tr>`,
    ),
  )}
  <h2>Obras recibidas</h2>${table(
    ["Obra", "Estado", "Última versión recibida", ""],
    s.subscriptions.map(
      (s) =>
        `<tr><td>${e(s.name)} <span class="person-both">Externa · Solo lectura</span></td><td>${s.revoked ? "Acceso revocado" : s.error ? e(s.error) : s.last_checked ? "Al día en la última consulta" : "Pendiente de recibir"}<small class="sharing-peer">Última comprobación: ${e(when(s.last_checked))}</small></td><td>${e(when(s.last_sync))}</td><td><button class="btn primary" data-action="share-open" data-id="${s.id}" ${s.has_snapshot ? "" : "disabled"}>Abrir copia</button> <button class="btn" data-action="share-forget" data-id="${s.id}">Desvincular</button></td></tr>`,
    ),
  )}
  <p>Revocar impide nuevas actualizaciones; el observador conserva lo que ya recibió. Esta función no sube una copia permanente a un servidor: si ambos están desconectados, no hay una versión nueva disponible.</p><p class="feature-error" role="alert">${e(m.error)}</p></main>`;
  }
  function markup(){return overview();}
  async function refresh() {
    m.status = await invoke("p2p_status");

  }
  async function act(button) {
    const a = button.dataset.action;
    if (a !== "open-sharing" && !a.startsWith("share-")) return false;
    if (a === "share-copy") {
      const t = document.querySelector("#p2p-invitation");
      t.select();
      try {
        if (window.navigator?.clipboard)
          await window.navigator.clipboard.writeText(t.value);
        else if (!document.execCommand("copy")) throw Error();
        m.copyMessage = "Invitación copiada";
      } catch {
        m.copyMessage = "Seleccioná el texto y copialo con Ctrl+C";
      }
      const feedback = document.querySelector(".sharing-copy-status");
      if (feedback) feedback.textContent = m.copyMessage;
      return true;
    }
    if (state.busy) return true;
    if (state.pageDirty) {
      if (
        !window.confirm("¿Descartar los datos sin guardar de esta vinculación?")
      )
        return true;
      state.pageDirty = false;
    }
    if (a === "share-clear-invitation") {
      m.invitation = "";
      render();
      return true;
    }
    state.busy = true;
    m.error = "";
    try {
      if(a==='share-edit-access')m.access=m.status.shares.find(g=>g.id===button.dataset.id);
      if(a==='share-cancel-access')m.access=null;
      if (a === "open-sharing") {
        await refresh();
        state.view = "sharing";
      }
      if (["share-refresh", "share-sync"].includes(a)) {
        if (a === "share-sync") await invoke("p2p_sync");
        await refresh();
        await loadCollections();
      }
      if (a === "share-toggle") {
        await invoke("p2p_enable", { enabled: !m.status.enabled });
        await refresh();
      }
      if (a === "share-open") {
        await openExternalProject(button.dataset.id);
      }
      if (
        a === "share-revoke" &&
        window.confirm(
          "¿Revocar el acceso? No recibirá más actualizaciones, pero conserva las copias que ya obtuvo.",
        )
      ) {
        await invoke("p2p_revoke", { id: button.dataset.id });
        await refresh();
      }
      if (
        a === "share-forget" &&
        window.confirm(
          "¿Desvincular esta obra y eliminar su copia de este equipo?",
        )
      ) {
        await invoke("p2p_forget", { id: button.dataset.id });
        await refresh();
      }
    } catch (error) {
      m.error = String(error);
    } finally {
      state.busy = false;
      render();
    }
    return true;
  }
  async function submit(form) {
    const data = new FormData(form);
    m.error = "";
    if (form.id === "p2p-invite-form") {
      const result = await invoke("p2p_invite", {
        projectId: String(data.get("shareProject")),
        label: String(data.get("shareLabel") || "").trim(),
        permissions:readPermissions(data),
      });
      m.invitation = result.invitation;
      m.copyMessage = "";
    } else if(form.id==='p2p-access-form'){
      await invoke('p2p_set_permissions',{id:m.access.id,permissions:readPermissions(data)});m.access=null;
    } else
      await invoke("p2p_join", {
        invitation: String(data.get("invitation") || "").trim(),
      });
    state.pageDirty = false;
    await refresh();
    await loadCollections();
    render();
  }
  if (window.setInterval)
    window.setInterval(async () => {
      if(state.remoteProject){try{await refreshExternalSession();}catch{/* Keep the last readable copy. */}return;}
      if(state.view==='projects'&&!state.busy&&!state.navigating&&!state.pageDirty&&!state.modal){
        try{const links=await invoke('p2p_projects');if(state.view==='projects'&&!state.modal&&!state.busy&&JSON.stringify(links)!==JSON.stringify(state.externalProjects)){state.externalProjects=links;render();}}catch{}return;
      }
      if (
        state.view !== "sharing" ||
        state.busy ||
        state.pageDirty ||
        m.invitation
      )
        return;
      try {
        await refresh();
        render();
      } catch {
        /* Preserve the visible cached copy. */
      }
    }, 30000);
  return { markup, act, submit, model: m };
}
