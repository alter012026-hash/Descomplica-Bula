// -----------------------------------------------------------------------
// Visitas INDIVIDUAIS — só de quem aceitou os cookies (consentimento LGPD).
//
// Convive com lib/visit-store.js (estatística anônima, sem cookies, para todos).
// O servidor só chama este módulo quando o cookie db_consent = aceito.
//
// Chaves no Upstash Redis:
//   vv:{vid}        hash do visitante: n (nº de visitas), first, last          (400 dias)
//   vvs:{vid}       lista com os últimos 60 ids de visita do visitante         (400 dias)
//   vs:{sid}        hash da visita: vid, t0, t1, dev, br, os, geo, ref, ch,
//                   utm, lp (1ª página), xp (última), n (páginas), sec, ev, vno (90 dias)
//   vl:{sid}        linha do tempo da visita (lista, máx. 60 itens)            (90 dias)
//                     v|ts|/caminho                 abriu uma página
//                     e|ts|/caminho|seg|rolagem     saiu da página
//                     x|ts|evento|dimensão|/caminho ação no site
//   vs:idx          sorted set (visita → início) para listar as mais recentes
//   cv:d:YYYY-MM-DD hash do dia, só de quem consentiu                          (400 dias)
//                     s, v, sec            visitas, páginas vistas, segundos
//                     vn:1|2|3-5|6+        visitas por "nº da visita do visitante"
//                     dp:2..5              visitas que chegaram a >= N páginas
//                     du:10|30|60|180|600  visitas que passaram de N segundos
//                     x:evento · xp:evento|dim · xa:evento|/caminho
//   cv:u:YYYY-MM-DD HyperLogLog de visitantes únicos do dia
//
// Os cookies db_vid / db_sid carregam "<uuid>.<assinatura>": o servidor só
// aceita ids que ele mesmo gerou, então ninguém consegue forjar ids para
// encher o banco.
// -----------------------------------------------------------------------

import crypto from "crypto";
import { SESSION_COOKIE, SESSION_MAX_AGE, VISITOR_COOKIE, VISITOR_MAX_AGE } from "./consent.js";
import { dayKey, lastDays, normalizePath, pipeline } from "./visit-store.js";

const DAY = 24 * 3600;
export const SESSION_RETENTION_DAYS = 90;
const SESSION_RETENTION = SESSION_RETENTION_DAYS * DAY;
const VISITOR_RETENTION = 400 * DAY;
const DAILY_RETENTION = 400 * DAY;
const TIMELINE_MAX = 60;
const VISITOR_SESSIONS_MAX = 60;
const IDX = "vs:idx";

export const DURATION_STEPS = [10, 30, 60, 180, 600];

/* ───────────── ids assinados ───────────── */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SIGNED_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{16})$/;

export function isUuid(value) {
  return UUID_RE.test(String(value || ""));
}

function mac(id) {
  const secret = `db-id:${process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || "descomplica-bula"}`;
  return crypto.createHmac("sha256", secret).update(id).digest("hex").slice(0, 16);
}

export function signId(id) {
  return `${id}.${mac(id)}`;
}

/** Devolve o uuid se a assinatura for válida; senão null. */
export function verifyId(value) {
  const m = SIGNED_RE.exec(String(value || ""));
  if (!m) return null;
  const a = Buffer.from(m[2]);
  const b = Buffer.from(mac(m[1]));
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? m[1] : null;
}

/**
 * Descobre (ou cria) os ids do visitante e da visita a partir dos cookies.
 * Com mint=false só devolve algo se os dois já existirem (usado em
 * "saiu da página" e "ação no site": não faz sentido abrir visita nova ali).
 * @returns {{vid:string,sid:string,newSession:boolean,cookies:Array}|null}
 */
