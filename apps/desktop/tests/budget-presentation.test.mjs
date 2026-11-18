import test from 'node:test';
import assert from 'node:assert/strict';
import {createBudgetPresentation} from '../src/services/budget-presentation.js';

function fixture() {
 const records=new Map(), drafts=new Map(), calls=[];
 let reject=false, hold=null;
 const state={estimateId:'budget-a',database:{path:'/db/main.sqlite'}};
 const invoke=async(command,args)=>{
  calls.push({command,args:structuredClone(args)});
  if(command==='get_budget_presentation')return structuredClone(records.get(args.estimateId)||{revision:0,data:{memory:'',print_options:{}}});
  if(reject)throw Error('Disco no disponible');
  if(hold){const wait=hold;hold=null;await wait;}
  const previous=records.get(args.estimateId)||{revision:0};
  if(previous.revision!==args.revision)throw Error('La presentación cambió');
  const result={revision:previous.revision+1,data:structuredClone(args.data)};
  records.set(args.estimateId,result);return structuredClone(result);
 };
 const window={localStorage:{getItem:k=>drafts.get(k)||null,setItem:(k,v)=>drafts.set(k,v),removeItem:k=>drafts.delete(k)}};
 const presentation=createBudgetPresentation({invoke,state,window,document:{querySelectorAll:()=>[]},editable:()=>true});
 return {presentation,state,records,drafts,calls,fail:v=>reject=v,hold:v=>hold=v};
}

test('presentation serializes edits made during an in-flight save',async()=>{
 const f=fixture();await f.presentation.open();let release;
 f.hold(new Promise(resolve=>release=resolve));f.presentation.update({memory:'Primero'});
 const saving=f.presentation.flush();f.presentation.update({memory:'Segundo',print_options:{title:'Oferta'}});release();await saving;
 assert.equal(f.records.get('budget-a').revision,2);
 assert.equal(f.records.get('budget-a').data.memory,'Segundo');
 assert.deepEqual(f.calls.filter(c=>c.command==='save_budget_presentation').map(c=>c.args.revision),[0,1]);
 assert.equal(f.drafts.size,0);
});

test('failed presentation save retains the journal and retries the complete draft',async()=>{
 const f=fixture();await f.presentation.open();f.presentation.update({memory:'Conservar'});f.fail(true);
 await assert.rejects(f.presentation.flush(),/Disco/);assert.equal(f.drafts.size,1);assert.equal(f.presentation.model.data.memory,'Conservar');
 f.fail(false);await f.presentation.flush();assert.equal(f.records.get('budget-a').data.memory,'Conservar');assert.equal(f.drafts.size,0);
});

test('switching budgets flushes the previous draft and restores each presentation',async()=>{
 const f=fixture();await f.presentation.open();f.presentation.update({memory:'Obra A',print_options:{notes:'Condiciones A'}});
 f.state.estimateId='budget-b';await f.presentation.open();assert.equal(f.records.get('budget-a').data.memory,'Obra A');
 f.presentation.update({memory:'Obra B'});f.state.estimateId='budget-a';await f.presentation.open();
 assert.equal(f.presentation.model.data.memory,'Obra A');assert.equal(f.presentation.model.data.print_options.notes,'Condiciones A');assert.equal(f.records.get('budget-b').data.memory,'Obra B');
});

test('presentation revision conflicts preserve both versions until explicitly resolved',async()=>{
 const f=fixture();await f.presentation.open();f.presentation.update({memory:'Mi borrador'});
 f.records.set('budget-a',{revision:1,data:{memory:'Otra edición',print_options:{}}});
 await assert.rejects(f.presentation.flush(),/presentación cambió/);assert.equal(f.presentation.model.conflict,true);assert.equal(f.presentation.model.data.memory,'Mi borrador');
 await f.presentation.resolve(true);assert.equal(f.records.get('budget-a').data.memory,'Mi borrador');assert.equal(f.records.get('budget-a').revision,2);
});
