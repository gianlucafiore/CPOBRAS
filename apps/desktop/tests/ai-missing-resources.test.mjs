import {test} from 'node:test';
import assert from 'node:assert/strict';
import {missingResourceItems,collectMissingResourceItems} from '../src/services/ai-missing-resources.js';
import {acuSeed,parseAcuProposals,acuTotals} from '../src/services/ai-acu.js';
import {createAiMissingResourcePopup} from '../src/components/ai-missing-resource-popup.js';
import {createModalRenderer} from '../src/components/modal.js';
import {createActions} from '../src/controllers/actions.js';
import {buildAcuReviewTree} from '../src/services/ai-acu-review-tree.js';

const resource={id:'10000000-0000-4000-8000-000000000001',description:'Caño estructural',code:'MAT',unit:'kg',kind:'material',price:'2500'};
const seed=(id,description)=>acuSeed({id,description,unit:'kg',quantity:'900',unit_cost:'0',section:'Estructura',components:[]});
const a=seed('10000000-0000-4000-8000-000000000002','Estructura metálica'),b=seed('10000000-0000-4000-8000-000000000003','Casco de pileta');
const missing=[
 {description:'Tablillas de deck plástico',unit:'m²',kind:'material',action:'create',reason:'No se encontró equivalencia en catálogo'},
 {description:'Perfil W, sección a definir',unit:'kg',kind:'material',action:'specify',reason:'Falta sección de perfil'}
];
function proposals(sourceQuantity='0'){
 return JSON.stringify({acu_proposals:[
  {line_id:a.id,components:[{resource_id:resource.id,quantity:'1.5',quantity_unit:'kg',source_quantity:sourceQuantity,source_unit:'kg'}],missing_resources:missing},
  {line_id:b.id,components:[],missing_resources:[missing[0]]}
 ]});
}

test('missing resources are distinct typed drafts and deduplicated across partidas',()=>{
 const rows=parseAcuProposals(proposals(),[a,b],[resource]);
 assert.equal(rows.length,2);
 assert.equal(rows[0].missing_resource_drafts.length,2);
 const items=collectMissingResourceItems(rows);
 assert.equal(items.length,2);
 assert.deepEqual(items[0].lines,['Estructura metálica','Casco de pileta']);
 assert.equal(items[0].description,'Tablillas de deck plástico');
 assert.equal(items[0].unit,'m²');
 assert.equal(items[0].kind,'material');
 assert.equal(items[0].action,'create');
 assert.equal(items[1].action,'specify');
 assert.ok(acuTotals(rows[0],[resource]).errors.includes('Hay faltantes indicados por IA pendientes de resolver'));
});

test('optional source quantity 0 is not a batch-stopping error; actual quantity remains positive',()=>{
 for(const zero of ['0','0.0','0.00',0]){
  const rows=parseAcuProposals(proposals(zero),[a,b],[resource]);
  assert.equal(rows[0].components[0].quantity,'1.5');
  assert.equal(rows[0].components[0].source_quantity,undefined);
  assert.equal(rows[0].components[0].source_unit,undefined);
  assert.match(rows[0].components[0].consumption_support,/Origen cero no válido/);
 }
 const invalid=JSON.parse(proposals());
 invalid.acu_proposals[0].components[0].quantity='0';
 assert.throws(()=>parseAcuProposals(JSON.stringify(invalid),[a,b],[resource]),/consumos deben ser mayores/);
});

test('unstructured descriptions are not interpreted as ready-to-create catalog items',()=>{
 assert.deepEqual(missingResourceItems(['Faltan conexiones metálicas, perfiles W y tornillos']),[]);
 const list=missingResourceItems([
  {description:'Tornillos a definir',kind:'material',unit:'',action:'specify'},
  {description:'',kind:'material',unit:'un',action:'create'},
  {name:'Tablillas de deck',unit:'m²',kind:'otro',action:'create'}
 ]);
 assert.equal(list.length,2);
 assert.equal(list[0].action,'specify');
 assert.equal(list[1].kind,'');
 assert.equal(list[1].action,'create');
});

function popupHarness(confirm=true){
 const handlers={},host={innerHTML:'',querySelector:()=>({focus(){},setSelectionRange(){}}),
  addEventListener(name,handler){handlers[name]=handler;}};
 const document={createElement:()=>host,body:{append(node){assert.equal(node,host);}}};
 const window={confirm:()=>confirm};
 const state={resources:[
  {id:'resource-one',code:'MAT-1',description:'Tablilla WPC de deck',unit:'m',kind:'material',active:true},
  {id:'resource-two',code:'MAT-2',description:'Listón plástico',unit:'m²',kind:'material',active:true}
 ]};
 let native=null,restored=false;const resolved=[];
 const popup=createAiMissingResourcePopup({document,window,state,
  openModal:(...args)=>{native=args;},
  onResolved:async(item,resource,meta)=>{resolved.push({item,resource,meta});},
  onRestored:()=>{restored=true;}
 });
 const click=async(action,id)=>handlers.click({target:{closest:()=>({dataset:{missingAction:action,id},disabled:false})}});
 return {popup,state,host,click,resolved,getNative:()=>native,getRestored:()=>restored};
}

