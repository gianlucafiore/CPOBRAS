import { invoke } from "@tauri-apps/api/core";
import "./style.css";

const root = document.querySelector("#app");
const state = { clients: [], projects: [], view: "projects", editingProjectId: null, selectedProjectId: null, estimates: [], selectedEstimateId: null, estimateLines: [], estimateTotal: '0', editingLineId: null, resources: [], analyses: [], acuComponents: [] };

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
  if (state.view === "catalog" || state.view === "acu") await loadCatalog();
  render();
}

async function loadCatalog() {
  [state.resources, state.analyses] = await Promise.all([invoke("list_resources"), invoke("list_analyses")]);
}

function render() {
  const clients = new Map(state.clients.map((c) => [c.id, c.name]));
  const projectsActive = state.view === "projects";
  const catalogActive = state.view === "catalog";
  const acuActive = state.view === "acu";
  const selected = state.projects.find((p) => p.id === state.editingProjectId);
  const opened = state.projects.find((p) => p.id === state.selectedProjectId);
  const activeEstimate = state.estimates.find((e) => e.id === state.selectedEstimateId);
  const editingLine = state.estimateLines.find((line) => line.id === state.editingLineId);
  root.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-icon">▥</span><span>CPOBRAS</span></div>
        <div class="brand-sub">GESTIÓN DE OBRAS</div>
        <nav>
          <button class="nav-item ${projectsActive ? "active" : ""}" data-view="projects">▦ &nbsp; Obras</button>
          <button class="nav-item ${state.view === "clients" ? "active" : ""}" data-view="clients">♙ &nbsp; Clientes</button>
          <button class="nav-item ${catalogActive ? "active" : ""}" data-view="catalog">▤ &nbsp; Insumos</button>
          <button class="nav-item ${acuActive ? "active" : ""}" data-view="acu">▧ &nbsp; Análisis de costos</button>
        </nav>
        <div class="sidebar-footer">Versión inicial · Local-first<br>Datos guardados en SQLite</div>
      </aside>
      <main>
        <header><span>Espacio de trabajo</span><span class="mode">● Modo local</span></header>
        <section class="content">
          <div class="headline">
            <div><p class="eyebrow">ADMINISTRACIÓN</p><h1>${projectsActive ? "Mis obras" : catalogActive ? "Biblioteca de insumos" : acuActive ? "Análisis de costos unitarios" : "Clientes"}</h1>
              <p class="intro">${projectsActive ? "Gestioná tus proyectos y sus comitentes." : catalogActive ? "Materiales, mano de obra, equipos y subcontratos con precios en ARS." : acuActive ? "Componé precios unitarios a partir de rendimientos e insumos." : "Directorio de comitentes y clientes."}</p></div>
          </div>
          <div class="summary">
            <div><span>Obras registradas</span><strong>${state.projects.length}</strong></div>
            <div><span>Clientes registrados</span><strong>${state.clients.length}</strong></div>
          </div>
          ${catalogActive ? `<section class="panel project-detail"><div class="panel-head"><h2>Insumos registrados</h2></div><div class="records">${state.resources.map((r) => `<div class="record"><div class="record-info"><strong>${escapeHtml(r.code)} · ${escapeHtml(r.description)}</strong><small>${escapeHtml(r.kind)} · ${escapeHtml(r.unit)}</small></div><strong>ARS ${escapeHtml(r.price ?? "Sin precio")}</strong></div>`).join("") || '<p class="empty">No hay insumos.</p>'}</div><form id="new-resource" class="line-form"><label>Código<input name="code" required></label><label>Descripción<input name="description" required></label><label>Unidad<input name="unit" required placeholder="kg, h, m³"></label><label>Tipo<select name="kind"><option value="material">Material</option><option value="labor">Mano de obra</option><option value="equipment">Equipo</option><option value="subcontract">Subcontrato</option></select></label><label>Precio unitario ARS<input name="price" type="number" step="any" min="0" required></label><button class="primary" type="submit">Guardar insumo</button></form><p class="feedback" role="status"></p></section>` : ""}
          ${acuActive ? `<section class="panel project-detail"><div class="panel-head"><h2>ACU guardados</h2></div><div class="records">${state.analyses.map((a) => `<div class="record"><div class="record-info"><strong>${escapeHtml(a.code)} · ${escapeHtml(a.description)}</strong><small>${escapeHtml(a.unit)}</small></div><strong>ARS ${escapeHtml(a.unit_cost)}</strong></div>`).join("") || '<p class="empty">Todavía no se crearon ACU.</p>'}</div><form id="new-acu" class="line-form"><label>Código<input name="code" required></label><label>Descripción<input name="description" required></label><label>Unidad del ACU<input name="unit" required></label><button class="primary" type="submit">Crear ACU</button></form><div class="acu-composer"><h2>Componentes del nuevo ACU</h2><div class="records">${state.acuComponents.map((comp, i) => `<div class="record"><span>${escapeHtml(state.resources.find((r) => r.id === comp.resourceId)?.description || "Insumo")} × ${escapeHtml(comp.quantity)}</span><button class="edit-project" data-remove-component="${i}">Quitar</button></div>`).join("")}</div><form id="acu-component" class="estimate-form"><label>Insumo<select name="resourceId" required>${state.resources.filter(r => r.price !== null).map((r) => `<option value="${r.id}">${escapeHtml(r.code)} · ${escapeHtml(r.description)}</option>`).join("")}</select></label><label>Rendimiento por unidad<input name="quantity" type="number" step="any" min="0" required></label><button class="primary" type="submit">+ Componente</button></form></div><p class="feedback" role="status"></p></section>` : ""}
          ${projectsActive && opened ? `<section class="panel project-detail"><div class="panel-head"><h2>Presupuestos de ${escapeHtml(opened.name)}</h2><button type="button" id="close-project" class="edit-project">Cerrar ficha</button></div><div class="records">${state.estimates.length ? state.estimates.map((e) => `<div class="record"><div class="record-info"><strong>${escapeHtml(e.title)}</strong><small>${e.issued ? "Emitido" : "Borrador"} · ${escapeHtml(e.currency)}</small></div><button class="edit-project" type="button" data-estimate="${e.id}">Partidas</button><button class="edit-project" type="button" data-duplicate="${e.id}">Duplicar</button></div>`).join("") : '<p class="empty">Esta obra todavía no tiene presupuestos.</p>'}</div><form id="new-estimate" class="estimate-form"><label>Título del presupuesto<input name="title" required maxlength="140" placeholder="Ej.: Presupuesto inicial"></label><button class="primary" type="submit">+ Crear presupuesto</button></form><p class="feedback" role="status"></p></section>` : ""}
          ${projectsActive && opened && state.selectedEstimateId ? `<section class="panel project-detail"><div class="panel-head"><h2>Partidas del presupuesto</h2><button type="button" id="close-estimate" class="edit-project">Volver a presupuestos</button></div><div class="records">${state.estimateLines.length ? state.estimateLines.map((line) => `<div class="record"><div class="record-info"><strong>${escapeHtml(line.description)}</strong><small>${escapeHtml(line.quantity)} ${escapeHtml(line.unit)} × ${escapeHtml(line.unit_cost)}</small></div><strong>${escapeHtml(line.total)}</strong>${!activeEstimate?.issued ? `<button class="edit-project" type="button" data-edit-line="${line.id}">Editar</button><button class="edit-project" type="button" data-delete-line="${line.id}">Eliminar</button>` : ""}</div>`).join("") : '<p class="empty">Todavía no hay partidas.</p>'}</div><div class="estimate-total">Total: ${escapeHtml(state.estimateTotal)} ${state.estimates.find((e) => e.id === state.selectedEstimateId)?.currency || ""}</div>${activeEstimate?.issued ? '<p class="empty">Presupuesto emitido. No admite modificaciones.</p>' : `<form id="new-line" class="line-form"><label>Partida<input name="description" required maxlength="180" placeholder="Ej.: Hormigón H21" value="${escapeHtml(editingLine?.description || "")}"></label><label>Unidad<input name="unit" required maxlength="20" placeholder="m³" value="${escapeHtml(editingLine?.unit || "")}"></label><label>Cantidad<input name="quantity" type="number" min="0" step="any" required value="${escapeHtml(editingLine?.quantity || "")}"></label><label>Precio unitario<input name="unitCost" type="number" min="0" step="any" required value="${escapeHtml(editingLine?.unit_cost || "")}"></label><button type="submit" class="primary">${editingLine ? "Guardar cambios" : "+ Agregar partida"}</button>${editingLine ? '<button type="button" id="cancel-line" class="edit-project">Cancelar</button>' : ""}</form>`}<p class="feedback" role="status"></p>${!activeEstimate?.issued ? `<form id="add-from-acu" class="estimate-form"><label>Importar ACU<select name="analysisId" required>${state.analyses.map((a) => `<option value="${a.id}">${escapeHtml(a.code)} · ${escapeHtml(a.description)} — ARS ${escapeHtml(a.unit_cost)}</option>`).join("")}</select></label><label>Cantidad<input name="quantity" type="number" min="0" step="any" required></label><button class="primary" type="submit" ${!state.analyses.length ? "disabled" : ""}>Agregar ACU</button></form>` : ""}${!activeEstimate?.issued && state.estimateLines.length ? '<button id="issue-estimate" type="button" class="primary issue-button">Emitir presupuesto y bloquear cambios</button>' : ""}</section>` : ""}
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
    button.addEventListener("click", async () => {
      state.view = button.dataset.view;
      if (state.view === "catalog" || state.view === "acu") {
        try { await loadCatalog(); } catch (error) { window.alert(String(error)); }
      }
      state.editingProjectId = null;
      render();
    });
  });
  root.querySelector("#new-resource")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      await invoke("create_resource", Object.fromEntries(values));
      await loadCatalog();
      render();
    } catch (error) { form.closest(".panel").querySelector(".feedback").textContent = String(error); }
  });
  root.querySelector("#acu-component")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    state.acuComponents.push({resourceId: values.get("resourceId"), quantity: values.get("quantity")});
    render();
  });
  root.querySelectorAll("[data-remove-component]").forEach(button => button.addEventListener("click", () => {
    state.acuComponents.splice(Number(button.dataset.removeComponent), 1);
    render();
  }));
  root.querySelector("#new-acu")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      await invoke("create_analysis", {
        code: values.get("code"), description: values.get("description"), unit: values.get("unit"),
        components: state.acuComponents.map(c => ({resourceId: c.resourceId, quantity: String(c.quantity)})),
      });
      state.acuComponents = [];
      await loadCatalog();
      render();
    } catch (error) { form.closest(".panel").querySelector(".feedback").textContent = String(error); }
  });
  root.querySelector("#add-from-acu")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      await invoke("add_line_from_analysis", {estimateId: state.selectedEstimateId, analysisId: values.get("analysisId"), quantity: values.get("quantity")});
      await reloadLines();
      render();
    } catch (error) { form.closest(".panel").querySelector(".feedback").textContent = String(error); }
  });
  const reloadLines = async () => {
    state.estimateLines = await invoke("list_estimate_lines", { estimateId: state.selectedEstimateId });
    state.estimateTotal = await invoke("estimate_total", { estimateId: state.selectedEstimateId });
  };
  root.querySelectorAll("[data-duplicate]").forEach((button) => {
    button.addEventListener("click", async () => {
      const original = state.estimates.find((e) => e.id === button.dataset.duplicate);
      const title = window.prompt("Título de la copia", (original?.title || "Presupuesto") + " - copia");
      if (!title?.trim()) return;
      try {
        await invoke("duplicate_estimate", { estimateId: button.dataset.duplicate, title });
        state.estimates = await invoke("list_project_estimates", { projectId: state.selectedProjectId });
        render();
      } catch (error) { window.alert(String(error)); }
    });
  });
  root.querySelectorAll("[data-edit-line]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingLineId = button.dataset.editLine;
      render();
    });
  });
  root.querySelector("#cancel-line")?.addEventListener("click", () => {
    state.editingLineId = null;
    render();
  });
  root.querySelectorAll("[data-delete-line]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!window.confirm("¿Eliminar esta partida del borrador?")) return;
      try {
        await invoke("delete_estimate_line", { estimateId: state.selectedEstimateId, lineId: button.dataset.deleteLine });
        state.editingLineId = null;
        await loadCatalog();
        await reloadLines();
        render();
      } catch (error) { window.alert(String(error)); }
    });
  });
  root.querySelector("#issue-estimate")?.addEventListener("click", async () => {
    if (!window.confirm("Emitir este presupuesto impedirá modificar sus partidas. ¿Continuar?")) return;
    try {
      await invoke("issue_estimate", { estimateId: state.selectedEstimateId });
      state.estimates = await invoke("list_project_estimates", { projectId: state.selectedProjectId });
      render();
    } catch (error) { window.alert(String(error)); }
  });
  root.querySelectorAll("[data-estimate]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        state.selectedEstimateId = button.dataset.estimate;
        state.editingLineId = null;
        await reloadLines();
        render();
      } catch (error) { window.alert(String(error)); }
    });
  });
  root.querySelector("#close-estimate")?.addEventListener("click", () => {
    state.selectedEstimateId = null;
    state.estimateLines = [];
    state.editingLineId = null;
    render();
  });
  root.querySelector("#new-line")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    const values = new FormData(form);
    try {
      await invoke(state.editingLineId ? "update_estimate_line" : "add_estimate_line", {
        estimateId: state.selectedEstimateId,
        ...(state.editingLineId ? { lineId: state.editingLineId } : {}),
        description: values.get("description"),
        unit: values.get("unit"),
        quantity: values.get("quantity"),
        unitCost: values.get("unitCost"),
      });
      state.editingLineId = null;
      await reloadLines();
      render();
    } catch (error) {
      form.parentElement.querySelector(".feedback").textContent = "Error: " + String(error);
      submit.disabled = false;
    }
  });
  root.querySelectorAll("[data-open]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.selectedProjectId = button.dataset.open;
      state.selectedEstimateId = null;
      state.estimateLines = [];
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
    state.selectedEstimateId = null;
    state.estimateLines = [];
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

  const form = root.querySelector("#new-project, #new-client");
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
