import {test} from "node:test";
import assert from "node:assert/strict";
import {selectedAcuSnapshot,selectedAcuSnapshotMatches,readSelectedAcuEdit,
 canApplySelectedAcuEdit,applySelectedAcuEdit} from "../src/services/ai-selected-acu-edit.js";

const original={
 id:"analysis-123",code:"ACU-10",description:"Mampostería",unit:"m²",
 components:[
  {resource_id:"brick",description:"Ladrillo hueco",quantity:"17",unit_price:"100",unit:"un"},
  {resource_id:"cement",description:"Cemento",quantity:"0.48",unit_price:"5000",unit:"bolsa"},
  {resource_id:"labor",description:"Oficial albañil",quantity:"1",unit_price:"9500",unit:"h"}
 ]
};
const resources=[
 {id:"brick",description:"Ladrillo hueco",unit:"un",kind:"material",price:"120"},
 {id:"cement",description:"Cemento Portland bolsa de 25 kg",unit:"bolsa",kind:"material",price:"6000"},
 {id:"labor",description:"Oficial albañil",unit:"h",kind:"labor",price:"11000"},
 {id:"sand",description:"Arena fina",unit:"m3",kind:"material",price:"8000"}
];
const parse=(edit,previous=null)=>readSelectedAcuEdit(JSON.stringify({
 answer:"Revisé las cantidades en la unidad real del catálogo.",analysis_edit:edit
}),{baseline:original,resources,previous}).proposal;

test("target snapshot excludes line-owned ACU and detects stale edits",()=>{
 const data={...original,is_line_owned:false};
 assert.deepEqual(selectedAcuSnapshot(original.id,data),original);
 assert.throws(()=>selectedAcuSnapshot(original.id,{...data,is_line_owned:true}),/no se puede editar/);
 assert.ok(selectedAcuSnapshotMatches(original,{...original,components:original.components.map(x=>({...x}))}));
 assert.equal(selectedAcuSnapshotMatches(original,{...original,components:original.components.map((x,i)=>i?x:{...x,quantity:"18"})}),false);
});

test("AI math changes selected ACU quantity without overwriting unrelated resources or their prices",()=>{
 const p=parse({changes:[{operation:"set",resource_id:"cement",
 quantity:"15",quantity_unit:"kg",catalog_quantity:"0.6",
 conversion_basis:{per_unit_quantity:"25",per_unit_unit:"kg"}}]});
 assert.equal(p.draft.id,original.id);
 assert.deepEqual(p.draft.components.map(x=>x.resource_id),["brick","cement","labor"]);
 assert.equal(p.draft.components[1].quantity,"0.6");
 assert.equal(p.draft.components[1].unit_price,"5000"); // not catalog price 6000
 assert.equal(p.draft.components[0].unit_price,"100");
 assert.equal(p.draft.components[2].unit_price,"9500");
 assert.equal(p.changes.length,1);
 assert.ok(canApplySelectedAcuEdit(p));
 assert.throws(()=>parse({changes:[{operation:"set",resource_id:"cement",
   quantity:"12",quantity_unit:"kg",catalog_quantity:"0.48",
   conversion_basis:{per_unit_quantity:"25",per_unit_unit:"kg"}}]}),/no propuso diferencias/);
});

test("add, remove and follow-up edits are a cumulative delta over the same selected ACU",()=>{
 const first=parse({changes:[
  {operation:"remove",resource_id:"labor"},
  {operation:"add",resource_id:"sand",quantity:"0.03",quantity_unit:"m3"}
 ]});
 assert.deepEqual(first.draft.components.map(x=>x.resource_id),["brick","cement","sand"]);
 assert.equal(first.draft.components[2].unit_price,"8000");
 const next=parse({changes:[{operation:"set",resource_id:"cement",quantity:"0.5",quantity_unit:"bolsa"}],
  description:"Mampostería 12 cm"},first);
 assert.deepEqual(next.draft.components.map(x=>x.resource_id),["brick","cement","sand"]);
 assert.equal(next.draft.description,"Mampostería 12 cm");
 assert.equal(next.changes.length,4);
 assert.equal(next.baseline.id,original.id);
 assert.ok(canApplySelectedAcuEdit(next));
});

test("invalid model instructions cannot replace unrelated components or fabricate IDs",()=>{
 assert.throws(()=>parse({changes:[{operation:"remove",resource_id:"not-in-acu"}]}),/no está en el ACU/);
 assert.throws(()=>parse({changes:[{operation:"add",resource_id:"not-in-catalog",quantity:"1"}]}),/no pertenece al catálogo/);
 assert.throws(()=>parse({changes:[{operation:"set",resource_id:"cement",quantity:"999"}]}),/no coincide|dimensional|no indicó/);
 assert.throws(()=>parse({changes:[
  {operation:"remove",resource_id:"labor"},{operation:"remove",resource_id:"labor"}
 ]}),/repetido/);
});

test("write is conditional on selected record, database, original snapshot and verified response",async()=>{
 const edit=parse({changes:[{operation:"set",resource_id:"brick",quantity:"18",quantity_unit:"un"}]});
 edit.databaseScope="sqlite-A";
 const calls=[];
 const invoke=async(command,args)=>{
  calls.push({command,args});
  if(command==="get_analysis_details")return {...original,is_line_owned:false};
  if(command==="update_analysis")return {id:original.id,code:original.code,
    description:edit.draft.description,unit:edit.draft.unit,unit_cost:"30000"};
  throw Error("Unexpected IPC "+command);
 };
 await assert.rejects(applySelectedAcuEdit(invoke,edit,{selectedAnalysisId:"other",selectedDatabaseScope:"sqlite-A"}),/Cambió el ACU/);
 await assert.rejects(applySelectedAcuEdit(invoke,edit,{selectedAnalysisId:original.id,selectedDatabaseScope:"sqlite-B"}),/Cambió la base/);
 assert.equal(calls.length,0);
 const saved=await applySelectedAcuEdit(invoke,edit,{selectedAnalysisId:original.id,selectedDatabaseScope:"sqlite-A"});
 assert.equal(saved.id,original.id);
 assert.deepEqual(calls.map(x=>x.command),["get_analysis_details","update_analysis"]);
 assert.equal(calls[1].args.analysisId,original.id);
 assert.equal(calls[1].args.expectedSnapshot.components[0].quantity,"17");
 assert.equal(calls[1].args.components[0].quantity,"18");
 assert.equal(calls[1].args.components[1].unitPrice,"5000");
 const changed=async(command)=>{
  if(command==="get_analysis_details")return {...original,is_line_owned:false,components:original.components.map((x,i)=>i?x:{...x,quantity:"19"})};
  throw Error("Stale update reached IPC");
 };
 await assert.rejects(applySelectedAcuEdit(changed,edit,{selectedAnalysisId:original.id,selectedDatabaseScope:"sqlite-A"}),/cambió después/);
});
