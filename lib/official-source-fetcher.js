const { isOfficialUrl, normalizeOfficialSources } = require("./source-validation.js");

const MAX_SOURCES = 3;
const MAX_BYTES = 1024 * 1024;
const MIN_TEXT_LENGTH = 250;
const REQUEST_TIMEOUT_MS = 8000;

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function extractReadableText(value, contentType = "") {
  let text = String(value || "");
  if (/html|xml/i.test(contentType) || /<html|<body|<article/i.test(text)) {
    text = text
      .replace(/<(script|style|noscript|svg|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ");
    text = decodeEntities(text);
  }
  return text.replace(/\s+/g, " ").trim();
}

async function readLimitedBody(response) {
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_BYTES) throw new Error("A página oficial excede o limite de leitura.");
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error("A página oficial excede o limite de leitura.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function fetchOfficialSource(value, domains, fetchImpl = fetch) {
  if (!isOfficialUrl(value, domains)) throw new Error("A fonte não pertence a um domínio oficial permitido.");

  const requestedUrl = new URL(value).toString();
  let currentUrl = new URL(value);
  for (let redirect = 0; redirect <= 3; redirect++) {
    if (!isOfficialUrl(currentUrl.toString(), domains)) {
      throw new Error("A fonte redirecionou para um domínio não permitido.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetchImpl(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: "text/html, text/plain, application/xhtml+xml, application/xml" },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirect === 3) throw new Error("A fonte oficial excedeu o limite de redirecionamentos.");
        currentUrl = new URL(location, currentUrl);
        continue;
      }
      if (!response.ok) throw new Error(`A fonte oficial respondeu HTTP ${response.status}.`);

      const contentType = response.headers.get("content-type") || "";
      if (!/text\/html|text\/plain|application\/xhtml\+xml|application\/xml/i.test(contentType)) {
        throw new Error("A fonte não disponibiliza conteúdo HTML ou texto legível.");
      }

      const text = extractReadableText(await readLimitedBody(response), contentType);
      if (text.length < MIN_TEXT_LENGTH) {
        throw new Error("Não foi possível extrair texto suficiente da página oficial para a checagem.");
      }
      return {
        url: requestedUrl,
        finalUrl: currentUrl.toString(),
        host: currentUrl.hostname,
        fetchedAt: new Date().toISOString(),
        text: text.slice(0, 5000),
        characterCount: text.length,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Não foi possível validar a fonte oficial.");
}

async function fetchOfficialSources(values, domains, fetchImpl = fetch) {
  const sources = normalizeOfficialSources(values, domains);
  if (sources.length === 0) throw new Error("Informe ao menos uma fonte oficial.");
  if (sources.length > MAX_SOURCES) throw new Error(`Informe no máximo ${MAX_SOURCES} fontes oficiais por vez.`);
  const results = await Promise.allSettled(
    sources.map((source) => fetchOfficialSource(source, domains, fetchImpl))
  );
  const verified = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
  const failures = results
    .map((result, index) => result.status === "rejected"
      ? { url: sources[index], error: result.reason.message }
      : null)
    .filter(Boolean);
  if (verified.length === 0) {
    throw new Error(`Nenhuma fonte oficial pôde ser checada: ${failures.map((item) => item.error).join("; ")}`);
  }
  return { verified, failures };
}

module.exports = {
  extractReadableText,
  fetchOfficialSource,
  fetchOfficialSources,
  MAX_SOURCES,
};
