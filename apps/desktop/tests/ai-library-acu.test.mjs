import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readLibraryAcus, readLibraryAcuIntent, saveLibraryAcu, libraryAcuContext, libraryAcuTurnFocus } from "../src/services/ai-library-acu.js";

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
    components:[{resource_id:"yeso",quantity:"8",quantity_unit:"kg",catalog_quantity:"0.32",conversion_basis:{per_unit_quantity:"25",per_unit_unit:"kg"}}]}]});
  const [confirmed] = readLibraryAcus(text,[{id:"yeso",description:"Yeso en bolsa de 25 kg",unit:"bolsa",price:"750"}]).drafts;
  assert.equal(confirmed.components[0].quantity,"0.32");
  assert.equal(confirmed.components[0].conversion,"8 kg");
  const [pending] = readLibraryAcus(text,[{id:"yeso",description:"Yeso en bolsa",unit:"bolsa",price:"750"}]).drafts;
  assert.deepEqual(pending.components,[]);
  assert.match(pending.aiWarnings[0],/presentación declarada/);
});


test("the catalog only retrieves real records for queries chosen by the user or model", () => {
  const resources = [
    {id:"brick",description:"Ladrillo hueco 12 x 18 x 33",unit:"un",kind:"material",price:"120"},
    {id:"sand",description:"Arena gruesa",unit:"m³",kind:"material",price:"3000"},
    {id:"cement",description:"Cemento Portland 25 kg",unit:"bolsa",kind:"material",price:"8000"},
    {id:"worker",description:"Oficial albañil por hora",unit:"h",kind:"labor",price:"9500"},
    {id:"other",description:"Cable eléctrico 2,5 mm",unit:"m",kind:"material",price:"750"},
  ];
  // Use the same catalog selector as the live assistant.
  const evidence=libraryAcuContext("Creá un ACU de mampostería de ladrillo hueco del 12",{
    resources,currency:"ARS",as_of:"2026-11-12",
  });
  const listed = new Set(evidence.resources.map(item => item.id));
  assert.ok(listed.has("brick"));
  const modelQuery=libraryAcuContext("cemento arena albañil",{
    resources,currency:"ARS",as_of:"2026-11-12",
  });
  const discovered=new Set(modelQuery.resources.map(item=>item.id));
  for(const id of ["sand","cement","worker"]) assert.ok(discovered.has(id),"Missing model-selected resource "+id);
  assert.ok(JSON.parse(evidence.context).resources.every(item=>resources.some(r=>r.id===item.id)));
  assert.ok(JSON.parse(modelQuery.context).resources.every(item=>resources.some(r=>r.id===item.id)));
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


test("AI calculates purchase units from the actual package label without hardcoded material sizes", () => {
  const cases=[
    {description:"Cemento gris x 25 kg",unit:"bolsa",quantity:"12",quantity_unit:"kg",catalog_quantity:"0.48",per:"25",per_unit:"kg"},
    {description:"Cal hidratada presentación 25kg",unit:"bolsa",quantity:"0.006",quantity_unit:"t",catalog_quantity:"0.24",per:"25",per_unit:"kg"},
    {description:"Arena seca bolsón de 1tn",unit:"bolsón",quantity:"0.15",quantity_unit:"toneladas",catalog_quantity:"0.15",per:"1",per_unit:"tn"},
    {description:"Arena embolsada por 750 kg",unit:"bolsón",quantity:"150",quantity_unit:"kg",catalog_quantity:"0.2",per:"750",per_unit:"kg"},
  ];
  for (const [index,tc] of cases.entries()) {
    const resource={id:"r"+index,description:tc.description,unit:tc.unit,price:"100"};
    const result=readLibraryAcus(JSON.stringify({answer:"Consumos calculados por IA",library_acus:[{
      description:"Partida de prueba",unit:"m²",components:[{
        resource_id:resource.id,quantity:tc.quantity,quantity_unit:tc.quantity_unit,
        catalog_quantity:tc.catalog_quantity,
        conversion_basis:{per_unit_quantity:tc.per,per_unit_unit:tc.per_unit}
      }],missing:[]
    }]}),[resource]);
    assert.equal(result.drafts[0].components[0].quantity,tc.catalog_quantity,tc.description);
    assert.equal(result.drafts[0].aiWarnings.length,0,tc.description);
  }
});

test("CPObras rejects invented package sizes, incorrect model math and unsupported mass-to-volume conversions", () => {
  const read=(resource,component)=>readLibraryAcus(JSON.stringify({
    answer:"Revisión",library_acus:[{description:"Trabajo",unit:"m²",components:[{resource_id:"r",...component}],missing:[]}]
  }),[{id:"r",price:"500",...resource}]).drafts[0];
  const source={quantity:"12",quantity_unit:"kg",catalog_quantity:"0.48",
    conversion_basis:{per_unit_quantity:"25",per_unit_unit:"kg"}};
  const invalidSize=read({description:"Cemento x 50 kg",unit:"bolsa"},source);
  assert.equal(invalidSize.components.length,0);
  assert.match(invalidSize.aiWarnings[0],/no figura/);
  const wrongMath=read({description:"Cemento x 25 kg",unit:"bolsa"},{...source,catalog_quantity:"0.8"});
  assert.equal(wrongMath.components.length,0);
  assert.match(wrongMath.aiWarnings[0],/no coincide/);
  const absentProof=read({description:"Cemento x 25 kg",unit:"bolsa"},{quantity:"12",quantity_unit:"kg"});
  assert.equal(absentProof.components.length,0);
  assert.match(absentProof.aiWarnings[0],/IA no indicó/);
  const density=read({description:"Arena fina a granel",unit:"m³"},
    {quantity:"0.15",quantity_unit:"t",catalog_quantity:"0.15"});
  assert.equal(density.components.length,0);
  assert.match(density.aiWarnings[0],/dimensiones físicas distintas/);
});

test("materials explicitly omitted by the user are not reported as missing, without a special-case material list",()=>{
  const results=readLibraryAcus(JSON.stringify({answer:"Sin insumo excluido",library_acus:[{
    description:"Revestimiento",unit:"m²",excluded:["Líquido de preparación"],components:[
      {resource_id:"r",quantity:"3",quantity_unit:"un"},
      {resource_id:"o",quantity:"2",quantity_unit:"l"}
    ],missing:["Líquido de preparación · 2 l (excluido)"]
  }]}),[
    {id:"r",description:"Pieza",unit:"un",price:"20"},
    {id:"o",description:"Líquido de preparación",unit:"l",price:"100"}
  ]).drafts[0];
  assert.equal(results.components.length,1);
  assert.deepEqual(results.aiWarnings,[]);
});


test("library follow-ups prefer a new unsaved draft over a highlighted older ACU",()=>{
 const withDraft={pendingDraft:true,pendingEdit:false,selectedId:"old-masonry"};
 for(const action of ["show","review","approve","question","add","revise","clarify","edit"]){
  assert.equal(libraryAcuTurnFocus({action},withDraft),"draft",action);
 }
 assert.equal(libraryAcuTurnFocus({action:"new"},withDraft),"new");
 assert.equal(libraryAcuTurnFocus({action:"finish"},withDraft),"finish");
 assert.equal(libraryAcuTurnFocus({action:"edit",target:"selected"},withDraft),"selected");
 const withoutDraft={pendingDraft:false,pendingEdit:false,selectedId:"old-masonry"};
 assert.equal(libraryAcuTurnFocus({action:"show"},withoutDraft),"selected");
 assert.equal(libraryAcuTurnFocus({action:"add"},withoutDraft),"selected");
 assert.equal(libraryAcuTurnFocus({action:"question"},withoutDraft),"selected");
 assert.deepEqual(readLibraryAcuIntent('{"action":"finish"}'),{action:"finish",work:undefined});
 assert.deepEqual(readLibraryAcuIntent('{"action":"edit","target":"draft"}'),{action:"edit",work:undefined,target:"draft"});
});
