#!/usr/bin/env node
/**
 * Auditoria rápida de SEO do conteúdo (roda local, sem rede).
 *   npm run audit:seo
 * Aponta: slugs duplicados, posts finos, títulos longos, excerpts cortados.
 * Sai com código 1 se houver slug duplicado SEM tratamento (nunca deve acontecer
 * depois de lib/post-slugs.cjs) — útil como checagem no CI.
 */
const fs = require("fs");
const path = require("path");
const { buildSlugEntries } = require("../lib/post-slugs.cjs");

const postsDir = path.resolve(__dirname, "../posts");
const MIN_WORDS = Number(process.env.MIN_WORDS || 800);
const files = fs.readdirSync(postsDir).filter((f) => f.endsWith(".md")).sort();
const entries = buildSlugEntries(files);

const rows = files.map((file) => {
  const raw = fs.readFileSync(path.join(postsDir, file), "utf8");
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  const fm = m ? m[1] : "";
  const body = m ? m[2] : raw;
  const get = (k) => (fm.match(new RegExp(`^${k}:\\s*"?(.*?)"?\\s*$`, "m")) || [])[1] || "";
  return {
    file,
    title: get("title"),
    excerpt: get("excerpt"),
    words: body.split(/\s+/).filter(Boolean).length,
    internalLinks: (body.match(/\]\(\/blog\//g) || []).length,
    hasFaq: /^##\s*(FAQ|Perguntas)/im.test(body),
  };
});

const renamed = entries.filter((e) => e.renamed);
const thin = rows.filter((r) => r.words < MIN_WORDS);
const longTitle = rows.filter((r) => r.title.length > 60);
const cutExcerpt = rows.filter((r) => r.excerpt.endsWith("..."));
const noLinks = rows.filter((r) => r.internalLinks === 0);

const line = (t, n, total = rows.length) => console.log(`${String(n).padStart(4)} / ${total}  ${t}`);
console.log(`Posts: ${rows.length}\n`);
line("slugs repetidos (agora com sufixo de data)", renamed.length);
line(`posts com menos de ${MIN_WORDS} palavras`, thin.length);
line("títulos com mais de 60 caracteres", longTitle.length);
line('excerpts terminando em "..."', cutExcerpt.length);
line("posts sem link interno no corpo", noLinks.length);
line("posts com seção FAQ", rows.filter((r) => r.hasFaq).length);

if (process.argv.includes("--verbose")) {
  console.log("\nPosts finos:");
  thin.sort((a, b) => a.words - b.words).forEach((r) => console.log(`  ${r.words}\t${r.file}`));
  console.log("\nSlugs renomeados:");
  renamed.forEach((e) => console.log(`  ${e.fileName} -> /blog/${e.slug}`));
}

const slugs = entries.map((e) => e.slug);
if (new Set(slugs).size !== slugs.length) {
  console.error("\nERRO: ainda há slugs duplicados.");
  process.exit(1);
}
