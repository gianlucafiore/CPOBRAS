import { e, field } from "./helpers.js";
const normalize = (value) =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] !== b[j - 1]),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}
export function searchResources(resources, query) {
  const tokens = normalize(query)
    .trim()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return resources
    .filter((r) => r.active !== false)
    .map((r) => {
      const text = normalize(`${r.code} ${r.description} ${r.unit}`),
        words = text.split(/[^a-z0-9]+/).filter(Boolean);
      let score = 0;
      for (const token of tokens) {
        if (text.includes(token)) continue;
        const d = Math.min(...words.map((word) => distance(token, word)));
        if (d > Math.max(1, Math.floor(token.length / 3))) return null;
        score += d;
      }
      return { r, score };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        a.score - b.score || a.r.description.localeCompare(b.r.description),
    )
    .slice(0, 30)
    .map((x) => x.r);
}
export function resourcePicker(resources, id, index) {
  const selected = resources.find((r) => r.id === id);
  return `<label class="field resource-picker"><span>Insumo</span><select name="resource" hidden aria-hidden="true" tabindex="-1"><option value="">Seleccioná un insumo</option>${resources.map((r) => `<option value="${e(r.id)}" ${r.id === id ? "selected" : ""}>${e(r.code + " · " + r.description + " (" + r.unit + ")")}</option>`).join("")}</select><input class="resource-search" role="combobox" aria-label="Buscar insumo ${index + 1}" aria-autocomplete="list" aria-expanded="false" aria-controls="resource-results-${index}" autocomplete="off" value="${e(selected ? selected.code + " · " + selected.description : "")}" placeholder="Buscar por código o descripción…"><span class="resource-results" id="resource-results-${index}" role="listbox" hidden></span></label>`;
}
export function createResourcePicker({
  invoke,
  state,
  document,
  window,
  loadCollections,
  currentEstimate,
}) {
  let child = null,
    parentFocus = null;
  function results(input) {
    hide();
    const box = input.parentElement.querySelector(".resource-results");
    const matches = searchResources(state.resources, input.value);
    box.innerHTML =
      matches
        .map(
          (r) =>
            `<button type="button" role="option" data-action="pick-resource" data-id="${e(r.id)}">${e(r.code + " · " + r.description + " (" + r.unit + ")")}</button>`,
        )
        .join("") +
      `<button type="button" role="option" data-action="quick-resource">＋ Agregar${input.value.trim() ? ` «${e(input.value.trim())}»` : " nuevo insumo"}</button>`;
    box.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }
  function hide() {
    document
      .querySelectorAll(".resource-results")
      .forEach((el) => (el.hidden = true));
    document
      .querySelectorAll(".resource-search")
      .forEach((el) => el.setAttribute("aria-expanded", "false"));
  }
  function selectResource(row, r) {
    const select = row.querySelector('[name="resource"]');
    if (![...select.options].some((o) => o.value === r.id))
      select.add(new window.Option(r.description, r.id));
    select.value = r.id;
    row.querySelector(".resource-search").value =
      r.code + " · " + r.description;
    const price = row.querySelector('[name="unitPrice"]');
    if (price)
      price.value =
        state.modal?.kind === "line-resources"
          ? (state.estimateResourcePrices?.[r.id] ??
            (currentEstimate()?.currency === "USD" ? "" : (r.price ?? "")))
          : (r.price ?? "");
    state.modalDirty = true;
    hide();
  }
  function close() {
    if (child?.busy) return;
    if (
      child?.dirty &&
      !window.confirm(
        "Tenés cambios sin guardar en el nuevo insumo. ¿Descartarlos?",
      )
    )
      return;
    if (child?.parentShell) child.parentShell.inert = false;
    child?.element.remove();
    child = null;
    parentFocus?.focus();
  }
  async function act(button) {
    if (button.dataset.action === "pick-resource") {
      selectResource(
        button.closest(".component-row"),
        state.resources.find((r) => r.id === button.dataset.id),
      );
      return true;
    }
    if (button.dataset.action === "quick-resource") {
      const row = button.closest(".component-row"),
        input = row.querySelector(".resource-search");
      parentFocus = input;
      hide();
      const overlay = document.createElement("div");
      overlay.className = "modal-overlay quick-resource-overlay";
      overlay.innerHTML = `<div class="dialog-shell" role="dialog" aria-modal="true" aria-label="Crear insumo sin salir"><div class="dialog-header"><h2>Nuevo insumo</h2><button type="button" data-action="quick-resource-close" aria-label="Cerrar nuevo insumo">×</button></div><form id="quick-resource-form" class="dialog-body"><p class="modal-help">Al guardar se seleccionará en la partida. Lo que ya cargaste se conserva.</p><label class="field">Código<input name="code" readonly placeholder="Automático al guardar" value=""></label><label class="field">Descripción<input name="description" required maxlength="500" value="${e(input.value)}"></label>${field("Unidad", "unit", "kg", "required")}<label class="field">Tipo<select name="kind"><option value="material">Material</option><option value="labor">Mano de obra</option><option value="equipment">Equipo</option><option value="subcontract">Subcontrato</option></select></label><label class="field">Precio inicial ARS<input name="price" type="number" min="0" step="any" value="0" required></label><p class="modal-error" role="alert"></p><div class="dialog-actions"><button type="button" class="btn" data-action="quick-resource-close">Cerrar</button><button class="btn primary" type="submit">Guardar y seleccionar</button></div></form></div>`;
      document.querySelector("#app").append(overlay);
      const parentShell = document.querySelector(".dialog-shell");
      parentShell.inert = true;
      child = { element: overlay, row, dirty: false, busy: false, parentShell };
      overlay.addEventListener("input", () => (child.dirty = true));
      overlay.querySelector('[name="description"]').focus();
      return true;
    }
    if (button.dataset.action === "quick-resource-close") {
      close();
      return true;
    }
    return false;
  }
  async function submit(form) {
    if (child?.busy) return;
    const data = new window.FormData(form),
      v = (k) => String(data.get(k) || "").trim();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    child.busy = true;
    try {
      const resource = await invoke("create_resource", {
        code: v("code"),
        description: v("description"),
        unit: v("unit"),
        kind: v("kind"),
        price: v("price"),
        effectiveDate: new Date().toISOString().slice(0, 10),
        source: "Alta rápida desde composición",
      });
      await loadCollections();
      const r = state.resources.find((r) => r.id === resource.id) || {
        ...resource,
        price: v("price"),
      };
      selectResource(child.row, r);
      child.parentShell.inert = false;
      child.element.remove();
      child = null;
      parentFocus?.focus();
    } catch (error) {
      form.querySelector(".modal-error").textContent = String(error);
    } finally {
      button.disabled = false;
      if (child) child.busy = false;
    }
  }
  function keyDown(evt) {
    if (child) {
      if (evt.key === "Tab") {
        const focusable = [
          ...child.element.querySelectorAll(
            "button:not([disabled]),input,select",
          ),
        ];
        const i = focusable.indexOf(document.activeElement);
        if (
          (evt.shiftKey && i === 0) ||
          (!evt.shiftKey && i === focusable.length - 1)
        ) {
          evt.preventDefault();
          focusable[evt.shiftKey ? focusable.length - 1 : 0]?.focus();
        }
      }
      if (evt.key === "Escape") {
        evt.preventDefault();
        close();
      }
      return true;
    }
    const input = evt.target
      .closest?.(".resource-picker")
      ?.querySelector(".resource-search");
    if (!input) return false;
    const box = input.parentElement.querySelector(".resource-results");
    if (evt.key === "Escape" && !box.hidden) {
      evt.preventDefault();
      hide();
      return true;
    }
    if (evt.key === "ArrowDown" || evt.key === "ArrowUp") {
      evt.preventDefault();
      if (box.hidden) results(input);
      const options = [...box.querySelectorAll("button")],
        i = options.indexOf(document.activeElement);
      const next =
        i < 0
          ? evt.key === "ArrowDown"
            ? 0
            : options.length - 1
          : (i + (evt.key === "ArrowDown" ? 1 : options.length - 1)) %
            options.length;
      options[next]?.focus();
      return true;
    }
    if (evt.key === "Enter" && evt.target === input && !box.hidden) {
      evt.preventDefault();
      box.querySelector("button")?.click();
      return true;
    }
    return false;
  }
  return {
    act,
    open: results,
    toggle: (input) => {
      if (input.getAttribute("aria-expanded") === "true") hide();
      else results(input);
    },
    dismissOutside: (target) => {
      if (!target.closest?.(".resource-picker")) hide();
    },
    submit,
    keyDown,
    input: (evt) => {
      if (evt.target.matches(".resource-search")) {
        evt.target.parentElement.querySelector('[name="resource"]').value = "";
        results(evt.target);
      }
    },
    focus: (evt) => {
      if (!evt.target.closest(".resource-results")) hide();
    },
  };
}
