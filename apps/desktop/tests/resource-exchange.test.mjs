import test from "node:test";
import assert from "node:assert/strict";
import { resourceHeaders, parseResourceRows, resourceTemplateBytes, readResourceWorkbook } from "../src/services/resource-exchange.js";
import { parseExcel } from "../src/services/exchange.js";

test("resource Excel template has the actual import headers and excludes instructional examples", async()=>{
 const bytes=await resourceTemplateBytes();
 const rows=await parseExcel(bytes);
 assert.deepEqual(rows,[resourceHeaders]);
 assert.throws(()=>parseResourceRows(rows),/al menos un insumo/);
});
test("resource Excel rows preserve exact amounts, zero, optional prices and labor kinds",()=>{
 const rows=parseResourceRows([resourceHeaders,
  ["","Oficial","Mano de obra","h",""],
  ["MAT-1","Cemento","Material","bolsa","9007199254740993.01"],
  ["MAT-2","Arena","Material","m³","0"],
  ["MAT-3","Piedra","Material","m³","1.234,56"],
  ["EQ-1","Equipo","Equipo","h","1E+5"],
  ["","","","",""],
 ]);
 assert.equal(rows.length,5);assert.equal(rows[0].price,null);assert.equal(rows[0].kind,"labor");
 assert.equal(rows[1].price,"9007199254740993.01");assert.equal(rows[2].price,"0");assert.equal(rows[3].price,"1234.56");assert.equal(rows[4].price,"100000");
 assert.ok(rows.every(r=>r.errors.length===0));
});
test("resource preview reports duplicates and invalid rows instead of overwriting",()=>{
 const existing=[{code:"MAT-1",description:"Cemento",unit:"bolsa",kind:"material"}];
 const rows=parseResourceRows([resourceHeaders,["mat-1","Nuevo","Material","kg","10"],["","Cemento","Material","bolsa","20"],["MAT-2","Otro","Material","kg","-1"],["MAT-2","","Incorrecto","","0"]],existing);
 assert.match(rows[0].errors.join(" "),/código ya existe/);assert.match(rows[1].errors.join(" "),/insumo ya existe/);
 assert.match(rows[2].errors.join(" "),/Precio inválido/);assert.ok(rows[3].errors.length>=3);
 assert.throws(()=>parseResourceRows([["Otra cabecera"]]),/Falta la columna/);
 assert.throws(()=>parseResourceRows([[...resourceHeaders,"Tipo"]]),/repetida/);
});
test("resource file import rejects wrong format and oversized files before reading",async()=>{
 await assert.rejects(()=>readResourceWorkbook({name:"listado.xls",size:10}),/xlsx/);
 await assert.rejects(()=>readResourceWorkbook({name:"listado.xlsx",size:10_000_001}),/10 MB/);
});
