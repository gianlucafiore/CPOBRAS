import test from 'node:test';
import assert from 'node:assert/strict';
import {createPriceAutosave} from '../src/services/price-autosave.js';
function setup(invoke){
 const data=new Map(),m={definition:{rows:[]},revision:0,dirty:false},state={database:{path:'/db/a.sqlite'}};
 const window={setTimeout:()=>1,clearTimeout:()=>{},addEventListener:()=>{},localStorage:{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}};
 const api=createPriceAutosave({state,model:m,invoke,window});api.bind({revision:0,definition:m.definition},'budget',true);return {api,m,state,data,window};
}
test('autosave serializes in-flight edits without losing the last value or using a stale revision',async()=>{
 const pending=[],calls=[];
 const s=setup((name,args)=>new Promise(resolve=>{calls.push(args);pending.push(resolve);}));
 s.m.definition.rows=[{amount:'10'}];s.api.changed();const done=s.api.flush();s.m.definition.rows[0].amount='20';s.api.changed();
 pending[0]({revision:1,calculation:{breakdown:{total:'10'}},direct:'0'});await new Promise(r=>setImmediate(r));
 assert.equal(calls.length,2);assert.equal(calls[1].revision,1);assert.equal(calls[0].definition.rows[0].amount,'10');assert.equal(calls[1].definition.rows[0].amount,'20');
 pending[1]({revision:2,calculation:{breakdown:{total:'20'}},direct:'0'});await done;assert.equal(s.m.dirty,false);assert.equal(s.data.size,0);
});
test('failed autosave keeps a recoverable draft, retries explicitly, and is scoped by database path',async()=>{
 let fail=true;const s=setup(async()=>{if(fail)throw Error('Base no disponible');return {revision:1,calculation:{breakdown:{total:'30'}},direct:'0'};});
 s.m.definition.rows=[{amount:'30'}];s.api.changed();await assert.rejects(s.api.flush(),/Base no disponible/);assert.equal(s.m.dirty,true);assert.equal(s.m.saveStatus,'error');assert.equal(s.data.size,1);
 const restored={definition:{rows:[]},revision:0,dirty:false};const api=createPriceAutosave({state:s.state,model:restored,invoke:async()=>{},window:s.window});api.bind({revision:0,definition:{rows:[]}},'budget',true);assert.equal(restored.definition.rows[0].amount,'30');
 const other={definition:{rows:[]},revision:0};createPriceAutosave({state:{database:{path:'/db/b.sqlite'}},model:other,invoke:async()=>{},window:s.window}).bind({revision:0},'budget',true);assert.equal(other.definition.rows.length,0);
 fail=false;await s.api.flush();assert.equal(s.m.dirty,false);assert.equal(s.data.size,0);
});
test('recovery refuses to overwrite a newer database revision',()=>{
 const s=setup(async()=>{});s.m.definition.rows=[{amount:'30'}];s.api.changed();const m={definition:{rows:[]},revision:3};
 const api=createPriceAutosave({state:s.state,model:m,invoke:async()=>assert.fail('must not overwrite'),window:s.window});api.bind({revision:3,definition:{rows:[]}},'budget',true);assert.equal(m.saveStatus,'conflict');assert.equal(m.definition.rows.length,0);assert.ok(m.recoveryDraft);
});
