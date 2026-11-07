import { test, expect } from "@playwright/test";

async function bridge(page, options={}) {
 await page.addInitScript((fixture) => {
  const project = { id: "10000000-0000-4000-8000-000000000001", name: "Obra de prueba", client_id: "client-1", currency: "Ars", organization_id:"org-own",organization_name:"Mi organización",organization_locked:true,read_only:false };
  const line = { id: "10000000-0000-4000-8000-000000000002", description: "Hormigón", unit: "m³", quantity: "2", unit_cost: "100", total: "200", analysis_id: null };
  const lines=[line]; if(fixture.twoLines)lines.push({...line,id:"10000000-0000-4000-8000-000000000003",description:"Revoque"});
  const sections=fixture.twoLines?[{id:"10000000-0000-4000-8000-000000000004",code:"01",title:"Preliminares",parent_id:null,position:0}]:[];
  const assignments=[];const lineDetails={};
  let backupSettings={directory:'/data/CPOBRAS/backups',enabled:false,interval_minutes:60,last_success:null,last_file:null,last_error:null};const backupCopies=[];

  const estimate = { id: "estimate-1", title: "Presupuesto inicial", currency: "ARS", issued: Boolean(fixture.issued) };
  const totals = { direct: "200", general_expenses: "0", financial_expenses: "0", profit: "0", discount: "0", taxable_subtotal: "200", taxes: "0", total: "200" };
  const makePriceRow=(label,kind,role,percent='0')=>({id:crypto.randomUUID(),label,kind,role,enabled:true,subtract:false,percent,amount:'0',detail_mode:'reference',reference_percent:percent,items:[]});
  let priceDefinition={rows:[makePriceRow('Gastos generales','detailed','overhead'),makePriceRow('Beneficio','percent_direct','profit'),makePriceRow('Subtotal','subtotal','other'),makePriceRow('IVA','percent_subtotal','tax')]},priceRevision=0;const priceTemplates=[];
  function calculatePrice(definition){let running=Number(totals.direct),profit=0;const rows=[];for(const row of definition.rows){const item_totals={};let detail=0;for(const i of row.items.filter(i=>!i.group)){const v=Number(i.quantity)*Number(i.unit_price)*Number(i.participation_percent)/100;detail+=v;item_totals[i.id]=String(v);let parent=i.parent_id;while(parent){item_totals[parent]=String(Number(item_totals[parent]||0)+v);parent=row.items.find(i=>i.id===parent)?.parent_id;}}const base=row.kind==='percent_direct'?Number(totals.direct):row.kind==='percent_profit'?profit:running;const reference=Number(totals.direct)*Number(row.reference_percent)/100;const raw=row.kind==='subtotal'?running:row.kind==='fixed'?Number(row.amount):row.kind==='detailed'?row.detail_mode==='items'?detail:row.detail_mode==='manual'?Number(row.amount):reference:base*Number(row.percent)/100;const amount=row.enabled?raw*(row.subtract?-1:1):0;if(row.enabled&&row.kind!=='subtotal'){running+=amount;if(row.role==='profit')profit+=amount;}rows.push({...row,base:String(base),amount:String(amount),running_total:String(running),detail_total:String(detail),reference_total:String(reference),item_totals});}return {rows,breakdown:{...totals,total:String(running)}};}
  const resources=[{ id: "resource-1", code: "MAT-1", description: "Acero", unit: "kg", kind: "material", price: "100" }];
  const resourcePrices={};const templates=[];
  const sourceProject={...project,id:'source-project',name:'Obra modelo'};
  const sourceDocument={format_version:1,currency:'Ars',title:'Modelo de cómputo',rates:{},line_analyses:[],sections:[{id:'src-parent',parent_id:null,code:'01',title:'Estructura modelo',position:0},{id:'src-child',parent_id:'src-parent',code:'01.01',title:'Terminaciones modelo',position:1},{id:'src-other',parent_id:null,code:'02',title:'Otros modelo',position:2},{id:'src-empty',parent_id:null,code:'03',title:'Rubro vacío',position:3}],lines:[{id:'src-a',description:'Columna modelo',unit:'m³',quantity:'2',unit_cost_snapshot:'10',analysis_id:null},{id:'src-b',description:'Muro modelo',unit:'m²',quantity:'6',unit_cost_snapshot:'20',analysis_id:null},{id:'src-c',description:'Pintura modelo',unit:'m²',quantity:'3',unit_cost_snapshot:'30',analysis_id:null}],assignments:[['src-a','src-parent'],['src-b','src-child'],['src-c','src-other']],formulas:[{line_id:'src-a',expression:'x',variables:{x:'2'}}],takeoffs:[{line_id:'src-b',factor:'2',length:'3',width:'1',height:'1',sign:1,position:0,note:'Pared'}]};
  function patternPart(source,selection){const d=structuredClone(source),sectionIds=new Set(selection.section_ids),lineIds=new Set(selection.line_ids);let previous=-1;while(previous!==sectionIds.size){previous=sectionIds.size;for(const r of d.sections)if(sectionIds.has(r.parent_id))sectionIds.add(r.id);}for(const[l,r]of d.assignments)if(sectionIds.has(r))lineIds.add(l);for(const[l,r]of d.assignments)if(lineIds.has(l))sectionIds.add(r);previous=-1;while(previous!==sectionIds.size){previous=sectionIds.size;for(const r of d.sections)if(sectionIds.has(r.id)&&r.parent_id)sectionIds.add(r.parent_id);}d.lines=d.lines.filter(l=>lineIds.has(l.id));d.sections=d.sections.filter(r=>sectionIds.has(r.id));d.assignments=d.assignments.filter(([l])=>lineIds.has(l));return d;}
  let publicPrint={revision:0,profile:{company_name:'',trade_name:'',professional_name:'',qualification:'',tax_id:'',address:'',phone:'',email:'',website:'',footer:'',logo_png:[]}};
  const organizations=[{id:'org-own',name:'Mi organización',ownership:'own',owner_peer_id:null,company_id:null,revision:0,profile:structuredClone(publicPrint.profile),is_default:true}];
  if(fixture.organizations)organizations.push({id:'org-other',name:'Otra propia',ownership:'own',company_id:'org-other',revision:1,profile:{...structuredClone(publicPrint.profile),company_name:'Emisor B'},is_default:false},{id:'org-external',name:'Organización recibida',ownership:'external',owner_peer_id:'remote-owner',company_id:null,revision:3,profile:{...structuredClone(publicPrint.profile),company_name:'Propietario remoto'},is_default:false});
  const projectList=fixture.patterns||fixture.context?[project,sourceProject]:[project];
  const persons=[{id:'client-1',name:'Comitente',cuit:null,code:'',email:'',phone:'',address:'',role:'client',revision:1,supplier_record_id:null},{id:'supplier-1',name:fixture.people?'Corralón García':'Proveedor de prueba',cuit:fixture.people?'30-12345678-9':null,code:'',email:fixture.people?'ventas@garcia.test':'',phone:'',address:'',role:'supplier',revision:1,supplier_record_id:'supplier-1'}];
  const normalizePerson=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const operations=[],warehouses=[];
  const operationReport=()=>({project_id:project.id,name:project.name,as_of:"2026-11-05",estimate_id:estimate.id,summaries:[{currency:"ARS",budget_cost:"200",budget_sale:"200",committed:"0",accrued:"0",paid:"0",collected:"0",payable:"0",receivable:"0",overdue_payable:"0",overdue_receivable:"0",cash:"0",cost_to_finish:"200",expected_result:"0",physical_percent:"0",certified:"0"}],cash_flow:[],production:[],costs:[],quotes:[],needs:[],alerts:[],scheduled_finish:null,planned_percent:null});
  const records = fixture.context?[{id:'center-one',kind:'cost_center',name:'Centro obra de prueba',project_id:project.id,attributes:{},revision:1},{id:'center-two',kind:'cost_center',name:'Centro obra modelo',project_id:sourceProject.id,attributes:{},revision:1}]:[]; const nested = []; const calls = []; let plan = null;
  window.__calls = calls;
  const schedule = current => ({ tasks: current.tasks.map((task, index) => ({ id: task.id, start: "2026-11-05", finish: "2026-11-09", start_day: index, finish_day: index + task.duration_days, float_days: 0, critical: true })), duration_days: current.tasks.reduce((n, task) => n + task.duration_days, 0), finish: "2026-11-09", curve: [{ date: "2026-11-05", period_cost: "100", cumulative_cost: "100" }], budget: "100", planned_progress: "50", actual_progress: current.tasks[0]?.actual_progress || "0", warnings: [] });
  window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
   calls.push({ command, args: structuredClone(args) });
   if(command==='list_persons')return structuredClone(persons.filter(p=>p.role===args.role||p.role==='both'));
   if(command==='save_person'){let p=args.id?persons.find(p=>p.id===args.id):null;if((p?.revision||0)!==args.revision)throw new Error('El contacto cambió. Recargá');const tax=normalizePerson(args.person.cuit);if(tax&&persons.some(q=>q.id!==args.id&&normalizePerson(q.cuit)===tax))throw new Error('Ya existe una persona con ese CUIT');if(p){const role=p.role===args.role?p.role:'both';Object.assign(p,args.person,{role,revision:p.revision+1});if(role!=='client')p.supplier_record_id||=p.id;}else{p={id:crypto.randomUUID(),...args.person,role:args.role,revision:1,supplier_record_id:null};if(args.role!=='client')p.supplier_record_id=p.id;persons.push(p);}return structuredClone(p);}
   if(command==='add_person_role'){const p=persons.find(p=>p.id===args.id);if(p.revision!==args.revision)throw new Error('Recargá');p.role=p.role===args.role?p.role:'both';p.revision++;if(p.role!=='client')p.supplier_record_id||=p.id;return structuredClone(p);}
   if(command==='find_similar_persons'){const q=normalizePerson(args.person.name),tax=normalizePerson(args.person.cuit);return structuredClone(persons.filter(p=>p.id!==args.excludeId).map(person=>({person,score:tax&&tax===normalizePerson(person.cuit)?100:q.length>=3&&(normalizePerson(person.name).includes(q)||q.includes(normalizePerson(person.name)))?88:0,reason:tax?'Mismo CUIT':'Nombre parecido'})).filter(m=>m.score>0));}
   if(command==='update_project'){const p=projectList.find(p=>p.id===args.projectId);Object.assign(p,{name:args.projectName,client_id:args.clientId,supplier_ids:args.supplierIds||p.supplier_ids||[]});return p;}
   if(command==='list_organizations')return structuredClone(organizations);
   if(command==='get_organization')return structuredClone(organizations.find(o=>o.id===args.organizationId));
   if(command==='set_default_organization'){const selected=organizations.find(o=>o.id===args.organizationId);if(selected.ownership!=='own')throw new Error('Solo propia');for(const o of organizations)o.is_default=o.id===args.organizationId;return null;}
   if(command==='create_organization'){const o={id:crypto.randomUUID(),name:args.name,ownership:'own',company_id:null,revision:1,profile:{...structuredClone(publicPrint.profile),company_name:args.name},is_default:false};o.company_id=o.id;organizations.push(o);records.push({id:o.id,kind:'company',name:args.name,attributes:{},revision:1});return structuredClone(o);}
   if(command==='save_organization'){const o=organizations.find(o=>o.id===args.organizationId);if(o.ownership!=='own')throw new Error('Solo lectura');if(o.revision!==args.revision)throw new Error('Recargá');Object.assign(o,{name:args.name,profile:structuredClone(args.profile),company_id:o.company_id||o.id,revision:o.revision+1});if(!records.some(r=>r.id===o.company_id))records.push({id:o.company_id,kind:'company',name:o.name,attributes:{},revision:1});return structuredClone(o);}
   if(command==='create_project'){const o=organizations.find(o=>o.id===(args.organizationId||organizations.find(x=>x.is_default).id));const p={id:crypto.randomUUID(),name:args.projectName,client_id:args.clientId,currency:'Ars',organization_id:o.id,organization_name:o.name,organization_locked:false,read_only:false,supplier_ids:args.supplierIds||[]};projectList.push(p);return p;}
   if(command==='get_print_profile')return structuredClone(publicPrint);
   if(command==='save_print_profile'){if(args.revision!==publicPrint.revision)throw new Error('Recargá');publicPrint={revision:publicPrint.revision+1,profile:structuredClone(args.profile)};return structuredClone(publicPrint);}
   if(command==='open_export_pdf'){if(fixture.readerFails)throw new Error('No hay lector PDF asociado');return null;}
   if(command==='get_budget_print_data'){const calculation=calculatePrice(priceDefinition),direct=Number(totals.direct),total=Number(calculation.breakdown.total);let cumulative=0,allocated=0,pct=0;const printLines=lines.map(l=>{const cost=Number(l.total);cumulative+=cost;const next=direct?Math.round(cumulative/direct*total*100)/100:0,sale=next-allocated;allocated=next;const nextPct=total?Math.round(next/total*1000000)/10000:0,incidence=nextPct-pct;pct=nextPct;return{id:l.id,direct_total:l.total,sale_total:String(sale),sale_unit:String(Number(l.quantity)?sale/Number(l.quantity):0),incidence_percent:String(incidence),cumulative_percent:String(nextPct)};});return {document:{title:estimate.title,currency:'Ars',lines:lines.map(l=>({...l,unit_cost_snapshot:l.unit_cost})),sections,assignments:assignments.map(a=>[a.line_id,a.section_id])},estimate,project,client:{id:'client-1',name:'Comitente',cuit:null},profile:structuredClone(organizations.find(o=>o.id===project.organization_id).profile),calculation,lines:printLines,final_total:String(total),unallocated_total:direct?'0':String(total)};}
   if (command === "list_clients") return persons.filter(p=>p.role!=="supplier").map(p=>({id:p.id,name:p.name,cuit:p.cuit}));
   if (command === "list_projects") return projectList;
   if (command === "list_resources") return resources;
   if(command==='create_resource'){const r={id:'resource-'+(resources.length+1),...args};resources.push(r);return r;}
   if(command==='list_operations')return operations;
   if(command==='list_warehouses')return warehouses;
   if(command==='create_warehouse'){warehouses.push(args.warehouse);return args.warehouse;}
   if(command==='stock_balances')return [];
   if(command==='operations_report')return {...operationReport(),project_id:args.projectId,name:args.projectId===sourceProject.id?sourceProject.name:project.name,estimate_id:args.estimateId};
   if(command==='operations_portfolio')return [operationReport()];
   if(command==='post_operation'){const o={...args.operation,calculated:{}};operations.push(o);return o;}
   if (command === "list_analyses") return [];
   if (command === "list_project_estimates") return args.projectId==='source-project'?[{id:'source-estimate',title:'Modelo de cómputo',currency:'ARS',issued:true}]:fixture.context?[estimate,{...estimate,id:'estimate-2',title:'Alternativa emitida',issued:true}]:[estimate];
   if(command==='get_estimate_resource_prices')return resourcePrices;
   if(command==='list_budget_templates')return templates;
   if(command==='get_pattern_document')return args.source.template_id?templates.find(t=>t.id===args.source.template_id).document:sourceDocument;
   if(command==='save_budget_pattern'){const template={id:'template-'+(templates.length+1),name:args.name,document:patternPart(args.source.template_id?templates.find(t=>t.id===args.source.template_id).document:sourceDocument,args.selection)};if(!args.includePrices)for(const l of template.document.lines)l.unit_cost_snapshot='0';templates.push(template);return template;}
   if(command==='apply_budget_pattern'){const d=patternPart(args.source.template_id?templates.find(t=>t.id===args.source.template_id).document:sourceDocument,args.selection),mapping=new Map(d.sections.map(r=>[r.id,'new-'+r.id+'-'+calls.length])),ids=[];for(const r of d.sections)sections.push({...r,id:mapping.get(r.id),parent_id:r.parent_id?mapping.get(r.parent_id):args.parentId});for(const l of d.lines){const id='new-'+l.id+'-'+calls.length,price=args.includePrices?l.unit_cost_snapshot:'0';lines.push({id,description:l.description,unit:l.unit,quantity:l.quantity,unit_cost:price,total:String(Number(price)*Number(l.quantity)),analysis_id:null});ids.push(id);const assignment=d.assignments.find(([line])=>line===l.id);if(assignment)assignments.push({line_id:id,section_id:mapping.get(assignment[1])});}return {line_ids:ids,section_ids:[...mapping.values()],takeoff_count:d.takeoffs.length};}
   if (command === "list_estimate_lines") return fixture.context&&args.estimateId==='source-estimate'?[{...line,id:'other-line',description:'Partida obra modelo',total:'900'}]:lines;

   if(command==='get_backup_settings')return structuredClone(backupSettings);
   if(command==='save_backup_settings'){
    if(!args.settings.directory.startsWith('/'))throw new Error('Elegí una ruta absoluta');
    backupSettings={...backupSettings,...args.settings};return structuredClone(backupSettings);
   }
   if(command==='list_backups'){if(fixture.unavailableBackup)throw new Error('Carpeta de respaldo no disponible');return backupCopies;}
   if(command==='create_backup'){
    if(fixture.unavailableBackup)throw new Error('La carpeta de respaldo no está disponible');
    const id=crypto.randomUUID();backupSettings.last_success=1794056400;backupSettings.last_file='cpobras-manual-2026-11-07-'+id+'.sqlite';backupCopies.unshift({id,name:backupSettings.last_file,directory:backupSettings.directory,created_at:1794056400,bytes:1048576});return id;
   }
   if(command==='open_backup_folder'||command==='verify_database')return null;
   if (command === "list_budget_sections") return sections;
   if (command === "list_line_sections") return assignments;
   if (command === "get_analysis_details") return lineDetails[args.analysisId];
   if (command === "move_budget_line"){
    const index=lines.findIndex(row=>row.id===args.lineId),[moving]=lines.splice(index,1);const before=args.beforeId?lines.findIndex(row=>row.id===args.beforeId):lines.length;lines.splice(before,0,moving);
    const assigned=assignments.findIndex(row=>row.line_id===args.lineId);if(assigned>=0)assignments.splice(assigned,1);if(args.sectionId)assignments.push({line_id:args.lineId,section_id:args.sectionId});return null;
   }
   if(command === "delete_estimate_line"){const index=lines.findIndex(row=>row.id===args.lineId);lines.splice(index,1);return null;}
   if(command === "save_line_resources"){
    const selected=lines.find(row=>row.id===args.lineId);const id="private-"+calls.length;const cost=args.components.reduce((sum,row)=>sum+Number(row.quantity)*Number(row.unitPrice),0);
    selected.analysis_id=id;selected.unit_cost=String(cost);selected.total=String(cost*Number(selected.quantity));
    for(const row of args.components)resourcePrices[row.resourceId]=row.unitPrice;
    lineDetails[id]={is_line_owned:true,code:"PART",description:selected.description,unit:selected.unit,unit_cost:String(cost),components:args.components.map(row=>({resource_id:row.resourceId,description:resources.find(r=>r.id===row.resourceId)?.description,kind:"material",quantity:row.quantity,unit_price:row.unitPrice,total:String(Number(row.quantity)*Number(row.unitPrice))}))};
    for(const l of lines){const detail=lineDetails[l.analysis_id];if(!detail)continue;for(const c of detail.components){c.unit_price=resourcePrices[c.resource_id];c.total=String(Number(c.quantity)*Number(c.unit_price));}detail.unit_cost=String(detail.components.reduce((n,c)=>n+Number(c.total),0));l.unit_cost=detail.unit_cost;l.total=String(Number(l.quantity)*Number(l.unit_cost));}
    return id;
   }
   if (command === "list_budget_sections" || command === "list_line_sections" || command === "list_backups" || command === "list_budget_templates" || command === "list_plan_revisions" || command === "list_plan_baselines" || command === "list_fx_quotes" || command === "scoped_price_history") return [];
   if (command === "list_management_records") return args.kind==='supplier'?persons.filter(p=>p.role!=='client').map(p=>({id:p.supplier_record_id,kind:'supplier',name:p.name,attributes:{person_id:p.id,person_primary:'true'}})):records.filter(record => record.kind === args.kind);
   if (command === "save_management_record") { const record = { ...args.record, revision: args.record.revision + 1 }; const old = records.findIndex(item => item.id === record.id); if (old >= 0) records[old] = record; else records.push(record); return record; }
   if (command === "list_change_events") return [{ sequence: 1, entity_type: "management_records", entity_id: records[0]?.id, operation: "insert", occurred_at: "2026-11-05 10:00" }];
   if (command === "get_project_plan") return plan;
   if (command === "calculate_schedule") return schedule(args.plan);
   if (command === "save_project_plan") { plan = { project_id: args.projectId, revision: args.revision + 1, plan: args.plan }; return plan; }
   if (command === "get_estimate_pricing") return { general_expenses_percent: "0", financial_expenses_percent: "0", profit_percent: "0", discount_percent: "0", tax_percent: "0" };
   if(command==='get_price_definition')return {revision:priceRevision,custom:priceRevision>0,definition:structuredClone(priceDefinition),direct:totals.direct,calculation:calculatePrice(priceDefinition),calculation_error:null};
   if(command==='calculate_price_definition')return calculatePrice(args.definition);
   if(command==='save_price_definition'){if(estimate.issued)throw new Error('Presupuesto emitido');if(args.revision!==priceRevision)throw new Error('Recargá');priceDefinition=structuredClone(args.definition);priceRevision++;return {revision:priceRevision,calculation:calculatePrice(priceDefinition),direct:totals.direct};}
   if(command==='list_price_templates')return priceTemplates;
   if(command==='save_price_template'){const template={...structuredClone(args),id:crypto.randomUUID()};priceTemplates.push(template);return template;}
   if (command === "priced_estimate_total"&&fixture.context&&['estimate-2','source-estimate'].includes(args.estimateId))return {...totals,direct:args.estimateId==='estimate-2'?'500':'900',total:args.estimateId==='estimate-2'?'500':'900'};
   if (command === "priced_estimate_total") return priceRevision?{...calculatePrice(priceDefinition).breakdown,rows:calculatePrice(priceDefinition).rows}:totals;
   if (command === "export_budget_document") return { format_version: 1, currency: "Ars", title: estimate.title, lines: [{ ...line, estimate_id: estimate.id, position: 0, unit_cost_snapshot: line.unit_cost }], sections: [], assignments: [], rates: {}, takeoffs: [] };
   if (command === "edit_budget_lines") {Object.assign(line,args.changes[0]);return null;}
   if(command === "update_estimate_line"){const selected=lines.find(row=>row.id===args.lineId);Object.assign(selected,{description:args.description,unit:args.unit,quantity:args.quantity,unit_cost:args.unitCost,total:String(Number(args.quantity)*Number(args.unitCost))});return selected;}
   if (command === "set_line_formula") return "5.5";
   if (command === "write_export") return "/data/CPOBRAS/exports/presupuesto." + args.name.split(".").at(-1);
   if (command === "list_price_lists") return [{ id: "list-1", name: "Proveedor", currency: "ARS", zone: "Buenos Aires", valid_from: "2026-11-01" }];
   if (command === "list_nested_analyses") return nested;
   if (command === "save_nested_analysis") { nested.push(args.analysis); return null; }
   if (command === "calculate_nested_cost") return { unit_cost: Object.keys(args.changes).length ? "110" : "100", resource_quantities: { "resource-1": "1" } };
   throw new Error("Comando no previsto en la prueba: " + command);
  } };
 },options);
 await page.goto("/");
 await expect(page.getByText("Obra de prueba", { exact: true }).first()).toBeVisible();
}

