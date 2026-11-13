import { divideDecimals, multiplyDecimals, compareDecimals } from "../decimal.js";
import {invokeReviewedAiAction} from './ai-view-api-contracts.js';
import { buildCatalogContext,foldCatalogText } from "./ai-catalog-context.js";

const intents = new Set(["new", "clarify", "revise", "add", "question", "show", "review", "edit", "approve", "discard", "finish", "general"]);

export function readLibraryAcuIntent(text) {
  const result = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  if (!intents.has(result?.action) || (result.work != null &&
      (typeof result.work !== "string" || result.work.length > 1500 || !result.work.trim()))) {
    throw new Error("La respuesta no identifica una acción válida de la biblioteca de ACU.");
  }
  // Target is an advisory semantic reference. The UI always verifies which
  // proposal is actually open before selecting any native write workflow.
  const target=["draft","selected"].includes(result.target)?result.target:undefined;
  return {action:result.action, work:result.action === "new" ? result.work?.trim() : undefined,
    ...(target?{target}:{})};
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
// The provider can legally serialize a decimal as a JSON number. Canonicalize
// only safe finite values; never let a float become a stored rounded price.
const consumption = value => {
  const text = typeof value === "number" && Number.isFinite(value) ? String(value) : value;
  return typeof text === "string" && decimal.test(text) && Number(text) > 0 ? text : null;
};
const pendingLabel = item => {
  if (typeof item === "string") return item.trim().slice(0, 180);
  if (!item || typeof item !== "object" || Array.isArray(item)) return "";
  const name = String(item.description || item.name || item.resource || "").trim();
  const note = String(item.reason || item.detail || item.note || "").trim();
  const estimate = item.quantity != null
    ? String(item.quantity) + (item.unit ? " " + String(item.unit) : "") : "";
  return [name, estimate, note].filter(Boolean).join(" · ").slice(0, 180);
};
const normalizedUnit = value => String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim().replace(/²/g,"2").replace(/³/g,"3").replace(/\s+/g," ");
// The model must compute catalog-unit quantities and cite the product
// presentation. These are universal metric identities only: there are NO
// built-in weights for cement, sand, bags, big-bags or construction recipes.
const physicalUnits = new Map([
 ["mg",["mass","0.000001"]],["g",["mass","0.001"]],["gr",["mass","0.001"]],
 ["gramo",["mass","0.001"]],["gramos",["mass","0.001"]],
 ["kg",["mass","1"]],["kgs",["mass","1"]],["kilo",["mass","1"]],["kilos",["mass","1"]],
 ["kilogramo",["mass","1"]],["kilogramos",["mass","1"]],
 ["t",["mass","1000"]],["tn",["mass","1000"]],["ton",["mass","1000"]],
 ["tonelada",["mass","1000"]],["toneladas",["mass","1000"]],
 ["ml",["volume","0.001"]],["l",["volume","1"]],["lt",["volume","1"]],
 ["litro",["volume","1"]],["litros",["volume","1"]],
 ["m3",["volume","1000"]],["metro cubico",["volume","1000"]],
 ["metros cubicos",["volume","1000"]],
 ["mm",["length","0.001"]],["cm",["length","0.01"]],["m",["length","1"]],
 ["metro",["length","1"]],["metros",["length","1"]],
 ["m2",["area","1"]],["metro cuadrado",["area","1"]],["metros cuadrados",["area","1"]]
]);
const physicalUnit = unit => physicalUnits.get(normalizedUnit(unit).replace(/\.$/,"")) || null;
const isSame = (a,b) => a && b && a[0] === b[0];
const quantityIn = (value,source,target) => isSame(source,target)
  ? divideDecimals(multiplyDecimals(value,source[1]),target[1],6) : null;
const sameAmount = (a,b) => {
  try {return compareDecimals(a,b)===0;}
  catch {return false;}
};
// Evidence comes from the catalog record, not a model's untrusted prose.
const presentationEvidence = resource => {
  const text=normalizedUnit((resource.description||"")+" "+(resource.unit||""));
  const values=[];
  for(const match of text.matchAll(/(\d{1,12}(?:[.,]\d{1,6})?)\s*(mg|kgs?|kilogramos?|kilos?|gramos?|gr|g|toneladas?|ton|tn|t|m3|ml|litros?|lt|l|cm|mm|m)\b/g)){
    const value=consumption(match[1].replace(",",".")),unit=physicalUnit(match[2]);
    if(value && unit)values.push({value,unit});
  }
  return values;
};
function catalogQuantity(component,resource){
  const original=consumption(component.quantity);
  if(!original)return {reason:"El consumo no es un decimal positivo válido."};
  const from=normalizedUnit(component.quantity_unit||resource.unit);
  const to=normalizedUnit(resource.unit);
  if(from === to){
    if(component.catalog_quantity != null && !sameAmount(component.catalog_quantity,original))
      return {reason:"La cantidad declarada para la unidad del catálogo no coincide con el consumo."};
    return {quantity:original};
  }
  const calculated=consumption(component.catalog_quantity);
  if(!calculated)
    return {reason:"La IA no indicó cuánto corresponde en "+resource.unit+"; debe calcularlo con el catálogo."};
  const source=physicalUnit(from),target=physicalUnit(to);
  if(source && target){
    const expected=quantityIn(original,source,target);
    if(expected == null)return {reason:"La unidad del consumo y la del catálogo tienen dimensiones físicas distintas; falta una equivalencia justificada."};
    if(!sameAmount(calculated,expected))
      return {reason:"El resultado calculado por IA no coincide con la conversión entre unidades físicas."};
    return {quantity:calculated,conversion:original+" "+component.quantity_unit};
  }
  // A non-physical catalog unit is a product presentation. The model states
  // its capacity per unit, which must be independently present in the catalog.
  if(!source || target)
    return {reason:"La equivalencia propuesta no es dimensionalmente verificable en el catálogo."};
  const basis=component.conversion_basis;
  const per=consumption(basis?.per_unit_quantity),perUnit=physicalUnit(basis?.per_unit_unit);
  if(!per || !isSame(source,perUnit))
    return {reason:"La IA no justificó la capacidad física de una unidad de compra."};
  const fact=presentationEvidence(resource).some(entry=>
    isSame(entry.unit,perUnit)&&sameAmount(quantityIn(entry.value,entry.unit,perUnit),per));
  if(!fact)
    return {reason:"La presentación declarada por la IA no figura en la descripción real del insumo."};
  const expected=divideDecimals(quantityIn(original,source,perUnit),per,6);
  if(!sameAmount(calculated,expected))
    return {reason:"El cálculo de unidades de compra indicado por la IA no coincide con su fundamento."};
  return {quantity:calculated,conversion:original+" "+component.quantity_unit};
}
export function libraryAcuContext(question,catalog) {
  // Search only the model/user-supplied query. No fixed construction recipes or
  // trade-specific material expansions are embedded in the app.
  const evidence=JSON.parse(buildCatalogContext({
    question,resources:catalog.resources,currency:catalog.currency,asOf:catalog.as_of,
  }));
  const resources=[...evidence.matches,...evidence.related];
  return {resources,context:JSON.stringify({
    task:"library_acu",currency:catalog.currency,as_of:catalog.as_of,
    resources,catalog_truncated:evidence.truncated,
  })};
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
        (raw.components != null && (!Array.isArray(raw.components) || raw.components.length > 40)) ||
        (!(raw.components?.length) && !raw.missing?.length) ||
        (raw.missing != null && (!Array.isArray(raw.missing) || raw.missing.length > 12 ||
          raw.missing.some(item => !pendingLabel(item)))) ||
        (raw.excluded != null && (!Array.isArray(raw.excluded) || raw.excluded.length > 20 ||
          raw.excluded.some(item => !field(item,180))))) {
      throw new Error("El borrador del ACU tiene campos incompletos o inválidos.");
    }
    const seen = new Set();
    const pending = [];
    let conversionPending=false;
    // Exclusions are semantically extracted by the model from the user's own
    // words; this layer has no material-specific blacklist.
    const excluded = (raw.excluded||[]).map(foldCatalogText).filter(Boolean);
    const omitted = text => excluded.some(label=>foldCatalogText(text).includes(label));
    const components = (raw.components || []).flatMap(component => {
      const resource = byId.get(component?.resource_id);
      const requestedName = typeof component?.description === "string" ? component.description.slice(0, 90)
        : typeof component?.requested_description === "string" ? component.requested_description.slice(0, 90)
        : "Insumo no identificado";
      if (omitted(resource?.description||requestedName)) return [];
      if (!resource) {
        // Keep a named unresolved material visible, but never allow a made-up
        // identifier to become a component without any identifying evidence.
        if (requestedName === "Insumo no identificado") {
          throw new Error("El borrador contiene un insumo sin verificar.");
        }
        pending.push(requestedName + ": no se encontró una referencia verificable en el catálogo.");
        return [];
      }
      const value = consumption(component.quantity);
      if (seen.has(resource.id) || !value ||
          (component.quantity_unit != null && !field(component.quantity_unit, 50))) {
        throw new Error("El borrador contiene un insumo sin verificar, repetido o con un rendimiento inválido.");
      }
      seen.add(resource.id);
      const converted = catalogQuantity({...component,quantity:value},resource);
      if (!converted.quantity) {
        conversionPending=true;
        pending.push(resource.description+": "+value+" "+(component.quantity_unit||resource.unit)+" por "+raw.unit+". "+converted.reason);
        return [];
      }
      return [{resource_id:resource.id, description:resource.description, unit:resource.unit,
        quantity:converted.quantity, unit_price:resource.price ?? "", ...(converted.conversion ? {
          conversion:converted.conversion,
        } : {})}];
    });
    return {
      description:raw.description.trim(),
      unit:raw.unit.trim(),
      components,
      aiWarnings:[...(raw.missing ?? []).map(pendingLabel).filter(item=>!omitted(item)), ...pending],
      conversionPending,
    };
  });
  return {answer:data.answer.slice(0, 2000), drafts, keepDraft:!drafts.length && data.keep_draft === true, missingField:data.missing_field};
}
