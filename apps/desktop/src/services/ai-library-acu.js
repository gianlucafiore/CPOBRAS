import { divideDecimals } from "../decimal.js";
import {invokeReviewedAiAction} from './ai-view-api-contracts.js';
import { buildCatalogContext } from "./ai-catalog-context.js";

const intents = new Set(["new", "clarify", "revise", "add", "question", "show", "approve", "discard", "general"]);

export function readLibraryAcuIntent(text) {
  const result = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  if (!intents.has(result?.action) || (result.work != null &&
      (typeof result.work !== "string" || result.work.length > 1500 || !result.work.trim()))) {
    throw new Error("La respuesta no identifica una acción válida de la biblioteca de ACU.");
  }
  return {action:result.action, work:result.action === "new" ? result.work?.trim() : undefined};
}

export function canSaveLibraryAcu(draft) {
  return draft.components.length > 0 && !draft.aiWarnings.length &&
    draft.components.every(component => component.unit_price !== "");
}

export function saveLibraryAcu(invoke, draft) {
  if (!canSaveLibraryAcu(draft)) throw new Error("La composición tiene datos pendientes.");
  return invokeReviewedAiAction(invoke,"analyses","create_analysis", {
    code:"", description:draft.description, unit:draft.unit,
    components:draft.components.map(row => ({
      resourceId:row.resource_id, quantity:row.quantity, unitPrice:row.unit_price,
    })),
  },{approved:true});
}

const decimal = /^\d{1,12}(?:\.\d{1,6})?$/;
const normalizedUnit = value => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim().replace(/²/g, "2").replace(/³/g, "3");
function catalogQuantity(component, resource) {
  const quantity = component.quantity;
  if (typeof quantity !== "string" || !decimal.test(quantity) || Number(quantity) <= 0) return null;
  if (!component.quantity_unit) return quantity;
  const source = normalizedUnit(component.quantity_unit);
  const target = normalizedUnit(resource.unit);
  if (source === target) return quantity;
  // A package conversion is valid only when the catalog explicitly gives one package weight.
  if (!/^(?:kg|kilos?|kilogramos?)$/.test(source) || !/^(?:bolsa|bolson|saco)\b/.test(target)) return null;
  const weights = new Set([...target.matchAll(/(\d+(?:[.,]\d+)?)\s*kg\b/g),
    ...normalizedUnit(resource.description).matchAll(/(\d+(?:[.,]\d+)?)\s*kg\b/g)]
    .map(match => match[1].replace(",", ".").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")));
  const [weight] = weights;
  if (weights.size !== 1 || !decimal.test(weight) || Number(weight) <= 0) return null;
  return divideDecimals(quantity, weight, 6);
}

export function libraryAcuContext(question, catalog) {
  const evidence = JSON.parse(buildCatalogContext({
    question, resources: catalog.resources, currency: catalog.currency, asOf: catalog.as_of,
  }));
  const resources = [...evidence.matches, ...evidence.related];
  return {
    resources,
    context: JSON.stringify({task:"library_acu", currency:catalog.currency, as_of:catalog.as_of, resources}),
  };
}

export function readLibraryAcus(text, resources) {
  const data = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  if (typeof data?.answer === "string" && data.library_acus == null &&
      (data.keep_draft === true || (data.needs_details === true && data.answer.trim().endsWith("?")))) {
    return {answer:data.answer.slice(0, 2000), drafts:[], keepDraft:data.keep_draft === true, missingField:data.missing_field};
  }
  if (typeof data?.answer !== "string" || !Array.isArray(data.library_acus) || data.library_acus.length > 8) {
    throw new Error("La IA no devolvió borradores de ACU para la biblioteca.");
  }
  if (!data.library_acus.length &&
      !(data.keep_draft === true || (data.needs_details === true && data.answer.trim().endsWith("?")))) {
    throw new Error("La respuesta no incluye una composición ni una pregunta concreta.");
  }
  const byId = new Map(resources.map(resource => [resource.id, resource]));
  const field = (value, limit) => typeof value === "string" && value.trim() && value.length <= limit;
  const drafts = data.library_acus.map(raw => {
    if (!field(raw?.description, 500) || !field(raw.unit, 30) ||
        !Array.isArray(raw.components) || raw.components.length > 40 ||
        (!raw.components.length && !raw.missing?.length) ||
        (raw.missing != null && (!Array.isArray(raw.missing) || raw.missing.length > 12 ||
          raw.missing.some(item => !field(item, 180))))) {
      throw new Error("El borrador del ACU tiene campos incompletos o inválidos.");
    }
    const seen = new Set();
    const pending = [];
    const components = raw.components.flatMap(component => {
      const resource = byId.get(component?.resource_id);
      if (!resource || seen.has(resource.id) || typeof component.quantity !== "string" ||
          !decimal.test(component.quantity) || Number(component.quantity) <= 0 ||
          (component.quantity_unit != null && !field(component.quantity_unit, 50))) {
        throw new Error("El borrador contiene un insumo sin verificar, repetido o con un rendimiento inválido.");
      }
      seen.add(resource.id);
      const quantity = catalogQuantity(component, resource);
      if (!quantity || Number(quantity) <= 0) {
        pending.push(`${resource.description}: ${component.quantity} ${component.quantity_unit} por ${raw.unit}. Falta confirmar la equivalencia con ${resource.unit}.`);
        return [];
      }
      return [{resource_id:resource.id, description:resource.description, unit:resource.unit,
        quantity, unit_price:resource.price ?? "", ...(quantity !== component.quantity ? {
          conversion:`${component.quantity} ${component.quantity_unit}`,
        } : {})}];
    });
    return {
      description:raw.description.trim(),
      unit:raw.unit.trim(),
      components,
      aiWarnings:[...(raw.missing ?? []).map(item => item.trim()), ...pending],
    };
  });
  return {answer:data.answer.slice(0, 2000), drafts, keepDraft:!drafts.length && data.keep_draft === true, missingField:data.missing_field};
}
