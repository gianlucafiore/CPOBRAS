import {compareDecimals,divideDecimals} from '../decimal.js';
import {emptyAcu} from './ai-acu.js';

// A productivity statement describes output per time, not a resource quantity.
// Only route explicit requests concerning the currently selected budget line.
const fold=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9.,/]+/g,' ').trim();
const equipment=/\b(?:retroexcavadora|excavadora|pala mecanica|topadora|grua|camion|hormigonera|mezcladora|minicargadora|compactadora)\b/;
const day=/\b(?:dia|dias|jornada|jornadas)\b/;
const ratePattern=/\b(\d{1,7}(?:[.,]\d{1,3})?)\s*(m2|m3)\s*(?:x|por|al|\/|en)\s*(?:1\s*)?(?:dia|dias|jornada|jornadas)\b/;

function details(brief){
 const query=fold(brief);
 const value=ratePattern.exec(query);
 if(!value)return null;
 const rate=value[1].replace(',','.');
 if(compareDecimals(rate,'0')<=0)return null;
 return {rate,workUnit:value[2],equipment:equipment.exec(query)?.[0]||null};
}

export function productivityEditRequest(question,selectedLine){
 if(!selectedLine||!/\b(?:modific|cambi|ajust|actualiz|correg|pon|establec|configur|rendim|productividad)\w*\b/.test(fold(question)))return null;
 const data=details(question);
 if(!data||fold(selectedLine.unit)!==data.workUnit)return null;
 return {mode:'fill',operation:'productivity',lineIds:[selectedLine.id],brief:question};
}

/** Prepare the complete ACU with one revised equipment consumption.
 * The catalog unit is never silently changed, and its inconsistency is
 * explicitly recorded; a clear day-based label can justify the inference.
 */
export function productivityEditRow(brief,seed,resources){
 const data=details(brief);
 if(!data)throw new Error('Indicá el rendimiento como 40 m³ por día, por ejemplo.');
 if(fold(seed.unit)!==data.workUnit)throw new Error('El rendimiento indicado no coincide con la unidad de la partida seleccionada.');
 const referenced=(seed.components||[]).map(component=>({component,resource:resources.find(r=>r.id===component.resource_id)}))
  .filter(item=>item.resource?.kind==='equipment');
 const normalized=description=>fold(description).replace(/\b(?:retro excavadora)\b/g,'retroexcavadora');
 const matching=data.equipment?referenced.filter(item=>normalized(item.resource.description).includes(data.equipment)):referenced;
 if(matching.length!==1)throw new Error('No hay un único equipo del ACU que corresponda al rendimiento solicitado; elegí el equipo de la partida.');
 const resource=matching[0].resource;
 const unit=fold(resource.unit);
 const description=fold(resource.description);
 const dayUnit=day.test(unit);
 const dayDescription=/\b(?:x|por|al|\/|por jornada|por dia)\s*(?:1\s*)?(?:dia|jornada)\b/.test(description);
 // A mismatched catalog unit is tolerated only with a clear day-based
 // description, never by converting kilograms or other physical quantities.
 if(!dayUnit&&!dayDescription)throw new Error('No encontré una referencia temporal clara para inferir días del insumo. Indicá la unidad de uso real del equipo.');
 const consumption=divideDecimals('1',data.rate,8);
 if(compareDecimals(consumption,'0')<=0)throw new Error('El rendimiento indicado produce un consumo fuera de la precisión admitida.');
 const warnings=!dayUnit?[`Advertencia: «${resource.description}» está registrado como ${resource.unit} en la biblioteca, aunque su descripción indica uso por día. Se aplicó ${consumption} día por ${seed.unit} con criterio constructivo; el precio del catálogo se mantiene sin cambio. Revisá la unidad del insumo.`]:[];
 const components=structuredClone(seed.components).map(c=>{
  if(c.resource_id!==resource.id)return c;
  const {...other}=c;
  delete other.source_quantity;
  delete other.source_unit;
  return {...other,quantity:consumption,quantity_unit:resource.unit,requested_description:resource.description,consumption_support:`Rendimiento informado por el usuario: ${data.rate} ${seed.unit}/día; consumo inverso: ${consumption} día/${seed.unit}.`};
 });
 const row={...emptyAcu(seed),components,assumptions:[`Rendimiento confirmado por el usuario: ${data.rate} ${seed.unit} por día. Consumo del equipo: ${consumption} día por ${seed.unit}.`,...warnings],advisories:warnings};
 return row;
}
