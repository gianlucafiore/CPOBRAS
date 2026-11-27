import { uiHtml } from "../services/interface-language.js";
import {e} from './helpers.js';
import {money, numeric} from '../decimal.js';

export function createAcuInsertPicker({state, invoke, render, document=globalThis.document}) {
  function markup() {
    const m=state.modal;
    const rows=m.pickerDetails?.components || [];
    return `<div class="acu-insert-columns"><section aria-label="${uiHtml("Seleccionar ACU")}"><label>${uiHtml("Buscar ACU")}<input type="search" aria-label="${uiHtml("Buscar ACU")}" data-acu-insert-search value="${e(m.pickerSearch || '')}" placeholder="${uiHtml("Código o descripción")}"></label><div class="acu-insert-list">${state.analyses.map(a=>`<button type="button" class="btn acu-insert-option ${m.pickerId===a.id?'active':''}" ${m.pickerSearch && !(a.code+' '+a.description).toLocaleLowerCase().includes(m.pickerSearch.trim().toLocaleLowerCase())?'hidden':''} data-action="acu-insert-select" data-id="${e(a.id)}" data-acu-label="${e((a.code+' '+a.description).toLocaleLowerCase())}" aria-pressed="${m.pickerId===a.id}"><strong>${e(a.code)}</strong> ${e(a.description)}<small>${uiHtml("{0} · ARS {1}", [a.unit, money(a.unit_cost)])}</small></button>`).join('') || ("<p>" + uiHtml("No hay ACU guardados. Creá uno en la biblioteca ACU.") + "</p>")}</div></section><section aria-label="${uiHtml("Composición del ACU")}"><input type="hidden" name="analysisId" value="${e(m.pickerId || '')}">${m.pickerError ? `<p role="alert">${e(m.pickerError)}</p>` : !m.pickerDetails ? ("<p>" + uiHtml("Seleccioná un ACU para ver sus insumos.") + "</p>") : `<h3>${e(m.pickerDetails.description)}</h3><div class="table-scroll"><table class="data-grid"><thead><tr><th>${uiHtml("Insumo")}</th><th>${uiHtml("Unidad")}</th><th>${uiHtml("Consumo")}</th><th>${uiHtml("Precio")}</th><th>${uiHtml("Parcial")}</th></tr></thead><tbody>${rows.map(c=>`<tr class="${c.included===false?'component-excluded':''}"><td>${e(c.description || state.resources.find(r=>r.id===c.resource_id)?.description || '')}</td><td>${e(c.unit || state.resources.find(r=>r.id===c.resource_id)?.unit || '')}</td><td>${numeric(c.quantity)}</td><td>${money(c.unit_price)}</td><td>${money(c.included===false?'0':c.total)}</td></tr>`).join('')}</tbody></table></div><p><strong>${uiHtml("Costo unitario: ARS {0}", [money(m.pickerDetails.unit_cost)])}</strong></p>${!rows.length?("<p>" + uiHtml("Este ACU no tiene insumos.") + "</p>"):''}`}</section></div>`;
  }
  async function select(id) {
    const m=state.modal;
    if(m?.kind!=='from-acu' || !id) return;
    m.pickerId=id; m.pickerReady=false; m.pickerDetails=null; m.pickerError='Cargando insumos…';
    const request={}; m.pickerRequest=request; render();
    try {
      const details=await invoke('get_analysis_details',{analysisId:id});
      if(state.modal!==m || m.pickerRequest!==request) return;
      m.pickerDetails=details; m.pickerError=''; m.pickerReady=Boolean(details?.components?.length);
    } catch(error) {if(state.modal!==m || m.pickerRequest!==request)return; m.pickerError=String(error);}
    render();
    input({matches:()=>true,value:m.pickerSearch || ''});
  }
  function input(target) {
    if(state.modal?.kind!=='from-acu' || !target.matches?.('[data-acu-insert-search]'))return;
    state.modal.pickerSearch=target.value;
    const term=target.value.trim().toLocaleLowerCase();
    document.querySelectorAll('[data-acu-label]').forEach(b=>b.hidden=!b.dataset.acuLabel.includes(term));
  }
  return {markup,select,input};
}
