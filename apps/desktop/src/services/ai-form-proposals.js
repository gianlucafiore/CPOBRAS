import { compareDecimals, divideDecimals, multiplyDecimals, sumDecimals } from "../decimal.js";
import { uiText } from "./interface-language.js";
import { normalize } from "./ai-budget-import.js";
import { automaticPositions } from "./pert.js";

const text = (value, limit) => typeof value === "string" ? value.trim().slice(0, limit) : "";

export function aiFormReply(value) {
  const response = typeof value === "string" && value.length <= 100_000
    ? value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "") : "";
  try {
    const result = JSON.parse(response);
    if (result && typeof result === "object" && !Array.isArray(result)) return result;
  } catch { /* A partial or non-JSON response cannot be applied. */ }
  throw new Error(uiText("La IA devolvió una respuesta incompleta o inválida. Volvé a generar la propuesta."));
}

export function proposalDecimal(value) {
  const source = String(value ?? "").trim().replace(",", ".");
  return /^\d{1,13}(?:\.\d{1,10})?$/.test(source) ? source : "";
}

export function catalogCandidates(records, subject, prefix, limit) {
  const tokens = value => new Set(normalize(value).split(" ").filter(word => word.length >= 3).map(word => word.replace(/(?:es|s)$/, "")));
  const query = tokens(subject);
  return records
    .map(record => ({
      record,
      score: [...tokens(record.description)].filter(word => query.has(word)).length
        + (query.has(normalize(record.code)) ? 3 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({record}, index) => ({...record, ref: prefix + (index + 1)}));
}

export function itemProposals(reply) {
  if (!Array.isArray(reply.items)) return [];
  return reply.items.slice(0, 30).flatMap(item => {
    const description = text(item?.description, 240), unit = text(item?.unit, 65);
    if (!description || !unit) return [];
    return [{
      description, unit, selected:true, quantity:proposalDecimal(item.quantity),
      section:text(item.section,120), basis:text(item.basis,400), keywords:text(item.keywords,160),
      components:[], missing:[], analysis:"", useRecipe:true, prepared:false,
    }];
  });
}

export function itemRecipe(row, {analysis, detail, proposal, resources, shortlist}) {
  const missing = Array.isArray(proposal?.missing) ? proposal.missing.slice(0,12).map(value => text(value,250)).filter(Boolean) : [];
  const library = detail && normalize(detail.unit) === normalize(row.unit);
  if (analysis && !library) missing.push(uiText("El ACU propuesto no está disponible con esa unidad."));
  const recipe = library ? detail.components.filter(component => component.included !== false)
    : Array.isArray(proposal?.components) ? proposal.components.slice(0,45) : [];
  const components = [], seen = new Set();
  for (const component of recipe) {
    const resource = library ? resources.get(component?.resource_id) : shortlist?.get(component?.resource);
    const quantity = proposalDecimal(component?.quantity);
    if (!resource || !quantity || compareDecimals(quantity,"0") <= 0 || seen.has(resource.id)
        || (!library && component.unit !== resource.unit)) {
      missing.push(text(component?.description,250) || uiText("Revisá el insumo o la unidad de consumo."));
      continue;
    }
    seen.add(resource.id);
    const {ref, ...expectedResource} = resource;
    components.push({resource_id:resource.id, quantity, expected_resource:expectedResource});
  }
  if (!components.length && !missing.length)
    missing.push(uiText("La propuesta no encontró insumos compatibles entre los candidatos."));
  return {components, missing, analysis:library ? analysis.description : "", prepared:true};
}

export function estimateRecipePrice(components, useCatalog) {
  let pending = 0;
  const known = [];
  for (const {expected_resource:resource, quantity} of components) {
    if (resource.price == null || (!useCatalog && resource.price_source !== "presupuesto")) pending++;
    else known.push(multiplyDecimals(quantity, resource.price));
  }
  return {pending, amount:known.length ? sumDecimals(known) : null};
}

export function createItemsBatch(rows, existing, estimate, currency, date, usePrices, uuid) {
  const creates = [], acus = [];
  const keys = new Set(existing.map(line => JSON.stringify([normalize(line.description), normalize(line.unit)])));
  for (const row of rows.filter(row => row.selected)) {
    const quantity = row.quantity?.trim() ? proposalDecimal(row.quantity) : "0";
    const description = text(row.description, 240), unit = text(row.unit, 65);
    if (!description || !unit)
      throw new Error(uiText("Completá la descripción y la unidad en las partidas seleccionadas."));
    if (!quantity) throw new Error(uiText("Revisá la cantidad de «{0}». Usá un número positivo, cero o dejala vacía.", [description]));
    const key = JSON.stringify([normalize(description), normalize(unit)]);
    if (keys.has(key)) throw new Error(uiText("La partida «{0}» con unidad {1} ya existe o está repetida.", [description, unit]));
    keys.add(key);
    const id = uuid();
    const section = text(row.section, 120) || null;
    creates.push({id, description, unit, quantity, section, unit_price:"0"});
    if (row.useRecipe && row.components.length) acus.push({
      line_id:id, as_of:date, components:row.components, expected_takeoffs:[],
      pricing:usePrices ? "catalog" : "budget_only",
      notes:[row.basis, ...row.missing].filter(Boolean).join("\n").slice(0,3500),
    });
  }
  if (!creates.length) throw new Error(uiText("Seleccioná al menos una partida para incorporar."));
  return {id:uuid(), estimate_id:estimate, currency, creates, acus, updates:[], deletes:[]};
}

// The rate is measured in resource units per working day and consumption is per unit of work.
export function durationFromAcu(quantity, components = []) {
  if (compareDecimals(quantity, "0") <= 0) return null;
  let bottleneck = null;
  for (const component of components) {
    const rate = component.daily_output;
    if (component.included === false || !rate || compareDecimals(rate, "0") <= 0) continue;
    const demand = multiplyDecimals(quantity, component.quantity);
    if (compareDecimals(demand, "0") <= 0) continue;
    const whole = divideDecimals(demand, rate, 0);
    const days = Number(whole) + Number(compareDecimals(demand, multiplyDecimals(rate, whole)) > 0);
    if (!bottleneck || days > bottleneck.days) bottleneck = {days, resource:component.description, demand, rate};
  }
  return bottleneck && bottleneck.days <= 36500 ? bottleneck : null;
}

export function planningProposals(reply, candidates, existing) {
  if (!Array.isArray(reply.tasks) || !reply.tasks.length) return [];
  if (reply.tasks.length > 40) throw new Error(uiText("La propuesta supera el límite de tareas."));
  const lines = new Map(candidates.map(line => [line.ref, line]));
  const names = new Map(existing.map(task => [task.ref, task.name]));
  const used = new Set(names.keys());
  const tasks = reply.tasks.map(item => {
    const key = item?.key, line = lines.get(key), name = text(item?.name, 180) || line?.description;
    if ((!line && !/^N[1-9]\d?$/.test(key)) || typeof key !== "string" || used.has(key) || !name)
      throw new Error(uiText("La propuesta contiene tareas repetidas o sin una partida válida."));
    used.add(key);
    names.set(key, name);
    const days = item.days == null ? null : Number(item.days);
    return {
      key, line, name, basis:text(item.basis, 450), after:item.after,
      days:line?.duration?.days ?? (Number.isInteger(days) && days >= 1 && days <= 36500 ? days : null),
    };
  });
  for (const task of tasks) {
    const seen = new Set();
    if (task.after != null && !Array.isArray(task.after))
      throw new Error(uiText("La propuesta contiene una precedencia inválida."));
    task.after = (task.after || []).map(edge => {
      const key = edge?.key, kind = edge?.kind ?? "FS", lag = edge?.lag ?? 0;
      if (!names.has(key) || key === task.key || seen.has(key) || !["FS","SS","FF","SF"].includes(kind)
           || !Number.isInteger(lag) || Math.abs(lag) > 36500)
        throw new Error(uiText("La propuesta contiene una precedencia inválida."));
      seen.add(key);
      return {key, name:names.get(key), kind, lag};
    });
  }
  return tasks;
}

export function appendSuggestedTasks(plan, proposal, existing, uuid) {
  const ids = new Map(existing.map(task => [task.ref, task.id]));
  for (const row of proposal) ids.set(row.key, uuid());
  const added = proposal.map(row => {
    if (!Number.isInteger(row.days) || row.days < 1 || row.days > 36500)
      throw new Error(uiText("Completá una duración válida en días laborables para cada tarea."));
    return {
      id:ids.get(row.key), name:row.name, estimate_line_id:row.line?.id ?? null,
      parent_id:null, duration_days:row.days, assignments:[], actual_progress:"0",
      not_before:null, finish_by:null, budget:row.line?.total ?? "0",
      predecessors:row.after.map(edge => ({task_id:ids.get(edge.key), kind:edge.kind, lag_days:edge.lag})),
    };
  });
  const tasks = [...plan.tasks, ...added];
  const positions = automaticPositions(tasks);
  const presentation = {...plan.presentation};
  const bottom = Math.max(0, ...plan.tasks.map(task => (presentation[task.id] || positions[task.id]).y + 110));
  for (const task of added) presentation[task.id] = {...positions[task.id], y:positions[task.id].y + bottom};
  return {...plan, tasks, presentation};
}
