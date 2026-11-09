import { entityActions } from "./entity-actions.js";
import { createProjectDashboard } from "./project-dashboard.js";
import { e, field, select } from "./helpers.js";

export const directoryKinds = {
  company: "Empresas",
  establishment: "Establecimientos",
  user: "Usuarios y roles",
  supplier: "Proveedores",
  subcontractor: "Subcontratistas",
  contact: "Contactos",
  project_profile: "Fichas de obras",
  client_profile: "Datos ampliados de clientes",
  contract: "Contratos",
  cost_center: "Centros de costos",
  unit: "Unidades",
  category: "Categorías",
  trade: "Rubros",
  document: "Documentación",
  crew: "Cuadrillas",
};
const commonContact = [
  ["email", "Correo"],
  ["phone", "Teléfono"],
  ["address", "Domicilio"],
];
const fields = {
  company: [["cuit", "CUIT"], ...commonContact],
  establishment: [
    ["address", "Domicilio"],
    ["province", "Provincia"],
    ["locality", "Localidad"],
  ],
  user: [
    ["email", "Correo"],
    [
      "role",
      "Rol",
      [
        ["admin", "Administrador"],
        ["estimator", "Presupuestista"],
        ["planner", "Planificador"],
        ["viewer", "Consulta"],
      ],
    ],
  ],
  supplier: [["cuit", "CUIT"], ...commonContact],
  subcontractor: [["cuit", "CUIT"], ...commonContact],
  contact: [["position", "Cargo"], ...commonContact],
  project_profile: [
    ["building_type", "Tipo de edificio"],
    ["estimated_area", "Superficie estimada (m²)"],
    ["estimated_dimensions", "Dimensiones estimadas"],
    ["description", "Memoria descriptiva", "textarea"],
    ["address", "Ubicación"],
    ["province", "Provincia"],
    ["locality", "Localidad"],
    ["latitude", "Latitud"],
    ["longitude", "Longitud"],
    ["responsible_id", "Responsable", "user"],
    ["establishment_id", "Establecimiento", "establishment"],
    [
      "status",
      "Estado",
      [
        ["planned", "Planificada"],
        ["active", "En ejecución"],
        ["paused", "Pausada"],
        ["finished", "Finalizada"],
      ],
    ],
    ["start_date", "Inicio", "date"],
    ["end_date", "Fin previsto", "date"],
    ["general_expenses_percent", "Gastos generales predeterminados %"],
    ["financial_expenses_percent", "Gastos financieros predeterminados %"],
    ["profit_percent", "Beneficio predeterminado %"],
    ["discount_percent", "Descuento predeterminado %"],
    ["tax_percent", "Impuestos predeterminados %"],
    ["economic_parameters", "Criterio de ajuste / notas económicas"],
  ],
  client_profile: [
    ["cuit", "CUIT"],
    ...commonContact,
    ["notes", "Observaciones"],
  ],
  contract: [
    ["start_date", "Inicio", "date"],
    ["end_date", "Fin", "date"],
    [
      "currency",
      "Moneda",
      [
        ["ARS", "ARS"],
        ["USD", "USD"],
      ],
    ],
    ["amount", "Monto contractual"],
    ["payment_terms", "Condiciones de pago"],
    ["adjustment", "Regla de ajuste"],
    [
      "status",
      "Estado",
      [
        ["draft", "Borrador"],
        ["signed", "Firmado"],
        ["closed", "Cerrado"],
      ],
    ],
  ],
  cost_center: [
    ["description", "Alcance"],
    ["classification_id", "Clasificación", "category"],
  ],
  unit: [
    ["symbol", "Símbolo"],
    ["dimension", "Magnitud"],
  ],
  category: [["description", "Descripción"]],
  trade: [["description", "Descripción"]],
  document: [
    ["reference", "Ubicación / referencia del documento"],
    ["version", "Versión"],
    ["notes", "Notas"],
  ],
  crew: [
    ["specialty", "Especialidad"],
    ["members", "Integrantes / referencias"],
    ["pay_frequency", "Frecuencia de pago", [["weekly", "Semanal · viernes"], ["fortnight", "Quincenal · 15 y último día"], ["monthly", "Mensual · último día"]]],
    ["daily_rate", "Costo por jornada de cuadrilla completa"],
    ["pay_currency", "Moneda de la jornada", [["ARS", "ARS"], ["USD", "USD"]]],
    ["advance_recovery_percent", "Porcentaje a descontar de cada pago por anticipo (0 a 100)"],
  ],
};
export function createManagementWorkspace({
  invoke,
  state,
  render,
  document,
  FormData,
  window,
}) {
  const projectKinds = [
    "project_profile",
    "contract",
    "cost_center",
    "document",
    "crew",
    "subcontractor",
  ];
  const scoped = () => Boolean(state.projectId);
  const organization = () =>
    state.organizations?.find(
      (o) =>
        o.id ===
        (state.projectId
          ? state.projects.find((p) => p.id === state.projectId)
              ?.organization_id
          : state.organizationId),
    );
  const company = () => organization()?.company_id;

  const visibleRecords = () =>
    (model.catalogs[model.kind] || []).filter((r) =>
      scoped()
        ? r.project_id === state.projectId
        : !state.organizationId ||
          (!r.project_id && (!r.company_id || r.company_id === company())),
    );
  const model = {
    mode: "dashboard",
    kind: "company",
    records: [],
    catalogs: {},
    editing: null,
    events: [],
  };
  const dashboard = createProjectDashboard({
    invoke,
    state,
    render,
    document,
    window,
    FormData,
    onLocationSaved: refresh,
    editProfile: () => {
      model.kind = "project_profile";
      model.records = visibleRecords();
      model.mode = "directories";
      model.editing = structuredClone(
        model.records[0] || {
          name:
            state.projects.find((p) => p.id === state.projectId)?.name || "",
          attributes: {},
          revision: 0,
          project_id: state.projectId,
        },
      );
    },
  });
  async function refresh() {
    const kinds = Object.keys(directoryKinds);
    const values = await Promise.all(
      kinds.map((kind) =>
        invoke("list_management_records", { kind, projectId: null }),
      ),
    );
    model.catalogs = Object.fromEntries(
      kinds.map((kind, index) => [kind, values[index]]),
    );
    model.records = visibleRecords();
    state.units = model.catalogs.unit;
    state.trades = model.catalogs.trade;
    if (scoped()) await dashboard.refresh();
  }
  const belongs = (r) =>
    !organization() ||
    (r.kind === "company"
      ? r.id === company()
      : !r.company_id || r.company_id === company());
  const options = (kind) => [
    ["", "Seleccionar"],
    ...(model.catalogs[kind] || [])
      .filter(belongs)
      .map((record) => [record.id, record.name]),
  ];
  function profileEditor(item) {
    const attrs = item.attributes || {},
      main = [
        "building_type",
        "estimated_area",
        "estimated_dimensions",
        "address",
        "locality",
        "province",
        "start_date",
        "end_date",
      ];
    const input = ([key, label, type]) =>
      type === "textarea"
        ? `<label class="field profile-description"><span>${e(label)}</span><textarea name="attr-${e(key)}" rows="3" maxlength="20000">${e(attrs[key] || "")}</textarea></label>`
        : Array.isArray(type)
          ? select(label, "attr-" + key, type, attrs[key])
          : field(
              label,
              "attr-" + key,
              attrs[key] || "",
              type === "date" ? 'type="date"' : "",
            );
    return `<main class="feature-page physical-profile-page"><div class="feature-toolbar"><button class="btn" data-action="manage-dashboard">← Tablero de obra</button><h1>Ficha de la obra</h1></div><form id="management-form" class="physical-profile-editor"><div class="profile-main-grid">${field("Nombre", "name", item.name || "", 'required maxlength="500"')}${fields.project_profile
      .filter(([key]) => main.includes(key))
      .map(input)
      .join(
        "",
      )}</div>${input(["description", "Memoria descriptiva", "textarea"])}<details><summary>Datos adicionales y parámetros económicos</summary><div class="profile-main-grid">${fields.project_profile
      .filter(([key]) => !main.includes(key) && key !== "description")
      .map(input)
      .join(
        "",
      )}${field("Código", "code", item.code || "")}</div></details><input type="hidden" name="company_id" value="${e(item.company_id || "")}"><input type="hidden" name="parent_id" value="${e(item.parent_id || "")}"><input type="hidden" name="client_id" value="${e(item.client_id || state.projects.find((p) => p.id === state.projectId)?.client_id || "")}"><div class="compact-editor-actions"><button class="btn primary" type="submit">Guardar ficha</button><button class="btn" type="button" data-action="manage-cancel">Cancelar</button></div><p class="feature-error" role="alert"></p></form></main>`;
  }
  function markup() {
    const item = model.editing;
    if (scoped() && model.kind === "project_profile" && item)
      return profileEditor(item);
    if (
      scoped() &&
      model.kind === "project_profile" &&
      !item &&
      model.mode === "directories"
    )
      model.mode = "dashboard";
    if (scoped() && model.mode === "dashboard")
      return `<main class="feature-page"><div class="feature-toolbar"><h1>Proyecto</h1>${(() => {const last=state.estimates.find(e=>e.id===state.lastBudgetByProject?.[state.projectId]);return last ? `<button class="btn primary" data-action="manage-dashboard-budget" data-id="${e(last.id)}">Ir al presupuesto: ${e(last.title)}</button>` : "";})()}<button class="btn primary" data-action="manage-dashboard-profile">${state.remoteProject ? "Consultar ficha" : "Editar proyecto"}</button>${state.remoteProject ? "" : entityActions("project",state.projectId,state.projects.find(p=>p.id===state.projectId)?.name||"obra")}</div>${dashboard.markup(model.catalogs)}</main>`;
    return `<main class="feature-page"><div class="feature-toolbar">${scoped() ? '<button class="btn" data-action="manage-dashboard">← Tablero de obra</button>' : ""}<h1>${scoped() ? "Datos de la obra" : organization() ? "Directorios de " + e(organization().name) : "Directorios"}</h1>${select(
      "Directorio",
      "management-kind",
      Object.entries(directoryKinds).filter(([kind]) =>
        scoped()
          ? projectKinds.includes(kind)
          : !["company", "supplier", "client_profile"].includes(kind),
      ),
      model.kind,
    )}<button class="btn primary" data-action="manage-new">Nuevo registro</button>${scoped() || state.organizationId ? "" : '<button class="btn" data-action="manage-audit">Historial de cambios</button>'}</div>
      <div class="feature-columns"><section><table class="data-grid"><thead><tr><th>Código</th><th>Nombre</th><th></th></tr></thead><tbody>${model.records.map((record) => `<tr><td>${e(record.code)}</td><td>${e(record.name)}</td><td><button class="btn" data-action="manage-edit" data-id="${e(record.id)}">Editar</button></td></tr>`).join("") || '<tr><td colspan="3">Sin registros. Creá el primero con el botón superior.</td></tr>'}</tbody></table></section>
      ${
        item
          ? `<form id="management-form" class="feature-editor"><h2>${item.id ? "Editar" : "Nuevo"} · ${e(directoryKinds[model.kind])}</h2>${field("Nombre", "name", item.name, "required maxlength=500")}${field("Código", "code", item.code)}
        ${company() ? `<p>Organización: <strong>${e(organization()?.name)}</strong></p>` : model.kind !== "company" ? select("Empresa", "company_id", options("company"), item.company_id) : ""}
        ${scoped() ? `<p>Obra: <strong>${e(state.projects.find((p) => p.id === state.projectId)?.name)}</strong></p>` : select("Obra relacionada", "project_id", [["", "Sin obra"], ...state.projects.map((project) => [project.id, project.name])], item.project_id)}
        ${select("Cliente relacionado", "client_id", [["", "Sin cliente"], ...state.clients.map((client) => [client.id, client.name])], item.client_id)}
        ${select(
          "Registro superior / entidad del contacto",
          "parent_id",
          [
            ["", "Sin superior"],
            ...Object.values(model.catalogs)
              .flat()
              .filter(
                (record) =>
                  record.id !== item.id &&
                  belongs(record) &&
                  (!scoped() ||
                    !record.project_id ||
                    record.project_id === state.projectId),
              )
              .map((record) => [record.id, record.name]),
          ],
          item.parent_id,
        )}
        ${(fields[model.kind] || []).map(([key, label, type]) => (Array.isArray(type) ? select(label, "attr-" + key, type, item.attributes[key]) : ["user", "establishment", "category"].includes(type) ? select(label, "attr-" + key, options(type), item.attributes[key]) : type === "textarea" ? `<label class="field"><span>${e(label)}</span><textarea name="attr-${e(key)}" rows="5" maxlength="20000">${e(item.attributes[key] || "")}</textarea></label>` : field(label, "attr-" + key, item.attributes[key] || "", type === "date" ? 'type="date"' : ""))).join("")}
        <button class="btn primary" type="submit">Guardar ficha</button><button class="btn" type="button" data-action="manage-cancel">Cancelar</button><p class="feature-error" role="alert"></p>
      </form>`
          : `<aside class="feature-editor"><h2>${scoped() ? "Datos de esta obra" : "Directorio central"}</h2><p>${scoped() ? "Las fichas mostradas pertenecen a la obra abierta. Administrá clientes y catálogos generales desde Inicio." : "Se muestran registros de esta organización y registros generales sin empresa asignada. Los datos públicos y el logotipo se editan desde su ficha."}</p></aside>`
      }</div>
      ${model.events.length ? `<section><h2>Historial de cambios</h2><table class="data-grid"><thead><tr><th>Fecha</th><th>Entidad</th><th>Operación</th><th>Identificador</th></tr></thead><tbody>${model.events.map((event) => `<tr><td>${e(event.occurred_at)}</td><td>${e(event.entity_type)}</td><td>${e(event.operation)}</td><td>${e(event.entity_id)}</td></tr>`).join("")}</tbody></table></section>` : ""}</main>`;
  }
  async function act(button) {
    const action = button.dataset.action;
    if (
      ["manage-dashboard", "manage-directories"].includes(action) &&
      state.pageDirty
    ) {
      if (
        !window.confirm(
          "¿Descartar los cambios sin guardar antes de cambiar de vista?",
        )
      )
        return;
      state.pageDirty = false;
      dashboard.resetTransient();
    }
    if (
      action.startsWith("manage-map-") ||
      action.startsWith("manage-attachment-") ||
      action.startsWith("manage-dashboard-")
    ) {
      await dashboard.act(button);
      return;
    }
    if (action === "manage-dashboard") {
      model.mode = "dashboard";
      model.editing = null;
      await dashboard.refresh();
    }
    if (action === "manage-directories") model.mode = "directories";
    if (action === "open-management") {
      dashboard.resetTransient();
      state.view =
        state.organizationId && !state.projectId
          ? "organizations"
          : "management";
      model.mode = "dashboard";
      dashboard.model.mapExpanded = false;
      model.kind = scoped() ? "project_profile" : "establishment";
      model.editing = null;
      model.events = [];
      model.records = [];
      model.catalogs = {};
      await refresh();
    }
    if (action === "manage-new") {
      dashboard.resetTransient();
      model.mode = "directories";
      model.editing = {
        attributes: {},
        revision: 0,
        project_id: state.projectId,
      };
    }
    if (action === "manage-edit")
      model.editing = structuredClone(
        model.records.find((record) => record.id === button.dataset.id),
      );
    if (action === "manage-cancel") {
      if (
        state.pageDirty &&
        !window.confirm("¿Descartar los cambios de la ficha?")
      )
        return;
      model.editing = null;
      state.pageDirty = false;
      if (scoped()) model.mode = "dashboard";
    }
    if (action === "manage-audit" && !state.organizationId)
      model.events = await invoke("list_change_events", { after: 0 });
    render();
  }
  async function change(target) {
    if (target.name === "attachment-description") {
      dashboard.model.attachmentDescription = target.value;
      return;
    }
    if (target.name !== "management-kind") return;
    if (
      state.pageDirty &&
      !window.confirm(
        "¿Descartar los cambios de la ficha antes de cambiar de directorio?",
      )
    ) {
      target.value = model.kind;
      return;
    }
    state.pageDirty = false;
    model.mode = "directories";
    model.kind = target.value;
    model.editing = null;
    model.records = visibleRecords();
    render();
  }
  async function submit(form) {
    if (form.id === "project-attachment-form") return dashboard.submit(form);
    const data = new FormData(form),
      value = (key) => String(data.get(key) || "").trim();
    const attributes = {
      ...(model.editing.attributes || {}),
      ...Object.fromEntries(
        (fields[model.kind] || []).map(([key]) => [key, value("attr-" + key)]),
      ),
    };
    if (
      model.kind === "project_profile" &&
      ["address", "locality", "province"].some(
        (key) => attributes[key] !== model.editing.attributes?.[key],
      )
    ) {
      delete attributes.address_lookup_status;
      delete attributes.address_lookup_point;
    }
    const record = {
      id: model.editing.id || window.crypto.randomUUID(),
      kind: model.kind,
      name: value("name"),
      code: value("code"),
      revision: model.editing.revision,
      company_id: company() || value("company_id") || null,
      parent_id: value("parent_id") || null,
      project_id: scoped() ? state.projectId : value("project_id") || null,
      client_id: value("client_id") || null,
      attributes,
    };
    await invoke("save_management_record", { record });
    await refresh();
    model.editing = null;
    if (scoped()) model.mode = "dashboard";
    state.message = "Ficha guardada";
    render();
  }
  return {
    markup,
    act,
    change,
    submit,
    model,
    afterRender: dashboard.afterRender,
    wheel: dashboard.wheel,
    pointerDown: dashboard.pointerDown,
    pointerMove: dashboard.pointerMove,
    pointerUp: dashboard.pointerUp,
    cancelPointer: dashboard.cancelPointer,
  };
}
