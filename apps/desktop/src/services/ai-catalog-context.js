const byteLimit=24_000,resultLimit=80,encoder=new TextEncoder();
export const foldCatalogText=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const codeFold=value=>String(value??'').normalize('NFC').toLowerCase().trim();
function singular(word){
 const explicit={sanitaria:'sanitario',sanitarias:'sanitario',sanitarios:'sanitario',paredes:'pared',redes:'red',luces:'luz'};
 if(explicit[word])return explicit[word];
 if(word.length>4&&word.endsWith('ces'))return word.slice(0,-3)+'z';
 if(word.length>4&&/[rlnz]es$/.test(word))return word.slice(0,-2);
 return word.length>4&&word.endsWith('s')?word.slice(0,-1):word;
}
const words=value=>foldCatalogText(value).split(' ').filter(Boolean).map(singular);
const stop=new Set(words('a al algo algun alguna algunos algunas ante antes asi ahora como con cual cuales cuando cuanto cuanta cuantos cuantas de del desde donde el ella ellos ellas en entre es ese esa esos esas esta este estas estos estoy estamos existe existen falta faltan hacer hasta hay incluir incluye ingresar la las le les lo los mas me mi mis mostrar muestra mostrame necesito no nos o para pero por porque por favor precio precios puede puedo podes podria que quiero saber se si sin sobre su sus te tengo tenes tiene tienen todo toda todos todas tu tus un una unos unas usar utiliza valor valores vale valen cuanto cuesta cuestan cual seria son insumo insumos material materiales biblioteca catalogo sistema disponible disponibles real reales actual actuales carga cargar cargalos cargalas cargarlo cargala completar completa completar partidas partida presupuesto presupuestos obra obras acu acus composicion rendimiento rendimientos consumo consumos informacion datos pantalla lista listado decime dime explicame contar contame revisar revisa perfecto dale hacelo hazlo tambien entonces gracias'));
const sanitary=new Set(words('inodoro bidet bidé bacha lavatorio grifería bañera ducha pileta cisterna mingitorio sifón desagüe canilla flexible cloacal termofusión'));
const unique=values=>[...new Set(values)];
function bathroomDomain(value){
 const text=foldCatalogText(value);
 if(/\b(?:artefactos?|insumos?|materiales?|equipamiento|accesorios?|instalaciones?)\s+(?:de|del|para|en)\s+(?:(?:un|el|los|unos|mi)\s+)?banos?\b/.test(text))return true;
 // A literal catalog name containing “baño” is not a room/category request.
 if(/\b(?:nombre|llamado|llamada|denominado|denominada|modelo|codigo)\s+(?:de\s+)?bano\b/.test(text))return false;
 return /^(?:(?:un|el|los|unos|mi)\s+)?banos?$/.test(text)||/\b(?:para|en|del)\s+(?:(?:un|el|los|unos|mi)\s+)?banos?\b/.test(text)||/\b(?:equipar|armar|hacer|instalar|presupuestar|renovar|remodelar)\s+(?:(?:un|el|los|unos|mi)\s+)?banos?\b/.test(text);
}

