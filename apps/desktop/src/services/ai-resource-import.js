import {parseResourceRows,resourceHeaders} from './resource-exchange.js';

const maxRows=60;
const rowKeys=new Set(['description','kind','unit','price','code','id','resource_id','resourceId']);
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const hasValue=value=>value!=null&&(typeof value!=='string'||value.trim()!=='');
const text=value=>typeof value==='string'?value.trim():'';
const blankErrors=[
 'Descripción obligatoria, hasta 500 caracteres',
 'Tipo: MAT (Material), MO (Mano de obra), EQ (Equipo) o SC/SUB (Subcontrato)',
 'Unidad obligatoria, hasta 50 caracteres',
];

function validateRows(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>maxRows)throw new Error('Revisá una lista de 1 a 60 insumos');
 if(rows.some(row=>!object(row)))throw new Error('Cada propuesta de insumo debe ser un objeto');
}

/**
 * Revalidate a local, editable preview. Prices here are user input; model prices
 * never reach this function through parseAiResourceProposals. Codes and IDs are
 * deliberately excluded so imports create library records with native codes.
 * Revalidate the selected subset again immediately before native import.
 */
export function reviewAiResourceRows(rows,existing=[]){
 if(Array.isArray(rows)&&rows.length===0)return [];
 validateRows(rows);
 const prepared=rows.map(row=>({
  description:text(row.description),kind:text(row.kind),unit:text(row.unit),
  price:typeof row.price==='string'?row.price.trim():'',
 }));
 const sheetRows=prepared.filter(row=>[row.description,row.kind,row.unit,row.price].some(hasValue));
 const catalog=existing.map(row=>({
  code:'',description:text(row.description),kind:text(row.kind),unit:text(row.unit),
 }));
 const parsed=sheetRows.length?parseResourceRows([
  resourceHeaders,...sheetRows.map(row=>['',row.description,row.kind,row.unit,typeof row.price==='string'?row.price:'']),
 ],catalog):[];
 let parsedIndex=0;
 return rows.map((row,index)=>{
  const input=prepared[index];
  const result=[input.description,input.kind,input.unit,input.price].some(hasValue)?parsed[parsedIndex++]:{
   ...input,kind:'',price:null,errors:[...blankErrors],
  };
  const errors=[...result.errors];
  for(const [key,label] of [['description','Descripción'],['kind','Tipo'],['unit','Unidad']]){
   if(row[key]!=null&&typeof row[key]!=='string')errors.push(`${label}: usá texto`);
  }
  if(row.price!=null&&typeof row.price!=='string')errors.push('Precio: usá un decimal como texto');
  const warnings=Array.isArray(row.warnings)?[...new Set(row.warnings.filter(value=>typeof value==='string').map(value=>value.trim()).filter(Boolean))].slice(0,20).map(value=>value.slice(0,500)):[];
  return {
   row_number:index+1,code:'',description:result.description,kind:result.kind,unit:result.unit,
   // Preserve invalid manual input for correction instead of silently clearing it.
   price:result.price??(typeof input.price==='string'&&input.price!==''?input.price:null),
   errors,warnings,selected:row.selected===true,
  };
 });
}

