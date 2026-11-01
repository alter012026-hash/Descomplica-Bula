"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { getCategoryMeta } from "../lib/category-meta";
import SwipeHint from "./SwipeHint";

/**
 * Temas em formato "chip": código da categoria + nome + quantidade.
 * Celular: uma única fileira rolável com
 * snap; desktop: quebra em poucas linhas. Ocupa uma fração da altura dos
 * antigos blocos coloridos.
 *
 * Animação (só CSS, ativada por IntersectionObserver):
 *  - entrada: os chips sobem e aparecem em sequência quando a seção surge;
 *  - hover/foco/toque: destaque visual no chip.
 * Sem JS ou com "reduzir movimento" tudo aparece parado, sem animação.
 */
export default function CategoryCards({ categories }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    el.classList.add("is-armed");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-in");
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!categories || categories.length === 0) return null;

  return (
    <nav className="tc" ref={ref} aria-label="Explorar por tema">
      <ul className="tc-list">
        {categories.map((cat, i) => {
          const meta = getCategoryMeta(cat.name);
          return (
            <li key={cat.name} className="tc-item" style={{ "--i": Math.min(i, 10) }}>
              <Link
                href={`/blog?categoria=${encodeURIComponent(cat.name)}`}
                className="tc-chip cat"
                style={{ "--h": meta.hue }}
                title={meta.description}
              >
                <span className="tc-bubble" aria-hidden="true">
                  <span className="tc-code">{meta.code}</span>
                </span>
                <span className="tc-name">{cat.name}</span>
                <span className="tc-count" aria-label={`${cat.count} ${cat.count === 1 ? "artigo" : "artigos"}`}>
                  {cat.count}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {categories.length > 3 && <SwipeHint>Arraste para ver mais temas</SwipeHint>}
    </nav>
  );
}