test("organizations unify company identity and related establishment directories", async ({ page }) => {
 await bridge(page);await page.getByRole('button',{name:'Organizaciones',exact:true}).click();await page.getByRole('row').filter({hasText:'Mi organización'}).getByRole('button',{name:'Abrir',exact:true}).click();
 await page.getByLabel('Nombre de la organización',{exact:true}).fill('Constructora Sur');await page.getByLabel('Razón social / empresa',{exact:true}).fill('Constructora Sur');await page.getByRole('button',{name:'Guardar organización',exact:true}).click();
 await page.getByRole('button',{name:'Directorios de la organización',exact:true}).click();await page.getByRole('button',{name:'Nuevo registro',exact:true}).click();await page.getByLabel('Nombre',{exact:true}).fill('Sede Buenos Aires');await page.getByLabel('Domicilio',{exact:true}).fill('Av. Central 123');await page.getByRole('button',{name:'Guardar ficha',exact:true}).click();await expect(page.getByRole('cell',{name:'Sede Buenos Aires',exact:true})).toBeVisible();
 const saved=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_management_record').at(-1).args.record);expect(saved.company_id).toBe('org-own');expect(saved.attributes.address).toBe('Av. Central 123');
});

test("planner saves a task, progress and resource assignment and renders Gantt", async ({ page }) => {
 await bridge(page); await page.getByRole("button", { name: "Abrir ›", exact: true }).first().click(); await page.getByRole("button", { name: "Planificación", exact: true }).click();
 await page.getByRole("button", { name: "Nueva tarea / hito", exact: true }).click();
 await page.getByLabel("Nombre", { exact: true }).fill("Excavación");
 await page.getByLabel("Duración en días laborables (0 = hito)").fill("3");
 await page.getByLabel("Costo previsto (se toma de la partida cuando hay vínculo)").fill("300");
 await page.getByLabel("Avance real %").fill("25");
 await page.getByRole("button", { name: "Guardar tarea y recalcular", exact: true }).click();
 await expect(page.locator(".gantt-bar")).toHaveCount(1);
 await expect(page.locator(".gantt-label")).toContainText("Excavación");
 const saved = await page.evaluate(() => window.__calls.filter(call => call.command === "save_project_plan").at(-1).args);
 expect(saved.plan.tasks[0].duration_days).toBe(3); expect(saved.plan.tasks[0].actual_progress).toBe("25");
 await page.locator(".gantt-label").click(); await page.getByRole("button", { name: "Asignar recurso", exact: true }).click();
 await page.getByLabel("Unidades por día").fill("2"); await page.getByRole("button", { name: "Guardar tarea y recalcular", exact: true }).click();
 const last = await page.evaluate(() => window.__calls.filter(call => call.command === "save_project_plan").at(-1).args);
 expect(last.plan.tasks[0].assignments[0].units_per_day).toBe("2");
});

