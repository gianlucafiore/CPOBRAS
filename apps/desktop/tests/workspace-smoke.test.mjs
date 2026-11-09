import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceApp } from "../src/app.js";

function setup() {
  const root = { innerHTML: "",querySelectorAll:()=>[] };
  const listeners = {};
  const line = {
    id: "line-1", description: "Montaje de estructura", unit: "kg",
    quantity: "120", unit_cost: "2000", total: "240000", analysis_id: "acu-1",
  };
  const lines = [line];
  const calls = [];
  const responses = {
    get_estimate_resource_prices:()=>({"resource-1":"2000"}),
    get_project_plan:()=>null,
    list_operations:()=>[],
    list_project_attachments:()=>[],
    get_estimate_metadata:()=>({}),
    list_management_records: () => [],
    p2p_projects:()=>[],
    list_persons:({role})=>role==="client"?[{id:"client-1",name:"Cliente demo",cuit:null,email:"",phone:"",address:"",code:"",role:"client",revision:1,supplier_record_id:null}]:[],
    list_organizations:()=>[{id:"org-1",name:"Mi organización",ownership:"own",is_default:true,company_id:null,revision:0,profile:{logo_png:[]}}],
    list_clients: () => [{ id: "client-1", name: "Cliente demo", cuit: null }],
    list_projects: () => [{ id: "project-1", name: "Nave industrial", client_id: "client-1", currency: "Ars" }],
    list_resources: () => [{ id: "resource-1", code: "MAT-01", description: "Acero", kind: "material", unit: "kg", price: "1800" }],
    list_analyses: () => [{ id: "acu-1", code: "ACU-01", description: "Montaje", unit: "kg", unit_cost: "2000" }],
    list_project_estimates: () => [{ id: "estimate-1", title: "Cotización inicial", currency: "ARS", issued: false }],
    list_measured_lines:()=>[],
    list_estimate_lines: () => [...lines],
    list_budget_sections: () => [{ id: "section-1", estimate_id: "estimate-1", parent_id: null, code: "01", title: "ESTRUCTURA", position: 0 }],
    list_line_sections: () => [{ line_id: "line-1", section_id: "section-1" }],
    get_estimate_pricing: () => ({ general_expenses_percent: "10", profit_percent: "15", discount_percent: "0", tax_percent: "21" }),
    priced_estimate_total: () => ({ direct: "240000", general_expenses: "24000", profit: "39600", discount: "0", taxable_subtotal: "303600", taxes: "63756", total: "367356" }),
    get_analysis_details: () => ({ code: "ACU-01", description: "Montaje", unit: "kg", unit_cost: "2000", components: [
      { resource_id: "resource-1", description: "Acero", kind: "material", quantity: "1", unit_price: "2000", total: "2000" },
    ] }),
    list_takeoffs: () => [{ id: "takeoff-1", estimate_id: "estimate-1", line_id: "line-1", note: "Viga", factor: "2", length: "5", width: "1", height: "1", sign: 1, position: 0, quantity: "10" }],
    list_price_history: () => [{ id: "price-1", effective_date: "2026-10-01", currency: "ARS", amount: "1800", source: "Proveedor" }],
    update_analysis: ({ analysisId, code, description, unit, components }) => {
      assert.equal(analysisId, "acu-1");
      assert.equal(components[0].unitPrice, "2800");
      return { id: analysisId, code, description, unit, unit_cost: "2800" };
    },
    update_resource: ({ resourceId, code, description, unit, kind, active }) => {
      assert.equal(resourceId, "resource-1");
      assert.equal(active, true);
      return { id: resourceId, code, description, unit, kind, active, price: "1800" };
    },
    refresh_draft_analysis_costs: () => ({
      updated_lines: 1,
      old_direct_total: "240000",
      new_direct_total: "336000",
    }),
    add_estimate_line: ({ description, unit, quantity, unitCost }) => {
      const added = { id: "line-2", description, unit, quantity, unit_cost: unitCost,
        total: String(Number(quantity) * Number(unitCost)), analysis_id: null };
      lines.push(added);
      return added;
    },
  };
  const invoke = async (name, args) => {
    calls.push([name, args]);
    assert.ok(responses[name], "Missing fake Tauri command " + name);
    return responses[name](args);
  };
  const document = {
    querySelector(selector) { return selector === "#app" ? root : null; },
    querySelectorAll() { return []; },
    addEventListener(name, callback) { listeners[name] = callback; },
  };
  const window = { confirm: () => true, prompt: () => "Revisión" };
  class FakeFormData {
    constructor(form) { this.values = form.values; }
    get(name) { return this.values[name] ?? null; }
  }
  createWorkspaceApp({ invoke, document, window, FormData: FakeFormData });
  const click = async (action, id, extra = {}) => {
    const button = { dataset: { action, id, ...extra }, disabled: false,
      classList: { contains: () => false } };
    await listeners.click({ target: { closest: () => button }, preventDefault() {} });
  };
  return { root, calls, click, listeners, lines };
}

