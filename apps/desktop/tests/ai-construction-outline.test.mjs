import {test} from 'node:test';
import assert from 'node:assert/strict';
import {constructionOutlineInstruction,parseConstructionOutline} from '../src/services/ai-construction-outline.js';
import {newAcuSeeds,parseAcuProposals,acuTotals} from '../src/services/ai-acu.js';
import {buildAcuReviewTree} from '../src/services/ai-acu-review-tree.js';

const plan={
 work_sections:[{title:'Montaje de cerramiento exterior',partidas:[{
  description:'Ejecución de estructura portante',unit:'kg',quantity:'900',
  quantity_source:{kind:'explicit',quote:'La ejecución de estructura portante requiere 900 kg de acero'},
  work_result:'Estructura metálica colocada y fijada',
  resources:[
   {name:'Perfil metálico hueco',kind:'material',unit:'kg'},
   {name:'Personal de montaje',kind:'labor',unit:'jor'},
   {name:'Elementos de fijación',kind:'material',unit:'un'}
  ]
 },{
  description:'Colocación del revestimiento',unit:'m²',quantity:null,
  work_result:'Superficie de revestimiento terminada',
  resources:[
   {name:'Tablas poliméricas',kind:'material',unit:'m²'},
   {name:'Elementos de fijación',kind:'material',unit:'un'}
  ]
 }]}]
};
const brief='La ejecución de estructura portante requiere 900 kg de acero';
const catalog=[
 {id:'mat-1',description:'Perfil metálico hueco',unit:'kg',kind:'material',price:'1500'},
 {id:'labor-1',description:'Personal de montaje',unit:'jor',kind:'labor',price:'20000'}
];

test('planning contract distinguishes work group, measurable executed work, and resources without keyword matching',()=>{
 const rows=parseConstructionOutline(JSON.stringify(plan),brief);
 assert.equal(rows.length,2);
 assert.deepEqual(rows.map(row=>row.section),['Montaje de cerramiento exterior','Montaje de cerramiento exterior']);
 assert.deepEqual(rows.map(row=>row.description),['Ejecución de estructura portante','Colocación del revestimiento']);
 assert.equal(rows[0].quantity,'900');
 assert.equal(rows[0].expected_resources.length,3);
 assert.ok(rows[0].expected_resources.some(req=>req.description==='Elementos de fijación'));
 assert.ok(rows[1].expected_resources.some(req=>req.description==='Elementos de fijación'));
 assert.ok(!rows.some(row=>row.description==='Elementos de fijación'));
 assert.match(constructionOutlineInstruction,/RUBRO:/);
 assert.match(constructionOutlineInstruction,/PARTIDA:/);
 assert.match(constructionOutlineInstruction,/INSUMO:/);
 const seeds=newAcuSeeds(rows);
 assert.deepEqual(seeds[0].expected_resources,rows[0].expected_resources);
 assert.equal(seeds[0].section,plan.work_sections[0].title);
 assert.equal(seeds[0].work_result,rows[0].work_result);
});

test('flat product lines and malformed work hierarchy do not silently become partidas',()=>{
 assert.throws(()=>parseConstructionOutline(JSON.stringify({proposal_lines:[
  {description:'Material aislado',unit:'kg',section:'Materiales'}]})),/rubros con partidas/);
 const incomplete=parseConstructionOutline(JSON.stringify({work_sections:[
  {title:'Área de trabajo',partidas:[{description:'Objeto construido',unit:'m²',resources:[]}]}]}));
 assert.equal(incomplete.length,1);
 assert.equal(incomplete[0].work_result,'');
 assert.ok(incomplete.warnings.some(w=>w.includes('resultado constructivo')));
 const invalidKind=parseConstructionOutline(JSON.stringify({work_sections:[
  {title:'Área de trabajo',partidas:[{description:'Ejecución de muros',unit:'m²',work_result:'Muro terminado',resources:[{name:'Paneles',kind:'other',unit:'un'}]}]}]}));
 assert.equal(invalidKind[0].expected_resources[0].kind,'');
 assert.ok(invalidKind.warnings.some(w=>w.includes('Tipo pendiente')));
});

test('planned required inputs remain pending until mapped to actual consumed IDs, even with an explicit missing override',()=>{
 const seed=newAcuSeeds(parseConstructionOutline(JSON.stringify(plan),brief))[0];
 const proposal={acu_proposals:[{line_id:seed.id,components:[
  {resource_id:'mat-1',quantity:'1',quantity_unit:'kg'},
  {resource_id:'labor-1',quantity:'0.03',quantity_unit:'jor'}
 ],requirement_coverage:[
  {requirement_id:seed.expected_resources[0].id,resource_id:'mat-1',unresolved_reason:''},
  {requirement_id:seed.expected_resources[1].id,resource_id:'labor-1',unresolved_reason:''},
  {requirement_id:seed.expected_resources[2].id,resource_id:'',unresolved_reason:'Todavía no hay una fijación definida'}
 ],missing_resources:[]}]};
 const [row]=parseAcuProposals(JSON.stringify(proposal),[seed],catalog);
 assert.equal(row.missing_resource_drafts.length,1);
 assert.equal(row.missing_resource_drafts[0].description,'Elementos de fijación');
 assert.equal(row.missing_resource_drafts[0].action,'create');
 assert.ok(acuTotals(row,catalog).errors.some(error=>error.includes('Elementos de fijación')));
 row.missing_resolved=true;
 assert.ok(acuTotals(row,catalog).errors.some(error=>error.includes('Elementos de fijación')));
 const tree=buildAcuReviewTree([row],catalog,[],[]);
 assert.equal(tree[0].name,'Montaje de cerramiento exterior');
 assert.equal(tree[0].lines[0].status,'pending');
 assert.ok(tree[0].lines[0].items.some(item=>item.description==='Elementos de fijación'&&item.status==='missing'));
});

