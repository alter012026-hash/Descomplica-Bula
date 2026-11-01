function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getEditorialTitleIssue(title) {
  const value = String(title || "").trim();
  if (!value) return "Informe um título para o artigo.";

  if (
    /(o que mudou (nesta|na|esta) semana|mudan[çc]as recentes|novidades da semana)/i.test(value) &&
    /o que esperar/i.test(value)
  ) {
    return "O título está genérico. Identifique o comunicado ou a dúvida sobre medicamentos que o artigo explica.";
  }

  if (/\b20\d{2}-\d{2}-\d{2}\b/.test(value)) {
    return "O título não deve conter datas no formato 2026-08-01. Descreva o assunto do artigo.";
  }

  const normalized = normalize(value).replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ");
  if (/^(informacoes sobre medicamentos|alerta de medicamento|medicamentos|bula de medicamento)$/.test(normalized)) {
    return "O título está amplo demais. Especifique a dúvida ou o alerta tratado no artigo.";
  }

  return null;
}

module.exports = { getEditorialTitleIssue };
