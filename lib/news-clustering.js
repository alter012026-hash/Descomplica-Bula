/**
 * lib/news-clustering.js
 *
 * Agrupa notícias oficiais relacionadas (mesmo medicamento ou alerta)
 * para que generate-article.js produza UM artigo consolidado por grupo,
 * em vez de um artigo raso por notícia isolada.
 *
 * Exemplo do problema que isso resolve:
 * Comunicados sobre o mesmo medicamento ou alerta podem ser consolidados
 * em uma pauta, evitando artigos repetitivos ou incompletos.
 *
 * Estratégia: clustering guloso por similaridade Jaccard de palavras
 * significativas do título (sem exigir dependência nova nem embeddings —
 * o vocabulário do nicho é pequeno o suficiente pra isso funcionar bem).
 */

const STOPWORDS = new Set([
  "para", "como", "mais", "sobre", "medicamento", "medicamentos", "remedio",
  "remedios", "bula", "bulas", "noticia", "noticias", "confirma", "anuncia",
  "governo", "após", "apos",
  "ainda", "pode", "podem", "deve", "devem", "vai", "vao", "com", "sem",
  "dos", "das", "que", "uma", "uns", "umas", "por", "tem", "sera", "será",
  "nova", "novo", "novas", "novos", "diz", "veja", "saiba", "entenda",
]);
const GENERIC_ENTITIES = new Set([
  "blog", "anvisa", "alerta", "alertas", "bula", "bulas", "comunicado",
  "comunicados", "medicamento", "medicamentos", "remedio", "remedios",
  "governo", "noticia", "noticias", "saude", "semana",
]);
const { getEditorialTitleIssue } = require("./article-title.cjs");

function normalize(text = "") {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
}

/**
 * Extrai as palavras significativas de um título (>3 letras, fora da
 * stoplist) como um Map palavra->peso — a "impressão digital" usada pra
 * medir similaridade. Siglas/acrônimos (ANVISA, OMS, SUS — tudo em maiúsculas
 * no título original) recebem peso maior: títulos curtos de notícia raramente
 * compartilham muitas palavras comuns, mas compartilhar a MESMA sigla de
 * órgão de saúde é um sinal forte de que duas notícias tratam do mesmo caso.
 */
function tokenize(title = "") {
  const rawWords = title.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9]*/g) || [];
  const weights = new Map();

  for (const raw of rawWords) {
    const norm = normalize(raw).trim();
    if (norm.length <= 3 || STOPWORDS.has(norm)) continue;

    const isAcronym = /^[A-ZÀ-Ú]{2,}$/.test(raw); // ex.: ANVISA, OMS, SUS
    const weight = isAcronym ? 3 : 1;
    weights.set(norm, Math.max(weights.get(norm) || 0, weight));
  }

  return weights;
}

/**
 * Jaccard ponderado: cada token pesa conforme tokenize() acima, então
 * compartilhar uma sigla de órgão pesa mais que compartilhar uma palavra
 * genérica qualquer.
 */
function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;

  let interWeight = 0;
  let unionWeight = 0;
  const keys = new Set([...a.keys(), ...b.keys()]);

  for (const key of keys) {
    const wa = a.get(key) || 0;
    const wb = b.get(key) || 0;
    interWeight += Math.min(wa, wb);
    unionWeight += Math.max(wa, wb);
  }

  return unionWeight === 0 ? 0 : interWeight / unionWeight;
}

/**
 * Clustering guloso: cada item entra no cluster existente mais parecido
 * (se acima do limiar), senão abre um cluster novo. Não é O(n²) ideal para
 * milhares de itens, mas a fila de pendentes (.pending-news-topics.json)
 * é limitada a dezenas de itens, então isso é irrelevante na prática.
 *
 * @param {Array<{title:string, link:string, source?:string, pubDate?:string, snippet?:string}>} items
 * @param {number} similarityThreshold - quão parecidos os títulos precisam ser pra entrar no mesmo cluster
 * @returns {Array<{items: Array, tokens: Set<string>}>} clusters ordenados do maior pro menor
 */
function clusterNews(items, similarityThreshold = 0.22) {
  const clusters = [];

  for (const item of items) {
    const tokens = tokenize(item.title);
    let bestCluster = null;
    let bestSim = 0;

    for (const cluster of clusters) {
      const sim = jaccard(tokens, cluster.tokens);
      if (sim > bestSim) {
        bestSim = sim;
        bestCluster = cluster;
      }
    }

    if (bestCluster && bestSim >= similarityThreshold) {
      bestCluster.items.push(item);
      for (const [token, weight] of tokens) {
        bestCluster.tokens.set(token, Math.max(bestCluster.tokens.get(token) || 0, weight));
      }
    } else {
      clusters.push({ items: [item], tokens });
    }
  }

  return clusters.sort((a, b) => b.items.length - a.items.length);
}

/**
 * Deriva um título de tópico para um cluster consolidado (2+ notícias).
 * Usa a entidade mais frequente nos títulos originais, sem inventar
 * recomendações médicas nem atribuir detalhes ausentes das fontes.
 */
const GENERIC_CAPITALIZED = new Set([
  "Governo", "Ministério", "Ministerio", "Brasil", "Nacional", "Federal",
  "Estado", "Estados", "Prefeitura", "Prefeituras", "Portal", "Secretaria",
  "Instituto", "Anvisa", "Alerta", "Medicamento", "Medicamentos", "Bula",
  "Comunicado", "Comunicados", "Saúde", "Saude", "Novo", "Nova",
]);

function deriveClusterTopic(items) {
  const freq = new Map();

  for (const item of items) {
    const words = item.title.match(/\b[A-ZÀ-Ú][\wÀ-ÿ]*\b/g) || [];
    for (const w of words) {
      if (w.length < 2 || /^[A-ZÀ-Ú]$/.test(w) || GENERIC_CAPITALIZED.has(w) || GENERIC_ENTITIES.has(normalize(w))) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }
  }

  let entity = null;
  let best = 0;
  for (const [word, count] of freq) {
    if (count > best) {
      best = count;
      entity = word;
    }
  }

  if (entity && best >= 2) {
    return `Alerta oficial sobre ${entity}: entenda o comunicado`;
  }

  const latestHeadline = items[0]?.title || "";
  if (latestHeadline && !getEditorialTitleIssue(latestHeadline)) return latestHeadline;

  return "Alertas e comunicados oficiais sobre medicamentos";
}

module.exports = { clusterNews, tokenize, jaccard, deriveClusterTopic };
