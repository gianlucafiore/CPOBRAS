// Sections (rubros) are a structured budget operation, not an ACU component.
// Model-proposed names are resolved locally; only a reviewed plan is persisted.
const fold=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const nameOk=value=>typeof value==='string'&&value.trim().length>0&&value.trim().length<=100;
const codeOk=value=>typeof value==='string'&&/^[\p{L}\d._-]{1,30}$/u.test(value);
const fields=new Set(['action','titles','target','new_title','new_code']);
export function parseSectionToolArgs(args){
 if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!fields.has(k)))return null;
 const {action,target,new_title,new_code,titles}=args;
 if(!['create','update','delete'].includes(action)||Object.values(args).some(v=>typeof v!=='string'))return null;
 if(action==='create'){
  if(!titles||target||new_title||new_code||titles.length>1200)return null;
  const entries=titles.split(';').map(v=>v.trim()).filter(Boolean);
  if(!entries.length||entries.length>12||!entries.every(nameOk)||new Set(entries.map(fold)).size!==entries.length)return null;
  return {action,entries};
 }
 if(!nameOk(target)||titles)return null;
 if(action==='delete'){
  if(new_title||new_code)return null;
  return {action,target:target.trim()};
 }
 if(!new_title&&!new_code||new_title&&!nameOk(new_title)||new_code&&!codeOk(new_code))return null;
 return {action,target:target.trim(),...(new_title?{new_title:new_title.trim()}:{}),...(new_code?{new_code:new_code.trim()}: {})};
}
export function prepareSectionEdits(args,state){
 const input=parseSectionToolArgs(args);
 if(!input)throw Error('La solicitud de rubros necesita nombres o destino inequívocos.');
 if(!state.projectId||!state.estimateId||state.remoteProject)throw Error('Abrí un presupuesto local para editar rubros.');
 if(state.estimates?.find(e=>e.id===state.estimateId)?.issued)throw Error('El presupuesto está emitido: creá una revisión para editar rubros.');
 const sections=state.sections||[];
 const plan={estimateId:state.estimateId,projectId:state.projectId,actions:[],display:[],warnings:[]};
 if(input.action==='create'){
  for(const title of input.entries){
   if(sections.some(s=>fold(s.title)===fold(title)))throw Error('Ya existe un rubro con ese nombre: '+title);
   plan.actions.push({action:'create',title});
   plan.display.push('Crear rubro: '+title);
  }
  return plan;
 }
 const candidates=sections.filter(s=>fold(s.title)===fold(input.target)||fold(s.code)===fold(input.target));
 if(candidates.length!==1)throw Error(candidates.length?'La referencia coincide con varios rubros. Indicá el nombre o código exacto.':'No encontré el rubro «'+input.target+'» en este presupuesto.');
 const original=candidates[0];
 if(input.action==='update'){
  const title=input.new_title||original.title,code=input.new_code||original.code;
  if(sections.some(s=>s.id!==original.id&&(fold(s.title)===fold(title)||fold(s.code)===fold(code))))throw Error('Ese nombre o código ya lo usa otro rubro.');
  if(title===original.title&&code===original.code)throw Error('El rubro ya tiene esos datos.');
  plan.actions.push({action:'update',section_id:original.id,expected_title:original.title,...(input.new_title?{title}:{}),...(input.new_code?{code}:{})});
  plan.display.push('Editar rubro: '+original.title+' → '+title+(code!==original.code?' (código '+original.code+' → '+code+')':''));
  return plan;
 }
 const assigned=Object.values(state.assignments||{}).filter(id=>id===original.id).length;
 const children=sections.filter(s=>s.parent_id===original.id).length;
 plan.actions.push({action:'delete',section_id:original.id,expected_title:original.title,expected_lines:assigned,expected_children:children});
 plan.display.push('Borrar rubro: '+original.title+' ('+original.code+')');
 if(assigned)plan.warnings.push('Se conservarán '+assigned+' partidas; quedarán sin rubro.');
 if(children)plan.warnings.push('Se conservarán '+children+' subrubros; pasarán al rubro superior.');
 return plan;
}
export function sectionPreviewText(plan){
 return [...plan.display,...plan.warnings].join(' · ')+'. No se guardó nada todavía.';
}
