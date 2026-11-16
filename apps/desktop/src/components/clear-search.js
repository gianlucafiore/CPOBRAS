/** Add the same accessible clear action to search fields and searchable pickers. */
export function createClearSearch({document,window}){
 const selector='input[type="search"],input[role="combobox"],input[list],input[data-search],input[name*="search"],input[name*="query"],input[placeholder*="Buscar"],input[placeholder*="buscar"],input[data-acu-search],input[name*="filter"],input[class*="search"],input[placeholder*="Filtrar"],input[aria-label*="Buscar"]';
 function scan(){
  for(const input of document.querySelectorAll(selector)){
   if(input.type==='hidden'||input.readOnly)continue;
   let wrapper=input.closest('.clearable-input');
   if(!wrapper){
    wrapper=document.createElement('span');wrapper.className='clearable-input';
    if(input.classList.contains('search-compact'))wrapper.classList.add('clearable-compact');
    input.before(wrapper);wrapper.append(input);
    const button=document.createElement('button');button.type='button';button.className='clear-search';button.dataset.clearSearch='';button.textContent='×';
    const label=input.getAttribute('aria-label')||input.closest('label')?.querySelector('span')?.textContent||input.placeholder||'búsqueda';
    if(!input.hasAttribute('aria-label')&&input.closest('label'))input.setAttribute('aria-label',label);
    button.setAttribute('aria-label','Limpiar');button.setAttribute('aria-description',label);button.title='Limpiar '+label;wrapper.append(button);
   }
   const button=wrapper.querySelector('.clear-search');
   button.hidden=!input.value;button.disabled=input.disabled;
  }
 }
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-clear-search]');
  if(!button){(window.queueMicrotask||globalThis.queueMicrotask)(scan);return;}
  event.preventDefault();event.stopImmediatePropagation();
  const input=button.parentElement.querySelector('input');
  if(!input||input.disabled||input.readOnly)return;
  input.focus();input.value='';
  input.dispatchEvent(new window.Event('input',{bubbles:true}));
  if(input.isConnected)input.dispatchEvent(new window.Event('change',{bubbles:true}));
  scan();
 },true);
 document.addEventListener('input',scan);
 document.addEventListener('change',()=>(window.queueMicrotask||globalThis.queueMicrotask)(scan));
 const observer=window.MutationObserver?new window.MutationObserver(scan):null;observer?.observe(document.body,{childList:true,subtree:true});
 scan();return {scan,disconnect:()=>observer?.disconnect()};
}
