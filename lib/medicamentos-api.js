const API_BASE_URL = "https://medicamentos.api.br/api/v1/medicamentos";
const ANVISA_BULARIO_URL = "https://consultas.anvisa.gov.br/#/bulario/";
const MAX_RESULTS = 10;

export class MedicationSearchError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = "MedicationSearchError";
    this.code = code;
    this.status = status;
  }
}

export function validateMedicationSearchName(value) {
  if (typeof value !== "string") {
    throw new MedicationSearchError("INVALID_NAME", "Digite o nome de um medicamento.", 400);
  }
  const name = value.trim().replace(/\s+/g, " ");
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  if (name.includes("\0") || normalized.length < 2 || name.length > 100) {
    throw new MedicationSearchError(
      "INVALID_NAME",
      "Digite um nome com pelo menos 2 e no máximo 100 caracteres.",
      400
    );
  }
  return name;
}

export async function searchMedications(name, {
  apiKey = process.env.MEDICAMENTOS_API_KEY,
  fetchImpl = fetch,
  timeoutMs = 8000,
} = {}) {
  const query = validateMedicationSearchName(name);
  if (!apiKey?.trim()) {
    throw new MedicationSearchError(
      "NOT_CONFIGURED",
      "A busca de medicamentos ainda não está configurada.",
      503
    );
  }

  const url = new URL(API_BASE_URL);
  url.searchParams.set("nome", query);
  url.searchParams.set("porPagina", String(MAX_RESULTS));
  const signal = AbortSignal.timeout(timeoutMs);

  let response;
  try {
    response = await fetchImpl(url, {
      headers: { "X-API-Key": apiKey.trim() },
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new MedicationSearchError(
        "TIMEOUT",
        "A consulta demorou demais. Tente novamente ou acesse o Bulário da Anvisa.",
        504
      );
    }
    throw new MedicationSearchError(
      "UNAVAILABLE",
      "Não foi possível consultar o catálogo agora. Tente novamente ou acesse o Bulário da Anvisa.",
      502
    );
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new MedicationSearchError(
        "UPSTREAM_LIMIT",
        "O limite de consultas do catálogo foi atingido. Tente mais tarde ou acesse o Bulário da Anvisa.",
        429
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new MedicationSearchError(
        "UPSTREAM_AUTH",
        "A busca está temporariamente indisponível. Consulte o Bulário oficial da Anvisa.",
        503
      );
    }
    throw new MedicationSearchError(
      "UPSTREAM_ERROR",
      "Não foi possível consultar o catálogo agora. Tente novamente ou acesse o Bulário da Anvisa.",
      502
    );
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new MedicationSearchError(
      "INVALID_RESPONSE",
      "O catálogo retornou uma resposta inválida. Consulte o Bulário da Anvisa.",
      502
    );
  }
  if (!data || !Array.isArray(data.resultados)) {
    throw new MedicationSearchError(
      "INVALID_RESPONSE",
      "O catálogo retornou uma resposta inválida. Consulte o Bulário da Anvisa.",
      502
    );
  }

  return {
    total: Number.isInteger(data.total) && data.total >= 0 ? data.total : data.resultados.length,
    rateLimitRemaining: parseRemaining(response.headers.get("X-RateLimit-Remaining")),
    resultados: data.resultados.slice(0, MAX_RESULTS).map(normalizeMedication),
  };
}

function normalizeMedication(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new MedicationSearchError(
      "INVALID_RESPONSE",
      "O catálogo retornou um medicamento em formato inválido. Consulte o Bulário da Anvisa.",
      502
    );
  }
  return {
    registro: normalizeField(item.registro),
    nome: normalizeField(item.nome),
    fabricante: normalizeField(item.fabricante),
    principioAtivo: normalizeField(item.principioAtivo),
    situacao: normalizeField(item.situacao),
  };
}

function normalizeField(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseRemaining(value) {
  if (value === null || !/^\d+$/.test(value)) return null;
  return Number(value);
}

export { ANVISA_BULARIO_URL };
