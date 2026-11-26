import { createPdf } from "./pdf-units.js";
import { calendarDays, calendarGroups, dayNumber, isWorkingDate, MONTHS, WEEKDAYS } from "./calendar.js";
import { money, numeric } from "../decimal.js";
import { dateToday, kindName } from "../components/helpers.js";

const filename = value => String(value).replace(/[^\p{L}\p{N} ._-]/gu, "-").trim().slice(0, 100);
const pdfBytes = pdf => [...new Uint8Array(pdf.output("arraybuffer"))];

async function save(invoke, name, bytes) {
  const result = await invoke("save_export_file", { name, bytes, openAfter: false });
  if (result?.open_error) throw new Error(result.open_error);
  return result?.path;
}

export async function exportResources(invoke, state, format, includePrices) {
  const estimate = state.estimates.find(item => item.id === state.estimateId);
  if (!estimate) return;
  const rows = state.estimateResourceTotals || [];
  const headers = ["Tipo", "Descripción", "Unidad", "Cantidad total"];
  if (includePrices) headers.push("Precio total " + estimate.currency);
  const name = filename("Insumos - " + estimate.title);
  if (format === "xlsx") {
    const { default: writeExcelFile } = await import("write-excel-file/universal");
    const data = [headers.map(value => ({ value, fontWeight: "bold" }))];
    for (const row of rows) {
      const cells = [kindName(row.kind), row.description, row.unit].map(value => ({ value, type: String }));
      cells.push({ value: Number(row.quantity), type: Number });
      if (includePrices) cells.push(row.total == null ? null : { value: Number(row.total), type: Number, format: "#,##0.00" });
      data.push(cells);
    }
    const blob = await writeExcelFile([{ data, sheet: "Insumos", columns: [22, 60, 14, 18, 22].slice(0, headers.length).map(width => ({ width })) }]).toBlob();
    return save(invoke, name + ".xlsx", [...new Uint8Array(await blob.arrayBuffer())]);
  }

  const { jsPDF } = await import("jspdf");
  const pdf = createPdf(jsPDF, { unit: "mm", format: "a4" });
  const report = await invoke("get_budget_print_data", { estimateId: estimate.id });
  const profile = report.profile || {};
  const project = report.project?.name || state.projects.find(item => item.id === state.projectId)?.name || "";
  const reference = report.document?.presentation?.print_options?.reference || estimate.id.slice(0, 8);
  const columns = includePrices ? [12, 40, 123, 156, 198] : [12, 40, 149, 198];
  let y;
  function heading() {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(profile.trade_name || profile.company_name || profile.professional_name || "CP Obras", 12, 17);
    if (profile.logo_png?.length) {
      try {
        const logo = new Uint8Array(profile.logo_png), info = pdf.getImageProperties(logo);
        const scale = Math.min(28 / info.width, 16 / info.height);
        pdf.addImage(logo, "PNG", 198 - info.width * scale, 10, info.width * scale, info.height * scale);
      } catch { /* A text letterhead is sufficient if the stored logo is unreadable. */ }
    }
    pdf.setFontSize(11);
    pdf.text("Insumos del presupuesto", 12, 28);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    const context = pdf.splitTextToSize(project + " · " + estimate.title + " · #" + reference + " · " + dateToday().split("-").reverse().join("/"), 186);
    pdf.text(context, 12, 34);
    y = 37 + context.length * 4;
    pdf.setFillColor(52, 75, 96);
    pdf.rect(12, y, 186, 7, "F");
    pdf.setTextColor(255);
    headers.forEach((label, i) => pdf.text(label, columns[i] + (i < 3 ? 1 : -1), y + 4.7, { align: i < 3 ? "left" : "right" }));
    pdf.setTextColor(32, 53, 73);
    y += 11;
  }
  heading();
  for (const row of rows) {
    const description = pdf.splitTextToSize(row.description, columns[2] - columns[1] - 4);
    const rowHeight = Math.max(6, description.length * 4 + 2);
    if (y + rowHeight > 285) { pdf.addPage(); heading(); }
    pdf.text(kindName(row.kind), columns[0] + 1, y);
    pdf.text(description, columns[1] + 1, y);
    pdf.text(row.unit, columns[2] + 1, y);
    pdf.text(numeric(row.quantity), columns[3] - 1, y, { align: "right" });
    if (includePrices) pdf.text(row.total == null ? "—" : money(row.total), columns[4] - 1, y, { align: "right" });
    pdf.setDrawColor(222, 229, 235);
    pdf.line(12, y + rowHeight - 4, 198, y + rowHeight - 4);
    y += rowHeight;
  }
  return save(invoke, name + ".pdf", pdfBytes(pdf));
}

