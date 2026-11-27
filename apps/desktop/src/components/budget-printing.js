import { uiText, uiHtml } from "../services/interface-language.js";
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
    layout: "memory_sheet_price",
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
      return ("<main class=\"feature-page\">" + uiHtml("Sin presupuesto para imprimir") + "</main>");
    const data = model.data,
      p = data.profile,
      rows = printRows(data, model.mode),
      headers = printColumns(model.mode);
    return `<main class="feature-page budget-printing"><div class="feature-toolbar"><h1>${uiHtml("Imprimir presupuesto")}</h1><button class="btn" data-action="open-workspace">${uiHtml("Volver al presupuesto")}</button></div><form id="budget-print-form" class="feature-editor"><div class="form-grid">${select(uiText("Presentación"), "print-mode", Object.entries(reportNames), model.mode)}${model.mode === "client" ? select(uiText("Contenido para el cliente"), "print-layout", Object.entries(clientLayouts), model.layout) : ""}${field(uiText("Título del documento"), "print-title", model.title, 'required maxlength="300"')}${field(uiText("Fecha del documento"), "print-date", model.date, 'type="date" required')}${field(uiText("Referencia / número"), "print-reference", model.reference, 'maxlength="100"')}${select(
      uiText("Orientación"),
      "print-orientation",
      [
        ["portrait", uiText("Vertical")],
        ["landscape", uiText("Horizontal")],
      ],
      model.landscape ? "landscape" : "portrait",
    )}${select(
      uiText("Salida"),
      "print-format",
      [
        ["pdf", uiText("PDF · abrir en el lector predeterminado")],
        ["xlsx", uiText("Excel (.xlsx)")],
      ],
      model.format,
    )}</div><label class="field"><span>${uiHtml("Condiciones y observaciones públicas")}</span><textarea aria-label="Condiciones y observaciones públicas" name="print-notes" maxlength="5000">${e(model.notes)}</textarea></label>${presentation.feedback()}<button type="submit" class="btn primary">${uiHtml("Generar documento")}</button><p class="feature-error" role="alert"></p></form>${model.lastExport ? `<div class="print-export-result" role="status">${uiHtml("Guardado en")} ${e(model.lastExport)}${model.lastExport.endsWith(".pdf") ? ("<button class=\"btn\" data-action=\"printing-open-pdf\">" + uiHtml("Abrir PDF") + "</button>") : ""}${model.openError ? `<p role="alert">${e(model.openError)}</p>` : ""}</div>` : ""}<section class="print-preview"><div class="print-preview-heading">${p.logo_png.length ? `<img src="${logoUrl(p.logo_png)}" alt="${uiHtml("Logotipo del emisor")}">` : ""}<div><h2>${e(p.trade_name || p.company_name || p.professional_name || "CPOBRAS")}</h2><strong>${e(model.mode === "client" ? model.title : reportNames[model.mode])}</strong><p>${e(data.project.name)} · ${e(data.client.name)} · ${e(data.document.title)}</p></div><strong>${e(["USD", "Usd"].includes(data.estimate.currency) ? "USD" : "ARS")} ${money(data.final_total)}</strong></div>${model.mode === "internal" ? ("<p class=\"print-internal-label\">" + uiHtml("USO INTERNO · incluye costos y formación del precio") + "</p>") : model.mode === "client" ? ("<p>" + uiHtml("Precios de venta sin IVA por partida. El total final incluye los impuestos indicados.") + "</p>") : ("<p>" + uiHtml("Incidencias sobre el total final. Los rubros muestran subtotales, sin duplicarlos en el total.") + "</p>")}${model.mode === "client" && hasMemory(model.layout) ? `<section class="print-memory-cover"><h3>${uiHtml("Memoria descriptiva")}</h3><div class="memory-formatted">${memoryHtml(presentation.model.data.memory || "")}</div></section>` : ""}<div class="print-preview-table" ${model.mode === "client" && model.layout === "memory_price" ? "hidden" : ""}><table class="data-grid"><thead><tr>${headers.map((h) => `<th>${e(h)}</th>`).join("")}</tr></thead><tbody>${rows
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
      )}</tbody></table></div>${rows.length > 200 ? ("<p>" + uiHtml("Vista previa de los primeros 200 renglones. El archivo incluye todos.") + "</p>") : ""}${model.mode === "client" ? `${publicPriceSummary(data).rows.map(row=>`<div class="summary-row"><span>${e(row.label)}</span><strong>${money(row.amount)}</strong></div>`).join("")}` : ""}<div class="summary-final"><span>TOTAL ${e(["USD", "Usd"].includes(data.estimate.currency) ? "USD" : "ARS")}</span><strong>${money(data.final_total)}</strong></div>${model.mode === "incidences" ? `<p>${uiHtml("Incidencia total: {0} %", [numeric(/^0(?:\.0+)?$/.test(String(data.final_total)) ? "0" : "100")])}</p>` : ""}${
      model.mode === "internal"
        ? `<h3>${uiHtml("Determinación de precio")}</h3><p>${uiHtml("Costo directo: {0}", [money(data.calculation.breakdown.direct)])}</p>${data.calculation.rows
            .filter((r) => r.enabled)
            .map(
              (r) =>
                `<div class="summary-row"><span>${e(r.label)}</span><strong>${money(r.amount)}</strong></div>`,
            )
            .join("")}`
        : ""
    }<p class="small-muted">${uiHtml("Los datos públicos y el logotipo se configuran desde Inicio → Organizaciones → Datos de la organización. La impresión no modifica el presupuesto.")}</p></section></main>`;
  }
  async function act(button) {
    if (button.dataset.action === "open-budget-printing") {
      if (!state.estimateId) throw new Error(uiText("Abrí un presupuesto"));
      model.data = await invoke("get_budget_print_data", {
        estimateId: state.estimateId,
      });
      await presentation.open();
      model.title = model.data.document.title;
      model.date = dateToday();
      model.mode = "client";
      model.reference = "";
      model.notes = "";
      model.layout = "memory_sheet_price";
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
    Object.assign(model,{mode:"client",layout:"memory_sheet_price",format:"pdf",title:model.data?.document.title||"Presupuesto",date:dateToday(),reference:"",notes:"",landscape:false});
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
          uiText("PDF guardado; se solicitó abrir el lector predeterminado");
      } catch (error) {
        model.openError = String(error);
      }
    }
    state.pageDirty = false;
    render();
  }
  return { markup, act, input, change, submit, model, restore };
}
