/**
 * lib/article-extractor.js
 *
 * Complementa lib/news-scraper.js: o RSS (Google News/GDELT) só devolve
 * manchete + um resumo curto (às vezes vazio, no caso do GDELT — ver
 * fetchGDELTNews). Isso é pouco material para o artigo sair com profundidade
 * real: o prompt em lib/article-generator.js é explicitamente instruído a
 * "não inventar" o que não estiver no resumo, então um resumo de 1 frase
 * vira um artigo genérico por construção, não por falha do modelo.
 *
 * Este módulo busca a PÁGINA ORIGINAL da notícia (o link do RSS) e extrai o
 * texto legível (parágrafos), pra alimentar o gerador com o corpo real da
 * matéria em vez de só o título+resumo. Mesma filosofia do news-scraper.js:
 * sem dependência nova (sem cheerio/jsdom/readability), regex simples é
 * suficiente pro que precisamos aqui, e falha sempre em silêncio — se a
 * extração não der certo, quem chama cai de volta pro snippet do RSS.
 */

const http = require("http");
const https = require("https");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const MAX_REDIRECTS = 5;
const MAX_BYTES = 1_500_000; // teto de download — matérias com muito HTML/JS embutido não valem a pena
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Baixa uma URL seguindo redirects, com teto de tamanho e timeout — não usa
 * lib externa de HTTP porque o projeto já resolve isso "na mão" em
 * news-scraper.js; aqui só precisa lidar com HTML em vez de XML/JSON.
 */
function httpGetHtml(url, { timeoutMs = DEFAULT_TIMEOUT_MS, redirectsLeft = MAX_REDIRECTS } = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return reject(new Error(`URL inválida: ${url}`));
    }

    const client = parsed.protocol === "http:" ? http : https;

    const req = client.get(
      url,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) return reject(new Error("Muitos redirects"));
          const nextUrl = new URL(res.headers.location, url).toString();
          return resolve(httpGetHtml(nextUrl, { timeoutMs, redirectsLeft: redirectsLeft - 1 }));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} em ${url}`));
        }
        const contentType = res.headers["content-type"] || "";
        if (contentType && !/text\/html|application\/xhtml/.test(contentType)) {
          res.resume();
          return reject(new Error(`Content-Type não é HTML: ${contentType}`));
        }

        let data = "";
        let bytes = 0;
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          bytes += Buffer.byteLength(chunk);
          if (bytes > MAX_BYTES) {
            req.destroy(new Error("Resposta grande demais"));
            return;
          }
          data += chunk;
        });
        res.on("end", () => resolve({ html: data, finalUrl: url }));
      }
    );
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error("timeout")));
  });
}

function decodeEntities(str = "") {
  return str
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&[a-z]+;/gi, " ")
    .trim();
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, " ");
}

// Blocos que nunca são corpo de matéria — removidos inteiros antes de
// procurar parágrafos, senão texto de menu/rodapé/cookie vaza pro resultado.
const BLOCK_TAGS_TO_STRIP = [
  "script", "style", "noscript", "nav", "header", "footer", "aside",
  "form", "figure", "figcaption", "iframe", "svg", "button",
];

// Parágrafos curtos que costumam ser boilerplate (cookies, newsletter,
// "compartilhe", legendas soltas) — descartados mesmo sendo <p> de verdade.
const BOILERPLATE_PATTERN =
  /cookies?|newsletter|assine|compartilhe|leia tamb[ée]m|publicidade|todos os direitos reservados|inscreva-se/i;

function extractReadableText(html, { maxChars = 6000 } = {}) {
  if (!html) return "";

  let cleaned = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const tag of BLOCK_TAGS_TO_STRIP) {
    cleaned = cleaned.replace(new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "gi"), " ");
  }

  const paragraphMatches = cleaned.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];

  const paragraphs = paragraphMatches
    .map((p) => decodeEntities(stripTags(p)).replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 40) // descarta fragmentos curtos (legendas, labels)
    .filter((p) => !BOILERPLATE_PATTERN.test(p));

  let text = paragraphs.join("\n\n").trim();
  if (text.length > maxChars) text = text.slice(0, maxChars);
  return text;
}

/**
 * Busca a página da notícia e devolve o texto legível extraído, ou string
 * vazia se qualquer etapa falhar (timeout, bloqueio, página sem <p>s
 * suficientes, redirect pra interstitial do Google News em vez do artigo
 * real etc.) — quem chama sempre trata "" como "cai pro snippet do RSS".
 */
async function fetchArticleText(url, { timeoutMs = DEFAULT_TIMEOUT_MS, maxChars = 6000, minChars = 200 } = {}) {
  if (!url) return "";
  try {
    const { html, finalUrl } = await httpGetHtml(url, { timeoutMs });

    // Se o redirect não resolveu (ainda em news.google.com), é o interstitial
    // do Google News, não a matéria — extrair dali só traria menu/JS.
    if (/news\.google\.com/.test(finalUrl)) return "";

    const text = extractReadableText(html, { maxChars });
    return text.length >= minChars ? text : "";
  } catch (err) {
    console.warn(`⚠️  Falha ao extrair texto de "${url}": ${err.message}`);
    return "";
  }
}

module.exports = { fetchArticleText, extractReadableText };
