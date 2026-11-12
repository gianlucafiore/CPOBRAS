import { e, dateToday } from "./helpers.js";
import { money } from "../decimal.js";
import { readResourceWorkbook, resourceTemplateBytes, resourceKindLabels } from "../services/resource-exchange.js";
export function createResourceImport({invoke,state,document,render,reloadCatalog}) {
 const model={open:false,rows:[],fileName:"",error:"",busy:false,date:dateToday()};
 function markup(){
  if(!model.open)return "";
  const invalid=model.rows.filter(r=>r.errors.length).length;
  return `<div class="modal-overlay resource-import-overlay"><section class="dialog-shell resource-import-dialog" role="dialog" aria-modal="true" aria-label="Importar biblioteca de insumos"><div class="dialog-header"><h2>Importar biblioteca de insumos</h2><button class="close-dialog" data-action="resource-import-close" aria-label="Cerrar importación" ${model.busy?"disabled":""}>×</button></div><div class="dialog-body"><p>Completá la hoja «Insumos» de la plantilla con materiales, mano de obra, equipos o subcontratos. En Tipo podés usar MAT (Material), MO (Mano de obra), EQ (Equipo) o SC/SUB (Subcontrato). Revisá la vista previa antes de guardar. Los registros existentes se conservan.</p><button class="btn" data-action="resource-import-template" ${model.busy?"disabled":""}>Descargar plantilla Excel</button><div class="workflow-grid"><label class="field">Archivo Excel (.xlsx)<input type="file" data-resource-import-file accept=".xlsx" ${model.busy?"disabled":""}></label><label class="field">Fecha de los precios<input type="date" data-resource-import-date value="${e(model.date)}" required ${model.busy?"disabled":""}></label></div>${model.fileName?`<p>${e(model.fileName)} · ${model.rows.length} insumos${invalid?` · ${invalid} filas con errores`:""}</p>`:""}<p class="modal-error" role="alert">${e(model.error)}</p>${model.rows.length?`<div class="resource-import-preview"><table class="data-grid"><thead><tr><th>Fila</th><th>Código</th><th>Descripción</th><th>Tipo</th><th>Unidad</th><th>Precio ARS</th><th>Revisión</th></tr></thead><tbody>${model.rows.map(r=>`<tr><td>${r.row_number}</td><td>${e(r.code||"Automático")}</td><td>${e(r.description)}</td><td>${e(resourceKindLabels[r.kind]||"Inválido")}</td><td>${e(r.unit)}</td><td>${r.price===null?"Sin precio":money(r.price)}</td><td class="${r.errors.length?"modal-error":""}">${r.errors.length?r.errors.map(e).join(" · "):"Nuevo"}</td></tr>`).join("")}</tbody></table></div>${invalid?'<p class="modal-error">Corregí las filas indicadas en Excel y seleccioná nuevamente el archivo. Todavía no se guardó ningún insumo.</p>':""}`:""}</div><div class="dialog-actions"><button class="btn" data-action="resource-import-close" ${model.busy?"disabled":""}>Cerrar</button><button class="btn primary" data-action="resource-import-confirm" ${model.busy||!model.rows.length||invalid?"disabled":""}>${model.busy?"Procesando…":`Importar ${model.rows.length||""} insumos`}</button></div></section></div>`;
 }
 async function act(button){
  const action=button.dataset.action;
  if(!action.startsWith("resource-import-"))return false;
  if(model.busy || state.remoteProject)return true;
  if(action==="resource-import-open"){Object.assign(model,{open:true,rows:[],fileName:"",error:"",date:dateToday()});render();return true;}
  if(action==="resource-import-close"){model.open=false;render();return true;}
  model.busy=true;model.error="";render();
  try{
   if(action==="resource-import-template"){
    const bytes=await resourceTemplateBytes();
    const result=await invoke("save_export_file",{name:"Plantilla_insumos_CPOBRAS.xlsx",bytes:Array.from(bytes),openAfter:false});
    if(result?.path)state.message={text:"Plantilla guardada en",path:result.path};
   }
   if(action==="resource-import-confirm"){
    if(!model.rows.length||model.rows.some(r=>r.errors.length))throw new Error("Revisá las filas de la planilla antes de importar");
    const rows=model.rows.map(({row_number,errors,...row})=>row);
    const result=await invoke("import_resources",{rows,effectiveDate:model.date,source:`Importación Excel: ${model.fileName}`.slice(0,500)});
    await reloadCatalog();state.message=`Se importaron ${result.created} insumos a la biblioteca.`;model.open=false;
   }
  }catch(error){model.error=String(error);if(!model.open)state.message=String(error);}
  finally{model.busy=false;render();}
  return true;
 }
 async function change(target){
  if(target.matches?.("[data-resource-import-date]")){model.date=target.value;return;}
  if(!target.matches?.("[data-resource-import-file]"))return;
  const file=target.files?.[0];if(!file)return;
  model.busy=true;model.error="";model.rows=[];model.fileName=file.name;render();
  try{await reloadCatalog();model.rows=await readResourceWorkbook(file,state.resources);}catch(error){model.error=String(error);}
  finally{model.busy=false;render();}
 }
 return {markup,act,change,model};
}
