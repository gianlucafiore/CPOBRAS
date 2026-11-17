import test from 'node:test';
import assert from 'node:assert/strict';
import {recentCash,cashReferences,createHomeCash} from '../src/components/home-cash.js';

test('recent cash excludes invoices and separates actual inflows from outflows without mixing currencies',()=>{
 const rows=Array.from({length:12},(_,i)=>({id:String(i),date:`2026-11-${String(i+1).padStart(2,'0')}`,number:String(i),kind:'direct_payment',currency:i%2?'USD':'ARS',amount:'12.34'}));
 rows.push({id:'invoice',date:'2099-01-01',kind:'payable'},{id:'income',date:'2026-11-10',kind:'collection',amount:'99'});
 assert.equal(recentCash(rows,'expense').length,8);assert.equal(recentCash(rows,'expense')[0].id,'11');assert.deepEqual(recentCash(rows,'income').map(r=>r.id),['income']);
});
test('origin documents match project, budget and currency and exclude invoices already substituted by billing',()=>{
 const target={id:'budget',projectId:'project',currency:'ARS'},base={project_id:'project',estimate_id:'budget',currency:'ARS',kind:'certificate',amount:'10'};
 const rows=[{...base,id:'yes'},{...base,id:'billed'},{...base,id:'other-project',project_id:'else'},{...base,id:'other-budget',estimate_id:'else'},{...base,id:'usd',currency:'USD'},{...base,id:'bill',kind:'receivable',reference_id:'billed'}];
 assert.deepEqual(cashReferences(rows,target,'collection').map(r=>r.id),['yes','bill']);assert.deepEqual(cashReferences(rows,target,'direct_payment'),[]);
});
test('home cash ignores a late response after switching databases and reloads the new scope',async()=>{
 let resolve;const state={database:{scope:'old'},projects:[],view:'projects',projectId:null};
 const home=createHomeCash({state,invoke:()=>new Promise(r=>resolve=r),render:()=>{}});
 home.markup();home.afterRender();state.database.scope='new';home.markup();resolve([]);await new Promise(r=>setImmediate(r));assert.equal(home.model.loaded,false);assert.equal(home.model.rows.length,0);assert.equal(home.model.scope,'new');assert.equal(home.model.wasHome,false);
});

test('fully paid documents disappear from quick collection choices using exact decimal sums',()=>{
 const t={id:'b',projectId:'p',currency:'ARS'},source={id:'source',project_id:'p',estimate_id:'b',currency:'ARS',kind:'receivable',amount:'0.3'};
 const partial={id:'partial',kind:'collection',reference_id:'source',currency:'ARS',amount:'0.1'};
 assert.equal(cashReferences([source,partial],t,'collection').length,1);
 assert.equal(cashReferences([source,partial,{...partial,id:'last',amount:'0.2'}],t,'collection').length,0);
});

test('a background home refresh does not rerender an unfinished project dialog',async()=>{
 let resolve,renders=0;const state={database:{scope:'local'},projects:[],view:'projects',projectId:null};
 const home=createHomeCash({state,invoke:()=>new Promise(r=>resolve=r),render:()=>renders++});home.markup();home.afterRender();state.modal={kind:'project'};state.modalDirty=true;resolve([]);await new Promise(r=>setImmediate(r));assert.equal(home.model.loaded,true);assert.equal(renders,0);
});
