const OFFICIAL_LEAFLET_URL = "https://consultas.anvisa.gov.br/#/bulario/";
const MAX_PDF_BYTES = 4 * 1024 * 1024;
const MIN_LEAFLET_TEXT_LENGTH = 250;

class MedicationLeafletError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MedicationLeafletError";
    this.code = code;
  }
}

async function parseUploadedLeaflet({
  medicineName,
  strength,
  pdfBuffer,
  extractPdfTextImpl = extractPdfText,
}) {
  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length < 5
    || pdfBuffer.toString("ascii", 0, 5) !== "%PDF-") {
    throw new MedicationLeafletError("INVALID_PDF", "O arquivo enviado não parece ser um PDF válido.");
  }
  if (pdfBuffer.length > MAX_PDF_BYTES) {
    throw new MedicationLeafletError("PDF_TOO_LARGE", "O PDF deve ter no máximo 4 MB.");
  }

  let extractedText;
  try {
    extractedText = await extractPdfTextImpl(pdfBuffer);
  } catch {
    throw new MedicationLeafletError("PDF_UNREADABLE", "Não foi possível ler o texto deste PDF.");
  }

  const text = normalizeLeafletText(extractedText);
  if (text.length < MIN_LEAFLET_TEXT_LENGTH) {
    throw new MedicationLeafletError("PDF_UNREADABLE", "O PDF não contém texto legível suficiente para gerar um resumo.");
  }
  if (!matchesMedicineName(medicineName, text)) {
    throw new MedicationLeafletError(
      "MEDICINE_MISMATCH",
      "O nome informado não foi encontrado no texto do PDF. Confira se enviou a bula do medicamento correto."
    );
  }
  if (!strengthMatchesLeaflet(strength, text)) {
    throw new MedicationLeafletError(
      "STRENGTH_MISMATCH",
      "A concentração informada não foi encontrada no PDF. Confira o nome e a apresentação na embalagem."
    );
  }

  return {
    medicineName: cleanText(medicineName, 120),
    strength: cleanText(strength, 60),
    uploadedAt: new Date().toISOString(),
    text: text.slice(0, 50_000),
    officialLeafletUrl: OFFICIAL_LEAFLET_URL,
  };
}

function matchesMedicineName(medicineName, leafletText) {
  const normalizedName = normalizeForMatch(medicineName);
  if (normalizedName.length < 3) return false;
  return normalizeForMatch(leafletText).includes(normalizedName);
}

function strengthMatchesLeaflet(strength, leafletText) {
  const tokens = String(strength || "").match(/\d+(?:[.,]\d+)?\s*(?:mcg|μg|ug|mg|g|ml|l|ui|iu)\b/gi) || [];
  if (tokens.length === 0) return true;

  const normalizedText = normalizeForMatch(leafletText);
  return tokens.every((token) => normalizedText.includes(normalizeForMatch(token)));
}

function normalizeLeafletText(value) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
    : "";
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
  MedicationLeafletError,
  OFFICIAL_LEAFLET_URL,
  parseUploadedLeaflet,
};