export function resolveIds(jar, { mint = true } = {}) {
  let vid = verifyId(jar?.[VISITOR_COOKIE]);
  let sid = verifyId(jar?.[SESSION_COOKIE]);
  if ((!vid || !sid) && !mint) return null;
  const newSession = !sid;
  if (!vid) vid = crypto.randomUUID();
  if (!sid) sid = crypto.randomUUID();
  return {
    vid,
    sid,
    newSession,
    cookies: [
      { name: VISITOR_COOKIE, value: signId(vid), maxAge: VISITOR_MAX_AGE },
      { name: SESSION_COOKIE, value: signId(sid), maxAge: SESSION_MAX_AGE },
    ],
  };
}

/* ───────────── ações no site (eventos) ───────────── */

const TEXT_RE = /[^\p{L}\p{N} _./-]/gu;
const EVENT_SPECS = {
  newsletter_signup_start: { dim: "source", kind: "path" },
  newsletter_signup_success: { dim: "source", kind: "path" },
  affiliate_click: { dim: "partner_id", kind: "id" },
  internal_search: { dim: null },
  related_article_click: { dim: "target_slug", kind: "slug" },
  outbound_official_source_click: { dim: "source_domain", kind: "domain" },
};
export const EVENT_NAMES = Object.keys(EVENT_SPECS);

/**
 * Valida um evento vindo do navegador. Só passa nome conhecido e UMA dimensão
 * (parceiro, artigo, domínio…) já higienizada; nada de texto livre do usuário.
 * @returns {{name:string, dim:string}|null}
 */
export function cleanEvent(name, props, knownSlugs = new Set()) {
  // hasOwn: sem isso "__proto__", "constructor" etc. passariam como nome de evento.
  if (typeof name !== "string" || !Object.hasOwn(EVENT_SPECS, name)) return null;
  const spec = EVENT_SPECS[name];
  if (!spec.dim) return { name, dim: "" };
  const raw = props && typeof props === "object" ? props[spec.dim] : "";
  let dim = "";
  if (spec.kind === "text") dim = String(raw ?? "").replace(TEXT_RE, "").trim().slice(0, 40);
  else if (spec.kind === "id") dim = String(raw ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30);
  else if (spec.kind === "domain") dim = String(raw ?? "").toLowerCase().replace(/[^a-z0-9.-]/g, "").slice(0, 60);
  else if (spec.kind === "slug") {
    const set = knownSlugs instanceof Set ? knownSlugs : new Set(knownSlugs);
    dim = set.has(String(raw)) ? String(raw) : "";
  } else if (spec.kind === "path") dim = normalizePath(String(raw ?? ""), knownSlugs) || "";
  return { name, dim: dim || "outro" };
}

/* ───────────── escrita ───────────── */

/** 1 → "1", 2 → "2", 3–5 → "3-5", 6+ → "6+". */
export function visitBucket(n) {
  if (n <= 1) return "1";
  if (n === 2) return "2";
  if (n <= 5) return "3-5";
  return "6+";
}

const str = (v, max = 80) => String(v ?? "").replace(/[\r\n]/g, " ").slice(0, max);

/**
 * Registra uma página vista de quem consentiu. Se for o início da visita,
 * cria a visita e conta o visitante (novo ou recorrente).
 * @param {{vid:string,sid:string,newSession:boolean,path:string,
 *          meta?:{device?:string,browser?:string,os?:string,country?:string,region?:string,city?:string,
 *                 referrer?:string,channel?:string,utm?:{source?:string,medium?:string,campaign?:string}},
 *          now?:Date}} input
 */
