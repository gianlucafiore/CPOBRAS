import { currentInterfaceLanguage, localizedError, uiHtml, uiText } from "../services/interface-language.js";
import { aiFormReply, catalogCandidates, createItemsBatch, durationFromAcu, estimateRecipePrice, itemProposals, itemRecipe, planningProposals } from "../services/ai-form-proposals.js";
import { normalize } from "../services/ai-budget-import.js";
import { loadBudgetAnalyses } from "../services/budget-resources.js";
import { money, numeric } from "../decimal.js";
import { dateToday, e, field, select } from "./helpers.js";

const defaultModels = {openai:"gpt-4.1-mini", anthropic:"claude-haiku-4-5", lmstudio:""};
const modes = {items:"form_items", plan:"form_plan", memory:"form_memory"};

export function createAiFormActions({invoke,state,editable,currentEstimate,loadEstimate,planning,presentation,render,document,window,onStatus}) {
  let model = null;
  const uuid = () => window.crypto.randomUUID();
  const scope = () => [state.database?.path, state.view, state.projectId, state.estimateId, state.panel].join(":");
  const title = kind => ({
    items:uiText("Proponer partidas con IA"),
    plan:uiText("Proponer tareas con IA"),
    memory:uiText("Ampliar memoria con IA"),
    settings:uiText("Configurar IA"),
  })[kind];
  const current = work => model === work && work.scope === scope();

  async function open(kind) {
    if (!state.aiActionsEnabled || (!Object.hasOwn(modes, kind) && kind !== "settings")) return;
    if (kind === "plan" && (state.view !== "planning" || !state.estimateId || state.remoteProject
        || state.pageDirty || planning.model.editing || planning.model.splitting || planning.model.erasing || planning.model.dirty)) return;
    if ((kind === "items" || kind === "memory") && (!editable() || state.remoteProject || state.view !== "workspace")) return;
    if (kind === "memory" && state.panel !== "memory") return;
    const work = {
      kind, scope:scope(), settings:kind === "settings", busy:"loading", status:null, error:"",
      prompt:kind === "memory" ? presentation.model.data.memory : "", result:null, price:true,
      localModels:null, loadingLocalModels:false, localModelsError:"",
    };
    model = work;
    render();
    try {
      work.status = await invoke("ai_status");
      work.provider = work.status?.provider || "openai";
      work.modelName = work.status?.model || defaultModels[work.provider];
      work.settings ||= !work.status?.configured;
      work.error = work.status?.storage_error || "";
    } catch (error) {
      work.error = String(localizedError(error));
      work.settings = true;
    } finally {
      work.busy = "";
      if (current(work)) render();
    }
    if (current(work) && work.kind === "memory" && work.status?.configured && work.prompt.trim())
      await submit({id:"ai-form-proposal"});
  }

  function close() {
    if (!model || ["saving","configuring"].includes(model.busy)) return;
    const requestId = model.requestId;
    model = null;
    if (requestId) void invoke("ai_cancel", {requestId}).catch(() => {});
    render();
  }

  function localModelOptions(work) {
    const choices = (work.localModels || []).map(item =>
      `<option value="${e(item.id)}" ${item.id === work.modelName ? "selected" : ""}>${e(item.name)} · ${item.loaded ? uiHtml("Cargado") : uiHtml("Instalado")}</option>`);
    return `<option value="">${uiHtml("Elegí un modelo")}</option>${choices.join("")}`;
  }

  function localModelStatus(work) {
    if (work.loadingLocalModels || work.localModels === null) {
      return uiText("Buscando modelos descargados en LM Studio…");
    }
    return work.localModelsError;
  }

  function localModelUnavailable(work) {
    return work.loadingLocalModels || !work.localModels?.length;
  }

  async function refreshLocalModels(work) {
    if (work.provider !== "lmstudio" || work.loadingLocalModels) return;
    work.loadingLocalModels = true;
    work.localModelsError = "";
    updateLocalModelField(work);
    try {
      work.localModels = await invoke("ai_local_models");
    } catch (error) {
      work.localModels = [];
      work.localModelsError = String(localizedError(error));
    } finally {
      work.loadingLocalModels = false;
      updateLocalModelField(work);
    }
  }

  function updateLocalModelField(work) {
    if (!current(work) || work.provider !== "lmstudio" || !work.settings) return;
    const form = document.querySelector("#ai-form-settings");
    if (!form) return;
    const unavailable = localModelUnavailable(work);
    form.elements.model.innerHTML = localModelOptions(work);
    form.elements.model.disabled = Boolean(work.busy || unavailable);
    form.querySelector("[data-local-model-status]").textContent = localModelStatus(work);
    form.querySelector('[data-action="form-ai-refresh-models"]').disabled = Boolean(work.busy || work.loadingLocalModels);
    form.querySelector('[type="submit"]').disabled = Boolean(work.busy || unavailable);
  }

  function settingsMarkup(work) {
    const provider = work.provider || "openai";
    const name = work.modelName || "";
    const local = provider === "lmstudio";
    return `<form id="ai-form-settings">
      <p>${uiHtml("Las acciones de IA envían al proveedor seleccionado los datos necesarios para cada propuesta. Con LM Studio, la consulta se procesa en este equipo.")}</p>
      <div class="form-grid">
        ${select(uiText("Proveedor de IA"), "provider", [["openai","OpenAI"],["anthropic","Claude"],["lmstudio","LM Studio"]], provider)}
        ${local ? `<label class="field"><span>${uiHtml("Modelo de IA")}</span>
          <select name="model" required ${work.busy || localModelUnavailable(work) ? "disabled" : ""}>${localModelOptions(work)}</select>
        </label>` : field(uiText("Modelo de IA"), "model", name, 'required maxlength="120"')}
        ${local ? "" : `<label class="field"><span>${uiHtml("Clave de API")}</span><input name="key" type="password" maxlength="512" autocomplete="off" ${work.status?.configured && work.status.provider === provider ? "" : "required"}></label>`}
      </div>
      ${local ? `<div class="heading-actions">
        <button type="button" class="btn" data-action="form-ai-refresh-models" ${work.busy || work.loadingLocalModels ? "disabled" : ""}>${uiHtml("Actualizar modelos")}</button>
        <span class="small-muted" data-local-model-status role="status">${e(localModelStatus(work))}</span>
        </div>
        <label class="field"><span>${uiHtml("Clave de Brave Search para búsquedas web")}</span><input name="searchKey" type="password" maxlength="512" autocomplete="off" placeholder="${work.status?.web_search_ready ? uiHtml("Clave guardada") : uiHtml("Opcional")}"></label>` : ""}
      <button type="submit" class="btn primary" ${work.busy || local && localModelUnavailable(work) ? "disabled" : ""}>${uiHtml("Guardar configuración de IA")}</button>
      ${work.kind !== "settings" && work.status?.configured ? `<button type="button" class="btn" data-action="form-ai-back">${uiHtml("Volver a la propuesta")}</button>` : ""}
      ${work.kind === "settings" && work.status?.configured ? `<button type="button" class="btn" data-action="form-ai-forget" ${work.busy ? "disabled" : ""}>${uiHtml("Quitar configuración de IA")}</button>` : ""}
    </form>`;
  }

  function itemsMarkup(work) {
    return `<div class="ai-review-options">
      <label><input type="checkbox" data-ai-price ${work.price ? "checked" : ""}> ${uiHtml("Usar precios del catálogo cuando estén disponibles")}</label>
      <p class="small-muted">${uiHtml("Las cantidades vacías se guardan en cero. Los insumos sin precio quedan pendientes de cotizar.")}</p>
    </div>
    <div class="ai-review-scroll"><table class="data-grid ai-items-grid">
      <colgroup><col><col><col><col><col><col></colgroup>
      <thead><tr>
        <th><input type="checkbox" data-ai-select-all aria-label="${uiHtml("Seleccionar todas las partidas")}"></th>
        <th>${uiHtml("Partida")}</th><th>${uiHtml("Rubro")}</th><th>${uiHtml("Unidad")}</th><th>${uiHtml("Cantidad")}</th><th>${uiHtml("ACU y precio unitario")}</th>
      </tr></thead><tbody>${work.result.map((row,index) => {
        const price = estimateRecipePrice(row.components, work.price);
        return `<tr>
          <td><input type="checkbox" data-ai-row="${index}" data-field="selected" aria-label="${uiHtml("Incluir {0}", [row.description])}" ${row.selected ? "checked" : ""}></td>
          <td><input data-ai-row="${index}" data-field="description" aria-label="${uiHtml("Descripción")}" maxlength="240" value="${e(row.description)}">${row.basis ? `<small>${e(row.basis)}</small>` : ""}</td>
          <td><input data-ai-row="${index}" data-field="section" aria-label="${uiHtml("Rubro")}" maxlength="120" value="${e(row.section)}"></td>
          <td><input data-ai-row="${index}" data-field="unit" aria-label="${uiHtml("Unidad")}" maxlength="65" value="${e(row.unit)}" ${row.components.length ? "readonly" : ""}></td>
          <td><input inputmode="decimal" maxlength="28" data-ai-row="${index}" data-field="quantity" aria-label="${uiHtml("Cantidad {0}", [row.description])}" value="${e(row.quantity)}" placeholder="0"></td>
          <td>${row.components.length ? `<label class="ai-include-recipe"><input type="checkbox" data-ai-row="${index}" data-field="useRecipe" ${row.useRecipe ? "checked" : ""}> ${row.analysis ? e(row.analysis) : uiHtml("Cargar receta propuesta")}</label>`
            : row.prepared ? uiHtml("Partida sin ACU") : uiHtml("ACU por preparar")}
          ${row.components.length && price.amount != null ? `<small>${price.pending || row.missing.length ? uiHtml("Costo parcial") + " · " : ""}${e(work.currency)} ${money(price.amount)}</small>` : ""}
          ${price.pending ? `<small>${uiHtml("Insumos pendientes de cotizar: {0}",[price.pending])}</small>` : ""}
          ${row.components.length || row.missing.length ? `<details data-ai-details="${index}"><summary>${uiHtml("Ver insumos")}</summary><ul>${row.components.map(({expected_resource:resource,quantity}) =>
            `<li>${e(resource.description)} · ${numeric(quantity)} ${e(resource.unit)}${resource.price == null || (!work.price && resource.price_source !== "presupuesto") ? ` · ${uiHtml("Pendiente de cotizar")}` : ""}</li>`).join("")}${row.missing.map(value => `<li>${e(value)}</li>`).join("")}</ul></details>` : ""}</td>
        </tr>`;
      }).join("")}</tbody></table></div>`;
  }

  function planMarkup(work) {
    return `<div class="table-scroll"><table class="data-grid"><thead><tr><th>${uiHtml("Tarea")}</th><th>${uiHtml("Días laborables")}</th><th>${uiHtml("Predecesoras")}</th></tr></thead>
      <tbody>${work.result.map((row,index) => `<tr><td><strong>${e(row.name)}</strong>
      ${row.line ? `<small>${e(row.line.description)} · ${numeric(row.line.quantity)} ${e(row.line.unit)}</small>` : ""}
      ${row.basis ? `<small>${e(row.basis)}</small>` : ""}</td>
      <td><input type="number" min="1" max="36500" step="1" data-ai-row="${index}" data-field="days" aria-label="${uiHtml("Duración de {0}", [row.name])}" value="${e(row.days ?? "")}">
      ${row.line?.duration ? `<small>${uiHtml("Según el ACU ({0})", [row.line.duration.resource])}
      · ${uiHtml("{0} días de base", [numeric(row.line.duration.days)])}<br>
      ${uiHtml("Consumo total {0} ÷ rendimiento diario {1}", [numeric(row.line.duration.demand), numeric(row.line.duration.rate)])}</small>` : `<small>${row.days == null ? uiHtml("Pendiente") : uiHtml("Estimación de IA")}</small>`}</td>
      <td>${row.after.map(edge => `<small>${e(edge.name)} · ${e(edge.kind)}${edge.lag ? ` · ${edge.lag} d` : ""}</small>`).join("") || "—"}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function markup() {
    const work = model;
    if (!work || !current(work)) return "";
    const itemReview = work.kind === "items" && work.result && !work.settings;
    const busy = Boolean(work.busy);
    const prompt = `<form id="ai-form-proposal">
      <p class="small-muted">${work.kind === "items" ? uiHtml("Describí la obra y las cantidades que conocés. Si dejás el campo vacío, se usa la memoria del presupuesto.")
        : work.kind === "plan" ? uiHtml("Indicá restricciones o tiempos conocidos. La propuesta incorpora tareas para las partidas sin planificar del presupuesto abierto.")
        : uiHtml("Escribí unas notas sobre la obra. Revisá el borrador antes de incorporarlo a la memoria.")}</p>
      <label class="field"><span>${uiHtml("Descripción o instrucciones")}</span><textarea data-ai-prompt rows="4" maxlength="5500" ${busy ? "disabled" : ""}>${e(work.prompt)}</textarea></label>
      <div class="dialog-actions"><button type="submit" class="btn ai-button${work.result ? "" : " ai-button-accent"}" ${busy ? "disabled" : ""}>${uiHtml("Generar propuesta")}</button>
      <button type="button" class="btn" data-action="form-ai-settings" ${busy ? "disabled" : ""}>${uiHtml("Configurar IA")}</button></div>
    </form>`;
    const status = work.busy === "recipes"
      ? uiHtml("Preparando ACU ({0} de {1})…", [work.result.filter(row => row.prepared).length, work.result.length])
      : work.busy === "generating" ? uiHtml("Generando propuesta…") : "";
    const editor = work.busy === "loading" ? `<p role="status">${uiHtml("Cargando configuración de IA…")}</p>`
      : work.settings ? settingsMarkup(work)
      : itemReview ? `<details class="ai-review-prompt"><summary>${uiHtml("Descripción o instrucciones")}</summary>${prompt}</details>`
      : prompt;
    const result = !work.result || work.settings ? "" : work.kind === "items" ? itemsMarkup(work)
      : work.kind === "plan" ? planMarkup(work)
      : `<label class="field"><span>${uiHtml("Borrador de la memoria")}</span><textarea data-ai-memory rows="12" maxlength="25000">${e(work.result)}</textarea></label>`;
    const apply = work.kind === "items" ? uiHtml("Incorporar partidas") : work.kind === "plan" ? uiHtml("Incorporar al PERT") : uiHtml("Usar este borrador");
    const canStop = ["generating","recipes"].includes(work.busy);
    return `<dialog class="dialog-shell wide ai-action-dialog ${itemReview ? "ai-action-dialog--review" : ""}" aria-labelledby="ai-form-title">
      <div class="dialog-header"><h2 id="ai-form-title">${e(title(work.kind))}</h2>
       <button type="button" class="btn" data-action="${canStop && work.kind === "items" ? "form-ai-stop" : "form-ai-close"}" ${["saving","configuring"].includes(work.busy) || work.stopped && busy ? "disabled" : ""}>${canStop ? uiHtml("Cancelar consulta") : uiHtml("Cerrar")}</button></div>
      <div class="dialog-body">
        ${editor}
        ${status ? `<p role="status" class="ai-review-status">${status}</p>` : ""}
        ${result ? `<section class="ai-review-content" aria-label="${uiHtml("Propuesta de IA")}" ${work.busy === "saving" ? "inert" : ""}>${result}</section>` : ""}
        <p class="feature-error" role="alert" ${work.error ? "" : "hidden"}>${e(work.error)}</p>
      </div>
      ${result ? `<footer class="ai-review-footer">
        ${itemReview ? `<div class="ai-review-counts" role="status"><span data-ai-selection-count></span><small data-ai-missing-count></small></div>
          ${work.result.some(row => !row.prepared) && !busy ? `<button type="button" class="btn ai-button" data-action="form-ai-retry">${uiHtml("Preparar ACU pendientes")}</button>` : ""}` : ""}
        <button type="button" class="btn primary" data-action="form-ai-apply" ${busy ? "disabled" : ""}>${apply}</button>
      </footer>` : ""}
    </dialog>`;
  }

  function syncSelection() {
    if (model?.kind !== "items" || !model.result) return;
    const header = document.querySelector("[data-ai-select-all]");
    if (!header) return;
    const selection = model.result.filter(row => row.selected);
    const selected = selection.length;
    header.checked = selected === model.result.length;
    header.indeterminate = selected > 0 && selected < model.result.length;
    document.querySelector("[data-ai-selection-count]").textContent =
      uiText("{0} de {1} partidas seleccionadas", [selected, model.result.length]);
    const missing = selection.filter(row => !row.useRecipe || !row.components.length).length;
    document.querySelector("[data-ai-missing-count]").textContent = missing
      ? uiText("Se incorporan sin ACU: {0}", [missing]) : "";
    document.querySelector(".ai-review-footer [data-action='form-ai-apply']").disabled = !selected || Boolean(model.busy);
  }

  function beforeRender() {
    const dialog = document.querySelector(".ai-action-dialog--review");
    if (!dialog || !model || !current(model)) return;
    const scroll = dialog.querySelector(".ai-review-scroll");
    const input = document.activeElement;
    model.reviewView = {
      top:scroll.scrollTop, left:scroll.scrollLeft,
      prompt:dialog.querySelector(".ai-review-prompt").open,
      details:[...dialog.querySelectorAll("[data-ai-details][open]")].map(details => details.dataset.aiDetails),
      focus:input?.matches("[data-ai-row]") ? {...input.dataset, start:input.selectionStart, end:input.selectionEnd} : null,
    };
  }

  function afterRender() {
    const dialog = document.querySelector(".ai-action-dialog");
    if (!dialog || dialog.open) return;
    dialog.addEventListener("cancel", event => {event.preventDefault(); close();});
    dialog.showModal();
    if (model.settings && model.provider === "lmstudio" && model.localModels === null && !model.busy) {
      void refreshLocalModels(model);
    }
    syncSelection();
    const scroll = dialog.querySelector(".ai-review-scroll");
    const view = model.reviewView;
    if (!scroll || !view) return;
    dialog.querySelector(".ai-review-prompt").open = view.prompt;
    for (const details of dialog.querySelectorAll("[data-ai-details]"))
      details.open = view.details.includes(details.dataset.aiDetails);
    scroll.scrollTop = view.top;
    scroll.scrollLeft = view.left;
    if (view.focus) {
      const input = dialog.querySelector(`[data-ai-row="${view.focus.aiRow}"][data-field="${view.focus.field}"]`);
      input?.focus({preventScroll:true});
      if (input && view.focus.start != null) input.setSelectionRange(view.focus.start, view.focus.end);
    }
  }

  function input(target) {
    if (!model || !target.closest?.(".ai-action-dialog")) return false;
    if (target.matches("[data-ai-prompt]")) model.prompt = target.value;
    if (target.matches("[data-ai-memory]")) model.result = target.value;
    if (target.matches('#ai-form-settings [name="model"]')) model.modelName = target.value;
    if (target.matches("[data-ai-row]")) {
      const {aiRow,field: name} = target.dataset;
      const row = model.result[aiRow];
      row[name] = target.type === "checkbox" ? target.checked
        : name === "days" ? (target.value === "" ? null : Number(target.value)) : target.value;
      if (name === "selected" || name === "useRecipe") syncSelection();
    }
    return true;
  }

  function change(target) {
    if (!model || !target.closest?.(".ai-action-dialog")) return false;
    if (target.matches("[data-ai-select-all]")) {
      for (const row of model.result) row.selected = target.checked;
      for (const input of document.querySelectorAll('[data-ai-row][data-field="selected"]')) input.checked = target.checked;
      syncSelection();
    }
    if (target.matches("[data-ai-price]")) {model.price = target.checked; render();}
    if (target.matches('#ai-form-settings select[name="model"]')) model.modelName = target.value;
    if (target.matches('#ai-form-settings [name="provider"]')) {
      model.provider = target.value;
      model.modelName = model.status?.provider === target.value ? model.status.model : defaultModels[target.value];
      if (model.provider === "lmstudio" && !model.loadingLocalModels) model.localModels = null;
      render();
    }
    return true;
  }

  async function ask(work, notes, context, mode = modes[work.kind]) {
    if (!current(work) || work.stopped) return null;
    const payload = JSON.stringify({...context, language:currentInterfaceLanguage()});
    if (new TextEncoder().encode(notes).length > 12000 || new TextEncoder().encode(payload).length > 32000)
      throw new Error(uiText("La consulta supera el tamaño permitido. Reducí el texto de la descripción."));
    const requestId = uuid();
    work.requestId = requestId;
    try {
      const reply = await invoke("ai_chat", {requestId, mode, context:payload, messages:[{role:"user",content:notes}]});
      return current(work) && !work.stopped ? aiFormReply(reply.text) : null;
    } finally {
      work.requestId = null;
    }
  }

  async function generateItems(work) {
    const estimateId = state.estimateId;
    const [existing, saved] = await Promise.all([
      invoke("list_estimate_lines", {estimateId}),
      invoke("get_budget_presentation", {estimateId}),
    ]);
    const notes = work.prompt.trim() || saved?.data?.memory?.trim();
    if (!notes) throw new Error(uiText("Escribí una descripción de la obra o cargá una memoria descriptiva."));
    const reply = await ask(work, notes.slice(0,5500), {
      estimate:currentEstimate()?.title,
      existing:existing.slice(0,60).map(({description,unit}) => ({description:description.slice(0,100),unit})),
    });
    if (!reply || !current(work)) return;
    const rows = itemProposals(reply);
    if (!rows.length) {
      work.error = typeof reply.answer === "string" ? reply.answer.slice(0,1000) : uiText("La IA no propuso partidas para incorporar.");
      return;
    }
    work.result = rows;
    work.currency = String(currentEstimate()?.currency || "").toUpperCase();
    work.asOf = dateToday();
    work.catalog = null;
    work.notes = notes;
    await prepareRecipes(work);
  }

  async function recipeDetail(analysis) {
    if (!analysis) return null;
    return invoke("get_analysis_details", {analysisId:analysis.id}).catch(() => null);
  }

  async function prepareRecipes(work) {
    work.busy = "recipes";
    render();
    if (!work.catalog) {
      const [catalog, library] = await Promise.all([
        invoke("assisted_acu_context", {projectId:state.projectId, estimateId:state.estimateId, asOf:work.asOf}),
        invoke("list_analyses"),
      ]);
      if (!current(work) || work.stopped) return;
      work.currency = catalog.currency;
      work.catalog = {resources:catalog.resources, library, byId:new Map(catalog.resources.map(resource => [resource.id,resource]))};
    }
    const {library,resources,byId} = work.catalog;
    const known = new Map();
    for (const analysis of library) {
      const key = normalize(analysis.description) + "|" + normalize(analysis.unit);
      known.set(key, known.has(key) ? null : analysis);
    }
    const unchanged = (row, reference) => row.description === reference.description && row.unit === reference.unit;
    const pending = work.result.map((row,index) => ({row, ref:"P" + (index + 1)})).filter(({row}) => !row.prepared);
    for (const {row} of pending) {
      const reference = {description:row.description, unit:row.unit};
      const analysis = known.get(normalize(row.description) + "|" + normalize(row.unit));
      if (!analysis) continue;
      const detail = await recipeDetail(analysis);
      if (!current(work) || work.stopped) return;
      if (detail && unchanged(row, reference)) {
        const recipe = itemRecipe(row, {analysis, detail, resources:byId});
        if (recipe.components.length) Object.assign(row,recipe);
      }
    }
    render();
    const queued = pending.filter(({row}) => !row.prepared);
    for (let offset = 0; offset < queued.length && current(work) && !work.stopped; offset += 4) {
      const group = queued.slice(offset,offset + 4);
      const targets = group.map(({row,ref}) => ({ref,description:row.description,unit:row.unit,keywords:row.keywords}));
      const subject = targets.map(row => row.description + " " + row.keywords).join(" ");
      const units = new Set(targets.map(target => normalize(target.unit)));
      const analyses = catalogCandidates(library.filter(analysis => units.has(normalize(analysis.unit))), subject, "A", 22);
      const candidates = catalogCandidates(resources, subject, "R", 66);
      const shorten = ({ref,description,kind,unit}) => ({ref,description:description.slice(0,100),kind,unit});
      const reply = await ask(work, uiText("Prepará los ACU para las partidas indicadas."), {
        description:work.notes.slice(0,1000),
        targets, analyses:analyses.map(shorten), resources:candidates.map(shorten),
      }, "form_item_recipes");
      if (!reply || !current(work)) return;
      const byRef = new Map(analyses.map(analysis => [analysis.ref,analysis]));
      const shortlist = new Map(candidates.map(resource => [resource.ref,resource]));
      const proposals = new Map((Array.isArray(reply.recipes) ? reply.recipes : []).map(recipe => [recipe?.item,recipe]));
      for (const [index,{row,ref}] of group.entries()) {
        const proposal = proposals.get(ref);
        if (!proposal || !unchanged(row,targets[index])) continue;
        const analysis = byRef.get(proposal.analysis);
        const detail = await recipeDetail(analysis);
        if (!current(work) || work.stopped) return;
        if (unchanged(row,targets[index])) Object.assign(row,itemRecipe(row,{analysis,detail,proposal,resources:byId,shortlist}));
      }
      render();
      if (group.some(({row}) => !row.prepared)) throw new Error(uiText("Quedaron ACU sin preparar. Podés retomar desde los pendientes."));
    }
  }

  async function generatePlan(work) {
    const revision = planning.model.revision, projectId = state.projectId, estimateId = state.estimateId;
    const plan = planning.model.plan;
    if (!plan || planning.model.projectId !== projectId) throw new Error(uiText("Abrí la planificación de la obra antes de generar tareas."));
    const plannedIds = new Set(plan.tasks.map(task => task.estimate_line_id));
    const [lines, saved] = await Promise.all([
      invoke("list_estimate_lines", {estimateId}),
      invoke("get_budget_presentation", {estimateId}).catch(() => null),
    ]);
    const pending = lines.filter(line => !plannedIds.has(line.id)).slice(0,35);
    if (!pending.length && !work.prompt.trim()) throw new Error(uiText("No hay partidas sin planificar. Indicá las tareas adicionales que querés proponer."));
    const analyses = await loadBudgetAnalyses(invoke, pending);
    const candidates = pending.map((line,index) => ({
      ...line, ref:"P" + (index + 1), duration:durationFromAcu(line.quantity, analyses.get(line.analysis_id)?.components),
    }));
    const existing = plan.tasks.slice(-45).map((task,index) => ({...task, ref:"E" + (index + 1)}));
    const reply = await ask(work, work.prompt.trim() || uiText("Planificá las partidas indicadas."),
      {
        project:state.projects.find(project => project.id === projectId)?.name,
        estimate:currentEstimate()?.title,
        scope:saved?.data?.memory?.slice(0,2000),
        available:candidates.map(({ref,description,unit,quantity,duration}) => ({ref,description:description.slice(0,165),unit,quantity,days:duration?.days})),
        existing:existing.map(({ref,name,duration_days}) => ({ref,name:name.slice(0,125),days:duration_days})),
      });
    if (!reply || !current(work)) return;
    work.origin = {projectId,estimateId,revision};
    work.existing = existing;
    work.result = planningProposals(reply, candidates, existing);
    if (!work.result.length) work.error = typeof reply.answer === "string" ? reply.answer.slice(0,1000) : uiText("La IA no propuso tareas para incorporar.");
  }

  async function generateMemory(work) {
    if (!work.prompt.trim()) throw new Error(uiText("Escribí unas notas para ampliar la memoria descriptiva."));
    work.originalMemory = presentation.model.data.memory;
    const reply = await ask(work, work.prompt.trim(), {
      project:state.projects.find(project => project.id === state.projectId)?.name,
      estimate:currentEstimate()?.title,
      lines:state.lines.slice(0,45).map(({description,quantity,unit}) => ({description:description.slice(0,140),quantity,unit})),
    });
    if (!reply || !current(work)) return;
    work.result = typeof reply.memory === "string" ? reply.memory.trim().slice(0,25000) : "";
    if (!work.result) throw new Error(uiText("La IA no devolvió una memoria descriptiva."));
  }

  async function submit(form) {
    const work = model;
    if (!work || work.busy || !current(work)) return;
    work.error = "";
    try {
      if (form.id === "ai-form-settings") {
        const data = new window.FormData(form);
        const provider = data.get("provider");
        const selectedModel = data.get("model");
        if (provider === "lmstudio" && (localModelUnavailable(work) || !work.localModels.some(item => item.id === selectedModel))) return;
        work.busy = "configuring";
        render();
        work.status = await invoke("ai_configure", {
          provider, model:selectedModel, key:data.get("key") || "",
          searchKey:data.get("searchKey") || null,
        });
        onStatus?.(work.status);
        work.modelName = work.status.model;
        work.settings = work.kind === "settings";
        if (work.settings) state.message = uiText("Configuración de IA guardada.");
      } else {
        work.busy = "generating";
        work.stopped = false;
        if (work.kind !== "items") work.result = null;
        render();
        await ({items:generateItems,plan:generatePlan,memory:generateMemory})[work.kind](work);
        if (Array.isArray(work.result) && !work.result.length) work.result = null;
      }
    } catch (error) {
      if (!work.stopped) work.error = String(localizedError(error));
    } finally {
      work.busy = "";
      work.requestId = null;
      if (current(work)) render();
    }
  }

  async function apply(work) {
    if (!work.result || !current(work)) return;
    if (work.kind === "items") {
      if (!editable()) throw new Error(uiText("Abrí un presupuesto propio en elaboración antes de aprobar la carga"));
      const estimate = state.estimateId;
      const existing = await invoke("list_estimate_lines", {estimateId:estimate});
      if (!current(work) || !editable()) return;
      const batch = createItemsBatch(work.result, existing, estimate, work.currency, work.asOf, work.price, uuid);
      const result = await invoke("apply_reviewed_budget_batch", {batch});
      model = null;
      state.message = uiText("Se incorporaron {0} partidas. Con ACU: {1}.", [result.created, result.composed]);
      state.search = "";
      state.selectedLineId = batch.creates[0].id;
      state.panel = "acu";
      await loadEstimate();
    } else if (work.kind === "plan") {
      await planning.applyAiTasks(work.result, work.existing, work.origin);
      model = null;
      state.message = uiText("Se incorporaron {0} tareas al PERT.", [work.result.length]);
    } else {
      if (!editable() || !work.result.trim() ||
          ![work.originalMemory, work.result].includes(presentation.model.data.memory))
        throw new Error(uiText("La memoria cambió o el borrador está vacío. Revisá el texto antes de aplicarlo."));
      presentation.update({memory:work.result});
      await presentation.flush();
      model = null;
    }
    render();
  }

  async function act(button) {
    const {action,kind} = button.dataset;
    if (action === "form-ai-open") return open(kind);
    if (action === "form-ai-close") return close();
    const work = model;
    if (!work || !current(work)) return;
    if (action === "form-ai-stop") {
      work.stopped = true;
      if (work.requestId) void invoke("ai_cancel", {requestId:work.requestId}).catch(() => {});
      render();
      return;
    }
    if (work.busy) return;
    if (action === "form-ai-refresh-models") return refreshLocalModels(work);
    if (action === "form-ai-retry") {
      work.stopped = false;
      work.error = "";
      try { await prepareRecipes(work); }
      catch (error) { if (!work.stopped) work.error = String(localizedError(error)); }
      finally {
        work.busy = "";
        if (current(work)) render();
      }
      return;
    }
    if (action === "form-ai-settings" || action === "form-ai-back") {
      work.settings = action === "form-ai-settings";
      work.error = "";
      render();
      return;
    }
    try {
      work.busy = "saving";
      work.error = "";
      render();
      if (action === "form-ai-forget") {
        await invoke("ai_forget");
        work.status = null;
        onStatus?.(null);
      } else if (action === "form-ai-apply") await apply(work);
    } catch (error) {
      if (current(work)) work.error = String(localizedError(error));
      else state.message = String(localizedError(error));
    } finally {
      work.busy = "";
      render();
    }
  }

  return {act, beforeRender, afterRender, change, input, markup, submit};
}
