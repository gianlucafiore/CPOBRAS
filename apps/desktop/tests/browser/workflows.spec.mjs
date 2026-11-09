import { test, expect } from "@playwright/test";

async function bridge(page, options={}) {
 await page.route("https://tile.openstreetmap.org/**",route=>route.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e2ecd9"/><path d="M0 120 L256 100 M120 0 L130 256" stroke="#fff" stroke-width="8"/></svg>'}));
 await page.route('https://nominatim.openstreetmap.org/reverse**',route=>options.geocodeFails?route.fulfill({status:503,body:'unavailable'}):route.fulfill({contentType:'application/json',body:JSON.stringify({address:{road:'Avenida de prueba',house_number:'123',city:'Rosario',state:'Santa Fe',country_code:'ar'}})}));
 await page.addInitScript((fixture) => {
  const project = { id: "10000000-0000-4000-8000-000000000001", name: "Obra de prueba", client_id: "client-1", currency: "Ars", organization_id:"org-own",organization_name:"Mi organización",organization_locked:true,read_only:false };
  const line = { id: "10000000-0000-4000-8000-000000000002", description: "Hormigón", unit: "m³", quantity: fixture.lineQuantity || "2", unit_cost: "100", total: "200", analysis_id: null };
  const lines=[line]; if(fixture.twoLines)lines.push({...line,id:"10000000-0000-4000-8000-000000000003",description:"Revoque"});
  const sections=fixture.twoLines?[{id:"10000000-0000-4000-8000-000000000004",code:"01",title:"Preliminares",parent_id:null,position:0}]:[];
  const sharedStatus={enabled:false,peer_id:'owner-key',shares:[],subscriptions:[],network_error:null};
  const sharedDoc={version:1,project:{...project,name:'Obra remota de María'},organization:{id:'remote-org',name:'Estudio de María',profile:{company_name:'Estudio de María',logo_png:[],email:'maria@example.test'}},client:{name:'Cliente remoto'},suppliers:[],budgets:[{estimate:{id:'remote-estimate',title:'Presupuesto remoto',currency:'ARS',issued:Boolean(fixture.remoteIssued)},document:{lines:[{...line,unit_cost_snapshot:'100'}],sections:[],assignments:[],line_analyses:[],takeoffs:[]},resource_prices:{},pricing:{direct:'200',definition:{rows:[]},calculation:{rows:[],breakdown:{direct:'200',total:'242',general_expenses:'0',financial_expenses:'0',profit:'0',discount:'0',taxable_subtotal:'200',taxes:'42'}}}}],planning:{revision:1,plan:{calendar:{start_date:'2026-11-07',nonworking_weekdays:[5,6],holidays:[]},tasks:[{id:'remote-task',name:'Replanteo remoto',duration_days:3,actual_progress:'25',parent_id:null,estimate_line_id:null,predecessors:[],assignments:[],budget:'0',not_before:null,finish_by:null}]}},schedule:{Ok:{tasks:[{id:'remote-task',start:'2026-11-07',finish:'2026-11-10'}]}},baselines:[],operations:[],records:[],stock:[],warehouses:[],parties:[],resources:[]};
  sharedDoc.permissions={budget:true,price:true,resources:true,operations:true,accounting:true,planning:true,project_data:true,...(fixture.remotePermissions||{})};
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
  let generalCalendar=structuredClone(fixture.generalCalendar||{revision:0,nonworking_weekdays:[5,6],exceptions:{}});
  const indexPoints=structuredClone(fixture.indexPoints||[]);let adjustmentAgreement={revision:0,definition:null};
  const operations=structuredClone(fixture.operations || []),warehouses=[];
  const operationReport=()=>({project_id:project.id,name:project.name,as_of:"2026-11-05",estimate_id:estimate.id,summaries:[{currency:"ARS",budget_cost:"200",budget_sale:"200",committed:"0",accrued:"0",paid:"0",collected:"0",payable:"0",receivable:"0",overdue_payable:"0",overdue_receivable:"0",cash:"0",cost_to_finish:"200",expected_result:"0",physical_percent:"0",certified:"0"}],cash_flow:[],production:[],costs:[],quotes:[],needs:[],alerts:[],scheduled_finish:null,planned_percent:null});
  const records = fixture.context?[{id:'center-one',kind:'cost_center',name:'Centro obra de prueba',project_id:project.id,attributes:{},revision:1},{id:'center-two',kind:'cost_center',name:'Centro obra modelo',project_id:sourceProject.id,attributes:{},revision:1}]:[]; const nested = []; const calls = []; let plan = null;
  window.__calls = calls;
  const schedule = current => ({ tasks: current.tasks.map((task, index) => ({ id: task.id, start: fixture.ganttDates?"2026-11-09":"2026-11-05", finish: fixture.ganttDates?"2026-11-16":"2026-11-09", start_day: index, finish_day: index + task.duration_days, float_days: 0, critical: true })), duration_days: current.tasks.reduce((n, task) => n + task.duration_days, 0), finish: "2026-11-09", curve: [{ date: "2026-11-05", period_cost: "100", cumulative_cost: "100" }], budget: "100", planned_progress: "50", actual_progress: current.tasks[0]?.actual_progress || "0", warnings: [] });
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
   if(command==='save_export_file')return fixture.cancelSave?null:{path:'/elegido/'+args.name,open_error:fixture.readerFails?'No hay lector PDF asociado':null};
   if(command==='open_export_pdf'){if(fixture.readerFails)throw new Error('No hay lector PDF asociado');return null;}
   if(command==='get_budget_print_data'){const calculation=calculatePrice(priceDefinition),direct=Number(totals.direct),total=Number(calculation.breakdown.total);let cumulative=0,allocated=0,pct=0;const printLines=lines.map(l=>{const cost=Number(l.total);cumulative+=cost;const next=direct?Math.round(cumulative/direct*total*100)/100:0,sale=next-allocated;allocated=next;const nextPct=total?Math.round(next/total*1000000)/10000:0,incidence=nextPct-pct;pct=nextPct;return{id:l.id,direct_total:l.total,sale_total:String(sale),sale_unit:String(Number(l.quantity)?sale/Number(l.quantity):0),incidence_percent:String(incidence),cumulative_percent:String(nextPct)};});return {document:{title:estimate.title,currency:'Ars',lines:lines.map(l=>({...l,unit_cost_snapshot:l.unit_cost})),sections,assignments:assignments.map(a=>[a.line_id,a.section_id])},estimate,project,client:{id:'client-1',name:'Comitente',cuit:null},profile:structuredClone(organizations.find(o=>o.id===project.organization_id).profile),calculation,lines:printLines,final_total:String(total),unallocated_total:direct?'0':String(total)};}
   if (command === "list_clients") return persons.filter(p=>p.role!=="supplier").map(p=>({id:p.id,name:p.name,cuit:p.cuit}));
   if (command === "list_projects") return projectList;
   if (command === "list_resources") return resources;
   if(command==='import_resources'){const imported=args.rows.map(row=>({id:crypto.randomUUID(),...row,code:row.code||"INS-"+String(resources.length+1).padStart(4,"0"),active:true}));resources.push(...imported);return {created:imported.length,resource_ids:imported.map(r=>r.id)};}
   if(command==='create_resource'){const r={id:'resource-'+(resources.length+1),...args,code:args.code||'INS-'+String(resources.length+1).padStart(4,'0')};resources.push(r);return r;}
   if(command==='get_general_calendar')return structuredClone(generalCalendar);
   if(command==='save_general_calendar'){if(args.calendar.revision!==generalCalendar.revision)throw new Error('Recargá');generalCalendar={...structuredClone(args.calendar),revision:generalCalendar.revision+1};return structuredClone(generalCalendar);}
   if(command==='list_index_points')return structuredClone(indexPoints);
   if(command==='save_index_point'){indexPoints.push(structuredClone(args.point));return args.point;}
   if(command==='get_adjustment_agreement')return structuredClone(adjustmentAgreement);
   if(command==='save_adjustment_agreement'){if(estimate.issued)throw new Error('Presupuesto emitido');adjustmentAgreement={definition:structuredClone(args.definition),revision:adjustmentAgreement.revision+1};return structuredClone(adjustmentAgreement);}
   if(command==='certification_overview')return fixture.certificationOverview||[{start:'2026-11-01',cut:'2026-11-13',amount:'200',next_expenses:'0',remainder:'200',index_status:'Sin ajuste',collection_date:'2026-11-16',state:'Previsto'},{start:'2026-11-14',cut:'2026-12-04',amount:'0',next_expenses:'0',remainder:'0',index_status:'Sin ajuste',collection_date:'2026-12-07',state:'Previsto'}];
   if(command==='pending_adjustment_differences')return fixture.pendingDifferences||[];
   if(command==='certificate_index_preview')return fixture.indexPreview||null;
   if(command==='list_site_entries'){const rows=(window.__siteEntries||[]).slice().reverse();return {entries:rows.slice(args.page*30,args.page*30+30),total:rows.length,page:args.page};}
   if(command==='save_site_entry'){window.__siteEntries ||= [];let old=window.__siteEntries.find(r=>r.id===args.id);if(old){if(old.confirmed_at)throw new Error('Confirmado');old.description=args.description;old.revision++;return structuredClone(old);}const r={id:crypto.randomUUID(),project_id:args.projectId,number:'PAR-'+String(window.__siteEntries.length+1).padStart(4,'0'),created_at:new Date().toISOString(),confirmed_at:null,description:args.description,revision:1};window.__siteEntries.push(r);return structuredClone(r);}
   if(command==='confirm_site_entry'){const r=window.__siteEntries.find(r=>r.id===args.id);r.confirmed_at=new Date().toISOString();r.revision++;return structuredClone(r);}
   if(command==='print_site_entries')return (window.__siteEntries||[]).filter(r=>r.confirmed_at);
   if(command==='list_supplier_movements')return [];
   if(command==='record_supplier_movement'){const m=args.movement,o=window.__supplierOrders?.find(o=>o.document.id===m.order_id);if(o&&m.kind==='request'){for(const l of o.lines)l.requested=String(Number(l.requested||0)+Number(m.quantities[l.source_id]||0));o.revision++;}return structuredClone(m);}
   if(command==='open_operation_file')return null;
   if(command==='list_supplier_orders')return (window.__supplierOrders||[]).filter(o=>(args.kind==='material')===(o.document.kind==='purchase_order'));
   if(command==='list_quote_responses')return structuredClone((window.__responses||[]).filter(r=>r.request_id===args.requestId&&!(window.__hiddenResponses||[]).includes(r.id)));
   if(command==='get_editable_quotation_request')return {request:structuredClone(window.__quotationRequests.find(r=>r.id===args.id)),revision:window.__requestRevisions?.[args.id]||0};
   if(command==='update_quotation_request'){window.__requestRevisions ||= {};const revision=(window.__requestRevisions[args.request.id]||0)+1;window.__requestRevisions[args.request.id]=revision;window.__quotationRequests[window.__quotationRequests.findIndex(r=>r.id===args.request.id)]=structuredClone(args.request);for(const r of window.__responses||[]){if(r.request_id===args.request.id)r.prices=args.request.items.map(i=>r.prices.find(p=>p.row_id===i.id)||{row_id:i.id,unit_price:null,notes:''});}return {request:args.request,revision};}
   if(command==='hide_quote_response'){window.__hiddenResponses ||= [];window.__hiddenResponses.push(args.id);window.__responses.find(r=>r.id===args.id).revision++;return null;}
   if(command==='add_quote_supplier'){window.__responses ||= [];const old=window.__responses.find(r=>r.request_id===args.requestId&&r.supplier_id===args.supplierId);if(old){window.__hiddenResponses=(window.__hiddenResponses||[]).filter(id=>id!==old.id);old.revision++;return structuredClone(old);}const request=window.__quotationRequests.find(r=>r.id===args.requestId),r={id:crypto.randomUUID(),request_id:args.requestId,supplier_id:args.supplierId,revision:1,reference:'',terms:'',prices:request.items.map(i=>({row_id:i.id,unit_price:null,notes:''}))};window.__responses.push(r);return structuredClone(r);}
   if(command==='save_quote_response'){window.__responses ||= [];const r={...structuredClone(args.response),revision:args.response.revision+1},i=window.__responses.findIndex(p=>p.id===r.id);if(i<0)window.__responses.push(r);else window.__responses[i]=r;return structuredClone(r);}
   if(command==='list_quote_files')return structuredClone(window.__quoteFiles||[]);
   if(command==='attach_quote_file'){window.__quoteFiles ||= [];window.__quoteFiles.push({id:crypto.randomUUID(),response_id:args.responseId,name:args.name,bytes:args.content.length});return window.__quoteFiles.at(-1).id;}
   if(command==='award_balances'){const r=(window.__quotationRequests||[]).find(r=>r.id===args.requestId);return (r?.items||[]).map(i=>({row_id:i.id,quantity:i.quantity}));}
   if(command==='award_quotation'){const r=window.__quotationRequests.find(r=>r.id===args.requestId),response=window.__responses.find(p=>p.id===args.choices[0].response_id),items=args.choices.map(c=>{const row=r.items.find(i=>i.id===c.row_id);return {source_id:row.source_id,description:row.description,quantity:c.quantity,unit_price:response.prices.find(p=>p.row_id===row.id).unit_price,received:'0',remaining:c.quantity};}),doc={id:crypto.randomUUID(),kind:r.kind==='material'?'purchase_order':'subcontract',number:'PED-0001',project_id:r.project_id,estimate_id:r.estimate_id,partner_id:response.supplier_id,currency:r.currency,amount:String(items.reduce((s,l)=>s+Number(l.quantity)*Number(l.unit_price),0)),date:r.date,due_date:args.dueDate,lines:items.map(l=>({...l,resource_id:r.kind==='material'?l.source_id:null,line_id:r.kind==='work'?l.source_id:null}))};window.__supplierOrders ||= [];window.__supplierOrders.push({document:doc,lines:items,paid:'0',pending_payment:doc.amount,payment_state:'Pendiente',delivery_state:'Solicitado',editable:true,revision:0,supplier_credit:'0',files:[]});operations.push(doc);return [doc];}
   if(command==='receive_material_order'||command==='receive_material_order_with_proof'){const o=window.__supplierOrders.find(o=>o.document.id===args.orderId);for(const l of o.lines){l.received=String(Number(l.received)+Number(args.quantities[l.source_id]||0));l.remaining=String(Number(l.quantity)-Number(l.received));l.vendor_stock=String(Math.max(0,Number(l.vendor_stock||0)-Number(args.quantities[l.source_id]||0)));l.requested=String(Math.max(0,Number(l.requested||0)-Number(args.quantities[l.source_id]||0)));}o.delivery_state=o.lines.every(l=>l.remaining==='0')?'Completa':'Parcial';return {};}
   if(command==='list_certificate_drafts')return structuredClone(window.__certDrafts||[]);
   if(command==='available_progress')return fixture.availableProgress||[];
   if(command==='list_quotation_requests')return structuredClone(window.__quotationRequests||[]);
   if(command==='open_certificate_draft'||command==='open_next_client_certificate'){if(command==='open_next_client_certificate')args={...args,start:'2026-11-01',end:'2026-11-13',contractId:null};window.__certDrafts ||= [];let d=window.__certDrafts.find(d=>!d.issued_id&&d.operation.reference_id===(args.contractId||null));if(!d){d={id:crypto.randomUUID(),project_id:project.id,estimate_id:estimate.id,revision:0,kind:args.contractId?'subcertificate':'certificate',issued_id:null,progress:lines.map(l=>({line_id:l.id,accumulated_percent:'0',use_approved:true})),operation:{id:crypto.randomUUID(),project_id:project.id,estimate_id:estimate.id,kind:args.contractId?'subcertificate':'certificate',reference_id:args.contractId||null,date:args.end,period_start:args.start,period_end:args.end,due_date:args.end,currency:'ARS',lines:[],extras:[],reconcile_ids:[],notes:'',amount:'0',calculated:{}}};window.__certDrafts.push(d);}return structuredClone(d);}
   if(command==='save_certificate_draft'){const d=structuredClone(args.draft);d.revision++;d.operation.lines=d.progress.filter(p=>Number(p.accumulated_percent)>0).map(p=>{const l=lines.find(l=>l.id===p.line_id);return {line_id:l.id,description:l.description,quantity:p.accumulated_quantity ?? String(Number(l.quantity)*Number(p.accumulated_percent)/100),unit_price:l.unit_cost};});window.__certDrafts[window.__certDrafts.findIndex(x=>x.id===d.id)]=d;return structuredClone(d);}
   if(['preview_certificate_draft','certificate_editor_sheet','calculate_certificate_preview','issued_certificate_sheet'].includes(command)){const d=command==='calculate_certificate_preview'?args.draft:command==='issued_certificate_sheet'?window.__certDrafts.find(d=>d.issued_id===args.id):window.__certDrafts.find(d=>d.id===args.id),o=structuredClone(d.operation);if(command==='calculate_certificate_preview')o.lines=d.progress.map(p=>({line_id:p.line_id,quantity:p.accumulated_quantity ?? String(Number(lines.find(l=>l.id===p.line_id).quantity)*Number(p.accumulated_percent)/100),unit_price:lines.find(l=>l.id===p.line_id).unit_cost}));o.amount=String(o.lines.reduce((n,l)=>n+Number(l.quantity)*Number(l.unit_price),0)+o.extras.reduce((n,x)=>n+Number(x.amount),0));o.calculated={base_work:o.amount};if(fixture.signedZeroAdvance){o.advance="-0.0000";o.advance_before_index=true;}return {preliminary:command!=='issued_certificate_sheet',project_name:project.name,budget_title:estimate.title,client_name:'Comitente',profile:{company_name:'Empresa',logo_png:[]},operation:o,total_base:'200',physical_percent:'50',rows:lines.map(l=>{const p=d.progress.find(p=>p.line_id===l.id);return{line_id:l.id,item:'01',section:'',description:l.description,unit:l.unit,quantity:l.quantity,unit_price:l.unit_cost,previous:'0',current:'1',accumulated:'1',remaining:'1',previous_percent:'0',current_percent:p?.accumulated_percent||'0',accumulated_percent:p?.accumulated_percent||'0',remaining_percent:String(100-Number(p?.accumulated_percent||0)),period_amount:String(Number(l.quantity)*Number(l.unit_cost)*Number(p?.accumulated_percent||0)/100),contract_total:'200',incidence:'100'};})};}
   if(command==='issue_certificate_draft'){const d=window.__certDrafts.find(d=>d.id===args.id);d.operation.number='CERT-0001';d.operation.date=args.date;d.issued_id=d.operation.id;operations.push(structuredClone(d.operation));return structuredClone(d.operation);}
   if(command==='create_quotation_request'){const r={...structuredClone(args.request),number:'SOL-0001',profile:{company_name:'Empresa',logo_png:[]},project_name:project.name};window.__quotationRequests ||= [];window.__quotationRequests.push(r);return structuredClone(r);}
   if(command==='list_operations')return operations;
   if(command==='list_warehouses')return warehouses;
   if(command==='create_warehouse'){warehouses.push(args.warehouse);return args.warehouse;}
   if(command==='stock_balances')return [];
   if(command==='operations_report')return {...operationReport(),...fixture.financialReport,project_id:args.projectId,name:args.projectId===sourceProject.id?sourceProject.name:project.name,estimate_id:args.estimateId};
   if(command==='operations_portfolio')return [operationReport()];
   if(command==='post_operation'||command==='material_payment_with_proof'){const o={...args.operation,calculated:{}};operations.push(o);return o;}
   if (command === "list_analyses") return [];
   if (command === "list_project_estimates") return args.projectId==='source-project'?[{id:'source-estimate',title:'Modelo de cómputo',currency:'ARS',issued:true}]:fixture.context?[estimate,{...estimate,id:'estimate-2',title:'Alternativa emitida',issued:true}]:[estimate];
   if(command==='get_estimate_resource_prices')return resourcePrices;
   if(command==='list_budget_templates')return templates;
   if(command==='get_pattern_document')return args.source.template_id?templates.find(t=>t.id===args.source.template_id).document:sourceDocument;
   if(command==='save_budget_pattern'){const template={id:'template-'+(templates.length+1),name:args.name,document:patternPart(args.source.template_id?templates.find(t=>t.id===args.source.template_id).document:sourceDocument,args.selection)};if(!args.includePrices)for(const l of template.document.lines)l.unit_cost_snapshot='0';templates.push(template);return template;}
   if(command==='apply_budget_pattern'){const d=patternPart(args.source.template_id?templates.find(t=>t.id===args.source.template_id).document:sourceDocument,args.selection),mapping=new Map(d.sections.map(r=>[r.id,'new-'+r.id+'-'+calls.length])),ids=[];for(const r of d.sections)sections.push({...r,id:mapping.get(r.id),parent_id:r.parent_id?mapping.get(r.parent_id):args.parentId});for(const l of d.lines){const id='new-'+l.id+'-'+calls.length,price=args.includePrices?l.unit_cost_snapshot:'0';lines.push({id,description:l.description,unit:l.unit,quantity:l.quantity,unit_cost:price,total:String(Number(price)*Number(l.quantity)),analysis_id:null});ids.push(id);const assignment=d.assignments.find(([line])=>line===l.id);if(assignment)assignments.push({line_id:id,section_id:mapping.get(assignment[1])});}return {line_ids:ids,section_ids:[...mapping.values()],takeoff_count:d.takeoffs.length};}
   if (command === "list_estimate_lines") return fixture.context&&args.estimateId==='source-estimate'?[{...line,id:'other-line',description:'Partida obra modelo',total:'900'}]:lines;

   if(command==='p2p_projects')return sharedStatus.subscriptions.map(s=>({...s,received_at:s.last_sync,organization_name:sharedDoc.organization.name,client_name:sharedDoc.client.name,currency:sharedDoc.project.currency}));
   if(command==='p2p_set_permissions'){sharedStatus.shares.find(s=>s.id===args.id).permissions=args.permissions;return structuredClone(sharedStatus);}
   if(command==='p2p_status')return structuredClone(sharedStatus);
   if(command==='p2p_enable'){sharedStatus.enabled=args.enabled;return structuredClone(sharedStatus);}
   if(command==='p2p_invite'){sharedStatus.enabled=true;sharedStatus.shares.push({id:'share-1',project_id:args.projectId,label:args.label,peer:null,revoked:false,last_seen:null,permissions:args.permissions});return {invitation:'cpobras1:invitacion-de-prueba'};}
   if(command==='p2p_join'){
    if(args.invitation==='invalida')throw new Error('Invitación inválida');
    sharedStatus.enabled=true;sharedStatus.subscriptions.push({id:'received-1',name:sharedDoc.project.name,owner:'maria-key',project_id:project.id,last_sync:1794056400,last_checked:1794056400,error:null,revoked:false,has_snapshot:true});return structuredClone(sharedStatus);
   }
   if(command==='p2p_sync'){if(fixture.p2pOffline)sharedStatus.subscriptions.forEach(s=>s.error='El propietario no está disponible. Se conserva la última copia recibida');return structuredClone(sharedStatus);}
   if(command==='p2p_read')return {data:structuredClone(sharedDoc),received_at:1794056400,owner:'maria-key',read_only:true,revoked:false,error:sharedStatus.subscriptions[0]?.error||null};
   if(command==='p2p_revoke'){sharedStatus.shares.find(s=>s.id===args.id).revoked=true;return structuredClone(sharedStatus);}
   if(command==='p2p_forget'){sharedStatus.subscriptions=sharedStatus.subscriptions.filter(s=>s.id!==args.id);return structuredClone(sharedStatus);}
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
   if(command==='choose_backup_folder')return fixture.cancelFolder?null:'/home/usuario/Nube/Respaldos CPOBRAS';
   if(command==='open_backup_folder'||command==='verify_database')return null;
   if(command==='reopen_estimate'){estimate.issued=false;return null;}
   if(command==='issue_estimate'){estimate.issued=true;return null;}
   if(command==='save_line_as_analysis')return null;
   if(command==='list_measured_lines')return fixture.measured?[line.id]:[];
   if(command==='get_estimate_metadata')return {created_at:'2026-11-01 10:00:00',issued_at:null};
   if(command==='list_project_attachments')return [];
   if(command==='add_project_attachment'||command==='open_project_attachment'||command==='remove_project_attachment')return null;
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
 await bridge(page); await page.getByRole("button", { name: "Abrir ›", exact: true }).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click(); await page.getByRole("button", { name: "Planificación", exact: true }).click();
 await page.getByRole("button", { name: "Nueva tarea / hito", exact: true }).click();
 await page.getByLabel("Nombre", { exact: true }).fill("Excavación");
 await page.getByLabel("Duración en días laborables (0 = hito)").fill("3");
 await page.getByLabel("Costo previsto (se toma de la partida cuando hay vínculo)").fill("300");
 await expect(page.getByLabel("Avance real %")).not.toBeEditable();
 await page.getByRole("button", { name: "Guardar tarea y recalcular", exact: true }).click();
 await page.getByRole("tab",{name:"Gantt",exact:true}).click();
 await expect(page.locator(".gantt-bar")).toHaveCount(1);
 await expect(page.locator(".gantt-label")).toContainText("Excavación");
 const saved = await page.evaluate(() => window.__calls.filter(call => call.command === "save_project_plan").at(-1).args);
 expect(saved.plan.tasks[0].duration_days).toBe(3); expect(saved.plan.tasks[0].actual_progress).toBe("0");
 await page.locator(".gantt-label").dblclick(); await page.getByText("Cuadrillas, equipos y recursos",{exact:true}).click();await page.getByRole("button", { name: "Asignar recurso", exact: true }).click();
 await page.getByLabel("Unidades por día").fill("2"); await page.getByRole("button", { name: "Guardar tarea y recalcular", exact: true }).click();
 const last = await page.evaluate(() => window.__calls.filter(call => call.command === "save_project_plan").at(-1).args);
 expect(last.plan.tasks[0].assignments[0].units_per_day).toBe("2");
});

test("nested ACU preserves fields when components are added and calculates a scenario", async ({ page }) => {
 await bridge(page); await page.getByRole("button", { name: "Costos y precios", exact: true }).click();
 await page.getByRole("button", { name: "Nuevo ACU compuesto", exact: true }).click();
 await expect(page.getByLabel("Código", { exact: true })).toHaveAttribute("readonly","");
 await page.getByLabel("Descripción", { exact: true }).fill("Estructura compuesta");
 await page.getByRole("button", { name: "Agregar componente", exact: true }).click();
 await expect(page.getByLabel("Código", { exact: true })).toHaveValue("");
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
 await bridge(page); await page.getByRole("button", { name: "Abrir ›", exact: true }).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();
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
 await bridge(page,{twoLines:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.locator('[data-action=manage-dashboard-budget]').first().click();
 const first=page.locator('.line-row').filter({hasText:'Hormigón'}),second=page.locator('.line-row').filter({hasText:'Revoque'});
 await second.locator('.line-drag-handle').dragTo(first,{targetPosition:{x:140,y:2}});
 await expect(page.locator('.line-row .col-desc').first()).toHaveText('Revoque');
 await second.locator('.line-drag-handle').dragTo(page.locator('[data-drop-section]'));
 await expect.poll(()=>page.evaluate(()=>window.__calls.filter(row=>row.command==='move_budget_line').at(-1)?.args.sectionId)).toBe('10000000-0000-4000-8000-000000000004');
 await expect(page.getByRole('status')).toContainText('Preliminares');
});

test("double click edits a different line and right click opens software actions",async({page})=>{
 await bridge(page,{twoLines:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.locator('[data-action=manage-dashboard-budget]').first().click();
 const row=page.locator('.line-row').filter({hasText:'Revoque'});await row.dblclick({position:{x:150,y:12}});
 await expect(page.getByRole('heading',{name:'Editar partida',exact:true})).toBeVisible();
 await page.getByLabel('Descripción',{exact:true}).fill('Revoque fino');await page.getByRole('button',{name:'Guardar',exact:true}).click();
 await expect(page.locator('.line-row')).toContainText(['Hormigón','Revoque fino']);
 await page.locator('.line-row').filter({hasText:'Revoque fino'}).click({button:'right'});
 await expect(page.getByRole('menu',{name:'Acciones de CPOBRAS'})).toBeVisible();await page.getByRole('menuitem',{name:'Asignar / editar insumos',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Agregar insumo a la partida',exact:true})).toBeVisible();
});

test("assigning a catalog resource directly recalculates the selected line",async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.locator('[data-action=manage-dashboard-budget]').first().click();
 await page.getByRole('tab',{name:'Insumos',exact:true}).click();await expect(page.getByRole('tab',{name:'Insumos',exact:true})).toHaveAttribute('aria-selected','true');
 await page.getByRole('button',{name:'Asignar',exact:true}).click();await expect(page.getByRole('heading',{name:'Agregar insumo a la partida',exact:true})).toBeVisible();
 await page.getByLabel('Rendimiento / unidad',{exact:true}).fill('2.5');await page.getByRole('button',{name:'Guardar',exact:true}).click();
 await expect(page.locator('.detail-content')).toContainText('Precio calculado por insumos');
 await expect(page.locator('.line-row .partial')).toHaveText('500,00');
 const saved=await page.evaluate(()=>window.__calls.find(row=>row.command==='save_line_resources').args);expect(saved.components[0]).toEqual({resourceId:'resource-1',quantity:'2.5',unitPrice:'100'});
});

test("issued budgets disable editing, assignment and drag handles",async({page})=>{
 await bridge(page,{issued:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.locator('[data-action=manage-dashboard-budget]').first().click();
 await expect(page.locator('.line-drag-handle')).toBeDisabled();
 await page.locator('.line-row').click({button:'right'});await expect(page.getByRole('menuitem',{name:'Asignar / editar insumos',exact:true})).toBeDisabled();
 await page.keyboard.press('Escape');await expect(page.getByRole('menu')).toHaveCount(0);
});

test("backdrop clicks preserve popup drafts and explicit closing confirms discarded edits",async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.locator('[data-action=manage-dashboard-budget]').first().click();
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
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('tab',{name:'Insumos',exact:true}).click();await page.getByRole('button',{name:'Asignar',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Buscar insumo 1'})).toHaveAttribute('aria-expanded','false');
 await page.getByLabel('Rendimiento / unidad',{exact:true}).fill('3');await page.getByRole('button',{name:'Guardar',exact:true}).click();
 await page.getByRole('button',{name:'＋ Agregar insumo',exact:true}).click();
 const search=page.getByRole('combobox',{name:'Buscar insumo 1'});await search.fill('acreo');await expect(page.getByRole('option',{name:'MAT-1 · Acero (kg)'})).toBeVisible();
 await search.fill('Cemento especial');await page.getByRole('option',{name:'＋ Agregar «Cemento especial»'}).click();
 const child=page.getByRole('dialog',{name:'Crear insumo sin salir'});await expect(child.getByLabel('Código',{exact:true})).toHaveAttribute('readonly','');await child.getByLabel('Precio inicial ARS',{exact:true}).fill('250');
 await page.locator('.quick-resource-overlay').click({position:{x:2,y:2}});await expect(child).toBeVisible();
 page.once('dialog',d=>d.dismiss());await page.keyboard.press('Escape');await expect(child).toBeVisible();
 await child.getByRole('button',{name:'Guardar y seleccionar',exact:true}).click();await expect(child).toHaveCount(0);await expect(search).toHaveValue('INS-0002 · Cemento especial');
 await expect(page.locator('.component-row')).toHaveCount(1);await page.getByRole('button',{name:'Guardar',exact:true}).click();const saved=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_line_resources').at(-1).args);expect(saved.components[1].resourceId).toBe('resource-2');expect(saved.components[1].unitPrice).toBe('250');expect(saved.components[0].quantity).toBe('3');
});

test('materials view replaces generic document forms with guided requests and stock declaration',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await expect(page.getByRole('button',{name:'Materiales y Acopio',exact:true})).toBeVisible();await expect(page.getByLabel('Tipo de documento',{exact:true})).toHaveCount(0);await expect(page.getByText('Necesidades de materiales según ACU',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Declarar acopio existente',exact:true}).click();await expect(page.getByLabel('Número / referencia',{exact:true})).toHaveAttribute('readonly','');
});

test('production, certification, finances and dashboard screens expose their workflows',async({page})=>{
 await bridge(page,{issued:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();
 await page.getByRole('button',{name:'Libro de obra',exact:true}).click();await page.getByLabel('Descripción del parte',{exact:true}).fill('Se completó el replanteo');await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();
 await page.getByRole('button',{name:'Certificaciones',exact:true}).click();await page.getByRole('button',{name:'Modificar avances',exact:true}).click();await page.getByLabel('Avance acumulado Hormigón',{exact:true}).fill('50');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Emitir certificado aprobado',exact:true}).click();await expect(page.getByRole('button',{name:'Ver certificado / PDF',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Finanzas',exact:true}).click();await page.getByLabel('Número / referencia',{exact:true}).fill('FAC-001');await page.getByLabel('Importe',{exact:true}).fill('500');await page.getByRole('combobox',{name:'Contraparte',exact:true}).selectOption('supplier-1');await page.getByRole('button',{name:'Registrar factura por pagar',exact:true}).click();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Tablero',exact:true}).click();await expect(page.getByRole('columnheader',{name:'Resultado esperado',exact:true})).toBeVisible();await page.getByRole('combobox',{name:'Contenido del informe',exact:true}).selectOption('summary');await page.getByRole('button',{name:'Informe PDF',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Guardado en'})).toBeVisible();
 const kinds=await page.evaluate(()=>window.__calls.filter(c=>c.command==='post_operation').map(c=>c.args.operation.kind));expect(kinds).toEqual(['payable']);expect(await page.evaluate(()=>window.__calls.some(c=>c.command==='issue_certificate_draft'))).toBe(true);
});

test('operational drafts survive rejected navigation and are cleared only after explicit discard',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await page.getByRole('button',{name:'Finanzas',exact:true}).click();await page.getByLabel('Número / referencia',{exact:true}).fill('BORRADOR');
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'← Inicio',exact:true}).click();await expect(page.getByLabel('Número / referencia',{exact:true})).toHaveValue('BORRADOR');
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'← Inicio',exact:true}).click();await page.getByRole('button',{name:'Insumos',exact:true}).click();await expect(page.getByRole('heading',{name:'Biblioteca de insumos',exact:true})).toBeVisible();await page.getByRole('button',{name:'Inicio / Obras',exact:true}).click();await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();
 await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await expect(page.getByLabel('Número / referencia',{exact:true})).toHaveValue('');await expect(page.getByRole('heading',{name:'Factura por pagar',exact:true})).toBeVisible();
});

test('double clicking one component opens only that item and preserves the rest on save',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('tab',{name:'Insumos',exact:true}).click();await page.getByRole('button',{name:'Asignar',exact:true}).click();await page.getByRole('button',{name:'Guardar',exact:true}).click();
 await page.getByRole('button',{name:'＋ Agregar insumo',exact:true}).click();const search=page.getByRole('combobox',{name:'Buscar insumo 1'});await search.fill('Otro');await page.getByRole('option',{name:'＋ Agregar «Otro»'}).click();const child=page.getByRole('dialog',{name:'Crear insumo sin salir'});await child.getByLabel('Precio inicial ARS').fill('200');await child.getByRole('button',{name:'Guardar y seleccionar'}).click();await page.getByLabel('Rendimiento / unidad',{exact:true}).fill('2');await page.getByRole('button',{name:'Guardar',exact:true}).click();
 await page.locator('.line-resource-row').filter({hasText:'Acero'}).dblclick();await expect(page.getByRole('heading',{name:'Editar insumo de la partida'})).toBeVisible();await page.screenshot({path:'/workspace/cpobras-single-component.png'});await expect(page.locator('.component-row')).toHaveCount(1);await expect(page.getByRole('listbox')).toHaveCount(0);await page.getByLabel('Rendimiento / unidad',{exact:true}).fill('3');await page.getByRole('button',{name:'Guardar',exact:true}).click();
 const saved=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_line_resources').at(-1).args);expect(saved.components.map(c=>c.quantity)).toEqual(['3','2']);await expect(page.locator('.line-resource-row')).toHaveCount(2);await expect(page.locator('.line-row .partial')).toHaveText('1.400,00');
});

test('units support searching and creating within quick resource creation without losing either parent',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'＋ Agregar insumo',exact:true}).click();await page.getByLabel('Rendimiento / unidad',{exact:true}).fill('4');const search=page.getByRole('combobox',{name:'Buscar insumo 1'});await search.fill('Pintura');await page.getByRole('option',{name:'＋ Agregar «Pintura»'}).click();const resource=page.getByRole('dialog',{name:'Crear insumo sin salir'});await resource.getByLabel('Precio inicial ARS').fill('350');const unit=resource.getByRole('combobox',{name:'Unidad',exact:true});await expect(unit).toHaveAttribute('aria-expanded','false');await unit.fill('kilo');await page.getByRole('option',{name:'kg · Kilogramo'}).click();await expect(unit).toHaveValue('kg');
 await unit.fill('balde');await page.getByRole('option',{name:'＋ Agregar unidad «balde»'}).click();const dialog=page.getByRole('dialog',{name:'Agregar unidad',exact:true});await dialog.getByLabel('Nombre de la unidad').fill('Balde de 20 litros');await page.screenshot({path:'/workspace/cpobras-unit-create.png'});await page.locator('.unit-create-overlay').click({position:{x:2,y:2}});await expect(dialog).toBeVisible();page.once('dialog',d=>d.dismiss());await page.keyboard.press('Escape');await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'Guardar y seleccionar unidad'}).click();await expect(dialog).toHaveCount(0);await expect(unit).toHaveValue('balde');await expect(resource.getByLabel('Precio inicial ARS')).toHaveValue('350');await resource.getByRole('button',{name:'Guardar y seleccionar',exact:true}).click();await expect(page.getByLabel('Rendimiento / unidad',{exact:true})).toHaveValue('4');await page.getByRole('button',{name:'Guardar',exact:true}).click();
 const calls=await page.evaluate(()=>window.__calls);expect(calls.find(c=>c.command==='create_resource').args.unit).toBe('balde');expect(calls.find(c=>c.command==='save_management_record').args.record.attributes.symbol).toBe('balde');
});

