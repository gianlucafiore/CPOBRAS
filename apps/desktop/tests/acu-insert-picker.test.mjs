import test from 'node:test';
import assert from 'node:assert/strict';
import {createAcuInsertPicker} from '../src/components/acu-insert-picker.js';

test('ACU preview ignores late responses after choosing a different recipe or closing', async()=>{
 const pending=[];const state={modal:{kind:'from-acu'},analyses:[],resources:[]};let renders=0;
 const picker=createAcuInsertPicker({state,invoke:()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),render:()=>renders++,document:{querySelectorAll:()=>[]}});
 const first=picker.select('first'),second=picker.select('second');
 pending[1].resolve({description:'Second',components:[{quantity:'1'}]});await second;
 pending[0].resolve({description:'First',components:[{quantity:'2'}]});await first;
 assert.equal(state.modal.pickerId,'second');assert.equal(state.modal.pickerDetails.description,'Second');assert.equal(state.modal.pickerReady,true);
 const third=picker.select('third');state.modal=null;const count=renders;pending[2].reject(new Error('Closed'));await third;assert.equal(renders,count);
});

test('failed or empty ACU preview prevents insertion and displays its error',async()=>{
 const state={modal:{kind:'from-acu'},analyses:[],resources:[]};
 const picker=createAcuInsertPicker({state,invoke:async(_,args)=>{if(args.analysisId==='bad')throw new Error('No disponible');return {components:[]};},render:()=>{},document:{querySelectorAll:()=>[]}});
 await picker.select('empty');assert.equal(state.modal.pickerReady,false);
 await picker.select('bad');assert.equal(state.modal.pickerReady,false);assert.match(picker.markup(),/No disponible/);
});
