import { uiText } from "./interface-language.js";
/** Serial optimistic saves with a durable, database-scoped recovery journal. */
export function createPriceAutosave({state,model:m,invoke,window,onStatus=()=>{}}){
 let context=null,timer=null,flight=null,last='',generation=0;
 const key=id=>'cpobras.price-draft.v1:'+encodeURIComponent(state.database?.path||state.database?.scope||'local')+':'+id;
 const remove=k=>{try{window.localStorage?.removeItem(k);}catch{}};
 const read=k=>{try{return JSON.parse(window.localStorage?.getItem(k)||'null');}catch{return null;}};
 function journal(){
  if(!context||!m.dirty)return;
  try{window.localStorage?.setItem(context.key,JSON.stringify({revision:m.revision,definition:m.definition}));}catch{m.journalError='El guardado de recuperación local no está disponible.';}
 }
 function status(){onStatus();}
 function changed(){
  if(!context)return;
  if(m.recoveryDraft){m.dirty=true;m.saveStatus='conflict';status();return;}
  const json=JSON.stringify(m.definition);if(json===last){if(m.saveStatus==='saved')m.dirty=false;return;}generation++;last=json;
  m.dirty=true;journal();m.saveStatus='pending';status();
  if(timer)window.clearTimeout(timer);timer=window.setTimeout(()=>{timer=null;void flush().catch(()=>{});},400);
 }
 function bind(saved,id,editable){
  if(timer)window.clearTimeout(timer);timer=null;context={id,key:key(id)};generation++;last=JSON.stringify(m.definition);m.saveStatus='saved';m.recoveryDraft=null;
  const draft=read(context.key);
  if(draft&&editable){
   if(draft.revision===saved.revision&&Array.isArray(draft.definition?.rows)){m.definition=draft.definition;changed();}
   else if(JSON.stringify(draft.definition)===JSON.stringify(saved.definition)){remove(context.key);}
   else{m.saveStatus='conflict';m.error=uiText("Hay un borrador recuperado y cambios de otra sesión. Recargá y revisá el conflicto antes de guardar.");m.recoveryDraft=draft;}
  }
 }
 async function flush(){
  if(timer)window.clearTimeout(timer);timer=null;
  if(flight){await flight;if(m.dirty)return flush();return;}
  if(!context||!m.dirty)return;
  if(m.saveStatus==='conflict')throw Error(m.error);
  const c=context;
  flight=(async()=>{
   while(context===c&&m.dirty){
    const version=generation,definition=structuredClone(m.definition),revision=m.revision;
    m.saveStatus='saving';journal();status();
    try{
     const saved=await invoke('save_price_definition',{estimateId:c.id,revision,definition});
     if(context!==c)return;
     m.revision=saved.revision;
     if(generation===version){m.calculation=saved.calculation;m.direct=saved.direct;m.dirty=false;m.saveStatus='saved';m.error='';remove(c.key);}
     else{journal();}
     status();
    }catch(error){if(context===c){m.error=String(error);m.saveStatus='error';journal();status();}throw error;}
   }
  })();
  try{await flight;}finally{flight=null;}
 }
 window.addEventListener?.('beforeunload',()=>journal());
 function discard(){if(timer)window.clearTimeout(timer);timer=null;if(context)remove(context.key);m.recoveryDraft=null;m.dirty=false;m.saveStatus='saved';}
 function restore(){const recovered=m.recoveryDraft?.definition;if(!recovered)return;m.recoveryDraft=null;m.definition=recovered;changed();}
 return {bind,changed,flush,journal,discard,restore,active:()=>Boolean(context),contextId:()=>context?.id};
}