export async function recordVisitorPageview({ vid, sid, newSession, path, meta = {}, now = new Date() }) {
  const ts = now.getTime();
  const day = dayKey(now);
  const cd = `cv:d:${day}`;
  const cu = `cv:u:${day}`;
  const vs = `vs:${sid}`;
  const vl = `vl:${sid}`;
  const cmds = [];
  let visitIdx = -1;

  if (newSession) {
    const vv = `vv:${vid}`;
    const vvs = `vvs:${vid}`;
    const u = meta.utm || {};
    const utm = u.source || u.medium || u.campaign ? `${u.source || "-"}|${u.medium || "-"}|${u.campaign || "-"}` : "";
    visitIdx = cmds.length;
    cmds.push(["HINCRBY", vv, "n", 1]);
    cmds.push(["HSETNX", vv, "first", ts], ["HSET", vv, "last", ts], ["EXPIRE", vv, VISITOR_RETENTION]);
    cmds.push(["RPUSH", vvs, sid], ["LTRIM", vvs, -VISITOR_SESSIONS_MAX, -1], ["EXPIRE", vvs, VISITOR_RETENTION]);
    cmds.push([
      "HSET", vs,
      "vid", vid, "t0", ts, "lp", path,
      "dev", str(meta.device || "Desktop", 20), "br", str(meta.browser || "Outro", 30), "os", str(meta.os || "Outro", 20),
      "geo", `${str(meta.country || "??", 2)}|${str(meta.region, 3)}|${str(meta.city, 40)}`,
      "ref", str(meta.referrer), "ch", str(meta.channel, 20), "utm", str(utm, 130),
    ]);
    cmds.push(["ZADD", IDX, ts, sid], ["ZREMRANGEBYSCORE", IDX, 0, ts - SESSION_RETENTION * 1000]);
  }

  const pagesIdx = cmds.length;
  cmds.push(["HINCRBY", vs, "n", 1], ["HSET", vs, "t1", ts, "xp", path]);
  cmds.push(["RPUSH", vl, `v|${ts}|${path}`], ["LTRIM", vl, -TIMELINE_MAX, -1]);
  if (newSession) cmds.push(["EXPIRE", vs, SESSION_RETENTION], ["EXPIRE", vl, SESSION_RETENTION]);

  const first = await pipeline(cmds);
  const pages = Number(first[pagesIdx]) || 1;
  const visitNo = visitIdx >= 0 ? Number(first[visitIdx]) || 1 : 0;

  // Contadores do dia (precisam do nº de páginas e do nº da visita).
  const daily = [["HINCRBY", cd, "v", 1]];
  if (newSession) {
    daily.push(
      ["HINCRBY", cd, "s", 1],
      ["HINCRBY", cd, `vn:${visitBucket(visitNo)}`, 1],
      ["PFADD", cu, vid],
      ["EXPIRE", cu, DAILY_RETENTION],
      ["HSET", vs, "vno", visitNo],
    );
  }
  if (pages >= 2 && pages <= 5) daily.push(["HINCRBY", cd, `dp:${pages}`, 1]);
  const second = await pipeline(daily);
  if (Number(second[0]) === 1) await pipeline([["EXPIRE", cd, DAILY_RETENTION]]);
}

/** Tempo na página e rolagem (enviados ao sair da página). */
export async function recordVisitorEngagement({ sid, path, seconds, scroll, now = new Date() }) {
  const sec = Math.max(0, Math.min(1800, Math.round(Number(seconds) || 0)));
  const pct = Math.max(0, Math.min(100, Math.round(Number(scroll) || 0)));
  if (sec === 0 && pct === 0) return;
  const ts = now.getTime();
  const vs = `vs:${sid}`;
  const vl = `vl:${sid}`;
  const first = await pipeline([
    ["HINCRBY", vs, "sec", sec],
    ["HSET", vs, "t1", ts],
    ["RPUSH", vl, `e|${ts}|${path}|${sec}|${pct}`],
    ["LTRIM", vl, -TIMELINE_MAX, -1],
  ]);
  if (sec === 0) return;
  const total = Number(first[0]) || sec;
  const before = total - sec;
  const cd = `cv:d:${dayKey(now)}`;
  const daily = [["HINCRBY", cd, "sec", sec]];
  for (const step of DURATION_STEPS) {
    if (before < step && total >= step) daily.push(["HINCRBY", cd, `du:${step}`, 1]);
  }
  await pipeline(daily);
}