test('resource and unit dropdowns close on selection or an outside click without closing popups',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'＋ Agregar insumo',exact:true}).click();const search=page.getByRole('combobox',{name:'Buscar insumo 1'});await search.fill('acero');await expect(search).toHaveAttribute('aria-expanded','true');await page.getByRole('heading',{name:'Agregar insumo a la partida'}).click();await expect(search).toHaveAttribute('aria-expanded','false');await expect(page.getByRole('dialog')).toBeVisible();await expect(search).toHaveValue('acero');
 await search.click();await expect(search).toHaveAttribute('aria-expanded','true');await search.click();await expect(search).toHaveAttribute('aria-expanded','false');await search.click();await page.getByRole('option',{name:'MAT-1 · Acero (kg)'}).click();await expect(search).toHaveAttribute('aria-expanded','false');await expect(search).toHaveValue('MAT-1 · Acero');
 await search.fill('Pintura');await page.getByRole('option',{name:'＋ Agregar «Pintura»'}).click();const child=page.getByRole('dialog',{name:'Crear insumo sin salir'}),unit=child.getByRole('combobox',{name:'Unidad',exact:true});await unit.fill('kilo');await expect(unit).toHaveAttribute('aria-expanded','true');await child.getByRole('heading',{name:'Nuevo insumo'}).click();await expect(unit).toHaveAttribute('aria-expanded','false');await expect(unit).toHaveValue('kilo');await expect(child).toBeVisible();await unit.click();await page.getByRole('option',{name:'kg · Kilogramo'}).click();await expect(unit).toHaveAttribute('aria-expanded','false');await expect(unit).toHaveValue('kg');
 await unit.click();await page.locator('.quick-resource-overlay').click({position:{x:2,y:2}});await expect(unit).toHaveAttribute('aria-expanded','false');await expect(child).toBeVisible();
});

