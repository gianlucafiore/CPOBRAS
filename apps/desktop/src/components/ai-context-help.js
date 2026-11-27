import { currentInterfaceLanguage, localizedError, uiHtml, uiText } from "../services/interface-language.js";
import { screenContext } from "../services/ai-assistant.js";
import { memoryHtml } from "../services/memory-markdown.js";
import { e } from "./helpers.js";

function sourceLink(source, label) {
  try {
    const url = new URL(source?.url);
    if (!["https:", "http:"].includes(url.protocol)) return "";
    return `<a href="${e(url.href)}" data-help-source rel="noopener noreferrer" title="${e(source.title)}">${e(label || source.title || url.hostname)}</a>`;
  } catch {
    return "";
  }
}

function answerMarkup(answer) {
  const sources = answer.sources || [];
  const positions = new Map(sources.map((source, i) => [source.url, i + 1]));
  const hasInline = answer.parts.some(part => part.sources?.length);
  const links = [];
  function citation(source, label) {
    const link = sourceLink(source, label);
    if (!link) return label;
    const index = links.push(link) - 1;
    return `\uE000${index}\uE001`;
  }
  // Render the complete response before inserting validated links so citations can fall inside formatting.
  const markdown = answer.parts.map(part => {
    const text = part.text.replace(/[\uE000\uE001]/g, "");
    if (!hasInline && sources.length) {
      return text.replace(/\[(\d{1,2})\]/g, (label, number) => {
        const source = sources[Number(number) - 1];
        return source ? citation(source, label) : label;
      });
    }
    return text + (part.sources || []).map(source => {
      const position = positions.get(source.url);
      return ` ${citation(source, position ? `[${position}]` : source.title)}`;
    }).join("");
  }).join("");
  const message = memoryHtml(markdown).replace(/\uE000(\d+)\uE001/g, (_, index) => links[Number(index)] || "");
  return `<div class="ai-help-answer memory-formatted">${message}</div>
    ${sources.length ? `<details class="ai-help-sources" ${hasInline ? "" : "open"}>
      <summary>${uiHtml("Fuentes de la consulta")}</summary><ol>${sources.map(source => `<li>${sourceLink(source)}</li>`).join("")}</ol>
    </details>` : ""}`;
}

