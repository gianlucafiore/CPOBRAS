import {estimateMonths,monthFactor} from "./price-duration.js";
import { budgetNumbering } from "./budget-numbering.js";
import {
  sumDecimals,
  multiplyDecimals,
  divideDecimals,
  compareDecimals,
} from "../decimal.js";
import {
  roundBudgetAmount,
  publicPriceSummary,
  clientPrintData,
  hasMemory,
  hasSchedule,
} from "./budget-public.js";
import { printRows, printColumns } from "./budget-print.js";
import { kindName } from "../components/helpers.js";

const cash = "#,##0.00",
  decimal = "#,##0.0000",
  percent = "0.00%";
const text = (v, style = {}) => ({
  value: String(v ?? ""),
  type: String,
  wrap: true,
  ...style,
});
const number = (v, format = cash, editable = false) => {
  const value = Number(v ?? 0);
  if (!Number.isFinite(value))
    throw new Error("Importe fuera del rango de Excel");
  return {
    value,
    type: Number,
    format,
    align: "right",
    ...(editable ? { color: "#155A99", backgroundColor: "#EFF6FF" } : {}),
  };
};
const formula = (value, cached = "0", format = cash) => ({
  value: value.replace(/^=/, ""),
  type: "Formula",
  cached: String(cached ?? "0"),
  format,
  align: "right",
});
const head = (values) =>
  values.map((v) =>
    text(v, {
      fontWeight: "bold",
      backgroundColor: "#304C65",
      color: "#FFFFFF",
      height: 27,
    }),
  );
const banner = (title, width) => [
  text(title, {
    fontWeight: "bold",
    fontSize: 15,
    columnSpan: width,
    height: 28,
  }),
  ...Array(width - 1).fill(null),
];
const note = (value, width) => [
  text(value, {
    columnSpan: width,
    height: Math.max(
      30,
      Math.ceil(String(value).length / (width * 12)) * 15 + 6,
    ),
    color: "#4E6478",
  }),
  ...Array(width - 1).fill(null),
];
const sq = (s) => "'" + s.replaceAll("'", "''") + "'";
const literal = (s) => '"' + String(s).replaceAll('"', '""') + '"';
const ref = (sheet, col, row) => `${sq(sheet)}!$${col}$${row}`;
const moneyRow = (label, value, width = 10) => [
  text(label, { fontWeight: "bold", columnSpan: width - 1 }),
  ...Array(width - 2).fill(null),
  value,
];
function paragraphs(value, width) {
  return String(value || "")
    .split(/\r?\n/)
    .flatMap((p) => {
      const chunks = p.match(/[\s\S]{1,1000}/g) || [""];
      return chunks.map((chunk) => [
        text(chunk, {
          columnSpan: width,
          height: Math.max(20, Math.ceil(chunk.length / (width * 12)) * 15 + 6),
        }),
        ...Array(width - 1).fill(null),
      ]);
    });
}
function sheet(sheet, data, widths, opts = {}) {
  return {
    sheet,
    data,
    columns: widths.map((width) => ({ width })),
    stickyRowsCount: 3,
    showGridLines: false,
    orientation: "landscape",
    printColumns: widths.length,
    ...opts,
  };
}
export function normalizedAnalyses(
  data,
  analyses = [],
  resources = [],
  prices = {},
) {
  const catalog = new Map(resources.map((r) => [r.id, r]));
  const all = new Map(
    [...(data.document.line_analyses || []), ...analyses].map((a) => [a.id, a]),
  );
  const result = new Map();
  for (const l of data.document.lines) {
    if (!l.analysis_id || result.has(l.analysis_id)) continue;
    const a = all.get(l.analysis_id);
    if (!a?.components?.length)
      throw new Error(
        "Falta el ACU de «" +
          l.description +
          "». Actualizá el presupuesto antes de exportar.",
      );
    result.set(a.id, {
      ...a,
      components: a.components.map((c) => {
        const resource = catalog.get(c.resource_id);
        const quantity = String(c.quantity ?? c.quantity_per_unit),
          unit_price = String(prices[c.resource_id] ?? c.unit_price);
        return {
          ...c,
          quantity,
          unit_price,
          total: c.included===false?"0":multiplyDecimals(quantity, unit_price),
          unit: resource?.unit || c.unit || "—",
          kind: String(c.kind || resource?.kind || "material").toLowerCase(),
          code: resource?.code || "",
        };
      }),
    });
  }
  return result;
}
function periodicFactor(item,definition) {
  if(item.months!=null||item.use_estimate_duration)return monthFactor(item,definition);
  if (!item.periodic) return "1";
  const p = item.periodic,
    start = new Date(p.start + "T00:00:00Z"),
    end = new Date(p.end + "T00:00:00Z");
  let year = start.getUTCFullYear(),
    month = start.getUTCMonth(),
    factor = 0;
  for (let guard = 0; guard < 122; guard++) {
    const first = new Date(Date.UTC(year, month, 1)),
      next = new Date(Date.UTC(year, month + 1, 1));
    if (first > end) break;
    const last = new Date(next.getTime() - 86400000),
      from = Math.max(first.getTime(), start.getTime()),
      to = Math.min(last.getTime(), end.getTime());
    factor += p.prorate ? ((to - from) / 86400000 + 1) / last.getUTCDate() : 1;
    month++;
    if (month === 12) {
      month = 0;
      year++;
    }
  }
  return String(factor);
}
function definitionRows(data) {
  if (!data.document.price_definition?.rows)
    throw new Error(
      "Falta la determinación del precio para generar el respaldo completo",
    );
  return data.document.price_definition.rows;
}