function queryInput(question,messages=[]){
 const rawCurrent=typeof question==='string'?question:'';
 const rawHistory=(Array.isArray(messages)?messages:[]).slice(-8).filter(message=>message?.role==='user'&&typeof message.content==='string').slice(-4).map(message=>message.content);
 const current=rawCurrent.slice(0,6000),history=rawHistory.map(text=>text.slice(0,3000));
 const significant=value=>unique(words(value).filter(word=>!stop.has(word)&&/[a-z]/.test(word)&&word.length>1&&word.length<=80));
 const currentTerms=significant(current),historyTerms=significant(history.join(' '));
 const allTerms=unique([...currentTerms,...historyTerms]);
 const selectedTerms=new Set(allTerms.slice(0,40));
 const texts=[current,...history];
 const codeCandidates=unique(texts.flatMap(text=>{
  const folded=codeFold(text),codes=[];
  for(const match of folded.matchAll(/\b[a-z][a-z0-9]*(?:[-_.\/][a-z0-9]+)*\b/g))if(/\d/.test(match[0]))codes.push(match[0]);
  for(const match of folded.matchAll(/\bc[oó]digo\s*[:#=]?\s*([a-z0-9][a-z0-9_.\/-]*)/g))codes.push(match[1]);
  return codes;
 }));
 const allCodes=codeCandidates.filter(code=>code.length<=100);
 const domains=allTerms.includes('sanitario')||texts.some(bathroomDomain)?['sanitary']:[];
 return {
  public:{terms:[...selectedTerms],codes:allCodes.slice(0,20),domains,history_used:historyTerms.some(term=>selectedTerms.has(term)),truncated:allTerms.length>40||allCodes.length>20||allCodes.length!==codeCandidates.length||current.length!==rawCurrent.length||history.some((text,index)=>text.length!==rawHistory[index].length)},
  currentTerms:new Set(currentTerms.filter(term=>selectedTerms.has(term))),historyTerms:new Set(historyTerms.filter(term=>selectedTerms.has(term)&&!currentTerms.includes(term))),codeTexts:texts.map(codeFold),
 };
}

/** User-only search criteria. Domain expansion is a candidate list, never equivalence. */
export function catalogQuery(question,messages=[]){return queryInput(question,messages).public;}

/** Parse one bounded, read-only search refinement, never model tools or commands. */
export function parseCatalogQuery(text){
 if(typeof text!=='string')return null;
 const explicit=/["']catalog_query["']\s*:|\bcatalog_query\s*:/.test(text);
 let value;
 try{value=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}
 catch{if(explicit)throw new Error('La búsqueda de catálogo está incompleta o no tiene el formato esperado');return null;}
 if(!value||typeof value!=='object'||!Object.hasOwn(value,'catalog_query'))return null;
 if(encoder.encode(text).length>32_000)throw new Error('La consulta de catálogo supera 32 KB');
 if(Array.isArray(value)||Object.keys(value).some(key=>!['answer','catalog_query'].includes(key))||(Object.hasOwn(value,'answer')&&typeof value.answer!=='string'))throw new Error('La respuesta de búsqueda solo admite answer y catalog_query');
 const query=value.catalog_query;
 if(!query||typeof query!=='object'||Array.isArray(query)||Object.keys(query).some(key=>!['terms','codes','query'].includes(key)))throw new Error('La búsqueda de catálogo solo admite términos o códigos de insumos');
 const clean=(input,max)=>{
  if(typeof input!=='string'||!input.trim()||input.trim().length>max||/[\u0000-\u001F\u007F]/.test(input))throw new Error('Hay términos o códigos de búsqueda vacíos o demasiado extensos');
  const result=input.trim();
  if(/\b(?:select\b[\s\S]*\bfrom|insert\s+into|update\b[\s\S]*\bset|delete\s+from|drop\s+(?:table|database)|alter\s+table|truncate\s+table|pragma|attach\s+database)\b/i.test(result))throw new Error('La búsqueda de catálogo solo admite texto de insumos; no admite SQL ni comandos');
  return result;
 };
 if(Object.hasOwn(query,'query')){
  if(Object.hasOwn(query,'terms')||Object.hasOwn(query,'codes'))throw new Error('Usá query o las listas de términos y códigos, sin mezclarlos');
  return clean(query.query,500);
 }
 const list=(key,max)=>{
  if(!Object.hasOwn(query,key))return [];
  if(!Array.isArray(query[key])||query[key].length>10)throw new Error('Cada lista de búsqueda admite hasta 10 términos o códigos');
  return unique(query[key].map(item=>clean(item,max)));
 };
 const terms=list('terms',80),codes=list('codes',100);
 if(!terms.length&&!codes.length)throw new Error('Indicá al menos un término o código para buscar en el catálogo');
 return [...terms,...codes.map(code=>'código '+code)].join('; ');
}

function priceValue(value){
 // Native decimal strings remain exact, including zero and amounts above 2^53.
 return typeof value==='string'&&/^\d+(?:\.\d+)?$/.test(value.trim())?value.trim():null;
}
const nativeText=value=>typeof value==='string'?value:'';
function exactCodeMatch(code,query){
 if(!code)return false;
 if(query.public.codes.includes(code))return true;
 if(/^\d+$/.test(code)||code.length<2)return false;
 const escaped=code.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const boundary=new RegExp('(?:^|[^\\p{L}\\p{N}_.\\/-])'+escaped+'(?=$|[^\\p{L}\\p{N}_.\\/-])','u');
 return query.codeTexts.some(text=>boundary.test(text));
}

/** Index real catalog records without inventing identities, types or units. */
export function indexCatalog(resources=[]){
 if(!Array.isArray(resources))throw new Error('El catálogo debe ser una lista de insumos reales');
 return resources.map((resource,index)=>{
  const row=resource&&typeof resource==='object'?resource:{};
  return {index,resource:row,code:codeFold(row.code),terms:new Set(words(row.description)),price:priceValue(row.price)};
 });
}

function evidence(entry,currency,matchedBy,matchedTerms=[]){
 const row=entry.resource;
 return {
  id:nativeText(row.id),code:nativeText(row.code),description:nativeText(row.description),unit:nativeText(row.unit),kind:nativeText(row.kind),
  price:entry.price,currency:nativeText(row.currency)||currency||null,price_source:nativeText(row.price_source)||null,effective_date:nativeText(row.effective_date)||null,
  matched_by:matchedBy,...(matchedTerms.length?{matched_terms:matchedTerms}:{}),
 };
}

/** Compact read-only evidence; never executes a search, contacts AI or writes data. */
export function buildCatalogContext({question='',messages=[],resources=[],currency=null,asOf=null}={}){
 const query=queryInput(question,messages),index=indexCatalog(resources),codes=new Set(query.public.codes);
 const matches=[],related=[];
 const generic=!query.currentTerms.size&&!query.historyTerms.size&&!codes.size;
 for(const entry of index){
  const current=[...query.currentTerms].filter(term=>entry.terms.has(term));
  const history=[...query.historyTerms].filter(term=>entry.terms.has(term));
  const codeMatch=exactCodeMatch(entry.code,query);
  if(codeMatch||current.length||history.length||generic){
   matches.push({entry,by:codeMatch?'exact_code':current.length?'question_terms':history.length?'history_terms':'catalog_sample',terms:unique([...current,...history]),score:(codeMatch?10_000:0)+current.length*100+history.length*10});
  }else if(query.public.domains.includes('sanitary')&&[...entry.terms].some(term=>sanitary.has(term))){
   related.push({entry,by:'sanitary_domain',terms:[],score:0});
  }
 }
 matches.sort((a,b)=>b.score-a.score||a.entry.index-b.entry.index);
 const priced=entries=>entries.filter(item=>item.entry.price!=null).length;
 const allPriced=index.filter(entry=>entry.price!=null).length;
 const safeCurrency=typeof currency==='string'&&currency.length<=10?currency:null;
 const payload={
  kind:'resource_catalog',access:'read_only',currency:safeCurrency,as_of:typeof asOf==='string'&&asOf.length<=40?asOf:null,
  query:query.public,
  counts:{total:index.length,priced:allPriced,missing_price:index.length-allPriced,matched:matches.length,matched_priced:priced(matches),matched_missing_price:matches.length-priced(matches),related:related.length,related_priced:priced(related),related_missing_price:related.length-priced(related),returned:0},
  matches:[],related:[],truncated:query.public.truncated,
  limits:{results:resultLimit,bytes:byteLimit,result_limit_reached:false,byte_limit_reached:false},
  evidence_rules:[
   'Los registros son evidencia real de solo lectura. Los nombres y presentaciones se conservan literalmente; una coincidencia de palabras no garantiza equivalencia técnica.',
   'related contiene candidatos de un rubro relacionado, nunca sustitutos confirmados. Precio null significa sin precio verificable; cero es un precio real explícito. No convertir monedas ni unidades ni inventar precios o presentaciones.',
   'Los conteos abarcan todos los recursos recibidos antes del recorte. Si truncated es true, no afirmar que un insumo no existe ni que se enumeró todo el catálogo. Una búsqueda sin coincidencias tampoco prueba inexistencia: pedir datos más precisos.',
  ],
 };
 const candidates=[...matches.map(item=>({...item,bucket:'matches'})),...related.map(item=>({...item,bucket:'related'}))];
 if(candidates.length>resultLimit){payload.truncated=true;payload.limits.result_limit_reached=true;}
 for(const item of candidates.slice(0,resultLimit)){
  const bucket=payload[item.bucket];bucket.push(evidence(item.entry,safeCurrency,item.by,item.terms));payload.counts.returned++;
  if(encoder.encode(JSON.stringify(payload)).length>byteLimit){bucket.pop();payload.counts.returned--;payload.truncated=true;payload.limits.byte_limit_reached=true;}
 }
 // The envelope is small and bounded; records that cannot fit are omitted whole,
 // preserving full descriptions, unit presentations and exact monetary strings.
 return JSON.stringify(payload);
}
