#!/usr/bin/env node
/**
 * generate-article.js
 * Gera artigos com frontmatter completo + fallback:
 *   Groq (gpt-oss-120b → llama-3.3-70b-versatile) → OpenRouter → Gemini
 *
 * A lógica de geração (prompt, providers, validação de qualidade) vive em
 * lib/article-generator.js e é compartilhada com app/api/admin/quality/route.js
 * (que usa o mesmo núcleo, mas persiste via GitHub API em vez de fs, porque
 * roda dentro de uma function serverless da Vercel).
 *
 * Este script é o "modo CLI": roda em VPS/local/GitHub Actions e grava
 * artigos na fila editorial; a publicação em posts/ exige aprovação no admin.
 *
 *  - Título sempre em Title Case (siglas tipo ANVISA preservadas)
 *  - Excerpt nunca corta no meio da palavra/frase
 *  - Não repete tópicos recentes nem gera conteúdo quase-idêntico a posts existentes
 *  - Valida qualidade (tamanho, frases genéricas, similaridade) e tenta de novo se reprovar
 *  - Loga cada geração em .quality-log.json (lido pelo painel admin)
 *  - Suporta --force-file <nome.md> para gerar uma atualização em revisão,
 *    sem substituir o artigo publicado antes da aprovação
 */

require("dotenv").config({ path: ".env.local", override: false });

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const qe = require("../lib/quality-engine.js");
const ag = require("../lib/article-generator.js");
const { clusterNews, deriveClusterTopic } = require("../lib/news-clustering.js");

// ─────────────────────────────────────────────
// SAFE CONFIG LOADER (mantido do original)
// ─────────────────────────────────────────────
let siteConfigRaw = require("../site.config.js");
const siteConfig = siteConfigRaw?.default || siteConfigRaw || {};
const generation = siteConfig?.generation || {};

const CATEGORIES = generation.categories || [
  "Entenda a bula",
  "Uso seguro",
  "Efeitos e reações",
  "Interações",
  "Grupos especiais",
  "Formas e apresentações",
  "Genéricos e similares",
  "Armazenamento e descarte",
  "Alertas da Anvisa",
  "Saúde e prevenção",
];

// ─── CLI ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

const topicArg = args.includes("--topic")
  ? args[args.indexOf("--topic") + 1]
  : null;
const categoryArg = args.includes("--category")
  ? args[args.indexOf("--category") + 1]
  : null;

const countArg = args.includes("--count")
  ? parseInt(args[args.indexOf("--count") + 1], 10)
  : (generation.articlesPerRun || 1);

// regenera o conteúdo de um post já publicado, mantendo filename/data/categoria
const forceFileArg = args.includes("--force-file")
  ? args[args.indexOf("--force-file") + 1]
  : null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Paths ────────────────────────────────────────────────────────────
const postsDir = path.resolve(__dirname, "../posts");
const editorialDraftsPath = path.resolve(__dirname, "../.editorial-drafts.json");
const usedTopicsLogPath = path.resolve(__dirname, "../.used-topics.json");
const signaturesLogPath = path.resolve(__dirname, "../.content-signatures.json");
const qualityLogPath = path.resolve(__dirname, "../.quality-log.json");
const pendingNewsPath = path.resolve(__dirname, "../.pending-news-topics.json");
const usedNewsLinksPath = path.resolve(__dirname, "../.used-news-links.json");

// ─── Helpers ──────────────────────────────────────────────────────────
function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function saveJson(filePath, data, keepLast = 400) {
  const arr = Array.isArray(data) ? data.slice(-keepLast) : data;
  fs.writeFileSync(filePath, JSON.stringify(arr, null, 2), "utf8");
}

function getExistingSlugs() {
  if (!fs.existsSync(postsDir)) return new Set();
  return new Set(
    fs.readdirSync(postsDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => qe.slugFromFileName(f))
  );
}

function appendQualityLog(entry) {
  const log = loadJson(qualityLogPath, []);
  log.push({ timestamp: new Date().toISOString(), ...entry });
  saveJson(qualityLogPath, log);
}

function saveSignature(slug, words) {
  const signatures = loadJson(signaturesLogPath, []);
  signatures.push({ slug, words });
  saveJson(signaturesLogPath, signatures);
}

function getExistingSignatures() {
  return loadJson(signaturesLogPath, []);
}

