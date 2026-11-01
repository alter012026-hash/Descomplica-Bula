#!/usr/bin/env node
/**
 * scrape-alertas-anvisa.js
 *
 * Roda ANTES do generate-article.js no workflow diário. Busca notícias reais
 * e oficiais sobre medicamentos (via lib/news-scraper.js) e monta uma fila em
 * .pending-news-topics.json, que o generate-article.js consome com prioridade
 * sobre o pool estático de SEEDS — isso é o que dá autenticidade aos artigos:
 * em vez de "dicas para prova de português", o artigo nasce de um fato real
 * ("Anvisa publicou um alerta ou recolhimento sobre um medicamento").
 *
 * .used-news-links.json guarda permanentemente os links já usados, pra nunca
 * gerar dois artigos sobre a mesma notícia mesmo em execuções futuras.
 */

const fs = require("fs");
const path = require("path");
const { fetchAllHealthNews, isMedicationNews } = require("../lib/news-scraper.js");
const { fetchArticleText } = require("../lib/article-extractor.js");

const pendingPath = path.resolve(__dirname, "../.pending-news-topics.json");
const usedLinksPath = path.resolve(__dirname, "../.used-news-links.json");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Teto de matérias com busca de texto completo por execução do cron — cada
// fetch é uma requisição de página inteira (não um RSS leve), então isso
// evita que o workflow diário fique lento demais ou pareça scraping em
// massa. As notícias que não entram no teto ainda viram artigo normalmente,
// só que a partir do snippet (comportamento antigo), não do texto completo.
const MAX_FULLTEXT_FETCHES = 15;

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

async function main() {
  const usedLinks = new Set(loadJson(usedLinksPath, []));
  const pending = loadJson(pendingPath, []);
  const pendingLinks = new Set(pending.map((p) => p.link));

  console.log("Buscando alertas recentes em fontes oficiais de saúde...");
  const news = await fetchAllHealthNews({ maxAgeHours: 72 });
  console.log(`   ${news.length} publicações encontradas após validação de domínio.`);

  let added = 0;
  let fullTextFetches = 0;
  for (const item of news) {
    if (usedLinks.has(item.link) || pendingLinks.has(item.link) || !isMedicationNews(item)) continue;

    let fullText = "";
    if (fullTextFetches < MAX_FULLTEXT_FETCHES) {
      fullTextFetches++;
      fullText = await fetchArticleText(item.link);
      // intervalo entre downloads de página completa — mais educado com os
      // veículos de origem do que disparar tudo em paralelo, e reduz a
      // chance de bloqueio temporário (mesmo racional do sleep entre
      // queries do RSS em lib/news-scraper.js)
      await sleep(1500 + Math.floor(Math.random() * 1000));
    }

    pending.push({
      title: item.title,
      link: item.link,
      source: item.source || "",
      pubDate: item.pubDate || "",
      snippet: item.description || "",
      fullText,
      addedAt: new Date().toISOString(),
    });
    pendingLinks.add(item.link);
    added++;
  }

  if (fullTextFetches > 0) {
    console.log(`   📄 Texto completo extraído para ${fullTextFetches} notícia(s) nova(s).`);
  }

  // Mantém a fila com um teto razoável — se acumular demais (ex.: o pipeline
  // ficou parado por dias), descarta as mais antigas em vez de crescer infinito.
  const MAX_QUEUE = 40;
  const trimmed = pending.slice(-MAX_QUEUE);

  saveJson(pendingPath, trimmed);
  console.log(`✅ ${added} alerta(s) oficial(is) adicionado(s) à fila. Fila atual: ${trimmed.length}.`);
}

main().catch((err) => {
  console.error("❌ Erro ao buscar notícias:", err.message);
  // Não derruba o workflow — se a busca falhar, o gerador usa os temas revisáveis,
  // o generate-article.js simplesmente cai de volta pro pool de SEEDS.
  process.exit(0);
});