test("renders compact project list, budget grid and ACU breakdown", async () => {
  const app = setup();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(app.root.innerHTML, /Obras y presupuestos/);
  assert.match(app.root.innerHTML, /Nave industrial/);
  await app.click("open-project", "project-1");
  await app.click("manage-dashboard-budget", "estimate-1");
  assert.match(app.root.innerHTML, /workspace-columns/);
  assert.match(app.root.innerHTML, /ESTRUCTURA/);
  assert.match(app.root.innerHTML, /Montaje de estructura/);
  assert.match(app.root.innerHTML, /367\.356,00/);
  assert.match(app.root.innerHTML, /Acero/);
  assert.ok(app.calls.some(([name]) => name === "list_line_sections"));
  assert.ok(app.calls.some(([name]) => name === "get_analysis_details"));

  await app.click("panel", undefined, { panel: "takeoffs" });
  assert.match(app.root.innerHTML, /Metrados/);
  assert.match(app.root.innerHTML, /Viga/);

  await app.click("panel", undefined, { panel: "summary" });
  assert.match(app.root.innerHTML, /Gastos generales/);
  assert.match(app.root.innerHTML, /Impuestos/);
});

test("opens a new-line popup and saves through Tauri, then returns to the grid", async () => {
  const app = setup();
  await new Promise(resolve => setImmediate(resolve));
  await app.click("open-project", "project-1");
  await app.click("manage-dashboard-budget", "estimate-1");
  await app.click("modal-line");
  assert.match(app.root.innerHTML, /Agregar partida/);
  assert.doesNotMatch(app.root.innerHTML, /<h2>Editar partida<\/h2>/);
  const submit = { disabled: false, isConnected: true };
  const form = {
    id: "dialog-form",
    dataset: { kind: "line" },
    values: { description: "Soldadura", unit: "h", quantity: "10", unitCost: "200", sectionId: "" },
    querySelector(selector) { return selector === ".unit-search" ? null : submit; },
  };
  await app.listeners.submit({ target: form, preventDefault() {} });
  assert.ok(app.calls.some(([name]) => name === "add_estimate_line"));
  assert.match(app.root.innerHTML, /Soldadura/);
  assert.doesNotMatch(app.root.innerHTML, /class="modal-overlay"/);
});

test("catalog and ACU library open in their compact table views", async () => {
  const app = setup();
  await new Promise(resolve => setImmediate(resolve));
  await app.click("navigate", undefined, { view: "resources" });
  assert.match(app.root.innerHTML, /Biblioteca de insumos/);
  await app.click("select-resource", "resource-1");
  assert.match(app.root.innerHTML, /Proveedor/);
  await app.click("navigate", undefined, { view: "analyses" });
  await app.click("select-analysis", "acu-1");
  assert.match(app.root.innerHTML, /COMPOSICIÓN DEL ACU/);
  assert.match(app.root.innerHTML, /Acero/);
});

test("ACU edits expose component prices without mutating the issued estimate", async () => {
  const app = setup();
  await new Promise(resolve => setImmediate(resolve));
  await app.click("navigate", undefined, { view: "analyses" });
  await app.click("edit-analysis", "acu-1");
  assert.match(app.root.innerHTML, /Editar análisis de costo unitario/);
  assert.match(app.root.innerHTML, /Precio unitario ARS/);
  const values = {
    code: "ACU-01", description: "Montaje actualizado", unit: "kg"
  };
  const component = {
    querySelector(selector) {
      if (selector.includes('name="resource"')) return { value: "resource-1" };
      if (selector.includes('name="quantity"')) return { value: "1" };
      if (selector.includes('name="unitPrice"')) return { value: "2800" };
      return null;
    }
  };
  const submit = { disabled: false, isConnected: true };
  const form = {
    id: "dialog-form", dataset: { kind: "analysis" }, values,
    querySelector(selector) { return selector === '[type="submit"]' ? submit : null; },
    querySelectorAll(selector) { return selector === ".component-row" ? [component] : []; }
  };
  await app.listeners.submit({ target: form, preventDefault() {} });
  assert.ok(app.calls.some(([name]) => name === "update_analysis"));
  assert.doesNotMatch(app.root.innerHTML, /class="modal-overlay"/);
  await app.click("open-project", "project-1");
  await app.click("manage-dashboard-budget", "estimate-1");
  await app.click("refresh-draft-costs");
  assert.ok(app.calls.some(([name]) => name === "refresh_draft_analysis_costs"));
  assert.match(app.root.innerHTML, /partidas actualizadas/);
});

test("resource metadata editing is separated from price history", async () => {
  const app = setup();
  await new Promise(resolve => setImmediate(resolve));
  await app.click("navigate", undefined, { view: "resources" });
  await app.click("edit-resource", "resource-1");
  assert.match(app.root.innerHTML, /Editar insumo/);
  assert.match(app.root.innerHTML, /precios históricos/);
  const submit = { disabled: false, isConnected: true };
  const form = {
    id: "dialog-form", dataset: { kind: "resource" },
    values: { code: "MAT-01", description: "Acero laminado", unit: "kg", kind: "material", active: "true" },
    querySelector(selector) { return selector === '[type="submit"]' ? submit : null; }
  };
  await app.listeners.submit({ target: form, preventDefault() {} });
  assert.ok(app.calls.some(([name]) => name === "update_resource"));
});

