#!/usr/bin/env node
/**
 * Gera pares candidatos a duplicidade/canibalização para revisão humana.
 * Nunca remove, mescla nem redireciona artigos automaticamente.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const qe = require("../lib/quality-engine.js");

const postsDir = path.resolve(__dirname, "../posts");
const reportPath = path.resolve(__dirname, "../.topic-overlap.json");
const STOPWORDS = new Set([
  "para", "como", "mais", "sobre", "medicamento", "medicamentos", "remedio",
  "remedios", "bula", "bulas", "saude", "guia", "atualizado", "dicas",
  "praticas", "pratica", "oficial", "oficiais", "seguro", "segura",
  "passo", "a", "ao", "aos", "de", "da", "do", "das", "dos", "e",
  "em", "com", "sem", "por", "que", "um", "uma", "no", "na",
]);
const GENERIC_ENTITIES = new Set([
  "Brasil", "Medicamento", "Medicamentos", "Bula", "Bulas", "Governo",
  "Federal", "Nacional", "Saúde", "Guia", "Oficial", "Oficiais",
]);

function normalize(text = "") {
  return text.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTopic(slug) {
  const words = normalize(slug.replace(/-/g, " "))
    .split(" ")
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
  return [...new Set(words)].sort().join(" ");
}

function tokens(text) {
  return new Set(normalize(text).split(" ").filter((word) => word.length > 2 && !STOPWORDS.has(word)));
}

function jaccard(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function entities(title) {
  const candidates = title.match(/\b[A-ZÀ-Ú][A-Za-zÀ-ÿ0-9-]{2,}\b/g) || [];
  return new Set(candidates.filter((value) => !GENERIC_ENTITIES.has(value)));
}

function makeCandidate(left, right, previousDecisions) {
  const titleSimilarity = jaccard(tokens(left.title), tokens(right.title));
  const slugSimilarity = jaccard(tokens(left.slug), tokens(right.slug));
  const bodySimilarity = jaccard(new Set(left.signature), new Set(right.signature));
  const sharedEntities = [...left.entities].filter((entity) => right.entities.has(entity));
  const sameTopic = left.topicKey.length > 0 && left.topicKey === right.topicKey;
  const score = Math.round(100 * (
    titleSimilarity * 0.35 +
    slugSimilarity * 0.25 +
    bodySimilarity * 0.25 +
    (sharedEntities.length ? 0.15 : 0)
  ));

  const reasons = [];
  if (sameTopic) reasons.push("slugs normalizados apontam para o mesmo tema");
  if (titleSimilarity >= 0.4) reasons.push(`títulos semelhantes (${Math.round(titleSimilarity * 100)}%)`);
  if (bodySimilarity >= 0.12) reasons.push(`corpos semelhantes (${Math.round(bodySimilarity * 100)}%)`);
  if (sharedEntities.length) reasons.push(`entidades em comum: ${sharedEntities.join(", ")}`);

  const qualifies = sameTopic || titleSimilarity >= 0.45 ||
    (sharedEntities.length > 0 && titleSimilarity >= 0.15 && bodySimilarity >= 0.08) ||
    score >= 32;
  if (!qualifies) return null;

  const files = [left.file, right.file].sort();
  const id = crypto.createHash("sha256").update(files.join("\0")).digest("hex").slice(0, 16);
  const previous = previousDecisions.get(id);
  return {
    id,
    score,
    reasons,
    metrics: {
      titleSimilarity: Number(titleSimilarity.toFixed(3)),
      slugSimilarity: Number(slugSimilarity.toFixed(3)),
      bodySimilarity: Number(bodySimilarity.toFixed(3)),
      sharedEntities,
    },
    decision: previous?.decision || "pending",
    reviewReason: previous?.reviewReason || "",
    reviewedAt: previous?.reviewedAt || null,
    articles: [left, right].map(({ file, title, slug, wordCount, date }) => ({
      file, title, slug, wordCount, date,
    })),
  };
}

function auditPosts(entries, previousPairs = []) {
  const previousDecisions = new Map(previousPairs.map((pair) => [pair.id, pair]));
  const candidates = [];
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const candidate = makeCandidate(entries[i], entries[j], previousDecisions);
      if (candidate) candidates.push(candidate);
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return candidates;
}

function loadEntries() {
  const files = fs.readdirSync(postsDir).filter((file) => file.endsWith(".md"));
  return files.map((file) => {
    const raw = fs.readFileSync(path.join(postsDir, file), "utf8");
    const parsed = qe.splitFrontmatterAndBody(raw);
    const slug = qe.slugFromFileName(file);
    const date = file.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || "";
    const title = parsed
      ? qe.getFrontmatterField(parsed.fm, "title") || slug
      : slug;
    const body = parsed?.body || raw;
    return {
      file,
      slug,
      title,
      date,
      wordCount: qe.countWords(body),
      topicKey: normalizeTopic(slug),
      signature: qe.getSignature(body, 400),
      entities: entities(title),
    };
  });
}

function main() {
  if (!fs.existsSync(postsDir)) throw new Error("Pasta /posts não encontrada.");
  const previous = fs.existsSync(reportPath)
    ? JSON.parse(fs.readFileSync(reportPath, "utf8"))
    : {};
  const entries = loadEntries();
  const candidates = auditPosts(entries, previous.pairs || []);
  const output = {
    generatedAt: new Date().toISOString(),
    totalPosts: entries.length,
    candidateCount: candidates.length,
    pendingCount: candidates.filter((pair) => pair.decision === "pending").length,
    dismissedCount: candidates.filter((pair) => pair.decision === "false_positive").length,
    pairs: candidates,
  };
  fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Auditoria concluída: ${candidates.length} pares candidatos em ${entries.length} artigos.`);
  console.log("Nenhum artigo foi alterado. Revise os pares no admin antes de qualquer consolidação.");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Falha na auditoria de duplicidade: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { auditPosts, normalizeTopic, tokens, jaccard };
