import { uiText, uiHtml, displayDate, uiPlural } from "../services/interface-language.js";
import { e, field, select, dateToday } from "./helpers.js";
export function certificateReminderLead(window, scope) {
  try {
    const value = window.localStorage.getItem("cpobras:certificate-reminder-lead:" + scope);
    if (value !== null && /^\d+$/.test(value)) return Math.min(90, Number(value));
  } catch { /* Use the default when the preference is unavailable. */ }
  return 3;
}
export const reminderKinds = {
  get general() { return uiText("General"); },
  get materials() { return uiText("Compra de materiales"); },
  get client_certificate() { return uiText("Certificado de comitente"); },
  get contractor_certificate() { return uiText("Certificado a contratista"); },
  get client_quote() { return uiText("Solicitud de presupuesto de cliente"); },
};
const certificateReminderTitle = (row) => {
  if (!row.certificate) return row.title;
  const prefixes = [
    ["Emitir certificado del contratista ", "Emitir certificado del contratista {0}"],
    ["Cobrar certificado ", "Cobrar certificado {0}"],
    ["Pagar certificado ", "Pagar certificado {0}"],
  ];
  const rule = prefixes.find(([prefix]) => row.title.startsWith(prefix));
  return rule ? uiText(rule[1], [row.title.slice(rule[0].length)]) : uiText(row.title);
};
const certificateReminderNotes = (row) => {
  const balance = row.certificate && /^Saldo pendiente ([A-Z]{3}) (.+)$/.exec(row.notes);
  return balance ? uiText("Saldo pendiente {0} {1}", [balance[1], balance[2]]) : row.notes;
};
const inputOf = (row) =>
  Object.fromEntries(
    [
      "id",
      "revision",
      "title",
      "due_date",
      "kind",
      "project_id",
      "person_id",
      "notes",
      "completed",
    ].map((k) => [k, row[k]]),
  );
