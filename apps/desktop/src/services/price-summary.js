import {numeric,divideDecimals,compareDecimals} from "../decimal.js";
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