export function buildBudgetWorkbook(
  data,
  {
    analyses = [],
    resources = [],
    prices = {},
    title = data.document.title,
    memory = data.document.presentation?.memory || "",
    notes = "",
    date = "",
    reference = "",
    landscape = true,
  } = {},
) {
  const directRefs=[];
  const doc = data.document,
    numbering = budgetNumbering(doc.sections,doc.lines,doc.assignments),
    normalized = normalizedAnalyses(data, analyses, resources, prices),
    publicValues = new Map(clientPrintData(data).lines.map((l) => [l.id, l]));
  const lineStart = 5,
    lineEnd = Math.max(lineStart, doc.lines.length + lineStart - 1),
    quantityRange = `${sq("Partidas")}!$E$${lineStart}:$E$${lineEnd}`,
    analysisRange = `${sq("Partidas")}!$K$${lineStart}:$K$${lineEnd}`;
  const acu = [
    banner("Análisis de costos unitarios", 9),
    note(
      "Consumos y precios editables. Las partidas y el consolidado se recalculan con las fórmulas de esta hoja.",
      9,
    ),
    head([
      "Tipo",
      "Insumo",
      "Unidad",
      "Consumo / unidad",
      "Precio unitario",
      "Parcial unitario",
      "Cantidad de partida",
      "Cantidad total",
      "Precio total",
      "",
      "Cobrar (1/0)",
      "",
      "Rendimiento por día hábil",
    ]),
  ];
  const acuRefs = new Map(),
    componentRefs = [],
    breaks = [];
  for (const a of normalized.values()) {
    if (acu.length > 3) breaks.push(acu.length);
    const row = acu.length + 1,
      uses = doc.lines.filter((l) => l.analysis_id === a.id),
      quantity = sumDecimals(uses.map((l) => l.quantity));
    acu.push([
      text(uses.map(l=>numbering.lines.get(l.id)+" · "+l.description+" · "+l.unit).join(" / "), {
        columnSpan: 6,
        fontWeight: "bold",
        backgroundColor: "#DFECE6",
        height: 28,
      }),
      null,
      null,
      null,
      null,
      null,
      formula(
        `SUMIF(${analysisRange},${literal(a.id)},${quantityRange})`,
        quantity,
        decimal,
      ),
    ]);
    const first = acu.length + 1;
    for (const c of a.components) {
      const n = acu.length + 1;
      acu.push([
        text(kindName(c.kind)+(c.included===false?" · SIN SUMAR":"")),
        text(c.description),
        text(c.unit),
        number(c.quantity, decimal, true),
        number(c.unit_price, cash, true),
        formula(`IF(K${n}=1,D${n}*E${n},0)`, c.total),
        formula(`G${row}`, quantity, decimal),
        formula(`D${n}*G${n}`, multiplyDecimals(c.quantity, quantity), decimal),
        formula(`F${n}*G${n}`, multiplyDecimals(c.total, quantity)),
        text(c.resource_id),
        number(c.included===false?0:1,"0",true),
        formula(`D${n}*E${n}*G${n}`,multiplyDecimals(multiplyDecimals(c.quantity,c.unit_price),quantity)),
        c.daily_output==null?null:number(c.daily_output,decimal,true),
      ]);
      componentRefs.push({
        ...c,
        row: n,
        quantity: multiplyDecimals(c.quantity, quantity),
        amount: multiplyDecimals(multiplyDecimals(c.quantity,c.unit_price),quantity),
      });
    }
    const last = acu.length,
      total = sumDecimals(a.components.map((c) => c.total)),
      n = acu.length + 1;
    acu.push([
      text("COSTO UNITARIO", { columnSpan: 5, fontWeight: "bold" }),
      null,
      null,
      null,
      null,
      formula(`SUM(F${first}:F${last})`, total),
    ]);
    acuRefs.set(a.id, n);
    acu.push([]);
  }
  if (!normalized.size)
    acu.push(
      note("Este presupuesto tiene precios declarados y no contiene ACU.", 9),
    );
  const takeoffs = [
    banner("Cómputos métricos", 8),
    note(
      "Las mediciones activas alimentan la cantidad de su partida. Las cantidades manuales se conservan en Partidas.",
      8,
    ),
    head([
      "Partida",
      "Nota",
      "Signo",
      "Factor",
      "Largo",
      "Ancho",
      "Alto",
      "Cantidad",
    ]),
  ];
  const measures = new Map();
  for (const t of doc.takeoffs || []) {
    const n = takeoffs.length + 1,
      line = doc.lines.find((l) => l.id === t.line_id);
    let qty = String(t.sign ?? 1);
    for (const k of ["factor", "length", "width", "height"])
      qty = multiplyDecimals(qty, t[k]);
    takeoffs.push([
      text(line?.description || t.line_id),
      text(t.note),
      number(t.sign, "0", true),
      number(t.factor, decimal, true),
      number(t.length, decimal, true),
      number(t.width, decimal, true),
      number(t.height, decimal, true),
      formula(`C${n}*D${n}*E${n}*F${n}*G${n}`, qty, decimal),
      text(t.line_id),
    ]);
    if (!measures.has(t.line_id)) measures.set(t.line_id, []);
    measures.get(t.line_id).push(n);
  }
  if (!(doc.takeoffs || []).length)
    takeoffs.push(note("Sin cómputos métricos cargados.", 8));
  const detail = [
    banner("Detalle de la determinación de precio", 10),
    note(
      "Cantidades, precios y participación editables. El factor de períodos conserva el alcance del alquiler mensual.",
      10,
    ),
    head([
      "Concepto",
      "Descripción",
      "Unidad",
      "Participación %",
      "Cantidad",
      "Precio unitario",
      "Factor períodos",
      "Importe",
      "Desde",
      "Hasta",
    ]),
  ];
  const price = [
    banner("Determinación del precio", 8),
    [text("Plazo estimado de obra (meses)"),number(estimateMonths(doc.price_definition),decimal,true)],
    head([
      "Concepto",
      "Activo (1/0)",
      "Base",
      "Porcentaje",
      "Importe fijo / detalle",
      "Importe aplicado",
      "Acumulado",
      "Rol",
    ]),
  ];
  const direct =
    data.calculation?.breakdown?.direct ??
    sumDecimals(
      doc.lines.map((l) => multiplyDecimals(l.quantity, l.unit_cost_snapshot)),
    );
  price.push([
    text("Costo directo"),
    null,
    null,
    null,
    null,
    null,
    formula(`SUM(${sq("Partidas")}!G${lineStart}:G${lineEnd})`, direct),
  ]);
  const definitions = definitionRows(data);
  let previous = 4;
  for (const source of definitions) {
    const n = price.length + 1,
      result =
        (data.calculation?.rows || []).find((r) => r.id === source.id) || {},
      kind = source.kind;
    let base =
      kind === "percent_direct" ||
      (kind === "detailed" && source.detail_mode === "reference")
        ? "$G$4"
        : kind === "percent_profit"
          ? n > 5
            ? `MAX(0,SUMIF(H5:H${n - 1},"profit",F5:F${n - 1}))`
            : "0"
          : kind === "percent_subtotal" || kind === "subtotal"
            ? `G${previous}`
            : "0";
    let fixed =
        kind === "fixed" ||
        (kind === "detailed" && source.detail_mode === "manual")
          ? number(source.amount ?? "0", cash, true)
          : null,
      amount = result.amount ?? "0";
    if (kind === "detailed" && source.detail_mode === "items") {
      const first = detail.length + 1;
      for (const item of source.items.filter((i) => !i.group)) {
        const r = detail.length + 1,
          factor = periodicFactor(item,doc.price_definition);
        const cache =
          result.item_totals?.[item.id] ??
          multiplyDecimals(
            multiplyDecimals(
              multiplyDecimals(item.quantity, item.unit_price),
              divideDecimals(item.participation_percent, "100"),
            ),
            factor,
          );
        if(source.role==='direct_costs' && item.resource_id)directRefs.push({resource_id:item.resource_id,description:item.description,kind:item.resource_kind||resources.find(r=>r.id===item.resource_id)?.kind||'material',unit:item.unit,quantity:multiplyDecimals(multiplyDecimals(item.quantity,factor),divideDecimals(item.participation_percent,'100')),amount:cache,qtyRef:`${sq("Detalle precio")}!D${r}/100*${sq("Detalle precio")}!E${r}*${sq("Detalle precio")}!G${r}`,amountRef:`${sq("Detalle precio")}!H${r}`});
        detail.push([
          text(source.label),
          text(item.description),
          text(item.unit),
          number(item.participation_percent, "0.00", true),
          number(item.quantity, decimal, true),
          number(item.unit_price, cash, true),
          item.use_estimate_duration
            ? formula(`${sq("Precio")}!$B$2/${item.months_per_payment??"1"}`,factor)
            : number(factor, decimal, true),
          formula(`D${r}/100*E${r}*F${r}*G${r}`, cache),
          text(item.periodic?.start || ""),
          text(item.periodic?.end || ""),
        ]);
      }
      fixed = formula(
        detail.length >= first
          ? `SUM(${sq("Detalle precio")}!H${first}:H${detail.length})`
          : "0",
        result.detail_total ?? "0",
      );
    }
    const rate =
      kind === "detailed" && source.detail_mode === "reference"
        ? (source.reference_percent ?? "0")
        : (source.percent ?? "0");
    const raw =
      kind === "subtotal"
        ? `G${previous}`
        : kind.startsWith("percent_") ||
            (kind === "detailed" && source.detail_mode === "reference")
          ? `C${n}*D${n}/100`
          : `E${n}`;
    price.push([
      text(source.label),
      number(source.enabled ? 1 : 0, "0", true),
      formula(base, base === "$G$4" ? direct : (result.base ?? "0")),
      kind.startsWith("percent_") ||
      (kind === "detailed" && source.detail_mode === "reference")
        ? number(rate, "0.0000", true)
        : null,
      fixed,
      formula(
        `IF(B${n}=0,0,${source.subtract && kind !== "subtotal" ? "-" : ""}(${raw}))`,
        amount,
      ),
      formula(
        kind === "subtotal" ? `G${previous}` : `G${previous}+F${n}`,
        result.running_total ?? direct,
      ),
      text(kind === "subtotal" ? "subtotal" : source.role || "other"),
    ]);
    previous = n;
  }
  const subtotalRow = price.length + 2,
    taxRow = subtotalRow + 1,
    totalRow = subtotalRow + 2,
    summary = publicPriceSummary(data);
  price.push(
    [],
    [
      text("Subtotal sin IVA"),
      null,
      null,
      null,
      null,
      null,
      formula(
        `ROUND(G${previous}-${definitions.length ? `SUMIF(H5:H${previous},"tax",F5:F${previous})` : "0"},2)`,
        summary.subtotal,
      ),
    ],
    [
      text("IVA / impuestos"),
      null,
      null,
      null,
      null,
      null,
      formula(`ROUND(G${previous},2)-G${subtotalRow}`, summary.taxes),
    ],
    [
      text("TOTAL FINAL", { fontWeight: "bold" }),
      null,
      null,
      null,
      null,
      null,
      formula(`ROUND(G${previous},2)`, summary.total),
    ],
  );
  const parts = [
    banner(title, 10),
    note(
      "Edición libre: cantidades y precios declarados en azul. Los precios de partidas con ACU están vinculados a su composición.",
      10,
    ),
    note(
      "Obra: " +
        data.project.name +
        " · Cliente: " +
        data.client.name +
        " · Moneda: " +
        String(data.estimate.currency).toUpperCase(),
      10,
    ),
    head([
      "Ítem",
      "Rubro",
      "Descripción",
      "Unidad",
      "Cantidad",
      "P. unitario de costo",
      "Costo directo",
      "P. unitario final sin IVA",
      "Importe sin IVA",
      "Incidencia %",
      "",
    ]),
  ];
  const assignments = new Map(doc.assignments || []),
    sections = new Map((doc.sections || []).map((s) => [s.id, s]));
  const measured = new Set(doc.measured_line_ids || []);
  for (const [index, l] of doc.lines.entries()) {
    const n = parts.length + 1,
      cost = multiplyDecimals(l.quantity, l.unit_cost_snapshot),
      publicLine = publicValues.get(l.id),
      acuRow = acuRefs.get(l.analysis_id);
    const refs = measures.get(l.id);
    const qty =
      measured.has(l.id) && refs?.length
        ? formula(
            `SUMIF('Metrados'!I4:I${takeoffs.length},${literal(l.id)},'Metrados'!H4:H${takeoffs.length})`,
            l.quantity,
            decimal,
          )
        : number(l.quantity, decimal, true);
    const cumulative = `ROUND(SUM($G$${lineStart}:G${n})/${ref("Precio", "G", 4)}*${ref("Precio", "G", subtotalRow)},2)`;
    const before = n > lineStart ? `SUM($I$${lineStart}:I${n - 1})` : "0";
    parts.push([
      text(numbering.lines.get(l.id)),
      text(sections.get(assignments.get(l.id))?.title || ""),
      text(l.description),
      text(l.unit),
      qty,
      acuRow
        ? formula(ref("ACU", "F", acuRow), l.unit_cost_snapshot)
        : number(l.unit_cost_snapshot, cash, true),
      formula(`E${n}*F${n}`, cost),
      formula(
        `IF(E${n}=0,IF(${ref("Precio", "G", 4)}=0,0,F${n}*${ref("Precio", "G", subtotalRow)}/${ref("Precio", "G", 4)}),I${n}/E${n})`,
        publicLine?.sale_unit || "0",
        decimal,
      ),
      formula(
        `IF(${ref("Precio", "G", 4)}=0,0,${cumulative}-${before})`,
        publicLine?.sale_total || "0",
      ),
      formula(
        `IF(OR(${ref("Precio", "G", 4)}=0,${ref("Precio", "G", totalRow)}=0),0,G${n}/${ref("Precio", "G", 4)})`,
        divideDecimals(
          (data.lines || []).find((x) => x.id === l.id)?.incidence_percent ||
            "0",
          "100",
        ),
        percent,
      ),
      text(l.analysis_id || ""),
    ]);
  }
  parts.push(
    moneyRow(
      "Subtotal sin IVA",
      formula(ref("Precio", "G", subtotalRow), summary.subtotal),
    ),
    moneyRow(
      "IVA / impuestos",
      formula(ref("Precio", "G", taxRow), summary.taxes),
    ),
    moneyRow(
      "TOTAL FINAL",
      formula(ref("Precio", "G", totalRow), summary.total),
    ),
  );
  const consolidated = [
    banner("Consolidado de insumos", 5),
    note(
      "Cantidades y valores completos para provisión, incluidos los insumos que paga el comitente y no se cobran en el presupuesto.",
      5,
    ),
    head(["Tipo", "Insumo", "Unidad", "Cantidad total", "Precio total"]),
  ];
  const grouped = new Map();
  for (const c of [...componentRefs,...directRefs]) {
    if (!grouped.has(c.resource_id))
      grouped.set(c.resource_id, { ...c, quantity: "0", amount: "0",qtyRefs:[],amountRefs:[] });
    const row = grouped.get(c.resource_id);
    if(c.qtyRef)row.qtyRefs.push(c.qtyRef);if(c.amountRef)row.amountRefs.push(c.amountRef);
    row.quantity = sumDecimals([row.quantity, c.quantity]);
    row.amount = sumDecimals([row.amount, c.amount]);
  }
  const lastAcu = Math.max(4, acu.length);
  for (const c of grouped.values())
    consolidated.push([
      text(kindName(c.kind)),
      text(c.description),
      text(c.unit),
      formula(
        `SUMIF(${sq("ACU")}!J4:J${lastAcu},${literal(c.resource_id)},${sq("ACU")}!H4:H${lastAcu})${c.qtyRefs.map(r=>'+('+r+')').join('')}`,
        c.quantity,
        decimal,
      ),
      formula(
        `SUMIF(${sq("ACU")}!J4:J${lastAcu},${literal(c.resource_id)},${sq("ACU")}!L4:L${lastAcu})${c.amountRefs.map(r=>'+'+r).join('')}`,
        c.amount,
      ),
    ]);
  if (!grouped.size)
    consolidated.push(
      note("Sin insumos: las partidas tienen precio declarado.", 5),
    );
  const info = [
    banner("Memoria y condiciones del presupuesto", 6),
    ...paragraphs(
      "Título: " +
        title +
        "\nObra: " +
        data.project.name +
        "\nCliente: " +
        data.client.name +
        (date ? "\nFecha: " + date : "") +
        (reference ? "\nReferencia: " + reference : ""),
      6,
    ),
    ...paragraphs(memory ? "Memoria descriptiva\n" + memory : "", 6),
    ...paragraphs(notes ? "Condiciones comerciales\n" + notes : "", 6),
    ...paragraphs(
      "Las celdas azules son editables. Modificá consumos o precios en ACU: Partidas, Precio e Insumos se recalculan. Las partidas sin ACU mantienen un precio declarado editable. El plazo de obra se edita en Precio!B2 y actualiza los gastos vinculados; los meses propios se conservan. Las fórmulas no están protegidas. Los valores numéricos usan la precisión de la hoja de cálculo. Este archivo es independiente de CPOBRAS.",
      6,
    ),
  ];
  return [
    sheet("Partidas", parts, [8, 25, 50, 12, 16, 20, 22, 23, 24, 15, 1], {
      hiddenColumns: [11],
      printColumns: 10,
      stickyRowsCount: 4,
    }),
    sheet("ACU", acu, [18, 48, 12, 18, 20, 22, 20, 20, 24, 1, 16, 1, 24], {
      hiddenColumns: [10,12],
      printColumns: 9,
      pageBreakRows: breaks,
    }),
    sheet("Precio", price, [38, 14, 22, 16, 28, 24, 24, 18]),
    sheet("Insumos", consolidated, [18, 50, 12, 22, 24]),
    sheet("Metrados", takeoffs, [42, 40, 10, 16, 16, 16, 16, 20, 1], {
      hiddenColumns: [9],
      printColumns: 8,
    }),
    sheet("Detalle precio", detail, [30, 48, 12, 18, 18, 20, 18, 24, 15, 15]),
    sheet("Memoria", info, [20, 20, 20, 20, 20, 20], {
      stickyRowsCount: 1,
      orientation: landscape ? "landscape" : "portrait",
    }),
  ];
}

