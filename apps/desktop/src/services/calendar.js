const DAY = 86400000;
export const DAY_WIDTH = 32;
export function dayNumber(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error("Fecha inválida");
  const ms = Date.parse(iso + "T00:00:00Z");
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== iso)
    throw new Error("Fecha inválida");
  return Math.floor(ms / DAY);
}
export const dayISO = (day) => new Date(day * DAY).toISOString().slice(0, 10);
export const addDays = (iso, n) => dayISO(dayNumber(iso) + n);
export const weekday = (iso) =>
  (new Date(dayNumber(iso) * DAY).getUTCDay() + 6) % 7;
export function isWorkingDate(calendar, iso) {
  const exception = calendar.exceptions?.[iso];
  if (exception) return exception.working;
  return (
    !(calendar.holidays || []).includes(iso) &&
    !(calendar.nonworking_weekdays || []).includes(weekday(iso))
  );
}
export function isoWeek(iso) {
  const d = new Date(dayNumber(iso) * DAY);
  d.setUTCDate(d.getUTCDate() + 3 - weekday(iso));
  const year = d.getUTCFullYear(),
    first = new Date(0);
  first.setUTCFullYear(year, 0, 1);
  first.setUTCHours(0, 0, 0, 0);
  return { year, week: 1 + Math.floor((d - first) / DAY / 7) };
}
export function calendarDays(start, count) {
  return Array.from({ length: count }, (_, i) => {
    const iso = dayISO(start + i),
      week = isoWeek(iso);
    return {
      iso,
      day: start + i,
      weekday: weekday(iso),
      year: iso.slice(0, 4),
      month: iso.slice(0, 7),
      weekKey: week.year + "-" + week.week,
      week: week.week,
      weekYear: week.year,
    };
  });
}
export function finishWorking(calendar, start, duration) {
  let seen = 0;
  for (let i = 0; i < 366000; i++) {
    const iso = addDays(start, i);
    if (isWorkingDate(calendar, iso)) {
      if (duration === 0 || ++seen >= duration)
        return { start: nextWorking(calendar, start), finish: iso };
    }
  }
  throw new Error("El calendario excede el horizonte admitido");
}
export function nextWorking(calendar, start) {
  for (let i = 0; i < 366000; i++) {
    const iso = addDays(start, i);
    if (isWorkingDate(calendar, iso)) return iso;
  }
  throw new Error("El calendario no tiene días laborables");
}
export function workingCount(calendar, start, finish) {
  if (finish < start) return 0;
  const length = dayNumber(finish) - dayNumber(start) + 1;
  if (length > 366000) throw new Error("Período fuera de rango");
  let count = 0;
  for (let i = 0; i < length; i++)
    if (isWorkingDate(calendar, addDays(start, i))) count++;
  return count;
}
