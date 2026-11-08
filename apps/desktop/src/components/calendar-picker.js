import { e, dateToday } from "./helpers.js";
import { dayNumber, dayISO, weekday } from "../services/calendar.js";
export function createCalendarPicker({ state, document }) {
  const model = { key: null, month: dateToday().slice(0, 7), exceptions: {} };
  function configure(calendar, key) {
    if (key === model.key) return;
    const sameProject = model.key?.split(":")[0] === key.split(":")[0];
    model.key = key;
    model.exceptions = structuredClone(calendar.exceptions || {});
    for (const date of calendar.holidays || [])
      if (!model.exceptions[date])
        model.exceptions[date] = { description: "Feriado", working: false };
    if (!sameProject) model.month = calendar.start_date.slice(0, 7);
  }
  function capture() {
    for (const input of document.querySelectorAll(
      "[data-calendar-description]",
    )) {
      const item = model.exceptions[input.dataset.calendarDescription];
      if (item) item.description = input.value;
    }
    for (const input of document.querySelectorAll("[data-calendar-working]")) {
      const item = model.exceptions[input.dataset.calendarWorking];
      if (item) item.working = input.checked;
    }
  }
  function markup() {
    const first = model.month + "-01",
      offset = weekday(first),
      start = dayNumber(first) - offset;
    return `<div class="calendar-selector"><section class="calendar-month"><div class="calendar-month-toolbar"><button class="btn" type="button" data-action="plan-calendar-prev" aria-label="Mes anterior">←</button><label>Mes<input type="month" name="calendar-month" aria-label="Mes del calendario" value="${e(model.month)}" min="0001-01" max="9999-12"></label><button class="btn" type="button" data-action="plan-calendar-next" aria-label="Mes siguiente">→</button></div><div class="calendar-weekday-labels">${["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((n) => `<span>${n}</span>`).join("")}</div><div class="calendar-date-grid">${Array.from(
      { length: 42 },
      (_, i) => {
        const date = dayISO(start + i),
          entry = model.exceptions[date];
        return `<button class="calendar-date ${date.slice(0, 7) !== model.month ? "other-month" : ""} ${weekday(date) >= 5 ? "weekend" : ""} ${entry ? (entry.working ? "exception-working" : "exception-off") : ""}" type="button" data-action="plan-calendar-toggle" data-date="${date}" aria-label="Marcar ${date}" aria-pressed="${Boolean(entry)}" ${state.remoteProject ? "disabled" : ""} title="${e(entry?.description || date)}">${Number(date.slice(8))}</button>`;
      },
    ).join(
      "",
    )}</div><p>Marcá todas las fechas necesarias. El calendario permanece abierto.</p></section><section class="calendar-exceptions"><h3>Feriados y fechas especiales</h3><p>«Laborable» habilita esa fecha aunque sea sábado, domingo o feriado.</p>${
      Object.entries(model.exceptions)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(
          ([date, item]) =>
            `<div class="calendar-exception" data-calendar-entry="${date}"><strong>${date.split("-").reverse().join("/")}</strong><label class="field"><span>Descripción</span><input name="calendar-description:${date}" data-calendar-description="${date}" aria-label="Descripción ${date}" value="${e(item.description)}" maxlength="500" ${state.remoteProject ? "disabled" : ""}></label><label class="calendar-working-label"><input type="checkbox" name="calendar-working:${date}" data-calendar-working="${date}" aria-label="Laborable ${date}" ${item.working ? "checked" : ""} ${state.remoteProject ? "disabled" : ""}> Laborable</label><button type="button" class="btn tiny" data-action="plan-calendar-remove" data-date="${date}" aria-label="Quitar ${date}" ${state.remoteProject ? "disabled" : ""}>×</button></div>`,
        )
        .join("") ||
      "<p>Sin fechas especiales. Seleccionalas en el calendario.</p>"
    }</section></div>`;
  }
  function draw() {
    const host = document.querySelector("[data-calendar-picker]");
    if (host) host.innerHTML = markup();
  }
  function act(button) {
    capture();
    const a = button.dataset.action;
    if (a === "plan-calendar-prev" || a === "plan-calendar-next") {
      const [year, month] = model.month.split("-").map(Number),
        index = year * 12 + month - 1 + (a === "plan-calendar-prev" ? -1 : 1),
        y = Math.floor(index / 12),
        m = (index % 12) + 1;
      if (y >= 1 && y <= 9999)
        model.month =
          String(y).padStart(4, "0") + "-" + String(m).padStart(2, "0");
    }
    if (a === "plan-calendar-toggle" || a === "plan-calendar-remove") {
      if (state.remoteProject) throw new Error("Obra externa de solo lectura");
      const date = button.dataset.date;
      dayNumber(date);
      if (model.exceptions[date]) delete model.exceptions[date];
      else model.exceptions[date] = { description: "", working: false };
      state.pageDirty = true;
    }
    draw();
  }
  function change(target) {
    if (target.name === "calendar-month") {
      capture();
      if (
        /^\d{4}-\d{2}$/.test(target.value) &&
        Number(target.value.slice(5)) >= 1 &&
        Number(target.value.slice(5)) <= 12
      ) {
        model.month = target.value;
        draw();
      }
      return true;
    }
    if (target.dataset.calendarDescription || target.dataset.calendarWorking) {
      capture();
      const date =
          target.dataset.calendarDescription || target.dataset.calendarWorking,
        item = model.exceptions[date],
        button = document.querySelector(
          `[data-action=plan-calendar-toggle][data-date="${date}"]`,
        );
      if (item && button) {
        button.classList.toggle("exception-working", item.working);
        button.classList.toggle("exception-off", !item.working);
        button.title = item.description || date;
      }
      return true;
    }
    return false;
  }
  function value() {
    capture();
    return structuredClone(model.exceptions);
  }
  return {
    model,
    configure,
    markup,
    draw,
    act,
    change,
    value,
    reset: () => {
      model.key = null;
    },
  };
}
