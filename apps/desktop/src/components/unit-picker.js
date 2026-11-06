import { e, field } from "./helpers.js";
const usual = [
  ["un", "Unidad"],
  ["kg", "Kilogramo"],
  ["g", "Gramo"],
  ["t", "Tonelada"],
  ["m", "Metro"],
  ["m²", "Metro cuadrado"],
  ["m³", "Metro cúbico"],
  ["l", "Litro"],
  ["h", "Hora"],
  ["día", "Día"],
  ["jor", "Jornal"],
  ["bolsa", "Bolsa"],
  ["gl", "Global"],
  ["%", "Porcentaje"],
];
const normalize = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
export function unitOptions(records = []) {
  const units = new Map(
    usual.map(([symbol, name]) => [normalize(symbol), { symbol, name }]),
  );
  for (const row of records) {
    const symbol = row.attributes?.symbol || row.code || row.name;
    if (symbol) units.set(normalize(symbol), { symbol, name: row.name });
  }
  return [...units.values()];
}
export function createUnitPicker({
  state,
  invoke,
  document,
  window,
  loadCollections,
}) {
  let child = null;
  const options = () =>
    unitOptions([
      ...state.units,
      ...[
        ...(state.resources || []),
        ...(state.analyses || []),
        ...(state.lines || []),
      ]
        .filter(
          (r) =>
            r.unit &&
            !usual.some(
              ([symbol]) => normalize(symbol) === normalize(r.unit),
            ) &&
            !state.units.some(
              (u) => (u.attributes?.symbol || u.code) === r.unit,
            ),
        )
        .map((r) => ({ name: r.unit, code: r.unit })),
    ]);
  function hide() {
    document
      .querySelectorAll(".unit-results")
      .forEach((el) => (el.hidden = true));
    document
      .querySelectorAll(".unit-search")
      .forEach((el) => el.setAttribute("aria-expanded", "false"));
  }
  function open(input) {
    hide();
    const query = normalize(input.value),
      box = input.parentElement.querySelector(".unit-results");
    box.innerHTML =
      options()
        .filter((u) => normalize(u.symbol + " " + u.name).includes(query))
        .map(
          (u) =>
            `<button type="button" role="option" data-action="unit-select" data-symbol="${e(u.symbol)}">${e(u.symbol + " · " + u.name)}</button>`,
        )
        .join("") +
      `<button type="button" role="option" data-action="unit-add">＋ Agregar unidad${query ? " «" + e(input.value.trim()) + "»" : ""}</button>`;
    box.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }
  function choose(input, symbol) {
    input.value = symbol;
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    hide();
  }
  function close() {
    if (child?.busy) return;
    if (
      child?.dirty &&
      !window.confirm("Tenés cambios sin guardar en la unidad. ¿Descartarlos?")
    )
      return;
    child.parent.inert = false;
    const input = child.input;
    child.element.remove();
    child = null;
    input.focus();
    hide();
  }
  async function act(button) {
    if (button.dataset.action === "unit-select") {
      choose(
        button.closest(".unit-picker").querySelector(".unit-search"),
        button.dataset.symbol,
      );
      return true;
    }
    if (button.dataset.action === "unit-add") {
      const input = button
          .closest(".unit-picker")
          .querySelector(".unit-search"),
        parent = button.closest(".dialog-shell");
      hide();
      const element = document.createElement("div");
      element.className = "modal-overlay unit-create-overlay";
      element.innerHTML = `<section class="dialog-shell" role="dialog" aria-modal="true" aria-label="Agregar unidad"><div class="dialog-header"><h2>Agregar unidad</h2><button type="button" class="close-dialog" data-action="unit-close" aria-label="Cerrar unidad">×</button></div><form id="unit-create-form" class="dialog-body">${field("Símbolo de unidad", "symbol", input.value.trim(), 'required maxlength="30"')}${field("Nombre de la unidad", "name", "", 'required maxlength="150"')}<p class="modal-error" role="alert"></p><div class="dialog-actions"><button type="button" class="btn" data-action="unit-close">Cerrar</button><button type="submit" class="btn primary">Guardar y seleccionar unidad</button></div></form></section>`;
      document.querySelector("#app").append(element);
      if (parent) parent.inert = true;
      child = {
        element,
        input,
        parent: parent || { inert: false },
        dirty: false,
        busy: false,
      };
      element.addEventListener("input", () => (child.dirty = true));
      element.querySelector('[name="name"]').focus();
      return true;
    }
    if (button.dataset.action === "unit-close") {
      close();
      return true;
    }
    return false;
  }
  async function submit(form) {
    if (child.busy) return;
    child.busy = true;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const data = new window.FormData(form),
        symbol = String(data.get("symbol")).trim(),
        name = String(data.get("name")).trim();
      const existing = options().find(
        (u) => normalize(u.symbol) === normalize(symbol),
      );
      if (!existing) {
        await invoke("save_management_record", {
          record: {
            id: window.crypto.randomUUID(),
            kind: "unit",
            name,
            code: symbol,
            company_id: null,
            parent_id: null,
            project_id: null,
            client_id: null,
            attributes: { symbol },
            revision: 0,
          },
        });
        await loadCollections();
      }
      const input = child.input;
      child.parent.inert = false;
      child.element.remove();
      child = null;
      choose(input, existing?.symbol || symbol);
      input.focus();
    } catch (error) {
      form.querySelector(".modal-error").textContent = String(error);
    } finally {
      button.disabled = false;
      if (child) child.busy = false;
    }
  }
  function validate(form) {
    for (const input of form.querySelectorAll(".unit-search"))
      if (
        !options().some((u) => normalize(u.symbol) === normalize(input.value))
      )
        throw new Error(
          "Elegí una unidad de la lista o usá «Agregar unidad» para registrarla.",
        );
  }
  function keyDown(evt) {
    if (child && evt.target.closest(".unit-create-overlay")) {
      if (evt.key === "Escape") {
        evt.preventDefault();
        close();
      }
      if (evt.key === "Tab") {
        const options = [
            ...child.element.querySelectorAll("button:not([disabled]),input"),
          ],
          i = options.indexOf(document.activeElement);
        if (
          (evt.shiftKey && i === 0) ||
          (!evt.shiftKey && i === options.length - 1)
        ) {
          evt.preventDefault();
          options[evt.shiftKey ? options.length - 1 : 0].focus();
        }
      }
      return true;
    }
    const input = evt.target
      .closest?.(".unit-picker")
      ?.querySelector(".unit-search");
    if (!input) return false;
    const box = input.parentElement.querySelector(".unit-results");
    if (evt.key === "Escape" && !box.hidden) {
      evt.preventDefault();
      hide();
      return true;
    }
    if (["ArrowDown", "ArrowUp"].includes(evt.key)) {
      evt.preventDefault();
      if (box.hidden) open(input);
      const options = [...box.querySelectorAll("button")],
        i = options.indexOf(document.activeElement);
      options[
        i < 0
          ? evt.key === "ArrowDown"
            ? 0
            : options.length - 1
          : (i + (evt.key === "ArrowDown" ? 1 : options.length - 1)) %
            options.length
      ]?.focus();
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
    submit,
    validate,
    keyDown,
    open,
    input: (evt) => {
      if (evt.target.matches(".unit-search")) open(evt.target);
    },
    focus: (evt) => {
      if (!evt.target.closest(".unit-results")) hide();
    },
  };
}
