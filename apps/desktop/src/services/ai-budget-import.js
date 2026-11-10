import {parseCsv,validateWorkbookArchive} from './exchange.js';
export const normalize=value=>String(value??'').trim().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function importDecimal(value,locale='ar',numeric=false){
 let s=String(value??'').trim();if(!s)return null;
 s=s.replace(/^(?:ARS|USD|\$)\s*/i,'').replace(/\s+/g,'');
 if(!numeric&&locale==='ar'){
  if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/.test(s))throw new Error('Número inválido para formato argentino: '+s);
  s=s.replaceAll('.','').replace(',','.');
 }
 if(numeric&&/^\d+(?:\.\d+)?[eE][+-]?\d+$/.test(s)){
  const [mantissa,exp]=s.toLowerCase().split('e'),[whole,fraction='']=mantissa.split('.'),offset=whole.length+Number(exp),digits=whole+fraction;
  if(Math.abs(Number(exp))>24)throw new Error('Número fuera de rango');
  s=offset<=0?'0.'+'0'.repeat(-offset)+digits:offset>=digits.length?digits+'0'.repeat(offset-digits.length):digits.slice(0,offset)+'.'+digits.slice(offset);
 }
 if(!/^\d{1,16}(?:\.\d{1,8})?$/.test(s))throw new Error('Importe inválido: usá un decimal no negativo, sin separadores de miles');
 return s;
}
export function textPriceRows(text){
 if(text.length>150000)throw new Error('La lista supera 150.000 caracteres');
 const lines=text.trim().split(/\r?\n/).filter(x=>x.trim());
 if(!lines.length)return [];
 if(text.includes('\t'))return lines.map(line=>line.split('\t').map(text=>({text,numeric:false})));
 if(text.includes(';'))return parseCsv(text).map(row=>row.map(text=>({text,numeric:false})));
 return lines.map(line=>{
  const match=/^(.*?)\s*(?::|=|\s)\s*((?:(?:ARS|USD|\$)\s*)?[\d.,]+)\s*$/i.exec(line);
  if(!match)throw new Error('Usá una fila por partida: descripción;precio, columnas pegadas de Excel, o descripción: precio');
  return [{text:match[1].trim(),numeric:false},{text:match[2],numeric:false}];
 });
}
export async function excelPriceRows(file){
 if(file.size>10000000)throw new Error('Máximo 10 MB por Excel');
 const buffer=await file.arrayBuffer();await validateWorkbookArchive(buffer);
 const {readSheet}=await import('read-excel-file/universal');
 const rows=await readSheet(new Blob([buffer]),{parseNumber:value=>({excelNumber:value})});
 if(rows.length>1001||rows.some(row=>row.length>30))throw new Error('Máximo 1000 filas y 30 columnas; dividí la planilla si es mayor');
 return rows.map(row=>row.map(v=>({text:String(v?.excelNumber??v??''),numeric:v?.excelNumber!=null})));
}
export function guessColumns(rows){
 const first=rows[0]||[],find=names=>first.findIndex(c=>names.includes(normalize(c.text)));
 const price=find(['precio','precio unitario','precio unitario ars','p unitario','unitario','precio ars','costo unitario']);
 const description=find(['descripcion','partida','detalle','item','material']);
 return {header:price>=0||description>=0,description:description>=0?description:0,price:price>=0?price:Math.max(1,first.length-1),unit:find(['unidad','und','unid']),quantity:find(['cantidad','cant']),code:find(['codigo','cod'])};
}
export function sourcePrices(rows,columns,locale,currency){
 return rows.slice(columns.header?1:0).filter(row=>row.some(c=>c.text.trim())).map((row,index)=>{
  const cell=key=>row[columns[key]]||{text:'',numeric:false};
  let error='',price=null,quantity=null;
  try{price=importDecimal(cell('price').text,locale,cell('price').numeric);quantity=importDecimal(cell('quantity').text,locale,cell('quantity').numeric);if(price==null)error='Precio vacío: no se interpreta como cero';}catch(e){error=e.message;}
  if(!cell('description').text.trim()&&!cell('code').text.trim())error='Falta descripción o código';
  const marked=/^(ARS|USD)\s*/i.exec(cell('price').text.trim());if(currency&&marked&&marked[1].toUpperCase()!==currency)error='La moneda de esta fila no coincide con el presupuesto';
  return {row_id:'r'+(index+1),description:cell('description').text.trim(),code:cell('code').text.trim(),unit:cell('unit').text.trim(),quantity,unit_price:price,error};
 });
}
export function budgetCandidates(state){
 const positions=new Map();
 return (state.lines||[]).map(line=>{
  const section=(state.sections||[]).find(s=>s.id===state.assignments?.[line.id]);
  const group=section?.id||'';const index=(positions.get(group)||0)+1;positions.set(group,index);
  return {...line,code:line.code||(section?section.code+'.'+String(index).padStart(2,'0'):''),section:section?.title||''};
 });
}
export function localMatches(rows,lines){
 return rows.map(row=>{
  let matches=row.code?lines.filter(l=>normalize(l.code)===normalize(row.code)):[];
  if(matches.length!==1&&row.description)matches=lines.filter(l=>normalize(l.description)===normalize(row.description)&&(!row.unit||normalize(l.unit)===normalize(row.unit)));
  const target=matches.length===1?matches[0]:null;
  return {...row,target:target?.id||'',selected:!!target&&!row.error&&(!row.unit||normalize(row.unit)===normalize(target.unit)),reason:target?(row.unit&&normalize(row.unit)!==normalize(target.unit)?'Código coincidente, unidad distinta: revisar':'Coincidencia exacta'):matches.length>1?'Coincidencia ambigua: elegí la partida':'Sin coincidencia: elegí partida o creala',new_id:globalThis.crypto.randomUUID()};
 });
}
export function parsePlan(text){
 const parsed=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
 if(!Array.isArray(parsed.proposal_lines)||!parsed.proposal_lines.length||parsed.proposal_lines.length>60)throw new Error('No se recibió una propuesta completa (máximo 60 partidas). Pedí una etapa más acotada');
 return parsed.proposal_lines.map((p,index)=>{
  if(typeof p.description!=='string'||!p.description.trim()||p.description.length>500||typeof p.unit!=='string'||!p.unit.trim()||p.unit.length>30||p.section!=null&&(typeof p.section!=='string'||p.section.length>100))throw new Error('Hay partidas con descripción, unidad o rubro inválidos');
  for(const field of ['quantity','unit_price'])if(p[field]!=null&&typeof p[field]!=='string')throw new Error('La propuesta debe usar decimales como texto');
  return {row_id:'p'+(index+1),description:p.description.trim(),unit:p.unit.trim(),section:p.section||'',quantity:importDecimal(p.quantity,'decimal',true),unit_price:importDecimal(p.unit_price,'decimal',true),target:'new',selected:false,reason:'Propuesta IA: revisar alcance y datos faltantes',new_id:globalThis.crypto.randomUUID(),error:''};
 });
}
export function matchingContext(rows,lines){
 const source=rows.filter(r=>!r.error&&!r.target).slice(0,50).map(r=>({row_id:r.row_id,description:r.description,code:r.code,unit:r.unit}));
 if(!source.length)throw new Error('No hay filas pendientes de correspondencia');
 const tokens=s=>new Set(normalize(s).split(' ').filter(w=>w.length>2));
 const candidates=new Map();
 for(const row of source){const words=tokens(row.description);const ranked=lines.map(l=>({l,score:[...tokens(l.description)].filter(w=>words.has(w)).length})).sort((a,b)=>b.score-a.score).slice(0,4);for(const {l} of ranked)candidates.set(l.id,{line_id:l.id,description:l.description.slice(0,160),unit:l.unit,code:l.code});}
 const payload={task:'match_prices',rows:source,candidates:[...candidates.values()]};
 if(new TextEncoder().encode(JSON.stringify(payload)).length>30000)throw new Error('Demasiadas candidatas para IA: resolvé algunas filas manualmente primero');
 return payload;
}
export function applyAiMatches(text,rows,context){
 const parsed=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
 if(!Array.isArray(parsed.price_matches))throw new Error('La IA no devolvió correspondencias válidas');
 const allowedRows=new Set(context.rows.map(r=>r.row_id)),allowedLines=new Set(context.candidates.map(l=>l.line_id)),seen=new Set();
 const matches=new Map();
 for(const m of parsed.price_matches){if(!allowedRows.has(m.row_id)||!allowedLines.has(m.line_id)||seen.has(m.row_id))continue;seen.add(m.row_id);matches.set(m.row_id,m);}
 return rows.map(row=>{const m=matches.get(row.row_id);return !row.target&&m?{...row,target:m.line_id,selected:false,reason:'Sugerida por IA: '+String(m.reason||'revisar').slice(0,200)}:row;});
}
export function reviewedBatch(rows,lines,estimate,id,currency,newEstimate=null){
 const selected=rows.filter(r=>r.selected);if(!selected.length)throw new Error('Marcá las filas que querés aplicar');
 const updates=[],creates=[],deletes=[],seen=new Set();
 for(const r of selected){
  if(r.error)throw new Error('Hay filas seleccionadas con errores');
  if(r.operation==='create'&&r.target!=='new')throw new Error('Para crear una partida elegí + Crear partida como destino');
  if(!r.target)throw new Error('Elegí una partida o Crear partida en cada fila seleccionada');
  if(r.operation==='delete'){
   const line=lines.find(l=>l.id===r.target);if(!line||seen.has(line.id))throw new Error('Elegí una partida existente, sin repetirla, para eliminar');seen.add(line.id);
   deletes.push({line_id:line.id,expected:{description:line.description,unit:line.unit,quantity:line.quantity,unit_cost:line.unit_cost,analysis_id:line.analysis_id||null}});continue;
  }
  const parsedPrice=importDecimal(r.unit_price,'decimal',true),price=parsedPrice??'0';
  if(r.target==='new'){
   if(!r.description.trim()||!r.unit.trim())throw new Error('Las nuevas partidas requieren descripción y unidad');
   creates.push({id:r.new_id,description:r.description.trim(),unit:r.unit.trim(),quantity:importDecimal(r.quantity,'decimal',true)??'0',unit_price:price,section:r.section?.trim()||null});
  }else{
   if(parsedPrice==null)throw new Error('Un precio vacío no puede reemplazar un precio existente');
   const line=lines.find(l=>l.id===r.target);if(!line||seen.has(line.id))throw new Error('Una partida no existe o aparece seleccionada más de una vez');seen.add(line.id);
   updates.push({line_id:line.id,expected:{description:line.description,unit:line.unit,quantity:line.quantity,unit_cost:line.unit_cost,analysis_id:line.analysis_id||null},unit_price:price,...(r.operation==='edit'?{description:r.description.trim(),unit:r.unit.trim(),quantity:importDecimal(r.quantity,'decimal',true)??line.quantity}:{})});
  }
 }
 if(currency!==estimate.currency)throw new Error('La moneda de origen debe coincidir con la del presupuesto. No se convierte automáticamente');
 return {id,estimate_id:estimate.id,currency,new_estimate:newEstimate,updates,creates,deletes};
}
export function duplicateWarning(row,lines){return lines.some(l=>normalize(l.description)===normalize(row.description)&&normalize(l.unit)===normalize(row.unit))?'Ya existe una partida con esa descripción y unidad':'';}