export function buildClientWorkbook(
  data,
  {
    title = data.document.title,
    memory = data.document.presentation?.memory || "",
    notes = "",
    layout = "memory_sheet_price",
    date = "",
    reference = "",
    landscape = false,
  } = {},
) {
  const summary = publicPriceSummary(data),
    rows = printRows(data, "client");
  const p = data.profile || {},
    identity = [
      p.trade_name,
      p.company_name,
      p.professional_name,
      p.qualification,
      !p.trade_name && !p.company_name && !p.professional_name ? "CPOBRAS" : "",
      p.tax_id,
      p.address,
      p.phone,
      p.email,
      p.website,
      "Obra: " + data.project.name,
      "Cliente: " + data.client.name,
      "Moneda: " + String(data.estimate.currency).toUpperCase(),
      date,
      reference,
    ]
      .filter(Boolean)
      .join(" · ");
  const output = [];
  if (hasMemory(layout)) {
    const content = [
      banner(title, 7),
      note(identity, 7),
      ...paragraphs("Memoria descriptiva\n" + memory, 7),
    ];
    if (!hasSchedule(layout))
      content.push(
        ...publicSummaryRows(summary, 7),
        ...paragraphs(notes, 7),
        ...paragraphs(p.footer, 7),
      );
    output.push(
      sheet(
        hasSchedule(layout) ? "Memoria" : "Oferta",
        content,
        Array(7).fill(16),
        {
          stickyRowsCount: 1,
          orientation: landscape ? "landscape" : "portrait",
        },
      ),
    );
  }
  if (hasSchedule(layout)) {
    const content = [
        banner(title, 7),
        note(identity, 7),
        head(printColumns("client")),
      ],
      first = 4;
    const sections = [];
    for (const row of rows) {
      const n = content.length + 1;
      if (row.kind === "section") {
        sections.push({ row: n, value: row });
        content.push([
          text(row.code),
          text(row.description),
          null,
          null,
          null,
          number(row.sale),
          number(divideDecimals(row.incidence ?? "0", "100"), percent),
          text("section"),
        ]);
        continue;
      }
      const amount = row.sale_total ?? "0";
      content.push([
        text(row.code),
        text(row.description),
        text(row.unit || ""),
        row.kind === "unallocated" ? null : number(row.quantity, decimal, true),
        row.kind === "unallocated"
          ? null
          : number(row.sale_unit || "0", decimal, true),
        row.kind === "unallocated"
          ? number(amount, cash, true)
          : formula(`ROUND(D${n}*E${n},2)`, amount),
        null,
        text("line"),
      ]);
    }
    const end = content.length,
      totalNet = end + 2,
      tax = totalNet + 1;
    for (let n = first; n <= end; n++) {
      if (content[n - 1][7]?.value === "line")
        content[n - 1][6] = formula(
          `IF($G$${totalNet}=0,0,F${n}/$G$${totalNet})`,
          divideDecimals(rows[n - first]?.incidence_percent ?? "0", "100"),
          percent,
        );
    }
    // A section is the sum of its descendant leaf rows; nested section totals are excluded.
    const sourceSections = new Map(
        (data.document.sections || []).map((s) => [s.id, s]),
      ),
      assign = new Map(data.document.assignments || []);
    for (const section of sections) {
      const root = sourceSections.get(section.value.id),
        ids = new Set(root ? [root.id] : []);
      let changed = true;
      while (changed) {
        changed = false;
        for (const s of data.document.sections || [])
          if (ids.has(s.parent_id) && !ids.has(s.id)) {
            ids.add(s.id);
            changed = true;
          }
      }
      const leafRows = rows.flatMap((r, i) =>
        r.kind === "line" &&
        (root ? ids.has(assign.get(r.id)) : !assign.has(r.id))
          ? [i + first]
          : [],
      );
      const n = section.row;
      content[n - 1][5] = formula(
        leafRows.length
          ? `SUMIF(H${leafRows[0]}:H${leafRows.at(-1)},"line",F${leafRows[0]}:F${leafRows.at(-1)})`
          : "0",
        section.value.sale,
      );
      content[n - 1][6] = formula(
        `IF($G$${totalNet}=0,0,F${n}/$G$${totalNet})`,
        divideDecimals(section.value.incidence ?? "0", "100"),
        percent,
      );
    }
    const rate =
      compareDecimals(summary.subtotal, "0") !== 0
        ? divideDecimals(summary.taxes, summary.subtotal, 20)
        : "0";
    content.push(
      [],
      moneyRow(
        "Subtotal",
        formula(
          end >= first
            ? `SUMIF(H${first}:H${end},"line",F${first}:F${end})`
            : "0",
          summary.subtotal,
        ),
        7,
      ),
      moneyRow(
        "IVA / impuestos",
        compareDecimals(summary.subtotal, "0") === 0
          ? number(summary.taxes, cash, true)
          : formula(`ROUND(G${totalNet}*${rate},2)`, summary.taxes),
        7,
      ),
      moneyRow(
        "TOTAL FINAL",
        formula(`G${totalNet}+G${tax}`, summary.total),
        7,
      ),
      ...paragraphs(notes, 7),
      ...paragraphs(p.footer, 7),
    );
    output.push(
      sheet("Presupuesto", content, [8, 55, 10, 16, 23, 24, 17, 1], {
        hiddenColumns: [8],
        printColumns: 7,
        stickyRowsCount: 3,
        orientation: landscape ? "landscape" : "portrait",
      }),
    );
  }
  return output;
}
function publicSummaryRows(summary, width) {
  return [
    moneyRow("Subtotal", number(summary.subtotal), width),
    moneyRow("IVA / impuestos", number(summary.taxes), width),
    moneyRow("TOTAL FINAL", number(summary.total), width),
  ];
}

