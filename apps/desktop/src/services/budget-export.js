import { budgetReportPdf, budgetReportExcel } from "./budget-print.js";
import {
  buildBudgetWorkbook,
  buildClientWorkbook,
  workbookBytes,
} from "./budget-workbook.js";
import { money, numeric } from "../decimal.js";

export async function exportBudget(invoke, state, options) {
  const data = await invoke("get_budget_print_data", {
    estimateId: state.estimateId,
  });
  if (options.kind === "client")
    return options.format === "xlsx"
      ? workbookBytes(buildClientWorkbook(data, options))
      : budgetReportPdf(data, { ...options, mode: "client" });
  if (options.kind === "incidences")
    return options.format === "xlsx"
      ? budgetReportExcel(data, "incidences", options)
      : budgetReportPdf(data, { ...options, mode: "incidences" });
  const embedded = new Set(
    (data.document.line_analyses || []).map((a) => a.id),
  );
  const ids = [
    ...new Set(
      data.document.lines
        .map((l) => l.analysis_id)
        .filter((id) => id && !embedded.has(id)),
    ),
  ];
  const [analyses, prices, definition] = await Promise.all([
    Promise.all(
      ids.map(async (analysisId) => ({
        ...(await invoke("get_analysis_details", { analysisId })),
        id: analysisId,
      })),
    ),
    invoke("get_estimate_resource_prices", { estimateId: state.estimateId }),
    data.document.price_definition
      ? Promise.resolve(null)
      : invoke("get_price_definition", { estimateId: state.estimateId }),
  ]);
  if (!data.document.price_definition) {
    if (!definition?.definition?.rows)
      throw new Error(
        "No se pudo recuperar la determinación del precio para el respaldo",
      );
    data.document = {
      ...data.document,
      price_definition: definition.definition,
    };
  }
  const sheets = buildBudgetWorkbook(data, {
    ...options,
    analyses,
    prices,
    resources: state.resources || [],
  });
  if (options.format === "xlsx") return workbookBytes(sheets);
  const descriptions = {
    ACU: "Composición y costos por unidad de los ACU utilizados.",
    Insumos: "Cantidades y costos acumulados de todas las partidas.",
    Metrados: "Cómputos métricos cargados en el presupuesto.",
    "Detalle precio":
      "Detalle de los conceptos utilizados en la formación del precio.",
  };
  const appendices = sheets
    .filter((s) => Object.hasOwn(descriptions, s.sheet))
    .map((s) => ({
      title: s.data[0][0].value,
      note: descriptions[s.sheet],
      headers: s.data[2].slice(0, s.printColumns).map((c) => c?.value || ""),
      rows: s.data
        .slice(3)
        .filter((row) => row.length)
        .map((row) => ({
          span: Math.min(row[0]?.columnSpan || 1, s.printColumns),
          kind: row[0]?.columnSpan ? "section" : "line",
          cells: Array.from({ length: s.printColumns }, (_, i) => {
            const c = row[i];
            if (!c) return "";
            if (c.type === Number || c.type === "Formula")
              return c.format === "#,##0.00"
                ? money(c.cached ?? c.value)
                : numeric(c.cached ?? c.value);
            return String(c.value ?? "");
          }),
        })),
    }));
  return budgetReportPdf(data, {
    ...options,
    layout: options.memory ? "memory_sheet_price" : "sheet_price",
    mode: "internal",
    appendices,
  });
}