function plotDocument(jsPDF, width, height) {
  // PDF page coordinates are limited to 14,400 points. UserUnit preserves the physical size.
  const unit = Math.max(1, Math.ceil(Math.max(width, height) / 5000));
  const page = [width / unit, height / unit];
  const orientation = width >= height ? "landscape" : "portrait";
  return { pdf: createPdf(jsPDF, { unit: "mm", format: page, orientation, userUnit: unit }), unit, page, orientation };
}

export async function exportGantt(invoke, title, plan, schedule, height, baseline) {
  if (!Number.isFinite(height) || height < 80 || height > 5000)
    throw new Error("Ingresá una altura de 80 a 5000 mm.");
  const scheduled = new Map((schedule?.tasks || []).map(task => [task.id, task]));
  const previous = new Map((baseline?.tasks || []).map(task => [task.id, task]));
  if (!scheduled.size) throw new Error("El Gantt todavía no tiene tareas programadas.");
  const cuts = new Set(plan.finance?.cut_dates || []);
  const boundaries = [...scheduled.values(), ...previous.values()].flatMap(task => [task.start, task.finish]);
  let first = dayNumber(plan.calendar.start_date), last = first;
  for (const iso of [...boundaries, ...cuts]) {
    if (!iso) continue;
    const day = dayNumber(iso);
    first = Math.min(first, day);
    last = Math.max(last, day);
  }
  const days = calendarDays(first, last - first + 1).map(day => ({
    ...day,
    working: isWorkingDate(plan.calendar, day.iso),
    exception: plan.calendar.exceptions?.[day.iso],
  }));
  const dayWidth = days.length > 180 ? 5 : 8;
  const margin = 9, left = 72, top = 24, tier = 5, header = 24, rowHeight = 12;
  const rowTop = top + header, right = left + days.length * dayWidth;
  const width = Math.max(right + margin, 210);
  const { jsPDF } = await import("jspdf");
  const { pdf, unit, page, orientation } = plotDocument(jsPDF, width, height);
  const xAt = day => left + (day - first) * dayWidth;
  const line = (x, y, x2, y2) => pdf.line(x / unit, y / unit, x2 / unit, y2 / unit);
  const rect = (x, y, w, h, style) => pdf.rect(x / unit, y / unit, w / unit, h / unit, style);
  const text = (value, x, y, size, {color = [35, 56, 76], bold = false, align = "left"} = {}) => {
    pdf.setTextColor(...color);
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size / unit);
    pdf.text(String(value), x / unit, y / unit, {align});
  };
  function shorten(value, available, size, bold = false) {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size / unit);
    const fits = text => pdf.getTextWidth(text) <= available / unit;
    if (fits(value)) return value;
    let length = value.length;
    while (length > 0 && !fits(value.slice(0, length) + "…")) length--;
    return length ? value.slice(0, length) + "…" : "";
  }
  function hatch(x, y, w, h) {
    pdf.setDrawColor(184, 196, 208);
    for (let offset = 0; offset < w + h; offset += 2.1) {
      const start = Math.max(0, offset - h), end = Math.min(w, offset);
      line(x + start, y + offset - start, x + end, y + offset - end);
    }
  }
  const tiers = [
    ["year", day => day.year],
    ["month", day => MONTHS[Number(day.month.slice(5)) - 1]],
    ["weekKey", day => "Sem. " + day.week + " · " + day.weekYear],
  ].map(([key, label]) => calendarGroups(days, key).map(span => ({ ...span, label: label(span.day) })));
  const perPage = Math.max(1, Math.floor((height - rowTop - 13) / rowHeight));
  const pages = Math.ceil(plan.tasks.length / perPage);
  const today = dateToday();
  for (let offset = 0; offset < plan.tasks.length; offset += perPage) {
    if (offset) pdf.addPage(page, orientation);
    const batch = plan.tasks.slice(offset, offset + perPage);
    const bottom = rowTop + batch.length * rowHeight;
    pdf.setLineWidth(0.16 / unit);
    pdf.setFillColor(32, 53, 73);
    rect(margin, 8, width - 2 * margin, 11, "F");
    const white = [255, 255, 255];
    text(shorten("Gantt · " + title, width - 2 * margin - 8, 13, true), margin + 4, 15, 13, {bold:true,color:white});
    pdf.setFillColor(237, 243, 248);
    rect(margin, top, left - margin, header, "F");
    pdf.setFillColor(244, 247, 251);
    rect(left, top, right - left, header, "F");
    text("Tareas", margin + 3, rowTop - 3, 10, {bold: true});
    for (const [index, spans] of tiers.entries()) {
      const y = top + index * tier;
      pdf.setDrawColor(190, 207, 221);
      line(left, y + tier, right, y + tier);
      for (const span of spans) {
        const x = xAt(span.start), end = xAt(span.end);
        line(end, y, end, y + tier);
        text(shorten(span.label, end - x - 0.6, 7.5, true), (x + end) / 2, y + 3.5, 7.5, {bold: true, align: "center"});
      }
    }
    for (const day of days) {
      const x = xAt(day.day), y = top + tiers.length * tier;
      const fill = day.exception?.working ? [232, 245, 237] : day.exception ? [255, 240, 215] : [242, 245, 248];
      if (day.exception || !day.working) {
        pdf.setFillColor(...fill);
        rect(x, y, dayWidth, bottom - y, "F");
        if (!day.working) hatch(x, y, dayWidth, bottom - y);
      }
      pdf.setDrawColor(218, 227, 236);
      line(x, y, x, bottom);
      text(WEEKDAYS[day.weekday], x + dayWidth / 2, y + 3.2, dayWidth > 5 ? 7 : 6, {color:[85,112,133],align:"center"});
      text(Number(day.iso.slice(8)), x + dayWidth / 2, y + 7, 8, {bold:true,align:"center"});
    }
    for (const [index, task] of batch.entries()) {
      const y = rowTop + index * rowHeight;
      const dates = scheduled.get(task.id), base = previous.get(task.id);
      pdf.setDrawColor(218, 227, 236);
      line(margin, y, right, y);
      const label = (task.parent_id ? "› " : "") + task.name;
      text(shorten(label, left - margin - 6, 9), margin + 3, y + 4.6, 9);
      if (dates) text(dates.start + " a " + dates.finish + " · Holgura " + (dates.float_days ?? "—") + " d", margin + 3, y + 8.8, 7, {color:[85,112,133]});
      if (base?.start && base.finish) {
        const start = xAt(dayNumber(base.start)), end = xAt(dayNumber(base.finish) + 1);
        pdf.setFillColor(148, 168, 185);
        rect(start, y + 9.3, end - start, 0.9, "F");
      }
      if (!dates?.start || !dates.finish) continue;
      const start = dayNumber(dates.start), end = dayNumber(dates.finish) + 1;
      const x = xAt(start), barWidth = task.duration_days === 0 ? dayWidth / 2 : xAt(end) - x;
      const barX = task.duration_days === 0 ? x + dayWidth / 4 : x;
      const color = dates.critical ? [188,70,65] : [36,125,164];
      pdf.setFillColor(...color);
      pdf.setDrawColor(...color);
      if (task.duration_days === 0) {
        rect(barX, y + 2.2, barWidth, 6.2, "F");
      } else {
        let run = start;
        for (let day = start; day <= end; day++) {
          if (day < end && days[day - first].working) continue;
          if (day > run) rect(xAt(run), y + 2.2, xAt(day) - xAt(run), 6.2, "F");
          run = day + 1;
        }
        rect(barX, y + 2.2, barWidth, 6.2, "S");
      }
      const progress = Math.max(0, Math.min(100, Number(task.actual_progress) || 0));
      if (progress) {
        pdf.setFillColor(...(dates.critical ? [213,118,114] : [91,156,187]));
        rect(barX, y + 7.2, barWidth * progress / 100, 1.2, "F");
      }
      const fullLabel = shorten(task.name, barWidth - 1.6, 7);
      if (fullLabel) {
        // A dark edge keeps labels readable where the bar crosses a nonworking day.
        pdf.setFontSize(7 / unit);
        const backing = pdf.getTextWidth(fullLabel) * unit + 0.8;
        pdf.setFillColor(...color);
        rect(barX + 0.4, y + 3.1, Math.min(backing, barWidth - 0.4), 3.4, "F");
        text(fullLabel, barX + 0.8, y + 5.7, 7, {color:white});
      }
    }
    pdf.setDrawColor(190, 207, 221);
    rect(margin, top, right - margin, bottom - top, "S");
    line(left, top, left, bottom);
    for (const date of cuts) {
      const x = xAt(dayNumber(date) + 1);
      pdf.setDrawColor(140, 74, 165);
      pdf.setLineWidth(0.5 / unit);
      line(x, top + tiers.length * tier, x, rowTop);
      pdf.setLineDashPattern([1.2 / unit, 0.8 / unit], 0);
      line(x, rowTop, x, bottom);
      pdf.setLineDashPattern([], 0);
    }
    if (today >= days[0].iso && today <= days.at(-1).iso) {
      pdf.setDrawColor(239, 139, 45);
      pdf.setLineWidth(0.42 / unit);
      const x = xAt(dayNumber(today));
      line(x, top + tiers.length * tier, x, bottom);
    }
    text("Rojo: camino crítico · Violeta: corte de certificación · Tramado: día no laborable" + (previous.size ? " · Gris: línea base" : ""), margin, bottom + 6, 8);
    if (pages > 1) text((Math.floor(offset / perPage) + 1) + " / " + pages, right, bottom + 6, 8, {align:"right"});
  }
  return save(invoke, filename("Gantt - " + title) + ".pdf", pdfBytes(pdf));
}

