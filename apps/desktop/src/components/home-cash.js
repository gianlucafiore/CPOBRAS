import {e, field, select, dateToday} from './helpers.js';
import {money, compareDecimals, sumDecimals} from '../decimal.js';
import {operationNames} from './operations.js';

export const cashKinds = {
  expense: ['payment', 'advance_paid', 'direct_payment', 'fund_reimbursement'],
  income: ['collection', 'advance_received', 'fund_contribution'],
};
export function recentCash(rows, side, limit=8) {
  return rows.filter(o=>cashKinds[side].includes(o.kind)).sort((a,b)=>b.date.localeCompare(a.date)||String(b.number).localeCompare(String(a.number),undefined,{numeric:true})||b.id.localeCompare(a.id)).slice(0,limit);
}
export function cashReferences(rows, target, kind) {
  const allowed=kind==='payment'?['payable','subcertificate','retention_payable']:kind==='collection'?['receivable','certificate','retention_receivable']:[];
  return rows.filter(o=>o.project_id===target?.projectId && (!o.estimate_id || o.estimate_id===target.id) && o.currency===target.currency && allowed.includes(o.kind) && compareDecimals(sumDecimals(rows.filter(p=>p.reference_id===o.id&&p.kind===kind&&p.currency===o.currency).map(p=>p.amount)),o.amount)<0 && !rows.some(b=>['payable','receivable'].includes(b.kind)&&b.reference_id===o.id));
}
export function createHomeCash({state,invoke,render,document,window,FormData}) {
  const m={scope:null,loaded:false,loading:false,rows:[],targets:[],error:'',draft:null,wasHome:false,request:0};
  const scope=()=>state.database?.scope || 'local';
  const ownProjects=()=>state.projects.filter(p=>!p.read_only);
  function reset(){m.request++;Object.assign(m,{scope:scope(),loaded:false,loading:false,rows:[],targets:[],error:'',draft:null,wasHome:false});}
  async function refresh(){
    if(m.loading)return;
    const request=++m.request,before=scope();m.loading=true;m.error='';
    try {
      const projects=ownProjects();
      const [rows,groups]=await Promise.all([
        invoke('list_operations',{projectId:null}),
        Promise.all(projects.map(async p=>({p,estimates:await invoke('list_project_estimates',{projectId:p.id})}))),
      ]);
      if(before!==scope()||request!==m.request)return;
      if(!Array.isArray(rows)||groups.some(g=>!Array.isArray(g.estimates)))throw Error('Respuesta inválida al cargar movimientos');
      const own=new Set(projects.map(p=>p.id));
      m.rows=rows.filter(o=>own.has(o.project_id));
      m.targets=groups.flatMap(({p,estimates})=>estimates.map(b=>({...b,projectId:p.id,projectName:p.name})));
      m.loaded=true;
    }catch(error){if(before===scope()&&request===m.request)m.error=String(error);}
    finally{if(before===scope()&&request===m.request){m.loading=false;if(state.view==='projects'&&!state.modal&&!state.pageDirty&&!state.busy&&!m.draft)render();}}
  }
  function afterRender(){
    if(m.scope!==scope())reset();
    const home=state.view==='projects'&&!state.projectId;
    if(!home){m.wasHome=false;m.draft=null;return;}
    if(!m.wasHome){m.wasHome=true;void refresh();}
  }
  function markup(){
    if(m.scope!==scope())reset();
    return `<div class="home-cash-cards">${['expense','income'].map(side=>{
      const title=side==='expense'?'Últimos egresos':'Últimos ingresos';
      return `<section class="home-cash-card" aria-label="${title}"><header><h2>${title}</h2><button class="btn tiny primary" data-action="home-cash-new" data-side="${side}" ${!m.loaded||m.loading||m.error?'disabled':''}>＋ ${side==='expense'?'Egreso':'Ingreso'}</button></header>${m.error?`<p class="feature-error" role="alert">${e(m.error)} <button class="btn tiny" data-action="home-cash-refresh">Reintentar</button></p>`:''}<div class="home-cash-scroll"><table class="data-grid"><thead><tr><th>Fecha / concepto</th><th>Proyecto / presupuesto</th><th>Importe</th></tr></thead><tbody>${recentCash(m.rows,side).map(o=>{
        const p=state.projects.find(p=>p.id===o.project_id),b=m.targets.find(b=>b.id===o.estimate_id);
        return `<tr><td><time>${e(o.date.split('-').reverse().join('/'))}</time><strong>${e(o.notes||o.number||operationNames[o.kind])}</strong><small>${e(operationNames[o.kind]||o.kind)} · ${e(o.number)}</small></td><td>${e(p?.name||'Obra archivada')}<small>${e(b?.title||(o.estimate_id?'Presupuesto archivado':'Sin presupuesto vinculado'))}</small></td><td class="number">${e(o.currency)} ${money(o.amount)}</td></tr>`;
      }).join('')||`<tr><td colspan="3" class="empty-cell">${m.loading||!m.loaded?'Cargando movimientos…':'Sin movimientos registrados.'}</td></tr>`}</tbody></table></div></section>`;
    }).join('')}</div>`;
  }
  function target(){return m.targets.find(t=>t.id===m.draft?.estimateId);}
  function optionsMarkup(term=''){
    const d=m.draft,terms=term.toLocaleLowerCase().trim().split(/\s+/);
    return ownProjects().map(p=>{
      const budgets=m.targets.filter(t=>t.projectId===p.id&&terms.every(term=>(p.name+' '+t.title).toLocaleLowerCase().includes(term)));
      return budgets.length?`<div role="group" aria-label="${e(p.name)}"><div class="cash-project-heading" role="presentation">${e(p.name)}</div>${budgets.map(t=>`<button type="button" role="option" id="cash-target-${e(t.id)}" aria-selected="${d.estimateId===t.id}" data-action="home-cash-select" data-id="${e(t.id)}">${e(t.title)} <small>${e(t.currency)}${t.issued?' · Emitido':''}</small></button>`).join('')}</div>`:'';
    }).join('')||'<p>No hay presupuestos que coincidan.</p>';
  }
  function editor(){
    const d=m.draft;if(!d)return '';
    const t=target(),kinds=d.side==='expense'?[['direct_payment','Gasto pagado sin factura'],['payment','Pago de factura / certificado']]:[['collection','Cobro de factura / certificado'],['advance_received','Anticipo del comitente'],['fund_contribution','Aporte de fondos propios']];
    const refs=cashReferences(m.rows,t,d.kind);
    return `<div class="modal-overlay home-cash-overlay"><section class="dialog-shell" role="dialog" aria-modal="true" aria-label="${d.side==='expense'?'Agregar egreso':'Agregar ingreso'}"><div class="dialog-header"><h2>${d.side==='expense'?'Agregar egreso':'Agregar ingreso'}</h2><button class="close-dialog" data-action="home-cash-close" aria-label="Cerrar movimiento">×</button></div><form id="home-cash-form" class="dialog-body"><div class="cash-target-picker"><label class="field"><span>Proyecto › presupuesto</span><input type="search" aria-label="Proyecto y presupuesto" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="cash-target-list" data-cash-target autocomplete="off" value="${e(t?t.projectName+' › '+t.title:'')}" placeholder="Buscar proyecto o presupuesto"></label><div id="cash-target-list" class="cash-target-list" role="listbox" aria-label="Presupuestos por proyecto" hidden>${optionsMarkup()}</div></div>${!m.targets.length?'<p>No hay presupuestos disponibles. Creá un presupuesto en una obra antes de cargar el movimiento.</p>':''}${select('Tipo de movimiento','cash-kind',kinds,d.kind)}${['collection','payment'].includes(d.kind)?select('Documento de origen','cash-reference',[['','Seleccionar documento…'],...refs.map(o=>[o.id,`${operationNames[o.kind]} · ${o.number} · ${o.currency} ${money(o.amount)}`])],d.referenceId):''}${d.kind==='advance_received'?'<p class="modal-help">El anticipo ingresa al fondo de la obra y queda vinculado al convenio de este presupuesto para su recuperación en certificados.</p>':''}${field('Concepto','cash-notes',d.notes,'required maxlength="2000"')}${field('Fecha','cash-date',d.date,'type="date" required')}${field('Importe','cash-amount',d.amount,'type="number" min="0.000001" step="any" required')}<p>Moneda: <strong>${e(t?.currency||'Seleccioná un presupuesto')}</strong></p><p class="feature-error" role="alert">${e(d.error||'')}</p><div class="dialog-actions"><button type="button" class="btn" data-action="home-cash-close">Cancelar</button><button type="submit" class="btn primary" ${!m.targets.length?'disabled':''}>Registrar ${d.side==='expense'?'egreso':'ingreso'}</button></div></form></section></div>`;
  }
  function capture(){
    const f=document.querySelector('#home-cash-form');if(!f||!m.draft)return;
    const data=new FormData(f);Object.assign(m.draft,{notes:String(data.get('cash-notes')||''),date:String(data.get('cash-date')||''),amount:String(data.get('cash-amount')||''),referenceId:String(data.get('cash-reference')||'')});
  }
  function close(){if(state.busy)return;if(state.pageDirty&&!window.confirm('Tenés cambios sin guardar. ¿Descartarlos?'))return;m.draft=null;state.pageDirty=false;render();}
  async function act(button){
    const a=button.dataset.action;
    if(a==='home-cash-refresh'){await refresh();return;}
    if(a==='home-cash-close'){close();return;}
    if(a==='home-cash-new'){
      if(state.view!=='projects'||state.projectId||!m.loaded||m.loading||m.error)return;
      m.draft={id:window.crypto.randomUUID(),side:button.dataset.side,kind:button.dataset.side==='expense'?'direct_payment':'collection',estimateId:'',referenceId:'',notes:'',date:dateToday(),amount:'',error:''};render();return;
    }
    if(a==='home-cash-select'&&m.draft){capture();m.draft.estimateId=button.dataset.id;m.draft.referenceId='';state.pageDirty=true;render();}
  }
  function input(el){
    if(!el.closest?.('#home-cash-form')||!m.draft)return;
    state.pageDirty=true;
    if(el.matches('[data-cash-target]')){
      m.draft.estimateId='';m.draft.referenceId='';
      const list=document.querySelector('#cash-target-list');list.innerHTML=optionsMarkup(el.value);list.hidden=false;el.setAttribute('aria-expanded','true');
      const ref=document.querySelector('[name="cash-reference"]');if(ref)ref.innerHTML='<option value="">Seleccionar documento…</option>';
    }
  }
  function focus(el){
    const list=document.querySelector('#cash-target-list');if(!list)return;
    const input=document.querySelector('[data-cash-target]');
    if(el.matches?.('[data-cash-target]')){list.hidden=false;input.setAttribute('aria-expanded','true');}
    else if(!el.closest?.('#cash-target-list')){list.hidden=true;input.setAttribute('aria-expanded','false');}
  }
  function change(el){if(el.name==='cash-kind'&&m.draft){capture();m.draft.kind=el.value;m.draft.referenceId='';state.pageDirty=true;render();}}
  function keydown(event){
    if(!m.draft)return false;
    if(event.key==='Escape'){
      event.preventDefault();event.stopImmediatePropagation();
      const list=document.querySelector('#cash-target-list');
      if(list&&!list.hidden){list.hidden=true;document.querySelector('[data-cash-target]')?.setAttribute('aria-expanded','false');}
      else close();return true;
    }
    const input=event.target.matches?.('[data-cash-target]'),option=event.target.closest?.('#cash-target-list [role="option"]');
    if((input||option)&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();focus(document.querySelector('[data-cash-target]'));
      const opts=[...document.querySelectorAll('#cash-target-list [role="option"]')];let i=opts.indexOf(event.target);
      i=event.key==='Home'?0:event.key==='End'?opts.length-1:event.key==='ArrowDown'?(i+1)%opts.length:(i-1+opts.length)%opts.length;opts[i]?.focus();return true;
    }
    if(input&&event.key==='Enter'){event.preventDefault();return true;}
    return false;
  }
  async function submit(){
    capture();const d=m.draft,t=target();
    if(!d||!t||!ownProjects().some(p=>p.id===t.projectId))throw Error('Seleccioná un presupuesto de la lista.');
    if(!d.notes.trim()||!d.date||compareDecimals(d.amount,'0')<=0)throw Error('Completá concepto, fecha e importe positivo.');
    const ref=cashReferences(m.rows,t,d.kind).find(o=>o.id===d.referenceId);
    if(['payment','collection'].includes(d.kind)&&!ref)throw Error('Seleccioná la factura o certificado de origen.');
    const before=scope();
    await invoke('post_operation',{operation:{id:d.id,project_id:t.projectId,estimate_id:t.id,kind:d.kind,number:'',date:d.date,due_date:d.date,currency:t.currency,notes:d.notes.trim(),amount:d.amount,partner_id:ref?.partner_id||null,reference_id:ref?.id||null,lines:[]}});
    if(before!==scope())return;
    m.draft=null;state.pageDirty=false;await refresh();render();
  }
  return {markup,editor,afterRender,act,input,focus,change,keydown,submit,model:m};
}
