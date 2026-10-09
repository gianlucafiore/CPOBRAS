import { invoke } from "@tauri-apps/api/core";
import "./style.css";

const root = document.querySelector("#app");
const state = { clients: [], projects: [], view: "projects" };

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
          <div class="columns">
            <section class="panel">
              <div class="panel-head"><h2>${projectsActive ? "Listado de obras" : "Directorio de clientes"}</h2><span>${projectsActive ? state.projects.length : state.clients.length} registros</span></div>
              <div class="records">
              ${projectsActive
                ? state.projects.length
                  ? state.projects.map((p) => `<div class="record"><div class="initial">${escapeHtml(p.name[0]?.toUpperCase() || "O")}</div><div class="record-info"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(clients.get(p.client_id) || "Sin comitente")}</small></div><span class="chip">${p.currency === "Ars" ? "ARS" : "USD"}</span></div>`).join("")
                  : '<p class="empty">Todavía no cargaste obras. Creá la primera con el formulario.</p>'
                : state.clients.length
                  ? state.clients.map((c) => `<div class="record"><div class="initial">${escapeHtml(c.name[0]?.toUpperCase() || "C")}</div><div class="record-info"><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.cuit || "Sin CUIT informado")}</small></div></div>`).join("")
                  : '<p class="empty">Todavía no hay clientes registrados.</p>'}
              </div>
            </section>
            <section class="panel form-panel">
              <div class="panel-head"><h2>${projectsActive ? "Nueva obra" : "Nuevo cliente"}</h2></div>
              ${projectsActive
                ? `<form id="new-project">
                    <label>Nombre de la obra<input name="name" placeholder="Ej.: Vivienda unifamiliar" required maxlength="140"></label>
                    <label>Comitente<select name="client" required><option value="">Seleccionar cliente</option>
                      ${state.clients.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select></label>
                    <label>Moneda del presupuesto<select name="currency"><option value="ARS">Pesos argentinos (ARS)</option><option value="USD">Dólares (USD)</option></select></label>
                    <button type="submit" class="primary" ${!state.clients.length ? "disabled" : ""}>+ Crear obra</button>
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
      render();
    });
  });

  const form = root.querySelector("form");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    const values = new FormData(form);
    try {
      if (projectsActive) {
        await invoke("create_project", {
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
