// Conversational resource creation: bounded, typed drafts. A chat message is
// NEVER permission to write without a complete, locally reviewed preview.
import {reviewAiResourceRows} from './ai-resource-import.js';

const MAX_ITEMS=60;
const fold=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const norm=value=>fold(value).replace(/\s+/g,' ');
const approval=/^(?:(?:si|dale|ok|bueno|perfecto|bien)\s+)*(?:apruebo|aprobalo|aprobalos|aprobar|confirmo|cargalo|cargalos|carga|cargar|guardalo|guardalos|guarda|guardar|registralos|registralo|hacelo|hazlo)(?:\s+(?:directamente|por favor|todo|todos|los insumos|el insumo))?$/;
const discard=/^(?:cancela|cancelar|descarta|descartar|olvida|no los cargues|no lo cargues)(?:\s+(?:los insumos|la propuesta|todo))?$/;
const resourceNoun=/^(?:poste|postes|alambre|malla|tejido|grampa|grampas|clavo|clavos|tornillo|tornillos|cemento|arena|cal|ladrillo|adhesivo|pastina|tubo|caño|tuberia|perfil|chapa|madera|hormigon|hidrofugo|pintura|placa|aislante|hilo|tensor|torniquete|varilla|fleje|rollo|oficial|ayudante|peon|retroexcavadora|albañil)\b/i;
const createNoun=/^(?:(?:crea|crear|creame|agrega|agregar|agregame|carga|cargar|cargame|registra|registrar|registrame|prepara|preparar|suma|sumar)\s+)(?:(?:un|una|nuevo|nueva|el|la)\s+)?(?:(?:insumo|material|recurso)\s+(?:de\s+)?)?/i;
const kindNames=[['subcontract',/\b(?:subcontrato|subcontratacion)\b/],['labor',/\b(?:mano de obra|operario|oficial|ayudante|peon|jornal)\b/],['equipment',/\b(?:equipo|maquinaria|maquina|retroexcavadora)\b/],['material',/\b(?:material|materiales)\b/]];
const safeKinds=new Set(['material','labor','equipment','subcontract']);
const unitAliases=new Map([
 ['unidad','unidad'],['unidades','unidad'],['un','unidad'],['u','unidad'],
 ['kg','kg'],['kilogramo','kg'],['kilogramos','kg'],['g','g'],
 ['m','m'],['ml','m'],['metro','m'],['metros','m'],
 ['m2','m²'],['m²','m²'],['metro cuadrado','m²'],['metros cuadrados','m²'],
 ['m3','m³'],['m³','m³'],['metro cubico','m³'],['metros cubicos','m³'],
 ['bolsa','bolsa'],['bolsas','bolsa'],['rollo','rollo'],['rollos','rollo'],
 ['h','h'],['hora','h'],['horas','h'],['jornal','jornal'],
 ['conjunto','conjunto'],['litro','L'],['litros','L'],['l','L'],
 ['tonelada','t'],['toneladas','t'],['t','t']
]);
const unitMatcher='(?:unidad(?:es)?|un|u|kg|kilogramos?|g|m²|m2|m³|m3|ml|m|metros?\\s+(?:cuadrados?|cubicos?)|metros?|bolsas?|rollos?|horas?|h|jornal|conjunto|litros?|l|toneladas?|t)';
const pricePattern=/(?:\bprecio(?:\s+unitario)?\s*(?::|=|es)?\s*)(?:(ARS|USD|U\$S)\s*|\$\s*)?(\d{1,12}(?:[.,]\d{1,3})*(?:[.,]\d{1,2})?)\b/i;
const barePricePattern=/^(?:el\s+)?precio\s*(?::|=|es)\s*(?:(ARS|USD|U\$S)\s*|\$\s*)?([\d.,]+)\s*$/i;
function decimalPrice(value){
  let price=String(value).trim();
  if(/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(price))price=price.replace(/\./g,'').replace(',','.');
  else if(/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(price))price=price.replace(/,/g,'');
  else price=price.replace(',','.');
  return /^\d{1,12}(?:\.\d{1,2})?$/.test(price)?price:null;
}
function detectKind(value){
  const text=fold(value);
  const explicit=/(?:\b(?:es|tipo|clase|categoria)\s*(?:de\s+)?(?::|=)?\s*)?(mano de obra|material|equipo|subcontrato)\b/.exec(text);
  if(explicit&&(/(?:^|[;,\s])(?:es|tipo|clase|categoria)\b/.test(text)||/^\s*(?:mano de obra|material|equipo|subcontrato)\b/.test(text))){
    return kindNames.find(([,pattern])=>pattern.test(explicit[1]))?.[0]||null;
  }
  return null;
}
function guessKind(description){
  const text=fold(description);
  if(/^(?:oficial|ayudante|peon|albañil|mano de obra|jornal)\b/.test(text))return 'labor';
  if(/^(?:retroexcavadora|equipo|maquinaria)\b/.test(text))return 'equipment';
  if(resourceNoun.test(text))return 'material';
  return '';
}
function detectUnit(value){
  const m=new RegExp('(?:\\b(?:la\\s+)?unidad\\s*(?:de\\s+medida\\s*)?(?:es\\s*[:=]?|[:=])\\s*|\\b(?:se\\s+mide|medido)\\s+en\\s+|\\b(?:por|en)\\s+)('+unitMatcher+')\\b','i').exec(value);
  return m?unitAliases.get(norm(m[1]))||null:null;
}
function stripCommand(value){
  const without=value.trim().replace(/^[\s"'“”]+|[\s"'“”]+$/g,'');
  const start=without.replace(createNoun,'');
  return start===without?without:start;
}
function namedResource(text){
  const raw=stripCommand(text);
  const clean=raw.replace(/\s*,?\s*\bprecio(?:\s+unitario)?\s*(?::|=|es)?\s*(?:(?:ARS|USD|U\$S)\s*|\$\s*)?[\d.,]+(?:\s*(?:ARS|USD))?\s*$/i,'')
    .replace(/[,;]\s*(?:(?:es|tipo|clase)\s+)?(?:material|mano de obra|equipo|subcontrato)(?:\s*,\s*(?:la\s+)?unidad.*)?$/i,'')
    .replace(/[,;]\s*(?:la\s+)?unidad\s*(?:de\s+medida)?\s*(?:es|:|=)\s*.+$/i,'')
    .trim().replace(/[;,.\s]+$/,'');
  if(clean.length<4||clean.length>250||/[{}[\]\n]/.test(clean))return null;
  // A generic "agregá mano de obra" may refer to an ACU, not the resource library.
  // Unrecognized names require an explicit "insumo/recurso" target.
  const explicitlyResource=/\b(?:insumo|recurso)\b/i.test(text)&&/^\s*(?:crea|crear|creame|agrega|agregar|carga|cargar|registra|registrar)\b/i.test(text);
  if(!resourceNoun.test(fold(clean))&&!explicitlyResource)return null;
  if(/^(?:precio|material|unidad|es material|es equipo)\b/i.test(clean))return null;
  return clean;
}
function extractOne(text){
  const description=namedResource(text);
  const priceMatch=pricePattern.exec(text);
  const unit=detectUnit(text);
  const kind=detectKind(text);
  const mentionedCurrency=priceMatch?/(?:\bUSD\b|U\$S|\bd[oó]lares\b)/i.test(text)?'USD':priceMatch[1]?.toUpperCase().replace('U$S','USD')||'ARS':null;
  const currency=mentionedCurrency;
  return {description,kind,unit,price:priceMatch?decimalPrice(priceMatch[2]):null,currency,hasPrice:!!priceMatch};
}
function emptyRow(description='',kind='',unit='',price=null){
  return {description,kind,unit,price,selected:false};
}
function isResourceBulkIntent(value){
  const q=fold(value);
  return /\b(?:crea|crear|carga|cargar|agrega|agregar|registra|registrar|prepara|preparar|arma|armar)\b/.test(q)
    &&/\b(?:insumos?|materiales?|recursos?)\b/.test(q)
    &&!/\b(?:partidas?|acus?|analisis de costos)\b/.test(q);
}
function isSuggestedAcceptance(value,previousAnswer){
  const q=fold(value).replace(/[.!?¿]+$/,'').trim();
  const referenced=/^(?:(?:si|si dale|dale|perfecto|bueno|ok|claro|de acuerdo)(?: por favor)?|(?:crealos|cargalos|agregalos|preparalos|registralos)(?: por favor)?|(?:carga|crea|agrega|prepara|registra) (?:esos|todos los|los) (?:insumos|materiales|recursos)|(?:agrega|carga|crea|prepara) los que sugeriste|(?:necesito|quiero|quisiera|podes|puedes|podrias|podes por favor|puedes por favor|me podes|me puedes)\s+(?:que\s+)?(?:crear|crea|cargar|carga|preparar|prepara|agregar|agrega|registrar|registra)(?:los|las| esos insumos| los insumos| los materiales)?|(?:necesito|quiero|podes|puedes)\s+crearlos)(?: por favor)?$/.test(q);
  if(!referenced)return false;
  const prior=fold(previousAnswer);
  // Pronouns resolve only against an actual resource-related preceding turn.
  // A prior partida/ACU proposal must NEVER be interpreted as a resource import.
  return /\b(?:insumos?|materiales?|recursos?|postes?|alambrado|cercado|tejido|alambres?|grampas?|tensores?)\b/.test(prior)
    && !/\b(?:partidas?|acus?)\b/.test(prior);
}
/** An existing assistant recommendation can become a draft without another model call.
 * This extracts only explicitly enumerated material names, never prices or IDs.
 * Entries with ambiguous units remain pending for review.
 */
export function resourceSuggestionsFromText(answer){
  if(typeof answer!=='string'||answer.length>12000)return [];
  const source=answer.replace(/\s+/g,' ');
  const anchor=/\b(?:se necesitan|necesitas|necesitar[íi]as|se requieren|se utilizan|se recomiendan|recomiendo|materiales necesarios:|insumos necesarios:)\s*:?\s*/i.exec(source);
  if(!anchor)return [];
  // The first recommendation sentence is the list; conditional subsequent
  // advice (e.g. "también podría ser necesario...") is not automatically added.
  const paragraph=source.slice(anchor.index+anchor[0].length).split(/[.!?\n]/,1)[0].slice(0,2000);
  const rows=[],seen=new Set();
  for(const fragment of paragraph.split(/\s*,\s*|\s*;\s*|\s+y\s+(?=(?:el |la |los |las )?(?:poste|alambre|tejido|malla|tensor|grampa|brida|precinto|rollo|tornillo|cemento|arena|concreto))/i)){
    const description=fragment.trim()
      .replace(/^(?:(?:y|e)\s+)?(?:el|la|los|las|unos|unas)\s+/i,'')
      .replace(/[,:;\s]+$/,'');
    if(description.length<4||description.length>160||/[{}[\]]/.test(description))continue;
    const token=fold(description);
    const matches=/^(?:postes?|tensores?|alambres?|tejidos?|mallas?|grampas?|bridas?|precintos?|rollos?|tornillos?|clavos?|cementos?|concretos?|arenas?|adhesivos?|pastinas?|chapas?|perfiles?|ca[nñ]os?|tubos?)\b/.test(token);
    if(!matches)continue;
    // Duplicated suggestions ("tensores" twice) produce only one proposal.
    const key=token.split(/\s+/)[0];
    if(seen.has(key))continue;
    seen.add(key);
    let unit='';
    if(/^(?:postes?|tensores?|grampas?|bridas?|precintos?|tornillos?|clavos?)\b/.test(token))unit='unidad';
    else if(/^rollos?\b/.test(token))unit='rollo';
    rows.push({description,kind:'material',unit,price:null});
    if(rows.length>=MAX_ITEMS)break;
  }
  return rows;
}
/**
 * Parse multiple explicitly named construction resources in ONE user turn.
 * A noun with measurements (e.g. 3" x 2.2 m) is kept in the description;
 * a price and its purchase unit are never part of that description.
 * This parser only produces a local draft and never performs writes.
 */
const resourceHead=/\b(?:mano\s+de\s+obra|postes?|tejidos?|mallas?|grampas?|cementos?|alambres?|equipos?|maquinarias?|tornillos?|clavos?|pinturas?|perfiles?|chapas?|maderas?|arenas?|ladrillos?|adhesivos?|pastinas?|caños?|tubos?|oficial(?:es)?|ayudantes?)\b/gi;
const exclusionWords=/\b(?:quita(?:r|lo|los)?|saca(?:r|lo|los)?|elimina(?:r|lo|los)?|borra(?:r|lo|los)?|no\s+(?:lo\s+|los\s+)?(?:agregues?|pongas?|incluyas?|cargues?)|ya\s+(?:lo\s+)?(?:tengo|tenemos|existe)|tampoco|sin\s+este)\b/i;
const commonCommodity={
  poste:/\bpostes?\b/i,tejido:/\btejidos?\b/i,malla:/\bmallas?\b/i,grampa:/\bgrampas?\b/i,
  cemento:/\bcementos?\b/i,alambre:/\balambres?\b/i,equipo:/\b(?:equipos?|maquinarias?)\b/i,
  labor:/\b(?:mano de obra|oficial|ayudante)\b/i
};
function resourceKey(value,leadingOnly=false){
  const title=fold(value);
  // The FIRST noun defines the resource identity. Otherwise a labor row such
  // as «Mano de obra para cerco de tejido» gets mistaken for the fabric, and
  // «Cemento para fijación de postes» gets mistaken for a post.
  const leading=title.replace(/^(?:el|la|los|las|un|una)\s+/,'');
  const first=Object.entries(commonCommodity).find(([,pattern])=>{
    const anchored=new RegExp('^'+pattern.source.replace(/^\\b/,'').replace(/\\b$/,'')+'\\b','i');
    return anchored.test(leading);
  });
  if(first)return first[0];
  return leadingOnly?null:Object.entries(commonCommodity).find(([,pattern])=>pattern.test(title))?.[0]||null;
}
function resourceMatches(row,key){
  if(key==='equipo')return row.kind==='equipment'||/^\s*(?:equipo|maquinaria)/i.test(row.description);
  return resourceKey(row.description,true)===key;
}
function priceInSegment(segment){
  // Price requires an explicit linguistic price marker, a purchase separator,
  // or a number followed by a purchase unit. Never mistake dimensions for prices.
  const number='(\\d{1,12}(?:[.,]\\d{1,3})*(?:[.,]\\d{1,2})?)';
  const patterns=[
    new RegExp('(?:\\b(?:precio(?:\\s+unitario)?|vale|valen|cuesta|cuestan|es|son)\\s*(?::|=|es)?\\s*)(?:(?:ARS|USD|U\\$S)\\s*|\\$\\s*)?'+number,'i'),
    new RegExp('(?:^|[,;\\s])a\\s+(?:(?:ARS|USD|U\\$S)\\s*|\\$\\s*)?'+number+'(?=\\s*(?:cada\\s+un[ao]|por\\s+|x\\s*m[23²³]?\\b|$))','i'),
    new RegExp(':\\s*(?:(?:ARS|USD|U\\$S)\\s*|\\$\\s*)?'+number+'(?=\\s*(?:cada\\s+un[ao]|por\\s+|x\\s*m[23²³]?\\b|$))','i'),
    new RegExp('\\b'+number+'(?=\\s*(?:cada\\s+un[ao]|por\\s+(?:unidad|m2|m²|m3|m³|kg|hora)|x\\s*m[23²³]?\\b))','i')
  ];
  for(const pattern of patterns){
    const match=pattern.exec(segment);
    if(!match)continue;
    const value=decimalPrice(match[1]);
    if(!value)return {number:null,start:match.index,end:match.index+match[0].length,currency:'ARS'};
    return {number:value,start:match.index,end:match.index+match[0].length,
      currency:/\b(?:USD|dolares|dólares)\b|U\$S/i.test(segment)?'USD':'ARS'};
  }
  return null;
}
function purchaseUnit(segment){
  const text=fold(segment);
  if(/\b(?:cada\s+un[ao]|por\s+(?:unidad|pieza)|la\s+unidad|en\s+unidad)\b/.test(text))return 'unidad';
  const m=/\b(?:x\s*|por\s+|el\s+|la\s+)(m2|m²|m3|m³|kg|h|hora|unidad|un|u|litro|litros)\b/.exec(text)
    ||/\bx(m2|m²|m3|m³)\b/.exec(text);
  return m?unitAliases.get(m[1])||null:null;
}
function explicitBulkSegments(question){
  const preamble=/^\s*(?:necesitamos|quiero|queremos|crear|crea|preparar|prepara|cargar|carga|agregar|agrega)\b.{0,110}?\binsumos?\b[^:]{0,180}:\s*/i;
  return question.replace(preamble,'');
}
function resourceSegments(question){
  const source=explicitBulkSegments(question);
  // Ignore nouns inside a description, e.g. «Poste de madera» or
  // «Mano de obra para cerco de tejido», which are not additional insumos.
  const matches=[...source.matchAll(resourceHead)].filter(match=>
    !/\b(?:de|para)\s+$/i.test(source.slice(Math.max(0,match.index-10),match.index)));
  return {source,entries:matches.map((match,i)=>({
    key:resourceKey(match[0]),name:match[0],
    text:source.slice(match.index,i+1<matches.length?matches[i+1].index:source.length).trim(),
    before:source.slice(i===0?0:matches[i-1].index,match.index).trim()
  }))};
}
function resourceTitle(segment,key,context){
  const amount=priceInSegment(segment);
  let name=(amount?segment.slice(0,amount.start):segment)
    .replace(/\b(?:el|del|de la)\s+precio\s*$/i,'')
    .replace(/\s*,?\s*(?:es|son|vale|valen|cuesta|cuestan|precio(?:\s+unitario)?)\s*[:=]?\s*$/i,'')
    .replace(/[,\s;:]+$/,'').trim();
  if(key==='labor'&&/^mano\s+de\s+obra$/i.test(name)){
    const contextMatch=/\bcerco\s+de\s+tejido\s+romboidal\b/i.exec(context);
    return contextMatch?'Mano de obra para cerco de tejido romboidal':'Mano de obra';
  }
  return name;
}
function parseExplicitResourceDetails(question,pending){
  const current=Array.isArray(pending?.rows)?pending.rows.map(row=>({...row})):[];
  const exclude=new Set(Array.isArray(pending?.excluded)?pending.excluded:[]);
  const {source,entries}=resourceSegments(question);
  if(!entries.length)return null;
  // Do not turn generic ACU composition edits into new resource-library rows.
  if(/\b(?:acus?|partidas?|presupuestos?)\b/i.test(question))return null;
  const isBulk=/^\s*(?:necesitamos|quiero|queremos|crear|crea|preparar|prepara|cargar|carga|agregar|agrega)\b.{0,110}\binsumos?\b/i.test(question);
  let updated=false,recognized=0;
  for(const entry of entries){
    const key=entry.key;if(!key)continue;
    const segment=entry.text;
    const prior=entry.before;
    const excludeMe=exclusionWords.test(segment)
      ||/\b(?:no pongas|sin equipos?)\b/i.test(segment);
    if(excludeMe){
      exclude.add(key);
      const count=current.length;
      for(let i=current.length-1;i>=0;i--)if(resourceMatches(current[i],key))current.splice(i,1);
      updated=true;recognized++;continue;
    }
    const price=priceInSegment(segment);
    const unit=purchaseUnit(segment);
    if(!price&&!unit&&!isBulk)continue;
    if(exclude.has(key))continue;
    if(price?.currency==='USD')return {action:'error',message:'Los precios de la biblioteca son ARS; no convertiré importes en USD sin una indicación expresa.'};
    if(price&&!price.number)return {action:'error',message:'No pude interpretar el precio. Escribilo, por ejemplo, como 17500 o 17500,50 ARS.'};
    let index=current.findIndex(row=>resourceMatches(row,key));
    const title=resourceTitle(segment,key,question);
    if(index<0){
      if(current.length>=MAX_ITEMS)return {action:'error',message:'La ficha admite hasta 60 insumos.'};
      if(!title||title.length<4||title.length>250)continue;
      const kind=key==='labor'?'labor':key==='equipo'?'equipment':'material';
      current.push(emptyRow(title,kind));
      index=current.length-1;
    }else if(isBulk&&title.length>current[index].description.length&&!/\b(?:precio|vale|valen)\b/i.test(prior)){
      current[index].description=title;
    }
    if(unit)current[index].unit=unit;
    if(price)current[index].price=price.number;
    updated=true;recognized++;
  }
  if(!updated||!recognized)return null;
  if(!current.length)return {action:'draft-empty',excluded:[...exclude]};
  return {action:'draft',rows:current,excluded:[...exclude]};
}
function removeResourceByName(question,pending){
  if(!Array.isArray(pending?.rows)||!pending.rows.length)return null;
  const q=fold(question);
  const action=/^(?:quita|quitar|saca|sacar|borra|borrar|elimina|eliminar|no agregues|no incluyas|no pongas)\s+(.+)$/i.exec(q);
  if(!action)return null;
  const key=resourceKey(action[1]);
  if(!key)return null;
  const rows=pending.rows.filter(row=>!resourceMatches(row,key));
  const excluded=[...new Set([...(pending.excluded||[]),key])];
  return rows.length?{action:'draft',rows,excluded}:{action:'draft-empty',excluded};
}

/** Return the next action using only user text and the active in-chat draft. */
export function resourceChatTurn(question,pending=null,previousAnswer=''){
  if(typeof question!=='string'||!question.trim()||question.length>1800)return null;
  const q=fold(question),hasDraft=Array.isArray(pending?.rows)&&pending.rows.length>0;
  // A partida, ACU or budget request can never become a resource-library write.
  if(/\b(?:partidas?|acus?|presupuestos?)\b/.test(q)&&!hasDraft)return null;
  if(hasDraft&&discard.test(q))return {action:'discard'};
  if(hasDraft&&approval.test(q))return {action:'approve'};
  const removed=removeResourceByName(question,pending);
  if(removed)return removed;
  const detailed=parseExplicitResourceDetails(question,pending);
  if(detailed)return detailed;
  // A resource explicitly excluded from this review must not slip back in
  // through the more permissive single-resource follow-up parser.
  const mentioned=resourceKey(question);
  if(hasDraft&&mentioned&&pending.excluded?.includes(mentioned))
    return {action:'clarify',message:'Este insumo fue excluido de la ficha por tu indicación anterior. Si querés reincorporarlo, descartá la exclusión y prepará una nueva propuesta; no lo agregaré automáticamente.'};
  if(!hasDraft&&(isResourceBulkIntent(question)||isSuggestedAcceptance(question,previousAnswer)))return {action:'generate'};
  const parts=question.split(/\n|;\s*(?=(?:poste|alambre|malla|grampa|clavo|tornillo|cemento|madera|chapa|carga|agrega)\b)/i).map(x=>x.trim()).filter(Boolean);
  const next=hasDraft?pending.rows.map(row=>({...row})):[];
  let changed=false,priceError=null;
  for(const part of parts){
    const facts=extractOne(part);
    const bare=barePricePattern.exec(part.trim());
    if((facts.hasPrice||bare)&&facts.currency&&facts.currency!=='ARS')return {action:'error',message:'Los precios de esta biblioteca se registran en ARS. Indicá el precio en ARS; no convertiré monedas por mi cuenta.'};
    if(facts.hasPrice&&facts.price===null)return {action:'error',message:'El precio tiene un formato ambiguo; indicá un importe en ARS, por ejemplo 17500 o 17500,50.'};
    if(!facts.description&&!hasDraft&&!next.length)continue;
    let index=next.length-1;
    if(facts.description){
      const existing=next.findIndex(row=>norm(row.description)===norm(facts.description));
      if(existing>=0)index=existing;
      else if(next.length<MAX_ITEMS){
        next.push(emptyRow(facts.description,guessKind(facts.description)));
        index=next.length-1;
      }
    }
    if(index<0)continue;
    const target=next[index];
    if(facts.kind)target.kind=facts.kind;
    if(facts.unit)target.unit=facts.unit;
    const price=facts.hasPrice?facts.price:(bare?decimalPrice(bare[2]):null);
    if(price!==null){target.price=price;changed=true;}
    if(facts.description||facts.kind||facts.unit)changed=true;
  }
  if(changed&&next.length)return {action:'draft',rows:next,excluded:pending?.excluded||[]};
  if(hasDraft&&/\b(?:insumo|material|unidad|precio|tipo)\b/.test(q))
    return {action:'clarify',message:'Conservo la ficha anterior. Indicá los datos que querés completar o decí «cargalo» para aprobar los insumos completos.'};
  return null;
}
export function validatedResourceDraft(rows,existing=[]){
  if(!Array.isArray(rows)||!rows.length||rows.length>MAX_ITEMS)return {rows:[],ready:[],pending:[]};
  const reviewed=reviewAiResourceRows(rows,existing);
  return {rows:reviewed,ready:reviewed.filter(row=>!row.errors.length),
    pending:reviewed.filter(row=>row.errors.length)};
}
export function resourceDraftSummary(review){
  const description=review.rows.map(row=>row.description||'Sin descripción').slice(0,4).join(' · ');
  return review.pending.length
    ?'Ficha de insumos preparada: '+description+'. '+review.ready.length+' completos; '+review.pending.length+' pendientes de datos o de resolver duplicados. Podés completar todos juntos en este chat. No se guardó nada.'
    :'Ficha de '+review.ready.length+' insumo(s) lista para revisar: '+description+'. Los precios indicados por vos se conservan. Aprobá la tarjeta para registrarlos; todavía no se guardó nada.';
}
