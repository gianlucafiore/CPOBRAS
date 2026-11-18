import {multiplyDecimals,divideDecimals} from "../decimal.js";
export const estimateMonths = definition => definition?.estimated_months ?? "6";
export const itemMonths = (item,definition) => item.use_estimate_duration ? estimateMonths(definition) : item.months;
export function monthFactor(item,definition){
  const months=itemMonths(item,definition);
  return months==null ? "1" : divideDecimals(months,item.months_per_payment??"1",24);
}
export function applyEstimateDuration(definition){
  definition.estimated_months=estimateMonths(definition);
  for(const row of definition.rows||[])for(const item of row.items||[])
    if(item.use_estimate_duration)item.months=definition.estimated_months;
  return definition;
}
export function organizationCostAmount(item,months){
  if(item.periodicity==='once')return item.amount;
  const amount=multiplyDecimals(item.amount,months);
  return item.periodicity==='yearly'?divideDecimals(amount,'12',24):amount;
}