export function createAiContextHelp({invoke,state,document,window,configure}) {
  const host = document.createElement("aside");
  host.className = "ai-help-host";
  document.body.append(host);
  const model = {open:false, question:"", turns:[], status:null, error:"", searching:false, pending:null};
  const scope = () => [
    state.database?.path, state.view, state.projectId, state.estimateId,
    state.organizationId, state.panel, currentInterfaceLanguage(),
  ].join(":");
  let activeScope = scope();
  let statusVersion = 0;

  function paint(focus = false) {
    if (!model.open) {
      host.innerHTML = `<button type="button" class="btn ai-button ai-button-accent ai-help-launch" data-help-action="open" aria-label="${uiHtml("Ayuda con IA")}">IA</button>`;
      if (focus) host.querySelector("button").focus();
      return;
    }
    const canSearch = model.status?.web_search_ready;
    host.innerHTML = `<section id="ai-context-help" class="ai-help-panel" aria-labelledby="ai-help-title">
      <header><h2 id="ai-help-title">${uiHtml("Ayuda con IA")}</h2>
        <div class="heading-actions">
          <button type="button" class="btn tiny" data-help-action="configure" ${model.pending ? "disabled" : ""}>${uiHtml("Configurar IA")}</button>
          <button type="button" class="btn tiny" data-help-action="close">${uiHtml("Cerrar")}</button>
        </div>
      </header>
      <div class="ai-help-log" role="log" aria-live="polite">
        ${model.turns.length || model.pending ? "" : `<p class="small-muted">${uiHtml("Preguntá por la pantalla abierta o buscá precios e índices publicados.")}</p>`}
        ${model.turns.map(turn => `<p class="ai-help-question">${e(turn.question)}</p>${answerMarkup(turn.answer)}`).join("")}
        ${model.pending ? `<p class="ai-help-question">${e(model.pending.question)}</p><p role="status">${model.pending.web ? uiHtml("Buscando fuentes…") : uiHtml("Consultando…")}</p>` : ""}
      </div>
      ${model.error ? `<p class="ai-help-error feature-error" role="alert">${e(model.error)}</p>` : ""}
      <form class="ai-help-form">
        <label class="field"><span>${uiHtml("Tu consulta")}</span><textarea name="question" rows="3" maxlength="2600" required ${model.pending ? "disabled" : ""}>${e(model.question)}</textarea></label>
        <p class="small-muted ai-help-mode-note">${model.searching && canSearch
          ? uiHtml("La búsqueda envía solo esta pregunta. Incluí el producto y la localidad, o la serie y el período.")
          : uiHtml("La consulta usa los datos visibles de la pantalla abierta.")}</p>
        ${model.status && !model.status.configured
          ? `<p class="small-muted">${uiHtml("Configurá un proveedor para consultar.")}</p>` : ""}
        ${model.status?.provider === "lmstudio" && model.status.configured && !canSearch
          ? `<p class="small-muted">${uiHtml("Para buscar con LM Studio, configurá una clave de Brave Search.")}</p>` : ""}
        <div class="ai-help-form-actions">
          <label><input name="web" type="checkbox" ${model.searching && canSearch ? "checked" : ""} ${!canSearch || model.pending ? "disabled" : ""}> ${uiHtml("Buscar en Internet")}</label>
          ${model.pending ? `<button type="button" class="btn" data-help-action="cancel">${uiHtml("Cancelar consulta")}</button>`
           : `<button class="btn ai-button ai-button-accent" type="submit" ${!model.status?.configured ? "disabled" : ""}>${uiHtml("Consultar")}</button>`}
        </div>
      </form>
    </section>`;
    const log = host.querySelector(".ai-help-log");
    log.scrollTop = log.scrollHeight;
    if (focus) host.querySelector("textarea:not([disabled])")?.focus();
  }

  function setStatus(status) {
    statusVersion++;
    model.status = status;
    model.error = status?.storage_error ? String(localizedError(status.storage_error)) : "";
    if (!status?.web_search_ready) model.searching = false;
    if (model.open) paint(host.contains(document.activeElement));
  }

  async function open() {
    model.open = true;
    paint(true);
    const version = ++statusVersion;
    try {
      const status = await invoke("ai_status");
      if (version === statusVersion) setStatus(status);
    } catch (error) {
      if (version === statusVersion) {
        model.error = String(localizedError(error));
        paint();
      }
    }
  }

  function cancel(restore = true) {
    const request = model.pending;
    if (!request) return;
    model.pending = null;
    if (restore) model.question = request.question;
    void invoke("ai_cancel", {requestId:request.id}).catch(() => {});
  }

  function syncView() {
    const next = scope();
    if (next === activeScope) return;
    activeScope = next;
    cancel(false);
    model.turns = [];
    model.question = "";
    model.error = model.status?.storage_error ? String(localizedError(model.status.storage_error)) : "";
    paint();
  }

  function captureView() {
    const heading = state.view || "";
    if (["app-options", "sharing", "backups"].includes(heading)) return heading;
    const line = state.view === "workspace" && state.lines?.find(row => row.id === state.selectedLineId);
    const selected = line ? JSON.stringify({
      partida:line.description, unidad:line.unit, cantidad:line.quantity,
      precio_unitario:line.unit_cost, parcial:line.total,
    }) : "";
    const visible = screenContext(document,{includeInputs:false});
    return [heading, selected, visible].filter(Boolean).join("\n").slice(0,7400);
  }

  async function send() {
    const question = model.question.trim();
    if (!question || model.pending || !model.status?.configured) return;
    const web = model.searching && model.status.web_search_ready;
    const request = {id:window.crypto.randomUUID(), question, web};
    const messages = web ? [] : model.turns.filter(turn => !turn.web).slice(-4).flatMap(turn => [
      {role:"user",content:turn.question},
      {role:"assistant",content:turn.answer.parts.map(part => part.text).join("").trim().slice(0,1800)},
    ]);
    messages.push({role:"user",content:question});
    const encoder = new TextEncoder();
    while (messages.reduce((size, message) => size + encoder.encode(message.content).length, 0) > 32000) {
      messages.splice(0, 2);
    }
    const context = web ? "" : captureView();
    model.pending = request;
    model.question = "";
    model.error = "";
    paint();
    try {
      const answer = await invoke("ai_help", {requestId:request.id,messages,context,language:currentInterfaceLanguage(),searchWeb:web});
      if (model.pending !== request) return;
      model.turns.push({question,answer,web});
      model.turns = model.turns.slice(-12);
    } catch (error) {
      if (model.pending !== request) return;
      model.question = question;
      model.error = String(localizedError(error));
    } finally {
      if (model.pending === request) {
        model.pending = null;
        paint(true);
      }
    }
  }

  host.addEventListener("input", event => {
    if (event.target.name === "question") model.question = event.target.value;
  });
  host.addEventListener("change", event => {
    if (event.target.name === "web") {
      model.searching = event.target.checked;
      host.querySelector(".ai-help-mode-note").textContent = model.searching
        ? uiText("La búsqueda envía solo esta pregunta. Incluí el producto y la localidad, o la serie y el período.")
        : uiText("La consulta usa los datos visibles de la pantalla abierta.");
    }
  });
  host.addEventListener("submit", event => {
    event.preventDefault();
    event.stopPropagation();
    void send();
  });
  host.addEventListener("click", async event => {
    const source = event.target.closest("[data-help-source]");
    const action = event.target.closest("[data-help-action]")?.dataset.helpAction;
    if (!source && !action) return;
    event.preventDefault();
    event.stopPropagation();
    if (source) {
      try { await invoke("open_ai_source",{url:source.href}); }
      catch(error) { model.error = String(localizedError(error)); paint(); }
    } else if (action === "open") {
      await open();
    } else if (action === "close" || action === "cancel") {
      cancel();
      if (action === "close") model.open = false;
      paint(true);
    } else if (action === "configure") {
      await configure();
    }
  });
  host.addEventListener("keydown", event => {
    if (!model.open) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      cancel();
      model.open = false;
      paint(true);
    }
    if (event.key === "Enter" && event.target.name === "question" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!event.repeat) void send();
    }
  });
  paint();
  return {syncView,setStatus};
}
