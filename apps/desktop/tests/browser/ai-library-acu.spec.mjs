import { expect, test } from "@playwright/test";

async function openLibrary(page, proseFirst = false, asksWork = 0) {
  await page.route("**/src/main.js*", route => route.fulfill({
    contentType: "application/javascript",
    body: `import "./style.css";
      import {createWorkspaceApp} from "./app.js";
      const resources = Array.from({length: 20}, (_, i) => ({
        id: "r" + i, code: "INS-" + i, description: i === 17 ? "Yeso húmedo bolsa 25 kg" : i === 18 ? "Malla de refuerzo" : i ? "Árido " + i : "Cemento Portland",
        unit: i === 17 ? "bolsa" : i === 18 ? "m²" : "kg", kind: "material", active: true, price: "50", currency: "ARS",
      }));
      const analyses = [], writes = [];
      let remainingProse = ${Number(proseFirst)};
      let remainingWorkQuestions = ${asksWork};
      window.libraryWrites = writes;
      window.exportOpens = [];
      const invoke = async (command, args) => {
        if (command === "list_resources") return resources;
        if (command === "list_analyses") return analyses;
        if (command === "get_analysis_details") return analyses.find(item => item.id === args.analysisId);
        if (command === "save_export_file") return {path:"/tmp/Plantilla de insumos.xlsx"};
        if (command === "open_recent_export") { window.exportOpens.push(args.path); return; }
        if (command === "ai_status") return {configured:true,provider:"openai",model:"fixture"};
        if (command === "ai_catalog_context") {
          if (args.projectId || args.estimateId) throw Error("El ACU no requiere obra ni presupuesto");
          return {resources,currency:"ARS",as_of:"2026-11-11"};
        }
        if (command === "ai_chat") {
          const context = JSON.parse(args.context);
          if (args.mode === "library_acu_intent") {
            const text = args.messages[0].content.toLowerCase();
            let action = "new", work = text;
            if (text.startsWith("no,")) action = "discard";
            else if (text === "si" || text === "perfecto" || text === "mandale con esa composición") action = "approve";
            else if (text.startsWith("a donde") || text.startsWith("mostra") || text.includes("qué pasó con mi acu")) action = "show";
            else if (text.includes("cómo")) action = "question";
            else if (text.startsWith("agregá")) action = "add";
            else if (text.includes("genérico") || text.includes("generico") || text.startsWith("aplicación")) {
              if (context.pending_request) action = "clarify";
              else work = undefined;
            } else if (text.endsWith("desde esta vista?")) work = undefined;
            return {text:JSON.stringify({action,work:action === "new" ? work : undefined})};
          }
          if (args.mode !== "library_acu" || context.task !== "library_acu") throw Error("Pedido mal dirigido");
          if (remainingProse-- > 0) return {text:JSON.stringify({answer:"Preparé un ACU. Consultá para completar."})};
          if (remainingWorkQuestions-- > 0) return {text:JSON.stringify({answer:"¿Para qué trabajo querés crear el ACU?",needs_details:true,missing_field:"work"})};
          const question = args.messages.at(-1).content;
          if (question.startsWith("Usá requested_work") && context.requested_work.includes("yeso")) {
            return {text:JSON.stringify({answer:"Estimación por m².",library_acus:[
              {description:"Aplicación de yeso por vía húmeda",unit:"m²",components:[
                {resource_id:"r17",quantity:"8",quantity_unit:"kg",catalog_quantity:"0.32",conversion_basis:{per_unit_quantity:"25",per_unit_unit:"kg"}},
              ],missing:[]},
            ]})};
          }
          if (question.includes("cómo")) return {text:JSON.stringify({answer:"Dividí 8 kg por los 25 kg de la bolsa.",keep_draft:true})};
          if (question.includes("yeso") || question.includes("malla")) {
            const row = question.includes("malla")
              ? {resource_id:"r18",quantity:"1.05",quantity_unit:"m²"}
              : {resource_id:"r17",quantity:"8",quantity_unit:"kg",catalog_quantity:"0.32",conversion_basis:{per_unit_quantity:"25",per_unit_unit:"kg"}};
            return {text:JSON.stringify({answer:"Consumo estimado por m².",library_acus:[
              {description:"Aplicación de yeso por vía húmeda",unit:"m²",components:[row],missing:[]},
            ]})};
          }
          return {text: JSON.stringify({
            answer:"Consumo estimado.",
            library_acus:[{description:"Contrapiso de cemento",unit:"m²",components:[
              {resource_id:context.resources.find(item => item.id === "r0").id,quantity:"2",unit_price:"999"},
            ],missing:["Revisar dosificación"]}],
          })};
        }
        if (command === "create_analysis") {
          writes.push(structuredClone(args));
          const saved = {
            id:"acu-" + writes.length, code:"ACU-000" + writes.length, description:args.description,
            unit:args.unit, unit_cost:"100", components:args.components.map(component => ({
              resource_id:component.resourceId, quantity:component.quantity, unit_price:component.unitPrice,
            })),
          };
          analyses.push(saved);
          return saved;
        }
        return [];
      };
      await createWorkspaceApp({invoke}).ready;`,
  }));
  await page.goto("/");
  await page.getByRole("button", {name:"ACU", exact:true}).click();
}