/** Cache verified source values, request recalculation, and make every sheet printable on A4. */
export async function workbookBytes(sheets) {
  const { default: writeExcelFile } =
    await import("write-excel-file/universal");
  const { unzipSync, zipSync, strFromU8, strToU8 } = await import("fflate");
  const blob = await writeExcelFile(
    sheets.map(({ printColumns, hiddenColumns, pageBreakRows, ...s }) => s),
  ).toBlob();
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  let names = "";
  for (const [index, s] of sheets.entries()) {
    const path = `xl/worksheets/sheet${index + 1}.xml`;
    let xml = strFromU8(files[path]);
    const cached = new Map();
    for (const [ri, row] of s.data.entries())
      for (const [ci, c] of row.entries())
        if (c?.type === "Formula") {
          let col = "",
            n = ci + 1;
          while (n) {
            col = String.fromCharCode(65 + ((n - 1) % 26)) + col;
            n = Math.floor((n - 1) / 26);
          }
          cached.set(col + (ri + 1), c.cached ?? "0");
        }
    xml = xml.replace(
      /<c\b([^>]*\br="([A-Z]+\d+)"[^>]*)>([\s\S]*?)<\/c>/g,
      (whole, attrs, address, body) => {
        if (!cached.has(address)) return whole;
        const value = cached.get(address);
        if (!/^-?\d+(?:\.\d+)?$/.test(value))
          throw new Error("Valor calculado no válido para Excel");
        return `<c${attrs}>${body.replace(/<v>[\s\S]*?<\/v>/g, "")}<v>${value}</v></c>`;
      },
    );
    if (!xml.includes("<sheetPr"))
      xml = xml.replace(
        /<worksheet\b[^>]*>/,
        '$&<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>',
      );
    xml = xml.replace(
      /<pageSetup\b([^>]*?)\/?\s*>/,
      (_, attrs) =>
        `<pageSetup${attrs.replace(/\s(?:fitToWidth|fitToHeight|paperSize)="[^"]*"/g, "")} paperSize="9" fitToWidth="1" fitToHeight="0"/>`,
    );
    xml = xml.replace(/<col\b([^>]*?)\/?\s*>/g, (whole, attrs) =>
      s.hiddenColumns?.includes(Number(/\bmin="(\d+)"/.exec(attrs)?.[1]))
        ? `<col${attrs} hidden="1"/>`
        : whole,
    );
    const lastCol = String.fromCharCode(64 + s.printColumns),
      escaped = s.sheet.replaceAll("'", "''");
    names += `<definedName name="_xlnm.Print_Area" localSheetId="${index}">'${escaped}'!$A$1:$${lastCol}$${s.data.length}</definedName>`;
    if (s.stickyRowsCount)
      names += `<definedName name="_xlnm.Print_Titles" localSheetId="${index}">'${escaped}'!$1:$${s.stickyRowsCount}</definedName>`;
    if (s.pageBreakRows?.length)
      xml = xml.replace(
        "</worksheet>",
        `<rowBreaks count="${s.pageBreakRows.length}" manualBreakCount="${s.pageBreakRows.length}">${s.pageBreakRows.map((id) => `<brk id="${id}" max="16383" man="1"/>`).join("")}</rowBreaks></worksheet>`,
      );
    files[path] = strToU8(xml);
  }
  let book = strFromU8(files["xl/workbook.xml"]);
  book = book
    .replace(/<definedNames\s*\/>/, `<definedNames>${names}</definedNames>`)
    .replace(
      /<calcPr\b[^>]*\/>/,
      '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>',
    );
  files["xl/workbook.xml"] = strToU8(book);
  return zipSync(files, { level: 6 });
}
