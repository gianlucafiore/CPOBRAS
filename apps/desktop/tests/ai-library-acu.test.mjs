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


test("masonry work includes real candidates for bricks, mortar ingredients and labor", () => {
  const resources = [
    {id:"brick",description:"Ladrillo hueco 12 x 18 x 33",unit:"un",kind:"material",price:"120"},
    {id:"sand",description:"Arena gruesa",unit:"m³",kind:"material",price:"3000"},
    {id:"cement",description:"Cemento Portland 25 kg",unit:"bolsa",kind:"material",price:"8000"},
    {id:"worker",description:"Oficial albañil por hora",unit:"h",kind:"labor",price:"9500"},
    {id:"other",description:"Cable eléctrico 2,5 mm",unit:"m",kind:"material",price:"750"},
  ];
  const {libraryAcuContext} = await import("../src/services/ai-library-acu.js");
  const evidence=libraryAcuContext("Creá un ACU de mampostería de ladrillo hueco del 12",{
    resources,currency:"ARS",as_of:"2026-11-12",
  });
  const listed = new Set(evidence.resources.map(item => item.id));
  for(const id of ["brick","sand","cement","worker"]) assert.ok(listed.has(id),"Missing real catalog candidate: "+id);
  assert.ok(JSON.parse(evidence.context).resources.every(item=>resources.some(r=>r.id===item.id)));
});

test("unavailable named materials remain visible as pending, while numbers are normalized safely", () => {
  const resources=[{id:"brick",description:"Ladrillo hueco 12",unit:"un",kind:"material",price:"0"}];
  const result=readLibraryAcus(JSON.stringify({answer:"Mampostería por m², pendiente de mortero.",library_acus:[
    {description:"Mampostería de ladrillo hueco 12",unit:"m²",components:[
      {resource_id:"brick",quantity:17,quantity_unit:"un"},
      {resource_id:"missing-material",description:"Arena gruesa",quantity:"0.02",quantity_unit:"m³"},
    ],missing:[{name:"Cemento Portland",quantity:"6",unit:"kg",reason:"Buscar en catálogo"}]},
  ]}),resources);
  assert.equal(result.drafts[0].components.length,1);
  assert.equal(result.drafts[0].components[0].quantity,"17");
  assert.equal(result.drafts[0].components[0].unit_price,"0");
  assert.match(result.drafts[0].aiWarnings.join(" | "),/Arena gruesa/);
  assert.match(result.drafts[0].aiWarnings.join(" | "),/Cemento Portland/);
  assert.equal(result.drafts[0].aiWarnings.length,2);
});
