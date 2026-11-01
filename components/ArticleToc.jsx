"use client";

import { useEffect, useState } from "react";

function List({ items, active }) {
  return (
    <div className="toc-list">
      {items.map((it) => (
        <a key={it.id} href={`#${it.id}`} className={`toc-link ${active === it.id ? "is-active" : ""}`} data-no-vt>
          {it.text}
        </a>
      ))}
    </div>
  );
}

/**
 * Índice do artigo. Desktop: coluna lateral fixa com a seção atual
 * marcada (bolinha preenchida). Celular: bloco recolhível no topo.
 */
export default function ArticleToc({ items = [], variant }) {
  const [active, setActive] = useState(items[0]?.id || null);

  useEffect(() => {
    if (variant === "mobile" || items.length === 0) return;
    const els = items.map((i) => document.getElementById(i.id)).filter(Boolean);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-90px 0px -65% 0px", threshold: 0 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items, variant]);

  if (items.length < 3) return null;

  if (variant === "mobile") {
    return (
      <details className="toc-mobile">
        <summary>Neste artigo · {items.length} seções</summary>
        <List items={items} active={null} />
      </details>
    );
  }
  return (
    <nav className="toc-sticky" aria-label="Índice do artigo">
      <p className="toc-title">Neste artigo</p>
      <List items={items} active={active} />
    </nav>
  );
}
