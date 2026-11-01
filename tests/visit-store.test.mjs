import test from "node:test";
import assert from "node:assert/strict";
import {
  addDays, dayKey, isBot, lastDays, normalizePath, normalizeReferrer, visitorHash,
} from "../lib/visit-store.js";

test("dayKey usa o fuso de São Paulo (23h30 em Brasília ainda é o mesmo dia)", () => {
  // 2026-10-25T02:30Z = 23:30 de 24/10 em Brasília (UTC-3)
  assert.equal(dayKey(new Date("2026-10-25T02:30:00Z")), "2026-10-24");
  assert.equal(dayKey(new Date("2026-10-25T03:30:00Z")), "2026-10-25");
});

test("addDays e lastDays atravessam virada de mês e ano", () => {
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.deepEqual(lastDays(3, "2026-01-01"), ["2025-12-30", "2025-12-31", "2026-01-01"]);
});

test("isBot bloqueia robôs e UA vazio, libera navegadores", () => {
  assert.equal(isBot(""), true);
  assert.equal(isBot("Googlebot/2.1 (+http://www.google.com/bot.html)"), true);
  assert.equal(isBot("Mozilla/5.0 (compatible; bingbot/2.0)"), true);
  assert.equal(isBot("curl/8.4.0"), true);
  assert.equal(isBot("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36"), false);
});

test("normalizePath só aceita páginas públicas conhecidas", () => {
  const slugs = new Set(["cuidados-com-a-bula"]);
  assert.equal(normalizePath("/", slugs), "/");
  assert.equal(normalizePath("/blog/?categoria=Entenda%20a%20bula", slugs), "/blog");
  assert.equal(normalizePath("/blog/cuidados-com-a-bula/", slugs), "/blog/cuidados-com-a-bula");
  assert.equal(normalizePath("/blog/slug-inexistente", slugs), null);
  assert.equal(normalizePath("/admin", slugs), null);
  assert.equal(normalizePath("/api/track", slugs), null);
  assert.equal(normalizePath("https://evil.com/", slugs), null);
  assert.equal(normalizePath(123, slugs), null);
});

test("normalizeReferrer resume a origem ao domínio", () => {
  assert.equal(normalizeReferrer("", "site.com"), "Direto");
  assert.equal(normalizeReferrer("https://www.site.com/blog", "site.com"), "Direto");
  assert.equal(normalizeReferrer("https://www.google.com.br/search?q=x", "site.com"), "google");
  assert.equal(normalizeReferrer("https://l.facebook.com/l.php?u=x", "site.com"), "facebook.com");
  assert.equal(normalizeReferrer("https://t.co/abc", "site.com"), "x.com");
  assert.equal(normalizeReferrer("lixo", "site.com"), "Direto");
});

test("visitorHash muda por dia e não expõe o IP", () => {
  const a = visitorHash({ ip: "200.1.2.3", userAgent: "UA", day: "2026-10-24" });
  const b = visitorHash({ ip: "200.1.2.3", userAgent: "UA", day: "2026-10-25" });
  const c = visitorHash({ ip: "200.1.2.3", userAgent: "UA", day: "2026-10-24" });
  assert.notEqual(a, b);
  assert.equal(a, c);
  assert.ok(!a.includes("200"));
});

import { classifyChannel, cleanUtm, parseGeo, parseUserAgent, pageType } from "../lib/visit-meta.js";
import { aggregateStats } from "../lib/visit-store.js";

