import {
  sumDecimals,
  multiplyDecimals,
  divideDecimals,
  compareDecimals,
} from "../decimal.js";
export const clientLayouts = {
  memory_sheet_price: "Memoria descriptiva, planilla y precio",
  sheet_price: "Planilla de presupuesto y precio",
  memory_price: "Memoria descriptiva y precio",
};
export const hasMemory = (layout) =>
  ["memory_sheet_price", "memory_price"].includes(layout);
export const hasSchedule = (layout) => layout !== "memory_price";
export function roundBudgetAmount(value, places = 2) {
  const text = sumDecimals([value ?? "0"]),
    negative = text.startsWith("-"),
    [integer, fraction = ""] = text.replace(/^[-+]/, "").split(".");
  const padded = fraction.padEnd(places + 1, "0");
  let units = BigInt(integer + padded.slice(0, places));
  if (Number(padded[places]) >= 5) units++;
  const digits = units.toString().padStart(places + 1, "0");
  return (
    (negative && units !== 0n ? "-" : "") +
    (places ? digits.slice(0, -places) + "." + digits.slice(-places) : digits)
  );
}
export function publicPriceSummary(data) {
  const total = roundBudgetAmount(data.final_total);
  const raw = data.calculation?.breakdown || {};
  const net = roundBudgetAmount(
    raw.taxable_subtotal ??
      sumDecimals([total, multiplyDecimals(raw.taxes ?? "0", "-1")]),
  );
  return {
    subtotal: net,
    taxes: sumDecimals([total, multiplyDecimals(net, "-1")]),
    total,
  };
}
/** Allocate only the public, pre-tax selling price; never expose formation of the price. */
export function clientPrintData(data) {
  const summary = publicPriceSummary(data),
    direct =
      data.calculation?.breakdown?.direct ??
      sumDecimals(
        data.document.lines.map((l) =>
          multiplyDecimals(l.quantity, l.unit_cost_snapshot),
        ),
      );
  let cost = "0",
    allocated = "0";
  const values = new Map((data.lines || []).map((l) => [l.id, l]));
  const lines = data.document.lines.map((l) => {
    const partial = multiplyDecimals(l.quantity, l.unit_cost_snapshot);
    cost = sumDecimals([cost, partial]);
    const next =
      compareDecimals(direct, "0") === 0
        ? "0"
        : compareDecimals(cost, direct) === 0
          ? summary.subtotal
          : roundBudgetAmount(
              multiplyDecimals(
                divideDecimals(cost, direct, 24),
                summary.subtotal,
              ),
            );
    const sale = sumDecimals([next, multiplyDecimals(allocated, "-1")]);
    allocated = next;
    return {
      ...values.get(l.id),
      id: l.id,
      sale_total: sale,
      sale_unit:
        compareDecimals(l.quantity, "0") === 0
          ? "0"
          : divideDecimals(sale, l.quantity, 20),
    };
  });
  return {
    ...data,
    lines,
    unallocated_total: sumDecimals([
      summary.subtotal,
      multiplyDecimals(allocated, "-1"),
    ]),
  };
}
