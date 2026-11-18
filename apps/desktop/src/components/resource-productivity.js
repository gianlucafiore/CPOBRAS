import {e} from "./helpers.js";
export function dailyOutputField(unit,value=''){
  return `<label class="field resource-daily-output"><span>Rendimiento por día hábil <small data-daily-output-unit>${e(unit||'unidad del insumo')}/día hábil</small></span><input name="dailyOutput" type="number" min="0.000001" step="any" value="${e(value??'')}" placeholder="Opcional"></label>`;
}
export function syncDailyOutputUnit(target){
  const form=target.closest?.('form[data-kind="resource"]');
  if(form&&target.name==='unit')for(const node of form.querySelectorAll('[data-daily-output-unit]'))node.textContent=(target.value||'unidad del insumo')+'/día hábil';
}
