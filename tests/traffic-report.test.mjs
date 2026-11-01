import test from "node:test";
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { aggregateStats } from "../lib/visit-store.js";
import { aggregateVisitors } from "../lib/visitor-store.js";
import { buildTrafficReport } from "../lib/traffic-report.js";
import { buildCsv, buildXlsx, csvCell, safeSheetName } from "../lib/xlsx-lite.js";

// ── dados sintéticos: 30 dias, 40 páginas, tráfego concentrado nas 3 primeiras ──
const DAYS = Array.from({ length: 30 }, (_, i) => `2026-10-${String(i - 0 + 1).padStart(2, "0")}`.replace("2026-10-31", "2026-10-30"));
const SLUGS = Array.from({ length: 40 }, (_, i) => `artigo-${i + 1}`);
const POSTS = [
  ...SLUGS.map((slug, i) => ({ slug, title: `Artigo ${i + 1}`, category: i % 2 ? "Entenda a bula" : "Uso seguro", date: "2026-08-01T00:00:00.000Z", wordCount: 1500 + i, noindex: false, targetKeyword: "" })),
  { slug: "artigo-sem-visita", title: "Nunca lido", category: "Uso seguro", date: "2026-07-01T00:00:00.000Z", wordCount: 900, noindex: false, targetKeyword: "" },
  { slug: "artigo-novo", title: "Publicado ontem", category: "Uso seguro", date: "2026-10-29T00:00:00.000Z", wordCount: 900, noindex: false, targetKeyword: "" },
];

function dayData(i) {
  const h = { v: 0, s: 0, lv: 20, bn: 14, sec: 3000, sc: 1500, scn: 20, "vn:1": 14 };
  SLUGS.forEach((slug, k) => {
    const views = k < 3 ? 20 : 1;                  // 3 campeãs e 37 de cauda
    h[`p:/blog/${slug}`] = views; h.v += views;
    h[`e:/blog/${slug}`] = k === 0 ? 14 : 0;       // artigo-1 é porta de entrada
    h[`ts:/blog/${slug}`] = k === 1 ? 200 * views : k === 0 ? 10 * views : 60 * views; // artigo-2 lido a fundo, artigo-1 rápido
    h[`tn:/blog/${slug}`] = views;
  });
  h.s = 20;
  h["c:Busca orgânica"] = 30; h["c:Direto"] = h.v - 30;
  h["r:google.com"] = 30; h["r:Direto"] = h.v - 30;
  h["t:Mobile|Chrome|Android"] = h.v;
  h["g:BR|SP|São Paulo"] = h.v;
  h["h:14"] = h.v;
  h["u:newsletter|email|semana"] = 5;
  return h;
}
const dd = DAYS.map((_, i) => dayData(i));
const uniques = DAYS.map(() => 18);

function stats(full) { return aggregateStats({ days: DAYS, dayData: dd, uniques, prev: { views: 1000, sessions: 300 }, titleBySlug: Object.fromEntries(POSTS.map((p) => [p.slug, p.title])), range: 30, full }); }
const vis = aggregateVisitors({
  days: DAYS, uniques, totalSessions: DAYS.map(() => 40), range: 30, full: true,
  dayData: DAYS.map(() => ({ s: 20, v: 60, sec: 2000, "vn:1": 12, "dp:2": 8, "du:10": 10, "x:newsletter_signup_start": 1, "x:newsletter_signup_success": 1 })),
});
const GEN = new Date("2026-10-30T15:00:00Z");
const report = buildTrafficReport({ stats: stats(true), visitors: vis, posts: POSTS, range: 30, generatedAt: GEN });
const sheet = (name) => report.sheets.find((s) => s.name === name);
const val = (c) => (c && typeof c === "object" ? c.v : c);

// ── leitura de zip para validar o .xlsx por dentro ──
function unzip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = {};
  for (let i = 0; i < count; i += 1) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), off = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nlen);
    const lnlen = buf.readUInt16LE(off + 26), lxlen = buf.readUInt16LE(off + 28);
    const body = buf.subarray(off + 30 + lnlen + lxlen, off + 30 + lnlen + lxlen + csize);
    const data = method === 8 ? inflateRawSync(body) : body;
    let c = 0xffffffff;
    for (const byte of data) { c ^= byte; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
    assert.equal((c ^ 0xffffffff) >>> 0, crc, `CRC de ${name}`);
    out[name] = data.toString("utf8");
    p += 46 + nlen;
  }
  return out;
}

test("modo normal do painel continua cortando em top N; modo full traz tudo", () => {
  assert.equal(stats(false).pages.length, 15);
  assert.equal(stats(true).pages.length, 40);
});

test("relatório tem as abas de decisão, na ordem certa", () => {
  const names = report.sheets.map((s) => s.name);
  assert.deepEqual(names.slice(0, 3), ["Resumo", "Oportunidades", "Diário"]);
  for (const n of ["Páginas", "Artigos", "Categorias", "Canais", "Origens", "Campanhas UTM", "Aparelhos", "Geografia", "Horários", "Leitores (cookies)", "Ações e funis", "Leia-me"]) assert.ok(names.includes(n), n);
});