test('deleting a line with assigned resources removes its composition from the view and keeps the catalog',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('tab',{name:'Insumos',exact:true}).click();await page.getByRole('button',{name:'Asignar',exact:true}).click();await page.getByRole('button',{name:'Guardar',exact:true}).click();await expect(page.locator('.line-resource-row')).toHaveCount(1);page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Eliminar partida',exact:true}).click();await expect(page.locator('.line-row')).toHaveCount(0);await expect(page.locator('.line-resource-row')).toHaveCount(0);await page.getByRole('button',{name:'← Inicio',exact:true}).click();await page.getByRole('button',{name:'Insumos',exact:true}).click();await expect(page.getByRole('cell',{name:'Acero',exact:true})).toBeVisible();
});

test('patterns select rubros or individual lines in a tree and append quantities without duplicating selection',async({page})=>{
 await bridge(page,{patterns:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Patrones de cómputo',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Patrones de cómputo',exact:true});await expect(dialog.getByRole('combobox',{name:'Obra de origen',exact:true})).toHaveValue('source-project');await page.getByRole('checkbox',{name:'Rubro Estructura modelo',exact:true}).check();await expect(page.getByRole('checkbox',{name:'Partida Columna modelo'})).toBeChecked();await expect(page.getByRole('checkbox',{name:'Partida Muro modelo'})).toBeChecked();await expect(page.getByRole('checkbox',{name:'Partida Pintura modelo'})).not.toBeChecked();
 await page.getByRole('checkbox',{name:'Partida Muro modelo'}).uncheck();await expect(page.getByRole('checkbox',{name:'Rubro Estructura modelo',exact:true})).toBeChecked({indeterminate:true});await page.getByLabel('Nombre del patrón',{exact:true}).fill('Columna típica');await page.getByRole('button',{name:'Guardar selección como patrón',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Patrón guardado'})).toBeVisible();await expect(page.locator('.line-row')).toHaveCount(1);
 await page.getByRole('checkbox',{name:'Rubro Estructura modelo',exact:true}).check();await page.screenshot({path:'/workspace/cpobras-pattern-preview.png'});await page.locator('.patterns-overlay').click({position:{x:2,y:2}});await expect(dialog).toBeVisible();page.once('dialog',d=>d.dismiss());await page.keyboard.press('Escape');await expect(dialog).toBeVisible();await page.getByRole('button',{name:'Incorporar selección',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.locator('.line-row')).toHaveCount(3);await expect(page.locator('.line-row').filter({hasText:'Columna modelo'}).locator('.partial')).toHaveText('0,00');await expect(page.locator('.line-row').filter({hasText:'Muro modelo'})).toContainText('6');const call=await page.evaluate(()=>window.__calls.find(c=>c.command==='apply_budget_pattern').args);expect(call.includePrices).toBe(false);expect(call.source.estimate_id).toBe('source-estimate');
});

test('saved computation patterns can be selected and incorporated with prices',async({page})=>{
 await bridge(page,{patterns:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Patrones de cómputo',exact:true}).click();await page.getByRole('checkbox',{name:'Partida Muro modelo'}).check();await page.getByLabel('Nombre del patrón',{exact:true}).fill('Muro típico');await page.getByRole('combobox',{name:'Precios al incorporar',exact:true}).selectOption('true');await page.getByRole('button',{name:'Guardar selección como patrón',exact:true}).click();await page.getByRole('combobox',{name:'Origen del patrón',exact:true}).selectOption('template');await expect(page.getByRole('combobox',{name:'Patrón guardado',exact:true})).toContainText('Muro típico');await page.getByRole('checkbox',{name:'Partida Muro modelo'}).check();await page.getByRole('button',{name:'Incorporar selección',exact:true}).click();await expect(page.locator('.line-row').filter({hasText:'Muro modelo'}).locator('.partial')).toHaveText('120,00');const call=await page.evaluate(()=>window.__calls.find(c=>c.command==='apply_budget_pattern').args);expect(call.includePrices).toBe(true);expect(call.source.template_id).toBe('template-1');
});

test('one resource price is reused and updating it recalculates all lines in the budget',async({page})=>{
 await bridge(page,{twoLines:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('tab',{name:'Insumos',exact:true}).click();await page.getByRole('button',{name:'Asignar',exact:true}).click();await page.getByLabel('Rendimiento / unidad',{exact:true}).fill('2');await page.getByRole('button',{name:'Guardar',exact:true}).click();await page.locator('.line-row').filter({hasText:'Revoque'}).click();await page.getByRole('button',{name:'＋ Agregar insumo',exact:true}).click();await page.getByRole('combobox',{name:'Buscar insumo 1'}).fill('acero');await page.getByRole('option',{name:'MAT-1 · Acero (kg)'}).click();await expect(page.getByLabel('Precio unitario ARS',{exact:true})).toHaveValue('100');await page.getByLabel('Rendimiento / unidad',{exact:true}).fill('3');await page.getByRole('button',{name:'Guardar',exact:true}).click();await page.locator('.line-row').filter({hasText:'Hormigón'}).click();await page.locator('.line-resource-row').dblclick();await page.getByLabel('Precio unitario ARS',{exact:true}).fill('120');await page.getByRole('button',{name:'Guardar',exact:true}).click();await expect(page.locator('.line-row').filter({hasText:'Hormigón'}).locator('.partial')).toHaveText('480,00');await expect(page.locator('.line-row').filter({hasText:'Revoque'}).locator('.partial')).toHaveText('720,00');await page.locator('.line-row').filter({hasText:'Revoque'}).click();await page.locator('.line-resource-row').dblclick();await expect(page.getByLabel('Precio unitario ARS',{exact:true})).toHaveValue('120');await expect(page.getByLabel('Rendimiento / unidad',{exact:true})).toHaveValue('3');
});

test('issued budgets can supply saved patterns while incorporating into them remains disabled',async({page})=>{
 await bridge(page,{patterns:true,issued:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Patrones de cómputo',exact:true}).click();await expect(page.getByRole('button',{name:'Incorporar selección',exact:true})).toBeDisabled();await page.getByRole('checkbox',{name:'Partida Muro modelo'}).check();await page.getByLabel('Nombre del patrón',{exact:true}).fill('Patrón desde emitido');await page.getByRole('button',{name:'Guardar selección como patrón',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Patrón guardado'})).toBeVisible();
});

test('price determination details, modal protection, percentages, saving and export', async({page})=>{
 await page.setViewportSize({width:1600,height:1000});
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Determinación de precio',exact:true}).first().click();
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
 await bridge(page,{issued:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Determinación de precio',exact:true}).first().click();await expect(page.getByRole('button',{name:'Guardar determinación',exact:true})).toBeDisabled();await expect(page.getByLabel('Tipo de cálculo')).toBeDisabled();await expect(page.getByLabel('Nombre de línea 1')).toBeDisabled();
});

test('price determination modes, ordering, templates and dirty navigation are explicit',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Determinación de precio',exact:true}).first().click();
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

test('project dashboard precedes budgets and has no budget selector or directory clutter',async({page})=>{
 await bridge(page,{context:true});
 await page.getByRole('row').filter({hasText:'Obra de prueba'}).getByRole('button',{name:'Abrir ›',exact:true}).click();
 const nav=page.getByRole('navigation',{name:'Navegación principal'});
 await expect(nav.getByRole('button',{name:'Proyecto',exact:true})).toBeVisible();
 await expect(nav.getByRole('button',{name:'Planificación',exact:true})).toHaveCount(0);
 await expect(page.locator('[name=estimate-picker]')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Directorios y fichas',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'+ Nuevo presupuesto',exact:true})).toBeVisible();
 await page.locator('[data-action=manage-dashboard-budget][data-id="estimate-1"]').click();
 await expect(nav.getByRole('button',{name:'Planificación',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Planificación',exact:true}).click();
 await page.getByRole('button',{name:'← Volver al proyecto',exact:true}).click();
 await expect(nav.getByRole('button',{name:'Gestión de obra',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'← Inicio',exact:true}).click();
 await page.getByRole('row').filter({hasText:'Obra modelo'}).getByRole('button',{name:'Abrir ›',exact:true}).click();
 await page.locator('[data-action=manage-dashboard-budget]').first().click();
 await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();
 expect(await page.evaluate(()=>window.__calls.filter(c=>c.command==='operations_report').at(-1).args)).toMatchObject({projectId:'source-project',estimateId:'source-estimate'});
});
test('changing budget returns through project and protects pending edits',async({page})=>{
 await bridge(page,{context:true});
 await page.getByRole('row').filter({hasText:'Obra de prueba'}).getByRole('button',{name:'Abrir ›',exact:true}).click();
 await page.locator('[data-action=manage-dashboard-budget][data-id="estimate-1"]').click();
 await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();
 await page.getByRole('button',{name:'Finanzas',exact:true}).click();
 await page.getByLabel('Número / referencia',{exact:true}).fill('No perder');
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'← Volver al proyecto',exact:true}).click();
 await expect(page.getByLabel('Número / referencia',{exact:true})).toHaveValue('No perder');
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'← Volver al proyecto',exact:true}).click();
 await page.locator('[data-action=manage-dashboard-budget][data-id="estimate-2"]').click();
 await expect(page.locator('.total-head')).toContainText('500,00');
 await expect(page.locator('.status-pill')).toContainText('Emitido');
 await expect(page.locator('[name=estimate-picker]')).toHaveCount(0);
});
test('project profile edits are protected before returning home',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).click();
 await page.getByRole('button',{name:'Editar proyecto',exact:true}).first().click();
 await page.getByLabel('Nombre',{exact:true}).fill('Ficha pendiente');
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'← Inicio',exact:true}).click();
 await expect(page.getByLabel('Nombre',{exact:true})).toHaveValue('Ficha pendiente');
});

test('global portfolio remains available from home and is separate from an open project',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Cartera de obras',exact:true}).click();await expect(page.getByRole('heading',{name:'Cartera de obras',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Contexto de la obra'})).toHaveCount(0);
 await page.getByRole('button',{name:'Informe PDF',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Guardado en'})).toBeVisible();
 await page.getByRole('button',{name:'Inicio / Obras',exact:true}).click();await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await expect(page.getByRole('button',{name:'Cartera de obras',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await page.getByRole('button',{name:'Tablero',exact:true}).click();await expect(page.locator('.context-help').filter({hasText:'presupuesto activo indicado arriba'})).toBeVisible();
});

test('public print identity and logo persist independently and appear in client printing',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Organizaciones',exact:true}).click();await page.getByRole('row').filter({hasText:'Mi organización'}).getByRole('button',{name:'Abrir',exact:true}).click();await page.getByLabel('Razón social / empresa',{exact:true}).fill('Constructora Sur');await page.getByLabel('Nombre del profesional',{exact:true}).fill('Profesional público');await page.getByLabel('CUIT / identificación fiscal',{exact:true}).fill('30-123');await page.getByLabel('Correo público',{exact:true}).fill('publico@example.test');
 await page.locator('[name=print-logo]').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP43qH1HwAGzAKpX36DZQAAAABJRU5ErkJggg==','base64')});await expect(page.getByRole('img',{name:'Logotipo público',exact:true})).toBeVisible();await page.getByRole('button',{name:'Guardar organización',exact:true}).click();
 const saved=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_organization').at(-1).args);expect(saved.profile.logo_png.length).toBeGreaterThan(30);expect(saved.profile.company_name).toBe('Constructora Sur');
 await page.getByRole('button',{name:'Inicio / Obras',exact:true}).click();await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Imprimir presupuesto',exact:true}).click();await expect(page.locator('.print-preview-heading')).toContainText('Constructora Sur');await expect(page.getByRole('img',{name:'Logotipo del emisor',exact:true})).toBeVisible();await expect(page.getByRole('columnheader',{name:'Costo directo',exact:true})).toHaveCount(0);
 await page.getByRole('textbox',{name:'Condiciones y observaciones públicas',exact:true}).fill('Validez: 15 días');await page.getByRole('button',{name:'Generar documento',exact:true}).click();await expect(page.locator('.print-export-result')).toContainText('presupuesto.pdf');expect(await page.evaluate(()=>window.__calls.filter(c=>c.command==='open_export_pdf').at(-1).args.path)).toContain('.pdf');
});

test('internal and incidence printing preserve entered conditions and can export Excel',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Imprimir presupuesto',exact:true}).click();await page.getByRole('textbox',{name:'Condiciones y observaciones públicas',exact:true}).fill('Condición conservada');await page.getByRole('combobox',{name:'Presentación',exact:true}).selectOption('internal');await expect(page.getByRole('textbox',{name:'Condiciones y observaciones públicas',exact:true})).toHaveValue('Condición conservada');await expect(page.getByRole('columnheader',{name:'Costo directo',exact:true})).toBeVisible();await expect(page.locator('.print-preview')).toContainText('Determinación de precio');
 await page.getByRole('combobox',{name:'Presentación',exact:true}).selectOption('incidences');await expect(page.getByRole('columnheader',{name:'Incidencia %',exact:true})).toBeVisible();await expect(page.locator('.print-preview')).toContainText('Incidencia total: 100 %');await page.getByRole('combobox',{name:'Salida',exact:true}).selectOption('xlsx');await page.getByRole('button',{name:'Generar documento',exact:true}).click();await expect(page.locator('.print-export-result')).toContainText('.xlsx');expect(await page.evaluate(()=>window.__calls.filter(c=>c.command==='open_export_pdf').length)).toBe(0);
});

test('reader failures keep the generated PDF available to reopen',async({page})=>{
 await bridge(page,{readerFails:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Imprimir presupuesto',exact:true}).click();await page.getByRole('button',{name:'Generar documento',exact:true}).click();await expect(page.locator('.print-export-result')).toContainText('No hay lector PDF asociado');await expect(page.getByRole('button',{name:'Abrir PDF',exact:true})).toBeVisible();await expect(page.locator('.print-export-result')).toContainText('.pdf');
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
 await page.getByRole('button',{name:'Inicio / Obras',exact:true}).click();await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Imprimir presupuesto',exact:true}).click();await expect(page.locator('.print-preview-heading')).not.toContainText('Emisor B');
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
 await dialog.getByRole('button',{name:'Elegir carpeta…'}).click();
 await expect(dialog.getByLabel('Carpeta de respaldos')).toHaveValue('/home/usuario/Nube/Respaldos CPOBRAS');
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

test('canceling the native folder selection keeps the backup draft intact',async({page})=>{
 await bridge(page,{cancelFolder:true});await page.getByRole('button',{name:'Copias de seguridad',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Copias de seguridad'});
 await dialog.getByLabel('Crear copias automáticas').check();await dialog.getByLabel('Frecuencia').selectOption('240');
 await dialog.getByRole('button',{name:'Elegir carpeta…'}).click();
 await expect(dialog.getByLabel('Carpeta de respaldos')).toHaveValue('/data/CPOBRAS/backups');
 await expect(dialog.getByLabel('Frecuencia')).toHaveValue('240');await expect(dialog.getByLabel('Crear copias automáticas')).toBeChecked();
});

test('P2P invitations are scoped to one owned project and access can be revoked',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Vinculación P2P',exact:true}).click();
 await page.getByLabel('Nombre del observador').fill('Arquitecta María');await page.getByRole('button',{name:'Crear invitación',exact:true}).click();
 await expect(page.locator('#p2p-invitation')).toHaveValue('cpobras1:invitacion-de-prueba');
 await expect.poll(()=>page.evaluate(()=>window.__calls.find(c=>c.command==='p2p_invite')?.args)).toMatchObject({projectId:'10000000-0000-4000-8000-000000000001',label:'Arquitecta María',permissions:{budget:true,price:true,resources:true,operations:true,accounting:true,planning:true,project_data:true}});
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Revocar acceso',exact:true}).click();
 await expect(page.locator('.sharing-page')).toContainText('Revocado');
});
test('received P2P projects open from home in the normal workspace without mixing editable local data',async({page})=>{
 await bridge(page,{p2pOffline:true});await page.getByRole('button',{name:'Vinculación P2P',exact:true}).click();
 await page.getByLabel('Invitación del propietario').fill('cpobras1:de-maria');await page.getByRole('button',{name:'Vincular obra',exact:true}).click();
 await page.getByRole('button',{name:'Inicio / Obras',exact:true}).click();
 const row=page.locator('.external-project-row');await expect(row).toContainText('Obra remota de María');await expect(row).toContainText('Estudio de María');await expect(row).toContainText('Última copia');await expect(row.getByRole('button',{name:'Editar',exact:true})).toHaveCount(0);
 await row.getByRole('button',{name:'Abrir ›',exact:true}).click();
 await expect(page.locator('.context-title')).toContainText('Obra remota de María');await expect(page.locator('.status-pill')).toContainText('En elaboración · Solo lectura');
 await expect(page.locator('.line-row')).toContainText('Hormigón');await expect(page.getByRole('button',{name:'Emitir',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Planificación',exact:true}).click();await expect(page.locator('main')).toContainText('Replanteo remoto');await expect(page.getByRole('button',{name:'Nueva tarea / hito',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'← Volver al proyecto',exact:true}).click();await expect(page.getByRole('button',{name:'Nuevo registro',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'← Inicio',exact:true}).click();
 await expect(page.locator('main')).toContainText('Obra de prueba');await expect(page.locator('main')).toContainText('Obra remota de María');
 await page.getByPlaceholder('⌕ Buscar...', {exact:true}).fill('Estudio de María');await expect(row).toBeVisible();
 await page.screenshot({path:'/workspace/cpobras-external-home.png'});
});
test('P2P forms preserve drafts when navigation is rejected or an invitation is invalid',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Vinculación P2P',exact:true}).click();await page.getByLabel('Invitación del propietario').fill('invalida');
 page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Inicio / Obras',exact:true}).click();await expect(page.getByLabel('Invitación del propietario')).toHaveValue('invalida');
 await page.getByRole('button',{name:'Vincular obra',exact:true}).click();await expect(page.locator('#p2p-join-form .feature-error')).toContainText('Invitación inválida');await expect(page.getByLabel('Invitación del propietario')).toHaveValue('invalida');
});

test('issued external estimates keep their issued label and block synthetic edits',async({page})=>{
 await bridge(page,{remoteIssued:true});await page.getByRole('button',{name:'Vinculación P2P',exact:true}).click();await page.getByLabel('Invitación del propietario').fill('cpobras1:recibida');await page.getByRole('button',{name:'Vincular obra',exact:true}).click();await page.getByRole('button',{name:'Abrir copia',exact:true}).click();
 await expect(page.locator('.status-pill')).toContainText('Emitido · Solo lectura');await expect(page.locator('.brand-mark')).toHaveAttribute('alt','Yacaré de CPOBRAS');
 await page.locator('[data-action=modal-line]').dispatchEvent('click');await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>window.__calls.filter(c=>['add_estimate_line','update_estimate_line','save_project_plan','post_operation','save_management_record'].includes(c.command)).length)).toBe(0);
});
test('sharing permissions can be selected and changed per observer',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Vinculación P2P',exact:true}).click();
 const form=page.locator('#p2p-invite-form');await form.getByLabel('Nombre del observador').fill('Consulta parcial');await form.getByLabel('Determinación de precio',{exact:true}).uncheck();await form.getByLabel('Contabilidad y finanzas',{exact:true}).uncheck();await form.getByLabel('Insumos y composiciones',{exact:true}).uncheck();await form.getByRole('button',{name:'Crear invitación',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__calls.filter(c=>c.command==='p2p_invite').at(-1)?.args.permissions)).toMatchObject({price:false,accounting:false,resources:false,budget:true});
 await page.getByRole('button',{name:'Permisos',exact:true}).click();const edit=page.locator('#p2p-access-form');await expect(edit.getByLabel('Determinación de precio',{exact:true})).not.toBeChecked();await edit.getByLabel('Planificación',{exact:true}).uncheck();await edit.getByRole('button',{name:'Guardar permisos',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__calls.find(c=>c.command==='p2p_set_permissions')?.args.permissions.planning)).toBe(false);
});
test('external workspace disables unauthorized sections while preserving allowed consultation',async({page})=>{
 await bridge(page,{remotePermissions:{price:false,resources:false,accounting:false}});await page.getByRole('button',{name:'Vinculación P2P',exact:true}).click();await page.getByLabel('Invitación del propietario').fill('cpobras1:parcial');await page.getByRole('button',{name:'Vincular obra',exact:true}).click();await page.getByRole('button',{name:'Abrir copia',exact:true}).click();
 await expect(page.getByRole('button',{name:'Determinación de precio',exact:true})).toBeDisabled();await expect(page.locator('[data-action=panel][data-panel=resources]')).toBeHidden();await expect(page.locator('.line-row')).toContainText('Hormigón');
 await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await expect(page.getByRole('button',{name:'Finanzas',exact:true})).toBeHidden();
 await page.getByRole('button',{name:'Planificación',exact:true}).click();await expect(page.locator('main')).toContainText('Replanteo remoto');
 await page.screenshot({path:'/workspace/cpobras-external-workspace.png'});
});


test('issued budget can explicitly return to draft and be issued again',async({page})=>{
 await bridge(page,{issued:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();
 await expect(page.locator('[data-action=modal-line]')).toBeDisabled();
 page.on('dialog',d=>d.accept());
 await page.getByRole('button',{name:'Volver a En elaboración',exact:true}).click();
 await expect(page.locator('[data-action=modal-line]')).toBeEnabled();
 await expect(page.locator('.status-pill')).toContainText('En elaboración');
 await page.getByRole('button',{name:'Emitir',exact:true}).click();
 await expect(page.locator('.status-pill')).toContainText('Emitido');
 await expect(page.locator('[data-action=modal-line]')).toBeDisabled();
});


test('unit composition can be saved as an ACU pattern from the budget',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();
 await expect(page.getByRole('button',{name:'＋ Partida ACU',exact:true})).toHaveCount(0);
 await expect(page.locator('.work-toolbar [data-action=modal-from-acu] + [data-action=open-patterns]')).toHaveCount(1);
 await expect(page.locator('.project-context')).toHaveCount(0);
 await page.getByRole('tab',{name:'Insumos',exact:true}).click();await page.getByRole('button',{name:'Asignar',exact:true}).click();await page.getByRole('button',{name:'Guardar',exact:true}).click();await page.getByRole('tab',{name:'ACU',exact:true}).click();
 await page.getByRole('button',{name:'Guardar como patrón de ACU',exact:true}).click();
 await expect(page.getByLabel('Código del patrón',{exact:true})).toHaveAttribute('readonly','');await page.getByLabel('Descripción',{exact:true}).fill('Hormigón reutilizable');
 await page.getByRole('button',{name:'Guardar',exact:true}).click();
 const call=await page.evaluate(()=>window.__calls.find(c=>c.command==='save_line_as_analysis'));expect(call.args).toMatchObject({estimateId:'estimate-1',code:'',description:'Hormigón reutilizable'});
 await expect(page.locator('.line-row')).toContainText('Hormigón');
});

test('PERT creates budget tasks, connects precedences, preserves node movement and shares durations with Gantt',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Planificación',exact:true}).click();
 await page.getByRole('tab',{name:'PERT',exact:true}).click();
 await page.getByRole('button',{name:'Añadir',exact:true}).first().click();await expect(page.locator('.pert-node')).toHaveCount(1);
 await page.getByRole('button',{name:'Ver / editar tarea',exact:true}).click();await page.getByLabel('Nombre',{exact:true}).fill('Excavación');await page.getByText('Estimación PERT (opcional)',{exact:true}).first().click();await page.getByLabel('Calcular duración con tres estimaciones').check();
 await page.getByLabel('Optimista (días)',{exact:true}).fill('1');await page.getByLabel('Probable (días)',{exact:true}).fill('2');await page.getByLabel('Pesimista (días)',{exact:true}).fill('6');await page.getByRole('button',{name:'Guardar tarea y recalcular',exact:true}).click();
 await expect(page.locator('.pert-node')).toContainText('3 días');
 await page.getByRole('button',{name:'Nueva tarea / hito',exact:true}).click();await page.getByLabel('Nombre',{exact:true}).fill('Fundación');await page.getByRole('button',{name:'Guardar tarea y recalcular',exact:true}).click();
 await page.locator('.pert-node').last().scrollIntoViewIfNeeded();
 const out=await page.getByRole('button',{name:'Salida de Excavación',exact:true}).boundingBox(),input=await page.getByRole('button',{name:'Entrada de Fundación',exact:true}).boundingBox();await page.mouse.move(out.x+out.width/2,out.y+out.height/2);await page.mouse.down();await page.mouse.move(input.x+input.width/2,input.y+input.height/2,{steps:10});await page.mouse.up();
 await expect(page.locator('.pert-edge path')).toHaveCount(1);
 const before=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_project_plan').at(-1).args.plan);expect(before.tasks[1].predecessors[0].task_id).toBe(before.tasks[0].id);
 await page.getByRole('button',{name:'Salida de Fundación',exact:true}).click();await page.getByRole('button',{name:'Entrada de Excavación',exact:true}).click();await expect(page.locator('.toast')).toContainText('ciclo');await expect(page.locator('.pert-edge path')).toHaveCount(1);
 const handle=page.locator('[data-pert-handle]').first(),box=await handle.boundingBox();await page.mouse.move(box.x+40,box.y+10);await page.mouse.down();await page.mouse.move(box.x+130,box.y+80,{steps:7});await page.mouse.up();
 await expect.poll(()=>page.evaluate(()=>{const p=window.__calls.filter(c=>c.command==='save_project_plan').at(-1).args.plan;return Object.values(p.presentation)[0].x;})).toBeGreaterThan(35);
 const after=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_project_plan').at(-1).args.plan);expect(after.tasks[0].duration_days).toBe(3);expect(after.presentation[after.tasks[0].id].estimates).toEqual([1,2,6]);
 await page.screenshot({path:'/workspace/cpobras-pert.png',fullPage:true});await page.getByRole('tab',{name:'Gantt',exact:true}).click();await expect(page.locator('.gantt-bar')).toHaveCount(2);await expect(page.locator('.gantt-bar').first()).toHaveAttribute('title',/3 días/);
});

test('project dashboard edits physical data, expands its map and lists active budgets first',async({page})=>{
 await bridge(page,{context:true});await page.route('https://www.openstreetmap.org/**',route=>route.fulfill({contentType:'text/html',body:'<p>Mapa de prueba</p>'}));
 await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'← Volver al proyecto',exact:true}).click();
 await expect(page.getByRole('region',{name:'Tablero general de la obra'})).toBeVisible();
 await expect(page.locator('.dashboard-budget').first()).toContainText('En elaboración');
 await page.getByRole('button',{name:'Editar proyecto',exact:true}).first().click();await page.getByLabel('Nombre',{exact:true}).fill('Vivienda familiar');await page.getByLabel('Tipo de edificio',{exact:true}).fill('Vivienda');await page.getByLabel('Superficie estimada (m²)',{exact:true}).fill('120');await page.getByLabel('Memoria descriptiva',{exact:true}).fill('Construcción de una vivienda de dos plantas.');await page.getByText('Datos adicionales y parámetros económicos',{exact:true}).click();await page.getByLabel('Latitud',{exact:true}).fill('-34.60');await page.getByLabel('Longitud',{exact:true}).fill('-58.38');await page.getByRole('button',{name:'Guardar ficha',exact:true}).click();
 await expect(page.locator('.project-dashboard')).toContainText('120 m²');await expect(page.locator('.project-dashboard')).toContainText('dos plantas');
 await page.getByRole('button',{name:'Ampliar mapa',exact:true}).click();await expect(page.getByRole('dialog',{name:'Mapa de ubicación de la obra'})).toBeVisible();await page.locator('.modal-overlay').click({position:{x:2,y:2}});await expect(page.getByRole('dialog',{name:'Mapa de ubicación de la obra'})).toBeVisible();await page.getByRole('button',{name:'Cerrar mapa',exact:true}).click();
 await page.screenshot({path:'/workspace/cpobras-project-dashboard.png',fullPage:true});
});

test('measured quantities have a badge while manually entered quantities do not',async({page})=>{
 await bridge(page,{measured:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await expect(page.locator('.line-row .metrado-tag')).toHaveText('Metrado');
 const tabs=await page.locator('.menu-bar [data-action]').evaluateAll(nodes=>nodes.map(n=>n.dataset.action));expect(tabs.indexOf('open-planning')).toBeLessThan(tabs.indexOf('open-operations'));
});

test('reordering previews its insertion position and cancelling a file picker preserves the description',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Determinación de precio',exact:true}).click();
 await page.evaluate(()=>{const handle=document.querySelector('[data-price-drag]'),target=document.querySelectorAll('[data-price-row]')[1],transfer=new DataTransfer(),rect=target.getBoundingClientRect();window.__dragTransfer=transfer;handle.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));target.dispatchEvent(new DragEvent('dragover',{bubbles:true,dataTransfer:transfer,clientY:rect.top+2}));});
 await expect(page.locator('[data-price-row].drop-before')).toHaveCount(1);expect(await page.locator('[data-price-row].drop-before').evaluate(el=>getComputedStyle(el).animationName)).toBe('drop-target');
 await page.evaluate(()=>document.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:window.__dragTransfer})));await expect(page.locator('[data-price-row].drop-before')).toHaveCount(0);
 await page.getByRole('button',{name:'← Volver al proyecto',exact:true}).click();await page.getByLabel('Descripción del archivo',{exact:true}).fill('Plano para adjuntar');await page.getByRole('button',{name:'Agregar archivo…',exact:true}).click();await expect(page.getByLabel('Descripción del archivo',{exact:true})).toHaveValue('Plano para adjuntar');
});

test('PERT camera pans freely, zooms and keeps page focus after a node is saved',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Planificación',exact:true}).click();await page.getByRole('tab',{name:'PERT',exact:true}).click();
 const viewport=page.locator('[data-pert-viewport]');const before=await viewport.boundingBox();await page.getByRole('button',{name:'Añadir',exact:true}).first().click();await expect(page.locator('.pert-node')).toHaveCount(1);expect((await viewport.boundingBox()).height).toBe(before.height);
 await page.getByRole('button',{name:'Alejar PERT',exact:true}).click();await expect(page.locator('[data-pert-zoom]')).toHaveText('80 %');
 await viewport.scrollIntoViewIfNeeded();const b=await viewport.boundingBox();await page.mouse.move(b.x+b.width-60,b.y+b.height-80);await page.mouse.down();await page.mouse.move(b.x+b.width-120,b.y+b.height-130,{steps:5});await page.mouse.up();
 const camera=await page.locator('[data-pert-canvas]').getAttribute('style');await page.getByRole('button',{name:'Centrar / ver todo',exact:true}).click();await expect(page.locator('[data-pert-canvas]')).not.toHaveAttribute('style',camera);
 const focus=await page.locator('.feature-page').evaluate(el=>({top:el.scrollTop,left:el.scrollLeft})),transform=await page.locator('[data-pert-canvas]').evaluate(el=>el.style.transform);const handle=await page.locator('[data-pert-handle]').boundingBox();await page.mouse.move(handle.x+40,handle.y+10);await page.mouse.down();await page.mouse.move(handle.x+90,handle.y+30,{steps:6});await page.mouse.up();
 await expect.poll(()=>page.evaluate(()=>window.__calls.filter(c=>c.command==='save_project_plan').length)).toBe(2);expect(await page.locator('[data-pert-canvas]').evaluate(el=>el.style.transform)).toBe(transform);
 expect(await page.locator('.feature-page').evaluate(el=>({top:el.scrollTop,left:el.scrollLeft}))).toEqual(focus);
 await page.screenshot({path:'/workspace/cpobras-pert-camera.png',fullPage:true});
});

test('task segments conserve their source and expose separate durations and progress',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Planificación',exact:true}).click();await page.getByRole('tab',{name:'PERT',exact:true}).click();await page.getByRole('button',{name:'Añadir',exact:true}).first().click();
 await page.getByRole('button',{name:'Ver / editar tarea',exact:true}).click();await page.getByRole('button',{name:'Dividir en tramos',exact:true}).click();await page.getByLabel('Porcentaje para el primer tramo',{exact:true}).fill('30');await page.getByLabel('Duración del primer tramo',{exact:true}).fill('2');await page.getByLabel('Duración del segundo tramo',{exact:true}).fill('3');await page.getByRole('button',{name:'Dividir tarea',exact:true}).click();
 await expect(page.locator('.pert-node')).toHaveCount(2);await expect(page.locator('.pert-node').first()).toContainText('30 %');await expect(page.locator('.pert-node').nth(1)).toContainText('70 %');
 const saved=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_project_plan').at(-1).args.plan);expect(saved.tasks[0].estimate_line_id).toBe(saved.tasks[1].estimate_line_id);expect(saved.tasks.map(t=>t.duration_days)).toEqual([2,3]);expect(saved.tasks[1].predecessors[0].task_id).toBe(saved.tasks[0].id);
 await page.locator('.pert-node').nth(1).getByRole('button',{name:'Ver / editar tarea',exact:true}).click();await expect(page.getByLabel('Avance real %',{exact:true})).not.toBeEditable();await page.getByRole('button',{name:'Guardar tarea y recalcular',exact:true}).click();
 await page.getByRole('tab',{name:'Gantt',exact:true}).click();await expect(page.locator('.gantt-bar')).toHaveCount(2);
});

test('map opens over Argentina, selects a pin visually and saves coordinates to the current work',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'← Volver al proyecto',exact:true}).click();await expect(page.locator('[data-work-map] .map-tile').first()).toHaveAttribute('src',/tile.openstreetmap.org\/4\//);
 await page.getByRole('button',{name:'📍 Elegir ubicación',exact:true}).click();const map=page.locator('[data-work-map]');await map.click({position:{x:120,y:150}});const pin=await page.locator('[data-map-pin]').boundingBox();await page.mouse.move(pin.x+pin.width/2,pin.y+pin.height/2);await page.mouse.down();await page.mouse.move(pin.x+pin.width/2+25,pin.y+pin.height/2-20,{steps:6});await page.mouse.up();await page.getByRole('button',{name:'Guardar ubicación',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__calls.filter(c=>c.command==='save_management_record').length)).toBe(1);
 const saved=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_management_record').at(-1).args.record);expect(saved.kind).toBe('project_profile');expect(saved.attributes.address).toBe('Avenida de prueba 123');expect(saved.attributes.locality).toBe('Rosario');expect(Number(saved.attributes.latitude)).toBeLessThan(0);expect(Number(saved.attributes.longitude)).toBeLessThan(0);await expect(page.getByRole('button',{name:'📍 Elegir ubicación',exact:true})).toBeVisible();await expect(page.locator('[data-map-pin]')).toHaveCount(1);
 await page.getByRole('button',{name:'Editar proyecto',exact:true}).first().click();await expect(page.locator('table')).toHaveCount(0);const form=await page.locator('#management-form').boundingBox();expect(form.width).toBeGreaterThan(800);await page.screenshot({path:'/workspace/cpobras-compact-work-profile.png',fullPage:true});
});

