import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { validateHealthArticle } = require("../lib/article-generator.js");
const { getDoseResponse, getUrgentResponse, isDoseQuestion, containsNumericDose } = require("../lib/medical-safety.js");
const { isOfficialUrl, normalizeOfficialSources } = require("../lib/source-validation.js");

const emergency = { samu: "192", poisonCenter: "0800 722 6001", cvv: "188" };
const safeArticle = `# Entenda o medicamento

Consulte a bula oficial vigente e converse com um profissional de saúde. Este conteúdo não substitui orientação profissional.

## Quando procurar ajuda

Em uma emergência, ligue para o SAMU 192. Em suspeita de intoxicação, ligue para o Disque-Intoxicação 0800 722 6001.

## Fontes oficiais

- [Anvisa](https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/bulas)`;

test("artigo seguro satisfaz as verificações editoriais obrigatórias", () => {
  assert.deepEqual(validateHealthArticle(safeArticle), []);
});

test("artigo reprova links externos que não sejam de fontes oficiais permitidas", () => {
  const articleWithExternalLink = safeArticle.replace(
    "Consulte a bula",
    "Consulte [esta orientação](https://example.com/medicamentos) e a bula"
  );
  assert.ok(validateHealthArticle(articleWithExternalLink).some((issue) => issue.includes("link que não pertence")));
});

test("validação editorial reprova dose e ausência de contatos ou fonte oficial", () => {
  const withDose = safeArticle.replace("Consulte a bula", "Use 500 mg. Consulte a bula");
  assert.ok(validateHealthArticle(withDose).some((issue) => issue.includes("dose numérica")));
  const withoutSafety = safeArticle.replace(/## Quando procurar ajuda[\s\S]*?## Fontes oficiais/, "## Fontes oficiais");
  assert.ok(validateHealthArticle(withoutSafety).some((issue) => issue.includes("Quando procurar ajuda")));
  assert.ok(validateHealthArticle(withoutSafety).some((issue) => issue.includes("contatos de urgência")));
});

test("perguntas de dose recebem orientação para bula e profissional, sem cálculo", () => {
  assert.equal(isDoseQuestion("Quantos mg devo tomar?"), true);
  assert.equal(isDoseQuestion("Posso tomar quantos comprimidos?"), true);
  assert.match(getDoseResponse(), /bula oficial/);
  assert.equal(containsNumericDose("Tome 500 mg"), true);
  assert.equal(containsNumericDose("SAMU 192"), false);
});

test("urgências são encaminhadas antes de consultar a IA", () => {
  assert.match(getUrgentResponse("Tomei demais deste remédio", emergency), /0800 722 6001/);
  assert.match(getUrgentResponse("Estou com falta de ar", emergency), /SAMU \(192\)/);
  assert.match(getUrgentResponse("quero me matar", emergency), /CVV \(188\)/);
  assert.equal(getUrgentResponse("Como ler esta bula?", emergency), null);
});

test("fontes oficiais exigem HTTPS e correspondência de domínio", () => {
  assert.equal(isOfficialUrl("https://www.gov.br/anvisa"), true);
  assert.equal(isOfficialUrl("http://www.gov.br/anvisa"), false);
  assert.equal(isOfficialUrl("https://gov.br.example.test/anvisa"), false);
  assert.equal(isOfficialUrl("https://user:pass@gov.br/anvisa"), false);
  assert.deepEqual(normalizeOfficialSources(["https://gov.br/saude", "https://gov.br/saude"]), ["https://gov.br/saude"]);
  assert.throws(() => normalizeOfficialSources(["https://example.test"]), /fontes oficiais permitidas/);
});
