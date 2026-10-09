import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../src/workspace.js", import.meta.url), "utf8")
  .replace(/^import .+;\s*$/gm, "");

function setup() {
  const root = { innerHTML: "" };
  const listeners = {};
  const line = {
    id: "line-1", description: "Montaje de estructura", unit: "kg",
    quantity: "120", unit_cost: "2000", total: "240000", analysis_id: "acu-1",
  };
  const lines = [line];
  const calls = [];
  const responses = {
    list_clients: () => [{ id: "client-1", name: "Cliente demo", cuit: null }],
    list_projects: () => [{ id: "project-1", name: "Nave industrial", client_id: "client-1", currency: "Ars" }],
    list_resources: () => [{ id: "resource-1", code: "MAT-01", description: "Acero", kind: "material", unit: "kg", price: "1800" }],
    list_analyses: () => [{ id: "acu-1", code: "ACU-01", description: "Montaje", unit: "kg", unit_cost: "2000" }],
    list_project_estimates: () => [{ id: "estimate-1", title: "Cotización inicial", currency: "ARS", issued: false }],
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
  runInNewContext(source, { invoke, document, window, FormData: FakeFormData, Date });
  const click = async (action, id, extra = {}) => {
    const button = { dataset: { action, id, ...extra }, disabled: false,
      classList: { contains: () => false } };
    await listeners.click({ target: { closest: () => button } });
  };
  return { root, calls, click, listeners, lines };
}

test("renders compact project list, budget grid and ACU breakdown", async () => {
  const app = setup();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(app.root.innerHTML, /Obras y presupuestos/);
  assert.match(app.root.innerHTML, /Nave industrial/);
  await app.click("open-project", "project-1");
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
  await app.click("modal-line");
  assert.match(app.root.innerHTML, /Agregar partida/);
  assert.doesNotMatch(app.root.innerHTML, /Editar partida/);
  const submit = { disabled: false, isConnected: true };
  const form = {
    id: "dialog-form",
    dataset: { kind: "line" },
    values: { description: "Soldadura", unit: "h", quantity: "10", unitCost: "200", sectionId: "" },
    querySelector() { return submit; },
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
