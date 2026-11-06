import { e, field, select, dateToday } from "./helpers.js";
import { money, numeric, sumDecimals } from "../decimal.js";
import { exportOperationalReport } from "../services/operations-export.js";
export const operationGroups = {
  purchases: [
    "request",
    "rfq",
    "quote",
    "purchase_order",
    "service_order",
    "subcontract",
    "receipt",
    "service_receipt",
    "consumption",
    "return",
    "transfer",
  ],
  production: ["daily"],
  certificates: ["certificate", "subcertificate", "index", "adjustment"],
  finance: [
    "payable",
    "receivable",
    "payment",
    "collection",
    "advance_paid",
    "advance_received",
    "retention_payable",
    "retention_receivable",
    "forecast",
  ],
};
export const operationNames = {
  request: "Solicitud de materiales",
  rfq: "Pedido de cotización",
  quote: "Cotización de proveedor",
  purchase_order: "Orden de compra",
  service_order: "Orden de servicio",
  subcontract: "Contrato de subcontratista",
  receipt: "Remito / recepción parcial",
  service_receipt: "Recepción de servicio",
  consumption: "Consumo de materiales",
  return: "Devolución de consumo",
  transfer: "Transferencia entre depósitos",
  daily: "Parte diario",
  certificate: "Certificado de avance",
  subcertificate: "Certificado de subcontratista",
  index: "Índice de precios",
  adjustment: "Redeterminación contractual",
  payable: "Factura por pagar",
  receivable: "Factura por cobrar",
  payment: "Pago",
  collection: "Cobro",
  advance_paid: "Anticipo pagado",
  advance_received: "Anticipo recibido",
  retention_payable: "Liberación de reparo por pagar",
  retention_receivable: "Liberación de reparo por cobrar",
  forecast: "Proyección de costo a terminar",
};
const guides = {
  advance_paid:
    "Registrá el anticipo efectivamente pagado y vinculalo con el subcontrato. Luego se descuenta en sus certificados, hasta el saldo pendiente.",
  advance_received:
    "Registrá el anticipo cobrado del comitente. Los certificados pueden recuperarlo sin superar el saldo recibido.",
  retention_payable:
    "Liberá el fondo de reparo de un certificado de subcontratista. Se crea una obligación que podrás pagar vinculando este documento.",
  retention_receivable:
    "Liberá el fondo de reparo de un certificado de obra. Se crea una cuenta por cobrar para conciliar su cobro.",
  request:
    "Cargá las necesidades de la obra. La tabla de necesidades calcula las cantidades a partir de los ACU del presupuesto de referencia.",
  rfq: "Vinculá una solicitud para pedir precios sobre las mismas cantidades. Registrá luego una cotización por proveedor.",
  quote:
    "Elegí proveedor y pedido de cotización. La comparativa indica si la oferta cubre todos los renglones y cantidades. Compará ofertas de la misma moneda.",
  purchase_order:
    "Elegí una cotización o cargá la compra con su proveedor. Las recepciones posteriores controlarán el saldo por renglón.",
  service_order:
    "Registrá el alcance, cantidades, precio y condiciones del servicio. Su recepción se imputa al costo real.",
  subcontract:
    "Definí las partidas, precios, alcance, plazos y condiciones del contrato. Sus certificados no pueden superar lo contratado.",
  receipt:
    "Elegí la orden de compra, el proveedor y el depósito. Ajustá las cantidades a lo efectivamente recibido; se permiten entregas parciales.",
  service_receipt:
    "Vinculá una orden de servicio o subcontrato. La aceptación del servicio genera costo real. El certificado es su liquidación financiera y no vuelve a sumar el costo.",
  consumption:
    "Elegí un depósito y asigná materiales a las partidas o centros de costos. Se valorizan al promedio ponderado de la existencia en esa moneda.",
  return:
    "Elegí el consumo original y devolvé cantidades al mismo depósito. Se revierte el costo original, hasta el saldo consumido.",
  transfer:
    "Mové existencias hacia otro depósito, incluso de otra obra. Se conserva el valor y no se crea un costo ni una compra adicional.",
  daily:
    "Registrá producción por partida y asistencia de personas/cuadrillas o equipos por renglón. Cantidad = producción; horas = asistencia/trabajo; precio = costo por hora. Para asistencia o equipos elegí el tipo de registro correspondiente y usá cantidad 1; podés vincular la partida sin duplicar la producción. La mano de obra debe estar en horas para comparar con ACU.",
  certificate:
    "Elegí un presupuesto emitido y el período. Cargá las cantidades de este período. Se calculan precios de la versión emitida, acumulados, anticipos, descuentos, reparo y saldo.",
  subcertificate:
    "Elegí un subcontrato y presupuesto emitido. Se toman los precios del subcontrato y se controlan los saldos por partida y contrato.",
  index:
    "Registrá CAC, IPC o INDEC con período, fecha de publicación y URL de la fuente. La carga es manual; verificá la publicación oficial. No se descargan ni inventan índices.",
  adjustment:
    "Vinculá un certificado. La fórmula es suma(ponderador × índice del período / índice base). Los ponderadores deben sumar 1 y los índices deben estar registrados antes de la fecha del ajuste.",
  payable:
    "Registrá la factura y su vencimiento. Podés vincular recepción o certificado; su facturación y pagos no pueden superar el saldo. La factura crea deuda, no duplica el costo físico.",
  receivable:
    "Registrá la factura y su vencimiento, vinculada opcionalmente al certificado. La cuenta por cobrar evita contar dos veces lo facturado.",
  payment:
    "Elegí factura o certificado pendiente. Podés registrar pagos parciales; el sistema impide superar el saldo.",
  collection:
    "Elegí factura o certificado pendiente. Los cobros parciales se concilian con el documento de origen.",
  forecast:
    "Guardá una revisión del costo restante estimado y su fecha prevista. El tablero usa la última revisión hasta la fecha de corte; si no existe, estima por producción pendiente.",
};
const newLine = () => ({
  entry_type: "production",
  attendance: "present",
  resource_id: null,
  line_id: null,
  center_id: null,
  description: "",
  quantity: "1",
  unit_price: "0",
  hours: "0",
});
export function createOperationsWorkspace({
  invoke,
  state,
  render,
  document,
  window,
  FormData,
}) {
  const model = {
    tab: "purchases",
    projectId: "",
    asOf: dateToday(),
    estimateId: "",
    estimates: [],
    lines: [],
    partners: [],
    centers: [],
    docs: [],
    warehouses: [],
    stock: [],
    report: null,
    portfolio: [],
    draft: null,
    dirty: false,
    detail: null,
    lastExport: "",
  };
  function draft(kind) {
    return {
      id: window.crypto.randomUUID(),
      project_id: model.projectId,
      kind,
      number: "",
      date: dateToday(),
      currency:
        model.estimates.find((e) => e.id === model.estimateId)?.currency ||
        "ARS",
      partner_id: null,
      reference_id: null,
      warehouse_id: null,
      destination_id: null,
      estimate_id: model.estimateId || null,
      period_start: dateToday().slice(0, 7) + "-01",
      period_end: dateToday(),
      due_date: dateToday(),
      notes: "",
      terms: "",
      crew: "",
      incidents: "",
      photos: [],
      lines: [
        "index",
        "adjustment",
        "payable",
        "receivable",
        "payment",
        "collection",
        "advance_paid",
        "advance_received",
        "retention_payable",
        "retention_receivable",
        "forecast",
      ].includes(kind)
        ? []
        : [newLine()],
      amount: "0",
      advance: "0",
      discount: "0",
      retention_percent: "0",
      index_series: "CAC",
      index_source: "",
      index_period: dateToday().slice(0, 7),
      index_value: "0",
      base_period: "",
      target_period: "",
      adjustment_weights: [{ series: "CAC", weight: "1" }],
    };
  }
  const opts = (rows) => [
    ["", "Seleccionar…"],
    ...rows.map((r) => [r.id, r.name || r.title || r.description]),
  ];
  const partnerName = (id) =>
    model.partners.find((p) => p.id === id)?.name || "Comitente";
  const whName = (id) => {
    const w = model.warehouses.find((w) => w.id === id);
    return w
      ? `${state.projects.find((p) => p.id === w.project_id)?.name} · ${w.name} · ${w.location}`
      : "—";
  };
  async function refresh() {
    model.docs = await invoke("list_operations", {
      projectId: model.projectId || null,
    });
    model.warehouses = await invoke("list_warehouses");
    model.stock = await invoke("stock_balances", { asOf: model.asOf });
    model.portfolio = await invoke("operations_portfolio", {
      asOf: model.asOf,
    });
    if (model.projectId) {
      model.estimates = await invoke("list_project_estimates", {
        projectId: model.projectId,
      });
      if (!model.estimates.some((e) => e.id === model.estimateId))
        model.estimateId =
          model.estimates.find((e) => e.issued)?.id ||
          model.estimates[0]?.id ||
          "";
      model.report = await invoke("operations_report", {
        projectId: model.projectId,
        estimateId: model.estimateId || null,
        asOf: model.asOf,
      });
      model.lines = model.estimateId
        ? await invoke("list_estimate_lines", { estimateId: model.estimateId })
        : [];
    } else {
      model.report = null;
      model.lines = [];
    }
  }
  function read() {
    const form = document.querySelector("#operation-form");
    if (!form || !model.draft) return;
    const data = new FormData(form),
      o = model.draft;
    for (const [k, v] of data) {
      if (k.startsWith("o:")) o[k.slice(2)] = String(v).trim() || null;
    }
    for (const k of [
      "notes",
      "terms",
      "crew",
      "incidents",
      "number",
      "date",
      "currency",
      "period_start",
      "period_end",
      "due_date",
      "index_source",
      "index_series",
      "index_period",
      "base_period",
      "target_period",
    ])
      o[k] ??= "";
    o.lines = [...form.querySelectorAll(".operation-line")].map((row) => {
      const value = (n) => row.querySelector(`[name="${n}"]`)?.value || "";
      return {
        entry_type: value("entry_type") || "production",
        attendance: value("attendance") || "present",
        resource_id: value("resource_id") || null,
        line_id: value("line_id") || null,
        center_id: value("center_id") || null,
        description: value("description").trim(),
        quantity: value("quantity") || "1",
        unit_price: value("unit_price") || "0",
        hours: value("hours") || "0",
      };
    });
    if (o.kind === "adjustment")
      o.adjustment_weights = [...form.querySelectorAll(".index-weight")].map(
        (row) => ({
          series: row.querySelector('[name="series"]').value,
          weight: row.querySelector('[name="weight"]').value,
        }),
      );
  }
  function protect() {
    read();
    if (!model.dirty) return true;
    if (
      !window.confirm(
        "Tenés un documento sin registrar. ¿Descartar el borrador y continuar?",
      )
    )
      return false;
    model.dirty = false;
    model.draft = null;
    return true;
  }
  function table(headers, rows) {
    return `<div class="operations-table"><table class="mini-table"><thead><tr>${headers.map((h) => `<th>${e(h)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${headers.length}">Sin registros para esta selección.</td></tr>`}</tbody></table></div>`;
  }
  function summary(report) {
    return report
      ? report.summaries
          .map(
            (s) =>
              `<h3>${e(s.currency)}</h3><div class="operations-kpis">${[
                ["Presupuesto de costo", s.budget_cost],
                ["Presupuesto de venta", s.budget_sale],
                ["Comprometido", s.committed],
                ["Costo real", s.accrued],
                ["Pagado", s.paid],
                ["Cobrado", s.collected],
                ["Por pagar", s.payable],
                ["Por cobrar", s.receivable],
                ["Saldo de caja", s.cash],
                ["Costo a terminar", s.cost_to_finish],
                ["Resultado esperado", s.expected_result],
                ["Rentabilidad esperada %", s.expected_margin_percent],
                ["Desvío del costo ejecutado", s.cost_deviation],
                ["Desvío del costo final previsto", s.expected_cost_deviation],
                ["Avance físico %", s.physical_percent],
                ["Anticipos pagados pendientes", s.advance_paid_balance],
                ["Anticipos recibidos pendientes", s.advance_received_balance],
                ["Reparo por pagar retenido", s.retained_payable],
                ["Reparo por cobrar retenido", s.retained_receivable],
              ]
                .map(
                  ([label, v]) =>
                    `<div><small>${e(label)}</small><strong>${money(v)}</strong></div>`,
                )
                .join("")}</div>`,
          )
          .join("")
      : "";
  }
  function formMarkup() {
    const o = model.draft;
    if (!o) return "";
    const stockKinds = ["receipt", "consumption", "return", "transfer"];
    const monetary = [
      "payable",
      "receivable",
      "payment",
      "collection",
      "advance_paid",
      "advance_received",
      "retention_payable",
      "retention_receivable",
      "forecast",
    ];
    const cert = ["certificate", "subcertificate"].includes(o.kind);
    const available = model.docs.filter((d) => {
      const allowed =
        {
          rfq: ["request"],
          quote: ["rfq"],
          purchase_order: ["quote", "request"],
          service_order: ["quote", "request"],
          subcontract: ["quote"],
          receipt: ["purchase_order"],
          service_receipt: ["service_order", "subcontract"],
          return: ["consumption"],
          subcertificate: ["subcontract"],
          adjustment: ["certificate", "subcertificate"],
          payable: [
            "receipt",
            "service_receipt",
            "subcertificate",
            "adjustment",
          ],
          receivable: ["certificate", "adjustment"],
          payment: ["payable", "subcertificate", "retention_payable"],
          collection: ["receivable", "certificate", "retention_receivable"],
          advance_paid: ["subcontract"],
          retention_payable: ["subcertificate"],
          retention_receivable: ["certificate"],
        }[o.kind] || [];
      return allowed.includes(d.kind);
    });
    return `<form id="operation-form" class="operations-form"><h3>${e(operationNames[o.kind])}</h3><p class="context-help">${e(guides[o.kind])} Los documentos registrados conservan su historial y no se sobrescriben.</p><div class="form-grid three">${field("Número / referencia", "o:number", o.number, 'required maxlength="100"')}${field("Fecha", "o:date", o.date, 'type="date" required')}${select(
      "Moneda",
      "o:currency",
      [
        ["ARS", "ARS"],
        ["USD", "USD"],
      ],
      o.currency,
    )}${select("Contraparte", "o:partner_id", [["", "Comitente / sin contraparte"], ...model.partners.map((p) => [p.id, p.name])], o.partner_id)}${available.length || ["rfq", "quote", "purchase_order", "service_order", "subcontract", "receipt", "service_receipt", "return", "subcertificate", "adjustment", "payable", "receivable", "payment", "collection", "advance_paid", "retention_payable", "retention_receivable"].includes(o.kind) ? select("Documento de origen", "o:reference_id", [["", "Sin origen"], ...available.map((d) => [d.id, `${operationNames[d.kind]} · ${d.number} · ${partnerName(d.partner_id)} · ${d.currency} ${money(d.amount)}`])], o.reference_id) : ""}${select("Presupuesto de referencia", "o:estimate_id", [["", "Sin vínculo"], ...model.estimates.map((x) => [x.id, x.title + (x.issued ? " · Emitido" : " · Borrador")])], o.estimate_id)}</div>
 ${stockKinds.includes(o.kind) ? `<div class="form-grid">${select("Depósito", "o:warehouse_id", opts(model.warehouses.filter((w) => w.project_id === model.projectId)), o.warehouse_id)}${o.kind === "transfer" ? select("Depósito de destino", "o:destination_id", [["", "Seleccionar…"], ...model.warehouses.map((w) => [w.id, whName(w.id)])], o.destination_id) : ""}</div>` : ""}
 ${cert ? `<div class="form-grid three">${field("Inicio del período", "o:period_start", o.period_start, 'type="date" required')}${field("Fin del período", "o:period_end", o.period_end, 'type="date" required')}${field("Anticipo a descontar", "o:advance", o.advance, 'type="number" min="0" step="any" required')}${field("Otros descuentos", "o:discount", o.discount, 'type="number" min="0" step="any" required')}${field("Fondo de reparo %", "o:retention_percent", o.retention_percent, 'type="number" min="0" max="100" step="any" required')}${field("Vencimiento", "o:due_date", o.due_date, 'type="date" required')}</div>` : ""}
 ${monetary.includes(o.kind) ? `<div class="form-grid">${field(o.kind === "forecast" ? "Costo restante estimado" : "Importe", "o:amount", o.amount, 'type="number" min="0" step="any" required')}${field(o.kind === "forecast" ? "Fin previsto" : "Vencimiento / fecha prevista", "o:due_date", o.due_date, 'type="date" required')}</div>` : ""}
 ${
   o.kind === "index"
     ? `<div class="form-grid three">${select(
         "Serie",
         "o:index_series",
         [
           ["CAC", "CAC"],
           ["IPC", "IPC"],
           ["INDEC", "INDEC"],
         ],
         o.index_series,
       )}${field("Período del índice", "o:index_period", o.index_period, 'type="month" required')}${field("Valor del índice", "o:index_value", o.index_value, 'type="number" min="0" step="any" required')}</div>${field("URL de la publicación / fuente", "o:index_source", o.index_source, 'type="url" required')}`
     : ""
 }
 ${
   o.kind === "adjustment"
     ? `<div class="form-grid">${field("Período base", "o:base_period", o.base_period, 'type="month" required')}${field("Período de ajuste", "o:target_period", o.target_period, 'type="month" required')}</div>${o.adjustment_weights
         .map(
           (w, i) =>
             `<div class="form-grid index-weight">${select(
               "Serie del ponderador",
               "series",
               [
                 ["CAC", "CAC"],
                 ["IPC", "IPC"],
                 ["INDEC", "INDEC"],
               ],
               w.series,
             )}${field("Ponderador (0 a 1)", "weight", w.weight, 'type="number" min="0" max="1" step="any" required')}<button type="button" class="btn" data-action="ops-remove-weight" data-index="${i}">Quitar ponderador</button></div>`,
         )
         .join(
           "",
         )}<button type="button" class="btn" data-action="ops-add-weight">Agregar ponderador</button>`
     : ""
 }
 ${o.kind === "daily" ? `${field("Responsable / cuadrilla", "o:crew", o.crew)}<label>Incidencias e imprevistos<textarea name="o:incidents">${e(o.incidents)}</textarea></label><label>Fotografías (hasta 8 JPG/PNG de 2 MB)<input type="file" name="daily-photos" accept="image/jpeg,image/png" multiple></label><div class="operation-photos">${o.photos.map((p, i) => `<figure><img src="${e(p)}" alt="Foto ${i + 1} del parte"><button type="button" class="btn" data-action="ops-remove-photo" data-index="${i}">Quitar foto ${i + 1}</button></figure>`).join("")}</div>` : ""}
 ${
   !["index", "adjustment", ...monetary].includes(o.kind)
     ? `<div class="form-subhead">RENGLONES <button type="button" class="btn" data-action="ops-add-line">Agregar renglón</button></div>${o.lines
         .map(
           (l, i) =>
             `<fieldset class="operation-line"><legend>Renglón ${i + 1}</legend><div class="form-grid three">${
               o.kind === "daily"
                 ? select(
                     "Tipo de registro",
                     "entry_type",
                     [
                       ["production", "Producción"],
                       ["labor", "Asistencia / mano de obra"],
                       ["equipment", "Uso de equipo"],
                     ],
                     l.entry_type || "production",
                   ) +
                   select(
                     "Asistencia",
                     "attendance",
                     [
                       ["present", "Presente"],
                       ["absent", "Ausente"],
                       ["justified", "Ausencia justificada"],
                     ],
                     l.attendance || "present",
                   )
                 : ""
             }${select("Insumo (opcional)", "resource_id", opts(state.resources), l.resource_id)}${select("Partida (opcional)", "line_id", opts(model.lines.filter(line=>!line.archived||["receipt","service_receipt","return"].includes(o.kind))), l.line_id)}${select("Centro de costos", "center_id", opts(model.centers.filter((c) => !c.project_id || c.project_id === model.projectId)), l.center_id)}${field("Descripción del renglón", "description", l.description, 'required maxlength="1000"')}${field(o.kind === "daily" ? "Cantidad producida" : "Cantidad del período / movimiento", "quantity", l.quantity, 'type="number" min="0.000001" step="any" required')}${field(o.kind === "daily" ? "Costo por hora" : "Precio unitario", "unit_price", l.unit_price, 'type="number" min="0" step="any" required')}${o.kind === "daily" ? field("Horas trabajadas / equipo", "hours", l.hours, 'type="number" min="0" step="any" required') : ""}</div><button type="button" class="btn" data-action="ops-remove-line" data-index="${i}">Quitar renglón</button></fieldset>`,
         )
         .join("")}`
     : ""
 }
 ${["subcontract", "service_order", "purchase_order"].includes(o.kind) ? field("Vencimiento previsto / fin contractual", "o:due_date", o.due_date, 'type="date" required') + `<label>Condiciones, alcance, plazos y forma de pago<textarea name="o:terms">${e(o.terms)}</textarea></label>` : ""}<label>Observaciones<textarea name="o:notes">${e(o.notes)}</textarea></label><p class="feature-error" role="alert"></p><button type="submit" class="btn primary">Registrar ${e(operationNames[o.kind].toLowerCase())}</button></form>`;
  }
  function documentRows() {
    const kinds = operationGroups[model.tab] || [];
    return table(
      [
        "Fecha",
        "Tipo",
        "Número",
        "Contraparte",
        "Moneda",
        "Importe",
        "Acciones",
      ],
      model.docs
        .filter((d) => kinds.includes(d.kind))
        .slice()
        .reverse()
        .map((d) => [
          e(d.date),
          e(operationNames[d.kind]),
          e(d.number),
          e(partnerName(d.partner_id)),
          e(d.currency),
          money(d.amount),
          `<button class="btn" data-action="ops-detail" data-id="${d.id}">Ver / exportar</button>`,
        ]),
    );
  }
  function production() {
    const r = model.report;
    if (!r) return "";
    return table(
      [
        "Rubro",
        "Partida",
        "Previsto",
        "Real",
        "Avance %",
        "Horas",
        "Horas/unidad previstas",
        "Horas/unidad reales",
        "Desvío %",
      ],
      r.production.map((p) => [
        e(p.section),
        e(p.description),
        numeric(p.planned_quantity),
        numeric(p.executed_quantity),
        numeric(p.percent),
        numeric(p.hours),
        p.planned_hours_per_unit == null
          ? "—"
          : numeric(p.planned_hours_per_unit),
        p.actual_hours_per_unit == null
          ? "—"
          : numeric(p.actual_hours_per_unit),
        p.productivity_variance == null
          ? "—"
          : numeric(p.productivity_variance),
      ]),
    );
  }
  function purchasing() {
    const r = model.report;
    return `<details open><summary>Necesidades de materiales según ACU</summary>${table(
      [
        "Insumo",
        "Necesario",
        "Solicitado",
        "Ordenado",
        "Recibido",
        "Consumido neto",
        "Stock",
        "Faltante",
      ],
      (r?.needs || []).map((n) => [
        e(n.description),
        ...[
          n.required,
          n.requested,
          n.ordered,
          n.received,
          n.consumed,
          n.stock,
          n.shortage,
        ].map(numeric),
      ]),
    )}</details><details><summary>Comparativa de cotizaciones</summary>${table(
      ["Pedido", "Oferta", "Proveedor", "Moneda", "Total", "Cobertura"],
      (r?.quotes || []).map((q) => [
        e(
          model.docs.find((d) => d.id === q.reference_id)?.number ||
            "Sin pedido",
        ),
        e(q.number),
        e(partnerName(q.partner_id)),
        e(q.currency),
        money(q.total),
        q.complete ? "Completa" : "Parcial / no comparable",
      ]),
    )}</details><details><summary>Depósitos y existencias</summary><form id="warehouse-form" class="form-grid three">${field("Nombre del depósito", "name", "", "required")}${field("Ubicación / estante", "location", "", "required")}<button type="submit" class="btn">Crear depósito</button><p class="feature-error" role="alert"></p></form>${table(
      ["Depósito", "Insumo", "Moneda", "Existencia", "Valor"],
      model.stock
        .filter((b) =>
          model.warehouses.some(
            (w) => w.id === b.warehouse_id && w.project_id === model.projectId,
          ),
        )
        .map((b) => [
          e(whName(b.warehouse_id)),
          e(
            state.resources.find((r) => r.id === b.resource_id)?.description ||
              b.resource_id,
          ),
          e(b.currency),
          numeric(b.quantity),
          money(b.value),
        ]),
    )}</details>`;
  }
  function finances() {
    return (
      summary(model.report) +
      `<h3>Flujo de fondos por mes</h3>${table(
        [
          "Mes",
          "Moneda",
          "Ingresos previstos",
          "Egresos previstos",
          "Cobros reales",
          "Pagos reales",
        ],
        (model.report?.cash_flow || []).map((p) => [
          e(p.month),
          e(p.currency),
          ...[p.planned_in, p.planned_out, p.actual_in, p.actual_out].map(
            money,
          ),
        ]),
      )}<h3>Resultados por partida y centro de costos</h3><p>Resultado devengado = venta certificada menos consumos netos, servicios aceptados y horas. Las facturas no duplican estos costos.</p>${table(
        [
          "Partida",
          "Centro",
          "Moneda",
          "Costo real",
          "Venta certificada",
          "Resultado devengado",
        ],
        (model.report?.costs || []).map((c) => [
          e(
            c.line_description ||
              model.lines.find((l) => l.id === c.line_id)?.description ||
              "Sin partida",
          ),
          e(
            model.centers.find((x) => x.id === c.center_id)?.name ||
              "Sin centro",
          ),
          e(c.currency),
          money(c.actual),
          money(c.certified_income),
          money(c.result),
        ]),
      )}<h3>Resultados por rubro</h3>${table(
        [
          "Rubro",
          "Moneda",
          "Costo previsto",
          "Costo real",
          "Desvío de costo",
          "Venta certificada",
          "Resultado devengado",
        ],
        (model.report?.section_results || []).map((s) => [
          e(s.section),
          e(s.currency),
          money(s.budget_cost),
          money(s.actual_cost),
          money(s.variance),
          money(s.certified_income),
          money(s.result),
        ]),
      )}`
    );
  }
  function dashboard() {
    return `<p class="context-help">Cartera a ${e(model.asOf)}. Se usa el último presupuesto emitido de cada obra; si no existe, el último borrador. Los importes se muestran por moneda. El costo real proviene de consumos netos, servicios aceptados y horas de partes, sin duplicar las facturas. El costo a terminar utiliza la última proyección o la proporción del costo presupuestado pendiente según producción.</p>${table(
      [
        "Obra",
        "Moneda",
        "Avance físico %",
        "Programado %",
        "Fin programado",
        "Costo previsto",
        "Costo real",
        "Pagado",
        "Cobrado",
        "Resultado esperado",
        "Alertas",
      ],
      model.portfolio.flatMap((r) =>
        r.summaries.map((s) => [
          e(r.name),
          e(s.currency),
          numeric(s.physical_percent),
          r.planned_percent == null ? "—" : numeric(r.planned_percent),
          e(r.scheduled_finish || "Sin plan"),
          money(s.budget_cost),
          money(s.accrued),
          money(s.paid),
          money(s.collected),
          money(s.expected_result),
          e(r.alerts.join(" · ")),
        ]),
      ),
    )}${model.projectId ? finances() + production() : ""}`;
  }
  function detail() {
    const d = model.detail;
    if (!d) return "";
    return `<div class="modal-overlay"><section class="dialog-shell wide" role="dialog" aria-modal="true" aria-label="Documento registrado"><div class="dialog-header"><h2>${e(operationNames[d.kind])} · ${e(d.number)}</h2><button type="button" data-action="ops-close-detail" aria-label="Cerrar documento">×</button></div><div class="dialog-body"><p>${e(d.date)} · ${e(partnerName(d.partner_id))} · ${e(d.currency)} ${money(d.amount)}</p><p>${e(d.notes)}</p><p>${e(d.terms)}</p>${d.period_start ? `<p>Período: ${e(d.period_start)} a ${e(d.period_end)}</p>` : ""}${table(
      ["Descripción", "Cantidad", "Precio", "Horas"],
      d.lines.map((l) => [
        e(l.description),
        numeric(l.quantity),
        money(l.unit_price),
        numeric(l.hours),
      ]),
    )}${table(
      ["Cálculo", "Valor"],
      Object.entries(d.calculated || {}).map(([k, v]) => [e(k), numeric(v)]),
    )}${d.kind === "index" ? `<p>${e(d.index_series)} · ${e(d.index_period)} · ${numeric(d.index_value)}</p><a href="${e(d.index_source)}" target="_blank" rel="noreferrer">${e(d.index_source)}</a>` : ""}<p>${e(d.incidents)}</p><div class="operation-photos">${d.photos.map((p, i) => `<img src="${e(p)}" alt="Foto ${i + 1}">`).join("")}</div><div class="dialog-actions"><button type="button" class="btn" data-action="ops-export-document" data-format="xlsx">Exportar Excel</button><button type="button" class="btn" data-action="ops-export-document" data-format="pdf">Exportar PDF</button><button type="button" class="btn" data-action="ops-close-detail">Cerrar</button></div></div></section></div>`;
  }
  function markup() {
    return `<section class="feature-page operations-page"><div class="work-toolbar">${select("Obra de gestión", "ops-project", [["", "Seleccionar obra"], ...state.projects.map((p) => [p.id, p.name])], model.projectId)}${field("Fecha de corte", "ops-asof", model.asOf, 'type="date" required')}${select("Presupuesto del informe", "ops-estimate", [["", "Automático"], ...model.estimates.map((e) => [e.id, e.title])], model.estimateId)}<button class="btn" data-action="ops-refresh">Actualizar</button></div><nav class="operations-tabs" aria-label="Etapas de gestión">${[
      ["purchases", "Compras y almacenes"],
      ["production", "Producción"],
      ["certificates", "Certificaciones"],
      ["finance", "Finanzas"],
      ["dashboard", "Tablero"],
    ]
      .map(
        ([key, name]) =>
          `<button class="btn ${model.tab === key ? "primary" : ""}" aria-current="${model.tab === key ? "page" : "false"}" data-action="ops-tab" data-tab="${key}">${name}</button>`,
      )
      .join("")}</nav><div class="work-toolbar">${
      model.tab !== "dashboard"
        ? select(
            "Tipo de documento",
            "ops-kind",
            (operationGroups[model.tab] || []).map((k) => [
              k,
              operationNames[k],
            ]),
            model.draft?.kind,
          )
        : ""
    }${model.tab !== "dashboard" ? '<button class="btn" data-action="ops-new">Nuevo documento</button>' : ""}${select(
      "Contenido del informe",
      "ops-report-scope",
      [
        ["summary", "Resumen financiero"],
        ["production", "Producción y rendimientos"],
        ["cash", "Flujo de fondos"],
        ["needs", "Necesidades de materiales"],
        ["stock", "Existencias"],
        ["costs", "Resultados por centro y partida"],
        ["sections", "Resultados por rubro"],
        ["documents", "Documentos"],
        ["portfolio", "Cartera de obras"],
      ],
      model.exportScope || "summary",
    )}<button class="btn" data-action="ops-export" data-format="xlsx">Informe Excel</button><button class="btn" data-action="ops-export" data-format="pdf">Informe PDF</button></div>${model.lastExport ? `<p role="status">Guardado en ${e(model.lastExport)}</p>` : ""}${model.report?.alerts.map((a) => `<p class="operations-alert">${e(a)}</p>`).join("") || ""}${model.tab === "dashboard" ? dashboard() : !model.projectId ? "<p>Seleccioná una obra para comenzar.</p>" : `${model.tab === "purchases" ? purchasing() : model.tab === "production" ? production() : model.tab === "finance" ? finances() : summary(model.report)}${formMarkup()}<h3>Historial de documentos</h3>${documentRows()}`}${detail()}</section>`;
  }
  async function act(button) {
    const a = button.dataset.action;
    if (a === "open-operations") {
      if (state.view === "operations" && !protect()) return;
      model.projectId ||= state.projectId || state.projects[0]?.id || "";
      [model.partners, model.centers] = await Promise.all([
        Promise.all(
          ["supplier", "subcontractor", "contact"].map((kind) =>
            invoke("list_management_records", { kind, projectId: null }),
          ),
        ).then((rows) => rows.flat()),
        invoke("list_management_records", {
          kind: "cost_center",
          projectId: null,
        }),
      ]);
      await refresh();
      if (model.tab !== "dashboard")
        model.draft ||= draft(operationGroups[model.tab][0]);
      state.view = "operations";
      render();
      return;
    }
    if (!a.startsWith("ops-")) return false;
    read();
    if (a === "ops-tab") {
      if (!protect()) return;
      model.tab = button.dataset.tab;
      model.draft =
        model.tab === "dashboard" ? null : draft(operationGroups[model.tab][0]);
      model.dirty = false;
    }
    if (a === "ops-new") {
      if (!protect()) return;
      model.draft = draft(
        document.querySelector('[name="ops-kind"]')?.value ||
          operationGroups[model.tab][0],
      );
      model.dirty = false;
    }
    if (a === "ops-add-line") {
      model.draft.lines.push(newLine());
      model.dirty = true;
    }
    if (a === "ops-remove-line") {
      model.draft.lines.splice(Number(button.dataset.index), 1);
      model.dirty = true;
    }
    if (a === "ops-add-weight") {
      model.draft.adjustment_weights.push({ series: "IPC", weight: "0" });
      model.dirty = true;
    }
    if (a === "ops-remove-weight") {
      model.draft.adjustment_weights.splice(Number(button.dataset.index), 1);
      model.dirty = true;
    }
    if (a === "ops-remove-photo") {
      model.draft.photos.splice(Number(button.dataset.index), 1);
      model.dirty = true;
    }
    if (a === "ops-refresh") await refresh();
    if (a === "ops-detail")
      model.detail = model.docs.find((d) => d.id === button.dataset.id);
    if (a === "ops-close-detail") model.detail = null;
    if (a === "ops-export" || a === "ops-export-document")
      model.lastExport = await exportOperationalReport({
        invoke,
        format: button.dataset.format,
        scope:
          a === "ops-export-document"
            ? "document"
            : model.exportScope || "summary",
        model,
        operationNames,
        partnerName,
        whName,
        state,
      });
    render();
    return true;
  }
  async function change(target) {
    if (state.view !== "operations") return;
    const name = target.name;
    read();
    if (target.closest("#operation-form")) model.dirty = true;
    if (name === "ops-report-scope") {
      model.exportScope = target.value;
      return;
    }
    if (name === "ops-kind") {
      if (!protect()) {
        render();
        return;
      }
      model.draft = draft(target.value);
      model.dirty = false;
      render();
      return;
    }
    if (name === "ops-project") {
      if (!protect()) {
        render();
        return;
      }
      model.projectId = target.value;
      model.estimateId = "";
      await refresh();
      model.draft =
        model.tab === "dashboard" ? null : draft(operationGroups[model.tab][0]);
      model.dirty = false;
      render();
      return;
    }
    if (name === "ops-estimate") {
      if (!protect()) {
        render();
        return;
      }
      model.estimateId = target.value;
      await refresh();
      model.draft =
        model.tab === "dashboard" ? null : draft(operationGroups[model.tab][0]);
      model.dirty = false;
      render();
      return;
    }
    if (name === "ops-asof") {
      model.asOf = target.value;
      await refresh();
      render();
      return;
    }
    if (name === "o:reference_id") {
      const r = model.docs.find((d) => d.id === target.value),
        o = model.draft;
      if (r) {
        if (r.estimate_id)
          model.lines = await invoke("list_estimate_lines", {
            estimateId: r.estimate_id,
          });
        o.partner_id = r.partner_id;
        o.currency = r.currency;
        o.estimate_id =
          r.estimate_id ||
          (model.estimates.find((e) => e.id === model.estimateId)?.currency ===
          r.currency
            ? model.estimateId
            : null) ||
          null;
        if (
          ![
            "payable",
            "receivable",
            "payment",
            "collection",
            "adjustment",
            "advance_paid",
            "retention_payable",
            "retention_receivable",
          ].includes(o.kind)
        )
          o.lines = r.lines.map((l) => ({ ...l }));
        if (["receipt", "service_receipt", "return"].includes(o.kind))
          for (const line of r.lines) {
            if (line.line_id && !model.lines.some((l) => l.id === line.line_id))
              model.lines.push({
                id: line.line_id,
                description: "Partida eliminada · " + line.description,
              archived: true,
              });
          }
        o.amount = r.amount;
        if (["receipt", "service_receipt", "return"].includes(o.kind)) {
          o.lines = o.lines
            .map((l) => {
              const prior = model.docs
                .filter((p) => p.kind === o.kind && p.reference_id === r.id)
                .flatMap((p) => p.lines)
                .filter(
                  (x) =>
                    x.resource_id === l.resource_id &&
                    x.line_id === l.line_id &&
                    x.description === l.description,
                );
              const decimalSubtract = (a, values) => {
                const value = sumDecimals([
                  a,
                  ...values.map((b) => "-" + String(b)),
                ]);
                return value.startsWith("-") ? "0" : value;
              };
              return {
                ...l,
                quantity: decimalSubtract(
                  l.quantity,
                  prior.map((x) => x.quantity),
                ),
              };
            })
            .filter((l) => l.quantity !== "0");
        }
        o.notes = `Origen: ${operationNames[r.kind]} ${r.number}`;
        if (o.kind === "return") o.warehouse_id = r.warehouse_id;
      }
      render();
      return;
    }
    if (name === "o:currency") {
      const o = model.draft;
      if (
        o.estimate_id &&
        model.estimates.find((e) => e.id === o.estimate_id)?.currency !==
          o.currency
      ) {
        o.estimate_id = null;
        o.lines = o.lines.map((l) => ({ ...l, line_id: null }));
      }
      render();
      return;
    }
    if (name === "o:estimate_id") {
      model.lines = target.value
        ? await invoke("list_estimate_lines", { estimateId: target.value })
        : [];
      render();
      return;
    }
    if (name === "resource_id" || name === "line_id") {
      const row = target.closest(".operation-line"),
        index = [
          ...row.parentElement.querySelectorAll(".operation-line"),
        ].indexOf(row);
      const selected = (
        name === "resource_id" ? state.resources : model.lines
      ).find((r) => r.id === target.value);
      if (selected) {
        model.draft.lines[index].description = selected.description;
        model.draft.lines[index].unit_price =
          selected.unit_cost ??
          (model.draft.currency === "ARS" ? selected.price : null) ??
          "0";
      }
      render();
      return;
    }
    if (name === "daily-photos") {
      const files = [...target.files];
      if (
        files.length + model.draft.photos.length > 8 ||
        files.some(
          (f) =>
            f.size > 2_000_000 || !["image/jpeg", "image/png"].includes(f.type),
        )
      )
        throw new Error("Máximo 8 fotos JPG/PNG de 2 MB");
      const photos = await Promise.all(
        files.map(
          (f) =>
            new Promise((resolve, reject) => {
              const reader = new window.FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(f);
            }),
        ),
      );
      model.draft.photos.push(...photos);
      render();
    }
  }
  async function submit(form) {
    if (form.id === "warehouse-form") {
      const data = new FormData(form);
      await invoke("create_warehouse", {
        warehouse: {
          id: window.crypto.randomUUID(),
          project_id: model.projectId,
          name: String(data.get("name")).trim(),
          location: String(data.get("location")).trim(),
        },
      });
      await refresh();
      render();
      return;
    }
    read();
    const saved = await invoke("post_operation", { operation: model.draft });
    model.dirty = false;
    model.draft = draft(saved.kind);
    await refresh();
    model.detail = saved;
    render();
  }
  function input(target) {
    if (state.view === "operations" && target.closest?.("#operation-form")) {
      read();
      model.dirty = true;
    }
  }
  function keyDown(evt) {
    if (model.detail && state.view === "operations" && evt.key === "Escape") {
      evt.preventDefault();
      model.detail = null;
      render();
      return true;
    }
    return false;
  }
  return { markup, act, change, submit, input, keyDown, protect, model };
}