test("parseUserAgent identifica aparelho, navegador e sistema", () => {
  const android = parseUserAgent("Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36");
  assert.deepEqual(android, { device: "Mobile", browser: "Chrome", os: "Android" });
  const iphone = parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1");
  assert.deepEqual(iphone, { device: "Mobile", browser: "Safari", os: "iOS" });
  const win = parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Edg/126.0");
  assert.deepEqual(win, { device: "Desktop", browser: "Edge", os: "Windows" });
  const tablet = parseUserAgent("Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 Chrome/126.0 Safari/537.36");
  assert.equal(tablet.device, "Tablet");
  assert.equal(parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Instagram 330.0").browser, "Instagram (app)");
});

test("classifyChannel separa busca, social, e-mail, pago, direto e referência", () => {
  assert.equal(classifyChannel("google"), "Busca orgânica");
  assert.equal(classifyChannel("facebook.com"), "Social");
  assert.equal(classifyChannel("instagram.com"), "Social");
  assert.equal(classifyChannel("Direto"), "Direto");
  assert.equal(classifyChannel("blog-parceiro.com.br"), "Referência");
  assert.equal(classifyChannel("Direto", { source: "newsletter", medium: "email" }), "E-mail");
  assert.equal(classifyChannel("google", { medium: "cpc" }), "Pago");
});

test("parseGeo lê cabeçalhos da Vercel e descarta lixo", () => {
  const h = new Headers({ "x-vercel-ip-country": "br", "x-vercel-ip-country-region": "MG", "x-vercel-ip-city": "S%C3%A3o%20Louren%C3%A7o" });
  assert.deepEqual(parseGeo(h), { country: "BR", region: "MG", city: "São Lourenço" });
  assert.deepEqual(parseGeo(new Headers()), { country: "??", region: "", city: "" });
});

test("cleanUtm limpa caracteres perigosos", () => {
  assert.deepEqual(cleanUtm({ source: "News<script>", medium: "E-mail", campaign: "x".repeat(99) }),
    { source: "newsscript", medium: "e-mail", campaign: "x".repeat(40) });
});

test("pageType agrupa as páginas", () => {
  assert.equal(pageType("/"), "Página inicial");
  assert.equal(pageType("/blog/qualquer"), "Artigos");
  assert.equal(pageType("/sobre"), "Institucional");
});

test("aggregateStats soma dias, calcula taxas e agrupa dimensões", () => {
  const days = ["2026-10-23", "2026-10-24"];
  const dayData = [
    { v: 3, s: 2, lv: 2, bn: 1, sec: 120, sc: 150, scn: 2, "p:/": 1, "p:/blog/a": 2, "r:google": 2, "r:Direto": 1,
      "c:Busca orgânica": 2, "c:Direto": 1, "t:Mobile|Chrome|Android": 3, "g:BR|MG|Varginha": 2, "g:BR|SP|Campinas": 1,
      "h:09": 2, "h:21": 1, "e:/blog/a": 2, "ts:/blog/a": 90, "tn:/blog/a": 2, "u:news|email|semana": 1 },
    { v: 1, s: 1, lv: 1, bn: 0, sec: 60, sc: 100, scn: 1, "p:/blog/a": 1, "g:US|CA|Austin": 1, "t:Desktop|Edge|Windows": 1, "h:09": 1 },
  ];
  const r = aggregateStats({ days, dayData, uniques: [3, 1], prev: { views: 2, sessions: 1 }, live: 4, range: 7, titleBySlug: { a: "Artigo A" } });
  assert.equal(r.totals.views, 4);
  assert.equal(r.totals.sessions, 3);
  assert.equal(r.totals.bounceRate, 33);
  assert.equal(r.totals.avgSeconds, 60);
  assert.equal(r.totals.avgScroll, 83);
  assert.equal(r.totals.pagesPerSession, 1.3);
  assert.equal(r.live, 4);
  assert.equal(r.hours[9], 3);
  assert.equal(r.pages[0].title, "Artigo A");
  assert.equal(r.pages[0].avgSeconds, 45);
  assert.deepEqual(r.regions, [{ code: "MG", views: 2 }, { code: "SP", views: 1 }]);
  assert.equal(r.devices[0].label, "Mobile");
  assert.equal(r.cities[0].city, "Varginha");
  assert.equal(r.campaigns[0].source, "news");
  assert.equal(r.types.find((t) => t.label === "Artigos").views, 3);
});
