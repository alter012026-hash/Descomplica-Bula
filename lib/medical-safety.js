function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getUrgentResponse(question, emergency) {
  const text = normalizeText(question);
  if (/suicid|me matar|tirar a propria vida|nao quero viver|me machucar/.test(text)) {
    return `Se você está em perigo imediato, ligue para o SAMU (${emergency.samu}) ou procure uma emergência. Para apoio emocional, ligue para o CVV (${emergency.cvv}). Se puder, fique perto de alguém de confiança.`;
  }
  if (/intoxic|overdose|dose excessiva|tomei demais|engoli (muitos|muito)|envenen/.test(text)) {
    return `Se há suspeita de intoxicação ou ingestão excessiva, ligue agora para o Disque-Intoxicação (${emergency.poisonCenter}). Se houver sintomas graves ou risco imediato, ligue para o SAMU (${emergency.samu}) ou procure uma emergência.`;
  }
  if (/urgencia|emergencia|falta de ar|desmai|convuls|reacao alergica grave|incha.*rosto/.test(text)) {
    return `Procure atendimento de urgência agora. Em risco imediato, ligue para o SAMU (${emergency.samu}). Para suspeita de intoxicação, ligue para o Disque-Intoxicação (${emergency.poisonCenter}).`;
  }
  return null;
}

function isDoseQuestion(question) {
  const text = normalizeText(question);
  return /\b(dose|dosagem|quantos?\s*(mg|ml|comprimidos?|gotas?)|quanto\s*(de|devo|posso)\s*(tomar|usar)|de quanto em quanto tempo|quantas vezes por dia)\b/.test(text);
}

function containsNumericDose(text) {
  return /\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|μg|ug|g|ml|mL| gotas?|comprimidos?|capsulas?|ampolas?|unidades?)\b/i.test(String(text || ""))
    || /\b(?:dose|dosagem)\s*(?:de|:)?\s*\d+/i.test(String(text || ""));
}

function getDoseResponse() {
  return "Não posso indicar doses nem horários de uso. Consulte a bula oficial do seu medicamento e confirme com um farmacêutico ou profissional de saúde que conheça o seu caso.";
}

module.exports = {
  normalizeText,
  getUrgentResponse,
  isDoseQuestion,
  containsNumericDose,
  getDoseResponse,
};
