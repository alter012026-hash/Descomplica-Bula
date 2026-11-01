const STOP_WORDS = new Set([
  "para", "como", "sobre", "entre", "quando", "onde", "qual", "quais", "mais",
  "muito", "muitos", "muitas", "pouco", "poucos", "poucas", "este", "esta",
  "esse", "essa", "seus", "suas", "seu", "sua", "com", "sem", "uma", "umas",
  "uns", "dos", "das", "que", "por", "nas", "nos", "pela", "pelo", "depois",
  "antes", "guia", "completo", "completa", "entenda", "saiba", "veja",
]);

function tokenize(value) {
  return new Set(
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .match(/[a-z0-9]+/g)
      ?.filter((word) => word.length > 2 && !STOP_WORDS.has(word)) || []
  );
}

function similarity(left, right) {
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const word of left) if (right.has(word)) overlap += 1;
  return overlap / (left.size + right.size - overlap);
}

function inferCategory(topic, categoryTopics, categories) {
  const topicWords = tokenize(topic);
  if (topicWords.size === 0) return null;

  const ranked = categories.map((category) => {
    const bestMatch = (categoryTopics[category] || []).reduce(
      (best, seed) => Math.max(best, similarity(topicWords, tokenize(seed))),
      0
    );
    return { category, score: bestMatch };
  }).sort((a, b) => b.score - a.score);

  if (!ranked[0] || ranked[0].score < 0.2) return null;
  if (ranked[1] && ranked[0].score - ranked[1].score < 0.08) return null;
  return ranked[0].category;
}

module.exports = { inferCategory };