export function createReminders({
  invoke,
  state,
  render,
  document,
  window,
  FormData,
}) {
  const m = { draft: null, dirty: false, scope: null, busy: false };
  const scope = () => state.database?.scope || "local";
  const reset = () => {
    m.draft = null;
    m.dirty = false;
  };
  function data() {
    return (
      state.remindersData || { items: [], total: 0, page: 0, page_size: 20 }
    );
  }
  function markup() {
    if (m.scope !== scope()) {
      reset();
      m.scope = scope();
    }
    if (m.dirty && !state.pageDirty) reset();
    const today = dateToday(),
      page = data(),
      d = m.draft;
    const contacts = [
      ...new Map(
        [...(state.personClients || []), ...(state.personSuppliers || [])].map(
          (p) => [p.id, p],
        ),
      ).values(),
    ];
    const projects = (state.projects || []).filter((p) => !p.read_only);
    const options = (rows, id, label) => [
      ["", "Sin asociar"],
      ...rows.map((r) => [r.id, r.name]),
      ...(id && !rows.some((r) => r.id === id)
        ? [[id, label || "Asociación anterior"]]
        : []),
    ];
    const editor = d
      ? `<form id="reminder-form" class="reminder-editor"><h3>${d.id ? uiHtml("Editar recordatorio") : uiHtml("Nuevo recordatorio")}</h3>${field(uiText("Recordatorio"), "reminder-title", d.title, ("required maxlength=\"300\" placeholder=\"" + uiHtml("Qué necesitás recordar") + "\""))}${field(uiText("Fecha de vencimiento"), "reminder-date", d.due_date, 'type="date" required')}${select(uiText("Tipo de recordatorio"), "reminder-kind", Object.entries(reminderKinds), d.kind)}${select(uiText("Obra (opcional)"), "reminder-project", options(projects, d.project_id, d.project_name), d.project_id || "")}${select(uiText("Cliente / contratista (opcional)"), "reminder-person", options(contacts, d.person_id, d.person_name), d.person_id || "")}<label class="field"><span>${uiHtml("Notas")}</span><textarea name="reminder-notes" rows="3" maxlength="5000">${e(d.notes)}</textarea></label><div class="reminder-buttons"><button class="btn primary" type="submit">${uiHtml("Guardar recordatorio")}</button><button class="btn" type="button" data-action="reminder-cancel">${uiHtml("Cancelar")}</button></div><p class="feature-error" role="alert"></p></form>`
      : "";
    return `<aside class="reminders-panel" aria-label="${uiHtml("Recordatorios")}"><div class="reminders-heading"><h2>${uiHtml("Recordatorios")}</h2><button class="btn tiny primary" data-action="reminder-new">${uiHtml("＋ Nuevo")}</button></div><p class="reminders-hint">${uiHtml("Avisar por certificaciones")} <input type="number" data-reminder-lead min="0" max="90" step="1" value="${certificateReminderLead(window, scope())}" aria-label="${uiHtml("Días de anticipación para certificaciones")}"> ${uiHtml("días antes. Los vencidos y resueltos quedan al final.")}</p>${editor}${state.remindersError ? `<p class="feature-error" role="alert">${uiHtml("No se pudieron cargar los recordatorios. {0}", [state.remindersError])} <button class="btn tiny" data-action="reminder-refresh">${uiHtml("Reintentar")}</button></p>` : ""}<div class="reminders-scroll"><table class="data-grid reminders-table"><thead><tr><th>${uiHtml("Recordatorio")}</th><th>${uiHtml("Vence")}</th><th></th></tr></thead><tbody>${
      page.items
        .map((row) => {
          const expired = row.due_date < today,
            old = expired || row.completed;
          const title = certificateReminderTitle(row);
          const status = row.completed
            ? "Resuelto"
            : expired
              ? "Vencido"
              : row.due_date === today
                ? "Vence hoy"
                : "";
          return `<tr class="${old ? "reminder-history" : ""}" data-reminder-id="${e(row.id)}"><td><strong>${e(title)}</strong><small>${e(reminderKinds[row.kind] || row.kind)}</small>${row.project_name ? `<small>${uiHtml("Obra: {0}", [row.project_name])}</small>` : ""}${row.person_name ? `<small>${uiHtml("Contacto: {0}", [row.person_name])}</small>` : ""}${row.certificate?.start ? `<small>${e(displayDate(row.certificate.start))} a ${e(displayDate(row.certificate.end))}</small>` : ""}${row.notes ? `<details><summary>${uiHtml("Notas")}</summary><p>${e(certificateReminderNotes(row))}</p></details>` : ""}</td><td><time datetime="${e(row.due_date)}">${e(displayDate(row.due_date))}</time>${status ? `<small class="${!old ? "reminder-today" : ""}">${uiHtml(status)}</small>` : ""}</td><td><div class="reminder-actions" role="group" aria-label="${uiHtml("Acciones de recordatorio {0}", [title])}">${row.certificate ? `<button class="btn tiny reminder-open-certificate" data-action="open-certificate-reminder" data-id="${e(row.id)}" aria-label="${uiHtml("Abrir certificado")}" title="${uiHtml("Abrir certificado")}">${uiHtml("Abrir")}</button>` : `<button class="btn tiny" title="${uiHtml("Editar")}" data-action="reminder-edit" data-id="${e(row.id)}" aria-label="${uiHtml("Editar recordatorio {0}", [row.title])}">✎</button><button class="btn tiny" title="${row.completed ? uiHtml("Reabrir") : uiHtml("Marcar como resuelto")}" data-action="reminder-toggle" data-id="${e(row.id)}" aria-label="${row.completed ? uiHtml("Reabrir") : uiHtml("Resolver")} ${uiHtml("recordatorio")} ${e(row.title)}">${row.completed ? "↶" : "✓"}</button><button class="btn tiny" title="${uiHtml("Eliminar")}" data-action="reminder-delete" data-id="${e(row.id)}" aria-label="${uiHtml("Eliminar recordatorio {0}", [row.title])}">×</button>`}</div></td></tr>`;
        })
        .join("") ||
      ("<tr><td colspan=\"3\" class=\"empty-cell\">" + uiHtml("Sin recordatorios. Agregá compras, certificados o solicitudes de presupuesto para tenerlos presentes.") + "</td></tr>")
    }</tbody></table></div><div class="reminders-pagination"><button class="btn tiny" data-action="reminder-prev" ${page.page === 0 ? "disabled" : ""} aria-label="${uiHtml("Recordatorios: página anterior")}">‹</button><span role="status">${page.total ? uiHtml("{0}–{1} de {2}", [page.page * 20 + 1, Math.min((page.page + 1) * 20, page.total), page.total]) : e(uiPlural(0, {one:"{count} recordatorio", other:"{count} recordatorios"}))} · ${uiHtml("Página {0}", [page.page + 1])}</span><button class="btn tiny" data-action="reminder-next" ${(page.page + 1) * 20 >= page.total ? "disabled" : ""} aria-label="${uiHtml("Recordatorios: página siguiente")}">›</button></div></aside>`;
  }
  async function refresh(page = state.remindersData?.page || 0) {
    const before = scope(),
      today = dateToday();
    try {
      const result = await invoke("list_reminders", { today, page, leadDays: certificateReminderLead(window, scope()) });
      if (before !== scope()) return;
      if (!result?.items)
        throw new Error(uiText("Respuesta inválida al cargar la lista"));
      state.remindersData = result;
      state.remindersError = "";
      state.remindersToday = today;
    } catch (error) {
      if (before === scope()) state.remindersError = String(error);
    }
  }
  function input(target) {
    if (!m.draft || !target.closest?.("#reminder-form")) return;
    const keys = {
      "reminder-title": "title",
      "reminder-date": "due_date",
      "reminder-kind": "kind",
      "reminder-project": "project_id",
      "reminder-person": "person_id",
      "reminder-notes": "notes",
    };
    const key = keys[target.name];
    if (!key) return;
    m.draft[key] = ["project_id", "person_id"].includes(key)
      ? target.value || null
      : target.value;
    m.dirty = true;
    state.pageDirty = true;
  }
  async function change(target) {
    if (target.matches?.("[data-reminder-lead]")) {
      if (!target.value || !target.reportValidity()) return;
      window.localStorage.setItem("cpobras:certificate-reminder-lead:" + scope(), target.value);
      await refresh(0);
      render();
      return;
    }
    input(target);
    if (target.name === "reminder-project" && m.draft) {
      const project = state.projects.find((p) => p.id === target.value);
      if (project?.client_id) {
        m.draft.person_id = project.client_id;
        const picker = document.querySelector("[name=reminder-person]");
        if (picker) picker.value = project.client_id;
      }
    }
  }
  async function act(button) {
    if (state.view !== "projects" || m.busy) return;
    const action = button.dataset.action;
    if (["reminder-new", "reminder-edit", "reminder-cancel"].includes(action)) {
      if (
        m.dirty &&
        !window.confirm(uiText("¿Descartar los cambios de este recordatorio?"))
      )
        return;
      reset();
      state.pageDirty = false;
      if (action === "reminder-new")
        m.draft = {
          id: null,
          revision: 0,
          title: "",
          due_date: dateToday(),
          kind: "general",
          project_id: null,
          person_id: null,
          notes: "",
          completed: false,
        };
      if (action === "reminder-edit")
        m.draft = { ...data().items.find((r) => r.id === button.dataset.id) };
    } else {
      m.busy = true;
      try {
        if (["reminder-toggle", "reminder-delete"].includes(action)) {
          const row = data().items.find((r) => r.id === button.dataset.id);
          if (!row) return;
          if (action === "reminder-delete") {
            if (
              !window.confirm("¿Eliminar el recordatorio «" + row.title + "»?")
            )
              return;
            await invoke("delete_reminder", {
              id: row.id,
              revision: row.revision,
            });
          } else
            await invoke("save_reminder", {
              reminder: { ...inputOf(row), completed: !row.completed },
            });
        }
        const page =
          data().page +
          (action === "reminder-next"
            ? 1
            : action === "reminder-prev"
              ? -1
              : 0);
        await refresh(Math.max(0, page));
      } finally {
        m.busy = false;
      }
    }
    render();
  }
  async function submit(form) {
    if (!m.draft) throw new Error(uiText("Abrí un recordatorio para guardarlo"));
    const values = new FormData(form),
      v = (k) => String(values.get(k) || "").trim();
    const reminder = {
      ...inputOf(m.draft),
      title: v("reminder-title"),
      due_date: v("reminder-date"),
      kind: v("reminder-kind"),
      project_id: v("reminder-project") || null,
      person_id: v("reminder-person") || null,
      notes: v("reminder-notes"),
    };
    await invoke("save_reminder", { reminder });
    reset();
    state.pageDirty = false;
    state.message =
      reminder.due_date < dateToday()
        ? uiText("Recordatorio guardado en el historial de vencidos")
        : uiText("Recordatorio guardado");
    await refresh(0);
    render();
  }
  async function checkDay() {
    const canRender = () =>
      state.view === "projects" &&
      !state.modal &&
      !document.querySelector?.('[role="dialog"]');
    if (
      canRender() &&
      !state.navigating &&
      !state.busy &&
      !m.busy &&
      state.remindersToday !== dateToday()
    ) {
      m.busy = true;
      try {
        await refresh(0);
        // A dialog may have opened while the database request was in flight.
        if (canRender()) render();
      } finally {
        m.busy = false;
      }
    }
  }
  window.addEventListener?.("focus", checkDay);
  document.addEventListener?.("visibilitychange", () => {
    if (document.visibilityState === "visible") checkDay();
  });
  const timer = window.setInterval?.(checkDay, 60000);
  timer?.unref?.();
  return { markup, act, input, change, submit, refresh, model: m };
}