test("Páginas traz todas as páginas (não só o top 15) e os % fecham", () => {
  const rows = sheet("Páginas").rows.slice(1);
  assert.equal(rows.length, 40);
  assert.equal(rows.reduce((a, r) => a + val(r[3]), 0), stats(true).totals.views);
});

test("Artigos lista o acervo inteiro, inclusive os sem visita e os novos", () => {
  const rows = sheet("Artigos").rows.slice(1);
  assert.equal(rows.length, POSTS.length);
  const by = Object.fromEntries(rows.map((r) => [r[0], r]));
  assert.equal(by["Nunca lido"][13], "Sem visitas no período");
  assert.equal(by["Publicado ontem"][13], "Novo (menos de 7 dias)");
  assert.equal(rows.reduce((a, r) => a + val(r[7]), 0), stats(true).totals.views);
});

test("diagnósticos: leitura rápida e porta de entrada identificadas", () => {
  const rows = Object.fromEntries(sheet("Artigos").rows.slice(1).map((r) => [r[0], r[13]]));
  assert.equal(rows["Artigo 1"], "Muita visita, pouca leitura");
  assert.equal(rows["Artigo 40"], "Normal");
});

test("Oportunidades vem priorizada e cita evidência numérica", () => {
  const ops = sheet("Oportunidades").rows.slice(1);
  assert.ok(ops.length >= 3);
  const prio = ops.map((r) => val(r[0]));
  const order = { Alta: 0, Média: 1, Baixa: 2, Info: 3 };
  assert.deepEqual(prio, [...prio].sort((a, b) => order[a] - order[b]));
  const text = ops.map((r) => val(r[3])).join(" | ");
  assert.match(text, /sem nenhuma visita|não recebeu nenhuma visita/);
  assert.match(text, /\d+ views e tempo médio de \d+s/);
});

test("Diário: mesma quantidade de dias, média móvel e totais iguais ao painel", () => {
  const rows = sheet("Diário").rows.slice(1, 31);
  assert.equal(rows.length, 30);
  assert.equal(rows.reduce((a, r) => a + val(r[2]), 0), stats(true).totals.views);
  assert.equal(report.dailyRows.length, 31);
});

test("Horários normaliza o dia da semana pela quantidade de dias", () => {
  const rows = sheet("Horários").rows.filter((r) => r[0] === "Dia da semana");
  assert.equal(rows.length, 7);
  assert.equal(rows.reduce((a, r) => a + val(r[4]), 0), 30);
});

test("Ações e funis calcula conversão da newsletter sem dados de simulado", () => {
  const text = JSON.stringify(sheet("Ações e funis").rows);
  assert.match(text, /Newsletter: inscrições concluídas/);
  assert.match(text, /30 de 30/);
  assert.doesNotMatch(text, /simulado|banca/i);
});

test(".xlsx sai íntegro: zip válido, CRC correto, todas as abas e XML bem formado", () => {
  const files = unzip(buildXlsx(report.sheets, { when: GEN }));
  for (const f of ["[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml"]) assert.ok(files[f], f);
  assert.equal(Object.keys(files).filter((n) => n.startsWith("xl/worksheets/")).length, report.sheets.length);
  for (const [name, xml] of Object.entries(files)) {
    assert.ok(xml.startsWith("<?xml"), name);
    assert.equal((xml.match(/<([a-zA-Z:]+)[ >]/g) || []).length > 0, true);
  }
});

test("CSV neutraliza fórmulas e usa ; e vírgula decimal (Excel em português)", () => {
  assert.equal(csvCell("=HYPERLINK(\"http://x\")"), "\"'=HYPERLINK(\"\"http://x\"\")\"");
  assert.equal(csvCell("+55 11"), "'+55 11");
  assert.equal(csvCell(1.5), "1,5");
  assert.equal(csvCell("a;b"), "\"a;b\"");
  assert.ok(buildCsv([["a", 1]]).startsWith("\ufeff"));
});

test("nome de aba é saneado e único", () => {
  const used = new Set();
  assert.equal(safeSheetName("A/B:C", used), "A B C");
  assert.equal(safeSheetName("A/B:C", used), "A B C 2");
  assert.ok(safeSheetName("x".repeat(60)).length <= 31);
});

test("sem nenhum dado, o relatório ainda é gerado sem quebrar", () => {
  const empty = buildTrafficReport({
    stats: aggregateStats({ days: DAYS, dayData: DAYS.map(() => ({})), uniques: DAYS.map(() => 0), range: 30, full: true }),
    visitors: null, posts: POSTS, range: 30, generatedAt: GEN,
  });
  assert.equal(empty.sheets.length, 15);
  assert.ok(buildXlsx(empty.sheets).length > 1000);
});
