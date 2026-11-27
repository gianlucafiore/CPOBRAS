import { uiText, uiHtml } from "../services/interface-language.js";
import { permissionsFor, operationPermission } from "../services/remote-workspace.js";
import { createSiteBook } from "./site-book.js";
import { createCertificateWorkflow } from "./certificate-workflow.js";
import { createQuotationWorkflow } from "./quotation-workflow.js";
import { e, field, select, dateToday } from "./helpers.js";
import { money, numeric, sumDecimals, multiplyDecimals, compareDecimals } from "../decimal.js";
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
    "direct_payment",
    "fund_contribution",
    "fund_reimbursement",
    "retention_payable",
    "retention_receivable",
    "forecast",
  ],
};
export const operationNames = {
  get direct_payment() { return uiText("Gasto pagado sin factura vinculada"); },
  get fund_contribution() { return uiText("Aporte de fondos propios"); },
  get fund_reimbursement() { return uiText("Devolución de fondos propios"); },
  get request() { return uiText("Solicitud de materiales"); },
  get rfq() { return uiText("Pedido de cotización"); },
  get quote() { return uiText("Cotización de proveedor"); },
  get purchase_order() { return uiText("Orden de compra"); },
  get service_order() { return uiText("Orden de servicio"); },
  get subcontract() { return uiText("Contrato de subcontratista"); },
  get stock_opening() { return uiText("Declarar acopio existente"); },
  get receipt() { return uiText("Remito / recepción parcial"); },
  get service_receipt() { return uiText("Recepción de servicio"); },
  get consumption() { return uiText("Consumo de materiales"); },
  get return() { return uiText("Devolución de consumo"); },
  get transfer() { return uiText("Transferencia entre depósitos"); },
  get daily() { return uiText("Parte diario"); },
  get certificate() { return uiText("Certificado de avance"); },
  get subcertificate() { return uiText("Certificado de subcontratista"); },
  get index() { return uiText("Índice de precios"); },
  get adjustment() { return uiText("Ajuste de certificado anterior sin acuerdo"); },
  get payable() { return uiText("Factura por pagar"); },
  get receivable() { return uiText("Factura por cobrar"); },
  get payment() { return uiText("Pago"); },
  get collection() { return uiText("Cobro"); },
  get advance_paid() { return uiText("Anticipo pagado"); },
  get advance_received() { return uiText("Anticipo recibido"); },
  get retention_payable() { return uiText("Liberación de reparo por pagar"); },
  get retention_receivable() { return uiText("Liberación de reparo por cobrar"); },
  get forecast() { return uiText("Proyección de costo a terminar"); },
};
const guides = {
  get stock_opening() { return uiText("Declaración de material que ya pertenece a la obra. Indicá depósito, cantidad disponible y valor de inventario. No genera una compra, deuda ni salida de caja; si todavía debés pagarlo, registrá la factura por separado."); },
  get advance_paid() { return uiText("Registrá el anticipo efectivamente pagado y vinculalo con el subcontrato. Luego se descuenta en sus certificados, hasta el saldo pendiente."); },
  get advance_received() { return uiText("Ingreso real del comitente. Se suma al fondo de la obra y queda vinculado al convenio del presupuesto elegido. Los certificados descuentan solo el anticipo recibido pendiente de recuperar."); },
  get direct_payment() { return uiText("Registrá permisos, tasas u otro gasto efectivamente pagado que no tenga factura o certificado ya registrado. Si ya existe un documento, usá Pago para evitar duplicar el gasto."); },
  get fund_contribution() { return uiText("Dinero propio que incorporás a la obra. No es un cobro del comitente ni un ingreso por venta."); },
  get fund_reimbursement() { return uiText("Retiro de un aporte propio previamente registrado. No es un gasto de obra."); },
  get retention_payable() { return uiText("Liberá el fondo de reparo de un certificado de subcontratista. Se crea una obligación que podrás pagar vinculando este documento."); },
  get retention_receivable() { return uiText("Liberá el fondo de reparo de un certificado de obra. Se crea una cuenta por cobrar para conciliar su cobro."); },
  get request() { return uiText("Cargá las necesidades de la obra. La tabla de necesidades calcula las cantidades a partir de los ACU del presupuesto de referencia."); },
  get rfq() { return uiText("Vinculá una solicitud para pedir precios sobre las mismas cantidades. Registrá luego una cotización por proveedor."); },
  get quote() { return uiText("Elegí proveedor y pedido de cotización. La comparativa indica si la oferta cubre todos los renglones y cantidades. Compará ofertas de la misma moneda."); },
  get purchase_order() { return uiText("Elegí una cotización o cargá la compra con su proveedor. Las recepciones posteriores controlarán el saldo por renglón."); },
  get service_order() { return uiText("Registrá el alcance, cantidades, precio y condiciones del servicio. Su recepción se imputa al costo real."); },
  get subcontract() { return uiText("Definí las partidas, precios, alcance, plazos y condiciones del contrato. Sus certificados no pueden superar lo contratado."); },
  get receipt() { return uiText("Elegí la orden de compra, el proveedor y el depósito. Ajustá las cantidades a lo efectivamente recibido; se permiten entregas parciales."); },
  get service_receipt() { return uiText("Vinculá una orden de servicio o subcontrato. La aceptación del servicio genera costo real. El certificado es su liquidación financiera y no vuelve a sumar el costo."); },
  get consumption() { return uiText("Elegí un depósito y asigná materiales a las partidas o centros de costos. Se valorizan al promedio ponderado de la existencia en esa moneda."); },
  get return() { return uiText("Elegí el consumo original y devolvé cantidades al mismo depósito. Se revierte el costo original, hasta el saldo consumido."); },
  get transfer() { return uiText("Mové existencias hacia otro depósito, incluso de otra obra. Se conserva el valor y no se crea un costo ni una compra adicional."); },
  get daily() { return uiText("Registrá producción por partida y asistencia de personas/cuadrillas o equipos por renglón. Cantidad = producción; horas = asistencia/trabajo; precio = costo por hora. Para asistencia o equipos elegí el tipo de registro correspondiente y usá cantidad 1; podés vincular la partida sin duplicar la producción. La mano de obra debe estar en horas para comparar con ACU."); },
  get certificate() { return uiText("Elegí un presupuesto emitido y el período. Cargá las cantidades de este período. Se calculan precios de la versión emitida, acumulados, anticipos, descuentos, reparo y saldo."); },
  get subcertificate() { return uiText("Elegí un subcontrato y presupuesto emitido. Se toman los precios del subcontrato y se controlan los saldos por partida y contrato."); },
  get index() { return uiText("Registro anterior por obra. Las nuevas publicaciones se cargan en Inicio → Datos generales y se heredan según el acuerdo de cada presupuesto."); },
  get adjustment() { return uiText("Solo para certificados anteriores que no tenían acuerdo automático. Cargá publicaciones nuevas en Inicio → Datos generales. Los certificados con acuerdo usan sus diferencias pendientes, sin este ajuste manual."); },
  get payable() { return uiText("Registrá la factura y su vencimiento. Podés vincular recepción o certificado; su facturación y pagos no pueden superar el saldo. La factura crea deuda, no duplica el costo físico."); },
  get receivable() { return uiText("Registrá la factura y su vencimiento, vinculada opcionalmente al certificado. La cuenta por cobrar evita contar dos veces lo facturado."); },
  get payment() { return uiText("Elegí factura o certificado pendiente. Podés registrar pagos parciales; el sistema impide superar el saldo."); },
  get collection() { return uiText("Elegí factura o certificado pendiente. Los cobros parciales se concilian con el documento de origen."); },
  get forecast() { return uiText("Guardá una revisión del costo restante estimado y su fecha prevista. El tablero usa la última revisión hasta la fecha de corte; si no existe, estima por producción pendiente."); },
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
    get lastExport() { return this._lastExport || ""; },
    set lastExport(path) { this._lastExport = path; if (path) state.message = {text:"Guardado en", path}; },
    cashSettings: null,
    detailFiles: [],
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
        "direct_payment",
        "fund_contribution",
        "fund_reimbursement",
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
  async function protect() {
    read();
    if (!book.protect() || !(await certificates.protect()) || !(await quotations.protect()))
      return false;
    if (!model.dirty) return true;
    if (
      !window.confirm(
        uiText("Tenés un documento sin registrar. ¿Descartar el borrador y continuar?"),
      )
    )
      return false;
    model.dirty = false;
    model.draft = null;
    return true;
  }
  function table(headers, rows) {
    return `<div class="operations-table"><table class="mini-table"><thead><tr>${headers.map((h) => `<th>${uiHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${headers.length}">${uiHtml("Sin registros para esta selección.")}</td></tr>`}</tbody></table></div>`;
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
                    `<div><small>${uiHtml(label)}</small><strong>${money(v)}</strong></div>`,
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
    return `<fieldset class="certificate-extras"><legend>${uiHtml("Ajuste y adicionales de este certificado")}</legend><p>${uiHtml("El ajuste se calcula al registrar con el acuerdo del presupuesto y las publicaciones conocidas a la fecha de emisión. Los trabajos que amplían el alcance se cargan como partidas en un rubro de adicionales; los siguientes cargos puntuales se cobran completos, una sola vez. Si son ajustables, ingresá su importe a valores del mes base; si son fijos, ingresá el importe final pactado.")}</p><button type="button" class="btn" data-action="ops-preview-index">${uiHtml("Consultar índice a aplicar")}</button>${model.indexPreview ? `<p role="status">${e(model.indexPreview.message)}</p>` : ""}<h4>${uiHtml("Diferencias pendientes de certificados anteriores")}</h4>${pending.map((d) => `<label><input type="checkbox" name="certificate-difference" value="${d.source_id}" ${(o.reconcile_ids || []).includes(d.source_id) ? "checked" : ""}> ${uiHtml("Certificado")} ${e(d.source_number)} ${uiHtml("· diferencia")} ${money(d.delta)} ${uiHtml("· reparo")} ${money(d.retention_delta)} ${uiHtml("· coeficiente")} ${numeric(d.from_factor)} → ${numeric(d.snapshot.factor)} ${d.snapshot.provisional ? uiHtml("(aún provisorio)") : "(definitivo)"}</label>`).join("") || ("<p>" + uiHtml("No hay diferencias pendientes publicadas para este presupuesto.") + "</p>")}${(o.extras || []).map((x, i) => `<fieldset data-certificate-extra="${x.id}"><legend>${uiHtml("Adicional puntual")} ${i + 1}</legend><div class="form-grid three">${field(uiText("Descripción del adicional"), "extra-description", x.description, 'required maxlength="500"')}${field(uiText("Motivo del adicional"), "extra-reason", x.reason, 'required maxlength="2000"')}${field(uiText("Autorización / referencia del comitente"), "extra-authorization", x.authorization, 'required maxlength="2000"')}${field(uiText("Importe completo del adicional"), "extra-amount", x.amount, 'type="number" min="0.000001" step="any" required')}</div><label><input type="checkbox" name="extra-adjustable" ${x.adjustable ? "checked" : ""}> ${uiHtml("Aplicar ajuste de índices")}</label><label><input type="checkbox" name="extra-retention" ${x.retention ? "checked" : ""}> ${uiHtml("Aplicar fondo de reparo")}</label><label><input type="checkbox" name="extra-advance" ${x.recover_advance ? "checked" : ""}> ${uiHtml("Permitir recuperar anticipo")}</label><button type="button" class="btn" data-action="ops-remove-extra" data-index="${i}">${uiHtml("Quitar adicional")}</button></fieldset>`).join("")}<button type="button" class="btn" data-action="ops-add-extra">${uiHtml("Agregar adicional puntual")}</button></fieldset>`;
  }
  function contractTerms(o) {
    const t = o.contract_terms || {};
    return `<fieldset><legend>${uiHtml("Asignación y acuerdo del contratista / cuadrilla")}</legend><p>${uiHtml("Asigná partidas y cantidades en los renglones. El precio es el costo pactado con el contratista, separado del precio de venta al comitente. Al aprobar su certificado se reconoce el costo y se ofrece su avance al certificado del comitente; no registres otra recepción del mismo trabajo.")}</p><div class="workflow-grid">${field(uiText("Alcance: mano de obra / materiales / equipos"), "contract:scope", t.scope || "Mano de obra", "required")}${select(
      uiText("Modalidad de liquidación"),
      "contract:method",
      [
        ["quantity", uiText("Por cantidades ejecutadas")],
        ["percent", uiText("Por avance porcentual")],
        ["fixed", uiText("Importe fijo por período")],
        ["daily", uiText("Por jornada")],
        ["hourly", uiText("Por hora")],
      ],
      t.method || "quantity",
    )}${select(
      uiText("Frecuencia de pago"),
      "contract:frequency",
      [
        ["weekly", uiText("Semanal (viernes)")],
        ["fortnight", uiText("Quincenal (15 y fin de mes)")],
        ["monthly", uiText("Mensual")],
        ["by_progress", uiText("Al certificar avance")],
      ],
      t.frequency || "weekly",
    )}${field(uiText("Tarifa por período / jornada / hora"), "contract:rate", t.rate || "0", 'type="number" min="0" step="any"')}${field(uiText("Tope total para tarifa fija o por tiempo"), "contract:ceiling", t.ceiling || "0", 'type="number" min="0" step="any"')}${field(uiText("Jornadas / horas estimadas por pago"), "contract:forecast_units", t.forecast_units || "1", 'type="number" min="0" step="any"')}${field(uiText("Inicio contratado"), "contract:start", t.start || "", 'type="date"')}${field(uiText("Fin contratado"), "contract:end", t.end || "", 'type="date"')}${field(uiText("Demora de pago (días)"), "contract:payment_delay_days", t.payment_delay_days || 0, 'type="number" min="0" max="365"')}${field(uiText("Recuperación de anticipo %"), "contract:advance_recovery_percent", t.advance_recovery_percent || "0", 'type="number" min="0" max="100" step="any"')}${field(uiText("Fondo de reparo %"), "contract:retention_percent", t.retention_percent || "0", 'type="number" min="0" max="100" step="any"')}</div><label><input name="contract:contributes_progress" type="checkbox" ${t.contributes_progress !== false ? "checked" : ""}> ${uiHtml("Este contrato aporta ejecución física (desmarcar apoyos, alquileres y servicios que no suman cantidades)")}</label></fieldset>`;
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
      "direct_payment",
      "fund_contribution",
      "fund_reimbursement",
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
    return `<form id="operation-form" class="operations-form"><h3>${e(operationNames[o.kind])}</h3><p class="context-help">${uiHtml("{0} Los documentos registrados conservan su historial y no se sobrescriben.", [guides[o.kind]])}</p><div class="form-grid three">${field(uiText("Número / referencia"), "o:number", o.number, ["stock_opening", "subcontract", "quote", "rfq"].includes(o.kind) ? 'readonly placeholder="Automático al registrar"' : 'required maxlength="100"')}${field(uiText("Fecha"), "o:date", o.date, 'type="date" required')}${select(
      uiText("Moneda"),
      "o:currency",
      [
        ["ARS", "ARS"],
        ["USD", "USD"],
      ],
      o.currency,
    )}${select(uiText("Contraparte"), "o:partner_id", [["", uiText("Comitente / sin contraparte")], ...model.partners.filter((p) => p.attributes?.person_primary !== "false" || p.id === o.partner_id).map((p) => [p.id, p.name + ((state.projects.find((x) => x.id === state.projectId)?.supplier_ids || []).includes(p.attributes?.person_id || p.id) ? " · Vinculado a la obra" : "")])], o.partner_id)}${available.length || ["rfq", "quote", "purchase_order", "service_order", "subcontract", "receipt", "service_receipt", "return", "subcertificate", "adjustment", "payable", "receivable", "payment", "collection", "advance_paid", "retention_payable", "retention_receivable"].includes(o.kind) ? select(uiText("Documento de origen"), "o:reference_id", [["", uiText("Sin origen")], ...available.map((d) => [d.id, `${operationNames[d.kind]} · ${d.number} · ${partnerName(d.partner_id)} · ${d.currency} ${money(d.amount)}`])], o.reference_id) : ""}${select(o.kind === "advance_received" ? uiText("Presupuesto / convenio del anticipo") : uiText("Presupuesto de referencia"), "o:estimate_id", [...(o.kind === "advance_received" ? [] : [["", "Sin vínculo"]]), ...model.estimates.filter((x) => o.kind === "advance_received" || x.id === model.estimateId || x.id === o.estimate_id).map((x) => [x.id, x.title + (x.issued ? " · Emitido" : " · Borrador")])], o.estimate_id)}</div>
 ${o.kind === "advance_received" ? field(uiText("Recuperación del anticipo % (opcional)"), "o:advance_percent", o.advance_percent ?? "", 'type="number" min="0" max="100" step="any"') + ("<p class=\"modal-help\">" + uiHtml("Vacío: conserva el porcentaje pactado; si todavía no existe, se calcula con el anticipo recibido y el total del presupuesto. El ingreso y el convenio se registran juntos.") + "</p>") : ""}
 ${o.kind === "payable" ? select(uiText("Alquiler / gasto mensual previsto (opcional)"), "rental-link", [["", uiText("Sin vínculo")], ...(model.report?.recurring_costs || []).filter((r) => r.currency === o.currency).map((r) => [rentalKey(r), `${r.description} · ${r.period_start} → ${r.period_end}`])], o.price_cost ? rentalKey(o.price_cost) : "") + ("<p class=\"modal-help\">" + uiHtml("Para un gasto mensual elegí su período y dejá Documento de origen sin vínculo. La factura reemplaza la previsión; registrá su pago por separado.") + "</p>") : ""}

 ${stockKinds.includes(o.kind) ? `<div class="form-grid">${select(uiText("Depósito"), "o:warehouse_id", opts(model.warehouses.filter((w) => w.project_id === model.projectId)), o.warehouse_id)}${o.kind === "transfer" ? select(uiText("Depósito de destino"), "o:destination_id", [["", uiText("Seleccionar…")], ...model.warehouses.map((w) => [w.id, whName(w.id)])], o.destination_id) : ""}</div>` : ""}
 ${cert ? `<div class="form-grid three">${field(uiText("Inicio del período"), "o:period_start", o.period_start, 'type="date" required')}${field(uiText("Fin del período"), "o:period_end", o.period_end, 'type="date" required')}${field(uiText("Anticipo a descontar"), "o:advance", o.advance, 'type="number" min="0" step="any" required')}${field(uiText("Otros descuentos"), "o:discount", o.discount, 'type="number" min="0" step="any" required')}${field(uiText("Fondo de reparo %"), "o:retention_percent", o.retention_percent, 'type="number" min="0" max="100" step="any" required')}${field(uiText("Vencimiento"), "o:due_date", o.due_date, 'type="date" required')}</div>` : ""}
 ${o.kind === "payable" && model.partners.find((p) => p.id === o.partner_id)?.kind === "crew" ? `<div class="form-grid three">${field(uiText("Inicio de la liquidación"), "o:period_start", o.period_start, 'type="date" required')}${field(uiText("Fin de la liquidación"), "o:period_end", o.period_end, 'type="date" required')}${field(uiText("Anticipo a descontar del importe bruto"), "o:advance", o.advance || "0", 'type="number" min="0" step="any" required')}</div><p>${uiHtml("El importe ingresado es bruto; se descontará este anticipo para obtener el neto por pagar.")}</p>` : ""}
 ${o.kind === "subcontract" ? contractTerms(o) : ""}
 ${certificateExtras(o)}
 ${monetary.includes(o.kind) ? `<div class="form-grid">${field(o.kind === "forecast" ? uiText("Costo restante estimado") : uiText("Importe"), "o:amount", o.amount, 'type="number" min="0" step="any" required')}${field(o.kind === "forecast" ? uiText("Fin previsto") : uiText("Vencimiento / fecha prevista"), "o:due_date", o.due_date, 'type="date" required')}</div>` : ""}
 ${
   o.kind === "index"
     ? `<div class="form-grid three">${select(
         uiText("Serie"),
         "o:index_series",
         [
           ["CAC", "CAC"],
           ["IPC", "IPC"],
           ["INDEC", "INDEC"],
         ],
         o.index_series,
       )}${field(uiText("Período del índice"), "o:index_period", o.index_period, 'type="month" required')}${field(uiText("Valor del índice"), "o:index_value", o.index_value, 'type="number" min="0" step="any" required')}</div>${field(uiText("URL de la publicación / fuente"), "o:index_source", o.index_source, 'type="url" required')}`
     : ""
 }
 ${
   o.kind === "adjustment"
     ? `<div class="form-grid">${field(uiText("Período base"), "o:base_period", o.base_period, 'type="month" required')}${field(uiText("Período de ajuste"), "o:target_period", o.target_period, 'type="month" required')}</div>${o.adjustment_weights
         .map(
           (w, i) =>
             `<div class="form-grid index-weight">${select(
               uiText("Serie del ponderador"),
               "series",
               [
                 ["CAC", "CAC"],
                 ["IPC", "IPC"],
                 ["INDEC", "INDEC"],
               ],
               w.series,
             )}${field(uiText("Ponderador (0 a 1)"), "weight", w.weight, 'type="number" min="0" max="1" step="any" required')}<button type="button" class="btn" data-action="ops-remove-weight" data-index="${i}">${uiHtml("Quitar ponderador")}</button></div>`,
         )
         .join(
           "",
         )}<button type="button" class="btn" data-action="ops-add-weight">${uiHtml("Agregar ponderador")}</button>`
     : ""
 }
 ${o.kind === "daily" ? `${field(uiText("Responsable / cuadrilla"), "o:crew", o.crew)}<label>${uiHtml("Incidencias e imprevistos")}<textarea name="o:incidents">${e(o.incidents)}</textarea></label><label>${uiHtml("Fotografías (hasta 8 JPG/PNG de 2 MB)")}<input type="file" name="daily-photos" accept="image/jpeg,image/png" multiple></label><div class="operation-photos">${o.photos.map((p, i) => `<figure><img src="${e(p)}" alt="${uiHtml("Foto")} ${i + 1} ${uiHtml("del parte")}"><button type="button" class="btn" data-action="ops-remove-photo" data-index="${i}">${uiHtml("Quitar foto")} ${i + 1}</button></figure>`).join("")}</div>` : ""}
 ${
   !["index", "adjustment", ...monetary].includes(o.kind)
     ? `<div class="form-subhead">${uiHtml("RENGLONES")} <button type="button" class="btn" data-action="ops-add-line">${uiHtml("Agregar renglón")}</button></div>${o.lines
         .map(
           (l, i) =>
             `<fieldset class="operation-line"><legend>${uiHtml("Renglón")} ${i + 1}</legend><div class="form-grid three">${
               o.kind === "daily"
                 ? select(
                     uiText("Tipo de registro"),
                     "entry_type",
                     [
                       ["contracts", uiText("Subcontrataciones")],
                       ["production", uiText("Libro de obra")],
                       ["labor", uiText("Asistencia / mano de obra")],
                       ["equipment", uiText("Uso de equipo")],
                     ],
                     l.entry_type || "production",
                   ) +
                   select(
                     uiText("Asistencia"),
                     "attendance",
                     [
                       ["present", uiText("Presente")],
                       ["absent", uiText("Ausente")],
                       ["justified", uiText("Ausencia justificada")],
                     ],
                     l.attendance || "present",
                   )
                 : ""
             }${select(uiText("Insumo (opcional)"), "resource_id", opts(state.resources), l.resource_id)}${select(uiText("Partida (opcional)"), "line_id", opts(model.lines.filter((line) => !line.archived || ["receipt", "service_receipt", "return"].includes(o.kind))), l.line_id)}${select(uiText("Centro de costos"), "center_id", opts(model.centers.filter((c) => !c.project_id || c.project_id === model.projectId)), l.center_id)}${field(uiText("Descripción del renglón"), "description", l.description, 'required maxlength="1000"')}${field(o.kind === "daily" ? uiText("Cantidad producida") : uiText("Cantidad del período / movimiento"), "quantity", l.quantity, 'type="number" min="0.000001" step="any" required')}${field(o.kind === "daily" ? uiText("Costo por hora") : uiText("Precio unitario"), "unit_price", l.unit_price, 'type="number" min="0" step="any" required')}${o.kind === "daily" ? field(uiText("Horas trabajadas / equipo"), "hours", l.hours, 'type="number" min="0" step="any" required') : ""}</div><button type="button" class="btn" data-action="ops-remove-line" data-index="${i}">${uiHtml("Quitar renglón")}</button></fieldset>`,
         )
         .join("")}`
     : ""
 }
 ${["subcontract", "service_order", "purchase_order"].includes(o.kind) ? field(uiText("Fecha prevista de pago del saldo"), "o:due_date", o.due_date, 'type="date" required') + `<label>${uiHtml("Condiciones, alcance, plazos y forma de pago")}<textarea name="o:terms">${e(o.terms)}</textarea></label>` : ""}<label>${o.kind === "direct_payment" ? uiHtml("Concepto del gasto (obligatorio)") : uiHtml("Observaciones")}<textarea name="o:notes" ${o.kind === "direct_payment" ? "required" : ""}>${e(o.notes)}</textarea></label>${["payment","collection","advance_received","advance_paid","direct_payment","fund_contribution","fund_reimbursement"].includes(o.kind)?("<label>" + uiHtml("Comprobante (opcional, hasta 10 MB)") + "<input type=\"file\" name=\"fund-proof\" accept=\"application/pdf,image/png,image/jpeg,image/webp\"></label>"):""}<p class="feature-error" role="alert"></p><button type="submit" class="btn primary">${uiHtml("Registrar {0}", [operationNames[o.kind].toLowerCase()])}</button></form>`;
  }
  function documentRows() {
    const kinds = operationGroups[model.tab] || [];
    return table(
      [
        uiText("Fecha"),
        uiText("Tipo"),
        uiText("Número"),
        uiText("Contraparte"),
        uiText("Presupuesto"),
        uiText("Moneda"),
        uiText("Importe"),
        uiText("Acciones"),
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
          `<button class="btn" data-action="ops-detail" data-id="${d.id}">${uiHtml("Ver / exportar")}</button>`,
        ]),
    );
  }
  function production() {
    const r = model.report;
    if (!r) return "";
    return table(
      [
        uiText("Rubro"),
        uiText("Partida"),
        uiText("Previsto"),
        uiText("Real"),
        uiText("Avance %"),
        uiText("Horas"),
        uiText("Horas/unidad previstas"),
        uiText("Horas/unidad reales"),
        uiText("Desvío %"),
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
    return `<details open><summary>${uiHtml("Necesidades de materiales según ACU")}</summary>${table(
      [
        uiText("Insumo"),
        uiText("Necesario"),
        uiText("Solicitado"),
        uiText("Ordenado"),
        uiText("Recibido"),
        uiText("Consumido neto"),
        uiText("Stock"),
        uiText("Faltante"),
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
    )}</details><details><summary>${uiHtml("Comparativa de cotizaciones")}</summary>${table(
      [uiText("Pedido"), uiText("Oferta"), uiText("Proveedor"), uiText("Moneda"), uiText("Total"), uiText("Cobertura")],
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
    )}</details><details><summary>${uiHtml("Depósitos y existencias")}</summary><form id="warehouse-form" class="form-grid three">${field(uiText("Nombre del depósito"), "name", "", "required")}${field(uiText("Ubicación / estante"), "location", "", "required")}<button type="submit" class="btn">${uiHtml("Crear depósito")}</button><p class="feature-error" role="alert"></p></form>${table(
      [uiText("Depósito"), uiText("Insumo"), uiText("Moneda"), uiText("Existencia"), uiText("Valor")],
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
    return `<h3>${uiHtml("Alquileres y gastos mensuales previstos")}</h3><p>${uiHtml("Provienen del detalle guardado en Determinación de precio del presupuesto activo. Vinculá las facturas con su período para reemplazar la previsión. Una previsión no registra deuda ni un pago.")}</p>${table(
      [
        uiText("Concepto"),
        uiText("Período"),
        uiText("Vencimiento"),
        uiText("Moneda"),
        uiText("Presupuestado"),
        uiText("Facturado"),
        uiText("Sin facturar"),
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
  function financeSummary() {
    const summaries = model.report?.summaries || [];
    if (!summaries.length) return "";
    return `<section class="workflow-card finance-summary"><h2>${uiHtml("Resumen financiero")}</h2>
      ${summaries.map(s => `<div class="finance-summary-currency"><h3>${e(s.currency)}</h3><div class="operations-kpis">
        ${[["Cobrado", s.collected], ["Pagado", s.paid], ["Por cobrar", s.receivable], ["Por pagar", s.payable]]
          .map(([label, value]) => `<div><small>${label}</small><strong>${money(value)}</strong></div>`).join("")}
        </div></div>`).join("")}
      <details><summary>${uiHtml("Ver detalle de costos, desvíos y rentabilidad")}</summary>${summary(model.report)}</details>
    </section>`;
  }
  function financialProjection() {
    const f = model.report?.financial_projection;
    if (!f)
      return ("<section class=\"workflow-card\"><h2>" + uiHtml("Previsión financiera") + "</h2><p>" + uiHtml("Guardá el cronograma en Planificación para consultar la previsión financiera.") + "</p></section>");
    const asOf = model.asOf;
    const next = f.periods.find(period => period.end >= asOf);
    const warnings = [...new Set([...(model.report?.alerts || []), ...(f.warnings || [])])];
    return `<section class="workflow-card financial-projection"><h2>${uiHtml("Previsión financiera · {0}", [f.currency])}</h2>
      <div class="workflow-summary finance-projection-kpis">
        <div>${uiHtml("Próximo cobro previsto")}<b>${e(next?.collection_date || "—")}</b></div>
        <div>${uiHtml("Capital adicional máximo previsto")}<b>${money(f.additional_cash)}</b></div>
        <div>${f.opening_cash_source === "registered" ? uiHtml("Caja según movimientos registrados") : uiHtml("Caja inicial declarada")}<b>${money(f.opening_cash)}</b></div>
      </div>
      ${warnings.length ? `<details><summary>${uiHtml("Avisos de la previsión (")}${warnings.length})</summary><ul>${warnings.map(w => `<li>${uiHtml(w)}</li>`).join("")}</ul></details>` : ""}
      <details><summary>${uiHtml("Ver períodos, materiales y calendario")}</summary><p>${uiHtml("Previsión desde el día siguiente al corte de seguimiento ({0}). Los egresos se consideran antes que los cobros del mismo día.", [f.as_of])}</p>
      ${f.periods
      .map(
        (p) =>
          `<details class="planning-options"><summary>${uiHtml("Período {0} → {1} · Egresos {2} · Caja adicional {3}", [p.start, p.end, money(p.expenses), money(p.additional_cash)])}</summary><p>${uiHtml("Certificación prevista: bruto {0} − anticipo {1} − reparo {2} =", [money(p.gross), money(p.advance), money(p.retention)])} <strong>${money(p.net)}</strong>${uiHtml(". Cobro previsto: {0}. Ingresos durante el período: {1}.", [p.collection_date, money(p.receipts)])}</p>${table(
            [
              uiText("Material"),
              uiText("Unidad"),
              uiText("Necesario"),
              uiText("Del acopio"),
              uiText("Comprado por recibir"),
              uiText("Comprar"),
              uiText("Costo de compra"),
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
      )}<details class="planning-options"><summary>${uiHtml("Calendario de ingresos, egresos y saldo previsto")}</summary>${table(
      [uiText("Fecha"), uiText("Concepto"), uiText("Ingreso"), uiText("Egreso"), uiText("Saldo")],
      f.events.map((x) => [
        e(x.date),
        e(x.description),
        money(x.income),
        money(x.expense),
        money(x.balance),
      ]),
    )}</details></details></section>`;
  }
  function cashSettings() {
    const p = model.cashSettings;
    if (!p) return "";
    return `<form id="workflow-cash-form" class="workflow-card"><h3>${uiHtml("Caja disponible de esta obra")}</h3><p>${uiHtml("Saldo inicial para una obra que todavía no tiene movimientos registrados. Desde el primer cobro o pago, la previsión usa automáticamente el fondo de la obra.")}</p><div class="feature-toolbar">${field(uiText("Caja disponible"), "opening_cash", p.plan.finance?.opening_cash || "0", 'type="number" min="0" step="any" required')}${select(
      uiText("Moneda de la caja"),
      "cash_currency",
      [
        ["ARS", "ARS"],
        ["USD", "USD"],
      ],
      p.plan.finance?.cash_currency || "ARS",
    )}<button class="btn primary" type="submit">${uiHtml("Guardar caja")}</button><button class="btn" type="button" data-action="ops-cash-close">${uiHtml("Cerrar")}</button></div></form>`;
  }
  function financeDashboard() {
    const f = model.report?.financial_projection;
    const next = f?.periods.find(p => p.end >= model.asOf);
    const cashButton = !state.remoteProject && f?.opening_cash_source !== "registered"
      ? ("<button class=\"btn\" data-action=\"ops-cash-open\">" + uiHtml("Configurar caja inicial") + "</button>") : "";
    if (!next)
      return `<section class="workflow-card"><div class="feature-toolbar"><h2>${uiHtml("Próxima certificación")}</h2>${cashButton}</div><p>${uiHtml("No hay próximos cortes de certificación. Marcá las fechas en el Gantt.")}</p></section>`;
    const until = f.events.filter((x) => x.date <= next.collection_date),
      expenses = sumDecimals(until.map((x) => x.expense)),
      confirmed = sumDecimals(
        until
          .filter((x) => x.kind !== "planned_certificate")
          .map((x) => x.income),
      );
    let balance = f.opening_cash,
      minimum = balance;
    for (const x of until) {
      balance = sumDecimals([balance,x.income,multiplyDecimals(x.expense,"-1")]);
      if(compareDecimals(balance,minimum)<0)minimum=balance;
    }
    return (
      `<section class="workflow-card finance-next"><div class="feature-toolbar"><h2>${uiHtml("Próxima certificación · {0}", [next.end])}</h2>${cashButton}</div>
      <p>${uiHtml("Cobro previsto el")} <strong>${e(next.collection_date)}</strong> · ${e(f.currency)}</p><div class="workflow-summary">${[
        ["Cobro posible del corte", next.net],
        ["Gastos hasta el cobro", expenses],
        ["Otros cobros confirmados", confirmed],
        [f.opening_cash_source === "registered" ? "Caja de movimientos registrados" : "Caja inicial declarada", f.opening_cash],
        ["Capital adicional estimado", (compareDecimals(minimum,"0")<0 ? multiplyDecimals(minimum,"-1") : "0")],
        ["Avance oficial certificado %", model.report.certified_percent || "0"],
      ]
        .map(([label, value]) => `<div>${uiHtml(label)}<b>${money(value)}</b></div>`)
        .join(
          "",
        )}</div><details><summary>${uiHtml("Avances de contratistas pendientes de certificar (")}${certificates.view.available.length})</summary>${table(
        [uiText("Certificado contratista"), uiText("Partida"), uiText("Cantidad pendiente")],
        certificates.view.available.map((x) => [
          e(x.number),
          e(x.description),
          numeric(x.quantity),
        ]),
      )}</details></section>`
    );
  }
  function projectFunds() {
    const docs = model.docs.filter(o => o.date <= model.asOf);
    const currencies = [...new Set(docs.map(o => o.currency).concat(model.report?.summaries.map(s=>s.currency)||[]))];
    const paymentKinds=["payment","advance_paid","direct_payment"], incomeKinds=["collection","advance_received"];
    const sum=(currency,kinds)=>sumDecimals(docs.filter(o=>o.currency===currency&&kinds.includes(o.kind)).map(o=>o.amount));
    const rows=docs.filter(o=>[...paymentKinds,...incomeKinds,"fund_contribution","fund_reimbursement"].includes(o.kind)).sort((a,b)=>a.date.localeCompare(b.date)||model.docs.indexOf(a)-model.docs.indexOf(b));
    const balances={};
    return `<section class="workflow-card project-funds"><div class="feature-toolbar"><h2>${uiHtml("Fondo de la obra")}</h2>${state.remoteProject ? "" : ("<button class=\"btn tiny\" data-action=\"ops-fund-new\" data-kind=\"advance_received\">" + uiHtml("Registrar anticipo") + "</button><button class=\"btn tiny\" data-action=\"ops-fund-new\" data-kind=\"collection\">" + uiHtml("Registrar cobro") + "</button><button class=\"btn tiny\" data-action=\"ops-fund-new\" data-kind=\"payment\">" + uiHtml("Registrar pago") + "</button><button class=\"btn tiny\" data-action=\"ops-fund-new\" data-kind=\"direct_payment\">" + uiHtml("Gasto pagado") + "</button><button class=\"btn tiny\" data-action=\"ops-fund-new\" data-kind=\"fund_contribution\">" + uiHtml("Aporte propio") + "</button>")}</div><p>${uiHtml("Movimientos efectivamente cobrados y pagados hasta {0}. Los pedidos, facturas y certificados pendientes no mueven este fondo. Cada moneda se mantiene separada.", [model.asOf])}</p>${currencies.map(currency=>{
      const received=sum(currency,incomeKinds),paid=sum(currency,paymentKinds),own=sumDecimals([sum(currency,["fund_contribution"]),multiplyDecimals(sum(currency,["fund_reimbursement"]),"-1")]),balance=sumDecimals([received,multiplyDecimals(paid,"-1")]),available=sumDecimals([balance,own]);
      return `<div class="fund-currency"><h3>${e(currency)}</h3><div class="fund-kpis"><span>${uiHtml("Recibido del comitente")}<b>${money(received)}</b></span><span>${uiHtml("Pagado por la obra")}<b>${money(paid)}</b></span><span>${uiHtml("Saldo respecto del comitente")}<b class="${compareDecimals(balance,"0")<0?"negative":""}">${money(balance)}</b></span><span>${uiHtml("Aportes propios netos")}<b>${money(own)}</b></span><span>${uiHtml("Disponible, incluidos aportes")}<b class="${compareDecimals(available,"0")<0?"negative":""}">${money(available)}</b></span></div>${compareDecimals(balance,"0")<0?("<p class=\"operations-alert\">" + uiHtml("Se pagó más de lo recibido del comitente. La diferencia requiere financiamiento propio u otro ingreso de fondos.") + "</p>"):""}</div>`;
    }).join("")}<details><summary>${uiHtml("Movimientos del fondo (")}${rows.length})</summary>${table([uiText("Fecha"),uiText("Concepto"),uiText("Destinatario / origen"),uiText("Moneda"),uiText("Ingreso"),uiText("Egreso"),uiText("Saldo disponible")],rows.map(o=>{
      const incoming=[...incomeKinds,"fund_contribution"].includes(o.kind);balances[o.currency]=sumDecimals([balances[o.currency]||"0",incoming?o.amount:multiplyDecimals(o.amount,"-1")]);
      return [e(o.date),`<button class="link" data-action="ops-detail" data-id="${o.id}">${e(operationNames[o.kind]||o.kind)} · ${e(o.number)}</button>${o.notes?`<small>${e(o.notes)}</small>`:""}${o.kind==="advance_received"&&!o.estimate_id&&!state.remoteProject?`<button class="btn tiny" data-action="ops-link-advance" data-id="${o.id}">${uiHtml("Vincular al convenio activo")}</button>`:""}`,e(partnerName(o.partner_id)),e(o.currency),incoming?money(o.amount):"—",incoming?"—":money(o.amount),money(balances[o.currency])];
    }))}</details></section>`;
  }
  function finances() {
    return (
      projectFunds() +
      financeSummary() +
      financialProjection() +
      `<section class="workflow-card finance-reports"><h2>${uiHtml("Informes y documentos")}</h2>
      <details><summary>${uiHtml("Alquileres y gastos mensuales previstos")}</summary>${rentals()}</details>
      <details><summary>${uiHtml("Flujo de fondos por mes")}</summary>${table(
        [
          uiText("Mes"),
          uiText("Moneda"),
          uiText("Ingresos previstos"),
          uiText("Egresos previstos"),
          uiText("Cobros reales"),
          uiText("Pagos reales"),
        ],
        (model.report?.cash_flow || []).map((p) => [
          e(p.month),
          e(p.currency),
          ...[p.planned_in, p.planned_out, p.actual_in, p.actual_out].map(
            money,
          ),
        ]),
      )}</details><details><summary>${uiHtml("Resultados por partida y centro de costos")}</summary><p>${uiHtml("Resultado devengado = venta certificada menos consumos netos, servicios aceptados y horas. Las facturas no duplican estos costos.")}</p>${table(
        [
          uiText("Partida"),
          uiText("Centro"),
          uiText("Moneda"),
          uiText("Costo real"),
          uiText("Venta certificada"),
          uiText("Resultado devengado"),
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
      )}</details><details><summary>${uiHtml("Resultados por rubro")}</summary>${table(
        [
          uiText("Rubro"),
          uiText("Moneda"),
          uiText("Costo previsto"),
          uiText("Costo real"),
          uiText("Desvío de costo"),
          uiText("Venta certificada"),
          uiText("Resultado devengado"),
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
      )}</details><details data-finance-history ${document.querySelector("[data-finance-history]")?.open ? "open" : ""}><summary>${uiHtml("Historial de documentos")}</summary>${documentRows()}</details></section>`
    );
  }
  function dashboard() {
    if (state.remoteProject?.data.permissions?.accounting === false)
      return `<p class="context-help">${uiHtml("El propietario no compartió información contable. Se muestra la producción autorizada de esta obra.")}</p>${production()}`;
    return `<p class="context-help">${state.view === "portfolio" ? uiHtml("Cartera global: último presupuesto emitido de cada obra, o último borrador si no hay emitidos.") : uiHtml("Tablero de esta obra con el presupuesto activo indicado arriba.")} ${uiHtml("Fecha de corte:")} ${e(model.asOf)}${uiHtml(". Los importes se muestran por moneda. El costo real proviene de consumos netos, servicios aceptados y horas de partes, sin duplicar las facturas. El costo a terminar utiliza la última proyección o la proporción del costo presupuestado pendiente según producción.")}</p>${table(
      [
        uiText("Obra"),
        uiText("Moneda"),
        uiText("Avance físico %"),
        uiText("Programado %"),
        uiText("Fin programado"),
        uiText("Costo previsto"),
        uiText("Costo real"),
        uiText("Pagado"),
        uiText("Cobrado"),
        uiText("Resultado esperado"),
        uiText("Alertas"),
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
          r.alerts.map((alert) => uiHtml(alert)).join(" · "),
        ]),
      ),
    )}${model.projectId ? finances() + production() : ""}`;
  }
  function certificateAnnex(d) {
    const snap = d.index_snapshot;
    return `${
      snap
        ? `<h4>${uiHtml("Ajuste")} ${snap.provisional ? "provisorio" : "definitivo"} ${uiHtml("· coeficiente")} ${numeric(snap.factor)}</h4><p>${uiHtml("Mes base {0} · mes objetivo {1} · mes aplicado {2}.", [snap.agreement.base_month, snap.target_month, snap.applied_month])}</p>${table(
            [
              uiText("Índice"),
              uiText("Peso"),
              uiText("Puntaje base"),
              uiText("Puntaje aplicado"),
              uiText("Publicación"),
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
        ? `<h4>${uiHtml("Adicionales puntuales")}</h4>${table(
            [
              uiText("Descripción"),
              uiText("Motivo"),
              uiText("Autorización"),
              uiText("Importe base"),
              uiText("Ajustable"),
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
        ? `<h4>${uiHtml("Diferencias de ajuste incluidas")}</h4>${table(
            [
              uiText("Certificado original"),
              uiText("Diferencia"),
              uiText("Reparo"),
              uiText("Nuevo coeficiente"),
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
    return `<div class="modal-overlay"><section class="dialog-shell wide" role="dialog" aria-modal="true" aria-label="${uiHtml("Documento registrado")}"><div class="dialog-header"><h2>${e(operationNames[d.kind])} · ${e(d.number)}</h2><button type="button" data-action="ops-close-detail" aria-label="${uiHtml("Cerrar documento")}">×</button></div><div class="dialog-body"><p>${uiHtml("Presupuesto del documento:")} <strong>${e(model.estimates.find((est) => est.id === d.estimate_id)?.title || "Sin vínculo")}</strong></p><p>${e(d.date)} · ${e(partnerName(d.partner_id))} · ${e(d.currency)} ${money(d.amount)}</p><p>${e(d.notes)}</p><p>${e(d.terms)}</p>${model.detailFiles.map(f=>`<button class="btn tiny" data-action="ops-rfq-proof-open" data-id="${f.id}">${e(f.name)}</button>`).join("")}${d.period_start ? `<p>${uiHtml("Período: {0} a {1}", [d.period_start, d.period_end])}</p>` : ""}${certificateAnnex(d)}${table(
      [uiText("Descripción"), uiText("Cantidad"), uiText("Precio"), uiText("Horas")],
      d.lines.map((l) => [
        e(l.description),
        numeric(l.quantity),
        money(l.unit_price),
        numeric(l.hours),
      ]),
    )}${table(
      [uiText("Cálculo"), uiText("Valor")],
      Object.entries(d.calculated || {}).map(([k, v]) => [e(k), numeric(v)]),
    )}${d.kind === "index" ? `<p>${e(d.index_series)} · ${e(d.index_period)} · ${numeric(d.index_value)}</p><a href="${e(d.index_source)}" target="_blank" rel="noreferrer">${e(d.index_source)}</a>` : ""}<p>${e(d.incidents)}</p><div class="operation-photos">${d.photos.map((p, i) => `<img src="${e(p)}" alt="${uiHtml("Foto")} ${i + 1}">`).join("")}</div><div class="dialog-actions"><button type="button" class="btn" data-action="ops-export-document" data-format="xlsx">${uiHtml("Exportar Excel")}</button><button type="button" class="btn" data-action="ops-export-document" data-format="pdf">${uiHtml("Exportar PDF")}</button><button type="button" class="btn" data-action="ops-close-detail">${uiHtml("Cerrar")}</button></div></div></section></div>`;
  }
  async function refreshPortfolio() {
    model.portfolio = await invoke("operations_portfolio", {
      asOf: model.asOf,
    });
  }
  function markup() {
    if (state.view === "portfolio")
      return `<main class="feature-page"><div class="feature-toolbar"><h1>${uiHtml("Cartera de obras")}</h1>${field(uiText("Fecha de corte"), "portfolio-asof", model.asOf, 'type="date" required')}<button class="btn" data-action="ops-portfolio-refresh">${uiHtml("Actualizar cartera")}</button><button class="btn" data-action="ops-export" data-format="xlsx">${uiHtml("Informe Excel")}</button><button class="btn" data-action="ops-export" data-format="pdf">${uiHtml("Informe PDF")}</button></div>${dashboard()}</main>`;
    return `<section class="feature-page operations-page"><nav class="operations-tabs" aria-label="${uiHtml("Etapas de gestión")}">${[
      ["purchases", uiHtml("Materiales y Acopio")],
      ["contracts", uiHtml("Subcontrataciones")],
      ["production", uiHtml("Libro de obra")],
      ["certificates", uiHtml("Certificaciones")],
      ["finance", uiHtml("Finanzas")],
      ["dashboard", uiHtml("Tablero")],
    ]
      .filter(
        ([key]) =>
          !state.remoteProject ||
          permissionsFor(state)[operationPermission(key)],
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
                  uiText("Tipo de documento"),
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
          }${model.tab === "finance" ? ("<button class=\"btn\" data-action=\"ops-new\">" + uiHtml("Nuevo documento") + "</button>") : ""}${select(
            uiText("Contenido del informe"),
            "ops-report-scope",
            [
              ["summary", uiText("Resumen financiero")],
              ["production", uiText("Producción y rendimientos")],
              ["cash", uiText("Flujo de fondos")],
              ["financial", uiText("Previsión financiera y materiales por período")],
              ["needs", uiText("Necesidades de materiales")],
              ["stock", uiText("Existencias")],
              ["costs", uiText("Resultados por centro y partida")],
              ["sections", uiText("Resultados por rubro")],
              ["documents", uiText("Documentos")],
            ],
            model.exportScope || "summary",
          )}<button class="btn" data-action="ops-export" data-format="xlsx">${uiHtml("Informe Excel")}</button><button class="btn" data-action="ops-export" data-format="pdf">${uiHtml("Informe PDF")}</button></div>`
        : ""
    }${(model.tab !== "finance" || !model.report?.financial_projection) && model.report?.alerts.map((a) => `<p class="operations-alert">${uiHtml(a)}</p>`).join("") || ""}${model.tab === "dashboard" ? dashboard() : !model.projectId ? ("<p>" + uiHtml("Seleccioná una obra para comenzar.") + "</p>") : `${model.tab === "purchases" ? quotations.markup() : model.tab === "contracts" ? quotations.markup() + certificates.contracts() : model.tab === "production" ? book.markup() : model.tab === "finance" ? `<div class="feature-toolbar">${field(uiText("Consultar al"), "ops-asof", model.asOf, 'type="date" required')}<button class="btn" data-action="ops-refresh">${uiHtml("Actualizar")}</button></div>` + `<div class="finance-certification-grid">${financeDashboard()}${certificates.overview({compact:true})}</div>` + cashSettings() + finances() + certificates.editors() : model.tab === "certificates" ? certificates.markup() : summary(model.report)}${state.remoteProject || (!["finance"].includes(model.tab) && model.draft?.kind !== "stock_opening") ? "" : model.draft?.kind === "stock_opening" ? `<section class="workflow-editor compact-editor stock-opening-editor" role="dialog" aria-modal="true" aria-label="${uiHtml("Declarar acopio existente")}"><button class="btn" data-action="ops-stock-close">${uiHtml("Cancelar")}</button>${formMarkup()}</section>` : formMarkup()}`}${detail()}</section>`;
  }
  async function act(button) {
    const a = button.dataset.action;
    if (a === "open-portfolio") {
      if (state.projectId)
        throw new Error(uiText("La cartera global se consulta desde Inicio"));
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
      if (state.view === "operations" && !(await protect())) return;
      if (!state.projectId) throw new Error(uiText("Abrí una obra desde Inicio"));
      model.projectId = state.projectId;
      if (state.remoteProject && !permissionsFor(state)[operationPermission(model.tab)]) model.tab=["purchases","contracts","production","certificates","finance"].find(t=>permissionsFor(state)[operationPermission(t)]) || "finance";
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
        throw new Error(uiText("Guardá primero la planificación de la obra"));
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
      if (!(await protect())) return;
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
    if (a === "ops-stock-close") {
      if (model.dirty && !window.confirm(uiText("¿Descartar los cambios del acopio?"))) return;
      model.draft = null;
      model.dirty = false;
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
    if (a === "ops-link-advance") {
      const estimate=model.estimates.find(e=>e.id===model.estimateId);
      if(!estimate)throw new Error(uiText("Elegí primero el presupuesto del convenio"));
      if(!window.confirm(uiText("¿Vincular este anticipo al convenio de «{0}»? No se registra un segundo ingreso.", [estimate.title])))return;
      await invoke("link_client_advance",{projectId:model.projectId,documentId:button.dataset.id,estimateId:estimate.id});await refresh();
    }
    if (a === "ops-fund-new") {
      if (!(await protect())) return;
      model.draft = draft(button.dataset.kind);model.dirty=false;
    }
    if (a === "ops-new") {
      if (!(await protect())) return;
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
    if (a === "ops-detail") {
      model.detail = model.docs.find((d) => d.id === button.dataset.id);
      model.detailFiles = state.remoteProject ? [] : await invoke("list_operation_files",{projectId:model.projectId,documentId:button.dataset.id});
    }
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
      if (!(await protect())) {
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
        throw new Error(uiText("Máximo 8 fotos JPG/PNG de 2 MB"));
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
        "supplier-movement-form",
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
    const fundKinds=["payment","collection","advance_received","advance_paid","direct_payment","fund_contribution","fund_reimbursement"];
    let proof=null;const file=form.querySelector('[name="fund-proof"]')?.files?.[0];
    if(file){if(file.size>10*1024*1024)throw new Error(uiText("Máximo 10 MB por comprobante"));proof={name:file.name,content:[...new Uint8Array(await file.arrayBuffer())]};}
    const saved = fundKinds.includes(model.draft.kind) ? await invoke("register_fund_movement",{operation:model.draft,proof}) : await invoke("post_operation", { operation: model.draft });
    model.dirty = false;
    model.draft = model.tab === "finance" ? draft(saved.kind) : null;
    await refresh();
    model.detail = saved;
    model.detailFiles = proof ? await invoke("list_operation_files",{projectId:model.projectId,documentId:saved.id}) : [];
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
    if (state.view === "operations" && evt.key === "Escape" && certificates.view.draft) {
      evt.preventDefault();
      document.querySelector('[data-action="ops-cert-close"]')?.click();
      return true;
    }
    if (model.detail && state.view === "operations" && evt.key === "Escape") {
      evt.preventDefault();
      model.detail = null;
      render();
      return true;
    }
    return false;
  }
  return {
    markup, act, change, submit, input, keyDown, protect, model,
    focusout: certificates.focusout,
    isSaving: () => quotations.isSaving() || certificates.isSaving(),
    hasUnsaved: () => model.dirty || book.hasUnsaved() || certificates.view.dirty || quotations.v.dirty,
  };
}
