import { uiText } from "./interface-language.js";
import {
  sumDecimals,
  multiplyDecimals,
  divideDecimals,
  compareDecimals,
} from "../decimal.js";
export const clientLayouts = {
  get memory_sheet_price() { return uiText("Memoria descriptiva, planilla y precio"); },
  get sheet_price() { return uiText("Planilla de presupuesto y precio"); },
  get memory_price() { return uiText("Memoria descriptiva y precio"); },
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
/** Disclose only explicitly selected charges, preserving their order around taxes.
 * The remainder belongs to the quoted lines; totals and signed cents stay exact. */
export function publicPriceSummary(data, {splitCharges=true}={}) {
  const total=roundBudgetAmount(data.final_total),raw=data.calculation?.breakdown||{};
  const subtotal=roundBudgetAmount(raw.taxable_subtotal??sumDecimals([total,multiplyDecimals(raw.taxes??"0","-1")]));
  const taxes=sumDecimals([total,multiplyDecimals(subtotal,"-1")]);
  const definitions=new Map((data.document.price_definition?.rows||[]).map(row=>[row.id,row]));
  const source=data.calculation?.rows||[];
  const separate=row=>splitCharges&&row.enabled&&row.kind!=="subtotal"&&row.role!=="tax"&&(row.show_separately??definitions.get(row.id)?.show_separately??false);
  let accumulated="0",rounded="0";
  const charges=source.filter(separate).map(row=>{
    accumulated=sumDecimals([accumulated,row.amount]);
    const next=roundBudgetAmount(accumulated),amount=sumDecimals([next,multiplyDecimals(rounded,"-1")]);rounded=next;
    return {id:row.id,label:row.label,amount,kind:"charge"};
  });
  const work_subtotal=sumDecimals([subtotal,multiplyDecimals(rounded,"-1")]);
  if(!charges.length)return {subtotal,taxes,total,work_subtotal,charges,rows:[{label:"Subtotal sin IVA",amount:subtotal,kind:"subtotal"},{label:"IVA / impuestos",amount:taxes,kind:"tax"}]};
  const byId=new Map(charges.map(row=>[row.id,row]));
  const taxRows=source.filter(row=>row.enabled&&row.role==="tax"&&row.kind!=="subtotal");
  const rows=[{label:"Subtotal de partidas",amount:work_subtotal,kind:"subtotal"}];
  let taxRaw="0",taxRounded="0",taxIndex=0;
  if(!taxRows.length&&compareDecimals(taxes,"0")!==0)rows.push({label:"IVA / impuestos",amount:taxes,kind:"tax"});
  for(const row of source){
    if(byId.has(row.id))rows.push(byId.get(row.id));
    else if(row.enabled&&row.role==="tax"&&row.kind!=="subtotal"){
      taxRaw=sumDecimals([taxRaw,row.amount]);
      const next=++taxIndex===taxRows.length?taxes:roundBudgetAmount(taxRaw);
      rows.push({id:row.id,label:taxRows.length===1?"IVA / impuestos":row.label,kind:"tax",amount:sumDecimals([next,multiplyDecimals(taxRounded,"-1")])});taxRounded=next;
    }
  }
  return {subtotal,taxes,total,work_subtotal,charges,rows};
}
/** Allocate only the public, pre-tax selling price; never expose formation of the price. */
export function clientPrintData(data, options) {
  const summary = publicPriceSummary(data, options),
    direct =
      data.calculation?.breakdown?.direct ??
      sumDecimals(
        data.document.lines.map((l) =>
          multiplyDecimals(l.quantity, l.unit_cost_snapshot),
        ),
      );
  let cost = "0",
    allocated = "0",
    incidence = "0";
  const values = new Map((data.lines || []).map((l) => [l.id, l]));
  const lines = data.document.lines.map((l) => {
    const partial = multiplyDecimals(l.quantity, l.unit_cost_snapshot);
    cost = sumDecimals([cost, partial]);
    const next =
      compareDecimals(direct, "0") === 0
        ? "0"
        : compareDecimals(cost, direct) === 0
          ? summary.work_subtotal
          : roundBudgetAmount(
              multiplyDecimals(
                divideDecimals(cost, direct, 24),
                summary.work_subtotal,
              ),
            );
    const sale = sumDecimals([next, multiplyDecimals(allocated, "-1")]);
    allocated = next;
    const cumulative = compareDecimals(summary.work_subtotal,"0")===0?"0":roundBudgetAmount(
      multiplyDecimals(divideDecimals(next,summary.work_subtotal,24),"100"),4);
    const share=sumDecimals([cumulative,multiplyDecimals(incidence,"-1")]);
    incidence=cumulative;
    return {
      ...values.get(l.id),
      id: l.id,
      sale_total: sale,
      incidence_percent: share,
      cumulative_percent: cumulative,
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
      summary.work_subtotal,
      multiplyDecimals(allocated, "-1"),
    ]),
  };
}
