import {buildCatalogContext} from './ai-catalog-context.js';

const fold=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const decimal=/^(?:0|[1-9]\d{0,7})(?:\.\d{1,6})?$/;
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export function standaloneAcuIntent(question){
 const q=fold(question);
 if(/[¿?]/.test(String(question||''))||/^(?:como|cual|cuales|que|cuanto|por que|se puede)\b/.test(q))return false;
 return /\bacus?\b/.test(q)
  && /\b(?:crea|crear|creame|gener[a-z]*|arma|armar|armame|prepara|preparar|necesito|quiero)\b/.test(q)
  && !/\b(?:partida|partidas|seleccionada|seleccionado|existentes|presupuesto|completa|completar|actualiza|editar)\b/.test(q);
}
export function standaloneAcuContext(brief,catalog){
 const evidence=JSON.parse(buildCatalogContext({
  question:brief+' material yeso agua mano de obra oficial ayudante',
  resources:catalog.resources||[],currency:catalog.currency||'ARS',asOf:catalog.as_of||null
 }));
 const matches=[...evidence.matches,...evidence.related].slice(0,65);
 return JSON.stringify({
  task:'standalone_acu',access:'review_only',brief:brief.slice(0,2000),
  instructions:[
   'Crear UN ACU independiente en la biblioteca, NO una partida ni rubro del presupuesto.',
   'Responder exclusivamente JSON {answer,standalone_acu:{description,unit,components:[{resource_id,quantity,quantity_unit,consumption_support}],missing_resources:[texto],assumptions:[texto]}}.',
   'Cada consumo quantity es un decimal positivo EN LA UNIDAD EXACTA del insumo para UNA unidad del ACU.',
   'Usar solo resource_id de catalog; no inventar precios, ID, especificaciones ni conversiones.',
   'Diferenciar material y mano de obra, con consumos estimativos fundamentados; faltantes se anotan en missing_resources.',
   'No devolver un ACU si no hay base para ningún consumo. No declarar guardado ni aprobación.'
  ],
  catalog:matches.map(r=>({id:r.id,description:r.description,kind:r.kind,unit:r.unit,price:r.price,currency:r.currency})),
  truncated:evidence.truncated,missing_price_evidence:matches.some(r=>r.price==null)
 });
}
export function parseStandaloneAcu(text,brief,catalog){
 if(typeof text!=='string'||text.length>25000)throw new Error('La respuesta de ACU supera el tamaño permitido.');
 let response;
 try{response=JSON.parse(text.trim().replace(/^\x60\x60\x60(?:json)?\s*/i,'').replace(/\s*\x60\x60\x60$/,''));}
 catch{throw new Error('La IA respondió texto, pero no preparó una composición de ACU verificable. No se guardó nada.');}
 const a=response?.standalone_acu;
 if(!a||typeof a!=='object'||Array.isArray(a)||typeof a.description!=='string'||!a.description.trim()||a.description.length>220
   ||typeof a.unit!=='string'||!a.unit.trim()||a.unit.length>20||!Array.isArray(a.components)||a.components.length>24)throw new Error('La propuesta de ACU no contiene descripción, unidad y composición válidas.');
 const evidence=JSON.parse(standaloneAcuContext(brief,catalog));
 const known=new Map(evidence.catalog.map(row=>[row.id,row]));
 const seen=new Set(),items=[],pending=[];
 const rawMissing=Array.isArray(a.missing_resources)?a.missing_resources:[];
 for(const missing of rawMissing.slice(0,24))if(typeof missing==='string'&&missing.trim()&&missing.length<250)pending.push(missing.trim());
 for(const comp of a.components){
  if(!comp||typeof comp!=='object'||!uuid.test(comp.resource_id||'')||seen.has(comp.resource_id)){pending.push('Componente sin identificador único válido');continue;}
  seen.add(comp.resource_id);
  const resource=known.get(comp.resource_id);
  if(!resource){pending.push('La IA propuso un insumo no verificado en la biblioteca');continue;}
  // A provider may serialize the estimated consumption as a JSON number.
  // Normalize only short, finite decimals, rejecting scientific notation and
  // unsafe precision rather than guessing a conversion or rounding a price.
  const quantity=typeof comp.quantity==='number'&&Number.isFinite(comp.quantity)&&!/[eE]/.test(String(comp.quantity))?String(comp.quantity):comp.quantity;
  if(typeof quantity!=='string'||!decimal.test(quantity)||Number(quantity)<=0){pending.push('Consumo inválido: '+resource.description);continue;}
  if(comp.quantity_unit!==resource.unit){pending.push('Unidad incompatible: '+resource.description);continue;}
  if(resource.currency&&resource.currency!=='ARS'){pending.push('Precio sin cotización ARS: '+resource.description);continue;}
  if(typeof resource.price!=='string'||!decimal.test(resource.price)){
    pending.push('Sin precio ARS verificable: '+resource.description);continue;
  }
  items.push({resourceId:resource.id,description:resource.description,kind:resource.kind,unit:resource.unit,quantity,unitPrice:resource.price,
   note:typeof comp.consumption_support==='string'?comp.consumption_support.slice(0,220):''});
 }
 return {description:a.description.trim(),unit:a.unit.trim(),items,
  pending:[...new Set(pending)],assumptions:Array.isArray(a.assumptions)?a.assumptions.filter(x=>typeof x==='string').slice(0,8).map(x=>x.slice(0,200)):[],
  ready:items.length>0,brief:brief.slice(0,2000)};
}
export function standaloneAcuWriteArgs(prepared){
 if(!prepared?.ready||!prepared.items?.length)throw new Error('No hay insumos verificables para guardar este ACU.');
 return {code:'',description:prepared.description,unit:prepared.unit,
  components:prepared.items.map(r=>({resourceId:r.resourceId,quantity:r.quantity,unitPrice:r.unitPrice}))};
}