/** Ação no site (newsletter, busca, links de fonte oficial). */
export async function recordVisitorEvent({ sid, event, path, now = new Date() }) {
  const ts = now.getTime();
  const vs = `vs:${sid}`;
  const vl = `vl:${sid}`;
  const cd = `cv:d:${dayKey(now)}`;
  const cmds = [
    ["RPUSH", vl, `x|${ts}|${event.name}|${event.dim}|${path}`],
    ["LTRIM", vl, -TIMELINE_MAX, -1],
    ["HINCRBY", vs, "ev", 1],
    ["HINCRBY", cd, `x:${event.name}`, 1],
    ["HINCRBY", cd, `xa:${event.name}|${path}`, 1],
  ];
  if (event.dim) cmds.push(["HINCRBY", cd, `xp:${event.name}|${event.dim}`, 1]);
  await pipeline(cmds);
}

/**
 * Apaga o que está ligado a este visitante (usado quando ele recusa/revoga).
 * Os contadores somados dos dias continuam: são números, não pessoas.
 */
export async function eraseVisitor(vid) {
  if (!isUuid(vid)) return;
  const [ids] = await pipeline([["LRANGE", `vvs:${vid}`, 0, -1]]);
  const sids = (Array.isArray(ids) ? ids : []).filter(isUuid);
  const cmds = [["DEL", `vv:${vid}`, `vvs:${vid}`]];
  for (const sid of sids) cmds.push(["DEL", `vs:${sid}`, `vl:${sid}`], ["ZREM", IDX, sid]);
  await pipeline(cmds);
}

/* ───────────── leitura ───────────── */

function flatToObject(flat) {
  const obj = {};
  if (!Array.isArray(flat)) return obj;
  for (let i = 0; i < flat.length; i += 2) obj[flat[i]] = flat[i + 1];
  return obj;
}

function flatToNumbers(flat) {
  const obj = flatToObject(flat);
  for (const k of Object.keys(obj)) obj[k] = Number(obj[k]) || 0;
  return obj;
}

/** Hash cru da visita → objeto pronto para o painel. */
export function parseSession(sid, h = {}) {
  const [country = "??", region = "", city = ""] = String(h.geo || "").split("|");
  const [usource = "", umedium = "", ucampaign = ""] = String(h.utm || "").split("|");
  return {
    id: sid,
    visitor: String(h.vid || "").slice(0, 8),
    start: Number(h.t0) || 0,
    last: Number(h.t1) || Number(h.t0) || 0,
    device: h.dev || "Desktop",
    browser: h.br || "Outro",
    os: h.os || "Outro",
    country, region, city,
    referrer: h.ref || "",
    channel: h.ch || "",
    campaign: usource || umedium || ucampaign ? { source: usource, medium: umedium, campaign: ucampaign } : null,
    landing: h.lp || "",
    exit: h.xp || h.lp || "",
    pages: Number(h.n) || 0,
    seconds: Number(h.sec) || 0,
    events: Number(h.ev) || 0,
    visitNo: Number(h.vno) || 0,
  };
}

/** Lista da linha do tempo ("v|…", "e|…", "x|…") → itens tipados. */
export function parseTimeline(list) {
  const out = [];
  for (const line of Array.isArray(list) ? list : []) {
    const p = String(line).split("|");
    const t = Number(p[1]) || 0;
    if (p[0] === "v") out.push({ kind: "view", t, path: p[2] || "" });
    else if (p[0] === "e") out.push({ kind: "leave", t, path: p[2] || "", seconds: Number(p[3]) || 0, scroll: Number(p[4]) || 0 });
    else if (p[0] === "x") out.push({ kind: "event", t, name: p[2] || "", dim: p[3] || "", path: p[4] || "" });
  }
  return out;
}

