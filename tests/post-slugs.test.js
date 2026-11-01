const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSlugEntries } = require("../lib/post-slugs.cjs");

test("o artigo mais antigo mantém o slug e os repetidos ganham a data", () => {
  const e = buildSlugEntries([
    "2026-08-06-cuidados-com-a-bula.md",
    "2026-08-01-cuidados-com-a-bula.md",
    "2026-08-11-cuidados-com-a-bula.md",
  ]);
  const by = Object.fromEntries(e.map((x) => [x.fileName, x.slug]));
  assert.equal(by["2026-08-01-cuidados-com-a-bula.md"], "cuidados-com-a-bula");
  assert.equal(by["2026-08-06-cuidados-com-a-bula.md"], "cuidados-com-a-bula-2026-08-06");
  assert.equal(by["2026-08-11-cuidados-com-a-bula.md"], "cuidados-com-a-bula-2026-08-11");
});

test("todos os slugs são únicos e a ordem de entrada é preservada", () => {
  const files = ["2026-01-01-a.md", "2026-01-02-a.md", "2026-01-02-b.md"];
  const e = buildSlugEntries(files);
  assert.deepEqual(e.map((x) => x.fileName), files);
  assert.equal(new Set(e.map((x) => x.slug)).size, files.length);
});

test("slug curto não colide por substring (ex.: 'bula')", () => {
  const e = buildSlugEntries(["2026-01-01-bula.md", "2026-01-02-bula-da-dipirona.md"]);
  assert.deepEqual(e.map((x) => x.slug), ["bula", "bula-da-dipirona"]);
});
