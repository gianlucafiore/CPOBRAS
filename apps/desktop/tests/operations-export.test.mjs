import test from "node:test";
import assert from "node:assert/strict";
import { exportOperationalReport } from "../src/services/operations-export.js";
import { parseExcel } from "../src/services/exchange.js";
const model = () => ({
  asOf: "2026-11-05",
  projectId: "project",
  report: null,
  portfolio: [],
  lines: [],
  centers: [],
  docs: [],
  stock: [],
  warehouses: [],
  detail: {
    id: "cert",
    kind: "certificate",
    number: "CERT-1",
    date: "2026-11-05",
    project_id: "project",
    currency: "ARS",
    notes: "Anexo",
    terms: "Condiciones",
    period_start: "2026-11-01",
    period_end: "2026-11-05",
    lines: [
      {
        description: "Trabajo",
        quantity: "2.5",
        unit_price: "9007199254740993.01",
      },
    ],
    calculated: {
      gross: "22517998136852482.525",
      previous: "0",
      retention: "0",
    },
    amount: "22517998136852482.525",
  },
});
async function generate(format, scope = "document") {
  let result;
  await exportOperationalReport({
    invoke: async (cmd, args) => {
      assert.equal(cmd, "write_export");
      result = args;
      return "/exports/" + args.name;
    },
    format,
    scope,
    model: model(),
    operationNames: { certificate: "Certificado" },
    partnerName: () => "Comitente",
    whName: () => "",
    state: { projects: [{ id: "project", name: "Obra" }], resources: [] },
  });
  return result;
}
test("certificate annex Excel preserves exact prices, totals and immutable document identity", async () => {
  const result = await generate("xlsx");
  assert.equal(result.name, "document-cert-2026-11-05.xlsx");
  const rows = await parseExcel(new Uint8Array(result.bytes));
  const row = rows.find((row) => row[0] === "Renglón");
  assert.equal(row[3], "9007199254740993.01");
  assert.equal(row[4], "22517998136852482.525");
  assert.ok(rows.some((row) => row[1] === "previous"));
});
test("certificate annex and empty portfolio can be exported as portable PDFs", async () => {
  for (const scope of ["document", "portfolio"]) {
    const result = await generate("pdf", scope);
    assert.equal(
      new TextDecoder().decode(new Uint8Array(result.bytes).slice(0, 5)),
      "%PDF-",
    );
    assert.ok(result.bytes.length > 1000);
  }
});
