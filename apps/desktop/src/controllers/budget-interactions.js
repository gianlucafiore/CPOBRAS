export function createBudgetInteractions({invoke,state,editable,currentLine,loadEstimate,loadPanel,render,act,document,window}){
 let dragging=null;
 const rowAt=target=>target.closest?.('.line-row[data-id],.section-row[data-id],.section-row[data-drop-unassigned]');
 function clearDrop(){document.querySelectorAll('.drop-before,.drop-after,.drop-section').forEach(row=>row.classList.remove('drop-before','drop-after','drop-section'));}
 function dragStart(event){
  const handle=event.target.closest?.('.line-drag-handle');
  if(!handle||!editable()||state.busy){event.preventDefault();return;}
  const row=handle.closest('.line-row');dragging={lineId:row.dataset.id,estimateId:state.estimateId};
  event.dataTransfer.setData('application/x-cpobras-line',row.dataset.id);event.dataTransfer.effectAllowed='move';row.classList.add('dragging');
 }
 function dragOver(event){
  if(!dragging||dragging.estimateId!==state.estimateId||!editable())return;
  const row=rowAt(event.target);if(!row)return;
  event.preventDefault();event.dataTransfer.dropEffect='move';clearDrop();
  if(row.classList.contains('line-row'))row.classList.add(event.clientY>row.getBoundingClientRect().top+row.getBoundingClientRect().height/2?'drop-after':'drop-before');
  else row.classList.add('drop-section');
 }
 function dragEnd(){dragging=null;clearDrop();document.querySelectorAll('.dragging').forEach(row=>row.classList.remove('dragging'));}
 async function drop(event){
  if(!dragging)return;const moving=dragging,row=rowAt(event.target);event.preventDefault();
  const after=row?.classList.contains('drop-after');dragEnd();
  if(!row||state.busy||!editable()||moving.estimateId!==state.estimateId)return;
  if(row.classList.contains('line-row')&&row.dataset.id===moving.lineId)return;
  let beforeId=null,sectionId=null;
  if(row.classList.contains('line-row')){
   sectionId=state.assignments[row.dataset.id]||null;
   const rest=state.lines.filter(line=>line.id!==moving.lineId),index=rest.findIndex(line=>line.id===row.dataset.id);
   beforeId=after?rest[index+1]?.id||null:row.dataset.id;
  }else if(row.dataset.dropSection)sectionId=row.dataset.id;
  state.busy=true;
  try{
   await invoke('move_budget_line',{estimateId:moving.estimateId,lineId:moving.lineId,beforeId,sectionId});
   state.selectedLineId=moving.lineId;state.selectedSectionId=sectionId;
   await loadEstimate();state.message='Partida reordenada'+(sectionId?' en '+(state.sections.find(section=>section.id===sectionId)?.title||'el rubro'):' sin rubro');render();
  }finally{state.busy=false;}
 }
 async function doubleClick(event){
  if(state.modal||state.busy||!editable()||event.target.closest?.('button,input,select,textarea'))return;
  const component=event.target.closest?.('.line-resource-row');
  if(component){await act({dataset:{action:'edit-line-resource',index:component.dataset.componentIndex}});return;}
  const row=rowAt(event.target);if(!row)return;
  if(row.classList.contains('line-row')){state.selectedLineId=row.dataset.id;await act({dataset:{action:'edit-line'}});}
  else if(row.dataset.dropSection)await act({dataset:{action:'edit-section',id:row.dataset.id}});
 }
 async function contextMenu(event){
  if(event.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
  event.preventDefault();if(state.modal||state.busy||state.navigating||state.pageDirty)return;
  const row=rowAt(event.target);let items=[];
  if(state.view==='workspace'&&row?.classList.contains('line-row')){
   state.selectedLineId=row.dataset.id;state.selectedSectionId=state.assignments[row.dataset.id]||null;await loadPanel();
   items=[{action:'edit-line',label:'Editar partida · doble clic',disabled:!editable()},
    {action:'edit-line-resources',label:'Asignar / editar insumos',disabled:!editable()},
    {action:'duplicate-line',label:'Duplicar partida',disabled:!editable()},
    {action:'modal-takeoff',label:'Agregar medición',disabled:!editable()},
    {action:'delete-line',label:'Eliminar partida',disabled:!editable()}];
  }else if(state.view==='workspace'&&row?.dataset.dropSection){
   state.selectedSectionId=row.dataset.id;state.selectedLineId=null;
   items=[{action:'modal-line',label:'Nueva partida en este rubro',disabled:!editable()},{action:'edit-section',id:row.dataset.id,label:'Editar rubro',disabled:!editable()}];
  }else{
   const row=event.target.closest?.('tr[data-action]');
   if(state.view==='resources'&&row?.dataset.id)items.push({action:'edit-resource',id:row.dataset.id,label:'Editar insumo'},{action:'modal-price',id:row.dataset.id,label:'Registrar precio'});
   if(state.view==='analyses'&&row?.dataset.id)items.push({action:'edit-analysis',id:row.dataset.id,label:'Editar ACU'});
   const entry={projects:['modal-project','Nueva obra'],clients:['person-new','Nuevo cliente'],suppliers:['person-new','Nuevo proveedor'],resources:['modal-resource','Nuevo insumo'],analyses:['modal-analysis','Nuevo ACU'],workspace:['modal-line','Nueva partida'],management:['manage-new','Nuevo registro'],planning:['plan-new','Nueva tarea / hito'],costing:['cost-new-analysis','Nuevo ACU compuesto']}[state.view];
   if(entry)items.push({action:entry[0],label:entry[1],disabled:state.view==='workspace'&&!editable()});
  }
  items.push(state.projectId?{action:'go-home',label:'Volver a Inicio'}:{action:'navigate',view:'projects',label:'Ir a Inicio'});
  state.contextMenu={x:Math.max(8,Math.min(event.clientX,(window.innerWidth||1120)-280)),y:Math.max(8,Math.min(event.clientY,(window.innerHeight||740)-(items.length*36+16))),items};
  render();document.querySelector('.app-context-menu button:not(:disabled)')?.focus();
 }
 function keyDown(event){
  if((event.key==='Enter'||event.key===' ')&&event.target.matches?.('.line-resource-row')&&!state.modal&&!state.busy&&editable()){event.preventDefault();act({dataset:{action:'edit-line-resource',index:event.target.dataset.componentIndex}}).catch(error=>{state.message=String(error);render();});return true;}

  if(state.contextMenu){
   if(event.key==='Escape'){event.preventDefault();state.contextMenu=null;render();document.querySelector(".line-row.selected")?.focus();return true;}
   if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
    const buttons=[...document.querySelectorAll('.app-context-menu button:not(:disabled)')];const index=buttons.indexOf(document.activeElement);
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
    event.preventDefault();buttons[next]?.focus();return true;
   }
  }
  if(state.modal)return false;
  const row=rowAt(event.target);
  if(row&&((event.key==='F10'&&event.shiftKey)||event.key==='ContextMenu')){
   const bounds=row.getBoundingClientRect();contextMenu({target:row,clientX:bounds.left+30,clientY:bounds.top+15,preventDefault(){}}).catch(error=>{state.message=String(error);render();});event.preventDefault();return true;
  }
  if(row?.classList.contains('line-row')&&event.key==='Enter'&&editable()){
   state.selectedLineId=row.dataset.id;event.preventDefault();act({dataset:{action:'edit-line'}}).catch(error=>{state.message=String(error);render();});return true;
  }return false;
 }
 return{dragStart,dragOver,dragEnd,drop,doubleClick,contextMenu,keyDown};
}
