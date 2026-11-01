import fs from "fs";
import path from "path";
import matter from "./frontmatter";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";
import postSlugs from "./post-slugs.cjs";

const postsDirectory = path.join(process.cwd(), "posts");
let productionPostsCache;

/* =========================
   HELPERS SEGURAS
========================= */

function parseDate(date) {
  const d = new Date(date);
  return isNaN(d.getTime()) ? null : d;
}

function cleanExcerpt(content) {
  return content
    .replace(/[#*_>\-\[\]]/g, "") // remove markdown básico
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

/* =========================
   SLUGS ÚNICOS
========================= */

let slugEntriesCache;

function getSlugEntries() {
  if (process.env.NODE_ENV === "production" && slugEntriesCache) return slugEntriesCache;
  if (!fs.existsSync(postsDirectory)) return [];
  const fileNames = fs.readdirSync(postsDirectory).filter((f) => f.endsWith(".md"));
  const entries = postSlugs.buildSlugEntries(fileNames);
  if (process.env.NODE_ENV === "production") slugEntriesCache = entries;
  return entries;
}

/* =========================
   POSTS
========================= */

export function getAllPosts() {
  if (process.env.NODE_ENV === "production" && productionPostsCache) {
    return productionPostsCache;
  }

  if (!fs.existsSync(postsDirectory)) return [];

  const posts = getSlugEntries().map(({ fileName, slug }) => {

    const fullPath = path.join(postsDirectory, fileName);
    const fileContents = fs.readFileSync(fullPath, "utf8");
    const { data, content } = matter(fileContents);

    // leitura
    const wordsPerMinute = 200;
    const wordCount = content.split(/\s+/).length;
    const readingTime = Math.ceil(wordCount / wordsPerMinute);

    const safeDate = parseDate(data.date);

    return {
      slug,
      fileName,
      title: data.title || "",
      date: safeDate ? safeDate.toISOString() : null,
      category: data.category || "Geral",
      excerpt: data.excerpt || cleanExcerpt(content) + "...",
      curiosity: data.curiosity || null,
      noindex: data.noindex === true,
      takeaways: Array.isArray(data.takeaways) ? data.takeaways : [],
      coverImage: data.coverImage || null,
      targetKeyword: data.targetKeyword || "",
      secondaryKeywords: data.secondaryKeywords || [],
      readingTime: `${readingTime} min`,
      wordCount,
    };
  });

  // ordenação segura (mais recente primeiro)
  posts.sort((a, b) => {
    const da = new Date(a.date || 0).getTime();
    const db = new Date(b.date || 0).getTime();
    return db - da;
  });

  if (process.env.NODE_ENV === "production") productionPostsCache = posts;
  return posts;
}

export function getPostBySlug(slug) {
  if (!fs.existsSync(postsDirectory)) return null;

  // Match EXATO pelo slug único para evitar abrir outro post com prefixo igual.
  const entry = getSlugEntries().find((e) => e.slug === slug);
  if (!entry) return null;
  const fileName = entry.fileName;

  const fullPath = path.join(postsDirectory, fileName);
  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents);

  const wordsPerMinute = 200;
  const wordCount = content.split(/\s+/).length;
  const readingTime = Math.ceil(wordCount / wordsPerMinute);

  const safeDate = parseDate(data.date);

  return {
    slug,
    title: data.title || "",
    date: safeDate ? safeDate.toISOString() : null,
    category: data.category || "Geral",
    excerpt: data.excerpt || cleanExcerpt(content) + "...",
    curiosity: data.curiosity || null,
    noindex: data.noindex === true,
    takeaways: Array.isArray(data.takeaways) ? data.takeaways : [],
    coverImage: data.coverImage || null,
    targetKeyword: data.targetKeyword || "",
    secondaryKeywords: data.secondaryKeywords || [],
    readingTime: `${readingTime} min`,
    wordCount,
    content,
  };
}

/**
 * Transforma a seção "## Fontes" (gerada no final de artigos baseados em
 * notícia real — ver lib/article-generator.js) de uma lista crua de links
 * em um bloco estilizado, sem URLs longas quebrando a linha.
 *
 * Por quê isso existe: os links de fonte às vezes vêm do redirect do Google
 * News (news.google.com/rss/articles/...), que é enorme e feio de exibir
 * cru. Isso lida com dois formatos de <li>, pra também consertar posts já
 * publicados antes desta mudança:
 *   1. Formato antigo: "Nome da fonte: https://link-enorme..." (o texto do
 *      link acaba sendo a própria URL, porque o autolink do remark-gfm
 *      linkifica a URL crua)
 *   2. Formato novo: "[Nome da fonte](link)" — o texto do link já é o nome
 * Em ambos os casos, o resultado exibido é só o nome da fonte (ou o domínio,
 * se não houver nome), nunca a URL crua.
 */
function extractSourceFromListItem(liInnerHtml) {
  const anchorMatch = liInnerHtml.match(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
  if (!anchorMatch) return null;

  const href = anchorMatch[1];
  const anchorText = anchorMatch[2].replace(/<[^>]+>/g, "").trim();
  const textBeforeLink = liInnerHtml
    .slice(0, anchorMatch.index)
    .replace(/<[^>]+>/g, "")
    .replace(/:\s*$/, "")
    .trim();

  // formato novo: texto do link já é o nome da fonte (não é igual à URL)
  // formato antigo: texto antes do link é o nome ("Nome da fonte: <url>")
  let label = textBeforeLink || (anchorText && anchorText !== href ? anchorText : "");

  if (!label) {
    try {
      label = new URL(href).hostname.replace(/^www\./, "");
    } catch {
      label = "Fonte";
    }
  }

  return { href, label };
}

function styleFontesSection(html) {
  const fontesRegex = /<h2>\s*Fontes(?: oficiais verificadas)?\s*<\/h2>\s*<ul>([\s\S]*?)<\/ul>/i;
  const match = html.match(fontesRegex);
  if (!match) return html;

  const rawItems = [...match[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  const sources = rawItems.map(extractSourceFromListItem).filter(Boolean);
  if (!sources.length) return html;

  const itemsHtml = sources
    .map(
      (s, i) => `
      <li class="sources-item">
        <span class="sources-index">${String(i + 1).padStart(2, "0")}</span>
        <a href="${s.href}" target="_blank" rel="noopener noreferrer nofollow" class="sources-link" data-analytics-event="outbound_official_source_click" data-source-domain="${new URL(s.href).hostname}">
          <span class="sources-label">${s.label}</span>
          <span class="sources-icon" aria-hidden="true">↗</span>
        </a>
      </li>`
    )
    .join("");

  const block = `
<div class="sources-block">
  <p class="sources-title">Fontes</p>
  <ul class="sources-list">${itemsHtml}
  </ul>
</div>`;

  return html.replace(fontesRegex, block);
}

export async function getPostContentHtml(content) {
  const processed = await remark()
    .use(remarkGfm)
    .use(remarkHtml, { sanitize: false })
    .process(content);

  let html = processed.toString();

  // Envolve cada <table> num container com scroll horizontal próprio.
  // Tabelas de markdown (comparativos, apresentações) podem ter várias
  // colunas; sem isso, em telas estreitas elas espremem o texto até
  // ficar ilegível ou estouram a largura da página inteira.
  html = html.replace(/<table>/g, '<div class="table-scroll"><table>');
  html = html.replace(/<\/table>/g, "</table></div>");

  html = styleFontesSection(html);

  return html;
}

/* =========================
   CATEGORIAS
========================= */

export function getAllCategories() {
  const posts = getAllPosts();
  const categories = [...new Set(posts.map(p => p.category))];
  return categories.sort();
}

export function getPostsByCategory(category) {
  return getAllPosts().filter(p => p.category === category);
}

/**
 * Estatísticas por categoria para os cards da home (lib/category-meta.js
 * cuida da cor/código/descrição visual, isto aqui cuida só dos dados reais
 * do blog: quantos posts tem cada categoria e qual é o mais recente).
 * Ordenado por quantidade de posts (categorias com mais conteúdo primeiro).
 */
export function getCategoryStats() {
  const posts = getAllPosts();
  const byCategory = new Map();

  for (const post of posts) {
    const cat = post.category || "Geral";
    if (!byCategory.has(cat)) {
      byCategory.set(cat, { name: cat, count: 0, latestSlug: post.slug, latestTitle: post.title });
    }
    byCategory.get(cat).count += 1;
  }

  return [...byCategory.values()].sort((a, b) => b.count - a.count);
}

export function getRelatedPosts(slug, category, limit = 3) {
  return getAllPosts()
    .filter(p => p.slug !== slug && p.category === category)
    .slice(0, limit);
}

/* =========================
   SLUGS
========================= */

export function getAllSlugs() {
  return getSlugEntries().map((e) => e.slug);
}
