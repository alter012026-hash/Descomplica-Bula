#!/usr/bin/env node
/**
 * resolve-state-conflicts.js
 *
 * Motivo de existir: .quality-log.json, .content-signatures.json,
 * .used-topics.json, .pending-news-topics.json e .used-news-links.json são
 * todos "logs" — arrays JSON onde cada lado só ACRESCENTA itens novos, nunca
 * edita um item existente. Quando o workflow do GitHub Actions e uma execução
 * local (ou duas execuções do Actions) commitam por perto um do outro, os
 * dois lados adicionam itens diferentes bem no mesmo ponto do array (antes do
 * `]` de fechamento) — isso é um conflito de merge no Git mesmo sem haver
 * nenhuma informação realmente incompatível entre os dois lados.
 *
 * Este script roda DEPOIS que `git rebase origin/main` falha com conflito.
 * Se TODOS os arquivos em conflito forem desses arquivos de estado conhecidos,
 * ele lê a versão "ours" (:2:) e "theirs" (:3:) de cada um, une os itens dos
 * dois arrays (sem duplicar), escreve o resultado mesclado e marca como
 * resolvido (`git add`). Se algum arquivo em conflito NÃO for um desses
 * (ou seja, é conteúdo de verdade — código, posts, etc.), o script recusa e
 * devolve exit code 1, para o workflow abortar o rebase como já fazia antes.
 *
 * Uso: node scripts/resolve-state-conflicts.js
 * Exit 0  → todos os conflitos eram de estado e foram resolvidos; workflow
 *           pode rodar `git rebase --continue`.
 * Exit 1  → há conflito de conteúdo real; workflow deve abortar (comportamento
 *           antigo, inalterado).
 */

const { execSync } = require("child_process");
const fs = require("fs");

// Arquivos onde SÓ existe adição de itens independentes — nunca edição de um
// item já existente. Só é seguro fazer merge automático quando é isso.
const KNOWN_APPEND_ONLY_FILES = new Set([
  ".quality-log.json",
  ".content-signatures.json",
  ".used-topics.json",
  ".pending-news-topics.json",
  ".used-news-links.json",
]);

// Chaves usadas para identificar duplicatas em cada arquivo, quando os itens
// são objetos (em vez de strings simples, como em .used-topics.json).
const DEDUPE_KEY_BY_FILE = {
  ".quality-log.json": null, // objetos sem id único confiável -> dedupe por conteúdo inteiro
  ".content-signatures.json": "slug",
  ".pending-news-topics.json": "link",
  ".used-news-links.json": null, // array de strings (links)
  ".used-topics.json": null, // array de strings (tópicos)
};

function sh(cmd) {
  return execSync(cmd, { encoding: "utf8" });
}

function getConflictedFiles() {
  const out = sh("git diff --name-only --diff-filter=U").trim();
  return out ? out.split("\n") : [];
}

function readVersionFromIndex(stage, path) {
  try {
    return sh(`git show :${stage}:${JSON.stringify(path).slice(1, -1)}`);
  } catch {
    return null;
  }
}

function safeParseArray(text) {
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return null; // conteúdo não é um array JSON válido — não mexe
  }
}

function mergeArrays(ours, theirs, dedupeKey) {
  const merged = [...ours];
  const seen = new Set(
    ours.map((item) => (dedupeKey ? item?.[dedupeKey] : JSON.stringify(item)))
  );

  for (const item of theirs) {
    const key = dedupeKey ? item?.[dedupeKey] : JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return merged;
}

function main() {
  const conflicted = getConflictedFiles();

  if (conflicted.length === 0) {
    console.log("Nenhum arquivo em conflito encontrado (nada a fazer).");
    process.exit(0);
  }

  const unknown = conflicted.filter((f) => !KNOWN_APPEND_ONLY_FILES.has(f));
  if (unknown.length > 0) {
    console.error(
      `❌ Conflito envolve arquivo(s) que não são apenas logs de estado: ${unknown.join(", ")}\n` +
      "   Isso pode ser conflito de conteúdo real — não é seguro resolver automaticamente."
    );
    process.exit(1);
  }

  for (const file of conflicted) {
    const oursText = readVersionFromIndex(2, file);
    const theirsText = readVersionFromIndex(3, file);

    const ours = safeParseArray(oursText);
    const theirs = safeParseArray(theirsText);

    if (ours === null || theirs === null) {
      console.error(`❌ ${file}: conteúdo não é um array JSON válido em uma das versões. Abortando.`);
      process.exit(1);
    }

    const dedupeKey = DEDUPE_KEY_BY_FILE[file] ?? null;
    const merged = mergeArrays(ours, theirs, dedupeKey);

    fs.writeFileSync(file, JSON.stringify(merged, null, 2) + "\n", "utf8");
    sh(`git add ${JSON.stringify(file)}`);

    console.log(`✅ ${file}: mesclado (${ours.length} + ${theirs.length} → ${merged.length} itens únicos)`);
  }

  console.log("\n✅ Todos os conflitos eram de arquivos de estado e foram mesclados automaticamente.");
  process.exit(0);
}

main();
