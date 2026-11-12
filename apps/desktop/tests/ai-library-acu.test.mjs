import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readLibraryAcus, readLibraryAcuIntent, saveLibraryAcu } from "../src/services/ai-library-acu.js";

test("the library API accepts only typed intents and blocks incomplete writes", () => {
  assert.deepEqual(readLibraryAcuIntent('{"action":"new","work":"Yeso húmedo"}'), {action:"new",work:"Yeso húmedo"});
  assert.throws(() => readLibraryAcuIntent('{"action":"delete_analysis"}'), /acción válida/);
  assert.throws(() => saveLibraryAcu(() => assert.fail("unexpected write"), {components:[],aiWarnings:[]}), /pendientes/);
});

test("accepts verified consumptions and keeps catalog prices, including missing and zero prices", () => {
  const resources = [{id:"a",price:"0"},{id:"b",price:null}];
  const proposal = {description:"Mampostería",unit:"m²",components:[
    {resource_id:"a",quantity:"0.125",unit_price:"99"},
    {resource_id:"b",quantity:"1",unit_price:"1"},
  ]};
  const read = draft => readLibraryAcus(JSON.stringify({answer:"Estimación",library_acus:[draft]}), resources);
  assert.deepEqual(read(proposal).drafts[0].components, [
    {resource_id:"a",description:undefined,unit:undefined,quantity:"0.125",unit_price:"0"},
    {resource_id:"b",description:undefined,unit:undefined,quantity:"1",unit_price:""},
  ]);
  for (const components of [
    [{resource_id:"desconocido",quantity:"1"}],
    [{resource_id:"a",quantity:"0"}],
    [{resource_id:"a",quantity:"1"},{resource_id:"a",quantity:"2"}],
  ]) {
    assert.throws(() => read({...proposal,components}), /insumo sin verificar/);
  }
});

test("converts kg only when the package weight is verifiable in the catalog", () => {
  const text = JSON.stringify({answer:"Estimación",library_acus:[{description:"Yeso",unit:"m²",
    components:[{resource_id:"yeso",quantity:"8",quantity_unit:"kg"}]}]});
  const [confirmed] = readLibraryAcus(text,[{id:"yeso",description:"Yeso en bolsa de 25 kg",unit:"bolsa",price:"750"}]).drafts;
  assert.equal(confirmed.components[0].quantity,"0.32");
  assert.equal(confirmed.components[0].conversion,"8 kg");
  const [pending] = readLibraryAcus(text,[{id:"yeso",description:"Yeso en bolsa",unit:"bolsa",price:"750"}]).drafts;
  assert.deepEqual(pending.components,[]);
  assert.match(pending.aiWarnings[0],/confirmar la equivalencia/);
});