function saveEditorialDraft(article, result, topic) {
  const drafts = loadJson(editorialDraftsPath, []);
  const sourceUrls = [...new Set((result.verifiedSources || []).map((source) => source.url))];
  const existingIndex = drafts.findIndex((draft) => draft.file === article.file);
  const previousHistory = existingIndex >= 0 ? drafts[existingIndex].history || [] : [];
  const draft = {
    id: `${article.date}-${article.slug}`,
    file: article.file,
    targetFile: fs.existsSync(path.join(postsDir, article.file)) ? article.file : null,
    title: article.normalizedTitle,
    slug: article.slug,
    category: article.category,
    topic,
    content: article.content,
    sourceUrls,
    sourceCheckedAt: result.verifiedSources?.[0]?.fetchedAt || null,
    verifiedSources: (result.verifiedSources || []).map(({ url, host, fetchedAt, characterCount }) => ({
      url, host, fetchedAt, characterCount,
    })),
    validationIssues: result.issues,
    status: "NEEDS_REVIEW",
    generatedAt: new Date().toISOString(),
    history: [
      ...previousHistory,
      { status: "DRAFT_GENERATED", at: new Date().toISOString() },
      { status: "NEEDS_REVIEW", at: new Date().toISOString() },
    ],
  };

  if (existingIndex >= 0) drafts[existingIndex] = draft;
  else drafts.unshift(draft);
  fs.writeFileSync(editorialDraftsPath, `${JSON.stringify(drafts.slice(0, 400), null, 2)}\n`, "utf8");
}

// ─── Tópicos ──────────────────────────────────────────────────────────
// Pool grande de propósito: com poucos seeds por categoria, o pipeline
// esgota o pool rapidamente e cai no fallback de "variação" (que só anexa
// um sufixo genérico tipo "guia atualizado" a um tópico já publicado —
// isso gera títulos quase idênticos e foi a causa dos posts duplicados
// detectados em 2026-06). Cada categoria deve ter MUITO mais seeds do que
// o número de posts que você pretende publicar nela.
const SEEDS = require("../lib/health-topics.js");

// Tenta gerar o tópico do dia a partir de uma notícia real, coletada por
// scripts/scrape-alertas-anvisa.js (fila em .pending-news-topics.json).
// Só cai pro pool estático de SEEDS se a fila estiver vazia — é isso que dá
// autenticidade: o artigo nasce de um comunicado oficial recente,
// em vez de um tema evergreen genérico.
function pickNewsTopic() {
  const pending = loadJson(pendingNewsPath, []);
  if (!pending.length) return null;

  const usedLinks = new Set(loadJson(usedNewsLinksPath, []));
  const available = pending.filter((item) => !usedLinks.has(item.link));
  if (!available.length) return null;

  // Em vez de consumir 1 notícia = 1 artigo, agrupa notícias sobre o mesmo
  // assunto (mesmo órgão, ângulos diferentes) num único cluster —
  // isso é o que permite gerar 1 artigo consolidado ("tudo que mudou nesta
  // semana") em vez de vários artigos finos e quase-redundantes competindo
  // entre si por SEO. Ver lib/news-clustering.js para o critério de agrupamento.
  const clusters = clusterNews(available);
  const best = clusters[0];
  if (!best) return null;

  const items = best.items;
  const consolidated = items.length >= 2;
  const topic = consolidated ? deriveClusterTopic(items) : items[0].title;

  // Marca como consumidas imediatamente TODAS as notícias do cluster escolhido
  // (remove da fila, registra os links como usados) — mesmo que a geração
  // falhe depois, não reprocessamos as mesmas notícias toda hora.
  const selectedLinks = new Set(items.map((i) => i.link));
  const remaining = pending.filter((p) => !selectedLinks.has(p.link));
  saveJson(pendingNewsPath, remaining);

  const allUsedLinks = new Set([...usedLinks, ...selectedLinks]);
  saveJson(usedNewsLinksPath, [...allUsedLinks].slice(-500)); // teto pra não crescer infinito

  // A categoria é escolhida por palavras-chave simples no título consolidado
  // (ou no título da notícia, se for um item isolado); cai num fallback
  // aleatório se nada bater.
  const titleLower = topic.toLowerCase();
  let category = CATEGORIES.find((c) => titleLower.includes(c.toLowerCase()));
  if (!category) {
    if (/bula|rotulagem|registro/.test(titleLower)) category = "Entenda a bula";
    else if (/interaç|combina|misturar/.test(titleLower)) category = "Interações";
    else if (/efeito|reaç|alerg/.test(titleLower)) category = "Efeitos e reações";
    else if (/gravidez|amament|criança|idoso/.test(titleLower)) category = "Grupos especiais";
    else if (/anvisa|recolhimento|alerta/.test(titleLower)) category = "Alertas da Anvisa";
    else category = "Alertas da Anvisa";
  }

  const newsFact = consolidated
    ? { title: topic, consolidated: true, items }
    : items[0];

  return { topic, category, newsFact };
}

