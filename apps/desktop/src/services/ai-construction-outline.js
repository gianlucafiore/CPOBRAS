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
 'Respondé exclusivamente JSON con work_sections:[{title,partidas:[{description,unit,quantity,work_result,resources:[{name,kind,unit}]}]}].',
 'title nombra el rubro de trabajo; work_result describe brevemente lo que se entrega o certifica, distinto de una mera compra. resources lista los insumos necesarios en esa partida (pueden faltar detalles).',
 'kind debe ser material, labor, equipment o subcontract. Si una especificación o unidad no se conoce, usá cadena vacía. Para cantidad de la partida usá decimal como texto si la indicó el usuario, de lo contrario null.',
 'No inventes cantidades, precios ni consumos de recursos. Máximo 60 partidas en no más de 20 rubros. Respondé con el conjunto mínimo y suficiente de trabajos; no inventes partidas auxiliares que no estén justificadas.'
].join('\n');

export function parseConstructionOutline(text){
 let parsed;
 try{parsed=JSON.parse(text.trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,''));}
 catch{throw new Error('La propuesta constructiva no contiene JSON válido de rubros, partidas e insumos.');}
 const sections=parsed?.work_sections;
 if(!Array.isArray(sections)||!sections.length||sections.length>20)
  throw new Error('La IA debe devolver rubros con partidas e insumos, no una lista plana de productos.');
 const rows=[],seen=new Set();
 for(const section of sections){
  const title=clean(section?.title,100);
  if(!title||title.length>100||!Array.isArray(section.partidas)||!section.partidas.length)
   throw new Error('Cada rubro debe identificar trabajos medibles, no un listado vacío.');
  for(const part of section.partidas){
   const description=clean(part?.description,500),unit=clean(part?.unit,30),result=clean(part?.work_result,500);
   if(!description||!unit||!result||!Array.isArray(part?.resources)||part.resources.length>40)
    throw new Error('Cada partida debe declarar unidad, resultado constructivo e insumos (aunque la lista sea vacía).');
   if(rows.length>=60)throw new Error('La planificación supera las 60 partidas permitidas.');
   if(part.quantity!=null&&typeof part.quantity!=='string')throw new Error('La cantidad de la partida debe ser un decimal en texto o null.');
   const quantity=part.quantity==null?null:importDecimal(part.quantity,'decimal',true);
   if(part.quantity!=null&&quantity==null)throw new Error('Cantidad de partida inválida');
   const key=fold(title)+'|'+fold(description)+'|'+fold(unit);
   if(seen.has(key))throw new Error('La IA repitió una partida en el mismo rubro: '+description);
   seen.add(key);
   const resourceIds=new Set(),requirements=[];
   for(const item of part.resources){
    const name=clean(item?.name,200),kind=clean(item?.kind,20),resourceUnit=clean(item?.unit,30);
    if(!name||!TYPES.has(kind))throw new Error('Un insumo de la partida carece de nombre o tipo válido: '+description);
    const resourceKey=fold(name)+'|'+kind+'|'+fold(resourceUnit);
    if(resourceIds.has(resourceKey))continue;
    resourceIds.add(resourceKey);
    requirements.push({id:'req-'+(requirements.length+1),description:name,kind,unit:resourceUnit});
   }
   rows.push({description,unit,section:title,quantity,unit_price:null,
    work_result:result,expected_resources:requirements,new_id:globalThis.crypto.randomUUID()});
  }
 }
 return rows;
}
