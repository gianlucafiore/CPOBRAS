import {e,select} from "./helpers.js";
import {money,multiplyDecimals,sumDecimals} from "../decimal.js";
export function createOrganizationIndirectCosts({invoke,state,render,document,window}){
  const model={organization:null,revision:0,data:{currency:"Ars",items:[]}};
  const periodNames={once:"Puntual",monthly:"Mensual",yearly:"Anual"};
  function markup(){
    const items=model.data.items;
    return `<main class="feature-page"><div class="feature-toolbar"><h1>Gastos indirectos · ${e(model.organization.name)}</h1><button class="btn" data-action="organization-open" data-id="${model.organization.id}">Volver a la organización</button></div><p>Gastos fuera de obra: contabilidad, matrícula, oficina e impuestos de la organización. Definí el importe por período y cuántos períodos integran la base a distribuir. Cada presupuesto puede incorporar un porcentaje de esta base, sin modificar otros presupuestos.</p><form id="organization-indirect-form" class="feature-editor">${select("Moneda del detalle","indirect-currency",[["Ars","ARS"],["Usd","USD"]],model.data.currency)}<div class="table-scroll"><table class="data-grid"><thead><tr><th>Concepto</th><th>Importe por período</th><th>Periodicidad</th><th>Períodos</th><th>Total base</th><th></th></tr></thead><tbody>${items.map(item=>`<tr data-indirect-id="${item.id}"><td><input aria-label="Concepto" name="description" maxlength="500" required value="${e(item.description)}"></td><td><input aria-label="Importe por período" name="amount" type="number" min="0" step="any" required value="${e(item.amount)}"></td><td><select name="periodicity" aria-label="Periodicidad">${Object.entries(periodNames).map(([key,label])=>`<option value="${key}" ${item.periodicity===key?'selected':''}>${label}</option>`).join('')}</select></td><td><input aria-label="Cantidad de períodos" name="periods" type="number" min="0.000001" max="1200" step="any" required value="${e(item.periods)}" ${item.periodicity==='once'?'disabled':''}></td><td class="number" data-indirect-total>${money(multiplyDecimals(item.amount||'0',item.periods||'0'))}</td><td><button type="button" class="tiny-danger" data-action="organization-indirect-remove" data-id="${item.id}" aria-label="Quitar gasto">×</button></td></tr>`).join('')||'<tr><td colspan="6">Todavía no hay gastos indirectos cargados.</td></tr>'}</tbody></table></div><p>Total base <strong data-indirect-sum>${money(sumDecimals(items.map(i=>multiplyDecimals(i.amount||'0',i.periods||'0'))))}</strong></p><button class="btn" type="button" data-action="organization-indirect-add">＋ Agregar gasto</button><button class="btn primary" type="submit">Guardar gastos indirectos</button><p class="feature-error" role="alert"></p></form></main>`;
  }
  async function open(id){model.organization=await invoke('get_organization',{organizationId:id});if(model.organization.ownership!=='own')throw Error('La organización externa es de solo lectura');const saved=await invoke('get_organization_indirect_costs',{organizationId:id});model.revision=saved.revision;model.data=saved.data;state.pageDirty=false;}
  function input(target){
    if(!target.closest?.('#organization-indirect-form'))return;
    if(target.name==='indirect-currency')model.data.currency=target.value;
    const tr=target.closest('[data-indirect-id]'),item=model.data.items.find(i=>i.id===tr?.dataset.indirectId);
    if(item){item[target.name]=target.value;if(target.name==='periodicity'&&target.value==='once')item.periods='1';}
    state.pageDirty=true;
    if(target.name==='periodicity'){render();return;}
    try{
      if(item)tr.querySelector('[data-indirect-total]').textContent=money(multiplyDecimals(item.amount||'0',item.periods||'0'));
      document.querySelector('[data-indirect-sum]').textContent=money(sumDecimals(model.data.items.map(i=>multiplyDecimals(i.amount||'0',i.periods||'0'))));
    }catch{ /* Invalid intermediate numeric input is kept for correction before saving. */ }
  }
  function act(button){
    if(button.dataset.action==='organization-indirect-add'){model.data.items.push({id:window.crypto.randomUUID(),description:'',amount:'0',periodicity:'once',periods:'1'});state.pageDirty=true;render();return true;}
    if(button.dataset.action==='organization-indirect-remove'){model.data.items=model.data.items.filter(i=>i.id!==button.dataset.id);state.pageDirty=true;render();return true;}
    return false;
  }
  async function submit(){const saved=await invoke('save_organization_indirect_costs',{organizationId:model.organization.id,revision:model.revision,data:model.data});model.data=saved.data;model.revision=saved.revision;state.pageDirty=false;state.message='Gastos indirectos de la organización guardados';render();}
  return {model,markup,open,input,act,submit};
}
