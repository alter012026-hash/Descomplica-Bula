import Link from "next/link";
import config from "../site.config";
import { getPostBySlug } from "../lib/posts";

const Arrow = () => (
  <svg className="qs-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

/**
 * Atalhos para os principais temas do site.
 * Cada linha leva ao conteúdo de uma busca real do Google Search Console.
 * Itens que apontam para artigo inexistente são descartados no build.
 */
export default function QuickStart() {
  const { title, items } = config.quickStart;
  const valid = items.filter((it) => {
    const m = it.href.match(/^\/blog\/([^?#]+)$/);
    return m ? !!getPostBySlug(m[1]) : true;
  });

  return (
    <section className="qs" aria-labelledby="qs-title">
      <div className="qs-head">
        <h2 id="qs-title" className="qs-title">{title}</h2>
        <p className="qs-sub">Marque a opção que combina com você agora.</p>
      </div>
      <div className="qs-list">
        {valid.map((it, i) => (
          <Link key={it.href} href={it.href} className={`qs-row ${i === 0 ? "qs-row--first" : ""}`}>
            <span className="qs-bubble" aria-hidden="true" />
            <span className="qs-text">
              <span className="qs-label">{it.label}</span>
              <span className="qs-hint">{it.hint}</span>
            </span>
            <Arrow />
          </Link>
        ))}
      </div>
    </section>
  );
}
