import { e, dateToday, kindName, kindBadge, field, select, btn } from "../components/helpers.js";
export function createActions({ invoke, state, currentProject, currentEstimate, currentLine, editable, projectName, clientName, loadCollections, loadEstimates, loadEstimate, loadPanel, openProject, openEstimate, reloadCatalog, refreshResource, refreshAnalysis, render, renderSelection = render, openModal, closeModal, document, window, FormData }) {
async function handleSubmit(form) {
  const kind = form.dataset.kind;
  const data = new FormData(form), v = key => String(data.get(key) ?? "").trim();
  const item = state.modal?.record || {};
  const estimateId = state.estimateId;
  if (kind === "client") await invoke("create_client", { clientName: v("clientName"), cuit: v("cuit") || null });
  else if (kind === "project") {
    const args = { projectName: v("projectName"), clientId: v("clientId"), currency: v("currency") };
    await invoke(item.id ? "update_project" : "create_project", item.id ? { ...args, projectId: item.id } : args);
  } else if (kind === "estimate") {
    const created = await invoke("create_estimate", { projectId: state.projectId, title: v("title") });
    state.estimateId = created.id;
  } else if (kind === "section") {
    const savedSection = await invoke("save_budget_section", { id: item.id || null, estimateId, code: v("code"), title: v("title"), parentId: v("parentId") || null, position: Number(v("position")) });
    state.selectedSectionId = savedSection?.id || item.id || null;
  } else if (kind === "line") {
    const args = { estimateId, description: v("description"), unit: v("unit"), quantity: v("quantity"), unitCost: v("unitCost") };
    const line = await invoke(item.id ? "update_estimate_line" : "add_estimate_line", item.id ? { ...args, lineId: item.id } : args);
    if (v("sectionId")) await invoke("assign_line_section", { estimateId, lineId: line.id, sectionId: v("sectionId") });
    else if (item.id && state.assignments[item.id]) { const index=state.lines.findIndex(row=>row.id===item.id);await invoke("move_budget_line",{estimateId,lineId:line.id,beforeId:state.lines[index+1]?.id||null,sectionId:null}); }
    state.selectedSectionId=v("sectionId")||null;
    state.selectedLineId = line.id;
  } else if (kind === "from-acu") {
    const line = await invoke("add_line_from_analysis", { estimateId, analysisId: v("analysisId"), quantity: v("quantity") });
    if (v("sectionId")) await invoke("assign_line_section", { estimateId, lineId: line.id, sectionId: v("sectionId") });
    state.selectedLineId = line.id; state.panel = "acu";
  } else if (kind === "resource") {
    if (item.id) {
      await invoke("update_resource", { resourceId: item.id, code: v("code"),
        description: v("description"), unit: v("unit"), kind: v("kind"), active: v("active") === "true" });
      state.selectedResourceId = item.id;
    } else {
      await invoke("create_resource", { code: v("code"), description: v("description"),
        unit: v("unit"), kind: v("kind"), price: v("price"),
        effectiveDate: v("effectiveDate"), source: v("source") || null });
    }
  } else if (kind === "price") {
    await invoke("register_resource_price", { resourceId: item.id, amount: v("amount"), currency: v("currency"), effectiveDate: v("effectiveDate"), source: v("source") || null });
    state.selectedResourceId = item.id;
  } else if (kind === "line-resources") {
    if(!editable())throw new Error("El presupuesto emitido no se modifica");
    const components=[...form.querySelectorAll(".component-row")].map(row=>({resourceId:row.querySelector('select[name="resource"]')?.value,quantity:row.querySelector('input[name="quantity"]')?.value,unitPrice:row.querySelector('input[name="unitPrice"]')?.value}));
    if(!components.length)throw new Error("Agregá al menos un insumo");
    if(components.some(row=>!row.resourceId))throw new Error("Seleccioná un insumo del catálogo en cada fila");
    const all=(item.allComponents||[]).map(row=>({resourceId:row.resource_id,quantity:row.quantity,unitPrice:row.unit_price}));
    if(item.componentIndex>=0)all[item.componentIndex]=components[0];else all.push(components[0]);
    for(const row of all)if(row.resourceId===components[0].resourceId)row.unitPrice=components[0].unitPrice;
    await invoke("save_line_resources",{estimateId,lineId:item.id,components:all});state.panel="acu";
  } else if (kind === "analysis") {
    const components = [...form.querySelectorAll(".component-row")].map(row => ({
      resourceId: row.querySelector('select[name="resource"]')?.value,
      quantity: row.querySelector('input[name="quantity"]')?.value,
      unitPrice: row.querySelector('input[name="unitPrice"]')?.value
    }));
    if (!components.length) throw new Error("Agregá al menos un insumo al ACU.");
    const args = { code: v("code"), description: v("description"), unit: v("unit"), components };
    const saved = await invoke(item.id ? "update_analysis" : "create_analysis",
      item.id ? { ...args, analysisId: item.id } : args);
    state.selectedAnalysisId = saved.id;
  } else if (kind === "reprice") {
    await invoke("reprice_analysis", { analysisId: item.id, effectiveDate: v("effectiveDate") });
    state.selectedAnalysisId = item.id;
  } else if (kind === "takeoff") {
    await invoke("save_takeoff", { id: item.id || null, estimateId, lineId: state.selectedLineId, note: v("note"),
      factor: v("factor"), length: v("length"), width: v("width"), height: v("height"),
      sign: Number(v("sign")), position: Number(v("position")) });
  } else if (kind === "rates") {
    await invoke("save_estimate_pricing", { estimateId,
      generalExpensesPercent: v("generalExpensesPercent"), financialExpensesPercent: v("financialExpensesPercent") || "0", profitPercent: v("profitPercent"),
      discountPercent: v("discountPercent"), taxPercent: v("taxPercent") });
  } else if (kind === "comparison") {
    state.comparison = await invoke("compare_estimates", { baselineId: v("baselineId"), revisedId: estimateId });
    state.modalDirty=false;state.modal = { kind: "comparison-result" }; render(); return;
  } else if (kind === "contracting") {
    const detail = await invoke("get_analysis_details", { analysisId: v("analysisId") });
    state.costComparison = await invoke("compare_contracting", {
      ownComponents: detail.components.map(row => ({ resourceId: row.resource_id, quantity: row.quantity })),
      ownExtraPerUnit: v("ownExtraPerUnit"), subcontractPricePerUnit: v("subcontractPricePerUnit"), quantity: v("quantity")
    });
    state.modalDirty=false;state.modal = { kind: "contracting-result" }; render(); return;
  }
  state.modal = null;
  await loadCollections();
  if (["workspace","budget-tools"].includes(state.view) && state.projectId) {
    await loadEstimates();
    await loadEstimate();
  } else if (state.view === "resources") { await refreshResource(); render(); }
  else if (state.view === "analyses") { await refreshAnalysis(); render(); }
  else render();
  state.message = "Cambios guardados";
  render();
}

async function act(button) {
  const action = button.dataset.action;
  if (action === "backups") { state.backups = await invoke("list_backups"); openModal("backups"); return; }
  if (action === "create-backup") { await invoke("create_backup"); state.backups = await invoke("list_backups"); state.message = "Copia creada"; render(); return; }
  if (action === "verify-database") { await invoke("verify_database"); state.message = "Integridad y referencias verificadas"; render(); return; }
  if (action === "restore-backup") {
    if (!window.confirm("¿Restaurar esta copia? Se guardará antes una copia del estado actual. Los cambios posteriores a la copia elegida dejarán de estar activos.")) return;
    await invoke("restore_backup", { id: button.dataset.id }); window.location.reload(); return;
  }
  if (action === "retry-startup") { window.location.reload(); return; }
  if (state.busy && action !== "close-modal") return;
  if (action === "close-modal") {
    closeModal(); return;
  }
  if (action === "dismiss-toast") { state.message = ""; render(); return; }
  if (action === "navigate") {
    state.view = button.dataset.view; state.search = ""; state.selectedLineId = null;
    if (state.view === "resources" && state.selectedResourceId) await refreshResource();
    if (state.view === "analyses" && state.selectedAnalysisId) await refreshAnalysis();
    render(); return;
  }
  if (action === "goto-resources") { state.view = "resources"; state.search = ""; render(); return; }
  if (action === "open-project") { await openProject(button.dataset.id); return; }
  if (action === "open-estimate") { await openEstimate(button.dataset.id); return; }
  if (action === "select-line") {
    state.selectedLineId = button.dataset.id; state.selectedSectionId=state.assignments[state.selectedLineId]||null; await loadPanel(); renderSelection(); return;
  }
  if (action === "select-section") {state.selectedSectionId=button.dataset.id;state.selectedLineId=null;await loadPanel();renderSelection();return;}
  if (action === "panel") {
    state.panel = button.dataset.panel; await loadPanel(); render(); return;
  }
  if (action === "select-resource") {
    state.selectedResourceId = button.dataset.id; await refreshResource(); render(); return;
  }
  if (action === "select-analysis") {
    state.selectedAnalysisId = button.dataset.id; await refreshAnalysis(); render(); return;
  }
  if (["edit-line-resources","assign-resource","edit-line-resource"].includes(action)) {
    const line=currentLine();if(!editable()||!line)return;
    const detail=line.analysis_id ? await invoke("get_analysis_details",{analysisId:line.analysis_id}):null;
    state.estimateResourcePrices=await invoke("get_estimate_resource_prices",{estimateId:state.estimateId});
    const all=detail?.components||[];
    let index=action==="edit-line-resource"?Number(button.dataset.index):-1;
    if(action==="assign-resource")index=all.findIndex(row=>row.resource_id===button.dataset.id);
    const resource=action==="assign-resource"?state.resources.find(row=>row.id===button.dataset.id):null;
    const selected=index>=0?all[index]:resource?{resource_id:resource.id,quantity:"1",unit_price:state.estimateResourcePrices?.[resource.id]??(currentEstimate()?.currency==="USD"?"":resource.price??"")}:{resource_id:"",quantity:"1",unit_price:""};
    if(index>=0&&!selected)throw new Error("El insumo ya no está en la composición");
    openModal("line-resources",{...line,components:[selected],allComponents:all,componentIndex:index});return;
  }
  if (action === "duplicate-line") {if(!editable()||!currentLine())return;state.selectedLineId=await invoke("duplicate_budget_line",{estimateId:state.estimateId,lineId:state.selectedLineId});await loadEstimate();return;}
  if (action === "modal-client") return openModal("client");
  if (action === "modal-project") return openModal("project");
  if (action === "edit-project") return openModal("project", state.projects.find(p => p.id === button.dataset.id));
  if (action === "modal-estimate") {
    if (!state.projectId) throw new Error("Abrí una obra antes de crear el presupuesto.");
    return openModal("estimate");
  }
  if (action === "modal-section") return editable() && openModal("section");
  if (action === "edit-section") return editable() && openModal("section", state.sections.find(s => s.id === button.dataset.id));
  if (action === "modal-line") return editable() && openModal("line");
  if (action === "edit-line") return editable() && currentLine() && openModal("line", currentLine());
  if (action === "modal-from-acu") return editable() && openModal("from-acu");
  if (action === "modal-resource") return openModal("resource");
  if (action === "modal-price") return openModal("price", state.resources.find(r => r.id === button.dataset.id));
  if (action === "modal-analysis") return openModal("analysis");
  if (action === "edit-analysis") {
    const id = button.dataset.id || state.selectedAnalysisId;
    if (!id) return;
    const info = await invoke("get_analysis_details", { analysisId: id });
    const entry = state.analyses.find(a => a.id === id);
    if (!entry) throw new Error("El ACU seleccionado ya no existe.");
    return openModal("analysis", { ...entry, components: info.components });
  }
  if (action === "edit-resource") {
    const resource = state.resources.find(r => r.id === button.dataset.id);
    if (resource) return openModal("resource", resource);
    return;
  }
  if (action === "refresh-draft-costs") {
    if (!editable()) return;
    if (!window.confirm("¿Actualizar los precios unitarios de todas las partidas vinculadas a ACU de este borrador? Las cantidades no cambian. Podés duplicar el presupuesto antes para conservar la versión anterior.")) return;
    const result = await invoke("refresh_draft_analysis_costs", { estimateId: state.estimateId });
    await loadEstimate();
    state.message = result.updated_lines +
      " partidas actualizadas. Antes: ARS " + money(result.old_direct_total) +
      " · Ahora: ARS " + money(result.new_direct_total);
    render();
    return;
  }
  if (action === "modal-reprice") return openModal("reprice", state.analyses.find(a => a.id === button.dataset.id));
  if (action === "modal-rates") return editable() && openModal("rates");
  if (action === "modal-takeoff") return editable() && openModal("takeoff");
  if (action === "edit-takeoff") return editable() && openModal("takeoff", state.takeoffs.find(r => r.id === button.dataset.id));
  if (action === "modal-comparison") return openModal("comparison");
  if (action === "modal-contracting") return openModal("contracting");
  if (action === "add-component" || action === "remove-component") {
    state.modalDirty=true;
    const form = document.querySelector("#dialog-form");
    if (form && state.modal?.kind === "analysis") {
      state.modal.record = {
        ...(state.modal.record || {}),
        code: form.querySelector('[name="code"]')?.value || "",
        description: form.querySelector('[name="description"]')?.value || "",
        unit: form.querySelector('[name="unit"]')?.value || "m²"
      };
    }
    if (form) state.acuComponents = [...form.querySelectorAll(".component-row")].map(row => ({
      resourceId: row.querySelector('select[name="resource"]')?.value,
      quantity: row.querySelector('input[name="quantity"]')?.value,
      unitPrice: row.querySelector('input[name="unitPrice"]')?.value
    }));
    if (action === "add-component") state.acuComponents.push({ resourceId: state.resources[0]?.id, quantity: 1, unitPrice: state.modal?.kind==="line-resources" && currentEstimate()?.currency==="USD"?"":state.resources[0]?.price ?? "" });
    else state.acuComponents.splice(Number(button.dataset.index), 1);
    render(); return;
  }
  if (action === "delete-line") {
    const line = currentLine();
    if (!editable() || !line || !window.confirm(`¿Eliminar la partida "${line.description}" junto con su composición y metrados? Los insumos del catálogo y el historial se conservan.`)) return;
    await invoke("delete_estimate_line", { estimateId: state.estimateId, lineId: line.id });
    state.selectedLineId = null; await loadEstimate(); return;
  }
  if (action === "delete-takeoff") {
    if (!editable() || !window.confirm("¿Eliminar esta medición?")) return;
    await invoke("delete_takeoff", { id: button.dataset.id }); await loadPanel(); render(); return;
  }
  if (action === "apply-takeoffs") {
    if (!editable()) return;
    await invoke("apply_takeoff", { estimateId: state.estimateId, lineId: state.selectedLineId });
    await loadEstimate(); return;
  }
  if (action === "duplicate-estimate") {
    const est = currentEstimate();
    if (!est) return;
    const title = window.prompt("Nombre de la nueva versión", est.title + " · Revisión");
    if (!title?.trim()) return;
    const copy = await invoke("duplicate_estimate", { estimateId: est.id, title: title.trim() });
    await loadEstimates(); await openEstimate(copy.id); return;
  }
  if (action === "issue") {
    if (!editable() || !state.lines.length) return;
    if (!window.confirm("¿Emitir el presupuesto? Después no podrás modificar sus partidas, rubros, porcentajes ni mediciones.")) return;
    await invoke("issue_estimate", { estimateId: state.estimateId });
    await loadEstimates(); await loadEstimate();
  }
}

return { act, handleSubmit };
}
import { money } from "../decimal.js";
