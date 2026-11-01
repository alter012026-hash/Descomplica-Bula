/**
 * quality-engine.js
 * Utilitários compartilhados entre scripts/generate-article.js
 * e app/api/admin/quality/route.js.
 *
 * Escrito em CommonJS (module.exports) — funciona tanto com require()
 * nos scripts Node quanto importado nas rotas do Next.js.
 */

// ─── Siglas que devem ficar 100% em caixa alta ───────────────────────────────
const ACRONYMS = [
  "ANVISA", "ANS", "OMS", "SUS", "FDA", "AINE", "BVS", "HIV", "COVID",
  "UPA", "SAMU", "RDC", "CFF", "CFM", "CEP",
];

// Palavras de ligação que ficam minúsculas no meio do título
const MINOR_WORDS = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "para", "com", "a", "o",
  "as", "os", "no", "na", "nos", "nas", "ou", "um", "uma", "que", "por",
]);

function toTitleCase(str) {
  if (!str) return str;
  const words = str.trim().split(/\s+/);
  let forceCapNext = true; // primeira palavra do título sempre maiúscula

  return words
    .map((word) => {
      // separa parênteses/colchetes que abrem antes da palavra, ex: "(guia" → "(" + "guia"
      const leadingMatch = word.match(/^[(\[]+/);
      const leading = leadingMatch ? leadingMatch[0] : "";
      const core = word.slice(leading.length);

      const isSegmentStart = forceCapNext || leading.length > 0;

      const upper = core.toUpperCase().replace(/[.,;:!?)\]]/g, "");
      let result;

      if (ACRONYMS.includes(upper)) {
        const trailingPunct = core.match(/[.,;:!?)\]]+$/);
        result = upper + (trailingPunct ? trailingPunct[0] : "");
      } else {
        const clean = core.toLowerCase();
        const cleanNoPunct = clean.replace(/[.,;:!?)\]]/g, "");
        if (!isSegmentStart && MINOR_WORDS.has(cleanNoPunct)) {
          result = clean;
        } else {
          result = clean.charAt(0).toUpperCase() + clean.slice(1);
        }
      }

      // se a palavra termina em ":" ou abre parênteses/colchetes,
      // a PRÓXIMA palavra também deve iniciar maiúscula (novo segmento do título)
      forceCapNext = /[:(\[]$/.test(word);

      return leading + result;
    })
    .join(" ");
}

// ─── Slug sem prefixo de data (espelha lib/posts.js) ─────────────────────────
function slugFromFileName(fileName) {
  return fileName.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/\.md$/, "");
}

// ─── Excerpt seguro (corta no limite de palavra, nunca no meio) ──────────────
function buildSafeExcerpt(content, maxLen = 155) {
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;
    if (/^[-*+>|`]/.test(trimmed)) continue;

    const clean = trimmed
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/_(.+?)_/g, "$1")
      .replace(/\[(.+?)\]\(.+?\)/g, "$1")
      .replace(/`(.+?)`/g, "$1")
      .replace(/\s+/g, " ")
      .trim();

    if (clean.length > 50) {
      if (clean.length <= maxLen) return clean;

      // corta no último espaço antes do limite, nunca no meio da palavra
      const cut = clean.slice(0, maxLen);
      const lastSpace = cut.lastIndexOf(" ");
      const safeCut = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
      return safeCut.replace(/[,;:.]+$/, "").trim() + "...";
    }
  }

  const fallback = content.replace(/[#*_`>\-\[\]]/g, "").replace(/\s+/g, " ").trim();
  const cut = fallback.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim() + "...";
}

// ─── Qualidade de conteúdo ────────────────────────────────────────────────────
const FILLER_PHRASES = [
  "é importante destacar que",
  "vale ressaltar que",
  "é fundamental entender que",
  "nos dias atuais",
  "no mundo atual",
  "é essencial que",
  "podemos concluir que",
  "em suma",
  "não é novidade que",
  "é crucial",
];

function countWords(text) {
  return (text || "")
    .replace(/[#*_>\-\[\]()`]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

function countFillerPhrases(text) {
  const lower = (text || "").toLowerCase();
  return FILLER_PHRASES.reduce(
    (acc, phrase) => acc + (lower.split(phrase).length - 1),
    0
  );
}

// remove qualquer rastro de raciocínio que modelos "reasoning" às vezes
// deixam escapar no conteúdo (ex: gpt-oss, qwen3)
function stripReasoningLeakage(text) {
  return (text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s*\[?reasoning\]?:?.*$/gim, "")
    .trim();
}

// ─── Similaridade de conteúdo (Jaccard sobre palavras significativas) ───────
function getSignature(text, size = 150) {
  const words = (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  return words.slice(0, size);
}

function jaccardSimilarity(wordsA, wordsB) {
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ─── Parser de frontmatter linha-a-linha (tolera CRLF e aspas internas) ──────
function normalizeLineEndings(raw) {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function splitFrontmatterAndBody(raw) {
  const normalized = normalizeLineEndings(raw);
  const lines = normalized.split("\n");

  if (lines[0].trim() !== "---") return null;

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) return null;

  const fm = lines.slice(1, endIdx).join("\n");
  const body = lines.slice(endIdx + 1).join("\n");
  return { fm, body };
}

// usa aspas "do início ao fim da linha" — funciona mesmo se o valor
// tiver aspas internas não escapadas (problema comum em excerpts gerados por IA)
function getFrontmatterField(fm, field) {
  const lines = fm.split("\n");
  const re = new RegExp(`^${field}\\s*:\\s*"(.*)"\\s*$`);
  for (const line of lines) {
    const m = line.match(re);
    if (m) return m[1].replace(/\\"/g, '"');
  }
  return null;
}

function setFrontmatterField(fm, field, value) {
  const safe = String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const re = new RegExp(`^(${field}\\s*:\\s*)"(.*)"\\s*$`);
  const lines = fm.split("\n");
  let found = false;

  const newLines = lines.map((line) => {
    if (re.test(line)) {
      found = true;
      return line.replace(re, `$1"${safe}"`);
    }
    return line;
  });

  if (!found) newLines.push(`${field}: "${safe}"`);
  return newLines.join("\n");
}

module.exports = {
  ACRONYMS,
  toTitleCase,
  slugFromFileName,
  buildSafeExcerpt,
  FILLER_PHRASES,
  countWords,
  countFillerPhrases,
  stripReasoningLeakage,
  getSignature,
  jaccardSimilarity,
  normalizeLineEndings,
  splitFrontmatterAndBody,
  getFrontmatterField,
  setFrontmatterField,
};
