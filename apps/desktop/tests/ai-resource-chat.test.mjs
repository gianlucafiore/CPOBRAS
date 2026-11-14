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
  const result=resourceChatTurn('Poste de madera, precio: 17.500');
  assert.equal(result.rows[0].price,'17500');
  const withUnit=resourceChatTurn('unidad: unidad',{rows:result.rows});
  const previous=[{description:'Poste de madera',kind:'material',unit:'unidad',code:'MAT-1'}];
  const review=validatedResourceDraft(withUnit.rows,previous);
  assert.equal(review.ready.length,0);
  assert.match(review.pending[0].errors.join(' '),/ya existe/);
  assert.equal(resourceChatTurn('cancelar',{rows:withUnit.rows}).action,'discard');
});