test('Gantt uses actual dates, calendar header tiers and free horizontal panning',async({page})=>{
 await bridge(page,{ganttDates:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Planificación',exact:true}).click();await page.getByRole('tab',{name:'Gantt',exact:true}).click();await page.getByText('Calendario de la obra',{exact:true}).click();await page.getByLabel('Inicio del proyecto',{exact:true}).fill('2026-11-09');await page.getByRole('button',{name:'Guardar calendario',exact:true}).click();
 await page.getByRole('button',{name:'Nueva tarea / hito',exact:true}).click();await page.getByLabel('Nombre',{exact:true}).fill('Trabajo semanal');await page.getByLabel('Duración en días laborables (0 = hito)').fill('6');await page.getByRole('button',{name:'Guardar tarea y recalcular',exact:true}).click();
 await expect(page.locator('.gantt-calendar-header [aria-label=Años]')).toContainText('2026');await expect(page.locator('.gantt-calendar-header [aria-label=Meses]')).toContainText('Noviembre');await expect(page.locator('.gantt-header-tier').nth(2)).toContainText('Sem.');await expect(page.locator('[data-gantt-date="2026-11-14"]')).toHaveClass(/is-weekend/);await expect(page.locator('[data-gantt-date="2026-11-15"]')).toHaveClass(/is-weekend/);
 expect(await page.locator('.gantt-bar').evaluate(el=>Math.round(el.getBoundingClientRect().width))).toBe(256);
 await page.locator('[data-gantt-viewport]').scrollIntoViewIfNeeded();const before=await page.locator('[data-gantt-date]').first().getAttribute('data-gantt-date'),box=await page.locator('[data-gantt-viewport]').boundingBox();await page.mouse.move(box.x+180,box.y+12);await page.mouse.down();await page.mouse.move(box.x+340,box.y+12,{steps:6});await page.mouse.up();await expect(page.locator('[data-gantt-date]').first()).not.toHaveAttribute('data-gantt-date',before);
 const saves=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_project_plan').length);await page.getByRole('button',{name:'Gantt: cuatro semanas siguientes',exact:true}).click();await page.getByRole('button',{name:'Gantt: cuatro semanas anteriores',exact:true}).click();expect(await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_project_plan').length)).toBe(saves);
 await page.getByRole('button',{name:'Inicio de obra',exact:true}).click();
 const resize=await page.locator('.gantt-bar [data-resize]').boundingBox();await page.mouse.move(resize.x+resize.width/2,resize.y+resize.height/2);await page.mouse.down();await page.mouse.move(resize.x+resize.width/2-64,resize.y+resize.height/2,{steps:6});await page.mouse.up();await expect.poll(()=>page.evaluate(()=>window.__calls.filter(c=>c.command==='save_project_plan').at(-1).args.plan.tasks[0].duration_days)).toBe(5);await expect(page.locator('#planning-task-form')).toHaveCount(0);
 const bar=await page.locator('.gantt-bar').boundingBox();await page.mouse.move(bar.x+40,bar.y+10);await page.mouse.down();await page.mouse.move(bar.x+200,bar.y+10,{steps:6});await page.mouse.up();await expect.poll(()=>page.evaluate(()=>window.__calls.filter(c=>c.command==='save_project_plan').at(-1).args.plan.tasks[0].not_before)).toBe('2026-11-16');await expect(page.locator('#planning-task-form')).toHaveCount(0);
 await page.locator('.gantt-label').click();await expect(page.locator('#planning-task-form')).toHaveCount(0);
 await page.locator('.gantt-label').dblclick();await expect(page.locator('#planning-task-form')).toBeVisible();

 await page.screenshot({path:'/workspace/cpobras-gantt-calendar.png',fullPage:true});
});

