export function priceExportRows({
  definition,
  calculation,
  currency,
  title,
  rowId = null,
}) {
  const rows = [
    ["Determinación de precio", title, "", "", ""],
    ["Moneda", currency, "", "", ""],
    ["Costo directo", "", "", "", calculation.breakdown.direct],
  ];
  for (const row of definition.rows.filter((r) => !rowId || r.id === rowId)) {
    const value = calculation.rows.find((r) => r.id === row.id);
    rows.push([
      row.label,
      row.enabled ? "Activo" : "Inactivo",
      row.kind,
      "Base " + (value?.base ?? "0"),
      value?.amount ?? "0",
    ]);
    if (row.kind === "detailed") {
      rows.push(
        ["Modo aplicado", row.detail_mode, "", "", ""],
        [
          "Descripción / unidad",
          "Participación %",
          "Cantidad",
          "Precio unitario",
          "Total del detalle",
        ],
      );
      const walk = (parent, prefix = "", depth = 0) => {
        if (depth > 100) return;
        for (const item of row.items.filter((i) => i.parent_id === parent)) {
          rows.push([
            prefix +
              item.description +
              (item.group ? "" : " (" + item.unit + ")"),
            item.group ? "" : item.participation_percent,
            item.group ? "" : item.quantity,
            item.group ? "" : item.unit_price,
            value?.item_totals[item.id] ?? "0",
          ]);
          if (item.periodic)
            rows.push([
              "Alquiler mensual",
              item.periodic.start,
              item.periodic.end,
              "Vence día " + item.periodic.payment_day,
              item.periodic.prorate
                ? "Meses incompletos prorrateados"
                : "Meses completos",
            ]);
          if (item.group) walk(item.id, prefix + "  ", depth + 1);
        }
      };
      walk(null);
      rows.push(
        ["Total del detalle", "", "", "", value?.detail_total ?? "0"],
        [
          "Referencia % CD",
          row.reference_percent,
          "",
          "",
          value?.reference_total ?? "0",
        ],
      );
    }
  }
  if (!rowId)
    rows.push([
      "PRESUPUESTO TOTAL",
      currency,
      "",
      "",
      calculation.breakdown.total,
    ]);
  return rows;
}
export async function exportPriceDetermination({
  invoke,
  definition,
  calculation,
  currency,
  title,
  format,
  rowId = null,
}) {
  const rows = priceExportRows({
    definition,
    calculation,
    currency,
    title,
    rowId,
  });
  let bytes;
  if (format === "xlsx") {
    const { default: writeExcelFile } = await import(
      "write-excel-file/universal"
    );
    const data = rows.map((row, index) =>
      row.map((value) => ({
        value: String(value ?? ""),
        type: String,
        fontWeight: index === 0 ? "bold" : undefined,
      })),
    );
    const blob = await writeExcelFile(data, {
      sheet: "Determinación de precio",
      columns: [48, 22, 20, 24, 28].map((width) => ({ width })),
    }).toBlob();
    bytes = new Uint8Array(await blob.arrayBuffer());
  } else if (format === "csv") {
    const safe = (value) =>
      /^\s*[=+@-]/.test(String(value)) ? "'" + value : String(value ?? "");
    bytes = new TextEncoder().encode(
      "\uFEFF" +
        rows
          .map((row) =>
            row
              .map((value) => '"' + safe(value).replaceAll('"', '""') + '"')
              .join(";"),
          )
          .join("\r\n"),
    );
  } else if (format === "json")
    bytes = new TextEncoder().encode(
      JSON.stringify(
        {
          format_version: 1,
          title,
          currency,
          definition: rowId
            ? { rows: definition.rows.filter((r) => r.id === rowId) }
            : definition,
          calculation,
        },
        null,
        2,
      ),
    );
  else {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "landscape" });
    const width = pdf.internal.pageSize.getWidth(),
      height = pdf.internal.pageSize.getHeight();
    let y = 25;
    const heading = () => {
      pdf.setFontSize(14);
      pdf.text("Determinación de precio", 12, 13);
      pdf.setFontSize(9);
      pdf.text(String(title) + " · " + currency, 12, 20);
      y = 29;
    };
    heading();
    const widths = [100, 37, 37, 45, width - 24 - 219];
    for (const row of rows) {
      const cells = row.map((v, i) =>
        pdf.splitTextToSize(String(v ?? ""), widths[i] - 3),
      );
      const h = Math.max(1, ...cells.map((c) => c.length)) * 4 + 3;
      if (y + h > height - 14) {
        pdf.addPage();
        heading();
      }
      let x = 12;
      cells.forEach((text, i) => {
        pdf.text(text, x, y);
        x += widths[i];
      });
      y += h;
    }
    bytes = new Uint8Array(pdf.output("arraybuffer"));
  }
  return invoke("write_export", {
    name: "determinacion-de-precio" + (rowId ? "-detalle" : "") + "." + format,
    bytes: [...bytes],
  });
}
