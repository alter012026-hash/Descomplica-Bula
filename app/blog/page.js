import Link from "next/link";
import SwipeHint from "../../components/SwipeHint";
import PostCard from "../../components/PostCard";
import { getAllPosts, getAllCategories } from "../../lib/posts";
import { getCategoryMeta } from "../../lib/category-meta";
import config from "../../site.config";

export const dynamic = "force-dynamic";

export async function generateMetadata({ searchParams }) {
  const params = await searchParams;
  const categoria = params?.categoria || null;
  const baseUrl = `${config.url}/blog`;
  return {
    title: categoria || "Artigos",
    description: categoria
      ? `Conteúdos sobre ${categoria}, com informação clara e fontes confiáveis.`
      : `Conteúdos sobre ${config.niche} no ${config.name}.`,
    alternates: { canonical: baseUrl },
    robots: categoria ? { index: false, follow: true } : { index: true, follow: true },
  };
}

export default async function BlogPage({ searchParams }) {
  const params = await searchParams;
  const categoria = params?.categoria || null;
  const allPosts = getAllPosts();
  const categories = getAllCategories();
  const filteredPosts = allPosts.filter((post) => !categoria || post.category === categoria);

  return (
    <main>
      <section className="hero hero--page">
        <div className="container">
          <h1>{categoria || "Conteúdos sobre medicamentos"}</h1>
          <p className="hero-desc">
            Informação em linguagem simples, baseada em fontes oficiais e revisada antes da publicação.
          </p>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 28 }}>
        <div className="container">
          <div className="filter-bar">
            <div className="categories-filter" role="list">
              <Link href="/blog" className={`cat-btn ${!categoria ? "active" : ""}`}>Todos</Link>
              {categories.map((cat) => (
                <Link
                  key={cat}
                  href={`/blog?categoria=${encodeURIComponent(cat)}`}
                  className={`cat-btn cat ${categoria === cat ? "active" : ""}`}
                  style={{ "--h": getCategoryMeta(cat).hue }}
                >
                  {cat}
                </Link>
              ))}
            </div>
            {categories.length > 2 && <SwipeHint>Arraste para ver mais temas</SwipeHint>}
          </div>
          <p className="results-count">{filteredPosts.length} artigo{filteredPosts.length !== 1 ? "s" : ""}</p>
          {filteredPosts.length > 0 ? (
            <div className="posts-grid posts-grid--long">
              {filteredPosts.map((post) => <PostCard key={post.slug} post={post} headingLevel={2} />)}
            </div>
          ) : (
            <div className="empty-state">
              <p>{categoria ? "Ainda não há artigos publicados neste tema." : "Os primeiros conteúdos estão em revisão editorial."}</p>
              <p>Enquanto isso, consulte a <Link href="/fontes-oficiais">bula e as fontes oficiais</Link>.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