/** Read an untrusted model proposal; no IDs, codes or prices are authoritative. */
export function parseAiResourceProposals(response,existing=[]){
 if(typeof response!=='string'||response.length>200_000)throw new Error('La respuesta de insumos es inválida o demasiado extensa');
 let value;
 try{value=JSON.parse(response.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}
 catch{throw new Error('La respuesta de insumos está incompleta o no tiene el formato JSON esperado');}
 if(!object(value)||Object.keys(value).some(key=>!['answer','resource_proposals'].includes(key))||(own(value,'answer')&&typeof value.answer!=='string'))throw new Error('La respuesta debe contener resource_proposals y, opcionalmente, answer');
 validateRows(value.resource_proposals);
 const rows=value.resource_proposals.map((row,index)=>{
  if(Object.keys(row).some(key=>!rowKeys.has(key)))throw new Error(`Insumo ${index+1}: la propuesta contiene campos no permitidos`);
  for(const key of ['description','kind','unit'])if(row[key]!=null&&typeof row[key]!=='string')throw new Error(`Insumo ${index+1}: ${key} debe ser texto o quedar vacío para revisar`);
  const warnings=[];
  if(hasValue(row.price))warnings.push('Se descartó el precio propuesto por IA. Ingresá un precio confirmado manualmente o dejalo vacío.');
  if(hasValue(row.code))warnings.push('Se descartó el código propuesto por IA. CPOBRAS asignará un código al importar.');
  if(['id','resource_id','resourceId'].some(key=>hasValue(row[key])))warnings.push('Se descartó el identificador propuesto por IA. No se modifica ningún insumo existente.');
  return {description:text(row.description),kind:text(row.kind),unit:text(row.unit),price:null,warnings,selected:false};
 });
 return reviewAiResourceRows(rows,existing);
}


// The model, not regexes over user sentences, interprets resource creation.
function canonicalQuotedMoney(token){
 const raw=String(token).trim();
 if(!/^\d{1,12}(?:[.,]\d{1,3})*$/.test(raw))return null;
 let normalized=raw;
 if(/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(raw))normalized=raw.replace(/\./g,'').replace(',','.');
 else if(/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(raw))normalized=raw.replace(/,/g,'');
 else normalized=raw.replace(',','.');
 return /^\d{1,12}(?:\.\d{1,2})?$/.test(normalized)?normalized:null;
}
function priceHasUserEvidence(price,quote,userMessages){
 if(typeof quote!=='string'||!quote.trim()||quote.length>180||!Array.isArray(userMessages))return false;
 const evidence=quote.trim();
 if(!userMessages.some(message=>typeof message==='string'&&message.includes(evidence)))return false;
 return (evidence.match(/\d[\d.,]*/g)||[]).some(token=>canonicalQuotedMoney(token)===price);
}
const allowedDecisions=new Set(['propose','approve','discard','answer']);
const resourceKinds=new Set(['material','labor','equipment','subcontract']);
/** An IA intent plus proposals, not a writing permission. Prices must cite user input. */
export function readResourceModelDecision(response,{userMessages=[],priorDraft=[],existing=[]}={}){
 if(typeof response!=='string'||response.length>100000)throw new Error('La respuesta de insumos es demasiado extensa');
 let value;
 try{value=JSON.parse(response.trim().replace(/^\x60{3}(?:json)?\s*/i,'').replace(/\s*\x60{3}$/,''));}
 catch{throw new Error('La IA no entregó una propuesta JSON válida. No se guardó nada.');}
 if(!object(value))throw new Error('La IA no entregó una decisión estructurada.');
 const action=value.action||(Array.isArray(value.resource_proposals)?'propose':'answer');
 if(!allowedDecisions.has(action)||typeof value.answer!=='string')throw new Error('Respuesta de IA incompleta o con acción no permitida.');
 if(action!=='propose')return {action,answer:value.answer};
 validateRows(value.resource_proposals);
 const result=value.resource_proposals.map((source,index)=>{
   if(!object(source)||Object.keys(source).some(key=>!['description','kind','unit','price','price_evidence','draft_ref','note'].includes(key)))
     throw new Error('Insumo '+(index+1)+': campos no permitidos.');
   const description=text(source.description);
   const kind=text(source.kind);
   const unit=text(source.unit);
   if(description.length>500||unit.length>50||kind&&!resourceKinds.has(kind))throw new Error('Insumo '+(index+1)+': descripción, tipo o unidad inválidos.');
   if(source.price!=null&&typeof source.price!=='string')throw new Error('Insumo '+(index+1)+': precio debe ser texto decimal.');
   let price=null,warnings=[];
   if(source.price!=null&&source.price!==''){
     const normalized=canonicalQuotedMoney(source.price);
     if(!normalized)throw new Error('Insumo '+(index+1)+': precio no válido.');
     const ref=source.draft_ref;
     const previous=typeof ref==='string'&&/^(?:0|[1-9]\d{0,2})$/.test(ref)?priorDraft[Number(ref)]:null;
     if(priceHasUserEvidence(normalized,source.price_evidence,userMessages)
       ||previous&&previous.price===normalized){
       price=normalized;
     }else{
       warnings.push('Precio no incorporado: falta una cita literal del valor indicado por vos.');
     }
   }
   if(source.note!=null&&typeof source.note!=='string')throw new Error('Insumo '+(index+1)+': nota no válida.');
   if(source.note)warnings.push(String(source.note).slice(0,200));
   return {description,kind,unit,price,selected:false,...(warnings.length?{warnings}:{})};
 });
 return {action:'propose',answer:value.answer,rows:result,review:reviewAiResourceRows(result,existing)};
}
