import { e, field } from "./helpers.js";
import { logoUrl, normalizeLogo } from "../services/print-logo.js";
const fields = [
  ["company_name", "Razón social / empresa"],
  ["trade_name", "Nombre comercial"],
  ["professional_name", "Nombre del profesional"],
  ["qualification", "Título / matrícula"],
  ["tax_id", "CUIT / identificación fiscal"],
  ["address", "Domicilio público"],
  ["phone", "Teléfono público"],
  ["email", "Correo público"],
  ["website", "Sitio web"],
];
export function createPrintProfile({
  invoke,
  state,
  render,
  document,
  FormData,
  loadCollections,
}) {
  const model = { profile: { logo_png: [] }, revision: 0, organization: null };
  function markup() {
    const org = model.organization,
      readonly = org?.ownership === "external";
    return `<main class="feature-page"><h1>${e(org?.name || "Organización")}</h1><p><span class="organization-badge ${readonly ? "external" : ""}">${readonly ? "Externa · solo lectura" : "Propia"}</span> ${org?.is_default ? " · Predeterminada para obras nuevas" : ""}</p><div class="feature-toolbar"><button class="btn" data-action="organization-list">Volver a organizaciones</button>${!readonly ? `<button class="btn" data-action="organization-directories" ${org?.company_id ? "" : "disabled"}>Directorios de la organización</button>` : ""}</div><p>${readonly ? "Datos públicos recibidos del propietario. Esta copia no se modifica localmente." : "Datos generales, logotipo y datos públicos de esta organización. Completá lo que querés imprimir en las obras que le pertenecen."}</p><div class="feature-columns"><form id="print-profile-form" class="feature-editor"><fieldset ${readonly ? "disabled" : ""} class="organization-fields">${field("Nombre de la organización", "organizationName", org?.name || "", 'required maxlength="500"')}<div class="form-grid">${fields.map(([key, label]) => field(label, key, model.profile[key] || "", 'maxlength="500"')).join("")}</div><label class="field"><span>Leyenda pública al final del documento</span><textarea name="footer" maxlength="2000">${e(model.profile.footer || "")}</textarea></label><label class="field"><span>Logotipo PNG o JPEG (hasta 3 MB)</span><input name="print-logo" type="file" accept="image/png,image/jpeg"></label><button class="btn" type="button" data-action="print-profile-remove-logo">Quitar logotipo</button><button class="btn primary" type="submit">Guardar organización</button><p class="feature-error" role="alert"></p></fieldset></form><aside class="feature-editor"><h2>Logotipo que se imprimirá</h2><img class="print-logo-preview" alt="Logotipo público" ${model.profile.logo_png.length ? `src="${logoUrl(model.profile.logo_png)}"` : "hidden"}><p>Estos datos se imprimen en las obras de esta organización. Sus directorios internos no se incorporan automáticamente al PDF.</p></aside></div></main>`;
  }
  async function act(button) {
    if (button.dataset.action === "open-organization-profile") {
      const org = await invoke("get_organization", {
        organizationId: button.dataset.id,
      });
      model.organization = org;
      model.profile = org.profile;
      model.revision = org.revision;
      state.organizationId = org.id;
      state.view = "organizations";
      state.search = "";
      render();
      return true;
    }
    if (button.dataset.action === "print-profile-remove-logo") {
      if (model.organization?.ownership !== "own") return true;
      model.profile.logo_png = [];
      const image = document.querySelector(".print-logo-preview");
      if (image) {
        image.hidden = true;
        image.removeAttribute("src");
      }
      state.pageDirty = true;
      return true;
    }
    return false;
  }
  async function change(target) {
    if (target.name !== "print-logo") return;
    const feedback = document.querySelector(
      "#print-profile-form .feature-error",
    );
    try {
      if (!target.files?.[0]) return;
      const bytes = await normalizeLogo(target.files[0]);
      model.profile.logo_png = bytes;
      const image = document.querySelector(".print-logo-preview");
      image.src = logoUrl(bytes);
      image.hidden = false;
      feedback.textContent = "";
      state.pageDirty = true;
    } catch (error) {
      feedback.textContent = String(error);
    }
  }
  async function submit(form) {
    const data = new FormData(form),
      profile = {
        logo_png: model.profile.logo_png,
        ...Object.fromEntries(
          [...fields.map(([key]) => key), "footer"].map((key) => [
            key,
            String(data.get(key) || "").trim(),
          ]),
        ),
      };
    if (model.organization?.ownership !== "own")
      throw new Error("Organización externa de solo lectura");
    const saved = await invoke("save_organization", {
      organizationId: model.organization.id,
      revision: model.revision,
      name: String(data.get("organizationName") || "").trim(),
      profile,
    });
    model.profile = saved.profile;
    model.revision = saved.revision;
    model.organization = saved;
    if (loadCollections) await loadCollections();
    state.pageDirty = false;
    state.message = "Organización guardada";
    render();
  }
  return { markup, act, change, submit, model };
}
