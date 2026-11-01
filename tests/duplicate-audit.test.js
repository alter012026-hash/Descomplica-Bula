const test = require("node:test");
const assert = require("node:assert/strict");
const { auditPosts } = require("../scripts/detect-topic-overlap");

function post({ file, title, slug, signature, entities = [] }) {
  return {
    file,
    title,
    slug,
    date: "2026-10-19",
    wordCount: signature.length,
    topicKey: slug,
    signature,
    entities: new Set(entities),
  };
}

test("finds same-topic candidates and provides scores and reasons", () => {
  const candidates = auditPosts([
    post({
      file: "2026-10-01-ler-bula-medicamento.md",
      title: "Como entender a bula de um medicamento",
      slug: "entender-bula-medicamento",
      signature: ["bula", "medicamento", "seção", "informações"],
    }),
    post({
      file: "2026-10-05-entender-bula-guia.md",
      title: "Entenda a bula: guia atualizado",
      slug: "entender-bula-medicamento",
      signature: ["bula", "medicamento", "seção", "efeitos"],
    }),
  ]);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].score > 0, true);
  assert.equal(candidates[0].decision, "pending");
  assert.ok(candidates[0].reasons.length > 0);
  assert.equal(candidates[0].articles.length, 2);
});

test("retains reviewer false-positive decisions across audit runs", () => {
  const entries = [
    post({
      file: "2026-10-01-anvisa-alerta-medicamento.md",
      title: "Anvisa publica alerta sobre medicamento",
      slug: "anvisa-alerta-medicamento",
      signature: ["anvisa", "alerta", "medicamento", "recolhimento", "lote"],
      entities: ["Anvisa"],
    }),
    post({
      file: "2026-10-02-alerta-recolhimento.md",
      title: "Alerta oficial: recolhimento de medicamento",
      slug: "alerta-recolhimento-medicamento",
      signature: ["anvisa", "alerta", "medicamento", "recolhimento", "lote"],
      entities: ["Anvisa"],
    }),
  ];
  const firstRun = auditPosts(entries);
  const secondRun = auditPosts(entries, [{
    id: firstRun[0].id,
    decision: "false_positive",
    reviewReason: "Temas relacionados, mas necessidades de busca diferentes.",
    reviewedAt: "2026-10-19T12:00:00.000Z",
  }]);

  assert.equal(secondRun[0].decision, "false_positive");
  assert.equal(secondRun[0].reviewReason, "Temas relacionados, mas necessidades de busca diferentes.");
});

test("does not report unrelated article pairs", () => {
  const candidates = auditPosts([
    post({
      file: "2026-10-01-ler-bula.md",
      title: "Como ler a bula de um medicamento",
      slug: "ler-bula",
      signature: ["bula", "medicamento", "composição", "efeitos"],
    }),
    post({
      file: "2026-10-02-armazenar-insulina.md",
      title: "Como armazenar insulina com segurança",
      slug: "armazenar-insulina",
      signature: ["insulina", "armazenamento", "temperatura", "conservação"],
    }),
  ]);

  assert.deepEqual(candidates, []);
});
