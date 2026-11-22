import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateWorkQuantity,consumptionScaleErrors,unitDimension} from '../src/services/ai-quantity-safety.js';
import {parseConstructionOutline} from '../src/services/ai-construction-outline.js';
import {newAcuSeeds,parseAcuProposals,acuTotals} from '../src/services/ai-acu.js';

test('a global 120 m² house figure is NOT automatically used as roof or floor area',()=>{
 const brief='Construir una casa de 120 m² con cubierta y pisos.';
 const plan={work_sections:[{title:'Cubierta',partidas:[{
  description:'Construcción de cubierta',unit:'m²',quantity:'120',
  quantity_source:{kind:'explicit',quote:'una casa de 120 m²'},
  work_result:'Cubierta terminada',resources:[]
 },{
  description:'Colocación de pisos',unit:'m²',quantity:'120',
  work_result:'Piso colocado',resources:[]
 }]}]};
 const rows=parseConstructionOutline(JSON.stringify(plan),brief);
 assert.equal(rows.length,2);
 assert.equal(rows[0].quantity,null);
 assert.equal(rows[1].quantity,null);
 assert.equal(rows[0].quantity_status,'pending');
 assert.ok(rows.warnings.some(warning=>warning.includes('cantidad')||warning.includes('Cantidad')));
 const seeds=newAcuSeeds(rows);
 assert.equal(seeds[0].quantity,'0'); // SQLite placeholder, never a measured area
 assert.equal(seeds[0].quantity_status,'pending');
});
test('a specific mass stated by the user is persisted as the work quantity',()=>{
 const brief='La estructura metálica pesa 900 kg y sostiene la terraza.';
 const proposal={work_sections:[{title:'Montaje',partidas:[{
  description:'Fabricación de estructura metálica',unit:'kg',quantity:'900',
  quantity_source:{kind:'explicit',quote:'La estructura metálica pesa 900 kg'},
  work_result:'Estructura colocada',resources:[]
 }]}]};
 const [part]=parseConstructionOutline(JSON.stringify(proposal),brief);
 assert.equal(part.quantity,'900');
 assert.equal(part.quantity_status,'provided');
 assert.equal(newAcuSeeds([part])[0].quantity,'900');
});
test('roof dimensions are only calculated with factors verified in the source request',()=>{
 const brief='Techo de 10 m por 12 m. Chapa pendiente de definir.';
 const part={description:'Techo dimensionado',unit:'m²',quantity:'120',
  quantity_source:{kind:'calculated',factors:[
   {value:'10',unit:'m',quote:'Techo de 10 m'},
   {value:'12',unit:'m',quote:'12 m'}
  ]}};
 const verified=validateWorkQuantity({...part,source:part.quantity_source,brief});
 assert.equal(verified.quantity,'120');
 assert.equal(verified.status,'calculated');
 const invented=validateWorkQuantity({...part,source:{...part.quantity_source,factors:[
  {value:'10',unit:'m',quote:'Techo de 10 m'},
  {value:'12',unit:'m',quote:'10 m'}
 ]},brief});
 assert.equal(invented.quantity,null);
 assert.equal(invented.status,'pending');
 const wrongDimensions=validateWorkQuantity({...part,source:{kind:'calculated',factors:[
  {value:'10',unit:'m',quote:'Techo de 10 m'},
  {value:'12',unit:'m²',quote:'12 m'}
 ]},brief});
 assert.equal(wrongDimensions.quantity,null);
});
test('per-unit consumption safety detects global surface copied to a roof ACU even when work metrado is pending',()=>{
 assert.ok(consumptionScaleErrors({partQuantity:null,partUnit:'m²',componentQuantity:'120',
  componentUnit:'m',quantityScope:'per_unit'}).length>0);
 assert.ok(consumptionScaleErrors({partQuantity:null,partUnit:'m²',componentQuantity:'120',
  componentUnit:'m²',quantityScope:'per_unit'}).length>0);
 assert.equal(consumptionScaleErrors({partQuantity:null,partUnit:'m²',componentQuantity:'1.08',
  componentUnit:'m²',quantityScope:'per_unit'}).length,0);
 assert.ok(consumptionScaleErrors({partQuantity:'135',partUnit:'m²',componentQuantity:'135',
  componentUnit:'m²',quantityScope:'total'}).length>=2);
 assert.deepEqual(unitDimension('m²'),unitDimension('m2'));
});
test('priced catalog resource with 120 linear meters per roof square meter cannot be marked as ready',()=>{
 const seed={id:'line-roof',description:'Ejecución de cubierta',unit:'m²',quantity:'0',
  quantity_status:'pending',is_new:true,section:'Cubierta',expected_resources:[],components:[]};
 const resources=[{id:'roof-sheet',description:'Recurso de cubierta en metros',unit:'m',kind:'material',price:'18000'}];
 const [row]=parseAcuProposals(JSON.stringify({acu_proposals:[{
  line_id:'line-roof',components:[{resource_id:'roof-sheet',quantity:'120',quantity_unit:'m',
   quantity_scope:'per_unit'}],missing_resources:[]
 }]}),[seed],resources);
 assert.ok(acuTotals(row,resources).errors.some(issue=>issue.includes('metros lineales')));
 const [corrected]=parseAcuProposals(JSON.stringify({acu_proposals:[{
  line_id:'line-roof',components:[{resource_id:'roof-sheet',quantity:'1.15',quantity_unit:'m',
   quantity_scope:'per_unit'}],missing_resources:[]
 }]}),[seed],resources);
 assert.deepEqual(acuTotals(corrected,resources).errors,[]);
});
test('ACU marked with a total quantity is blocked instead of dividing by an unverified zero metrado',()=>{
 assert.ok(consumptionScaleErrors({partQuantity:null,partUnit:'m²',componentQuantity:'120',
  componentUnit:'m',quantityScope:'total'}).some(issue=>issue.includes('total')));
});
