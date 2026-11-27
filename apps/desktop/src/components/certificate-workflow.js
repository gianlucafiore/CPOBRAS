import { uiText, uiHtml } from "../services/interface-language.js";
import { e, field, select, dateToday } from "./helpers.js";
import { numeric, money, sumDecimals, multiplyDecimals, percentageOf, divideDecimals, compareDecimals, truncateDecimals } from "../decimal.js";
import { exportCertificate } from "../services/construction-export.js";
export function createCertificateWorkflow({
  invoke,
  state,
  model,
  render,
  document,
  window,
  FormData,
  refresh,
}) {
  const view = {
    draft: null,
    sheet: null,
    drafts: [],
    available: [],
    dirty: false,
    overview: [],
    project: "",
    contractId: null,
    payment: null,
    previewError: "",
  };
  async function load() {
    if (view.project !== model.projectId + ":" + model.estimateId) {
      view.draft = null;
      view.sheet = null;
      view.dirty = false;
      view.project = model.projectId + ":" + model.estimateId;
      view.contractId = null;
      view.payment = null;
    }
    if (!model.estimateId) return;
    [view.drafts, view.available, view.overview] = await Promise.all([
      invoke("list_certificate_drafts", {
        projectId: model.projectId,
        estimateId: model.estimateId,
      }),
      invoke("available_progress", {
        projectId: model.projectId,
        estimateId: model.estimateId,
      }),
      invoke("certification_overview", {
        projectId: model.projectId,
        estimateId: model.estimateId,
        asOf:
          state.remoteProject?.data.as_of ||
          (model.tab === "finance" ? model.asOf : dateToday()),
      }),
    ]);
  }
  const displayNumber = value => numeric(truncateDecimals(value));
  function read() {
    const form = document.querySelector("#certificate-workflow-form");
    if (!form || !view.draft) return;
    const f = new FormData(form),
      d = view.draft;
    for (const k of [
      "date",
      "period_start",
      "period_end",
      "notes",
      "work_units",
    ])
      if (f.has(k)) d.operation[k] = String(f.get(k));
    d.progress = [...form.querySelectorAll("[data-cert-progress]")].map(
      (row) => ({
        line_id: row.dataset.certProgress,
        accumulated_percent:
          row.dataset.exactPercent || "0",
        accumulated_quantity: row.dataset.progressMode === "quantity" ? row.dataset.exactQuantity || "0" : null,
        use_approved: true,
      }),
    );
    d.operation.extras = [...form.querySelectorAll("[data-cert-extra]")].map(
      (row) => {
        const get = (n) => row.querySelector(`[name="${n}"]`);
        return {
          id: row.dataset.certExtra,
          description: get("description").value,
          reason: get("reason").value,
          authorization: get("authorization")?.value || "",
          amount: get("amount").value || "0",
          adjustable: get("adjustable").checked,
          retention: get("retention").checked,
          recover_advance: get("recover_advance").checked,
        };
      },
    );
    d.operation.reconcile_ids =
      d.kind === "certificate" ? f.getAll("reconcile_id").map(String) : [];
  }
  let saving = null, editVersion = 0;
  async function save() {
    while (saving) await saving;
    const form = document.querySelector("#certificate-workflow-form");
    if (!form || !view.draft) return;
    if (!form.reportValidity()) throw new Error(uiText("Revisá los campos del certificado."));
    if (view.dirty) {
      read();
      const version = editVersion;
      const snapshot = structuredClone(view.draft);
      const request = invoke("save_certificate_draft", { draft: snapshot }).then(saved => {
        if (view.draft?.id === saved.id) {
          view.draft = saved;
          view.dirty = editVersion !== version;
        }
      });
      saving = request;
      try { await request; }
      finally { if (saving === request) saving = null; }
    }
  }
  async function savedPreview() {
    await save();
    while (view.dirty) await save();
    clearTimeout(previewTimer);
    ++previewGeneration;
    try {
      view.sheet = await invoke("preview_certificate_draft", {
        id: view.draft.id,
      });
      view.previewError = "";
    } catch (error) {
      view.previewError = String(error);
      throw error;
    }
  }
  let previewTimer,
    previewGeneration = 0;
  async function openEditorPreview() {
    clearTimeout(previewTimer);
    ++previewGeneration;
    if (!view.draft.revision) view.draft.operation.date = dateToday();
    try {
      view.sheet = await invoke("calculate_certificate_preview", {
        draft: structuredClone(view.draft),
      });
      view.previewError = "";
    } catch (error) {
      view.sheet = await invoke("certificate_editor_sheet", {
        id: view.draft.id,
      });
      view.previewError = String(error);
    }
    view.dirty = false;
  }
  function totals() {
    if (view.previewError)
      return `<strong>${uiHtml("Neto pendiente de cálculo")}</strong><small data-preview-status>${e(view.previewError)}</small>`;
    const op = view.sheet?.operation || {},
      c = op.calculated || {};
    return `<div><span>${uiHtml("Base del período")} <b>${money(c.base_work || "0")}</b></span><span>${uiHtml("Anticipo ({0} %)", [displayNumber(op.advance_percent || "0")])} <b>−${money(op.advance || "0")}</b></span><span>${uiHtml("Ajuste")} <b>${money(c.index_adjustment || "0")}</b></span><span>${uiHtml("Adicionales")} <b>${money(c.extras || "0")}</b></span><span>${uiHtml("Diferencias")} <b>${money(c.adjustment_difference || "0")}</b></span><span>${uiHtml("Reparo ({0} %)", [displayNumber(op.retention_percent || "0")])} <b>−${money(c.retention || "0")}</b></span><strong>${uiHtml("Neto {0} {1}", [op.currency || "ARS", money(op.amount || "0")])}</strong></div><small data-preview-status>${view.dirty ? uiHtml("Vista previa · cambios sin guardar") : ""}</small>`;
  }
  function livePreview() {
    clearTimeout(previewTimer);
    const generation = ++previewGeneration;
    previewTimer = setTimeout(async () => {
      if (!view.draft || !document.querySelector("#certificate-workflow-form"))
        return;
      read();
      const id = view.draft.id;
      try {
        const sheet = await invoke("calculate_certificate_preview", {
          draft: structuredClone(view.draft),
        });
        if (generation !== previewGeneration || view.draft?.id !== id) return;
        view.sheet = sheet;
        view.previewError = "";
        const footer = document.querySelector("[data-certificate-totals]");
        if (footer) footer.innerHTML = totals();
        for (const row of document.querySelectorAll("[data-cert-progress]")) {
          const r = sheet.rows.find(
            (r) => r.line_id === row.dataset.certProgress,
          );
          if (!r) continue;
          row.querySelector("[data-cert-period]").textContent = displayNumber(
            r.current_percent,
          );
          row.querySelector("[data-cert-remaining]").textContent = displayNumber(
            r.remaining_percent,
          );
          row.querySelector("[data-cert-amount]").textContent = money(
            r.period_amount,
          );
        }
      } catch (error) {
        if (generation === previewGeneration) {
          const status = document.querySelector("[data-preview-status]");
          if (status) status.textContent = "Vista previa pendiente: " + error;
        }
      }
    }, 180);
  }
  function issuedDocuments() {
    const documents = model.docs.filter(d => d.estimate_id === model.estimateId && ["certificate", "subcertificate"].includes(d.kind));
    if (!documents.length) return "";
    return `<section class="workflow-card"><h2>${uiHtml("Certificados definitivos")}</h2><table class="data-grid"><thead><tr><th>${uiHtml("Certificado")}</th><th>${uiHtml("Período")}</th><th>${uiHtml("Emisión")}</th><th>PDF</th></tr></thead><tbody>${documents.map(d =>
      `<tr><td>${d.kind === "certificate" ? uiHtml("Comitente") : uiHtml("Contratista")} · ${e(d.number)}</td><td>${e(d.period_start)} a ${e(d.period_end)}</td><td>${e(d.date)}</td><td><button class="btn" data-action="ops-cert-pdf" data-id="${e(d.id)}">${uiHtml("Ver PDF")}</button></td></tr>`
    ).join("")}</tbody></table></section>`;
  }
  function overview({ compact = false } = {}) {
    const drafts = view.drafts.filter(
        (d) => d.kind === "certificate" && !d.issued_id,
      ),
      open = drafts[0];
    const issued = model.docs.filter(
      (d) => d.kind === "certificate" && d.estimate_id === model.estimateId,
    );
    const rows = (view.overview || []).map((p) => ({
      ...p,
      document: issued.find(
        (d) =>
          (p.certificate_ids || []).includes(d.id) ||
          d.period_end === p.cut ||
          (d.period_start <= p.cut && d.period_end > p.cut),
      ),
    }));
    if (open && !rows.some((r) => r.cut === open.operation.period_end))
      rows.push({
        cut: open.operation.period_end,
        start: open.operation.period_start,
        amount: open.operation.amount || "0",
        state: "Abierto",
        index_status: "Borrador existente",
        document: null,
      });
    for (const d of issued)
      if (!rows.some((r) => r.document?.id === d.id))
        rows.push({
          cut: d.period_end,
          start: d.period_start,
          amount: d.amount,
          state: "Emitido",
          index_status: d.index_snapshot ? "Índice conservado" : "Sin ajuste",
          collection_date: d.due_date,
          document: d,
        });
    const seen = new Set();
    for (let i = rows.length - 1; i >= 0; i--) {
      const r = rows[i];
      if (r.document) {
        if (seen.has(r.document.id)) {
          rows.splice(i, 1);
          continue;
        }
        seen.add(r.document.id);
        r.cut = r.document.period_end;
        r.start = r.document.period_start;
      }
    }
    rows.sort((a, b) => a.cut.localeCompare(b.cut));
    const lastIssued =
      issued
        .map((d) => d.period_end)
        .sort()
        .at(-1) || "";
    const active = open
      ? rows.find((r) => r.cut === open.operation.period_end)
      : rows.find(
          (r) => !r.document && r.state !== "Emitido" && r.cut > lastIssued,
        );
    const headings = compact
      ? ["Período / certificado", "Estado", "Importe", "Fecha de cobro", ""]
      : ["Período / certificado", "Estado", "Cobro previsto / emitido", "Gastos próxima etapa", "Resto", "Índice", "Cobro", ""];
    const body = rows.map((r) => {
      const current = r === active;
      const status = r.document || r.state === "Emitido" ? "Emitido" : current ? "Abierto" : "Pendiente";
      const action = r.document
        ? `<button class="btn" data-action="ops-cert-pdf" data-id="${e(r.document.id)}">${uiHtml("Ver PDF")}</button>`
        : current && !state.remoteProject
          ? `<button class="btn primary" data-action="${open ? "ops-cert-resume" : "ops-cert-next"}" ${open ? 'data-id="' + e(open.id) + '"' : ""}>${uiHtml("Modificar avances")}</button>`
          : "";
      const detail = compact ? `<details><summary>${uiHtml("Gastos e índice")}</summary>
        <small>${uiHtml("Gastos próxima etapa: {0}", [money(r.next_expenses || "0")])}</small>
        <small>${uiHtml("Resto: {0}", [money(r.remainder || "0")])}</small>
        <small>${e(r.index_status || "Sin índice")}</small></details>` : "";
      return `<tr><td>${r.start ? e(r.start) + " → " : ""}${e(r.cut)}${r.document ? "<small>" + e(r.document.number) + "</small>" : ""}${detail}</td>
        <td>${uiHtml(status)}</td><td>${money(r.document?.amount || r.amount)}${compact ? `<small>${status === "Emitido" ? uiHtml("Emitido") : uiHtml("Previsto")}</small>` : ""}</td>
        ${compact ? "" : `<td>${money(r.next_expenses || "0")}</td><td>${money(r.remainder || "0")}</td><td>${e(r.index_status || "")}</td>`}
        <td>${e(r.collection_date || "—")}</td><td>${action}</td></tr>`;
    }).join("");
    return `<section class="workflow-card ${compact ? "finance-certificates" : ""}">
      <div class="feature-toolbar"><h2>${uiHtml("Certificaciones pactadas")}</h2><button class="btn" data-action="agreement-open">${uiHtml("Acuerdo, anticipo y reparo")}</button><button class="btn" data-action="ops-cert-refresh">${uiHtml("Actualizar previsión")}</button></div>
      <p>${compact ? uiHtml("Períodos según los cortes del Gantt.") : uiHtml("Los períodos provienen de los cortes del Gantt. Solo se edita el certificado abierto; al emitirlo se habilita el siguiente. Los cobros previstos no son cobros registrados.")}</p>
      <div class="finance-table-scroll"><table class="data-grid"><thead><tr>${headings.map(label => `<th>${label}</th>`).join("")}</tr></thead><tbody>
      ${body || `<tr><td colspan="${headings.length}">${uiHtml("Marcá los cortes de certificación en el Gantt para comenzar.")}</td></tr>`}
      </tbody></table></div></section>`;
  }
  function editors() {
    return editor() + paymentEditor();
  }
  function markup() {
    return overview() + issuedDocuments() + editors();
  }
  function contracts() {
    if (!view.contractId) return "";
    const c = model.docs.find((d) => d.id === view.contractId);
    if (!c) return "";
    const certs = model.docs.filter(
        (d) => d.kind === "subcertificate" && d.reference_id === c.id,
      ),
      last = certs
        .slice()
        .sort((a, b) => a.period_end.localeCompare(b.period_end))
        .at(-1),
      start = last
        ? new Date(
            new Date(last.period_end + "T12:00:00Z").getTime() + 86400000,
          )
            .toISOString()
            .slice(0, 10)
        : c.contract_terms?.start || dateToday().slice(0, 7) + "-01";
    return (
      `<section class="workflow-editor compact-editor contract-certificates" role="dialog" aria-modal="true" aria-label="${uiHtml("Certificados del subcontrato")}"><div class="contract-certificates-heading"><h2>${uiHtml("Certificados del subcontrato {0}", [c.number])}</h2><button class="btn" data-action="ops-cert-contract-close">${uiHtml("Cerrar")}</button></div><div class="feature-toolbar">${field(uiText("Inicio del período del contratista"), "cert-start", start, 'type="date"')}${field(uiText("Fin del período del contratista"), "cert-end", dateToday(), 'type="date"')}${state.remoteProject ? "" : `<button class="btn primary" data-action="ops-cert-open" data-contract="${c.id}">${uiHtml("Modificar avances del contratista")}</button>`}</div><div class="contract-certificates-table"><table class="data-grid"><thead><tr><th>${uiHtml("Certificado")}</th><th>${uiHtml("Período")}</th><th>${uiHtml("Neto por pagar")}</th><th></th></tr></thead><tbody>${certs.map((d) => `<tr><td>${e(d.number)}</td><td>${e(d.period_start)} a ${e(d.period_end)}</td><td>${money(d.amount)}</td><td class="contract-certificate-actions"><button class="btn" data-action="ops-cert-pdf" data-id="${d.id}">${uiHtml("Ver certificado / PDF")}</button>${state.remoteProject ? "" : `<button class="btn" data-action="ops-cert-pay" data-id="${d.id}">${uiHtml("Registrar pago del certificado")}</button>`}</td></tr>`).join("")}</tbody></table></div></section>` +
      editor() +
      paymentEditor()
    );
  }
  function paymentEditor() {
    if (!view.payment) return "";
    const o = view.payment;
    return `<section class="workflow-editor" role="dialog" aria-label="${uiHtml("Pago de certificado")}"><form id="certificate-payment-form"><h2>${uiHtml("Pago del certificado {0}", [o.number])}</h2>${field(uiText("Importe pagado al contratista"), "amount", o.amount, 'type="number" min="0.000001" step="any" required')}${field(uiText("Fecha del pago"), "date", dateToday(), 'type="date" required')}<button class="btn primary" type="submit">${uiHtml("Registrar pago")}</button><button class="btn" type="button" data-action="ops-cert-pay-close">${uiHtml("Cancelar")}</button></form></section>`;
  }
  function editor() {
    if (!view.draft || !view.sheet) return "";
    const d = view.draft,
      o = d.operation;
    return `<section class="workflow-editor certificate-editor" role="dialog" aria-modal="true" aria-label="${uiHtml("Modificar avances")}"><form id="certificate-workflow-form"><div class="feature-toolbar"><h2>${uiHtml("Modificar avances ·")} ${o.kind === "certificate" ? uiHtml("Comitente") : uiHtml("Contratista")}</h2><button type="button" class="btn" data-action="ops-cert-close">${uiHtml("Cerrar")}</button><button type="button" class="btn" data-action="ops-cert-preliminary">${uiHtml("Generar PRELIMINAR PDF")}</button><button type="button" class="btn primary" data-action="ops-cert-issue">${uiHtml("Emitir certificado aprobado")}</button></div><div class="workflow-grid">${field(uiText("Fecha de emisión / preparación"), "date", o.date, 'type="date" required')}${field(uiText("Desde"), "period_start", o.period_start, o.kind === "certificate" ? 'type="date" readonly' : 'type="date" required')}${field(uiText("Hasta"), "period_end", o.period_end, o.kind === "certificate" ? 'type="date" readonly' : 'type="date" required')}${o.kind === "subcertificate" ? field(uiText("Jornadas / horas (solo contratos por tiempo)"), "work_units", o.work_units || "0", 'type="number" min="0" step="any"') : ""}</div><p>${uiHtml("Ingresá el porcentaje o la cantidad acumulada; ambos se sincronizan automáticamente. El período es la diferencia con lo emitido anteriormente. Los avances aprobados de contratistas se incorporan al borrador, sin emitir automáticamente.")}</p>${o.kind === "certificate" ? ("<button type=\"button\" class=\"btn\" data-action=\"ops-cert-approved\">" + uiHtml("Incorporar avances aprobados de contratistas") + "</button>") : ""}<div class="certificate-body"><div class="workflow-scroll"><table class="data-grid"><thead><tr><th>${uiHtml("Ítem / partida")}</th><th>${uiHtml("Unidad")}</th><th>${uiHtml("Cantidad contratada")}</th><th>${uiHtml("Anterior %")}</th><th>${uiHtml("Acumulado %")}</th><th>${uiHtml("Cantidad acumulada")}</th><th>${uiHtml("Período %")}</th><th>${uiHtml("Restante %")}</th><th>${uiHtml("Importe período base")}</th></tr></thead><tbody>${view.sheet.rows
      .map((r) => {
        const progress = d.progress.find((p) => p.line_id === r.line_id);
        const v = progress?.accumulated_percent || r.previous_percent;
        const quantity = progress?.accumulated_quantity ?? (compareDecimals(v, r.previous_percent) === 0 ? r.previous : percentageOf(r.quantity, v));
        return `<tr data-cert-progress="${r.line_id}" data-progress-mode="${progress?.accumulated_quantity != null ? "quantity" : "percent"}" data-contract-quantity="${e(r.quantity)}" data-exact-percent="${e(v)}" data-exact-quantity="${e(quantity)}"><td>${e(r.item)} · ${e(r.description)}</td><td class="certificate-unit">${e(r.unit)}</td><td class="certificate-quantity">${displayNumber(r.quantity)}</td><td>${displayNumber(r.previous_percent)}</td><td><input data-cert-percent aria-label="${uiHtml("Avance acumulado {0}", [r.description])}" type="number" min="${e(truncateDecimals(r.previous_percent))}" max="100" step="any" value="${e(truncateDecimals(v))}" required></td><td><input data-cert-quantity aria-label="${uiHtml("Cantidad acumulada {0}", [r.description])}" type="number" min="${e(truncateDecimals(r.previous))}" max="${e(r.quantity)}" step="any" value="${e(truncateDecimals(quantity))}" required></td><td data-cert-period>${displayNumber(r.current_percent)}</td><td data-cert-remaining>${displayNumber(r.remaining_percent)}</td><td data-cert-amount>${money(r.period_amount)}</td></tr>`;
      })
      .join(
        "",
      )}</tbody></table></div><details ${(o.extras || []).length ? "open" : ""}><summary>${uiHtml("Adicionales y diferencias de ajuste")}</summary>${(
      model.pendingDifferences || []
    )
      .filter(
        (x) =>
          o.kind === "certificate" &&
          (x.estimate_id === model.estimateId || !x.estimate_id),
      )
      .map(
        (x) =>
          `<label><input type="checkbox" name="reconcile_id" value="${x.source_id}" ${(o.reconcile_ids || []).includes(x.source_id) ? "checked" : ""}> ${uiHtml("{0} · Diferencia {1}", [x.source_number, money(x.delta)])}</label>`,
      )
      .join("")}${(o.extras || [])
      .map(
        (x) =>
          `<fieldset data-cert-extra="${x.id}"><div class="workflow-grid">${field(uiText("Descripción"), "description", x.description)}${field(o.kind === "certificate" ? uiText("Motivo") : uiText("Motivo (opcional)"), "reason", x.reason)}${o.kind === "certificate" ? field(uiText("Autorización del comitente"), "authorization", x.authorization) : ""}${field(uiText("Importe completo"), "amount", x.amount, 'type="number" min="0" step="any"')}</div>${[
            ["adjustable", "Ajustar índices"],
            ["retention", "Aplicar reparo"],
            ["recover_advance", "Recuperar anticipo"],
          ]
            .map(
              ([n, label]) =>
                `<label><input type="checkbox" name="${n}" ${x[n] ? "checked" : ""}>${label}</label>`,
            )
            .join(
              "",
            )}<button class="btn" type="button" data-action="ops-cert-remove-extra" data-id="${x.id}">${uiHtml("Quitar")}</button></fieldset>`,
      )
      .join(
        "",
      )}<button type="button" class="btn" data-action="ops-cert-add-extra">${uiHtml("Agregar adicional puntual")}</button></details><label>${uiHtml("Observaciones")}<textarea name="notes">${e(o.notes)}</textarea></label></div><footer class="certificate-totals" data-certificate-totals>${totals()}</footer></form></section>`;
  }
  async function act(b) {
    const a = b.dataset.action;
    if (!a.startsWith("ops-cert-")) return false;
    const editor = document.querySelector("#certificate-workflow-form");
    if (editor && ["ops-cert-close", "ops-cert-preliminary", "ops-cert-issue", "ops-cert-approved", "ops-cert-add-extra", "ops-cert-remove-extra"].includes(a)) {
      if (!editor.reportValidity()) return true;
      try {
        do { await save(); } while (view.dirty);
      } catch (error) {
        const status = editor.querySelector("[data-preview-status]");
        if (status) status.textContent = String(error);
        return true;
      }
    }
    if (
      state.remoteProject &&
      ![
        "ops-cert-pdf",
        "ops-cert-refresh",
        "ops-cert-contract",
        "ops-cert-contract-close",
      ].includes(a)
    )
      throw new Error(uiText("Obra de solo lectura"));
    if (a === "ops-cert-refresh") await load();
    if (a === "ops-cert-contract-close") {
      await save();
      view.contractId = null;
    }
    if (a === "ops-cert-contract") {
      view.contractId = b.dataset.contract;
      view.draft = null;
      view.sheet = null;
      view.dirty = false;
    }
    if (a === "ops-cert-next") {
      view.contractId = null;
      view.draft = await invoke("open_next_client_certificate", {
        projectId: model.projectId,
        estimateId: model.estimateId,
      });
      await openEditorPreview();
    }
    if (a === "ops-cert-pay") {
      view.payment = model.docs.find((d) => d.id === b.dataset.id);
    }
    if (a === "ops-cert-pay-close") view.payment = null;
    if (a === "ops-cert-open" || a === "ops-cert-resume") {
      if (a === "ops-cert-resume")
        view.draft = structuredClone(
          (
            await invoke("list_certificate_drafts", {
              projectId: model.projectId,
              estimateId: model.estimateId,
            })
          ).find((d) => d.id === b.dataset.id),
        );
      else {
        const start =
            b.dataset.start ||
            document.querySelector('[name="cert-start"]')?.value ||
            dateToday().slice(0, 7) + "-01",
          end =
            b.dataset.cut ||
            document.querySelector('[name="cert-end"]')?.value ||
            dateToday(),
          contractId = b.dataset.contract || view.contractId || null;
        view.draft = await invoke("open_certificate_draft", {
          projectId: model.projectId,
          estimateId: model.estimateId,
          contractId,
          start,
          end,
        });
      }
      await openEditorPreview();
    }
    if (a === "ops-cert-close") {
      clearTimeout(previewTimer);
      ++previewGeneration;
      view.draft = null;
      view.sheet = null;
      view.dirty = false;
      await load();
    }
    if (a === "ops-cert-approved") {
      read();
      for (const p of view.draft.progress) {
        const row = view.sheet.rows.find((r) => r.line_id === p.line_id),
          q = sumDecimals(
            view.available
              .filter((x) => x.line_id === p.line_id)
              .map((x) => x.quantity),
          );
        const target =
          Number(row.previous_percent) +
          (Number(q) * 100) / Number(row.quantity);
        p.accumulated_quantity = null;
        p.accumulated_percent = String(
          Math.min(100, Math.max(Number(p.accumulated_percent), target)),
        );
      }
      view.dirty = true;
    }
    if (a === "ops-cert-add-extra") {
      read();
      view.draft.operation.extras ||= [];
      view.draft.operation.extras.push({
        id: window.crypto.randomUUID(),
        description: "",
        reason: "",
        authorization: "",
        amount: "0",
        adjustable: false,
        retention: false,
        recover_advance: false,
      });
      view.dirty = true;
    }
    if (a === "ops-cert-remove-extra") {
      read();
      view.draft.operation.extras = view.draft.operation.extras.filter(
        (x) => x.id !== b.dataset.id,
      );
      view.dirty = true;
    }
    if (a === "ops-cert-preliminary") {
      await savedPreview();
      await exportCertificate(invoke, view.sheet);
    }
    if (a === "ops-cert-pdf")
      await exportCertificate(
        invoke,
        await invoke("issued_certificate_sheet", { id: b.dataset.id }),
      );
    if (a === "ops-cert-issue") {
      await savedPreview();
      if (
        !window.confirm(
          uiText("¿El certificado está aprobado y querés emitirlo formalmente por {0}? Quedará cerrado y actualizará el avance oficial.", [money(view.sheet.operation.amount)]),
        )
      ) {
        render();
        return true;
      }
      await invoke("issue_certificate_draft", {
        id: view.draft.id,
        revision: view.draft.revision,
        date: view.draft.operation.date,
      });
      view.draft = null;
      view.sheet = null;
      view.dirty = false;
      await refresh();
      await load();
      state.message = uiText("Certificado emitido. El PDF está disponible en Certificaciones.");
    }
    render();
    if (
      [
        "ops-cert-add-extra",
        "ops-cert-remove-extra",
        "ops-cert-approved",
      ].includes(a)
    )
      livePreview();
    return true;
  }
  return {
    view,
    load,
    markup,
    contracts,
    overview,
    editors,
    act,
    submit: async (form) => {
      if (form?.id === "certificate-payment-form") {
        const f = new FormData(form),
          o = view.payment;
        await invoke("post_operation", {
          operation: {
            id: window.crypto.randomUUID(),
            project_id: model.projectId,
            estimate_id: o.estimate_id,
            partner_id: o.partner_id,
            reference_id: o.id,
            kind: "payment",
            number: "",
            date: String(f.get("date")),
            currency: o.currency,
            amount: String(f.get("amount")),
          },
        });
        view.payment = null;
        await refresh();
        await load();
        render();
        return;
      }
      await save();
    },
    input: (t) => {
      if (t.matches?.("[data-cert-percent],[data-cert-quantity]")) {
        const row = t.closest("[data-cert-progress]");
        try {
          const cap = t.matches("[data-cert-quantity]") ? row.dataset.contractQuantity : "100";
          if (t.value && compareDecimals(t.value, cap) > 0) {
            const message = "El avance acumulado no puede superar el 100 % de lo contratado.";
            t.setCustomValidity(message);
            const status = document.querySelector("[data-preview-status]");
            if (status) status.textContent = message;
            clearTimeout(previewTimer);
            ++previewGeneration;
            return;
          }
          t.setCustomValidity("");
          row.querySelector(t.matches("[data-cert-quantity]") ? "[data-cert-percent]" : "[data-cert-quantity]").setCustomValidity("");
          const value = truncateDecimals(t.value || "0");
          if (t.value && /[.,]\d{3,}/.test(t.value)) t.value = value;
          if (t.matches("[data-cert-quantity]")) {
            row.dataset.progressMode = "quantity";
            row.dataset.exactQuantity = value;
            row.dataset.exactPercent = compareDecimals(row.dataset.contractQuantity, "0") === 0 ? "0" : divideDecimals(multiplyDecimals(value, "100"), row.dataset.contractQuantity);
            row.querySelector("[data-cert-percent]").value = truncateDecimals(row.dataset.exactPercent);
          } else {
            row.dataset.progressMode = "percent";
            row.dataset.exactPercent = value;
            row.dataset.exactQuantity = percentageOf(row.dataset.contractQuantity, value);
            row.querySelector("[data-cert-quantity]").value = truncateDecimals(row.dataset.exactQuantity);
          }
        } catch { /* Keep transient edits until the input is a valid decimal. */ }
      }
      if (t.closest?.("#certificate-workflow-form")) {
        view.dirty = true;
        ++editVersion;
        livePreview();
      }
    },
    focusout: async (target) => {
      const editor = target.closest?.("#certificate-workflow-form");
      if (!editor) return;
      if (target.validity && !target.validity.valid) {
        target.reportValidity();
        return;
      }
      if (!view.dirty) return;
      try {
        await save();
        const status = document.querySelector("[data-preview-status]");
        if (status && !view.dirty) status.textContent = uiText("Borrador guardado");
      } catch (error) {
        const status = document.querySelector("[data-preview-status]");
        if (status) status.textContent = String(error);
      }
    },
    protect: async () => {
      try {
        await save();
        while (view.dirty && document.querySelector("#certificate-workflow-form")) await save();
        return true;
      } catch { return false; }
    },
    isSaving: () => Boolean(saving),
  };
}