export async function exportPert(invoke, title, plan, schedule, positions) {
  if (!plan.tasks.length) throw new Error("El PERT todavía no tiene tareas.");
  const scheduled = new Map((schedule?.tasks || []).map(task => [task.id, task]));
  const scale = 0.32, nodeWidth = 230 * scale, nodeHeight = 96 * scale;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const {x, y} of Object.values(positions)) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const { jsPDF } = await import("jspdf");
  const { pdf, unit } = plotDocument(jsPDF, Math.max(210, (maxX - minX) * scale + nodeWidth + 36), (maxY - minY) * scale + nodeHeight + 40);
  const points = Object.fromEntries(Object.entries(positions).map(([id, {x,y}]) => [id, [(18+(x-minX)*scale)/unit, (27+(y-minY)*scale)/unit]]));
  const w = nodeWidth / unit, h = nodeHeight / unit;
  pdf.setFontSize(15 / unit);
  pdf.text("PERT · " + title, 12 / unit, 15 / unit);
  pdf.setFontSize(8 / unit);
  for (const task of plan.tasks) {
    const [tx, ty] = points[task.id];
    for (const dependency of task.predecessors) {
      if (!points[dependency.task_id]) continue;
      const [x, y] = points[dependency.task_id];
      const critical = scheduled.get(dependency.task_id)?.critical && scheduled.get(task.id)?.critical;
      const color = critical ? [174, 55, 51] : [84, 115, 135];
      pdf.setDrawColor(...color);
      pdf.setFillColor(...color);
      const startX = x + w, startY = y + h/2, endY = ty + h/2;
      const curve = Math.max(55 * scale / unit, Math.abs(tx - startX) / 2);
      pdf.lines([[curve, 0, tx - curve - startX, endY - startY, tx - startX, endY - startY]], startX, startY);
      pdf.triangle(tx, endY, tx - 2/unit, endY - 1/unit, tx - 2/unit, endY + 1/unit, "F");
      pdf.text(dependency.kind + (dependency.lag_days ? " " + dependency.lag_days + " d" : ""), (startX + tx) / 2, (startY + endY) / 2 - 2/unit);
    }
  }
  for (const task of plan.tasks) {
    const [x,y] = points[task.id], scheduledTask = scheduled.get(task.id);
    pdf.setFillColor(244, 248, 252);
    pdf.setDrawColor(...(scheduledTask?.critical ? [174, 55, 51] : [84, 115, 135]));
    pdf.roundedRect(x,y,w,h,2/unit,2/unit,"FD");
    pdf.setFont("helvetica","bold");
    pdf.text(pdf.splitTextToSize(task.name,w-8/unit).slice(0,3),x+4/unit,y+6/unit);
    pdf.setFont("helvetica","normal");
    pdf.text(task.duration_days + " días",x+4/unit,y+21/unit);
    if (scheduledTask?.start) pdf.text(scheduledTask.start + " a " + scheduledTask.finish,x+4/unit,y+26/unit);
  }
  return save(invoke, filename("PERT - " + title) + ".pdf", pdfBytes(pdf));
}
