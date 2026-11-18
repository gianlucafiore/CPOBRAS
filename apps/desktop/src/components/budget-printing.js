import { e, field, select, dateToday } from "./helpers.js";
import { money, numeric } from "../decimal.js";
import {clientLayouts,hasMemory} from "../services/budget-public.js";
import {publicPriceSummary} from "../services/budget-public.js";
import { logoUrl } from "../services/print-logo.js";
import {memoryHtml} from "../services/memory-markdown.js";
import {
  reportNames,
  printRows,
  printCells,
  printColumns,
  budgetReportPdf,
  budgetReportExcel,
} from "../services/budget-print.js";
export function createBudgetPrinting({
  invoke,
  state,
  render,
  document,
  FormData,
  presentation,
}) {
  const model = {
    data: null,
    mode: "client",
    layout: "sheet_price",
    format: "pdf",
    title: "",
    reference: "",
    date: dateToday(),
    notes: "",
    landscape: false,
    lastExport: "",
    openError: "",
  };
  function markup() {
    if (!model.data)
      return '<main class="feature-page">Sin presupuesto para imprimir</main>';
    const data = model.data,
      p = data.profile,
      rows = printRows(data, model.mode),
      headers = printColumns(model.mode);
    return `<main class="feature-page budget-printing"><div class="feature-toolbar"><h1>Imprimir presupuesto</h1><button class="btn" data-action="open-workspace">Volver al presupuesto</button></div><form id="budget-print-form" class="feature-editor"><div class="form-grid">${select("Presentación", "print-mode", Object.entries(reportNames), model.mode)}${model.mode === "client" ? select("Contenido para el cliente", "print-layout", Object.entries(clientLayouts), model.layout) : ""}${field("Título del documento", "print-title", model.title, 'required maxlength="300"')}${field("Fecha del documento", "print-date", model.date, 'type="date" required')}${field("Referencia / número", "print-reference", model.reference, 'maxlength="100"')}${select(
      "Orientación",
      "print-orientation",
      [
        ["portrait", "Vertical"],
        ["landscape", "Horizontal"],
      ],
      model.landscape ? "landscape" : "portrait",
    )}${select(
      "Salida",
      "print-format",
      [
        ["pdf", "PDF · abrir en el lector predeterminado"],
        ["xlsx", "Excel (.xlsx)"],
      ],
      model.format,
    )}</div><label class="field"><span>Condiciones y observaciones públicas</span><textarea aria-label="Condiciones y observaciones públicas" name="print-notes" maxlength="5000">${e(model.notes)}</textarea></label>${presentation.feedback()}<button type="submit" class="btn primary">Generar documento</button><p class="feature-error" role="alert"></p></form>${model.lastExport ? `<div class="print-export-result" role="status">Guardado en ${e(model.lastExport)}${model.lastExport.endsWith(".pdf") ? '<button class="btn" data-action="printing-open-pdf">Abrir PDF</button>' : ""}${model.openError ? `<p role="alert">${e(model.openError)}</p>` : ""}</div>` : ""}<section class="print-preview"><div class="print-preview-heading">${p.logo_png.length ? `<img src="${logoUrl(p.logo_png)}" alt="Logotipo del emisor">` : ""}<div><h2>${e(p.trade_name || p.company_name || p.professional_name || "CPOBRAS")}</h2><strong>${e(reportNames[model.mode])}</strong><p>${e(data.project.name)} · ${e(data.client.name)} · ${e(data.document.title)}</p></div><strong>${e(["USD", "Usd"].includes(data.estimate.currency) ? "USD" : "ARS")} ${money(data.final_total)}</strong></div>${model.mode === "internal" ? '<p class="print-internal-label">USO INTERNO · incluye costos y formación del precio</p>' : model.mode === "client" ? "<p>Precios de venta sin IVA por partida. El total final incluye los impuestos indicados.</p>" : "<p>Incidencias sobre el total final. Los rubros muestran subtotales, sin duplicarlos en el total.</p>"}${model.mode === "client" && hasMemory(model.layout) ? `<section class="print-memory-cover"><h3>Memoria descriptiva</h3><div class="memory-formatted">${memoryHtml(presentation.model.data.memory||"Sin memoria descriptiva. Cargala desde Presupuesto → Memoria descriptiva.")}</div></section>${model.layout==="memory_sheet_price"?'<div class="print-quotation-break"><h3>Cotización</h3><p class="small-muted">La tabla comienza en una página nueva del PDF, después de la memoria.</p></div>':''}` : ""}<div class="print-preview-table" ${model.mode === "client" && model.layout === "memory_price" ? "hidden" : ""}><table class="data-grid"><thead><tr>${headers.map((h) => `<th>${e(h)}</th>`).join("")}</tr></thead><tbody>${rows
      .slice(0, 200)
      .map(
        (r) =>
          `<tr class="${r.kind === "section" ? "print-section" : ""}">${printCells(
            r,
            model.mode,
            { formatted: true },
          )
            .map((c) => `<td>${e(c)}</td>`)
            .join("")}</tr>`,
      )
      .join(
        "",
      )}</tbody></table></div>${rows.length > 200 ? "<p>Vista previa de los primeros 200 renglones. El archivo incluye todos.</p>" : ""}${model.mode === "client" ? `<div class="summary-row"><span>Subtotal sin IVA</span><strong>${money(publicPriceSummary(data).subtotal)}</strong></div><div class="summary-row"><span>IVA / impuestos</span><strong>${money(publicPriceSummary(data).taxes)}</strong></div>` : ""}<div class="summary-final"><span>TOTAL ${e(["USD", "Usd"].includes(data.estimate.currency) ? "USD" : "ARS")}</span><strong>${money(data.final_total)}</strong></div>${model.mode === "incidences" ? `<p>Incidencia total: ${numeric(/^0(?:\.0+)?$/.test(String(data.final_total)) ? "0" : "100")} %</p>` : ""}${
      model.mode === "internal"
        ? `<h3>Determinación de precio</h3><p>Costo directo: ${money(data.calculation.breakdown.direct)}</p>${data.calculation.rows
            .filter((r) => r.enabled)
            .map(
              (r) =>
                `<div class="summary-row"><span>${e(r.label)}</span><strong>${money(r.amount)}</strong></div>`,
            )
            .join("")}`
        : ""
    }<p class="small-muted">Los datos públicos y el logotipo se configuran desde Inicio → Organizaciones → Datos de la organización. La impresión no modifica el presupuesto.</p></section></main>`;
  }
  async function act(button) {
    if (button.dataset.action === "open-budget-printing") {
      if (!state.estimateId) throw new Error("Abrí un presupuesto");
      model.data = await invoke("get_budget_print_data", {
        estimateId: state.estimateId,
      });
      await presentation.open();
      model.title = model.data.document.title;
      model.date = dateToday();
      model.mode = "client";
      model.reference = "";
      model.notes = "";
      model.layout = presentation.model.data.memory.trim()?"memory_sheet_price":"sheet_price";
      model.format = "pdf";
      model.landscape = false;
      for(const [key,value] of Object.entries(presentation.model.data.print_options||{}))
        if(value!=="" && key in model)model[key]=value;
      model.lastExport = "";
      model.openError = "";
      state.view = "budget-printing";
      state.search = "";
      render();
      return true;
    }
    if (button.dataset.action === "printing-open-pdf") {
      try {
        await invoke("open_export_pdf", { path: model.lastExport });
        model.openError = "";
      } catch (error) {
        model.openError = String(error);
      }
      render();
      return true;
    }
    return false;
  }
  function restore(){
    Object.assign(model,{mode:"client",layout:presentation.model.data.memory.trim()?"memory_sheet_price":"sheet_price",format:"pdf",title:model.data?.document.title||"Presupuesto",date:dateToday(),reference:"",notes:"",landscape:false});
    for(const [key,value] of Object.entries(presentation.model.data.print_options||{}))if(value!=="" && key in model)model[key]=value;
  }
  function remember(){
    const keys=["mode","format","title","reference","date","notes","landscape","layout"];
    presentation.update({print_options:Object.fromEntries(keys.map(key=>[key,model[key]]))});
  }
  function input(target) {
    if (state.view !== "budget-printing") return;
    const keys = {
      "print-title": "title",
      "print-reference": "reference",
      "print-notes": "notes",
      "print-date": "date",
    };
    if (keys[target.name]) {model[keys[target.name]] = target.value;remember();}
  }
  async function change(target) {
    if (state.view !== "budget-printing") return;
    input(target);
    if (target.name === "print-format") model.format = target.value;
    if (target.name === "print-mode") model.mode = target.value;
    if (target.name === "print-layout") model.layout = target.value;
    if (target.name === "print-orientation") model.landscape = target.value === "landscape";
    if(!target.closest?.('#budget-print-form'))return;
    remember();
    if(!state.remoteProject)await presentation.flush();
    if(["print-mode","print-layout"].includes(target.name))render();
  }
  async function submit(form) {
    for(const control of form.elements)input(control);
    if(!state.remoteProject){remember();await presentation.flush();}
    if(model.mode==="client"&&hasMemory(model.layout)&&!presentation.model.data.memory.trim())
      throw new Error("Completá la memoria desde Presupuesto → Memoria descriptiva antes de generar el documento");
    const data = new FormData(form),
      format = String(data.get("print-format")),
      fresh = await invoke("get_budget_print_data", {
        estimateId: state.estimateId,
      });
    const options = {
      mode: model.mode,
      title: model.title,
      date: model.date,
      reference: model.reference,
      notes: model.notes,
      landscape: model.landscape,
      layout: model.mode === "client" ? model.layout : "sheet_price",
      memory: presentation.model.data.memory,
    };
    const bytes =
      format === "xlsx"
        ? await budgetReportExcel(fresh, model.mode, options)
        : await budgetReportPdf(fresh, options);
    model.data = fresh;
    model.lastExport = await invoke("write_export", {
      name: `presupuesto-${model.mode}.${format}`,
      bytes: [...bytes],
    });
    model.openError = "";
    if (format === "pdf") {
      try {
        await invoke("open_export_pdf", { path: model.lastExport });
        state.message =
          "PDF guardado; se solicitó abrir el lector predeterminado";
      } catch (error) {
        model.openError = String(error);
      }
    }
    state.pageDirty = false;
    render();
  }
  return { markup, act, input, change, submit, model, restore };
}
