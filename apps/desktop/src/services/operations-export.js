import { multiplyDecimals } from "../decimal.js";
export async function exportOperationalReport({
  invoke,
  format,
  scope,
  model,
  operationNames,
  partnerName,
  whName,
  state,
}) {
  let title = "Informe de obra",
    headers = [],
    rows = [];
  const r = model.report;
  const summaryHeaders = [
    "Obra",
    "Moneda",
    "Costo previsto",
    "Venta prevista",
    "Comprometido",
    "Costo real",
    "Pagado",
    "Cobrado",
    "Por pagar",
    "Por cobrar",
    "Caja",
    "Costo a terminar",
    "Resultado esperado",
    "Avance físico %",
  ];
  const summaryRows = (report) =>
    report.summaries.map((s) => [
      report.name,
      s.currency,
      s.budget_cost,
      s.budget_sale,
      s.committed,
      s.accrued,
      s.paid,
      s.collected,
      s.payable,
      s.receivable,
      s.cash,
      s.cost_to_finish,
      s.expected_result,
      s.physical_percent,
    ]);
  if (scope === "document") {
    const d = model.detail;
    title = `${operationNames[d.kind]} ${d.number}`;
    headers = [
      "Concepto",
      "Descripción",
      "Cantidad",
      "Precio",
      "Importe / valor",
    ];
    rows = [
      ["Fecha", d.date, "", "", ""],
      [
        "Obra",
        state.projects.find((p) => p.id === d.project_id)?.name || d.project_id,
        "",
        "",
        "",
      ],
      ["Moneda", d.currency, "", "", ""],
      ["Contraparte", partnerName(d.partner_id), "", "", ""],
      [
        "Origen",
        model.docs.find((o) => o.id === d.reference_id)?.number || "—",
        "",
        "",
        "",
      ],
      [
        "Período",
        `${d.period_start || ""} / ${d.period_end || ""}`,
        "",
        "",
        "",
      ],
      ["Condiciones", d.terms || "", "", "", ""],
      ["Observaciones", d.notes || "", "", "", ""],
      ...d.lines.map((l, i) => [
        "Renglón",
        l.description,
        l.quantity,
        l.unit_price,
        d.calculated?.["line_value:" + i] ??
          multiplyDecimals(l.quantity, l.unit_price),
      ]),
      ...Object.entries(d.calculated || {}).map(([k, v]) => [
        "Cálculo",
        k,
        "",
        "",
        v,
      ]),
      ["Neto", d.currency, "", "", d.amount],
    ];
    if (d.kind === "index")
      rows.push(
        ["Índice", d.index_series, d.index_period, "", d.index_value],
        ["Fuente", d.index_source, "", "", ""],
      );
    if (d.kind === "adjustment")
      rows.push(
        ["Base", d.base_period, "", "", ""],
        ["Período ajustado", d.target_period, "", "", ""],
        ...d.adjustment_weights.map((w) => [
          "Ponderador",
          w.series,
          "",
          "",
          w.weight,
        ]),
      );
    if (d.kind === "daily")
      rows.push(
        ["Cuadrilla", d.crew, "", "", ""],
        ["Incidencias", d.incidents, "", "", ""],
        ...d.lines.map((l) => [
          "Horas",
          l.description,
          l.hours,
          l.unit_price,
          multiplyDecimals(l.hours, l.unit_price),
        ]),
      );
  } else if (scope === "portfolio") {
    title = "Cartera de obras";
    headers = summaryHeaders;
    rows = model.portfolio.flatMap(summaryRows);
  } else if (scope === "summary") {
    headers = summaryHeaders;
    rows = r ? summaryRows(r) : [];
  } else if (scope === "production") {
    title = "Producción y rendimientos";
    headers = [
      "Rubro",
      "Partida",
      "Previsto",
      "Ejecutado",
      "Avance %",
      "Horas",
      "Horas/unidad previstas",
      "Horas/unidad reales",
      "Desvío %",
    ];
    rows = (r?.production || []).map((p) => [
      p.section,
      p.description,
      p.planned_quantity,
      p.executed_quantity,
      p.percent,
      p.hours,
      p.planned_hours_per_unit ?? "",
      p.actual_hours_per_unit ?? "",
      p.productivity_variance ?? "",
    ]);
  } else if (scope === "cash") {
    title = "Flujo de fondos";
    headers = [
      "Mes",
      "Moneda",
      "Ingresos previstos",
      "Egresos previstos",
      "Cobros",
      "Pagos",
    ];
    rows = (r?.cash_flow || []).map((p) => [
      p.month,
      p.currency,
      p.planned_in,
      p.planned_out,
      p.actual_in,
      p.actual_out,
    ]);
  } else if (scope === "needs") {
    title = "Necesidades de materiales";
    headers = [
      "Insumo",
      "Necesario",
      "Solicitado",
      "Ordenado",
      "Recibido",
      "Consumido",
      "Stock",
      "Faltante",
    ];
    rows = (r?.needs || []).map((n) => [
      n.description,
      n.required,
      n.requested,
      n.ordered,
      n.received,
      n.consumed,
      n.stock,
      n.shortage,
    ]);
  } else if (scope === "stock") {
    title = "Existencias";
    headers = ["Depósito", "Insumo", "Moneda", "Cantidad", "Valor"];
    rows = model.stock
      .filter((b) =>
        model.warehouses.some(
          (w) => w.id === b.warehouse_id && w.project_id === model.projectId,
        ),
      )
      .map((b) => [
        whName(b.warehouse_id),
        state.resources.find((x) => x.id === b.resource_id)?.description ||
          b.resource_id,
        b.currency,
        b.quantity,
        b.value,
      ]);
  } else if (scope === "costs") {
    title = "Resultados por centro y partida";
    headers = [
      "Partida",
      "Centro",
      "Moneda",
      "Costo real",
      "Venta certificada",
      "Resultado",
    ];
    rows = (r?.costs || []).map((c) => [
      c.line_description ||
        model.lines.find((l) => l.id === c.line_id)?.description ||
        "Sin partida",
      model.centers.find((x) => x.id === c.center_id)?.name || "Sin centro",
      c.currency,
      c.actual,
      c.certified_income,
      c.result,
    ]);
  } else if (scope === "sections") {
    title = "Resultados por rubro";
    headers = [
      "Rubro",
      "Moneda",
      "Costo previsto",
      "Costo real",
      "Desvío",
      "Venta certificada",
      "Resultado",
    ];
    rows = (r?.section_results || []).map((s) => [
      s.section,
      s.currency,
      s.budget_cost,
      s.actual_cost,
      s.variance,
      s.certified_income,
      s.result,
    ]);
  } else if (scope === "documents") {
    title = "Historial de documentos";
    headers = [
      "ID",
      "Fecha",
      "Tipo",
      "Número",
      "Contraparte",
      "Moneda",
      "Importe",
      "Origen",
    ];
    rows = model.docs.map((d) => [
      d.id,
      d.date,
      operationNames[d.kind],
      d.number,
      partnerName(d.partner_id),
      d.currency,
      d.amount,
      d.reference_id || "",
    ]);
  }
  let bytes;
  if (format === "xlsx") {
    const { default: writeExcelFile } = await import(
      "write-excel-file/universal"
    );
    const data = [
      headers.map((value) => ({ value, fontWeight: "bold" })),
      ...rows.map((row) =>
        row.map((v) => ({ value: String(v ?? ""), type: String })),
      ),
    ];
    const blob = await writeExcelFile(data, {
      sheet: "Informe",
      columns: headers.map(() => ({ width: 25 })),
    }).toBlob();
    bytes = new Uint8Array(await blob.arrayBuffer());
  } else {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "landscape" }),
      width = pdf.internal.pageSize.getWidth(),
      height = pdf.internal.pageSize.getHeight();
    let y = 16;
    const pageTitle = () => {
      pdf.setFontSize(13);
      pdf.text(title, 12, 14);
      pdf.setFontSize(8);
      pdf.text(`Corte: ${model.asOf} · Importes separados por moneda`, 12, 20);
      y = 28;
    };
    pageTitle();
    const columnWidth = (width - 24) / Math.max(1, headers.length);
    const print = (row) => {
      const lines = row.map((value) =>
        pdf.splitTextToSize(String(value ?? ""), columnWidth - 3),
      );
      const h = Math.max(...lines.map((x) => x.length), 1) * 4 + 3;
      if (y + h > height - 12) {
        pdf.addPage();
        pageTitle();
      }
      lines.forEach((text, i) => pdf.text(text, 12 + i * columnWidth, y));
      y += h;
    };
    print(headers);
    rows.forEach(print);
    bytes = new Uint8Array(pdf.output("arraybuffer"));
  }
  const name = `${scope}-${model.detail && scope === "document" ? model.detail.id : model.projectId || "cartera"}-${model.asOf}.${format}`;
  return invoke("write_export", { name, bytes: [...bytes] });
}
