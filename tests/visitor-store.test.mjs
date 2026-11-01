import test, { mock } from "node:test";
import assert from "node:assert/strict";
import {
  CONSENT_VERSION, SESSION_COOKIE, VISITOR_COOKIE, consentValue, parseConsent, parseCookieHeader,
} from "../lib/consent.js";
import {
  aggregateVisitors, cleanEvent, eraseVisitor, getSessionDetail, listSessions, parseSession, parseTimeline,
  readVisitorStats, recordVisitorEngagement, recordVisitorEvent, recordVisitorPageview,
  resolveIds, signId, verifyId, visitBucket,
} from "../lib/visitor-store.js";

/* ───────────── Redis em memória (fala o mesmo protocolo /pipeline do Upstash) ───────────── */

function fakeRedis() {
  const db = new Map();
  const ttl = new Map();
  const hash = (k) => { if (!db.has(k)) db.set(k, new Map()); return db.get(k); };
  const ops = {
    HINCRBY: ([k, f, n]) => { const h = hash(k); const v = (Number(h.get(f)) || 0) + Number(n); h.set(f, String(v)); return v; },
    HSETNX: ([k, f, v]) => { const h = hash(k); if (h.has(f)) return 0; h.set(f, String(v)); return 1; },
    HSET: ([k, ...rest]) => { const h = hash(k); for (let i = 0; i < rest.length; i += 2) h.set(rest[i], String(rest[i + 1])); return rest.length / 2; },
    HGET: ([k, f]) => (db.get(k)?.get(f) ?? null),
    HGETALL: ([k]) => [...(db.get(k) || new Map()).entries()].flat(),
    EXPIRE: ([k, s]) => { if (!db.has(k)) return 0; ttl.set(k, Number(s)); return 1; },
    RPUSH: ([k, ...v]) => { const l = db.get(k) || []; l.push(...v.map(String)); db.set(k, l); return l.length; },
    LTRIM: ([k, a, b]) => { const l = db.get(k) || []; const n = l.length; const s = a < 0 ? Math.max(n + a, 0) : a; const e = b < 0 ? n + b : b; db.set(k, l.slice(s, e + 1)); return "OK"; },
    LRANGE: ([k, a, b]) => { const l = db.get(k) || []; const e = b < 0 ? l.length + b : b; return l.slice(a < 0 ? Math.max(l.length + a, 0) : a, e + 1); },
    ZADD: ([k, s, m]) => { const z = db.get(k) || new Map(); z.set(m, Number(s)); db.set(k, z); return 1; },
    ZREM: ([k, m]) => (db.get(k)?.delete(m) ? 1 : 0),
    ZREMRANGEBYSCORE: ([k, a, b]) => { const z = db.get(k); if (!z) return 0; let n = 0; for (const [m, s] of z) if (s >= a && s <= b) { z.delete(m); n += 1; } return n; },
    ZREVRANGE: ([k, a, b]) => [...(db.get(k) || new Map()).entries()].sort((x, y) => y[1] - x[1]).map((e) => e[0]).slice(a, b + 1),
    ZCARD: ([k]) => (db.get(k)?.size || 0),
    PFADD: ([k, m]) => { const s = db.get(k) || new Set(); const had = s.has(m); s.add(m); db.set(k, s); return had ? 0 : 1; },
    PFCOUNT: ([k]) => (db.get(k)?.size || 0),
    DEL: (keys) => { let n = 0; for (const k of keys) { if (db.delete(k)) n += 1; ttl.delete(k); } return n; },
  };
  return {
    db, ttl,
    async fetch(_url, init) {
      const cmds = JSON.parse(init.body);
      const out = cmds.map(([name, ...args]) => {
        if (!ops[name]) return { error: `comando não suportado no teste: ${name}` };
        return { result: ops[name](args) };
      });
      return { ok: true, status: 200, json: async () => out };
    },
  };
}

const realFetch = globalThis.fetch;
function useFakeRedis() {
  process.env.KV_REST_API_URL = "https://fake.upstash.io";
  process.env.KV_REST_API_TOKEN = "t";
  const redis = fakeRedis();
  globalThis.fetch = (url, init) => redis.fetch(url, init);
  return redis;
}
test.after(() => { globalThis.fetch = realFetch; });

/* ───────────── consentimento ───────────── */