test("creates a library ACU from a chat draft using the existing editor", async ({page}) => {
  await openLibrary(page);
  await page.getByTitle("Asistente IA").click();
  await page.locator("[name=ai-consent]").check();
  await page.getByRole("textbox", {name:"Consulta al asistente"}).fill("Creame un ACU de contrapiso de cemento");
  await page.locator("#ai-question").getByRole("button", {name:/Enviar/}).click();
  const review = page.getByRole("button", {name:"Revisar y guardar ACU"});
  await expect(review).toBeVisible();
  expect(await page.evaluate(() => window.libraryWrites)).toEqual([]);
  await review.click();
  const editor = page.getByRole("dialog", {name:"Crear análisis de costo unitario"});
  await expect(editor.getByLabel("Descripción")).toHaveValue("Contrapiso de cemento");
  await expect(editor.locator('[name=unitPrice]')).toHaveValue("50");
  await expect(editor.getByText("Pendiente de revisar: Revisar dosificación")).toBeVisible();
  await editor.getByRole("button", {name:"Guardar", exact:true}).click();
  await expect(page.getByRole("row", {name:/ACU-0001.*Contrapiso de cemento/})).toBeVisible();
  expect(await page.evaluate(() => window.libraryWrites)).toEqual([{
    code:"", description:"Contrapiso de cemento", unit:"m²",
    components:[{resourceId:"r0",quantity:"2",unitPrice:"50"}],
  }]);

  const row = page.getByRole("row", {name:/ACU-0001.*Contrapiso de cemento/});
  const actions = row.getByRole("combobox", {name:"Opciones de Contrapiso de cemento"});
  await expect(actions.locator("option")).toHaveText(["⋯","Editar ACU","Actualizar precios","Duplicar ACU","Eliminar de la biblioteca"]);
  await actions.selectOption("duplicate-analysis");
  await expect(editor.getByLabel("Código ACU")).toHaveValue("");
  await expect(editor.getByLabel("Descripción")).toHaveValue("Contrapiso de cemento (copia)");
  await expect(editor.locator('[name=unitPrice]')).toHaveValue("50");
  await editor.getByRole("button", {name:"Guardar", exact:true}).click();
  await expect(page.getByRole("row", {name:/ACU-0002.*Contrapiso de cemento/})).toBeVisible();
  await expect(row).toBeVisible();
  const writes = await page.evaluate(() => window.libraryWrites);
  expect(writes[1]).toEqual({...writes[0], description:"Contrapiso de cemento (copia)"});
});

