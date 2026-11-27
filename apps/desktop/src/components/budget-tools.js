import { uiText, uiHtml } from "../services/interface-language.js";
import { exportBudget } from "../services/budget-export.js";
import { clientLayouts, hasMemory } from "../services/budget-public.js";
import { dateToday } from "./helpers.js";
import { budgetReportPdf } from "../services/budget-print.js";
import {memoryEditor} from "./memory-editor.js";
import { e, field, select } from "./helpers.js";
import {
  exportCsv,
  parseCsv,
  rowsToBudget,
  exportExcel,
  parseExcel,
  exportPdf,
} from "../services/exchange.js";

export function createBudgetTools({
  invoke,
  state,
  render,
  document,
  window,
  FormData,
  presentation,
  loadEstimates,
  loadEstimate,
}) {
  const model = {
    snapshot: null,
    templates: [],
    lines: [],
    lastExport: "",
    formulaLineId: "",
    totals: null,
    options: {},
  };
  const current = () =>
    state.estimates.find((estimate) => estimate.id === state.estimateId);
  const settingsKey = () =>
    "cpobras:budget-export:" +
    String(state.database?.scope || "local") +
    ":" +
    state.estimateId;
  function saveOptions() {
    const form = document.querySelector("#budget-export-form");
    if (form)
      model.options = {
        ...model.options,
        ...Object.fromEntries(new FormData(form)),
      };
    try {
      window.localStorage.setItem(settingsKey(), JSON.stringify(model.options));
    } catch {}
  }
  function exportMarkup() {
    const o = model.options;
    return `<form id="budget-export-form" class="feature-editor budget-export-editor"><h2>${uiHtml("Exportar presupuesto")}</h2>
    <p>${uiHtml("Elegí una presentación para entregar o un respaldo editable e imprimible.")}</p>
    <div class="form-grid">${select(
      uiText("Presentación"),
      "kind",
      [
        ["full", uiText("Respaldo completo con ACU")],
        ["client", uiText("Presupuesto para cliente")],
        ["incidences", uiText("Incidencias por partida")],
      ],
      o.kind,
    )}
    ${select(
      uiText("Formato"),
      "format",
      [
        ["xlsx", uiText("Excel editable (.xlsx)")],
        ["pdf", uiText("PDF imprimible")],
      ],
      o.format,
    )}
    ${field(uiText("Título"), "title", o.title, "required")}
    ${field(uiText("Fecha"), "date", o.date, 'type="date"')}${field(uiText("Referencia"), "reference", o.reference)}
    <div ${o.kind === "client" ? "" : "hidden"}>${select(uiText("Contenido para el cliente"), "layout", Object.entries(clientLayouts), o.layout)}</div>
    </div><div ${o.kind === "incidences" || (o.kind === "client" && !hasMemory(o.layout)) ? "hidden" : ""}>${memoryEditor(o.memory,{name:"memory",label:uiText("Memoria descriptiva inicial"),rows:7,readonly:Boolean(current()?.issued || state.remoteProject)})}</div>
    <label class="field"><span>${uiHtml("Condiciones comerciales y observaciones")}</span><textarea name="notes" rows="5" placeholder="Validez de la oferta, forma de pago, plazo de entrega, alcance y exclusiones…">${e(o.notes)}</textarea></label>
    ${select(
      uiText("Hoja PDF"),
      "orientation",
      [
        ["portrait", uiText("Vertical")],
        ["landscape", uiText("Horizontal")],
      ],
      o.orientation,
    )}
    <p>${o.kind === "client" ? uiHtml("Incluye únicamente precios de venta, subtotal, IVA / impuestos y total final. La planilla muestra la incidencia de cada partida.") : o.kind === "incidences" ? uiHtml("Importes e incidencia de cada partida y rubro sobre el total final.") : uiHtml("Excel: hojas Partidas, ACU, Precio, Insumos, Metrados, Detalle precio y Memoria. Los precios con ACU se recalculan desde su composición; las demás partidas conservan su precio declarado. PDF: presupuesto, formación del precio y anexos.")}</p>
    ${presentation.feedback()}<button class="btn primary" type="submit">${uiHtml("Generar archivo")}</button><p class="feature-error" role="alert"></p>
    ${model.lastExport ? `<p role="status">${uiHtml("Archivo guardado en:")}<br><code>${e(model.lastExport)}</code></p>` : ""}</form>`;
  }
  async function refresh() {
    model.templates = await invoke("list_budget_templates");
    if (state.estimateId) {
      model.snapshot = await invoke("export_budget_document", {
        estimateId: state.estimateId,
      });
      model.lines = model.snapshot.lines.map((line) => ({
        id: line.id,
        description: line.description,
        unit: line.unit,
        quantity: line.quantity,
        unit_cost: line.unit_cost_snapshot,
      }));
      model.totals = await invoke("priced_estimate_total", {
        estimateId: state.estimateId,
      });
    }
    if (!model.lines.some((l) => l.id === model.formulaLineId))
      model.formulaLineId = model.lines[0]?.id || "";
  }
  function readLines() {
    const form = document.querySelector("#budget-bulk-form");
    if (!form) return;
    const data = new FormData(form);
    model.lines = model.lines.map((line) => ({
      ...line,
      ...Object.fromEntries(
        ["description", "unit", "quantity", "unit_cost"].map((key) => [
          key,
          String(data.get(key + "-" + line.id) ?? line[key]).trim(),
        ]),
      ),
    }));
  }
  function markup() {
    const locked = current()?.issued ? "disabled" : "";
    const formula = model.snapshot?.formulas?.find(
      (row) => row.line_id === model.formulaLineId,
    );
    return `<main class="feature-page"><div class="feature-toolbar"><h1>${uiHtml("Exportar presupuesto · {0}", [current()?.title])}</h1><button class="btn" data-action="budget-tools-back">${uiHtml("Volver a la grilla")}</button></div>
   ${exportMarkup()}<details class="feature-editor"><summary>${uiHtml("Edición avanzada, intercambio y plantillas")}</summary><div class="feature-columns"><section><form id="budget-bulk-form"><div class="feature-toolbar"><input data-search placeholder="${uiHtml("Buscar partidas")}"><button type="button" class="btn" data-action="budget-tools-sort" ${locked}>${uiHtml("Ordenar por descripción")}</button><button class="btn primary" type="submit" ${locked}>${uiHtml("Guardar edición masiva")}</button></div><p>${uiHtml("Los cambios se validan y se guardan juntos. Si una partida es inválida, no se guarda ninguna.")}</p><table class="data-grid"><thead><tr><th>${uiHtml("Descripción")}</th><th>${uiHtml("Unidad")}</th><th>${uiHtml("Cantidad")}</th><th>${uiHtml("P. unitario")}</th><th>${uiHtml("Orden / copia")}</th></tr></thead><tbody>${model.lines.map((line) => `<tr data-searchable="${e((line.description + " " + line.unit).toLowerCase())}"><td><input name="description-${line.id}" value="${e(line.description)}" required ${locked}></td><td><input name="unit-${line.id}" value="${e(line.unit)}" required ${locked}></td><td><input name="quantity-${line.id}" value="${e(line.quantity)}" type="number" min="0" step="any" required ${locked}></td><td><input name="unit_cost-${line.id}" value="${e(line.unit_cost)}" type="number" min="0" step="any" required ${locked}></td><td><button class="btn" type="button" data-action="budget-tools-up" data-id="${line.id}" ${locked}>↑</button><button class="btn" type="button" data-action="budget-tools-down" data-id="${line.id}" ${locked}>↓</button><button class="btn" type="button" data-action="budget-tools-copy" data-id="${line.id}" ${locked}>${uiHtml("Duplicar")}</button></td></tr>`).join("")}</tbody></table><p class="feature-error" role="alert"></p></form>
   <form id="line-formula-form" class="feature-editor"><h2>${uiHtml("Partida paramétrica")}</h2>${select(
     uiText("Partida"),
     "formula-line",
     model.lines.map((line) => [line.id, line.description]),
     model.formulaLineId,
   )}${field(uiText("Fórmula de cantidad"), "expression", formula?.expression || "largo * ancho * factor", "required")}${field(
     uiText("Variables (nombre=valor; nombre=valor)"),
     "variables",
     formula
       ? Object.entries(formula.variables)
           .map(([name, value]) => name + "=" + value)
           .join("; ")
       : "largo=1; ancho=1; factor=1",
     "required",
   )}<p>${uiHtml("Se admiten +, −, × (*), ÷ (/), paréntesis y variables. No se ejecuta código.")}</p><button class="btn primary" type="submit" ${locked}>${uiHtml("Aplicar cantidad calculada")}</button><p class="feature-error" role="alert"></p></form></section>
   <aside><form id="budget-exchange-form" class="feature-editor"><h2>${uiHtml("Exportación técnica / intercambio interno")}</h2><p>${uiHtml("Para presentar al cliente o imprimir incidencias, usá")} <button class="btn" type="button" data-action="open-budget-printing">${uiHtml("Imprimir presupuesto")}</button>.</p>${field(uiText("Título"), "title", current()?.title || "Presupuesto", "required")}${select(
     uiText("Formato de intercambio"),
     "format",
     [
       ["xlsx", uiText("Excel (.xlsx)")],
       ["csv", "CSV"],
       ["json", uiText("Intercambio completo (.json)")],
       ["pdf", "PDF"],
     ],
   )}${select(uiText("Contenido PDF"), "pdf_mode", [
     ["budget", uiText("Presupuesto")],
     ["takeoffs", uiText("Cómputos métricos")],
     ["analyses", uiText("ACU actuales")],
   ])}${select(uiText("Hoja PDF"), "orientation", [
     ["portrait", uiText("Vertical")],
     ["landscape", uiText("Horizontal")],
   ])}<button class="btn primary" type="submit">${uiHtml("Exportar intercambio")}</button><p class="feature-error" role="alert"></p></form>
   <form id="budget-import-form" class="feature-editor"><h2>${uiHtml("Importar como presupuesto nuevo")}</h2><input name="file" type="file" accept=".xlsx,.csv,.json" required>${field(uiText("Nombre del presupuesto importado"), "title", "Presupuesto importado", "required")}<p>${uiHtml("Excel y CSV deben usar las columnas del archivo exportado por CPOBRAS. JSON conserva rubros, tasas y metrados. La importación no sobrescribe el presupuesto actual.")}</p><button class="btn" type="submit">${uiHtml("Importar en esta obra")}</button><p class="feature-error" role="alert"></p></form>
   <form id="budget-template-save" class="feature-editor"><h2>${uiHtml("Guardar plantilla reutilizable")}</h2>${field(uiText("Nombre de la plantilla"), "name", current()?.title || "Plantilla", "required")}<button class="btn" type="submit">${uiHtml("Guardar en biblioteca")}</button><p class="feature-error" role="alert"></p></form>
   <form id="budget-template-apply" class="feature-editor"><h2>${uiHtml("Crear desde plantilla")}</h2>${select(
     uiText("Plantilla"),
     "template",
     model.templates.map((template) => [template.id, template.name]),
   )}${field(uiText("Nombre del nuevo presupuesto"), "title", "Presupuesto desde plantilla", "required")}<button class="btn" type="submit">${uiHtml("Crear en esta obra")}</button><p class="feature-error" role="alert"></p></form></aside></div></details></main>`;
  }
  async function act(button) {
    const action = button.dataset.action;
    if (action === "open-budget-tools") {
      if (!state.estimateId) throw new Error(uiText("Seleccioná un presupuesto"));
      state.view = "budget-tools";
      state.search = "";
      model.lastExport = "";
      let saved = {};
      try {
        saved = JSON.parse(window.localStorage.getItem(settingsKey()) || "{}");
      } catch {}
      model.options = {
        kind: "full",
        format: "xlsx",
        layout: "memory_sheet_price",
        title: current()?.title || "Presupuesto",
        date: dateToday(),
        reference: "",
        memory: "",
        notes: "",
        orientation: "portrait",
        ...saved,
      };
      await presentation.open();
      if(presentation.model.revision===0 && !presentation.model.data.memory && saved.memory && !state.remoteProject && !current()?.issued){
        presentation.update({memory:saved.memory});await presentation.flush();
      }
      model.options.memory=presentation.model.data.memory;
      await refresh();
    }
    if (action === "budget-tools-back") {
      state.view = "workspace";
      await loadEstimate();
    }
    if (action === "budget-tools-sort") {
      readLines();
      model.lines.sort((a, b) =>
        a.description.localeCompare(b.description, "es-AR"),
      );
    }
    if (["budget-tools-up", "budget-tools-down"].includes(action)) {
      readLines();
      const index = model.lines.findIndex(
          (line) => line.id === button.dataset.id,
        ),
        target = index + (action.endsWith("up") ? -1 : 1);
      if (target >= 0 && target < model.lines.length)
        [model.lines[index], model.lines[target]] = [
          model.lines[target],
          model.lines[index],
        ];
    }
    if (action === "budget-tools-copy") {
      readLines();
      await invoke("edit_budget_lines", {
        estimateId: state.estimateId,
        changes: model.lines,
        order: model.lines.map((line) => line.id),
      });
      await invoke("duplicate_budget_line", {
        estimateId: state.estimateId,
        lineId: button.dataset.id,
      });
      await refresh();
    }
    render();
  }
  async function importDocument(snapshot, title) {
    if (
      state.pageDirty &&
      !window.confirm(
        uiText("¿Descartar la edición masiva pendiente y abrir el presupuesto nuevo?"),
      )
    )
      return;
    state.pageDirty = false;
    snapshot.title = title;
    const created = await invoke("import_budget_document", {
      projectId: state.projectId,
      document: snapshot,
    });
    state.estimateId = created.id;
    await loadEstimates();
    await loadEstimate();
    await refresh();
    state.message = uiText("Presupuesto creado sin modificar el anterior");
  }
  async function submit(form) {
    const data = new FormData(form),
      value = (name) => String(data.get(name) || "").trim();
    if (form.id === "budget-bulk-form") {
      readLines();
      await invoke("edit_budget_lines", {
        estimateId: state.estimateId,
        changes: model.lines,
        order: model.lines.map((line) => line.id),
      });
      await loadEstimate();
      await refresh();
    }
    if (form.id === "line-formula-form") {
      const variables = Object.fromEntries(
        value("variables")
          .split(";")
          .map((pair) => {
            const index = pair.indexOf("=");
            if (index < 1) throw new Error(uiText("Formato de variable: nombre=valor"));
            return [pair.slice(0, index).trim(), pair.slice(index + 1).trim()];
          }),
      );
      await invoke("set_line_formula", {
        estimateId: state.estimateId,
        lineId: value("formula-line"),
        expression: value("expression"),
        variables,
      });
      await loadEstimate();
      await refresh();
    }
    if (form.id === "budget-template-save") {
      await invoke("save_budget_template", {
        estimateId: state.estimateId,
        name: value("name"),
      });
      await refresh();
    }
    if (form.id === "budget-template-apply") {
      const template = model.templates.find(
        (item) => item.id === value("template"),
      );
      if (!template) throw new Error(uiText("Seleccioná una plantilla"));
      await importDocument(structuredClone(template.document), value("title"));
    }
    if (form.id === "budget-import-form") {
      const file = data.get("file");
      if (!file || file.size > 10_000_000)
        throw new Error(uiText("Seleccioná un archivo de hasta 10 MB"));
      let snapshot;
      if (file.name.toLowerCase().endsWith(".json"))
        snapshot = JSON.parse(await file.text());
      else {
        const rows = file.name.toLowerCase().endsWith(".xlsx")
          ? await parseExcel(await file.arrayBuffer())
          : parseCsv(await file.text());
        snapshot = rowsToBudget(rows, {
          currency: model.snapshot.currency,
          title: value("title"),
          uuid: () => window.crypto.randomUUID(),
        });
      }
      await importDocument(snapshot, value("title"));
    }
    if (form.id === "budget-export-form") {
      saveOptions();
      if(!state.remoteProject){presentation.update({memory:model.options.memory});await presentation.flush();}
      const options = {
        ...model.options,
        landscape: value("orientation") === "landscape",
      };
      const bytes = await exportBudget(invoke, state, options);
      model.lastExport = await invoke("write_export", {
        name: "presupuesto." + options.format,
        bytes: Array.from(bytes),
      });
      if (options.format === "pdf")
        try {
          await invoke("open_export_pdf", { path: model.lastExport });
        } catch (error) {
          state.message = "PDF guardado. " + String(error);
        }
    }
    if (form.id === "budget-exchange-form") {
      const snapshot = await invoke("export_budget_document", {
          estimateId: state.estimateId,
        }),
        format = value("format");
      let bytes;
      if (format === "csv")
        bytes = new TextEncoder().encode(exportCsv(snapshot));
      if (format === "json")
        bytes = new TextEncoder().encode(JSON.stringify(snapshot, null, 2));
      if (format === "xlsx") bytes = await exportExcel(snapshot, model.totals);
      if (format === "pdf") {
        const analyses =
          value("pdf_mode") === "analyses"
            ? await Promise.all(
                [
                  ...new Set(
                    snapshot.lines
                      .map((line) => line.analysis_id)
                      .filter(Boolean),
                  ),
                ].map((analysisId) =>
                  invoke("get_analysis_details", { analysisId }),
                ),
              )
            : [];
        bytes =
          value("pdf_mode") === "budget"
            ? await budgetReportPdf(
                await invoke("get_budget_print_data", {
                  estimateId: state.estimateId,
                }),
                {
                  mode: "internal",
                  title: value("title"),
                  landscape: value("orientation") === "landscape",
                },
              )
            : await exportPdf(snapshot, {
                title: value("title"),
                landscape: value("orientation") === "landscape",
                mode: value("pdf_mode"),
                analyses,
                totals: model.totals,
              });
      }
      model.lastExport = await invoke("write_export", {
        name: "presupuesto." + format,
        bytes: Array.from(bytes),
      });
      if (format === "pdf") {
        try {
          await invoke("open_export_pdf", { path: model.lastExport });
        } catch (error) {
          state.message = "PDF guardado. " + String(error);
        }
      }
    }
    render();
  }
  function input(target) {
    if (target.closest?.("#budget-export-form")){saveOptions();if(target.name==="memory"&&!state.remoteProject)presentation.update({memory:target.value});}
  }
  async function change(target) {
    if (target.closest?.("#budget-export-form")) {
      saveOptions();
      if (["kind", "layout"].includes(target.name)) render();
    }
    if (target.name === "formula-line") {
      readLines();
      model.formulaLineId = target.value;
      render();
    }
  }
  return { markup, act, submit, change, input, model };
}