export function changeProposals(text){
 const value=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));
 if(!Array.isArray(value.proposal_changes)||!value.proposal_changes.length||value.proposal_changes.length>100)throw new Error('La lista de cambios no es válida (máximo 100)');
 return value.proposal_changes.map(p=>{
  if(!['edit','delete'].includes(p.action)||typeof p.line_id!=='string'||!p.line_id.match(/^[0-9a-f-]{36}$/i))throw new Error('Acción o identificador de partida inválido');
  const result={line_id:p.line_id,action:p.action};
  for(const name of ['description','unit'])if(p[name]!=null){if(typeof p[name]!=='string'||!p[name].trim()||p[name].length>(name==='unit'?30:500))throw new Error('Datos de edición inválidos');result[name]=p[name].trim();}
  for(const name of ['quantity','unit_price'])if(p[name]!=null){if(typeof p[name]!=='string')throw new Error('La propuesta debe usar decimales como texto');result[name]=importDecimal(p[name],'decimal',true);}
  return result;
 });
}
export function rowsFromChanges(proposals,lines){
 const seen=new Set();
 return proposals.map((p,i)=>{
  const l=lines.find(x=>x.id===p.line_id);
  if(!l||seen.has(l.id))throw new Error('Una partida propuesta no pertenece al presupuesto o está repetida. Pedí otra propuesta');seen.add(l.id);
  return {row_id:'c'+(i+1),target:l.id,operation:p.action,description:p.description??l.description,unit:p.unit??l.unit,quantity:p.quantity??l.quantity,unit_price:p.unit_price??l.unit_cost,selected:false,reason:p.action==='delete'?'Propuesta de ELIMINACIÓN: confirmar expresamente':'Propuesta de edición IA: revisar',error:'',new_id:globalThis.crypto.randomUUID()};
 });
}
export function editContext(lines){
 const candidates=[];let size=0;
 for(const l of lines){const row={line_id:l.id,description:l.description.slice(0,180),unit:l.unit,quantity:l.quantity,unit_price:l.unit_cost};const bytes=new TextEncoder().encode(JSON.stringify(row)).length;if(size+bytes>28000)break;candidates.push(row);size+=bytes;}
 return JSON.stringify({task:'manage',total_partidas:lines.length,partidas_incluidas:candidates.length,candidates,nota:'Solo se pueden proponer cambios de los identificadores incluidos. No inventar datos faltantes ni proponer eliminaciones no solicitadas.'});
}
