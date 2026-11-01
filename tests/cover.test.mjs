import test from "node:test";
import assert from "node:assert/strict";
import { getCoverMarks } from "../lib/cover.js";

test("capas usam cápsulas determinísticas dentro do SVG", () => {
  const first = getCoverMarks("paracetamol");
  assert.deepEqual(first, getCoverMarks("paracetamol"));
  assert.equal(first.length, 18);
  assert.ok(first.every(({ cx, cy }) => cx >= 16 && cx <= 303 && cy >= 12 && cy <= 167));
});