test("parseCookieHeader lê cookies e ignora lixo", () => {
  assert.deepEqual(parseCookieHeader("a=1; b=dois%20tres; =x; c"), { a: "1", b: "dois tres" });
  assert.deepEqual(parseCookieHeader(""), {});
  assert.deepEqual(parseCookieHeader(null), {});
  assert.equal(parseCookieHeader("a=1; a=2").a, "1");
});

test("consentValue/parseConsent: aceita só a versão atual", () => {
  assert.equal(parseConsent(consentValue("accepted")), "accepted");
  assert.equal(parseConsent(consentValue("rejected")), "rejected");
  assert.equal(parseConsent(consentValue("qualquer")), "rejected"); // na dúvida, nunca "aceito"
  assert.equal(parseConsent(`${CONSENT_VERSION + 1}.a`), null);
  assert.equal(parseConsent("0.a"), null);
  assert.equal(parseConsent("a"), null);
  assert.equal(parseConsent(undefined), null);
});

/* ───────────── ids assinados ───────────── */

test("ids assinados: o servidor só aceita o que ele mesmo gerou", () => {
  const id = "123e4567-e89b-42d3-a456-426614174000";
  const signed = signId(id);
  assert.equal(verifyId(signed), id);
  assert.equal(verifyId(id), null); // sem assinatura
  assert.equal(verifyId(`${id}.0000000000000000`), null); // assinatura errada
  assert.equal(verifyId(signed.replace(id, "123e4567-e89b-42d3-a456-426614174001")), null); // id trocado
  assert.equal(verifyId("lixo"), null);
  assert.equal(verifyId(undefined), null);
});

test("resolveIds cria ids novos, reaproveita os válidos e respeita mint=false", () => {
  const fresh = resolveIds({});
  assert.equal(fresh.newSession, true);
  assert.equal(fresh.cookies.length, 2);
  assert.equal(fresh.cookies.find((c) => c.name === SESSION_COOKIE).maxAge, 30 * 60);

  const jar = Object.fromEntries(fresh.cookies.map((c) => [c.name, c.value]));
  const again = resolveIds(jar);
  assert.equal(again.newSession, false);
  assert.equal(again.vid, fresh.vid);
  assert.equal(again.sid, fresh.sid);

  assert.equal(resolveIds({}, { mint: false }), null);
  assert.equal(resolveIds({ [VISITOR_COOKIE]: "forjado", [SESSION_COOKIE]: "forjado" }, { mint: false }), null);
  // cookie forjado nunca vira id: gera um novo
  assert.notEqual(resolveIds({ [VISITOR_COOKIE]: "forjado" }).vid, "forjado");
});

/* ───────────── eventos ───────────── */

test("cleanEvent aceita só nomes conhecidos e higieniza a dimensão", () => {
  const slugs = new Set(["como-estudar"]);
  assert.equal(cleanEvent("evento_inventado", {}, slugs), null);
  for (const name of ["__proto__", "constructor", "toString", "hasOwnProperty", 42, null, undefined]) {
    assert.equal(cleanEvent(name, {}, slugs), null, String(name));
  }
  assert.deepEqual(cleanEvent("internal_search", { query: "texto livre" }, slugs), { name: "internal_search", dim: "" });
  assert.deepEqual(cleanEvent("affiliate_click", { partner_id: "Hotmart<script>" }, slugs), { name: "affiliate_click", dim: "hotmartscript" });
  assert.deepEqual(cleanEvent("affiliate_click", {}, slugs), { name: "affiliate_click", dim: "outro" });
  assert.deepEqual(cleanEvent("related_article_click", { target_slug: "como-estudar" }, slugs), { name: "related_article_click", dim: "como-estudar" });
  assert.equal(cleanEvent("related_article_click", { target_slug: "nao-existe" }, slugs).dim, "outro");
  assert.equal(cleanEvent("outbound_official_source_click", { source_domain: "Planalto.GOV.br/x" }, slugs).dim, "planalto.gov.brx");
  assert.equal(cleanEvent("obsolete_action", { detail: "not supported" }, slugs), null);
  assert.equal(cleanEvent("newsletter_signup_success", { source: "/blog/como-estudar" }, slugs).dim, "/blog/como-estudar");
  assert.equal(cleanEvent("newsletter_signup_success", { source: "https://evil.com" }, slugs).dim, "outro");
});

/* ───────────── buckets e parsing ───────────── */

test("visitBucket agrupa o número da visita", () => {
  assert.deepEqual([1, 2, 3, 5, 6, 40].map(visitBucket), ["1", "2", "3-5", "3-5", "6+", "6+"]);
});

