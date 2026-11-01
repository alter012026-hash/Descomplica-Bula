const MAX_EDITORIAL_PLAN_ITEMS = 5;

function normalizeEditorialPlan(plan, categories, topicsByCategory) {
  if (!Array.isArray(plan) || plan.length === 0) {
    throw new Error("Selecione ao menos um tema para planejar.");
  }

  const normalized = [];
  const seenTopics = new Set();
  for (const entry of plan) {
    const category = typeof entry?.category === "string" ? entry.category.trim() : "";
    if (!categories.includes(category)) {
      throw new Error(`Categoria inválida no planejamento: ${category || "(vazia)"}.`);
    }
    if (!Array.isArray(entry.topics)) {
      throw new Error(`Informe os temas da categoria "${category}".`);
    }

    for (const rawTopic of entry.topics) {
      const topic = typeof rawTopic === "string" ? rawTopic.trim() : "";
      if (!topic || !(topicsByCategory[category] || []).includes(topic)) {
        throw new Error(`Tema inválido para a categoria "${category}".`);
      }
      if (seenTopics.has(topic)) {
        throw new Error(`O tema "${topic}" foi selecionado mais de uma vez.`);
      }
      seenTopics.add(topic);
      normalized.push({ category, topic });
      if (normalized.length > MAX_EDITORIAL_PLAN_ITEMS) {
        throw new Error(`O limite é de ${MAX_EDITORIAL_PLAN_ITEMS} artigos por lote.`);
      }
    }
  }

  if (normalized.length === 0) {
    throw new Error("Selecione ao menos um tema para planejar.");
  }

  return normalized;
}

module.exports = { MAX_EDITORIAL_PLAN_ITEMS, normalizeEditorialPlan };
