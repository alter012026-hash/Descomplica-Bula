import Link from "next/link";
import PostCard from "../components/PostCard";
import LatestCarousel from "../components/LatestCarousel";
import CategoryCards from "../components/CategoryCards";
import QuickStart from "../components/QuickStart";
import MedicationSummary from "../components/MedicationSummary";
import HeroSheet from "../components/HeroSheet";
import { getAllPosts, getCategoryStats } from "../lib/posts";
import config from "../site.config";

export const revalidate = 3600;

export default function HomePage() {
  const posts = getAllPosts();
  const categoryStats = getCategoryStats();

  return (
    <main>
      <section className="hero">
        <HeroSheet />
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="section-label">Informação clara, cuidado responsável</p>
            <h1>Entenda medicamentos sem complicar a sua saúde.</h1>
            <p className="hero-desc">
              Explicamos bulas, cuidados e alertas em linguagem simples, com fontes oficiais.
              Conteúdo informativo que não substitui orientação profissional.
            </p>
            <div className="hero-actions">
              <Link href="/buscar-medicamentos" className="btn btn--hl">Buscar medicamento</Link>
              <Link href="/blog" className="btn btn--hl">Explorar conteúdos</Link>
              <Link href="/fontes-oficiais" className="btn btn--ghost">Consultar fontes oficiais</Link>
            </div>
            <p className="hero-facts">
              {posts.length > 0
                ? `${posts.length} artigos revisados para ajudar você a se informar.`
                : "Todo conteúdo é revisado antes de ser publicado."}
            </p>
          </div>
          <QuickStart />
        </div>
      </section>

      <section className="section">
        <div className="container health-notice">
          <strong>Importante:</strong> não use, interrompa ou altere um medicamento por conta
          própria. Confira a bula oficial e converse com um profissional de saúde.
          <Link href="/aviso-de-saude">Leia o aviso de saúde</Link>
        </div>
      </section>

      <MedicationSummary />

      {posts.length > 0 && (
        <section className="section section--alt">
          <div className="container">
            <div className="section-header">
              <div>
                <p className="section-label">Conteúdo revisado</p>
                <h2 className="section-title">Artigos recentes</h2>
              </div>
              <Link href="/blog" className="section-link">Ver todos</Link>
            </div>
            <LatestCarousel posts={posts.slice(0, 10)} />
          </div>
        </section>
      )}

      {categoryStats.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section-header">
              <h2 className="section-title">Explore por tema</h2>
            </div>
            <CategoryCards categories={categoryStats} />
          </div>
        </section>
      )}

      <section className="section section--alt">
        <div className="container">
          <div className="section-header">
            <div>
              <p className="section-label">Informação segura começa na fonte</p>
              <h2 className="section-title">Consulte fontes oficiais</h2>
            </div>
          </div>
          <p className="hero-desc">
            A bula aprovada pela Anvisa e a orientação do profissional que acompanha você
            devem prevalecer. Veja onde encontrar informações confiáveis.
          </p>
          <Link href="/fontes-oficiais" className="section-link">Conheça as fontes oficiais →</Link>
        </div>
      </section>
    </main>
  );
}