test('ACU faltante uses a single existing-resource picker rather than a second create form',async()=>{
 const view=popupHarness();
 const item={description:'Tablilla WPC de deck',unit:'m',kind:'material',action:'create'};
 assert.equal(view.popup.open(item),true);
 assert.match(view.host.innerHTML,/Seleccionar insumo/);
 assert.match(view.host.innerHTML,/data-missing-action="create"/);
 assert.match(view.host.innerHTML,/Tablilla WPC de deck/);
 await view.click('select','resource-one');
 assert.equal(view.resolved.length,1);
 assert.equal(view.resolved[0].resource.id,'resource-one');
 assert.deepEqual(view.resolved[0].meta,{created:false});
 assert.equal(view.getNative(),null);
 assert.equal(view.popup.active(),false);
});

test('new item opens the original resource modal with AI fields prefilled and no separate write',async()=>{
 const view=popupHarness();
 const item={description:'Perfil W a definir',unit:'kg',kind:'material',action:'specify'};
 view.popup.open(item);
 await view.click('create');
 const [kind,record,onSaved,onClosed]=view.getNative();
 assert.equal(kind,'resource');
 assert.equal(record.description,'Perfil W a definir');
 assert.equal(record.kind,'material');
 assert.equal(record.unit,'kg');
 assert.equal(record.aiMissingSpecification,item.description);
 assert.equal(view.resolved.length,0);
 await onSaved({id:'new-resource'});
 assert.equal(view.resolved[0].resource.id,'new-resource');
 assert.equal(view.resolved[0].meta.created,true);
 onClosed();
 assert.equal(view.getRestored(),true);
});

test('selecting an incompatible existing unit requires confirmation and no implicit conversion',async()=>{
 const view=popupHarness(false);
 view.popup.open({description:'Tablilla WPC de deck',unit:'m²',kind:'material',action:'create'});
 await view.click('select','resource-one');
 assert.equal(view.resolved.length,0);
 assert.equal(view.popup.active(),true);
});

test('native resource form accepts AI-prefilled description and executes its save callback only after collection refresh',async()=>{
 const modal={kind:'resource',record:{description:'Deck plástico',unit:'m',kind:'material',price:''},onSaved:()=>{}};
 const state={modal,view:'resources',resources:[],clients:[],personClients:[],sections:[],selectedResourceId:null};
 const markup=createModalRenderer({state,currentProject:()=>null,currentEstimate:()=>null,currentLine:()=>null,editable:()=>true,projectName:()=>'',clientName:()=>'',locked:()=>false,acuPickerMarkup:()=>''})();
 assert.match(markup,/Agregar insumo/);
 assert.match(markup,/value="Deck plástico"/);
 assert.match(markup,/value="m"/);
 assert.match(markup,/name="kind"/);
 let collectionsReady=false,callbackCalled=false;
 modal.onSaved=async created=>{
  assert.equal(collectionsReady,true);
  assert.equal(created.id,'saved-resource');
  callbackCalled=true;
 };
 const entry={description:'Deck plástico',unit:'m',kind:'material',price:'',code:'',effectiveDate:'2026-11-21',source:'Carga desde CPOBRAS IA',dailyOutput:''};
 const FormData=class{get(key){return entry[key]??null;}};
 const actions=createActions({state,FormData,invoke:async command=>{
   if(command==='create_resource')return {id:'saved-resource'};
   throw Error('Unexpected native operation '+command);
  },loadCollections:async()=>{collectionsReady=true;state.resources=[{id:'saved-resource',...entry}];},
  refreshResource:async()=>{},render:()=>{},currentProject:()=>null,currentEstimate:()=>null,currentLine:()=>null});
 await actions.handleSubmit({dataset:{kind:'resource'}});
 assert.equal(callbackCalled,true);
 assert.equal(state.modal,null);
 assert.equal(state.selectedResourceId,'saved-resource');
});

test('chat review renders rubro, partida and its own insumos without inventing consumptions',()=>{
 const rows=parseAcuProposals(proposals('1'),[a,b],[resource]);
 const tree=buildAcuReviewTree(rows,[resource],[],[
  {line_id:a.id,requested:'Tablillas de deck plástico',resource_id:'deck-1',description:'Deck plástico WPC',unit:'m²',kind:'material'}
 ]);
 assert.equal(tree.length,1);
 assert.equal(tree[0].name,'Estructura');
 assert.deepEqual(tree[0].lines.map(row=>row.description),['Estructura metálica','Casco de pileta']);
 const steel=tree[0].lines[0];
 assert.equal(steel.status,'pending');
 assert.ok(steel.items.some(item=>item.description==='Caño estructural'&&item.quantity==='1.5'&&item.unit==='kg'));
 const choice=steel.items.find(item=>item.status==='selected');
 assert.equal(choice.description,'Deck plástico WPC');
 assert.equal(choice.quantity,'');
 assert.equal(choice.requested,'Tablillas de deck plástico');
 assert.notEqual(steel.status,'ready');
 const pool=tree[0].lines[1];
 assert.equal(pool.status,'pending');
 assert.ok(pool.items.some(item=>item.status==='missing'));
 assert.ok(!pool.items.some(item=>item.status==='selected'));
});

test('a fully valid ACU is marked ready only with real catalog IDs, valid quantities and prices',()=>{
 const rows=parseAcuProposals(JSON.stringify({acu_proposals:[{
  line_id:a.id,components:[{resource_id:resource.id,quantity:'1.5',quantity_unit:'kg'}],missing_resources:[]
 }]}),[a],[resource]);
 const tree=buildAcuReviewTree(rows,[resource],[],[]);
 assert.equal(tree[0].lines[0].status,'ready');
 assert.equal(tree[0].lines[0].unit_cost,'3750.0');
});
