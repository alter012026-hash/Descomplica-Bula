import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { getEditorialTitleIssue } = require("../lib/article-title.cjs");
const { clusterNews, deriveClusterTopic } = require("../lib/news-clustering.js");

test("revisão de título identifica títulos vazios, genéricos e datas técnicas", () => {
  assert.match(getEditorialTitleIssue("  "), /Informe um título/);
  assert.match(getEditorialTitleIssue("Medicamentos"), /amplo demais/);
  assert.match(getEditorialTitleIssue("Atualizações: o que mudou nesta semana e o que esperar"), /genérico/);
  assert.match(getEditorialTitleIssue("Alerta sobre medicamento 2026-08-01"), /datas/);
  assert.equal(getEditorialTitleIssue("Como encontrar a bula oficial na Anvisa"), null);
});

test("cluster de alertas sobre o mesmo medicamento cria tema sem dados inventados", () => {
  const items = [
    { title: "Anvisa alerta sobre Paracetamol após comunicado oficial", link: "https://www.gov.br/anvisa/1" },
    { title: "Anvisa publica comunicado sobre Paracetamol", link: "https://www.gov.br/anvisa/2" },
  ];
  assert.equal(clusterNews(items).length, 1);
  assert.equal(deriveClusterTopic(items), "Alerta oficial sobre Paracetamol: entenda o comunicado");
});
