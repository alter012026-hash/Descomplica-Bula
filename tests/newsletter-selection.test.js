const test = require("node:test");
const assert = require("node:assert/strict");
const { selectPostsToNotify } = require("../lib/newsletter-service.js");

const NOW = new Date("2026-10-24T14:00:00Z").getTime();
const hoursAgo = (h) => new Date(NOW - h * 3600 * 1000).toISOString();
const post = (slug, h, title = `Título claro do post ${slug}`) => ({ slug, title, date: hoursAgo(h) });

test("não reenvia posts antigos quando o state ficou parado (bug de out/2026)", () => {
  const posts = [post("novo", 5), post("velho-1", 300), post("velho-2", 600), post("avisado", 900)];
  const r = selectPostsToNotify({ posts, lastNotifiedSlug: "avisado", now: NOW });
  assert.deepEqual(r.toSend.map((p) => p.slug), ["novo"]);
  assert.equal(r.latestSlug, "novo");
});

test("pula títulos inválidos em vez de derrubar o envio inteiro", () => {
  const posts = [
    post("bom", 3),
    post("ruim", 4, "Informações sobre medicamentos"),
    post("avisado", 100),
  ];
  const r = selectPostsToNotify({ posts, lastNotifiedSlug: "avisado", now: NOW });
  assert.deepEqual(r.toSend.map((p) => p.slug), ["bom"]);
  assert.deepEqual(r.skipped.map((p) => p.slug), ["ruim"]);
});

test("só posts inválidos: nada a enviar, mas o state avança", () => {
  const posts = [post("ruim", 3, "Informações sobre medicamentos"), post("avisado", 100)];
  const r = selectPostsToNotify({ posts, lastNotifiedSlug: "avisado", now: NOW });
  assert.equal(r.toSend.length, 0);
  assert.equal(r.latestSlug, "ruim");
});

test("limita a 5 posts por e-mail", () => {
  const posts = Array.from({ length: 8 }, (_, i) => post(`p${i}`, i + 1)).concat(post("avisado", 100));
  const r = selectPostsToNotify({ posts, lastNotifiedSlug: "avisado", now: NOW });
  assert.equal(r.toSend.length, 5);
});

test("sem state: usa só a janela de 48h", () => {
  const posts = [post("a", 10), post("b", 60)];
  const r = selectPostsToNotify({ posts, lastNotifiedSlug: null, now: NOW });
  assert.deepEqual(r.toSend.map((p) => p.slug), ["a"]);
});

test("sem nada novo, mantém o state atual", () => {
  const posts = [post("avisado", 10)];
  const r = selectPostsToNotify({ posts, lastNotifiedSlug: "avisado", now: NOW });
  assert.equal(r.toSend.length, 0);
  assert.equal(r.latestSlug, "avisado");
});