/** As visitas mais recentes (mais novas primeiro). */
export async function listSessions({ offset = 0, limit = 30 } = {}) {
  const start = Math.max(0, Math.floor(offset));
  const size = Math.max(1, Math.min(50, Math.floor(limit)));
  const [ids, total] = await pipeline([["ZREVRANGE", IDX, start, start + size - 1], ["ZCARD", IDX]]);
  const list = (Array.isArray(ids) ? ids : []).filter(isUuid);
  if (!list.length) return { total: Number(total) || 0, sessions: [] };
  const rows = await pipeline(list.map((id) => ["HGETALL", `vs:${id}`]));
  const sessions = list
    .map((id, i) => parseSession(id, flatToObject(rows[i])))
    .filter((s) => s.start > 0);
  return { total: Number(total) || 0, sessions };
}

/** Uma visita completa: dados, linha do tempo e outras visitas do mesmo visitante. */
export async function getSessionDetail(sid) {
  if (!isUuid(sid)) return null;
  const [hash, list] = await pipeline([["HGETALL", `vs:${sid}`], ["LRANGE", `vl:${sid}`, 0, -1]]);
  const raw = flatToObject(hash);
  const session = parseSession(sid, raw);
  if (!session.start) return null;

  let others = [];
  if (isUuid(raw.vid)) {
    const [ids] = await pipeline([["LRANGE", `vvs:${raw.vid}`, 0, -1]]);
    const otherIds = (Array.isArray(ids) ? ids : []).filter((id) => isUuid(id) && id !== sid).slice(-10).reverse();
    if (otherIds.length) {
      const rows = await pipeline(otherIds.map((id) => ["HGETALL", `vs:${id}`]));
      others = otherIds.map((id, i) => parseSession(id, flatToObject(rows[i]))).filter((s) => s.start > 0);
    }
  }
  return { session, timeline: parseTimeline(list), others };
}

/* ───────────── agregação para os gráficos ───────────── */

function add(map, key, n) {
  map[key] = (map[key] || 0) + n;
}

