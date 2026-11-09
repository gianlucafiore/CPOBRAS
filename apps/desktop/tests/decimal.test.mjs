import test from "node:test";
import assert from "node:assert/strict";
import { money, numeric, sumDecimals, absoluteDecimal, divideDecimals, truncateDecimals } from "../src/decimal.js";

test("money keeps cents above the IEEE-754 safe integer limit", () => {
  assert.equal(money("9007199254740993.01"), "9.007.199.254.740.993,01");
  assert.equal(money("-9007199254740993.01"), "-9.007.199.254.740.993,01");
});

test("rounding uses decimal digits and carries into the integer part", () => {
  assert.equal(money("1.005"), "1,01");
  assert.equal(money("-1.005"), "-1,01");
  assert.equal(money("999.995"), "1.000,00");
  assert.equal(money("-0.001"), "0,00");
});

test("section subtotals and signed takeoffs sum before rounding", () => {
  assert.equal(sumDecimals(["0.1", "0.2", "-0.3"]), "0.0");
  assert.equal(sumDecimals(["0.004", "0.004"]), "0.008");
  assert.equal(money(sumDecimals(["0.004", "0.004"])), "0,01");
  assert.equal(sumDecimals(["9007199254740993.01", "0.02"]), "9007199254740993.03");
  assert.equal(sumDecimals([]), "0");
});

test("quantity formatting and absolute values preserve fine decimals", () => {
  assert.equal(numeric("1234.56785"), "1.234,5679");
  assert.equal(numeric("2.10000"), "2,1");
  assert.equal(numeric("2,10000"), "2,1");
  assert.equal(absoluteDecimal("-9007199254740993.0001"), "9007199254740993.0001");
  assert.equal(money(null), "0,00");
});

test("invalid numbers are never silently displayed as zero", () => {
  for (const value of ["oops", "NaN", "Infinity", "1.000,01", "", "<script>"]) {
    assert.equal(money(value), "—");
    assert.throws(() => sumDecimals([value]), TypeError);
  }
});

test("large estimate batches do not exceed function argument limits", () => {
  assert.equal(sumDecimals(Array(150000).fill("0.01")), "1500.00");
});

test('decimal price comparison preserves differences beyond binary precision',async()=>{const {compareDecimals}=await import('../src/decimal.js');assert.equal(compareDecimals('100000000000000000.01','100000000000000000.02'),-1);assert.equal(compareDecimals('0.10','0.1'),0);});

test("decimal division keeps fractional quantities and large values exact", () => {
 assert.equal(divideDecimals("1", "2"), "0.5");
 assert.equal(divideDecimals("100", "3"), "33.3333333333333333");
 assert.equal(divideDecimals("9007199254740993", "1"), "9007199254740993");
 assert.throws(() => divideDecimals("1", "0"), TypeError);
});

test("presentation truncates at two decimals without rounding or binary conversion", () => {
 assert.equal(truncateDecimals("23.6666666666666666"), "23.66");
 assert.equal(truncateDecimals("71.00000000001"), "71");
 assert.equal(truncateDecimals("-1.999"), "-1.99");
 assert.equal(truncateDecimals("9007199254740993.129"), "9007199254740993.12");
 assert.equal(truncateDecimals("-0.00001"), "0");
});
