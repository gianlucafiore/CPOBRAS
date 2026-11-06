import test from "node:test";
import assert from "node:assert/strict";
import { unitOptions } from "../src/components/unit-picker.js";
test("unit choices include common symbols and keep library names without case duplicates", () => {
  const choices = unitOptions([
    {
      name: "Kilogramo de biblioteca",
      code: "KG",
      attributes: { symbol: "kg" },
    },
    {
      name: "Balde de 20 litros",
      code: "BAL",
      attributes: { symbol: "balde" },
    },
  ]);
  assert.equal(
    choices.filter((u) => u.symbol.toLowerCase() === "kg").length,
    1,
  );
  assert.equal(
    choices.find((u) => u.symbol === "kg").name,
    "Kilogramo de biblioteca",
  );
  assert.ok(choices.some((u) => u.symbol === "m²"));
  assert.ok(choices.some((u) => u.symbol === "balde"));
});
