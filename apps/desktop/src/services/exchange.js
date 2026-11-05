import { money, numeric, multiplyDecimals } from "../decimal.js";
const headers = ["Descripción", "Unidad", "Cantidad", "Precio unitario", "Rubro", "Código", "Importe"];
const safeText = value => /^[=+@\t\r-]/.test(String(value)) ? "'" + value : String(value ?? "");
export function budgetRows(document) {
 const sections = new Map(document.sections.map(section => [section.id, section]));
 const assignments = new Map(document.assignments);
 return document.lines.map(line => { const section = sections.get(assignments.get(line.id)); return [line.description, line.unit, String(line.quantity), String(line.unit_cost_snapshot), section?.title || "", section?.code || "", multiplyDecimals(line.quantity, line.unit_cost_snapshot)]; });
}
export function exportCsv(document) {
 return "\uFEFF" + [headers, ...budgetRows(document)].map(row => row.map(value => '"' + safeText(value).replaceAll('"', '""') + '"').join(";")).join("\r\n");
}
export function parseCsv(text) {
 if (text.length > 10_000_000) throw new Error("Archivo demasiado grande (máximo 10 MB)");
 text = text.replace(/^\uFEFF/, "");
 const separator = text.split(/\r?\n/)[0].includes(";") ? ";" : ",";
 const rows = []; let row = [], cell = "", quoted = false;
 for (let index = 0; index < text.length; index++) {
  const char = text[index];
  if (char === '"') { if (quoted && text[index + 1] === '"') { cell += '"'; index++; } else if (quoted || cell === "") quoted = !quoted; else throw new Error("Comillas CSV inválidas"); }
  else if (char === separator && !quoted) { row.push(cell); cell = ""; }
  else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[index + 1] === "\n") index++; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
  else cell += char;
 }
 if (quoted) throw new Error("Campo CSV sin cerrar");
 row.push(cell); if (row.some(Boolean)) rows.push(row);
 return rows;
}
export function rowsToBudget(rows, { currency, title, uuid = () => globalThis.crypto.randomUUID() }) {
 if (rows.length < 2 || rows.length > 10_001) throw new Error("El archivo debe tener encabezado y entre 1 y 10.000 partidas");
 if (headers.slice(0, 4).some((header, index) => String(rows[0][index]).trim() !== header)) throw new Error("Encabezado esperado: " + headers.join("; "));
 const sections = [], assignments = [], sectionMap = new Map(), estimateId = uuid();
 const decimal = (value, row) => { const text = String(value ?? "").trim().replace(",", "."); if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error("Decimal inválido en fila " + row); return text; };
 const lines = rows.slice(1).map((row, index) => {
  if (!String(row[0] || "").trim() || !String(row[1] || "").trim()) throw new Error("Descripción y unidad obligatorias en fila " + (index + 2));
  const id = uuid();
  if (row[4]) { const key = String(row[5] || "") + "\0" + row[4]; if (!sectionMap.has(key)) { const section = { id: uuid(), estimate_id: estimateId, parent_id: null, code: String(row[5] || sections.length + 1), title: String(row[4]), position: sections.length }; sections.push(section); sectionMap.set(key, section.id); } assignments.push([id, sectionMap.get(key)]); }
  return { id, estimate_id: estimateId, position: index, analysis_id: null, description: String(row[0]), unit: String(row[1]), quantity: decimal(row[2], index + 2), unit_cost_snapshot: decimal(row[3], index + 2) };
 });
 return { format_version: 1, currency, title, lines, sections, assignments, takeoffs: [], rates: { general_expenses_percent: "0", financial_expenses_percent: "0", profit_percent: "0", discount_percent: "0", tax_percent: "0" } };
}
export async function exportExcel(document) {
 const { default: writeExcelFile } = await import("write-excel-file/universal");
 const rows = [headers.map(value=>({value,fontWeight:"bold"})), ...budgetRows(document).map(row=>row.map(value=>({value:String(value),type:String})))];
 const blob=await writeExcelFile(rows,{sheet:"Presupuesto",columns:[55,12,24,24,35,15,26].map(width=>({width}))}).toBlob();
 return new Uint8Array(await blob.arrayBuffer());
}
export async function validateWorkbookArchive(buffer) {
 const { Unzip, UnzipInflate }=await import("fflate");
 const bytes=buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
 let total=0,entries=0;
 const unzip=new Unzip(file=>{
  if(++entries>1000)throw new Error("Demasiados archivos internos en la planilla");
  file.ondata=(error,chunk)=>{if(error)throw error;total+=chunk.length;if(total>50_000_000)throw new Error("La planilla supera 50 MB descomprimida");};
  file.start();
 });
 unzip.register(UnzipInflate);
 for(let offset=0;offset<bytes.length;offset+=4096)unzip.push(bytes.subarray(offset,offset+4096),offset+4096>=bytes.length);
 if(entries===0)throw new Error("La planilla no es un archivo Excel válido");
}
export async function parseExcel(buffer) {
 if (buffer.byteLength > 10_000_000) throw new Error("Máximo 10 MB por archivo Excel");
 await validateWorkbookArchive(buffer);
 const { readSheet }=await import("read-excel-file/universal");
 // Preserve the exact digits stored in Excel numeric cells, rather than converting to Number.
 const rows=await readSheet(new Blob([buffer]), {parseNumber:value=>value});
 if(rows.length>10_001||rows.some(row=>row.length>30))throw new Error("Tamaño de planilla inválido");
 return rows.map(row=>row.map(value=>String(value??"")));
}
export async function exportPdf(document, { title = document.title, landscape = false, mode = "budget", analyses = [], totals = null } = {}) {
 const { jsPDF } = await import("jspdf"); const pdf = new jsPDF({ orientation: landscape ? "landscape" : "portrait" });
 const width = pdf.internal.pageSize.getWidth(), bottom = pdf.internal.pageSize.getHeight() - 18; let y = 20;
 const heading = () => { pdf.setFontSize(15); pdf.text(title, 14, 15); pdf.setFontSize(9); pdf.text("CPOBRAS · " + ({Ars:"ARS",Usd:"USD"}[document.currency] || document.currency), 14, 23); y = 33; };
 const line = (text, bold = false) => { const lines = pdf.splitTextToSize(String(text), width - 28); for (const value of lines) { if (y > bottom) { pdf.addPage(); heading(); } pdf.setFont("helvetica", bold ? "bold" : "normal"); pdf.setFontSize(9); pdf.text(value, 14, y); y += 5; } };
 heading();
 if (mode === "takeoffs") for (const row of document.takeoffs) { const item = document.lines.find(line => line.id === row.line_id); line((item?.description || "Partida") + " · " + row.note, true); line(`${row.sign < 0 ? "Descuento" : "Suma"}: ${numeric(row.factor)} × ${numeric(row.length)} × ${numeric(row.width)} × ${numeric(row.height)}`); }
 else if (mode === "analyses") { line("Composición actual de los ACU. Los precios guardados del presupuesto se conservan por separado."); for (const analysis of analyses) { line(analysis.code + " · " + analysis.description, true); for (const component of analysis.components) line(`${component.description} | ${numeric(component.quantity)} | ${money(component.unit_price)} | ${money(component.total)}`); line("Costo unitario actual: " + money(analysis.unit_cost)); } }
 else { for (const row of budgetRows(document)) { line(row[0], true); line(`${row[4]} | ${row[1]} | Cantidad ${numeric(row[2])} | P. unitario ${money(row[3])} | Importe ${money(row[6])}`); } }
 if (mode === "budget" && totals) {
  line("Resumen económico", true);
  for (const [label, key] of [["Costo directo","direct"],["Gastos generales","general_expenses"],["Gastos financieros","financial_expenses"],["Beneficio","profit"],["Descuento","discount"],["Subtotal imponible","taxable_subtotal"],["Impuestos","taxes"],["TOTAL","total"]]) line(label + ": " + money(totals[key]), key === "total");
 }
 for (let page = 1; page <= pdf.getNumberOfPages(); page++) { pdf.setPage(page); pdf.setFontSize(8); pdf.text(`${page} / ${pdf.getNumberOfPages()}`, width - 30, pdf.internal.pageSize.getHeight() - 8); }
 return new Uint8Array(pdf.output("arraybuffer"));
}
