import { test, expect } from "@playwright/test";

async function bridge(page, options={}) {
 await page.addInitScript((fixture) => {
  const project = { id: "10000000-0000-4000-8000-000000000001", name: "Obra de prueba", client_id: "client-1", currency: "Ars" };
  const line = { id: "10000000-0000-4000-8000-000000000002", description: "Hormigón", unit: "m³", quantity: "2", unit_cost: "100", total: "200", analysis_id: null };
  const lines=[line]; if(fixture.twoLines)lines.push({...line,id:"10000000-0000-4000-8000-000000000003",description:"Revoque"});
  const sections=fixture.twoLines?[{id:"10000000-0000-4000-8000-000000000004",code:"01",title:"Preliminares",parent_id:null,position:0}]:[];
  const assignments=[];const lineDetails={};
  const estimate = { id: "estimate-1", title: "Presupuesto inicial", currency: "ARS", issued: Boolean(fixture.issued) };
  const totals = { direct: "200", general_expenses: "0", financial_expenses: "0", profit: "0", discount: "0", taxable_subtotal: "200", taxes: "0", total: "200" };
  const resources=[{ id: "resource-1", code: "MAT-1", description: "Acero", unit: "kg", kind: "material", price: "100" }];
  const operations=[],warehouses=[];
  const operationReport=()=>({project_id:project.id,name:project.name,as_of:"2026-11-05",estimate_id:estimate.id,summaries:[{currency:"ARS",budget_cost:"200",budget_sale:"200",committed:"0",accrued:"0",paid:"0",collected:"0",payable:"0",receivable:"0",overdue_payable:"0",overdue_receivable:"0",cash:"0",cost_to_finish:"200",expected_result:"0",physical_percent:"0",certified:"0"}],cash_flow:[],production:[],costs:[],quotes:[],needs:[],alerts:[],scheduled_finish:null,planned_percent:null});
  const records = []; const nested = []; const calls = []; let plan = null;
  window.__calls = calls;
  const schedule = current => ({ tasks: current.tasks.map((task, index) => ({ id: task.id, start: "2026-11-05", finish: "2026-11-09", start_day: index, finish_day: index + task.duration_days, float_days: 0, critical: true })), duration_days: current.tasks.reduce((n, task) => n + task.duration_days, 0), finish: "2026-11-09", curve: [{ date: "2026-11-05", period_cost: "100", cumulative_cost: "100" }], budget: "100", planned_progress: "50", actual_progress: current.tasks[0]?.actual_progress || "0", warnings: [] });
  window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
   calls.push({ command, args: structuredClone(args) });
   if (command === "list_clients") return [{ id: "client-1", name: "Comitente", cuit: null }];
   if (command === "list_projects") return [project];
   if (command === "list_resources") return resources;
   if(command==='create_resource'){const r={id:'resource-'+(resources.length+1),...args};resources.push(r);return r;}
   if(command==='list_operations')return operations;
   if(command==='list_warehouses')return warehouses;
   if(command==='create_warehouse'){warehouses.push(args.warehouse);return args.warehouse;}
   if(command==='stock_balances')return [];
   if(command==='operations_report')return operationReport();
   if(command==='operations_portfolio')return [operationReport()];
   if(command==='post_operation'){const o={...args.operation,calculated:{}};operations.push(o);return o;}
   if (command === "list_analyses") return [];
   if (command === "list_project_estimates") return [estimate];
   if (command === "list_estimate_lines") return lines;
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
    lineDetails[id]={is_line_owned:true,code:"PART",description:selected.description,unit:selected.unit,unit_cost:String(cost),components:args.components.map(row=>({resource_id:row.resourceId,description:resources.find(r=>r.id===row.resourceId)?.description,kind:"material",quantity:row.quantity,unit_price:row.unitPrice,total:String(Number(row.quantity)*Number(row.unitPrice))}))};return id;
   }
   if (command === "list_budget_sections" || command === "list_line_sections" || command === "list_backups" || command === "list_budget_templates" || command === "list_plan_revisions" || command === "list_plan_baselines" || command === "list_fx_quotes" || command === "scoped_price_history") return [];
   if (command === "list_management_records") return args.kind==='supplier'?[{id:'supplier-1',kind:'supplier',name:'Proveedor de prueba'}]:records.filter(record => record.kind === args.kind);
   if (command === "save_management_record") { const record = { ...args.record, revision: args.record.revision + 1 }; const old = records.findIndex(item => item.id === record.id); if (old >= 0) records[old] = record; else records.push(record); return record; }
   if (command === "list_change_events") return [{ sequence: 1, entity_type: "management_records", entity_id: records[0]?.id, operation: "insert", occurred_at: "2026-11-05 10:00" }];
   if (command === "get_project_plan") return plan;
   if (command === "calculate_schedule") return schedule(args.plan);
   if (command === "save_project_plan") { plan = { project_id: args.projectId, revision: args.revision + 1, plan: args.plan }; return plan; }
   if (command === "get_estimate_pricing") return { general_expenses_percent: "0", financial_expenses_percent: "0", profit_percent: "0", discount_percent: "0", tax_percent: "0" };
   if (command === "priced_estimate_total") return totals;
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

test("directories create and edit company and related establishment", async ({ page }) => {
 await bridge(page); await page.getByRole("button", { name: "Organización", exact: true }).click();
 await page.getByRole("button", { name: "Nuevo registro", exact: true }).click();
 await page.getByLabel("Nombre", { exact: true }).fill("Constructora Sur");
 await page.getByLabel("Código", { exact: true }).fill("SUR");
 await page.getByRole("button", { name: "Guardar ficha", exact: true }).click();
 await expect(page.getByRole("cell", { name: "Constructora Sur", exact: true })).toBeVisible();
 await page.getByRole("combobox", { name: "Directorio", exact: true }).selectOption("establishment");
 await page.getByRole("button", { name: "Nuevo registro", exact: true }).click();
 await page.getByLabel("Nombre", { exact: true }).fill("Sede Buenos Aires");
 await page.getByRole("combobox", { name: "Empresa", exact: true }).selectOption({ label: "Constructora Sur" });
 await page.getByLabel("Domicilio", { exact: true }).fill("Av. Central 123");
 await page.getByRole("button", { name: "Guardar ficha", exact: true }).click();
 await expect(page.getByRole("cell", { name: "Sede Buenos Aires", exact: true })).toBeVisible();
 const calls = await page.evaluate(() => window.__calls.filter(call => call.command === "save_management_record"));
 expect(calls[1].args.record.company_id).toBe(calls[0].args.record.id);
 expect(calls[1].args.record.attributes.address).toBe("Av. Central 123");
});

test("planner saves a task, progress and resource assignment and renders Gantt", async ({ page }) => {
 await bridge(page); await page.getByRole("button", { name: "Planificación", exact: true }).click();
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
 for(const [label,help]of [["Costos y precios","Costos y precios"],["Planificación","Planificación de la obra"],["Organización","Organización y directorios"],["Clientes","Clientes"],["Insumos","Catálogo de insumos"],["ACU","Biblioteca de ACU"]]){
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
 await bridge(page);await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await expect(page.getByRole('navigation',{name:'Etapas de gestión'})).toBeVisible();await page.screenshot({path:'/workspace/cpobras-operations.png'});
 await page.getByText('Depósitos y existencias',{exact:true}).click();await page.getByLabel('Nombre del depósito',{exact:true}).fill('Central');await page.getByLabel('Ubicación / estante',{exact:true}).fill('A1');await page.getByRole('button',{name:'Crear depósito',exact:true}).click();
 await page.getByLabel('Número / referencia',{exact:true}).fill('SOL-001');await page.getByLabel('Descripción del renglón',{exact:true}).fill('Material pendiente');await page.getByLabel('Cantidad del período / movimiento',{exact:true}).fill('5');await page.getByRole('button',{name:'Agregar renglón',exact:true}).click();await expect(page.getByLabel('Número / referencia',{exact:true})).toHaveValue('SOL-001');await expect(page.getByLabel('Cantidad del período / movimiento',{exact:true}).first()).toHaveValue('5');
 await page.getByLabel('Descripción del renglón',{exact:true}).nth(1).fill('Otro material');await page.getByRole('button',{name:'Registrar solicitud de materiales',exact:true}).click();await expect(page.getByRole('dialog',{name:'Documento registrado'})).toBeVisible();await page.locator('.modal-overlay').click({position:{x:2,y:2}});await expect(page.getByRole('dialog',{name:'Documento registrado'})).toBeVisible();await page.keyboard.press('Escape');
 const saved=await page.evaluate(()=>window.__calls.find(c=>c.command==='post_operation').args.operation);expect(saved.kind).toBe('request');expect(saved.lines).toHaveLength(2);expect(saved.lines[0].quantity).toBe('5');
 await page.getByRole('combobox',{name:'Tipo de documento',exact:true}).selectOption('rfq');await page.getByRole('combobox',{name:'Documento de origen',exact:true}).selectOption(saved.id);await expect(page.getByLabel('Descripción del renglón',{exact:true}).first()).toHaveValue('Material pendiente');
});

test('production, certification, finances and dashboard screens expose their workflows',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();
 await page.getByRole('button',{name:'Producción',exact:true}).click();await page.getByLabel('Número / referencia',{exact:true}).fill('PARTE-001');await page.getByLabel('Descripción del renglón',{exact:true}).fill('Cuadrilla Pérez');await page.getByLabel('Horas trabajadas / equipo',{exact:true}).fill('8');await page.getByLabel('Costo por hora',{exact:true}).fill('100');await page.getByRole('button',{name:'Registrar parte diario',exact:true}).click();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Certificaciones',exact:true}).click();await page.getByRole('combobox',{name:'Tipo de documento',exact:true}).selectOption('index');await page.getByLabel('Número / referencia',{exact:true}).fill('IPC-NOV');await page.getByLabel('URL de la publicación / fuente',{exact:true}).fill('https://www.indec.gob.ar/publicacion');await page.getByLabel('Valor del índice',{exact:true}).fill('123.45');await page.getByRole('button',{name:'Registrar índice de precios',exact:true}).click();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Finanzas',exact:true}).click();await page.getByLabel('Número / referencia',{exact:true}).fill('FAC-001');await page.getByLabel('Importe',{exact:true}).fill('500');await page.getByRole('combobox',{name:'Contraparte',exact:true}).selectOption('supplier-1');await page.getByRole('button',{name:'Registrar factura por pagar',exact:true}).click();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Tablero',exact:true}).click();await expect(page.getByRole('columnheader',{name:'Resultado esperado',exact:true})).toBeVisible();await page.getByRole('combobox',{name:'Contenido del informe',exact:true}).selectOption('portfolio');await page.getByRole('button',{name:'Informe PDF',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Guardado en'})).toBeVisible();
 const kinds=await page.evaluate(()=>window.__calls.filter(c=>c.command==='post_operation').map(c=>c.args.operation.kind));expect(kinds).toEqual(['daily','index','payable']);
});

test('operational drafts survive rejected navigation and are cleared only after explicit discard',async({page})=>{
 await bridge(page);await page.getByRole('button',{name:'Gestión de obra',exact:true}).click();await page.getByRole('button',{name:'Finanzas',exact:true}).click();await page.getByLabel('Número / referencia',{exact:true}).fill('BORRADOR');
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Insumos',exact:true}).click();await expect(page.getByLabel('Número / referencia',{exact:true})).toHaveValue('BORRADOR');
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Insumos',exact:true}).click();await expect(page.getByRole('heading',{name:'Biblioteca de insumos',exact:true})).toBeVisible();
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
 await bridge(page);await page.getByRole('button',{name:'Abrir ›',exact:true}).click();await page.getByRole('tab',{name:'Insumos',exact:true}).click();await page.getByRole('button',{name:'Asignar',exact:true}).click();await page.getByRole('button',{name:'Guardar',exact:true}).click();await expect(page.locator('.line-resource-row')).toHaveCount(1);page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Eliminar partida',exact:true}).click();await expect(page.locator('.line-row')).toHaveCount(0);await expect(page.locator('.line-resource-row')).toHaveCount(0);await page.getByRole('button',{name:'Insumos',exact:true}).click();await expect(page.getByRole('cell',{name:'Acero',exact:true})).toBeVisible();
});
