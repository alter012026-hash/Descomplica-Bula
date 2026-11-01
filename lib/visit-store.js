// -----------------------------------------------------------------------
// Estatísticas de visitas — armazenamento em Upstash Redis (REST).
//
// Por que Redis e não arquivo/Git? O site roda na Vercel (filesystem somente
// leitura) e não tem banco de dados. Upstash Redis tem plano gratuito, é
// instalado em 1 clique pelo Marketplace da Vercel e dispensa dependências
// novas: aqui falamos com ele por fetch (API REST).
//
// Variáveis aceitas (a integração da Vercel cria um dos dois pares):
//   KV_REST_API_URL / KV_REST_API_TOKEN
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
//
// Todas as chaves usam o prefixo "descomplica-bula:" para compartilhar uma
// base Redis com outros projetos sem misturar os dados.
//
// Chaves (uma por dia, fuso America/Sao_Paulo):
//   descomplica-bula:pv:u:YYYY-MM-DD  HyperLogLog de visitantes únicos do dia
//   descomplica-bula:pv:d:YYYY-MM-DD  UM hash com tudo do dia (1 leitura por dia no painel):
//       v, s, lv, bn, sec, sc, scn   contadores (views, sessões, saídas,
//                                    rejeições, segundos, rolagem)
//       p:/caminho   views    r:origem   views    c:canal   views
//       t:aparelho|navegador|sistema   views      g:PAÍS|UF|cidade  views
//       h:HH         views    e:/caminho entradas u:src|med|campanha views
//       ts:/caminho  segundos  tn:/caminho  nº de medições de tempo
//   descomplica-bula:pv:live sorted set (visitante -> último acesso) p/ "online agora"
//
// Privacidade: não há cookie nem armazenamento no navegador. O visitante é
// um hash de (IP + navegador + dia + segredo) que muda todo dia e não pode
// ser revertido para o IP.
// -----------------------------------------------------------------------

import crypto from "crypto";
import { hourKey, pageType } from "./visit-meta.js";

const TZ = "America/Sao_Paulo";
const REDIS_KEY_PREFIX = "descomplica-bula:";

const KEY_ARGUMENTS = {
  DEL: "all",
  EXPIRE: [1],
  GET: [1],
  HGET: [1],
  HGETALL: [1],
  HINCRBY: [1],
  HMGET: [1],
  HSET: [1],
  HSETNX: [1],
  LRANGE: [1],
  LTRIM: [1],
  PFADD: [1],
  PFCOUNT: "all",
  RPUSH: [1],
  ZADD: [1],
  ZCARD: [1],
  ZCOUNT: [1],
  ZREM: [1],
  ZREMRANGEBYSCORE: [1],
  ZREVRANGE: [1],
  SET: [1],
};

function namespaceCommands(commands) {
  return commands.map((command) => {
    if (!Array.isArray(command) || typeof command[0] !== "string") {
      throw new TypeError("Comando Redis inválido.");
    }

    const namespaced = [...command];
    const positions = KEY_ARGUMENTS[namespaced[0].toUpperCase()];
    if (!positions) throw new Error(`Comando Redis sem regra de namespace: ${namespaced[0]}`);

    const keyPositions = positions === "all"
      ? namespaced.slice(1).map((_, index) => index + 1)
      : positions;
    for (const index of keyPositions) {
      if (typeof namespaced[index] !== "string") {
        throw new TypeError(`Chave Redis inválida no comando ${namespaced[0]}.`);
      }
      namespaced[index] = `${REDIS_KEY_PREFIX}${namespaced[index]}`;
    }
    return namespaced;
  });
}

/* ───────────── configuração ───────────── */

function getConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

export function isVisitStoreConfigured() {
  return Boolean(getConfig());
}

/** Executa uma lista de comandos Redis em uma única requisição HTTP. */
export async function pipeline(commands) {
  const cfg = getConfig();
  if (!cfg) throw new Error("Armazenamento de visitas não configurado.");
  const res = await fetch(`${cfg.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(namespaceCommands(commands)),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Upstash respondeu ${res.status}`);
  const data = await res.json();
  return data.map((item) => {
    if (item && item.error) throw new Error(item.error);
    return item ? item.result : null;
  });
}

/* ───────────── datas (fuso de Brasília) ───────────── */

/** "YYYY-MM-DD" no fuso de São Paulo. */
export function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

/** Soma (ou subtrai) dias em uma string "YYYY-MM-DD" sem sofrer com fuso. */
export function addDays(key, delta) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Os últimos `count` dias terminando em `endKey`, do mais antigo ao mais novo. */
export function lastDays(count, endKey = dayKey()) {
  const out = [];
  for (let i = count - 1; i >= 0; i -= 1) out.push(addDays(endKey, -i));
  return out;
}

