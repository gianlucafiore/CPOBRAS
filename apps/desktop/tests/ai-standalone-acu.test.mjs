import {test} from 'node:test';
import assert from 'node:assert/strict';
import {standaloneAcuIntent,standaloneAcuContext,parseStandaloneAcu,standaloneAcuWriteArgs} from '../src/services/ai-standalone-acu.js';
const yeso='10000000-0000-4000-8000-000000000001',labor='10000000-0000-4000-8000-000000000002';
const catalog={currency:'ARS',as_of:'2026-11-12',resources:[
 {id:yeso,code:'Y-01',description:'Yeso para enlucidos húmedos',kind:'material',unit:'kg',price:'1450',currency:'ARS'},
 {id:labor,code:'MO-01',description:'Mano de obra de aplicación de yeso por vía húmeda',kind:'labor',unit:'jornal',price:'72000',currency:'ARS'}
]};
const proposal={answer:'Propuesta para revisión',standalone_acu:{description:'Aplicación de yeso por vía húmeda',unit:'m²',
 components:[{resource_id:yeso,quantity:'4.5',quantity_unit:'kg',consumption_support:'Estimación por m²'},
  {resource_id:labor,quantity:'0.08',quantity_unit:'jornal',consumption_support:'Rendimiento estimado'}],
 missing_resources:[],assumptions:['Consumos indicativos sujetos a espesor']}};
test('standalone ACU request never targets a selected budget line',()=>{
 assert.equal(standaloneAcuIntent('Necesito crear un ACU de aplicación de yeso por vía húmeda'),true);
 assert.equal(standaloneAcuIntent('Generar ACU de la partida seleccionada'),false);
 assert.equal(standaloneAcuIntent('Crear una partida nueva con ACU'),false);
 assert.equal(standaloneAcuIntent('Actualizar ACU de las partidas'),false);
 const ctx=JSON.parse(standaloneAcuContext('Crear ACU aplicación de yeso por vía húmeda',catalog));
 assert.equal(ctx.task,'standalone_acu');
 assert.equal(ctx.access,'review_only');
 assert.equal(ctx.catalog.length,2);
 assert.equal(ctx.catalog.some(r=>r.id===labor),true);
});
test('price comes from verified catalog, never AI, automatic code and no budget target',()=>{
 const source=JSON.stringify({...proposal,standalone_acu:{...proposal.standalone_acu,
  components:proposal.standalone_acu.components.map(c=>({...c,unit_price:'0'}))}});
 const result=parseStandaloneAcu(source,'Crear ACU aplicación de yeso por vía húmeda',catalog);
 assert.equal(result.ready,true);assert.equal(result.items.length,2);
 assert.equal(result.items[0].unitPrice,'1450');
 assert.equal(result.items[1].kind,'labor');
 assert.equal(result.pending.length,0);
 assert.deepEqual(standaloneAcuWriteArgs(result),{code:'',description:'Aplicación de yeso por vía húmeda',unit:'m²',
  components:[{resourceId:yeso,quantity:'4.5',unitPrice:'1450'},{resourceId:labor,quantity:'0.08',unitPrice:'72000'}]});
});
test('unknown IDs, mismatched units and unpriced resources never become executable components',()=>{
 const malicious={...proposal,standalone_acu:{...proposal.standalone_acu,components:[
  {resource_id:'10000000-0000-4000-8000-000000000003',quantity:'50',quantity_unit:'kg'},
  {resource_id:yeso,quantity:'15',quantity_unit:'bolsas'},
  {resource_id:labor,quantity:'0.2',quantity_unit:'jornal'}],missing_resources:['Agua pendiente de confirmar']}};
 const result=parseStandaloneAcu(JSON.stringify(malicious),'Crear ACU de aplicación de yeso',catalog);
 assert.equal(result.items.length,1);
 assert.equal(result.pending.some(s=>s.includes('Unidad incompatible')),true);
 assert.equal(result.pending.some(s=>s.includes('no verificado')),true);
 assert.ok(result.pending.includes('Agua pendiente de confirmar'));
 const unpriced={...catalog,resources:catalog.resources.map(r=>r.id===labor?{...r,price:null}:r)};
 const restricted=parseStandaloneAcu(JSON.stringify(proposal),'Crear ACU aplicación de yeso por vía húmeda',unpriced);
 assert.equal(restricted.items.length,1);
 assert.equal(restricted.pending.some(s=>s.includes('Sin precio')),true);
});
test('no verbal response or all-invalid proposal can be approved as saved',()=>{
 assert.throws(()=>parseStandaloneAcu('Preparé un ACU listo para revisión','Crear ACU aplicación de yeso',catalog),/no preparó una composición/);
 const without={...proposal,standalone_acu:{...proposal.standalone_acu,components:[]}};
 const p=parseStandaloneAcu(JSON.stringify(without),'Crear ACU aplicación de yeso por vía húmeda',catalog);
 assert.equal(p.ready,false);
 assert.throws(()=>standaloneAcuWriteArgs(p),/No hay insumos/);
});

test('duplicating an ACU uses the native creation form without inheriting ID or code',async()=>{
 const {createActions}=await import('../src/controllers/actions.js');
 const source={id:'original-acu',code:'ACU-0001',description:'Zapatas corridas',unit:'m³'};
 const modal=[];
 const handler=createActions({
  invoke:async(name,args)=>{
   assert.equal(name,'get_analysis_details');
   assert.deepEqual(args,{analysisId:'original-acu'});
   return {is_line_owned:false,components:[{resource_id:yeso,quantity:'2',unit_price:'950'}]};
  },
  state:{analyses:[source],remoteProject:null},
  openModal:(kind,record)=>modal.push({kind,record}),
  window:{confirm:()=>true}
 });
 await handler.act({dataset:{action:'duplicate-analysis',id:'original-acu'}});
 assert.equal(modal.length,1);
 assert.equal(modal[0].kind,'analysis');
 assert.equal(modal[0].record.code,'');
 assert.equal(modal[0].record.id,undefined);
 assert.equal(modal[0].record.description,'Zapatas corridas · Variante');
 assert.equal(modal[0].record.components[0].quantity,'2');
 assert.equal(source.code,'ACU-0001');
});