function buildTopic() {
  if (topicArg) {
    if (categoryArg && !CATEGORIES.includes(categoryArg)) {
      throw new Error(`Categoria inválida: ${categoryArg}`);
    }
    const inferredCategory = ag.inferCategory(topicArg, SEEDS, CATEGORIES);
    if (categoryArg && inferredCategory && categoryArg !== inferredCategory) {
      throw new Error(`O tema parece pertencer a "${inferredCategory}", não a "${categoryArg}".`);
    }
    const category = categoryArg || inferredCategory;
    if (!category || !CATEGORIES.includes(category)) {
      throw new Error("Não foi possível definir uma categoria com segurança. Informe --category com uma categoria válida.");
    }
    return { topic: topicArg, category };
  }
  if (categoryArg && !CATEGORIES.includes(categoryArg)) {
    throw new Error(`Categoria inválida: ${categoryArg}`);
  }

  const newsTopic = categoryArg ? null : pickNewsTopic();
  if (newsTopic) return newsTopic;

  const usedTopics = loadJson(usedTopicsLogPath, []);
  const existingSlugs = getExistingSlugs();

  // 1ª passada: tenta achar um tópico inédito, sorteando a categoria.
  // 15 tentativas é suficiente quando ALGUMA categoria ainda tem seed livre.
  const MAX_ATTEMPTS = 15;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const category = categoryArg || ag.randomItem(CATEGORIES);
    const pool = SEEDS[category] || [];
    if (pool.length === 0) continue;

    const available = pool.filter((t) => !usedTopics.includes(t) && !existingSlugs.has(ag.slugify(t)));
    if (available.length === 0) continue;

    const topic = ag.randomItem(available);
    return { topic, category };
  }

  // 2ª passada (defensiva): a 1ª pode falhar por mau sorteio mesmo com seeds
  // livres em outra categoria. Varre TODAS as categorias de forma determinística
  // antes de aceitar que o pool real esgotou.
  for (const category of categoryArg ? [categoryArg] : CATEGORIES) {
    const pool = SEEDS[category] || [];
    const available = pool.filter((t) => !usedTopics.includes(t) && !existingSlugs.has(ag.slugify(t)));
    if (available.length > 0) {
      return { topic: ag.randomItem(available), category };
    }
  }

  // Pool de seeds genuinamente esgotado em TODAS as categorias.
  // Isso não deve gerar um clone disfarçado de tópico antigo (era o bug que
  // produzia títulos como "...guia atualizado", "...dicas práticas" repetidos).
  // Em vez disso, sinaliza claramente que o pool precisa de novos seeds —
  // a pessoa responsável vê isso no console/log e adiciona temas novos em SEEDS.
  console.warn(
    "\n⚠️  POOL DE SEEDS ESGOTADO em todas as categorias — todos os tópicos cadastrados já foram usados.\n" +
    "   Isso é esperado de tempos em tempos; a ação correta é adicionar novos tópicos\n" +
    "   em scripts/generate-article.js (objeto SEEDS), não gerar variações automáticas\n" +
    "   do mesmo tópico (isso foi removido por causar posts quase-duplicados).\n"
  );

  const category = categoryArg || ag.randomItem(CATEGORIES);
  const pool = SEEDS[category] || [`dicas sobre ${category}`];
  const topic = ag.randomItem(pool);
  // marcado explicitamente para aparecer no painel de qualidade como "pool esgotado",
  // já que o tópico abaixo é necessariamente uma repetição de algo já publicado
  return { topic, category, seedPoolExhausted: true };
}

