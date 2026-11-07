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
}) {
  const model = { profile: { logo_png: [] }, revision: 0 };
  function markup() {
    return `<main class="feature-page"><h1>Datos públicos de impresión</h1><p>Completá únicamente los datos que querés publicar en los presupuestos. Esta ficha es independiente de los directorios internos y se comparte entre las obras de este equipo.</p><div class="feature-columns"><form id="print-profile-form" class="feature-editor"><div class="form-grid">${fields.map(([key, label]) => field(label, key, model.profile[key] || "", 'maxlength="500"')).join("")}</div><label class="field"><span>Leyenda pública al final del documento</span><textarea name="footer" maxlength="2000">${e(model.profile.footer || "")}</textarea></label><label class="field"><span>Logotipo PNG o JPEG (hasta 3 MB)</span><input name="print-logo" type="file" accept="image/png,image/jpeg"></label><button class="btn" type="button" data-action="print-profile-remove-logo">Quitar logotipo</button><button class="btn primary" type="submit">Guardar datos de impresión</button><p class="feature-error" role="alert"></p></form><aside class="feature-editor"><h2>Logotipo que se imprimirá</h2><img class="print-logo-preview" alt="Logotipo público" ${model.profile.logo_png.length ? `src="${logoUrl(model.profile.logo_png)}"` : "hidden"}><p>Los campos completos de esta ficha aparecerán en el PDF. Las notas internas, los usuarios y los contactos de Organización no se agregan automáticamente.</p></aside></div></main>`;
  }
  async function act(button) {
    if (button.dataset.action === "open-print-profile") {
      if (state.projectId)
        throw new Error("Los datos de impresión se administran desde Inicio");
      const saved = await invoke("get_print_profile");
      model.profile = saved.profile;
      model.revision = saved.revision;
      state.view = "print-profile";
      state.search = "";
      render();
      return true;
    }
    if (button.dataset.action === "print-profile-remove-logo") {
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
    const saved = await invoke("save_print_profile", {
      revision: model.revision,
      profile,
    });
    model.profile = saved.profile;
    model.revision = saved.revision;
    state.pageDirty = false;
    state.message = "Datos públicos de impresión guardados";
    render();
  }
  return { markup, act, change, submit, model };
}
