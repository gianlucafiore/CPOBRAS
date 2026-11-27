import { uiText, uiHtml, currentInterfaceLanguage } from "../services/interface-language.js";
import { e, field } from "./helpers.js";
export function createSiteBook({
  invoke,
  state,
  model,
  render,
  document,
  window,
  FormData,
}) {
  const v = {
    entries: [],
    total: 0,
    page: 0,
    editing: null,
    description: "",
    dirty: false,
    project: "",
  };
  const stamp = (s) =>
    s ? new Date(s).toLocaleString(currentInterfaceLanguage()) : "Automática al guardar";
  async function load(page = 0) {
    if (v.project !== model.projectId) {
      v.editing = null;
      v.description = "";
      v.dirty = false;
      v.project = model.projectId;
    }
    const data = await invoke("list_site_entries", {
      projectId: model.projectId,
      page,
    });
    Object.assign(v, {
      entries: data.entries,
      total: data.total,
      page: data.page,
    });
  }
  function read() {
    const input = document.querySelector('[name="site-description"]');
    if (input) v.description = input.value;
  }
  function markup() {
    return `<section class="workflow-card site-book"><h2>${uiHtml("Libro de obra")}</h2><p>${uiHtml("Los partes se guardan primero como borrador. Confirmalos para incorporarlos al libro definitivo; después no se pueden modificar.")}</p>${state.remoteProject ? "" : `<form id="site-book-form"><div class="feature-toolbar"><strong>${v.editing ? uiHtml("{0} · Borrador", [e(v.editing.number)]) : uiHtml("Nuevo parte de obra")}</strong><span>${uiHtml("Fecha de registro: {0}", [stamp(v.editing?.created_at)])}</span></div><label>${uiHtml("Descripción del parte")}<textarea aria-label="Descripción del parte" name="site-description" rows="4" maxlength="20000" required>${e(v.description)}</textarea></label><div class="feature-toolbar"><button type="submit" class="btn primary">${v.editing ? uiHtml("Guardar cambios del borrador") : uiHtml("Guardar borrador")}</button>${v.editing ? ("<button type=\"button\" class=\"btn\" data-action=\"ops-book-cancel\">" + uiHtml("Nuevo parte") + "</button>") : ""}</div></form>`}<h3>${uiHtml("Partes de obra")}</h3><form id="site-book-print-form" class="feature-toolbar">${field(uiText("Desde fecha"), "from", "", 'type="date"')}${field(uiText("Hasta fecha"), "to", "", 'type="date"')}${field(uiText("Desde número"), "first", "", 'placeholder="PAR-0001"')}${field(uiText("Hasta número"), "last", "", 'placeholder="PAR-0030"')}<button class="btn" type="submit">${uiHtml("PDF de partes confirmados")}</button></form><table class="data-grid"><thead><tr><th>${uiHtml("Número")}</th><th>${uiHtml("Fecha de registro")}</th><th>${uiHtml("Descripción")}</th><th>${uiHtml("Estado")}</th><th></th></tr></thead><tbody>${v.entries.map((r) => `<tr><td>${e(r.number)}</td><td>${e(stamp(r.created_at))}</td><td class="site-description">${e(r.description)}</td><td>${r.confirmed_at ? ("" + uiHtml("Confirmado") + "<br><small>") + e(stamp(r.confirmed_at)) + "</small>" : uiHtml("Borrador")}</td><td>${r.confirmed_at || state.remoteProject ? "" : `<button class="btn" data-action="ops-book-edit" data-id="${r.id}">${uiHtml("Editar")}</button><button class="btn primary" data-action="ops-book-confirm" data-id="${r.id}">${uiHtml("Confirmar")}</button>`}</td></tr>`).join("") || ("<tr><td colspan=\"5\">" + uiHtml("Todavía no hay partes de obra.") + "</td></tr>")}</tbody></table><div class="feature-toolbar"><button class="btn" data-action="ops-book-page" data-page="${v.page - 1}" ${v.page === 0 ? "disabled" : ""}>${uiHtml("Anterior")}</button><span>${uiHtml("Página")} ${v.page + 1} ${uiHtml("de")} ${Math.max(1, Math.ceil(v.total / 30))} · ${v.total} ${uiHtml("registros · 30 por página")}</span><button class="btn" data-action="ops-book-page" data-page="${v.page + 1}" ${(v.page + 1) * 30 >= v.total ? "disabled" : ""}>${uiHtml("Siguiente")}</button></div></section>`;
  }
  async function act(b) {
    const a = b.dataset.action;
    if (!a.startsWith("ops-book-")) return false;
    read();
    if (a === "ops-book-page") {
      if (!protect()) return true;
      await load(Number(b.dataset.page));
    }
    if (a === "ops-book-edit") {
      if (!protect()) return true;
      v.editing = v.entries.find((r) => r.id === b.dataset.id);
      v.description = v.editing.description;
      v.dirty = false;
    }
    if (a === "ops-book-cancel") {
      if (!protect()) return true;
      v.editing = null;
      v.description = "";
      v.dirty = false;
    }
    if (a === "ops-book-confirm") {
      const r = v.entries.find((r) => r.id === b.dataset.id);
      if (v.dirty) {
        window.alert(uiText("Guardá primero los cambios del formulario."));
        return true;
      }
      if (
        !window.confirm(
          uiText("¿Estás seguro de confirmar este parte? Después no podrás modificarlo."),
        )
      )
        return true;
      await invoke("confirm_site_entry", {
        projectId: model.projectId,
        id: r.id,
        revision: r.revision,
      });
      if (v.editing?.id === r.id) {
        v.editing = null;
        v.description = "";
      }
      await load(v.page);
    }
    render();
    return true;
  }
  async function submit(form) {
    if (form.id === "site-book-form") {
      read();
      await invoke("save_site_entry", {
        projectId: model.projectId,
        id: v.editing?.id || null,
        revision: v.editing?.revision || 0,
        description: v.description,
      });
      v.editing = null;
      v.description = "";
      v.dirty = false;
      await load();
      render();
      return;
    }
    const f = new FormData(form),
      entries = await invoke("print_site_entries", {
        projectId: model.projectId,
        from: String(f.get("from") || ""),
        to: String(f.get("to") || ""),
        first: String(f.get("first") || "").trim(),
        last: String(f.get("last") || "").trim(),
      });
    const { exportSiteBook } = await import("../services/site-book-export.js");
    model.lastExport = await exportSiteBook(invoke, model, entries);
    render();
  }
  function protect() {
    read();
    if (!v.dirty) return true;
    if (!window.confirm(uiText("¿Descartar los cambios del parte sin guardar?")))
      return false;
    v.dirty = false;
    v.editing = null;
    v.description = "";
    return true;
  }
  return {
    load,
    markup,
    act,
    submit,
    protect,
    hasUnsaved: () => v.dirty,
    input: (t) => {
      if (t.name === "site-description") {
        v.description = t.value;
        v.dirty = true;
      }
    },
  };
}
