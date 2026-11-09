import { entityActions } from "./entity-actions.js";
import { e, field, select, dateToday } from "./helpers.js";
import { money, numeric, sumDecimals } from "../decimal.js";

export function createCostingWorkspace({ invoke, state, render, document, window, FormData }) {
 const model = { loaded:false, open:{}, newPrice:false, newFx:false, showScenario:false, showConversion:false, lists: [], suppliers: [], analyses: [], quotes: [], listId: "", analysisId: "", resourceId: "", history: [], editing: null, newList: false, asOf: dateToday(), result: null, scenario: null, conversion: null };
 const uuid = () => window.crypto.randomUUID();
 const resources = () => state.resources.map(resource => [resource.id, resource.code + " · " + resource.description]);
 async function refresh() {
  [model.lists, model.analyses, model.quotes, model.suppliers] = await Promise.all([invoke("list_price_lists"), invoke("list_nested_analyses"), invoke("list_fx_quotes"), invoke("list_management_records", { kind: "supplier", projectId: null })]);
  model.listId ||= model.lists[0]?.id || ""; if(!model.analyses.some(a=>a.id===model.analysisId)) model.analysisId=model.analyses[0]?.id || ""; model.resourceId ||= state.resources[0]?.id || "";
  model.loaded=true;
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
 function markup(scope = "analyses") {
  if(!["resources","analyses","system-settings","costing"].includes(scope))return "";
  const section=scope==="costing"?"analyses":scope;
  const title={resources:"Listas e historial de precios",analyses:"ACU compuestos y comparación de costos","system-settings":"Cotizaciones de moneda"}[section];
  const panelOpen=model.open[section];
  if(!model.loaded)return `<details class="cost-tools" data-cost-tools="${section}" ${panelOpen?"open":""}><summary>${title}</summary><p class="cost-tools-body">Cargando herramientas…</p></details>`;
  const lists=select("Lista de precios","cost-list",[["","Seleccionar lista"],...model.lists.map(l=>[l.id,l.name+" · "+l.currency+" · "+l.zone])],model.listId);
  const listForm=model.newList ? `<form id="price-list-form" class="compact-cost-form"><h3>Nueva lista de precios</h3>${field("Nombre","name","","required")}${select("Proveedor","supplier",[["","Sin proveedor"],...model.suppliers.filter(p=>p.attributes?.person_primary!=="false"&&p.attributes?.person_active!=="false").map(p=>[p.id,p.name])])}${select("Moneda","currency",[["ARS","ARS"],["USD","USD"]])}${field("Zona","zone","")}${field("Válida desde","valid_from",dateToday(),'type="date" required')}${field("Válida hasta (opcional)","valid_until","",'type="date"')}<div class="cost-form-actions"><button class="btn primary" type="submit">Crear lista</button><button type="button" class="btn" data-action="cost-close-forms">Cerrar</button></div><p class="feature-error" role="alert"></p></form>` : "";
  const history=section==="resources" ? `<div class="feature-toolbar">${lists}${select("Insumo","cost-resource",resources(),model.resourceId)}<button class="btn tiny" data-action="cost-new-list">Nueva lista</button><button class="btn tiny" data-action="cost-new-price" ${model.listId&&model.resourceId?"":"disabled"}>Registrar precio</button></div>${listForm}${model.newPrice?`<form id="scoped-price-form" class="compact-cost-form"><h3>Registrar precio</h3><input type="hidden" name="cost-list" value="${e(model.listId)}"><input type="hidden" name="cost-resource" value="${e(model.resourceId)}">${field("Fecha del precio","effective_date",dateToday(),'type="date" required')}${field("Importe","amount","",'type="number" min="0" step="any" required')}${field("Fuente verificable","source","","required")}<div class="cost-form-actions"><button class="btn primary" type="submit">Registrar precio</button><button type="button" class="btn" data-action="cost-close-forms">Cerrar</button></div><p class="feature-error" role="alert"></p></form>`:""}<div class="cost-table-scroll"><table class="data-grid"><thead><tr><th>Vigencia</th><th>Precio</th><th>Fuente</th></tr></thead><tbody>${model.history.map(p=>`<tr><td>${e(p.effective_date)}</td><td>${money(p.amount)}</td><td>${e(p.source)}</td></tr>`).join("")||'<tr><td colspan="3">Elegí una lista y un insumo para consultar los precios.</td></tr>'}</tbody></table></div>`:"";
  const analysis=section==="analyses" ? `<div class="feature-toolbar"><button class="btn tiny" data-action="cost-new-analysis">Nuevo ACU compuesto</button><button class="btn tiny" data-action="cost-show-scenario">Comparar costos</button></div><div class="cost-table-scroll"><table class="data-grid"><thead><tr><th>Código</th><th>Descripción</th><th>Unidad</th><th></th></tr></thead><tbody>${model.analyses.map(a=>`<tr><td>${e(a.code)}</td><td>${e(a.description)}</td><td>${e(a.unit)}</td><td><button class="btn tiny" data-action="cost-edit-analysis" data-id="${a.id}">Editar</button>${entityActions("nested_analysis",a.id,a.description)}</td></tr>`).join("")||'<tr><td colspan="4">Sin ACU compuestos.</td></tr>'}</tbody></table></div>${model.showScenario?`<form id="nested-calculate-form" class="compact-cost-form"><h3>Comparar costos</h3>${lists}${select("ACU compuesto","cost-analysis",[["","Seleccionar análisis"],...model.analyses.map(a=>[a.id,a.code+" · "+a.description])],model.analysisId)}${field("Precios al","as_of",model.asOf,'type="date" required')}${select("Insumo a variar","scenario-resource",[["","Todos los insumos cotizados"],...resources()])}${field("Variación de precio %","variation","0",'type="number" min="-100" step="any" required')}<div class="cost-form-actions"><button class="btn primary" type="submit">Calcular escenario</button><button class="btn" type="button" data-action="cost-close-forms">Cerrar</button></div><p class="feature-error" role="alert"></p>${model.result&&model.scenario?`<div class="compare-cards"><span>BASE<b>${money(model.result.unit_cost)}</b></span><span>ESCENARIO<b>${money(model.scenario.unit_cost)}</b></span><span>DIFERENCIA<b>${money(sumDecimals([model.scenario.unit_cost,"-"+model.result.unit_cost]))}</b></span></div>`:""}</form>`:""}<details><summary>Actualizar un ACU con una lista de precios</summary><form id="selective-reprice-form" class="compact-cost-form">${lists}${select("ACU base","analysis",state.analyses.map(a=>[a.id,a.code+" · "+a.description]))}${select("Actualizar","resource",[["","Todos los insumos del ACU"],...resources()])}${field("Fecha de vigencia","as_of",model.asOf,'type="date" required')}<p>La actualización no modifica presupuestos anteriores.</p><button class="btn primary" type="submit">Actualizar ACU con la lista</button><p class="feature-error" role="alert"></p></form></details><details><summary>Partir de un ACU existente</summary><form id="copy-base-analysis-form" class="compact-cost-form">${select("ACU base","analysis",state.analyses.map(a=>[a.id,a.code+" · "+a.description]))}<button class="btn" type="submit">Copiar a biblioteca compuesta</button><p class="feature-error" role="alert"></p></form></details>`:"";
  const fx=section==="system-settings" ? `<div class="feature-toolbar"><button class="btn tiny" data-action="cost-new-fx">Agregar cotización</button><button class="btn tiny" data-action="cost-show-conversion">Convertir importe</button></div>${model.newFx?`<form id="fx-quote-form" class="compact-cost-form">${select("Desde","from",[["USD","USD"],["ARS","ARS"]])}${select("Hacia","to",[["ARS","ARS"],["USD","USD"]])}${field("Fecha","date",dateToday(),'type="date" required')}${field("Fuente","source","","required")}${field("Unidades de destino por unidad de origen","rate","",'type="number" min="0.00000001" step="any" required')}<div class="cost-form-actions"><button class="btn primary" type="submit">Guardar cotización</button><button class="btn" type="button" data-action="cost-close-forms">Cerrar</button></div><p class="feature-error" role="alert"></p></form>`:""}<div class="cost-table-scroll"><table class="data-grid"><thead><tr><th>Fecha</th><th>Desde</th><th>Hacia</th><th>Cotización</th><th>Fuente</th></tr></thead><tbody>${model.quotes.map(q=>`<tr><td>${e(q.quote.date)}</td><td>${e(q.quote.from)}</td><td>${e(q.quote.to)}</td><td>${numeric(q.quote.rate)}</td><td>${e(q.quote.source)}</td></tr>`).join("")||'<tr><td colspan="5">Sin cotizaciones registradas.</td></tr>'}</tbody></table></div>${model.showConversion?`<form id="fx-convert-form" class="compact-cost-form">${select("Cotización","quote",model.quotes.map(q=>[q.id,q.quote.from+" → "+q.quote.to+" · "+q.quote.date]))}${field("Importe de origen","amount","1",'type="number" min="0" step="any" required')}<div class="cost-form-actions"><button class="btn primary" type="submit">Convertir</button><button class="btn" type="button" data-action="cost-close-forms">Cerrar</button></div>${model.conversion?`<p>${money(model.conversion.amount||model.conversion)}</p>`:""}<p class="feature-error" role="alert"></p></form>`:""}`:"";
  return `<details class="cost-tools" data-cost-tools="${section}" ${panelOpen?"open":""}><summary>${title}</summary><div class="cost-tools-body">${history}${analysis}${fx}</div></details>${model.editing&&section==="analyses"?`<div class="modal-overlay"><section class="dialog-shell wide" role="dialog" aria-modal="true" aria-label="Editar ACU compuesto"><div class="dialog-body">${editor()}</div></section></div>`:""}`;
 }
 document.addEventListener("toggle",event=>{
  if(!event.target.isConnected||!event.target.matches?.("[data-cost-tools]"))return;
  const scope=event.target.dataset.costTools;model.open[scope]=event.target.open;
  if(event.target.open&&!model.loaded){refresh().then(render).catch(error=>{state.message=String(error);render();});}
 },true);
 async function act(button) {
  const action = button.dataset.action;
  if(["cost-new-list","cost-new-price","cost-new-fx","cost-edit-analysis","cost-close-forms","cost-cancel"].includes(action) && state.pageDirty) {
    if(!window.confirm("¿Descartar los cambios sin guardar del formulario?")) return;
    state.pageDirty=false;
  }
  if(action.startsWith("cost-")) await refresh();
  if(action === "cost-new-price") {model.newPrice=true;model.newList=false;}
  if(action === "cost-new-fx") model.newFx=true;
  if(action === "cost-show-scenario") model.showScenario=true;
  if(action === "cost-show-conversion") model.showConversion=true;
  if(action === "cost-close-forms") {model.newPrice=false;model.newFx=false;model.newList=false;model.showScenario=false;model.showConversion=false;state.pageDirty=false;}

  if (action === "open-costing") { state.view = "costing"; await refresh(); }
  if (action === "cost-new-list") {model.newList = true;model.newPrice=false;}
  if (action === "cost-new-analysis") model.editing = { id: uuid(), code: "", description: "", unit: "m²", components: [] };
  if (action === "cost-edit-analysis") model.editing = structuredClone(model.analyses.find(analysis => analysis.id === (button.dataset.id || model.analysisId)));
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
  if (form.id === "scoped-price-form") {await invoke("register_scoped_price", { price: { id: uuid(), list_id: value("cost-list"), resource_id: value("cost-resource"), effective_date: value("effective_date"), amount: value("amount"), source: value("source") } }); model.newPrice=false;await refresh(); }
  if (form.id === "nested-analysis-form") { readEditing(form); await invoke("save_nested_analysis", { analysis: model.editing }); model.analysisId = model.editing.id; model.editing = null; await refresh(); }
  if (form.id === "nested-calculate-form") {
   model.asOf = value("as_of"); model.analysisId = value("cost-analysis");
   const args = { analysisId: model.analysisId, listId: value("cost-list") || model.listId, asOf: model.asOf, changes: {} };
   model.result = await invoke("calculate_nested_cost", args);
   const ids = value("scenario-resource") ? [value("scenario-resource")] : Object.keys(model.result.resource_quantities);
   model.scenario = await invoke("calculate_nested_cost", { ...args, changes: Object.fromEntries(ids.map(id => [id, value("variation")])) });
  }
  if (form.id === "fx-quote-form") {await invoke("save_fx_quote", { quote: { from: value("from"), to: value("to"), date: value("date"), source: value("source"), rate: value("rate") } }); model.newFx=false;await refresh(); }
  if (form.id === "fx-convert-form") model.conversion = await invoke("convert_currency", { quoteId: value("quote"), amount: value("amount") });
  if (form.id === "selective-reprice-form") { await invoke("reprice_analysis_selective", { analysisId: value("analysis"), listId: value("cost-list") || model.listId, asOf: value("as_of"), resourceIds: value("resource") ? [value("resource")] : [] }); state.analyses = await invoke("list_analyses"); state.message = "ACU actualizado; los presupuestos conservan sus precios"; }
  if (form.id === "copy-base-analysis-form") { const detail = await invoke("get_analysis_details", { analysisId: value("analysis") }); model.editing = { id: uuid(), code: detail.code + "-C", description: detail.description, unit: detail.unit, components: detail.components.map(component => ({ source: { type: "resource", id: component.resource_id }, quantity_formula: component.quantity, variables: {}, waste_percent: "0", production_coefficient: "1", yield_factor: "1" })) }; }
  render();
 }
 return { markup, act, change, submit, model, refresh };
}
