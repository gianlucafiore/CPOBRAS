import { money, numeric, multiplyDecimals } from "../decimal.js";
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
  "Precio unitario",
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
  const path = await invoke("write_export", {
    name: safe(name) + (pdf ? ".pdf" : ".xlsx"),
    bytes: [...bytes],
  });
  if (pdf) await invoke("open_export_pdf", { path });
  return path;
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
  const o = s.operation,
    c = o.calculated || {},
    a = o.index_snapshot;
  const title = s.preliminary
    ? "PRELIMINAR · Para aprobación"
    : `${o.kind === "subcertificate" ? "Certificado de subcontratista" : "Certificado"} ${o.number}`;
  const footer = [
    `Total contratado a valores base: ${money(s.total_base)} · Avance acumulado: ${numeric(s.physical_percent)} %`,
    `Trabajo del período a valores base: ${money(c.base_work || "0")}`,
  ];
  if (Number(o.advance) > 0)
    footer.push(
      `Recuperación de anticipo ${numeric(o.advance_percent ?? c.recovery_percent ?? "0")} % (${o.advance_before_index ? "antes" : "después"} del ajuste): -${money(o.advance)}`,
    );
  if (a) {
    footer.push(
      `Ajuste: base ${a.agreement.base_month} · Actual ${a.applied_month} · Objetivo ${a.target_month} · ${a.provisional ? "PROVISORIO (diferencia pendiente)" : "Definitivo"}`,
    );
    for (const i of a.indices)
      footer.push(
        `${i.series} · Peso ${numeric(multiplyDecimals(i.weight, "100"))} % · Puntaje base ${numeric(i.base.value)} · Actual ${numeric(i.current.value)} · Cociente ${Number(i.current.value) / Number(i.base.value)}`,
      );
    footer.push(
      `Coeficiente ponderado: ${numeric(a.factor)} · Ajuste monetario: ${money(c.index_adjustment || "0")}`,
    );
  }
  for (const x of o.extras || [])
    footer.push(
      `Adicional: ${x.description} · ${x.reason} · Autorización: ${x.authorization} · ${money(x.amount)} ${x.adjustable ? "a valores base (ajustable)" : "fijo"}`,
    );
  for (const x of o.reconciliations || [])
    footer.push(
      `Diferencia de certificado anterior ${x.source_number || x.source_id}: ${money(x.delta)}`,
    );
  if (Number(o.discount) > 0) footer.push(`Descuento: -${money(o.discount)}`);
  if (Number(o.retention_percent) > 0)
    footer.push(
      `Fondo de reparo ${numeric(o.retention_percent)} %: -${money(c.retention || "0")}`,
    );
  footer.push(
    `NETO A COBRAR ${o.currency} ${money(o.amount)} · Vencimiento: ${o.due_date}`,
    s.preliminary
      ? "PRELIMINAR. No emitido. Sujeto a aprobación; no registra avance oficial."
      : `Emitido el ${o.date}. Su emisión no acredita el cobro.`,
    o.notes || "",
  );
  const bytes = await pdfTable(
    title,
    s.profile,
    [
      `Obra: ${s.project_name} · ${s.budget_title}`,
      `Comitente: ${s.client_name} · Período: ${o.period_start} a ${o.period_end} · ${s.preliminary ? "Preparado" : "Emisión"}: ${o.date}`,
    ],
    [
      "Ítem",
      "Rubro / Partida",
      "Und.",
      "Cant. contrato",
      "Precio base",
      "Anterior %",
      "Período %",
      "Acumulado %",
      "Restante %",
      "Monto período",
    ],
    s.rows.map((r) => [
      r.item,
      `${r.section ? r.section + " / " : ""}${r.description}`,
      r.unit,
      numeric(r.quantity),
      money(r.unit_price),
      numeric(r.previous_percent),
      numeric(r.current_percent),
      numeric(r.accumulated_percent),
      numeric(r.remaining_percent),
      money(r.period_amount),
    ]),
    footer,
    true,
  );
  return save(
    invoke,
    `${s.preliminary ? "Preliminar" : "Certificado"} ${o.number || s.project_name} ${o.period_end}`,
    bytes,
    true,
  );
}