test("nested ACU preserves fields when components are added and calculates a scenario", async ({ page }) => {
 await bridge(page); await page.getByRole("button", { name: "Costos y precios", exact: true }).click();
 await page.getByRole("button", { name: "Nuevo ACU compuesto", exact: true }).click();
 await page.getByLabel("Código", { exact: true }).fill("ACU-C");
 await page.getByLabel("Descripción", { exact: true }).fill("Estructura compuesta");
 await page.getByRole("button", { name: "Agregar componente", exact: true }).click();
 await expect(page.getByLabel("Código", { exact: true })).toHaveValue("ACU-C");
 await page.getByLabel("Consumo o fórmula").fill("largo * ancho");
 await page.getByLabel("Variables (por ejemplo largo=3; ancho=2)").fill("largo=3; ancho=2");
 await page.getByRole("button", { name: "Guardar análisis", exact: true }).click();
 await page.getByLabel("Variación de precio %").fill("10");
 await page.getByRole("button", { name: "Calcular escenario", exact: true }).click();
 await expect(page.locator(".compare-cards")).toContainText("110,00");
 const saved = await page.evaluate(() => window.__calls.find(call => call.command === "save_nested_analysis").args.analysis);
 expect(saved.components[0].variables).toEqual({ largo: "3", ancho: "2" });
});

test("budget tools submit an atomic bulk edit and generate a PDF", async ({ page }) => {
 await bridge(page); await page.getByRole("button", { name: "Abrir ›", exact: true }).first().click();
 await page.getByRole("button", { name: "Herramientas / exportar", exact: true }).click();
 await expect(page.getByRole("navigation",{name:"Navegación principal"}).getByRole("button",{name:"Presupuesto",exact:true})).toHaveAttribute("aria-current","page");
 const form = page.locator("#budget-bulk-form"); await form.locator('input[name^="description-"]').fill("Hormigón actualizado");
 await form.locator('input[name^="quantity-"]').fill("3.25");
 await page.getByRole("button", { name: "Guardar edición masiva", exact: true }).click();
 const saved = await page.evaluate(() => window.__calls.find(call => call.command === "edit_budget_lines").args);
 expect(saved.changes[0].quantity).toBe("3.25"); expect(saved.order).toHaveLength(1);
 await page.getByRole("combobox", { name: "Formato", exact: true }).selectOption("pdf");
 await page.getByRole("button", { name: "Generar archivo", exact: true }).click();
 await expect(page.getByText("/data/CPOBRAS/exports/presupuesto.pdf", { exact: true })).toBeVisible();
});

test("navigation marks the active section and every section explains its purpose",async({page})=>{
 await bridge(page);
 for(const [label,help]of [["Costos y precios","Costos y precios"],["Organizaciones","Organizaciones"],["Clientes","Clientes"],["Insumos","Catálogo de insumos"],["ACU","Biblioteca de ACU"]]){
  const tab=page.getByRole('button',{name:label,exact:true}).first();await tab.click();await expect(tab).toHaveAttribute('aria-current','page');await expect(page.getByRole('complementary',{name:'Ayuda: '+help,exact:true})).toBeVisible();
 }
});

