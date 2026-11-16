import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBudgetWorkbook,
  buildClientWorkbook,
  workbookBytes,
} from "../src/services/budget-workbook.js";
import {
  clientPrintData,
  publicPriceSummary,
  roundBudgetAmount,
} from "../src/services/budget-public.js";
import { budgetReportPdf } from "../src/services/budget-print.js";
import { exportBudget } from "../src/services/budget-export.js";
import { unzipSync, strFromU8 } from "fflate";

export function workbookFixture() {
  return {
    profile: { company_name: "Constructora Sur", logo_png: [] },
    estimate: { id: "budget", currency: "ARS" },
    project: { name: "Obra" },
    client: { name: "Cliente" },
    document: {
      title: "Oferta",
      sections: [],
      assignments: [],
      rates: {},
      takeoffs: [],
      measured_line_ids: [],
      lines: [
        {
          id: "l1",
          description: "Partida con ACU",
          unit: "m2",
          quantity: "2",
          unit_cost_snapshot: "100",
          analysis_id: "a1",
        },
        {
          id: "l2",
          description: "Partida manual",
          unit: "un",
          quantity: "3",
          unit_cost_snapshot: "50",
          analysis_id: null,
        },
      ],
      line_analyses: [
        {
          id: "a1",
          description: "ACU privado",
          unit: "m2",
          components: [
            {
              resource_id: "r1",
              description: "Material privado",
              unit: "kg",
              kind: "material",
              quantity_per_unit: "4",
              unit_price: "25",
            },
          ],
        },
      ],
      price_definition: {
        rows: [
          {
            id: "profit",
            label: "Beneficio PRIVADO",
            enabled: true,
            kind: "percent_direct",
            role: "profit",
            percent: "20",
            amount: "0",
          },
          {
            id: "iva",
            label: "IVA",
            enabled: true,
            kind: "percent_subtotal",
            role: "tax",
            percent: "21",
            amount: "0",
          },
        ],
      },
    },
    calculation: {
      breakdown: {
        direct: "350",
        taxable_subtotal: "420",
        taxes: "88.20",
        total: "508.20",
      },
      rows: [
        {
          id: "profit",
          label: "Beneficio PRIVADO",
          enabled: true,
          kind: "percent_direct",
          role: "profit",
          base: "350",
          amount: "70",
          running_total: "420",
        },
        {
          id: "iva",
          label: "IVA",
          enabled: true,
          kind: "percent_subtotal",
          role: "tax",
          base: "420",
          amount: "88.20",
          running_total: "508.20",
        },
      ],
    },
    lines: [
      {
        id: "l1",
        direct_total: "200",
        sale_total: "290.40",
        sale_unit: "145.20",
        incidence_percent: "57.1429",
      },
      {
        id: "l2",
        direct_total: "150",
        sale_total: "217.80",
        sale_unit: "72.60",
        incidence_percent: "42.8571",
      },
    ],
    final_total: "508.20",
    unallocated_total: "0",
  };
}
test("client prices exclude taxes, allocate rounding cents exactly, and keep gross total", () => {
  const d = workbookFixture();
  assert.deepEqual(publicPriceSummary(d), {
    subtotal: "420.00",
    taxes: "88.20",
    total: "508.20",
  });
  assert.deepEqual(
    clientPrintData(d).lines.map((l) => l.sale_total),
    ["240.00", "180.00"],
  );
  assert.equal(roundBudgetAmount("1.005"), "1.01");
  assert.equal(roundBudgetAmount("-1.005"), "-1.01");
  d.document.lines.forEach((l) => {
    l.quantity = "0";
  });
  d.calculation.breakdown.direct = "0";
  assert.equal(clientPrintData(d).unallocated_total, "420.00");
});
test("full workbook links ACU, declared prices, quantities, pricing and consolidated resources with printable cached values", async () => {
  const sheets = buildBudgetWorkbook(workbookFixture(), {
    memory: "Descripción de alcance",
    notes: "Validez: 15 días",
  });
  assert.deepEqual(
    sheets.map((s) => s.sheet),
    [
      "Partidas",
      "ACU",
      "Precio",
      "Insumos",
      "Metrados",
      "Detalle precio",
      "Memoria",
    ],
  );
  const p = sheets[0].data;
  assert.equal(p[4][5].type, "Formula");
  assert.equal(p[4][5].value, "'ACU'!$F$6");
  assert.equal(p[5][5].type, Number);
  assert.equal(p[5][5].value, 50);
  assert.equal(sheets[1].data[4][7].cached, "8");
  assert.match(sheets[3].data[3][3].value, /SUMIF/);
  const files = unzipSync(await workbookBytes(sheets)),
    xml = strFromU8(files["xl/worksheets/sheet1.xml"]),
    book = strFromU8(files["xl/workbook.xml"]);
  assert.match(xml, /<f>[^<]*ACU[^<]*<\/f><v>100<\/v>/);
  assert.match(xml, /hidden="1"/);
  assert.match(xml, /fitToWidth="1"/);
  assert.match(book, /Print_Area/);
  assert.match(book, /fullCalcOnLoad="1"/);
});
test("client layouts physically omit internal sheets, costs and margin data", async () => {
  for (const layout of ["sheet_price", "memory_sheet_price", "memory_price"]) {
    const d = workbookFixture(),
      opts = {
        layout,
        memory: "ALCANCE PUBLICO",
        notes: "Entrega 30 días",
        date: "2026-11-16",
        reference: "OFERTA 123",
      };
    Object.assign(d.profile, {
      trade_name: "Marca pública",
      professional_name: "Profesional responsable",
      qualification: "Matrícula 123",
    });
    const sheets = buildClientWorkbook(d, opts);
    assert.deepEqual(
      sheets.map((s) => s.sheet),
      layout === "sheet_price"
        ? ["Presupuesto"]
        : layout === "memory_price"
          ? ["Oferta"]
          : ["Memoria", "Presupuesto"],
    );
    const files = unzipSync(await workbookBytes(sheets));
    const xml = Object.entries(files)
      .filter(([p]) => p.endsWith(".xml"))
      .map(([, v]) => strFromU8(v))
      .join("");
    assert.doesNotMatch(
      xml,
      /Beneficio PRIVADO|Material privado|ACU privado|Costo directo/,
    );
    assert.match(xml, /OFERTA 123/);
    for (const name of [
      "Constructora Sur",
      "Marca pública",
      "Profesional responsable",
      "Matrícula 123",
    ])
      assert.ok(xml.includes(name));
    const pdf = new TextDecoder().decode(await budgetReportPdf(d, opts));
    assert.doesNotMatch(
      pdf,
      /Beneficio PRIVADO|Material privado|Costo directo/,
    );
    if (layout === "memory_price") {
      assert.doesNotMatch(pdf, /Partida con ACU/);
      assert.match(pdf, /ALCANCE PUBLICO/);
    } else assert.match(pdf, /Partida con ACU/);
    assert.match(pdf, /508,20/);
    assert.match(pdf, /420,00/);
    assert.match(pdf, /88,20/);
  }
});
test("complete export hydrates shared analyses and uses budget prices; missing analysis fails instead of losing the backup", async () => {
  const d = workbookFixture(),
    a = d.document.line_analyses.pop(),
    calls = [];
  const invoke = async (cmd, args) => {
    calls.push(cmd);
    if (cmd === "get_budget_print_data") return d;
    if (cmd === "get_analysis_details") {
      assert.equal(args.analysisId, "a1");
      const { id, ...native } = a;
      return {
        ...native,
        components: native.components.map(({ quantity_per_unit, ...c }) => ({
          ...c,
          quantity: quantity_per_unit,
        })),
      };
    }
    if (cmd === "get_estimate_resource_prices") return {};
    throw Error(cmd);
  };
  const bytes = await exportBudget(
    invoke,
    { estimateId: "budget" },
    { kind: "full", format: "pdf" },
  );
  assert.ok(bytes.length > 1000);
  assert.ok(calls.includes("get_analysis_details"));
  assert.match(new TextDecoder().decode(bytes), /Material privado/);
  assert.throws(() => buildBudgetWorkbook(d), /Falta el ACU/);
});
test("only active measurements replace manual quantities and detailed groups do not double count", () => {
  const d = workbookFixture();
  d.document.takeoffs = [
    {
      line_id: "l1",
      note: "Paño",
      sign: 1,
      factor: "1",
      length: "2",
      width: "1",
      height: "1",
    },
  ];
  d.document.measured_line_ids = ["l1"];
  let sheets = buildBudgetWorkbook(d);
  assert.equal(sheets[0].data[4][4].type, "Formula");
  assert.equal(sheets[0].data[5][4].type, Number);
  const detail = {
    id: "detail",
    label: "Gastos",
    enabled: true,
    role: "overhead",
    kind: "detailed",
    detail_mode: "items",
    items: [
      { id: "group", group: true },
      {
        id: "item",
        group: false,
        description: "Alquiler",
        unit: "mes",
        participation_percent: "50",
        quantity: "2",
        unit_price: "100",
        periodic: { start: "2026-01-01", end: "2026-02-28", prorate: false },
      },
    ],
  };
  d.document.price_definition.rows.unshift(detail);
  sheets = buildBudgetWorkbook(d);
  assert.equal(sheets[5].data.length, 4);
  assert.equal(sheets[5].data[3][7].cached, "200.0");
});

