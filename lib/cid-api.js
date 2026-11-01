const API_BASE_URL = "https://southamerica-east1-no-api-br.cloudfunctions.net/apiCid/v1";
const CODE_PATTERNS = {
  "10": /^[A-Z][0-9][A-Z0-9](?:\.?[A-Z0-9]{1,4})?$/,
  "11": /^[1-9][A-Z][A-Z0-9]{2,5}(?:\.[A-Z0-9]{1,4})?$/,
};

export class CidLookupError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = "CidLookupError";
    this.code = code;
    this.status = status;
  }
}

export function validateCidCode(version, value) {
  if (version !== "10" && version !== "11") {
    throw new CidLookupError("INVALID_VERSION", "Escolha CID-10 ou CID-11.", 400);
  }
  if (typeof value !== "string") {
    throw new CidLookupError("INVALID_CODE", "Digite um código CID.", 400);
  }

  const code = value.trim().toUpperCase();
  if (code.length > 12 || !CODE_PATTERNS[version].test(code)) {
    throw new CidLookupError(
      "INVALID_CODE",
      `Digite um código CID-${version} válido, com ou sem ponto.`,
      400
    );
  }
  return code;
}

export async function lookupCid(version, value, {
  apiKey = process.env.CID_API_KEY,
  fetchImpl = fetch,
  timeoutMs = 8000,
} = {}) {
  const code = validateCidCode(version, value);
  if (!apiKey?.trim()) {
    throw new CidLookupError(
      "NOT_CONFIGURED",
      "A consulta CID ainda não está configurada no servidor.",
      503
    );
  }

  const url = new URL(`${API_BASE_URL}/cid${version}/${encodeURIComponent(code)}`);
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { "X-API-Key": apiKey.trim() },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new CidLookupError("TIMEOUT", "A consulta demorou demais. Tente novamente.", 504);
    }
    throw new CidLookupError("UNAVAILABLE", "Não foi possível consultar a API de CID agora.", 502);
  }

  if (!response.ok) {
    if (response.status === 400) {
      throw new CidLookupError("INVALID_CODE", "O código informado não é válido para esta versão.", 400);
    }
    if (response.status === 401) {
      throw new CidLookupError(
        "UPSTREAM_AUTH",
        "A consulta CID está temporariamente indisponível. Verifique a chave configurada no servidor.",
        503
      );
    }
    if (response.status === 403) {
      throw new CidLookupError("UPSTREAM_TIER", "O plano da API não permite esta consulta.", 503);
    }
    if (response.status === 404) {
      throw new CidLookupError("NOT_FOUND", `O código CID-${version} não foi encontrado na base vigente.`, 404);
    }
    if (response.status === 429) {
      throw new CidLookupError("UPSTREAM_LIMIT", "O limite mensal de consultas CID foi atingido.", 429);
    }
    throw new CidLookupError("UPSTREAM_ERROR", "Não foi possível consultar a API de CID agora.", 502);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new CidLookupError("INVALID_RESPONSE", "A API de CID retornou uma resposta inválida.", 502);
  }
  if (!data || typeof data !== "object" || Array.isArray(data) || typeof data.codigo !== "string" || typeof data.descricao !== "string") {
    throw new CidLookupError("INVALID_RESPONSE", "A API de CID retornou uma resposta inválida.", 502);
  }

  return {
    detalhe: normalizeCidDetail(data),
    rateLimitLimit: parseRateLimit(response.headers.get("X-RateLimit-Limit")),
    rateLimitRemaining: parseRateLimit(response.headers.get("X-RateLimit-Remaining")),
  };
}

function normalizeCidDetail(data) {
  const fields = [
    "codigo",
    "descricao",
    "capitulo",
    "capituloDesc",
    "grupo",
    "grupoDesc",
    "categoria",
    "categoriaDesc",
    "bloco",
    "blocoDesc",
    "tipo",
    "referenciaDados",
  ];
  return Object.fromEntries(fields.map((field) => [
    field,
    typeof data[field] === "string" && data[field].trim() ? data[field].trim() : null,
  ]));
}

function parseRateLimit(value) {
  if (value === null || !/^\d+$/.test(value)) return null;
  return Number(value);
}
