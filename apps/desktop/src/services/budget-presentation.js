import {e} from "../components/helpers.js";
// One serialized writer for the shared memory and the print preferences of a budget.
export function createBudgetPresentation({invoke,state,document,window,editable}) {
  const model={id:null,scope:null,revision:0,data:{memory:"",print_options:{}},saved:"",error:"",status:"",conflict:false};
  let pending=null,timer=null;
  const scope=()=>String(state.database?.path||state.database?.scope||"local");
  const key=()=>`cpobras.presentation.v1:${encodeURIComponent(model.scope)}:${model.id}`;
  const dirty=()=>JSON.stringify(model.data)!==model.saved;
  function status(){
    for(const node of document.querySelectorAll('[data-presentation-status]'))node.textContent=model.error||model.status;
    for(const node of document.querySelectorAll('[data-presentation-retry]'))node.hidden=!model.error||model.conflict;
    for(const node of document.querySelectorAll('[data-presentation-conflict]')){node.hidden=!model.conflict;node.innerHTML=recoveryMarkup();}
  }
  function journal(){
    try{if(dirty())window.localStorage.setItem(key(),JSON.stringify({revision:model.revision,data:model.data}));else window.localStorage.removeItem(key());}
    catch{model.error="No se pudo conservar el borrador local. Guardá antes de salir.";}
  }
  async function open(){
    if(!state.estimateId)throw Error('Abrí un presupuesto');
    if(model.id===state.estimateId&&model.scope===scope())return;
    await flush();
    const id=state.estimateId,s=scope(),saved=await invoke('get_budget_presentation',{estimateId:id});
    Object.assign(model,{id,scope:s,revision:saved.revision,data:saved.data,saved:JSON.stringify(saved.data),error:"",status:"Guardado",conflict:false});
    try{
      const draft=JSON.parse(window.localStorage.getItem(key())||'null');
      if(draft){
        if(draft.revision===saved.revision){model.data=draft.data;model.status="Borrador recuperado · pendiente de guardar";}
        else {model.error="Hay un borrador de otra revisión. Copialo y comparalo antes de reemplazar los datos guardados.";model.conflict=true;model.data=draft.data;}
      }
    }catch{model.error="No se pudo leer el borrador local";model.conflict=true;}
  }
  function update(values){
    if(model.id!==state.estimateId||model.scope!==scope())throw new Error('Volvé a abrir esta vista antes de editar');
    const next={...model.data,...values};
    if(JSON.stringify(next)===JSON.stringify(model.data))return;
    model.data=next;model.status="Cambios pendientes de guardar…";journal();status();
  }
  async function flush(){
    window.clearTimeout(timer);
    if(pending){await pending;if(dirty())return flush();return;}
    if(!model.id||!dirty())return;
    if(state.remoteProject){model.saved=JSON.stringify(model.data);model.status="Copia de solo lectura";status();return;}
    if(model.conflict)throw new Error(model.error);
    const task=(async()=>{
      while(dirty()){
        const data=structuredClone(model.data),serialized=JSON.stringify(data),id=model.id;
        model.status="Guardando…";model.error="";status();
        try{
          const saved=await invoke('save_budget_presentation',{estimateId:id,revision:model.revision,data});
          model.revision=saved.revision;model.saved=serialized;model.status="Guardado automáticamente";journal();status();
        }catch(error){
          model.error='No se pudo guardar: '+String(error);model.status="";
          if(String(error).includes('presentación cambió')||String(error).includes('memoria de un presupuesto emitido')){
            model.conflict=true;
            try{const latest=await invoke('get_budget_presentation',{estimateId:id});model.revision=latest.revision;model.saved=JSON.stringify(latest.data);}catch{}
          }
          journal();status();throw error;
        }
      }
    })();
    pending=task;
    try{await task;}finally{pending=null;}
  }
  function recoveryMarkup(){
    if(!model.conflict)return '';
    const summary=data=>[data.memory||'(Sin memoria descriptiva)',...Object.entries(data.print_options||{}).map(([key,value])=>`${({title:'Título',reference:'Referencia',date:'Fecha',notes:'Condiciones',mode:'Presentación',format:'Formato',layout:'Contenido',landscape:'Horizontal'})[key]||key}: ${value}`)].join('\n');
    return `<p>Compará los datos antes de elegir cuál conservar.</p><label class="field"><span>Guardado en la base</span><textarea readonly rows="6">${e(summary(JSON.parse(model.saved)))}</textarea></label><label class="field"><span>Tu borrador</span><textarea readonly rows="6">${e(summary(model.data))}</textarea></label><button class="btn" type="button" data-action="presentation-use-draft">Guardar mi borrador en esta revisión</button><button class="btn" type="button" data-action="presentation-use-saved">Conservar lo guardado y descartar el borrador</button>`;
  }
  async function resolve(keepDraft){
    if(!model.conflict)return;
    const latest=await invoke('get_budget_presentation',{estimateId:model.id});
    if(keepDraft && JSON.stringify(latest.data)!==model.saved){model.revision=latest.revision;model.saved=JSON.stringify(latest.data);status();throw Error('Los datos guardados cambiaron otra vez. Comparalos antes de reemplazar.');}
    model.revision=latest.revision;model.saved=JSON.stringify(latest.data);
    if(!keepDraft)model.data=latest.data;
    model.conflict=false;model.error='';model.status=keepDraft?'Cambios pendientes':'Guardado';journal();status();
    if(keepDraft)await flush();
  }
  function feedback(){return `<p role="status" data-presentation-status>${e(model.error||model.status)}</p><button type="button" class="btn tiny" data-action="presentation-save" data-presentation-retry ${model.error&&!model.conflict?'':'hidden'}>Reintentar guardado</button><div data-presentation-conflict ${model.conflict?'':'hidden'}>${recoveryMarkup()}</div>`;}

  function markup(){return `<section class="budget-memory"><div class="detail-heading"><b>Memoria descriptiva del presupuesto</b></div><p class="small-muted">Texto público que se puede incluir al generar el presupuesto para el cliente.</p><label class="field"><span>Memoria descriptiva</span><textarea name="budget-memory" rows="18" maxlength="25000" ${editable()?'':'readonly'}>${e(model.data.memory||'')}</textarea></label>${feedback()}</section>`;}
  function input(target){if(target.name!=='budget-memory'||!editable())return;update({memory:target.value});window.clearTimeout(timer);timer=window.setTimeout(()=>flush().catch(()=>{}),400);}
  window.addEventListener?.('beforeunload',()=>{if(model.id)journal();});
  return {model,open,update,flush,feedback,markup,input,resolve};
}