test("line handles reorder and move into a section",async({page})=>{
 await bridge(page,{twoLines:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).click();
 const first=page.locator('.line-row').filter({hasText:'Hormigón'}),second=page.locator('.line-row').filter({hasText:'Revoque'});
 await second.locator('.line-drag-handle').dragTo(first,{targetPosition:{x:140,y:2}});
 await expect(page.locator('.line-row .col-desc').first()).toHaveText('Revoque');
 await second.locator('.line-drag-handle').dragTo(page.locator('[data-drop-section]'));
 await expect.poll(()=>page.evaluate(()=>window.__calls.filter(row=>row.command==='move_budget_line').at(-1)?.args.sectionId)).toBe('10000000-0000-4000-8000-000000000004');
 await expect(page.getByRole('status')).toContainText('Preliminares');
});

test("double click edits a different line and right click opens software actions",async({page})=>{
 await bridge(page,{twoLines:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).click();
 const row=page.locator('.line-row').filter({hasText:'Revoque'});await row.dblclick({position:{x:150,y:12}});
 await expect(page.getByRole('heading',{name:'Editar partida',exact:true})).toBeVisible();
 await page.getByLabel('Descripción',{exact:true}).fill('Revoque fino');await page.getByRole('button',{name:'Guardar',exact:true}).click();
 await expect(page.locator('.line-row')).toContainText(['Hormigón','Revoque fino']);
 await page.locator('.line-row').filter({hasText:'Revoque fino'}).click({button:'right'});
 await expect(page.getByRole('menu',{name:'Acciones de CPOBRAS'})).toBeVisible();await page.getByRole('menuitem',{name:'Asignar / editar insumos',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Agregar insumo a la partida',exact:true})).toBeVisible();
});

test("assigning a catalog resource directly recalculates the selected line",async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).click();
 await page.getByRole('tab',{name:'Insumos',exact:true}).click();await expect(page.getByRole('tab',{name:'Insumos',exact:true})).toHaveAttribute('aria-selected','true');
 await page.getByRole('button',{name:'Asignar',exact:true}).click();await expect(page.getByRole('heading',{name:'Agregar insumo a la partida',exact:true})).toBeVisible();
 await page.getByLabel('Rendimiento / unidad',{exact:true}).fill('2.5');await page.getByRole('button',{name:'Guardar',exact:true}).click();
 await expect(page.locator('.detail-content')).toContainText('Precio calculado por insumos');
 await expect(page.locator('.line-row .partial')).toHaveText('500,00');
 const saved=await page.evaluate(()=>window.__calls.find(row=>row.command==='save_line_resources').args);expect(saved.components[0]).toEqual({resourceId:'resource-1',quantity:'2.5',unitPrice:'100'});
});

test("issued budgets disable editing, assignment and drag handles",async({page})=>{
 await bridge(page,{issued:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).click();
 await expect(page.locator('.line-drag-handle')).toBeDisabled();
 await page.locator('.line-row').click({button:'right'});await expect(page.getByRole('menuitem',{name:'Asignar / editar insumos',exact:true})).toBeDisabled();
 await page.keyboard.press('Escape');await expect(page.getByRole('menu')).toHaveCount(0);
});

test("backdrop clicks preserve popup drafts and explicit closing confirms discarded edits",async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).click();
 await page.getByRole('button',{name:'＋ Partida',exact:true}).click();
 await page.getByLabel('Descripción',{exact:true}).fill('Trabajo todavía sin guardar');
 await page.locator('.modal-overlay').click({position:{x:5,y:5}});
 await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByLabel('Descripción',{exact:true})).toHaveValue('Trabajo todavía sin guardar');
 page.once('dialog',async dialog=>{expect(dialog.message()).toContain('cambios sin guardar');await dialog.dismiss();});
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByLabel('Descripción',{exact:true})).toHaveValue('Trabajo todavía sin guardar');
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('dialog').getByRole('button',{name:'Cerrar',exact:true}).last().click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(await page.evaluate(()=>window.__calls.some(row=>row.command==='add_estimate_line'))).toBe(false);
});

test('fuzzy resource search creates a resource in a child popup and preserves composition',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.getByRole('tab',{name:'Insumos',exact:true}).click();await page.getByRole('button',{name:'Asignar',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Buscar insumo 1'})).toHaveAttribute('aria-expanded','false');
 await page.getByLabel('Rendimiento / unidad',{exact:true}).fill('3');await page.getByRole('button',{name:'Guardar',exact:true}).click();
 await page.getByRole('button',{name:'＋ Agregar insumo',exact:true}).click();
 const search=page.getByRole('combobox',{name:'Buscar insumo 1'});await search.fill('acreo');await expect(page.getByRole('option',{name:'MAT-1 · Acero (kg)'})).toBeVisible();
 await search.fill('Cemento especial');await page.getByRole('option',{name:'＋ Agregar «Cemento especial»'}).click();
 const child=page.getByRole('dialog',{name:'Crear insumo sin salir'});await child.getByLabel('Código',{exact:true}).fill('MAT-2');await child.getByLabel('Precio inicial ARS',{exact:true}).fill('250');
 await page.locator('.quick-resource-overlay').click({position:{x:2,y:2}});await expect(child).toBeVisible();
 page.once('dialog',d=>d.dismiss());await page.keyboard.press('Escape');await expect(child).toBeVisible();
 await child.getByRole('button',{name:'Guardar y seleccionar',exact:true}).click();await expect(child).toHaveCount(0);await expect(search).toHaveValue('MAT-2 · Cemento especial');
 await expect(page.locator('.component-row')).toHaveCount(1);await page.getByRole('button',{name:'Guardar',exact:true}).click();const saved=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_line_resources').at(-1).args);expect(saved.components[1].resourceId).toBe('resource-2');expect(saved.components[1].unitPrice).toBe('250');expect(saved.components[0].quantity).toBe('3');
});

test('operations creates warehouses and procurement documents without losing form rows',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await expect(page.getByRole('navigation',{name:'Etapas de gestión'})).toBeVisible();await page.screenshot({path:'/workspace/cpobras-operations.png'});
 await page.getByText('Depósitos y existencias',{exact:true}).click();await page.getByLabel('Nombre del depósito',{exact:true}).fill('Central');await page.getByLabel('Ubicación / estante',{exact:true}).fill('A1');await page.getByRole('button',{name:'Crear depósito',exact:true}).click();
 await page.getByLabel('Número / referencia',{exact:true}).fill('SOL-001');await page.getByLabel('Descripción del renglón',{exact:true}).fill('Material pendiente');await page.getByLabel('Cantidad del período / movimiento',{exact:true}).fill('5');await page.getByRole('button',{name:'Agregar renglón',exact:true}).click();await expect(page.getByLabel('Número / referencia',{exact:true})).toHaveValue('SOL-001');await expect(page.getByLabel('Cantidad del período / movimiento',{exact:true}).first()).toHaveValue('5');
 await page.getByLabel('Descripción del renglón',{exact:true}).nth(1).fill('Otro material');await page.getByRole('button',{name:'Registrar solicitud de materiales',exact:true}).click();await expect(page.getByRole('dialog',{name:'Documento registrado'})).toBeVisible();await page.locator('.modal-overlay').click({position:{x:2,y:2}});await expect(page.getByRole('dialog',{name:'Documento registrado'})).toBeVisible();await page.keyboard.press('Escape');
 const saved=await page.evaluate(()=>window.__calls.find(c=>c.command==='post_operation').args.operation);expect(saved.kind).toBe('request');expect(saved.lines).toHaveLength(2);expect(saved.lines[0].quantity).toBe('5');
 await page.getByRole('combobox',{name:'Tipo de documento',exact:true}).selectOption('rfq');await page.getByRole('combobox',{name:'Documento de origen',exact:true}).selectOption(saved.id);await expect(page.getByLabel('Descripción del renglón',{exact:true}).first()).toHaveValue('Material pendiente');
});

test('production, certification, finances and dashboard screens expose their workflows',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();
 await page.getByRole('button',{name:'Producción',exact:true}).click();await page.getByLabel('Número / referencia',{exact:true}).fill('PARTE-001');await page.getByLabel('Descripción del renglón',{exact:true}).fill('Cuadrilla Pérez');await page.getByLabel('Horas trabajadas / equipo',{exact:true}).fill('8');await page.getByLabel('Costo por hora',{exact:true}).fill('100');await page.getByRole('button',{name:'Registrar parte diario',exact:true}).click();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Certificaciones',exact:true}).click();await page.getByRole('combobox',{name:'Tipo de documento',exact:true}).selectOption('index');await page.getByLabel('Número / referencia',{exact:true}).fill('IPC-NOV');await page.getByLabel('URL de la publicación / fuente',{exact:true}).fill('https://www.indec.gob.ar/publicacion');await page.getByLabel('Valor del índice',{exact:true}).fill('123.45');await page.getByRole('button',{name:'Registrar índice de precios',exact:true}).click();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Finanzas',exact:true}).click();await page.getByLabel('Número / referencia',{exact:true}).fill('FAC-001');await page.getByLabel('Importe',{exact:true}).fill('500');await page.getByRole('combobox',{name:'Contraparte',exact:true}).selectOption('supplier-1');await page.getByRole('button',{name:'Registrar factura por pagar',exact:true}).click();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Tablero',exact:true}).click();await expect(page.getByRole('columnheader',{name:'Resultado esperado',exact:true})).toBeVisible();await page.getByRole('combobox',{name:'Contenido del informe',exact:true}).selectOption('summary');await page.getByRole('button',{name:'Informe PDF',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Guardado en'})).toBeVisible();
 const kinds=await page.evaluate(()=>window.__calls.filter(c=>c.command==='post_operation').map(c=>c.args.operation.kind));expect(kinds).toEqual(['daily','index','payable']);
});

