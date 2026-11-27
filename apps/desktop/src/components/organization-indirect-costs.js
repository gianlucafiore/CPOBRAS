import { uiText, uiHtml } from "../services/interface-language.js";
import {e,select} from "./helpers.js";
import {money,multiplyDecimals,sumDecimals} from "../decimal.js";
export function createOrganizationIndirectCosts({invoke,state,render,document,window}){
  const model={organization:null,revision:0,data:{currency:"Ars",items:[]}};
  const periodNames={once:"Puntual",monthly:"Mensual",yearly:"Anual"};
  function markup(){
    const items=model.data.items;
    return `<main class="feature-page"><div class="feature-toolbar"><h1>${uiHtml("Gastos indirectos · {0}", [model.organization.name])}</h1><button class="btn" data-action="organization-open" data-id="${model.organization.id}">${uiHtml("Volver a la organización")}</button></div><p>${uiHtml("Gastos fuera de obra: seguros, contabilidad, matrícula, oficina e impuestos de la organización. Los gastos recurrentes pueden seguir cargados indefinidamente. Indicá cuánto pagás y con qué frecuencia; los meses o años de referencia sirven para calcular la base que después distribuirás entre presupuestos.")}</p><form id="organization-indirect-form" class="feature-editor">${select(uiText("Moneda del detalle"),"indirect-currency",[["Ars","ARS"],["Usd","USD"]],model.data.currency)}<div class="table-scroll"><table class="data-grid"><thead><tr><th>${uiHtml("Concepto")}</th><th>${uiHtml("Importe de cada pago")}</th><th>${uiHtml("Frecuencia de pago")}</th><th>${uiHtml("Referencia para la base")}</th><th>${uiHtml("Total de referencia")}</th><th></th></tr></thead><tbody>${items.map(item=>`<tr data-indirect-id="${item.id}"><td><input aria-label="${uiHtml("Concepto")}" name="description" maxlength="500" required value="${e(item.description)}"></td><td><input aria-label="${uiHtml("Importe de cada pago")}" name="amount" type="number" min="0" step="any" required value="${e(item.amount)}"></td><td><select name="periodicity" aria-label="${uiHtml("Frecuencia de pago")}">${Object.entries(periodNames).map(([key,label])=>`<option value="${key}" ${item.periodicity===key?'selected':''}>${label}</option>`).join('')}</select></td><td>${item.periodicity==='once'?("<span>" + uiHtml("Pago único") + "</span>"):`<label><span class="small-muted">${item.periodicity==='monthly'?uiHtml("Meses de referencia"):uiHtml("Años de referencia")}</span><input aria-label="${item.periodicity==='monthly'?uiHtml("Meses de referencia"):uiHtml("Años de referencia")}" name="periods" type="number" min="0.000001" max="1200" step="any" required value="${e(item.periods)}"></label>`}</td><td class="number" data-indirect-total>${money(multiplyDecimals(item.amount||'0',item.periods||'0'))}</td><td><button type="button" class="tiny-danger" data-action="organization-indirect-remove" data-id="${item.id}" aria-label="${uiHtml("Quitar gasto")}">×</button></td></tr>`).join('')||("<tr><td colspan=\"6\">" + uiHtml("Todavía no hay gastos indirectos cargados.") + "</td></tr>")}</tbody></table></div><p class="small-muted">${uiHtml("Ejemplo: un seguro de 120.000 mensuales, con 1 mes de referencia, genera una base de 120.000; con 12 meses, una base de 1.440.000. El seguro sigue vigente: la referencia solo define el importe que vas a distribuir.")}</p><p>${uiHtml("Total de la base de referencia")} <strong data-indirect-sum>${money(sumDecimals(items.map(i=>multiplyDecimals(i.amount||'0',i.periods||'0'))))}</strong></p><button class="btn" type="button" data-action="organization-indirect-add">${uiHtml("＋ Agregar gasto")}</button><button class="btn primary" type="submit">${uiHtml("Guardar gastos indirectos")}</button><p class="feature-error" role="alert"></p></form></main>`;
  }
  async function open(id){model.organization=await invoke('get_organization',{organizationId:id});if(model.organization.ownership!=='own')throw Error(uiText("La organización externa es de solo lectura"));const saved=await invoke('get_organization_indirect_costs',{organizationId:id});model.revision=saved.revision;model.data=saved.data;state.pageDirty=false;}
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
  async function submit(){const saved=await invoke('save_organization_indirect_costs',{organizationId:model.organization.id,revision:model.revision,data:model.data});model.data=saved.data;model.revision=saved.revision;state.pageDirty=false;state.message=uiText("Gastos indirectos de la organización guardados");render();}
  return {model,markup,open,input,act,submit};
}
