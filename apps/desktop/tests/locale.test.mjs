import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import {
  createInterfaceLanguage,
  dialogLocalization,
  interfaceText,
  localizedError,
  loadInterfaceLanguage,
  uiHtml,
  uiPlural,
} from "../src/services/interface-language.js";
import { money } from "../src/decimal.js";
import { workbookBytes } from "../src/services/budget-workbook.js";

test("language changes are saved, formats stay exact, and template data is escaped", async () => {
  const original = globalThis.document;
  const document = { documentElement: {} };
  const storage = new Map();
  const window = {
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  };
  globalThis.document = document;
  try {
    const language = createInterfaceLanguage(document, window);
    await language.ready;
    assert.equal(language.current, "es-AR");
    assert.equal(money("9007199254740993.125"), "9.007.199.254.740.993,13");
    await language.select("en");
    const reloaded = createInterfaceLanguage(document, window);
    await reloaded.ready;
    assert.equal(reloaded.current, "en");
    assert.equal(money("9007199254740993.125"), "9,007,199,254,740,993.13");
    assert.equal(uiHtml("Obra: {0}", ['<em>Obra & "A"</em>']), "Project: &lt;em&gt;Obra &amp; &quot;A&quot;&lt;/em&gt;");
    assert.equal(uiPlural(2, {one:"{count} recordatorio", other:"{count} recordatorios"}), "2 reminders");
    assert.equal(interfaceText("ca", "Guardar"), "Guardar");
    assert.equal(localizedError("invalid value: Formato de exportación inválido", "en"), "Invalid value: Invalid export format");
    await Promise.all([loadInterfaceLanguage("fr"),loadInterfaceLanguage("pt-BR")]);
    assert.equal(dialogLocalization("fr","switch_database",{importCopy:true}).dialogTitle, "Importer une base CPOBRAS");
    assert.equal(dialogLocalization("pt-BR","save_export_file",{}).dialogTitle, "Salvar documento");
  } finally {
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  }
});

test("translated worksheet names keep references and project descriptions intact", async () => {
  const original = globalThis.document;
  globalThis.document = {documentElement:{lang:"en"}};
  try {
    await loadInterfaceLanguage("en");
    const xlsx = await workbookBytes([
      {
        sheet:"Partidas", printColumns:2, columns:[{width:22},{width:22}], data:[
          [{value:"Partidas",type:String},{value:"='Metrados'!A1",type:"Formula",cached:"3"}],
        ],
      },
      {
        sheet:"Metrados", printColumns:1, columns:[{width:22}], data:[
          [{value:3,type:Number}],
        ],
      },
    ]);
    const zip = unzipSync(xlsx);
    const workbook = strFromU8(zip["xl/workbook.xml"]);
    assert.match(workbook, /name="Line items"/);
    assert.match(workbook, /name="Quantity takeoffs"/);
    const sheet = strFromU8(zip["xl/worksheets/sheet1.xml"]);
    assert.match(sheet, /Quantity takeoffs/);
    assert.match(sheet, /<v>3<\/v>/);
    assert.match(Object.values(zip).map(strFromU8).join(""), /Partidas/);
  } finally {
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  }
});
