import { createSiteBook } from "./site-book.js";
import { createCertificateWorkflow } from "./certificate-workflow.js";
import { createQuotationWorkflow } from "./quotation-workflow.js";
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
    "stock_opening",
    "receipt",
    "service_receipt",
    "consumption",
    "return",
    "transfer",
  ],
  production: ["daily"],
  certificates: ["adjustment"],
  contracts: ["subcontract"],
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
  stock_opening: "Declarar acopio existente",
  receipt: "Remito / recepción parcial",
  service_receipt: "Recepción de servicio",
  consumption: "Consumo de materiales",
  return: "Devolución de consumo",
  transfer: "Transferencia entre depósitos",
  daily: "Parte diario",
  certificate: "Certificado de avance",
  subcertificate: "Certificado de subcontratista",
  index: "Índice de precios",
  adjustment: "Ajuste de certificado anterior sin acuerdo",
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
  stock_opening:
    "Declaración de material que ya pertenece a la obra. Indicá depósito, cantidad disponible y valor de inventario. No genera una compra, deuda ni salida de caja; si todavía debés pagarlo, registrá la factura por separado.",
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
    "Registro anterior por obra. Las nuevas publicaciones se cargan en Inicio → Datos generales y se heredan según el acuerdo de cada presupuesto.",
  adjustment:
    "Solo para certificados anteriores que no tenían acuerdo automático. Cargá publicaciones nuevas en Inicio → Datos generales. Los certificados con acuerdo usan sus diferencias pendientes, sin este ajuste manual.",
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
    pendingDifferences: [],
    indexPreview: null,
    portfolio: [],
    draft: null,
    dirty: false,
    detail: null,
    lastExport: "",
    cashSettings: null,
  };
  const book = createSiteBook({
    invoke,
    state,
    model,
    render,
    document,
    window,
    FormData,
  });
  const certificates = createCertificateWorkflow({
    invoke,
    state,
    model,
    render,
    document,
    window,
    FormData,
    refresh: async () => {
      await refresh();
      if (model.tab === "contracts") await quotations.load();
    },
  });
  const quotations = createQuotationWorkflow({
    invoke,
    state,
    model,
    render,
    document,
    window,
    FormData,
    refresh,
  });
  function draft(kind) {
    return {
      id: window.crypto.randomUUID(),
      project_id: model.projectId,
      kind,
      contract_terms:
        kind === "subcontract"
          ? {
              method: "quantity",
              frequency: "weekly",
              rate: "0",
              ceiling: "0",
              forecast_units: "1",
              start: "",
              end: "",
              scope: "Mano de obra",
              contributes_progress: true,
              payment_delay_days: 0,
              advance_recovery_percent: "0",
              retention_percent: "0",
            }
          : null,
      number: "",
      date: dateToday(),
      currency:
        model.estimates.find((e) => e.id === model.estimateId)?.currency ||
        "ARS",
      partner_id: null,
      reference_id: null,
      price_cost: null,
      extras: [],
      reconcile_ids: [],
      index_snapshot: null,
      reconciliations: [],
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
  const consultationDate = () =>
    state.remoteProject?.data.as_of ||
    (model.tab === "finance" ? model.asOf : dateToday());
  async function refresh() {
    model.docs = await invoke("list_operations", {
      projectId: model.projectId || null,
    });
    model.warehouses = await invoke("list_warehouses");
    model.stock = (
      await invoke("stock_balances", { asOf: consultationDate() })
    ).filter((b) =>
      model.warehouses.some(
        (w) => w.id === b.warehouse_id && w.project_id === model.projectId,
      ),
    );

    if (model.projectId) {
      model.estimates = await invoke("list_project_estimates", {
        projectId: model.projectId,
      });
      model.estimateId = state.estimateId || "";
      model.report = await invoke("operations_report", {
        projectId: model.projectId,
        estimateId: model.estimateId || null,
        asOf: consultationDate(),
      });
      model.portfolio = [model.report];
      model.pendingDifferences =
        (await invoke("pending_adjustment_differences", {
          projectId: model.projectId,
          asOf: consultationDate(),
        })) || [];
      model.lines = model.estimateId
        ? await invoke("list_estimate_lines", { estimateId: model.estimateId })
        : [];
    } else {
      model.portfolio = [];
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
    if (o.kind === "subcontract") {
      o.contract_terms ||= {};
      for (const k of [
        "method",
        "frequency",
        "rate",
        "ceiling",
        "forecast_units",
        "start",
        "end",
        "scope",
        "advance_recovery_percent",
        "retention_percent",
      ])
        o.contract_terms[k] = String(
          data.get("contract:" + k) || o.contract_terms[k] || "",
        );
      o.contract_terms.payment_delay_days = Number(
        data.get("contract:payment_delay_days") || 0,
      );
      o.contract_terms.contributes_progress = data.has(
        "contract:contributes_progress",
      );
    }
    const rental = String(data.get("rental-link") || "").split("|");
    o.price_cost =
      o.kind === "payable" && rental.length === 3
        ? { row_id: rental[0], item_id: rental[1], period_start: rental[2] }
        : null;
    o.extras = [...form.querySelectorAll("[data-certificate-extra]")].map(
      (row) => {
        const val = (n) => row.querySelector(`[name="${n}"]`)?.value || "",
          checked = (n) => Boolean(row.querySelector(`[name="${n}"]`)?.checked);
        return {
          id: row.dataset.certificateExtra,
          description: val("extra-description"),
          reason: val("extra-reason"),
          authorization: val("extra-authorization"),
          amount: val("extra-amount"),
          adjustable: checked("extra-adjustable"),
          retention: checked("extra-retention"),
          recover_advance: checked("extra-advance"),
        };
      },
    );
    o.reconcile_ids = data.getAll("certificate-difference").map(String);
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
    if (!book.protect() || !certificates.protect() || !quotations.protect())
      return false;
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
  function certificateExtras(o) {
    if (o.kind !== "certificate") return "";
    const pending = model.pendingDifferences.filter(
      (d) => d.estimate_id === o.estimate_id,
    );
    return `<fieldset class="certificate-extras"><legend>Ajuste y adicionales de este certificado</legend><p>El ajuste se calcula al registrar con el acuerdo del presupuesto y las publicaciones conocidas a la fecha de emisión. Los trabajos que amplían el alcance se cargan como partidas en un rubro de adicionales; los siguientes cargos puntuales se cobran completos, una sola vez. Si son ajustables, ingresá su importe a valores del mes base; si son fijos, ingresá el importe final pactado.</p><button type="button" class="btn" data-action="ops-preview-index">Consultar índice a aplicar</button>${model.indexPreview ? `<p role="status">${e(model.indexPreview.message)}</p>` : ""}<h4>Diferencias pendientes de certificados anteriores</h4>${pending.map((d) => `<label><input type="checkbox" name="certificate-difference" value="${d.source_id}" ${(o.reconcile_ids || []).includes(d.source_id) ? "checked" : ""}> Certificado ${e(d.source_number)} · diferencia ${money(d.delta)} · reparo ${money(d.retention_delta)} · coeficiente ${numeric(d.from_factor)} → ${numeric(d.snapshot.factor)} ${d.snapshot.provisional ? "(aún provisorio)" : "(definitivo)"}</label>`).join("") || "<p>No hay diferencias pendientes publicadas para este presupuesto.</p>"}${(o.extras || []).map((x, i) => `<fieldset data-certificate-extra="${x.id}"><legend>Adicional puntual ${i + 1}</legend><div class="form-grid three">${field("Descripción del adicional", "extra-description", x.description, 'required maxlength="500"')}${field("Motivo del adicional", "extra-reason", x.reason, 'required maxlength="2000"')}${field("Autorización / referencia del comitente", "extra-authorization", x.authorization, 'required maxlength="2000"')}${field("Importe completo del adicional", "extra-amount", x.amount, 'type="number" min="0.000001" step="any" required')}</div><label><input type="checkbox" name="extra-adjustable" ${x.adjustable ? "checked" : ""}> Aplicar ajuste de índices</label><label><input type="checkbox" name="extra-retention" ${x.retention ? "checked" : ""}> Aplicar fondo de reparo</label><label><input type="checkbox" name="extra-advance" ${x.recover_advance ? "checked" : ""}> Permitir recuperar anticipo</label><button type="button" class="btn" data-action="ops-remove-extra" data-index="${i}">Quitar adicional</button></fieldset>`).join("")}<button type="button" class="btn" data-action="ops-add-extra">Agregar adicional puntual</button></fieldset>`;
  }
  function contractTerms(o) {
    const t = o.contract_terms || {};
    return `<fieldset><legend>Asignación y acuerdo del contratista / cuadrilla</legend><p>Asigná partidas y cantidades en los renglones. El precio es el costo pactado con el contratista, separado del precio de venta al comitente. Al aprobar su certificado se reconoce el costo y se ofrece su avance al certificado del comitente; no registres otra recepción del mismo trabajo.</p><div class="workflow-grid">${field("Alcance: mano de obra / materiales / equipos", "contract:scope", t.scope || "Mano de obra", "required")}${select(
      "Modalidad de liquidación",
      "contract:method",
      [
        ["quantity", "Por cantidades ejecutadas"],
        ["percent", "Por avance porcentual"],
        ["fixed", "Importe fijo por período"],
        ["daily", "Por jornada"],
        ["hourly", "Por hora"],
      ],
      t.method || "quantity",
    )}${select(
      "Frecuencia de pago",
      "contract:frequency",
      [
        ["weekly", "Semanal (viernes)"],
        ["fortnight", "Quincenal (15 y fin de mes)"],
        ["monthly", "Mensual"],
        ["by_progress", "Al certificar avance"],
      ],
      t.frequency || "weekly",
    )}${field("Tarifa por período / jornada / hora", "contract:rate", t.rate || "0", 'type="number" min="0" step="any"')}${field("Tope total para tarifa fija o por tiempo", "contract:ceiling", t.ceiling || "0", 'type="number" min="0" step="any"')}${field("Jornadas / horas estimadas por pago", "contract:forecast_units", t.forecast_units || "1", 'type="number" min="0" step="any"')}${field("Inicio contratado", "contract:start", t.start || "", 'type="date"')}${field("Fin contratado", "contract:end", t.end || "", 'type="date"')}${field("Demora de pago (días)", "contract:payment_delay_days", t.payment_delay_days || 0, 'type="number" min="0" max="365"')}${field("Recuperación de anticipo %", "contract:advance_recovery_percent", t.advance_recovery_percent || "0", 'type="number" min="0" max="100" step="any"')}${field("Fondo de reparo %", "contract:retention_percent", t.retention_percent || "0", 'type="number" min="0" max="100" step="any"')}</div><label><input name="contract:contributes_progress" type="checkbox" ${t.contributes_progress !== false ? "checked" : ""}> Este contrato aporta ejecución física (desmarcar apoyos, alquileres y servicios que no suman cantidades)</label></fieldset>`;
  }
  function formMarkup() {
    const o = model.draft;
    if (!o) return "";
    const stockKinds = [
      "stock_opening",
      "receipt",
      "consumption",
      "return",
      "transfer",
    ];
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
    return `<form id="operation-form" class="operations-form"><h3>${e(operationNames[o.kind])}</h3><p class="context-help">${e(guides[o.kind])} Los documentos registrados conservan su historial y no se sobrescriben.</p><div class="form-grid three">${field("Número / referencia", "o:number", o.number, ["stock_opening", "subcontract", "quote", "rfq"].includes(o.kind) ? 'readonly placeholder="Automático al registrar"' : 'required maxlength="100"')}${field("Fecha", "o:date", o.date, 'type="date" required')}${select(
      "Moneda",
      "o:currency",
      [
        ["ARS", "ARS"],
        ["USD", "USD"],
      ],
      o.currency,
    )}${select("Contraparte", "o:partner_id", [["", "Comitente / sin contraparte"], ...model.partners.filter((p) => p.attributes?.person_primary !== "false" || p.id === o.partner_id).map((p) => [p.id, p.name + ((state.projects.find((x) => x.id === state.projectId)?.supplier_ids || []).includes(p.attributes?.person_id || p.id) ? " · Vinculado a la obra" : "")])], o.partner_id)}${available.length || ["rfq", "quote", "purchase_order", "service_order", "subcontract", "receipt", "service_receipt", "return", "subcertificate", "adjustment", "payable", "receivable", "payment", "collection", "advance_paid", "retention_payable", "retention_receivable"].includes(o.kind) ? select("Documento de origen", "o:reference_id", [["", "Sin origen"], ...available.map((d) => [d.id, `${operationNames[d.kind]} · ${d.number} · ${partnerName(d.partner_id)} · ${d.currency} ${money(d.amount)}`])], o.reference_id) : ""}${select("Presupuesto de referencia", "o:estimate_id", [["", "Sin vínculo"], ...model.estimates.filter((x) => x.id === model.estimateId || x.id === o.estimate_id).map((x) => [x.id, x.title + (x.issued ? " · Emitido" : " · Borrador")])], o.estimate_id)}</div>
 ${o.kind === "payable" ? select("Alquiler / gasto mensual previsto (opcional)", "rental-link", [["", "Sin vínculo"], ...(model.report?.recurring_costs || []).filter((r) => r.currency === o.currency).map((r) => [rentalKey(r), `${r.description} · ${r.period_start} → ${r.period_end}`])], o.price_cost ? rentalKey(o.price_cost) : "") + '<p class="modal-help">Para un gasto mensual elegí su período y dejá Documento de origen sin vínculo. La factura reemplaza la previsión; registrá su pago por separado.</p>' : ""}

 ${stockKinds.includes(o.kind) ? `<div class="form-grid">${select("Depósito", "o:warehouse_id", opts(model.warehouses.filter((w) => w.project_id === model.projectId)), o.warehouse_id)}${o.kind === "transfer" ? select("Depósito de destino", "o:destination_id", [["", "Seleccionar…"], ...model.warehouses.map((w) => [w.id, whName(w.id)])], o.destination_id) : ""}</div>` : ""}
 ${cert ? `<div class="form-grid three">${field("Inicio del período", "o:period_start", o.period_start, 'type="date" required')}${field("Fin del período", "o:period_end", o.period_end, 'type="date" required')}${field("Anticipo a descontar", "o:advance", o.advance, 'type="number" min="0" step="any" required')}${field("Otros descuentos", "o:discount", o.discount, 'type="number" min="0" step="any" required')}${field("Fondo de reparo %", "o:retention_percent", o.retention_percent, 'type="number" min="0" max="100" step="any" required')}${field("Vencimiento", "o:due_date", o.due_date, 'type="date" required')}</div>` : ""}
 ${o.kind === "payable" && model.partners.find((p) => p.id === o.partner_id)?.kind === "crew" ? `<div class="form-grid three">${field("Inicio de la liquidación", "o:period_start", o.period_start, 'type="date" required')}${field("Fin de la liquidación", "o:period_end", o.period_end, 'type="date" required')}${field("Anticipo a descontar del importe bruto", "o:advance", o.advance || "0", 'type="number" min="0" step="any" required')}</div><p>El importe ingresado es bruto; se descontará este anticipo para obtener el neto por pagar.</p>` : ""}
 ${o.kind === "subcontract" ? contractTerms(o) : ""}
 ${certificateExtras(o)}
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
                       ["contracts", "Subcontrataciones"],
                       ["production", "Libro de obra"],
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
             }${select("Insumo (opcional)", "resource_id", opts(state.resources), l.resource_id)}${select("Partida (opcional)", "line_id", opts(model.lines.filter((line) => !line.archived || ["receipt", "service_receipt", "return"].includes(o.kind))), l.line_id)}${select("Centro de costos", "center_id", opts(model.centers.filter((c) => !c.project_id || c.project_id === model.projectId)), l.center_id)}${field("Descripción del renglón", "description", l.description, 'required maxlength="1000"')}${field(o.kind === "daily" ? "Cantidad producida" : "Cantidad del período / movimiento", "quantity", l.quantity, 'type="number" min="0.000001" step="any" required')}${field(o.kind === "daily" ? "Costo por hora" : "Precio unitario", "unit_price", l.unit_price, 'type="number" min="0" step="any" required')}${o.kind === "daily" ? field("Horas trabajadas / equipo", "hours", l.hours, 'type="number" min="0" step="any" required') : ""}</div><button type="button" class="btn" data-action="ops-remove-line" data-index="${i}">Quitar renglón</button></fieldset>`,
         )
         .join("")}`
     : ""
 }
 ${["subcontract", "service_order", "purchase_order"].includes(o.kind) ? field("Fecha prevista de pago del saldo", "o:due_date", o.due_date, 'type="date" required') + `<label>Condiciones, alcance, plazos y forma de pago<textarea name="o:terms">${e(o.terms)}</textarea></label>` : ""}<label>Observaciones<textarea name="o:notes">${e(o.notes)}</textarea></label><p class="feature-error" role="alert"></p><button type="submit" class="btn primary">Registrar ${e(operationNames[o.kind].toLowerCase())}</button></form>`;
  }
  function documentRows() {
    const kinds = operationGroups[model.tab] || [];
    return table(
      [
        "Fecha",
        "Tipo",
        "Número",
        "Contraparte",
        "Presupuesto",
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
          e(
            model.estimates.find((est) => est.id === d.estimate_id)?.title ||
              "Sin vínculo",
          ),
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
  const rentalKey = (r) => `${r.row_id}|${r.item_id}|${r.period_start}`;
  function rentals() {
    return `<h3>Alquileres y gastos mensuales previstos</h3><p>Provienen del detalle guardado en Determinación de precio del presupuesto activo. Vinculá las facturas con su período para reemplazar la previsión. Una previsión no registra deuda ni un pago.</p>${table(
      [
        "Concepto",
        "Período",
        "Vencimiento",
        "Moneda",
        "Presupuestado",
        "Facturado",
        "Sin facturar",
      ],
      (model.report?.recurring_costs || []).map((r) => [
        e(r.description),
        e(r.period_start + " → " + r.period_end),
        e(r.due_date),
        e(r.currency),
        money(r.amount),
        money(r.invoiced),
        money(r.unbilled),
      ]),
    )}`;
  }
  function financialProjection() {
    const f = model.report?.financial_projection;
    if (!f)
      return "<p>Guardá el cronograma en Planificación para consultar la previsión financiera.</p>";
    return `<section class="financial-projection"><h2>Previsión financiera · ${e(f.currency)}</h2><p>Desde el día siguiente al corte de seguimiento (${e(f.as_of)}). Caja inicial declarada: <strong>${money(f.opening_cash)}</strong>. Capital adicional máximo previsto: <strong>${money(f.additional_cash)}</strong>.</p><p>Los cobros por certificación son estimaciones del cronograma, no certificados emitidos. Las compras se prevén para el día en que se necesitan; anticipá sus fechas si el proveedor requiere pago o entrega previa. No se convierten monedas. Los egresos se consideran antes que los cobros del mismo día.</p>${(f.warnings || []).map((w) => `<p class="context-help">${e(w)}</p>`).join("")}${f.periods
      .map(
        (p) =>
          `<details class="planning-options" open><summary>Período ${e(p.start)} → ${e(p.end)} · Egresos ${money(p.expenses)} · Caja adicional ${money(p.additional_cash)}</summary><p>Certificación prevista: bruto ${money(p.gross)} − anticipo ${money(p.advance)} − reparo ${money(p.retention)} = <strong>${money(p.net)}</strong>. Cobro previsto: ${e(p.collection_date)}. Ingresos durante el período: ${money(p.receipts)}.</p>${table(
            [
              "Material",
              "Unidad",
              "Necesario",
              "Del acopio",
              "Comprado por recibir",
              "Comprar",
              "Costo de compra",
            ],
            p.materials.map((m) => [
              e(m.description),
              e(m.unit),
              numeric(m.required),
              numeric(m.from_stock),
              numeric(m.pending_order),
              numeric(m.purchase),
              money(m.cost),
            ]),
          )}</details>`,
      )
      .join(
        "",
      )}<details class="planning-options"><summary>Calendario de ingresos, egresos y saldo previsto</summary>${table(
      ["Fecha", "Concepto", "Ingreso", "Egreso", "Saldo"],
      f.events.map((x) => [
        e(x.date),
        e(x.description),
        money(x.income),
        money(x.expense),
        money(x.balance),
      ]),
    )}</details></section>`;
  }
  function cashSettings() {
    const p = model.cashSettings;
    if (!p) return "";
    return `<form id="workflow-cash-form" class="workflow-card"><h3>Caja disponible de esta obra</h3><p>Saldo disponible a la fecha de seguimiento. No modifica movimientos contables; sirve como punto de partida de la previsión.</p><div class="feature-toolbar">${field("Caja disponible", "opening_cash", p.plan.finance?.opening_cash || "0", 'type="number" min="0" step="any" required')}${select(
      "Moneda de la caja",
      "cash_currency",
      [
        ["ARS", "ARS"],
        ["USD", "USD"],
      ],
      p.plan.finance?.cash_currency || "ARS",
    )}<button class="btn primary" type="submit">Guardar caja</button><button class="btn" type="button" data-action="ops-cash-close">Cerrar</button></div></form>`;
  }
  function financeDashboard() {
    const f = model.report?.financial_projection;
    if (!f)
      return (
        cashSettings() +
        '<button class="btn" data-action="ops-cash-open">Configurar caja disponible</button>'
      );
    const next = f.periods.find((p) => p.end >= model.asOf);
    if (!next)
      return (
        cashSettings() +
        '<section class="workflow-card"><button class="btn" data-action="ops-cash-open">Configurar caja disponible</button>No hay próximos cortes de certificación. Marcá las fechas en el Gantt.</section>'
      );
    const until = f.events.filter((x) => x.date <= next.collection_date),
      expenses = sumDecimals(until.map((x) => x.expense)),
      confirmed = sumDecimals(
        until
          .filter((x) => x.kind !== "planned_certificate")
          .map((x) => x.income),
      );
    let balance = Number(f.opening_cash),
      minimum = balance;
    for (const x of until) {
      balance += Number(x.income) - Number(x.expense);
      minimum = Math.min(minimum, balance);
    }
    return (
      cashSettings() +
      `<section class="workflow-card"><button class="btn" data-action="ops-cash-open">Configurar caja disponible</button><h2>Próxima certificación · ${e(next.end)}</h2><p>Financiamiento hasta el cobro previsto (${e(next.collection_date)}), incluyendo días posteriores al corte. Moneda ${e(f.currency)}. Los gastos mensuales, acopio y obligaciones se concilian con la previsión detallada.</p><div class="workflow-summary">${[
        ["Cobro posible del corte", next.net],
        ["Gastos hasta el cobro", expenses],
        ["Otros cobros confirmados", confirmed],
        ["Caja disponible declarada", f.opening_cash],
        ["Capital adicional estimado", String(Math.max(0, -minimum))],
        ["Avance oficial certificado %", model.report.certified_percent || "0"],
      ]
        .map(([label, value]) => `<div>${label}<b>${money(value)}</b></div>`)
        .join(
          "",
        )}</div><h3>Avances de contratistas aprobados pendientes de certificar</h3><p>${certificates.view.available.length} renglones disponibles. Incorporarlos al borrador del comitente los valoriza a sus precios de venta. El Gantt refleja únicamente certificados emitidos.</p>${table(
        ["Certificado contratista", "Partida", "Cantidad pendiente"],
        certificates.view.available.map((x) => [
          e(x.number),
          e(x.description),
          numeric(x.quantity),
        ]),
      )}</section>`
    );
  }
  function finances() {
    return (
      summary(model.report) +
      financialProjection() +
      rentals() +
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
    if (state.remoteProject?.data.permissions?.accounting === false)
      return `<p class="context-help">El propietario no compartió información contable. Se muestra la producción autorizada de esta obra.</p>${production()}`;
    return `<p class="context-help">${state.view === "portfolio" ? "Cartera global: último presupuesto emitido de cada obra, o último borrador si no hay emitidos." : "Tablero de esta obra con el presupuesto activo indicado arriba."} Fecha de corte: ${e(model.asOf)}. Los importes se muestran por moneda. El costo real proviene de consumos netos, servicios aceptados y horas de partes, sin duplicar las facturas. El costo a terminar utiliza la última proyección o la proporción del costo presupuestado pendiente según producción.</p>${table(
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
  function certificateAnnex(d) {
    const snap = d.index_snapshot;
    return `${
      snap
        ? `<h4>Ajuste ${snap.provisional ? "provisorio" : "definitivo"} · coeficiente ${numeric(snap.factor)}</h4><p>Mes base ${e(snap.agreement.base_month)} · mes objetivo ${e(snap.target_month)} · mes aplicado ${e(snap.applied_month)}.</p>${table(
            [
              "Índice",
              "Peso",
              "Puntaje base",
              "Puntaje aplicado",
              "Publicación",
            ],
            snap.indices.map((x) => [
              e(x.series),
              numeric(x.weight),
              numeric(x.base.value),
              numeric(x.current.value),
              e(x.current.publication_date),
            ]),
          )}`
        : ""
    }${
      (d.extras || []).length
        ? `<h4>Adicionales puntuales</h4>${table(
            [
              "Descripción",
              "Motivo",
              "Autorización",
              "Importe base",
              "Ajustable",
            ],
            d.extras.map((x) => [
              e(x.description),
              e(x.reason),
              e(x.authorization),
              money(x.amount),
              x.adjustable ? "Sí" : "No",
            ]),
          )}`
        : ""
    }${
      (d.reconciliations || []).length
        ? `<h4>Diferencias de ajuste incluidas</h4>${table(
            [
              "Certificado original",
              "Diferencia",
              "Reparo",
              "Nuevo coeficiente",
            ],
            d.reconciliations.map((x) => [
              e(x.source_number),
              money(x.delta),
              money(x.retention_delta),
              numeric(x.snapshot.factor),
            ]),
          )}`
        : ""
    }`;
  }
  function detail() {
    const d = model.detail;
    if (!d) return "";
    return `<div class="modal-overlay"><section class="dialog-shell wide" role="dialog" aria-modal="true" aria-label="Documento registrado"><div class="dialog-header"><h2>${e(operationNames[d.kind])} · ${e(d.number)}</h2><button type="button" data-action="ops-close-detail" aria-label="Cerrar documento">×</button></div><div class="dialog-body"><p>Presupuesto del documento: <strong>${e(model.estimates.find((est) => est.id === d.estimate_id)?.title || "Sin vínculo")}</strong></p><p>${e(d.date)} · ${e(partnerName(d.partner_id))} · ${e(d.currency)} ${money(d.amount)}</p><p>${e(d.notes)}</p><p>${e(d.terms)}</p>${d.period_start ? `<p>Período: ${e(d.period_start)} a ${e(d.period_end)}</p>` : ""}${certificateAnnex(d)}${table(
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
  async function refreshPortfolio() {
    model.portfolio = await invoke("operations_portfolio", {
      asOf: model.asOf,
    });
  }
  function markup() {
    if (state.view === "portfolio")
      return `<main class="feature-page"><div class="feature-toolbar"><h1>Cartera de obras</h1>${field("Fecha de corte", "portfolio-asof", model.asOf, 'type="date" required')}<button class="btn" data-action="ops-portfolio-refresh">Actualizar cartera</button><button class="btn" data-action="ops-export" data-format="xlsx">Informe Excel</button><button class="btn" data-action="ops-export" data-format="pdf">Informe PDF</button></div>${dashboard()}${model.lastExport ? `<p role="status">Guardado en ${e(model.lastExport)}</p>` : ""}</main>`;
    return `<section class="feature-page operations-page"><nav class="operations-tabs" aria-label="Etapas de gestión">${[
      ["purchases", "Materiales y Acopio"],
      ["contracts", "Subcontrataciones"],
      ["production", "Libro de obra"],
      ["certificates", "Certificaciones"],
      ["finance", "Finanzas"],
      ["dashboard", "Tablero"],
    ]
      .filter(
        ([key]) =>
          !state.remoteProject ||
          state.remoteProject.data.permissions?.accounting !== false ||
          !["finance", "certificates"].includes(key),
      )
      .map(
        ([key, name]) =>
          `<button class="btn ${model.tab === key ? "primary" : ""}" aria-current="${model.tab === key ? "page" : "false"}" data-action="ops-tab" data-tab="${key}">${name}</button>`,
      )
      .join("")}</nav>${
      ["finance", "dashboard"].includes(model.tab)
        ? `<div class="work-toolbar">${
            model.tab === "finance"
              ? select(
                  "Tipo de documento",
                  "ops-kind",
                  (operationGroups[model.tab] || [])
                    .filter(
                      (k) =>
                        k !== "index" &&
                        (k !== "adjustment" ||
                          model.docs.some(
                            (d) =>
                              d.kind === "certificate" &&
                              !d.index_snapshot &&
                              d.calculated?.index_factor === undefined,
                          )),
                    )
                    .map((k) => [k, operationNames[k]]),
                  model.draft?.kind,
                )
              : ""
          }${model.tab === "finance" ? '<button class="btn" data-action="ops-new">Nuevo documento</button>' : ""}${select(
            "Contenido del informe",
            "ops-report-scope",
            [
              ["summary", "Resumen financiero"],
              ["production", "Producción y rendimientos"],
              ["cash", "Flujo de fondos"],
              ["financial", "Previsión financiera y materiales por período"],
              ["needs", "Necesidades de materiales"],
              ["stock", "Existencias"],
              ["costs", "Resultados por centro y partida"],
              ["sections", "Resultados por rubro"],
              ["documents", "Documentos"],
            ],
            model.exportScope || "summary",
          )}<button class="btn" data-action="ops-export" data-format="xlsx">Informe Excel</button><button class="btn" data-action="ops-export" data-format="pdf">Informe PDF</button></div>`
        : ""
    }${model.lastExport ? `<p role="status">Guardado en ${e(model.lastExport)}</p>` : ""}${model.report?.alerts.map((a) => `<p class="operations-alert">${e(a)}</p>`).join("") || ""}${model.tab === "dashboard" ? dashboard() : !model.projectId ? "<p>Seleccioná una obra para comenzar.</p>" : `${model.tab === "purchases" ? quotations.markup() : model.tab === "contracts" ? quotations.markup() + certificates.contracts() : model.tab === "production" ? book.markup() : model.tab === "finance" ? `<div class="feature-toolbar">${field("Consultar al", "ops-asof", model.asOf, 'type="date" required')}<button class="btn" data-action="ops-refresh">Actualizar</button></div>` + financeDashboard() + certificates.overview() + finances() : model.tab === "certificates" ? certificates.markup() : summary(model.report)}${state.remoteProject || (!["finance"].includes(model.tab) && model.draft?.kind !== "stock_opening") ? "" : formMarkup()}${model.tab === "finance" ? "<h3>Historial de documentos</h3>" + documentRows() : ""}`}${detail()}</section>`;
  }
  async function act(button) {
    const a = button.dataset.action;
    if (a === "open-portfolio") {
      if (state.projectId)
        throw new Error("La cartera global se consulta desde Inicio");
      model.projectId = "";
      model.estimateId = "";
      model.draft = null;
      model.dirty = false;
      model.report = null;
      model.detail = null;
      model.lines = [];
      model.docs = [];
      model.lastExport = "";
      model.exportScope = "portfolio";
      model.portfolio = [];
      await refreshPortfolio();
      state.view = "portfolio";
      render();
      return;
    }
    if (a === "ops-portfolio-refresh") {
      await refreshPortfolio();
      render();
      return;
    }
    if (
      (await book.act(button)) ||
      (await certificates.act(button)) ||
      (await quotations.act(button))
    )
      return true;
    if (a === "open-operations") {
      if (state.view === "operations" && !protect()) return;
      if (!state.projectId) throw new Error("Abrí una obra desde Inicio");
      model.projectId = state.projectId;
      model.projectName =
        state.projects.find((p) => p.id === state.projectId)?.name || "Obra";
      model.estimateId = state.estimateId || "";
      model.draft = null;
      model.detail = null;
      model.dirty = false;
      model.lastExport = "";
      model.exportScope = "summary";
      [model.partners, model.centers] = await Promise.all([
        Promise.all(
          ["supplier", "subcontractor", "contact", "crew"].map((kind) =>
            invoke("list_management_records", { kind, projectId: null }),
          ),
        ).then((rows) => rows.flat()),
        invoke("list_management_records", {
          kind: "cost_center",
          projectId: null,
        }),
      ]);
      model.partners = model.partners.filter(
        (p) => !p.project_id || p.project_id === model.projectId,
      );
      model.centers = model.centers.filter(
        (c) => !c.project_id || c.project_id === model.projectId,
      );
      if (state.remoteProject) {
        const p = state.remoteProject.data.permissions || {};
        model.tab = p.operations === false ? "finance" : "dashboard";
        model.asOf = state.remoteProject.data.as_of || model.asOf;
        model.draft = null;
        model.exportScope = p.accounting === false ? "production" : "summary";
      }
      await refresh();
      await certificates.load();
      await quotations.load();
      if (model.tab === "production") await book.load();
      if (model.tab === "finance")
        model.draft ||= draft(operationGroups[model.tab][0]);
      state.view = "operations";
      render();
      return;
    }
    if (!a.startsWith("ops-")) return false;
    if (a === "ops-cash-open") {
      model.cashSettings = await invoke("get_project_plan", {
        projectId: model.projectId,
      });
      if (!model.cashSettings)
        throw new Error("Guardá primero la planificación de la obra");
      render();
      return true;
    }
    if (a === "ops-cash-close") {
      model.cashSettings = null;
      render();
      return true;
    }
    read();
    if (a === "ops-tab") {
      if (!protect()) return;
      model.tab = button.dataset.tab;
      model.draft =
        model.tab === "finance" ? draft(operationGroups.finance[0]) : null;
      model.dirty = false;
      await refresh();
      {
        if (["certificates", "finance"].includes(model.tab))
          await certificates.load();
        if (["purchases", "contracts"].includes(model.tab))
          await quotations.load();
        if (model.tab === "production") await book.load();
      }
    }
    if (a === "ops-stock-declare") {
      let warehouse = model.warehouses.find(
        (w) => w.project_id === model.projectId,
      );
      if (!warehouse) {
        warehouse = await invoke("create_warehouse", {
          warehouse: {
            id: window.crypto.randomUUID(),
            project_id: model.projectId,
            name: "Acopio de obra",
            location: "Obra",
          },
        });
        model.warehouses.push(warehouse);
      }
      model.draft = draft("stock_opening");
      model.draft.warehouse_id = warehouse.id;
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
    if (a === "ops-add-extra") {
      model.draft.extras ||= [];
      model.draft.extras.push({
        id: window.crypto.randomUUID(),
        description: "",
        reason: "",
        authorization: "",
        amount: "0",
        adjustable: false,
        retention: false,
        recover_advance: false,
      });
      model.dirty = true;
    }
    if (a === "ops-remove-extra") {
      model.draft.extras.splice(Number(button.dataset.index), 1);
      model.dirty = true;
    }
    if (a === "ops-preview-index") {
      const o = model.draft;
      model.pendingDifferences =
        (await invoke("pending_adjustment_differences", {
          projectId: model.projectId,
          asOf: o.date,
        })) || [];
      try {
        const p = await invoke("certificate_index_preview", {
          estimateId: o.estimate_id,
          cut: o.period_end,
          asOf: o.date,
        });
        model.indexPreview = {
          message: p
            ? `${p.provisional ? "Provisorio" : "Definitivo"}: mes ${p.applied_month}, corresponde ${p.target_month}; coeficiente ${numeric(p.factor)}.`
            : "Este presupuesto no tiene ajuste pactado.",
        };
      } catch (error) {
        model.indexPreview = { message: String(error) };
      }
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
    if (state.view === "portfolio" && target.name === "portfolio-asof") {
      model.asOf = target.value;
      await refreshPortfolio();
      render();
      return;
    }
    if (state.view !== "operations") return;
    if (await quotations.change(target)) return;
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
      model.indexPreview = null;
      model.dirty = false;
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
    if (name === "o:partner_id") {
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
    if (form.id === "workflow-cash-form") {
      const f = new FormData(form),
        p = model.cashSettings;
      p.plan.finance ||= {};
      p.plan.finance.opening_cash = String(f.get("opening_cash"));
      p.plan.finance.cash_currency = String(f.get("cash_currency"));
      await invoke("save_project_plan", {
        projectId: model.projectId,
        revision: p.revision,
        plan: p.plan,
        asOf: model.asOf,
      });
      model.cashSettings = null;
      await refresh();
      render();
      return;
    }
    if (["site-book-form", "site-book-print-form"].includes(form.id))
      return book.submit(form);
    if (
      ["certificate-workflow-form", "certificate-payment-form"].includes(
        form.id,
      )
    )
      return certificates.submit(form);
    if (
      [
        "quotation-request-form",
        "quotation-award-form",
        "quotation-receive-form",
        "quotation-payment-form",
      ].includes(form.id)
    )
      return quotations.submit(form);
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
    model.draft = model.tab === "finance" ? draft(saved.kind) : null;
    await refresh();
    model.detail = saved;
    render();
  }
  function input(target) {
    book.input(target);
    certificates.input(target);
    quotations.input(target);
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
