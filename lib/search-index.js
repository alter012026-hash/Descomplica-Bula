import { getAllPosts } from "./posts";

/**
 * Índice leve para a busca command-palette (components/SearchPalette.jsx).
 * Só os campos necessários pro client — evita mandar o conteúdo completo
 * de cada post (markdown) para o navegador só para alimentar a busca.
 */
export function getSearchIndex() {
  return getAllPosts().map((post) => ({
    slug: post.slug,
    title: post.title,
    category: post.category,
    excerpt: post.excerpt,
  }));
}
