import { e, field, select, dateToday } from "./helpers.js";
import { money, numeric, sumDecimals } from "../decimal.js";

export function createCostingWorkspace({ invoke, state, render, document, window, FormData }) {
 const model = { lists: [], suppliers: [], analyses: [], quotes: [], listId: "", analysisId: "", resourceId: "", history: [], editing: null, newList: false, asOf: dateToday(), result: null, scenario: null, conversion: null };
 const uuid = () => window.crypto.randomUUID();
 const resources = () => state.resources.map(resource => [resource.id, resource.code + " · " + resource.description]);
 async function refresh() {
  [model.lists, model.analyses, model.quotes, model.suppliers] = await Promise.all([invoke("list_price_lists"), invoke("list_nested_analyses"), invoke("list_fx_quotes"), invoke("list_management_records", { kind: "supplier", projectId: null })]);
  model.listId ||= model.lists[0]?.id || ""; model.analysisId ||= model.analyses[0]?.id || ""; model.resourceId ||= state.resources[0]?.id || "";
  if (model.listId && model.resourceId) model.history = await invoke("scoped_price_history", { listId: model.listId, resourceId: model.resourceId });
 }
 function readEditing(form = document.querySelector("#nested-analysis-form")) {
  if (!form || !model.editing) return;
  const data = new FormData(form), value = name => String(data.get(name) || "").trim();
  model.editing.code = value("code"); model.editing.description = value("description"); model.editing.unit = value("unit");
  model.editing.components = model.editing.components.map((component, index) => {
   const [type, id] = value("source-" + index).split(":");
   const variables = Object.fromEntries(value("variables-" + index).split(";").map(pair => pair.trim()).filter(Boolean).map(pair => { const split = pair.indexOf("="); if (split < 1) throw new Error("Escribí las variables como largo=3; ancho=2"); return [pair.slice(0, split).trim(), pair.slice(split + 1).trim()]; }));
   return { source: { type, id }, quantity_formula: value("quantity-" + index), variables, waste_percent: value("waste-" + index), production_coefficient: value("coefficient-" + index), yield_factor: value("yield-" + index) };
  });
 }
 function editor() {
  const item = model.editing; if (!item) return "";
  const sources = [...resources().map(([id, label]) => ["resource:" + id, label]), ...model.analyses.filter(analysis => analysis.id !== item.id).map(analysis => ["analysis:" + analysis.id, "ACU · " + analysis.code + " · " + analysis.description])];
  return `<form id="nested-analysis-form" class="feature-editor"><h2>ACU compuesto / insumo compuesto</h2>${field("Código", "code", item.code, "required")}${field("Descripción", "description", item.description, "required")}${field("Unidad", "unit", item.unit, "required")}${item.components.map((component, index) => `<fieldset><legend>Componente ${index + 1}</legend>${select("Insumo o ACU", "source-" + index, sources, component.source.type + ":" + component.source.id)}${field("Consumo o fórmula", "quantity-" + index, component.quantity_formula, "required")}${field("Variables (por ejemplo largo=3; ancho=2)", "variables-" + index, Object.entries(component.variables).map(([k, v]) => k + "=" + v).join("; "))}${field("Desperdicio %", "waste-" + index, component.waste_percent, 'type="number" min="0" step="any" required')}${field("Coeficiente de producción", "coefficient-" + index, component.production_coefficient, 'type="number" min="0" step="any" required')}${field("Rendimiento (divisor)", "yield-" + index, component.yield_factor, 'type="number" min="0.000001" step="any" required')}<button class="btn" type="button" data-action="cost-remove-component" data-index="${index}">Quitar</button></fieldset>`).join("")}<p>Consumo efectivo = fórmula × coeficiente × (1 + desperdicio / 100) ÷ rendimiento. Los ciclos entre análisis se rechazan.</p><button class="btn" type="button" data-action="cost-add-component">Agregar componente</button><button class="btn primary" type="submit">Guardar análisis</button><button class="btn" type="button" data-action="cost-cancel">Cancelar</button><p class="feature-error" role="alert"></p></form>`;
 }
 function markup() {
  return `<main class="feature-page"><div class="feature-toolbar"><h1>Costos, precios y escenarios</h1><button class="btn" data-action="cost-new-list">Nueva lista</button><button class="btn primary" data-action="cost-new-analysis">Nuevo ACU compuesto</button></div>
   <div class="feature-columns"><section>
   ${model.newList ? `<form id="price-list-form" class="feature-editor"><h2>Nueva lista de precios</h2>${field("Nombre", "name", "", "required")}${select("Proveedor", "supplier", [["", "Sin proveedor"], ...model.suppliers.filter(p=>p.attributes?.person_primary!=="false").map(supplier => [supplier.id, supplier.name])])}${select("Moneda", "currency", [["ARS", "ARS"], ["USD", "USD"]])}${field("Zona", "zone", "")}${field("Válida desde", "valid_from", dateToday(), 'type="date" required')}${field("Válida hasta (opcional)", "valid_until", "", 'type="date"')}<button class="btn primary" type="submit">Crear lista</button><p class="feature-error" role="alert"></p></form>` : ""}
   <form id="scoped-price-form" class="feature-editor"><h2>Historial de precios</h2>${select("Lista / moneda / zona", "cost-list", [["", "Seleccionar lista"], ...model.lists.map(list => [list.id, list.name + " · " + list.currency + " · " + list.zone])], model.listId)}${select("Insumo", "cost-resource", resources(), model.resourceId)}${field("Fecha del precio", "effective_date", dateToday(), 'type="date" required')}${field("Importe", "amount", "", 'type="number" min="0" step="any" required')}${field("Fuente verificable", "source", "", "required")}<button type="submit" class="btn primary">Registrar precio</button><p class="feature-error" role="alert"></p><table class="data-grid"><thead><tr><th>Vigencia</th><th>Precio</th><th>Fuente</th></tr></thead><tbody>${model.history.map(price => `<tr><td>${e(price.effective_date)}</td><td>${money(price.amount)}</td><td>${e(price.source)}</td></tr>`).join("")}</tbody></table></form>
   <form id="nested-calculate-form" class="feature-editor"><h2>Análisis y sensibilidad</h2>${select("ACU compuesto", "cost-analysis", [["", "Seleccionar análisis"], ...model.analyses.map(analysis => [analysis.id, analysis.code + " · " + analysis.description])], model.analysisId)}${field("Precios al", "as_of", model.asOf, 'type="date" required')}${select("Insumo a variar", "scenario-resource", [["", "Todos los insumos cotizados"], ...resources()])}${field("Variación de precio %", "variation", "0", 'type="number" min="-100" step="any" required')}<button class="btn primary" type="submit">Calcular escenario</button><button class="btn" type="button" data-action="cost-edit-analysis">Editar ACU seleccionado</button><p class="feature-error" role="alert"></p>${model.result ? `<div class="compare-cards"><span>BASE<b>${money(model.result.unit_cost)}</b></span><span>ESCENARIO<b>${money(model.scenario.unit_cost)}</b></span><span>DIFERENCIA<b>${money(sumDecimals([model.scenario.unit_cost, "-" + model.result.unit_cost]))}</b></span></div><table class="data-grid"><thead><tr><th>Insumo</th><th>Consumo efectivo</th></tr></thead><tbody>${Object.entries(model.result.resource_quantities).map(([id, quantity]) => `<tr><td>${e(state.resources.find(resource => resource.id === id)?.description || id)}</td><td>${numeric(quantity)}</td></tr>`).join("")}</tbody></table>` : ""}</form>
   <form id="selective-reprice-form" class="feature-editor"><h2>Actualizar precios de un ACU base</h2>${select("ACU base", "analysis", state.analyses.map(analysis => [analysis.id, analysis.code + " · " + analysis.description]))}${select("Actualizar", "resource", [["", "Todos los insumos del ACU"], ...resources()])}${field("Fecha de vigencia", "as_of", model.asOf, 'type="date" required')}<p>Usa la lista seleccionada arriba. Conserva los precios de los presupuestos anteriores; su traslado a borradores sigue siendo una operación explícita.</p><button class="btn primary" type="submit">Actualizar ACU con la lista</button><p class="feature-error" role="alert"></p></form>
   <form id="copy-base-analysis-form" class="feature-editor"><h2>Partir de un ACU existente</h2>${select("ACU base", "analysis", state.analyses.map(analysis => [analysis.id, analysis.code + " · " + analysis.description]))}<button class="btn" type="submit">Copiar a biblioteca compuesta</button><p class="feature-error" role="alert"></p></form>
   </section><aside>${editor()}
   <form id="fx-quote-form" class="feature-editor"><h2>Cotización explícita</h2>${select("Desde", "from", [["USD", "USD"], ["ARS", "ARS"]])}${select("Hacia", "to", [["ARS", "ARS"], ["USD", "USD"]])}${field("Fecha", "date", dateToday(), 'type="date" required')}${field("Fuente", "source", "", "required")}${field("Unidades de destino por unidad de origen", "rate", "", 'type="number" min="0.00000001" step="any" required')}<button class="btn primary" type="submit">Guardar cotización</button><p class="feature-error" role="alert"></p></form>
   <form id="fx-convert-form" class="feature-editor"><h2>Convertir importe</h2>${select("Cotización", "quote", model.quotes.map(saved => [saved.id, saved.quote.from + " → " + saved.quote.to + " · " + saved.quote.date + " · " + saved.quote.source]))}${field("Importe de origen", "amount", "1", 'type="number" step="any" required')}<button class="btn" type="submit">Convertir</button><p class="feature-error" role="alert"></p>${model.conversion != null ? `<strong>Resultado: ${money(model.conversion)}</strong>` : ""}</form>
   </aside></div></main>`;
 }
 async function act(button) {
  const action = button.dataset.action;
  if (action === "open-costing") { state.view = "costing"; await refresh(); }
  if (action === "cost-new-list") model.newList = true;
  if (action === "cost-new-analysis") model.editing = { id: uuid(), code: "", description: "", unit: "m²", components: [] };
  if (action === "cost-edit-analysis") model.editing = structuredClone(model.analyses.find(analysis => analysis.id === model.analysisId));
  if (action === "cost-cancel") model.editing = null;
  if (action === "cost-add-component") { readEditing(); const resource = state.resources[0]?.id, analysis = model.analyses.find(item => item.id !== model.editing.id)?.id; if (!resource && !analysis) throw new Error("Creá primero un insumo en el catálogo"); model.editing.components.push({ source: { type: resource ? "resource" : "analysis", id: resource || analysis }, quantity_formula: "1", variables: {}, waste_percent: "0", production_coefficient: "1", yield_factor: "1" }); }
  if (action === "cost-remove-component") { readEditing(); model.editing.components.splice(Number(button.dataset.index), 1); }
  render();
 }
 async function change(target) {
  if (target.name === "cost-list") { model.listId = target.value; model.result = null; }
  if (target.name === "cost-resource") model.resourceId = target.value;
  if (target.name === "cost-analysis") model.analysisId = target.value;
  if (["cost-list", "cost-resource"].includes(target.name)) { model.history = model.listId && model.resourceId ? await invoke("scoped_price_history", { listId: model.listId, resourceId: model.resourceId }) : []; render(); }
 }
 async function submit(form) {
  const data = new FormData(form), value = name => String(data.get(name) || "").trim();
  if (form.id === "price-list-form") { await invoke("create_price_list", { list: { id: uuid(), name: value("name"), supplier_id: value("supplier") || null, currency: value("currency"), zone: value("zone"), valid_from: value("valid_from"), valid_until: value("valid_until") || null } }); model.newList = false; await refresh(); }
  if (form.id === "scoped-price-form") { await invoke("register_scoped_price", { price: { id: uuid(), list_id: value("cost-list"), resource_id: value("cost-resource"), effective_date: value("effective_date"), amount: value("amount"), source: value("source") } }); await refresh(); }
  if (form.id === "nested-analysis-form") { readEditing(form); await invoke("save_nested_analysis", { analysis: model.editing }); model.analysisId = model.editing.id; model.editing = null; await refresh(); }
  if (form.id === "nested-calculate-form") {
   model.asOf = value("as_of"); model.analysisId = value("cost-analysis");
   const args = { analysisId: model.analysisId, listId: model.listId, asOf: model.asOf, changes: {} };
   model.result = await invoke("calculate_nested_cost", args);
   const ids = value("scenario-resource") ? [value("scenario-resource")] : Object.keys(model.result.resource_quantities);
   model.scenario = await invoke("calculate_nested_cost", { ...args, changes: Object.fromEntries(ids.map(id => [id, value("variation")])) });
  }
  if (form.id === "fx-quote-form") { await invoke("save_fx_quote", { quote: { from: value("from"), to: value("to"), date: value("date"), source: value("source"), rate: value("rate") } }); await refresh(); }
  if (form.id === "fx-convert-form") model.conversion = await invoke("convert_currency", { quoteId: value("quote"), amount: value("amount") });
  if (form.id === "selective-reprice-form") { await invoke("reprice_analysis_selective", { analysisId: value("analysis"), listId: model.listId, asOf: value("as_of"), resourceIds: value("resource") ? [value("resource")] : [] }); state.analyses = await invoke("list_analyses"); state.message = "ACU actualizado; los presupuestos conservan sus precios"; }
  if (form.id === "copy-base-analysis-form") { const detail = await invoke("get_analysis_details", { analysisId: value("analysis") }); model.editing = { id: uuid(), code: detail.code + "-C", description: detail.description, unit: detail.unit, components: detail.components.map(component => ({ source: { type: "resource", id: component.resource_id }, quantity_formula: component.quantity, variables: {}, waste_percent: "0", production_coefficient: "1", yield_factor: "1" })) }; }
  render();
 }
 return { markup, act, change, submit, model };
}
