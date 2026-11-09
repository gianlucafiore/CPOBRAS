import { reverseGeocode } from "../services/reverse-geocode.js";
import { createWorkMap } from "./work-map.js";
import { e, field } from "./helpers.js";
import { money } from "../decimal.js";
export function createProjectDashboard({
  invoke,
  state,
  render,
  document,
  window,
  FormData,
  editProfile,
  onLocationSaved,
}) {
  const model = {
    projectId: null,
    plan: null,
    operations: [],
    totals: {},
    metadata: {},
    attachments: [],
    mapExpanded: false,
    attachmentDescription: "",
  };
  async function refresh() {
    const id = state.projectId;
    if (model.projectId !== id) {
      model.attachmentDescription = "";
      model.mapExpanded = false;
    }
    model.projectId = id;
    if (!id) return;
    const [plan, operations, attachments, totals, metadata] = await Promise.all(
      [
        invoke("get_project_plan", { projectId: id }),
        invoke("list_operations", { projectId: id }),
        invoke("list_project_attachments", { projectId: id }),
        Promise.all(
          state.estimates.map(async (b) => [
            b.id,
            await invoke("priced_estimate_total", { estimateId: b.id }).catch(
              () => null,
            ),
          ]),
        ),
        Promise.all(
          state.estimates.map(async (b) => [
            b.id,
            await invoke("get_estimate_metadata", { estimateId: b.id }),
          ]),
        ),
      ],
    );
    if (state.projectId !== id) return;
    Object.assign(model, {
      plan,
      operations,
      attachments,
      totals: Object.fromEntries(totals),
      metadata: Object.fromEntries(metadata),
    });
  }
  const map = createWorkMap({
    document,
    state,
    onSave: async (point) => {
      const project = state.projects.find((p) => p.id === state.projectId),
        organization = state.organizations.find(
          (o) => o.id === project.organization_id,
        );
      const previous = model.profile;
      const record = previous
        ? structuredClone(previous)
        : {
            id: window.crypto.randomUUID(),
            kind: "project_profile",
            name: project.name,
            code: "",
            company_id: organization?.company_id || null,
            parent_id: null,
            project_id: project.id,
            client_id: project.client_id,
            attributes: {},
            revision: 0,
          };
      record.attributes.latitude = String(point.lat);
      record.attributes.longitude = String(point.lon);
      let lookupMessage = "";
      try {
        const address = await reverseGeocode(point);
        Object.assign(record.attributes, address, {
          address_lookup_status: "approximate",
          address_lookup_point:
            point.lat.toFixed(6) + "," + point.lon.toFixed(6),
        });
        lookupMessage = "Ubicación guardada con dirección aproximada.";
      } catch (error) {
        record.attributes.address_lookup_status = "pending";
        lookupMessage =
          "Ubicación guardada. No se pudo obtener la dirección aproximada; podés editarla en la ficha.";
      }
      model.profile = await invoke("save_management_record", { record });
      state.message = lookupMessage;
      await onLocationSaved();
    },
  });
  function markup(catalogs) {
    const project = state.projects.find((p) => p.id === state.projectId) || {},
      profile = (catalogs.project_profile || []).find(
        (r) => r.project_id === state.projectId,
      ),
      a = profile?.attributes || {},
      client = state.clients.find((c) => c.id === project.client_id),
      tasks = model.plan?.plan?.tasks || [];
    const crewIds = new Set(
      tasks.flatMap((t) =>
        t.assignments
          .filter((a) => a.kind === "crew")
          .map((a) => a.resource_id),
      ),
    );
    const crews = (catalogs.crew || []).filter(
      (c) => c.project_id === state.projectId || crewIds.has(c.id),
    );
    const partners = new Set(
      model.operations
        .filter((o) => ["rfq", "service_order", "subcontract"].includes(o.kind))
        .map((o) => o.partner_id),
    );
    const subcontractors = [
      ...(catalogs.subcontractor || []),
      ...(catalogs.supplier || []),
    ].filter((c) => c.project_id === state.projectId || partners.has(c.id));
    const equipmentIds = new Set(
      tasks.flatMap((t) => t.assignments.map((a) => a.resource_id)),
    );
    for (const o of model.operations)
      for (const l of o.lines || [])
        if (l.resource_id) equipmentIds.add(l.resource_id);
    const equipment = state.resources.filter(
      (r) =>
        String(r.kind).toLowerCase() === "equipment" && equipmentIds.has(r.id),
    );
    model.profile = profile;
    map.configure(state.projectId, a);
    const card = (title, body) =>
        `<section class="project-card ${{ "Ficha de la obra": "card-profile", Ubicación: "card-map", "Cuadrillas involucradas": "card-crews", "Subcontratistas solicitados": "card-subcontractors", "Equipos necesarios": "card-equipment", "Presupuestos de la obra": "card-budgets", "Archivos y legajos": "card-files" }[title] || ""}"><h2>${title}</h2>${body}</section>`,
      list = (rows, empty) =>
        rows.length
          ? `<ul class="dashboard-list">${rows.map((r) => `<li>${e(r.name || r.description)}${crewIds.has(r.id) ? "<small>Asignada en planificación</small>" : ""}</li>`).join("")}</ul>`
          : `<p class="muted-note">${empty}</p>`;
    const estimates = [...state.estimates].sort(
      (x, y) =>
        Number(y.id === state.estimateId) - Number(x.id === state.estimateId) ||
        Number(!y.issued) - Number(!x.issued),
    );
    return `<section class="project-dashboard" role="region" aria-label="Tablero general de la obra">${card("Ficha de la obra", `<h3>${e(profile?.name || project.name)}</h3><dl class="project-facts"><dt>Comitente</dt><dd>${e(client?.name || "Sin comitente")}</dd><dt>Organización</dt><dd>${e(project.organization_name || "—")}</dd><dt>Ubicación</dt><dd>${e([a.address, a.locality, a.province].filter(Boolean).join(", ") || "Sin completar")}${a.address_lookup_status === "approximate" ? "<small>Dirección aproximada desde el mapa</small>" : a.address_lookup_status === "pending" ? "<small>Dirección pendiente de verificar para este punto</small>" : ""}</dd><dt>Tipo de edificio</dt><dd>${e(a.building_type || "Sin completar")}</dd><dt>Superficie estimada</dt><dd>${a.estimated_area ? e(a.estimated_area) + " m²" : "Sin completar"}</dd><dt>Dimensiones estimadas</dt><dd>${e(a.estimated_dimensions || "Sin completar")}</dd></dl><h4>Memoria descriptiva</h4><p class="project-description">${e(a.description || "Agregá una descripción de los trabajos previstos.")}</p><button class="btn" data-action="manage-dashboard-profile">${state.remoteProject ? "Consultar ficha" : "Editar proyecto"}</button>`)}${card("Ubicación", map.markup())}${card("Cuadrillas involucradas", list(crews, "Todavía no hay cuadrillas vinculadas a esta obra."))}${card("Subcontratistas solicitados", list(subcontractors, "Todavía no hay subcontratistas vinculados ni solicitudes registradas."))}${card("Equipos necesarios", list(equipment, "Asigná equipos en planificación o gestión para verlos aquí."))}${card("Presupuestos de la obra", `<button class="btn primary" data-action="modal-estimate" ${state.remoteProject ? "disabled" : ""}>+ Nuevo presupuesto</button><div class="dashboard-budget-list">${estimates.map((b) => `<article class="dashboard-budget ${b.id === state.estimateId ? "active" : ""}"><strong>${e(b.title)}</strong><span class="dashboard-badge">${b.id === state.estimateId ? "Activo · " : ""}${b.issued ? "Emitido" : "En elaboración"}</span><small>Creado: ${e(displayDate(model.metadata[b.id]?.created_at))}${model.metadata[b.id]?.issued_at ? " · Emitido: " + e(displayDate(model.metadata[b.id].issued_at)) : ""}</small><span>${e(b.currency)} ${model.totals[b.id]?.total == null ? "—" : money(model.totals[b.id].total)}</span><button class="btn tiny" data-action="manage-dashboard-budget" data-id="${e(b.id)}">${b.id === state.estimateId ? "Ver presupuesto" : "Seleccionar presupuesto"}</button></article>`).join("") || "<p>No hay presupuestos.</p>"}</div>`)}${card("Archivos y legajos", `<p>Copias guardadas con la obra e incluidas en los respaldos de la base de datos. Máximo 20 MB por archivo. Los adjuntos no se envían por P2P en esta versión.</p>${!state.remoteProject ? `<form id="project-attachment-form">${field("Descripción del archivo", "attachment-description", model.attachmentDescription, 'maxlength="2000"')}<button class="btn primary" type="submit">Agregar archivo…</button><p class="feature-error" role="alert"></p></form>` : "<p>Los archivos del propietario no están disponibles en esta copia.</p>"}<ul class="dashboard-files">${model.attachments.map((f) => `<li><strong>${e(f.name)}</strong><small>${e(f.description)} · ${(f.bytes / 1024).toFixed(0)} KB · ${e(displayDate(f.created_at))}</small><button class="btn tiny" data-action="manage-attachment-open" data-id="${e(f.id)}">Abrir</button><button class="btn tiny" data-action="manage-attachment-remove" data-id="${e(f.id)}">Quitar</button></li>`).join("")}</ul>`)}${model.mapExpanded ? `<div class="modal-overlay"><section class="dialog-shell wide map-dialog" role="dialog" aria-modal="true" aria-label="Mapa de ubicación de la obra"><div class="dialog-header"><h2>Ubicación de la obra</h2><button class="close-dialog" data-action="manage-map-close" aria-label="Cerrar mapa">×</button></div>${map.markup(true)}</section></div>` : ""}</section>`;
  }
  async function act(button) {
    const a = button.dataset.action;
    if (a.startsWith("manage-map-")) await map.act(a);
    if (a === "manage-map-expand") model.mapExpanded = true;
    if (a === "manage-map-close") model.mapExpanded = false;
    if (a === "manage-dashboard-profile") {
      if (map.model.editing) {
        if (
          !window.confirm(
            "¿Descartar la ubicación sin guardar antes de editar la ficha?",
          )
        )
          return;
        await map.act("manage-map-cancel");
      }
      editProfile();
    }
    if (a === "manage-dashboard-budget") {
      if (button.dataset.id === state.estimateId) {
        document.querySelector("[data-action=open-workspace]")?.click();
        return;
      }
      const picker = document.querySelector("[name=estimate-picker]");
      if (picker) {
        picker.value = button.dataset.id;
        picker.dispatchEvent(new window.Event("change", { bubbles: true }));
      }
      return;
    }
    if (a === "manage-attachment-open")
      await invoke("open_project_attachment", {
        projectId: state.projectId,
        id: button.dataset.id,
      });
    if (a === "manage-attachment-remove") {
      if (!window.confirm("¿Quitar este archivo del legajo?")) return;
      await invoke("remove_project_attachment", {
        projectId: state.projectId,
        id: button.dataset.id,
      });
      await refresh();
    }
    render();
  }
  const displayDate = (value) => {
    if (!value) return "—";
    const text = String(value),
      date = new Date(
        /Z$|[+-]\d\d:\d\d$/.test(text) ? text : text.replace(" ", "T") + "Z",
      );
    return Number.isNaN(date.getTime()) ? text : date.toLocaleString("es-AR");
  };
  async function submit(form) {
    const d = new FormData(form);
    model.attachmentDescription = String(
      d.get("attachment-description") || "",
    ).trim();
    const added = await invoke("add_project_attachment", {
      projectId: state.projectId,
      description: String(d.get("attachment-description") || "").trim(),
    });
    if (!added) return;
    model.attachmentDescription = "";
    await refresh();
    render();
  }
  return {
    markup,
    act,
    submit,
    refresh,
    model,
    resetTransient: map.resetTransient,
    afterRender: map.draw,
    wheel: map.wheel,
    pointerDown: map.pointerDown,
    pointerMove: map.pointerMove,
    pointerUp: map.pointerUp,
    cancelPointer: map.cancel,
  };
}