function top(map, limit) {
  return Object.entries(map)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

const clamp0 = (n) => Math.max(0, n);

function pathTitle(path, titleBySlug) {
  if (path === "/") return "Página inicial";
  if (path.startsWith("/blog/")) return titleBySlug[path.slice(6)] || path;
  return path;
}

/**
 * Função pura: hashes diários (cv:d:*) → tudo que o painel "Visitas" mostra.
 * @param {{days:string[], dayData:object[], uniques:number[], totalSessions:number[],
 *          titleBySlug?:object, range:number}} input
 */
export function aggregateVisitors({ days, dayData, uniques, totalSessions = [], titleBySlug = {}, range, full = false }) {
  const visitNo = { "1": 0, "2": 0, "3-5": 0, "6+": 0 };
  const reach = { 2: 0, 3: 0, 4: 0, 5: 0 };
  const dur = Object.fromEntries(DURATION_STEPS.map((s) => [s, 0]));
  const ev = {};
  let sessions = 0, views = 0, seconds = 0, anonSessions = 0;

  const series = days.map((date, i) => {
    const h = dayData[i] || {};
    const s = h.s || 0;
    const newS = h["vn:1"] || 0;
    sessions += s; views += h.v || 0; seconds += h.sec || 0; anonSessions += totalSessions[i] || 0;
    for (const [field, n] of Object.entries(h)) {
      const sep = field.indexOf(":");
      if (sep < 0) continue;
      const kind = field.slice(0, sep);
      const rest = field.slice(sep + 1);
      if (kind === "vn") add(visitNo, rest, n);
      else if (kind === "dp") reach[rest] = (reach[rest] || 0) + n;
      else if (kind === "du") dur[rest] = (dur[rest] || 0) + n;
      else if (kind === "x") (ev[rest] ||= { count: 0, dims: {}, pages: {} }).count += n;
      else if (kind === "xp" || kind === "xa") {
        const cut = rest.indexOf("|");
        if (cut < 0) continue;
        const name = rest.slice(0, cut);
        const key = rest.slice(cut + 1);
        const slot = (ev[name] ||= { count: 0, dims: {}, pages: {} });
        add(kind === "xp" ? slot.dims : slot.pages, key, n);
      }
    }
    return {
      date, sessions: s, views: h.v || 0, visitors: uniques[i] || 0,
      newSessions: Math.min(newS, s), returningSessions: clamp0(s - newS),
    };
  });

  const newSessions = Math.min(visitNo["1"], sessions);
  const returningSessions = clamp0(sessions - newSessions);

  const r = [sessions, reach[2], reach[3], reach[4], reach[5]];
  const depth = [
    { label: "1 página", count: clamp0(r[0] - r[1]) },
    { label: "2 páginas", count: clamp0(r[1] - r[2]) },
    { label: "3 páginas", count: clamp0(r[2] - r[3]) },
    { label: "4 páginas", count: clamp0(r[3] - r[4]) },
    { label: "5 ou mais", count: clamp0(r[4]) },
  ];

  const d = DURATION_STEPS.map((s) => dur[s] || 0);
  const duration = [
    { label: "Menos de 10 s", count: clamp0(sessions - d[0]) },
    { label: "10 a 30 s", count: clamp0(d[0] - d[1]) },
    { label: "30 s a 1 min", count: clamp0(d[1] - d[2]) },
    { label: "1 a 3 min", count: clamp0(d[2] - d[3]) },
    { label: "3 a 10 min", count: clamp0(d[3] - d[4]) },
    { label: "Mais de 10 min", count: clamp0(d[4]) },
  ];

  const events = EVENT_NAMES.map((name) => {
    const slot = ev[name] || { count: 0, dims: {}, pages: {} };
    return {
      name,
      count: slot.count,
      dims: top(slot.dims, full ? 500 : 6).map(({ key, count }) => ({
        key, count, label: name === "related_article_click" ? pathTitle(`/blog/${key}`, titleBySlug) : key,
      })),
      pages: top(slot.pages, full ? 500 : 5).map(({ key, count }) => ({ path: key, title: pathTitle(key, titleBySlug), count })),
    };
  });
  const count = (name) => events.find((e) => e.name === name)?.count || 0;
  const rate = (a, b) => (b ? Math.min(100, Math.round((a / b) * 100)) : null);

  return {
    range,
    series,
    totals: {
      sessions,
      views,
      visitors: series.reduce((a, p) => a + p.visitors, 0),
      newSessions,
      returningSessions,
      returningRate: sessions ? Math.round((returningSessions / sessions) * 100) : null,
      pagesPerSession: sessions ? Math.round((views / sessions) * 10) / 10 : null,
      avgSeconds: sessions && seconds ? Math.round(seconds / sessions) : null,
      coverage: anonSessions ? Math.min(100, Math.round((sessions / anonSessions) * 100)) : null,
      actions: events.reduce((a, e) => a + e.count, 0),
    },
    visitNumber: [
      { label: "1ª visita", count: visitNo["1"] },
      { label: "2ª visita", count: visitNo["2"] },
      { label: "3ª a 5ª", count: visitNo["3-5"] },
      { label: "6ª ou mais", count: visitNo["6+"] },
    ],
    depth,
    duration,
    events,
    funnels: {
      newsletter: { start: count("newsletter_signup_start"), done: count("newsletter_signup_success"), rate: rate(count("newsletter_signup_success"), count("newsletter_signup_start")) },
    },
  };
}

/** Lê os últimos `range` dias (3 comandos por dia). */
export async function readVisitorStats(range, { titleBySlug = {}, full = false } = {}) {
  const days = lastDays(range);
  const cmds = [];
  for (const d of days) cmds.push(["HGETALL", `cv:d:${d}`], ["PFCOUNT", `cv:u:${d}`], ["HGET", `pv:d:${d}`, "s"]);
  const res = await pipeline(cmds);
  const dayData = [], uniques = [], totalSessions = [];
  for (let i = 0; i < days.length; i += 1) {
    dayData.push(flatToNumbers(res[i * 3]));
    uniques.push(Number(res[i * 3 + 1]) || 0);
    totalSessions.push(Number(res[i * 3 + 2]) || 0);
  }
  return aggregateVisitors({ days, dayData, uniques, totalSessions, titleBySlug, range, full });
}