test("parseSession e parseTimeline convertem o que veio do Redis", () => {
  const s = parseSession("sid", {
    vid: "abcdef12-0000", t0: "1000", t1: "5000", dev: "Mobile", br: "Chrome", os: "Android",
    geo: "BR|MG|Varginha", ref: "google", ch: "Busca orgânica", utm: "news|email|-", lp: "/", xp: "/blog/a", n: "3", sec: "75", ev: "2", vno: "4",
  });
  assert.equal(s.visitor, "abcdef12");
  assert.equal(s.city, "Varginha");
  assert.equal(s.region, "MG");
  assert.deepEqual(s.campaign, { source: "news", medium: "email", campaign: "-" });
  assert.equal(s.pages, 3);
  assert.equal(s.visitNo, 4);
  assert.equal(parseSession("x", {}).campaign, null);

  const tl = parseTimeline(["v|1000|/", "e|2000|/|30|80", "x|3000|affiliate_click|hotmart|/blog/a", "lixo", "v|nao|"]);
  assert.equal(tl.length, 4);
  assert.deepEqual(tl[1], { kind: "leave", t: 2000, path: "/", seconds: 30, scroll: 80 });
  assert.deepEqual(tl[2], { kind: "event", t: 3000, name: "affiliate_click", dim: "hotmart", path: "/blog/a" });
});

/* ───────────── fluxo completo com Redis simulado ───────────── */

test("fluxo completo: visita nova, páginas, tempo, ação, painel e apagar", async (t0) => {
  // Congela "hoje" em 25/10/2026 (18h em Brasília): o painel lê os últimos dias a partir do
  // relógio real, e sem isso o teste só passava no próprio dia 25.
  mock.timers.enable({ apis: ["Date"], now: new Date(Date.UTC(2026, 9, 25, 21, 0)) });
  t0.after(() => mock.timers.reset());
  const redis = useFakeRedis();
  const t = (min) => new Date(Date.UTC(2026, 9, 25, 15, min)); // 12h00 em Brasília + min
  const a = resolveIds({});

  // 1ª página (início da visita)
  await recordVisitorPageview({
    ...a, path: "/blog/como-estudar", now: t(0),
    meta: { device: "Mobile", browser: "Chrome", os: "Android", country: "BR", region: "MG", city: "Varginha", referrer: "google", channel: "Busca orgânica", utm: null },
  });
  // 2ª página (mesma visita)
  await recordVisitorPageview({ ...resolveIds(Object.fromEntries(a.cookies.map((c) => [c.name, c.value]))), path: "/blog/entenda-a-bula", now: t(1) });
  // sai da 1ª página depois de 45 s e da 2ª depois de 30 s
  await recordVisitorEngagement({ sid: a.sid, path: "/blog/como-estudar", seconds: 45, scroll: 80, now: t(1) });
  await recordVisitorEngagement({ sid: a.sid, path: "/blog/entenda-a-bula", seconds: 30, scroll: 20, now: t(2) });
  // ação no site
  await recordVisitorEvent({ sid: a.sid, event: { name: "newsletter_signup_start", dim: "/blog" }, path: "/blog", now: t(2) });
  await recordVisitorEvent({ sid: a.sid, event: { name: "newsletter_signup_success", dim: "/blog" }, path: "/blog", now: t(3) });

  // Outro visitante, 1 página só
  const b = resolveIds({});
  await recordVisitorPageview({ ...b, path: "/", now: t(5), meta: { country: "BR" } });

  // Mesmo visitante A volta (nova visita)
  const a2 = { vid: a.vid, sid: resolveIds({}).sid, newSession: true };
  await recordVisitorPageview({ ...a2, path: "/blog", now: t(40), meta: { country: "BR" } });

  // pv:d:… (estatística anônima) para a cobertura
  redis.db.set("descomplica-bula:pv:d:2026-10-25", new Map([["s", "10"]]));

  // Retenção definida
  assert.ok(redis.ttl.get(`descomplica-bula:vs:${a.sid}`) === 90 * 86400);
  assert.ok(redis.ttl.get(`descomplica-bula:vl:${a.sid}`) === 90 * 86400);
  assert.ok(redis.ttl.get("descomplica-bula:cv:d:2026-10-25") > 0);
  assert.ok(redis.ttl.get("descomplica-bula:cv:u:2026-10-25") > 0);

  // Agregados
  const stats = await readVisitorStats(7, { titleBySlug: { "como-estudar": "Como estudar" } });
  const day = stats.series.at(-1);
  assert.equal(day.sessions, 3);
  assert.equal(day.newSessions, 2); // A (1ª) e B (1ª)
  assert.equal(day.returningSessions, 1); // A (2ª)
  assert.equal(day.visitors, 2); // A e B
  assert.equal(stats.totals.sessions, 3);
  assert.equal(stats.totals.views, 4);
  assert.equal(stats.totals.returningRate, 33);
  assert.equal(stats.totals.coverage, 30); // 3 de 10 sessões
  assert.equal(stats.totals.avgSeconds, 25); // 75 s / 3 visitas
  assert.deepEqual(stats.visitNumber.map((x) => x.count), [2, 1, 0, 0]);
  // profundidade: 2 visitas com 1 página, 1 com 2 páginas
  assert.deepEqual(stats.depth.map((x) => x.count), [2, 1, 0, 0, 0]);
  // duração: A passou de 10, 30 e 60 s (75 s); B e A2 ficaram abaixo de 10 s
  assert.deepEqual(stats.duration.map((x) => x.count), [2, 0, 0, 1, 0, 0]);
  assert.equal(stats.funnels.newsletter.start, 1);
  assert.equal(stats.funnels.newsletter.done, 1);
  assert.equal(stats.funnels.newsletter.rate, 100);
  assert.equal(stats.totals.actions, 2);
  assert.deepEqual(stats.events.find((e) => e.name === "newsletter_signup_start").dims[0], { key: "/blog", count: 1, label: "/blog" });
  assert.equal(stats.events.find((e) => e.name === "newsletter_signup_start").pages[0].path, "/blog");

  // Lista e detalhe
  const list = await listSessions({ limit: 10 });
  assert.equal(list.total, 3);
  assert.equal(list.sessions[0].landing, "/blog"); // mais recente primeiro
  assert.equal(list.sessions[0].visitNo, 2);

  const detail = await getSessionDetail(a.sid);
  assert.equal(detail.session.pages, 2);
  assert.equal(detail.session.seconds, 75);
  assert.equal(detail.session.events, 2);
  assert.equal(detail.session.city, "Varginha");
  assert.equal(detail.session.visitNo, 1);
  assert.deepEqual(detail.timeline.map((x) => x.kind), ["view", "view", "leave", "leave", "event", "event"]);
  assert.equal(detail.others.length, 1); // a 2ª visita de A
  assert.equal(detail.others[0].landing, "/blog");
  assert.equal(await getSessionDetail("nao-e-uuid"), null);

  // Apagar (visitante A recusou): some tudo dele; B continua
  await eraseVisitor(a.vid);
  assert.equal(await getSessionDetail(a.sid), null);
  const after = await listSessions({ limit: 10 });
  assert.equal(after.total, 1);
  assert.equal(after.sessions[0].landing, "/");
  assert.equal(redis.db.has(`descomplica-bula:vv:${a.vid}`), false);
  assert.equal(redis.db.has(`descomplica-bula:vl:${a.sid}`), false);
  assert.equal(redis.db.has(`descomplica-bula:vl:${b.sid}`), true);
});

