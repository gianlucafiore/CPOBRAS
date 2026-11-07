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
        "¿Descartar los cambios sin guardar de esta organización?",
      )
    )
      return false;
    state.pageDirty = false;
    return true;
  }
  function markup() {
    if (model.tab === "profile") return profile.markup();
    if (model.tab === "directories")
      return `<div class="feature-toolbar organization-directory-bar"><button class="btn" data-action="organization-open" data-id="${e(state.organizationId)}">← Datos de ${e(selected()?.name)}</button><button class="btn" data-action="organization-list">Organizaciones</button></div>${management.markup()}`;
    return `<main class="feature-page"><div class="feature-toolbar"><h1>Organizaciones</h1><button class="btn primary" data-action="organization-new">Nueva organización</button></div><p>Elegí una organización para consultar sus datos, logotipo y directorios. La predeterminada se preselecciona únicamente al crear obras nuevas.</p>${model.tab === "new" ? `<form id="organization-create-form" class="feature-editor"><h2>Nueva organización propia</h2>${field("Nombre de la organización", "name", "", 'required maxlength="500"')}<button class="btn primary" type="submit">Crear organización</button><button class="btn" type="button" data-action="organization-list">Cancelar</button><p class="feature-error" role="alert"></p></form>` : ""}<table class="data-grid"><thead><tr><th>Nombre</th><th>Tipo</th><th>Predeterminada</th><th>Acciones</th></tr></thead><tbody>${state.organizations.map((o) => `<tr><td>${e(o.name)}</td><td><span class="organization-badge ${o.ownership === "external" ? "external" : ""}">${o.ownership === "external" ? "Externa · solo lectura" : "Propia"}</span></td><td>${o.is_default ? "✓ Para obras nuevas" : "—"}</td><td><button class="btn" data-action="organization-open" data-id="${o.id}">${o.ownership === "external" ? "Consultar" : "Abrir"}</button> <button class="btn" data-action="organization-default" data-id="${o.id}" ${o.ownership !== "own" || o.is_default ? "disabled" : ""}>Usar como predeterminada</button></td></tr>`).join("")}</tbody></table></main>`;
  }
  async function act(button) {
    const a = button.dataset.action;
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
        "Predeterminada para crear obras nuevas. Las obras existentes conservan su organización.";
    }
    if (a === "organization-directories") {
      const o = selected();
      if (!o || o.ownership !== "own" || !o.company_id)
        throw new Error(
          "Guardá una organización propia antes de gestionar sus directorios",
        );
      model.tab = "directories";
      await management.act({ dataset: { action: "open-management" } });
      state.view = "organizations";
    }
    render();
    return true;
  }
  async function submit(form) {
    const data = new FormData(form),
      o = await invoke("create_organization", {
        name: String(data.get("name") || "").trim(),
      });
    await refresh();
    state.pageDirty = false;
    await act({ dataset: { action: "organization-open", id: o.id } });
  }
  return { markup, act, submit, model };
}
