import { e, field, select, dateToday } from "./helpers.js";
import { numeric, money, sumDecimals, multiplyDecimals } from "../decimal.js";
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
          row.querySelector("input[type=number]").value || "0",
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
          authorization: get("authorization").value,
          amount: get("amount").value,
          adjustable: get("adjustable").checked,
          retention: get("retention").checked,
          recover_advance: get("recover_advance").checked,
        };
      },
    );
    d.operation.reconcile_ids = f.getAll("reconcile_id").map(String);
  }
  async function save() {
    read();
    view.draft = await invoke("save_certificate_draft", { draft: view.draft });
    view.dirty = false;
    view.sheet = await invoke("preview_certificate_draft", {
      id: view.draft.id,
    });
  }
  function overview() {
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
    return `<section class="workflow-card"><div class="feature-toolbar"><h2>Certificaciones pactadas</h2><button class="btn" data-action="agreement-open">Acuerdo, anticipo y reparo del presupuesto</button><button class="btn" data-action="ops-cert-refresh">Actualizar previsión</button></div><p>Los períodos provienen de los cortes del Gantt. Solo se edita el certificado abierto; al emitirlo se habilita el siguiente. Los cobros previstos no son cobros registrados.</p><table class="data-grid"><thead><tr><th>Período / certificado</th><th>Estado</th><th>Cobro previsto / emitido</th><th>Gastos próxima etapa</th><th>Resto</th><th>Índice</th><th>Cobro</th><th></th></tr></thead><tbody>${
      rows
        .map((r) => {
          const current = r === active;
          return `<tr><td>${e(r.start || "")} → ${e(r.cut)}${r.document ? "<small>" + e(r.document.number) + "</small>" : ""}</td><td>${r.document || r.state === "Emitido" ? "Emitido" : current ? "Abierto" : "Pendiente"}</td><td>${money(r.document?.amount || r.amount)}</td><td>${money(r.next_expenses || "0")}</td><td>${money(r.remainder || "0")}</td><td>${e(r.index_status || "")}</td><td>${e(r.collection_date || "")}</td><td>${r.document ? `<button class="btn" data-action="ops-cert-pdf" data-id="${r.document.id}">Ver certificado / PDF</button>` : current && !state.remoteProject ? `<button class="btn primary" data-action="${open ? "ops-cert-resume" : "ops-cert-next"}" ${open ? 'data-id="' + open.id + '"' : ""}>Modificar avances</button>` : ""}</td></tr>`;
        })
        .join("") ||
      '<tr><td colspan="8">Marcá los cortes de certificación en el Gantt para comenzar.</td></tr>'
    }</tbody></table></section>`;
  }
  function markup() {
    return overview() + editor() + paymentEditor();
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
      `<section class="workflow-card"><h2>Certificados del subcontrato ${e(c.number)}</h2><div class="feature-toolbar">${field("Inicio del período del contratista", "cert-start", start, 'type="date"')}${field("Fin del período del contratista", "cert-end", dateToday(), 'type="date"')}<button class="btn primary" data-action="ops-cert-open" data-contract="${c.id}">Modificar avances del contratista</button></div><table class="data-grid"><thead><tr><th>Certificado</th><th>Período</th><th>Neto por pagar</th><th></th></tr></thead><tbody>${certs.map((d) => `<tr><td>${e(d.number)}</td><td>${e(d.period_start)} a ${e(d.period_end)}</td><td>${money(d.amount)}</td><td><button class="btn" data-action="ops-cert-pdf" data-id="${d.id}">Ver certificado / PDF</button><button class="btn" data-action="ops-cert-pay" data-id="${d.id}">Registrar pago del certificado</button></td></tr>`).join("")}</tbody></table></section>` +
      editor() +
      paymentEditor()
    );
  }
  function paymentEditor() {
    if (!view.payment) return "";
    const o = view.payment;
    return `<section class="workflow-editor" role="dialog" aria-label="Pago de certificado"><form id="certificate-payment-form"><h2>Pago del certificado ${e(o.number)}</h2>${field("Importe pagado al contratista", "amount", o.amount, 'type="number" min="0.000001" step="any" required')}${field("Fecha del pago", "date", dateToday(), 'type="date" required')}<button class="btn primary" type="submit">Registrar pago</button><button class="btn" type="button" data-action="ops-cert-pay-close">Cancelar</button></form></section>`;
  }
  function editor() {
    if (!view.draft || !view.sheet) return "";
    const d = view.draft,
      o = d.operation;
    return `<section class="workflow-editor" role="dialog" aria-modal="true" aria-label="Modificar avances"><form id="certificate-workflow-form"><div class="feature-toolbar"><h2>Modificar avances · ${o.kind === "certificate" ? "Comitente" : "Contratista"}</h2><button type="button" class="btn" data-action="ops-cert-close">Cerrar</button><button type="submit" class="btn">Guardar borrador</button><button type="button" class="btn" data-action="ops-cert-preliminary">Generar PRELIMINAR PDF</button><button type="button" class="btn primary" data-action="ops-cert-issue">Emitir certificado aprobado</button></div><div class="workflow-grid">${field("Fecha de emisión / preparación", "date", o.date, 'type="date" required')}${field("Desde", "period_start", o.period_start, o.kind === "certificate" ? 'type="date" readonly' : 'type="date" required')}${field("Hasta", "period_end", o.period_end, o.kind === "certificate" ? 'type="date" readonly' : 'type="date" required')}${o.kind === "subcertificate" ? field("Jornadas / horas (solo contratos por tiempo)", "work_units", o.work_units || "0", 'type="number" min="0" step="any"') : ""}</div><p>Ingresá el avance acumulado de cada partida. El período es la diferencia con lo emitido anteriormente. Los avances aprobados de contratistas se incorporan al borrador, sin emitir automáticamente.</p>${o.kind === "certificate" ? '<button type="button" class="btn" data-action="ops-cert-approved">Incorporar avances aprobados de contratistas</button>' : ""}<div class="workflow-scroll"><table class="data-grid"><thead><tr><th>Ítem / partida</th><th>Anterior %</th><th>Acumulado %</th><th>Período %</th><th>Restante %</th><th>Importe período base</th></tr></thead><tbody>${view.sheet.rows
      .map((r) => {
        const v =
          d.progress.find((p) => p.line_id === r.line_id)
            ?.accumulated_percent || r.previous_percent;
        return `<tr data-cert-progress="${r.line_id}"><td>${e(r.item)} · ${e(r.description)} <small>${e(r.unit)} · ${numeric(r.quantity)}</small></td><td>${numeric(r.previous_percent)}</td><td><input aria-label="Avance acumulado ${e(r.description)}" type="number" min="${r.previous_percent}" max="100" step="any" value="${e(v)}" required></td><td>${numeric(r.current_percent)}</td><td>${numeric(r.remaining_percent)}</td><td>${money(r.period_amount)}</td></tr>`;
      })
      .join(
        "",
      )}</tbody></table></div><p>Importes actualizados al guardar: neto ${o.currency} ${money(view.sheet.operation.amount)}. ${view.dirty ? "Cambios sin guardar." : ""}</p><details ${(o.extras || []).length ? "open" : ""}><summary>Adicionales y diferencias de ajuste</summary>${(
      model.pendingDifferences || []
    )
      .filter((x) => x.estimate_id === model.estimateId || !x.estimate_id)
      .map(
        (x) =>
          `<label><input type="checkbox" name="reconcile_id" value="${x.source_id}" ${(o.reconcile_ids || []).includes(x.source_id) ? "checked" : ""}> ${e(x.source_number)} · Diferencia ${money(x.delta)}</label>`,
      )
      .join("")}${(o.extras || [])
      .map(
        (x) =>
          `<fieldset data-cert-extra="${x.id}"><div class="workflow-grid">${field("Descripción", "description", x.description, "required")}${field("Motivo", "reason", x.reason, "required")}${field("Autorización del comitente", "authorization", x.authorization, "required")}${field("Importe completo", "amount", x.amount, 'type="number" min="0.000001" step="any" required')}</div>${[
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
            )}<button class="btn" type="button" data-action="ops-cert-remove-extra" data-id="${x.id}">Quitar</button></fieldset>`,
      )
      .join(
        "",
      )}<button type="button" class="btn" data-action="ops-cert-add-extra">Agregar adicional puntual</button></details><label>Observaciones<textarea name="notes">${e(o.notes)}</textarea></label></form></section>`;
  }
  async function act(b) {
    const a = b.dataset.action;
    if (!a.startsWith("ops-cert-")) return false;
    if (state.remoteProject && a !== "ops-cert-pdf" && a !== "ops-cert-refresh")
      throw new Error("Obra de solo lectura");
    if (a === "ops-cert-refresh") await load();
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
      view.draft.operation.date = dateToday();
      await save();
    }
    if (a === "ops-cert-pay") {
      view.payment = model.docs.find((d) => d.id === b.dataset.id);
    }
    if (a === "ops-cert-pay-close") view.payment = null;
    if (a === "ops-cert-open" || a === "ops-cert-resume") {
      if (a === "ops-cert-resume")
        view.draft = view.drafts.find((d) => d.id === b.dataset.id);
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
      view.draft.operation.date = dateToday();
      await save();
    }
    if (a === "ops-cert-close") {
      if (view.dirty && !window.confirm("¿Cerrar sin guardar los cambios?"))
        return true;
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
      await save();
      model.lastExport = await exportCertificate(invoke, view.sheet);
    }
    if (a === "ops-cert-pdf")
      model.lastExport = await exportCertificate(
        invoke,
        await invoke("issued_certificate_sheet", { id: b.dataset.id }),
      );
    if (a === "ops-cert-issue") {
      await save();
      if (
        !window.confirm(
          `¿El certificado está aprobado y querés emitirlo formalmente por ${money(view.sheet.operation.amount)}? Quedará cerrado y actualizará el avance oficial.`,
        )
      ) {
        render();
        return true;
      }
      const issued = await invoke("issue_certificate_draft", {
        id: view.draft.id,
        revision: view.draft.revision,
        date: view.draft.operation.date,
      });
      view.draft = null;
      view.sheet = null;
      view.dirty = false;
      await refresh();
      await load();
      model.lastExport = await exportCertificate(
        invoke,
        await invoke("issued_certificate_sheet", { id: issued.id }),
      );
    }
    render();
    return true;
  }
  return {
    view,
    load,
    markup,
    contracts,
    overview,
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
      render();
    },
    input: (t) => {
      if (t.closest?.("#certificate-workflow-form")) {
        view.dirty = true;
      }
    },
    protect: () => {
      if (!view.dirty) return true;
      if (!window.confirm("Hay avances sin guardar. ¿Descartarlos?"))
        return false;
      view.dirty = false;
      view.draft = null;
      view.sheet = null;
      return true;
    },
  };
}
