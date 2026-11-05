import { test, expect } from "@playwright/test";

async function bridge(page) {
 await page.addInitScript(() => {
  const project = { id: "10000000-0000-4000-8000-000000000001", name: "Obra de prueba", client_id: "client-1", currency: "Ars" };
  const line = { id: "10000000-0000-4000-8000-000000000002", description: "Hormigón", unit: "m³", quantity: "2", unit_cost: "100", total: "200", analysis_id: null };
  const estimate = { id: "estimate-1", title: "Presupuesto inicial", currency: "ARS", issued: false };
  const totals = { direct: "200", general_expenses: "0", financial_expenses: "0", profit: "0", discount: "0", taxable_subtotal: "200", taxes: "0", total: "200" };
  const records = []; const nested = []; const calls = []; let plan = null;
  window.__calls = calls;
  const schedule = current => ({ tasks: current.tasks.map((task, index) => ({ id: task.id, start: "2026-11-05", finish: "2026-11-09", start_day: index, finish_day: index + task.duration_days, float_days: 0, critical: true })), duration_days: current.tasks.reduce((n, task) => n + task.duration_days, 0), finish: "2026-11-09", curve: [{ date: "2026-11-05", period_cost: "100", cumulative_cost: "100" }], budget: "100", planned_progress: "50", actual_progress: current.tasks[0]?.actual_progress || "0", warnings: [] });
  window.__TAURI_INTERNALS__ = { invoke: async (command, args = {}) => {
   calls.push({ command, args: structuredClone(args) });
   if (command === "list_clients") return [{ id: "client-1", name: "Comitente", cuit: null }];
   if (command === "list_projects") return [project];
   if (command === "list_resources") return [{ id: "resource-1", code: "MAT-1", description: "Acero", unit: "kg", kind: "material", price: "100" }];
   if (command === "list_analyses") return [];
   if (command === "list_project_estimates") return [estimate];
   if (command === "list_estimate_lines") return [line];
   if (command === "list_budget_sections" || command === "list_line_sections" || command === "list_backups" || command === "list_budget_templates" || command === "list_plan_revisions" || command === "list_plan_baselines" || command === "list_fx_quotes" || command === "scoped_price_history") return [];
   if (command === "list_management_records") return records.filter(record => record.kind === args.kind);
   if (command === "save_management_record") { const record = { ...args.record, revision: args.record.revision + 1 }; const old = records.findIndex(item => item.id === record.id); if (old >= 0) records[old] = record; else records.push(record); return record; }
   if (command === "list_change_events") return [{ sequence: 1, entity_type: "management_records", entity_id: records[0]?.id, operation: "insert", occurred_at: "2026-11-05 10:00" }];
   if (command === "get_project_plan") return plan;
   if (command === "calculate_schedule") return schedule(args.plan);
   if (command === "save_project_plan") { plan = { project_id: args.projectId, revision: args.revision + 1, plan: args.plan }; return plan; }
   if (command === "get_estimate_pricing") return { general_expenses_percent: "0", financial_expenses_percent: "0", profit_percent: "0", discount_percent: "0", tax_percent: "0" };
   if (command === "priced_estimate_total") return totals;
   if (command === "export_budget_document") return { format_version: 1, currency: "Ars", title: estimate.title, lines: [{ ...line, estimate_id: estimate.id, position: 0, unit_cost_snapshot: line.unit_cost }], sections: [], assignments: [], rates: {}, takeoffs: [] };
   if (command === "edit_budget_lines") { Object.assign(line, args.changes[0]); return null; }
   if (command === "set_line_formula") return "5.5";
   if (command === "write_export") return "/data/CPOBRAS/exports/presupuesto." + args.name.split(".").at(-1);
   if (command === "list_price_lists") return [{ id: "list-1", name: "Proveedor", currency: "ARS", zone: "Buenos Aires", valid_from: "2026-11-01" }];
   if (command === "list_nested_analyses") return nested;
   if (command === "save_nested_analysis") { nested.push(args.analysis); return null; }
   if (command === "calculate_nested_cost") return { unit_cost: Object.keys(args.changes).length ? "110" : "100", resource_quantities: { "resource-1": "1" } };
   throw new Error("Comando no previsto en la prueba: " + command);
  } };
 });
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
