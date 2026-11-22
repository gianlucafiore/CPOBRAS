import {e} from './helpers.js';
import {searchResources} from './resource-picker.js';

// Selector único del chat: primero elegir un insumo existente; si no existe,
// abrir exactamente el formulario nativo "resource" del resto de CPOBRAS.
export function createAiMissingResourcePopup({document,window,state,openModal,onResolved,onRestored}){
 const host=document.createElement('div');
 host.id='ai-missing-resource-popup';
 document.body.append(host);
 let item=null,query='',error='',busy=false;
 const kindName={material:'Material',labor:'Mano de obra',equipment:'Equipo',subcontract:'Subcontrato'};
 const active=()=>Boolean(item);
 function paint(){
  if(!item){host.innerHTML='';return;}
  const results=searchResources(state.resources||[],query).slice(0,12);
  host.innerHTML='<div class="ai-missing-overlay"><section class="ai-missing-dialog" role="dialog" aria-modal="true" aria-label="Seleccionar insumo faltante">'+
   '<header><strong>Seleccionar insumo</strong><button type="button" data-missing-action="close" aria-label="Cerrar">×</button></header>'+
   '<p>Buscá un insumo que ya esté en tu biblioteca. Si no existe, crealo con el formulario habitual de CPOBRAS.</p>'+
   '<p class="ai-missing-hint"><b>Necesario:</b> '+e(item.description)+(item.unit?' · '+e(item.unit):'')+'</p>'+
   '<label>Buscar en biblioteca<input id="ai-missing-search" data-missing-search value="'+e(query)+'" placeholder="Descripción, código o unidad" autocomplete="off"></label>'+
   '<div class="ai-missing-results" role="listbox" aria-label="Resultados de insumos">'+
    (results.length?results.map(resource=>
      '<button type="button" role="option" data-missing-action="select" data-id="'+e(resource.id)+'" '+(busy?'disabled':'')+'>'+
      '<span><b>'+e(resource.description)+'</b><small>'+e(resource.code||'')+' · '+e(kindName[resource.kind]||resource.kind||'')+' · '+e(resource.unit||'')+'</small></span><span>Seleccionar</span></button>'
    ).join(''):'<p>No encontramos coincidencias con esta búsqueda. Podés buscar otro nombre o crear un insumo.</p>')+
   '</div>'+
   (error?'<p class="ai-missing-error" role="alert">'+e(error)+'</p>':'')+
   '<footer><button type="button" data-missing-action="close" '+(busy?'disabled':'')+'>Cancelar</button>'+
   '<button type="button" data-missing-action="create" class="ai-missing-primary" '+(busy?'disabled':'')+'>＋ Crear insumo nuevo</button></footer>'+
   '</section></div>';
 }
 function open(resource){
  if(busy||!resource)return false;
  if(state.remoteProject||state.navigating||state.modal||state.pageDirty)
   throw new Error('Abrí un proyecto local editable y cerrá los formularios pendientes.');
  item=resource;query=String(resource.description||'').split(/\s+/).filter(token=>token.length>3).slice(0,3).join(' ');
  error='';paint();host.querySelector('#ai-missing-search')?.focus();return true;
 }
 function close(){
  if(busy)return false;
  item=null;query='';error='';paint();return true;
 }
 async function select(id){
  if(!item||busy)return;
  const resource=(state.resources||[]).find(row=>row.id===id&&row.active!==false);
  if(!resource){error='El insumo seleccionado ya no está disponible. Actualizá el catálogo.';paint();return;}
  if((item.unit&&resource.unit!==item.unit)||(item.kind&&resource.kind!==item.kind)){
   const question='El insumo seleccionado tiene unidad o tipo distinto del sugerido por IA. ¿Seleccionarlo de todos modos para revisar los consumos del ACU?';
   if(!window.confirm(question))return;
  }
  const selected=item;
  busy=true;
  try{
   await onResolved(selected,resource,{created:false});
   busy=false;close();
  }catch(caught){busy=false;error=String(caught);paint();}
 }
 function create(){
  if(!item||busy)return;
  const selected=item;
  close();
  // La vista y el guardado son los mismos que usa "＋ Nuevo insumo".
  try{
   openModal('resource',{
     description:selected.description,
     kind:selected.kind||'material',
     unit:selected.unit||'',
     price:'',
     source:'Carga desde CPOBRAS IA',
     aiMissingSpecification:selected.action==='specify'?selected.description:null
   },async saved=>{await onResolved(selected,saved,{created:true});},
   ()=>{onRestored?.();});
  }catch(caught){item=selected;error=String(caught);paint();}
 }
 host.addEventListener('input',event=>{
  if(!event.target.matches?.('[data-missing-search]'))return;
  const start=event.target.selectionStart;
  query=event.target.value;paint();
  const input=host.querySelector('#ai-missing-search');
  input?.focus();input?.setSelectionRange(start,start);
 });
 host.addEventListener('click',async event=>{
  const button=event.target.closest('[data-missing-action]');
  if(!button||button.disabled)return;
  const action=button.dataset.missingAction;
  if(action==='close')close();
  else if(action==='select')await select(button.dataset.id);
  else if(action==='create')create();
 });
 host.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&item){event.stopPropagation();close();}
 });
 return {open,close,active};
}
