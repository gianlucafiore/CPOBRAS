import { uiText, uiHtml } from "../services/interface-language.js";
import {createOrganizationIndirectCosts} from "./organization-indirect-costs.js";
import { e, field } from "./helpers.js";
export function createOrganizations({
  invoke,
  state,
  render,
  document,
  window,
  FormData,
  loadCollections,
  profile,
  management,
}) {
  const indirect=createOrganizationIndirectCosts({invoke,state,render,document,window,FormData});
  const model = { tab: "list" };
  const selected = () =>
    state.organizations.find((o) => o.id === state.organizationId);
  async function refresh() {
    await loadCollections();
  }
  function protect() {
    if (
      state.pageDirty &&
      !window.confirm(
        uiText("¿Descartar los cambios sin guardar de esta organización?"),
      )
    )
      return false;
    state.pageDirty = false;
    return true;
  }
  function markup() {
    if (model.tab === "indirect") return indirect.markup();
    if (model.tab === "profile") return profile.markup();
    if (model.tab === "directories")
      return `<div class="feature-toolbar organization-directory-bar"><button class="btn" data-action="organization-open" data-id="${e(state.organizationId)}">${uiHtml("← Datos de {0}", [selected()?.name])}</button><button class="btn" data-action="organization-list">${uiHtml("Organizaciones")}</button></div>${management.markup()}`;
    return `<main class="feature-page"><div class="feature-toolbar"><h1>${uiHtml("Organizaciones")}</h1><button class="btn primary" data-action="organization-new">${uiHtml("Nueva organización")}</button></div><p>${uiHtml("Elegí una organización para consultar sus datos, logotipo y directorios. La predeterminada se preselecciona únicamente al crear obras nuevas.")}</p>${model.tab === "new" ? `<form id="organization-create-form" class="feature-editor"><h2>${uiHtml("Nueva organización propia")}</h2>${field(uiText("Nombre de la organización"), "name", "", 'required maxlength="500"')}<button class="btn primary" type="submit">${uiHtml("Crear organización")}</button><button class="btn" type="button" data-action="organization-list">${uiHtml("Cancelar")}</button><p class="feature-error" role="alert"></p></form>` : ""}<table class="data-grid"><thead><tr><th>${uiHtml("Nombre")}</th><th>${uiHtml("Tipo")}</th><th>${uiHtml("Predeterminada")}</th><th>${uiHtml("Acciones")}</th></tr></thead><tbody>${state.organizations.map((o) => `<tr><td>${e(o.name)}</td><td><span class="organization-badge ${o.ownership === "external" ? "external" : ""}">${o.ownership === "external" ? uiHtml("Externa · solo lectura") : uiHtml("Propia")}</span></td><td>${o.is_default ? uiHtml("✓ Para obras nuevas") : "—"}</td><td><button class="btn" data-action="organization-open" data-id="${o.id}">${o.ownership === "external" ? uiHtml("Consultar") : uiHtml("Abrir")}</button> <button class="btn" data-action="organization-default" data-id="${o.id}" ${o.ownership !== "own" || o.is_default ? "disabled" : ""}>${uiHtml("Usar como predeterminada")}</button></td></tr>`).join("")}</tbody></table></main>`;
  }
  async function act(button) {
    const a = button.dataset.action;
    if(indirect.act(button))return true;
    if(a==="organization-indirect"){if(!protect())return true;await indirect.open(state.organizationId);model.tab="indirect";render();return true;}
    if (a === "open-organizations") {
      await refresh();
      state.organizationId = null;
      model.tab = "list";
      state.view = "organizations";
      state.search = "";
      render();
      return true;
    }
    if (!a.startsWith("organization-")) return false;
    if (
      [
        "organization-list",
        "organization-open",
        "organization-new",
        "organization-directories",
        "organization-default",
      ].includes(a) &&
      !protect()
    )
      return true;
    if (a === "organization-list") {
      state.organizationId = null;
      model.tab = "list";
      await refresh();
    }
    if (a === "organization-new") model.tab = "new";
    if (a === "organization-open") {
      model.tab = "profile";
      await profile.act({
        dataset: { action: "open-organization-profile", id: button.dataset.id },
      });
    }
    if (a === "organization-default") {
      await invoke("set_default_organization", {
        organizationId: button.dataset.id,
      });
      await refresh();
      state.message =
        uiText("Predeterminada para crear obras nuevas. Las obras existentes conservan su organización.");
    }
    if (a === "organization-directories") {
      const o = selected();
      if (!o || o.ownership !== "own" || !o.company_id)
        throw new Error(
          uiText("Guardá una organización propia antes de gestionar sus directorios"),
        );
      model.tab = "directories";
      await management.act({ dataset: { action: "open-management" } });
      state.view = "organizations";
    }
    render();
    return true;
  }
  async function submit(form) {
    if(form.id==="organization-indirect-form"){await indirect.submit(form);return;}
    const data = new FormData(form),
      o = await invoke("create_organization", {
        name: String(data.get("name") || "").trim(),
      });
    await refresh();
    state.pageDirty = false;
    await act({ dataset: { action: "organization-open", id: o.id } });
  }
  return { markup, act, submit, model, input:indirect.input };
}
