import { invoke } from "@tauri-apps/api/core";
import "./style.css";

const root = document.querySelector("#app");
const state = { clients: [], projects: [], view: "projects", editingProjectId: null, selectedProjectId: null, estimates: [] };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]
  );
}

async function refresh() {
  const [clients, projects] = await Promise.all([
    invoke("list_clients"),
    invoke("list_projects"),
  ]);
  state.clients = clients;
  state.projects = projects;
  render();
}

function render() {
  const clients = new Map(state.clients.map((c) => [c.id, c.name]));
  const projectsActive = state.view === "projects";
  const selected = state.projects.find((p) => p.id === state.editingProjectId);
  const opened = state.projects.find((p) => p.id === state.selectedProjectId);
  root.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-icon">▥</span><span>CPOBRAS</span></div>
        <div class="brand-sub">GESTIÓN DE OBRAS</div>
        <nav>
          <button class="nav-item ${projectsActive ? "active" : ""}" data-view="projects">▦ &nbsp; Obras</button>
          <button class="nav-item ${!projectsActive ? "active" : ""}" data-view="clients">♙ &nbsp; Clientes</button>
        </nav>
        <div class="sidebar-footer">Versión inicial · Local-first<br>Datos guardados en SQLite</div>
      </aside>
      <main>
        <header><span>Espacio de trabajo</span><span class="mode">● Modo local</span></header>
        <section class="content">
          <div class="headline">
            <div><p class="eyebrow">ADMINISTRACIÓN</p><h1>${projectsActive ? "Mis obras" : "Clientes"}</h1>
              <p class="intro">${projectsActive ? "Gestioná tus proyectos y sus comitentes." : "Directorio de comitentes y clientes."}</p></div>
          </div>
          <div class="summary">
            <div><span>Obras registradas</span><strong>${state.projects.length}</strong></div>
            <div><span>Clientes registrados</span><strong>${state.clients.length}</strong></div>
          </div>
          ${projectsActive && opened ? `<section class="panel project-detail"><div class="panel-head"><h2>Presupuestos de ${escapeHtml(opened.name)}</h2><button type="button" id="close-project" class="edit-project">Cerrar ficha</button></div><div class="records">${state.estimates.length ? state.estimates.map((e) => `<div class="record"><div class="record-info"><strong>${escapeHtml(e.title)}</strong><small>${e.issued ? "Emitido" : "Borrador"} · ${escapeHtml(e.currency)}</small></div></div>`).join("") : '<p class="empty">Esta obra todavía no tiene presupuestos.</p>'}</div><form id="new-estimate" class="estimate-form"><label>Título del presupuesto<input name="title" required maxlength="140" placeholder="Ej.: Presupuesto inicial"></label><button class="primary" type="submit">+ Crear presupuesto</button></form><p class="feedback" role="status"></p></section>` : ""}
          <div class="columns">
            <section class="panel">
              <div class="panel-head"><h2>${projectsActive ? "Listado de obras" : "Directorio de clientes"}</h2><span>${projectsActive ? state.projects.length : state.clients.length} registros</span></div>
              <div class="records">
              ${projectsActive
                ? state.projects.length
                  ? state.projects.map((p) => `<div class="record"><div class="initial">${escapeHtml(p.name[0]?.toUpperCase() || "O")}</div><div class="record-info"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(clients.get(p.client_id) || "Sin comitente")}</small></div><span class="chip">${p.currency === "Ars" ? "ARS" : "USD"}</span><button class="edit-project" data-open="${p.id}" type="button">Abrir</button><button class="edit-project" data-edit="${p.id}" type="button">Editar</button></div>`).join("")
                  : '<p class="empty">Todavía no cargaste obras. Creá la primera con el formulario.</p>'
                : state.clients.length
                  ? state.clients.map((c) => `<div class="record"><div class="initial">${escapeHtml(c.name[0]?.toUpperCase() || "C")}</div><div class="record-info"><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.cuit || "Sin CUIT informado")}</small></div></div>`).join("")
                  : '<p class="empty">Todavía no hay clientes registrados.</p>'}
              </div>
            </section>
            <section class="panel form-panel">
              <div class="panel-head"><h2>${projectsActive ? (selected ? "Editar obra" : "Nueva obra") : "Nuevo cliente"}</h2></div>
              ${projectsActive
                ? `<form id="new-project">
                    <label>Nombre de la obra<input name="name" placeholder="Ej.: Vivienda unifamiliar" required maxlength="140" value="${escapeHtml(selected?.name || "")}"></label>
                    <label>Comitente<select name="client" required><option value="">Seleccionar cliente</option>
                      ${state.clients.map((c) => `<option value="${c.id}" ${selected?.client_id === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}</select></label>
                    <label>Moneda del presupuesto<select name="currency"><option value="ARS" ${selected?.currency !== "Usd" ? "selected" : ""}>Pesos argentinos (ARS)</option><option value="USD" ${selected?.currency === "Usd" ? "selected" : ""}>Dólares (USD)</option></select></label>
                    <button type="submit" class="primary" ${!state.clients.length ? "disabled" : ""}>${selected ? "Guardar cambios" : "+ Crear obra"}</button>${selected ? '<button type="button" id="cancel-edit">Cancelar edición</button>' : ""}
                    ${!state.clients.length ? '<p class="hint">Primero registrá un cliente desde la sección Clientes.</p>' : ""}
                  </form>`
                : `<form id="new-client">
                    <label>Nombre o razón social<input name="name" placeholder="Nombre del comitente" required maxlength="140"></label>
                    <label>CUIT (opcional)<input name="cuit" placeholder="XX-XXXXXXXX-X" maxlength="20"></label>
                    <button type="submit" class="primary">+ Guardar cliente</button>
                  </form>`}
              <p class="feedback" role="status" aria-live="polite"></p>
            </section>
          </div>
        </section>
      </main>
    </div>`;

  root.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.view = button.dataset.view;
      state.editingProjectId = null;
      render();
    });
  });
  root.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.selectedProjectId = button.dataset.open;
      try {
        state.estimates = await invoke("list_project_estimates", { projectId: state.selectedProjectId });
        render();
      } catch (error) {
        window.alert(String(error));
      }
    });
  });
  root.querySelector("#close-project")?.addEventListener("click", () => {
    state.selectedProjectId = null;
    state.estimates = [];
    render();
  });
  root.querySelector("#new-estimate")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await invoke("create_estimate", {
        projectId: state.selectedProjectId,
        title: new FormData(form).get("title"),
      });
      state.estimates = await invoke("list_project_estimates", { projectId: state.selectedProjectId });
      render();
    } catch (error) {
      form.parentElement.querySelector(".feedback").textContent = "Error: " + String(error);
      submit.disabled = false;
    }
  });
  root.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingProjectId = button.dataset.edit;
      state.view = "projects";
      render();
    });
  });
  root.querySelector("#cancel-edit")?.addEventListener("click", () => {
    state.editingProjectId = null;
    render();
  });

  const form = root.querySelector("form");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    const values = new FormData(form);
    try {
      if (projectsActive) {
        await invoke(selected ? "update_project" : "create_project", {
          ...(selected ? { projectId: selected.id } : {}),
          projectName: values.get("name"),
          clientId: values.get("client"),
          currency: values.get("currency"),
        });
      } else {
        await invoke("create_client", {
          clientName: values.get("name"),
          cuit: values.get("cuit") || null,
        });
      }
      state.editingProjectId = null;
      await refresh();
      root.querySelector(".feedback").textContent = "Datos guardados correctamente.";
    } catch (error) {
      root.querySelector(".feedback").textContent = "Error: " + String(error);
      submit.disabled = false;
    }
  });
}

refresh().catch((error) => {
  root.innerHTML = `<main class="fatal"><h1>No se pudo abrir la base de datos</h1><pre>${escapeHtml(error)}</pre></main>`;
});
