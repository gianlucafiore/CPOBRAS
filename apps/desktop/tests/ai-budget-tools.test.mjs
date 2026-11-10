import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateTakeoff,parseBudgetToolCall,auditBudget,formatEstimateComparison,executeBudgetTool,budgetPreparationRequest} from '../src/services/ai-budget-tools.js';
import {parseAiReply,acuChatRequest} from '../src/services/ai-assistant.js';
import {parseSectionToolArgs,prepareSectionEdits} from '../src/services/ai-budget-sections.js';

test('natural-language model intent becomes a typed 3.84 m³ geometric quantity',()=>{
 const args={shape:'rectangular_prism',dimension_unit:'cm',count:'12',length:'80',width:'80',height:'50',description:'zapatas'};
 const parsed=parseAiReply(JSON.stringify({answer:'Calculo el volumen de las zapatas',tool_call:{name:'calculate_takeoff',args}}));
 assert.equal(parsed.proposal,null);
 assert.equal(parsed.toolCall.name,'calculate_takeoff');
 const result=calculateTakeoff(parsed.toolCall.args);
 assert.equal(result.data.quantity,'3.84');
 assert.deepEqual(result.data.dimensions_m,['0.8','0.8','0.5']);
 assert.match(result.answer,/3,84 m³/);
 const withWaste=calculateTakeoff({...args,waste_percent:'10'});
 assert.equal(withWaste.data.with_waste,'4.224');
 assert.equal(calculateTakeoff({shape:'rectangle',dimension_unit:'m',count:'1',length:'10',width:'5'}).data.quantity,'50');
});
test('model tools are allowlisted, read-only, bounded and reject malformed dimensions',()=>{
 assert.equal(parseBudgetToolCall({name:'delete_budget',args:{sql:'DELETE FROM estimates'}}),null);
 assert.equal(parseBudgetToolCall({name:'calculate_takeoff',args:{shape:'rectangular_prism',dimension_unit:'cm',count:'12',length:'80',width:'80'}}),null);
 assert.equal(parseBudgetToolCall({name:'compare_estimates',args:{baseline_id:3}}),null);
 assert.equal(parseAiReply(JSON.stringify({answer:'Hecho',tool_call:{name:'delete_budget',args:{}}})).actionError!=null,true);
 assert.throws(()=>calculateTakeoff({shape:'rectangular_prism',dimension_unit:'cm',count:'12',length:'80',width:'80',height:'-50'}),/cantidad positiva/);
 assert.throws(()=>calculateTakeoff({shape:'rectangle',dimension_unit:'m',count:'1',length:'4',width:'4',waste_percent:'500'}),/Desperdicio/);
});
test('audit counts lines without ACU, costs, old catalog data and missing components without inventing prices',()=>{
 const lines=[
  {id:'1',description:'Replanteo',quantity:'30',unit_cost:'0',analysis_id:null,components:[]},
  {id:'2',description:'Revestimiento',quantity:'35',unit_cost:'30',analysis_id:'a',components:[{resource_id:'tile',quantity:'1'},{resource_id:'grout',quantity:'0'}]},
  {id:'3',description:'Excavación',quantity:'8',unit_cost:'100',analysis_id:'b',components:[{resource_id:'unknown',quantity:'1'}]}
 ];
 const resources=[
  {id:'tile',description:'Porcelanato',unit:'m2',kind:'material',price:'100',effective_date:'2024-01-01'},
  {id:'grout',description:'Pastina',unit:'kg',kind:'material',price:null}
 ];
 const result=auditBudget({lines,resources,asOf:'2026-11-10',estimateTitle:'Obra 1'});
 assert.equal(result.data.totals.without_acu,1);
 assert.equal(result.data.totals.zero_cost,1);
 assert.equal(result.data.totals.component_issues,3);
 assert.equal(result.data.totals.older_price,1);
 assert.match(result.answer,/Replanteo/);
 assert.match(result.answer,/puede ser intencional/);
});
test('cost comparison uses only authoritative estimate deltas',()=>{
 const result=formatEstimateComparison({baseline:{title:'Rev 1'},revisedTitle:'Rev 2',
 comparison:{baseline_id:'x',revised_id:'y',baseline_total:'1000',revised_total:'1300',difference:'300',lines:[{description:'Fundaciones',baseline_cost:'200',revised_cost:'500',difference:'300'}]}});
 assert.match(result.answer,/Rev 1/);
 assert.match(result.answer,/1.000,00/);
 assert.match(result.answer,/Fundaciones/);
});
test('tool bridge runs only native read calls; no write APIs used',async()=>{
 const state={projectId:'p',estimateId:'current',remoteProject:false,
  estimates:[{id:'current',title:'Rev 2'},{id:'base',title:'Rev 1'}],
  lines:[{id:'r',description:'Revestimiento',unit:'m2',quantity:'35',unit_cost:'1',analysis_id:null,components:[]}]};
 const names=[],invoke=async(name,args)=>{
  names.push(name);
  if(name==='ai_catalog_context')return {currency:'ARS',resources:[{id:'tile',description:'Porcelanato 60x60',unit:'m²',kind:'material',price:'1000',price_source:'catálogo',effective_date:'2026-11-01'}]};
  if(name==='list_project_estimates')return state.estimates;
  if(name==='compare_estimates')return {baseline_id:args.baselineId,revised_id:args.revisedId,baseline_total:'1000',revised_total:'1200',difference:'200',lines:[]};
  throw Error('Unsupported '+name);
 };
 const toolArgs={invoke,state,today:'2026-11-10'};
 const qty=await executeBudgetTool({name:'calculate_takeoff',args:{shape:'rectangular_prism',dimension_unit:'cm',count:'12',length:'80',width:'80',height:'50'}},toolArgs);
 assert.equal(qty.data.quantity,'3.84');
 const audit=await executeBudgetTool({name:'audit_budget',args:{}},toolArgs);
 assert.equal(audit.data.totals.without_acu,1);
 const search=await executeBudgetTool({name:'search_catalog',args:{query:'porcelanato'}},toolArgs);
 assert.match(search.answer,/Porcelanato/);
 const compare=await executeBudgetTool({name:'compare_estimates',args:{baseline_id:'base'}},toolArgs);
 assert.match(compare.answer,/Rev 1/);
 assert.deepEqual(names,['ai_catalog_context','ai_catalog_context','list_project_estimates','compare_estimates']);
 assert.equal(names.some(name=>/apply|save|update|create|delete/.test(name)),false);
});
test('a 120 m² building can be proposed by the model as reviewable lines without invented prices',()=>{
 const reply=JSON.stringify({answer:'Preparo un antepresupuesto por rubros',proposal_lines:[
  {description:'Contrapiso y pisos',unit:'m2',quantity:'120',unit_price:null,section:'Pisos'},
  {description:'Fundaciones',unit:'m3',quantity:null,unit_price:null,section:'Estructuras'}
 ]});
 const parsed=parseAiReply(reply);
 assert.equal(parsed.planRows.length,2);
 assert.equal(parsed.planRows[0].quantity,'120');
 assert.equal(parsed.planRows[1].quantity,null);
 assert.equal(parsed.planRows.every(r=>r.unit_price==null),true);
});