test('a fully mapped construction recipe is reviewable, and the ACU model cannot rewrite its rubric',()=>{
 const seed=newAcuSeeds(parseConstructionOutline(JSON.stringify(plan),brief))[0];
 const chosen={...catalog[0]};
 const additional={id:'fix-1',description:'Fijación estructural',unit:'un',kind:'material',price:'90'};
 const other=[...catalog,additional];
 const proposal={acu_proposals:[{line_id:seed.id,section:'Otro rubro inventado por la IA',
  components:[
   {resource_id:'mat-1',quantity:'1',quantity_unit:'kg'},
   {resource_id:'labor-1',quantity:'0.03',quantity_unit:'jor'},
   {resource_id:'fix-1',quantity:'0.5',quantity_unit:'un'}
  ],
  requirement_coverage:[
   {requirement_id:seed.expected_resources[0].id,resource_id:'mat-1'},
   {requirement_id:seed.expected_resources[1].id,resource_id:'labor-1'},
   {requirement_id:seed.expected_resources[2].id,resource_id:'fix-1'}
  ],missing_resources:[]}]};
 const [row]=parseAcuProposals(JSON.stringify(proposal),[seed],other);
 assert.deepEqual(acuTotals(row,other).errors,[]);
 assert.equal(row.section_title,seed.section);
 assert.equal(buildAcuReviewTree([row],other,[],[])[0].lines[0].status,'ready');
});

test('total structural quantity cannot masquerade as per-unit resource consumption',()=>{
 const seed=newAcuSeeds(parseConstructionOutline(JSON.stringify(plan),brief))[0];
 const misleading={acu_proposals:[{line_id:seed.id,components:[{
  resource_id:'mat-1',quantity:'900',quantity_unit:'kg'
 }],missing_resources:[],requirement_coverage:[
  {requirement_id:seed.expected_resources[0].id,resource_id:'mat-1'},
  {requirement_id:seed.expected_resources[1].id,unresolved_reason:'Pendiente'},
  {requirement_id:seed.expected_resources[2].id,unresolved_reason:'Pendiente'}
 ]}]};
 const [row]=parseAcuProposals(JSON.stringify(misleading),[seed],catalog);
 assert.ok(acuTotals(row,catalog).errors.some(error=>error.includes('Consumo desproporcionado')||error.includes('consumo unitario coincide numéricamente')));
});

test('a partially malformed model response preserves valid work lines and reports exact omissions',()=>{
 const mixed={work_sections:[
  {title:'Trabajos de terminación',partidas:[
   {description:'Colocación de terminación',unit:'m²',quantity:null},
   {description:'Partida sin unidad',work_result:'Elemento construido',resources:[]},
   {description:'Montaje de soporte',unit:'kg',work_result:'Soporte instalado',resources:[{name:'Perfiles',kind:'material',unit:'kg'}]},
   {description:'Monto no comprobado',unit:'un',quantity:'no informado',resources:[]}
  ]},
  {title:'Rubro sin partidas',partidas:[]}
 ]};
 const rows=parseConstructionOutline(JSON.stringify(mixed));
 assert.equal(rows.length,3);
 assert.deepEqual(rows.map(row=>row.description),[
  'Colocación de terminación','Montaje de soporte','Monto no comprobado'
 ]);
 assert.equal(rows[0].work_result,'');
 assert.deepEqual(rows[0].expected_resources,[]);
 assert.ok(rows[0].outline_issues.some(w=>w.includes('insumos')));
 assert.equal(rows[2].quantity,null);
 assert.ok(rows.warnings.some(w=>w.includes('Partida sin unidad')));
 assert.ok(rows.warnings.some(w=>w.includes('Rubro sin partidas')||w.includes('Rubro 2')));
 assert.equal(newAcuSeeds(rows)[0].outline_issues.length,2);
});

test('accepts structural field aliases without guessing the work unit',()=>{
 const rows=parseConstructionOutline(JSON.stringify({rubros:[{nombre:'Trabajos de montaje',
  partidas:[{descripcion:'Armado de elemento',unidad:'kg',resultado_constructivo:'Elemento armado',
   insumos:[{nombre:'Acero',tipo:'material',unidad:'kg'}]}]}]}));
 assert.equal(rows[0].unit,'kg');
 assert.equal(rows[0].expected_resources[0].description,'Acero');
 assert.equal(rows.warnings.length,0);
 assert.throws(()=>parseConstructionOutline(JSON.stringify({work_sections:[
  {title:'Frente 1',partidas:[{description:'Trabajo sin unidad',resources:[]}]}
 ]})),/falta unidad medible/);
});

test('optional outline omissions stay visible but do not block an otherwise valid priced ACU',()=>{
 const outline=parseConstructionOutline(JSON.stringify({work_sections:[{
  title:'Obra exterior',partidas:[{description:'Montaje medible',unit:'kg',quantity:'12'}]
 }]}));
 const seed=newAcuSeeds(outline)[0];
 const [row]=parseAcuProposals(JSON.stringify({acu_proposals:[{
  line_id:seed.id,components:[{resource_id:'mat-1',quantity:'1',quantity_unit:'kg'}],
  missing_resources:[]
 }]}),[seed],catalog);
 const result=acuTotals(row,catalog);
 assert.equal(result.errors.length,0);
 assert.ok(result.warnings.some(warning=>warning.includes('Planificación para revisar')));
});