test("the ACU editor keeps the header and Guardar fixed while scrolling the insumos", async ({page}) => {
  await page.setViewportSize({width:900,height:540});
  await openLibrary(page);
  await page.getByRole("button", {name:/Nuevo ACU/}).click();
  const editor = page.getByRole("dialog", {name:"Crear análisis de costo unitario"});
  const bounds = await editor.boundingBox();
  expect(bounds.height).toBeGreaterThan(470);
  for (let row = 0; row < 7; row++) {
    await editor.getByRole("button", {name:/Agregar insumo/}).click();
  }
  const heading = editor.locator(".analysis-dialog-heading");
  const scrollArea = editor.locator(".analysis-dialog-content");
  const initialHeading = await heading.boundingBox();
  await scrollArea.evaluate(area => { area.scrollTop = area.scrollHeight; });
  expect(await scrollArea.evaluate(area => area.scrollTop)).toBeGreaterThan(0);
  expect((await heading.boundingBox()).y).toBe(initialHeading.y);
  await expect(heading.getByLabel("Código ACU")).toBeInViewport();
  await expect(heading.getByLabel("Descripción")).toBeInViewport();
  await expect(heading.getByLabel("Unidad de la partida")).toBeInViewport();
  await expect(heading.getByRole("button", {name:/Agregar insumo/})).toBeInViewport();
  const search = editor.getByRole("combobox", {name:/Buscar insumo/}).last();
  await search.fill("Árido");
  const list = editor.getByRole("listbox");
  await expect(list).toBeVisible();
  const viewport = await editor.locator(".analysis-dialog-content").boundingBox();
  const results = await list.boundingBox();
  expect(results.y).toBeGreaterThanOrEqual(viewport.y);
  expect(results.y + results.height).toBeLessThanOrEqual(viewport.y + viewport.height + 1);
  await list.getByRole("option", {name:/Árido 19/}).click();
  await expect(search).toHaveValue(/Árido 19/);
  await expect(editor.getByRole("button", {name:"Guardar", exact:true})).toBeInViewport();
});

test("converses about the proposal, revises it, and saves only on explicit approval", async ({page}) => {
  await openLibrary(page);
  await page.getByTitle("Asistente IA").click();
  await page.locator("[name=ai-consent]").check();
  const send = async text => {
    await page.getByRole("textbox", {name:"Consulta al asistente"}).fill(text);
    await page.locator("#ai-question").getByRole("button", {name:/Enviar/}).click();
  };
  await send("¿Podés crear un nuevo ACU desde esta vista?");
  await expect(page.getByText(/Para qué trabajo querés crear el ACU/)).toBeVisible();
  await send("Aplicación de yeso por vía húmeda");
  await expect(page.locator(".ai-proposal li").filter({hasText:"0.32 bolsa"})).toBeVisible();
  await send("¿cómo convertiste el yeso?");
  await expect(page.getByText(/Dividí 8 kg por los 25 kg/)).toBeVisible();
  await send("Agregá malla de refuerzo");
  await expect(page.getByText(/Malla de refuerzo: 1.05 m²/)).toBeVisible();
  await expect(page.locator(".ai-proposal li").filter({hasText:"0.32 bolsa"})).toBeVisible();
  expect(await page.evaluate(() => window.libraryWrites)).toEqual([]);
  await send("Mandale con esa composición");
  await expect(page.getByText(/Guardé.*ACU-0001/)).toBeVisible();
  expect(await page.evaluate(() => window.libraryWrites[0].components)).toEqual([
    {resourceId:"r17",quantity:"0.32",unitPrice:"50"},
    {resourceId:"r18",quantity:"1.05",unitPrice:"50"},
  ]);
  await send("Crear nuevo ACU para aplicación de yeso");
  await expect(page.getByRole("button", {name:"Revisar y guardar ACU"})).toBeVisible();
  await send("No, gracias");
  await expect(page.getByText("Descarté el pedido de ACU.")).toBeVisible();
  expect(await page.evaluate(() => window.libraryWrites.length)).toBe(1);
});

