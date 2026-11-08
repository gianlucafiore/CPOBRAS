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
  };
  async function load() {
    if (view.project !== model.projectId) {
      view.draft = null;
      view.sheet = null;
      view.dirty = false;
      view.project = model.projectId;
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
        asOf: model.asOf,
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
    return `<section class="workflow-card"><div class="feature-toolbar"><h2>Certificaciones programadas</h2><button class="btn" data-action="agreement-open">Acuerdo, anticipo y reparo del presupuesto</button><button class="btn" data-action="ops-cert-refresh">Actualizar previsión</button></div><p>Los cortes se marcan en el Gantt. Los importes son previsiones; emitir no significa cobrar. El resto no es la ganancia de la obra.</p><table class="data-grid"><thead><tr><th>Corte / estado</th><th>Cobro previsto</th><th>Gastos próxima etapa</th><th>Resto</th><th>Índice</th><th>Cobro</th><th></th></tr></thead><tbody>${(view.overview || []).map((p, i) => `<tr><td>${e(p.cut)} · ${e(p.state)}</td><td>${money(p.amount)}</td><td>${money(p.next_expenses)}</td><td>${money(p.remainder)}</td><td>${e(p.index_status)}</td><td>${e(p.collection_date)}</td><td>${state.remoteProject || p.state === "Emitido" ? "" : `<button class="btn" data-action="ops-cert-open" data-cut="${e(p.cut)}" data-start="${e(p.start || (i ? new Date(new Date(view.overview[i - 1].cut + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10) : ""))}">Modificar avances</button>`}</td></tr>`).join("") || '<tr><td colspan="7">Programá cortes en el Gantt.</td></tr>'}</tbody></table></section>`;
  }
  function markup() {
    return (
      overview() +
      `<section class="workflow-card"><h2>Certificados de avance</h2><p>Solo se modifica el certificado abierto. El preliminar permite pedir aprobación; al emitir se fija el documento y se actualiza el avance del Gantt.</p>${state.remoteProject ? "" : `<div class="feature-toolbar">${field("Inicio del período", "cert-start", dateToday().slice(0, 7) + "-01", 'type="date"')}${field("Fin del período", "cert-end", dateToday(), 'type="date"')}${select("Certificar para", "cert-contract", [["", "Comitente"], ...model.docs.filter((d) => d.kind === "subcontract" && d.estimate_id === model.estimateId).map((d) => [d.id, `${d.number} · ${model.partners.find((p) => p.id === d.partner_id)?.name || "Cuadrilla / contratista"}`])], "")}<button class="btn primary" data-action="ops-cert-open">Abrir / modificar avances</button></div>`}<table class="data-grid"><thead><tr><th>Certificado</th><th>Período</th><th>Estado</th><th>Importe</th><th></th></tr></thead><tbody>${view.drafts
        .filter((d) => !d.issued_id)
        .map(
          (d) =>
            `<tr><td>${d.kind === "certificate" ? "Comitente" : "Subcontratista"}</td><td>${e(d.operation.period_start)} a ${e(d.operation.period_end)}</td><td>Abierto</td><td>En preparación</td><td><button class="btn" data-action="ops-cert-resume" data-id="${d.id}">Modificar avances</button></td></tr>`,
        )
        .join("")}${model.docs
        .filter(
          (d) =>
            ["certificate", "subcertificate"].includes(d.kind) &&
            d.estimate_id === model.estimateId,
        )
        .map(
          (d) =>
            `<tr><td>${e(d.number)}</td><td>${e(d.period_start)} a ${e(d.period_end)}</td><td>Emitido · ${e(d.date)}</td><td>${money(d.amount)}</td><td><button class="btn" data-action="ops-cert-pdf" data-id="${d.id}">Certificado PDF</button></td></tr>`,
        )
        .join("")}</tbody></table></section>` +
      editor()
    );
  }
  function editor() {
    if (!view.draft || !view.sheet) return "";
    const d = view.draft,
      o = d.operation;
    return `<section class="workflow-editor" role="dialog" aria-modal="true" aria-label="Modificar avances"><form id="certificate-workflow-form"><div class="feature-toolbar"><h2>Modificar avances · ${o.kind === "certificate" ? "Comitente" : "Contratista"}</h2><button type="button" class="btn" data-action="ops-cert-close">Cerrar</button><button type="submit" class="btn">Guardar borrador</button><button type="button" class="btn" data-action="ops-cert-preliminary">Generar PRELIMINAR PDF</button><button type="button" class="btn primary" data-action="ops-cert-issue">Emitir certificado aprobado</button></div><div class="workflow-grid">${field("Fecha de emisión / preparación", "date", o.date, 'type="date" required')}${field("Desde", "period_start", o.period_start, 'type="date" required')}${field("Hasta", "period_end", o.period_end, 'type="date" required')}${o.kind === "subcertificate" ? field("Jornadas / horas (solo contratos por tiempo)", "work_units", o.work_units || "0", 'type="number" min="0" step="any"') : ""}</div><p>Ingresá el avance acumulado de cada partida. El período es la diferencia con lo emitido anteriormente. Los avances aprobados de contratistas se incorporan al borrador, sin emitir automáticamente.</p>${o.kind === "certificate" ? '<button type="button" class="btn" data-action="ops-cert-approved">Incorporar avances aprobados de contratistas</button>' : ""}<div class="workflow-scroll"><table class="data-grid"><thead><tr><th>Ítem / partida</th><th>Anterior %</th><th>Acumulado %</th><th>Período %</th><th>Restante %</th><th>Importe período base</th></tr></thead><tbody>${view.sheet.rows
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
          contractId = b.dataset.cut
            ? null
            : document.querySelector('[name="cert-contract"]')?.value || null;
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
    overview,
    act,
    submit: async () => {
      await save();
      render();
    },
    input: (t) => {
      if (t.closest?.("#certificate-workflow-form")) {
        view.dirty = true;
      }
    },
    protect: () =>
      !view.dirty || window.confirm("Hay avances sin guardar. ¿Descartarlos?"),
  };
}
