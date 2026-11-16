import test from "node:test";
import assert from "node:assert/strict";
import { budgetNumbering } from "../src/services/budget-numbering.js";
import { printRows } from "../src/services/budget-print.js";
import { buildBudgetWorkbook } from "../src/services/budget-workbook.js";

test("hierarchical numbers follow section positions, line order and nested groups without changing persistent codes", () => {
  const sections = [
    { id: "b", code: "REG-0008", parent_id: null, position: 1 },
    { id: "a", code: "REG-0009", parent_id: null, position: 0 },
    { id: "c", code: "hash", parent_id: "a", position: 0 },
  ];
  const lines = [{ id: "x" }, { id: "y" }, { id: "z" }, { id: "loose" }],
    assign = { x: "a", y: "a", z: "c" };
  const before = JSON.stringify(sections),
    n = budgetNumbering(sections, lines, assign);
  assert.deepEqual(
    [...n.sections],
    [
      ["a", "1"],
      ["c", "1.3"],
      ["b", "2"],
    ],
  );
  assert.deepEqual(
    [...n.lines],
    [
      ["x", "1.1"],
      ["y", "1.2"],
      ["z", "1.3.1"],
      ["loose", "3"],
    ],
  );
  assert.equal(JSON.stringify(sections), before);
  lines.reverse();
  const changed = budgetNumbering(sections, lines, assign);
  assert.equal(changed.lines.get("y"), "1.1");
  assert.equal(changed.lines.get("x"), "1.2");
  sections[0].position = -1;
  assert.equal(budgetNumbering(sections, lines, assign).sections.get("b"), "1");
  assert.throws(
    () => budgetNumbering([{ id: "a", parent_id: "a" }], []),
    /Jerarquía/,
  );
});
test("PDF rows and ACU workbook titles use the same visible numbers and never display private ACU identifiers", () => {
  const line = {
    id: "l",
    description: "Instalación eléctrica",
    unit: "un",
    quantity: "1",
    unit_cost_snapshot: "100",
    analysis_id: "private",
  };
  const data = {
    document: {
      title: "Presupuesto",
      lines: [line],
      sections: [
        {
          id: "s",
          code: "REG-9999",
          title: "Instalaciones",
          position: 0,
          parent_id: null,
        },
      ],
      assignments: [["l", "s"]],
      price_definition: { rows: [] },
      line_analyses: [
        {
          id: "private",
          code: "PART-8554581b-5133-42a8-9795-2c61ae4cb055",
          description: "Descripción interna",
          unit: "un",
          components: [
            {
              resource_id: "r",
              description: "Cable",
              quantity_per_unit: "1",
              unit_price: "100",
            },
          ],
        },
      ],
    },
    project: { name: "Obra" },
    client: { name: "Cliente" },
    estimate: { currency: "ARS" },
    lines: [
      {
        id: "l",
        direct_total: "100",
        sale_total: "100",
        sale_unit: "100",
        incidence_percent: "100",
      },
    ],
    calculation: { breakdown: { direct: "100", total: "100" }, rows: [] },
    final_total: "100",
    unallocated_total: "0",
  };
  assert.deepEqual(
    printRows(data, "internal").map((r) => r.code),
    ["1", "1.1"],
  );
  const sheets = buildBudgetWorkbook(data),
    heading = sheets[1].data[3][0].value;
  assert.equal(heading, "1.1 · Instalación eléctrica · un");
  assert.doesNotMatch(heading, /PART-|8554581b/);
  assert.equal(sheets[0].data[4][0].value, "1.1");
});
