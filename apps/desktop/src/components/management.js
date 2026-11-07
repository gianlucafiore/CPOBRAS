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
    kind: "company",
    records: [],
    catalogs: {},
    editing: null,
    events: [],
  };
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
  function markup() {
    const item = model.editing;
    return `<main class="feature-page"><div class="feature-toolbar"><h1>${scoped() ? "Datos de la obra" : organization() ? "Directorios de " + e(organization().name) : "Directorios"}</h1>${select(
      "Directorio",
      "management-kind",
      Object.entries(directoryKinds).filter(([kind]) =>
        scoped() ? projectKinds.includes(kind) : kind !== "company",
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
        ${(fields[model.kind] || []).map(([key, label, type]) => (Array.isArray(type) ? select(label, "attr-" + key, type, item.attributes[key]) : ["user", "establishment", "category"].includes(type) ? select(label, "attr-" + key, options(type), item.attributes[key]) : field(label, "attr-" + key, item.attributes[key] || "", type === "date" ? 'type="date"' : ""))).join("")}
        <button class="btn primary" type="submit">Guardar ficha</button><button class="btn" type="button" data-action="manage-cancel">Cancelar</button><p class="feature-error" role="alert"></p>
      </form>`
          : `<aside class="feature-editor"><h2>${scoped() ? "Datos de esta obra" : "Directorio central"}</h2><p>${scoped() ? "Las fichas mostradas pertenecen a la obra abierta. Administrá clientes y catálogos generales desde Inicio." : "Se muestran registros de esta organización y registros generales sin empresa asignada. Los datos públicos y el logotipo se editan desde su ficha."}</p></aside>`
      }</div>
      ${model.events.length ? `<section><h2>Historial de cambios</h2><table class="data-grid"><thead><tr><th>Fecha</th><th>Entidad</th><th>Operación</th><th>Identificador</th></tr></thead><tbody>${model.events.map((event) => `<tr><td>${e(event.occurred_at)}</td><td>${e(event.entity_type)}</td><td>${e(event.operation)}</td><td>${e(event.entity_id)}</td></tr>`).join("")}</tbody></table></section>` : ""}</main>`;
  }
  async function act(button) {
    const action = button.dataset.action;
    if (action === "open-management") {
      state.view =
        state.organizationId && !state.projectId
          ? "organizations"
          : "management";
      model.kind = scoped() ? "project_profile" : "establishment";
      model.editing = null;
      model.events = [];
      model.records = [];
      model.catalogs = {};
      await refresh();
    }
    if (action === "manage-new")
      model.editing = {
        attributes: {},
        revision: 0,
        project_id: state.projectId,
      };
    if (action === "manage-edit")
      model.editing = structuredClone(
        model.records.find((record) => record.id === button.dataset.id),
      );
    if (action === "manage-cancel") model.editing = null;
    if (action === "manage-audit" && !state.organizationId)
      model.events = await invoke("list_change_events", { after: 0 });
    render();
  }
  async function change(target) {
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
    model.kind = target.value;
    model.editing = null;
    model.records = visibleRecords();
    render();
  }
  async function submit(form) {
    const data = new FormData(form),
      value = (key) => String(data.get(key) || "").trim();
    const attributes = Object.fromEntries(
      (fields[model.kind] || []).map(([key]) => [key, value("attr-" + key)]),
    );
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
    state.message = "Ficha guardada";
    render();
  }
  return { markup, act, change, submit, model };
}
