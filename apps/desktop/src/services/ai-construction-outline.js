// Contrato de planificación constructiva. La clasificación pertenece al
// razonamiento del modelo, NO a un listado de nombres o palabras clave.
import {importDecimal} from './ai-budget-import.js';
const TYPES=new Set(['material','labor','equipment','subcontract']);
const clean=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
const fold=value=>String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
export const constructionOutlineInstruction=[
 'Actuá como proyectista y analista de costos de obra. Transformá el alcance del usuario en una JERARQUÍA CONSTRUCTIVA, no en un listado de productos.',
 'RUBRO: agrupación de trabajos por sistema, frente de obra o resultado constructivo. No se define por la clase comercial de sus insumos.',
 'PARTIDA: actividad o elemento construido que se puede medir/certificar en una unidad y tiene un resultado físico verificable. Debe describir ese trabajo, no uno de los productos que consume. Sólo crear una partida de suministro aislado cuando el usuario solicita expresamente una provisión independiente del montaje.',
 'INSUMO: recurso material, mano de obra, equipo o subcontrato necesario para ejecutar una partida. Un recurso utilizado en una partida va DENTRO de esa partida, no se crea por sí solo otra partida.',
 'Primero identificá los resultados de trabajo; luego sus recursos. Evitá la fragmentación artificial y no dupliques un recurso como partida y como insumo por la misma actividad.',
 'Respondé exclusivamente JSON con work_sections:[{title,partidas:[{description,unit,quantity,work_result,resources:[{name,kind,unit}]}]}]. Cada partida DEBE incluir siempre todas las claves; resources es [] cuando aún no se conocen insumos, work_result es una frase sobre el resultado del trabajo y unit es su unidad medible. No omitas claves ni uses un objeto donde se espera un array.',
 'title nombra el rubro de trabajo; work_result describe brevemente lo que se entrega o certifica, distinto de una mera compra. resources lista los insumos necesarios en esa partida (pueden faltar detalles).',
 'kind debe ser material, labor, equipment o subcontract. Si una especificación o unidad no se conoce, usá cadena vacía. Para cantidad de la partida usá decimal como texto si la indicó el usuario, de lo contrario null.',
 'No inventes cantidades, precios ni consumos de recursos. Máximo 60 partidas en total, sin limitar arbitrariamente la cantidad de rubros. Respondé con el conjunto mínimo y suficiente de trabajos; no inventes partidas auxiliares que no estén justificadas.'
].join('\n');

// Los modelos pueden omitir campos explicativos. La estructura que sí es
// válida se conserva; solo nombre/rubro y unidad medible son indispensables
// para crear una partida sin inventar datos. El resto queda como advertencia.
// Los avisos se asocian al resultado; nunca se convierten en altas de SQLite.
export function parseConstructionOutline(text){
 let parsed;
 try{parsed=JSON.parse(text.trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,''));}
 catch{throw new Error('La propuesta constructiva no contiene JSON válido de rubros, partidas e insumos.');}
 const sections=parsed?.work_sections??parsed?.rubros;
 if(!Array.isArray(sections)||!sections.length||sections.length>60)
  throw new Error('La IA debe devolver rubros con partidas e insumos, no una lista plana de productos.');
 const rows=[],warnings=[],seen=new Set();
 const warn=(label,issue)=>warnings.push(label+': '+issue);
 for(const [si,section] of sections.entries()){
  const title=clean(section?.title??section?.nombre,100);
  const items=section?.partidas??section?.lines;
  if(!title||!Array.isArray(items)||!items.length){
   warn('Rubro '+(si+1),'falta título o una lista de partidas; no se importó este rubro');
   continue;
  }
  for(const [pi,part] of items.entries()){
   const label='Rubro «'+title+'», partida '+(pi+1);
   const description=clean(part?.description??part?.descripcion,500);
   const unit=clean(part?.unit??part?.unidad,30);
   if(!description||!unit){
    warn(label,'falta '+(!description?'descripción':'unidad medible')+'; no se creó la partida para evitar inventar datos');
    continue;
   }
   if(rows.length>=60){warn(label,'se alcanzó el límite de 60 partidas; el resto queda pendiente');break;}
   const key=fold(title)+'|'+fold(description)+'|'+fold(unit);
   if(seen.has(key)){warn(label,'partida repetida; se conserva una sola entrada');continue;}
   seen.add(key);
   const issues=[];
   const workResult=clean(part?.work_result??part?.resultado_constructivo??part?.resultado,500);
   if(!workResult)issues.push('Falta describir el resultado constructivo');
   const rawResources=part?.resources??part?.insumos;
   if(!Array.isArray(rawResources))issues.push('La IA no enumeró los insumos requeridos');
   if(Array.isArray(rawResources)&&rawResources.length>40)issues.push('La IA enumeró más de 40 insumos; se muestran los primeros 40');
   const resourceIds=new Set(),requirements=[];
   for(const [ri,item] of (Array.isArray(rawResources)?rawResources:[]).slice(0,40).entries()){
    const name=clean(item?.name??item?.description??item?.nombre,200);
    const rawKind=clean(item?.kind??item?.tipo,20);
    const kind=TYPES.has(rawKind)?rawKind:'';
    const resourceUnit=clean(item?.unit??item?.unidad,30);
    if(!name){issues.push('Insumo '+(ri+1)+' sin nombre; requiere revisión');continue;}
    if(!kind)issues.push('Tipo pendiente para insumo «'+name+'»');
    const resourceKey=fold(name)+'|'+kind+'|'+fold(resourceUnit);
    if(resourceIds.has(resourceKey))continue;
    resourceIds.add(resourceKey);
    requirements.push({id:'req-'+(requirements.length+1),description:name,kind,unit:resourceUnit});
   }
   let quantity=null;
   if(part.quantity!=null){
    const raw=typeof part.quantity==='number'&&Number.isFinite(part.quantity)?String(part.quantity):part.quantity;
    if(typeof raw==='string'){
     try{quantity=importDecimal(raw,'decimal',true);}catch{quantity=null;}
    }
    if(quantity==null)issues.push('Cantidad no válida; queda pendiente de medir');
   }
   for(const issue of issues)warn('«'+description+'»',issue);
   rows.push({description,unit,section:title,quantity,unit_price:null,work_result:workResult,
    expected_resources:requirements,outline_issues:issues,new_id:globalThis.crypto.randomUUID()});
  }
 }
 if(!rows.length)throw new Error('No se recibieron partidas con descripción y unidad válidas. '+warnings.slice(0,4).join(' · '));
 Object.defineProperty(rows,'warnings',{value:warnings,enumerable:false});
 return rows;
}
