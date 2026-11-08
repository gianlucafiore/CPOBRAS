import { multiplyDecimals, sumDecimals } from "../decimal.js";
export const permissionLabels = {
  budget: "Presupuesto",
  price: "Determinación de precio",
  resources: "Insumos y composiciones",
  operations: "Gestión de obra",
  accounting: "Contabilidad y finanzas",
  planning: "Planificación",
  project_data: "Datos de obra",
};
export const allPermissions = () =>
  Object.fromEntries(Object.keys(permissionLabels).map((k) => [k, true]));
export const permissionsFor = (state) => ({
  ...allPermissions(),
  ...state.remoteProject?.data?.permissions,
});
export const mayRead = (state, key) =>
  !state.remoteProject || permissionsFor(state)[key];
const clone = (value) => structuredClone(value);
export function createRemoteInvoke(nativeInvoke, state) {
  return async function invoke(command, args = {}) {
    const remote = state.remoteProject;
    if (!remote) return nativeInvoke(command, args);
    const d = remote.data,
      p = permissionsFor(state);
    const requirePermission = (key) => {
      if (!p[key]) throw new Error("El propietario no autorizó este apartado.");
    };
    const budget = () => {
      const b = d.budgets.find(
        (b) => b.estimate.id === (args.estimateId || state.estimateId),
      );
      if (!b)
        throw new Error("El presupuesto no pertenece a la copia abierta.");
      return b;
    };
    if (args.projectId && args.projectId !== d.project.id)
      throw new Error("La consulta no pertenece a la obra externa abierta.");
    const projected = () => {
      switch (command) {
        case "list_project_estimates":
          return d.budgets.map((b) => b.estimate);
        case "get_estimate_metadata":return p.budget?(budget().metadata||{}):{};
        case "list_measured_lines":return p.budget?(budget().measured_line_ids||[]):[];
        case "list_project_attachments":return [];
        case "list_estimate_lines":
          return budget().document.lines.map((l) => ({
            ...l,
            unit_cost: l.unit_cost_snapshot,
            total: multiplyDecimals(l.quantity, l.unit_cost_snapshot),
          }));
        case "list_budget_sections":
          return budget().document.sections;
        case "list_line_sections":
          return budget().document.assignments.map(([line_id, section_id]) => ({
            line_id,
            section_id,
          }));
        case "get_estimate_pricing":
          return p.price ? budget().document.rates : {};
        case "priced_estimate_total":
          return p.price
            ? budget().pricing.calculation?.breakdown || budget().totals || {}
            : budget().totals || {};
        case "get_price_definition":
          requirePermission("price");
          return budget().pricing;
        case "calculate_price_definition":
          requirePermission("price");
          return budget().pricing.calculation;
        case "list_price_templates":
          return [];
        case "get_estimate_resource_prices":
          return p.resources ? budget().resource_prices || {} : {};
        case "get_analysis_details": {
          requirePermission("resources");
          const a = d.budgets
            .flatMap((b) => b.document.line_analyses || [])
            .find((a) => a.id === args.analysisId);
          if (!a) throw new Error("Composición no incluida en esta copia.");
          const components = a.components.map((c) => ({
            ...c,
            kind: String(c.kind).toLowerCase(),
            quantity: c.quantity_per_unit,
            total: multiplyDecimals(c.quantity_per_unit, c.unit_price),
          }));
          return {
            ...a,
            components,
            unit_cost: sumDecimals(components.map((c) => c.total)),
          };
        }
        case "list_takeoffs":
          return budget().document.takeoffs.filter(
            (t) => t.line_id === args.lineId,
          );
        case "get_project_plan":
          requirePermission("planning");
          return d.planning;
        case "list_plan_baselines":
          requirePermission("planning");
          return d.baselines;
        case "list_plan_revisions":
          requirePermission("planning");
          return d.plan_revisions || [];
        case "list_management_records":
          return [
            ...(d.records || []),
            ...(d.parties || []).filter(Boolean),
          ].filter(
            (r, i, a) =>
              r.kind === args.kind && a.findIndex((x) => x.id === r.id) === i,
          );
        case "list_change_events":
          return [];
        case "list_operations":
          return d.operations;
        case "list_warehouses":
          return d.warehouses;
        case "stock_balances":
          return d.stock;
        case "operations_report": {
          if (!p.operations && !p.accounting)
            throw new Error("Sin acceso a gestión.");
          const b = args.estimateId ? budget() : d.budgets[0];
          return (
            b?.report || {
              project_id: d.project.id,
              name: d.project.name,
              as_of: d.as_of || "",
              estimate_id: args.estimateId || null,
              summaries: [],
              cash_flow: [],
              production: [],
              costs: [],
              section_results: [],
              quotes: [],
              needs: [],
              alerts: [
                "Esta copia no incluye el informe detallado. Actualizá cuando el propietario tenga la nueva versión.",
              ],
              scheduled_finish: null,
              planned_percent: null,
            }
          );
        }
        case "get_budget_print_data":
          if (!budget().print_data)
            throw new Error(
              "La copia no incluye los datos necesarios para esta impresión.",
            );
          return budget().print_data;
        case "export_budget_document":
          requirePermission("budget");
          return budget().document;
        case "get_print_profile":
          return {
            revision: d.organization.revision,
            profile: d.organization.profile,
          };
        case "list_resources":
          return p.resources
            ? d.resources
                .filter(Boolean)
                .map((r) => ({
                  ...r,
                  kind: String(r.kind || "material").toLowerCase(),
                }))
            : [];
        case "list_analyses":
          return p.resources
            ? d.budgets
                .flatMap((b) => b.document.line_analyses || [])
                .map((a) => ({
                  ...a,
                  unit_cost: sumDecimals(
                    a.components.map((c) =>
                      multiplyDecimals(c.quantity_per_unit, c.unit_price),
                    ),
                  ),
                }))
            : [];
        default:
          throw new Error("La obra externa es de solo lectura.");
      }
    };
    if (
      [
        "p2p_status",
        "p2p_projects",
        "p2p_read",
        "p2p_sync",
        "write_export",
        "open_export_pdf",
      ].includes(command)
    )
      return nativeInvoke(command, args);
    if (command === "calculate_schedule") {
      requirePermission("planning");
      return nativeInvoke(command, args);
    }
    return clone(projected());
  };
}
const viewActions = new Set([
  "go-home",
  "open-workspace",
  "open-price-determination",
  "open-operations",
  "open-planning",
  "open-management",
  "open-budget-printing",
  "select-line",
  "select-section",
  "panel",
  "toggle-section",
  "dismiss-toast",
  "close-modal",
  "price-back",
  "price-select",
  "price-reload",
  "price-export",
  "price-close-modal",
  "plan-edit",
  "plan-view",
  "plan-cancel",
  "manage-edit",
  "manage-dashboard",
  "manage-directories",
  "manage-dashboard-profile",
  "manage-dashboard-budget",
  "manage-map-expand",
  "manage-map-close",
  "ops-tab",
  "ops-detail",
  "ops-open-detail",
  "ops-close-detail",
  "ops-refresh",
  "ops-export",
  "printing-export",
  "printing-open-pdf",
  "printing-back",
]);
export function remoteActionAllowed(state, button) {
  if (!state.remoteProject) return true;
  const a = button.dataset.action;
  if (!viewActions.has(a)) return false;
  const p = permissionsFor(state);
  if (a === "open-workspace" && !p.budget) return false;
  if (a === "open-price-determination" && !p.price) return false;
  if (a === "open-planning" && !p.planning) return false;
  if (a === "open-management" && !p.project_data) return false;
  if (a === "open-operations" && !p.operations && !p.accounting) return false;
  if (
    a === "panel" &&
    ["acu", "resources"].includes(button.dataset.panel) &&
    !p.resources
  )
    return false;
  if (a === "panel" && button.dataset.panel === "summary" && !p.price)
    return false;
  if (a === "ops-tab" && button.dataset.tab === "finance" && !p.accounting)
    return false;
  if (
    a === "ops-tab" &&
    !["finance", "dashboard"].includes(button.dataset.tab) &&
    !p.operations
  )
    return false;
  return true;
}
export function protectRemoteControls(root, state) {
  if (!state.remoteProject) return;
  const p = permissionsFor(state);
  for (const button of root.querySelectorAll("button[data-action]")) {
    if (!remoteActionAllowed(state, button)) {
      button.disabled = true;
      button.title = "Obra externa de solo lectura o apartado no autorizado";
    }
  }
  for (const button of root.querySelectorAll("[data-action=manage-edit]"))
    button.textContent = "Ver ficha";
  for (const title of root.querySelectorAll(
    "#management-form h2,#planning-task-form h2",
  ))
    title.textContent = title.textContent.replace(/^Editar/, "Consultar");
  for (const field of root.querySelectorAll(
    "main input,main textarea,main select,.operations-page input,.operations-page textarea,.operations-page select",
  )) {
    const allowed =
      field.matches("[data-search]") ||
      [
        "planning-baseline",
        "pert-query",
        "planning-history",
        "management-kind",
        "ops-report-scope",
        "ops-kind",
      ].includes(field.name) ||
      state.view === "budget-printing";
    if (!allowed) field.disabled = true;
  }
  const scope = root.querySelector("[name=ops-report-scope]");
  if (scope)
    for (const option of scope.options) {
      if (
        (!p.accounting &&
          ["summary", "cash", "costs", "sections"].includes(option.value)) ||
        (!p.resources && ["needs", "stock"].includes(option.value))
      )
        option.hidden = true;
    }
  for (const submit of root.querySelectorAll("form button[type=submit]"))
    if (state.view !== "budget-printing") submit.disabled = true;
  for (const node of root.querySelectorAll("[draggable=true]"))
    node.draggable = false;
  if (!p.accounting)
    root
      .querySelectorAll("[data-action=ops-tab][data-tab=finance]")
      .forEach((b) => (b.hidden = true));
  if (!p.operations)
    root
      .querySelectorAll("[data-action=ops-tab]:not([data-tab=finance])")
      .forEach((b) => (b.hidden = true));
  if (!p.resources)
    root
      .querySelectorAll(
        "[data-action=panel][data-panel=acu],[data-action=panel][data-panel=resources]",
      )
      .forEach((b) => (b.hidden = true));
  if (!p.price)
    root
      .querySelectorAll("[data-action=panel][data-panel=summary]")
      .forEach((b) => (b.hidden = true));
}
