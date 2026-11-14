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
  const m=new RegExp('(?:\\b(?:la\\s+)?unidad\\s+(?:de\\s+medida\\s*)?(?:es\\s*[:=]?|[:=])\\s*|\\b(?:se\\s+mide|medido)\\s+en\\s+|\\b(?:por|en)\\s+)('+unitMatcher+')\\b','i').exec(value);
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
  const currency=priceMatch?.[1]?.toUpperCase().replace('U$S','USD')||null;
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
  const q=fold(value);
  if(!/^(?:si|si dale|dale|perfecto|bueno|ok|crealos|cargalos|agregalos|carga esos insumos|agrega esos insumos|carga los que sugeriste|agrega los que sugeriste)(?: por favor)?$/.test(q))return false;
  return /\b(?:insumos?|materiales?|poste|alambrado|cercado|alambre|cercos?|grampas?|tensores?)\b/.test(fold(previousAnswer))
    &&/\b(?:agrega|agregar|carga|cargar|crea|crear|sugier|recomiend|necesit|faltan|faltantes|podemos)\b/.test(fold(previousAnswer));
}
/** Return the next action using only user text and the active in-chat draft. */
export function resourceChatTurn(question,pending=null,previousAnswer=''){
  if(typeof question!=='string'||!question.trim()||question.length>1800)return null;
  const q=fold(question),hasDraft=Array.isArray(pending?.rows)&&pending.rows.length>0;
  // A partida, ACU or budget request can never become a resource-library write.
  if(/\b(?:partidas?|acus?|presupuestos?)\b/.test(q)&&!hasDraft)return null;
  if(hasDraft&&discard.test(q))return {action:'discard'};
  if(hasDraft&&approval.test(q))return {action:'approve'};
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
  if(changed&&next.length)return {action:'draft',rows:next};
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
