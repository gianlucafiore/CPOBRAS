import {
  money,
  numeric,
  multiplyDecimals,
  sumDecimals,
  percentageOf,
} from "../decimal.js";
const safe = (s) =>
  String(s)
    .replace(/[^\p{L}\p{N} ._-]/gu, " ")
    .trim()
    .slice(0, 160) || "Documento";
export const requestHeaders = [
  "ID de renglón",
  "Código",
  "Descripción",
  "Unidad",
  "Cantidad",
  "Precio unitario sin IVA",
  "Observaciones",
];
export function requestRows(r) {
  return [
    requestHeaders,
    ...r.items.map((i) => [
      i.id,
      i.code,
      i.description,
      i.unit,
      i.quantity,
      "",
      "",
    ]),
  ];
}
export function parseQuotedRows(rows) {
  const header = rows.findIndex((r) => r?.[0] === requestHeaders[0]);
  if (header < 0)
    throw new Error(
      "No se encontró la columna ID de renglón. Usá la planilla original.",
    );
  const seen = new Set();
  return rows
    .slice(header + 1)
    .filter((r) => r?.[0])
    .map((r) => {
      const row_id = String(r[0]).trim();
      if (seen.has(row_id)) throw new Error("Hay renglones repetidos");
      seen.add(row_id);
      let value = r[5];
      if (value === null || value === undefined || String(value).trim() === "")
        value = null;
      else {
        value = String(value).trim();
        if (!/^\d+(\.\d+)?$/.test(value))
          throw new Error(
            "Precio inválido: usá números positivos y punto decimal, sin separador de miles",
          );
      }
      return { row_id, unit_price: value, notes: String(r[6] ?? "") };
    });
}
export async function readQuotedFile(file) {
  const { parseExcel } = await import("./exchange.js");
  return parseQuotedRows(await parseExcel(await file.arrayBuffer()));
}
async function save(invoke, name, bytes, pdf = false) {
  const result = await invoke("save_export_file", {
    name: safe(name) + (pdf ? ".pdf" : ".xlsx"),
    bytes: [...bytes],
    openAfter: pdf,
  });
  if (!result) return "";
  return result.path + (result.open_error ? " · " + result.open_error : "");
}
async function pdfTable(
  title,
  profile,
  subtitle,
  headers,
  rows,
  footer,
  landscape = false,
) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    orientation: landscape ? "landscape" : "portrait",
    unit: "mm",
    format: landscape ? "a3" : "a4",
  });
  const width = pdf.internal.pageSize.getWidth(),
    height = pdf.internal.pageSize.getHeight(),
    margin = 12;
  let y = 12;
  function heading() {
    pdf.setFontSize(14);
    pdf.setTextColor(24, 49, 69);
    pdf.text(
      String(
        profile.trade_name ||
          profile.company_name ||
          profile.professional_name ||
          "CPOBRAS",
      ),
      margin,
      y + 5,
    );
    if (profile.logo_png?.length) {
      const bytes = new Uint8Array(profile.logo_png),
        p = pdf.getImageProperties(bytes);
      pdf.addImage(bytes, "PNG", width - 32, y, 20, (20 * p.height) / p.width);
    }
    y += 12;
    pdf.setFontSize(8);
    for (const line of [
      profile.professional_name,
      profile.qualification,
      profile.tax_id ? "CUIT: " + profile.tax_id : "",
      profile.address,
      [profile.phone, profile.email, profile.website]
        .filter(Boolean)
        .join(" · "),
    ].filter(Boolean)) {
      for (const part of pdf.splitTextToSize(
        String(line),
        width - 2 * margin,
      )) {
        pdf.text(part, margin, y);
        y += 4;
      }
    }
    pdf.setFontSize(11);
    pdf.text(title, margin, y);
    y += 7;
    pdf.setFontSize(8);
    for (const line of subtitle) {
      pdf.text(
        pdf.splitTextToSize(String(line), width - 2 * margin),
        margin,
        y,
      );
      y += 5;
    }
    y += 2;
  }
  function page() {
    pdf.addPage();
    y = 12;
    heading();
  }
  heading();
  const sizes = headers.map((h, i) => (i === 1 ? 2.8 : 1)),
    total = sizes.reduce((a, b) => a + b, 0),
    cols = sizes.map((v) => ((width - 2 * margin) * v) / total);
  function row(cells, bold = false) {
    pdf.setFontSize(landscape ? 7 : 8);
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    const texts = cells.map((c, i) =>
        pdf.splitTextToSize(String(c ?? ""), cols[i] - 3),
      ),
      h = Math.max(6, ...texts.map((t) => t.length * 3.5 + 3));
    if (y + h > height - 14) {
      page();
      drawHeaders();
    }
    let x = margin;
    cells.forEach((c, i) => {
      pdf.setDrawColor(211, 221, 230);
      pdf.rect(x, y, cols[i], h);
      pdf.text(texts[i], x + 1.5, y + 4);
      x += cols[i];
    });
    y += h;
  }
  function drawHeaders() {
    row(headers, true);
  }
  drawHeaders();
  rows.forEach((r) => row(r));
  y += 5;
  for (const line of [...footer, profile.footer || ""]) {
    if (y + 8 > height - 14) page();
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    for (const part of pdf.splitTextToSize(String(line), width - 2 * margin)) {
      pdf.text(part, margin, y);
      y += 5;
    }
  }
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setFontSize(8);
    pdf.text(`${p} / ${pages}`, width - 25, height - 6);
  }
  return new Uint8Array(pdf.output("arraybuffer"));
}
export async function exportRequest(invoke, r, format, filename = r.title) {
  if (format === "xlsx") {
    const { default: write } = await import("write-excel-file/universal");
    const rows = requestRows(r).map((row, n) =>
      row.map((value, i) => ({
        value: n && i === 4 ? Number(value) : value,
        type: n && i === 4 ? Number : String,
        ...(!n ? { fontWeight: "bold" } : {}),
      })),
    );
    const blob = await write([
      {
        sheet: "Cotización",
        data: rows,
        columns: [
          { width: 38 },
          { width: 14 },
          { width: 55 },
          { width: 12 },
          { width: 14 },
          { width: 20 },
          { width: 40 },
        ],
      },
    ]).toBlob();
    return save(invoke, filename, new Uint8Array(await blob.arrayBuffer()));
  }
  const bytes = await pdfTable(
    `Pedido de cotización ${r.number} · ${r.title}`,
    r.profile,
    [
      `Obra: ${r.project_name} · Fecha: ${r.date} · Moneda: ${r.currency}`,
      `Alcance: ${r.scope}`,
    ],
    ["Código", "Descripción", "Unidad", "Cantidad", "Precio unitario"],
    r.items.map((i) => [
      i.code,
      i.description,
      i.unit,
      numeric(i.quantity),
      "",
    ]),
    [
      `Entrega: ${r.delivery}`,
      `Pago: ${r.payment}`,
      `Validez: ${r.validity} · Impuestos: ${r.taxes}`,
      "Completar precios y condiciones. Esta solicitud no es una orden de compra.",
    ],
  );
  return save(invoke, filename, bytes, true);
}
export async function exportCertificate(invoke, s) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const o = s.operation,
    c = o.calculated || {},
    a = o.index_snapshot,
    profile = s.profile || {};
  const width = 297,
    height = 210,
    margin = 12,
    usable = 273;
  const navy = [38, 67, 88],
    blue = [231, 240, 247],
    gray = [244, 247, 250],
    ink = [39, 56, 70];
  const date = (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value || "")
      ? value.split("-").reverse().join("/")
      : value || "—";
  const title = s.preliminary
    ? "PRELIMINAR - Para aprobación"
    : `${o.kind === "subcertificate" ? "Certificado de subcontratista" : "Certificado"} #${o.number}`;
  let y = 12,
    band = 0;
  function text(
    value,
    x,
    top,
    size = 8,
    bold = false,
    color = ink,
    options = {},
  ) {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    pdf.text(
      Array.isArray(value) ? value : String(value ?? ""),
      x,
      top,
      options,
    );
  }
  function heading() {
    pdf.setFillColor(...navy);
    pdf.rect(0, 0, width, 4, "F");
    text(
      profile.trade_name ||
        profile.company_name ||
        profile.professional_name ||
        "CPOBRAS",
      margin,
      14,
      14,
      true,
      navy,
    );
    if (profile.logo_png?.length) {
      try {
        pdf.addImage(
          new Uint8Array(profile.logo_png),
          "PNG",
          width - margin - 18,
          7,
          18,
          15,
        );
      } catch {}
    }
    text(title, margin, 22, 11, true, s.preliminary ? [155, 100, 30] : navy);
    text(
      `Obra: ${s.project_name} | Presupuesto: ${s.budget_title}`,
      margin,
      28,
      8,
    );
    text(
      `${o.kind === "subcertificate" ? "Contraparte" : "Comitente"}: ${s.client_name} | Período: ${date(o.period_start)} al ${date(o.period_end)} | ${s.preliminary ? "Preparación" : "Emisión"}: ${date(o.date)}`,
      margin,
      33,
      8,
    );
    const identity = [
      profile.tax_id ? "CUIT " + profile.tax_id : "",
      profile.address,
      profile.email,
      profile.phone,
    ]
      .filter(Boolean)
      .join(" | ");
    if (identity) text(identity, margin, 38, 7);
    y = identity ? 43 : 39;
  }
  function page() {
    pdf.addPage();
    heading();
  }
  function space(h) {
    if (y + h > height - 14) page();
  }
  const cols = [14, 77, 9, 17, 25, 28, 17, 17, 17, 17, 35];
  const heads = [
    "Ítem",
    "Partida / descripción",
    "Und.",
    "Cantidad contrato",
    "Precio unitario base",
    "Total contrato base",
    "Anterior %",
    "Período %",
    "Acumulado %",
    "Restante %",
    "Importe período base",
  ];
  function row(values, header = false) {
    pdf.setFont("helvetica", header ? "bold" : "normal");
    pdf.setFontSize(header ? 6.8 : 7);
    const lines = values.map((v, i) =>
      pdf.splitTextToSize(String(v ?? ""), cols[i] - 3),
    );
    const h = Math.max(
      header ? 10 : 5.2,
      ...lines.map((l) => l.length * 3 + 1.8),
    );
    if (y + h > height - 14) {
      page();
      row(heads, true);
    }
    if (header || band++ % 2 === 0) {
      pdf.setFillColor(...(header ? navy : gray));
      pdf.rect(margin, y, usable, h, "F");
    }
    let x = margin;
    for (let i = 0; i < values.length; i++) {
      pdf.setDrawColor(214, 225, 233);
      pdf.setLineWidth(0.15);
      pdf.rect(x, y, cols[i], h);
      text(
        lines[i],
        i > 2 && !header ? x + cols[i] - 1.5 : x + 1.5,
        y + 3.6,
        header ? 6.8 : 7,
        header,
        header ? [255, 255, 255] : ink,
        i > 2 && !header ? { align: "right" } : {},
      );
      x += cols[i];
    }
    y += h;
  }
  heading();
  row(heads, true);
  let section = null;
  for (const r of s.rows) {
    if (r.section && r.section !== section) {
      space(16);
      pdf.setFillColor(...blue);
      pdf.rect(margin, y, usable, 6, "F");
      text(r.section, margin + 2, y + 4.2, 8, true, navy);
      y += 6;
      section = r.section;
    }
    row([
      r.item,
      r.description,
      r.unit,
      numeric(r.quantity),
      money(r.unit_price),
      money(r.contract_total || multiplyDecimals(r.quantity, r.unit_price)),
      numeric(r.previous_percent),
      numeric(r.current_percent),
      numeric(r.accumulated_percent),
      numeric(r.remaining_percent),
      money(r.period_amount),
    ]);
  }
  y += 5;
  const extraBase = sumDecimals((o.extras || []).map((x) => x.amount || "0")),
    base = c.base_work || "0";
  const liquidation = [
    ["Total contratado a valores base", s.total_base],
    [
      "Ejecutado anterior a valores base",
      sumDecimals(
        s.rows.map((r) =>
          multiplyDecimals(
            r.previous || percentageOf(r.quantity, r.previous_percent || "0"),
            r.unit_price,
          ),
        ),
      ),
    ],
    ["Trabajo del período a valores base", base],
    ["Adicionales a valores base / fijos", extraBase],
    ["Subtotal base a certificar", sumDecimals([base, extraBase])],
  ];
  const advance = [
    `Recuperación de anticipo (${numeric(o.advance_percent ?? c.recovery_percent ?? "0")} %)`,
    multiplyDecimals(o.advance || "0", "-1"),
  ];
  if (o.advance_before_index) liquidation.push(advance);
  liquidation.push(
    ["Ajuste del período", c.index_adjustment || "0"],
    [
      o.advance_before_index
        ? "Subtotal ajustado, neto de anticipo"
        : "Total con ajuste",
      sumDecimals([
        base,
        extraBase,
        c.index_adjustment || "0",
        o.advance_before_index ? multiplyDecimals(o.advance || "0", "-1") : "0",
      ]),
    ],
    ["Diferencias de certificados anteriores", c.adjustment_difference || "0"],
  );
  if (!o.advance_before_index) liquidation.push(advance);
  liquidation.push(
    ["Otros descuentos", multiplyDecimals(o.discount || "0", "-1")],
    [
      `Fondo de reparo (${numeric(o.retention_percent || "0")} %)`,
      multiplyDecimals(c.retention || "0", "-1"),
    ],
  );
  space(Math.min(105, liquidation.length * 5.8 + 15));
  const startY = y;
  const showAdjustment = Boolean(a) || o.kind !== "subcertificate";
  if (showAdjustment) {
    text("AJUSTE CONTRACTUAL", margin, y + 4, 8, true, navy);
    y += 9;
  }
  if (a) {
    text(
      `Período aplicado: ${a.applied_month} | Objetivo: ${a.target_month}`,
      margin,
      y,
      7,
    );
    y += 5;
    text(
      `${a.provisional ? "PROVISORIO - diferencia pendiente" : "Definitivo"} | Coeficiente: ${numeric(a.factor)}`,
      margin,
      y,
      7,
      true,
    );
    y += 6;
    for (const i of a.indices) {
      space(17);
      text(
        `${i.series} | Peso ${numeric(multiplyDecimals(i.weight, "100"))} %`,
        margin,
        y,
        7,
        true,
      );
      y += 4;
      text(
        `Puntaje base (${i.base.period || a.agreement.base_month}): ${numeric(i.base.value)}`,
        margin,
        y,
        7,
      );
      y += 4;
      text(
        `Puntaje actual (${i.current.period || a.applied_month}): ${numeric(i.current.value)}`,
        margin,
        y,
        7,
      );
      y += 6;
    }
  } else if (showAdjustment) {
    text("Sin ajuste de índices pactado.", margin, y, 7);
    y += 6;
  }
  text(
    `Avance acumulado de obra: ${numeric(s.physical_percent)} %`,
    margin,
    y,
    8,
    true,
  );
  y += 6;
  for (const x of o.extras || []) {
    space(12);
    const lines = pdf.splitTextToSize(
      `Adicional: ${x.description}${x.reason ? " | " + x.reason : ""}${x.authorization ? " | Autorización: " + x.authorization : ""} | ${money(x.amount)}`,
      140,
    );
    text(lines, margin, y, 7);
    y += lines.length * 3.2 + 3;
  }
  const leftEnd = y;
  y = startY;
  for (const [label, amount] of liquidation) {
    const x = 162,
      w = 123;
    pdf.setFillColor(...gray);
    pdf.rect(x, y, w, 6, "F");
    text(label, x + 2, y + 4, 7);
    text(money(amount), x + w - 2, y + 4, 8, true, ink, { align: "right" });
    y += 6;
  }
  pdf.setFillColor(...navy);
  pdf.rect(162, y, 123, 10, "F");
  text(
    o.kind === "subcertificate" ? "NETO A PAGAR" : "NETO A COBRAR",
    164,
    y + 6.3,
    9,
    true,
    [255, 255, 255],
  );
  text(
    `${o.currency} ${money(o.amount)}`,
    283,
    y + 6.3,
    11,
    true,
    [255, 255, 255],
    { align: "right" },
  );
  y += 15;
  text(
    `Fecha prevista de ${o.kind === "subcertificate" ? "pago" : "cobro"}: ${date(o.due_date)}`,
    164,
    y,
    7,
  );
  y = Math.max(y + 6, leftEnd);
  space(14);
  text(
    s.preliminary
      ? "PRELIMINAR. No emitido. Sujeto a aprobación; no registra avance oficial."
      : `Emitido el ${date(o.date)}. Su emisión no acredita el ${o.kind === "subcertificate" ? "pago" : "cobro"}.`,
    margin,
    y,
    7,
    true,
  );
  y += 5;
  if (o.notes) {
    const lines = pdf.splitTextToSize(o.notes, usable);
    for (const line of lines) {
      space(5);
      text(line, margin, y, 7);
      y += 4;
    }
  }
  const pages = pdf.getNumberOfPages();
  for (let n = 1; n <= pages; n++) {
    pdf.setPage(n);
    text(`${s.project_name} | ${title}`, margin, height - 6, 6.5);
    text(`${n} / ${pages}`, width - margin, height - 6, 7, false, ink, {
      align: "right",
    });
  }
  return save(
    invoke,
    `${s.preliminary ? "Preliminar" : "Certificado"} ${o.number || s.project_name} ${o.period_end}`,
    new Uint8Array(pdf.output("arraybuffer")),
    true,
  );
}