test('model can prepare budgets and existing ACU via the same typed tool interface, but cannot choose foreign targets',()=>{
 const state={projectId:'p',estimateId:'e',remoteProject:false,
  estimates:[{id:'e',issued:false}],selectedLineId:'other',
  lines:[{id:'bathroom',description:'Revestimiento de baños',analysis_id:'old',components:[{resource_id:'tile',quantity:'1'}]},
         {id:'other',description:'Pintura',components:[],analysis_id:null}]};
 const budget=parseAiReply(JSON.stringify({answer:'Preparo un presupuesto',tool_call:{name:'prepare_budget',args:{brief:'Vivienda de 120 m² de construcción tradicional'}}}));
 assert.deepEqual(budgetPreparationRequest(budget.toolCall,{state}),{mode:'create',brief:'Vivienda de 120 m² de construcción tradicional',lineIds:[]});
 const acu=parseAiReply(JSON.stringify({answer:'Busco adhesivo',tool_call:{name:'prepare_acu',args:{brief:'Agregá adhesivo y pastina al revestimiento',scope:'selected'}}}));
 assert.deepEqual(budgetPreparationRequest(acu.toolCall,{state,focusedLineId:'bathroom'}),{mode:'fill',operation:'append',brief:'Agregá adhesivo y pastina al revestimiento',lineIds:['bathroom']});
 assert.throws(()=>budgetPreparationRequest({name:'prepare_acu',args:{brief:'Completá',scope:'all_missing'}},{state,userQuestion:'completá esta partida'}),/explícitamente/);
 assert.deepEqual(budgetPreparationRequest({name:'prepare_acu',args:{brief:'Completá todas las partidas vacías',scope:'all_missing'}},{state,userQuestion:'Completá todas las partidas sin ACU'}).lineIds,['other']);
 assert.equal(parseBudgetToolCall({name:'prepare_acu',args:{brief:'Agregá insumos',scope:'delete_all'}}),null);
 assert.equal(parseBudgetToolCall({name:'prepare_budget',args:{brief:''}}),null);
 const issued={...state,estimates:[{id:'e',issued:true}]};
 assert.throws(()=>budgetPreparationRequest(budget.toolCall,{state:issued}),/emitido/);
});