test('operational drafts survive rejected navigation and are cleared only after explicit discard',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await page.getByRole('button',{name:'Finanzas',exact:true}).click();await page.getByLabel('Número / referencia',{exact:true}).fill('BORRADOR');
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'← Inicio',exact:true}).click();await expect(page.getByLabel('Número / referencia',{exact:true})).toHaveValue('BORRADOR');
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'← Inicio',exact:true}).click();await page.getByRole('button',{name:'Insumos',exact:true}).click();await expect(page.getByRole('heading',{name:'Biblioteca de insumos',exact:true})).toBeVisible();await page.getByRole('button',{name:'Inicio / Obras',exact:true}).click();await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();
 await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await expect(page.getByLabel('Número / referencia',{exact:true})).toHaveValue('');await expect(page.getByRole('heading',{name:'Factura por pagar',exact:true})).toBeVisible();
});

test('double clicking one component opens only that item and preserves the rest on save',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.getByRole('tab',{name:'Insumos',exact:true}).click();await page.getByRole('button',{name:'Asignar',exact:true}).click();await page.getByRole('button',{name:'Guardar',exact:true}).click();
 await page.getByRole('button',{name:'＋ Agregar insumo',exact:true}).click();const search=page.getByRole('combobox',{name:'Buscar insumo 1'});await search.fill('Otro');await page.getByRole('option',{name:'＋ Agregar «Otro»'}).click();const child=page.getByRole('dialog',{name:'Crear insumo sin salir'});await child.getByLabel('Precio inicial ARS').fill('200');await child.getByRole('button',{name:'Guardar y seleccionar'}).click();await page.getByLabel('Rendimiento / unidad',{exact:true}).fill('2');await page.getByRole('button',{name:'Guardar',exact:true}).click();
 await page.locator('.line-resource-row').filter({hasText:'Acero'}).dblclick();await expect(page.getByRole('heading',{name:'Editar insumo de la partida'})).toBeVisible();await page.screenshot({path:'/workspace/cpobras-single-component.png'});await expect(page.locator('.component-row')).toHaveCount(1);await expect(page.getByRole('listbox')).toHaveCount(0);await page.getByLabel('Rendimiento / unidad',{exact:true}).fill('3');await page.getByRole('button',{name:'Guardar',exact:true}).click();
 const saved=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_line_resources').at(-1).args);expect(saved.components.map(c=>c.quantity)).toEqual(['3','2']);await expect(page.locator('.line-resource-row')).toHaveCount(2);await expect(page.locator('.line-row .partial')).toHaveText('1.400,00');
});

test('units support searching and creating within quick resource creation without losing either parent',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.getByRole('button',{name:'＋ Agregar insumo',exact:true}).click();await page.getByLabel('Rendimiento / unidad',{exact:true}).fill('4');const search=page.getByRole('combobox',{name:'Buscar insumo 1'});await search.fill('Pintura');await page.getByRole('option',{name:'＋ Agregar «Pintura»'}).click();const resource=page.getByRole('dialog',{name:'Crear insumo sin salir'});await resource.getByLabel('Precio inicial ARS').fill('350');const unit=resource.getByRole('combobox',{name:'Unidad',exact:true});await expect(unit).toHaveAttribute('aria-expanded','false');await unit.fill('kilo');await page.getByRole('option',{name:'kg · Kilogramo'}).click();await expect(unit).toHaveValue('kg');
 await unit.fill('balde');await page.getByRole('option',{name:'＋ Agregar unidad «balde»'}).click();const dialog=page.getByRole('dialog',{name:'Agregar unidad',exact:true});await dialog.getByLabel('Nombre de la unidad').fill('Balde de 20 litros');await page.screenshot({path:'/workspace/cpobras-unit-create.png'});await page.locator('.unit-create-overlay').click({position:{x:2,y:2}});await expect(dialog).toBeVisible();page.once('dialog',d=>d.dismiss());await page.keyboard.press('Escape');await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'Guardar y seleccionar unidad'}).click();await expect(dialog).toHaveCount(0);await expect(unit).toHaveValue('balde');await expect(resource.getByLabel('Precio inicial ARS')).toHaveValue('350');await resource.getByRole('button',{name:'Guardar y seleccionar',exact:true}).click();await expect(page.getByLabel('Rendimiento / unidad',{exact:true})).toHaveValue('4');await page.getByRole('button',{name:'Guardar',exact:true}).click();
 const calls=await page.evaluate(()=>window.__calls);expect(calls.find(c=>c.command==='create_resource').args.unit).toBe('balde');expect(calls.find(c=>c.command==='save_management_record').args.record.attributes.symbol).toBe('balde');
});

test('resource and unit dropdowns close on selection or an outside click without closing popups',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.getByRole('button',{name:'＋ Agregar insumo',exact:true}).click();const search=page.getByRole('combobox',{name:'Buscar insumo 1'});await search.fill('acero');await expect(search).toHaveAttribute('aria-expanded','true');await page.getByRole('heading',{name:'Agregar insumo a la partida'}).click();await expect(search).toHaveAttribute('aria-expanded','false');await expect(page.getByRole('dialog')).toBeVisible();await expect(search).toHaveValue('acero');
 await search.click();await expect(search).toHaveAttribute('aria-expanded','true');await search.click();await expect(search).toHaveAttribute('aria-expanded','false');await search.click();await page.getByRole('option',{name:'MAT-1 · Acero (kg)'}).click();await expect(search).toHaveAttribute('aria-expanded','false');await expect(search).toHaveValue('MAT-1 · Acero');
 await search.fill('Pintura');await page.getByRole('option',{name:'＋ Agregar «Pintura»'}).click();const child=page.getByRole('dialog',{name:'Crear insumo sin salir'}),unit=child.getByRole('combobox',{name:'Unidad',exact:true});await unit.fill('kilo');await expect(unit).toHaveAttribute('aria-expanded','true');await child.getByRole('heading',{name:'Nuevo insumo'}).click();await expect(unit).toHaveAttribute('aria-expanded','false');await expect(unit).toHaveValue('kilo');await expect(child).toBeVisible();await unit.click();await page.getByRole('option',{name:'kg · Kilogramo'}).click();await expect(unit).toHaveAttribute('aria-expanded','false');await expect(unit).toHaveValue('kg');
 await unit.click();await page.locator('.quick-resource-overlay').click({position:{x:2,y:2}});await expect(unit).toHaveAttribute('aria-expanded','false');await expect(child).toBeVisible();
});

test('deleting a line with assigned resources removes its composition from the view and keeps the catalog',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.getByRole('tab',{name:'Insumos',exact:true}).click();await page.getByRole('button',{name:'Asignar',exact:true}).click();await page.getByRole('button',{name:'Guardar',exact:true}).click();await expect(page.locator('.line-resource-row')).toHaveCount(1);page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Eliminar partida',exact:true}).click();await expect(page.locator('.line-row')).toHaveCount(0);await expect(page.locator('.line-resource-row')).toHaveCount(0);await page.getByRole('button',{name:'← Inicio',exact:true}).click();await page.getByRole('button',{name:'Insumos',exact:true}).click();await expect(page.getByRole('cell',{name:'Acero',exact:true})).toBeVisible();
});