/* ───────────── filtros e normalização ───────────── */

const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|pingdom|uptime|monitor|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|axios|node-fetch|go-http|java\/|httpclient|okhttp|scrapy/i;

export function isBot(userAgent) {
  if (!userAgent) return true;
  return BOT_RE.test(userAgent);
}

const STATIC_PATHS = new Set([
  "/", "/blog", "/fontes-oficiais", "/aviso-de-saude",
  "/contato", "/metodologia", "/privacidade", "/sobre",
]);

/**
 * Normaliza o caminho recebido do navegador e devolve null se não for uma
 * página pública conhecida. Validar contra uma lista fechada impede que
 * alguém infle o Redis enviando caminhos aleatórios.
 *
 * @param {string} raw
 * @param {Set<string>|string[]} knownSlugs slugs dos artigos existentes
 */
export function normalizePath(raw, knownSlugs = []) {
  if (typeof raw !== "string" || raw.length > 200) return null;
  let p = raw.split("#")[0].split("?")[0].trim();
  if (!p.startsWith("/")) return null;
  p = p.replace(/\/+$/, "") || "/";
  if (STATIC_PATHS.has(p)) return p;
  const m = p.match(/^\/blog\/([a-z0-9-]+)$/);
  if (m) {
    const set = knownSlugs instanceof Set ? knownSlugs : new Set(knownSlugs);
    if (set.has(m[1])) return p;
  }
  return null;
}

/** Reduz o referrer ao domínio. Devolve "Direto" se vazio ou do próprio site. */
export function normalizeReferrer(referrer, siteHost) {
  if (!referrer || typeof referrer !== "string") return "Direto";
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
    const own = String(siteHost || "").replace(/^www\./, "").replace(/:\d+$/, "").toLowerCase();
    if (!host || host === own) return "Direto";
    if (/^(l|m|lm)\.facebook\.com$|^facebook\.com$/.test(host)) return "facebook.com";
    if (/^(t\.co|twitter\.com|x\.com)$/.test(host)) return "x.com";
    if (/^google\./.test(host) || /\.google\./.test(host)) return "google";
    if (/^(bing|duckduckgo|yahoo|ecosia)\./.test(host)) return host.split(".")[0];
    if (/^(l\.)?instagram\.com$/.test(host)) return "instagram.com";
    return host.slice(0, 80);
  } catch {
    return "Direto";
  }
}

/** Hash diário e irreversível do visitante. */
export function visitorHash({ ip, userAgent, day }) {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || "descomplica-bula";
  return crypto
    .createHash("sha256")
    .update(`${ip}|${userAgent}|${day}|${secret}`)
    .digest("hex")
    .slice(0, 24);
}

/* ───────────── escrita ───────────── */

const RETENTION_SECONDS = 400 * 24 * 3600; // ~13 meses
const LIVE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Registra uma visualização. Todos os campos novos são opcionais, então
 * chamadas antigas (só path/referrer/visitor) continuam válidas.
 */
export async function recordVisit({
  path, referrer, visitor, now = new Date(),
  device, browser, os, country, region, city, channel, entry = false, utm,
}) {
  const day = dayKey(now);
  const hash = `pv:d:${day}`;
  const uniq = `pv:u:${day}`;
  const ts = now.getTime();
  const tech = `${device || "Desktop"}|${browser || "Outro"}|${os || "Outro"}`;
  const geo = `${country || "??"}|${region || ""}|${city || ""}`;

  const commands = [
    ["HINCRBY", hash, "v", 1],
    ["PFADD", uniq, visitor],
    ["HINCRBY", hash, `p:${path}`, 1],
    ["HINCRBY", hash, `r:${referrer || "Direto"}`, 1],
    ["HINCRBY", hash, `c:${channel || "Direto"}`, 1],
    ["HINCRBY", hash, `t:${tech}`, 1],
    ["HINCRBY", hash, `g:${geo}`, 1],
    ["HINCRBY", hash, `h:${hourKey(now)}`, 1],
    ["ZADD", "pv:live", ts, visitor],
    ["ZREMRANGEBYSCORE", "pv:live", 0, ts - LIVE_WINDOW_MS],
  ];
  if (entry) {
    commands.push(["HINCRBY", hash, "s", 1]);
    commands.push(["HINCRBY", hash, `e:${path}`, 1]);
    const u = utm || {};
    if (u.source || u.medium || u.campaign) {
      commands.push(["HINCRBY", hash, `u:${u.source || "-"}|${u.medium || "-"}|${u.campaign || "-"}`, 1]);
    }
  }
  const results = await pipeline(commands);

  // Primeira visita do dia: define a validade das chaves (limpeza automática).
  if (Number(results[0]) === 1) {
    await pipeline([["EXPIRE", hash, RETENTION_SECONDS], ["EXPIRE", uniq, RETENTION_SECONDS]]);
  }
}

