import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resourceChatTurn,validatedResourceDraft,resourceDraftSummary} from '../src/services/ai-resource-chat.js';

test('postes: remembered description and manual price survive type and unit followups',()=>{
  const start=resourceChatTurn('Poste de madera 3" x 2,2m , precio: 17500');
  assert.equal(start.action,'draft');
  assert.equal(start.rows[0].description,'Poste de madera 3" x 2,2m');
  assert.equal(start.rows[0].price,'17500');
  assert.equal(start.rows[0].kind,'material');
  const withUnit=resourceChatTurn('es material, la unidad es: unidad',{rows:start.rows});
  assert.equal(withUnit.action,'draft');
  assert.equal(withUnit.rows[0].description,start.rows[0].description);
  assert.equal(withUnit.rows[0].price,'17500');
  assert.equal(withUnit.rows[0].unit,'unidad');
  const priceAgain=resourceChatTurn('el precio es 17500',{rows:withUnit.rows});
  assert.equal(priceAgain.action,'draft');
  assert.equal(priceAgain.rows[0].price,'17500');
  const reviewed=validatedResourceDraft(priceAgain.rows);
  assert.equal(reviewed.pending.length,0);
  assert.equal(reviewed.ready[0].price,'17500');
  assert.equal(resourceChatTurn('perfecto cargalo',{rows:priceAgain.rows}).action,'approve');
  assert.equal(resourceChatTurn('sí dale',null,'No hay insumos para cercado. ¿Querés cargar postes de madera, alambre y grampas?').action,'generate');
  assert.equal(resourceChatTurn('sí dale',null,'Podemos crear una partida nueva'),null);
});

test('resource batch supports several items and never assigns invented prices',()=>{
  const first=resourceChatTurn('Poste de madera 3" x 2,2m, precio: 17500');
  const second=resourceChatTurn('agrega alambre galvanizado',{rows:first.rows});
  assert.equal(second.action,'draft');
  assert.equal(second.rows.length,2);
  assert.equal(second.rows[0].price,'17500');
  assert.equal(second.rows[1].description,'alambre galvanizado');
  assert.equal(second.rows[1].price,null);
  const reviewed=validatedResourceDraft(second.rows);
  assert.equal(reviewed.pending.length,2); // explicit unit required for both
  assert.match(resourceDraftSummary(reviewed),/pendiente/i);
  assert.equal(resourceChatTurn('perfecto cargalo',{rows:second.rows}).action,'approve');
  assert.equal(resourceChatTurn('4+5',null),null);
  assert.equal(resourceChatTurn('cargar partida de mampostería',null),null);
  assert.equal(resourceChatTurn('agrega mano de obra de un oficial y ayudante',null),null); // ACU addition
  assert.equal(resourceChatTurn('agrega alambre al ACU seleccionado',null),null);

});

test('wrong currency, duplicates and ambiguous input never get silently written',()=>{
  assert.equal(resourceChatTurn('Poste de madera, precio: USD 10').action,'error');
  assert.equal(resourceChatTurn('Poste de madera, precio: 10 USD').action,'error');
  const result=resourceChatTurn('Poste de madera, precio: 17.500');
  assert.equal(result.rows[0].price,'17500');
  const withUnit=resourceChatTurn('unidad: unidad',{rows:result.rows});
  const previous=[{description:'Poste de madera',kind:'material',unit:'unidad',code:'MAT-1'}];
  const review=validatedResourceDraft(withUnit.rows,previous);
  assert.equal(review.ready.length,0);
  assert.match(review.pending[0].errors.join(' '),/ya existe/);
  assert.equal(resourceChatTurn('cancelar',{rows:withUnit.rows}).action,'discard');
});


test('user fence prices and exclusions correct a previously suggested seven-resource draft',()=>{
  const proposed=[
    {description:'Tejido romboidal para cercado',kind:'material',unit:'m²',price:null},
    {description:'Postes de madera o metálicos para cercado',kind:'material',unit:'unidad',price:null},
    {description:'Cemento para fijación de postes',kind:'material',unit:'bolsa',price:null},
    {description:'Alambre para tensar',kind:'material',unit:'kg',price:null},
    {description:'Grampas metálicas',kind:'material',unit:'unidad',price:null},
    {description:'Mano de obra para instalación de cercado',kind:'labor',unit:'m²',price:null},
    {description:'Alquiler de equipos',kind:'equipment',unit:'día',price:null},
  ];
  const request='el precio del tejido es $1500 xm2 el del poste 17500 por unidad El cemento no lo agregues ya existe, alambre tampoco Las grampas valen 1000 cada una Mano de obra, es 50.000 el m2 equipos no pongas';
  const response=resourceChatTurn(request,{rows:proposed});
  assert.equal(response.action,'draft');
  assert.deepEqual(response.excluded.sort(),['alambre','cemento','equipo']);
  assert.equal(response.rows.length,4);
  assert.deepEqual(response.rows.map(row=>row.price),['1500','17500','1000','50000']);
  assert.deepEqual(response.rows.map(row=>row.unit),['m²','unidad','unidad','m²']);
  assert.deepEqual(response.rows.map(row=>row.kind),['material','material','material','labor']);
  assert.equal(validatedResourceDraft(response.rows).pending.length,0);
  assert.equal(resourceChatTurn('bien cargalo',{rows:response.rows,excluded:response.excluded}).action,'approve');
  const discard=resourceChatTurn('quita el insumo de cemento',{rows:proposed});
  assert.equal(discard.action,'draft');
  assert.equal(discard.rows.some(row=>row.description.includes('Cemento')),false);
  assert.ok(discard.excluded.includes('cemento'));
  assert.equal(resourceChatTurn('agrega cemento por bolsa',{rows:discard.rows,excluded:discard.excluded}),null);
});

test('single natural-language fence list yields three exact resources without measurements becoming prices',()=>{
  const question='necesitamos los insumos para cerco de tejido romboidal: Mano de obra: 50.000 x m2 Poste de 3" x 2.2m a 17.500 cada uno tejido romboidal a 1500 xm2';
  const turn=resourceChatTurn(question);
  assert.equal(turn.action,'draft');
  assert.deepEqual(turn.rows.map(row=>({description:row.description,unit:row.unit,kind:row.kind,price:row.price})),[
    {description:'Mano de obra para cerco de tejido romboidal',unit:'m²',kind:'labor',price:'50000'},
    {description:'Poste de 3" x 2.2m',unit:'unidad',kind:'material',price:'17500'},
    {description:'tejido romboidal',unit:'m²',kind:'material',price:'1500'},
  ]);
  const review=validatedResourceDraft(turn.rows);
  assert.equal(review.pending.length,0);
  assert.equal(review.ready.length,3);
  assert.equal(resourceChatTurn('bien cargalo',{rows:turn.rows,excluded:[]}).action,'approve');
});

test('exclusions do not accidentally suppress adjacent items, and quantities are not prices',()=>{
  const items=resourceChatTurn('necesitamos insumos para cerco: cemento no lo agregues, grampas valen 1000 cada una Poste de madera 3" x 2,2m a 17500 cada uno');
  assert.equal(items.action,'draft');
  assert.ok(items.excluded.includes('cemento'));
  assert.deepEqual(items.rows.map(x=>x.price),['1000','17500']);
  assert.equal(items.rows[1].description,'Poste de madera 3" x 2,2m');
  assert.equal(items.rows.some(x=>/cemento/i.test(x.description)),false);
  assert.equal(resourceChatTurn('agregá mano de obra a ese ACU'),null);
});
