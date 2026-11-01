const test = require("node:test");
const assert = require("node:assert/strict");
const { MAX_EDITORIAL_PLAN_ITEMS, normalizeEditorialPlan } = require("../lib/editorial-plan.js");

const categories = ["Entenda a bula", "Uso seguro"];
const topics = {
  "Entenda a bula": [
    "como ler uma bula",
    "como localizar a bula oficial",
    "como identificar o princípio ativo",
    "como entender contraindicações",
    "como verificar a validade do medicamento",
    "como consultar a bula correta",
  ],
  "Uso seguro": ["como conversar com o farmacêutico"],
};

test("normaliza artigos agrupados por categoria e preserva o tema escolhido", () => {
  assert.deepEqual(normalizeEditorialPlan([
    { category: "Entenda a bula", topics: ["como ler uma bula"] },
    { category: "Uso seguro", topics: ["como conversar com o farmacêutico"] },
  ], categories, topics), [
    { category: "Entenda a bula", topic: "como ler uma bula" },
    { category: "Uso seguro", topic: "como conversar com o farmacêutico" },
  ]);
});

test("rejeita temas que não pertencem à categoria selecionada", () => {
  assert.throws(
    () => normalizeEditorialPlan([
      { category: "Uso seguro", topics: ["como ler uma bula"] },
    ], categories, topics),
    /Tema inválido/
  );
  assert.throws(
    () => normalizeEditorialPlan([
      { category: "Categoria inexistente", topics: ["qualquer tema"] },
    ], categories, topics),
    /Categoria inválida/
  );
});

test("rejeita um planejamento sem temas", () => {
  assert.throws(
    () => normalizeEditorialPlan([], categories, topics),
    /Selecione ao menos um tema/
  );
});

test("rejeita temas duplicados e lotes acima do limite", () => {
  assert.throws(
    () => normalizeEditorialPlan([
      { category: "Entenda a bula", topics: ["como ler uma bula", "como ler uma bula"] },
    ], categories, topics),
    /mais de uma vez/
  );
  assert.equal(MAX_EDITORIAL_PLAN_ITEMS, 5);
  assert.throws(
    () => normalizeEditorialPlan([
      { category: "Entenda a bula", topics: topics["Entenda a bula"].slice(0, 6) },
    ], categories, topics),
    /limite é de 5/
  );
});
