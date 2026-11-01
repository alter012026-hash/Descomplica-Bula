/**
 * news-scraper.js
 *
 * Busca comunicados e alertas recentes sobre medicamentos em domínios oficiais,
 * priorizando Anvisa e órgãos públicos, para apoiar a pauta editorial.
 *
 * O feed agrega resultados, mas só URLs oficiais aprovadas entram na fila.
 *  - É um endpoint público, feito para consumo (RSS), sem bloqueio por robots.txt
 *    agressivo nem necessidade de headers especiais.
 *  - As consultas filtram publicações da Anvisa e sites governamentais.
 *  - Não exige API key nem custo.
 *
 * Não faz parsing de HTML de página nenhuma — só XML de RSS, com regex simples
 * (o projeto não tem xml2js/rss-parser como dependência e não vale a pena
 * adicionar uma lib só pra isso).
 *
 * GDELT (segunda fonte, complementar ao Google News):
 *  - Banco de notícias mundial gratuito, com milhares de jornais monitorados,
 *    atualização a cada ~15min e API pública (DOC 2.0) — sem API key, sem custo.
 *  - Permite filtrar por idioma (sourcelang:portuguese) e país da fonte
 *    (sourcecountry:BR) direto na query, mantendo o foco em veículos brasileiros.
 *  - Cobre veículos que o Google News às vezes demora a indexar, aumentando a
 *    chance de pegar editais/resultados assim que saem.
 *  - Resposta já vem em JSON (format=json), então não precisa de parsing de
 *    XML — só mapear os campos para o mesmo formato usado pelo Google News.
 */

const https = require("https");
const { isOfficialUrl } = require("./source-validation.js");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/rss+xml, application/xml, text/xml, */*",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(httpGet(res.headers.location));
        }
        if (res.statusCode !== 200) {
          res.resume();
          const err = new Error(`HTTP ${res.statusCode} em ${url}`);
          err.statusCode = res.statusCode;
          return reject(err);
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      }
    );
    req.on("error", reject);
    req.setTimeout(15000, () => req.destroy(new Error("timeout")));
  });
}

// O Google News RSS ocasionalmente responde 503/429 quando recebe várias
// requisições em sequência rápida (comum em CI/datacenter). Em vez de
// desistir na primeira falha, tenta de novo com backoff crescente antes de
// reportar erro — isso é o que resolve o "0 notícias encontradas" causado
// por bloqueio temporário, sem precisar trocar de fonte.
async function httpGetWithRetry(url, { retries = 3, baseDelayMs = 2000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await httpGet(url);
    } catch (err) {
      lastErr = err;
      const retryable = err.statusCode === 503 || err.statusCode === 429 || !err.statusCode;
      if (!retryable || attempt === retries) break;
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 500);
      await sleep(delay);
    }
  }
  throw lastErr;
}

function decodeEntities(str = "") {
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, "") // remove tags HTML que às vezes vêm dentro do <description>
    .trim();
}

function extractTag(xmlItem, tag) {
  const match = xmlItem.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? decodeEntities(match[1]) : "";
}

/**
 * Faz o parsing manual de um feed RSS 2.0 (formato usado pelo Google News),
 * item por item, sem precisar de parser de XML completo.
 */
function parseRssItems(xml) {
  const items = [];
  const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

  for (const raw of itemMatches) {
    const title = extractTag(raw, "title");
    const link = extractTag(raw, "link");
    const pubDate = extractTag(raw, "pubDate");
    const description = extractTag(raw, "description");
    const sourceMatch = raw.match(/<source([^>]*)>([\s\S]*?)<\/source>/i);
    const sourceUrl = sourceMatch?.[1]?.match(/\burl=["']([^"']+)["']/i)?.[1] || "";
    const source = sourceMatch ? decodeEntities(sourceMatch[2]) : "";

    if (title && link) {
      items.push({
        title,
        link: isOfficialUrl(sourceUrl) ? sourceUrl : link,
        feedLink: link,
        pubDate,
        description,
        source,
      });
    }
  }

  return items;
}

/**
 * Busca no Google News RSS por uma query específica, filtrado para BR/pt-BR.
 */
