import { uiText, uiHtml } from "../services/interface-language.js";
import { e, dateToday } from "./helpers.js";
import {
  DAY_WIDTH as CELL,
  dayNumber,
  dayISO,
  calendarDays,
  calendarGroups,
  monthName,
  weekdayName,
  isWorkingDate,
  weekday,
  addDays,
  finishWorking,
  workingCount,
} from "../services/calendar.js";
export function createGantt({ state, model, document, save, render, createTask }) {
  const camera = { key: null, day: null, offset: 0 };
  let drag = null, lastBarDrag = 0;
  const minDay = dayNumber("0001-01-03"),
    maxDay = dayNumber("9999-12-20");
  function configure() {
    if (camera.key !== model.projectId) {
      camera.key = model.projectId;
      camera.day = dayNumber(model.plan.calendar.start_date) - 2;
      camera.offset = 0;
    }
  }
  const left = (date) => (dayNumber(date) - camera.day) * CELL + camera.offset;
  function classes(date) {
    const entry = model.plan.calendar.exceptions?.[date],
      weekend = weekday(date) >= 5;
    return `${weekend ? "is-weekend" : ""} ${isWorkingDate(model.plan.calendar, date) ? "is-working" : "is-nonworking"} ${entry ? (entry.working ? "is-special-working" : "is-holiday") : ""} ${date === dateToday() ? "is-today" : ""}`;
  }
  function dateTitle(date) {
    const entry = model.plan.calendar.exceptions?.[date];
    return `${date}${(model.plan.finance?.cut_dates || []).includes(date) ? " · Corte de certificación" : ""}${entry ? " · Feriado / fecha especial: " + (entry.description || "Sin descripción") : ""} · ${isWorkingDate(model.plan.calendar, date) ? "Laborable" : "No laborable"}`;
  }
  function fills(start, finish) {
    const spans = [];
    let run = null;
    const from = Math.max(dayNumber(start), camera.day - 1),
      to = Math.min(dayNumber(finish), camera.day + visibleCount());
    for (let d = from; d <= to; d++) {
      if (isWorkingDate(model.plan.calendar, dayISO(d))) {
        if (run === null) run = d;
      } else if (run !== null) {
        spans.push([run, d]);
        run = null;
      }
    }
    if (run !== null) spans.push([run, to + 1]);
    return spans
      .map(
        ([a, b]) =>
          `<span class="gantt-workfill" style="left:${(a - dayNumber(start)) * CELL}px;width:${(b - a) * CELL}px"></span>`,
      )
      .join("");
  }
  function taskBar(task, scheduled) {
    const days = dayNumber(scheduled.finish) - dayNumber(scheduled.start) + 1;
    return `<button class="gantt-bar ${scheduled.critical ? "critical" : ""} ${task.duration_days === 0 ? "gantt-milestone" : ""}" data-task-id="${e(task.id)}" data-gantt-edit="${e(task.id)}" style="left:${left(scheduled.start)}px;width:${task.duration_days === 0 ? 16 : Math.max(16, days * CELL)}px" title="${e(task.name)} · ${task.duration_days} ${uiHtml("días")}"><span data-gantt-fill>${fills(scheduled.start, scheduled.finish)}</span><span class="gantt-certified-fill" style="width:${Math.max(0,Math.min(100,Number(task.actual_progress)||0))}%" title="${uiHtml("Avance certificado {0} %", [task.actual_progress])}"></span><span class="gantt-bar-title">${e(task.name)}</span><i data-resize="true" aria-label="${uiHtml("Cambiar duración")}">↔</i></button>`;
  }
  function visibleCount(width) {
    return (
      Math.ceil(
        (width ||
          document.querySelector("[data-gantt-viewport]")?.clientWidth ||
          900) / CELL,
      ) + 2
    );
  }
  function groups(days, key, label) {
    return calendarGroups(days, key)
      .map(
        (s) =>
          `<span class="gantt-header-group" style="left:${(s.start - camera.day) * CELL + camera.offset}px;width:${(s.end - s.start) * CELL}px" title="${e(label(s.day))}">${e(label(s.day))}</span>`,
      )
      .join("");
  }
  function content(width) {
    const days = calendarDays(camera.day - 1, visibleCount(width) + 1);
    const cells = days.map((d) => `<span class="gantt-day-cell ${classes(d.iso)}" style="left:${(d.day - camera.day) * CELL + camera.offset}px;width:${CELL}px" title="${e(dateTitle(d.iso))}"></span>`).join("");
    const header = `<div class="gantt-calendar-header"><div class="gantt-header-tier" aria-label="${uiHtml("Años")}">${groups(days, "year", (d) => String(d.year))}</div><div class="gantt-header-tier" aria-label="${uiHtml("Meses")}">${groups(days, "month", (d) => monthName(Number(d.month.slice(5))))}</div><div class="gantt-header-tier" aria-label="${uiHtml("Semanas ISO")}">${groups(days, "weekKey", (d) => uiText("Sem. {0} · {1}", [d.week, d.weekYear]))}</div><div class="gantt-header-days">${days.map((d) => `<${model.cutMode ? "button" : "span"} ${model.cutMode ? 'type="button" data-action="plan-cut-date"' : ""} class="gantt-date ${classes(d.iso)} ${(model.plan.finance?.cut_dates || []).includes(d.iso) ? "is-certification-cut" : ""}" data-gantt-date="${d.iso}" data-date="${d.iso}" title="${e(dateTitle(d.iso))}" style="left:${(d.day - camera.day) * CELL + camera.offset}px;width:${CELL}px"><small>${weekdayName(d.weekday)}</small><b>${Number(d.iso.slice(8))}</b></${model.cutMode ? "button" : "span"}>`).join("")}</div></div>`;
    const baseline = model.baselines.find((b) => b.id === model.baselineId);
    return header + (
      !model.plan.tasks.length ? `<div class="gantt-track gantt-empty-track">${cells}</div>` :
      model.plan.tasks
        .map((task) => {
          const scheduled = model.schedule?.tasks.find((t) => t.id === task.id),
            previous = baseline?.schedule.tasks.find((t) => t.id === task.id);
          return `<div class="gantt-track">${cells}${(model.plan.finance?.cut_dates || []).map((date) => `<span data-cut-date="${date}" ${model.cutMode ? `data-action="plan-cut-date" data-date="${date}"` : ""} class="gantt-certification-cut ${model.cutMode ? "cut-editable" : ""}" title="${uiHtml("Corte de certificación {0}", [date])}" style="left:${left(date) + CELL}px"></span>`).join("")}${previous ? `<span class="gantt-baseline" style="left:${left(previous.start)}px;width:${Math.max(8, (dayNumber(previous.finish) - dayNumber(previous.start) + 1) * CELL)}px"></span>` : ""}${scheduled ? taskBar(task, scheduled) : ""}</div>`;
        })
        .join("")
    );
  }
  function markup() {
    configure();
    return `<section class="gantt-board"><div class="gantt-toolbar"><p>${uiHtml("Doble clic para editar una tarea. Arrastrá la barra para moverla y su extremo para cambiar la duración. Arrastrá el fondo para recorrer las fechas. La duración cuenta días laborables. Rojo: ruta crítica.")} ${model.cutMode ? uiHtml("En el encabezado, hacé clic en una fecha para agregar un corte; si ya existe, otro clic lo elimina. Arrastrá un corte existente para cambiar su fecha.") : state.remoteProject ? "" : uiHtml("En el fondo del calendario, Shift + clic crea un hito y Shift + arrastrar dibuja una tarea.")}</p><div><button class="btn ${model.cutMode ? "primary" : ""}" data-action="plan-finance-mark">${model.cutMode ? uiHtml("Finalizar marcado de cortes") : uiHtml("Marcar cortes de certificación")}</button><button class="btn" data-action="plan-gantt-prev" aria-label="${uiHtml("Gantt: cuatro semanas anteriores")}">←</button><button class="btn" data-action="plan-gantt-start">${uiHtml("Inicio de obra")}</button><button class="btn" data-action="plan-gantt-today">${uiHtml("Hoy")}</button><button class="btn" data-action="plan-gantt-next" aria-label="${uiHtml("Gantt: cuatro semanas siguientes")}">→</button></div></div><div class="gantt-scroll"><div class="gantt-label-column"><div class="gantt-label-heading">${uiHtml("Tareas")}</div>${model.plan.tasks
      .map((task) => {
        const scheduled = model.schedule?.tasks.find((t) => t.id === task.id);
        return `<button class="gantt-label" data-gantt-edit="${e(task.id)}">${e(task.parent_id ? "↳ " : "")}${e(task.name)}<small>${e(scheduled?.start)} → ${e(scheduled?.finish)} ${uiHtml("· holgura")} ${scheduled?.float_days ?? "—"} d</small></button>`;
      })
      .join(
        "",
      )}</div><div class="gantt-timepane" data-gantt-viewport tabindex="0" aria-label="${uiHtml("Calendario del Gantt, arrastrá para panear")}">${content()}</div></div></section>`;
  }
  function draw() {
    const host = document.querySelector("[data-gantt-viewport]");
    if (host) {
      configure();
      host.innerHTML = content(host.clientWidth);
      if (drag?.type === "create" && drag.host === host) drawCreation();
    }
  }
  function dateAt(host, x) {
    const local = Math.max(0, Math.min(host.clientWidth - 1, x - host.getBoundingClientRect().left));
    return dayISO(camera.day + Math.floor((local - camera.offset) / CELL));
  }
  function creationRange(gesture, x) {
    const calendar = model.plan.calendar;
    const date = dateAt(gesture.host, x);
    const first = gesture.start < date ? gesture.start : date;
    const last = gesture.start > date ? gesture.start : date;
    const start = first < calendar.start_date ? calendar.start_date : first;
    gesture.moving ||= date !== gesture.start || Math.abs(x - gesture.x) >= 4;
    if (!gesture.moving) return { ...finishWorking(calendar, start, 0), duration: 0 };
    const duration = workingCount(calendar, start, last);
    return duration ? { ...finishWorking(calendar, start, duration), duration } : null;
  }
  function drawCreation() {
    const track = drag.host.querySelectorAll(".gantt-track")[drag.lane];
    if (!track) return;
    let preview = track.querySelector(".gantt-creation-preview");
    if (!preview) {
      preview = document.createElement("span");
      preview.className = "gantt-creation-preview";
      preview.setAttribute("aria-hidden", "true");
      track.append(preview);
    }
    const range = drag.preview;
    preview.hidden = !range;
    if (!range) return;
    preview.style.left = left(range.start) + "px";
    preview.style.width = (range.duration ? (dayNumber(range.finish) - dayNumber(range.start) + 1) * CELL : 16) + "px";
    preview.classList.toggle("gantt-milestone-preview", !range.duration);
    preview.textContent = range.duration ? `${range.duration} d` : "";
  }
  function endCreation(gesture) {
    gesture.host.classList.remove("drawing-task");
    gesture.host.querySelector(".gantt-creation-preview")?.remove();
    if (gesture.host.hasPointerCapture?.(gesture.pointerId)) gesture.host.releasePointerCapture(gesture.pointerId);
  }
  function shift(pixels) {
    const raw = camera.offset + pixels,
      steps = Math.floor(raw / CELL);
    camera.day = Math.max(minDay, Math.min(maxDay, camera.day - steps));
    camera.offset = raw - steps * CELL;
    draw();
  }
  function act(action) {
    if (action === "plan-gantt-prev")
      camera.day = Math.max(minDay, camera.day - 28);
    if (action === "plan-gantt-next")
      camera.day = Math.min(maxDay, camera.day + 28);
    if (action === "plan-gantt-start") {
      camera.day = dayNumber(model.plan.calendar.start_date) - 2;
      camera.offset = 0;
    }
    if (action === "plan-gantt-today") {
      camera.day = dayNumber(dateToday()) - 2;
      camera.offset = 0;
    }
    draw();
  }
  function pointerDown(event) {
    const cut = event.target.closest?.('[data-action="plan-cut-date"]');
    if (cut) {
      if (
        model.cutMode &&
        !state.remoteProject &&
        !state.pageDirty &&
        (model.plan.finance?.cut_dates || []).includes(cut.dataset.date) &&
        event.button === 0
      ) {
        drag = { type: "cut", date: cut.dataset.date, x: event.clientX };
        return true;
      }
      return false;
    }
    const host = event.target.closest?.("[data-gantt-viewport]");
    if (!host || event.button !== 0) return false;
    const bar = event.target.closest?.(".gantt-bar");
    const track = event.target.closest?.(".gantt-track");
    if (event.shiftKey && track && !bar && !model.cutMode) {
      if (state.remoteProject || state.pageDirty || model.dirty || model.editing || model.splitting || state.busy) return true;
      event.preventDefault();
      drag = {
        type: "create", host, lane: Array.from(host.querySelectorAll(".gantt-track")).indexOf(track),
        pointerId: event.pointerId, x: event.clientX, start: dateAt(host, event.clientX), moving: false,
      };
      host.setPointerCapture?.(event.pointerId);
      host.classList.add("drawing-task");
      return true;
    }
    if (!bar) {
      event.preventDefault();
      drag = {
        type: "pan",
        x: event.clientX,
        day: camera.day,
        offset: camera.offset,
      };
      host.classList.add("panning");
      return true;
    }
    if (state.remoteProject || state.pageDirty) return true;
    const task = model.plan.tasks.find((t) => t.id === bar.dataset.taskId),
      scheduled = model.schedule.tasks.find((t) => t.id === task.id);
    event.preventDefault();
    drag = {
      type: "bar",
      x: event.clientX,
      id: task.id,
      start: scheduled.start,
      finish: scheduled.finish,
      duration: task.duration_days,
      resize: Boolean(event.target.closest?.("[data-resize]")),
    };
    return true;
  }
  function pointerMove(event) {
    if (!drag) return false;
    if (drag.type === "create") {
      if (event.pointerId === drag.pointerId) {
        drag.preview = creationRange(drag, event.clientX);
        drawCreation();
      }
      return true;
    }
    if (drag.type === "cut") {
      const delta = Math.round((event.clientX - drag.x) / CELL);
      drag.preview = addDays(drag.date, delta);
      if (drag.preview < model.plan.calendar.start_date)
        drag.preview = model.plan.calendar.start_date;
      for (const line of document.querySelectorAll(
        `[data-cut-date="${drag.date}"]`,
      )) {
        line.style.transform = `translateX(${(dayNumber(drag.preview) - dayNumber(drag.date)) * CELL}px)`;
        line.style.borderRightStyle = "solid";
        line.title = "Mover corte a " + drag.preview;
      }
      return true;
    }
    if (drag.type === "pan") {
      const raw = drag.offset + event.clientX - drag.x,
        steps = Math.floor(raw / CELL);
      camera.day = Math.max(minDay, Math.min(maxDay, drag.day - steps));
      camera.offset = raw - steps * CELL;
      draw();
      return true;
    }
    const delta = Math.round((event.clientX - drag.x) / CELL);
    const cal = model.plan.calendar;
    let preview;
    if (drag.resize) {
      const finish = addDays(drag.finish, delta),
        duration = Math.min(36500, workingCount(cal, drag.start, finish));
      preview = { ...finishWorking(cal, drag.start, duration), duration };
    } else {
      const target = addDays(drag.start, delta),
        start = target < cal.start_date ? cal.start_date : target;
      preview = {
        ...finishWorking(cal, start, drag.duration),
        duration: drag.duration,
      };
    }
    drag.preview = preview;
    const bar = document.querySelector(`[data-task-id="${drag.id}"]`);
    if (bar) {
      bar.style.left = left(preview.start) + "px";
      bar.style.width =
        Math.max(
          16,
          (dayNumber(preview.finish) - dayNumber(preview.start) + 1) * CELL,
        ) + "px";
      bar.querySelector("[data-gantt-fill]").innerHTML = fills(
        preview.start,
        preview.finish,
      );
      bar.classList.add("drag-preview");
    }
    return true;
  }
  async function pointerUp(event) {
    if (!drag) return false;
    const old = drag;
    if (old.type === "create" && old.pointerId !== event.pointerId) return true;
    drag = null;
    document
      .querySelector("[data-gantt-viewport]")
      ?.classList.remove("panning");
    if (old.type === "pan") return true;
    if (old.type === "create") {
      endCreation(old);
      if (!old.host.isConnected) return true;
      const range = creationRange(old, event.clientX);
      if (!range) throw new Error(uiText("El tramo marcado no contiene días laborables de la obra."));
      await createTask(range);
      return true;
    }
    if (old.type === "cut") {
      if (!old.preview || old.preview === old.date) return true;
      model.movedCut = { date: old.date, at: Date.now() };
      if (model.plan.finance.cut_dates.includes(old.preview)) {
        draw();
        throw new Error(uiText("Ya existe un corte en esa fecha"));
      }
      const previous = structuredClone(model.plan);
      model.plan.finance.cut_dates = model.plan.finance.cut_dates
        .map((d) => (d === old.date ? old.preview : d))
        .sort();
      try {
        await save();
      } catch (error) {
        model.plan = previous;
        model.dirty = false;
        throw error;
      }
      return true;
    }
    if (
      !old.preview ||
      (old.preview.start === old.start && old.preview.duration === old.duration)
    ) {
      draw();
      return true;
    }
    lastBarDrag = Date.now();
    const previous = structuredClone(model.plan),
      task = model.plan.tasks.find((t) => t.id === old.id);
    if (old.resize) {
      task.duration_days = old.preview.duration;
      if (model.plan.presentation?.[task.id])
        model.plan.presentation[task.id].estimates = null;
    } else task.not_before = old.preview.start;
    try {
      await save();
    } catch (error) {
      model.plan = previous;
      model.dirty = false;
      render();
      throw error;
    }
    return true;
  }
  function wheel(event) {
    if (
      !event.target.closest?.("[data-gantt-viewport]") ||
      !(event.deltaX || event.shiftKey)
    )
      return false;
    event.preventDefault();
    if (drag?.type === "create") return true;
    shift(-(event.deltaX || event.deltaY));
    return true;
  }
  let resizeObserver = null;
  let measuredWidth = null;
  function afterRender() {
    resizeObserver?.disconnect();
    const host = document.querySelector("[data-gantt-viewport]");
    if (!host) return;
    draw();
    if (typeof ResizeObserver !== "undefined") {
      measuredWidth = host.clientWidth;
      resizeObserver ||= new ResizeObserver((entries) => {
        const width = entries[0]?.target.clientWidth;
        if (width && width !== measuredWidth) {
          measuredWidth = width;
          draw();
        }
      });
      resizeObserver.observe(host);
    }
  }
  return {
    editTarget(event) {
      const target=event.target.closest?.("[data-gantt-edit]");
      if(!target)return null;
      return target.matches(".gantt-bar") && Date.now()-lastBarDrag<350 ? false : target.dataset.ganttEdit;
    },
    afterRender,
    markup,
    draw,
    act,
    pointerDown,
    pointerMove,
    pointerUp,
    wheel,
    reset: () => {
      camera.key = null;
    },
    cancel: () => {
      if (drag?.type === "create") endCreation(drag);
      drag = null;
      draw();
    },
    camera,
  };
}
