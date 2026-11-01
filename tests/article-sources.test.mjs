import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { fetchOfficialSource, fetchOfficialSources, extractReadableText } = require("../lib/official-source-fetcher.js");
const { extractReadableText: extractArticleText } = require("../lib/article-extractor.js");
const { inferCategory } = require("../lib/article-categories.cjs");
const { isOfficialUrl } = require("../lib/source-validation.js");
const { isMedicationNews } = require("../lib/news-scraper.js");
const healthTopics = require("../lib/health-topics.js");
const { buildPrompt } = require("../lib/article-generator.js");
const categories = [
  "Entenda a bula", "Uso seguro", "Efeitos e reações", "Interações", "Grupos especiais",
  "Formas e apresentações", "Genéricos e similares", "Armazenamento e descarte",
  "Alertas da Anvisa", "Saúde e prevenção",
];

const allowedDomains = ["example.gov.br"];
const longText = "Informação oficial sobre medicamentos e cuidados para a população. ".repeat(8);

test("extração de página remove scripts e preserva texto útil", () => {
  const text = extractReadableText(
    `<html><script>não usar</script><main>${longText}</main></html>`,
    "text/html"
  );
  assert.ok(text.includes("Informação oficial"));
  assert.ok(!text.includes("não usar"));
});

test("extração de notícia descarta parágrafos de placeholder", () => {
  const text = extractArticleText(
    `<main><p>${"Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(2)}</p>` +
    `<p>${"A Anvisa publicou informação oficial importante sobre medicamentos. ".repeat(2)}</p></main>`
  );
  assert.ok(text.includes("Anvisa publicou"));
  assert.ok(!text.includes("Lorem ipsum"));
});

test("fila de notícias aceita apenas páginas oficiais e relacionadas a medicamentos", () => {
  assert.equal(isMedicationNews({
    title: "Anvisa publica alerta sobre medicamento",
    link: "https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/alerta",
  }), true);
  assert.equal(isMedicationNews({
    title: "Prefeitura divulga programação cultural",
    link: "https://www.gov.br/cultura/noticias/programacao",
  }), false);
  assert.equal(isMedicationNews({
    title: "Anvisa publica alerta sobre medicamento",
    link: "https://www.gov.br/",
  }), false);
});

test("checagem aceita somente página oficial HTTPS com texto legível", async () => {
  const source = await fetchOfficialSource(
    "https://portal.example.gov.br/saude",
    allowedDomains,
    async () => new Response(`<article>${longText}</article>`, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    })
  );
  assert.equal(source.host, "portal.example.gov.br");
  assert.equal(source.url, "https://portal.example.gov.br/saude");
  assert.ok(source.characterCount > 250);
});

test("checagem bloqueia redirecionamento para host não permitido", async () => {
  let requests = 0;
  await assert.rejects(
    fetchOfficialSource("https://portal.example.gov.br/redirect", allowedDomains, async () => {
      requests += 1;
      return new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/admin" },
      });
    }),
    /domínio não permitido/
  );
  assert.equal(requests, 1);
});

test("fonte oficial precisa usar HTTPS e a porta HTTPS padrão", () => {
  assert.equal(isOfficialUrl("https://portal.example.gov.br/bula", allowedDomains), true);
  assert.equal(isOfficialUrl("http://portal.example.gov.br/bula", allowedDomains), false);
  assert.equal(isOfficialUrl("https://portal.example.gov.br:8443/bula", allowedDomains), false);
});

test("fontes oficiais parciais reportam falhas sem descartar a fonte acessível", async () => {
  const result = await fetchOfficialSources([
    "https://portal.example.gov.br/ok",
    "https://outro.example.gov.br/indisponivel",
  ], allowedDomains, async (url) => (
    String(url).includes("/ok")
      ? new Response(`<main>${longText}</main>`, {
        status: 200,
        headers: { "content-type": "text/html" },
      })
      : new Response("indisponível", { status: 503 })
  ));
  assert.equal(result.verified.length, 1);
  assert.equal(result.failures.length, 1);
});

test("categoria inferida para tema de bula é consistente com a configuração", () => {
  const inferred = inferCategory(
    "como localizar a bula oficial de um medicamento na Anvisa",
    healthTopics,
    categories
  );
  assert.equal(inferred, "Entenda a bula");
});

test("categoria inferida para o tema manual 'Como ler uma bula'", () => {
  assert.equal(inferCategory("Como ler uma bula", healthTopics, categories), "Entenda a bula");
});

test("tema genérico não recebe uma categoria arbitrária", () => {
  assert.equal(
    inferCategory("medicamentos", healthTopics, categories),
    null
  );
});

test("prompt de geração exige a categoria definida e inclui evidência oficial checada", () => {
  const prompt = buildPrompt({
    topic: "como entender as contraindicações da bula",
    category: "Entenda a bula",
    generation: { categories },
    officialSources: [{
      url: "https://portal.example.gov.br/bula",
      text: "Informação oficial da bula vigente.",
    }],
  });
  assert.match(prompt, /Categoria definida: "Entenda a bula"/);
  assert.match(prompt, /FONTES OFICIAIS CHECADAS/);
  assert.match(prompt, /Informação oficial da bula vigente/);
});
