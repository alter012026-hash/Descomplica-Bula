#!/usr/bin/env node
/**
 * backfill-curiosity.js
 *
 * Preenche o campo `curiosity` no frontmatter dos posts JÁ PUBLICADOS que
 * ainda não têm essa informação (todo o histórico criado antes do card
 * "💡 Curiosidade" substituir a antiga imagem hero).
 *
 * Roda uma única vez (local ou via GitHub Actions manual), sequencialmente
 * e com pausa entre chamadas, pra não estourar rate limit dos providers
 * gratuitos (Groq → OpenRouter → Gemini, mesma cadeia usada na geração).
 *
 * Uso: node scripts/backfill-curiosity.js
 *      node scripts/backfill-curiosity.js --force   (regenera mesmo quem já tem)
 */

require("dotenv").config({ path: ".env.local", override: false });

const fs = require("fs");
const path = require("path");
const qe = require("../lib/quality-engine.js");
const ag = require("../lib/article-generator.js");

const postsDir = path.resolve(__dirname, "../posts");
const force = process.argv.includes("--force");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!fs.existsSync(postsDir)) {
    console.error("❌ Pasta /posts não encontrada.");
    process.exit(1);
  }

  const files = fs.readdirSync(postsDir).filter((f) => f.endsWith(".md"));
  console.log(`\n🔍 ${files.length} posts encontrados. Modo: ${force ? "FORÇAR (regera todas)" : "só os sem curiosidade"}\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const [i, file] of files.entries()) {
    const filePath = path.join(postsDir, file);
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = qe.splitFrontmatterAndBody(raw);

    if (!parsed) {
      console.warn(`⚠️  ${file}: frontmatter não reconhecido, pulei.`);
      skipped++;
      continue;
    }

    const { fm, body } = parsed;
    const existing = qe.getFrontmatterField(fm, "curiosity");

    if (existing && !force) {
      skipped++;
      continue;
    }

    console.log(`[${i + 1}/${files.length}] 💡 Gerando curiosidade: ${file}`);

    const curiosity = await ag.generateCuriosity(body);

    if (!curiosity) {
      console.warn(`   ⚠️  Falhou (todos os providers indisponíveis ou resposta inválida) — pulei.`);
      failed++;
      continue;
    }

    const newFm = qe.setFrontmatterField(fm, "curiosity", curiosity);
    fs.writeFileSync(filePath, `---\n${newFm}\n---\n${body}`);
    console.log(`   ✅ "${curiosity.slice(0, 70)}..."`);
    updated++;

    // pausa pra não estourar rate limit do provider gratuito
    if (i < files.length - 1) await sleep(1500);
  }

  console.log(`\n📊 Resumo: ${updated} atualizados, ${skipped} já tinham (ou inválidos), ${failed} falharam.`);
  if (failed > 0) {
    console.log(`   Rode o script de novo — posts que falharam serão tentados novamente.`);
  }
}

main().catch((err) => {
  console.error("ERRO FATAL:", err.message);
  process.exit(1);
});
