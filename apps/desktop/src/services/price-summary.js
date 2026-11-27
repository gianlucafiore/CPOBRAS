import {numeric,divideDecimals,compareDecimals} from "../decimal.js";
import {uiText} from "./interface-language.js";

// Translate standard concepts for display while keeping their stored labels usable in any locale.
export function priceRowLabel({label, role, kind}) {
  if (role === "overhead" && label === "Gastos indirectos") return uiText("Gastos indirectos");
  if (role === "overhead" && label === "Gastos generales") return uiText("Gastos generales");
  if (role === "direct_costs" && label === "Gastos Directos") return uiText("Gastos Directos");
  if (role === "finance" && label === "Gastos financieros") return uiText("Gastos financieros");
  if (role === "profit" && label === "Beneficio") return uiText("Beneficio");
  if (role === "discount" && label === "Descuento") return uiText("Descuento");
  if (role === "tax" && label === "Impuestos") return uiText("Impuestos");
  if (role === "other" && label === "Honorarios profesionales") return uiText("Honorarios profesionales");
  if (kind === "subtotal" && label === "Subtotal") return uiText("Subtotal");
  return label;
}

export function priceCostFactor(subtotal,direct){
  try{return compareDecimals(direct??'0','0')===0?'—':numeric(divideDecimals(subtotal,direct,18));}
  catch{return '—';}
}
export function priceRowRate(row){
  if(!row)return '';
  if(row.kind?.startsWith('percent_'))return numeric(row.percent)+' %';
  if(row.kind==='detailed'&&row.detail_mode==='reference')return numeric(row.reference_percent)+' % CD';
  return '';
}