/** Registra tempo na página, rolagem e rejeição (enviados ao sair da página). */
export async function recordEngagement({ path, seconds, scroll, first = false, bounce = false, now = new Date() }) {
  const hash = `pv:d:${dayKey(now)}`;
  const sec = Math.max(0, Math.min(1800, Math.round(Number(seconds) || 0)));
  const pct = Math.max(0, Math.min(100, Math.round(Number(scroll) || 0)));
  const commands = [];
  if (sec > 0) {
    commands.push(["HINCRBY", hash, "sec", sec]);
    commands.push(["HINCRBY", hash, `ts:${path}`, sec]);
    commands.push(["HINCRBY", hash, `tn:${path}`, 1]);
  }
  if (first) {
    commands.push(["HINCRBY", hash, "lv", 1]);
    if (bounce) commands.push(["HINCRBY", hash, "bn", 1]);
  }
  commands.push(["HINCRBY", hash, "sc", pct], ["HINCRBY", hash, "scn", 1]);
  await pipeline(commands);
}

/* ───────────── leitura ───────────── */

function hashToObject(flat) {
  const obj = {};
  if (!Array.isArray(flat)) return obj;
  for (let i = 0; i < flat.length; i += 2) obj[flat[i]] = Number(flat[i + 1]) || 0;
  return obj;
}

