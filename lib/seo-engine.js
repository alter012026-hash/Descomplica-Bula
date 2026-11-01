function calculateSEOScore(article) {
  let score = 0;

  const content = article.content || "";

  // tamanho mínimo
  if (content.split(" ").length > 1200) score += 20;

  // presença de H2/H3
  if (content.includes("## ")) score += 10;
  if (content.includes("### ")) score += 10;

  // FAQ
  if (content.toLowerCase().includes("faq")) score += 15;

  // links internos
  if (content.includes("internos")) score += 10;

  // estrutura básica SEO
  if (article.title?.length > 30) score += 10;

  // keyword no título
  if (article.title?.toLowerCase().includes(article.targetKeyword?.toLowerCase()))
    score += 10;

  // penalidade por conteúdo fraco
  if (content.includes("em resumo") && content.length < 2000) score -= 20;

  return Math.max(0, Math.min(100, score));
}

function isApprovedForPublish(score) {
  return score >= 65;
}

module.exports = {
  calculateSEOScore,
  isApprovedForPublish,
};