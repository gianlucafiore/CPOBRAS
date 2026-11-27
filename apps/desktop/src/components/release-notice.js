import { uiText, uiHtml } from "../services/interface-language.js";
export async function showAvailableRelease(invoke, document) {
  let release;
  try {
    release = await invoke("available_release");
  } catch {
    return;
  }
  const tag = release?.tag;
  if (typeof tag !== "string" || !/^v\d+\.\d+\.\d+(?:-windows)?$/.test(tag)) return;

  const notice = document.createElement("aside");
  notice.className = "release-notice";
  notice.setAttribute("aria-label", uiText("Actualización de CP Obras"));
  notice.innerHTML = `<div><p role="status"><strong>${uiHtml("CP Obras {0} disponible", [tag.slice(1)])}</strong></p>
    <a class="link" href="https://github.com/gianlucafiore/CPOBRAS/releases/tag/${tag}">${uiHtml("Abrir release y descargar")}</a>
    <p role="alert" hidden></p></div>
    <button type="button" class="btn tiny" aria-label="${uiHtml("Cerrar aviso de actualización")}">×</button>`;
  notice.querySelector("button").addEventListener("click", () => notice.remove());
  const link = notice.querySelector("a");
  link.addEventListener("click", async event => {
    event.preventDefault();
    const error = notice.querySelector("[role=alert]");
    error.hidden = true;
    try {
      await invoke("open_release", { tag });
    } catch {
      error.textContent = uiText("No se pudo abrir el navegador predeterminado.");
      error.hidden = false;
    }
  });
  document.body.append(notice);
}
