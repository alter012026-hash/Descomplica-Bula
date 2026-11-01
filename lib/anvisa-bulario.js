const ANVISA_API_BASE = "https://consultas.anvisa.gov.br/api";
const OFFICIAL_LEAFLET_URL = "https://consultas.anvisa.gov.br/#/bulario/";
const MAX_PDF_BYTES = 12 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 6_000;

class AnvisaBularioError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AnvisaBularioError";
    this.code = code;
  }
}

async function fetchOfficialLeaflet({
  medicineName,
  strength,
  fetchImpl = fetch,
  extractPdfTextImpl = extractPdfText,
}) {
  const searchUrl = new URL(`${ANVISA_API_BASE}/consulta/bulario`);
  searchUrl.searchParams.set("page", "1");
  searchUrl.searchParams.set("count", "50");
  searchUrl.searchParams.set("filter[nomeProduto]", medicineName);

  let searchResponse;
  try {
    searchResponse = await fetchImpl(searchUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new AnvisaBularioError("ANVISA_UNAVAILABLE", "A consulta oficial da Anvisa está indisponível.");
  }

  if (!searchResponse.ok) {
    throw new AnvisaBularioError("ANVISA_UNAVAILABLE", "A consulta oficial da Anvisa está indisponível.");
  }

  let searchResult;
  try {
    searchResult = await searchResponse.json();
  } catch {
    throw new AnvisaBularioError("ANVISA_INVALID_RESPONSE", "A Anvisa retornou uma resposta inválida.");
  }

  const products = Array.isArray(searchResult?.content) ? searchResult.content : [];
  const exactMatches = products.filter((product) =>
    normalizeMedicineName(product?.nomeProduto) === normalizeMedicineName(medicineName)
  );

  if (exactMatches.length === 0) {
    throw new AnvisaBularioError("ANVISA_NOT_FOUND", "Não encontrei uma correspondência exata na consulta oficial da Anvisa.");
  }

  const candidates = exactMatches.filter((product) =>
    isValidLeafletId(product?.idBulaPacienteProtegido)
  );
  const selectedProduct = selectUniqueProduct(candidates, strength);
  if (!selectedProduct) {
    throw new AnvisaBularioError(
      candidates.length > 1 ? "ANVISA_AMBIGUOUS" : "ANVISA_LEAFLET_UNAVAILABLE",
      candidates.length > 1
        ? "Há mais de uma bula possível para esse nome. Informe o nome completo e a apresentação."
        : "Não encontrei uma bula do paciente disponível para esse produto."
    );
  }

  const leafletId = selectedProduct.idBulaPacienteProtegido;
  let leafletResponse;
  try {
    leafletResponse = await fetchImpl(
      `${ANVISA_API_BASE}/consulta/medicamentos/arquivo/bula/parecer/${encodeURIComponent(leafletId)}/?Authorization=`,
      {
        headers: { Accept: "application/pdf" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    );
  } catch {
    throw new AnvisaBularioError("ANVISA_UNAVAILABLE", "Não foi possível baixar a bula oficial da Anvisa.");
  }

  if (!leafletResponse.ok) {
    throw new AnvisaBularioError("ANVISA_UNAVAILABLE", "Não foi possível baixar a bula oficial da Anvisa.");
  }

  const pdfBuffer = await readLimitedResponse(leafletResponse);
  if (pdfBuffer.length < 5 || pdfBuffer.toString("ascii", 0, 5) !== "%PDF-") {
    throw new AnvisaBularioError("ANVISA_INVALID_PDF", "O arquivo recebido não é uma bula PDF válida.");
  }

  let leafletText;
  try {
    leafletText = await extractPdfTextImpl(pdfBuffer);
  } catch {
    throw new AnvisaBularioError("ANVISA_PDF_UNREADABLE", "Não foi possível ler o texto da bula oficial.");
  }

  const normalizedText = normalizeLeafletText(leafletText);
  if (normalizedText.length < 250) {
    throw new AnvisaBularioError("ANVISA_PDF_UNREADABLE", "A bula oficial não contém texto legível para gerar um resumo seguro.");
  }
  if (!strengthMatchesLeaflet(strength, normalizedText)) {
    throw new AnvisaBularioError("ANVISA_STRENGTH_MISMATCH", "A apresentação informada não foi confirmada na bula oficial.");
  }

  return {
    medicineName: cleanText(selectedProduct.nomeProduto, 120),
    strength: cleanText(strength, 60),
    manufacturer: cleanText(selectedProduct.razaoSocial || selectedProduct.nomeEmpresa, 160),
    registration: cleanText(selectedProduct.numeroRegistro, 60),
    accessedAt: new Date().toISOString(),
    text: normalizedText.slice(0, 50_000),
    officialLeafletUrl: OFFICIAL_LEAFLET_URL,
  };
}

function selectUniqueProduct(candidates, strength) {
  if (candidates.length === 1) return candidates[0];
  if (candidates.length < 2 || !strength) return null;

  const normalizedStrength = normalizeMedicineName(strength);
  const strengthMatches = candidates.filter((product) =>
    normalizeMedicineName(JSON.stringify(product)).includes(normalizedStrength)
  );
  return strengthMatches.length === 1 ? strengthMatches[0] : null;
}

function normalizeMedicineName(value) {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR")
    : "";
}

function normalizeLeafletText(value) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
    : "";
}

function strengthMatchesLeaflet(strength, leafletText) {
  const tokens = String(strength || "").match(/\d+(?:[.,]\d+)?\s*(?:mcg|μg|ug|mg|g|ml|l|ui|iu)\b/gi) || [];
  if (tokens.length === 0) return true;

  const normalizedText = normalizeForMatch(leafletText);
  return tokens.every((token) => normalizedText.includes(normalizeForMatch(token)));
}

function normalizeForMatch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]/g, "");
}

function cleanText(value, maxLength) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

function isValidLeafletId(value) {
  return (typeof value === "string" || typeof value === "number")
    && /^[A-Za-z0-9_-]{1,100}$/.test(String(value));
}

async function readLimitedResponse(response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_PDF_BYTES) {
    throw new AnvisaBularioError("ANVISA_PDF_TOO_LARGE", "O arquivo da bula excede o limite permitido.");
  }

  if (!response.body) {
    throw new AnvisaBularioError("ANVISA_INVALID_PDF", "A Anvisa retornou um arquivo vazio.");
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_PDF_BYTES) {
        await reader.cancel();
        throw new AnvisaBularioError("ANVISA_PDF_TOO_LARGE", "O arquivo da bula excede o limite permitido.");
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (error instanceof AnvisaBularioError) throw error;
    throw new AnvisaBularioError("ANVISA_INVALID_PDF", "Não foi possível receber o arquivo da bula.");
  }

  return Buffer.concat(chunks, totalBytes);
}

async function extractPdfText(buffer) {
  const { PDFParse } = require("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

module.exports = {
  AnvisaBularioError,
  fetchOfficialLeaflet,
  OFFICIAL_LEAFLET_URL,
};
