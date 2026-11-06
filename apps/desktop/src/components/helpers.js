export const e = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
export const dateToday = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
};
export const kindName = (type) =>
  ({
    material: "Materiales",
    labor: "Mano de obra",
    equipment: "Equipos",
    subcontract: "Subcontratos",
  })[type] || type;
export const kindBadge = (type) =>
  ({ material: "MAT", labor: "MO", equipment: "EQ", subcontract: "SC" })[
    type
  ] || type;
export const field = (label, name, value = "", options = "") =>
  name === "unit"
    ? unitField(label, name, value, options)
    : `<label class="field"><span>${e(label)}</span><input name="${name}" value="${e(value)}" ${options}></label>`;
export const select = (label, name, options, selected = "") =>
  `<label class="field"><span>${e(label)}</span><select name="${name}">${options
    .map(
      ([v, title]) =>
        `<option value="${e(v)}" ${String(v) === String(selected) ? "selected" : ""}>${e(title)}</option>`,
    )
    .join("")}</select></label>`;
export const btn = (label, action, cls = "", other = "") =>
  `<button type="button" class="btn ${cls}" data-action="${action}" ${other}>${label}</button>`;

let unitSequence = 0;
export function unitField(label, name, value, options = "") {
  const id = `unit-options-${++unitSequence}`;
  return `<label class="field unit-picker"><span>${e(label)}</span><input name="${e(name)}" value="${e(value)}" class="unit-search" aria-controls="${id}" role="combobox" aria-label="${e(label)}" aria-autocomplete="list" aria-expanded="false" autocomplete="off" ${options}><span class="unit-results" id="${id}" role="listbox" aria-label="Unidades" hidden></span></label>`;
}
