const test = require("node:test");
const assert = require("node:assert/strict");
const { brazilStates, getBrazilState } = require("../lib/brazil-states");

test("provides Brazilian state names for aggregate traffic reports", () => {
  assert.equal(brazilStates.length, 27);
  assert.equal(new Set(brazilStates.map((state) => state.code)).size, 27);
  assert.equal(getBrazilState("df").name, "Distrito Federal");
  assert.equal(getBrazilState("MG").region, "Sudeste");
  assert.equal(getBrazilState("XX"), null);
});