// ─── Save ─────────────────────────────────────────────────────────────
async function saveArticle(result, topic, category, forceFile, seedPoolExhausted = false) {
  if (!fs.existsSync(postsDir)) fs.mkdirSync(postsDir, { recursive: true });

  let existingFrontmatter;
  if (forceFile) {
    const oldRaw = fs.readFileSync(path.join(postsDir, forceFile), "utf8");
    const frontmatterEnd = oldRaw.indexOf("\n---", 3);
    const oldData = frontmatterEnd >= 0 ? yaml.load(oldRaw.slice(3, frontmatterEnd)) : {};

    existingFrontmatter = {
      date: oldData?.date,
      category: oldData?.category,
      curiosity: oldData?.curiosity,
      takeaways: Array.isArray(oldData?.takeaways) ? oldData.takeaways : [],
    };
  }

  // Curiosidade pro card "💡 Curiosidade" — gerada 1x aqui, junto com o
  // artigo, e nunca em runtime. Se falhar, buildArticleFile cai de volta
  // pra curiosidade anterior (regeneração) ou simplesmente omite o campo.
  const curiosity = await ag.generateCuriosity(result.body);

  // "Spoiler" do artigo (o que o leitor vai encontrar/aprender) — mesma
  // filosofia: gerado 1x aqui, com fallback pros tópicos anteriores em
  // caso de falha na regeneração.
  const takeaways = await ag.generateTakeaways(result.body);

  const article = ag.buildArticleFile({
    title: result.title,
    body: result.body,
    topic,
    category,
    forceFile,
    existingFrontmatter,
    curiosity,
    takeaways,
  });

  saveEditorialDraft(article, result, topic);
  saveSignature(article.slug, result.signature);

  appendQualityLog({
    file: article.file,
    slug: article.slug,
    title: article.normalizedTitle,
    category: article.category,
    provider: result.provider,
    wordCount: result.wordCount,
    fillerCount: result.fillerCount,
    similarity: Math.round(result.maxSim * 100),
    similarTo: result.mostSimilarSlug,
    status: "NEEDS_REVIEW",
    issues: seedPoolExhausted
      ? [...result.issues, "pool de seeds esgotado — tópico reaproveitado; adicione novos seeds em SEEDS"]
      : result.issues,
  });

  return article.file;
}

// ─── MAIN ─────────────────────────────────────────────────────────────
async function main() {
  console.log("🔑 CONFIG SAFE MODE");
  console.log("Categories:", CATEGORIES.length);

  // modo regeneração de post existente
  if (forceFileArg) {
    if (!topicArg) {
      console.error("❌ --force-file precisa ser usado junto com --topic");
      process.exit(1);
    }
    const filePath = path.join(postsDir, forceFileArg);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Arquivo não encontrado: ${forceFileArg}`);
      process.exit(1);
    }

    console.log(`\n🔁 Regenerando conteúdo de: ${forceFileArg}\n`);
    const raw = fs.readFileSync(filePath, "utf8");
    const frontmatterEnd = raw.indexOf("\n---", 3);
    const existingData = frontmatterEnd >= 0 ? yaml.load(raw.slice(3, frontmatterEnd)) : {};
    const category = existingData?.category;
    if (!CATEGORIES.includes(category)) {
      console.error(`❌ Categoria do artigo inválida ou não configurada: ${category || "(vazia)"}`);
      process.exit(1);
    }

    try {
      const result = await ag.generateValidatedArticle({
        topic: topicArg,
        category,
        generation,
        existingSignatures: getExistingSignatures(),
      });
      const file = await saveArticle(result, topicArg, category, forceFileArg, false);
      console.log(`💾 Atualizado: ${file} (${result.wordCount} palavras, via ${result.provider})`);
    } catch (err) {
      console.error(`❌ Erro ao regenerar: ${err.message}`);
      appendQualityLog({
        file: forceFileArg,
        topic: topicArg,
        status: err.code === "VALIDATION_FAILED" ? "VALIDATION_FAILED" : "erro",
        issues: err.issues || [],
        error: err.message,
      });
      process.exit(1);
    }
    return;
  }

  const count = countArg || 1;

  for (let i = 0; i < count; i++) {
    const { topic, category, seedPoolExhausted, newsFact } = buildTopic();
    const newsLabel = newsFact
      ? newsFact.consolidated
        ? `  📰 (consolidado de ${newsFact.items.length} notícias)`
        : "  📰 (baseado em notícia real)"
      : "";
    console.log(`\n📝 ${i + 1}/${count}: ${topic}${newsLabel}`);

    try {
      const result = await ag.generateValidatedArticle({
        topic,
        category,
        generation,
        existingSignatures: getExistingSignatures(),
        newsFact,
      });
      const file = await saveArticle(result, topic, category, null, seedPoolExhausted);

      const used = loadJson(usedTopicsLogPath, []);
      used.push(topic);
      saveJson(usedTopicsLogPath, used, 300);

      console.log(`📝 Enviado para revisão editorial: ${file} (${result.wordCount} palavras, via ${result.provider})`);
    } catch (err) {
      console.error(`❌ Erro: ${err.message}`);
      appendQualityLog({
        topic,
        category,
        status: err.code === "VALIDATION_FAILED" ? "VALIDATION_FAILED" : "erro",
        issues: err.issues || [],
        error: err.message,
      });
    }

    if (i < count - 1) await sleep(2000);
  }
}

main().catch((err) => {
  console.error("ERRO FATAL:", err.message);
  process.exit(1);
});