test('calendar keeps multiple selected dates, descriptions and exceptional workdays after saving',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Planificación',exact:true}).click();await page.getByText('Calendario de la obra',{exact:true}).click();await page.getByLabel('Mes del calendario',{exact:true}).fill('2026-11');await page.getByLabel('Mes del calendario',{exact:true}).dispatchEvent('change');
 await page.getByRole('button',{name:'Marcar 2026-11-13',exact:true}).click();await page.getByLabel('Descripción 2026-11-13',{exact:true}).fill('Feriado de la obra');await page.getByRole('button',{name:'Marcar 2026-11-14',exact:true}).click();await expect(page.getByLabel('Descripción 2026-11-13',{exact:true})).toHaveValue('Feriado de la obra');await page.getByLabel('Descripción 2026-11-14',{exact:true}).fill('Recuperación de jornada');await page.getByLabel('Laborable 2026-11-14',{exact:true}).check();
 await expect(page.locator('.planning-calendar')).toHaveAttribute('open','');await expect(page.getByRole('button',{name:'Marcar 2026-11-14',exact:true})).toHaveClass(/exception-working/);
 await page.getByRole('button',{name:'Mes siguiente',exact:true}).click();await page.getByRole('button',{name:'Mes anterior',exact:true}).click();await expect(page.getByLabel('Descripción 2026-11-14',{exact:true})).toHaveValue('Recuperación de jornada');
 await page.getByRole('button',{name:'Mes siguiente',exact:true}).click();await page.getByRole('button',{name:'Marcar 2026-12-01',exact:true}).click();await page.getByLabel('Descripción 2026-12-01',{exact:true}).fill('Cierre de etapa');
 await page.getByRole('button',{name:'Guardar calendario',exact:true}).click();await expect(page.getByLabel('Mes del calendario',{exact:true})).toHaveValue('2026-12');const calendar=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_project_plan').at(-1).args.plan.calendar);expect(calendar.exceptions['2026-11-13']).toEqual({description:'Feriado de la obra',working:false});expect(calendar.exceptions['2026-11-14']).toEqual({description:'Recuperación de jornada',working:true});expect(calendar.exceptions['2026-11-13'].working).toBe(false);expect(calendar.exceptions['2026-11-14'].working).toBe(true);await expect(page.getByLabel('Descripción 2026-11-14',{exact:true})).toHaveValue('Recuperación de jornada');
 await page.setViewportSize({width:1920,height:1080});const left=await page.locator('.planning-calendar').boundingBox(),right=await page.locator('.planning-overview-row .planning-metrics').boundingBox();expect(Math.abs(left.y-right.y)).toBeLessThan(2);expect(right.x).toBeGreaterThan(left.x+left.width);await page.screenshot({path:'/workspace/cpobras-multi-holidays.png',fullPage:true});
});

test('a failed address lookup still saves the selected location and reports pending verification',async({page})=>{
 await bridge(page,{geocodeFails:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'← Volver al proyecto',exact:true}).click();await page.getByRole('button',{name:'📍 Elegir ubicación',exact:true}).click();await page.locator('[data-work-map]').click({position:{x:140,y:120}});await page.getByRole('button',{name:'Guardar ubicación',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__calls.filter(c=>c.command==='save_management_record').length)).toBe(1);const attrs=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_management_record').at(-1).args.record.attributes);expect(attrs.latitude).toBeTruthy();expect(attrs.longitude).toBeTruthy();expect(attrs.address_lookup_status).toBe('pending');await expect(page.locator('.toast')).toContainText('No se pudo obtener la dirección');await expect(page.locator('.card-profile')).toContainText('Dirección pendiente');
});