test("the export notification opens the file through the default-app command", async ({page}) => {
  await openLibrary(page);
  await page.getByRole("button", {name:"Insumos",exact:true}).click();
  await page.getByRole("button", {name:"Descargar plantilla Excel"}).click();
  await page.getByRole("link", {name:"/tmp/Plantilla de insumos.xlsx"}).click();
  expect(await page.evaluate(() => window.exportOpens)).toEqual(["/tmp/Plantilla de insumos.xlsx"]);
});

test("the doubled square AI button can be dragged and still opens on a click", async ({page}) => {
  await openLibrary(page);
  const launch = page.getByRole("button", {name:"Asistente IA",exact:true});
  const start = await launch.boundingBox();
  expect(start.width).toBeCloseTo(75.6, 0);
  expect(start.height).toBeCloseTo(75.6, 0);
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x - 110, start.y - 75, {steps:8});
  await page.mouse.up();
  expect((await launch.boundingBox()).x).toBeLessThan(start.x - 100);
  await expect(page.getByRole("region", {name:"Consola de asistente IA"})).toBeHidden();
  await launch.click();
  await expect(page.getByRole("region", {name:"Consola de asistente IA"})).toBeVisible();
});

test("a prose-only reply is retried and where-is-it reveals a real library proposal", async ({page}) => {
  await openLibrary(page, true);
  await page.getByTitle("Asistente IA").click();
  await page.locator("[name=ai-consent]").check();
  const send = async text => {
    await page.getByRole("textbox", {name:"Consulta al asistente"}).fill(text);
    await page.locator("#ai-question").getByRole("button", {name:/Enviar/}).click();
  };
  await send("puedes crearme un nuevo ACU de aplicación de yeso por vía humeda");
  const preview = page.locator("[data-library-acu-preview]");
  await expect(preview).toContainText("0.32 bolsa");
  await expect(page.getByText("Preparé un ACU. Consultá para completar.")).toHaveCount(0);
  await send("a donde está?");
  await expect(page.getByText("La composición del ACU está en esta tarjeta del chat.")).toBeVisible();
  await send("si");
  await expect(page.getByRole("row", {name:/ACU-0001.*Aplicación de yeso/})).toBeVisible();
  expect(await page.evaluate(() => window.libraryWrites.length)).toBe(1);
  await send("quiero crear un ACU generico");
  await expect(page.getByText(/Para qué trabajo querés crear el ACU/)).toBeVisible();
});

test("a generic clarification and retry preserve the original requested work", async ({page}) => {
  await openLibrary(page, false, 4);
  await page.getByTitle("Asistente IA").click();
  await page.locator("[name=ai-consent]").check();
  const send = async text => {
    await page.getByRole("textbox", {name:"Consulta al asistente"}).fill(text);
    await page.locator("#ai-question").getByRole("button", {name:/Enviar/}).click();
  };
  await send("Necesito crear un ACU de yeso por vía humeda");
  await expect(page.getByText(/No pude preparar todavía un ACU válido/)).toHaveCount(1);
  await send("es generico para reutilizar luego en las partidas");
  await expect(page.getByText(/No pude preparar todavía un ACU válido/)).toHaveCount(2);
  // Natural reference to prior work: no obligatory retry phrase.
  await send("¿Qué pasó con mi ACU de yeso, ya tenés la composición?");
  await expect(page.locator("[data-library-acu-preview]")).toContainText("Aplicación de yeso por vía húmeda");
  await expect(page.locator("[data-library-acu-preview]")).toContainText("0.32 bolsa");
  await expect(page.getByText("¿Para qué trabajo querés crear el ACU?", {exact:true})).toHaveCount(0);
  expect(await page.evaluate(() => window.libraryWrites.length)).toBe(0);
});
