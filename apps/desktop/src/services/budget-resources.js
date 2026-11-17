import {sumDecimals,multiplyDecimals,compareDecimals} from '../decimal.js';

/** Aggregate actual ACU consumption across every line, keeping decimal strings exact. */
export function budgetResourceTotals(lines, analyses, resources=[], prices={}, definition=null) {
 const catalog=new Map(resources.map(r=>[r.id,r])), totals=new Map();
 for(const line of lines){
  const analysis=analyses.get(line.analysis_id);
  for(const c of analysis?.components||[]){
   const resource=catalog.get(c.resource_id);
   const quantity=multiplyDecimals(line.quantity??'0',c.quantity);
   const price=prices[c.resource_id]??c.unit_price;
   const current=totals.get(c.resource_id)||{resource_id:c.resource_id,description:resource?.description||c.description,
    kind:resource?.kind||c.kind,unit:resource?.unit||c.unit||'—',quantity:'0',total:'0'};
   current.quantity=sumDecimals([current.quantity,quantity]);
   current.total=price==null||current.total==null?null:sumDecimals([current.total,multiplyDecimals(quantity,price)]);
   totals.set(c.resource_id,current);
  }
 }
 for(const row of definition?.rows||[]){
  if(row.role!=='direct_costs')continue;
  for(const i of row.items||[]){
   if(i.group||!i.resource_id)continue;
   const r=catalog.get(i.resource_id),quantity=multiplyDecimals(multiplyDecimals(i.quantity,i.months??'1'),multiplyDecimals(i.participation_percent??'100','0.01'));
   const current=totals.get(i.resource_id)||{resource_id:i.resource_id,description:r?.description||i.description,kind:r?.kind||i.resource_kind||'material',unit:r?.unit||i.unit,quantity:'0',total:'0'};
   current.quantity=sumDecimals([current.quantity,quantity]);current.total=current.total==null?null:sumDecimals([current.total,multiplyDecimals(quantity,i.unit_price)]);totals.set(i.resource_id,current);
  }
 }
 return [...totals.values()];
}
export async function loadBudgetAnalyses(invoke,lines){
 const ids=[...new Set(lines.map(l=>l.analysis_id).filter(Boolean))];
 return new Map(await Promise.all(ids.map(async id=>[id,await invoke('get_analysis_details',{analysisId:id})])));
}
export function materialNeedsFromTotals(totals,reportNeeds=[]){
 const positive=value=>compareDecimals(value,'0')>0?value:'0';
 return totals.filter(t=>t.kind==='material'&&compareDecimals(t.quantity,'0')>0).map(t=>{
  const evidence=reportNeeds.find(n=>n.resource_id===t.resource_id)||{};
  const subtract=(a,b)=>sumDecimals([a,multiplyDecimals(b,'-1')]);
  const stock=evidence.stock??'0',consumed=evidence.consumed??'0';
  const shortage=positive(subtract(subtract(t.quantity,consumed),stock));
  const outstanding=positive(subtract(evidence.ordered??'0',evidence.received??'0'));
  return {...evidence,resource_id:t.resource_id,description:t.description,required:t.quantity,stock,
   ordered:evidence.ordered??'0',received:evidence.received??'0',shortage,suggested:positive(subtract(shortage,outstanding))};
 });
}