test('monthly rentals keep contract dates, quantities and payment terms in price determination',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Determinación de precio',exact:true}).click();
 await page.locator('.price-right').getByRole('button',{name:'Con detalle',exact:true}).click();await page.getByRole('button',{name:'＋ Ítem',exact:true}).click();
 await page.getByLabel('Descripción del detalle').fill('Baños químicos');await page.getByLabel('Cantidad del detalle').fill('2');await page.getByLabel('Precio del detalle ARS').fill('150000');
 await page.getByLabel('Calcular por período').check();await page.getByLabel('Inicio del alquiler',{exact:true}).fill('2026-11-01');await page.getByLabel('Fin del alquiler',{exact:true}).fill('2027-01-31');await page.getByLabel('Día de vencimiento mensual').fill('5');
 await page.locator('.price-modal button[type=submit]').click();await expect(page.locator('.price-item-row')).toContainText('Alquiler mensual');await page.getByRole('button',{name:'Guardar determinación',exact:true}).click();
 const item=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_price_definition').at(-1).args.definition.rows[0].items[0]);expect(item.quantity).toBe('2');expect(item.periodic).toEqual({start:'2026-11-01',end:'2027-01-31',payment_day:5,prorate:true});
});
test('certification cuts save financing settings and can be marked directly on the Gantt',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Planificación',exact:true}).click();
 await page.getByRole('tab',{name:'Gantt',exact:true}).click();await page.getByRole('button',{name:'Marcar cortes de certificación',exact:true}).click();await page.locator('button[data-gantt-date="2026-11-15"]').click();
 let saved=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_project_plan').at(-1).args.plan.finance);expect(saved.cut_dates).toEqual(['2026-11-15']);
 const date=page.locator('button[data-action="plan-cut-date"]').nth(3);const selected=await date.getAttribute('data-date');await date.click();
 await expect(page.locator(`[data-gantt-date="${selected}"]`)).toHaveClass(/is-certification-cut/);saved=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_project_plan').at(-1).args.plan.finance);expect(saved.cut_dates).toContain(selected);
});
test('financial periods show stock offsets and partial invoices can link to monthly rentals',async({page})=>{
 const rental={row_id:'row-rental',item_id:'item-rental',description:'Baño químico',currency:'ARS',period_start:'2026-11-01',period_end:'2026-11-30',due_date:'2026-11-05',amount:'300',invoiced:'0',unbilled:'300'};
 const material={resource_id:'resource-1',description:'Arena',unit:'m³',required:'10',from_stock:'6',pending_order:'1',purchase:'3',cost:'300'};
 await bridge(page,{financialReport:{recurring_costs:[rental],financial_projection:{currency:'ARS',as_of:'2026-11-05',opening_cash:'100',additional_cash:'500',warnings:[],periods:[{start:'2026-11-06',end:'2026-11-30',gross:'1000',advance:'100',retention:'50',net:'850',collection_date:'2026-12-15',expenses:'600',receipts:'0',additional_cash:'500',materials:[material]}],events:[{date:'2026-11-13',description:'Cuadrilla semanal',income:'0',expense:'600',balance:'-500'}]}}});
 await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await page.getByRole('button',{name:'Finanzas',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Previsión financiera · ARS',exact:true})).toBeVisible();await expect(page.getByRole('row').filter({hasText:'Arena'})).toContainText('6');await expect(page.locator('.financial-projection')).toContainText('2026-12-15');
 await page.getByLabel('Número / referencia',{exact:true}).fill('ALQ-1');await page.getByLabel('Importe',{exact:true}).fill('120');await page.getByLabel('Alquiler / gasto mensual previsto (opcional)').selectOption('row-rental|item-rental|2026-11-01');await page.getByRole('button',{name:'Registrar factura por pagar',exact:true}).click();
 const saved=await page.evaluate(()=>window.__calls.filter(c=>c.command==='post_operation').at(-1).args.operation);expect(saved.price_cost).toEqual({row_id:'row-rental',item_id:'item-rental',period_start:'2026-11-01'});expect(saved.amount).toBe('120');
});
test('consultation date appears in finance and is absent in materials and site book',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await expect(page.getByLabel('Consultar al',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Libro de obra',exact:true}).click();await expect(page.getByLabel('Consultar al',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Finanzas',exact:true}).click();await expect(page.getByLabel('Consultar al',{exact:true})).toBeVisible();
});

test('general calendar is managed from Home while a project can override a holiday without changing its origin',async({page})=>{
 await bridge(page,{generalCalendar:{revision:0,nonworking_weekdays:[5,6],exceptions:{'2026-11-09':{description:'Feriado nacional',working:false}}}});
 await page.getByRole('button',{name:'Datos generales',exact:true}).click();await expect(page.getByRole('heading',{name:'Calendario general',exact:true})).toBeVisible();await page.getByLabel('Laborable 2026-11-09',{exact:true}).check();await page.getByRole('button',{name:'Guardar calendario general',exact:true}).click();
 const general=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_general_calendar').at(-1).args.calendar);expect(general.exceptions['2026-11-09'].working).toBe(true);
 await page.getByRole('button',{name:'Inicio / Obras',exact:true}).click();await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Planificación',exact:true}).click();
 await page.getByRole('tab',{name:'Gantt',exact:true}).click();await expect(page.getByText('Líneas base e historial de revisiones',{exact:true})).toHaveCount(0);await expect(page.locator('[data-gantt-date="2026-11-09"]')).toHaveAttribute('title',/Feriado nacional.*Laborable/);
 await page.getByText('Calendario de la obra',{exact:true}).click();await page.getByText('Feriados heredados del calendario general',{exact:true}).click();await page.getByRole('button',{name:'Cambiar solo en esta obra',exact:true}).click();await page.getByRole('button',{name:'Guardar calendario',exact:true}).click();
 const saved=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_project_plan').at(-1).args.plan);expect(saved.calendar_overrides.exceptions['2026-11-09'].working).toBe(false);await expect(page.locator('[data-gantt-date="2026-11-09"]')).toHaveAttribute('title',/Feriado nacional.*No laborable/);
});
test('published index scores are shared data and each budget saves its weighted agreement',async({page})=>{
 await bridge(page,{indexPoints:[{id:'ipc',series:'IPC',period:'2026-08',value:'100',publication_date:'2026-09-01',source:'https://example.org/ipc'}]});await page.getByRole('button',{name:'Datos generales',exact:true}).click();await page.getByLabel('Serie del índice',{exact:true}).fill('CAC');await page.getByLabel('Mes del puntaje',{exact:true}).fill('2026-09');await page.getByLabel('Puntaje publicado',{exact:true}).fill('1250.5');await page.getByLabel('Fecha de publicación',{exact:true}).fill('2026-10-10');await page.getByLabel('Enlace de la fuente',{exact:true}).fill('https://example.org/cac');await page.getByRole('button',{name:'Registrar publicación',exact:true}).click();await expect(page.getByRole('cell',{name:'CAC',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Inicio / Obras',exact:true}).click();await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Determinación de precio',exact:true}).click();await page.getByRole('button',{name:'Acuerdo de ajuste del presupuesto',exact:true}).click();
 await page.getByLabel('Aplicar ajuste de índices',{exact:true}).check();await page.getByLabel('Período base del índice',{exact:true}).selectOption('2026-09');await page.getByLabel('Peso %',{exact:true}).fill('60');await page.getByRole('button',{name:'Agregar índice',exact:true}).click();await page.getByLabel('Índice',{exact:true}).nth(1).selectOption('IPC');await page.getByLabel('Período base del índice',{exact:true}).nth(1).selectOption('2026-08');await page.getByLabel('Peso %',{exact:true}).nth(1).fill('40');await page.getByRole('button',{name:'Guardar acuerdo',exact:true}).click();
 const saved=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_adjustment_agreement').at(-1).args);expect(saved.definition.base_month).toBe('2026-08');expect(saved.definition.weights).toEqual([{series:'CAC',base_month:'2026-09',weight:'0.6'},{series:'IPC',base_month:'2026-08',weight:'0.4'}]);
});
test('planning starts in PERT and financial overview lives in management',async({page})=>{
 await bridge(page,{certificationOverview:[{cut:'2026-11-20',amount:'1000',next_expenses:'600',remainder:'400',index_status:'Provisorio',collection_date:'2026-11-23',state:'Previsto'}]});await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Planificación',exact:true}).click();await expect(page.getByRole('tab',{name:'PERT',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.getByRole('heading',{name:'Certificaciones pactadas',exact:true})).toHaveCount(0);expect(await page.evaluate(()=>window.__calls.some(c=>c.command==='certification_overview'))).toBe(false);await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await page.getByRole('button',{name:'Certificaciones',exact:true}).click();await expect(page.getByRole('heading',{name:'Certificaciones pactadas',exact:true})).toBeVisible();await expect(page.getByRole('columnheader',{name:'Gastos próxima etapa',exact:true})).toBeVisible();
});
test('client draft saves extras and differences and generates preliminary without issuing',async({page})=>{
 await bridge(page,{issued:true,pendingDifferences:[{estimate_id:'estimate-1',source_id:'old-cert',source_number:'CERT-1',delta:'100'}]});await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await page.getByRole('button',{name:'Certificaciones',exact:true}).click();await page.getByRole('button',{name:'Modificar avances',exact:true}).click();await page.getByLabel('Avance acumulado Hormigón',{exact:true}).fill('50');await page.getByText('Adicionales y diferencias de ajuste',{exact:true}).click();await page.getByRole('button',{name:'Agregar adicional puntual',exact:true}).click();await page.getByLabel('Descripción',{exact:true}).fill('Movilización extraordinaria');await page.getByLabel('Motivo',{exact:true}).fill('Cambio solicitado');await page.getByLabel('Autorización del comitente',{exact:true}).fill('Orden 18');await page.getByLabel('Importe completo',{exact:true}).fill('500');await page.getByLabel('Ajustar índices',{exact:true}).check();await page.getByLabel(/CERT-1 · Diferencia/).check();await page.getByRole('button',{name:'Generar PRELIMINAR PDF',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__calls.filter(c=>c.command==='save_export_file').length)).toBe(1);const saved=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_certificate_draft').at(-1).args.draft);expect(saved.operation.reconcile_ids).toEqual(['old-cert']);expect(saved.operation.extras[0]).toMatchObject({description:'Movilización extraordinaria',amount:'500',adjustable:true});expect(await page.evaluate(()=>window.__calls.some(c=>c.command==='issue_certificate_draft'))).toBe(false);
});
test('an existing certification cut moves with a drag and still deletes with one click',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Planificación',exact:true}).click();await page.getByRole('tab',{name:'Gantt',exact:true}).click();await page.getByRole('button',{name:'Marcar cortes de certificación',exact:true}).click();await page.locator('button[data-gantt-date="2026-11-12"]').click();
 await expect(page.locator('.gantt-toolbar')).toContainText('otro clic lo elimina');const cut=page.locator('button[data-gantt-date="2026-11-12"]');await page.locator(".gantt-board").scrollIntoViewIfNeeded();const box=await cut.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+64,box.y+box.height/2,{steps:5});await page.mouse.up();
 await expect.poll(()=>page.evaluate(()=>window.__calls.filter(c=>c.command==='save_project_plan').at(-1).args.plan.finance.cut_dates)).toEqual(['2026-11-14']);await page.locator('button[data-gantt-date="2026-11-14"]').click();await expect.poll(()=>page.evaluate(()=>window.__calls.filter(c=>c.command==='save_project_plan').at(-1).args.plan.finance.cut_dates)).toEqual([]);
});
test('agreement stores advance recovery before adjustment independently of indices',async({page})=>{await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await page.getByRole('button',{name:'Certificaciones',exact:true}).click();await page.getByRole('button',{name:'Acuerdo, anticipo y reparo del presupuesto',exact:true}).click();await page.getByLabel('Recuperación de anticipo % (antes del ajuste)',{exact:true}).fill('20');await page.getByLabel('Fondo de reparo %',{exact:true}).fill('5');await page.getByRole('button',{name:'Guardar acuerdo',exact:true}).click();const saved=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_adjustment_agreement').at(-1).args);expect(saved.definition).toBe(null);expect(saved.terms.advance_recovery_percent).toBe('20');});
test('material and work quotation requests export clean supplier templates with readable filenames',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await page.getByRole('button',{name:'+ Nueva',exact:true}).click();await page.getByLabel('Nombre de la solicitud',{exact:true}).fill('Corralón casa');await page.locator('[data-request-source] input[type=checkbox]').check();await page.locator('[data-request-source] input[type=number]').fill('20');await page.getByRole('button',{name:'Guardar solicitud',exact:true}).click();await page.getByRole('button',{name:'Planilla para completar precios',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__calls.filter(c=>c.command==='save_export_file').length)).toBe(1);expect(await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_export_file').at(-1).args.name)).toBe('Corralón casa.xlsx');const req=await page.evaluate(()=>window.__calls.filter(c=>c.command==='create_quotation_request').at(-1).args.request);expect(req.items[0].quantity).toBe('20');expect(req.items[0]).not.toHaveProperty('unit_price');await page.getByRole('button',{name:'Subcontrataciones',exact:true}).click();await page.getByRole('button',{name:'+ Nueva',exact:true}).click();await page.getByLabel('Nombre de la solicitud',{exact:true}).fill('Albañilería');await page.locator('[data-request-source] input[type=checkbox]').check();await page.getByRole('button',{name:'Guardar solicitud',exact:true}).click();expect(await page.evaluate(()=>window.__calls.filter(c=>c.command==='create_quotation_request').at(-1).args.request.kind)).toBe('work');
});

test('site book keeps editable drafts, confirms with consent, locks entries and paginates at thirty',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await page.getByRole('button',{name:'Libro de obra',exact:true}).click();await expect(page.getByLabel('Número / referencia',{exact:true})).toHaveCount(0);await page.getByLabel('Descripción del parte',{exact:true}).fill('Se hizo el replanteo');await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();await expect(page.locator('.site-book tbody tr')).toContainText('PAR-0001');await page.getByRole('button',{name:'Editar',exact:true}).click();await page.getByLabel('Descripción del parte',{exact:true}).fill('Replanteo verificado');await page.getByRole('button',{name:'Guardar cambios del borrador',exact:true}).click();page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Confirmar',exact:true}).click();await expect(page.getByRole('button',{name:'Editar',exact:true})).toBeVisible();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Confirmar',exact:true}).click();await expect(page.getByRole('button',{name:'Editar',exact:true})).toHaveCount(0);await expect(page.locator('.site-book tbody tr')).toContainText('Confirmado');await page.getByRole('button',{name:'PDF de partes confirmados',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__calls.filter(c=>c.command==='save_export_file').length)).toBe(1);
 await page.evaluate(()=>{const base=window.__siteEntries[0];window.__siteEntries=Array.from({length:31},(_,i)=>({...base,id:'entry-'+i,number:'PAR-'+String(i+1).padStart(4,'0'),description:'Parte '+i}));});await page.getByRole('button',{name:'Materiales y Acopio',exact:true}).click();await page.getByRole('button',{name:'Libro de obra',exact:true}).click();await expect(page.locator('.site-book tbody tr')).toHaveCount(30);await expect(page.locator('.site-book tbody tr').first()).toContainText('PAR-0031');await page.getByRole('button',{name:'Siguiente',exact:true}).click();await expect(page.locator('.site-book tbody tr')).toHaveCount(1);await expect(page.locator('.site-book tbody tr')).toContainText('PAR-0001');await page.setViewportSize({width:1600,height:1000});await page.screenshot({path:'/workspace/cpobras-site-book.png',fullPage:true});
});
test('quotation prices are edited in the comparison grid, attachments stay with supplier and distribution creates an order',async({page})=>{
 await bridge(page,{financialReport:{needs:[{resource_id:'resource-1',required:'20',stock:'2',ordered:'5',received:'0',shortage:'18'}]}});await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await page.getByRole('button',{name:'+ Nueva',exact:true}).click();await expect(page.locator('.required-material')).toContainText('Acero');await page.locator('[data-request-source] input[type=checkbox]').check();await expect(page.locator('[data-request-source] input[type=number]')).toHaveValue('13');await page.getByLabel('Nombre de la solicitud',{exact:true}).fill('Corralón');await page.getByRole('button',{name:'Guardar solicitud',exact:true}).click();await page.getByRole('combobox',{name:'Agregar proveedor',exact:true}).selectOption('supplier-1');await page.getByRole('button',{name:'Agregar proveedor',exact:true}).click();const cell=page.locator('[data-quote-cell]');await cell.fill('100');await expect(page.locator('[data-quote-total]')).toContainText('1.300,00');await page.getByRole('button',{name:'Guardar precios',exact:true}).click();await page.locator('[data-quote-attachment]').setInputFiles({name:'Oferta.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nOferta')});await expect(page.getByRole('button',{name:'Oferta.pdf',exact:true})).toBeVisible();await page.getByRole('button',{name:'Distribuir pedido',exact:true}).click();await expect(page.getByRole('dialog',{name:'Distribuir pedido',exact:true})).toContainText('Menor precio');await page.getByRole('button',{name:'Confirmar adjudicación',exact:true}).click();await expect(page.locator('.workflow-card').filter({hasText:'Pedidos a proveedores'})).toContainText('PED-0001');const award=await page.evaluate(()=>window.__calls.filter(c=>c.command==='award_quotation').at(-1).args);expect(award.choices).toHaveLength(1);expect(award.choices[0].quantity).toBe('13');await page.getByRole('button',{name:'Registrar entrega',exact:true}).click();await page.getByLabel('Acero · Pendiente 13',{exact:true}).fill('5');await page.getByRole('button',{name:'Confirmar recepción',exact:true}).click();await expect(page.locator('.workflow-card').filter({hasText:'Pedidos a proveedores'})).toContainText('Parcial');await page.setViewportSize({width:1800,height:1100});await page.screenshot({path:'/workspace/cpobras-material-quotes.png',fullPage:true});
});
test('only the open client certificate is editable in one chronological table',async({page})=>{
 await bridge(page,{issued:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await page.getByRole('button',{name:'Certificaciones',exact:true}).click();await expect(page.getByRole('button',{name:'Modificar avances',exact:true})).toHaveCount(1);await expect(page.getByText('Certificados de avance',{exact:true})).toHaveCount(0);await expect(page.locator('.operations-page .data-grid')).toHaveCount(1);await expect(page.getByLabel('Inicio del período',{exact:true})).toHaveCount(0);await expect(page.locator('.data-grid')).toContainText('Pendiente');await page.getByRole('button',{name:'Modificar avances',exact:true}).click();await expect(page.getByLabel('Desde',{exact:true})).not.toBeEditable();await expect(page.getByLabel('Hasta',{exact:true})).not.toBeEditable();
});

test('subcontracts have their own request matrix and open contractor certificates from the awarded contract',async({page})=>{
 await bridge(page,{issued:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await page.getByRole('button',{name:'Subcontrataciones',exact:true}).click();await expect(page.getByRole('button',{name:'Por materiales',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'+ Nueva',exact:true}).click();await page.getByLabel('Nombre de la solicitud',{exact:true}).fill('Albañilería');await page.locator('[data-request-source] input[type=checkbox]').check();await page.getByRole('button',{name:'Guardar solicitud',exact:true}).click();await page.getByRole('combobox',{name:'Agregar proveedor',exact:true}).selectOption('supplier-1');await page.getByRole('button',{name:'Agregar proveedor',exact:true}).click();await page.locator('[data-quote-cell]').fill('40');await page.getByRole('button',{name:'Guardar precios',exact:true}).click();await page.getByRole('button',{name:'Distribuir pedido',exact:true}).click();await page.getByLabel('Aporta ejecución física (desmarcar apoyos, alquileres y servicios)',{exact:true}).uncheck();await page.getByRole('combobox',{name:'Frecuencia de pago',exact:true}).selectOption('weekly');await expect(page.getByLabel('Aporta ejecución física (desmarcar apoyos, alquileres y servicios)',{exact:true})).not.toBeChecked();await page.getByLabel('Aporta ejecución física (desmarcar apoyos, alquileres y servicios)',{exact:true}).check();await page.getByRole('button',{name:'Confirmar adjudicación',exact:true}).click();await expect(page.getByRole('heading',{name:'Subcontratos adjudicados',exact:true})).toBeVisible();await page.getByRole('button',{name:'Certificar avances / pagos',exact:true}).click();await page.getByRole('button',{name:'Modificar avances del contratista',exact:true}).click();await expect(page.getByRole('dialog',{name:'Modificar avances',exact:true})).toContainText('Contratista');const draft=await page.evaluate(()=>window.__calls.filter(c=>c.command==='open_certificate_draft').at(-1).args);expect(draft.contractId).toBeTruthy();await page.setViewportSize({width:1600,height:1000});await page.screenshot({path:'/workspace/cpobras-subcontracts.png',fullPage:true});
});

test('requests can be edited from the list and saved supplier prices survive edits',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await page.getByRole('button',{name:'+ Nueva',exact:true}).click();await page.getByLabel('Nombre de la solicitud',{exact:true}).fill('Corralón editable');await page.locator('[data-request-source] input[type=checkbox]').check();await page.locator('[data-request-source] input[type=number]').fill('4');await page.getByRole('button',{name:'Guardar solicitud',exact:true}).click();await page.getByRole('combobox',{name:'Agregar proveedor',exact:true}).selectOption('supplier-1');await page.getByRole('button',{name:'Agregar proveedor',exact:true}).click();await page.locator('[data-quote-cell]').fill('25');await expect(page.locator('[data-quote-save-state]')).toHaveText('Cambios sin guardar');await page.getByRole('button',{name:'Guardar precios',exact:true}).click();await expect(page.locator('[data-quote-save-state]')).toHaveText('Precios guardados');await page.getByRole('button',{name:'Editar solicitud Corralón editable',exact:true}).click();await expect(page.getByRole('dialog',{name:'Solicitud de cotización',exact:true})).toContainText('Editar solicitud');await expect(page.getByRole('combobox',{name:'Moneda',exact:true})).toBeDisabled();await page.locator('[data-request-source] input[type=number]').fill('6');await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await expect(page.locator('[data-quote-cell]')).toHaveValue('25');await expect(page.locator('[data-quote-total]')).toContainText('150,00');
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Quitar proveedor',exact:true}).click();await expect(page.locator('[data-quote-cell]')).toHaveCount(0);await page.getByRole('button',{name:'Libro de obra',exact:true}).click();await page.getByRole('button',{name:'Materiales y Acopio',exact:true}).click();await expect(page.locator('[data-quote-cell]')).toHaveCount(0);await page.getByRole('combobox',{name:'Agregar proveedor',exact:true}).selectOption('supplier-1');await page.getByRole('button',{name:'Agregar proveedor',exact:true}).click();await expect(page.locator('[data-quote-cell]')).toHaveValue('25');
});
test('unsaved supplier prices can be saved on navigation, cancelled or explicitly discarded',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await page.getByRole('button',{name:'+ Nueva',exact:true}).click();await page.getByLabel('Nombre de la solicitud',{exact:true}).fill('Precios');await page.locator('[data-request-source] input[type=checkbox]').check();await page.getByRole('button',{name:'Guardar solicitud',exact:true}).click();await page.getByRole('combobox',{name:'Agregar proveedor',exact:true}).selectOption('supplier-1');await page.getByRole('button',{name:'Agregar proveedor',exact:true}).click();await page.locator('[data-quote-cell]').fill('123');await page.getByRole('button',{name:'Libro de obra',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Precios sin guardar',exact:true});await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(page.locator('[data-quote-cell]')).toHaveValue('123');await page.getByRole('button',{name:'Libro de obra',exact:true}).click();await dialog.getByRole('button',{name:'Guardar y continuar',exact:true}).click();await expect(page.getByRole('heading',{name:'Libro de obra',exact:true})).toBeVisible();await page.getByRole('button',{name:'Materiales y Acopio',exact:true}).click();await expect(page.locator('[data-quote-cell]')).toHaveValue('123');await page.locator('[data-quote-cell]').fill('999');await page.getByRole('button',{name:'Libro de obra',exact:true}).click();await dialog.getByRole('button',{name:'Descartar',exact:true}).click();await page.getByRole('button',{name:'Materiales y Acopio',exact:true}).click();await expect(page.locator('[data-quote-cell]')).toHaveValue('123');
 await page.locator('[data-quote-cell]').fill('456');await page.getByRole('button',{name:'Planificación',exact:true}).click();await dialog.getByRole('button',{name:'Guardar y continuar',exact:true}).click();await expect(page.getByRole('heading',{name:'Planificación de obras',exact:true})).toBeVisible();await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await expect(page.locator('[data-quote-cell]')).toHaveValue('456');
});

test('a failed save in the navigation dialog keeps prices and prevents leaving',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await page.getByRole('button',{name:'+ Nueva',exact:true}).click();await page.getByLabel('Nombre de la solicitud',{exact:true}).fill('Validar precios');await page.locator('[data-request-source] input[type=checkbox]').check();await page.getByRole('button',{name:'Guardar solicitud',exact:true}).click();await page.getByRole('combobox',{name:'Agregar proveedor',exact:true}).selectOption('supplier-1');await page.getByRole('button',{name:'Agregar proveedor',exact:true}).click();await page.locator('[data-quote-cell]').fill('-1');await page.getByRole('button',{name:'Libro de obra',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Precios sin guardar',exact:true});await dialog.getByRole('button',{name:'Guardar y continuar',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Ingresá precios unitarios positivos');await expect(page.getByRole('heading',{name:'Libro de obra',exact:true})).toHaveCount(0);await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(page.locator('[data-quote-cell]')).toHaveValue('-1');await page.locator('[data-quote-cell]').fill('10');await page.getByRole('button',{name:'Guardar precios',exact:true}).click();await expect(page.locator('[data-quote-save-state]')).toHaveText('Precios guardados');
});

test('PERT eraser stages dependency and node removal, cancel restores, done saves clean references',async({page})=>{
 await bridge(page,{twoLines:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();
 await page.getByRole('button',{name:'Planificación',exact:true}).click();
 await page.getByRole('button',{name:'Añadir',exact:true}).first().click();await page.getByRole('button',{name:'Añadir',exact:true}).first().click();await page.getByRole('button',{name:'Organizar nodos',exact:true}).click();
 const nodes=page.locator('.pert-node');const ids=await nodes.evaluateAll(rows=>rows.map(r=>r.dataset.pertNode));
 await page.locator(`[data-pert-out="${ids[0]}"]`).click();await page.locator(`[data-pert-in="${ids[1]}"]`).click();
 const saves=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_project_plan').length);
 await page.getByRole('button',{name:'Quitar',exact:true}).click();
 await page.locator(`[data-pert-node="${ids[0]}"] header`).click();
 await expect(nodes).toHaveCount(1);await expect(page.locator('.pert-edge')).toHaveCount(0);
 expect(await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_project_plan').length)).toBe(saves);
 await page.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(nodes).toHaveCount(2);await expect(page.locator('.pert-edge')).toHaveCount(1);
 await page.getByRole('button',{name:'Quitar',exact:true}).click();await page.locator(`[data-pert-node="${ids[0]}"] header`).click();
 await page.getByRole('button',{name:'Listo',exact:true}).click();
 const saved=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_project_plan').at(-1).args.plan);
 expect(saved.tasks).toHaveLength(1);expect(saved.tasks[0].predecessors).toEqual([]);expect(saved.presentation[ids[0]]).toBeUndefined();
 await expect(page.getByRole('button',{name:'Añadir',exact:true})).toHaveCount(1);
});
test('mini map zoom follows the wheel and PERT inserts nodes in its visible center',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();
 const map=page.locator('[data-work-map]');const oldTile=await map.locator('.map-tile').first().getAttribute('src');
 await map.hover();await page.mouse.wheel(0,-100);await expect(map.locator('.map-tile').first()).not.toHaveAttribute('src',oldTile);
 await page.locator('[data-action=manage-dashboard-budget]').first().click();await page.getByRole('button',{name:'Planificación',exact:true}).click();
 const viewport=page.locator('[data-pert-viewport]');const box=await viewport.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,180);
 await expect(page.locator('[data-pert-zoom]')).not.toHaveText('100 %');
 await page.getByRole('button',{name:'Añadir',exact:true}).first().click();
 const node=await page.locator('.pert-node').boundingBox();expect(Math.abs(node.x+node.width/2-box.x-box.width/2)).toBeLessThan(10);expect(Math.abs(node.y+node.height/2-box.y-box.height/2)).toBeLessThan(25);
});

test('supplier movement dialogs are compact, submit inline edits and attach receipt and payment proofs',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();
 await page.evaluate(()=>{window.__supplierOrders=[{document:{id:'order',kind:'purchase_order',number:'PED-0099',partner_id:'supplier-1',currency:'ARS',amount:'1000',estimate_id:'estimate-1',due_date:'2026-11-20',lines:[{resource_id:'resource-1',description:'Acero',quantity:'10',unit_price:'100'}]},lines:[{source_id:'resource-1',description:'Acero',quantity:'10',unit_price:'100',received:'0',remaining:'10',vendor_stock:'0',requested:'0'}],paid:'0',cash_paid:'0',pending_payment:'1000',payment_state:'Pendiente',delivery_state:'Solicitado',editable:true,revision:0,supplier_credit:'0',files:[]}];});
 await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();
 await page.getByRole('button',{name:'Editar pedido',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'Editar pedido',exact:true});await expect(dialog).toBeVisible();
 await dialog.getByLabel('Cantidad',{exact:true}).fill('12');await dialog.getByRole('button',{name:'Guardar cambios',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__calls.filter(c=>c.command==='record_supplier_movement').length)).toBe(1);
 expect(await page.evaluate(()=>window.__calls.filter(c=>c.command==='record_supplier_movement').at(-1).args.movement.lines[0].quantity)).toBe('12');
 await page.getByRole('button',{name:'Registrar entrega',exact:true}).click();dialog=page.getByRole('dialog',{name:'Registrar entrega',exact:true});
 expect((await dialog.boundingBox()).width).toBeLessThan(700);
 await dialog.getByLabel(/Acero · Pendiente/).fill('2');await dialog.locator('[name=proof]').setInputFiles({name:'remito-firmado.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 prueba')});
 await dialog.getByRole('button',{name:'Confirmar recepción',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__calls.filter(c=>c.command==='receive_material_order_with_proof').at(-1)?.args.proof?.name)).toBe('remito-firmado.pdf');await expect(dialog).toHaveCount(0);
 await page.getByRole('button',{name:'Registrar pago',exact:true}).click();dialog=page.getByRole('dialog',{name:'Registrar pago',exact:true});expect((await dialog.boundingBox()).width).toBeLessThan(700);
 await dialog.locator('[name=proof]').setInputFiles({name:'recibo.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 prueba')});await dialog.getByRole('button',{name:'Registrar pago',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__calls.filter(c=>c.command==='material_payment_with_proof').at(-1)?.args.proof?.name)).toBe('recibo.pdf');await expect(dialog).toHaveCount(0);
 await page.getByRole('button',{name:'Declarar acopio existente',exact:true}).click();await expect(page.getByRole('dialog',{name:'Declarar acopio existente',exact:true})).toBeVisible();
});

test('pending batch: closed calendar, return navigation and live certificate footer',async({page})=>{
 await bridge(page,{issued:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();
 const nav=page.getByRole('navigation',{name:'Navegación principal'});const labels=await nav.getByRole('button').allTextContents();expect(labels.slice(0,2)).toEqual(['← Inicio','← Volver al proyecto']);
 await page.getByRole('button',{name:'Planificación',exact:true}).click();await page.getByRole('tab',{name:'Gantt',exact:true}).click();
 const calendar=page.locator('.planning-calendar');await calendar.locator('summary').first().click();await page.getByRole('button',{name:'Guardar calendario',exact:true}).click();await calendar.locator('summary').first().click();
 await page.getByRole('button',{name:'Marcar cortes de certificación',exact:true}).click();await expect(calendar).not.toHaveAttribute('open','');await page.locator('[data-action=plan-finance-mark]').click();await expect(calendar).not.toHaveAttribute('open','');
 await page.getByRole('button',{name:'← Volver al proyecto',exact:true}).click();await expect(page.getByRole('button',{name:'Ir al presupuesto: Presupuesto inicial',exact:true})).toBeVisible();await page.getByRole('button',{name:'Ir al presupuesto: Presupuesto inicial',exact:true}).click();
 await expect(page.getByLabel('Estado del presupuesto',{exact:true})).toHaveValue('issued');
 await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await page.getByRole('button',{name:'Certificaciones',exact:true}).click();await page.getByRole('button',{name:'Modificar avances',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'Modificar avances',exact:true});await editor.getByLabel('Avance acumulado Hormigón',{exact:true}).fill('50');await expect(editor.locator('[data-certificate-totals]')).toContainText('100,00');
 expect(await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_certificate_draft').length)).toBe(0);
 await expect(editor.locator('.certificate-body')).toHaveCSS('overflow-y','auto');await expect(editor.locator('[data-certificate-totals]')).toBeVisible();
 await editor.getByText('Adicionales y diferencias de ajuste',{exact:true}).click();await editor.getByRole('button',{name:'Agregar adicional puntual',exact:true}).click();await editor.getByRole('button',{name:'Guardar borrador',exact:true}).click();
 await editor.getByRole('button',{name:'Cerrar',exact:true}).click();await page.getByRole('button',{name:'Modificar avances',exact:true}).click();await expect(editor).toBeVisible();
});

test('certificate regression: reopening recalculates saved percentages, measurements have columns and signed zero exports',async({page})=>{
 await bridge(page,{issued:true,signedZeroAdvance:true});await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();
 await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await page.getByRole('button',{name:'Certificaciones',exact:true}).click();await page.getByRole('button',{name:'Modificar avances',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'Modificar avances',exact:true});await editor.getByLabel('Avance acumulado Hormigón',{exact:true}).fill('50');await editor.getByRole('button',{name:'Guardar borrador',exact:true}).click();await editor.getByRole('button',{name:'Cerrar',exact:true}).click();
 await page.evaluate(()=>{const d=window.__certDrafts[0];d.operation.lines=[];d.operation.calculated={};d.operation.amount='0';});
 await page.getByRole('button',{name:'Modificar avances',exact:true}).click();
 await expect(editor.getByLabel('Avance acumulado Hormigón',{exact:true})).toHaveValue('50');
 await expect(editor.locator('[data-certificate-totals]')).toContainText('100,00');
 await expect(editor.getByRole('columnheader',{name:'Unidad',exact:true})).toBeVisible();await expect(editor.getByRole('columnheader',{name:'Cantidad contratada',exact:true})).toBeVisible();
 await expect(editor.locator('.certificate-quantity')).toHaveText('2');await expect(editor.locator('.certificate-unit')).toHaveText('m³');
 await editor.getByLabel('Avance acumulado Hormigón',{exact:true}).fill('70');await expect(editor.locator('[data-cert-amount]')).toHaveText('140,00');await expect(editor.locator('[data-cert-period]')).toHaveText('70');await expect(editor.locator('[data-certificate-totals]')).toContainText('140,00');
 await editor.getByRole('button',{name:'Generar PRELIMINAR PDF',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__calls.filter(c=>c.command==='save_export_file').length)).toBe(1);
 page.once('dialog',d=>d.accept());await editor.getByRole('button',{name:'Emitir certificado aprobado',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__calls.filter(c=>c.command==='issue_certificate_draft').length)).toBe(1);await expect.poll(()=>page.evaluate(()=>window.__calls.filter(c=>c.command==='save_export_file').length)).toBe(2);
});

test('procurement layout: compact unit and quantity columns preserve supplier space and item prices',async({page})=>{
 await page.setViewportSize({width:1600,height:1000});await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();
 await page.evaluate(()=>{
  window.__quotationRequests=[{id:'request-layout',project_id:'10000000-0000-4000-8000-000000000001',estimate_id:null,kind:'material',title:'Corralón',number:'SOL-0001',date:'2026-11-10',currency:'ARS',scope:'Materiales',delivery:'',payment:'',validity:'',taxes:'Sin IVA',items:[{id:'item-layout',source_id:'resource-1',description:'Acero',unit:'kg',quantity:'20'}]}];
  window.__responses=Array.from({length:4},(_,i)=>({id:'response-'+i,request_id:'request-layout',supplier_id:i===0?'supplier-1':'supplier-'+(i+1),revision:1,reference:'',terms:'',prices:[{row_id:'item-layout',unit_price:'50',notes:''}]}));
  window.__supplierOrders=[{document:{id:'order-layout',kind:'purchase_order',number:'PED-0001',partner_id:'supplier-1',currency:'ARS',amount:'1000',estimate_id:'estimate-1',due_date:'2026-11-20',lines:[{resource_id:'resource-1',description:'Acero',quantity:'20',unit_price:'50'}]},lines:[{source_id:'resource-1',description:'Acero',quantity:'20',unit_price:'50',received:'5',remaining:'15',vendor_stock:'0',requested:'0'}],paid:'0',cash_paid:'0',pending_payment:'1000',payment_state:'Pendiente',delivery_state:'Parcial',editable:false,revision:0,supplier_credit:'0',files:[]}];
 });
 await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();const matrix=page.locator('.quotation-matrix');
 await expect(matrix.locator('th.quote-provider')).toHaveCount(4);const unit=await matrix.locator('th.quote-unit').boundingBox(),quantity=await matrix.locator('th.quote-quantity').boundingBox(),provider=await matrix.locator('th.quote-provider').first().boundingBox();expect(unit.width).toBeLessThan(80);expect(quantity.width).toBeLessThan(140);expect(provider.width).toBeGreaterThanOrEqual(190);
 await page.getByText('1 materiales',{exact:true}).click();const item=page.locator('.order-line-item');await expect(item).toContainText('Cantidad: 20');await expect(item).toContainText('Unitario sin IVA: ARS 50,00');await expect(item).toContainText('Subtotal sin IVA: ARS 1.000,00');await expect(item).toContainText('5 recibidos · Pendiente: 15');
});

test('delivery requests enforce exact available stock and offer Todo',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();
 await page.evaluate(()=>{window.__supplierOrders=[{document:{id:'order',kind:'purchase_order',number:'PED-0099',partner_id:'supplier-1',currency:'ARS',amount:'1000',estimate_id:'estimate-1',due_date:'2026-11-20',lines:[{resource_id:'resource-1',description:'Acero',quantity:'10',unit_price:'100'}]},lines:[{source_id:'resource-1',description:'Acero',quantity:'10',unit_price:'100',received:'0',remaining:'10',vendor_stock:'2.50000001',requested:'0.10000001'}],paid:'0',cash_paid:'0',pending_payment:'1000',payment_state:'Pendiente',delivery_state:'Solicitado',editable:true,revision:0,supplier_credit:'0',files:[]}];});
 await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();
 await page.getByRole('button',{name:'Solicitar entrega',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Solicitar entrega',exact:true});
 const quantity=dialog.locator('[data-movement-quantity]');
 await expect(quantity).toHaveAttribute('max','2.40000000');
 await quantity.fill('10');
 await expect(dialog.locator('[data-quantity-error]')).toContainText('No puede superar el máximo disponible');
 await dialog.getByRole('button',{name:'Todo',exact:true}).click();
 await expect(quantity).toHaveValue('2.40000000');
 await expect(dialog.locator('[data-quantity-error]')).toBeEmpty();
 await dialog.getByRole('button',{name:'Confirmar',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__calls.filter(c=>c.command==='record_supplier_movement').length)).toBe(1);
 expect(await page.evaluate(()=>window.__calls.filter(c=>c.command==='record_supplier_movement').at(-1).args.movement.quantities['resource-1'])).toBe('2.40000000');
});

test('paid orders open compact read-only details',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();
 await page.evaluate(()=>{window.__supplierOrders=[{document:{id:'order',kind:'purchase_order',number:'PED-0099',partner_id:'supplier-1',currency:'ARS',amount:'1000',estimate_id:'estimate-1',due_date:'2026-11-20',lines:[{resource_id:'resource-1',description:'Acero',quantity:'10',unit_price:'100'}]},lines:[{source_id:'resource-1',description:'Acero',quantity:'10',unit_price:'100',received:'0',remaining:'10',vendor_stock:'0',requested:'0'}],paid:'0',cash_paid:'0',pending_payment:'1000',payment_state:'Pendiente',delivery_state:'Solicitado',editable:false,revision:0,supplier_credit:'0',files:[]}];});
 await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();
 await page.getByRole('button',{name:'Ver pedido',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Ver pedido',exact:true});
 await expect(dialog.getByLabel('Cantidad',{exact:true})).toBeDisabled();
 await expect(dialog.getByLabel('Precio unitario sin IVA',{exact:true})).toBeDisabled();
 await expect(dialog.getByRole('button',{name:'Guardar cambios',exact:true})).toHaveCount(0);
 await expect(dialog.getByRole('button',{name:'Agregar material',exact:true})).toBeHidden();
 const close=await dialog.getByRole('button',{name:'Cerrar',exact:true}).boundingBox();
 expect(close.width).toBeLessThan(120);
});

test('delivery quantities update immediately and direct receipt reduces later request capacity',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();await page.locator('[data-action=manage-dashboard-budget]').first().click();
 await page.evaluate(()=>{window.__supplierOrders=[{document:{id:'order',kind:'purchase_order',number:'PED-0099',partner_id:'supplier-1',currency:'ARS',amount:'1000',estimate_id:'estimate-1',due_date:'2026-11-20',lines:[{resource_id:'resource-1',description:'Acero',quantity:'10',unit_price:'100'}]},lines:[{source_id:'resource-1',description:'Acero',quantity:'10',unit_price:'100',received:'0',remaining:'10',vendor_stock:'10',requested:'0'}],paid:'0',cash_paid:'0',pending_payment:'1000',payment_state:'Pendiente',delivery_state:'Solicitado',editable:true,revision:0,supplier_credit:'0',files:[]}];});
 await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();
 const details=page.locator('[data-order-details="order"]');
 await details.locator('summary').click();
 await expect(details).toContainText('Disponible para solicitar: 10');
 await page.getByRole('button',{name:'Registrar entrega',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'Registrar entrega',exact:true});
 await dialog.getByLabel(/Acero · Pendiente/).fill('3');
 await dialog.getByRole('button',{name:'Confirmar recepción',exact:true}).click();
 await expect(details).toHaveAttribute('open','');
 await expect(details).toContainText('3 recibidos · Pendiente: 7');
 await expect(details).toContainText('Disponible para solicitar: 7');
 await page.getByRole('button',{name:'Solicitar entrega',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'Solicitar entrega',exact:true});
 await expect(dialog.locator('[data-movement-quantity]')).toHaveAttribute('max','7');
 await dialog.getByRole('button',{name:'Todo',exact:true}).click();
 await dialog.getByRole('button',{name:'Confirmar',exact:true}).click();
 await expect(details).toContainText('Solicitado por recibir: 7');
 await expect(details).toContainText('Disponible para solicitar: 0');
 await page.getByRole('button',{name:'Registrar entrega',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'Registrar entrega',exact:true});
 await dialog.getByLabel(/Acero · Pendiente/).fill('2');
 await dialog.getByRole('button',{name:'Confirmar recepción',exact:true}).click();
 await expect(details).toContainText('5 recibidos · Pendiente: 5');
 await expect(details).toContainText('En proveedor (total): 5');
 await expect(details).toContainText('Solicitado por recibir: 5');
 await expect(details).toContainText('Disponible para solicitar: 0');
});


test('certificate accumulated quantity and percentage sync both ways and survive saving',async({page})=>{
 await bridge(page,{issued:true});
 await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();
 await page.locator('[data-action=manage-dashboard-budget]').first().click();
 await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();
 await page.getByRole('button',{name:'Certificaciones',exact:true}).click();
 await page.getByRole('button',{name:'Modificar avances',exact:true}).click();
 const quantity=page.getByLabel('Cantidad acumulada Hormigón',{exact:true});
 const percent=page.getByLabel('Avance acumulado Hormigón',{exact:true});
 await expect(quantity).toHaveValue('0');
 await quantity.fill('1');
 await expect(percent).toHaveValue('50');
 await percent.fill('25');
 await expect(quantity).toHaveValue('0.5');
 await quantity.fill('2');
 await expect(percent).toHaveValue('100');
 await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();
 await expect(quantity).toHaveValue('2');
 expect(await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_certificate_draft').at(-1).args.draft.progress[0].accumulated_quantity)).toBe('2');
 await page.getByRole('button',{name:'Cerrar',exact:true}).click();
 await page.getByRole('button',{name:'Modificar avances',exact:true}).click();
 await expect(quantity).toHaveValue('2');
 await expect(percent).toHaveValue('100');
});


test('certificate shows two decimal places without changing exact accumulated quantity',async({page})=>{
 await bridge(page,{issued:true,lineQuantity:'3'});
 await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();
 await page.locator('[data-action=manage-dashboard-budget]').first().click();
 await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();
 await page.getByRole('button',{name:'Certificaciones',exact:true}).click();
 await page.getByRole('button',{name:'Modificar avances',exact:true}).click();
 const quantity=page.getByLabel('Cantidad acumulada Hormigón',{exact:true});
 const percent=page.getByLabel('Avance acumulado Hormigón',{exact:true});
 await quantity.fill('1');await expect(percent).toHaveValue('33.33');
 await expect(page.locator('[data-cert-period]')).toHaveText('33,33');
 await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();
 await expect(percent).toHaveValue('33.33');await expect(quantity).toHaveValue('1');
 await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();
 const saved=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_certificate_draft').at(-1).args.draft.progress[0]);
 expect(saved.accumulated_quantity).toBe('1');expect(saved.accumulated_percent).toBe('33.3333333333333333');
 await percent.fill('33.33');await expect(quantity).toHaveValue('0.99');
 await page.getByRole('button',{name:'Guardar borrador',exact:true}).click();
 const percentage=await page.evaluate(()=>window.__calls.filter(c=>c.command==='save_certificate_draft').at(-1).args.draft.progress[0]);
 expect(percentage.accumulated_quantity).toBeNull();expect(percentage.accumulated_percent).toBe('33.33');
});

test('subcontract certificate popup keeps margins and actions within its scrollable table',async({page})=>{
 const contract={id:'contract-layout',kind:'subcontract',number:'CONT-0001',project_id:'10000000-0000-4000-8000-000000000001',estimate_id:'estimate-1',partner_id:'supplier-1',amount:'200',currency:'ARS',lines:[],contract_terms:{start:'2026-11-01'}};
 const certificate={id:'sub-layout',kind:'subcertificate',number:'SUB-0001',reference_id:contract.id,estimate_id:'estimate-1',amount:'100',currency:'ARS',period_start:'2026-11-01',period_end:'2026-11-09'};
 await bridge(page,{issued:true,operations:[contract,certificate]});
 await page.getByRole('button',{name:'Abrir ›',exact:true}).first().click();
 await page.locator('[data-action=manage-dashboard-budget]').first().click();
 await page.evaluate(contract=>{window.__supplierOrders=[{document:contract,lines:[],paid:'0',pending_payment:'200',payment_state:'Pendiente',delivery_state:'Parcial',editable:false,revision:0,files:[]}];},contract);
 await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();
 await page.getByRole('button',{name:'Subcontrataciones',exact:true}).click();
 await page.getByRole('button',{name:'Certificar avances / pagos',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Certificados del subcontrato',exact:true});
 await expect(dialog).toBeVisible();await expect(dialog).toHaveCSS('padding-left','20px');
 await expect(dialog.locator('.contract-certificates-table')).toHaveCSS('overflow-x','auto');
 const bounds=await dialog.boundingBox(), close=await dialog.getByRole('button',{name:'Cerrar',exact:true}).boundingBox();
 expect(bounds.width).toBeGreaterThan(620);expect(close.x+close.width).toBeLessThanOrEqual(bounds.x+bounds.width-15);
 await expect(dialog.getByRole('button',{name:'Registrar pago del certificado',exact:true})).toBeVisible();
 await page.setViewportSize({width:760,height:640});
 const narrow=await dialog.boundingBox();expect(narrow.x).toBeGreaterThanOrEqual(15);expect(narrow.x+narrow.width).toBeLessThanOrEqual(745);
});


async function resourceImportWorkbook(rows){
 const {default:writeExcelFile}=await import('write-excel-file/universal');
 const blob=await writeExcelFile([{sheet:'Insumos',data:rows.map(row=>row.map(value=>({value:String(value),type:String})))}]).toBlob();
 return Buffer.from(await blob.arrayBuffer());
}

test('resource library downloads an Excel template and imports materials and labor after preview',async({page})=>{
 const headers=['Código','Descripción','Tipo','Unidad','Precio ARS'];
 const buffer=await resourceImportWorkbook([headers,['MAT-NUEVO','Cemento para prueba','Material','bolsa','1234.56'],['','Oficial para prueba','Mano de obra','h','']]);
 await bridge(page);await page.getByRole('button',{name:'Insumos',exact:true}).first().click();
 await page.getByRole('button',{name:'Descargar plantilla Excel',exact:true}).click();
 const {parseExcel}=await import('../../src/services/exchange.js');
 await expect.poll(()=>page.evaluate(()=>window.__calls.filter(c=>c.command==='save_export_file').length)).toBe(1);
 const template=await page.evaluate(()=>window.__calls.find(c=>c.command==='save_export_file').args);
 expect(template.name).toBe('Plantilla_insumos_CPOBRAS.xlsx');
 expect(await parseExcel(Uint8Array.from(template.bytes))).toEqual([headers]);
 await page.getByRole('button',{name:'Importar Excel',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Importar biblioteca de insumos',exact:true});
 await dialog.getByLabel('Fecha de los precios',{exact:true}).fill('2026-11-09');
 await dialog.getByLabel('Archivo Excel (.xlsx)',{exact:true}).setInputFiles({name:'insumos.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer});
 await expect(dialog.getByRole('button',{name:'Importar 2 insumos',exact:true})).toBeEnabled();
 await expect(dialog.locator('tbody')).toContainText('Mano de obra');
 await expect(dialog.locator('tbody')).toContainText('Sin precio');
 expect(await page.evaluate(()=>window.__calls.some(c=>c.command==='import_resources'))).toBe(false);
 await page.screenshot({path:'/workspace/cpobras-resource-import.png',fullPage:true});
 await dialog.getByRole('button',{name:'Importar 2 insumos',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 await expect(page.locator('.list-table-pane')).toContainText('Cemento para prueba');
 await expect(page.locator('.list-table-pane')).toContainText('Oficial para prueba');
 const imported=await page.evaluate(()=>window.__calls.find(c=>c.command==='import_resources').args);
 expect(imported.rows).toEqual([{code:'MAT-NUEVO',description:'Cemento para prueba',kind:'material',unit:'bolsa',price:'1234.56'},{code:'',description:'Oficial para prueba',kind:'labor',unit:'h',price:null}]);
 expect(imported.effectiveDate).toBe('2026-11-09');
});

test('resource library blocks invalid and duplicate Excel rows before saving',async({page})=>{
 const buffer=await resourceImportWorkbook([['Código','Descripción','Tipo','Unidad','Precio ARS'],['MAT-1','Repetido','Material','kg','10'],['OTRO','Precio negativo','Material','kg','-5']]);
 await bridge(page);await page.getByRole('button',{name:'Insumos',exact:true}).first().click();
 await page.getByRole('button',{name:'Importar Excel',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Importar biblioteca de insumos',exact:true});
 await dialog.getByLabel('Archivo Excel (.xlsx)',{exact:true}).setInputFiles({name:'errores.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer});
 await expect(dialog).toContainText('El código ya existe o está repetido');
 await expect(dialog).toContainText('Precio inválido');
 await expect(dialog.getByRole('button',{name:'Importar 2 insumos',exact:true})).toBeDisabled();
 expect(await page.evaluate(()=>window.__calls.some(c=>c.command==='import_resources'))).toBe(false);
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
});