function top(map, limit) {
  return Object.entries(map)
    .map(([key, views]) => ({ key, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);
}

function add(map, key, n) {
  map[key] = (map[key] || 0) + n;
}

/** Visitantes online nos últimos 5 minutos. */
export async function readLive(now = Date.now()) {
  const [count] = await pipeline([["ZCOUNT", "pv:live", now - LIVE_WINDOW_MS, "+inf"]]);
  return Number(count) || 0;
}

/**
 * Função pura: transforma os hashes diários em tudo que o painel mostra.
 * @param {{days:string[], dayData:object[], uniques:number[], prev?:{views:number,sessions:number}|null,
 *          live?:number, titleBySlug?:object, range:number}} input
 */
export function aggregateStats({ days, dayData, uniques, prev = null, live = 0, titleBySlug = {}, range, full = false }) {
  // full=true (exportação): sem corte de "top N", para o relatório trazer todas as páginas, origens etc.
  const L = full
    ? { types: 50, pages: 5000, landing: 5000, referrers: 1000, channels: 50, devices: 20, browsers: 100, systems: 100, countries: 300, cities: 2000, campaigns: 1000 }
    : { types: 8, pages: 15, landing: 8, referrers: 10, channels: 8, devices: 4, browsers: 7, systems: 7, countries: 10, cities: 10, campaigns: 8 };
  const pages = {}, refs = {}, channels = {}, devices = {}, browsers = {}, systems = {};
  const countries = {}, regions = {}, cities = {}, hours = Array(24).fill(0);
  const entries = {}, utms = {}, types = {}, pageSecs = {}, pageTimed = {};
  let sessions = 0, leaves = 0, bounces = 0, seconds = 0, scroll = 0, scrollN = 0;

  const series = days.map((date, i) => {
    const h = dayData[i] || {};
    sessions += h.s || 0; leaves += h.lv || 0; bounces += h.bn || 0;
    seconds += h.sec || 0; scroll += h.sc || 0; scrollN += h.scn || 0;
    for (const [field, n] of Object.entries(h)) {
      const sep = field.indexOf(":");
      if (sep < 0) continue;
      const kind = field.slice(0, sep);
      const rest = field.slice(sep + 1);
      if (kind === "p") { add(pages, rest, n); add(types, pageTypeOf(rest), n); }
      else if (kind === "r") add(refs, rest, n);
      else if (kind === "c") add(channels, rest, n);
      else if (kind === "t") {
        const [d, b, o] = rest.split("|");
        add(devices, d || "Desktop", n); add(browsers, b || "Outro", n); add(systems, o || "Outro", n);
      } else if (kind === "g") {
        const [c, r, city] = rest.split("|");
        add(countries, c || "??", n);
        if (c === "BR" && r) add(regions, r, n);
        if (city) add(cities, `${city}|${c || "??"}|${r || ""}`, n);
      } else if (kind === "h") hours[Number(rest)] = (hours[Number(rest)] || 0) + n;
      else if (kind === "e") add(entries, rest, n);
      else if (kind === "u") add(utms, rest, n);
      else if (kind === "ts") add(pageSecs, rest, n);
      else if (kind === "tn") add(pageTimed, rest, n);
    }
    return { date, views: h.v || 0, visitors: uniques[i] || 0, sessions: h.s || 0 };
  });

  const totalViews = series.reduce((a, d) => a + d.views, 0);
  const totalVisitors = series.reduce((a, d) => a + d.visitors, 0);
  const today = series[series.length - 1] || { views: 0, visitors: 0, sessions: 0 };
  const yesterday = series[series.length - 2] || { views: 0, visitors: 0, sessions: 0 };

  return {
    range,
    series,
    totals: {
      views: totalViews,
      visitors: totalVisitors,
      sessions,
      avgPerDay: Math.round((totalViews / Math.max(series.length, 1)) * 10) / 10,
      pagesPerSession: sessions ? Math.round((totalViews / sessions) * 10) / 10 : null,
      avgSeconds: sessions && seconds ? Math.round(seconds / sessions) : null,
      bounceRate: leaves ? Math.round((bounces / leaves) * 100) : null,
      avgScroll: scrollN ? Math.round(scroll / scrollN) : null,
      previousViews: prev ? prev.views : null,
      previousSessions: prev ? prev.sessions : null,
      today,
      yesterday,
    },
    live,
    hours,
    types: top(types, L.types).map(({ key, views }) => ({ label: key, views })),
    pages: top(pages, L.pages).map(({ key, views }) => {
      const slug = key.startsWith("/blog/") ? key.slice(6) : null;
      return {
        path: key,
        title: slug ? titleBySlug[slug] || slug : key === "/" ? "Página inicial" : key,
        views,
        entries: entries[key] || 0,
        avgSeconds: pageTimed[key] ? Math.round((pageSecs[key] || 0) / pageTimed[key]) : null,
      };
    }),
    landing: top(entries, L.landing).map(({ key, views }) => {
      const slug = key.startsWith("/blog/") ? key.slice(6) : null;
      return { path: key, title: slug ? titleBySlug[slug] || slug : key === "/" ? "Página inicial" : key, views };
    }),
    referrers: top(refs, L.referrers).map(({ key, views }) => ({ source: key, views })),
    channels: top(channels, L.channels).map(({ key, views }) => ({ label: key, views })),
    devices: top(devices, L.devices).map(({ key, views }) => ({ label: key, views })),
    browsers: top(browsers, L.browsers).map(({ key, views }) => ({ label: key, views })),
    systems: top(systems, L.systems).map(({ key, views }) => ({ label: key, views })),
    countries: top(countries, L.countries).map(({ key, views }) => ({ code: key, views })),
    regions: Object.entries(regions).map(([code, views]) => ({ code, views })),
    cities: top(cities, L.cities).map(({ key, views }) => {
      const [city, country, region] = key.split("|");
      return { city, country, region, views };
    }),
    campaigns: top(utms, L.campaigns).map(({ key, views }) => {
      const [source, medium, campaign] = key.split("|");
      return { source, medium, campaign, views };
    }),
  };
}

function pageTypeOf(path) {
  return pageType(path);
}

/**
 * Lê as estatísticas dos últimos `range` dias (2 comandos por dia).
 * Também busca o período anterior (só views e sessões) para as variações.
 */
export async function readStats(range, { titleBySlug = {}, full = false } = {}) {
  const days = lastDays(range);
  const withPrevious = range <= 90;
  const prevDays = withPrevious ? lastDays(range, addDays(days[0], -1)) : [];

  const commands = [];
  for (const d of days) {
    commands.push(["HGETALL", `pv:d:${d}`]);
    commands.push(["PFCOUNT", `pv:u:${d}`]);
  }
  for (const d of prevDays) commands.push(["HMGET", `pv:d:${d}`, "v", "s"]);
  commands.push(["ZCOUNT", "pv:live", Date.now() - LIVE_WINDOW_MS, "+inf"]);

  const results = await pipeline(commands);

  const dayData = [], uniques = [];
  let cursor = 0;
  for (let i = 0; i < days.length; i += 1) {
    dayData.push(hashToObject(results[cursor]));
    uniques.push(Number(results[cursor + 1]) || 0);
    cursor += 2;
  }
  let prev = null;
  if (withPrevious) {
    prev = { views: 0, sessions: 0 };
    for (let i = 0; i < prevDays.length; i += 1) {
      const [v, s] = results[cursor + i] || [];
      prev.views += Number(v) || 0;
      prev.sessions += Number(s) || 0;
    }
    cursor += prevDays.length;
  }
  const live = Number(results[cursor]) || 0;

  return aggregateStats({ days, dayData, uniques, prev, live, titleBySlug, range, full });
}
