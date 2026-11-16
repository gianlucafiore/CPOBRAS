import test from 'node:test';
import assert from 'node:assert/strict';
import {budgetResourceTotals,materialNeedsFromTotals} from '../src/services/budget-resources.js';

test('resource totals multiply each line and sum shared recipes with exact budget prices',()=>{
 const lines=[{analysis_id:'acu',quantity:'2.5'},{analysis_id:'acu',quantity:'3'},{analysis_id:null,quantity:'99'}];
 const analyses=new Map([['acu',{components:[{resource_id:'r',description:'Anterior',kind:'labor',quantity:'0.2',unit_price:'999'}]}]]);
 const totals=budgetResourceTotals(lines,analyses,[{id:'r',description:'Arena',kind:'material',unit:'m³'}],{r:'100.01'});
 assert.deepEqual(totals,[{resource_id:'r',description:'Arena',kind:'material',unit:'m³',quantity:'1.10',total:'110.0110'}]);
});
test('missing resource prices remain unknown rather than becoming zero',()=>{
 const totals=budgetResourceTotals([{analysis_id:'a',quantity:'4'}],new Map([['a',{components:[{resource_id:'r',quantity:'2',kind:'material'}]}]]));
 assert.equal(totals[0].total,null);
});
test('quotation needs include omitted report materials and subtract consumed stock and outstanding purchases',()=>{
 const totals=[{resource_id:'r',kind:'material',description:'Acero',quantity:'100'},
  {resource_id:'missing',kind:'material',description:'Arena',quantity:'20'},
  {resource_id:'labor',kind:'labor',description:'Oficial',quantity:'30'}];
 const needs=materialNeedsFromTotals(totals,[{resource_id:'r',required:'10',stock:'10',consumed:'5',ordered:'40',received:'15'}]);
 assert.equal(needs.length,2);assert.equal(needs[0].required,'100');assert.equal(needs[0].shortage,'85');assert.equal(needs[0].suggested,'60');
 assert.equal(needs[1].suggested,'20');
 assert.equal(materialNeedsFromTotals([totals[0]],[{resource_id:'r',stock:'200'}])[0].suggested,'0');
});
