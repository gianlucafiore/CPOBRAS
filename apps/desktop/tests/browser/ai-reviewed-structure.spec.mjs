import {test,expect} from '@playwright/test';

test('approved structural draft is saved once without re-querying when ACU is pending, and exclusions affect native batch',async({page})=>{
 const source=String.raw`
 import './style.css';
 import {createAcuWorkbench} from './components/ai-acu-workbench.js';
 const projectId='a2000000-0000-4000-8000-000000000001';
 const estimateId='a2000000-0000-4000-8000-000000000002';
 const material='a2000000-0000-4000-8000-000000000003';
 const state={view:'workspace',projectId,estimateId,projects:[{id:projectId,currency:'ARS'}],
  estimates:[{id:estimateId,title:'Borrador',issued:false}],lines:[],sections:[],
  selectedLineId:null,panel:'summary',search:''};
 const resources=[{id:material,description:'Material para montaje',code:'MAT',unit:'kg',kind:'material',price:'100'}];
 const calls=[],batches=[];
 const invoke=async(name,args={})=>{
  calls.push({name,args});
  if(name==='assisted_acu_context')return {currency:'ARS',resources,lines:state.lines,sections:state.sections};
  if(name==='assisted_acu_references')return [];
  if(name==='ai_chat'){
   if(args.mode==='plan')return {text:JSON.stringify({work_sections:[{title:'Montaje y terminaciones',partidas:[
    {description:'Armado y fijación de soporte',unit:'kg',quantity:'30',
     work_result:'Estructura montada',resources:[{name:'Material para montaje',kind:'material',unit:'kg'}]},
    {description:'Colocación de revestimiento',unit:'m²',quantity:null,
     work_result:'Revestimiento colocado',resources:[{name:'Material de revestimiento',kind:'material',unit:'m²'}]}
   ]}]})};
   if(args.mode==='acu'){
    const context=JSON.parse(args.context);
    return {text:JSON.stringify({acu_proposals:context.targets.map(target=>({
     line_id:target.line_id,
     components:state.lines.length?[{resource_id:material,quantity:'1',quantity_unit:'kg'}]:[],
     missing_resources:[],
     requirement_coverage:target.required_resources.map(req=>({
      requirement_id:req.id,resource_id:state.lines.length?material:'',
      unresolved_reason:state.lines.length?'':'Falta consumo verificable'
     }))
    }))})};
   }
  }
  if(name==='apply_reviewed_budget_batch'){
   const batch=structuredClone(args.batch);
   batches.push(batch);
   for(const created of batch.creates)state.lines.push({...created,components:[],analysis_id:null});
   return {created:batch.creates.length,composed:batch.acus.length,updated:0,deleted:0};
  }
  throw Error('Unexpected command '+name);
 };
 const wb=createAcuWorkbench({invoke,state,document,window,loadEstimate:async()=>{},
  loadEstimates:async()=>{},openEstimate:async()=>{},canUseAi:()=>true});
 window.__structHarness={wb,state,calls,batches,ready:true};
 `;
 await page.route('**/src/main.js*',route=>route.fulfill({contentType:'application/javascript',body:source}));
 await page.goto('/');
 await page.waitForFunction(()=>window.__structHarness?.ready);
 const info=await page.evaluate(async()=>{
  const h=window.__structHarness;
  const first=await h.wb.runApproved({mode:'create',brief:'Preparar un soporte y su revestimiento'},{previewOnly:true});
  const tree=h.wb.getReviewTree(),lines=tree.flatMap(section=>section.lines);
  if(lines.length!==2)throw Error('No se recibieron las dos partidas');
  const before=h.calls.filter(call=>call.name==='ai_chat').length;
  h.wb.setReviewExclusion(lines[1].id,null,true);
  const review=h.wb.preparePendingPreview();
  if(!review.previewReady)throw Error('No se preparó un lote con las partidas nuevas');
  const result=await h.wb.commitPrepared(review.preview.id);
  let twice=false;
  try{await h.wb.commitPrepared(review.preview.id);}catch{twice=true;}
  const after=h.calls.filter(call=>call.name==='ai_chat').length;
  // The same user-requested ACU is now completed on an existing persisted
  // line. This must not issue a second CREATE or lose its expected resources.
  const continued=await h.wb.regeneratePending();
  const next=h.wb.preparePendingPreview();
  if(!next.previewReady)throw Error('Pending draft did not resume against existing line IDs: '+next.error);
  if(next.preview.structureLines?.length)throw Error('Resuming ACU tried to recreate a work line');
  const second=await h.wb.commitPrepared(next.preview.id);
  return {continued,second,secondCreates:h.batches[1]?.creates.length,
   secondComposed:h.batches[1]?.acus.length,afterSecond:h.calls.filter(call=>call.name==='ai_chat').length,
   first,preview:review.preview,committed:result.committed,created:result.created,saved:result.saved,
   pending:result.pending,createIds:h.batches[0]?.creates.map(line=>line.id),
   createdSections:h.batches[0]?.creates.map(line=>line.section),
   acos:h.batches[0]?.acus.length||0,batchCount:h.batches.length,
   before,after,twice};
 });
 expect(info.first.committed).toBe(false);
 expect(info.preview.structureLines).toHaveLength(1);
 expect(info.committed).toBe(true);
 expect(info.created).toBe(1);
 expect(info.saved).toBe(0);
 expect(info.pending).toBe(1);
 expect(info.acos).toBe(0);
 expect(info.batchCount).toBe(2);
 expect(info.createdSections).toEqual(['Montaje y terminaciones']);
 expect(info.after).toBe(info.before);
 expect(info.twice).toBe(true);
 expect(info.continued.prepared).toBe(1);
 expect(info.second.committed).toBe(true);
 expect(info.second.created).toBe(0);
 expect(info.second.saved).toBe(1);
 expect(info.secondCreates).toBe(0);
 expect(info.secondComposed).toBe(1);
 expect(info.afterSecond).toBe(info.before+1);
});