test("default pricing is fetched in full rather than freezing percentage overhead as a fixed amount", async () => {
  const d = workbookFixture(),
    rows = d.document.price_definition.rows;
  rows.unshift({
    id: "overhead",
    label: "Gastos generales",
    enabled: true,
    kind: "detailed",
    role: "overhead",
    detail_mode: "reference",
    reference_percent: "10",
    amount: "0",
    items: [],
  });
  d.document.price_definition = null;
  d.final_total = "550.55";
  d.calculation.breakdown = {
    direct: "350",
    taxable_subtotal: "455",
    taxes: "95.55",
    total: "550.55",
  };
  Object.assign(d.calculation.rows[0], { running_total: "455" });
  Object.assign(d.calculation.rows[1], {
    base: "455",
    amount: "95.55",
    running_total: "550.55",
  });
  Object.assign(d.lines[0], { sale_total: "314.60", sale_unit: "157.30" });
  Object.assign(d.lines[1], { sale_total: "235.95", sale_unit: "78.65" });
  d.calculation.rows.unshift({
    id: "overhead",
    label: "Gastos generales",
    enabled: true,
    kind: "detailed",
    role: "overhead",
    base: "0",
    amount: "35",
    running_total: "385",
  });
  const calls = [];
  const bytes = await exportBudget(
    async (cmd) => {
      calls.push(cmd);
      if (cmd === "get_budget_print_data") return d;
      if (cmd === "get_estimate_resource_prices") return {};
      if (cmd === "get_price_definition") return { definition: { rows } };
      throw Error(cmd);
    },
    { estimateId: "budget" },
    { kind: "full", format: "xlsx" },
  );
  assert.ok(calls.includes("get_price_definition"));
  const files = unzipSync(bytes),
    xml = strFromU8(files["xl/worksheets/sheet3.xml"]);
  assert.match(xml, /<f>\$G\$4<\/f><v>350<\/v>/);
  assert.match(xml, /C5\*D5\/100/);
  assert.equal(d.document.price_definition.rows[0].reference_percent, "10");
});

test("internal Excel totals stay in the final amount column after adding incidence", async () => {
  const { budgetReportExcel } = await import("../src/services/budget-print.js");
  const { default: read } = await import("read-excel-file/universal");
  const sheets = await read(
    new Blob([await budgetReportExcel(workbookFixture(), "internal")]),
  );
  const last = sheets[0].data.at(-1);
  assert.equal(last[6], "508.20");
  assert.equal(last[7], "100");
});
