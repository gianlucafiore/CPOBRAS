import test from "node:test";
import assert from "node:assert/strict";
import { exportCsv, parseCsv, rowsToBudget, exportExcel, parseExcel, exportPdf } from "../src/services/exchange.js";
let index=0;
const fixture=()=>rowsToBudget([["Descripción","Unidad","Cantidad","Precio unitario","Rubro","Código"],["Hormigón; \"armado\"\nPlanta baja","m³","2.50","9007199254740993.01","Estructura","01"]],{currency:"Ars",title:"Presupuesto",uuid:()=>`fixture-${++index}`});
test("CSV round trip preserves quotes, semicolons, newlines and exact money",()=>{const original=fixture();const rows=parseCsv(exportCsv(original));const imported=rowsToBudget(rows,{currency:"Ars",title:"Importado",uuid:()=>`id-${++index}`});assert.equal(imported.lines[0].description,original.lines[0].description);assert.equal(imported.lines[0].unit_cost_snapshot,"9007199254740993.01");assert.equal(rows[1][6],"22517998136852482.5250");});
test("CSV rejects malformed quotes and invalid financial values",()=>{assert.throws(()=>parseCsv('"sin cerrar'));assert.throws(()=>rowsToBudget([["Descripción","Unidad","Cantidad","Precio unitario"],["A","m","1","=2+3"]],{currency:"Ars",title:"A"}));assert.throws(()=>rowsToBudget([["Otra cabecera"],["A"]],{currency:"Ars",title:"A"}));});
test("CSV protects spreadsheet formula injection in text fields",()=>{const doc=fixture();doc.lines[0].description="=SUM(A1:A2)";assert.match(exportCsv(doc),/'=SUM/);});
test("Excel round trip retains full decimal strings and grouping",async()=>{const doc=fixture();const bytes=await exportExcel(doc);assert.equal(bytes[0],0x50);const rows=await parseExcel(bytes);assert.equal(rows[1][2],"2.50");assert.equal(rows[1][3],"9007199254740993.01");assert.equal(rows[1][4],"Estructura");});
test("PDF creates a portable document with configured title and totals",async()=>{const bytes=await exportPdf(fixture(),{title:"Obra de prueba",landscape:true,totals:{direct:"100",general_expenses:"10",financial_expenses:"0",profit:"5",discount:"0",taxable_subtotal:"115",taxes:"24.15",total:"139.15"}});assert.equal(new TextDecoder().decode(bytes.slice(0,5)),"%PDF-");assert.ok(bytes.length>1000);const contents=new TextDecoder().decode(bytes);assert.match(contents,/TOTAL/);assert.match(contents,/139,15/);});

test("compressed workbooks cannot expand beyond the import budget", async()=>{
 const {zipSync}=await import("fflate");
 const archive=zipSync({"oversized.xml":new Uint8Array(50_000_001)}, {level:1});
 await assert.rejects(()=>parseExcel(archive), /50 MB/);
});
