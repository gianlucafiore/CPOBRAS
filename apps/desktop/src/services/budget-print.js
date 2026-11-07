import { money, numeric, sumDecimals } from "../decimal.js";
export const reportNames = {
  client: "Presupuesto para cliente",
  internal: "Presupuesto interno",
  incidences: "Incidencias porcentuales",
};
export function printRows(data, mode = "client") {
  if (!reportNames[mode]) throw new Error("Presentación desconocida");
  const doc = data.document,
    values = new Map(data.lines.map((l) => [l.id, l])),
    assign = new Map(doc.assignments),
    sections = new Map(doc.sections.map((s) => [s.id, s])),
    positions = new Map(doc.lines.map((l, i) => [l.id, i + 1]));
  const children = (parent) =>
    doc.sections
      .filter((s) => (s.parent_id || null) === parent)
      .sort((a, b) => a.position - b.position);
  const rows = [],
    visited = new Set();
  const descendants = (id) => {
    const ids = new Set([id]),
      pending = [id];
    while (pending.length) {
      for (const s of children(pending.pop())) {
        if (ids.has(s.id)) throw new Error("Rubros circulares");
        ids.add(s.id);
        pending.push(s.id);
      }
    }
    return ids;
  };
  const summary = (lines) => ({
    direct: sumDecimals(
      lines.map((l) => values.get(l.id)?.direct_total || "0"),
    ),
    sale: sumDecimals(lines.map((l) => values.get(l.id)?.sale_total || "0")),
    incidence: sumDecimals(
      lines.map((l) => values.get(l.id)?.incidence_percent || "0"),
    ),
  });
  const leaf = (l) => {
    const v = values.get(l.id);
    if (!v) throw new Error("Partida sin cálculo de impresión");
    rows.push({
      kind: "line",
      code: String(positions.get(l.id)).padStart(2, "0"),
      description: l.description,
      unit: l.unit,
      quantity: l.quantity,
      cost_unit: l.unit_cost_snapshot,
      ...v,
    });
  };
  const walk = (s, depth = 0) => {
    if (visited.has(s.id) || depth > 100)
      throw new Error("Jerarquía de rubros inválida");
    visited.add(s.id);
    const ids = descendants(s.id);
    rows.push({
      kind: "section",
      code: s.code,
      description: s.title,
      ...summary(doc.lines.filter((l) => ids.has(assign.get(l.id)))),
    });
    doc.lines.filter((l) => assign.get(l.id) === s.id).forEach(leaf);
    children(s.id).forEach((child) => walk(child, depth + 1));
  };
  children(null).forEach((s) => walk(s));
  if (visited.size !== sections.size) throw new Error("Rubros sin raíz");
  const loose = doc.lines.filter(
    (l) => !assign.has(l.id) || !sections.has(assign.get(l.id)),
  );
  if (loose.length && doc.sections.length)
    rows.push({
      kind: "section",
      code: "—",
      description: "Partidas sin rubro",
      ...summary(loose),
    });
  loose.forEach(leaf);
  if (
    data.unallocated_total !== "0" &&
    !/^0(?:\.0+)?$/.test(data.unallocated_total)
  )
    rows.push({
      kind: "unallocated",
      code: "—",
      description:
        "Importe sin distribución entre partidas (costo directo cero)",
      sale_total: data.unallocated_total,
      incidence_percent: "100",
      cumulative_percent: "100",
    });
  return rows;
}
export function printColumns(mode) {
  return mode === "internal"
    ? [
        "Ítem",
        "Descripción",
        "Un.",
        "Cantidad",
        "Costo unitario",
        "Costo directo",
        "Importe final",
      ]
    : mode === "incidences"
      ? ["Ítem", "Descripción", "Importe final", "Incidencia %", "Acumulado %"]
      : [
          "Ítem",
          "Descripción",
          "Un.",
          "Cantidad",
          "P. unit. final",
          "Importe final",
        ];
}
export function printCells(row, mode, { formatted = false } = {}) {
  const amount = (v) => (formatted ? money(v) : String(v ?? "")),
    number = (v) => (formatted ? numeric(v) : String(v ?? ""));
  if (row.kind === "section")
    return mode === "internal"
      ? [
          row.code,
          row.description,
          "",
          "",
          "",
          amount(row.direct),
          amount(row.sale),
        ]
      : mode === "incidences"
        ? [
            row.code,
            row.description,
            amount(row.sale),
            number(row.incidence),
            "",
          ]
        : [row.code, row.description, "", "", "", amount(row.sale)];
  return mode === "internal"
    ? [
        row.code,
        row.description,
        row.unit || "",
        number(row.quantity),
        amount(row.cost_unit),
        amount(row.direct_total),
        amount(row.sale_total),
      ]
    : mode === "incidences"
      ? [
          row.code,
          row.description,
          amount(row.sale_total),
          number(row.incidence_percent),
          number(row.cumulative_percent),
        ]
      : [
          row.code,
          row.description,
          row.unit || "",
          number(row.quantity),
          number(row.sale_unit),
          amount(row.sale_total),
        ];
}
export async function budgetReportPdf(
  data,
  {
    mode = "client",
    title = data.document.title,
    date = "",
    reference = "",
    notes = "",
    landscape = false,
  } = {},
) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    orientation: landscape ? "landscape" : "portrait",
    compress: false,
  });
  const width = pdf.internal.pageSize.getWidth(),
    bottom = pdf.internal.pageSize.getHeight() - 19,
    left = 14,
    usable = width - 28,
    p = data.profile || {},
    currency =
      data.estimate.currency === "Usd" || data.estimate.currency === "USD"
        ? "USD"
        : "ARS";
  let y = 36,
    inTable = false;
  const brand =
      p.trade_name || p.company_name || p.professional_name || "CPOBRAS",
    label = reportNames[mode];
  if (!label) throw new Error("Presentación desconocida");
  const heading = () => {
    pdf.setFillColor(32, 53, 73);
    pdf.rect(0, 0, width, 27, "F");
    pdf.setFillColor(255, 137, 39);
    pdf.rect(0, 27, width, 1.3, "F");
    let x = left;
    if (p.logo_png?.length) {
      const info = pdf.getImageProperties(new Uint8Array(p.logo_png)),
        ratio = Math.min(29 / info.width, 18 / info.height);
      pdf.setFillColor(255, 255, 255);
      pdf.rect(left, 4, 31, 20, "F");
      pdf.addImage(
        new Uint8Array(p.logo_png),
        "PNG",
        left + 1,
        5,
        info.width * ratio,
        info.height * ratio,
      );
      x += 36;
    }
    pdf.setTextColor(255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    const lines = pdf.splitTextToSize(brand, usable - (x - left));
    pdf.text(lines.slice(0, 2), x, 10);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.text(
      label + (data.estimate.issued ? " · EMITIDO" : " · BORRADOR"),
      x,
      23,
    );
    pdf.setTextColor(38, 58, 76);
    y = 36;
  };
  const nextPage = () => {
    pdf.addPage();
    heading();
    if (inTable) tableHeader();
  };
  const text = (
    value,
    { bold = false, size = 9, color = [38, 58, 76], gap = 2 } = {},
  ) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    const lines = pdf.splitTextToSize(String(value ?? ""), usable);
    for (const line of lines) {
      if (y + 5 > bottom) {
        nextPage();
        pdf.setFont("helvetica", bold ? "bold" : "normal");
        pdf.setFontSize(size);
        pdf.setTextColor(...color);
      }
      pdf.text(line, left, y);
      y += size * 0.43 + 1;
    }
    y += gap;
  };
  const proportions =
    mode === "internal"
      ? [0.1, 0.24, 0.05, 0.09, 0.16, 0.17, 0.19]
      : mode === "incidences"
        ? [0.1, 0.37, 0.19, 0.17, 0.17]
        : [0.1, 0.36, 0.06, 0.12, 0.18, 0.18];
  const widths = proportions.map((v) => v * usable),
    headers = printColumns(mode);
  function tableHeader() {
    pdf.setFillColor(58, 83, 105);
    pdf.rect(left, y - 4, usable, 10, "F");
    pdf.setFontSize(7);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(255);
    let x = left;
    headers.forEach((h, i) => {
      pdf.text(pdf.splitTextToSize(h, widths[i] - 4), x + 2, y);
      x += widths[i];
    });
    y += 9;
    pdf.setTextColor(38, 58, 76);
  }
  function tableRow(row, index) {
    const cells = printCells(row, mode, { formatted: true });
    pdf.setFontSize(8);
    pdf.setFont("helvetica", row.kind === "section" ? "bold" : "normal");
    const parts = cells.map((c, i) =>
      pdf.splitTextToSize(String(c ?? ""), widths[i] - 4),
    );
    let offset = 0,
      total = Math.max(...parts.map((p) => p.length), 1);
    while (offset < total) {
      if (y + 9 > bottom) nextPage();
      const capacity = Math.max(1, Math.floor((bottom - y - 4) / 4)),
        count = Math.min(total - offset, capacity),
        h = count * 4 + 4;
      pdf.setFillColor(
        ...(row.kind === "section"
          ? [226, 234, 241]
          : index % 2
            ? [247, 249, 251]
            : [255, 255, 255]),
      );
      pdf.rect(left, y - 3, usable, h, "F");
      pdf.setDrawColor(222, 230, 237);
      pdf.line(left, y + h - 3, left + usable, y + h - 3);
      pdf.setTextColor(38, 58, 76);
      pdf.setFontSize(8);
      pdf.setFont("helvetica", row.kind === "section" ? "bold" : "normal");
      let x = left;
      parts.forEach((lines, i) => {
        const chunk = lines.slice(offset, offset + count);
        if (i >= 2)
          pdf.text(chunk, x + widths[i] - 2, y + 1, { align: "right" });
        else pdf.text(chunk, x + 2, y + 1);
        x += widths[i];
      });
      y += h;
      offset += count;
      if (offset < total) nextPage();
    }
  }
  heading();
  text(title, { bold: true, size: 15 });
  const identity = [
    p.company_name ? "Razón social: " + p.company_name : "",
    p.trade_name ? "Nombre comercial: " + p.trade_name : "",
    p.professional_name ? "Profesional: " + p.professional_name : "",
    p.qualification,
    p.tax_id ? "CUIT / identificación: " + p.tax_id : "",
    p.address,
    [p.phone, p.email, p.website].filter(Boolean).join(" · "),
  ].filter(Boolean);
  identity.forEach((line) => text(line, { size: 8, gap: 0 }));
  text("Obra: " + data.project.name, { bold: true });
  text(
    "Cliente: " +
      data.client.name +
      (data.client.cuit ? " · CUIT: " + data.client.cuit : ""),
  );
  text("Presupuesto: " + data.document.title + " · Moneda: " + currency);
  if (date || reference)
    text(
      [
        date ? "Fecha: " + date : "",
        reference ? "Referencia: " + reference : "",
      ]
        .filter(Boolean)
        .join(" · "),
    );
  if (mode === "internal")
    text("USO INTERNO · Costos y formación del precio", {
      bold: true,
      color: [167, 67, 29],
    });
  if (mode === "incidences")
    text(
      "Base de incidencia: total final del presupuesto. Los rubros son subtotales; no se suman nuevamente.",
    );
  if (y + 19 > bottom) nextPage();
  inTable = true;
  tableHeader();
  printRows(data, mode).forEach(tableRow);
  inTable = false;
  y += 6;
  if (mode === "internal") {
    text("Determinación de precio", { bold: true, size: 11 });
    text(
      "Costo directo: " +
        currency +
        " " +
        money(data.calculation.breakdown.direct),
    );
    for (const row of data.calculation.rows.filter((r) => r.enabled))
      text(row.label + ": " + currency + " " + money(row.amount), {
        bold: row.kind === "subtotal",
      });
  }
  if (y + 15 > bottom) nextPage();
  pdf.setFillColor(32, 53, 73);
  pdf.rect(left, y - 4, usable, 12, "F");
  pdf.setTextColor(255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text("TOTAL " + currency, left + 4, y + 4);
  pdf.text(money(data.final_total), left + usable - 4, y + 4, {
    align: "right",
  });
  y += 17;
  if (mode === "incidences")
    text(
      "Incidencia total: " +
        (String(data.final_total).match(/^0(?:\.0+)?$/) ? "0" : "100") +
        " %",
      { bold: true },
    );
  if (mode === "client")
    text(
      "Precios finales según el presupuesto. Los importes por partida incluyen los ajustes de redondeo.",
      { size: 8 },
    );
  if (notes) {
    text("Condiciones y observaciones", { bold: true });
    text(notes);
  }
  if (p.footer) {
    text("Información del emisor", { bold: true });
    text(p.footer, { size: 8 });
  }
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setDrawColor(211, 221, 231);
    pdf.line(left, bottom + 5, width - left, bottom + 5);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(86, 108, 127);
    pdf.text(
      label + " · " + String(data.estimate.id).slice(0, 8),
      left,
      bottom + 11,
    );
    pdf.text(`${i} / ${pages}`, width - left, bottom + 11, { align: "right" });
  }
  return new Uint8Array(pdf.output("arraybuffer"));
}
export async function budgetReportExcel(
  data,
  mode = "incidences",
  options = {},
) {
  const { default: writeExcelFile } = await import(
    "write-excel-file/universal"
  );
  const rows = [
    [reportNames[mode], options.title || data.document.title],
    [
      "Emisor",
      data.profile.trade_name ||
        data.profile.company_name ||
        data.profile.professional_name ||
        "CPOBRAS",
    ],
    ...[
      "company_name",
      "professional_name",
      "qualification",
      "tax_id",
      "address",
      "phone",
      "email",
      "website",
      "footer",
    ]
      .filter((k) => data.profile[k])
      .map((k) => [
        {
          company_name: "Razón social",
          professional_name: "Profesional",
          qualification: "Título / matrícula",
          tax_id: "CUIT",
          address: "Domicilio",
          phone: "Teléfono",
          email: "Correo",
          website: "Sitio web",
          footer: "Leyenda pública",
        }[k],
        data.profile[k],
      ]),
    ...[
      ["Fecha", options.date],
      ["Referencia", options.reference],
      ["Condiciones", options.notes],
    ].filter(([, v]) => v),
    ["Obra", data.project.name],
    ["Cliente", data.client.name],
    ["Moneda", ["Usd", "USD"].includes(data.estimate.currency) ? "USD" : "ARS"],
    printColumns(mode),
    ...printRows(data, mode).map((r) => printCells(r, mode)),
    ...(mode === "internal"
      ? [
          ["Determinación de precio", "Importe"],
          ["Costo directo", String(data.calculation.breakdown.direct)],
          ...data.calculation.rows
            .filter((r) => r.enabled)
            .map((r) => [r.label, String(r.amount)]),
        ]
      : []),
    mode === "incidences"
      ? [
          "",
          "TOTAL",
          String(data.final_total),
          /^0(?:\.0+)?$/.test(String(data.final_total)) ? "0" : "100",
          "",
        ]
      : [
          "TOTAL",
          ...Array(printColumns(mode).length - 2).fill(""),
          String(data.final_total),
        ],
  ];
  const blob = await writeExcelFile(
    rows.map((row) =>
      row.map((v) => ({ value: String(v ?? ""), type: String })),
    ),
    {
      sheet: "Presupuesto",
      columns: printColumns(mode).map((_, i) => ({ width: i === 1 ? 55 : 24 })),
    },
  ).toBlob();
  return new Uint8Array(await blob.arrayBuffer());
}