test('natural-language rubro CRUD produces only precise plans, with no write during preparation',()=>{
 const state={projectId:'project',estimateId:'estimate',remoteProject:false,
  estimates:[{id:'estimate',issued:false}],
  sections:[{id:'foundation',title:'Fundaciones',code:'01',parent_id:null,position:0},
            {id:'sub',title:'Zapatas',code:'01.01',parent_id:'foundation',position:1},
            {id:'cover',title:'Cubiertas',code:'02',parent_id:null,position:2}],
  lines:[{id:'line',description:'Excavación'}],assignments:{line:'foundation'}};
 const create=parseAiReply(JSON.stringify({answer:'Creo rubros',tool_call:{name:'manage_sections',args:{action:'create',titles:'Instalaciones; Terminaciones'}}}));
 const plan=prepareSectionEdits(create.toolCall.args,state);
 assert.deepEqual(plan.actions.map(a=>a.title),['Instalaciones','Terminaciones']);
 assert.equal(plan.projectId,'project');assert.equal(plan.estimateId,'estimate');
 assert.throws(()=>prepareSectionEdits({action:'create',titles:'Fundaciones'},state),/Ya existe/);
 const update=prepareSectionEdits({action:'update',target:'Fundaciones',new_title:'Movimiento de suelos',new_code:'00'},state);
 assert.deepEqual(update.actions[0],{action:'update',section_id:'foundation',expected_title:'Fundaciones',title:'Movimiento de suelos',code:'00'});
 const removal=prepareSectionEdits({action:'delete',target:'Fundaciones'},state);
 assert.deepEqual(removal.actions[0],{action:'delete',section_id:'foundation',expected_title:'Fundaciones',expected_lines:1,expected_children:1});
 assert.match(removal.warnings.join(' '),/partidas/);
 assert.match(removal.warnings.join(' '),/subrubros/);
 assert.equal(parseSectionToolArgs({action:'delete',target:'Fundaciones',new_title:'X'}),null);
 assert.equal(parseBudgetToolCall({name:'manage_sections',args:{action:'delete',target:'Fundaciones',sql:'DROP TABLE estimate_lines'}}),null);
 assert.equal(parseSectionToolArgs({action:'create',titles:'Fundaciones; Fundaciones'}),null);
 assert.throws(()=>prepareSectionEdits({action:'delete',target:'Borrador inexistente'},state),/No encontré/);
 assert.throws(()=>prepareSectionEdits({action:'update',target:'01',new_title:'Cubiertas'},state),/ya lo usa/);
 assert.throws(()=>prepareSectionEdits({action:'delete',target:'01'}, {...state,estimates:[{id:'estimate',issued:true}]}),/emitido/);
});
