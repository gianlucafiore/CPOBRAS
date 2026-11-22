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
     line_id:target.line_id,components:[],missing_resources:[],
     requirement_coverage:target.required_resources.map(req=>({requirement_id:req.id,resource_id:'',unresolved_reason:'Falta consumo verificable'}))
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
  return {first,preview:review.preview,committed:result.committed,created:result.created,saved:result.saved,
   pending:result.pending,createIds:h.batches[0]?.creates.map(line=>line.id),
   createdSections:h.batches[0]?.creates.map(line=>line.section),
   acos:h.batches[0]?.acus.length||0,batchCount:h.batches.length,
   before,after:h.calls.filter(call=>call.name==='ai_chat').length,twice};
 });
 expect(info.first.committed).toBe(false);
 expect(info.preview.structureLines).toHaveLength(1);
 expect(info.committed).toBe(true);
 expect(info.created).toBe(1);
 expect(info.saved).toBe(0);
 expect(info.pending).toBe(1);
 expect(info.acos).toBe(0);
 expect(info.batchCount).toBe(1);
 expect(info.createdSections).toEqual(['Montaje y terminaciones']);
 expect(info.after).toBe(info.before);
 expect(info.twice).toBe(true);
});