async function fetchGoogleNewsRSS(query) {
  const encoded = encodeURIComponent(query);
  const url = `https://news.google.com/rss/search?q=${encoded}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;

  try {
    const xml = await httpGetWithRetry(url);
    return parseRssItems(xml);
  } catch (err) {
    console.warn(`⚠️  Falha ao buscar notícias para "${query}": ${err.message}`);
    return [];
  }
}

// Consultas limitadas a alertas e publicações oficiais de saúde.
const NEWS_QUERIES = [
  "site:gov.br/anvisa medicamento alerta",
  "site:gov.br/anvisa recolhimento medicamento",
  "site:gov.br/anvisa bula medicamento atualização",
  "site:gov.br/saude medicamento alerta",
];

/**
 * Faz o parsing da data do GDELT (formato "20260726120000Z" ou variações
 * sem o "Z") para ISO 8601, mesmo formato usado pelo campo pubDate do RSS.
 */
function parseGdeltDate(seendate = "") {
  const m = seendate.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!m) return "";
  const [, y, mo, d, h, mi, s] = m;
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  return isNaN(date.getTime()) ? "" : date.toISOString();
}

/**
 * Busca no GDELT DOC 2.0 API por uma query específica, restrita a fontes
 * brasileiras em português (sourcelang:portuguese + sourcecountry:BR).
 */
async function fetchGDELTNews(query) {
  const fullQuery = `${query} sourcelang:portuguese sourcecountry:BR`;
  const encoded = encodeURIComponent(fullQuery);
  const url =
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encoded}` +
    `&mode=artlist&maxrecords=75&timespan=3d&sort=datedesc&format=json`;

  try {
    const raw = await httpGetWithRetry(url);
    const data = JSON.parse(raw);
    const articles = Array.isArray(data.articles) ? data.articles : [];

    return articles
      .map((a) => ({
        title: a.title || "",
        link: a.url || "",
        pubDate: parseGdeltDate(a.seendate),
        description: "",
        source: a.domain || "GDELT",
      }))
      .filter((item) => item.title && isOfficialUrl(item.link));
  } catch (err) {
    console.warn(`⚠️  Falha ao buscar notícias GDELT para "${query}": ${err.message}`);
    return [];
  }
}

const GDELT_QUERIES = [
  'site:gov.br/anvisa medicamento alerta',
  'site:gov.br/anvisa recolhimento medicamento',
  'site:gov.br/saude medicamentos',
];

function isRecent(pubDate, maxAgeHours = 72) {
  if (!pubDate) return true; // sem data, não descarta — deixa a checagem de duplicidade filtrar
  const date = new Date(pubDate);
  if (isNaN(date.getTime())) return true;
  const ageHours = (Date.now() - date.getTime()) / 36e5;
  return ageHours <= maxAgeHours;
}

const NOISE_PATTERN = /loteria|publicidade|promo[cç][aã]o comercial/i;

/**
 * Função principal: roda todas as queries, deduplica por link e por título
 * (títulos quase-idênticos entre fontes diferentes cobrindo a mesma notícia),
 * filtra ruído e notícias antigas, e devolve uma lista pronta para virar
 * tópicos de artigo.
 */
async function fetchAllHealthNews({ maxAgeHours = 72 } = {}) {
  const all = [];
  for (const query of NEWS_QUERIES) {
    const items = await fetchGoogleNewsRSS(query);
    all.push(...items);
    // intervalo maior e com variação entre queries — várias chamadas rápidas
    // em sequência (típico de CI/datacenter) é o que costuma disparar 503/429
    await sleep(2500 + Math.floor(Math.random() * 1500));
  }

  for (const query of GDELT_QUERIES) {
    const items = await fetchGDELTNews(query);
    all.push(...items);
    await sleep(2500 + Math.floor(Math.random() * 1500));
  }

  const seenLinks = new Set();
  const seenTitleKeys = new Set();
  const result = [];

  for (const item of all) {
    const identity = item.feedLink || item.link;
    if (seenLinks.has(identity) || !isOfficialUrl(item.link)) continue;
    if (NOISE_PATTERN.test(item.title)) continue;
    if (!isRecent(item.pubDate, maxAgeHours)) continue;

    // chave simplificada do título pra pegar quase-duplicatas entre fontes
    const titleKey = item.title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 8)
      .join(" ");

    if (seenTitleKeys.has(titleKey)) continue;

    seenLinks.add(identity);
    seenTitleKeys.add(titleKey);
    result.push(item);
  }

  return result;
}

module.exports = { fetchAllHealthNews, fetchGoogleNewsRSS, fetchGDELTNews };
