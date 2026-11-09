import { compareDecimals } from "../decimal.js";
import { parseExcel } from "./exchange.js";
export const resourceHeaders = ["Código", "Descripción", "Tipo", "Unidad", "Precio ARS"];
const normalize = value => String(value ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const normalizeKind = value => normalize(value).replace(/[.\s_-]+/g, "");
const kinds = new Map([
 ["material","material"],["materiales","material"],["MAT","material"],
 ["mano de obra","labor"],["labor","labor"],["MO","labor"],
 ["equipo","equipment"],["equipos","equipment"],["equipment","equipment"],["EQ","equipment"],
 ["subcontrato","subcontract"],["subcontract","subcontract"],["SC","subcontract"],["SUB","subcontract"],
].map(([alias, kind]) => [normalizeKind(alias), kind]));
export const resourceKindLabels = {material:"Material",labor:"Mano de obra",equipment:"Equipo",subcontract:"Subcontrato"};
function priceDecimal(value) {
 let text=String(value).trim();
 if (text.includes(",")) text=text.replace(/\./g, "").replace(",", ".");
 const match=/^\+?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);
 if(!match) throw new Error("Precio inválido: usá un número mayor o igual a cero");
 const exponent=Number(match[3]||0),fraction=match[2]||"";
 if(Math.abs(exponent)>28) throw new Error("Precio fuera de rango");
 let digits=(match[1]+fraction).replace(/^0+(?=\d)/, ""),scale=fraction.length-exponent;
 if(scale<0){digits+="0".repeat(-scale);scale=0;}
 if(scale>28)throw new Error("El precio admite como máximo 28 decimales");
 digits=digits.padStart(scale+1,"0");
 const amount=scale ? digits.slice(0,-scale)+"."+digits.slice(-scale) : digits;
 if(compareDecimals(digits,"79228162514264337593543950335")>0)throw new Error("Precio fuera de rango");
 return amount;
}
export function parseResourceRows(sheet, existing=[]) {
 if(!sheet.length)throw new Error("La planilla está vacía");
 const header=sheet[0].map(normalize),required=["descripcion","tipo","unidad"];
 for(const column of required)if(!header.includes(column))throw new Error(`Falta la columna ${column}. Usá la plantilla de insumos.`);
 const recognized=new Set(resourceHeaders.map(normalize));
 for(const column of header)if(column && !recognized.has(column))throw new Error(`Columna desconocida: ${column}. Usá la plantilla de insumos.`);
 const seen=new Set();
 for(const h of header)if(recognized.has(h)&&seen.has(h))throw new Error(`La columna ${h} está repetida`);else seen.add(h);
 const codes=new Set(existing.map(r=>r.code.trim().toLowerCase()));
 const identity=r=>[r.description.trim().toLowerCase(),r.unit.trim().toLowerCase(),r.kind].join("\u0000");
 const identities=new Set(existing.map(identity)),result=[];
 if(sheet.length>5001)throw new Error("La planilla admite hasta 5000 insumos");
 for(let index=1;index<sheet.length;index++){
  const cells=sheet[index].map(v=>String(v??"").trim());
  if(cells.every(v=>!v))continue;
  const get=name=>cells[header.indexOf(name)]||"";
  const row={row_number:index+1,code:get("codigo"),description:get("descripcion"),kind:kinds.get(normalizeKind(get("tipo")))||"",unit:get("unidad"),price:null,errors:[]};
  if(!row.description || row.description.length>500)row.errors.push("Descripción obligatoria, hasta 500 caracteres");
  if(!row.kind)row.errors.push("Tipo: MAT (Material), MO (Mano de obra), EQ (Equipo) o SC/SUB (Subcontrato)");
  if(!row.unit || row.unit.length>50)row.errors.push("Unidad obligatoria, hasta 50 caracteres");
  if(row.code.length>100)row.errors.push("Código: hasta 100 caracteres");
  if(row.code && codes.has(row.code.toLowerCase()))row.errors.push("El código ya existe o está repetido");
  if(!row.code && identities.has(identity(row)))row.errors.push("El insumo ya existe o está repetido");
  if(get("precio ars")){try{row.price=priceDecimal(get("precio ars"));}catch(error){row.errors.push(error.message);}}
  if(row.code)codes.add(row.code.toLowerCase());identities.add(identity(row));result.push(row);
 }
 if(!result.length)throw new Error("Agregá al menos un insumo debajo de los encabezados");
 return result;
}
export async function readResourceWorkbook(file, existing=[]) {
 if(file.size>10_000_000)throw new Error("El archivo admite hasta 10 MB");
 if(!/\.xlsx$/i.test(file.name))throw new Error("Seleccioná un archivo Excel .xlsx");
 return parseResourceRows(await parseExcel(await file.arrayBuffer()),existing);
}
export async function resourceTemplateBytes() {
 const {default:writeExcelFile}=await import("write-excel-file/universal");
 const instructions=[
  ["Cómo completar la plantilla"],
  ["Completá la primera hoja, Insumos. Una fila por insumo. No cambies los encabezados."],
  ["Descripción, Tipo y Unidad son obligatorios. Código y Precio ARS son opcionales."],
  ["Tipos: MAT o Material; MO o Mano de obra; EQ o Equipo; SC, SUB o Subcontrato. Se aceptan mayúsculas y minúsculas."],
  ["Código vacío: CPOBRAS asigna un código automático. No repitas insumos ni códigos existentes."],
  ["Precio vacío: se crea sin precio. El número 0 es un precio válido. Los precios son por unidad, en ARS."],
  ["Los precios se registran con la fecha que elijas al importar. No se modifican presupuestos ni precios anteriores."],
  ["No se importan estas instrucciones ni los ejemplos de abajo. Los precios de ejemplo se dejan vacíos."],
  ["Ejemplos: Descripción", "Tipo", "Unidad", "Precio ARS"],
  ["Cemento bolsa 50 kg", "Material", "bolsa", ""],
  ["Oficial albañil", "Mano de obra", "h", ""],
  ["Arena", "Material", "m³", ""],
 ];
 const cell=value=>({value:String(value),type:String});
 const blob=await writeExcelFile([
  {sheet:"Insumos",columns:[20,55,22,15,22].map(width=>({width})),data:[resourceHeaders.map(value=>({...cell(value),fontWeight:"bold",backgroundColor:"#DCEAF2"}))]},
  {sheet:"Instrucciones",columns:[{width:115},{width:22},{width:15},{width:22}],data:instructions.map(row=>row.map(cell))},
 ]).toBlob();
 return new Uint8Array(await blob.arrayBuffer());
}
