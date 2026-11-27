import { uiHtml } from "../services/interface-language.js";
import { e } from "./helpers.js";
import { colorThemes } from "../services/appearance.js";
import { interfaceText, languages } from "../services/interface-language.js";
import metadata from "../../package.json" with { type: "json" };

function appearanceMarkup(t, language, { theme = "default", followSystem = false } = {}) {
  return `<section class="project-card appearance-card">
    <h2>${t("Apariencia")}</h2>
    <label class="field options-language"><span>${t("Idioma")}</span>
      <select name="interface-language">${languages.map(([code, name]) =>
        `<option value="${code}" lang="${code}" ${code === language ? "selected" : ""}>${e(name)}</option>`
      ).join("")}</select>
    </label>
    <label class="theme-system"><input type="checkbox" name="follow-system-theme" ${followSystem ? "checked" : ""}> ${t("Seguir al sistema")}</label>
    <fieldset data-theme-choices ${followSystem ? "disabled" : ""}>
      <legend>${t("Tema de colores")}</legend>
      <div class="theme-choices">
      ${colorThemes.map(([key, name]) => `<label class="theme-choice">
        <input type="radio" name="color-theme" value="${key}" ${key === theme ? "checked" : ""}>
        <span class="theme-preview" data-color-palette="${key}" aria-hidden="true"><i></i><i></i><i></i></span>
        <span>${t(name)}</span>
      </label>`).join("")}
      </div>
    </fieldset>
  </section>`;
}

const repository = "https://github.com/gianlucafiore/CPOBRAS";
const projectLinks = [
  ["repository", repository, "Repositorio"],
  ["issues", repository + "/issues", "Sugerencias y problemas"],
  ["support", "https://gianlucafiore.github.io/CPOBRAS/#patrocinio", "Donaciones y apoyo"],
];

export function optionsMarkup(state, appearance) {
  const language = state.language || "es-AR";
  const t = message => e(interfaceText(language, message));
  const db = state.database;
  return `<section class="list-page options-page">
    <div class="list-top"><h1>${t("Opciones")}</h1><button class="btn" data-action="navigate" data-view="projects">${t("Volver a Inicio")}</button></div>
    ${appearanceMarkup(t, language, appearance)}
    ${state.aiActionsEnabled ? `<section class="project-card">
      <h2>${uiHtml("Inteligencia artificial")}</h2>
      <button type="button" class="btn" data-action="form-ai-open" data-kind="settings">${uiHtml("Configurar IA")}</button>
    </section>` : ""}
    <section class="project-card"><h2>${t("Base de datos")}</h2>
      <p>${t("Abrir usa el archivo en su ubicación original durante esta sesión.")} ${t("Importar guarda una copia en la carpeta de datos de CP Obras y la abre automáticamente al iniciar.")}</p>
      ${db ? `<p class="database-menu-path" title="${e(db.path)}">${t("Base activa")} · ${e(db.name)}</p><p>${e(db.path)}</p>
      <div class="heading-actions">
        <button class="btn" data-action="database-new">${t("Nueva base de datos…")}</button>
        <button class="btn" data-action="database-open">${t("Abrir base de datos…")}</button>
        <button class="btn" data-action="database-import">${t("Importar base de datos…")}</button>
      </div><h3>${t("Bases recientes")}</h3>
      <ul>${(db.recent || []).map(path => `<li><button class="link" data-action="database-recent" data-path="${e(path)}" ${path === db.path ? "disabled" : ""}>${e(path.replaceAll(String.fromCharCode(92), "/").split("/").at(-1))}</button> <small>${e(path)}</small></li>`).join("")}</ul>` : `<p>${t("Base de datos local.")}</p>`}
    </section>
    <section class="project-card"><h2>${t("Acerca de…")}</h2>
      <p><strong>CPOBRAS</strong> · ${t("Estudio de costos y gestión de obras")}</p>
      <p>${t("Versión")} ${e(metadata.version)} · ${t("Autor")} ${uiHtml("Gianluca Fiore · 2026")}</p>
      <ul class="about-links">${projectLinks.map(([id, href, label]) => `<li><a class="link" href="${href}" data-action="open-project-link" data-link="${id}">${t(label)}</a></li>`).join("")}</ul>
    </section>
  </section>`;
}
