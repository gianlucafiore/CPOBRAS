import test from 'node:test';
import assert from 'node:assert/strict';
import {priceExportRows,exportPriceDetermination} from '../src/services/price-export.js';
import {exportExcel,exportPdf} from '../src/services/exchange.js';
const fixture=()=>({currency:'ARS',title:'Obra',definition:{rows:[{id:'row',label:'Administración',kind:'detailed',enabled:true,detail_mode:'items',reference_percent:'10',items:[{id:'group',parent_id:null,group:true,description:'Personal'},{id:'item',parent_id:'group',group:false,description:'=RIESGO()',unit:'mes',participation_percent:'100',quantity:'1',unit_price:'9007199254740993.01'}]}]},calculation:{breakdown:{direct:'100',total:'9007199254741093.01'},rows:[{id:'row',base:'0',amount:'9007199254740993.01',detail_total:'9007199254740993.01',reference_total:'10',item_totals:{group:'9007199254740993.01',item:'9007199254740993.01'}}]}});
test('determination exports preserve decimal digits, hierarchy and explicit final total',async()=>{
 const data=fixture();const rows=priceExportRows(data);assert.equal(rows.at(-1)[4],'9007199254741093.01');assert.equal(rows.filter(r=>r[0]==='PRESUPUESTO TOTAL').length,1);assert.ok(rows.some(r=>r[0]==='  =RIESGO() (mes)'&&r[4]==='9007199254740993.01'));
 const invoke=async(_,args)=>args;
 const csv=await exportPriceDetermination({...data,invoke,format:'csv'});assert.match(new TextDecoder().decode(new Uint8Array(csv.bytes)),/9007199254740993.01/);
 const xlsx=await exportPriceDetermination({...data,invoke,format:'xlsx'});assert.equal(xlsx.bytes[0],0x50);
 const json=await exportPriceDetermination({...data,invoke,format:'json',rowId:'row'});assert.equal(JSON.parse(new TextDecoder().decode(new Uint8Array(json.bytes))).definition.rows.length,1);
 const pdf=await exportPriceDetermination({...data,invoke,format:'pdf'});assert.match(new TextDecoder().decode(new Uint8Array(pdf.bytes)),/9007199254741093.01/);
});
test('budget PDF and Excel include named custom concepts and authoritative total',async()=>{
 const data=fixture(),document={title:'Obra',currency:'Ars',sections:[],assignments:[],lines:[],takeoffs:[]};const totals={...data.calculation.breakdown,rows:data.calculation.rows.map(row=>({...row,label:'Administración especial',enabled:true}))};
 const pdf=await exportPdf(document,{totals});assert.match(new TextDecoder().decode(pdf),/especial/);
 const bytes=await exportExcel(document,totals);const {default:readWorkbook}=await import('read-excel-file/universal');const sheets=await readWorkbook(new Blob([bytes]));const rows=sheets.find(s=>s.sheet==='Determinación de precio').data;assert.equal(rows.at(-1)[1],'9007199254741093.01');assert.equal(rows[2][0],'Administración especial');
});