test("engajamento ignora tempo zero e limita valores absurdos", async () => {
  const redis = useFakeRedis();
  const ids = resolveIds({});
  await recordVisitorPageview({ ...ids, path: "/", meta: {} });
  await recordVisitorEngagement({ sid: ids.sid, path: "/", seconds: 0, scroll: 0 }); // nada a registrar
  assert.equal(redis.db.get(`descomplica-bula:vs:${ids.sid}`).get("sec"), undefined);
  await recordVisitorEngagement({ sid: ids.sid, path: "/", seconds: 99999, scroll: 500 });
  assert.equal(redis.db.get(`descomplica-bula:vs:${ids.sid}`).get("sec"), "1800");
  assert.match(redis.db.get(`descomplica-bula:vl:${ids.sid}`).at(-1), /\|1800\|100$/);
});

test("aggregateVisitors com dias vazios não quebra nem divide por zero", () => {
  const out = aggregateVisitors({ days: ["2026-10-24", "2026-10-25"], dayData: [{}, {}], uniques: [0, 0], totalSessions: [0, 0], range: 7 });
  assert.equal(out.totals.sessions, 0);
  assert.equal(out.totals.returningRate, null);
  assert.equal(out.totals.pagesPerSession, null);
  assert.equal(out.totals.coverage, null);
  assert.equal(out.funnels.newsletter.rate, null);
  assert.equal(out.events.length, 6);
  assert.ok(out.depth.every((d) => d.count === 0));
});