test('patterns select rubros or individual lines in a tree and append quantities without duplicating selection',async({page})=>{
 await bridge(page,{patterns:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.getByRole('button',{name:'Patrones de cómputo',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Patrones de cómputo',exact:true});await expect(dialog.getByRole('combobox',{name:'Obra de origen',exact:true})).toHaveValue('source-project');await page.getByRole('checkbox',{name:'Rubro Estructura modelo',exact:true}).check();await expect(page.getByRole('checkbox',{name:'Partida Columna modelo'})).toBeChecked();await expect(page.getByRole('checkbox',{name:'Partida Muro modelo'})).toBeChecked();await expect(page.getByRole('checkbox',{name:'Partida Pintura modelo'})).not.toBeChecked();
 await page.getByRole('checkbox',{name:'Partida Muro modelo'}).uncheck();await expect(page.getByRole('checkbox',{name:'Rubro Estructura modelo',exact:true})).toBeChecked({indeterminate:true});await page.getByLabel('Nombre del patrón',{exact:true}).fill('Columna típica');await page.getByRole('button',{name:'Guardar selección como patrón',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Patrón guardado'})).toBeVisible();await expect(page.locator('.line-row')).toHaveCount(1);
 await page.getByRole('checkbox',{name:'Rubro Estructura modelo',exact:true}).check();await page.screenshot({path:'/workspace/cpobras-pattern-preview.png'});await page.locator('.patterns-overlay').click({position:{x:2,y:2}});await expect(dialog).toBeVisible();page.once('dialog',d=>d.dismiss());await page.keyboard.press('Escape');await expect(dialog).toBeVisible();await page.getByRole('button',{name:'Incorporar selección',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.locator('.line-row')).toHaveCount(3);await expect(page.locator('.line-row').filter({hasText:'Columna modelo'}).locator('.partial')).toHaveText('0,00');await expect(page.locator('.line-row').filter({hasText:'Muro modelo'})).toContainText('6');const call=await page.evaluate(()=>window.__calls.find(c=>c.command==='apply_budget_pattern').args);expect(call.includePrices).toBe(false);expect(call.source.estimate_id).toBe('source-estimate');
});

test('saved computation patterns can be selected and incorporated with prices',async({page})=>{
 await bridge(page,{patterns:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.getByRole('button',{name:'Patrones de cómputo',exact:true}).click();await page.getByRole('checkbox',{name:'Partida Muro modelo'}).check();await page.getByLabel('Nombre del patrón',{exact:true}).fill('Muro típico');await page.getByRole('combobox',{name:'Precios al incorporar',exact:true}).selectOption('true');await page.getByRole('button',{name:'Guardar selección como patrón',exact:true}).click();await page.getByRole('combobox',{name:'Origen del patrón',exact:true}).selectOption('template');await expect(page.getByRole('combobox',{name:'Patrón guardado',exact:true})).toContainText('Muro típico');await page.getByRole('checkbox',{name:'Partida Muro modelo'}).check();await page.getByRole('button',{name:'Incorporar selección',exact:true}).click();await expect(page.locator('.line-row').filter({hasText:'Muro modelo'}).locator('.partial')).toHaveText('120,00');const call=await page.evaluate(()=>window.__calls.find(c=>c.command==='apply_budget_pattern').args);expect(call.includePrices).toBe(true);expect(call.source.template_id).toBe('template-1');
});

test('one resource price is reused and updating it recalculates all lines in the budget',async({page})=>{
 await bridge(page,{twoLines:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.getByRole('tab',{name:'Insumos',exact:true}).click();await page.getByRole('button',{name:'Asignar',exact:true}).click();await page.getByLabel('Rendimiento / unidad',{exact:true}).fill('2');await page.getByRole('button',{name:'Guardar',exact:true}).click();await page.locator('.line-row').filter({hasText:'Revoque'}).click();await page.getByRole('button',{name:'＋ Agregar insumo',exact:true}).click();await page.getByRole('combobox',{name:'Buscar insumo 1'}).fill('acero');await page.getByRole('option',{name:'MAT-1 · Acero (kg)'}).click();await expect(page.getByLabel('Precio unitario ARS',{exact:true})).toHaveValue('100');await page.getByLabel('Rendimiento / unidad',{exact:true}).fill('3');await page.getByRole('button',{name:'Guardar',exact:true}).click();await page.locator('.line-row').filter({hasText:'Hormigón'}).click();await page.locator('.line-resource-row').dblclick();await page.getByLabel('Precio unitario ARS',{exact:true}).fill('120');await page.getByRole('button',{name:'Guardar',exact:true}).click();await expect(page.locator('.line-row').filter({hasText:'Hormigón'}).locator('.partial')).toHaveText('480,00');await expect(page.locator('.line-row').filter({hasText:'Revoque'}).locator('.partial')).toHaveText('720,00');await page.locator('.line-row').filter({hasText:'Revoque'}).click();await page.locator('.line-resource-row').dblclick();await expect(page.getByLabel('Precio unitario ARS',{exact:true})).toHaveValue('120');await expect(page.getByLabel('Rendimiento / unidad',{exact:true})).toHaveValue('3');
});

test('issued budgets can supply saved patterns while incorporating into them remains disabled',async({page})=>{
 await bridge(page,{patterns:true,issued:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.getByRole('button',{name:'Patrones de cómputo',exact:true}).click();await expect(page.getByRole('button',{name:'Incorporar selección',exact:true})).toBeDisabled();await page.getByRole('checkbox',{name:'Partida Muro modelo'}).check();await page.getByLabel('Nombre del patrón',{exact:true}).fill('Patrón desde emitido');await page.getByRole('button',{name:'Guardar selección como patrón',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Patrón guardado'})).toBeVisible();
});

test('price determination details, modal protection, percentages, saving and export', async({page})=>{
 await page.setViewportSize({width:1600,height:1000});
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.getByRole('button',{name:'Determinación de precio',exact:true}).first().click();
 await expect(page.getByRole('heading',{name:'Determinación de precio',exact:true})).toBeVisible();
 await page.locator('.price-right').getByRole('button',{name:'Con detalle',exact:true}).click();
 await page.getByRole('button',{name:'＋ Grupo',exact:true}).click();await page.getByLabel('Descripción del detalle').fill('Administración');await page.locator('.price-modal button[type=submit]').click();
 await page.getByRole('button',{name:'＋ Ítem',exact:true}).click();await page.getByLabel('Descripción del detalle').fill('Oficina');await page.getByLabel('Grupo del detalle').selectOption({label:'Administración'});await page.getByLabel('Cantidad del detalle').fill('2');await page.getByLabel('Precio del detalle ARS').fill('100');await page.getByLabel('Participación %',{exact:true}).fill('25');
 await page.locator('.price-modal').click({position:{x:3,y:3}});await expect(page.getByLabel('Descripción del detalle')).toHaveValue('Oficina');await page.locator('.price-modal button[type=submit]').click();
 await expect(page.locator('.price-detail-totals')).toContainText('50,00');
 await page.getByLabel('Porcentaje Beneficio',{exact:true}).fill('15');await expect(page.locator('.summary-final')).toContainText('280,00');
 await page.getByLabel('Porcentaje IVA',{exact:true}).fill('21');await expect(page.locator('.summary-final')).toContainText('338,80');
 await page.getByRole('button',{name:'Guardar determinación',exact:true}).click();await expect(page.locator('.price-status')).toContainText('Valores guardados');
 await page.screenshot({path:'/workspace/cpobras-price-determination.png'});
 const saved=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_price_definition').at(-1).args);expect(saved.definition.rows[0].items).toHaveLength(2);expect(saved.definition.rows[0].detail_mode).toBe('items');
 await page.getByRole('button',{name:'Guardar plantilla',exact:true}).click();await page.getByLabel('Nombre de plantilla').fill('Modelo oficina');await page.locator('.price-modal button[type=submit]').click();
 await page.getByRole('button',{name:'Exportar',exact:true}).click();await page.getByLabel('Formato de exportación').selectOption('pdf');await page.locator('.price-modal button[type=submit]').click();await expect(page.locator('.price-left')).toContainText('presupuesto.pdf');
 await page.getByRole('button',{name:'← Presupuesto',exact:true}).click();await page.getByRole('tab',{name:'Resumen',exact:true}).click();await expect(page.locator('.summary-final')).toContainText('338,80');
});

test('price determination issued controls are disabled',async({page})=>{
 await bridge(page,{issued:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.getByRole('button',{name:'Determinación de precio',exact:true}).first().click();await expect(page.getByRole('button',{name:'Guardar determinación',exact:true})).toBeDisabled();await expect(page.getByLabel('Tipo de cálculo')).toBeDisabled();await expect(page.getByLabel('Nombre de línea 1')).toBeDisabled();
});

test('price determination modes, ordering, templates and dirty navigation are explicit',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.getByRole('button',{name:'Determinación de precio',exact:true}).first().click();
 await page.getByLabel('Referencia % del costo directo').fill('10');await expect(page.locator('.summary-final')).toContainText('220,00');
 await page.getByRole('button',{name:'Monto manual',exact:true}).click();await page.getByLabel('Monto manual del concepto').fill('50');await expect(page.locator('.summary-final')).toContainText('250,00');
 await page.getByLabel('Porcentaje Beneficio').fill('10');await expect(page.locator('.summary-final')).toContainText('270,00');
 await page.locator('[data-price-row]').nth(1).getByRole('button',{name:'% costo directo',exact:true}).click();await page.getByLabel('Tipo de cálculo').selectOption('percent_subtotal');await expect(page.locator('.summary-final')).toContainText('275,00');
 await page.getByRole('button',{name:'Subir Beneficio',exact:true}).click();await expect(page.locator('.summary-final')).toContainText('270,00');
 await page.getByLabel('Activar Gastos generales',{exact:true}).uncheck();await expect(page.locator('.summary-final')).toContainText('220,00');
 await page.getByRole('button',{name:'Guardar plantilla',exact:true}).click();await page.getByLabel('Nombre de plantilla').fill('Orden y modos');await page.locator('.price-modal button[type=submit]').click();
 await page.getByLabel('Activar Gastos generales',{exact:true}).check();await expect(page.locator('.summary-final')).toContainText('270,00');await page.getByLabel('Plantilla de determinación o detalle').selectOption({label:'Determinación · Orden y modos'});
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Cargar plantilla',exact:true}).click();await expect(page.locator('.summary-final')).toContainText('220,00');
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await expect(page.getByRole('heading',{name:'Determinación de precio',exact:true})).toBeVisible();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'← Presupuesto',exact:true}).click();await expect(page.locator('.total-head')).toContainText('200,00');
});

test('home catalogs and project tabs keep one project across planning, data and operations',async({page})=>{
 await bridge(page,{context:true});const nav=page.getByRole('navigation',{name:'Navegación principal'});
 await expect(nav.getByRole('button',{name:'Clientes',exact:true})).toBeVisible();await expect(nav.getByRole('button',{name:'Planificación',exact:true})).toHaveCount(0);
 await page.getByRole('row').filter({hasText:'Obra de prueba'}).getByRole('button',{name:'Abrir ›',exact:true}).click();
 await expect(nav.getByRole('button',{name:'Clientes',exact:true})).toHaveCount(0);await expect(nav.getByRole('button',{name:'Costos y precios',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Planificación',exact:true}).click();await expect(page.locator('[name=planning-project]')).toHaveCount(0);await expect(page.getByRole('region',{name:'Contexto de la obra'})).toContainText('Obra de prueba');
 await page.getByRole('button',{name:'Datos de obra',exact:true}).click();await page.getByRole('combobox',{name:'Directorio',exact:true}).selectOption('cost_center');await expect(page.getByRole('cell',{name:'Centro obra de prueba',exact:true})).toBeVisible();await expect(page.getByRole('cell',{name:'Centro obra modelo',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'← Inicio',exact:true}).click();await expect(page.getByRole('region',{name:'Contexto de la obra'})).toHaveCount(0);
 await page.getByRole('row').filter({hasText:'Obra modelo'}).getByRole('button',{name:'Abrir ›',exact:true}).click();await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await expect(page.locator('[name=ops-project],[name=ops-estimate]')).toHaveCount(0);
 await expect(page.getByRole('region',{name:'Contexto de la obra'})).toContainText('Obra modelo');expect(await page.evaluate(()=>window.__calls.filter(c=>c.command==='operations_report').at(-1).args)).toMatchObject({projectId:'source-project',estimateId:'source-estimate'});
 await page.getByRole('button',{name:'Planificación',exact:true}).click();expect(await page.evaluate(()=>window.__calls.filter(c=>c.command==='get_project_plan').at(-1).args.projectId)).toBe('source-project');
 await page.getByRole('button',{name:'Datos de obra',exact:true}).click();await page.getByRole('combobox',{name:'Directorio',exact:true}).selectOption('cost_center');await expect(page.getByRole('cell',{name:'Centro obra modelo',exact:true})).toBeVisible();await expect(page.getByRole('cell',{name:'Centro obra de prueba',exact:true})).toHaveCount(0);
 await page.screenshot({path:'/workspace/cpobras-project-context.png'});
});

test('budget switching confirms the version, preserves rejected drafts and updates all report context',async({page})=>{
 await bridge(page,{context:true});await page.getByRole('row').filter({hasText:'Obra de prueba'}).getByRole('button',{name:'Abrir ›',exact:true}).click();await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();
 const picker=page.getByRole('combobox',{name:'Presupuesto activo',exact:true});
 page.once('dialog',d=>d.dismiss());await picker.selectOption('estimate-2');await expect(picker).toHaveValue('estimate-1');
 await page.getByLabel('Número / referencia',{exact:true}).fill('No perder');
 let count=0;const rejectDraft=async dialog=>{count++;if(count===1)await dialog.accept();else await dialog.dismiss();};page.on('dialog',rejectDraft);await picker.selectOption('estimate-2');await expect(picker).toHaveValue('estimate-1');await expect(page.getByLabel('Número / referencia',{exact:true})).toHaveValue('No perder');page.off('dialog',rejectDraft);
 const accept=dialog=>dialog.accept();page.on('dialog',accept);await picker.selectOption('estimate-2');await expect(picker).toHaveValue('estimate-2');await expect(page.locator('.total-head')).toContainText('500,00');page.off('dialog',accept);
 expect(await page.evaluate(()=>window.__calls.filter(c=>c.command==='operations_report').at(-1).args)).toMatchObject({projectId:'10000000-0000-4000-8000-000000000001',estimateId:'estimate-2'});
 await page.getByRole('button',{name:'Presupuesto',exact:true}).click();await expect(picker).toHaveValue('estimate-2');await expect(page.locator('.status-pill')).toContainText('Emitido');
});

test('planning and project data protect their pending edits before leaving the project',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.getByRole('button',{name:'Planificación',exact:true}).click();await page.getByRole('button',{name:'Nueva tarea / hito',exact:true}).click();await page.getByLabel('Nombre',{exact:true}).fill('Pendiente');
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'← Inicio',exact:true}).click();await expect(page.getByLabel('Nombre',{exact:true})).toHaveValue('Pendiente');
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Datos de obra',exact:true}).click();await page.getByRole('button',{name:'Nuevo registro',exact:true}).click();await page.getByLabel('Nombre',{exact:true}).fill('Ficha pendiente');
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Presupuesto',exact:true}).click();await expect(page.getByLabel('Nombre',{exact:true})).toHaveValue('Ficha pendiente');await expect(page.getByRole('combobox',{name:'Obra relacionada',exact:true})).toHaveCount(0);
});

test('global portfolio remains available from home and is separate from an open project',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Cartera de obras',exact:true}).click();await expect(page.getByRole('heading',{name:'Cartera de obras',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Contexto de la obra'})).toHaveCount(0);
 await page.getByRole('button',{name:'Informe PDF',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Guardado en'})).toBeVisible();
 await page.getByRole('button',{name:'Inicio / Obras',exact:true}).click();await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await expect(page.getByRole('button',{name:'Cartera de obras',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await page.getByRole('button',{name:'Tablero',exact:true}).click();await expect(page.locator('.context-help').filter({hasText:'presupuesto activo indicado arriba'})).toBeVisible();
});

test('public print identity and logo persist independently and appear in client printing',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Organizaciones',exact:true}).click();await page.getByRole('row').filter({hasText:'Mi organización'}).getByRole('button',{name:'Abrir',exact:true}).click();await page.getByLabel('Razón social / empresa',{exact:true}).fill('Constructora Sur');await page.getByLabel('Nombre del profesional',{exact:true}).fill('Profesional público');await page.getByLabel('CUIT / identificación fiscal',{exact:true}).fill('30-123');await page.getByLabel('Correo público',{exact:true}).fill('publico@example.test');
 await page.locator('[name=print-logo]').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP43qH1HwAGzAKpX36DZQAAAABJRU5ErkJggg==','base64')});await expect(page.getByRole('img',{name:'Logotipo público',exact:true})).toBeVisible();await page.getByRole('button',{name:'Guardar organización',exact:true}).click();
 const saved=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_organization').at(-1).args);expect(saved.profile.logo_png.length).toBeGreaterThan(30);expect(saved.profile.company_name).toBe('Constructora Sur');
 await page.getByRole('button',{name:'Inicio / Obras',exact:true}).click();await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.getByRole('button',{name:'Imprimir presupuesto',exact:true}).click();await expect(page.locator('.print-preview-heading')).toContainText('Constructora Sur');await expect(page.getByRole('img',{name:'Logotipo del emisor',exact:true})).toBeVisible();await expect(page.getByRole('columnheader',{name:'Costo directo',exact:true})).toHaveCount(0);
 await page.getByRole('textbox',{name:'Condiciones y observaciones públicas',exact:true}).fill('Validez: 15 días');await page.getByRole('button',{name:'Generar documento',exact:true}).click();await expect(page.locator('.print-export-result')).toContainText('presupuesto.pdf');expect(await page.evaluate(()=>window.__calls.filter(c=>c.command==='open_export_pdf').at(-1).args.path)).toContain('.pdf');
});

test('internal and incidence printing preserve entered conditions and can export Excel',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.getByRole('button',{name:'Imprimir presupuesto',exact:true}).click();await page.getByRole('textbox',{name:'Condiciones y observaciones públicas',exact:true}).fill('Condición conservada');await page.getByRole('combobox',{name:'Presentación',exact:true}).selectOption('internal');await expect(page.getByRole('textbox',{name:'Condiciones y observaciones públicas',exact:true})).toHaveValue('Condición conservada');await expect(page.getByRole('columnheader',{name:'Costo directo',exact:true})).toBeVisible();await expect(page.locator('.print-preview')).toContainText('Determinación de precio');
 await page.getByRole('combobox',{name:'Presentación',exact:true}).selectOption('incidences');await expect(page.getByRole('columnheader',{name:'Incidencia %',exact:true})).toBeVisible();await expect(page.locator('.print-preview')).toContainText('Incidencia total: 100 %');await page.getByRole('combobox',{name:'Salida',exact:true}).selectOption('xlsx');await page.getByRole('button',{name:'Generar documento',exact:true}).click();await expect(page.locator('.print-export-result')).toContainText('.xlsx');expect(await page.evaluate(()=>window.__calls.filter(c=>c.command==='open_export_pdf').length)).toBe(0);
});

test('reader failures keep the generated PDF available to reopen',async({page})=>{
 await bridge(page,{readerFails:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.getByRole('button',{name:'Imprimir presupuesto',exact:true}).click();await page.getByRole('button',{name:'Generar documento',exact:true}).click();await expect(page.locator('.print-export-result')).toContainText('No hay lector PDF asociado');await expect(page.getByRole('button',{name:'Abrir PDF',exact:true})).toBeVisible();await expect(page.locator('.print-export-result')).toContainText('.pdf');
});

test('organization default preselects only new projects and external identity is readonly',async({page})=>{
 await bridge(page,{organizations:true});await page.getByRole('button',{name:'Organizaciones',exact:true}).click();await expect(page.getByRole('button',{name:'Datos de impresión',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Organización',exact:true})).toHaveCount(0);
 const external=page.getByRole('row').filter({hasText:'Organización recibida'});await expect(external).toContainText('Externa · solo lectura');await expect(external.getByRole('button',{name:'Usar como predeterminada',exact:true})).toBeDisabled();await external.getByRole('button',{name:'Consultar',exact:true}).click();await expect(page.getByLabel('Razón social / empresa',{exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Guardar organización',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Volver a organizaciones',exact:true}).click();await page.getByRole('row').filter({hasText:'Otra propia'}).getByRole('button',{name:'Usar como predeterminada',exact:true}).click();await expect(page.getByRole('row').filter({hasText:'Otra propia'})).toContainText('✓ Para obras nuevas');
 await page.getByRole('button',{name:'Inicio / Obras',exact:true}).click();await page.getByRole('row').filter({hasText:'Obra de prueba'}).getByRole('button',{name:'Editar',exact:true}).click();await expect(page.getByRole('combobox',{name:'Organización de la obra',exact:true})).toHaveValue('org-own');await page.getByRole('button',{name:'Cerrar',exact:true}).first().click();
 await page.getByRole('button',{name:'＋ Nueva obra',exact:true}).click();await expect(page.getByRole('combobox',{name:'Organización de la obra',exact:true})).toHaveValue('org-other');await expect(page.getByRole('combobox',{name:'Organización de la obra',exact:true}).locator('option')).toHaveCount(2);await page.getByLabel('Nombre de la obra',{exact:true}).fill('Obra de otra organización');await page.getByRole('button',{name:'Guardar',exact:true}).click();expect(await page.evaluate(()=>window.__calls.filter(c=>c.command==='create_project').at(-1).args.organizationId)).toBe('org-other');await expect(page.getByRole('row').filter({hasText:'Obra de prueba'})).toContainText('Mi organización');
});

test('new own organizations can be edited and default changes do not replace the print owner',async({page})=>{
 await bridge(page,{organizations:true});await page.getByRole('button',{name:'Organizaciones',exact:true}).click();await page.getByRole('button',{name:'Nueva organización',exact:true}).click();await page.getByLabel('Nombre de la organización',{exact:true}).fill('Empresa nueva');await page.getByRole('button',{name:'Crear organización',exact:true}).click();await expect(page.getByLabel('Razón social / empresa',{exact:true})).toHaveValue('Empresa nueva');await page.getByLabel('Correo público',{exact:true}).fill('nuevo@example.test');await page.getByRole('button',{name:'Guardar organización',exact:true}).click();
 await page.getByRole('button',{name:'Volver a organizaciones',exact:true}).click();await page.getByRole('row').filter({hasText:'Otra propia'}).getByRole('button',{name:'Usar como predeterminada',exact:true}).click();await page.screenshot({path:'/workspace/cpobras-organizations.png'});
 await page.getByRole('button',{name:'Inicio / Obras',exact:true}).click();await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.getByRole('button',{name:'Imprimir presupuesto',exact:true}).click();await expect(page.locator('.print-preview-heading')).not.toContainText('Emisor B');
});

test('clients and suppliers stay separate and importing adds a role without duplicating a person',async({page})=>{
 await bridge(page,{people:true});await page.getByRole('button',{name:'Clientes',exact:true}).click();await expect(page.getByRole('cell',{name:'Corralón García',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Importar desde proveedores',exact:true}).click();await page.getByRole('button',{name:'Incorporar como cliente',exact:true}).click();await expect(page.getByRole('cell').filter({hasText:'Corralón García'})).toBeVisible();
 expect(await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_person').length)).toBe(0);expect(await page.evaluate(()=>window.__calls.filter(c=>c.command==='add_person_role').at(-1).args)).toMatchObject({id:'supplier-1',role:'client'});
 await page.getByRole('row').filter({hasText:'Corralón García'}).getByRole('button',{name:'Editar cliente',exact:true}).click();await page.getByLabel('Teléfono del contacto',{exact:true}).fill('1144556677');await page.getByRole('button',{name:'Guardar contacto',exact:true}).click();await page.getByRole('button',{name:'Proveedores',exact:true}).click();await expect(page.getByRole('row').filter({hasText:'Corralón García'})).toContainText('1144556677');await expect(page.getByRole('cell',{name:'Comitente',exact:true})).toHaveCount(0);
});

test('new contact suggests reusing a similar opposite-role person and preserves drafts on outside click',async({page})=>{
 await bridge(page,{people:true});await page.getByRole('button',{name:'Clientes',exact:true}).click();await page.getByRole('button',{name:'Nuevo cliente',exact:true}).click();await page.getByLabel('Nombre / razón social',{exact:true}).fill('Corralon Garcia');await page.getByLabel('CUIT / identificación',{exact:true}).fill('30123456789');await expect(page.locator('.person-matches')).toContainText('Mismo CUIT');await page.locator('.person-overlay').click({position:{x:2,y:2}});await expect(page.getByLabel('Nombre / razón social',{exact:true})).toHaveValue('Corralon Garcia');await page.getByRole('button',{name:'Incorporar como cliente',exact:true}).click();await expect(page.getByRole('row').filter({hasText:'Corralón García'})).toBeVisible();
});

test('project quick creation and importing contacts preserve the project form and select the saved persons',async({page})=>{
 await bridge(page,{people:true});await page.getByRole('button',{name:'＋ Nueva obra',exact:true}).click();await page.getByLabel('Nombre de la obra',{exact:true}).fill('Obra con contactos nuevos');await page.getByRole('button',{name:'＋ Crear cliente',exact:true}).click();const child=page.getByRole('dialog',{name:'Nuevo cliente',exact:true});await child.getByLabel('Nombre / razón social',{exact:true}).fill('Cliente de obra nuevo');await child.getByLabel('CUIT / identificación',{exact:true}).fill('20-11111111-1');await child.getByRole('button',{name:'Crear cliente',exact:true}).click();await expect(page.getByLabel('Nombre de la obra',{exact:true})).toHaveValue('Obra con contactos nuevos');await expect(page.getByRole('combobox',{name:'Cliente / comitente',exact:true})).toHaveValue(/.+/);
 await page.getByRole('button',{name:'Importar desde Clientes',exact:true}).click();await page.getByLabel('Buscar contacto para incorporar',{exact:true}).fill('Cliente de obra nuevo');await page.getByRole('button',{name:'Incorporar como proveedor',exact:true}).click();await expect(page.getByRole('checkbox',{name:'Cliente de obra nuevo',exact:false})).toBeChecked();await expect(page.getByLabel('Nombre de la obra',{exact:true})).toHaveValue('Obra con contactos nuevos');await page.getByRole('button',{name:'Guardar',exact:true}).click();const saved=await page.evaluate(()=>window.__calls.filter(c=>c.command==='create_project').at(-1).args);expect(saved.clientId).toBe(saved.supplierIds[0]);expect(saved.projectName).toBe('Obra con contactos nuevos');
});

test('editing a project can create and select a supplier while retaining its client and organization',async({page})=>{
 await bridge(page,{people:true});await page.getByRole('row').filter({hasText:'Obra de prueba'}).getByRole('button',{name:'Editar',exact:true}).click();await page.getByLabel('Nombre de la obra',{exact:true}).fill('Obra con proveedor nuevo');await page.getByRole('button',{name:'＋ Crear proveedor',exact:true}).click();const child=page.getByRole('dialog',{name:'Nuevo proveedor',exact:true});await child.getByLabel('Nombre / razón social',{exact:true}).fill('Proveedor nuevo de obra');await child.getByLabel('CUIT / identificación',{exact:true}).fill('30-55555555-5');await child.getByRole('button',{name:'Crear proveedor',exact:true}).click();await expect(page.getByRole('combobox',{name:'Cliente / comitente',exact:true})).toHaveValue('client-1');await expect(page.getByRole('combobox',{name:'Organización de la obra',exact:true})).toHaveValue('org-own');await expect(page.getByRole('checkbox',{name:'Proveedor nuevo de obra',exact:false})).toBeChecked();await expect(page.getByLabel('Nombre de la obra',{exact:true})).toHaveValue('Obra con proveedor nuevo');await page.getByRole('button',{name:'Guardar',exact:true}).click();expect(await page.evaluate(()=>window.__calls.filter(c=>c.command==='update_project').at(-1).args.supplierIds.length)).toBe(1);
 await page.getByRole('button',{name:'Clientes',exact:true}).click();await expect(page.getByRole('row').filter({hasText:'Proveedor nuevo de obra'})).toHaveCount(0);await page.getByRole('button',{name:'Proveedores',exact:true}).click();await expect(page.getByRole('row').filter({hasText:'Proveedor nuevo de obra'})).toBeVisible();await page.screenshot({path:'/workspace/cpobras-person-suppliers.png'});
});


test('backup settings persist a synchronized folder and manual backups show their destination',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Copias de seguridad',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Copias de seguridad'});
 await dialog.getByLabel('Carpeta de respaldos').fill('/home/usuario/Nube/Respaldos CPOBRAS');
 await dialog.getByLabel('Crear copias automáticas').check();await dialog.getByLabel('Frecuencia').selectOption('15');
 await dialog.getByRole('button',{name:'Crear copia ahora'}).click();
 await expect(dialog.locator('.modal-error')).toContainText('Guardá la configuración');
 await expect(dialog.getByLabel('Carpeta de respaldos')).toHaveValue('/home/usuario/Nube/Respaldos CPOBRAS');
 await dialog.getByRole('button',{name:'Guardar configuración'}).click();
 await expect.poll(()=>page.evaluate(()=>window.__calls.filter(x=>x.command==='save_backup_settings').at(-1)?.args.settings)).toEqual({directory:'/home/usuario/Nube/Respaldos CPOBRAS',enabled:true,interval_minutes:15});
 await dialog.getByRole('button',{name:'Crear copia ahora'}).click();
 await expect(dialog.locator('.backup-list')).toContainText('1.00 MB');await expect(dialog.locator('.backup-list')).toContainText('/home/usuario/Nube/Respaldos CPOBRAS');
 await dialog.getByRole('button',{name:'Abrir carpeta',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__calls.filter(x=>x.command==='open_backup_folder').length)).toBe(1);
 await dialog.getByRole('button',{name:'Cerrar',exact:true}).last().click();await page.getByRole('button',{name:'Copias de seguridad',exact:true}).click();
 await expect(dialog.getByLabel('Crear copias automáticas')).toBeChecked();await expect(dialog.getByLabel('Frecuencia')).toHaveValue('15');
 await page.screenshot({path:'/workspace/cpobras-backup-settings.png'});
});
test('backup configuration stays editable when storage is unavailable and failed saves keep the draft',async({page})=>{
 await bridge(page,{unavailableBackup:true});await page.getByRole('button',{name:'Copias de seguridad',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Copias de seguridad'});
 await expect(dialog.locator('.backup-error')).toContainText('no disponible');
 await dialog.getByLabel('Carpeta de respaldos').fill('ruta relativa');await dialog.getByRole('button',{name:'Guardar configuración'}).click();
 await expect(dialog.locator('.modal-error')).toContainText('ruta absoluta');await expect(dialog.getByLabel('Carpeta de respaldos')).toHaveValue('ruta relativa');
 await page.locator('.modal-overlay').click({position:{x:2,y:2}});await expect(dialog).toBeVisible();
 await dialog.getByLabel('Carpeta de respaldos').fill('/home/usuario/Nueva nube');await dialog.getByRole('button',{name:'Guardar configuración'}).click();
 await dialog.getByRole('button',{name:'Crear copia ahora'}).click();await expect(dialog.locator('.modal-error')).toContainText('no está disponible');
 await expect(dialog.getByLabel('Carpeta de respaldos')).toHaveValue('/home/usuario/Nueva nube');
});