test('after a reload, ACU recovery reads saved lines and fills only eligible existing targets',async({page})=>{
 const source=String.raw`
 import {createAcuWorkbench} from './components/ai-acu-workbench.js';
 const estimateId='saved-estimate',projectId='saved-project';
 const line=(id,components=[])=>({id,description:'Montaje '+id,unit:'kg',quantity:'42',unit_cost:'100',
  components,section_id:null,section:'',analysis_id:components.length?'existing-analysis':null,
  expected_recipe:components.length?'existing-recipe':null,takeoffs:[],formula:null});
 const resources=[{id:'mat',code:'MAT',description:'Material para montaje',unit:'kg',kind:'material',price:'100'}];
 const state={view:'workspace',projectId,estimateId,projects:[{id:projectId}],
  estimates:[{id:estimateId,title:'Presupuesto existente'}],lines:[]};
 const calls=[],batches=[];
 const invoke=async(name,args={})=>{
  if(name==='assisted_acu_context'){
   if(args.estimateId!==estimateId||args.projectId!==projectId)throw Error('Wrong budget scope');
   return {currency:'ARS',resources,sections:[],lines:JSON.parse(localStorage.getItem('test-budget'))};
  }
  if(name==='ai_chat'){
   const {targets}=JSON.parse(args.context);
   calls.push({mode:args.mode,ids:targets.map(target=>target.line_id)});
   return {text:JSON.stringify({acu_proposals:targets.map(target=>({
    line_id:target.line_id,components:[{resource_id:'mat',quantity:'1',quantity_unit:'kg'}],
    section:'Rubro inventado',measurements:[{note:'Medición',factor:'1',length:'1',width:'1',height:'1',sign:1}]
   }))})};
  }
  if(name==='apply_reviewed_budget_batch'){
   const batch=structuredClone(args.batch);
   batches.push(batch);
   const lines=JSON.parse(localStorage.getItem('test-budget'));
   for(const acu of batch.acus)lines.find(line=>line.id===acu.line_id).components=acu.components;
   localStorage.setItem('test-budget',JSON.stringify(lines));
   return {created:batch.creates.length,composed:batch.acus.length,updated:0,deleted:0};
  }
  throw Error('Unexpected command '+name);
 };
 const wb=createAcuWorkbench({invoke,state,document,window,loadEstimate:async()=>{},
  loadEstimates:async()=>{},openEstimate:async()=>{},canUseAi:()=>true});
 window.recovery={wb,calls,batches,seed:()=>localStorage.setItem('test-budget',JSON.stringify([
  line('missing'),line('unselected'),line('composed',[{resource_id:'mat',quantity:'7'}])
 ]))};
 `;
 await page.route('**/src/main.js*',route=>route.fulfill({contentType:'application/javascript',body:source}));
 await page.goto('/');
 await page.waitForFunction(()=>window.recovery);
 await page.evaluate(()=>window.recovery.seed());

 await page.reload();
 await page.waitForFunction(()=>window.recovery);
 const result=await page.evaluate(async()=>{
  const {wb,calls,batches}=window.recovery;
  const recovered=await wb.regeneratePending({mode:'fill',lineIds:['missing','composed']});
  const review=wb.preparePendingPreview();
  if(!review.previewReady)throw Error(review.error);
  const writesBeforeApproval=batches.length;
  await wb.commitPrepared(review.preview.id);
  const persisted=JSON.parse(localStorage.getItem('test-budget'));
  return {recovered,writesBeforeApproval,calls,batches,persisted};
 });
 expect(result.recovered.prepared).toBe(1);
 expect(result.writesBeforeApproval).toBe(0);
 expect(result.calls).toEqual([{mode:'acu',ids:['missing']}]);
 expect(result.batches).toHaveLength(1);
 expect(result.batches[0]).toMatchObject({creates:[],updates:[],deletes:[],acus:[
  {line_id:'missing',measurements:null,section_id:null,section_title:'',expected:{quantity:'42'}}
 ]});
 expect(result.persisted.map(line=>[line.id,line.quantity])).toEqual([['missing','42'],['unselected','42'],['composed','42']]);
 expect(result.persisted[2].components).toEqual([{resource_id:'mat',quantity:'7'}]);

 await page.reload();
 await page.waitForFunction(()=>window.recovery);
 const remaining=await page.evaluate(async()=>{
  const {wb,calls,batches}=window.recovery;
  const recovered=await wb.regeneratePending();
  const review=wb.preparePendingPreview();
  if(!review.previewReady)throw Error(review.error);
  await wb.commitPrepared(review.preview.id);
  return {recovered,calls,batches};
 });
 expect(remaining.recovered.prepared).toBe(1);
 expect(remaining.calls).toEqual([{mode:'acu',ids:['unselected']}]);
 expect(remaining.batches[0].acus).toMatchObject([{line_id:'unselected'}]);

 await page.reload();
 await page.waitForFunction(()=>window.recovery);
 const empty=await page.evaluate(async()=>{
  const {wb,calls,batches}=window.recovery;
  return {result:await wb.regeneratePending(),calls,batches};
 });
 expect(empty.result).toMatchObject({prepared:0,pending:0,noTargets:true,committed:false});
 expect(empty.result.message).toContain('0 propuestas');
 expect(empty.calls).toEqual([]);
 expect(empty.batches).toEqual([]);
});
